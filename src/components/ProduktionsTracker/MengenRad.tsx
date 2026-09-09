import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { bewegungReduziert, melde, spieleKlang, vibriere, weckeAudio } from './feedback';

/**
 * Mengenrad — die zentrale Eingabe an der Anlage.
 * ============================================================================
 *
 * Ein Rad, das sich mit dem Daumen drehen lässt, mit Trägheit nachläuft und bei
 * jedem Schritt spürbar rastet. Es ersetzt den Vorgänger (SwipeWheelPicker) und
 * behebt dessen vier Schwächen:
 *
 *   • Keine Tastaturbedienung. Am Desktop ließ sich der Wert nur ziehen.
 *     Jetzt: Pfeiltasten (±1), Bild auf/ab (±10), Pos1/Ende (Min/Max).
 *   • Kein Screenreader. Jetzt role="slider" mit aria-valuenow/min/max/text.
 *   • Keine Nachkommastellen. Gebindezahlen sind ganzzahlig, Tonnen nicht —
 *     eine halbe Tonne ließ sich schlicht nicht eintragen.
 *   • Fest orange. Die drei Bereiche sind farblich unterscheidbar; das Rad
 *     nimmt die Farbe des Bereichs an, in dem gerade gebucht wird.
 *
 * `prefers-reduced-motion` schaltet Trägheit und Übergänge ab — der Wert
 * springt dann direkt, statt auszulaufen.
 */

export interface MengenRadProps {
  wert: number;
  onChange: (wert: number) => void;
  min?: number;
  max?: number;
  /** Schrittweite. 1 für Stückzahlen, 0.5 oder 0.1 für Tonnen. */
  schritt?: number;
  /** Nachkommastellen der Anzeige. Wird aus `schritt` abgeleitet, wenn nicht gesetzt. */
  stellen?: number;
  /** Kurzzeichen hinter der Zahl, z.B. „t" oder „Pal." */
  einheit: string;
  /** Ausgeschriebene Einheit für Screenreader, z.B. „Tonnen" */
  einheitLang?: string;
  /** Direkt antippbare Werte über dem Rad. */
  schnellwerte?: number[];
  /** Pixel je Schritt. Kleiner = empfindlicher. */
  empfindlichkeit?: number;
  /** Tailwind-Gradient des aktiven Bereichs, z.B. „from-orange-500 to-amber-600" */
  farbe: string;
  /** Zusatzzeile unter der Zahl — hier steht bei Gebinden die errechnete Tonnage. */
  hinweis?: React.ReactNode;
}

const TRAEGHEIT = 0.9; // Abklingfaktor je Bild
const MIN_GESCHWINDIGKEIT = 0.4; // darunter steht das Rad
const SICHTBARE_RASTEN = 3; // Werte ober- und unterhalb der Mitte

