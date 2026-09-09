import React from 'react';
import { Delete } from 'lucide-react';
import { FOKUS } from './produktionUi';
import { vibriere } from './feedback';

/**
 * Ziffernblock für Mengen — ohne Betriebssystem-Tastatur.
 *
 * Warum nicht einfach ein Eingabefeld: die Systemtastatur verdeckt am Handy den
 * halben Bildschirm, zwingt zum Zielen auf 30-px-Tasten, löst auf iOS Zoom aus
 * und kollidiert mit der globalen `font-size: 16px !important`-Regel des
 * Portals. Für Wiegescheinnummer und Kennzeichen ist sie richtig — dort steht
 * Text und die Autokorrektur hilft. Für Zahlen nicht.
 *
 * Die Eingabe ist STRINGBASIERT und wird erst beim Buchen durch
 * `parseZahlText`/`schliesseEingabeAb` aus utils/zahlenEingabe.ts geschickt.
 * Ein eigener Parser wäre die vierte Zahlenlogik im Portal — und „7,9" würde
 * bei naiver Behandlung zu 79.
 *
 * Rückmeldung: Vibration ja, Ton NEIN. Zwölf Töne beim Eintippen einer Zahl
 * sind Lärm, und Lärm führt dazu, dass der Ton abgeschaltet wird — samt der
 * Fehlersignale, auf die es ankommt.
 */

export interface ZahlenBrettProps {
  text: string;
  onText: (text: string) => void;
  /** 0 = keine Nachkommastellen (Stückzahl), 2 = Wiegeschein-Tonnage. */
  dezimalstellen: number;
  /** Obergrenze der Zeichenzahl — bremst Zahlendreher wie 2444. */
  maxZeichen?: number;
}

const TASTE =
  'pz-rahmen flex h-16 items-center justify-center rounded-lg border border-gray-200 bg-white ' +
  'text-2xl font-semibold tabular-nums text-gray-900 shadow-sm transition-colors ' +
  'select-none touch-manipulation active:bg-gray-100 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700';

const ZahlenBrett: React.FC<ZahlenBrettProps> = ({
  text,
  onText,
  dezimalstellen,
  maxZeichen = 7,
}) => {
  const tippe = (zeichen: string) => {
    vibriere('tick');

    if (zeichen === '⌫') {
      onText(text.slice(0, -1));
      return;
    }
    if (zeichen === 'C') {
      onText('');
      return;
    }

    if (zeichen === ',') {
      if (dezimalstellen === 0) return;
      if (text.includes(',')) return;
      onText(text.length === 0 ? '0,' : `${text},`);
      return;
    }

    // Mehr Nachkommastellen als erlaubt werden gar nicht erst angenommen —
    // stilles Abschneiden beim Speichern wäre die schlechtere Überraschung.
    const [, nachkomma] = text.split(',');
    if (nachkomma !== undefined && nachkomma.length >= dezimalstellen) return;
    if (text.replace(/[^0-9]/g, '').length >= maxZeichen) return;
    // Führende Nullen verhindern: „05" ist immer ein Vertipper.
    if (text === '0') {
      onText(zeichen);
      return;
    }
    onText(text + zeichen);
  };

  const zeilen: string[][] = [
    ['1', '2', '3', '⌫'],
    ['4', '5', '6', dezimalstellen > 0 ? ',' : ''],
    ['7', '8', '9', 'C'],
    ['0', '00', '', ''],
  ];

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Zifferneingabe">
      {zeilen.flat().map((zeichen, index) =>
        zeichen === '' ? (
          <div key={index} aria-hidden />
        ) : (
          <button
            key={index}
            type="button"
            aria-label={
              zeichen === '⌫' ? 'Letzte Ziffer löschen' : zeichen === 'C' ? 'Eingabe leeren' : zeichen
            }
            onClick={() => tippe(zeichen)}
            className={`${TASTE} ${FOKUS} ${
              zeichen === 'C' ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {zeichen === '⌫' ? <Delete className="h-6 w-6" /> : zeichen}
          </button>
        )
      )}
    </div>
  );
};

export default ZahlenBrett;
