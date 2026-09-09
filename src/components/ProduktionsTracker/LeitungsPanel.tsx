import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Award, Calendar, Scale, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { ProduktionsBuchung } from '../../types/produktion';
import { BEREICHE, getGebinde, getKoernung } from '../../types/produktion';
import {
  berechneMaterialbilanz,
  bucheSchuttVerbrauchAb,
  kumuliertAusBuchungen,
} from '../../services/produktionService';
import { dashboardService } from '../../services/dashboardService';
import type { LagerBestand } from '../../types/dashboard';
import { ABSCHNITT_LABEL, FOKUS, PANEL_LABEL, STATION } from './produktionUi';
import {
  formatDatumKurz,
  formatTonnen,
  gebindeVerteilung,
  heuteDatum,
  kennzahlen,
  koernungsVerteilung,
  lieferantenVerteilung,
  monatsPrognose,
  monatsReihe,
  tagesReihe,
  verschiebeTage,
  wochenReihe,
  wochentagsProfil,
} from './statistik';
import type { TagesReihe, WochenReihe } from './statistik';

/**
 * Die Diagrammreihe wechselt mit der Zeitachse die Form. Recharts nimmt beide
 * entgegen, verlangt aber EINEN Array-Typ — daher der Union statt `any`.
 */
type ChartReihe = TagesReihe | WochenReihe;

/**
 * Auswertung — nur für Produktionsleitung und Admin.
 *
 * Die inhaltlich wichtigste Entscheidung steht im Bestandsabgleich: es bucht
 * heute NIRGENDS ein Verkaufs- oder Lieferabgang auf `lager_bestand`.
 * `kumuliertAusBuchungen()` ist deshalb die Lebenszeitsumme der Produktion,
 * kein Bestand — und es gibt bewusst KEINEN Knopf „auf Rechenwert setzen".
 * Er würde einen gepflegten Bestand mit einer Kumulierten überschreiben.
 *
 * Ebenso die Ausbeute: sie wird nur über Monat und Saison gezeigt. Zwischen
 * Schutteingang und Mahlen liegt die Halde; tageweise ist `gemahlen /
 * rohmaterial` Rauschen — wird aber wie eine Messung gelesen.
 */

export interface LeitungsPanelProps {
  buchungen: ProduktionsBuchung[];
  /** Darf der Nutzer Lagerbestände sehen? */
  zeigeBestand: boolean;
  fensterTage: number;
  onFenster: (tage: number) => void;
  onNeuLaden: () => void;
}

type Zeitachse = 'tage' | 'wochen' | 'monate';

const Karte: React.FC<{ titel: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
  titel,
  icon,
  children,
}) => (
  <section className="pz-karte rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900 dark:text-slate-50">
      {icon}
      {titel}
    </h3>
    {children}
  </section>
);

const Kennzahl: React.FC<{
  titel: string;
  wert: string;
  unter?: string;
  trend?: number;
  icon?: React.ReactNode;
}> = ({ titel, wert, unter, trend, icon }) => (
  <div className="pz-karte rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-start justify-between">
      <span className={`pz-panel ${PANEL_LABEL}`}>{titel}</span>
      {icon}
    </div>
    <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-slate-50">{wert}</p>
    <div className="mt-0.5 flex items-center gap-2">
      {unter && <span className="text-xs text-gray-500 dark:text-slate-400">{unter}</span>}
      {trend !== undefined && trend !== 0 && (
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${
            trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
        </span>
      )}
    </div>
  </div>
);

/**
 * Recharts reicht dem Tooltip seine Reihen als lose typisierte Liste. Statt
 * `any` genau die vier Felder, die hier gelesen werden — falsch geschriebene
 * Zugriffe fallen so beim Übersetzen auf.
 */
interface TooltipReihe {
  name?: string;
  value?: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipReihe[];
  label?: string | number;
}

const ChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 text-sm font-bold text-gray-900 dark:text-slate-50">{label}</p>
      {payload.map((p: TooltipReihe, i: number) => (
        <p key={i} className="text-sm tabular-nums" style={{ color: p.color }}>
          {p.name}: <strong>{formatTonnen(p.value ?? 0, 1)} t</strong>
        </p>
      ))}
    </div>
  );
};

