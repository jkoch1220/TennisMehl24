/**
 * Monatsübersicht — die Ansicht, aus der der Nachweis für Lohnbuchhaltung und
 * Prüfung entsteht.
 *
 * Gerechnet wird ausschließlich mit `werteZeitraumAus()` und `summiere()`. Diese
 * Komponente formatiert nur; sonst stünden am Monatsende zwei Wahrheiten im Haus.
 * Der CSV-Export trägt eine BOM, weil Excel eine UTF-8-Datei ohne sie als ANSI
 * liest und aus „Frühschicht" ein „FrÃ¼hschicht" macht.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  formatiereStunden,
  lokaleUhrzeit,
  type TagesAuswertung,
  type ZeitEvent,
} from '../../types/zeiterfassung';
import { monatsGrenzen, summiere, werteZeitraumAus } from '../../utils/zeiterfassungBerechnung';
import { zeiterfassungService } from '../../services/zeiterfassungService';
import { WOCHENTAGE_KURZ, parseISODatum } from '../../utils/kalenderwoche';
import TagesDetail from './TagesDetail';

interface MonatsUebersichtProps {
  mitarbeiterId: string;
  mitarbeiterName: string;
  istLeitung: boolean;
  onStornieren?: (event: ZeitEvent) => void;
  /** Erhöht sich nach jeder Korrektur — erzwingt ein Neuladen. */
  neuLadenSchluessel?: number;
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Wochentagskürzel (Mo=0) aus einem lokalen ISO-Datum. */
function wochentagKurz(datum: string): string {
  return WOCHENTAGE_KURZ[(parseISODatum(datum).getDay() + 6) % 7];
}

function istWochenende(datum: string): boolean {
  const tag = parseISODatum(datum).getDay();
  return tag === 0 || tag === 6;
}

