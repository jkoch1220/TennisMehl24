import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, RefreshCw } from 'lucide-react';
import type { ProduktionsBereich, ProduktionsBuchung } from '../../types/produktion';
import { BEREICHE, getBereich, getGebinde, getKoernung } from '../../types/produktion';
import BelegKarte from './BelegKarte';
import { ABSCHNITT_LABEL, FOKUS, STATION } from './produktionUi';
import { formatDatumKurz, formatTonnen, heuteDatum, summe, verschiebeTage } from './statistik';
import type { WartendeBuchung } from './useWarteschlange';

/**
 * UTF-8-BOM als erstes Byte der CSV.
 *
 * Ohne sie liest Excel die Datei als Windows-1252 und macht aus "Körnung"
 * ein "KÃ¶rnung". Als Escape statt als literales Zeichen, weil die BOM sonst
 * im Editor unsichtbar mitten im Code steht — ESLint meldete sie als
 * "irregular whitespace", und beim Aufräumen wird sie für einen Tippfehler
 * gehalten und entfernt. Dann sind die Umlaute im Export kaputt.
 */
const EXCEL_BOM = '\uFEFF';

/**
 * Belegliste eines Tages.
 *
 * Für Mitarbeiter zeigt sie ausschließlich die EIGENEN Buchungen — samt der
 * Zwischensumme je Bereich. Das ist ausdrücklich erlaubt und keine Auswertung:
 * wer am Schichtende nicht sieht, ob seine acht Buchungen zusammen plausibel
 * sind, bemerkt eine vergessene Buchung nicht. Verboten sind Vergleichswerte,
 * Zeitreihen und fremde Zahlen — nicht die Zwischensumme der eigenen Arbeit.
 */

export interface TagesJournalProps {
  buchungen: ProduktionsBuchung[];
  wartend: WartendeBuchung[];
  /** Buchungen anderer Mitarbeiter anzeigen? */
  zeigeFremde: boolean;
  /** Darf beliebige Buchungen stornieren (sonst nur eigene, frische). */
  darfStornieren: boolean;
  darfExportieren: boolean;
  eigeneId: string | null;
  onStorno: (buchung: ProduktionsBuchung) => void;
  onNochmalSenden: () => void;
  onVerwerfen: (clientId: string) => void;
  /** Anzahl fremder Änderungen seit dem letzten Laden. */
  fremdaenderungen: number;
  onNeuLaden: () => void;
}

/** 90 Sekunden gelten als „gerade eben" — so lange heißt Storno „Rückgängig". */
const SOFORT_FENSTER_MS = 90 * 1000;

/**
 * CSV mit Semikolon und BOM: Excel öffnet UTF-8 ohne BOM als Latin-1 und macht
 * aus „Körnung" ein „KÃ¶rnung". Werte werden gequotet, weil ein Semikolon im
 * Lieferantennamen sonst die Zeile zerlegt.
 */
const csvFeld = (wert: unknown): string => {
  const text = wert === null || wert === undefined ? '' : String(wert);
  return `"${text.replace(/"/g, '""')}"`;
};

