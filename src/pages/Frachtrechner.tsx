/**
 * Frachtrechner.tsx — Öffentliche Kundenseite des Frachtkostenrechners (KEIN Login!)
 *
 * Aufruf über den personalisierten Link:
 *   /frachtrechner/:kundeId?token=<token>
 *
 * Der Kunde wählt Palettenzahl, Körnung und Ziel-PLZ und bekommt eine
 * unverbindliche Gesamtkalkulation (Material, Paletten, Fracht, Dieselzuschlag,
 * USt.).
 *
 * WARUM HIER NICHTS GERECHNET WIRD:
 * Die gesamte Preislogik liegt in `netlify/functions/lib/frachtrechnerLogik.ts`
 * und läuft ausschließlich in der Function `/.netlify/functions/frachtrechner`.
 * Diese Datei importiert bewusst WEDER die Logik NOCH `src/constants/rabenPricing`
 * — sonst bündelte Vite den kompletten Speditions-Einkaufstarif in ein Bundle,
 * das jeder Kunde per DevTools auslesen kann. Deshalb ist auch das Ergebnis-
 * Interface hier lokal nachgebildet statt importiert: Ein `import type` über die
 * Verzeichnisgrenze hinweg zöge die Datei in die Client-Typprüfung und lüde zur
 * nächsten Erweiterung geradewegs zum Wertimport ein.
 *
 * Ebenso gibt es hier KEINEN Appwrite-Zugriff und KEIN useAuth — die Seite läuft
 * im Browser eines Fremden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calculator, Loader2, Phone, RefreshCw, Truck, XCircle } from 'lucide-react';

import KundenseiteLayout from '../components/Public/KundenseiteLayout';
import { NumberInput } from '../components/NumberInput';

const FUNCTION_URL = '/.netlify/functions/frachtrechner';

/** Verzögerung, bis nach der letzten Eingabe automatisch gerechnet wird. */
const AUTO_RECHNEN_MS = 500;

/** Notnagel, falls die Function keine Obergrenze mitliefert (Logik: MAX_PALETTEN = 24). */
const MAX_PALETTEN_FALLBACK = 24;

type Koernung = '0-2' | '0-3';

/** Antwort des GET — bewusst ohne Preisbasis, Zone oder Speditionsname. */
interface RechnerKopf {
  kundenname: string;
  kundennummer: string;
  maxPaletten: number;
  hinweisPreisstand: string;
}

/** Spiegel von `FrachtrechnerErgebnis` (siehe Dateikopf: kein Import über die Grenze). */
interface Ergebnis {
  paletten: number;
  tonnen: number;
  koernung: Koernung;
  bezeichnung: string;
  materialProTonne: number;
  materialSumme: number;
  palettenPreisProStueck: number;
  palettenSumme: number;
  frachtSumme: number;
  dieselzuschlagProzent: number;
  dieselzuschlagSumme: number;
  dieselStandDatum: string;
  nettoSumme: number;
  ustSatzProzent: number;
  ustSumme: number;
  bruttoSumme: number;
}

type SeitenStatus = 'laden' | 'fehler' | 'bereit';

