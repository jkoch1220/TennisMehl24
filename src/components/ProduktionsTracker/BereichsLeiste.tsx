import React, { useRef } from 'react';
import { Boxes, Factory, Mountain } from 'lucide-react';
import type { ProduktionsBereich } from '../../types/produktion';
import { BEREICHE } from '../../types/produktion';
import { FOKUS, STATION } from './produktionUi';
import { melde } from './feedback';
import { formatTonnen } from './statistik';

/**
 * Stationsleiste — der einzige Weg, den Bereich zu wechseln.
 *
 * BEWUSST KEIN WISCHEN, auch nicht als zweiter Weg. Ein Fehlwisch mit
 * Handschuh bucht Mehl in die Schutthalde: der teuerste denkbare Fehler dieser
 * Maske, und er fällt beim Buchen nicht auf. Dazu kommt, dass Wischen im
 * Portal an anderer Stelle bereits „löschen" bedeutet (MobileProjektView), und
 * beim Mahlen läge die Wischgeste unmittelbar neben der Radgeste.
 *
 * Die Leiste sitzt oben, nicht in der Daumenzone — auch das absichtlich: sie
 * wird drei- bis fünfmal am Tag benutzt, die Buchen-Taste zwanzig- bis
 * vierzigmal. Die Daumenzone gehört der häufigen Handlung.
 *
 * Der aktive Zustand ist an DREI Merkmalen gleichzeitig erkennbar: Füllung,
 * Deckstreifen an der Oberkante und der Materialstreifen der Wertanzeige.
 * Farbe allein trägt hier keinen Zustand.
 */

const ICONS: Record<ProduktionsBereich, React.ComponentType<{ className?: string }>> = {
  rohmaterial: Mountain,
  mahlen: Factory,
  abfuellung: Boxes,
};

export interface BereichsLeisteProps {
  wert: ProduktionsBereich;
  onWaehle: (bereich: ProduktionsBereich) => void;
  /** Tagessummen je Bereich — nur anzeigen, wenn der Nutzer sie sehen darf. */
  tagesSummen?: Record<ProduktionsBereich, number> | null;
}

const BereichsLeiste: React.FC<BereichsLeisteProps> = ({ wert, onWaehle, tagesSummen }) => {
  const leisteRef = useRef<HTMLDivElement>(null);

  const waehle = (bereich: ProduktionsBereich) => {
    if (bereich === wert) return;
    melde('wechsel');
    onWaehle(bereich);
  };

  /** Pfeiltasten wandern durch die Reiter — Tab-Verhalten eines echten Tablists. */
  const aufTaste = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const richtung = e.key === 'ArrowRight' ? 1 : -1;
    const ziel = (index + richtung + BEREICHE.length) % BEREICHE.length;
    waehle(BEREICHE[ziel].wert);
    const tasten = leisteRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tasten?.[ziel]?.focus();
  };

  return (
    <div
      ref={leisteRef}
      role="tablist"
      aria-label="Produktionsbereich"
      className="flex gap-2"
    >
      {BEREICHE.map((def, index) => {
        const aktiv = def.wert === wert;
        const Icon = ICONS[def.wert];
        const stil = STATION[def.wert];
        const summe = tagesSummen?.[def.wert];

        return (
          <button
            key={def.wert}
            type="button"
            role="tab"
            aria-selected={aktiv}
            aria-controls={`erfassung-${def.wert}`}
            tabIndex={aktiv ? 0 : -1}
            onClick={() => waehle(def.wert)}
            onKeyDown={(e) => aufTaste(e, index)}
            className={[
              'pz-rahmen relative flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5',
              'overflow-hidden rounded-xl border-2 transition-colors duration-200',
              'touch-manipulation select-none',
              FOKUS,
              aktiv
                ? `${stil.segment} border-transparent`
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800',
            ].join(' ')}
          >
            {/* Deckstreifen: zweites Erkennungsmerkmal neben der Füllung */}
            {aktiv && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-white/70" />}
            <Icon className="h-5 w-5" />
            <span className="text-[13px] font-bold uppercase tracking-[0.08em]">{def.kurz}</span>
            {summe !== undefined && (
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  aktiv ? 'text-white/80' : 'text-gray-400 dark:text-slate-500'
                }`}
              >
                {formatTonnen(summe, 0)} t
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BereichsLeiste;
