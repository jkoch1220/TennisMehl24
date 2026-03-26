/**
 * AlleLieferscheineModal.tsx
 *
 * Modal zur Vorschau und Bearbeitung aller Lieferscheine einer Tour.
 * Ermöglicht das Bearbeiten von Positionen, Mengen und anderen Details
 * vor dem kombinierten PDF-Druck.
 *
 * Inkl. Warning-System für Sonderpositionen (0/3 Material, Sackware, BigBag, etc.)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Printer,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
  CheckSquare,
  Square,
  Package,
  MapPin,
  User,
  Phone,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Tour } from '../../types/tour';
import { Projekt } from '../../types/projekt';
import { LieferscheinDaten, LieferscheinPosition, Position } from '../../types/projektabwicklung';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import { getStammdatenOderDefault } from '../../services/stammdatenService';
import { projektService } from '../../services/projektService';
import {
  erkenneSonderPositionen,
  PositionWarning,
  LieferscheinWarnings,
  hatKritischeWarnings,
  hatWarnings,
  zaehleWarnings,
} from '../../utils/lieferscheinWarnings';

// Typen für bearbeitbare Lieferschein-Daten
interface LieferscheinVorschauDaten {
  stopIndex: number;
  projektId: string;
  ausgewaehlt: boolean;
  expanded: boolean;

  // Editierbare Felder
  lieferscheinnummer: string;
  lieferdatum: string;
  kundenname: string;
  kundennummer?: string;
  strasse: string;
  plzOrt: string;
  ansprechpartnerName: string;
  ansprechpartnerTelefon: string;
  positionen: LieferscheinPosition[];
  bemerkung: string;
  tonnen: number;
  paletten?: number;

  // Zusätzliche Infos (aus Projekt)
  projektnummer?: string;
  bestellnummer?: string;
}

interface AlleLieferscheineModalProps {
  isOpen: boolean;
  onClose: () => void;
  tour: Tour;
  projekte: Projekt[];
}

const AlleLieferscheineModal = ({
  isOpen,
  onClose,
  tour,
  projekte,
}: AlleLieferscheineModalProps) => {
  const [lieferscheine, setLieferscheine] = useState<Map<string, LieferscheinVorschauDaten>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // === WARNING SYSTEM STATE ===
  const [warnings, setWarnings] = useState<Map<string, PositionWarning[]>>(new Map());
  const [sonderpositionenBestaetigt, setSonderpositionenBestaetigt] = useState(false);
  const [showBestaetigungsDialog, setShowBestaetigungsDialog] = useState(false);

  // Initialisiere Lieferschein-Daten aus Tour-Stops
  const initialisiereLieferscheine = useCallback(async () => {
    if (!tour.stops.length) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Lade alle Projekt-Details parallel
      const projektPromises = tour.stops.map(async (stop) => {
        const projekt = projekte.find(p => ((p as any).$id || p.id) === stop.projektId);
        if (!projekt) {
          // Versuche das Projekt nachzuladen
          try {
            return await projektService.getProjekt(stop.projektId);
          } catch {
            return null;
          }
        }
        return projekt;
      });

      const geladeneProjekte = await Promise.all(projektPromises);

      // Erstelle Map mit allen Lieferschein-Daten
      const neueMap = new Map<string, LieferscheinVorschauDaten>();

      tour.stops.forEach((stop, index) => {
        const projekt = geladeneProjekte[index];
        const key = `${stop.projektId}-${index}`;

        // Generiere Lieferscheinnummer aus AB-Nummer oder Auto
        const abNummer = projekt?.auftragsbestaetigungsnummer || projekt?.angebotsnummer || '';
        const lieferscheinnummer = projekt?.lieferscheinnummer
          ? projekt.lieferscheinnummer
          : abNummer
            ? `LS-${abNummer}`
            : `LS-${tour.datum?.replace(/-/g, '') || 'AUTO'}-${(index + 1).toString().padStart(2, '0')}`;

        // Positionen aus auftragsbestaetigungsDaten parsen (falls vorhanden)
        let positionen: LieferscheinPosition[] = [];
        if (projekt?.auftragsbestaetigungsDaten) {
          try {
            const abDaten = JSON.parse(projekt.auftragsbestaetigungsDaten);
            if (abDaten.positionen && Array.isArray(abDaten.positionen)) {
              positionen = abDaten.positionen.map((pos: Position, posIdx: number) => ({
                id: pos.id || `pos-${posIdx}`,
                artikelnummer: pos.artikelnummer,
                artikel: pos.bezeichnung,
                beschreibung: pos.beschreibung,
                menge: pos.menge,
                einheit: pos.einheit,
                istUniversalArtikel: (pos as any).istUniversalArtikel,
              }));
            }
          } catch {
            // JSON-Parse-Fehler ignorieren
          }
        }

        // Fallback: Wenn keine Positionen, erstelle eine Standard-Position
        if (positionen.length === 0) {
          positionen.push({
            id: 'pos-1',
            artikel: 'Ziegelmehl',
            menge: stop.tonnen,
            einheit: 't',
          });
        }

        neueMap.set(key, {
          stopIndex: index,
          projektId: stop.projektId,
          ausgewaehlt: true, // Standardmäßig alle ausgewählt
          expanded: false,
          lieferscheinnummer,
          lieferdatum: tour.datum || new Date().toISOString().split('T')[0],
          kundenname: stop.kundenname,
          kundennummer: stop.kundennummer,
          strasse: stop.adresse.strasse,
          plzOrt: `${stop.adresse.plz} ${stop.adresse.ort}`,
          ansprechpartnerName: stop.kontakt?.name || projekt?.dispoAnsprechpartner?.name || '',
          ansprechpartnerTelefon: stop.kontakt?.telefon || projekt?.dispoAnsprechpartner?.telefon || '',
          positionen,
          bemerkung: projekt?.notizen || '',
          tonnen: stop.tonnen,
          paletten: stop.paletten,
          projektnummer: projekt?.auftragsbestaetigungsnummer || projekt?.angebotsnummer,
          bestellnummer: undefined, // Keine kundenBestellnummer im Projekt-Typ
        });
      });

      setLieferscheine(neueMap);
    } catch (err) {
      console.error('Fehler beim Laden der Lieferschein-Daten:', err);
      setError('Fehler beim Laden der Projektdaten');
    } finally {
      setIsLoading(false);
    }
  }, [tour, projekte]);

  useEffect(() => {
    if (isOpen) {
      initialisiereLieferscheine();
      // Reset Bestätigung beim Öffnen
      setSonderpositionenBestaetigt(false);
    }
  }, [isOpen, initialisiereLieferscheine]);

  // === WARNING DETECTION ===
  // Berechne Warnings für alle Lieferscheine bei Änderungen
  useEffect(() => {
    const neueWarnings = new Map<string, PositionWarning[]>();

    lieferscheine.forEach((ls, key) => {
      const posWarnings = erkenneSonderPositionen(ls.positionen);
      if (posWarnings.length > 0) {
        neueWarnings.set(key, posWarnings);
      }
    });

    setWarnings(neueWarnings);

    // Reset Bestätigung wenn Positionen geändert wurden
    setSonderpositionenBestaetigt(false);
  }, [lieferscheine]);

  // === AGGREGIERTE WARNING STATS ===
  const warningStats = useMemo(() => {
    let gesamtKritisch = 0;
    let gesamtWichtig = 0;
    const betroffeneLieferscheine: LieferscheinWarnings[] = [];

    warnings.forEach((posWarnings, key) => {
      const ls = lieferscheine.get(key);
      if (!ls) return;

      const { kritisch, wichtig } = zaehleWarnings(posWarnings);
      gesamtKritisch += kritisch;
      gesamtWichtig += wichtig;

      betroffeneLieferscheine.push({
        lieferscheinKey: key,
        stopIndex: ls.stopIndex,
        kundenname: ls.kundenname,
        warnings: posWarnings,
        hatKritisch: kritisch > 0,
        hatWichtig: wichtig > 0,
      });
    });

    return {
      gesamtKritisch,
      gesamtWichtig,
      gesamt: gesamtKritisch + gesamtWichtig,
      betroffeneLieferscheine,
      hatKritische: gesamtKritisch > 0,
    };
  }, [warnings, lieferscheine]);

  // Anzahl der ausgewählten Lieferscheine
  const anzahlAusgewaehlt = useMemo(() => {
    let count = 0;
    lieferscheine.forEach((ls) => {
      if (ls.ausgewaehlt) count++;
    });
    return count;
  }, [lieferscheine]);

  // Alle auswählen / abwählen
  const toggleAlleAuswaehlen = () => {
    const alleAusgewaehlt = anzahlAusgewaehlt === lieferscheine.size;
    const neueMap = new Map(lieferscheine);
    neueMap.forEach((ls, key) => {
      neueMap.set(key, { ...ls, ausgewaehlt: !alleAusgewaehlt });
    });
    setLieferscheine(neueMap);
  };

  // Einzelnen Lieferschein an/abwählen
  const toggleAuswahl = (key: string) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls) {
      neueMap.set(key, { ...ls, ausgewaehlt: !ls.ausgewaehlt });
      setLieferscheine(neueMap);
    }
  };

  // Lieferschein auf-/zuklappen
  const toggleExpanded = (key: string) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls) {
      neueMap.set(key, { ...ls, expanded: !ls.expanded });
      setLieferscheine(neueMap);
    }
  };

  // Feld aktualisieren
  const updateFeld = (key: string, feld: keyof LieferscheinVorschauDaten, wert: any) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls) {
      neueMap.set(key, { ...ls, [feld]: wert });
      setLieferscheine(neueMap);
    }
  };

  // Position aktualisieren
  const updatePosition = (key: string, posIndex: number, feld: keyof LieferscheinPosition, wert: any) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls) {
      const neuePositionen = [...ls.positionen];
      neuePositionen[posIndex] = { ...neuePositionen[posIndex], [feld]: wert };
      neueMap.set(key, { ...ls, positionen: neuePositionen });
      setLieferscheine(neueMap);
    }
  };

  // Position hinzufügen
  const addPosition = (key: string) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls) {
      const neuePosition: LieferscheinPosition = {
        id: `pos-${Date.now()}`,
        artikel: '',
        menge: 0,
        einheit: 't',
      };
      neueMap.set(key, { ...ls, positionen: [...ls.positionen, neuePosition] });
      setLieferscheine(neueMap);
    }
  };

  // Position entfernen
  const removePosition = (key: string, posIndex: number) => {
    const neueMap = new Map(lieferscheine);
    const ls = neueMap.get(key);
    if (ls && ls.positionen.length > 1) {
      const neuePositionen = ls.positionen.filter((_, i) => i !== posIndex);
      neueMap.set(key, { ...ls, positionen: neuePositionen });
      setLieferscheine(neueMap);
    }
  };

  // Hilfsfunktion: Erstelle LieferscheinDaten aus Vorschau-Daten
  const erstelleLieferscheinDaten = (
    ls: LieferscheinVorschauDaten,
    stammdaten: Awaited<ReturnType<typeof getStammdatenOderDefault>>
  ): LieferscheinDaten => ({
    // Firmendaten aus Stammdaten
    firmenname: stammdaten.firmenname,
    firmenstrasse: stammdaten.firmenstrasse,
    firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
    firmenTelefon: stammdaten.firmenTelefon,
    firmenEmail: stammdaten.firmenEmail,
    firmenWebsite: stammdaten.firmenWebsite,

    // Lieferschein-Infos
    lieferscheinnummer: ls.lieferscheinnummer,
    lieferdatum: ls.lieferdatum,
    bestellnummer: ls.bestellnummer,
    kundennummer: ls.kundennummer,
    projektnummer: ls.projektnummer,

    // Adresse (Lieferadresse = Hauptadresse)
    kundenname: ls.kundenname,
    kundenstrasse: ls.strasse,
    kundenPlzOrt: ls.plzOrt,

    // Ansprechpartner
    dispoAnsprechpartner: ls.ansprechpartnerName ? {
      name: ls.ansprechpartnerName,
      telefon: ls.ansprechpartnerTelefon,
    } : undefined,

    // Positionen
    positionen: ls.positionen,

    // Bemerkung
    bemerkung: ls.bemerkung || undefined,

    // Standard-Einstellungen
    unterschriftenFuerEmpfangsbestaetigung: true,
    druckeAnsprechpartner: true,
  });

  // === DRUCK HANDLER ===
  const handleDruckClick = () => {
    // Bei kritischen Warnings: Bestätigungsdialog zeigen
    if (warningStats.hatKritische && !sonderpositionenBestaetigt) {
      setShowBestaetigungsDialog(true);
      return;
    }

    // Sonst direkt drucken
    druckeLieferscheine();
  };

  // PDF generieren und öffnen
  const druckeLieferscheine = async () => {
    const ausgewaehlteLieferscheine = Array.from(lieferscheine.values())
      .filter(ls => ls.ausgewaehlt)
      .sort((a, b) => a.stopIndex - b.stopIndex);

    if (ausgewaehlteLieferscheine.length === 0) {
      setError('Bitte wählen Sie mindestens einen Lieferschein aus');
      return;
    }

    setIsPrinting(true);
    setError(null);
    setShowBestaetigungsDialog(false);

    try {
      // Lade Stammdaten einmal
      const stammdaten = await getStammdatenOderDefault();

      // Generiere alle PDFs parallel
      const pdfPromises = ausgewaehlteLieferscheine.map(ls =>
        generiereLieferscheinPDF(erstelleLieferscheinDaten(ls, stammdaten), stammdaten)
      );

      const jsPdfs = await Promise.all(pdfPromises);

      // Konvertiere jsPDF-Dokumente zu ArrayBuffer für pdf-lib
      const pdfBuffers = jsPdfs.map(pdf => pdf.output('arraybuffer'));

      // Erstelle kombiniertes PDF mit pdf-lib
      const kombiniertesPDF = await PDFDocument.create();

      for (const pdfBuffer of pdfBuffers) {
        // Lade einzelnes PDF
        const einzelnesPDF = await PDFDocument.load(pdfBuffer);

        // Kopiere alle Seiten
        const seiten = await kombiniertesPDF.copyPages(einzelnesPDF, einzelnesPDF.getPageIndices());

        // Füge Seiten zum kombinierten Dokument hinzu
        seiten.forEach(seite => kombiniertesPDF.addPage(seite));
      }

      // Speichere kombiniertes PDF
      const kombiniertesPDFBytes = await kombiniertesPDF.save();

      // Öffne in einem neuen Tab
      const blob = new Blob([kombiniertesPDFBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      // Cleanup nach 1 Minute
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      // Schließe Modal nach erfolgreichem Druck
      onClose();
    } catch (err) {
      console.error('Fehler beim Generieren der PDFs:', err);
      setError('Fehler beim Generieren der Lieferscheine');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full transform transition-all max-h-[90vh] overflow-hidden flex flex-col">

          {/* Header - Gradient */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                  <Printer className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Lieferscheine drucken
                  </h2>
                  <p className="text-orange-100 text-sm">
                    {tour.name} • {tour.datum ? new Date(tour.datum).toLocaleDateString('de-DE') : 'Ohne Datum'}
                    {' • '}{tour.stops.length} Stopp{tour.stops.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isPrinting}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Alle auswählen Toggle */}
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={toggleAlleAuswaehlen}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white text-sm"
              >
                {anzahlAusgewaehlt === lieferscheine.size ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {anzahlAusgewaehlt === lieferscheine.size ? 'Alle abwählen' : 'Alle auswählen'}
              </button>
              <span className="text-white/80 text-sm">
                {anzahlAusgewaehlt} von {lieferscheine.size} ausgewählt
              </span>
            </div>
          </div>

          {/* === GLOBALER WARNING HEADER === */}
          {warningStats.gesamt > 0 && (
            <div className={`px-6 py-3 border-b flex-shrink-0 ${
              warningStats.hatKritische
                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-start gap-3">
                {/* Pulsierender Punkt bei kritischen Warnings */}
                <div className="relative flex-shrink-0 mt-0.5">
                  {warningStats.hatKritische ? (
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  )}
                  {warningStats.hatKritische && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${
                    warningStats.hatKritische
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    ⚠️ {warningStats.betroffeneLieferscheine.length} Lieferschein{warningStats.betroffeneLieferscheine.length !== 1 ? 'e' : ''} mit Sonderpositionen
                  </p>

                  {/* Betroffene Stopps */}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {warningStats.betroffeneLieferscheine.map(lsw => (
                      <span
                        key={lsw.lieferscheinKey}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                          lsw.hatKritisch
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-white/50 dark:bg-black/20 rounded-full text-[10px] font-bold">
                          {lsw.stopIndex + 1}
                        </span>
                        {lsw.kundenname.length > 20 ? lsw.kundenname.substring(0, 20) + '...' : lsw.kundenname}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content - scrollbar */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  Lade Lieferschein-Daten...
                </p>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            ) : lieferscheine.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mb-3 opacity-50" />
                <p>Keine Stopps in dieser Tour</p>
              </div>
            ) : (
              Array.from(lieferscheine.entries()).map(([key, ls]) => (
                <LieferscheinKarte
                  key={key}
                  lieferschein={ls}
                  warnings={warnings.get(key) || []}
                  onToggleAuswahl={() => toggleAuswahl(key)}
                  onToggleExpanded={() => toggleExpanded(key)}
                  onUpdateFeld={(feld, wert) => updateFeld(key, feld, wert)}
                  onUpdatePosition={(posIndex, feld, wert) => updatePosition(key, posIndex, feld, wert)}
                  onAddPosition={() => addPosition(key)}
                  onRemovePosition={(posIndex) => removePosition(key, posIndex)}
                />
              ))
            )}
          </div>

          {/* Footer - Actions */}
          <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800/50 flex-shrink-0">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Drucken Button */}
              <button
                onClick={handleDruckClick}
                disabled={isPrinting || anzahlAusgewaehlt === 0}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  warningStats.hatKritische && !sonderpositionenBestaetigt
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : warningStats.gesamt > 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                {isPrinting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : warningStats.hatKritische && !sonderpositionenBestaetigt ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Printer className="h-5 w-5" />
                )}
                <span>
                  {isPrinting
                    ? 'Generiere PDFs...'
                    : warningStats.hatKritische && !sonderpositionenBestaetigt
                      ? `⚠️ Sonderpositionen beachten!`
                      : `${anzahlAusgewaehlt} Lieferschein${anzahlAusgewaehlt !== 1 ? 'e' : ''} drucken`}
                </span>
              </button>

              {/* Abbrechen */}
              <button
                onClick={onClose}
                disabled={isPrinting}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* === BESTÄTIGUNGS-DIALOG === */}
      {showBestaetigungsDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Dialog Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowBestaetigungsDialog(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-800 dark:text-red-200">
                    Sonderpositionen bestätigen
                  </h3>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Bitte alle Hinweise zur Kenntnis nehmen
                  </p>
                </div>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="p-6 max-h-[50vh] overflow-y-auto">
              <div className="space-y-4">
                {warningStats.betroffeneLieferscheine
                  .filter(lsw => lsw.hatKritisch)
                  .map(lsw => (
                    <div
                      key={lsw.lieferscheinKey}
                      className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-6 h-6 flex items-center justify-center bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full text-sm font-bold">
                          {lsw.stopIndex + 1}
                        </span>
                        <span className="font-semibold text-red-800 dark:text-red-200">
                          {lsw.kundenname}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {lsw.warnings
                          .filter(w => w.severity === 'critical')
                          .map((warning, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-sm"
                            >
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium text-red-700 dark:text-red-300">
                                  {warning.artikelnummer}
                                </span>
                                <span className="text-red-600 dark:text-red-400 mx-1">•</span>
                                <span className="text-red-600 dark:text-red-400">
                                  {warning.menge} {warning.einheit}
                                </span>
                                <p className="text-red-800 dark:text-red-200 mt-0.5">
                                  {warning.message}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800/50">
              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer mb-4 p-3 bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <input
                  type="checkbox"
                  checked={sonderpositionenBestaetigt}
                  onChange={(e) => setSonderpositionenBestaetigt(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 dark:border-slate-500 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Ich habe alle Sonderpositionen zur Kenntnis genommen und stelle sicher, dass die entsprechenden Materialien korrekt verladen werden.
                </span>
              </label>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBestaetigungsDialog(false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={druckeLieferscheine}
                  disabled={!sonderpositionenBestaetigt}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 font-semibold rounded-lg transition-all ${
                    sonderpositionenBestaetigt
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-gray-200 dark:bg-slate-600 text-gray-400 dark:text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {sonderpositionenBestaetigt ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Printer className="h-5 w-5" />
                  )}
                  Lieferscheine drucken
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Einzelne Lieferschein-Karte
interface LieferscheinKarteProps {
  lieferschein: LieferscheinVorschauDaten;
  warnings: PositionWarning[];
  onToggleAuswahl: () => void;
  onToggleExpanded: () => void;
  onUpdateFeld: (feld: keyof LieferscheinVorschauDaten, wert: any) => void;
  onUpdatePosition: (posIndex: number, feld: keyof LieferscheinPosition, wert: any) => void;
  onAddPosition: () => void;
  onRemovePosition: (posIndex: number) => void;
}

const LieferscheinKarte = ({
  lieferschein,
  warnings,
  onToggleAuswahl,
  onToggleExpanded,
  onUpdateFeld,
  onUpdatePosition,
  onAddPosition,
  onRemovePosition,
}: LieferscheinKarteProps) => {
  const ls = lieferschein;

  // Gruppiere Warnings nach Position
  const warningsByPositionId = useMemo(() => {
    const map = new Map<string, PositionWarning>();
    for (const w of warnings) {
      map.set(w.positionId, w);
    }
    return map;
  }, [warnings]);

  const hatKritisch = hatKritischeWarnings(warnings);
  const hatWarnungen = hatWarnings(warnings);

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        ls.ausgewaehlt
          ? hatKritisch
            ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10'
            : hatWarnungen
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10'
              : 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10'
          : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60'
      }`}
    >
      {/* Karten-Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
        onClick={onToggleExpanded}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleAuswahl();
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
        >
          {ls.ausgewaehlt ? (
            <CheckSquare className="w-5 h-5 text-orange-500" />
          ) : (
            <Square className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {/* Stop-Nummer mit Warning-Indicator */}
        <div className="relative">
          <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
            hatKritisch
              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
              : hatWarnungen
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                : 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
          }`}>
            {ls.stopIndex + 1}
          </span>
          {hatWarnungen && (
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
              hatKritisch ? 'bg-red-500' : 'bg-amber-500'
            } ${hatKritisch ? 'animate-pulse' : ''}`} />
          )}
        </div>

        {/* Kundenname & Adresse */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {ls.kundenname}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {ls.strasse}, {ls.plzOrt}
          </p>
        </div>

        {/* Warning Badge im Header */}
        {hatWarnungen && (
          <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
            hatKritisch
              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
              : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
          }`}>
            {hatKritisch ? (
              <AlertTriangle className="w-3 h-3" />
            ) : (
              <AlertCircle className="w-3 h-3" />
            )}
            {warnings.length}
          </span>
        )}

        {/* Tonnen & Paletten */}
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4" />
            {ls.tonnen}t
          </span>
          {ls.paletten && (
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4" />
              {ls.paletten} Pal.
            </span>
          )}
        </div>

        {/* Expand Toggle */}
        {ls.expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Expandierter Bereich */}
      {ls.expanded && (
        <div className="border-t border-gray-200 dark:border-slate-700 p-4 space-y-4 bg-white dark:bg-slate-800">

          {/* === WARNING BANNER PRO KARTE === */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((warning, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    warning.severity === 'critical'
                      ? 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800'
                      : 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {warning.severity === 'critical' ? (
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                        warning.severity === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                      }`}>
                        {warning.artikelnummer}
                      </span>
                      <span className={`text-sm ${
                        warning.severity === 'critical'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {warning.menge} {warning.einheit}
                      </span>
                    </div>
                    <p className={`text-sm font-medium mt-1 ${
                      warning.severity === 'critical'
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}>
                      {warning.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lieferschein-Infos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Lieferscheinnummer */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Lieferschein-Nr.
              </label>
              <input
                type="text"
                value={ls.lieferscheinnummer}
                onChange={(e) => onUpdateFeld('lieferscheinnummer', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Lieferdatum */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                Lieferdatum
              </label>
              <input
                type="date"
                value={ls.lieferdatum}
                onChange={(e) => onUpdateFeld('lieferdatum', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Kundennummer */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Kundennummer
              </label>
              <input
                type="text"
                value={ls.kundennummer || ''}
                onChange={(e) => onUpdateFeld('kundennummer', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="-"
              />
            </div>
          </div>

          {/* Adresse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <MapPin className="w-3 h-3 inline mr-1" />
                Straße
              </label>
              <input
                type="text"
                value={ls.strasse}
                onChange={(e) => onUpdateFeld('strasse', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                PLZ & Ort
              </label>
              <input
                type="text"
                value={ls.plzOrt}
                onChange={(e) => onUpdateFeld('plzOrt', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Ansprechpartner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <User className="w-3 h-3 inline mr-1" />
                Ansprechpartner
              </label>
              <input
                type="text"
                value={ls.ansprechpartnerName}
                onChange={(e) => onUpdateFeld('ansprechpartnerName', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Phone className="w-3 h-3 inline mr-1" />
                Telefon
              </label>
              <input
                type="tel"
                value={ls.ansprechpartnerTelefon}
                onChange={(e) => onUpdateFeld('ansprechpartnerTelefon', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Telefonnummer"
              />
            </div>
          </div>

          {/* Positionen */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Positionen
              </label>
              <button
                onClick={onAddPosition}
                className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400"
              >
                <Plus className="w-3 h-3" />
                Position hinzufügen
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-slate-700">
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      Pos
                    </th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      Art.Nr.
                    </th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[150px]">
                      Artikel
                    </th>
                    <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-20">
                      Menge
                    </th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                      Einheit
                    </th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {ls.positionen.map((pos, idx) => {
                    const posWarning = warningsByPositionId.get(pos.id);
                    return (
                      <tr
                        key={pos.id}
                        className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 ${
                          posWarning
                            ? posWarning.severity === 'critical'
                              ? 'border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20'
                              : 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                            : ''
                        }`}
                      >
                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            {posWarning && (
                              posWarning.severity === 'critical' ? (
                                <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              )
                            )}
                            <input
                              type="text"
                              value={pos.artikelnummer || ''}
                              onChange={(e) => onUpdatePosition(idx, 'artikelnummer', e.target.value)}
                              className={`w-20 px-2 py-1 text-xs border rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white ${
                                posWarning
                                  ? posWarning.severity === 'critical'
                                    ? 'border-red-300 dark:border-red-700'
                                    : 'border-amber-300 dark:border-amber-700'
                                  : 'border-gray-300 dark:border-slate-600'
                              }`}
                              placeholder="-"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={pos.artikel}
                            onChange={(e) => onUpdatePosition(idx, 'artikel', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            placeholder="Artikelbezeichnung"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.5"
                            value={pos.menge}
                            onChange={(e) => onUpdatePosition(idx, 'menge', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-xs text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={pos.einheit}
                            onChange={(e) => onUpdatePosition(idx, 'einheit', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                            <option value="t">t</option>
                            <option value="kg">kg</option>
                            <option value="Stk">Stk</option>
                            <option value="Pal">Pal</option>
                            <option value="m²">m²</option>
                            <option value="m">m</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          {ls.positionen.length > 1 && (
                            <button
                              onClick={() => onRemovePosition(idx)}
                              className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bemerkungen */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Bemerkungen
            </label>
            <textarea
              value={ls.bemerkung}
              onChange={(e) => onUpdateFeld('bemerkung', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              placeholder="Optionale Bemerkungen..."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AlleLieferscheineModal;