const LeitungsPanel: React.FC<LeitungsPanelProps> = ({
  buchungen,
  zeigeBestand,
  fensterTage,
  onFenster,
  onNeuLaden,
}) => {
  const [achse, setAchse] = useState<Zeitachse>('tage');
  const [lager, setLager] = useState<LagerBestand | null>(null);
  const [schuttLaeuft, setSchuttLaeuft] = useState(false);
  const [schuttFrage, setSchuttFrage] = useState(false);

  const aktiv = useMemo(() => buchungen.filter((b) => !b.storniert), [buchungen]);

  useEffect(() => {
    if (!zeigeBestand) return;
    dashboardService
      .getLagerBestand()
      .then(setLager)
      .catch(() => setLager(null));
  }, [zeigeBestand]);

  // Der Dark-Modus des Portals hängt an einer Klasse am <html>; recharts
  // braucht aber einen echten Farbwert. Deshalb hier einmal ablesen statt
  // #e5e7eb hart zu setzen (was die Bestands-Charts tun und im Dunkeln
  // als weiße Gitterlinien auffällt).
  const rasterFarbe = useMemo(() => {
    if (typeof document === 'undefined') return '#e5e7eb';
    return document.documentElement.classList.contains('dark') ? '#334155' : '#e5e7eb';
  }, []);

  const reihe = useMemo(() => {
    if (achse === 'wochen') return wochenReihe(aktiv, 12);
    if (achse === 'monate') return monatsReihe(aktiv, 6);
    const heute = heuteDatum();
    return tagesReihe(aktiv, verschiebeTage(heute, -29), heute);
  }, [aktiv, achse]);

  const bilanzMonat = useMemo(() => {
    const heute = heuteDatum();
    const anfang = `${heute.slice(0, 7)}-01`;
    return berechneMaterialbilanz(aktiv.filter((b) => b.datum >= anfang));
  }, [aktiv]);

  const bilanzZeitraum = useMemo(() => berechneMaterialbilanz(aktiv), [aktiv]);
  const kumuliert = useMemo(() => kumuliertAusBuchungen(aktiv), [aktiv]);

  const koernung = useMemo(
    () => koernungsVerteilung(aktiv.filter((b) => b.bereich !== 'rohmaterial')),
    [aktiv]
  );
  const gebinde = useMemo(() => gebindeVerteilung(aktiv), [aktiv]);
  const lieferanten = useMemo(() => lieferantenVerteilung(aktiv), [aktiv]);
  const wochentage = useMemo(
    () => wochentagsProfil(aktiv.filter((b) => b.bereich === 'mahlen')),
    [aktiv]
  );

  const schuttAbbuchen = async () => {
    setSchuttLaeuft(true);
    try {
      await bucheSchuttVerbrauchAb(bilanzMonat.gemahlenTonnen);
      const neu = await dashboardService.getLagerBestand();
      setLager(neu);
      setSchuttFrage(false);
      onNeuLaden();
    } finally {
      setSchuttLaeuft(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
          {(
            [
              ['tage', '30 Tage'],
              ['wochen', '12 Wochen'],
              ['monate', '6 Monate'],
            ] as [Zeitachse, string][]
          ).map(([wert, label]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setAchse(wert)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${FOKUS} ${
                achse === wert
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
                  : 'text-gray-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className={`pz-panel ${ABSCHNITT_LABEL}`}>Datenfenster</span>
          <select
            value={fensterTage}
            onChange={(e) => onFenster(Number(e.target.value))}
            className={`rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${FOKUS}`}
          >
            <option value={90}>90 Tage</option>
            <option value={180}>180 Tage</option>
            <option value={365}>1 Jahr</option>
          </select>
        </div>
      </div>

      {/* Kennzahlen je Bereich */}
      {BEREICHE.map((def) => {
        const k = kennzahlen(aktiv, def.wert);
        return (
          <div key={def.wert}>
            <h3 className={`pz-panel mb-2 ${PANEL_LABEL} ${STATION[def.wert].text}`}>
              {def.label} · {def.beschreibung}
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Kennzahl titel="Heute" wert={`${formatTonnen(k.heute, 1)} t`} icon={<Calendar className="h-4 w-4 text-gray-400" />} />
              <Kennzahl titel="Diese Woche" wert={`${formatTonnen(k.dieseWoche, 0)} t`} unter={`Vorwoche ${formatTonnen(k.letzteWoche, 0)} t`} />
              <Kennzahl titel="Dieser Monat" wert={`${formatTonnen(k.dieserMonat, 0)} t`} unter={`Vormonat ${formatTonnen(k.letzterMonat, 0)} t`} />
              <Kennzahl titel="Ø je Produktionstag" wert={`${formatTonnen(k.durchschnittProTag, 1)} t`} unter={`${k.produktiveTage} Tage`} />
              <Kennzahl titel="Bester Tag" wert={`${formatTonnen(k.besterTag.tonnen, 0)} t`} unter={formatDatumKurz(k.besterTag.datum)} icon={<Award className="h-4 w-4 text-gray-400" />} />
              <Kennzahl titel="Trend 7 Tage" wert={`${k.trend7Tage > 0 ? '+' : ''}${k.trend7Tage.toLocaleString('de-DE')} %`} trend={k.trend7Tage} />
            </div>
          </div>
        );
      })}

      <Karte titel="Materialfluss" icon={<Zap className="h-5 w-5 text-orange-500" />}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {achse === 'tage' ? (
              <ComposedChart data={reihe as ChartReihe[]}>
                <CartesianGrid strokeDasharray="3 3" stroke={rasterFarbe} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="rohmaterial" name="Rohmaterial" stackId="a" fill={STATION.rohmaterial.hex} />
                <Bar dataKey="mahlen" name="Gemahlen" stackId="a" fill={STATION.mahlen.hex} />
                <Bar dataKey="abfuellung" name="Abgefüllt" stackId="a" fill={STATION.abfuellung.hex} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="trendMahlen" name="Ø 7 Tage (Mahlen)" stroke="#16a34a" strokeWidth={2} dot={false} />
              </ComposedChart>
            ) : (
              <BarChart data={reihe as ChartReihe[]}>
                <CartesianGrid strokeDasharray="3 3" stroke={rasterFarbe} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="rohmaterial" name="Rohmaterial" fill={STATION.rohmaterial.hex} radius={[4, 4, 0, 0]} />
                <Bar dataKey="mahlen" name="Gemahlen" fill={STATION.mahlen.hex} radius={[4, 4, 0, 0]} />
                <Bar dataKey="abfuellung" name="Abgefüllt" fill={STATION.abfuellung.hex} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Karte>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Karte titel="Materialbilanz" icon={<Scale className="h-5 w-5 text-emerald-600" />}>
          <div className="space-y-3">
            {[
              ['Laufender Monat', bilanzMonat],
              [`Zeitraum (${fensterTage} Tage)`, bilanzZeitraum],
            ].map(([titel, bilanz]) => {
              const b = bilanz as typeof bilanzMonat;
              return (
                <div key={titel as string} className="rounded-xl bg-gray-50 p-4 dark:bg-slate-800/60">
                  <p className={`pz-panel mb-2 ${PANEL_LABEL}`}>{titel as string}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold tabular-nums text-stone-700 dark:text-stone-300">
                        {formatTonnen(b.rohmaterialTonnen, 0)} t
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">Schutt rein</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-300">
                        {formatTonnen(b.gemahlenTonnen, 0)} t
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">gemahlen</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-300">
                        {formatTonnen(b.abgefuelltTonnen, 0)} t
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">abgefüllt</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 text-sm dark:border-slate-700">
                    <span className="text-gray-600 dark:text-slate-400">Ausbeute</span>
                    <span className="font-bold tabular-nums text-gray-900 dark:text-slate-50">
                      {b.ausbeute === null
                        ? '—'
                        : `${(b.ausbeute * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-slate-400">davon in Gebinde</span>
                    <span className="font-bold tabular-nums text-gray-900 dark:text-slate-50">
                      {b.abfuellQuote === null
                        ? '—'
                        : `${(b.abfuellQuote * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`}
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              Ausbeute über den Zeitraum. Zwischen Schutteingang und Mahlen liegt die Halde — für
              einzelne Tage ist die Zahl nicht aussagekräftig und wird deshalb auch nicht angeboten.
            </p>
          </div>
        </Karte>

        <Karte titel="Prognose & Verteilung">
          <div className="space-y-4">
            <div className="rounded-xl bg-orange-50 p-4 dark:bg-orange-500/10">
              <p className={`pz-panel ${PANEL_LABEL}`}>Monatsprognose Mahlen</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-orange-700 dark:text-orange-300">
                ~{formatTonnen(monatsPrognose(aktiv, 'mahlen'), 0)} t
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Schnitt je produktivem Tag × verbleibende Werktage.
              </p>
            </div>

            <div>
              <p className={`pz-panel mb-2 ${ABSCHNITT_LABEL}`}>Körnung</p>
              {koernung.length === 0 ? (
                <p className="text-sm text-gray-400">Keine Daten</p>
              ) : (
                koernung.map((k) => {
                  const def = getKoernung(k.schluessel as never);
                  return (
                    <div key={k.schluessel} className="mb-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-slate-300">
                          {def?.label ?? k.schluessel}
                        </span>
                        <span className="tabular-nums text-gray-600 dark:text-slate-400">
                          {formatTonnen(k.tonnen, 0)} t ({k.anteil.toLocaleString('de-DE')} %)
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${def?.color ?? 'from-gray-400 to-gray-500'}`}
                          style={{ width: `${k.anteil}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {gebinde.length > 0 && (
              <div>
                <p className={`pz-panel mb-2 ${ABSCHNITT_LABEL}`}>Gebinde</p>
                {gebinde.map((g) => (
                  <div key={g.schluessel} className="flex justify-between py-0.5 text-sm">
                    <span className="text-gray-700 dark:text-slate-300">
                      {getGebinde(g.schluessel as never)?.label ?? g.schluessel}
                    </span>
                    <span className="tabular-nums text-gray-600 dark:text-slate-400">
                      {formatTonnen(g.tonnen, 0)} t ({g.anteil.toLocaleString('de-DE')} %)
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lieferanten.length > 0 && (
              <div>
                <p className={`pz-panel mb-2 ${ABSCHNITT_LABEL}`}>Lieferanten</p>
                {lieferanten.slice(0, 6).map((l) => (
                  <div key={l.schluessel} className="flex justify-between py-0.5 text-sm">
                    <span className="truncate text-gray-700 dark:text-slate-300">{l.schluessel}</span>
                    <span className="flex-shrink-0 tabular-nums text-gray-600 dark:text-slate-400">
                      {formatTonnen(l.tonnen, 0)} t ({l.anteil.toLocaleString('de-DE')} %)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Karte>

        <Karte titel="Mahlleistung nach Wochentag">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wochentage}>
                <CartesianGrid strokeDasharray="3 3" stroke={rasterFarbe} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="durchschnitt" name="Ø Produktion" radius={[4, 4, 0, 0]}>
                  {wochentage.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i >= 5 ? '#94a3b8' : STATION.mahlen.hex}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Karte>

        {zeigeBestand && (
          <Karte titel="Bestandsabgleich" icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className={`pz-panel ${PANEL_LABEL} text-left`}>Position</div>
                <div className={`pz-panel ${PANEL_LABEL}`}>Gespeichert</div>
                <div className={`pz-panel ${PANEL_LABEL}`}>Kumuliert</div>
              </div>
              {(
                [
                  ['Ziegelschutt', lager?.ziegelschutt, kumuliert.ziegelschutt],
                  ['Ziegelmehl lose', lager?.ziegelmehlSchuettware, kumuliert.ziegelmehlSchuettware],
                  ['Sackware / Gebinde', lager?.ziegelmehlSackware, kumuliert.ziegelmehlSackware],
                ] as [string, number | undefined, number][]
              ).map(([titel, gespeichert, summe]) => (
                <div key={titel} className="grid grid-cols-3 items-center gap-2 border-t border-gray-100 pt-2 text-sm dark:border-slate-800">
                  <span className="text-gray-700 dark:text-slate-300">{titel}</span>
                  <span className="text-center font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                    {gespeichert === undefined ? '—' : `${formatTonnen(gespeichert, 0)} t`}
                  </span>
                  <span className="text-center tabular-nums text-gray-500 dark:text-slate-400">
                    {formatTonnen(summe, 0)} t
                  </span>
                </div>
              ))}

              <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-slate-800/60 dark:text-slate-400">
                <strong>„Kumuliert"</strong> ist die Summe aller Lagerbewegungen aus Buchungen seit
                Erfassungsbeginn — kein Bestand. Auf den Lagerbestand bucht heute kein
                Verkaufs- oder Lieferabgang; die Kumulierte liegt deshalb zwangsläufig darüber.
                Sie dient als Gegenprobe, nicht als Korrekturwert, und wird bewusst nicht
                zurückgeschrieben.
              </p>

              {buchungen.some((b) => b.lagerGebucht === false) && (
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/15">
                  <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      {buchungen.filter((b) => b.lagerGebucht === false).length} Buchung(en) stehen,
                      ohne dass der Lagerbestand fortgeschrieben wurde. Das ist die einzige
                      Abweichung, die dieses Tool selbst verursacht haben kann.
                    </span>
                  </p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 dark:border-slate-800">
                <p className={`pz-panel mb-2 ${ABSCHNITT_LABEL}`}>Schuttverbrauch</p>
                <p className="mb-2 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                  Der Verbrauch von Ziegelschutt beim Mahlen wird nicht gemessen und deshalb auch
                  nicht automatisch abgebucht — eine geratene 1:1-Abbuchung sähe hinterher aus wie
                  eine gemessene Zahl. Hier lässt sich die gemahlene Monatsmenge bewusst vom
                  Schuttbestand abziehen.
                </p>
                {schuttFrage ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={schuttLaeuft}
                      onClick={schuttAbbuchen}
                      className={`min-h-[44px] flex-1 rounded-lg bg-amber-600 text-sm font-semibold text-white disabled:opacity-50 ${FOKUS}`}
                    >
                      {schuttLaeuft
                        ? 'Wird gebucht…'
                        : `${formatTonnen(bilanzMonat.gemahlenTonnen, 0)} t abbuchen`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchuttFrage(false)}
                      className={`min-h-[44px] flex-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300 ${FOKUS}`}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={bilanzMonat.gemahlenTonnen <= 0}
                    onClick={() => setSchuttFrage(true)}
                    className={`min-h-[44px] w-full rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 ${FOKUS}`}
                  >
                    {formatTonnen(bilanzMonat.gemahlenTonnen, 0)} t Monatsverbrauch abbuchen
                  </button>
                )}
              </div>
            </div>
          </Karte>
        )}
      </div>
    </div>
  );
};

export default LeitungsPanel;