const TagesJournal: React.FC<TagesJournalProps> = ({
  buchungen,
  wartend,
  zeigeFremde,
  darfStornieren,
  darfExportieren,
  eigeneId,
  onStorno,
  onNochmalSenden,
  onVerwerfen,
  fremdaenderungen,
  onNeuLaden,
}) => {
  const [tag, setTag] = useState(heuteDatum());
  const [bereichsFilter, setBereichsFilter] = useState<ProduktionsBereich | null>(null);

  const desTages = useMemo(() => {
    let liste = buchungen.filter((b) => b.datum === tag);
    if (!zeigeFremde && eigeneId) liste = liste.filter((b) => b.erfasstVonId === eigeneId);
    if (bereichsFilter) liste = liste.filter((b) => b.bereich === bereichsFilter);
    return liste;
  }, [buchungen, tag, zeigeFremde, eigeneId, bereichsFilter]);

  const summen = useMemo(() => {
    const aktiv = desTages.filter((b) => !b.storniert);
    return BEREICHE.map((def) => ({
      def,
      tonnen: summe(aktiv.filter((b) => b.bereich === def.wert)),
      anzahl: aktiv.filter((b) => b.bereich === def.wert).length,
    }));
  }, [desTages]);

  const exportiere = () => {
    const kopf = [
      'Datum',
      'Uhrzeit',
      'Bereich',
      'Tonnen',
      'Körnung',
      'Gebinde',
      'Anzahl',
      'Lieferant',
      'Wiegeschein',
      'Kennzeichen',
      'Erfasst von',
      'Storniert',
      'Storno-Grund',
    ];
    const zeilen = desTages.map((b) =>
      [
        b.datum,
        new Date(b.zeitpunkt).toLocaleTimeString('de-DE'),
        getBereich(b.bereich).label,
        b.tonnen.toLocaleString('de-DE'),
        getKoernung(b.koernung)?.label ?? '',
        getGebinde(b.gebinde)?.label ?? '',
        b.gebindeAnzahl ?? '',
        b.lieferant ?? '',
        b.wiegeschein ?? '',
        b.kennzeichen ?? '',
        b.erfasstVonName ?? '',
        b.storniert ? 'ja' : 'nein',
        b.storniertGrund ?? '',
      ].map(csvFeld).join(';')
    );

    const inhalt = `${EXCEL_BOM}${kopf.map(csvFeld).join(';')}\n${zeilen.join('\n')}`;
    const blob = new Blob([inhalt], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produktion-${tag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Erst nach einem Tick freigeben — sofortiges revoke bricht den Download
    // in Firefox ab.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const istHeute = tag === heuteDatum();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Vorheriger Tag"
            onClick={() => setTag(verschiebeTage(tag, -1))}
            className={`rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 ${FOKUS}`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[104px] text-center text-sm font-bold text-gray-900 dark:text-slate-100">
            {formatDatumKurz(tag)}
          </span>
          <button
            type="button"
            aria-label="Nächster Tag"
            disabled={istHeute}
            onClick={() => setTag(verschiebeTage(tag, 1))}
            className={`rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-800 ${FOKUS}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {darfExportieren && desTages.length > 0 && (
          <button
            type="button"
            onClick={exportiere}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800 ${FOKUS}`}
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
      </div>

      {fremdaenderungen > 0 && (
        <button
          type="button"
          onClick={onNeuLaden}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-200"
        >
          <RefreshCw className="h-4 w-4" />
          {fremdaenderungen} neue {fremdaenderungen === 1 ? 'Buchung' : 'Buchungen'} · Aktualisieren
        </button>
      )}

      <div className="mb-3">
        <span className={`pz-panel mb-1.5 block ${ABSCHNITT_LABEL}`}>
          {zeigeFremde ? 'Summe' : 'Meine heute'}
        </span>
        <div className="flex gap-2">
          {summen.map(({ def, tonnen, anzahl }) => {
            const aktiv = bereichsFilter === def.wert;
            return (
              <button
                key={def.wert}
                type="button"
                onClick={() => setBereichsFilter(aktiv ? null : def.wert)}
                className={[
                  'flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors',
                  FOKUS,
                  aktiv
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                ].join(' ')}
              >
                <span
                  className={`block text-[10px] font-bold uppercase tracking-wider ${
                    aktiv ? 'opacity-70' : STATION[def.wert].text
                  }`}
                >
                  {def.kurz}
                </span>
                <span className="block text-sm font-bold tabular-nums">
                  {formatTonnen(tonnen, 1)} t
                </span>
                <span className={`block text-[10px] ${aktiv ? 'opacity-60' : 'text-gray-400'}`}>
                  {anzahl} {anzahl === 1 ? 'Buchung' : 'Buchungen'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
        {wartend.length > 0 && istHeute && (
          <div className="space-y-2">
            {wartend.map((w) => (
              <BelegKarte
                key={w.clientId}
                wartet
                zeigeErfasser={false}
                buchung={{
                  $id: w.clientId,
                  bereich: w.bereich,
                  datum: w.datum,
                  zeitpunkt: w.erfasstAm,
                  tonnen: w.tonnen ?? 0,
                  koernung: w.koernung ?? null,
                  lieferant: w.lieferant ?? null,
                  kennzeichen: w.kennzeichen ?? null,
                  wiegeschein: w.wiegeschein ?? null,
                  gebinde: w.gebinde ?? null,
                  gebindeAnzahl: w.gebindeAnzahl ?? null,
                  notiz: w.notiz ?? null,
                  storniert: false,
                }}
                onNochmalSenden={onNochmalSenden}
                onVerwerfen={() => onVerwerfen(w.clientId)}
              />
            ))}
          </div>
        )}

        {desTages.length === 0 && wartend.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-2 h-10 w-10 text-gray-300 dark:text-slate-700" />
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Keine Buchungen für {formatDatumKurz(tag)}
            </p>
          </div>
        ) : (
          desTages.map((b) => {
            const frisch =
              !!eigeneId &&
              b.erfasstVonId === eigeneId &&
              Date.now() - new Date(b.zeitpunkt).getTime() < SOFORT_FENSTER_MS;
            // Die Rücknahme der eigenen, gerade getätigten Buchung ist Teil der
            // Eingabe, nicht der Verwaltung — sie hängt deshalb bewusst nicht
            // am `delete`-Recht.
            const darf = darfStornieren || frisch;
            return (
              <BelegKarte
                key={b.$id}
                buchung={b}
                sofortRuecknahme={frisch}
                zeigeErfasser={zeigeFremde}
                onStorno={darf ? onStorno : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default TagesJournal;