const MengenRad: React.FC<MengenRadProps> = ({
  wert,
  onChange,
  min = 0,
  max = 999,
  schritt = 1,
  stellen,
  einheit,
  einheitLang,
  schnellwerte = [],
  empfindlichkeit = 16,
  farbe,
  hinweis,
}) => {
  const nachkomma = stellen ?? (Number.isInteger(schritt) ? 0 : String(schritt).split('.')[1]?.length ?? 1);
  const ruhig = useMemo(() => bewegungReduziert(), []);

  const [zieht, setZieht] = useState(false);
  const [versatz, setVersatz] = useState(0);

  const radRef = useRef<HTMLDivElement>(null);
  const geschwindigkeit = useRef(0);
  const letztesY = useRef(0);
  const letzteZeit = useRef(0);
  const bildRef = useRef<number | null>(null);
  const startWert = useRef(wert);
  const summeDelta = useRef(0);
  const letzterWert = useRef(wert);

  // Synchron, nicht im Effekt: ein Effekt läuft erst NACH dem Render, und bis
  // dahin hätte ein zweiter Tastendruck noch den alten Stand gesehen.
  letzterWert.current = wert;

  /** Auf Schrittraster runden und in die Grenzen zwingen. */
  const begrenze = useCallback(
    (roh: number): number => {
      const gerastert = Math.round(roh / schritt) * schritt;
      const begrenzt = Math.max(min, Math.min(max, gerastert));
      // Fließkomma: 0.1 + 0.2 ist nicht 0.3. Ohne diese Rundung stehen im Rad
      // Werte wie 12.300000000000001.
      return Number(begrenzt.toFixed(nachkomma + 2));
    },
    [min, max, schritt, nachkomma]
  );

  const setzeWert = useCallback(
    (roh: number, quelle: 'zug' | 'trägheit' | 'taste' | 'schnellwert') => {
      const neu = begrenze(roh);

      if (neu !== letzterWert.current) {
        const sprung = Math.abs(neu - letzterWert.current) / schritt;
        if (quelle === 'schnellwert') melde('raste');
        else if (quelle === 'taste') melde('raste');
        else if (sprung >= 5) melde('raste');
        else melde('tick');

        letzterWert.current = neu;
        onChange(neu);
      } else if ((roh < min && neu === min) || (roh > max && neu === max)) {
        // Anschlag nur melden, wenn wirklich dagegen gefahren wird — sonst
        // brummt es bei jedem Bild, solange der Finger am Rand liegt.
        if (quelle !== 'trägheit') melde('anschlag');
      }
    },
    [begrenze, min, max, onChange, schritt]
  );

  // ---------------------------------------------------------------------
  // Trägheit
  // ---------------------------------------------------------------------

  const laufeAus = useCallback(() => {
    if (Math.abs(geschwindigkeit.current) < MIN_GESCHWINDIGKEIT) {
      geschwindigkeit.current = 0;
      setVersatz(0);
      bildRef.current = null;
      return;
    }

    summeDelta.current += geschwindigkeit.current;
    geschwindigkeit.current *= TRAEGHEIT;

    const rasten = Math.round(summeDelta.current / empfindlichkeit);
    if (rasten !== 0) setzeWert(startWert.current + rasten * schritt, 'trägheit');

    setVersatz(-(summeDelta.current % empfindlichkeit));
    bildRef.current = requestAnimationFrame(laufeAus);
  }, [empfindlichkeit, schritt, setzeWert]);

  const stoppeAuslauf = useCallback(() => {
    if (bildRef.current !== null) {
      cancelAnimationFrame(bildRef.current);
      bildRef.current = null;
    }
  }, []);

  const beginneZug = useCallback(
    (y: number) => {
      stoppeAuslauf();
      weckeAudio();
      setZieht(true);
      letztesY.current = y;
      letzteZeit.current = performance.now();
      startWert.current = wert;
      summeDelta.current = 0;
      geschwindigkeit.current = 0;
    },
    [stoppeAuslauf, wert]
  );

  const bewegeZug = useCallback(
    (y: number) => {
      const jetzt = performance.now();
      const deltaY = letztesY.current - y;
      const deltaZeit = Math.max(jetzt - letzteZeit.current, 1);

      geschwindigkeit.current = (deltaY / deltaZeit) * 16; // auf ~60 Bilder/s normiert
      summeDelta.current += deltaY;

      const rasten = Math.round(summeDelta.current / empfindlichkeit);
      if (rasten !== 0) setzeWert(startWert.current + rasten * schritt, 'zug');

      setVersatz(-(summeDelta.current % empfindlichkeit));
      letztesY.current = y;
      letzteZeit.current = jetzt;
    },
    [empfindlichkeit, schritt, setzeWert]
  );

  const beendeZug = useCallback(() => {
    setZieht(false);
    if (!ruhig && Math.abs(geschwindigkeit.current) > MIN_GESCHWINDIGKEIT) {
      bildRef.current = requestAnimationFrame(laufeAus);
    } else {
      geschwindigkeit.current = 0;
      setVersatz(0);
    }
  }, [laufeAus, ruhig]);

  // Maus: die Bewegung wird am document verfolgt, damit der Zug nicht abreißt,
  // sobald der Zeiger das Rad verlässt.
  useEffect(() => {
    if (!zieht) return;
    const bewegen = (e: MouseEvent) => bewegeZug(e.clientY);
    const loslassen = () => beendeZug();
    document.addEventListener('mousemove', bewegen);
    document.addEventListener('mouseup', loslassen);
    return () => {
      document.removeEventListener('mousemove', bewegen);
      document.removeEventListener('mouseup', loslassen);
    };
  }, [zieht, bewegeZug, beendeZug]);

  // Mausrad. Als nicht-passiver Listener, weil preventDefault sonst wirkungslos
  // ist und die Seite unter dem Rad wegscrollt.
  useEffect(() => {
    const el = radRef.current;
    if (!el) return;
    const scrollen = (e: WheelEvent) => {
      e.preventDefault();
      stoppeAuslauf();
      setzeWert(letzterWert.current + (e.deltaY > 0 ? -schritt : schritt), 'taste');
    };
    el.addEventListener('wheel', scrollen, { passive: false });
    return () => el.removeEventListener('wheel', scrollen);
  }, [wert, schritt, setzeWert, stoppeAuslauf]);

  useEffect(() => stoppeAuslauf, [stoppeAuslauf]);

  // ---------------------------------------------------------------------
  // Tastatur
  // ---------------------------------------------------------------------

  const aufTaste = useCallback(
    (e: React.KeyboardEvent) => {
      const gross = schritt * 10;
      let neu: number | null = null;

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          neu = letzterWert.current + schritt;
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          neu = letzterWert.current - schritt;
          break;
        case 'PageUp':
          neu = letzterWert.current + gross;
          break;
        case 'PageDown':
          neu = letzterWert.current - gross;
          break;
        case 'Home':
          neu = min;
          break;
        case 'End':
          neu = max;
          break;
        default:
          return;
      }

      e.preventDefault();
      stoppeAuslauf();
      weckeAudio();
      setzeWert(neu, 'taste');
    },
    [wert, schritt, min, max, setzeWert, stoppeAuslauf]
  );

  // ---------------------------------------------------------------------
  // Darstellung
  // ---------------------------------------------------------------------

  const formatiere = useCallback(
    (v: number) =>
      v.toLocaleString('de-DE', {
        minimumFractionDigits: nachkomma,
        maximumFractionDigits: nachkomma,
      }),
    [nachkomma]
  );

  const rasten = useMemo(() => {
    const liste: { wert: number | null; abstand: number }[] = [];
    for (let i = -SICHTBARE_RASTEN; i <= SICHTBARE_RASTEN; i++) {
      const v = Number((wert + i * schritt).toFixed(nachkomma + 2));
      liste.push({ wert: v >= min && v <= max ? v : null, abstand: i });
    }
    return liste;
  }, [wert, schritt, min, max, nachkomma]);

  // Auf `letzterWert.current` statt auf dem Prop rechnen: zwei schnelle Tipps
  // fallen in dieselbe Render-Runde, und der zweite würde sonst denselben
  // Ausgangswert sehen wie der erste — der Schritt ginge verloren.
  const schrittTaste = (richtung: 1 | -1) => {
    stoppeAuslauf();
    weckeAudio();
    setzeWert(letzterWert.current + richtung * schritt, 'taste');
  };

  return (
    <div className="flex w-full flex-col items-center">
      {schnellwerte.length > 0 && (
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          {schnellwerte.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                stoppeAuslauf();
                weckeAudio();
                summeDelta.current = 0;
                startWert.current = v;
                setVersatz(0);
                setzeWert(v, 'schnellwert');
              }}
              className={`min-h-[48px] min-w-[64px] rounded-2xl px-4 text-base font-bold tabular-nums transition-transform active:scale-95 ${
                wert === v
                  ? `bg-gradient-to-br ${farbe} text-white shadow-lg`
                  : 'bg-white/90 text-gray-700 shadow-md ring-1 ring-black/5 dark:bg-gray-800/90 dark:text-gray-200 dark:ring-white/10'
              }`}
            >
              {formatiere(v)}
              <span className="ml-0.5 text-sm font-semibold opacity-70">{einheit}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex w-full items-center justify-center gap-3">
        <button
          type="button"
          aria-label={`${einheitLang ?? einheit} verringern`}
          onClick={() => schrittTaste(-1)}
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/90 text-gray-600 shadow-md ring-1 ring-black/5 transition-transform active:scale-90 dark:bg-gray-800/90 dark:text-gray-300 dark:ring-white/10"
        >
          <ChevronDown className="h-7 w-7" />
        </button>

        <div
          ref={radRef}
          role="slider"
          tabIndex={0}
          aria-valuenow={wert}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={`${formatiere(wert)} ${einheitLang ?? einheit}`}
          aria-label={`Menge in ${einheitLang ?? einheit}`}
          onKeyDown={aufTaste}
          onTouchStart={(e) => beginneZug(e.touches[0].clientY)}
          onTouchMove={(e) => {
            e.preventDefault();
            bewegeZug(e.touches[0].clientY);
          }}
          onTouchEnd={beendeZug}
          onMouseDown={(e) => beginneZug(e.clientY)}
          className={`relative h-56 flex-1 cursor-ns-resize select-none overflow-hidden rounded-3xl bg-white/80 shadow-inner ring-1 ring-black/5 outline-none focus-visible:ring-4 focus-visible:ring-offset-2 dark:bg-gray-900/60 dark:ring-white/10 ${
            zieht ? 'ring-2' : ''
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Mittelband: markiert die Rastposition, ohne die Zahl zu überdecken */}
          <div
            className={`pointer-events-none absolute inset-x-3 top-1/2 h-20 -translate-y-1/2 rounded-2xl bg-gradient-to-br ${farbe} opacity-[0.13]`}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/95 to-transparent dark:from-gray-900/95" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white/95 to-transparent dark:from-gray-900/95" />

          <div
            className="flex h-full flex-col items-center justify-center"
            style={{
              transform: `translateY(${versatz}px)`,
              transition: zieht || ruhig ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {rasten.map(({ wert: v, abstand }) => {
              const mitte = abstand === 0;
              const entfernung = Math.abs(abstand);
              return (
                <div
                  key={abstand}
                  aria-hidden={!mitte}
                  className={`flex h-[52px] w-full items-center justify-center tabular-nums ${
                    mitte
                      ? 'text-5xl font-black text-gray-900 dark:text-white'
                      : 'text-2xl font-semibold text-gray-400 dark:text-gray-500'
                  }`}
                  style={{ opacity: mitte ? 1 : Math.max(0.15, 1 - entfernung * 0.3) }}
                >
                  {v === null ? '' : formatiere(v)}
                  {mitte && (
                    <span className="ml-2 text-2xl font-bold text-gray-400 dark:text-gray-500">
                      {einheit}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label={`${einheitLang ?? einheit} erhöhen`}
          onClick={() => schrittTaste(1)}
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/90 text-gray-600 shadow-md ring-1 ring-black/5 transition-transform active:scale-90 dark:bg-gray-800/90 dark:text-gray-300 dark:ring-white/10"
        >
          <ChevronUp className="h-7 w-7" />
        </button>
      </div>

      {hinweis && <div className="mt-4 w-full text-center">{hinweis}</div>}
    </div>
  );
};

export default MengenRad;

/** Wieder-Export, damit Aufrufer die Rückmeldung nicht separat importieren müssen. */
export { melde, spieleKlang, vibriere, weckeAudio };
