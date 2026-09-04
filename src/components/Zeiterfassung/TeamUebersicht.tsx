/**
 * Team-Auswertung — der Blick der Leitung über ALLE Mitarbeiter eines Monats.
 *
 * Die Monatsübersicht beantwortet „wie war mein Monat?", diese Ansicht
 * beantwortet „wo muss ich hinschauen?". Deshalb steht hier nicht die einzelne
 * Stempelkette im Vordergrund, sondern das, was Handlung auslöst: unvollständige
 * Tage, Verstöße gegen Höchstarbeitszeit und Ruhezeit, automatische Pausenabzüge.
 *
 * Geladen wird der ganze Monat in EINEM Aufruf (die Fassade liefert der Leitung
 * alle Events des Zeitraums) und danach je Mitarbeiter ausgewertet — nicht ein
 * Aufruf pro Person, das wären bei zwölf Monaten schnell hundert Anfragen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import {
  formatiereStunden,
  type TagesAuswertung,
  type ZeitMitarbeiter,
} from '../../types/zeiterfassung';
import { monatsGrenzen, summiere, werteZeitraumAus } from '../../utils/zeiterfassungBerechnung';
import { zeiterfassungService } from '../../services/zeiterfassungService';

interface TeamUebersichtProps {
  /** Öffnet die Einzelansicht für einen Mitarbeiter. */
  onMitarbeiterWaehlen: (mitarbeiterId: string) => void;
  /** Erhöht sich nach jeder Korrektur — erzwingt ein Neuladen. */
  neuLadenSchluessel?: number;
}