const euro = (wert: number): string =>
  `${wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const zahl = (wert: number, stellen = 0): string =>
  wert.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/** Übersetzt HTTP-Status in eine Meldung, die dem Kunden weiterhilft. */
const meldungZuStatus = (status: number, serverText?: string): string => {
  if (serverText) return serverText;
  if (status === 403) return 'Dieser Link ist nicht mehr gültig. Bitte fordern Sie einen neuen Link bei uns an.';
  if (status === 404) return 'Zu diesem Link finden wir keine Kundendaten. Bitte rufen Sie uns kurz an.';
  if (status === 429)
    return 'Es wurden sehr viele Berechnungen hintereinander angefragt. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
  if (status === 400) return 'Der Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen.';
  return 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.';
};

const Frachtrechner = () => {
  const { kundeId } = useParams<{ kundeId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<SeitenStatus>('laden');
  const [ladeFehler, setLadeFehler] = useState('');
  const [kopf, setKopf] = useState<RechnerKopf | null>(null);

  // Eingaben
  const [paletten, setPaletten] = useState(0);
  const [koernung, setKoernung] = useState<Koernung>('0-2');
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

  /** Laufender Debounce-Timer, damit ein Klick auf „Kosten berechnen" ihn abräumt. */
  const autoTimer = useRef<number | null>(null);

  const maxPaletten = kopf?.maxPaletten || MAX_PALETTEN_FALLBACK;

  // Dark Mode: Auf dieser öffentlichen Seite folgt das Theme der System-
  // Einstellung des Kunden — das Portal-Theme ist class-basiert und für externe
  // Besucher immer "light", ohne diesen Effekt wären alle dark:-Klassen tot.
  // Der Effekt gehört ins KundenseiteLayout; er steht hier NICHT noch einmal.

  const ladeKopf = useCallback(async () => {
    if (!kundeId || !token) {
      setLadeFehler('Der Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen.');
      setStatus('fehler');
      return;
    }
    setStatus('laden');
    setLadeFehler('');
    try {
      const res = await fetch(
        `${FUNCTION_URL}?kundeId=${encodeURIComponent(kundeId)}&token=${encodeURIComponent(token)}`
      );
      const json = (await res.json().catch(() => ({}))) as Partial<RechnerKopf> & {
        error?: string;
        fehlertext?: string;
      };
      if (!res.ok || !json.kundenname) {
        setLadeFehler(meldungZuStatus(res.status, json.fehlertext || json.error));
        setStatus('fehler');
        return;
      }
      setKopf({
        kundenname: json.kundenname,
        kundennummer: json.kundennummer || '',
        maxPaletten: json.maxPaletten || MAX_PALETTEN_FALLBACK,
        hinweisPreisstand: json.hinweisPreisstand || '',
      });
      setStatus('bereit');
    } catch {
      setLadeFehler('Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.');
      setStatus('fehler');
    }
  }, [kundeId, token]);

  useEffect(() => {
    void ladeKopf();
  }, [ladeKopf]);

  const berechne = useCallback(async () => {
    if (!kundeId || !token) return;
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
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kundeId, token, paletten, koernung, zielPLZ }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        ergebnis?: Ergebnis;
        fehler?: string;
        fehlertext?: string;
        error?: string;
      };
      // Veraltete Antwort: der Kunde hat inzwischen weitergetippt.
      if (nr !== anfrageNr.current) return;

      if (!res.ok || !json.ok || !json.ergebnis) {
        setErgebnis(null);
        setRechenFehler(meldungZuStatus(res.status, json.fehlertext || json.error));
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
  }, [kundeId, token, paletten, koernung, zielPLZ]);

  // Automatisch neu rechnen, sobald die Eingaben vollständig sind.
  useEffect(() => {
    if (status !== 'bereit') return;
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
  }, [status, paletten, koernung, zielPLZ, berechne]);

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

  const setzeKoernung = (wert: Koernung) => {
    if (wert === koernung) return;
    eingabeGeaendert();
    setKoernung(wert);
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
  // Schutz gegen die „Infinity €"-Anzeige des internen Rechners: ohne Menge
  // darf gar kein Ergebnisblock entstehen.
  const zeigeErgebnis = Boolean(ergebnis) && paletten > 0;

  const feldKlasse =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-dark-text placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent';

  // Das Layout setzt „Tennismehl GmbH" selbst. Als Untertitel gehört deshalb der
  // Kundenname hinein (sobald geladen), nicht noch einmal die Firma — sonst steht
  // in der Kopfzeile „Tennismehl GmbH · Tennismehl GmbH".
  return (
    <KundenseiteLayout titel="Frachtkostenrechner" untertitel={kopf?.kundenname} icon={Truck} breit>
      {/* Laden */}
      {status === 'laden' && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-red-600 dark:text-dark-accent mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Rechner wird geladen …</p>
        </div>
      )}

      {/* Link ungültig, Kunde unbekannt, keine Verbindung */}
      {status === 'fehler' && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto" />
          <p className="mt-4 font-semibold text-gray-900 dark:text-dark-text">{ladeFehler}</p>
          <button
            onClick={() => void ladeKopf()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 font-medium text-gray-800 dark:text-dark-text"
          >
            <RefreshCw className="h-5 w-5" />
            Erneut versuchen
          </button>
          <p className="mt-6 text-sm text-gray-600 dark:text-dark-textMuted">
            Oder rufen Sie uns an:{' '}
            <a href="tel:+49939198700" className="font-semibold text-red-600 dark:text-dark-accent">
              09391 98700
            </a>
          </p>
        </div>
      )}

      {status === 'bereit' && kopf && (
        <div className="space-y-4">
          {/* Begrüßung */}
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
            <p className="!text-lg font-bold text-gray-900 dark:text-dark-text">
              Guten Tag, {kopf.kundenname}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
              {/* Bewusst „frei Bordsteinkante", nicht „frei Baustelle": Palettenware geht
                  per Spedition, und der Vorbehalte-Block sagt weiter unten dasselbe.
                  „Frei Baustelle" ist der Begriff für loses Schüttgut per Silo-LKW —
                  hier stünde er im Widerspruch zur Fracht-Zeile im Ergebnis. */}
              Berechnen Sie hier unverbindlich Ihre Gesamtkosten für gesackte Ware
              frei Bordsteinkante.
              {kopf.kundennummer && ` · Kundennummer ${kopf.kundennummer}`}
            </p>
            {kopf.hinweisPreisstand && (
              <p className="mt-2 inline-block rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-600 dark:text-dark-textMuted">
                {kopf.hinweisPreisstand}
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
                  step/placeholder/className). Die reichhaltigere Fassung mit `suffix`,
                  `dezimalstellen` und `bereichWarnung` liegt derzeit als unfertiger
                  Umbau im Arbeitsbaum, ist aber nicht committet — diese Seite würde
                  damit auf dem Build-Server nicht übersetzen. Das Suffix zeichnen wir
                  deshalb selbst; `pointer-events-none` lässt den Klick ins Feld durch. */}
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

            {/* 2. Körnung — Knöpfe statt Select-Box: auf dem Handy deutlich bedienbarer */}
            <div>
              <span className="block font-semibold text-gray-900 dark:text-dark-text">Körnung</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(['0-2', '0-3'] as Koernung[]).map((wert) => {
                  const aktiv = koernung === wert;
                  return (
                    <button
                      key={wert}
                      type="button"
                      onClick={() => setzeKoernung(wert)}
                      aria-pressed={aktiv}
                      className={`rounded-xl border-2 px-4 py-3.5 text-base font-bold transition-colors ${
                        aktiv
                          ? 'border-red-600 bg-red-600 text-white shadow'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-dark-text'
                      }`}
                    >
                      {wert === '0-2' ? '0/2 mm' : '0/3 mm'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Ziel-PLZ */}
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
                  Kosten berechnen
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

          {/* Ergebnis */}
          {zeigeErgebnis && ergebnis && (
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="font-semibold text-gray-900 dark:text-dark-text">Ihre Kalkulation</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                {ergebnis.bezeichnung} · {zahl(ergebnis.paletten)}{' '}
                {ergebnis.paletten === 1 ? 'Palette' : 'Paletten'} ={' '}
                {zahl(ergebnis.tonnen, ergebnis.tonnen % 1 === 0 ? 0 : 2)} t · Lieferung nach{' '}
                {zielPLZ}
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="text-gray-800 dark:text-dark-text">
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2.5 pr-3">
                        Material
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {zahl(ergebnis.tonnen, ergebnis.tonnen % 1 === 0 ? 0 : 2)} t ×{' '}
                          {euro(ergebnis.materialProTonne)}/t
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                        {euro(ergebnis.materialSumme)}
                      </td>
                    </tr>

                    {ergebnis.palettenSumme > 0 && (
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2.5 pr-3">
                          Einwegpaletten
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {zahl(ergebnis.paletten)} ×{' '}
                            {euro(ergebnis.palettenPreisProStueck)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                          {euro(ergebnis.palettenSumme)}
                        </td>
                      </tr>
                    )}

                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2.5 pr-3">
                        Fracht
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          frei Bordsteinkante, {zielPLZ}
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
                          {zahl(ergebnis.dieselzuschlagProzent, 2)} % — Stand{' '}
                          {ergebnis.dieselStandDatum}
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

              {/* Pflichttext: steht direkt am Ergebnis, nicht als Fußnote */}
              <p className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-xs leading-relaxed text-gray-700 dark:text-dark-textMuted">
                <strong className="text-gray-900 dark:text-dark-text">
                  Unverbindliche Berechnung.
                </strong>{' '}
                Diese Berechnung ist freibleibend und ohne Gewähr; sie ist kein Angebot im Sinne des
                § 145 BGB. Ein Vertrag kommt erst mit unserer Auftragsbestätigung zustande.
                Maßgeblich sind unser schriftliches Angebot und unsere AGB. Zwischenverkauf
                vorbehalten.
              </p>

              <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-dark-textMuted">
                Alle Preise in Euro zzgl. 19 % USt. (Lieferung innerhalb Deutschlands). Angebot
                ausschließlich an Unternehmer, Kaufleute, eingetragene Vereine und juristische
                Personen des öffentlichen Rechts — nicht an Verbraucher.
              </p>

              <details className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-dark-text">
                  Vorbehalte zu Dieselzuschlag, Abladen und Menge
                </summary>
                <div className="space-y-2 px-4 pb-4 text-xs leading-relaxed text-gray-600 dark:text-dark-textMuted">
                  <p>
                    <strong className="text-gray-900 dark:text-dark-text">Dieselpreiszuschlag:</strong>{' '}
                    Der ausgewiesene Zuschlag entspricht dem Stand {ergebnis.dieselStandDatum} und
                    wird zum Lieferdatum neu ermittelt.
                  </p>
                  <p>
                    <strong className="text-gray-900 dark:text-dark-text">Abladen:</strong> Die
                    Anlieferung erfolgt frei Bordsteinkante. Für das Abladen ist der Empfänger
                    verantwortlich; ein Stapler oder Hubwagen muss bereitstehen.
                  </p>
                  <p>
                    <strong className="text-gray-900 dark:text-dark-text">Menge:</strong> Abgerechnet
                    wird die tatsächlich gelieferte Menge. Abweichungen bis 10 % gelten als
                    vereinbart.
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
      )}
    </KundenseiteLayout>
  );
};

export default Frachtrechner;
