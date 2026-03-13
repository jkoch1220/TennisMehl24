import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Download,
  Calendar,
  Building2,
  MapPin,
  FileSignature,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Layers,
  List,
  TrendingUp,
  Truck,
  FileText,
  CheckCircle2,
  ShoppingCart,
  Send,
  Check,
  X,
  Users,
  Loader2,
  Mail,
  Eye,
  LayoutGrid,
  Receipt,
  MoveHorizontal,
} from 'lucide-react';
import TipTapEditor from '../Shared/TipTapEditor';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { AuftragsbestaetigungsDaten, Position, LieferscheinDaten, LieferscheinPosition } from '../../types/projektabwicklung';
import { ladeDokumentNachTyp, ladeDokumentDaten } from '../../services/projektabwicklungDokumentService';
import { projektService } from '../../services/projektService';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import { sendeEmailMitPdf, sendeEmail, wrapInEmailTemplate } from '../../services/emailSendService';
import { generiereStandardEmail } from '../../utils/emailHelpers';
import { getStammdatenOderDefault } from '../../services/stammdatenService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import { debitorService } from '../../services/debitorService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { databases, DATABASE_ID } from '../../config/appwrite';
import { Query } from 'appwrite';

// Universal-Bestellung Interface
interface UniversalBestellung {
  projektId: string;
  projekt: Projekt;
  position: Position;
  lieferdatum?: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
}

// Props
interface UniversalViewProps {
  projekteGruppiert: {
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  };
  onProjektClick: (projekt: Projekt) => void;
}

// Status Badge Helper
const getStatusConfig = (status: ProjektStatus) => {
  const configs: Record<ProjektStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
    angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: FileSignature },
    angebot_versendet: { label: 'Versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300', icon: FileSignature },
    auftragsbestaetigung: { label: 'AB', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', icon: FileSignature },
    lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: Truck },
    rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: FileText },
    bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300', icon: CheckCircle2 },
    verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: FileSignature },
  };
  return configs[status];
};

// Gruppierungs-Typ
type GroupBy = 'none' | 'lieferdatum' | 'status' | 'kunde' | 'kanban';

// Kanban-Status für Universal-Workflow
type UniversalKanbanStatus = 'offen' | 'versendet' | 'an_kunden' | 'rechnungsstellung' | 'bezahlt';