function monatVerschieben(monat: string, schritte: number): string {
  const [jahr, m] = monat.split('-').map(Number);
  const d = new Date(jahr, m - 1 + schritte, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monatsName(monat: string): string {
  const [jahr, m] = monat.split('-').map(Number);
  return new Date(jahr, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/** Aktueller Monat als YYYY-MM aus der lokalen Uhr (nicht über toISOString). */
function aktuellerMonat(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dezimalstunden mit Komma — die Form, die Lohnprogramme erwarten. */
function dezimalStunden(minuten: number): string {
  return (minuten / 60).toFixed(2).replace('.', ',');
}

export default function MonatsUebersicht({
  mitarbeiterId,
  mitarbeiterName,
  istLeitung,
  onStornieren,
  neuLadenSchluessel = 0,
}: MonatsUebersichtProps) {
  const [monat, setMonat] = useState(aktuellerMonat);
  const [tage, setTage] = useState<TagesAuswertung[]>([]);
  const [events, setEvents] = useState<ZeitEvent[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [alleTage, setAlleTage] = useState(false);
  const [detailDatum, setDetailDatum] = useState<string | null>(null);

  const ladeDaten = useCallback(async () => {
    if (!mitarbeiterId) {
      setTage([]);
      setEvents([]);
      setLaden(false);
      return;
    }
    setLaden(true);
    setFehler(null);
    try {
      const { von, bis } = monatsGrenzen(monat);
      const antwort = await zeiterfassungService.ladeZeitraum(von, bis, mitarbeiterId);
      const eigene = antwort.events.filter((e) => e.mitarbeiterId === mitarbeiterId);
      setEvents(eigene);
      setTage(werteZeitraumAus(von, bis, mitarbeiterId, eigene));
    } catch (e) {
      setFehler(fehlerText(e));
      setTage([]);
      setEvents([]);
    } finally {
      setLaden(false);
    }
  }, [monat, mitarbeiterId]);

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten, neuLadenSchluessel]);

  const sichtbareTage = useMemo(
    () =>
      alleTage
        ? tage
        : tage.filter((t) => t.events.length > 0 || t.unvollstaendig || t.hinweise.length > 0),
    [tage, alleTage]
  );

  const summe = useMemo(() => summiere(tage), [tage]);

  const detailTag = detailDatum ? tage.find((t) => t.datum === detailDatum) : undefined;

  const exportiereCsv = () => {
    const kopf = [
      'Datum',
      'Wochentag',
      'Kommen',
      'Gehen',
      'Anwesend (h:mm)',
      'Pause (h:mm)',
      'Ges. Abzug (Min.)',
      'Netto (h:mm)',
      'Netto (Std.)',
      'Unvollstaendig',
      'Hinweise',
    ];
    const zeilen = tage.map((t) => [
      t.datum,
      wochentagKurz(t.datum),
      t.beginn ? lokaleUhrzeit(t.beginn) : '',
      t.ende ? lokaleUhrzeit(t.ende) : '',
      formatiereStunden(t.bruttoMinuten).replace(' h', ''),
      formatiereStunden(t.pausenMinuten).replace(' h', ''),
      String(t.gesetzlicherPausenabzug),
      formatiereStunden(t.nettoMinuten).replace(' h', ''),
      dezimalStunden(t.nettoMinuten),
      t.unvollstaendig ? 'ja' : '',
      t.hinweise.map((h) => `${h.text}${h.grundlage ? ` (${h.grundlage})` : ''}`).join(' | '),
    ]);
    zeilen.push([
      'Summe',
      '',
      '',
      '',
      formatiereStunden(summe.bruttoMinuten).replace(' h', ''),
      formatiereStunden(summe.pausenMinuten).replace(' h', ''),
      String(summe.gesetzlicherPausenabzug),
      formatiereStunden(summe.nettoMinuten).replace(' h', ''),
      dezimalStunden(summe.nettoMinuten),
      summe.unvollstaendigeTage > 0 ? `${summe.unvollstaendigeTage} Tage` : '',
      `${summe.arbeitstage} Arbeitstage, ${summe.verstoesse} Verstoesse`,
    ]);

    // Semikolon als Trenner und BOM voran: so öffnet Excel die Datei direkt richtig.
    const BOM = '\uFEFF';
    const inhalt =
      BOM +
      [kopf, ...zeilen]
        .map((r) => r.map((z) => (z.includes(';') ? `"${z.replace(/"/g, '""')}"` : z)).join(';'))
        .join('\r\n');

    const blob = new Blob([inhalt], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arbeitszeit_${monat}_${mitarbeiterName.replace(/[^\w]+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Monatswähler */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonat(monatVerschieben(monat, -1))}
            className="p-2 rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-dark-surfaceHover transition-colors"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-0">
            <div className="font-bold text-gray-900 dark:text-white truncate">
              {monatsName(monat)}
            </div>
            <div className="text-xs text-gray-500 dark:text-dark-textMuted truncate">
              {mitarbeiterName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMonat(monatVerschieben(monat, 1))}
            className="p-2 rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-dark-surfaceHover transition-colors"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMonat(aktuellerMonat())}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surfaceHover transition-colors"
          >
            Aktueller Monat
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text px-2 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={alleTage}
              onChange={(e) => setAlleTage(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-dark-border text-sky-600 focus:ring-sky-500"
            />
            Alle Kalendertage
          </label>
          <button
            type="button"
            onClick={exportiereCsv}
            disabled={tage.length === 0}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {fehler && (
        <p className="text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
          {fehler}
        </p>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiKarte label="Netto gesamt" wert={formatiereStunden(summe.nettoMinuten)} betont />
        <KpiKarte label="Arbeitstage" wert={String(summe.arbeitstage)} />
        <KpiKarte
          label="Unvollständig"
          wert={String(summe.unvollstaendigeTage)}
          warnung={summe.unvollstaendigeTage > 0}
        />
        <KpiKarte
          label="Verstöße"
          wert={String(summe.verstoesse)}
          gefahr={summe.verstoesse > 0}
        />
      </div>

      {/* Tabelle */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border overflow-hidden">
        {laden ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-dark-textMuted">
            <Loader2 className="w-5 h-5 animate-spin" />
            Lade Monatsdaten…
          </div>
        ) : !mitarbeiterId ? (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-dark-textMuted">
            Kein Mitarbeiter ausgewählt.
          </p>
        ) : sichtbareTage.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-dark-textMuted">
            In {monatsName(monat)} ist kein Stempel erfasst.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-bg text-left text-xs uppercase tracking-wide text-gray-500 dark:text-dark-textMuted">
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Tag</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Kommen</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Gehen</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Pause</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Abzug</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Netto</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {sichtbareTage.map((t) => {
                  const verstoss = t.hinweise.some((h) => h.schwere === 'verstoss');
                  const warnung = t.hinweise.some((h) => h.schwere === 'warnung');
                  return (
                    <tr
                      key={t.datum}
                      onClick={() => setDetailDatum(t.datum)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailDatum(t.datum);
                        }
                      }}
                      className={`cursor-pointer transition-colors hover:bg-sky-50 dark:hover:bg-dark-surfaceHover ${
                        t.unvollstaendig
                          ? 'bg-amber-50/70 dark:bg-amber-900/20'
                          : istWochenende(t.datum)
                            ? 'bg-gray-50/70 dark:bg-dark-bg/60'
                            : ''
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium text-gray-900 dark:text-white tabular-nums">
                          {t.datum.slice(8, 10)}.{t.datum.slice(5, 7)}.
                        </span>{' '}
                        <span className="text-gray-500 dark:text-dark-textMuted">
                          {wochentagKurz(t.datum)}
                        </span>
                        {t.laeuft && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                            läuft
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-gray-700 dark:text-dark-text">
                        {t.beginn ? lokaleUhrzeit(t.beginn) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-gray-700 dark:text-dark-text">
                        {t.ende ? lokaleUhrzeit(t.ende) : t.laeuft ? 'offen' : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-right text-gray-700 dark:text-dark-text">
                        {t.pausenMinuten > 0 ? `${t.pausenMinuten} min` : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-right text-gray-500 dark:text-dark-textMuted">
                        {t.gesetzlicherPausenabzug > 0 ? `−${t.gesetzlicherPausenabzug} min` : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-right font-semibold text-gray-900 dark:text-white">
                        {formatiereStunden(t.nettoMinuten)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {verstoss ? (
                          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        ) : warnung ? (
                          <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-dark-bg font-semibold text-gray-900 dark:text-white">
                  <td className="px-3 py-3 whitespace-nowrap">
                    Summe
                    <span className="ml-1 font-normal text-xs text-gray-500 dark:text-dark-textMuted">
                      ({summe.arbeitstage} Tage)
                    </span>
                  </td>
                  <td className="px-3 py-3" colSpan={2}>
                    <span className="font-normal text-xs text-gray-500 dark:text-dark-textMuted">
                      anwesend {formatiereStunden(summe.bruttoMinuten)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{summe.pausenMinuten} min</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {summe.gesetzlicherPausenabzug > 0
                      ? `−${summe.gesetzlicherPausenabzug} min`
                      : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatiereStunden(summe.nettoMinuten)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {summe.unvollstaendigeTage > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {summe.unvollstaendigeTage} Tag(e) sind unvollständig (gelb hinterlegt) und müssen vor
          der Lohnabrechnung nachgetragen werden.
        </p>
      )}

      {/* Tagesdetail */}
      {detailTag && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-50 dark:bg-dark-bg w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-full overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {parseISODatum(detailTag.datum).toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </h2>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">{mitarbeiterName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailDatum(null)}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-surfaceHover transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-dark-textMuted" />
              </button>
            </div>
            <div className="p-4">
              <TagesDetail
                auswertung={detailTag}
                events={events.filter((e) => e.datum === detailTag.datum)}
                istLeitung={istLeitung}
                onStornieren={
                  onStornieren
                    ? (ev) => {
                        setDetailDatum(null);
                        onStornieren(ev);
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiKarte({
  label,
  wert,
  betont,
  warnung,
  gefahr,
}: {
  label: string;
  wert: string;
  betont?: boolean;
  warnung?: boolean;
  gefahr?: boolean;
}) {
  const rahmen = gefahr
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/25'
    : warnung
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/25'
      : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${rahmen}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-dark-textMuted">
        {label}
      </div>
      <div
        className={`tabular-nums font-semibold ${
          betont ? 'text-lg text-gray-900 dark:text-white' : 'text-gray-800 dark:text-dark-text'
        }`}
      >
        {wert}
      </div>
    </div>
  );
}
