import React from 'react';
import type { ProduktionsBereich } from '../../types/produktion';
import { getBereich } from '../../types/produktion';
import { EINHEIT, PANEL_LABEL, SCHRAFFUR, STATION, ZAHL_GROSS } from './produktionUi';
import { formatTonnen } from './statistik';

/**
 * Das Wägeterminal.
 *
 * In allen drei Bereichen steht hier dieselbe Zahl an derselben Stelle, in
 * derselben Größe, mit derselben Einheit: **was gebucht wird, ist die obere
 * Zahl.** Bei der Abfüllung ist das die errechnete Tonnage, nicht die
 * eingegebene Stückzahl — die steht kleiner in der Ableitungszeile darunter.
 *
 * Der farbige Streifen links ist das Signaturelement: er sagt aus zwei Metern
 * Entfernung, in welchen Bestand gebucht wird, und wechselt beim Stationswechsel
 * mit einer 180-ms-Blende. Ein Fehlgriff beim Bereich ist der teuerste Fehler
 * dieser Maske — er fällt beim Buchen nicht auf.
 *
 * Die Zahl animiert bewusst NICHT. Eine Ziffer, die sich genau dann bewegt,
 * wenn sie geprüft werden muss, ist bei Sonne, Staub und Handschuh unlesbar.
 * Eine Waage zeigt Zahlen, sie führt sie nicht vor.
 */

export interface WertAnzeigeProps {
  bereich: ProduktionsBereich;
  /** Die maßgebliche Tonnage. */
  tonnen: number;
  /** Zweite Zeile, z.B. „12 Paletten × 1.000 kg". */
  ableitung?: string | null;
  /** Buchung für einen zurückliegenden Tag — bekommt Ring und Schraffur. */
  istNachtrag?: boolean;
  /** Datum in Klartext, wenn nachgetragen wird. */
  nachtragDatum?: string;
}

const WertAnzeige: React.FC<WertAnzeigeProps> = ({
  bereich,
  tonnen,
  ableitung,
  istNachtrag = false,
  nachtragDatum,
}) => {
  const def = getBereich(bereich);
  const stil = STATION[bereich];
  const hatWert = tonnen > 0;
  // Rohmaterial kommt vom Wiegeschein und ist auf 10 kg genau — dort zwei
  // Nachkommastellen. Mahlen und Abfüllung sind gröber.
  const stellen = bereich === 'rohmaterial' ? 2 : hatWert && tonnen % 1 !== 0 ? 3 : 1;

  return (
    <section
      aria-live="polite"
      className={[
        'pz-karte relative isolate overflow-hidden rounded-2xl px-5 pb-2 pt-3',
        'border border-gray-200 bg-white shadow-sm',
        'dark:border-slate-700 dark:bg-slate-900',
        istNachtrag ? 'ring-2 ring-amber-500/70' : '',
      ].join(' ')}
    >
      {/* Materialstreifen — eigenes Element, damit die Blende über
          transition-colors läuft und nicht die ganze Karte umfärbt. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[5px] transition-colors duration-[180ms] ${stil.streifen}`}
      />

      {istNachtrag && (
        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-amber-500 ${SCHRAFFUR}`} />
      )}

      <div className="flex items-start justify-between gap-3 pl-2">
        <p className={`pz-panel ${PANEL_LABEL}`}>
          {def.label} · {def.beschreibung}
        </p>
        {istNachtrag && nachtragDatum && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            Nachtrag {nachtragDatum}
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-end gap-2 pl-2">
        <span
          className={`pz-zahl ${ZAHL_GROSS} transition-colors ${
            hatWert ? 'text-gray-900 dark:text-slate-50' : 'text-gray-300 dark:text-slate-700'
          }`}
        >
          {formatTonnen(tonnen, stellen)}
        </span>
        <span className={EINHEIT}>t</span>
      </div>

      <p
        className={`pz-panel min-h-[18px] pl-2 text-right text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-150 ${
          ableitung ? 'text-gray-500 dark:text-slate-400' : 'text-transparent'
        }`}
      >
        {ableitung || '–'}
      </p>
    </section>
  );
};

export default WertAnzeige;
