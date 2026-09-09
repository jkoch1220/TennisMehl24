import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Truck } from 'lucide-react';
import type { ProduktionsBuchung } from '../../types/produktion';
import { findeWiegeschein } from '../../services/produktionService';
import { ABSCHNITT_LABEL, FOKUS } from './produktionUi';
import KachelWahl from './KachelWahl';
import { formatDatumKurz, formatTonnen } from './statistik';

/**
 * Zusatzfelder des Rohmaterial-Eingangs: Lieferant, Wiegeschein, Kennzeichen.
 *
 * Zwei Dinge sind hier fachlich entscheidend:
 *
 * 1. LIEFERANTEN-ÄHNLICHKEIT. Ohne Prüfung stehen nach einer Saison
 *    „Wienerberger", „wienerberger" und „Wienerberger GmbH" nebeneinander und
 *    jede Herkunftsauswertung ist wertlos. Statt stiller Neuanlage kommt ein
 *    Rückfrage-Chip.
 *
 * 2. WIEGESCHEIN-DUBLETTE OHNE HARTEN RIEGEL. Zwei Ziegeleien können dieselbe
 *    Nummer vergeben. Eine Sperre an der Anlage wird umgangen (Fantasienummer
 *    getippt), nicht befolgt — Ergebnis wäre eine gar nicht erfasste Lieferung.
 *    Stattdessen zwei benannte Auswege; die bewusste Entscheidung landet als
 *    `dublettenBestaetigt` in der Buchung und trennt Versehen von Absicht.
 *
 * Für diese Felder ist die Systemtastatur richtig: hier steht Text, und eine
 * selbstgebaute Buchstabentastatur ohne Autokorrektur produziert mehr
 * Tippfehler, als sie verhindert.
 */

export interface RohmaterialWerte {
  lieferant: string;
  wiegeschein: string;
  kennzeichen: string;
  dublettenBestaetigt: boolean;
}

export interface RohmaterialFelderProps {
  werte: RohmaterialWerte;
  onWerte: (werte: RohmaterialWerte) => void;
  /** Bereits gebuchte Lieferantennamen aus der Datenbank. */
  lieferanten: string[];
}

/** Levenshtein-Abstand, begrenzt auf kurze Namen — reicht für Tippfehler. */
const abstand = (a: string, b: string): number => {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 0;
  if (Math.abs(s.length - t.length) > 3) return 99;

  const zeile = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let vorher = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const temp = zeile[j];
      zeile[j] = Math.min(
        zeile[j] + 1,
        zeile[j - 1] + 1,
        vorher + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
      vorher = temp;
    }
  }
  return zeile[t.length];
};

const FELD =
  'pz-rahmen w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-lg ' +
  'text-gray-900 placeholder:text-gray-400 dark:border-slate-700 dark:bg-slate-900 ' +
  'dark:text-slate-100 dark:placeholder:text-slate-600';

type Pruefstand =
  | { art: 'leer' }
  | { art: 'prueft' }
  | { art: 'neu' }
  | { art: 'dublette'; buchung: ProduktionsBuchung }
  | { art: 'unbekannt' };

