import { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Calendar,
  MapPin,
  Package,
  Sparkles,
  FileText,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  Clock,
  Route,
  Phone,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Projekt, Belieferungsart } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Fahrzeug } from '../../types/dispo';
import {
  Tour,
  TourStop,
  Fahrer,
  TourenStatistik,
  ProjektFuerOptimierung,
  ClaudeOptimierungResponse,
  FAHRZEUG_KAPAZITAETEN,
} from '../../types/tour';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { fahrzeugService } from '../../services/fahrzeugService';
import { fahrerService } from '../../services/fahrerService';
import { tourenService } from '../../services/tourenService';
import { claudeRouteOptimizer } from '../../services/claudeRouteOptimizer';
import { tourenPdfService } from '../../services/tourenPdfService';
import TourenHilfe from './TourenHilfe';

// Belieferungsart Labels
const BELIEFERUNGSART_LABELS: Record<Belieferungsart, string> = {
  nur_motorwagen: 'Nur Motor (18t)',
  mit_haenger: 'Mit Hänger (28t)',
  abholung_ab_werk: 'Abholung',
  palette_mit_ladekran: 'Ladekran',
  bigbag: 'BigBag',
};

// Belieferungsart Farben
const BELIEFERUNGSART_COLORS: Record<Belieferungsart, string> = {
  nur_motorwagen: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  mit_haenger: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  abholung_ab_werk: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  palette_mit_ladekran: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  bigbag: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
};

// Werk-Adresse (Start/Endpunkt)
const WERK_ADRESSE = {
  strasse: 'Wertheimer Str. 30',
  plz: '97828',
  ort: 'Marktheidenfeld',
  koordinaten: [9.60, 49.85] as [number, number],
};

interface Props {
  onNavigateToProjekt: (projektId: string) => void;
}

