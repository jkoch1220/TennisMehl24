import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { SaisonKundeMitDaten, SaisonKunde } from '../../types/saisonplanung';
import { useNavigate } from 'react-router-dom';
import VereinSchnellerfassung from './VereinSchnellerfassung';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { NeuesProjekt, Projekt } from '../../types/projekt';
import { TENNISMEHL_ARTIKEL } from '../../constants/artikelPreise';

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
  const gefilterteVereine = vereine.filter(v => {
    const kunde = v.kunde;
    if (!suche.trim()) return true;
    const sucheLower = suche.toLowerCase();
    return (
      kunde.name.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.ort?.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.plz?.includes(suche)
    );
  });

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
      const vereinDaten = vereine.find(v => v.kunde.id === vereinId);
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
                    {adresse ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <div>{adresse.plz} {adresse.ort}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
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
                          {kunde.dispoAnsprechpartner.telefon && (
                            <a
                              href={`tel:${kunde.dispoAnsprechpartner.telefon}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {kunde.dispoAnsprechpartner.telefon}
                            </a>
                          )}
                        </>
                      ) : kunde.email ? (
                        <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate max-w-[180px]">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          {kunde.email}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Kein Kontakt</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {kunde.tonnenLetztesJahr ? `${kunde.tonnenLetztesJahr} t` : '-'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center">
                    {isLoadingProjekte ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin mx-auto" />
                    ) : hatProjekt ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const projektId = (existingProjekt as any).$id || existingProjekt?.id;
                          navigate(`/projekte?projekt=${projektId}`);
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
    </>
  );
};

export default PlatzbauerlVereine;
