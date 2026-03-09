import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Query } from 'appwrite';
import { databases, DATABASE_ID, COLLECTIONS } from '../../../config/appwrite';
import { ALL_TOOLS, ToolConfig } from '../../../constants/tools';
import { filterAllowedTools } from '../../../services/permissionsService';
import { useAuth } from '../../../contexts/AuthContext';
import { SearchResult, SearchCategory, CATEGORY_ORDER } from '../types';
import { Layers, Folder, Users, Receipt, Mail } from 'lucide-react';

const DEBOUNCE_MS = 300;
const MAX_RESULTS_PER_CATEGORY = 5;

// Collection IDs
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const ANFRAGEN_COLLECTION_ID = 'anfragen';

// Score-Berechnung für Tools
function calculateToolScore(tool: ToolConfig, query: string): number {
  const q = query.toLowerCase();
  const name = tool.name.toLowerCase();
  const desc = (tool.description || '').toLowerCase();
  const id = tool.id.toLowerCase();

  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 2;
  if (desc.includes(q)) return 1;
  if (id.includes(q)) return 0.5;
  return 0;
}

// Lokale Tool-Suche (instant)
function searchTools(tools: ToolConfig[], query: string): SearchResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();

  return tools
    .filter(tool =>
      tool.name.toLowerCase().includes(q) ||
      (tool.description || '').toLowerCase().includes(q) ||
      tool.id.toLowerCase().includes(q)
    )
    .map(tool => ({
      id: tool.id,
      category: 'tools' as SearchCategory,
      title: tool.name,
      description: tool.description,
      icon: tool.icon || Layers,
      href: tool.href,
      score: calculateToolScore(tool, q),
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_RESULTS_PER_CATEGORY);
}

// Projekte suchen (Appwrite)
async function searchProjekte(query: string): Promise<SearchResult[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJEKTE,
      [
        Query.contains('kundenname', query),
        Query.orderDesc('$updatedAt'),
        Query.limit(MAX_RESULTS_PER_CATEGORY),
      ]
    );

    return response.documents.map(doc => {
      const status = doc.status || 'anfrage';
      const statusLabels: Record<string, string> = {
        anfrage: 'Anfrage',
        angebot: 'Angebot',
        auftragsbestaetigung: 'AB',
        lieferschein: 'Lieferschein',
        rechnung: 'Rechnung',
        bezahlt: 'Bezahlt',
      };

      return {
        id: doc.$id,
        category: 'projekte' as SearchCategory,
        title: doc.kundenname || 'Unbekannt',
        subtitle: doc.auftragsbestaetigungsnummer
          ? `AB-${doc.auftragsbestaetigungsnummer}`
          : undefined,
        description: doc.kundenPlzOrt || '',
        icon: Folder,
        badge: {
          text: statusLabels[status] || status,
          color: status === 'bezahlt' ? 'green' : status === 'rechnung' ? 'amber' : 'blue',
        },
        href: `/projektabwicklung/${doc.$id}`,
      };
    });
  } catch (error) {
    console.warn('Fehler bei Projekt-Suche:', error);
    return [];
  }
}

// Kunden/Vereine suchen (Appwrite)
async function searchKunden(query: string): Promise<SearchResult[]> {
  try {
    // Da 'data' ein JSON-Feld ist, müssen wir alle laden und filtern
    const response = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [
        Query.limit(50), // Mehr laden, dann filtern
      ]
    );

    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const doc of response.documents) {
      if (!doc.data) continue;

      try {
        const kunde = JSON.parse(doc.data);

        // Nur Vereine und Händler anzeigen (keine Platzbauer)
        if (kunde.typ === 'platzbauer') continue;

        const searchable = [
          kunde.name,
          kunde.lieferadresse?.ort,
          kunde.lieferadresse?.plz,
          kunde.rechnungsadresse?.ort,
          kunde.kundennummer,
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchable.includes(q)) {
          results.push({
            id: doc.$id,
            category: 'kunden' as SearchCategory,
            title: kunde.name || 'Unbekannt',
            subtitle: kunde.lieferadresse
              ? `${kunde.lieferadresse.plz || ''} ${kunde.lieferadresse.ort || ''}`.trim()
              : undefined,
            description: kunde.kundennummer || '',
            icon: Users,
            href: `/saisonplanung?kundeId=${doc.$id}`,
          });
        }

        if (results.length >= MAX_RESULTS_PER_CATEGORY) break;
      } catch {
        // JSON Parse Fehler ignorieren
      }
    }

    return results;
  } catch (error) {
    console.warn('Fehler bei Kunden-Suche:', error);
    return [];
  }
}

