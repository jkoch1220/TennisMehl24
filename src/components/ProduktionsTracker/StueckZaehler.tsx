import React, { useCallback, useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Gebinde } from '../../types/produktion';
import { getGebinde } from '../../types/produktion';
import { FOKUS } from './produktionUi';
import StueckGlyphen from './StueckGlyphen';
import { melde, spieleKlang, vibriere } from './feedback';

/**
 * Stückzähler für die Abfüllung.
 *
 * Ein Rad wäre hier falsch: Paletten sind abzählbar. Ein stufenloses
 * Bedienelement für diskrete Objekte ist eine Lüge über den Gegenstand — und
 * es lädt dazu ein, bei 12 zu landen, wenn 13 gemeint waren.
 *
 * Die Glyphenreihe darüber ist der eigentliche Trick: zwölf Balken in
 * Fünfergruppen sind als BILD prüfbar, ohne die Ziffer zu lesen. Wer mit
 * Handschuhen und in Eile bucht, sieht den Zahlendreher 21 statt 12 dort
 * sofort — an der Ziffer nicht.
 */

export interface StueckZaehlerProps {
  wert: number;
  onWert: (wert: number) => void;
  gebinde: Gebinde | null;
  max?: number;
  bereich?: 'abfuellung';
  /** Öffnet den Ziffernblock — erscheint ab großen Stückzahlen. */
  onZahlEingeben?: () => void;
}

const ZAEHLER_TASTE =
  'pz-rahmen flex h-20 flex-1 items-center justify-center rounded-xl border border-gray-300 ' +
  'bg-white text-gray-900 shadow-sm transition-colors select-none touch-manipulation ' +
  'active:bg-gray-100 disabled:opacity-40 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:active:bg-slate-700';

const SCHNELL_TASTE =
  'pz-rahmen min-h-[52px] flex-1 rounded-lg border border-gray-200 bg-white text-base font-bold ' +
  'tabular-nums text-gray-700 transition-colors select-none touch-manipulation active:bg-gray-100 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:active:bg-slate-800';

const StueckZaehler: React.FC<StueckZaehlerProps> = ({
  wert,
  onWert,
  gebinde,
  max = 999,
  onZahlEingeben,
}) => {
  const def = getGebinde(gebinde);

  /**
   * `wertRef` ist die Wahrheit für ALLE Rechenschritte, nicht nur für den
   * Halte-Timer.
   *
   * Der Grund: zwei schnelle Tipps auf „+1" landen in derselben Render-Runde.
   * Rechnet der zweite Handler auf dem Prop `wert`, sieht er noch den alten
   * Stand — das Ergebnis ist identisch mit dem ersten Klick, `setze` erkennt
   * „keine Änderung" und verwirft ihn. Aus zwei Tipps wird eine Palette. Genau
   * das passiert an der Anlage mit Handschuhen ständig.
   */
  const timer = useRef<number | null>(null);
  const wertRef = useRef(wert);
  const zaehler = useRef(0);
  wertRef.current = wert;

  const setze = useCallback(
    (neu: number, mitTon = true) => {
      const begrenzt = Math.max(0, Math.min(max, Math.round(neu)));
      if (begrenzt === wertRef.current) {
        if (mitTon && (neu < 0 || neu > max)) melde('anschlag');
        return;
      }
      wertRef.current = begrenzt;
      if (mitTon) melde('tick');
      onWert(begrenzt);
    },
    [max, onWert]
  );

  const stoppe = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    zaehler.current = 0;
  }, []);

  /**
   * Halten läuft nach 500 ms an und beschleunigt binnen gut einer Sekunde von
   * 1/s auf 8/s. Rückmeldung nur alle fünf Schritte — sonst rattert das Gerät.
   */
  const starteHalten = useCallback(
    (richtung: 1 | -1) => {
      stoppe();
      const beginn = window.setTimeout(() => {
        let abstand = 220;
        const schritt = () => {
          setze(wertRef.current + richtung, false);
          zaehler.current += 1;
          if (zaehler.current % 5 === 0) {
            vibriere('tick');
            spieleKlang('tick');
          }
          abstand = Math.max(90, abstand - 20);
          timer.current = window.setTimeout(schritt, abstand) as unknown as number;
        };
        schritt();
      }, 500);
      timer.current = beginn as unknown as number;
    },
    [setze, stoppe]
  );

  useEffect(() => stoppe, [stoppe]);

  const tonnen = def ? (wert * def.kiloProEinheit) / 1000 : 0;

  return (
    <div className="space-y-3">
      <StueckGlyphen anzahl={wert} />

      <div
        className="flex items-stretch gap-3"
        role="spinbutton"
        aria-valuenow={wert}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={
          def
            ? `${wert} ${wert === 1 ? def.label : def.mehrzahl}, ${tonnen.toLocaleString('de-DE')} Tonnen`
            : `${wert}`
        }
        aria-label="Anzahl Gebinde"
      >
        <button
          type="button"
          aria-label={def ? `${def.label} abziehen` : 'Weniger'}
          disabled={wert <= 0}
          onClick={() => setze(wertRef.current - 1)}
          onPointerDown={() => starteHalten(-1)}
          onPointerUp={stoppe}
          onPointerLeave={stoppe}
          onPointerCancel={stoppe}
          className={`${ZAEHLER_TASTE} ${FOKUS} max-w-[92px]`}
        >
          <Minus className="h-9 w-9" />
        </button>

        <div className="flex min-w-[104px] flex-col items-center justify-center rounded-xl bg-gray-50 px-4 dark:bg-slate-800/60">
          <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-slate-50">
            {wert}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            {def ? (wert === 1 ? def.label : def.mehrzahl) : 'Stück'}
          </span>
        </div>

        <button
          type="button"
          aria-label={def ? `${def.label} hinzufügen` : 'Mehr'}
          disabled={wert >= max}
          onClick={() => setze(wertRef.current + 1)}
          onPointerDown={() => starteHalten(1)}
          onPointerUp={stoppe}
          onPointerLeave={stoppe}
          onPointerCancel={stoppe}
          className={`${ZAEHLER_TASTE} ${FOKUS} max-w-[92px]`}
        >
          <Plus className="h-9 w-9" />
        </button>
      </div>

      <div className="flex gap-2">
        {[1, 5, 10].map((stufe) => (
          <button
            key={stufe}
            type="button"
            onClick={() => {
              melde('raste');
              setze(wertRef.current + stufe, false);
            }}
            className={`${SCHNELL_TASTE} ${FOKUS}`}
          >
            +{stufe}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            melde('raste');
            setze(0, false);
          }}
          className={`${SCHNELL_TASTE} ${FOKUS} max-w-[72px]`}
        >
          0
        </button>
      </div>

      {wert >= 40 && onZahlEingeben && (
        <button
          type="button"
          onClick={onZahlEingeben}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-semibold text-gray-600 dark:border-slate-600 dark:text-slate-300"
        >
          Zahl direkt eingeben
        </button>
      )}
    </div>
  );
};

export default StueckZaehler;