const TourenPlanungTab = ({ onNavigateToProjekt: _onNavigateToProjekt }: Props) => {
  // === STATE ===
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Daten (projekte und kundenMap werden für Transformation zu projekteFuerOptimierung verwendet)
  const [_projekte, setProjekte] = useState<Projekt[]>([]);
  const [_kundenMap, setKundenMap] = useState<Map<string, SaisonKunde>>(new Map());
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [fahrer, setFahrer] = useState<Fahrer[]>([]);
  const [touren, setTouren] = useState<Tour[]>([]);

  // Filter
  const [selectedDatum, setSelectedDatum] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // UI State
  const [expandedTour, setExpandedTour] = useState<string | null>(null);
  const [showHilfe, setShowHilfe] = useState(false);
  const [optimierungResult, setOptimierungResult] = useState<ClaudeOptimierungResponse | null>(null);

  // Projekt-Daten für Optimierung
  const [projekteFuerOptimierung, setProjekteFuerOptimierung] = useState<ProjektFuerOptimierung[]>([]);

  // === DATEN LADEN ===
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Lade alle offenen Projekte
      const alleProjekte = await projektService.loadProjekte();
      const offeneProjekte = alleProjekte.filter(
        p => ['auftragsbestaetigung', 'lieferschein'].includes(p.status) &&
          (!p.dispoStatus || p.dispoStatus === 'offen' || p.dispoStatus === 'geplant')
      );
      setProjekte(offeneProjekte);

      // Lade Kundendaten
      const kundeIds = [...new Set(offeneProjekte.map(p => p.kundeId).filter(Boolean))];
      const kundenPromises = kundeIds.map(id =>
        saisonplanungService.loadKunde(id).catch(() => null)
      );
      const kunden = await Promise.all(kundenPromises);

      const neueKundenMap = new Map<string, SaisonKunde>();
      kunden.forEach(kunde => {
        if (kunde) neueKundenMap.set(kunde.id, kunde);
      });
      setKundenMap(neueKundenMap);

      // Lade Fahrzeuge
      const geladeneFahrzeuge = await fahrzeugService.loadAlleFahrzeuge();
      setFahrzeuge(geladeneFahrzeuge.filter(f => f.verfuegbarkeit?.verfuegbar !== false));

      // Lade Fahrer
      const geladeneFahrer = await fahrerService.loadAktiveFahrer();
      setFahrer(geladeneFahrer);

      // Lade existierende Touren für das Datum
      const existierendeTouren = await tourenService.loadTourenFuerDatum(selectedDatum);
      setTouren(existierendeTouren);

      // Projekte für Optimierung vorbereiten
      const pfo: ProjektFuerOptimierung[] = [];
      for (const projekt of offeneProjekte) {
        const projektId = (projekt as any).$id || projekt.id;
        const kunde = projekt.kundeId ? neueKundenMap.get(projekt.kundeId) : null;

        // Adresse ermitteln
        const adresse = projekt.lieferadresse || kunde?.lieferadresse || kunde?.adresse;
        if (!adresse) continue;

        // Wichtige Hinweise sammeln
        const wichtigeHinweise: string[] = [];
        if (kunde?.anfahrtshinweise) wichtigeHinweise.push(kunde.anfahrtshinweise);
        if (projekt.notizen) wichtigeHinweise.push(projekt.notizen);

        pfo.push({
          id: projektId,
          kundenname: projekt.kundenname,
          kundennummer: projekt.kundennummer,
          adresse: {
            strasse: adresse.strasse || '',
            plz: adresse.plz || '',
            ort: adresse.ort || '',
            koordinaten: kunde?.koordinaten as [number, number] | undefined,
          },
          tonnen: projekt.liefergewicht || projekt.angefragteMenge || 0,
          paletten: projekt.anzahlPaletten,
          belieferungsart: projekt.belieferungsart || 'mit_haenger',
          zeitfenster: projekt.lieferzeitfenster,
          lieferKW: projekt.lieferKW,
          lieferKWJahr: projekt.lieferKWJahr,
          lieferdatumTyp: projekt.lieferdatumTyp,
          wichtigeHinweise: wichtigeHinweise.length > 0 ? wichtigeHinweise : undefined,
          anfahrtshinweise: kunde?.anfahrtshinweise,
          kontakt: projekt.dispoAnsprechpartner || kunde?.dispoAnsprechpartner,
        });
      }
      setProjekteFuerOptimierung(pfo);

    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDatum]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // === KI-OPTIMIERUNG - CLAUDE ENTSCHEIDET ALLES ===
  const starteKIOptimierung = async () => {
    if (projekteFuerOptimierung.length === 0) {
      alert('Keine offenen Lieferungen vorhanden.');
      return;
    }

    setOptimizing(true);
    setOptimierungResult(null);
    setTouren([]);

    try {
      // Claude bekommt ALLE offenen Lieferungen und entscheidet selbst
      const result = await claudeRouteOptimizer.optimiereTouren({
        projekte: projekteFuerOptimierung,
        fahrzeuge: fahrzeuge.map(f => ({
          id: f.id,
          kennzeichen: f.kennzeichen,
          kapazitaetTonnen: f.kapazitaetTonnen,
          typ: f.typ,
          fahrerName: f.fahrer,
        })),
        startAdresse: WERK_ADRESSE,
        startZeit: `${selectedDatum}T07:00:00`,
        einschraenkungen: {
          maxArbeitszeitMinuten: 540,
          pausenregelMinuten: 45,
          respektiereZeitfenster: true,
          respektiereKWDeadlines: true,
          aktuelleKW: claudeRouteOptimizer.getAktuelleKW(),
        },
      });

      setOptimierungResult(result);

      // Touren aus dem Ergebnis erstellen
      const neueTouren: Tour[] = [];

      for (let i = 0; i < result.touren.length; i++) {
        const tourEmpfehlung = result.touren[i];

        // Kapazität basierend auf Fahrzeugtyp
        const kapazitaet = tourEmpfehlung.kapazitaetMaximal ||
          FAHRZEUG_KAPAZITAETEN[tourEmpfehlung.fahrzeugTyp] || 18;

        // Stops erstellen
        const stops: TourStop[] = tourEmpfehlung.stopReihenfolge.map((projektId, index) => {
          const pfo = projekteFuerOptimierung.find(p => p.id === projektId);
          if (!pfo) return null as unknown as TourStop;

          return {
            projektId,
            position: index + 1,
            ankunftGeplant: '',
            abfahrtGeplant: '',
            kundenname: pfo.kundenname,
            kundennummer: pfo.kundennummer,
            adresse: pfo.adresse,
            kontakt: pfo.kontakt,
            tonnen: pfo.tonnen,
            paletten: pfo.paletten,
            belieferungsart: pfo.belieferungsart,
            zeitfenster: pfo.zeitfenster,
            anfahrtshinweise: pfo.anfahrtshinweise,
            wichtigeHinweise: pfo.wichtigeHinweise,
          };
        }).filter(Boolean);

        const istMotorwagen = tourEmpfehlung.fahrzeugTyp === 'motorwagen';

        const neueTour: Tour = {
          id: `temp-${i}`,
          datum: selectedDatum,
          name: `Tour ${i + 1} - ${istMotorwagen ? 'Motorwagen' : 'Mit Hänger'}`,
          fahrzeugId: '', // Wird später zugewiesen
          fahrerId: undefined,
          lkwTyp: istMotorwagen ? 'motorwagen' : 'mit_haenger',
          kapazitaet: istMotorwagen
            ? { motorwagenTonnen: kapazitaet, haengerTonnen: undefined, gesamtTonnen: kapazitaet }
            : { motorwagenTonnen: 14, haengerTonnen: kapazitaet - 14, gesamtTonnen: kapazitaet },
          stops,
          routeDetails: {
            gesamtDistanzKm: 0,
            gesamtFahrzeitMinuten: 0,
            gesamtZeitMinuten: 0,
            startZeit: `${selectedDatum}T07:00:00`,
            endeZeit: '',
            geschaetzteDieselkosten: 0,
            geschaetzteVerschleisskosten: 0,
            gesamtTonnen: tourEmpfehlung.geschaetzteTonnen,
            auslastungProzent: Math.round((tourEmpfehlung.geschaetzteTonnen / kapazitaet) * 100),
          },
          optimierung: {
            methode: 'claude_ai',
            optimiertAm: new Date().toISOString(),
            begruendung: tourEmpfehlung.begruendung,
            einschraenkungen: [],
          },
          status: 'entwurf',
          erstelltAm: new Date().toISOString(),
          geaendertAm: new Date().toISOString(),
        };

        neueTouren.push(neueTour);
      }

      setTouren(neueTouren);

    } catch (error) {
      console.error('Fehler bei KI-Optimierung:', error);
      alert(`Fehler bei der KI-Optimierung: ${error}`);
    } finally {
      setOptimizing(false);
    }
  };

  // === TOUREN SPEICHERN ===
  const speichereTouren = async () => {
    setSaving(true);
    try {
      for (const tour of touren) {
        if (tour.id.startsWith('temp-')) {
          await tourenService.createTour({
            ...tour,
            status: 'geplant',
          });
        } else {
          await tourenService.updateTour(tour.id, tour);
        }
      }
      await loadData();
      alert('Touren gespeichert!');
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Touren');
    } finally {
      setSaving(false);
    }
  };

  // === STATISTIKEN ===
  const statistik: TourenStatistik = tourenService.berechneStatistik(touren);

  // Offene Tonnage berechnen
  const offeneTonnage = projekteFuerOptimierung.reduce((sum, p) => sum + p.tonnen, 0);
  const nurMotorCount = projekteFuerOptimierung.filter(p => p.belieferungsart === 'nur_motorwagen').length;
  const mitHaengerCount = projekteFuerOptimierung.filter(p => p.belieferungsart === 'mit_haenger' || !p.belieferungsart).length;

  // === RENDER ===
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Lade Daten...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Datum und Aktionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <input
                type="date"
                value={selectedDatum}
                onChange={(e) => setSelectedDatum(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              KW {claudeRouteOptimizer.getAktuelleKW()}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHilfe(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              title="Hilfe"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              title="Aktualisieren"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Übersicht: Was muss raus? */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          Offene Lieferungen
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatBox
            label="Lieferungen"
            value={projekteFuerOptimierung.length}
            icon={<Package className="w-5 h-5" />}
          />
          <StatBox
            label="Tonnen gesamt"
            value={`${offeneTonnage.toFixed(1)}t`}
            icon={<Truck className="w-5 h-5" />}
            highlight
          />
          <StatBox
            label="Nur Motorwagen"
            value={nurMotorCount}
            icon={<AlertCircle className="w-5 h-5" />}
            color="blue"
          />
          <StatBox
            label="Mit Hänger möglich"
            value={mitHaengerCount}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="purple"
          />
        </div>

        {/* Info-Box zur Kapazität */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <p className="font-medium mb-1">Fahrzeugkapazitäten:</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li><span className="font-medium text-blue-600">Motorwagen:</span> max. 18 Tonnen</li>
                <li><span className="font-medium text-purple-600">Mit Hänger:</span> max. 28 Tonnen (18t + 10t Hänger)</li>
              </ul>
              <p className="mt-2 text-orange-600 dark:text-orange-400">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Vereine mit "Nur Motorwagen" können nicht mit Hänger beliefert werden!
              </p>
            </div>
          </div>
        </div>

        {/* Großer KI-Button */}
        <button
          onClick={starteKIOptimierung}
          disabled={optimizing || projekteFuerOptimierung.length === 0}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg font-medium text-lg flex items-center justify-center gap-3"
        >
          {optimizing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Claude analysiert {projekteFuerOptimierung.length} Lieferungen...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-6 h-6" />
              <span>Optimale Touren berechnen lassen</span>
            </>
          )}
        </button>
      </div>

      {/* KI-Optimierungs-Ergebnis */}
      {optimierungResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-green-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-green-900 dark:text-green-100 text-lg">
                Claude hat {optimierungResult.touren.length} Tour(en) geplant!
              </h3>

              {optimierungResult.empfehlung && (
                <p className="text-green-700 dark:text-green-300 mt-2">
                  {optimierungResult.empfehlung}
                </p>
              )}

              {optimierungResult.nichtFuerHeute.length > 0 && (
                <p className="text-orange-600 dark:text-orange-400 mt-2">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  {optimierungResult.nichtFuerHeute.length} Lieferung(en) wurden für heute nicht eingeplant.
                </p>
              )}

              {optimierungResult.warnungen.length > 0 && (
                <div className="mt-3 space-y-1">
                  {optimierungResult.warnungen.map((warnung, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{warnung}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statistik-Leiste */}
      {touren.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBox label="Touren" value={statistik.anzahlTouren} icon={<Route className="w-5 h-5" />} />
          <StatBox label="Stopps" value={statistik.anzahlStops} icon={<MapPin className="w-5 h-5" />} />
          <StatBox label="Tonnen" value={`${statistik.gesamtTonnen.toFixed(1)}t`} icon={<Package className="w-5 h-5" />} />
          <StatBox
            label="Auslastung"
            value={`${statistik.durchschnittlicheAuslastung.toFixed(0)}%`}
            icon={<CheckCircle2 className="w-5 h-5" />}
            highlight={statistik.durchschnittlicheAuslastung > 70}
          />
          <div className="flex items-center justify-center">
            <button
              onClick={speichereTouren}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Touren speichern
            </button>
          </div>
        </div>
      )}

      {/* Touren-Liste */}
      {touren.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Route className="w-5 h-5 text-red-600" />
            Geplante Touren
          </h2>

          {touren.map((tour, tourIndex) => {
            const isExpanded = expandedTour === tour.id;
            const istMotorwagen = tour.name.includes('Motorwagen');
            const maxKapazitaet = istMotorwagen ? 18 : 28;

            return (
              <div
                key={tour.id}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Tour Header */}
                <div
                  onClick={() => setExpandedTour(isExpanded ? null : tour.id)}
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${istMotorwagen ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-purple-100 dark:bg-purple-900/50'}`}>
                        <Truck className={`w-6 h-6 ${istMotorwagen ? 'text-blue-600' : 'text-purple-600'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                          Tour {tourIndex + 1}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          <span className={`font-medium ${istMotorwagen ? 'text-blue-600' : 'text-purple-600'}`}>
                            {istMotorwagen ? 'Motorwagen (18t)' : 'Mit Hänger (28t)'}
                          </span>
                          {' • '}{tour.stops.length} Stopps{' • '}{tour.routeDetails.gesamtTonnen.toFixed(1)}t von {maxKapazitaet}t
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Auslastungs-Anzeige */}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                          {tour.routeDetails.auslastungProzent}%
                        </div>
                        <div className="w-24 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tour.routeDetails.auslastungProzent > 90 ? 'bg-green-500' :
                              tour.routeDetails.auslastungProzent > 70 ? 'bg-blue-500' :
                              'bg-yellow-500'
                            }`}
                            style={{ width: `${Math.min(100, tour.routeDetails.auslastungProzent)}%` }}
                          />
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </div>

                  {/* Begründung von Claude */}
                  {tour.optimierung.begruendung && (
                    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <p className="text-sm text-purple-700 dark:text-purple-300 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{tour.optimierung.begruendung}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Tour Details (expandiert) */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-slate-700">
                    <div className="p-4 space-y-3">
                      {tour.stops.map((stop) => (
                        <div
                          key={stop.projektId}
                          className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl"
                        >
                          <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center text-red-600 font-bold">
                            {stop.position}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 dark:text-white">
                                {stop.kundenname}
                              </span>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${BELIEFERUNGSART_COLORS[stop.belieferungsart]}`}>
                                {BELIEFERUNGSART_LABELS[stop.belieferungsart]}
                              </span>
                              <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                                {stop.tonnen}t
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              <MapPin className="w-3 h-3 inline mr-1" />
                              {stop.adresse.strasse}, {stop.adresse.plz} {stop.adresse.ort}
                            </div>
                            {stop.kontakt && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                <Phone className="w-3 h-3 inline mr-1" />
                                {stop.kontakt.name}: {stop.kontakt.telefon}
                              </div>
                            )}
                            {stop.zeitfenster && (
                              <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Zeitfenster: {stop.zeitfenster.von} - {stop.zeitfenster.bis}
                              </div>
                            )}
                            {stop.wichtigeHinweise && stop.wichtigeHinweise.length > 0 && (
                              <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                {stop.wichtigeHinweise.map((hinweis, i) => (
                                  <div key={i} className="text-sm text-orange-700 dark:text-orange-400 flex items-start gap-1">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>{hinweis}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tour Aktionen */}
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Optimiert von <span className="font-medium text-purple-600">Claude AI</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const fahrzeugFuerPdf = fahrzeuge.find(f => f.id === tour.fahrzeugId);
                            const fahrerFuerPdf = fahrer.find(f => f.id === tour.fahrerId);
                            tourenPdfService.oeffneTourenplan(tour, fahrzeugFuerPdf, fahrerFuerPdf);
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Tourenplan PDF
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTouren(prev => prev.filter(t => t.id !== tour.id));
                          }}
                          className="px-4 py-2 text-sm text-red-600 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Keine Touren Hinweis */}
      {touren.length === 0 && !optimizing && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Bereit für die Tourenplanung
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Claude analysiert alle {projekteFuerOptimierung.length} offenen Lieferungen
              und erstellt automatisch die optimalen Touren unter Berücksichtigung
              von Kapazitäten, Belieferungsarten und geografischer Lage.
            </p>
            <button
              onClick={starteKIOptimierung}
              disabled={optimizing || projekteFuerOptimierung.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 font-medium"
            >
              <Sparkles className="w-5 h-5" />
              Jetzt optimale Touren berechnen
            </button>
          </div>
        </div>
      )}

      {/* Hilfe Modal */}
      {showHilfe && <TourenHilfe onClose={() => setShowHilfe(false)} />}
    </div>
  );
};

// Stat Box Komponente
const StatBox = ({
  label,
  value,
  icon,
  highlight = false,
  color = 'gray',
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
  color?: 'gray' | 'blue' | 'purple' | 'green';
}) => {
  const colorClasses = {
    gray: 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  };

  const iconColors = {
    gray: 'bg-gray-100 dark:bg-slate-800 text-gray-500',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-600',
  };

  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'ring-2 ring-green-500 ring-offset-2 dark:ring-offset-slate-900' : ''} ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconColors[color]}`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
        </div>
      </div>
    </div>
  );
};

export default TourenPlanungTab;
