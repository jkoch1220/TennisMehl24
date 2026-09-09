import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CloudUpload, Loader2, Plus } from 'lucide-react';
import type { ProduktionsBereich } from '../../types/produktion';
import { FOKUS, SCHRAFFUR, STATION, TASTEN_TEXT } from './produktionUi';
import { bewegungReduziert, melde } from './feedback';

/**
 * Die Buchen-Taste ist zugleich die Fehleroberfläche.
 *
 * Toasts taugen dafür nicht: `sonner` steht im Portal oben rechts, auf 390 px
 * Breite also über dem Kopf — während der Daumen unten liegt. Wer bucht, schaut
 * auf die Taste; also steht dort, was passiert ist.
 *
 * REIBUNG WÄCHST MIT DEM RISIKO, NICHT MIT DEM VORGANG:
 *  • unauffällige Buchung  → ein Tipp
 *  • Buchung mit Warnung   → 800 ms halten, mit Fortschrittsbalken
 *  • fehlende Pflichtangabe→ gesperrt, Beschriftung nennt das Fehlende
 *
 * Position und Größe bleiben in ALLEN Zuständen identisch. Nur Farbe, Text und
 * Interaktionsart ändern sich — so bleibt das Muskelgedächtnis erhalten, und
 * die geänderte Beschriftung fällt umso mehr auf.
 *
 * Kein Bestätigungs-Modal: das wird nach dem zehnten Mal blind weggetippt und
 * trainiert genau die Unaufmerksamkeit, die es verhindern soll. Ein Halten
 * kann man nicht aus Versehen zu Ende führen.
 */

export type TastenZustand = 'bereit' | 'gesperrt' | 'warnung' | 'speichert' | 'erfolg' | 'vorgemerkt' | 'fehler';