const RohmaterialFelder: React.FC<RohmaterialFelderProps> = ({ werte, onWerte, lieferanten }) => {
  const [eigenerLieferant, setEigenerLieferant] = useState(false);
  const [pruefung, setPruefung] = useState<Pruefstand>({ art: 'leer' });
  const laufendeNummer = useRef('');

  const setze = (teil: Partial<RohmaterialWerte>) => onWerte({ ...werte, ...teil });

  /** Die drei zuletzt benutzten Lieferanten als Kacheln, Rest über „Anderer". */
  const haeufige = useMemo(() => lieferanten.slice(0, 3), [lieferanten]);

  const aehnlich = useMemo(() => {
    const eingabe = werte.lieferant.trim();
    if (!eigenerLieferant || eingabe.length < 3) return null;
    if (lieferanten.some((l) => l.toLowerCase() === eingabe.toLowerCase())) return null;
    return lieferanten.find((l) => abstand(l, eingabe) <= 2) ?? null;
  }, [werte.lieferant, lieferanten, eigenerLieferant]);

  // Wiegeschein-Prüfung, entprellt. Ein Netzfehler blockiert nichts — der
  // Service liefert dann null und wir zeigen „Prüfung nicht möglich".
  useEffect(() => {
    const nummer = werte.wiegeschein.trim();
    laufendeNummer.current = nummer;

    if (nummer.length < 4) {
      setPruefung({ art: 'leer' });
      return;
    }

    setPruefung({ art: 'prueft' });
    const zeit = window.setTimeout(async () => {
      try {
        const treffer = await findeWiegeschein(nummer);
        // Zwischenzeitlich weitergetippt: dieses Ergebnis ist veraltet.
        if (laufendeNummer.current !== nummer) return;
        setPruefung(treffer ? { art: 'dublette', buchung: treffer } : { art: 'neu' });
      } catch {
        if (laufendeNummer.current === nummer) setPruefung({ art: 'unbekannt' });
      }
    }, 400);

    return () => window.clearTimeout(zeit);
  }, [werte.wiegeschein]);

  return (
    <div className="space-y-4">
      <div>
        <KachelWahl
          label="Lieferant"
          bereich="rohmaterial"
          scrollend
          optionen={[
            ...haeufige.map((name) => ({ wert: name, label: name })),
            { wert: '__andere__', label: 'Anderer…' },
          ]}
          wert={eigenerLieferant ? '__andere__' : werte.lieferant || null}
          onWaehle={(wert) => {
            if (wert === '__andere__') {
              setEigenerLieferant(true);
              setze({ lieferant: '' });
            } else {
              setEigenerLieferant(false);
              setze({ lieferant: wert });
            }
          }}
        />

        {eigenerLieferant && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={werte.lieferant}
              onChange={(e) => setze({ lieferant: e.target.value })}
              placeholder="Name der Ziegelei"
              autoComplete="off"
              autoCapitalize="words"
              className={`${FELD} ${FOKUS}`}
            />
            {aehnlich && (
              <button
                type="button"
                onClick={() => {
                  setze({ lieferant: aehnlich });
                  setEigenerLieferant(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  Meintest du <strong>{aehnlich}</strong>? Antippen zum Übernehmen.
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <label className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`} htmlFor="pz-wiegeschein">
          Wiegeschein
        </label>
        <input
          id="pz-wiegeschein"
          type="text"
          inputMode="text"
          value={werte.wiegeschein}
          onChange={(e) => setze({ wiegeschein: e.target.value, dublettenBestaetigt: false })}
          placeholder="z. B. W-11423"
          autoComplete="off"
          autoCapitalize="characters"
          className={`${FELD} ${FOKUS} font-mono`}
        />

        {pruefung.art === 'prueft' && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Prüfe Nummer…
          </p>
        )}
        {pruefung.art === 'neu' && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4" /> Nummer ist neu
          </p>
        )}
        {pruefung.art === 'unbekannt' && (
          <p className="mt-1.5 text-sm text-gray-400 dark:text-slate-500">
            Prüfung nicht möglich — Buchung ist trotzdem erlaubt.
          </p>
        )}
        {pruefung.art === 'dublette' && (
          <div className="mt-1.5 rounded-lg bg-amber-50 p-3 dark:bg-amber-500/15">
            <p className="flex items-start gap-1.5 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Schon gebucht: {formatDatumKurz(pruefung.buchung.datum)},{' '}
                {formatTonnen(pruefung.buchung.tonnen, 2)} t
                {pruefung.buchung.lieferant ? `, ${pruefung.buchung.lieferant}` : ''}
                {pruefung.buchung.erfasstVonName ? ` — ${pruefung.buchung.erfasstVonName}` : ''}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setze({ wiegeschein: '', dublettenBestaetigt: false })}
                className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm dark:bg-slate-800 dark:text-amber-200"
              >
                Dieselbe Lieferung — verwerfen
              </button>
              <button
                type="button"
                onClick={() => setze({ dublettenBestaetigt: true })}
                className={`rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
                  werte.dublettenBestaetigt
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-amber-900 dark:bg-slate-800 dark:text-amber-200'
                }`}
              >
                {werte.dublettenBestaetigt ? '✓ Andere Lieferung' : 'Andere Lieferung, gleiche Nummer'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`} htmlFor="pz-kennzeichen">
          Kennzeichen <span className="font-normal normal-case tracking-normal">(optional)</span>
        </label>
        <div className="relative">
          <Truck className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            id="pz-kennzeichen"
            type="text"
            value={werte.kennzeichen}
            onChange={(e) => setze({ kennzeichen: e.target.value.toUpperCase() })}
            placeholder="WÜ-AB 1234"
            autoComplete="off"
            autoCapitalize="characters"
            className={`${FELD} ${FOKUS} pl-11 font-mono`}
          />
        </div>
      </div>
    </div>
  );
};

export default RohmaterialFelder;
