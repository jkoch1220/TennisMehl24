import React from 'react';
import { STATION } from './produktionUi';

/**
 * Stückzahl als Bild: ein Balken je Gebinde, in Fünfergruppen.
 *
 * Der Zweck ist Fehlererkennung ohne Lesen. 12 gegen 21 ist als Ziffer nur mit
 * Aufmerksamkeit zu unterscheiden — als drei Balkengruppen gegen vier fällt der
 * Zahlendreher sofort auf, auch mit Handschuhen, in Eile und bei Sonne.
 *
 * Ab 40 Einheiten wäre die Reihe selbst unlesbar; dann steht dort die
 * Fünfergruppen-Kurzform.
 */

export interface StueckGlyphenProps {
  anzahl: number;
  /** Höhe der Balken in Pixeln — am Desktop kleiner als am Gerät. */
  hoehe?: number;
}

const StueckGlyphen: React.FC<StueckGlyphenProps> = ({ anzahl, hoehe = 22 }) => {
  const gruppen = Math.floor(anzahl / 5);
  const rest = anzahl % 5;
  const alsBild = anzahl > 0 && anzahl <= 40;

  const balken = (schluessel: string | number) => (
    <span
      key={schluessel}
      className={`w-[9px] rounded-[2px] ${STATION.abfuellung.streifen}`}
      style={{ height: hoehe }}
    />
  );

  return (
    <div
      aria-hidden
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      style={{ minHeight: hoehe + 4 }}
    >
      {alsBild &&
        Array.from({ length: gruppen }).map((_, g) => (
          <span key={g} className="flex gap-[3px]">
            {Array.from({ length: 5 }).map((_, i) => balken(i))}
          </span>
        ))}
      {alsBild && rest > 0 && (
        <span className="flex gap-[3px]">{Array.from({ length: rest }).map((_, i) => balken(i))}</span>
      )}
      {anzahl > 40 && (
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {gruppen} × 5 + {rest}
        </span>
      )}
    </div>
  );
};

export default StueckGlyphen;
