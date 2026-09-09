/**
 * Frachtrechner.tsx — ÖFFENTLICHER Frachtkostenrechner (kein Login, kein Token)
 *
 * Aufruf: /frachtrechner — ein Link, den man jedem Platzbauer schicken kann.
 *
 * Die Seite rechnet AUSSCHLIESSLICH die Fracht: Speditionskosten für
 * Palettenware frei Bordsteinkante, Dieselzuschlag, USt. Material- und
 * Palettenpreise stehen hier bewusst NICHT mehr — die sind kundenindividuell
 * und gehören ins Angebot, nicht auf eine Seite, die jeder öffnen kann.
 *
 * WARUM HIER NICHTS GERECHNET WIRD:
 * Die gesamte Preislogik liegt in `netlify/functions/lib/frachtrechnerLogik.ts`
 * und läuft ausschließlich in der Function `/.netlify/functions/frachtrechner`.
 * Diese Datei importiert bewusst WEDER die Logik NOCH `src/constants/rabenPricing`
 * — sonst bündelte Vite den kompletten Speditions-Einkaufstarif in ein Bundle,
 * das jeder Besucher per DevTools auslesen kann. Deshalb ist auch das Ergebnis-
 * Interface hier lokal nachgebildet statt importiert: Ein `import type` über die
 * Verzeichnisgrenze hinweg zöge die Datei in die Client-Typprüfung und lüde zur
 * nächsten Erweiterung geradewegs zum Wertimport ein.
 *
 * Ebenso gibt es hier KEINEN Appwrite-Zugriff und KEIN useAuth — die Seite läuft
 * im Browser eines Fremden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Phone, Loader2, Truck } from 'lucide-react';

import KundenseiteLayout from '../components/Public/KundenseiteLayout';
import { NumberInput } from '../components/NumberInput';

const FUNCTION_URL = '/.netlify/functions/frachtrechner';

/** Verzögerung, bis nach der letzten Eingabe automatisch gerechnet wird. */
const AUTO_RECHNEN_MS = 500;

/** Notnagel, falls die Function keine Obergrenze mitliefert (Logik: MAX_PALETTEN = 24). */
const MAX_PALETTEN_FALLBACK = 24;

/**
 * Spiegel von `FrachtrechnerErgebnis` (siehe Dateikopf: kein Import über die
 * Grenze). Enthält nur die Felder, die die Function tatsächlich herausgibt —
 * keine Frachtzone, keinen Basispreis, keinen Speditionsnamen.
 */
interface Ergebnis {
  paletten: number;
  gewichtKg: number;
  zielPLZ: string;
  frachtSumme: number;
  dieselzuschlagProzent: number;
  dieselzuschlagSumme: number;
  dieselStand: string;
  nettoSumme: number;
  ustSatzProzent: number;
  ustSumme: number;
  bruttoSumme: number;
  nettoJePalette: number;
}