const KANBAN_COLUMNS: { status: UniversalKanbanStatus; label: string; color: string; bgColor: string }[] = [
  { status: 'offen', label: 'Offen', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700' },
  { status: 'versendet', label: 'An Universal gesendet', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' },
  { status: 'an_kunden', label: 'An Kunden verschickt', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' },
  { status: 'rechnungsstellung', label: 'Rechnungsstellung', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700' },
  { status: 'bezahlt', label: 'Bezahlt', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' },
];

// Universal Sport Empfänger (fix)
const UNIVERSAL_SPORT_EMAIL = 'info@universal-sport.de';
const UNIVERSAL_SPORT_NAME = 'Universal Sport';
const TENNISMEHL_ABSENDER = 'info@tennismehl.com';
const TEST_EMAIL = 'jtatwcook@gmail.com';

// Interface für Kunden-Gruppierung
interface KundenGruppe {
  projektId: string;
  kundenname: string;
  kundenPlzOrt: string;
  abNummer: string;
  bestellungen: UniversalBestellung[];
  gesamtWert: number;
  gesamtEK: number;
  db1: number;
}

// Interface für Email-Status
interface EmailStatus {
  [projektId: string]: {
    gesendetAm: string;
    dokumentNummer: string;
  };
}

// Interface für Email-Vorschau Modal
interface EmailVorschauDaten {
  gruppe: KundenGruppe;
  empfaenger: string;
  betreff: string;
  emailText: string;
  signatur: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  pdfBlob: Blob;
  pdfDateiname: string;
  lieferscheinnummer: string;
}

// Interface für Tracking-Email Modal
interface TrackingEmailVorschauDaten {
  gruppe: KundenGruppe;
  empfaenger: string;
  betreff: string;
  emailText: string;
  signatur: string;
  trackingNummer: string;
  trackingLink?: string;
}

// Bestimmt den Kanban-Status einer Gruppe
// NUR basierend auf Projekt-Status - ermöglicht manuelles Verschieben
const getKanbanStatus = (
  projektStatus: string,
  universalKanbanStatus?: string // Expliziter Kanban-Status für Universal-Workflow
): UniversalKanbanStatus => {
  // Wenn expliziter Universal-Kanban-Status gesetzt ist, diesen verwenden
  if (universalKanbanStatus && ['offen', 'versendet', 'an_kunden', 'rechnungsstellung', 'bezahlt'].includes(universalKanbanStatus)) {
    return universalKanbanStatus as UniversalKanbanStatus;
  }

  // Fallback auf Projekt-Status Mapping
  switch (projektStatus) {
    case 'bezahlt':
      return 'bezahlt';
    case 'rechnung':
      return 'rechnungsstellung';
    case 'lieferschein':
      return 'versendet';
    default:
      // auftragsbestaetigung oder andere = offen
      return 'offen';
  }
};

// Helper: Prüft ob Position ein Universal-Artikel ist
const istUniversalPosition = (position: Position): boolean => {
  // Neues Flag (ab jetzt)
  if (position.istUniversalArtikel === true) return true;
  // Fallback für alte Daten (vor Migration)
  if (position.beschreibung?.startsWith('Universal:')) return true;
  return false;
};

const UniversalView = ({ projekteGruppiert, onProjektClick }: UniversalViewProps) => {
  const [bestellungen, setBestellungen] = useState<UniversalBestellung[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('kanban');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['alle']));

  // Email-Status und Sende-Prozess
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({});
  const [sendingProjektIds, setSendingProjektIds] = useState<Set<string>>(new Set());
  const [justSentProjektIds, setJustSentProjektIds] = useState<Set<string>>(new Set());

  // Bulk-Modal (nur zur Auswahl, Versand erfolgt über Einzel-Modals)
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // Test-Modus (sendet an jtatwcook@gmail.com statt Universal Sport)
  const [testModus, setTestModus] = useState(false);

  // Drag & Drop State
  const [draggedProjektId, setDraggedProjektId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<UniversalKanbanStatus | null>(null);

  // Email-Vorschau Modal
  const [showEmailVorschau, setShowEmailVorschau] = useState(false);
  const [emailVorschauDaten, setEmailVorschauDaten] = useState<EmailVorschauDaten | null>(null);
  const [emailVorschauSending, setEmailVorschauSending] = useState(false);

  // Tracking-Email Modal
  const [showTrackingEmail, setShowTrackingEmail] = useState(false);
  const [trackingEmailDaten, setTrackingEmailDaten] = useState<TrackingEmailVorschauDaten | null>(null);
  const [trackingEmailSending, setTrackingEmailSending] = useState(false);

  // Bulk-Versand mit Modal für jeden Kunden
  const [bulkQueue, setBulkQueue] = useState<KundenGruppe[]>([]);
  const [bulkQueueIndex, setBulkQueueIndex] = useState(0);
  const [bulkQueueResult, setBulkQueueResult] = useState<{ success: number; failed: number; skipped: number }>({ success: 0, failed: 0, skipped: 0 });

  // Kanban-Status zu Projekt-Status Mapping
  const kanbanToProjectStatus = (kanbanStatus: UniversalKanbanStatus): 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'bezahlt' => {
    switch (kanbanStatus) {
      case 'offen': return 'auftragsbestaetigung';
      case 'versendet': return 'lieferschein';
      case 'an_kunden': return 'lieferschein'; // Gleicher Status, wird über universalKanbanStatus unterschieden
      case 'rechnungsstellung': return 'rechnung';
      case 'bezahlt': return 'bezahlt';
    }
  };

  // Alle bestellten Projekte (Status >= auftragsbestaetigung)
  const bestellteProjekte = useMemo(() => {
    return [
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
    ];
  }, [projekteGruppiert]);

  // Lade Universal-Positionen aus den Dokumenten
  const ladeUniversalBestellungen = useCallback(async () => {
    setLoading(true);
    const alleBestellungen: UniversalBestellung[] = [];

    try {
      // Parallel alle Dokumente laden
      const dokumentPromises = bestellteProjekte.map(async (projekt) => {
        const projektId = (projekt as any).$id || projekt.id;

        // Lade Auftragsbestätigung (die enthält die bestellten Positionen)
        const abDokument = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');

        if (!abDokument) return [];

        // Parse die Daten
        const abDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(abDokument);

        if (!abDaten || !abDaten.positionen) return [];

        // Filtere nach Universal-Artikeln (Flag oder Beschreibung)
        const universalPositionen = abDaten.positionen.filter(istUniversalPosition);

        // Erstelle Bestellungen für jede Universal-Position
        return universalPositionen.map((position) => ({
          projektId,
          projekt,
          position,
          lieferdatum: abDaten.lieferdatum || projekt.geplantesDatum,
          lieferKW: abDaten.lieferKW || projekt.lieferKW,
          lieferKWJahr: abDaten.lieferKWJahr || projekt.lieferKWJahr,
          auftragsbestaetigungsnummer: abDaten.auftragsbestaetigungsnummer || projekt.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: abDaten.auftragsbestaetigungsdatum || projekt.auftragsbestaetigungsdatum,
        }));
      });

      const results = await Promise.all(dokumentPromises);
      results.forEach((projektBestellungen) => {
        alleBestellungen.push(...projektBestellungen);
      });

      // Nach Lieferdatum sortieren (früheste zuerst)
      alleBestellungen.sort((a, b) => {
        const dateA = a.lieferdatum ? new Date(a.lieferdatum).getTime() : Infinity;
        const dateB = b.lieferdatum ? new Date(b.lieferdatum).getTime() : Infinity;
        return dateA - dateB;
      });

      setBestellungen(alleBestellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Universal-Bestellungen:', error);
    } finally {
      setLoading(false);
    }
  }, [bestellteProjekte]);

  useEffect(() => {
    ladeUniversalBestellungen();
  }, [ladeUniversalBestellungen]);

  // Status-Update für ein Projekt (manuell) - verschiebt in andere Kanban-Spalte
  const updateProjektStatusManuell = useCallback(async (projektId: string, neuerKanbanStatus: UniversalKanbanStatus) => {
    const neuerProjektStatus = kanbanToProjectStatus(neuerKanbanStatus);

    try {
      // Speichere BEIDE: Projekt-Status UND expliziten Universal-Kanban-Status
      await projektService.updateProjekt(projektId, {
        status: neuerProjektStatus,
        universalKanbanStatus: neuerKanbanStatus, // Expliziter Kanban-Status für 5-Spalten-Workflow
      } as any);
      console.log(`✓ Projekt ${projektId} auf "${neuerKanbanStatus}" (${neuerProjektStatus}) gesetzt`);

      // UI sofort aktualisieren
      setBestellungen(prev => prev.map(b => {
        if (b.projektId === projektId) {
          return {
            ...b,
            projekt: {
              ...b.projekt,
              status: neuerProjektStatus as any,
              universalKanbanStatus: neuerKanbanStatus,
            }
          };
        }
        return b;
      }));
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Aktualisieren des Status');
    }
  }, []);

  // Drag & Drop Handlers
  const handleDragStart = useCallback((e: React.DragEvent, projektId: string) => {
    setDraggedProjektId(projektId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', projektId);
    // Karte während des Ziehens transparent machen
    const target = e.target as HTMLElement;
    setTimeout(() => {
      target.style.opacity = '0.5';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedProjektId(null);
    setDragOverColumn(null);
    // Transparenz zurücksetzen
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, columnStatus: UniversalKanbanStatus) => {
    e.preventDefault();
    setDragOverColumn(columnStatus);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Nur zurücksetzen wenn wir die Spalte wirklich verlassen
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStatus: UniversalKanbanStatus) => {
    e.preventDefault();
    const projektId = e.dataTransfer.getData('text/plain');
    if (projektId && draggedProjektId) {
      updateProjektStatusManuell(projektId, targetStatus);
    }
    setDraggedProjektId(null);
    setDragOverColumn(null);
  }, [draggedProjektId, updateProjektStatusManuell]);

  // Als bezahlt markieren (nutzt debitorService für korrekte Debitoren-Darstellung)
  const handleMarkiereAlsBezahlt = useCallback(async (projektId: string, kundenname: string) => {
    if (!confirm(`Möchten Sie die Bestellung von "${kundenname}" als bezahlt markieren?`)) return;

    try {
      // debitorService.markiereAlsBezahlt setzt:
      // - projekt.status = 'bezahlt'
      // - projekt.bezahltAm = new Date()
      // - debitor_metadaten.status = 'bezahlt'
      // - Aktivitäts-Protokoll
      await debitorService.markiereAlsBezahlt(projektId);
      console.log(`✓ Projekt ${projektId} als bezahlt markiert (inkl. Debitoren-Update)`);

      // UI sofort aktualisieren
      setBestellungen(prev => prev.map(b => {
        if (b.projektId === projektId) {
          return {
            ...b,
            projekt: { ...b.projekt, status: 'bezahlt' as any }
          };
        }
        return b;
      }));
    } catch (error) {
      console.error('Fehler beim Markieren als bezahlt:', error);
      alert('Fehler beim Markieren als bezahlt');
    }
  }, []);

  // Email-Status im Hintergrund laden (nicht blockierend)
  // Lädt nur ECHTE Versendungen (nicht Testmodus) anhand des Empfängers
  const ladeEmailStatus = useCallback(async (projektIds: string[]) => {
    if (projektIds.length === 0) return;

    try {
      // Lade alle Email-Protokolle für Universal-Lieferscheine
      // Nur echte Versendungen (an Universal Sport, nicht an Test-Email)
      const response = await databases.listDocuments(
        DATABASE_ID,
        'email_protokoll',
        [
          Query.equal('dokumentTyp', 'lieferschein'),
          Query.equal('status', 'gesendet'),
          Query.contains('empfaenger', UNIVERSAL_SPORT_EMAIL), // Universal Sport
          Query.orderDesc('gesendetAm'),
          Query.limit(500),
        ]
      );

      const statusMap: EmailStatus = {};

      for (const doc of response.documents) {
        const projektId = doc.projektId as string;
        // Nur wenn projektId in unseren relevanten projektIds ist
        if (projektIds.includes(projektId) && !statusMap[projektId]) {
          statusMap[projektId] = {
            gesendetAm: doc.gesendetAm as string,
            dokumentNummer: doc.dokumentNummer as string,
          };
        }
      }

      setEmailStatus(statusMap);
    } catch (error) {
      console.error('Fehler beim Laden des Email-Status:', error);
    }
  }, []);

  // Email-Status nach Laden der Bestellungen aktualisieren
  useEffect(() => {
    if (bestellungen.length > 0) {
      const projektIds = [...new Set(bestellungen.map(b => b.projektId))];
      ladeEmailStatus(projektIds);
    }
  }, [bestellungen, ladeEmailStatus]);

  // Kunden-Gruppierung (für groupBy === 'kunde')
  // Sortiert: Nicht gesendet zuerst, dann nach Kundenname
  const kundenGruppen = useMemo((): KundenGruppe[] => {
    const gruppenMap = new Map<string, KundenGruppe>();

    bestellungen.forEach((bestellung) => {
      const key = bestellung.projektId;

      if (!gruppenMap.has(key)) {
        gruppenMap.set(key, {
          projektId: bestellung.projektId,
          kundenname: bestellung.projekt.kundenname,
          kundenPlzOrt: bestellung.projekt.kundenPlzOrt || '',
          abNummer: bestellung.auftragsbestaetigungsnummer || '',
          bestellungen: [],
          gesamtWert: 0,
          gesamtEK: 0,
          db1: 0,
        });
      }

      const gruppe = gruppenMap.get(key)!;
      gruppe.bestellungen.push(bestellung);
      const posWert = bestellung.position.gesamtpreis || 0;
      const posEK = (bestellung.position.einkaufspreis || 0) * (bestellung.position.menge || 1);
      gruppe.gesamtWert += posWert;
      gruppe.gesamtEK += posEK;
      gruppe.db1 += (posWert - posEK);
    });

    // Sortierung: Nicht gesendet zuerst, dann alphabetisch
    return Array.from(gruppenMap.values()).sort((a, b) => {
      const aGesendet = !!emailStatus[a.projektId];
      const bGesendet = !!emailStatus[b.projektId];

      // Nicht gesendet zuerst
      if (!aGesendet && bGesendet) return -1;
      if (aGesendet && !bGesendet) return 1;

      // Dann alphabetisch
      return a.kundenname.localeCompare(b.kundenname);
    });
  }, [bestellungen, emailStatus]);

  // Statistiken für Header
  const versandStats = useMemo(() => {
    const gesamt = kundenGruppen.length;
    const gesendet = kundenGruppen.filter(g => emailStatus[g.projektId]).length;
    const offen = gesamt - gesendet;
    return { gesamt, gesendet, offen };
  }, [kundenGruppen, emailStatus]);

  // Kanban-Gruppierung: Gruppen nach Kanban-Status
  const kanbanGruppen = useMemo((): Map<UniversalKanbanStatus, KundenGruppe[]> => {
    const gruppen = new Map<UniversalKanbanStatus, KundenGruppe[]>();

    // Initialisiere alle Spalten
    KANBAN_COLUMNS.forEach(col => gruppen.set(col.status, []));

    // Verteile Kunden-Gruppen auf Kanban-Spalten
    kundenGruppen.forEach(gruppe => {
      const projekt = gruppe.bestellungen[0]?.projekt;
      const projektStatus = projekt?.status || 'auftragsbestaetigung';
      const universalKanbanStatus = (projekt as any)?.universalKanbanStatus;
      const kanbanStatus = getKanbanStatus(projektStatus, universalKanbanStatus);

      gruppen.get(kanbanStatus)?.push(gruppe);
    });

    return gruppen;
  }, [kundenGruppen, emailStatus]);

  // Kanban-Statistiken
  const kanbanStats = useMemo(() => {
    const stats: Record<UniversalKanbanStatus, number> = {
      offen: 0,
      versendet: 0,
      an_kunden: 0,
      rechnungsstellung: 0,
      bezahlt: 0,
    };
    kanbanGruppen.forEach((gruppen, status) => {
      stats[status] = gruppen.length;
    });
    return stats;
  }, [kanbanGruppen]);

  // Gruppierte Bestellungen (für andere Gruppierungen)
  const gruppierteDaten = useMemo(() => {
    if (groupBy === 'none') {
      return { 'Alle Bestellungen': bestellungen };
    }

    if (groupBy === 'kunde') {
      // Wird separat gehandhabt
      return {};
    }

    const gruppen: Record<string, UniversalBestellung[]> = {};

    bestellungen.forEach((bestellung) => {
      let key: string;

      if (groupBy === 'lieferdatum') {
        if (bestellung.lieferKW && bestellung.lieferKWJahr) {
          key = `KW ${bestellung.lieferKW} / ${bestellung.lieferKWJahr}`;
        } else if (bestellung.lieferdatum) {
          const date = new Date(bestellung.lieferdatum);
          key = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        } else {
          key = 'Ohne Lieferdatum';
        }
      } else if (groupBy === 'status') {
        const config = getStatusConfig(bestellung.projekt.status);
        key = config.label;
      } else {
        key = 'Alle';
      }

      if (!gruppen[key]) {
        gruppen[key] = [];
      }
      gruppen[key].push(bestellung);
    });

    return gruppen;
  }, [bestellungen, groupBy]);

  // Summen berechnen
  const summen = useMemo(() => {
    const gesamtWert = bestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);
    const gesamtEK = bestellungen.reduce((sum, b) => sum + ((b.position.einkaufspreis || 0) * (b.position.menge || 1)), 0);
    const db1 = gesamtWert - gesamtEK;
    const db1Prozent = gesamtWert > 0 ? (db1 / gesamtWert) * 100 : 0;
    return { gesamtWert, gesamtEK, db1, db1Prozent, anzahl: bestellungen.length };
  }, [bestellungen]);

  // Erstelle LieferscheinDaten für eine Kundengruppe
  const erstelleLieferscheinDaten = async (gruppe: KundenGruppe): Promise<{ daten: LieferscheinDaten; lieferscheinnummer: string }> => {
    const stammdaten = await getStammdatenOderDefault();
    const lieferscheinnummer = await generiereNaechsteDokumentnummer('lieferschein');
    const heute = new Date().toISOString().split('T')[0];
    const ersteProjekt = gruppe.bestellungen[0].projekt;

    // Positionen konvertieren (OHNE Preise!)
    const positionen: LieferscheinPosition[] = gruppe.bestellungen.map((b, idx) => ({
      id: `pos-${idx}`,
      artikelnummer: b.position.artikelnummer || '',
      artikel: b.position.bezeichnung.replace(/^Universal:\s*/i, ''),
      beschreibung: b.position.beschreibung?.replace(/^Universal:\s*/i, '') || '',
      menge: b.position.menge,
      einheit: b.position.einheit || 'Stk',
    }));

    const daten: LieferscheinDaten = {
      // Firmendaten
      firmenname: stammdaten.firmenname,
      firmenstrasse: stammdaten.firmenstrasse || '',
      firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
      firmenTelefon: stammdaten.firmenTelefon || '',
      firmenEmail: stammdaten.firmenEmail || 'info@tennismehl.com',
      firmenWebsite: stammdaten.firmenWebsite || 'www.tennismehl24.de',

      // Kundendaten (Lieferadresse = Vereinsadresse)
      kundenname: gruppe.kundenname,
      kundenstrasse: ersteProjekt.kundenstrasse || '',
      kundenPlzOrt: gruppe.kundenPlzOrt,
      kundennummer: ersteProjekt.kundennummer || '',
      ansprechpartner: ersteProjekt.ansprechpartner || '',

      // Lieferschein-spezifisch
      lieferscheinnummer,
      lieferdatum: heute,
      bestellnummer: gruppe.abNummer,

      // Positionen
      positionen,
    };

    return { daten, lieferscheinnummer };
  };

  // Lieferschein PDF generieren und öffnen
  const handleLieferscheinPDF = async (gruppe: KundenGruppe) => {
    try {
      const { daten } = await erstelleLieferscheinDaten(gruppe);
      // einfach = true: Ohne Einleitung, ohne Abdeckung/PE Folien, ohne Empfangsbestätigung
      const pdf = await generiereLieferscheinPDF(daten, undefined, true);
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Fehler beim Erstellen des Lieferscheins:', error);
      alert('Fehler beim Erstellen des Lieferscheins. Bitte versuchen Sie es erneut.');
    }
  };

  // Interne Funktion zum Öffnen des Email-Vorschau Modals
  const oeffneEmailVorschauIntern = async (gruppe: KundenGruppe) => {
    try {
      const { daten, lieferscheinnummer } = await erstelleLieferscheinDaten(gruppe);
      const pdf = await generiereLieferscheinPDF(daten, undefined, true);
      const pdfBlob = pdf.output('blob');

      // Lieferwoche aus der ersten Bestellung holen
      const ersteBestellung = gruppe.bestellungen[0];
      const lieferKW = ersteBestellung.lieferKW;
      const lieferKWJahr = ersteBestellung.lieferKWJahr;
      const lieferKWText = lieferKW
        ? `Bitte Lieferung in KW ${lieferKW}${lieferKWJahr ? '/' + lieferKWJahr : ''}.`
        : '';

      // Signatur aus Stammdaten laden
      const emailTemplate = await generiereStandardEmail('angebot', lieferscheinnummer, gruppe.kundenname);
      const signaturHtml = emailTemplate.signatur || '';

      // Email-Body erstellen (ohne Signatur, wird später angehängt)
      const emailText = `<p>Hallo zusammen,</p>
<p>bitte Versand der Ware unter Beilage des anhängenden Lieferscheins.</p>
${lieferKWText ? `<p>${lieferKWText}</p>` : ''}`;

      // Dateiname
      const datumFormatiert = new Date().toLocaleDateString('de-DE').replace(/\./g, '-');
      const kundennameSauber = gruppe.kundenname.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').substring(0, 40).trim();
      const pdfDateiname = `Lieferschein_${kundennameSauber}_${datumFormatiert}.pdf`;

      // Empfänger basierend auf Testmodus
      const empfaenger = testModus ? TEST_EMAIL : UNIVERSAL_SPORT_EMAIL;

      // Modal-Daten setzen
      setEmailVorschauDaten({
        gruppe,
        empfaenger,
        betreff: `${testModus ? '[TEST] ' : ''}Bestellung - ${gruppe.kundenname}`,
        emailText,
        signatur: signaturHtml,
        lieferKW,
        lieferKWJahr,
        pdfBlob,
        pdfDateiname,
        lieferscheinnummer,
      });
      setShowEmailVorschau(true);
    } catch (error) {
      console.error('Fehler beim Vorbereiten der Email:', error);
      throw error;
    }
  };

  // Email-Vorschau Modal öffnen (für Einzelversand)
  const oeffneEmailVorschau = async (gruppe: KundenGruppe) => {
    setSendingProjektIds(prev => new Set([...prev, gruppe.projektId]));

    try {
      await oeffneEmailVorschauIntern(gruppe);
    } catch (error) {
      alert('Fehler beim Vorbereiten der Email. Bitte versuchen Sie es erneut.');
    } finally {
      setSendingProjektIds(prev => {
        const next = new Set(prev);
        next.delete(gruppe.projektId);
        return next;
      });
    }
  };

  // Email aus Vorschau-Modal senden
  const sendeAusVorschau = async () => {
    if (!emailVorschauDaten) return;

    setEmailVorschauSending(true);
    const { gruppe, empfaenger, betreff, emailText, signatur, pdfBlob, pdfDateiname, lieferscheinnummer } = emailVorschauDaten;

    try {
      // PDF zu Base64
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // HTML-Body mit Signatur
      const htmlBody = wrapInEmailTemplate(emailText, signatur);

      const result = await sendeEmailMitPdf({
        empfaenger,
        absender: TENNISMEHL_ABSENDER,
        betreff,
        htmlBody,
        pdfBase64: base64,
        pdfDateiname,
        projektId: gruppe.projektId,
        dokumentTyp: 'lieferschein',
        dokumentNummer: lieferscheinnummer,
        testModus,
        skipProtokoll: testModus,
      });

      if (result.success) {
        if (!testModus) {
          // Email-Status aktualisieren
          setEmailStatus(prev => ({
            ...prev,
            [gruppe.projektId]: {
              gesendetAm: new Date().toISOString(),
              dokumentNummer: lieferscheinnummer,
            },
          }));

          // WICHTIG: Projekt-Status auf "lieferschein" setzen
          try {
            await projektService.updateProjekt(gruppe.projektId, {
              status: 'lieferschein',
            });
            console.log(`✓ Projekt ${gruppe.projektId} auf Status "lieferschein" aktualisiert`);

            // WICHTIG: Auch lokalen State aktualisieren für sofortige UI-Reaktion
            setBestellungen(prev => prev.map(b => {
              if (b.projektId === gruppe.projektId) {
                return {
                  ...b,
                  projekt: { ...b.projekt, status: 'lieferschein' as any }
                };
              }
              return b;
            }));
          } catch (statusError) {
            console.error('Fehler beim Aktualisieren des Projekt-Status:', statusError);
          }
        }

        setJustSentProjektIds(prev => new Set([...prev, gruppe.projektId]));
        setTimeout(() => {
          setJustSentProjektIds(prev => {
            const next = new Set(prev);
            next.delete(gruppe.projektId);
            return next;
          });
        }, testModus ? 5000 : 3000);

        // Bulk-Queue: Erfolg zählen und nächsten laden
        if (bulkQueue.length > 0) {
          setBulkQueueResult(prev => ({ ...prev, success: prev.success + 1 }));
          ladeNaechstenAusBulkQueue();
        } else {
          setShowEmailVorschau(false);
          setEmailVorschauDaten(null);
        }
      } else {
        throw new Error(result.error || 'Email konnte nicht gesendet werden');
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      alert(`Fehler beim Senden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      // Bei Fehler im Bulk-Modus: Fehler zählen, aber weitermachen
      if (bulkQueue.length > 0) {
        setBulkQueueResult(prev => ({ ...prev, failed: prev.failed + 1 }));
        ladeNaechstenAusBulkQueue();
      }
    } finally {
      setEmailVorschauSending(false);
    }
  };

  // Nächsten Kunden aus Bulk-Queue laden
  const ladeNaechstenAusBulkQueue = async () => {
    const nextIndex = bulkQueueIndex + 1;
    if (nextIndex >= bulkQueue.length) {
      // Alle fertig - Zusammenfassung zeigen
      setShowEmailVorschau(false);
      setEmailVorschauDaten(null);
      setBulkQueue([]);
      setBulkQueueIndex(0);
      // Ergebnis-Alert
      const result = bulkQueueResult;
      setTimeout(() => {
        alert(`Bulk-Versand abgeschlossen!\n\nErfolgreich: ${result.success + 1}\nFehlgeschlagen: ${result.failed}\nÜbersprungen: ${result.skipped}`);
        setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });
      }, 100);
      return;
    }

    setBulkQueueIndex(nextIndex);
    const nextGruppe = bulkQueue[nextIndex];
    await oeffneEmailVorschauIntern(nextGruppe);
  };

  // Kunden überspringen (im Bulk-Modus)
  const ueberspringeImBulk = () => {
    if (bulkQueue.length > 0) {
      setBulkQueueResult(prev => ({ ...prev, skipped: prev.skipped + 1 }));
      ladeNaechstenAusBulkQueue();
    } else {
      setShowEmailVorschau(false);
      setEmailVorschauDaten(null);
    }
  };

  // Bulk-Versand abbrechen
  const abbrechenBulkVersand = () => {
    const result = bulkQueueResult;
    setShowEmailVorschau(false);
    setEmailVorschauDaten(null);
    setBulkQueue([]);
    setBulkQueueIndex(0);
    if (result.success > 0 || result.failed > 0 || result.skipped > 0) {
      alert(`Bulk-Versand abgebrochen!\n\nErfolgreich: ${result.success}\nFehlgeschlagen: ${result.failed}\nÜbersprungen: ${result.skipped}`);
    }
    setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });
  };

  // PDF-Vorschau öffnen
  const oeffnePdfVorschau = () => {
    if (!emailVorschauDaten?.pdfBlob) return;
    const url = URL.createObjectURL(emailVorschauDaten.pdfBlob);
    window.open(url, '_blank');
  };

  // Tracking-Email Modal öffnen
  const oeffneTrackingEmailModal = async (gruppe: KundenGruppe) => {
    try {
      // Kunden-Email aus Projekt oder SaisonKunde holen
      const projekt = gruppe.bestellungen[0]?.projekt;
      let kundenEmail = projekt?.kundenEmail;

      // Fallback: Email vom SaisonKunde laden
      if (!kundenEmail && projekt?.kundeId) {
        try {
          const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
          kundenEmail = kunde?.email || undefined;
        } catch (err) {
          console.warn('Kunde konnte nicht geladen werden:', err);
        }
      }

      // Signatur aus Stammdaten laden (verwende 'angebot' Template wie bei Universal-Lieferschein)
      const emailTemplate = await generiereStandardEmail('angebot', gruppe.abNummer, gruppe.kundenname);
      const signaturHtml = emailTemplate.signatur || '';

      // Empfänger basierend auf Testmodus (leer lassen wenn keine Email, User kann eintragen)
      const empfaenger = testModus ? TEST_EMAIL : (kundenEmail || '');

      // Email-Body erstellen
      const emailText = `<p>Guten Tag,</p>
<p>Ihre Bestellung (${gruppe.abNummer}) wurde versandt.</p>
<p><strong>Tracking-Nummer:</strong> [TRACKING_NUMMER]</p>
<p>Sie können den Sendungsstatus unter folgendem Link verfolgen:</p>
<p>[TRACKING_LINK]</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`;

      // Modal-Daten setzen
      setTrackingEmailDaten({
        gruppe,
        empfaenger,
        betreff: `${testModus ? '[TEST] ' : ''}Ihre Bestellung ${gruppe.abNummer} - Versandbestätigung`,
        emailText,
        signatur: signaturHtml,
        trackingNummer: '',
        trackingLink: '',
      });
      setShowTrackingEmail(true);
    } catch (error) {
      console.error('Fehler beim Vorbereiten der Tracking-Email:', error);
      alert('Fehler beim Vorbereiten der Tracking-Email. Bitte versuchen Sie es erneut.');
    }
  };

  // Tracking-Email senden
  const sendeTrackingEmail = async () => {
    if (!trackingEmailDaten) return;

    if (!trackingEmailDaten.empfaenger.trim()) {
      alert('Bitte geben Sie eine Empfänger-E-Mail-Adresse ein.');
      return;
    }

    if (!trackingEmailDaten.trackingNummer.trim()) {
      alert('Bitte geben Sie eine Tracking-Nummer ein.');
      return;
    }

    setTrackingEmailSending(true);
    const { gruppe, empfaenger, betreff, emailText, signatur, trackingNummer, trackingLink } = trackingEmailDaten;

    try {
      // Platzhalter ersetzen
      const finalEmailText = emailText
        .replace('[TRACKING_NUMMER]', trackingNummer)
        .replace('[TRACKING_LINK]', trackingLink || `https://gls-group.com/DE/de/paketverfolgung?match=${trackingNummer}`);

      // HTML-Body mit Signatur
      const htmlBody = wrapInEmailTemplate(finalEmailText, signatur);

      // Email senden (ohne PDF-Anhang)
      const result = await sendeEmail({
        to: empfaenger,
        from: TENNISMEHL_ABSENDER,
        subject: betreff,
        htmlBody,
        testMode: testModus,
      });

      if (result.success) {
        // Status auf "an_kunden" setzen
        if (!testModus) {
          try {
            await projektService.updateProjekt(gruppe.projektId, {
              status: 'lieferschein',
              universalKanbanStatus: 'an_kunden',
              trackingNummer: trackingNummer,
            } as any);
            console.log(`✓ Projekt ${gruppe.projektId} auf Status "an_kunden" aktualisiert`);

            // Lokalen State aktualisieren
            setBestellungen(prev => prev.map(b => {
              if (b.projektId === gruppe.projektId) {
                return {
                  ...b,
                  projekt: {
                    ...b.projekt,
                    status: 'lieferschein' as any,
                    universalKanbanStatus: 'an_kunden',
                  }
                };
              }
              return b;
            }));
          } catch (statusError) {
            console.error('Fehler beim Aktualisieren des Projekt-Status:', statusError);
          }
        }

        setJustSentProjektIds(prev => new Set([...prev, gruppe.projektId]));
        setTimeout(() => {
          setJustSentProjektIds(prev => {
            const next = new Set(prev);
            next.delete(gruppe.projektId);
            return next;
          });
        }, testModus ? 5000 : 3000);

        setShowTrackingEmail(false);
        setTrackingEmailDaten(null);

        alert(testModus
          ? `✓ Test-Email gesendet an ${TEST_EMAIL}`
          : `✓ Tracking-Email erfolgreich an ${empfaenger} gesendet!`);
      } else {
        throw new Error(result.error || 'Email konnte nicht gesendet werden');
      }
    } catch (error) {
      console.error('Fehler beim Senden der Tracking-Email:', error);
      alert(`Fehler beim Senden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setTrackingEmailSending(false);
    }
  };

  // Bulk-Versand starten (mit Modal für jeden Kunden)
  const handleBulkSend = async () => {
    const selectedGruppen = kundenGruppen.filter(g => bulkSelectedIds.has(g.projektId));
    if (selectedGruppen.length === 0) return;

    // Bulk-Modal schließen
    setShowBulkModal(false);

    // Queue initialisieren
    setBulkQueue(selectedGruppen);
    setBulkQueueIndex(0);
    setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });

    // Erstes Modal öffnen
    try {
      await oeffneEmailVorschauIntern(selectedGruppen[0]);
    } catch (error) {
      console.error('Fehler beim Starten des Bulk-Versands:', error);
      alert('Fehler beim Starten des Bulk-Versands.');
      setBulkQueue([]);
    }
  };

  // Bulk-Modal öffnen
  const openBulkModal = () => {
    // Alle nicht bereits gesendeten Kunden vorauswählen
    const nichtGesendet = kundenGruppen
      .filter(g => !emailStatus[g.projektId])
      .map(g => g.projektId);
    setBulkSelectedIds(new Set(nichtGesendet));
    setShowBulkModal(true);
  };

  // CSV Export
  const exportCSV = useCallback(() => {
    const headers = [
      'AB-Nr.',
      'AB-Datum',
      'Kundenname',
      'PLZ/Ort',
      'Artikelnr.',
      'Bezeichnung',
      'Menge',
      'Einheit',
      'VK (Netto)',
      'EK (Netto)',
      'Gesamtpreis',
      'DB1',
      'DB1 %',
      'Lieferdatum',
      'Liefer-KW',
      'Status',
    ];

    const rows = bestellungen.map((b) => {
      const vk = b.position.einzelpreis || 0;
      const ek = b.position.einkaufspreis || 0;
      const menge = b.position.menge || 1;
      const db1 = (vk - ek) * menge;
      const db1Prozent = vk > 0 ? ((vk - ek) / vk) * 100 : 0;

      return [
        b.auftragsbestaetigungsnummer || '',
        b.auftragsbestaetigungsdatum
          ? new Date(b.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')
          : '',
        b.projekt.kundenname || '',
        b.projekt.kundenPlzOrt || '',
        b.position.artikelnummer || '',
        b.position.bezeichnung || '',
        menge.toString().replace('.', ','),
        b.position.einheit || '',
        vk.toFixed(2).replace('.', ','),
        ek.toFixed(2).replace('.', ','),
        b.position.gesamtpreis?.toFixed(2).replace('.', ',') || '',
        db1.toFixed(2).replace('.', ','),
        db1Prozent.toFixed(1).replace('.', ',') + '%',
        b.lieferdatum ? new Date(b.lieferdatum).toLocaleDateString('de-DE') : '',
        b.lieferKW ? `KW ${b.lieferKW}${b.lieferKWJahr ? '/' + b.lieferKWJahr : ''}` : '',
        getStatusConfig(b.projekt.status).label,
      ];
    });

    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Universal_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [bestellungen]);

  // Toggle Gruppe
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Universal-Bestellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card mit Summen */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-xl backdrop-blur-sm">
              <ShoppingCart className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Universal Bestellungen</h2>
              <p className="text-amber-100 mt-1">
                Alle bestellten Universal-Artikel aus dem Katalog
              </p>
            </div>
          </div>

          <button
            onClick={ladeUniversalBestellungen}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className={`grid gap-4 mt-6 ${groupBy === 'kanban' ? 'grid-cols-6' : groupBy === 'kunde' ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {/* Kanban-Status KPIs */}
          {groupBy === 'kanban' && (
            <>
              <div className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 ${kanbanStats.offen > 0 ? 'border-2 border-orange-400' : ''}`}>
                <div className="flex items-center gap-2 text-orange-200 text-sm mb-1">
                  <Package className="w-4 h-4" />
                  Offen
                </div>
                <div className={`text-3xl font-bold ${kanbanStats.offen > 0 ? 'text-orange-200' : ''}`}>
                  {kanbanStats.offen}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-blue-400/50">
                <div className="flex items-center gap-2 text-blue-200 text-sm mb-1">
                  <Send className="w-4 h-4" />
                  An Universal
                </div>
                <div className="text-3xl font-bold text-blue-200">{kanbanStats.versendet}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-purple-400/50">
                <div className="flex items-center gap-2 text-purple-200 text-sm mb-1">
                  <Truck className="w-4 h-4" />
                  An Kunden
                </div>
                <div className="text-3xl font-bold text-purple-200">{kanbanStats.an_kunden}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-green-400/50">
                <div className="flex items-center gap-2 text-green-200 text-sm mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Bezahlt
                </div>
                <div className="text-3xl font-bold text-green-200">{kanbanStats.bezahlt}</div>
              </div>
            </>
          )}

          {/* Versand-Status KPIs (nur bei Kunden-Gruppierung) */}
          {groupBy === 'kunde' && (
            <>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border-2 border-white/20">
                <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                  <Users className="w-4 h-4" />
                  Kunden gesamt
                </div>
                <div className="text-3xl font-bold">{versandStats.gesamt}</div>
              </div>
              <div className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 ${versandStats.offen > 0 ? 'border-2 border-red-400 bg-red-500/20' : ''}`}>
                <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                  <X className="w-4 h-4" />
                  Offen
                </div>
                <div className={`text-3xl font-bold ${versandStats.offen > 0 ? 'text-red-200' : ''}`}>
                  {versandStats.offen}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border-2 border-green-400/50">
                <div className="flex items-center gap-2 text-green-200 text-sm mb-1">
                  <Check className="w-4 h-4" />
                  Gesendet
                </div>
                <div className="text-3xl font-bold text-green-200">{versandStats.gesendet}</div>
              </div>
            </>
          )}

          {/* Standard KPIs */}
          {groupBy !== 'kunde' && groupBy !== 'kanban' && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                <Package className="w-4 h-4" />
                Positionen
              </div>
              <div className="text-3xl font-bold">{summen.anzahl}</div>
            </div>
          )}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Kunden zahlen (VK)
            </div>
            <div className="text-2xl font-bold">
              {summen.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <ShoppingCart className="w-4 h-4" />
              An Universal (EK)
            </div>
            <div className="text-2xl font-bold">
              {summen.gesamtEK.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <Layers className="w-4 h-4" />
              Marge (DB1)
            </div>
            <div className="text-2xl font-bold">
              {summen.db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              {summen.gesamtWert > 0 && (
                <span className="text-lg font-normal ml-2">
                  ({summen.db1Prozent.toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Gruppierung */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Ansicht:</span>
          <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setGroupBy('kanban')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'kanban'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
            <button
              onClick={() => setGroupBy('kunde')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'kunde'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Kunde
            </button>
            <button
              onClick={() => setGroupBy('lieferdatum')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'lieferdatum'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Lieferdatum
            </button>
            <button
              onClick={() => setGroupBy('status')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'status'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              Status
            </button>
            <button
              onClick={() => setGroupBy('none')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'none'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              Keine
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Test-Modus Toggle (immer sichtbar) */}
          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            testModus
              ? 'bg-yellow-100 dark:bg-yellow-900/50 border-2 border-yellow-400'
              : 'bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600'
          }`}>
            <input
              type="checkbox"
              checked={testModus}
              onChange={(e) => setTestModus(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
            />
            <span className={`text-sm font-medium ${testModus ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-600 dark:text-gray-400'}`}>
              Test-Modus
            </span>
            {testModus && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                → {TEST_EMAIL}
              </span>
            )}
          </label>

          {/* Bulk-Versand Button (nur bei Kunden-Gruppierung) */}
          {groupBy === 'kunde' && kundenGruppen.length > 0 && (
            <button
              onClick={openBulkModal}
              className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg ${
                testModus ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Send className="w-5 h-5" />
              {testModus ? 'Test: ' : ''}Alle Lieferscheine senden
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {kundenGruppen.filter(g => !emailStatus[g.projektId]).length}
              </span>
            </button>
          )}

          {/* Export Button */}
          <button
            onClick={exportCSV}
            disabled={bestellungen.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg"
          >
            <Download className="w-5 h-5" />
            CSV Export
          </button>
        </div>
      </div>

      {/* Bestellungen Liste */}
      {bestellungen.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Keine Universal-Bestellungen
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Es gibt aktuell keine bestätigten Aufträge mit Universal-Artikeln.
          </p>
        </div>
      ) : groupBy === 'kanban' ? (
        /* === KANBAN-ANSICHT === */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {KANBAN_COLUMNS.map((column) => {
            const gruppenInSpalte = kanbanGruppen.get(column.status) || [];

            return (
              <div
                key={column.status}
                className={`rounded-xl border-2 ${column.bgColor} min-h-[400px] flex flex-col transition-all duration-200 ${
                  dragOverColumn === column.status
                    ? 'ring-2 ring-blue-500 ring-offset-2 scale-[1.02]'
                    : ''
                }`}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, column.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.status)}
              >
                {/* Spalten-Header */}
                <div className="px-4 py-3 border-b border-inherit">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${column.color}`}>
                      {column.label}
                    </h3>
                    <span className={`px-2 py-0.5 text-sm font-bold rounded-full ${column.color} bg-white dark:bg-slate-800`}>
                      {gruppenInSpalte.length}
                    </span>
                  </div>
                </div>

                {/* Karten */}
                <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                  {gruppenInSpalte.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                      Keine Bestellungen
                    </div>
                  ) : (
                    gruppenInSpalte.map((gruppe) => {
                      const isSending = sendingProjektIds.has(gruppe.projektId);
                      const justSent = justSentProjektIds.has(gruppe.projektId);

                      return (
                        <div
                          key={gruppe.projektId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, gruppe.projektId)}
                          onDragEnd={handleDragEnd}
                          className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-3 hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
                            draggedProjektId === gruppe.projektId ? 'opacity-50 scale-95' : ''
                          }`}
                        >
                          {/* Kunde */}
                          <div
                            onClick={() => onProjektClick(gruppe.bestellungen[0].projekt)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                                {gruppe.kundenname}
                              </span>
                              {gruppe.abNummer.startsWith('SHOP-') && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                                  <ShoppingCart className="w-2.5 h-2.5" />
                                  Shop
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {gruppe.abNummer} • {gruppe.bestellungen.length} Pos.
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {gruppe.kundenPlzOrt}
                            </div>
                          </div>

                          {/* Preisübersicht: VK, EK, Marge */}
                          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 space-y-1">
                            {/* Kunde zahlt (VK) */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Kunde zahlt:</span>
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                {gruppe.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </span>
                            </div>
                            {/* Wir zahlen an Universal (EK) */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 dark:text-gray-400">An Universal:</span>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                {gruppe.gesamtEK.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </span>
                            </div>
                            {/* Marge (DB1) */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Marge:</span>
                              <span className={`text-xs font-bold ${gruppe.db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {gruppe.db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                {gruppe.gesamtWert > 0 && (
                                  <span className="ml-1 font-normal">
                                    ({((gruppe.db1 / gruppe.gesamtWert) * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Status-Wechsel Buttons */}
                          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between gap-1">
                            {/* Zurück-Button (wenn nicht offen) */}
                            {column.status !== 'offen' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentIdx = KANBAN_COLUMNS.findIndex(c => c.status === column.status);
                                  if (currentIdx > 0) {
                                    updateProjektStatusManuell(gruppe.projektId, KANBAN_COLUMNS[currentIdx - 1].status);
                                  }
                                }}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                                title={`Zurück zu: ${KANBAN_COLUMNS[KANBAN_COLUMNS.findIndex(c => c.status === column.status) - 1]?.label || ''}`}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}

                            {/* Mitte: Status-Label oder Platzhalter */}
                            <div className="flex-1 text-center text-xs text-gray-400 dark:text-gray-500">
                              <MoveHorizontal className="w-3 h-3 inline" />
                            </div>

                            {/* Weiter-Button (wenn nicht bezahlt) */}
                            {column.status !== 'bezahlt' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentIdx = KANBAN_COLUMNS.findIndex(c => c.status === column.status);
                                  if (currentIdx < KANBAN_COLUMNS.length - 1) {
                                    updateProjektStatusManuell(gruppe.projektId, KANBAN_COLUMNS[currentIdx + 1].status);
                                  }
                                }}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                                title={`Weiter zu: ${KANBAN_COLUMNS[KANBAN_COLUMNS.findIndex(c => c.status === column.status) + 1]?.label || ''}`}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Aktionen basierend auf Status */}
                          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex flex-wrap gap-1.5">
                            {column.status === 'offen' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLieferscheinPDF(gruppe);
                                  }}
                                  className="flex-1 px-2 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-1"
                                >
                                  <FileText className="w-3 h-3" />
                                  PDF
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    oeffneEmailVorschau(gruppe);
                                  }}
                                  disabled={isSending}
                                  className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 transition-colors ${
                                    justSent
                                      ? 'bg-green-500 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  {isSending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : justSent ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  {justSent ? 'Gesendet!' : 'An Universal'}
                                </button>
                              </>
                            )}

                            {column.status === 'versendet' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Tracking-Email Modal öffnen
                                  oeffneTrackingEmailModal(gruppe);
                                }}
                                className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 transition-colors ${
                                  testModus
                                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                                }`}
                              >
                                <Mail className="w-3 h-3" />
                                {testModus ? 'Test: ' : ''}Tracking senden
                              </button>
                            )}

                            {column.status === 'an_kunden' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onProjektClick(gruppe.bestellungen[0].projekt);
                                }}
                                className="flex-1 px-2 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center justify-center gap-1 transition-colors"
                              >
                                <Receipt className="w-3 h-3" />
                                Rechnung erstellen
                              </button>
                            )}

                            {column.status === 'rechnungsstellung' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkiereAlsBezahlt(gruppe.projektId, gruppe.kundenname);
                                }}
                                className="flex-1 px-2 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded flex items-center justify-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Als bezahlt markieren
                              </button>
                            )}

                            {column.status === 'bezahlt' && (
                              <div className="flex-1 px-2 py-1.5 text-xs text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Abgeschlossen
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : groupBy === 'kunde' ? (
        /* === KUNDEN-GRUPPIERUNG === */
        <div className="space-y-3">
          {kundenGruppen.map((gruppe) => {
            const isExpanded = expandedGroups.has(gruppe.projektId) || expandedGroups.has('alle');
            const status = emailStatus[gruppe.projektId];
            const isSending = sendingProjektIds.has(gruppe.projektId);
            const justSent = justSentProjektIds.has(gruppe.projektId);
            const istGesendet = !!status;

            return (
              <div
                key={gruppe.projektId}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-lg overflow-hidden transition-all ${
                  istGesendet
                    ? 'border-2 border-green-400 dark:border-green-600'
                    : 'border-2 border-orange-400 dark:border-orange-600'
                }`}
              >
                {/* Status-Indikator links */}
                <div className="flex">
                  <div className={`w-2 flex-shrink-0 ${istGesendet ? 'bg-green-500' : 'bg-orange-500'}`} />

                  <div className="flex-1">
                    {/* Gruppen-Header */}
                    <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => toggleGroup(gruppe.projektId)}
                        className="flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-750 rounded-lg px-2 py-1 -ml-2 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                        <div className="flex items-center gap-3">
                          {/* Status-Icon */}
                          {istGesendet ? (
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                              <Send className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            </div>
                          )}
                          <div className="text-left">
                            <span className="font-semibold text-gray-900 dark:text-white">{gruppe.kundenname}</span>
                            {gruppe.kundenPlzOrt && (
                              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                                {gruppe.kundenPlzOrt}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded">
                          {gruppe.abNummer}
                        </span>
                        {/* Lieferwoche */}
                        {gruppe.bestellungen[0]?.lieferKW && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm rounded-full flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            KW {gruppe.bestellungen[0].lieferKW}
                            {gruppe.bestellungen[0].lieferKWJahr && `/${gruppe.bestellungen[0].lieferKWJahr}`}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm rounded-full">
                          {gruppe.bestellungen.length} Pos.
                        </span>
                      </button>

                      <div className="flex items-center gap-3">
                        {/* Summen */}
                        <div className="text-sm text-gray-600 dark:text-gray-400 hidden lg:flex items-center gap-4">
                          <span className="font-medium">
                            {gruppe.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>

                        {/* Email-Status Badge - sehr prominent */}
                        {status ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg">
                            <Check className="w-4 h-4" />
                            <div className="text-sm">
                              <div className="font-semibold">Gesendet</div>
                              <div className="text-xs opacity-80">
                                {new Date(status.gesendetAm).toLocaleDateString('de-DE')} • LS {status.dokumentNummer}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-sm rounded-lg font-medium">
                            Offen
                          </span>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLieferscheinPDF(gruppe);
                            }}
                            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-sm"
                            title="Lieferschein PDF öffnen"
                          >
                            <FileText className="w-4 h-4" />
                            <span className="hidden md:inline">PDF</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              oeffneEmailVorschau(gruppe);
                            }}
                            disabled={isSending}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-sm font-medium ${
                              justSent
                                ? 'bg-green-600 text-white'
                                : isSending
                                ? 'bg-green-400 text-white cursor-wait'
                                : istGesendet
                                ? 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-green-600 hover:text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                            title={istGesendet ? 'Erneut senden' : `An ${UNIVERSAL_SPORT_NAME} senden`}
                          >
                            {isSending ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="hidden md:inline">Sende...</span>
                              </>
                            ) : justSent ? (
                              <>
                                <Check className="w-4 h-4" />
                                <span className="hidden md:inline">Gesendet!</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                <span className="hidden md:inline">{istGesendet ? 'Nochmal' : 'Senden'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Positionen Tabelle */}
                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-gray-200 dark:border-slate-700">
                        <table className="w-full">
                          <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold">Art.-Nr.</th>
                              <th className="px-4 py-2 text-left font-semibold">Artikel</th>
                              <th className="px-4 py-2 text-right font-semibold">Menge</th>
                              <th className="px-4 py-2 text-right font-semibold">VK</th>
                              <th className="px-4 py-2 text-right font-semibold">EK</th>
                              <th className="px-4 py-2 text-right font-semibold">DB1</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {gruppe.bestellungen.map((bestellung, idx) => {
                              const vk = bestellung.position.einzelpreis || 0;
                              const ek = bestellung.position.einkaufspreis || 0;
                              const menge = bestellung.position.menge || 1;
                              const db1 = (vk - ek) * menge;

                              return (
                                <tr
                                  key={`${bestellung.projektId}-${idx}`}
                                  onClick={() => onProjektClick(bestellung.projekt)}
                                  className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                >
                                  <td className="px-4 py-2 font-mono text-sm text-gray-600 dark:text-gray-400">
                                    {bestellung.position.artikelnummer || '-'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="font-medium text-gray-900 dark:text-white">
                                      {bestellung.position.bezeichnung.replace(/^Universal:\s*/i, '')}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="font-bold text-gray-900 dark:text-white">
                                      {menge.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                      {bestellung.position.einheit || 'Stk'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">
                                    {vk.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                                    {ek.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className={`font-semibold ${db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 dark:bg-slate-800 font-semibold">
                            <tr>
                              <td colSpan={3} className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">
                                Summe:
                              </td>
                              <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                {gruppe.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                                {gruppe.gesamtEK.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className={`${gruppe.db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {gruppe.db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(gruppierteDaten).map(([gruppenKey, gruppenBestellungen]) => {
            const isExpanded = expandedGroups.has(gruppenKey) || expandedGroups.has('alle');
            const gruppenWert = gruppenBestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);
            const gruppenEK = gruppenBestellungen.reduce((sum, b) => sum + ((b.position.einkaufspreis || 0) * (b.position.menge || 1)), 0);
            const gruppenDB1 = gruppenWert - gruppenEK;

            return (
              <div
                key={gruppenKey}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Gruppen-Header */}
                <button
                  onClick={() => toggleGroup(gruppenKey)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">{gruppenKey}</span>
                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm rounded-full">
                      {gruppenBestellungen.length} Position{gruppenBestellungen.length !== 1 ? 'en' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">
                      DB1: {gruppenDB1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {gruppenWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                </button>

                {/* Bestellungen Tabelle */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">AB-Nr.</th>
                          <th className="px-4 py-3 text-left font-semibold">Kunde</th>
                          <th className="px-4 py-3 text-left font-semibold">Artikel</th>
                          <th className="px-4 py-3 text-right font-semibold">Menge</th>
                          <th className="px-4 py-3 text-right font-semibold">VK</th>
                          <th className="px-4 py-3 text-right font-semibold">EK</th>
                          <th className="px-4 py-3 text-right font-semibold">DB1</th>
                          <th className="px-4 py-3 text-left font-semibold">Lieferdatum</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {gruppenBestellungen.map((bestellung, idx) => {
                          const statusConfig = getStatusConfig(bestellung.projekt.status);
                          const StatusIcon = statusConfig.icon;
                          const vk = bestellung.position.einzelpreis || 0;
                          const ek = bestellung.position.einkaufspreis || 0;
                          const menge = bestellung.position.menge || 1;
                          const db1 = (vk - ek) * menge;
                          const db1Prozent = vk > 0 ? ((vk - ek) / vk) * 100 : 0;

                          return (
                            <tr
                              key={`${bestellung.projektId}-${idx}`}
                              onClick={() => onProjektClick(bestellung.projekt)}
                              className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                                  {bestellung.auftragsbestaetigungsnummer || '-'}
                                </span>
                                {bestellung.auftragsbestaetigungsdatum && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {new Date(bestellung.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {bestellung.projekt.kundenname}
                                  </span>
                                </div>
                                {bestellung.projekt.kundenPlzOrt && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {bestellung.projekt.kundenPlzOrt}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {bestellung.position.bezeichnung}
                                </div>
                                {bestellung.position.artikelnummer && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                                    {bestellung.position.artikelnummer}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {menge.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                  {bestellung.position.einheit || 'Stk'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                                {vk.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                                {ek.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className={`font-semibold ${db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {db1Prozent.toFixed(1)}%
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {bestellung.lieferKW ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-amber-500" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      KW {bestellung.lieferKW}
                                      {bestellung.lieferKWJahr && (
                                        <span className="text-gray-500">/{bestellung.lieferKWJahr}</span>
                                      )}
                                    </span>
                                  </div>
                                ) : bestellung.lieferdatum ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-amber-500" />
                                    <span className="text-gray-900 dark:text-white">
                                      {new Date(bestellung.lieferdatum).toLocaleDateString('de-DE')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
                                >
                                  <StatusIcon className="w-3.5 h-3.5" />
                                  {statusConfig.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === BULK-VERSAND MODAL === */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Lieferscheine versenden
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  An {UNIVERSAL_SPORT_NAME} ({UNIVERSAL_SPORT_EMAIL})
                </p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body - Auswahl-Liste */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {/* Info-Hinweis */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                Für jeden ausgewählten Kunden öffnet sich ein Vorschau-Modal zur Überprüfung vor dem Senden.
              </div>
                <div className="space-y-2">
                  {/* Alle auswählen */}
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-750 transition-colors">
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.size === kundenGruppen.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBulkSelectedIds(new Set(kundenGruppen.map(g => g.projektId)));
                        } else {
                          setBulkSelectedIds(new Set());
                        }
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Alle auswählen ({kundenGruppen.length})
                    </span>
                  </label>

                  <div className="border-t border-gray-200 dark:border-slate-700 my-3"></div>

                  {/* Kunden-Liste */}
                  {kundenGruppen.map((gruppe) => {
                    const status = emailStatus[gruppe.projektId];
                    const isSelected = bulkSelectedIds.has(gruppe.projektId);

                    return (
                      <label
                        key={gruppe.projektId}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(bulkSelectedIds);
                            if (e.target.checked) {
                              next.add(gruppe.projektId);
                            } else {
                              next.delete(gruppe.projektId);
                            }
                            setBulkSelectedIds(next);
                          }}
                          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {gruppe.kundenname}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({gruppe.bestellungen.length} Pos.)
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {gruppe.abNummer}
                          </div>
                        </div>
                        {status && (
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-full whitespace-nowrap">
                            Bereits gesendet
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleBulkSend}
                disabled={bulkSelectedIds.size === 0}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                <Send className="w-5 h-5" />
                {bulkSelectedIds.size} Kunden prüfen & senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email-Vorschau Modal */}
      {showEmailVorschau && emailVorschauDaten && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-xl">
              <div className="flex items-center gap-3">
                <Mail className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    E-Mail Vorschau
                    {bulkQueue.length > 0 && (
                      <span className="ml-2 text-green-200 font-normal">
                        ({bulkQueueIndex + 1} von {bulkQueue.length})
                      </span>
                    )}
                  </h2>
                  <p className="text-green-100 text-sm">{emailVorschauDaten.gruppe.kundenname}</p>
                </div>
              </div>
              <button
                onClick={bulkQueue.length > 0 ? abbrechenBulkVersand : () => {
                  setShowEmailVorschau(false);
                  setEmailVorschauDaten(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title={bulkQueue.length > 0 ? 'Bulk-Versand abbrechen' : 'Schließen'}
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Testmodus Hinweis */}
              {testModus && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Testmodus aktiv</span>
                  <span className="text-amber-700 dark:text-amber-300 text-sm">- wird an {TEST_EMAIL} gesendet</span>
                </div>
              )}

              {/* Empfänger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Empfänger
                </label>
                <div className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-gray-200">
                  {emailVorschauDaten.empfaenger}
                </div>
              </div>

              {/* Betreff */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Betreff
                </label>
                <input
                  type="text"
                  value={emailVorschauDaten.betreff}
                  onChange={(e) => setEmailVorschauDaten(prev => prev ? { ...prev, betreff: e.target.value } : null)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Lieferwoche Info */}
              {emailVorschauDaten.lieferKW && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-gray-600 dark:text-gray-400">Gewünschte Lieferung:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    KW {emailVorschauDaten.lieferKW}{emailVorschauDaten.lieferKWJahr ? `/${emailVorschauDaten.lieferKWJahr}` : ''}
                  </span>
                </div>
              )}

              {/* E-Mail Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nachricht
                </label>
                <TipTapEditor
                  content={emailVorschauDaten.emailText}
                  onChange={(html) => setEmailVorschauDaten(prev => prev ? { ...prev, emailText: html } : null)}
                  placeholder="E-Mail Text..."
                  minHeight="150px"
                />
              </div>

              {/* Signatur Vorschau */}
              {emailVorschauDaten.signatur && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Signatur (wird automatisch angehängt)
                  </label>
                  <div
                    className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: emailVorschauDaten.signatur }}
                  />
                </div>
              )}

              {/* Anhang */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Anhang
                </label>
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{emailVorschauDaten.pdfDateiname}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(emailVorschauDaten.pdfBlob.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={oeffnePdfVorschau}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    Vorschau
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-b-xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={bulkQueue.length > 0 ? abbrechenBulkVersand : () => {
                    setShowEmailVorschau(false);
                    setEmailVorschauDaten(null);
                  }}
                  disabled={emailVorschauSending}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {bulkQueue.length > 0 ? 'Abbrechen' : 'Schließen'}
                </button>
                {bulkQueue.length > 0 && (
                  <button
                    onClick={ueberspringeImBulk}
                    disabled={emailVorschauSending}
                    className="px-4 py-2 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                  >
                    Überspringen
                  </button>
                )}
              </div>
              <button
                onClick={sendeAusVorschau}
                disabled={emailVorschauSending}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                {emailVorschauSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Wird gesendet...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {bulkQueue.length > 0 ? 'Senden & Weiter' : 'E-Mail senden'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking-Email Modal */}
      {showTrackingEmail && trackingEmailDaten && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between rounded-t-xl ${
              testModus
                ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                : 'bg-gradient-to-r from-amber-500 to-orange-500'
            }`}>
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {testModus ? '[TEST] ' : ''}Tracking an Kunden senden
                  </h2>
                  <p className="text-white/80 text-sm">{trackingEmailDaten.gruppe.kundenname}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTrackingEmail(false);
                  setTrackingEmailDaten(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Testmodus Hinweis */}
              {testModus && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Testmodus aktiv</span>
                  <span className="text-amber-700 dark:text-amber-300 text-sm">- wird an {TEST_EMAIL} gesendet</span>
                </div>
              )}

              {/* Empfänger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Empfänger <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={trackingEmailDaten.empfaenger}
                  onChange={(e) => setTrackingEmailDaten(prev => prev ? { ...prev, empfaenger: e.target.value } : null)}
                  placeholder="kunde@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  disabled={testModus}
                />
                {!trackingEmailDaten.empfaenger && !testModus && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Keine E-Mail hinterlegt - bitte manuell eingeben
                  </p>
                )}
              </div>

              {/* Tracking-Nummer (WICHTIG!) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tracking-Nummer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={trackingEmailDaten.trackingNummer}
                  onChange={(e) => setTrackingEmailDaten(prev => prev ? { ...prev, trackingNummer: e.target.value } : null)}
                  placeholder="z.B. 00340434161095123456"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-lg font-mono"
                  autoFocus
                />
              </div>

              {/* Tracking-Link (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tracking-Link <span className="text-gray-400">(optional - GLS wird automatisch generiert)</span>
                </label>
                <input
                  type="text"
                  value={trackingEmailDaten.trackingLink || ''}
                  onChange={(e) => setTrackingEmailDaten(prev => prev ? { ...prev, trackingLink: e.target.value } : null)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Betreff */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Betreff
                </label>
                <input
                  type="text"
                  value={trackingEmailDaten.betreff}
                  onChange={(e) => setTrackingEmailDaten(prev => prev ? { ...prev, betreff: e.target.value } : null)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* E-Mail Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nachricht
                </label>
                <TipTapEditor
                  content={trackingEmailDaten.emailText}
                  onChange={(html) => setTrackingEmailDaten(prev => prev ? { ...prev, emailText: html } : null)}
                  placeholder="E-Mail Text..."
                  minHeight="150px"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Platzhalter: [TRACKING_NUMMER] und [TRACKING_LINK] werden automatisch ersetzt
                </p>
              </div>

              {/* Signatur Vorschau */}
              {trackingEmailDaten.signatur && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Signatur (wird automatisch angehängt)
                  </label>
                  <div
                    className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: trackingEmailDaten.signatur }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-b-xl">
              <button
                onClick={() => {
                  setShowTrackingEmail(false);
                  setTrackingEmailDaten(null);
                }}
                disabled={trackingEmailSending}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={sendeTrackingEmail}
                disabled={trackingEmailSending || !trackingEmailDaten.trackingNummer.trim() || !trackingEmailDaten.empfaenger.trim()}
                className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-medium disabled:opacity-50 ${
                  testModus
                    ? 'bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400'
                    : 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
                }`}
              >
                {trackingEmailSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Wird gesendet...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {testModus ? 'Test-Email senden' : 'Tracking-Email senden'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalView;