interface ZeileDaten {
  mitarbeiter: ZeitMitarbeiter;
  tage: TagesAuswertung[];
  summe: ReturnType<typeof summiere>;
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
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

function aktuellerMonat(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TeamUebersicht({
  onMitarbeiterWaehlen,
  neuLadenSchluessel = 0,
}: TeamUebersichtProps) {
  const [monat, setMonat] = useState(aktuellerMonat);
  const [zeilen, setZeilen] = useState<ZeileDaten[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nurAuffaellige, setNurAuffaellige] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const { von, bis } = monatsGrenzen(monat);
      const { events, mitarbeiter } = await zeiterfassungService.ladeZeitraum(von, bis);
      const jetzt = new Date().toISOString();

      const berechnet = mitarbeiter
        .map((m) => {
          const tage = werteZeitraumAus(von, bis, m.id, events, jetzt);
          return { mitarbeiter: m, tage, summe: summiere(tage) };
        })
        // Wer im Monat nichts gestempelt hat und auch keine Lücke hat, ist keine
        // Zeile wert — sonst besteht die Tabelle aus Nullen.
        .filter((z) => z.summe.arbeitstage > 0 || z.summe.unvollstaendigeTage > 0)
        .sort((a, b) => a.mitarbeiter.name.localeCompare(b.mitarbeiter.name, 'de'));

      setZeilen(berechnet);
    } catch (e) {
      setFehler(fehlerText(e));
      setZeilen([]);
    } finally {
      setLaedt(false);
    }
  }, [monat]);

  useEffect(() => {
    void laden();
  }, [laden, neuLadenSchluessel]);

  const sichtbar = useMemo(
    () =>
      nurAuffaellige
        ? zeilen.filter((z) => z.summe.unvollstaendigeTage > 0 || z.summe.verstoesse > 0)
        : zeilen,
    [zeilen, nurAuffaellige]
  );

  const gesamt = useMemo(
    () => ({
      netto: zeilen.reduce((s, z) => s + z.summe.nettoMinuten, 0),
      arbeitstage: zeilen.reduce((s, z) => s + z.summe.arbeitstage, 0),
      luecken: zeilen.reduce((s, z) => s + z.summe.unvollstaendigeTage, 0),
      verstoesse: zeilen.reduce((s, z) => s + z.summe.verstoesse, 0),
    }),
    [zeilen]
  );

  /** Eine Zeile je Mitarbeiter — die Übersicht, die zur Lohnbuchhaltung geht. */
  const exportiere = () => {
    const BOM = '﻿';
    const kopf = [
      'Mitarbeiter',
      'Monat',
      'Arbeitstage',
      'Netto (h:mm)',
      'Netto (Stunden)',
      'Anwesend (h:mm)',
      'Pause gestempelt (h:mm)',
      'Pausenabzug gesetzlich (h:mm)',
      'Unvollständige Tage',
      'Verstöße',
    ];
    const zeilenTexte = zeilen.map((z) =>
      [
        z.mitarbeiter.name,
        monat,
        String(z.summe.arbeitstage),
        formatiereStunden(z.summe.nettoMinuten).replace(' h', ''),
        (z.summe.nettoMinuten / 60).toFixed(2).replace('.', ','),
        formatiereStunden(z.summe.bruttoMinuten).replace(' h', ''),
        formatiereStunden(z.summe.pausenMinuten).replace(' h', ''),
        formatiereStunden(z.summe.gesetzlicherPausenabzug).replace(' h', ''),
        String(z.summe.unvollstaendigeTage),
        String(z.summe.verstoesse),
      ].join(';')
    );
    const csv = BOM + [kopf.join(';'), ...zeilenTexte].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zeiterfassung-Team-${monat}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Monatswahl — auf dem Handy volle Breite, damit die Pfeile treffbar bleiben */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonat(monatVerschieben(monat, -1))}
            className="rounded-lg border border-gray-200 p-2.5 text-gray-600 hover:bg-gray-50 dark:border-dark-600 dark:text-gray-300 dark:hover:bg-dark-700"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[9.5rem] text-center font-semibold text-gray-900 dark:text-gray-100">
            {monatsName(monat)}
          </span>
          <button
            onClick={() => setMonat(monatVerschieben(monat, 1))}
            className="rounded-lg border border-gray-200 p-2.5 text-gray-600 hover:bg-gray-50 dark:border-dark-600 dark:text-gray-300 dark:hover:bg-dark-700"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNurAuffaellige((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              nurAuffaellige
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-dark-600 dark:text-gray-300 dark:hover:bg-dark-700'
            }`}
          >
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            Nur Auffällige
          </button>
          <button
            onClick={exportiere}
            disabled={zeilen.length === 0}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-dark-600 dark:text-gray-300 dark:hover:bg-dark-700"
          >
            <Download className="mr-1.5 inline h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Kennzahlen des Monats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Gesamt netto', wert: formatiereStunden(gesamt.netto), ton: 'normal' },
          { label: 'Arbeitstage', wert: String(gesamt.arbeitstage), ton: 'normal' },
          {
            label: 'Offene Tage',
            wert: String(gesamt.luecken),
            ton: gesamt.luecken > 0 ? 'warnung' : 'normal',
          },
          {
            label: 'Verstöße',
            wert: String(gesamt.verstoesse),
            ton: gesamt.verstoesse > 0 ? 'verstoss' : 'normal',
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border p-3 ${
              k.ton === 'verstoss'
                ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                : k.ton === 'warnung'
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                  : 'border-gray-200 bg-white dark:border-dark-600 dark:bg-dark-800'
            }`}
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">{k.label}</div>
            <div
              className={`mt-0.5 text-xl font-bold tabular-nums ${
                k.ton === 'verstoss'
                  ? 'text-red-700 dark:text-red-300'
                  : k.ton === 'warnung'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {k.wert}
            </div>
          </div>
        ))}
      </div>

      {fehler && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{fehler}</span>
        </div>
      )}

      {laedt ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Monat wird ausgewertet …
        </div>
      ) : sichtbar.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-dark-600 dark:bg-dark-800">
          <Users className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {nurAuffaellige
              ? 'Keine Auffälligkeiten in diesem Monat.'
              : 'In diesem Monat wurden noch keine Zeiten erfasst.'}
          </p>
        </div>
      ) : (
        <>
          {/* Handy: Karten statt Tabelle — eine zehnspaltige Tabelle ist auf
              375 px nicht lesbar, und genau dort wird das Tool bedient. */}
          <div className="space-y-3 lg:hidden">
            {sichtbar.map((z) => (
              <button
                key={z.mitarbeiter.id}
                onClick={() => onMitarbeiterWaehlen(z.mitarbeiter.id)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-emerald-300 dark:border-dark-600 dark:bg-dark-800 dark:hover:border-emerald-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: z.mitarbeiter.farbe }}
                    />
                    <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                      {z.mitarbeiter.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatiereStunden(z.summe.nettoMinuten)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{z.summe.arbeitstage} Tage</span>
                  <span>anwesend {formatiereStunden(z.summe.bruttoMinuten)}</span>
                  <span>Pause {formatiereStunden(z.summe.pausenMinuten)}</span>
                </div>
                {(z.summe.unvollstaendigeTage > 0 || z.summe.verstoesse > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {z.summe.unvollstaendigeTage > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {z.summe.unvollstaendigeTage} offene Tage
                      </span>
                    )}
                    {z.summe.verstoesse > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
                        {z.summe.verstoesse} Verstöße
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Ab Laptop die volle Tabelle */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white lg:block dark:border-dark-600 dark:bg-dark-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                  <th className="px-4 py-3 text-right font-medium">Tage</th>
                  <th className="px-4 py-3 text-right font-medium">Anwesend</th>
                  <th className="px-4 py-3 text-right font-medium">Pause</th>
                  <th className="px-4 py-3 text-right font-medium">Abzug</th>
                  <th className="px-4 py-3 text-right font-medium">Netto</th>
                  <th className="px-4 py-3 text-right font-medium">Hinweise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                {sichtbar.map((z) => (
                  <tr
                    key={z.mitarbeiter.id}
                    onClick={() => onMitarbeiterWaehlen(z.mitarbeiter.id)}
                    className="cursor-pointer transition hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: z.mitarbeiter.farbe }}
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {z.mitarbeiter.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {z.summe.arbeitstage}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatiereStunden(z.summe.bruttoMinuten)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatiereStunden(z.summe.pausenMinuten)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {z.summe.gesetzlicherPausenabzug > 0
                        ? formatiereStunden(z.summe.gesetzlicherPausenabzug)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatiereStunden(z.summe.nettoMinuten)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {z.summe.unvollstaendigeTage > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {z.summe.unvollstaendigeTage} offen
                          </span>
                        )}
                        {z.summe.verstoesse > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
                            {z.summe.verstoesse} Verstöße
                          </span>
                        )}
                        {z.summe.unvollstaendigeTage === 0 && z.summe.verstoesse === 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 dark:border-dark-600 dark:bg-dark-700">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                    Gesamt ({sichtbar.length})
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {gesamt.arbeitstage}
                  </td>
                  <td colSpan={3} />
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatiereStunden(gesamt.netto)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Zeile antippen, um die einzelnen Tage und Stempel zu sehen.
          </p>
        </>
      )}
    </div>
  );
}