export interface BuchenTasteProps {
  zustand: TastenZustand;
  beschriftung: string;
  bereich: ProduktionsBereich;
  onBuchen: () => void;
  /** Für Screenreader: was genau gebucht wird. */
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

const HALTE_DAUER = 800;

/**
 * Darf ein einzelner Auslöser (Klick, Enter) sofort buchen?
 *
 * Bewusst EINE Definition für alle Auslösepfade. Vorher entschied die Taste
 * `zustand === 'bereit'`, der globale Enter-Handler aber `!fehlt` — und weil
 * `fehlt` nur Pflichtangaben kennt, buchte Enter im Warnzustand ohne die
 * Halteschwelle durch. Zwei Formulierungen derselben Regel driften; eine nicht.
 */
export const darfSofortBuchen = (zustand: TastenZustand): boolean => zustand === 'bereit';

/** Verlangt dieser Zustand die Halte-Geste (Zeiger oder Taste)? */
export const brauchtHalten = (zustand: TastenZustand): boolean => zustand === 'warnung';

const BASIS =
  'pz-taste relative w-full min-h-[68px] overflow-hidden rounded-xl shadow-lg ' +
  'flex items-center justify-center gap-2.5 text-white select-none touch-manipulation ' +
  'transition-colors duration-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none';

const BuchenTaste: React.FC<BuchenTasteProps> = ({
  zustand,
  beschriftung,
  bereich,
  onBuchen,
  ariaLabel,
  ariaDescribedBy,
}) => {
  const [fortschritt, setFortschritt] = useState(0);
  const beginn = useRef<number | null>(null);
  const bild = useRef<number | null>(null);
  const ausloeser = useRef<number | null>(null);
  const ruhig = bewegungReduziert();

  const abbrechen = useCallback(() => {
    if (bild.current !== null) cancelAnimationFrame(bild.current);
    if (ausloeser.current !== null) window.clearTimeout(ausloeser.current);
    bild.current = null;
    ausloeser.current = null;
    beginn.current = null;
    setFortschritt(0);
  }, []);

  useEffect(() => abbrechen, [abbrechen]);

  // Nach einem Zustandswechsel darf kein halber Fortschritt stehen bleiben.
  useEffect(() => {
    if (!brauchtHalten(zustand)) abbrechen();
  }, [zustand, abbrechen]);

  /**
   * Malt nur den Balken. Die Auslösung hängt bewusst NICHT hier dran:
   * `requestAnimationFrame` pausiert in einem verborgenen Tab vollständig und
   * wird auf schwachen Geräten im Energiesparmodus gedrosselt. Wer dann hält,
   * hielte vergeblich — die Buchung käme nie zustande, ohne dass erkennbar
   * wäre, warum.
   */
  const halteSchritt = useCallback(() => {
    if (beginn.current === null) return;
    const vergangen = performance.now() - beginn.current;
    setFortschritt(Math.min(100, (vergangen / HALTE_DAUER) * 100));
    if (vergangen < HALTE_DAUER) {
      bild.current = requestAnimationFrame(halteSchritt);
    }
  }, []);

  const starteHalten = () => {
    if (!brauchtHalten(zustand)) return;
    if (beginn.current !== null) return; // schon am Laufen (Tastenwiederholung)
    beginn.current = performance.now();
    bild.current = requestAnimationFrame(halteSchritt);
    // Die eigentliche Auslösung: ein schlichter Timer, unabhängig von der
    // Bildrate. Er wird von `abbrechen()` in jedem Loslass-Fall gestoppt.
    ausloeser.current = window.setTimeout(() => {
      abbrechen();
      onBuchen();
    }, HALTE_DAUER) as unknown as number;
  };

  const klick = () => {
    // Im Warnzustand löst nur das abgelaufene Halten aus — der Klick würde
    // sonst die Reibung aushebeln, die hier der ganze Zweck ist.
    if (!darfSofortBuchen(zustand)) return;
    melde('tick');
    onBuchen();
  };

  const stil = STATION[bereich];
  const ZUSTAND_KLASSE: Record<TastenZustand, string> = {
    bereit: stil.taste,
    gesperrt: 'bg-gray-400 dark:bg-slate-700',
    warnung: 'bg-amber-600 hover:bg-amber-700 ring-2 ring-inset ring-white/25',
    speichert: 'bg-gray-400 dark:bg-slate-600 cursor-wait',
    erfolg: 'bg-emerald-600',
    vorgemerkt: 'bg-slate-600',
    fehler: `bg-red-700 ${SCHRAFFUR}`,
  };

  const Symbol =
    zustand === 'erfolg'
      ? Check
      : zustand === 'speichert'
        ? Loader2
        : zustand === 'vorgemerkt'
          ? CloudUpload
          : zustand === 'warnung' || zustand === 'fehler'
            ? AlertTriangle
            : Plus;

  return (
    <button
      type="button"
      disabled={zustand === 'gesperrt' || zustand === 'speichert'}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-keyshortcuts="Enter"
      onClick={klick}
      onPointerDown={starteHalten}
      onPointerUp={abbrechen}
      onPointerLeave={abbrechen}
      onPointerCancel={abbrechen}
      // Dieselbe Halte-Reibung für die Tastatur. Ohne das bliebe im Warnzustand
      // nur der Zeigergerät-Pfad — die Taste wäre per Tastatur unbedienbar
      // (WCAG 2.1.1), und `aria-keyshortcuts` verspräche etwas, was nicht geht.
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (brauchtHalten(zustand)) {
          e.preventDefault(); // Space scrollt sonst die Seite
          starteHalten();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') abbrechen();
      }}
      onBlur={abbrechen}
      className={`${BASIS} ${TASTEN_TEXT} ${FOKUS} ${ZUSTAND_KLASSE[zustand]}`}
    >
      {fortschritt > 0 && (
        <span
          aria-hidden
          className={
            ruhig
              ? 'absolute inset-y-0 left-0 bg-white/25'
              : 'absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-75 ease-linear'
          }
          style={{ width: `${fortschritt}%` }}
        />
      )}
      <Symbol
        className={`relative h-6 w-6 flex-shrink-0 ${zustand === 'speichert' ? 'animate-spin' : ''}`}
        aria-hidden
      />
      <span className="relative">{beschriftung}</span>
    </button>
  );
};

export default BuchenTaste;
