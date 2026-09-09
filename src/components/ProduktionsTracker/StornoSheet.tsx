import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ProduktionsBuchung } from '../../types/produktion';
import { getBereich } from '../../types/produktion';
import { ABSCHNITT_LABEL, FOKUS } from './produktionUi';
import { formatDatumKurz, formatTonnen, formatUhrzeit } from './statistik';

/**
 * Storno mit Grundpflicht — und dem Angebot, gleich richtig nachzubuchen.
 *
 * Das ist der Ersatz für ein „Bearbeiten", das es bewusst nicht gibt: der
 * Lagerbestand ist ein Fluss von Deltas. Ein Edit müsste alte Deltas
 * zurückrechnen und macht die Historie zur Behauptung. Storno plus
 * Korrekturbuchung ist genauso schnell und hinterlässt eine Spur.
 *
 * Die Gründe sind Kacheln statt Freitext, weil ein Pflicht-Textfeld an der
 * Anlage mit „x" beantwortet wird. Was die Kacheln nicht abdecken, geht über
 * „Sonstiges" — dort dann mit echtem Text.
 */

const GRUENDE = [
  'Zahlendreher',
  'Falscher Bereich',
  'Doppelt erfasst',
  'Falsches Datum',
  'Falsche Körnung',
];

export interface StornoSheetProps {
  buchung: ProduktionsBuchung;
  onAbbrechen: () => void;
  onStornieren: (grund: string, korrekturAnlegen: boolean) => void;
  laeuft?: boolean;
}

const StornoSheet: React.FC<StornoSheetProps> = ({
  buchung,
  onAbbrechen,
  onStornieren,
  laeuft = false,
}) => {
  const [grund, setGrund] = useState<string | null>(null);
  const [freitext, setFreitext] = useState('');
  const [korrektur, setKorrektur] = useState(false);

  const def = getBereich(buchung.bereich);
  const endgueltigerGrund = grund === 'Sonstiges' ? freitext.trim() : grund ?? '';
  const bereit = endgueltigerGrund.length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Buchung stornieren"
      onClick={onAbbrechen}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">
              Buchung stornieren
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
              {def.label} · {formatTonnen(buchung.tonnen, 1)} t ·{' '}
              {formatDatumKurz(buchung.datum)} {formatUhrzeit(buchung.zeitpunkt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onAbbrechen}
            aria-label="Schließen"
            className={`rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 ${FOKUS}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className={`pz-panel mb-2 ${ABSCHNITT_LABEL}`}>Warum wird storniert?</p>
        <div className="flex flex-wrap gap-2">
          {[...GRUENDE, 'Sonstiges'].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrund(g)}
              className={[
                'min-h-[48px] rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors',
                FOKUS,
                grund === g
                  ? 'border-red-500 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-500/15 dark:text-red-200'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
              ].join(' ')}
            >
              {g}
            </button>
          ))}
        </div>

        {grund === 'Sonstiges' && (
          <input
            type="text"
            value={freitext}
            onChange={(e) => setFreitext(e.target.value)}
            placeholder="Grund in Stichworten"
            autoFocus
            className={`mt-3 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${FOKUS}`}
          />
        )}

        <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-gray-50 p-3 dark:bg-slate-800/60">
          <input
            type="checkbox"
            checked={korrektur}
            onChange={(e) => setKorrektur(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700 dark:text-slate-300">
            Danach korrigierte Buchung anlegen
            <span className="block text-xs text-gray-500 dark:text-slate-400">
              Übernimmt alle Angaben außer der Menge und vermerkt den Bezug zur stornierten Buchung.
            </span>
          </span>
        </label>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onAbbrechen}
            className={`min-h-[52px] flex-1 rounded-xl border-2 border-gray-200 font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300 ${FOKUS}`}
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!bereit || laeuft}
            onClick={() => onStornieren(endgueltigerGrund, korrektur)}
            className={`min-h-[52px] flex-1 rounded-xl bg-red-600 font-semibold text-white shadow-lg transition-colors hover:bg-red-700 disabled:opacity-40 ${FOKUS}`}
          >
            {laeuft ? 'Storniert…' : 'Stornieren'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StornoSheet;
