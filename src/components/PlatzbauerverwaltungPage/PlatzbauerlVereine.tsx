import { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Search,
  ChevronRight,
  Plus,
  Phone,
  User,
  Info,
  CheckSquare,
  Square,
  FolderPlus,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  MapPin,
  Scale,
  Check,
} from 'lucide-react';
import { SaisonKundeMitDaten, SaisonKunde } from '../../types/saisonplanung';
import { useNavigate } from 'react-router-dom';
import VereinSchnellerfassung from './VereinSchnellerfassung';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { NeuesProjekt, Projekt } from '../../types/projekt';
import { TENNISMEHL_ARTIKEL } from '../../constants/artikelPreise';

// Quick-Edit Typen
type QuickEditTyp = 'kontakt' | 'email' | 'adresse' | 'menge' | null;

interface QuickEditState {
  vereinId: string;
  typ: QuickEditTyp;
}

// Quick-Edit Popup Komponente
interface QuickEditPopupProps {
  typ: QuickEditTyp;
  vereinId: string;
  kunde: SaisonKunde;
  onSave: (vereinId: string, daten: Partial<SaisonKunde>) => Promise<void>;
  onClose: () => void;
  position: { top: number; left: number };
}

const QuickEditPopup = ({ typ, vereinId, kunde, onSave, onClose, position }: QuickEditPopupProps) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Formular-States je nach Typ
  const [kontaktName, setKontaktName] = useState(kunde.dispoAnsprechpartner?.name || '');
  const [kontaktTelefon, setKontaktTelefon] = useState(kunde.dispoAnsprechpartner?.telefon || '');
  const [email, setEmail] = useState(kunde.email || '');
  const [strasse, setStrasse] = useState(kunde.lieferadresse?.strasse || '');
  const [plz, setPlz] = useState(kunde.lieferadresse?.plz || '');
  const [ort, setOrt] = useState(kunde.lieferadresse?.ort || '');
  const [menge, setMenge] = useState(kunde.tonnenLetztesJahr?.toString() || '');

  // Klick außerhalb schließt Popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let daten: Partial<SaisonKunde> = {};

      switch (typ) {
        case 'kontakt':
          daten = {
            dispoAnsprechpartner: {
              name: kontaktName.trim(),
              telefon: kontaktTelefon.trim(),
            }
          };
          break;
        case 'email':
          daten = { email: email.trim() };
          break;
        case 'adresse':
          daten = {
            lieferadresse: {
              strasse: strasse.trim(),
              plz: plz.trim(),
              ort: ort.trim(),
            }
          };
          break;
        case 'menge':
          daten = { tonnenLetztesJahr: parseFloat(menge) || 0 };
          break;
      }

      await onSave(vereinId, daten);
      onClose();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const renderContent = () => {
    switch (typ) {
      case 'kontakt':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={kontaktName}
                onChange={(e) => setKontaktName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="z.B. Herr Müller"
                autoFocus
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Telefon</label>
              <input
                type="tel"
                value={kontaktTelefon}
                onChange={(e) => setKontaktTelefon(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="z.B. 0171 1234567"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>
        );
      case 'email':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="verein@example.de"
              autoFocus
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            />
          </div>
        );
      case 'adresse':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Straße</label>
              <input
                type="text"
                value={strasse}
                onChange={(e) => setStrasse(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tennisweg 1"
                autoFocus
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">PLZ</label>
                <input
                  type="text"
                  value={plz}
                  onChange={(e) => setPlz(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="12345"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ort</label>
                <input
                  type="text"
                  value={ort}
                  onChange={(e) => setOrt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Musterstadt"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>
          </div>
        );
      case 'menge':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Menge (Vorjahr)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={menge}
                onChange={(e) => setMenge(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                min="0"
                step="0.1"
                autoFocus
                className="w-24 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">Tonnen</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const getTitel = () => {
    switch (typ) {
      case 'kontakt': return 'Kontakt hinzufügen';
      case 'email': return 'E-Mail hinzufügen';
      case 'adresse': return 'Adresse hinzufügen';
      case 'menge': return 'Menge eintragen';
      default: return '';
    }
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl p-3 min-w-[220px]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{getTitel()}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {renderContent()}

      <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-slate-700">
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium rounded transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          Speichern
        </button>
      </div>
    </div>
  );
};

interface PlatzbauerlVereineProps {
  vereine: SaisonKundeMitDaten[];
  platzbauerId: string;
  platzbauerName: string;
  saisonjahr: number;
  onRefresh?: () => void;
}

const PlatzbauerlVereine = ({
  vereine,
  platzbauerId,
  platzbauerName,
  saisonjahr,
  onRefresh,
}: PlatzbauerlVereineProps) => {
  const navigate = useNavigate();
  const [suche, setSuche] = useState('');
  const [showSchnellerfassung, setShowSchnellerfassung] = useState(false);

  // Multi-Select State
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde | null>(null);

  // Existierende Projekte für Vereine (vereinId -> Projekt)
  const [vereinProjekte, setVereinProjekte] = useState<Map<string, Projekt>>(new Map());
  const [isLoadingProjekte, setIsLoadingProjekte] = useState(false);

  // Quick-Edit State
  const [quickEdit, setQuickEdit] = useState<QuickEditState | null>(null);
  const [quickEditPosition, setQuickEditPosition] = useState({ top: 0, left: 0 });

  // Lokale Vereins-Daten für optimistische Updates
  const [lokaleVereine, setLokaleVereine] = useState<SaisonKundeMitDaten[]>(vereine);

  // Sync lokale Daten wenn Props sich ändern
  useEffect(() => {
    setLokaleVereine(vereine);
  }, [vereine]);

  // Lade existierende Projekte für alle Vereine
  useEffect(() => {
    const ladeProjekte = async () => {
      if (vereine.length === 0) return;

      setIsLoadingProjekte(true);
      const projekteMap = new Map<string, Projekt>();

      try {
        // Lade alle Projekte für das Saisonjahr
        const alleProjekte = await projektService.loadProjekte({ saisonjahr });

        // Erstelle Map: kundeId -> Projekt
        for (const projekt of alleProjekte) {
          if (projekt.kundeId) {
            projekteMap.set(projekt.kundeId, projekt);
          }
        }

        setVereinProjekte(projekteMap);
      } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
      } finally {
        setIsLoadingProjekte(false);
      }
    };

    ladeProjekte();
  }, [vereine, saisonjahr]);

  // Filter nur nach Suche (alle Vereine hier sind bereits "ueber_platzbauer")
  const gefilterteVereine = lokaleVereine.filter(v => {
    const kunde = v.kunde;
    if (!suche.trim()) return true;
    const sucheLower = suche.toLowerCase();
    return (
      kunde.name.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.ort?.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.plz?.includes(suche)
    );
  });

  // Quick-Edit öffnen
  const openQuickEdit = (e: React.MouseEvent, vereinId: string, typ: QuickEditTyp) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setQuickEditPosition({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 250), // Popup nicht über Bildschirmrand
    });
    setQuickEdit({ vereinId, typ });
  };

  // Quick-Edit speichern
  const handleQuickEditSave = async (vereinId: string, daten: Partial<SaisonKunde>) => {
    // Optimistisches Update der lokalen Daten
    setLokaleVereine(prev => prev.map(v => {
      if (v.kunde.id !== vereinId) return v;
      return {
        ...v,
        kunde: {
          ...v.kunde,
          ...daten,
          // Merge nested objects korrekt
          dispoAnsprechpartner: daten.dispoAnsprechpartner
            ? { ...v.kunde.dispoAnsprechpartner, ...daten.dispoAnsprechpartner }
            : v.kunde.dispoAnsprechpartner,
          lieferadresse: daten.lieferadresse
            ? { ...v.kunde.lieferadresse, ...daten.lieferadresse }
            : v.kunde.lieferadresse,
        }
      };
    }));

    // In Datenbank speichern
    try {
      await saisonplanungService.updateKunde(vereinId, daten);
      console.log('✅ Vereinsdaten aktualisiert:', vereinId, daten);
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren:', error);
      // Bei Fehler: Daten zurücksetzen durch Refresh
      onRefresh?.();
      throw error;
    }
  };

  // Toggle Auswahl eines Vereins
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Alle (gefilterte) auswählen - nur Vereine OHNE existierendes Projekt
  const selectAll = () => {
    const ohneProject = gefilterteVereine
      .filter(v => !vereinProjekte.has(v.kunde.id))
      .map(v => v.kunde.id);
    setSelectedIds(new Set(ohneProject));
  };

  // Auswahl aufheben
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Multi-Select Modus starten
  const startSelectMode = async () => {
    // Lade Platzbauer-Daten für Rechnungsadresse
    try {
      const pb = await saisonplanungService.loadKunde(platzbauerId);
      setPlatzbauer(pb);
    } catch (error) {
      console.error('Fehler beim Laden des Platzbauers:', error);
    }
    setSelectMode(true);
    setSelectedIds(new Set());
    setCreationResult(null);
  };

  // Multi-Select Modus beenden
  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setCreationResult(null);
  };

  // Projekte für ausgewählte Vereine erstellen
  const erstelleProjekte = async () => {
    if (selectedIds.size === 0 || !platzbauer) return;

    setIsCreating(true);
    setCreationResult(null);

    const erfolge: string[] = [];
    const fehler: string[] = [];

    // Artikel TM-ZM-02 für Position
    const artikel = TENNISMEHL_ARTIKEL['TM-ZM-02'];

    for (const vereinId of selectedIds) {
      const vereinDaten = lokaleVereine.find(v => v.kunde.id === vereinId);
      if (!vereinDaten) {
        fehler.push(`Verein ${vereinId} nicht gefunden`);
        continue;
      }

      const verein = vereinDaten.kunde;

      try {
        // Prüfe ob bereits ein Projekt für diesen Verein existiert
        const existingProjekt = await projektService.getProjektFuerKunde(vereinId, saisonjahr);
        if (existingProjekt) {
          fehler.push(`${verein.name}: Projekt existiert bereits`);
          continue;
        }

        // Platzbauer-Adresse für Rechnung
        const platzbauerAdresse = platzbauer.rechnungsadresse || platzbauer.lieferadresse;
        const platzbauerStrasse = platzbauerAdresse?.strasse || '';
        const platzbauerPlzOrt = `${platzbauerAdresse?.plz || ''} ${platzbauerAdresse?.ort || ''}`.trim();

        // Verein-Lieferadresse
        const vereinLieferadresse = verein.lieferadresse || verein.rechnungsadresse;

        // Menge aus tonnenLetztesJahr
        const menge = verein.tonnenLetztesJahr || 0;

        // Projekt erstellen
        const neuesProjekt: NeuesProjekt = {
          projektName: `${verein.name} ${saisonjahr}`,
          kundeId: vereinId,
          kundennummer: verein.kundennummer,
          // WICHTIG: Kundenname etc. = Platzbauer (Debitor für Rechnung!)
          kundenname: platzbauer.name,
          kundenstrasse: platzbauerStrasse,
          kundenPlzOrt: platzbauerPlzOrt,
          kundenEmail: platzbauer.email,
          // Lieferadresse = Verein
          lieferadresse: vereinLieferadresse ? {
            strasse: vereinLieferadresse.strasse || '',
            plz: vereinLieferadresse.plz || '',
            ort: vereinLieferadresse.ort || '',
          } : undefined,
          saisonjahr,
          // Status direkt auf Auftragsbestätigung (Bestellt)
          status: 'auftragsbestaetigung',
          // Platzbauer-Flag und ID
          istPlatzbauerprojekt: true,
          platzbauerId: platzbauerId,
          // Bezugsweg
          bezugsweg: 'ueber_platzbauer',
          // Menge für Dispo
          angefragteMenge: menge,
          liefergewicht: menge,
          // Belieferungsart vom Verein übernehmen
          belieferungsart: verein.belieferungsart,
          // Dispo-Ansprechpartner vom Verein übernehmen
          dispoAnsprechpartner: verein.dispoAnsprechpartner,
          // Dispo-Status
          dispoStatus: 'offen',
          // Angebotsdaten mit Position (Preis leer lassen)
          angebotsDaten: JSON.stringify({
            positionen: menge > 0 ? [{
              id: crypto.randomUUID(),
              artikelnummer: artikel.artikelnummer,
              bezeichnung: artikel.bezeichnung,
              beschreibung: `Lieferung an: ${verein.name}`,
              menge: menge,
              einheit: 't',
              einzelpreis: 0, // Preis leer lassen, wird bei Rechnung eingetragen
              gesamtpreis: 0,
            }] : [],
          }),
        };

        // Projekt erstellen MIT skipPlatzbauerProjektZuordnung = true
        // Damit wird KEINE automatische Zuordnung zu PlatzbauerProjekt gemacht
        await projektService.createProjekt(neuesProjekt, {
          skipPlatzbauerProjektZuordnung: true,
        });

        erfolge.push(verein.name);
      } catch (error) {
        console.error(`Fehler beim Erstellen des Projekts für ${verein.name}:`, error);
        fehler.push(`${verein.name}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      }
    }

    setCreationResult({
      success: erfolge.length,
      failed: fehler.length,
      errors: fehler,
    });
    setIsCreating(false);

    // Bei Erfolg: Liste aktualisieren
    if (erfolge.length > 0) {
      onRefresh?.();
    }
  };

  if (vereine.length === 0) {
    return (
      <>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            Keine Vereine mit Bezugsweg &quot;Platzbauer&quot; zugeordnet.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Hier werden nur Vereine angezeigt, die über den Platzbauer bestellen (Sammelbestellung).
          </p>
          <button
            onClick={() => setShowSchnellerfassung(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Verein anlegen
          </button>
        </div>
        {showSchnellerfassung && (
          <VereinSchnellerfassung
            platzbauerId={platzbauerId}
            platzbauerName={platzbauerName}
            onClose={() => setShowSchnellerfassung(false)}
            onSuccess={() => onRefresh?.()}
          />
        )}
      </>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {/* Info-Hinweis */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <span className="text-blue-700 dark:text-blue-300">
          Vereine mit Bezugsweg &quot;Platzbauer&quot; – bestellen über {platzbauerName} (Sammelbestellung).
          Vereine mit &quot;Direkt Instandsetzung&quot; finden Sie im Tab <strong>Instandsetzung</strong>.
        </span>
      </div>

      {/* Ergebnis-Meldung */}
      {creationResult && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${
          creationResult.failed === 0
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          {creationResult.failed === 0 ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`font-medium ${
              creationResult.failed === 0 ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
            }`}>
              {creationResult.success} Projekt{creationResult.success !== 1 ? 'e' : ''} erfolgreich erstellt
              {creationResult.failed > 0 && `, ${creationResult.failed} fehlgeschlagen`}
            </p>
            {creationResult.errors.length > 0 && (
              <ul className="mt-2 text-sm text-amber-600 dark:text-amber-400 space-y-1">
                {creationResult.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => {
              setCreationResult(null);
              cancelSelectMode();
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter-Leiste */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Suche */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Verein suchen..."
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {!selectMode ? (
            <>
              {/* Projekte anlegen Button */}
              <button
                onClick={startSelectMode}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" />
                Projekte anlegen
              </button>
              {/* Verein anlegen Button */}
              <button
                onClick={() => setShowSchnellerfassung(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Verein anlegen
              </button>
            </>
          ) : (
            <>
              {/* Select-Mode Buttons */}
              <button
                onClick={selectAll}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-card hover:bg-gray-200 dark:hover:bg-dark-border text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                <CheckSquare className="w-4 h-4" />
                Alle
              </button>
              <button
                onClick={deselectAll}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-card hover:bg-gray-200 dark:hover:bg-dark-border text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                <Square className="w-4 h-4" />
                Keine
              </button>
              <button
                onClick={cancelSelectMode}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-card hover:bg-gray-200 dark:hover:bg-dark-border text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                <X className="w-4 h-4" />
                Abbrechen
              </button>
              <button
                onClick={erstelleProjekte}
                disabled={selectedIds.size === 0 || isCreating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Erstelle...
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    {selectedIds.size} Projekt{selectedIds.size !== 1 ? 'e' : ''} anlegen
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Anzahl */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {gefilterteVereine.length} {gefilterteVereine.length === 1 ? 'Verein' : 'Vereine'}
        {suche && ` gefunden`}
        {(() => {
          const mitProjekt = gefilterteVereine.filter(v => vereinProjekte.has(v.kunde.id)).length;
          if (mitProjekt > 0 && !selectMode) {
            return (
              <span className="ml-2 text-green-600 dark:text-green-400">
                • {mitProjekt} mit Projekt
              </span>
            );
          }
          return null;
        })()}
        {selectMode && selectedIds.size > 0 && (
          <span className="ml-2 text-purple-600 dark:text-purple-400 font-medium">
            • {selectedIds.size} ausgewählt
          </span>
        )}
      </p>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-dark-border">
              {selectMode && (
                <th className="pb-3 pr-2 w-10"></th>
              )}
              <th className="pb-3 pr-4">Verein</th>
              <th className="pb-3 pr-4">Ort</th>
              <th className="pb-3 pr-4">Kontakt</th>
              <th className="pb-3 pr-4 text-right">Menge (Vorjahr)</th>
              <th className="pb-3 pr-4 text-center">Projekt</th>
              <th className="pb-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {gefilterteVereine.map(({ kunde }) => {
              const adresse = kunde.lieferadresse || kunde.rechnungsadresse;
              const isSelected = selectedIds.has(kunde.id);
              const existingProjekt = vereinProjekte.get(kunde.id);
              const hatProjekt = !!existingProjekt;

              return (
                <tr
                  key={kunde.id}
                  className={`group hover:bg-gray-50 dark:hover:bg-dark-bg cursor-pointer ${
                    isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                  } ${selectMode && hatProjekt ? 'opacity-60' : ''}`}
                  onClick={() => {
                    if (selectMode) {
                      // Vereine mit existierendem Projekt können nicht ausgewählt werden
                      if (!hatProjekt) {
                        toggleSelection(kunde.id);
                      }
                    } else {
                      navigate(`/saisonplanung?kunde=${kunde.id}`);
                    }
                  }}
                >
                  {selectMode && (
                    <td className="py-3 pr-2">
                      <div className="flex items-center justify-center">
                        {hatProjekt ? (
                          <div title="Projekt bereits vorhanden">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          </div>
                        ) : isSelected ? (
                          <CheckSquare className="w-5 h-5 text-purple-500" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-3 pr-4">
                    <div className={`font-medium ${
                      isSelected
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-gray-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400'
                    }`}>
                      {kunde.name}
                    </div>
                    {kunde.kundennummer && (
                      <div className="text-xs text-gray-400">
                        #{kunde.kundennummer}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {adresse?.plz && adresse?.ort ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <div>{adresse.plz} {adresse.ort}</div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => openQuickEdit(e, kunde.id, 'adresse')}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 px-1.5 py-0.5 rounded transition-colors"
                        title="Adresse hinzufügen"
                      >
                        <Plus className="w-3 h-3" />
                        <MapPin className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col gap-1 text-sm">
                      {kunde.dispoAnsprechpartner?.name ? (
                        <>
                          <span className="text-gray-900 dark:text-white flex items-center gap-1.5">
                            <User className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            {kunde.dispoAnsprechpartner.name}
                          </span>
                          {kunde.dispoAnsprechpartner.telefon ? (
                            <a
                              href={`tel:${kunde.dispoAnsprechpartner.telefon}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {kunde.dispoAnsprechpartner.telefon}
                            </a>
                          ) : (
                            <button
                              onClick={(e) => openQuickEdit(e, kunde.id, 'kontakt')}
                              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 px-1.5 py-0.5 rounded transition-colors"
                              title="Telefon hinzufügen"
                            >
                              <Plus className="w-3 h-3" />
                              <Phone className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      ) : kunde.email ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate max-w-[180px]">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            {kunde.email}
                          </span>
                          <button
                            onClick={(e) => openQuickEdit(e, kunde.id, 'kontakt')}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 px-1.5 py-0.5 rounded transition-colors w-fit"
                            title="Kontaktperson hinzufügen"
                          >
                            <Plus className="w-3 h-3" />
                            <User className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={(e) => openQuickEdit(e, kunde.id, 'kontakt')}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 px-1.5 py-0.5 rounded transition-colors"
                            title="Kontakt hinzufügen"
                          >
                            <Plus className="w-3 h-3" />
                            <User className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => openQuickEdit(e, kunde.id, 'email')}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-1.5 py-0.5 rounded transition-colors"
                            title="E-Mail hinzufügen"
                          >
                            <Plus className="w-3 h-3" />
                            <Mail className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {kunde.tonnenLetztesJahr ? (
                      <span className="text-gray-900 dark:text-white font-medium">
                        {kunde.tonnenLetztesJahr} t
                      </span>
                    ) : (
                      <button
                        onClick={(e) => openQuickEdit(e, kunde.id, 'menge')}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 px-1.5 py-0.5 rounded transition-colors"
                        title="Menge eintragen"
                      >
                        <Plus className="w-3 h-3" />
                        <Scale className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-center">
                    {isLoadingProjekte ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin mx-auto" />
                    ) : hatProjekt ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const projektId = (existingProjekt as any).$id || existingProjekt?.id;
                          navigate(`/projektabwicklung/${projektId}`);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        title="Zum Projekt wechseln"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Öffnen</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    {!selectMode && (
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </div>

    {/* Schnellerfassung Modal */}
    {showSchnellerfassung && (
      <VereinSchnellerfassung
        platzbauerId={platzbauerId}
        platzbauerName={platzbauerName}
        onClose={() => setShowSchnellerfassung(false)}
        onSuccess={() => onRefresh?.()}
      />
    )}

    {/* Quick-Edit Popup */}
    {quickEdit && (() => {
      const vereinDaten = lokaleVereine.find(v => v.kunde.id === quickEdit.vereinId);
      if (!vereinDaten) return null;
      return (
        <QuickEditPopup
          typ={quickEdit.typ}
          vereinId={quickEdit.vereinId}
          kunde={vereinDaten.kunde}
          onSave={handleQuickEditSave}
          onClose={() => setQuickEdit(null)}
          position={quickEditPosition}
        />
      );
    })()}
    </>
  );
};

export default PlatzbauerlVereine;
