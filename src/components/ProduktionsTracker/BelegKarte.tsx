import React from 'react';
import { AlertTriangle, CloudUpload, CornerDownRight, RotateCcw, Undo2 } from 'lucide-react';
import type { ProduktionsBuchung } from '../../types/produktion';
import { getBereich, getGebinde, getKoernung } from '../../types/produktion';
import { STATION } from './produktionUi';
import { formatDatumKurz, formatTonnen, formatUhrzeit } from './statistik';

/**
 * Eine Buchung als Beleg.
 *
 * „Beleg", nicht „Eintrag": eine Buchung, die den Lagerbestand bewegt hat, wird
 * nicht gelöscht, sondern storniert — sie bleibt sichtbar, zählt aber nirgends
 * mehr mit. So bleibt nachvollziehbar, warum ein Bestand einmal anders stand.
 *
 * Die Chips oben rechts sind der Ehrlichkeits-Teil: eine Buchung, die noch auf
 * Übertragung wartet oder deren Lagerbuchung fehlgeschlagen ist, sagt das hier.
 * Ohne diese Kennzeichnung fällt eine Abweichung erst Wochen später auf, und
 * dann ist nicht mehr rekonstruierbar, welche Buchung sie verursacht hat.
 */

export interface BelegKarteProps {
  buchung: ProduktionsBuchung;
  /** Zeigt „Rückgängig" statt „Stornieren" — im 90-Sekunden-Fenster. */
  sofortRuecknahme?: boolean;
  onStorno?: (buchung: ProduktionsBuchung) => void;
  /** Nur wartende Buchungen aus der Warteschlange. */
  wartet?: boolean;
  onNochmalSenden?: () => void;
  onVerwerfen?: () => void;
  /** Erfassernamen ausblenden, wenn der Nutzer fremde Buchungen nicht sehen darf. */
  zeigeErfasser?: boolean;
  /** Datum mit anzeigen (Journal über mehrere Tage). */
  zeigeDatum?: boolean;
}

const CHIP = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold';

const BelegKarte: React.FC<BelegKarteProps> = ({
  buchung,
  sofortRuecknahme = false,
  onStorno,
  wartet = false,
  onNochmalSenden,
  onVerwerfen,
  zeigeErfasser = true,
  zeigeDatum = false,
}) => {
  const def = getBereich(buchung.bereich);
  const stil = STATION[buchung.bereich];
  const koernung = getKoernung(buchung.koernung);
  const gebinde = getGebinde(buchung.gebinde);

  const kontext = [
    koernung?.label,
    gebinde && buchung.gebindeAnzahl
      ? `${buchung.gebindeAnzahl} × ${gebinde.label}`
      : gebinde?.label,
    buchung.lieferant,
    buchung.wiegeschein ? `Schein ${buchung.wiegeschein}` : null,
    buchung.kennzeichen,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={[
        'pz-karte relative overflow-hidden rounded-xl border bg-white p-3 shadow-sm',
        'dark:bg-slate-900',
        buchung.storniert
          ? 'border-gray-200 opacity-60 dark:border-slate-800'
          : 'border-gray-200 dark:border-slate-700',
      ].join(' ')}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${stil.streifen}`} />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-gray-400 dark:text-slate-500">
              {zeigeDatum ? `${formatDatumKurz(buchung.datum)} ` : ''}
              {formatUhrzeit(buchung.zeitpunkt)}
            </span>
            <span
              className={`text-[11px] font-bold uppercase tracking-[0.1em] ${stil.text}`}
            >
              {def.kurz}
            </span>
          </div>

          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span
              className={`text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-50 ${
                buchung.storniert ? 'line-through decoration-2' : ''
              }`}
            >
              {formatTonnen(buchung.tonnen, buchung.bereich === 'rohmaterial' ? 2 : 1)} t
            </span>
          </div>

          {kontext && (
            <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-slate-400">{kontext}</p>
          )}

          {zeigeErfasser && buchung.erfasstVonName && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
              {buchung.erfasstVonName}
            </p>
          )}
          {zeigeErfasser && !buchung.erfasstVonName && buchung.quelle === 'oeffentlich' && (
            <p className="mt-0.5 text-xs italic text-gray-400 dark:text-slate-500">
              nicht zugeordnet
            </p>
          )}

          {buchung.storniert && (
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Storniert
              {buchung.storniertVonName ? ` von ${buchung.storniertVonName}` : ''}
              {buchung.storniertGrund ? ` — ${buchung.storniertGrund}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          {wartet && (
            <span
              className={`${CHIP} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`}
            >
              <CloudUpload className="h-3 w-3" /> wartet
            </span>
          )}
          {buchung.lagerGebucht === false && (
            <span
              className={`${CHIP} bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200`}
            >
              <AlertTriangle className="h-3 w-3" /> Bestand offen
            </span>
          )}
          {buchung.ersetztBuchungId && (
            <span
              className={`${CHIP} bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300`}
            >
              <CornerDownRight className="h-3 w-3" /> Korrektur
            </span>
          )}
          {buchung.dublettenBestaetigt && (
            <span
              className={`${CHIP} bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300`}
            >
              Dublette bestätigt
            </span>
          )}

          {!buchung.storniert && onStorno && (
            <button
              type="button"
              onClick={() => onStorno(buchung)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              {sofortRuecknahme ? (
                <>
                  <Undo2 className="h-4 w-4" /> Rückgängig
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" /> Storno
                </>
              )}
            </button>
          )}

          {wartet && (
            <div className="flex gap-1.5">
              {onNochmalSenden && (
                <button
                  type="button"
                  onClick={onNochmalSenden}
                  className="min-h-[36px] rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                >
                  Nochmal senden
                </button>
              )}
              {onVerwerfen && (
                <button
                  type="button"
                  onClick={onVerwerfen}
                  className="min-h-[36px] rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Verwerfen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BelegKarte;