const euro = (wert: number): string =>
  `${wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const zahl = (wert: number, stellen = 0): string =>
  wert.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Übersetzt HTTP-Status in eine Meldung, die dem Besucher weiterhilft.
 * Der Text der Function hat Vorrang: nur sie weiß, ob die PLZ unbekannt ist
 * oder die Palettenzahl außerhalb des Bereichs liegt.
 */
const meldungZuStatus = (status: number, serverText?: string): string => {
  if (serverText) return serverText;
  if (status === 429)
    return 'Es wurden sehr viele Berechnungen hintereinander angefragt. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
  if (status === 400)
    return 'Für diese Eingabe können wir keine Fracht berechnen. Bitte Palettenzahl und Postleitzahl prüfen.';
  return 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.';
};

const Frachtrechner = () => {
  // Rahmendaten der Function (Obergrenze, Stand des Dieselzuschlags). Sie werden
  // beim ersten Laden geholt, blockieren die Seite aber NICHT: bleibt der Aufruf
  // aus, rechnet die Seite mit dem Notnagel weiter, statt leer dazustehen.
  const [maxPaletten, setMaxPaletten] = useState(MAX_PALETTEN_FALLBACK);
  const [dieselStand, setDieselStand] = useState('');

  // Eingaben
  const [paletten, setPaletten] = useState(0);
  const [zielPLZ, setZielPLZ] = useState('');

  // Ergebnis
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [rechenFehler, setRechenFehler] = useState('');
  const [rechnet, setRechnet] = useState(false);

  /**
   * Laufende Nummer der Berechnungsanfrage. Beim automatischen Rechnen können
   * mehrere Antworten unterwegs sein; ohne diesen Zähler überschriebe eine
   * langsame alte Antwort das Ergebnis der neueren Eingabe.
   */
  const anfrageNr = useRef(0);

  /** Laufender Debounce-Timer, damit ein Klick auf den Knopf ihn abräumt. */
  const autoTimer = useRef<number | null>(null);

  // Dark Mode: Auf dieser öffentlichen Seite folgt das Theme der System-
  // Einstellung des Besuchers — das Portal-Theme ist class-basiert und für
  // externe Besucher immer "light", ohne diesen Effekt wären alle dark:-Klassen
  // tot. Der Effekt gehört ins KundenseiteLayout; er steht hier NICHT noch einmal.

  // Rahmendaten holen: parameterloser GET liefert maxPaletten und den Stand des
  // Dieselzuschlags. Fehler werden bewusst geschluckt — ohne Rahmendaten ist die
  // Seite voll bedienbar, nur die Obergrenze stammt dann aus der Konstanten.
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const res = await fetch(FUNCTION_URL);
        if (!res.ok) return;
        const json = (await res.json()) as { maxPaletten?: number; dieselStand?: string };
        if (abgebrochen) return;
        if (typeof json.maxPaletten === 'number' && json.maxPaletten > 0) {
          setMaxPaletten(json.maxPaletten);
        }
        if (json.dieselStand) setDieselStand(json.dieselStand);
      } catch {
        // Still: der Rechner läuft mit dem Notnagel weiter.
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);

  const berechne = useCallback(async () => {
    if (paletten < 1 || zielPLZ.length !== 5) return;

    // Einen wartenden Debounce abräumen: sonst schickt ein Klick kurz vor Ablauf
    // dieselbe Berechnung zweimal — und läuft in die Rate-Begrenzung (429).
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }

    const nr = ++anfrageNr.current;
    setRechnet(true);
    setRechenFehler('');
    try {
      const res = await fetch(
        `${FUNCTION_URL}?paletten=${encodeURIComponent(String(paletten))}&plz=${encodeURIComponent(zielPLZ)}`
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        maxPaletten?: number;
        ergebnis?: Ergebnis;
        fehler?: string;
        fehlertext?: string;
      };
      // Veraltete Antwort: der Besucher hat inzwischen weitergetippt.
      if (nr !== anfrageNr.current) return;

      if (typeof json.maxPaletten === 'number' && json.maxPaletten > 0) {
        setMaxPaletten(json.maxPaletten);
      }

      if (!res.ok || !json.ok || !json.ergebnis) {
        setErgebnis(null);
        setRechenFehler(meldungZuStatus(res.status, json.fehlertext));
        return;
      }
      setErgebnis(json.ergebnis);
    } catch {
      if (nr !== anfrageNr.current) return;
      setErgebnis(null);
      setRechenFehler('Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.');
    } finally {
      if (nr === anfrageNr.current) setRechnet(false);
    }
  }, [paletten, zielPLZ]);

  // Automatisch rechnen, sobald die Eingaben vollständig sind.
  useEffect(() => {
    if (paletten < 1 || zielPLZ.length !== 5) return;
    const timer = window.setTimeout(() => {
      autoTimer.current = null;
      void berechne();
    }, AUTO_RECHNEN_MS);
    autoTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoTimer.current === timer) autoTimer.current = null;
    };
  }, [paletten, zielPLZ, berechne]);

  /**
   * Jede Änderung verwirft das alte Ergebnis. Ein stehengebliebener Preis zu
   * einer anderen PLZ oder Menge ist schlimmer als eine kurz leere Fläche.
   */
  const eingabeGeaendert = () => {
    anfrageNr.current += 1;
    setErgebnis(null);
    setRechenFehler('');
    setRechnet(false);
  };

  const setzePaletten = (wert: number) => {
    eingabeGeaendert();
    setPaletten(wert);
  };

  // PLZ ist BEWUSST kein NumberInput: führende Nullen müssen erhalten bleiben
  // ("01067" Dresden würde als Zahl zu 1067 und träfe die falsche Frachtzone).
  // Deshalb ein Textfeld mit inputMode="numeric" — die Projektregel „nur
  // NumberInput" gilt für Zahlen, mit denen gerechnet wird, nicht für Ziffern-
  // codes wie PLZ, Kunden- oder Belegnummern.
  const setzePLZ = (roh: string) => {
    const nurZiffern = roh.replace(/\D/g, '').slice(0, 5);
    eingabeGeaendert();
    setZielPLZ(nurZiffern);
  };

  const eingabenVollstaendig = paletten >= 1 && paletten <= maxPaletten && zielPLZ.length === 5;
  // Schutz gegen die „Infinity €"-Anzeige: ohne Menge darf gar kein
  // Ergebnisblock entstehen.
  const zeigeErgebnis = Boolean(ergebnis) && paletten > 0;

  const feldKlasse =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-dark-text placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent';

  return (
    <KundenseiteLayout
      titel="Frachtkostenrechner"
      untertitel="Lieferung auf Paletten"
      icon={Truck}
      breit
    >
      <div className="space-y-4">
        {/* Einleitung — sagt in einem Satz, was gerechnet wird und was nicht. */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
          <p className="!text-lg font-bold text-gray-900 dark:text-dark-text">
            Was kostet die Anlieferung?
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
            {/* Bewusst „frei Bordsteinkante", nicht „frei Baustelle": Palettenware geht
                per Spedition, und der Vorbehalte-Block sagt weiter unten dasselbe.
                „Frei Baustelle" ist der Begriff für loses Schüttgut per Silo-LKW. */}
            Berechnen Sie hier unverbindlich die Frachtkosten für Palettenware frei
            Bordsteinkante. Der Warenpreis ist nicht enthalten.
          </p>
          {dieselStand && (
            <p className="mt-2 inline-block rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-600 dark:text-dark-textMuted">
              Dieselzuschlag Stand {dieselStand}
            </p>
          )}
        </div>

        {/* Eingaben */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5 space-y-5">
          {/* 1. Menge */}
          <div>
            <label
              htmlFor="frachtrechner-paletten"
              className="block font-semibold text-gray-900 dark:text-dark-text"
            >
              Anzahl Paletten
            </label>
            {/* Bewusst nur die Basis-Props von NumberInput (value/onChange/min/max/
                step/placeholder/className). Das Suffix zeichnen wir deshalb selbst;
                `pointer-events-none` lässt den Klick ins Feld durch. */}
            <div className="relative mt-2">
              <NumberInput
                id="frachtrechner-paletten"
                value={paletten}
                onChange={setzePaletten}
                min={1}
                max={maxPaletten}
                step={1}
                placeholder="z. B. 5"
                className={`${feldKlasse} pr-24`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-gray-400 dark:text-gray-500">
                Paletten
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Eine Palette = 25 Säcke à 40 kg = 1 Tonne
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Bis {maxPaletten} Paletten je Lieferung. Für größere Mengen beraten wir Sie gerne
              persönlich.
            </p>
          </div>

          {/* 2. Ziel-PLZ */}
          <div>
            <label
              htmlFor="frachtrechner-plz"
              className="block font-semibold text-gray-900 dark:text-dark-text"
            >
              Ziel-Postleitzahl
            </label>
            <input
              id="frachtrechner-plz"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              autoComplete="postal-code"
              value={zielPLZ}
              onChange={(e) => setzePLZ(e.target.value)}
              placeholder="z. B. 97232"
              className={`${feldKlasse} mt-2 tracking-widest`}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Fünfstellig, Lieferung innerhalb Deutschlands.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void berechne()}
            disabled={!eingabenVollstaendig || rechnet}
            className="w-full rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white text-lg font-bold py-4 shadow-lg transition-colors inline-flex items-center justify-center gap-3"
          >
            {rechnet ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Wird berechnet …
              </>
            ) : (
              <>
                <Calculator className="h-5 w-5" />
                Frachtkosten berechnen
              </>
            )}
          </button>

          {rechenFehler && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{rechenFehler}</span>
            </div>
          )}
        </div>

        {/* Ergebnis — erst wenn eines vorliegt, sonst stünde hier „Infinity €" */}
        {zeigeErgebnis && ergebnis && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
            <p className="font-semibold text-gray-900 dark:text-dark-text">Ihre Frachtkosten</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
              {zahl(ergebnis.paletten)} {ergebnis.paletten === 1 ? 'Palette' : 'Paletten'} ·
              Lieferung nach {ergebnis.zielPLZ}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="text-gray-800 dark:text-dark-text">
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2.5 pr-3">
                      Fracht
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        frei Bordsteinkante, {ergebnis.zielPLZ}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                      {euro(ergebnis.frachtSumme)}
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2.5 pr-3">
                      Dieselzuschlag
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {zahl(ergebnis.dieselzuschlagProzent, 2)} % — Stand {ergebnis.dieselStand}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                      {euro(ergebnis.dieselzuschlagSumme)}
                    </td>
                  </tr>

                  <tr className="border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60">
                    <td className="py-3 pr-3 font-bold">Summe netto</td>
                    <td className="py-3 text-right whitespace-nowrap font-bold tabular-nums">
                      {euro(ergebnis.nettoSumme)}
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2.5 pr-3 text-gray-600 dark:text-dark-textMuted">
                      zzgl. {zahl(ergebnis.ustSatzProzent)} % USt.
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap tabular-nums text-gray-600 dark:text-dark-textMuted">
                      {euro(ergebnis.ustSumme)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-3 !text-base font-bold text-gray-900 dark:text-dark-text">
                      Gesamt brutto
                    </td>
                    <td className="py-3 text-right whitespace-nowrap !text-base font-bold tabular-nums text-red-600 dark:text-dark-accent">
                      {euro(ergebnis.bruttoSumme)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              entspricht {euro(ergebnis.nettoJePalette)} netto je Palette
            </p>

            {/* Pflichttext: steht direkt am Ergebnis, nicht als Fußnote */}
            <p className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-xs leading-relaxed text-gray-700 dark:text-dark-textMuted">
              <strong className="text-gray-900 dark:text-dark-text">
                Unverbindliche Berechnung.
              </strong>{' '}
              Diese Berechnung ist freibleibend und ohne Gewähr; sie ist kein Angebot im Sinne des
              § 145 BGB. Ein Vertrag kommt erst mit unserer Auftragsbestätigung zustande. Maßgeblich
              sind unser schriftliches Angebot und unsere AGB.
            </p>

            {/* Der Dieselvorbehalt steht SICHTBAR am Ergebnis, nicht im Ausklappfeld:
                er ist der einzige Grund, aus dem der Endpreis später abweicht. */}
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Der Dieselzuschlag wird zum Tag der Auslieferung neu ermittelt. Der Endpreis kann
                dadurch von dieser Berechnung abweichen.
              </span>
            </p>

            <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-dark-textMuted">
              Alle Preise in Euro zzgl. 19 % USt. (Lieferung innerhalb Deutschlands). Angebot
              ausschließlich an Unternehmer, Kaufleute, eingetragene Vereine und juristische
              Personen des öffentlichen Rechts — nicht an Verbraucher.
            </p>

            <details className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-dark-text">
                Was enthalten ist — und was nicht
              </summary>
              <div className="space-y-2 px-4 pb-4 text-xs leading-relaxed text-gray-600 dark:text-dark-textMuted">
                <p>
                  <strong className="text-gray-900 dark:text-dark-text">Was enthalten ist:</strong>{' '}
                  Der Preis gilt für die Anlieferung frei Bordsteinkante. Für das Abladen ist der
                  Empfänger verantwortlich; ein Stapler oder Hubwagen muss bereitstehen.
                </p>
                <p>
                  <strong className="text-gray-900 dark:text-dark-text">Eine Palette</strong>{' '}
                  entspricht 25 Säcken à 40 kg, also 1 Tonne.
                </p>
                <p>
                  <strong className="text-gray-900 dark:text-dark-text">Nicht enthalten</strong>{' '}
                  sind die Ware selbst sowie Sonderleistungen wie Termin- oder
                  Avisierungszuschläge.
                </p>
              </div>
            </details>
          </div>
        )}

        {/* Abschluss-CTA */}
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-5 text-center">
          <p className="font-semibold text-gray-900 dark:text-dark-text">
            Bestellen oder Rückfragen?
          </p>
          <a
            href="tel:+49939198700"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-6 py-3 text-lg font-bold text-white shadow transition-colors"
          >
            <Phone className="h-5 w-5" />
            09391 98700
          </a>
          <p className="mt-2 text-xs text-gray-600 dark:text-dark-textMuted">
            Rufen Sie uns an — wir erstellen Ihnen ein verbindliches Angebot.
          </p>
        </div>
      </div>
    </KundenseiteLayout>
  );
};

export default Frachtrechner;