// Debitoren suchen (Projekte mit Rechnung)
async function searchDebitoren(query: string): Promise<SearchResult[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJEKTE,
      [
        Query.or([
          Query.equal('status', 'rechnung'),
          Query.equal('status', 'bezahlt'),
        ]),
        Query.contains('kundenname', query),
        Query.limit(MAX_RESULTS_PER_CATEGORY),
      ]
    );

    return response.documents.map(doc => ({
      id: doc.$id,
      category: 'debitoren' as SearchCategory,
      title: doc.rechnungsnummer || doc.kundenname || 'Unbekannt',
      subtitle: doc.kundenname,
      icon: Receipt,
      badge: {
        text: doc.status === 'bezahlt' ? 'Bezahlt' : 'Offen',
        color: doc.status === 'bezahlt' ? 'green' : 'amber',
      },
      href: `/debitoren?projektId=${doc.$id}`,
    }));
  } catch (error) {
    console.warn('Fehler bei Debitoren-Suche:', error);
    return [];
  }
}

// Anfragen suchen (Appwrite)
async function searchAnfragen(query: string): Promise<SearchResult[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ANFRAGEN_COLLECTION_ID,
      [
        Query.or([
          Query.contains('emailAbsender', query),
          Query.contains('emailBetreff', query),
        ]),
        Query.notEqual('status', 'geloescht'),
        Query.orderDesc('emailDatum'),
        Query.limit(MAX_RESULTS_PER_CATEGORY),
      ]
    );

    const statusLabels: Record<string, string> = {
      neu: 'Neu',
      in_bearbeitung: 'In Bearbeitung',
      erledigt: 'Erledigt',
      wartet: 'Wartet',
    };

    return response.documents.map(doc => ({
      id: doc.$id,
      category: 'anfragen' as SearchCategory,
      title: doc.emailAbsender || 'Unbekannt',
      subtitle: doc.emailBetreff?.substring(0, 50),
      description: doc.emailDatum
        ? new Date(doc.emailDatum).toLocaleDateString('de-DE')
        : undefined,
      icon: Mail,
      badge: {
        text: statusLabels[doc.status] || doc.status,
        color: doc.status === 'neu' ? 'blue' : doc.status === 'erledigt' ? 'green' : 'amber',
      },
      href: `/anfragen?anfrageId=${doc.$id}`,
    }));
  } catch (error) {
    console.warn('Fehler bei Anfragen-Suche:', error);
    return [];
  }
}

/**
 * Haupt-Hook für die globale Suche
 */
export function useGlobalSearch() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toolResults, setToolResults] = useState<SearchResult[]>([]);
  const [dbResults, setDbResults] = useState<Map<SearchCategory, SearchResult[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<Map<string, Map<SearchCategory, SearchResult[]>>>(new Map());

  // Gefilterte Tools basierend auf Benutzerberechtigungen
  const enabledTools = useMemo(
    () => filterAllowedTools(user, ALL_TOOLS),
    [user]
  );

  // INSTANT: Tools lokal suchen (kein Debounce)
  useEffect(() => {
    if (!query.trim()) {
      setToolResults([]);
      return;
    }
    setToolResults(searchTools(enabledTools, query));
  }, [query, enabledTools]);

  // DEBOUNCED: Datenbank-Suchen parallel ausführen
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || query.length < 2) {
      setDbResults(new Map());
      return;
    }

    // Cache prüfen
    const cached = cacheRef.current.get(query);
    if (cached) {
      setDbResults(cached);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);

      try {
        // Alle Suchen parallel ausführen
        const [projekte, kunden, debitoren, anfragen] = await Promise.all([
          searchProjekte(query),
          searchKunden(query),
          searchDebitoren(query),
          searchAnfragen(query),
        ]);

        const results = new Map<SearchCategory, SearchResult[]>();
        results.set('projekte', projekte);
        results.set('kunden', kunden);
        results.set('debitoren', debitoren);
        results.set('anfragen', anfragen);

        // Ergebnisse cachen
        cacheRef.current.set(query, results);

        setDbResults(results);
      } catch (error) {
        console.error('Global search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Alle Ergebnisse kombiniert (in Kategorien-Reihenfolge)
  const allResults = useMemo(() => {
    const combined: SearchResult[] = [];

    for (const category of CATEGORY_ORDER) {
      if (category === 'tools') {
        combined.push(...toolResults);
      } else {
        const categoryResults = dbResults.get(category);
        if (categoryResults) {
          combined.push(...categoryResults);
        }
      }
    }

    return combined;
  }, [toolResults, dbResults]);

  // Gruppierte Ergebnisse für die Anzeige
  const groupedResults = useMemo(() => {
    const groups = new Map<SearchCategory, SearchResult[]>();

    if (toolResults.length > 0) {
      groups.set('tools', toolResults);
    }

    for (const [category, results] of dbResults) {
      if (results.length > 0) {
        groups.set(category, results);
      }
    }

    return groups;
  }, [toolResults, dbResults]);

  // Index zurücksetzen wenn Query sich ändert
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard-Handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          if (allResults[selectedIndex]) {
            return allResults[selectedIndex];
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setQuery('');
          break;
      }
      return null;
    },
    [allResults, selectedIndex]
  );

  // Suche öffnen
  const open = useCallback(() => {
    setIsOpen(true);
    setSelectedIndex(0);
  }, []);

  // Suche schließen
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  return {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    open,
    close,
    selectedIndex,
    setSelectedIndex,
    toolResults,
    dbResults,
    allResults,
    groupedResults,
    isLoading,
    handleKeyDown,
  };
}
