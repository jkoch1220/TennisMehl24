/**
 * WiegescheinKarte
 *
 * Prüfung der Wiegeschein-Menge im Lieferschein-Tab.
 *
 * Der Fahrer hat den Wiegeschein beim Abladen fotografiert, eine Bilderkennung
 * hat die Nettomenge vorgelesen. Diese Karte ist die Stelle, an der ein Mensch
 * das gegenprüft — vorher zählt die maschinell gelesene Zahl nirgends.
 *
 * Gestaltungsprinzip: Das Foto ist die Autorität, nicht der Vorschlag. Deshalb
 * steht das Bild oben und groß, der gelesene Wert erscheint darunter sichtbar
 * als "noch nicht geprüft" markiert, und das Eingabefeld ist immer editierbar.
 * Wer nur klickt, ohne hinzusehen, soll wenigstens am Wortlaut merken, dass er
 * gerade etwas bestätigt.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Scale,
  ShieldQuestion,
  X,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { getLiefernachweisDateiUrl } from '../../services/liefernachweisService';
import {
  ABWEICHUNG_WARNSCHWELLE,
  bestaetigeWiegescheinMenge,
  berechneAbweichung,
  markiereWiegescheinUnlesbar,
  setzeWiegescheinPruefungZurueck,
} from '../../services/wiegescheinService';
import { useAuth } from '../../contexts/AuthContext';

interface WiegescheinKarteProps {
  projekt: Projekt;
  /** Wird nach jeder gespeicherten Änderung mit dem frischen Projekt aufgerufen */
  onAktualisiert?: (projekt: Projekt) => void;
}

/*
 * Hinweis zum Zustand: Die Karte hält das Ergebnis der Prüfung selbst, damit sie
 * sofort umschaltet, ohne dass der umgebende Tab neu laden muss. Beim Wechsel auf
 * ein anderes Projekt muss die Karte deshalb neu montiert werden — Aufrufer
 * setzen dafür ein key={projekt.$id}.
 */

const formatZeitpunkt = (iso?: string): string => {
  if (!iso) return '—';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '—';
  return datum.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTonnen = (wert?: number): string =>
  wert === undefined ? '—' : `${wert.toLocaleString('de-DE', { maximumFractionDigits: 3 })} t`;

const WiegescheinKarte = ({ projekt: projektProp, onAktualisiert }: WiegescheinKarteProps) => {
  const { user } = useAuth();
  const [gespeichertesProjekt, setGespeichertesProjekt] = useState<Projekt | null>(null);
  const projekt = gespeichertesProjekt ?? projektProp;
  const wiegeschein = projekt.wiegeschein;
  const ocr = wiegeschein?.ocr;

  // Vorbelegung: der gelesene Wert, falls die Erkennung etwas Verwertbares
  // geliefert hat. Sonst leer — bewusst kein Platzhalter aus der Planung, damit
  // niemand versehentlich das Sollgewicht als Istgewicht bestätigt.
  const [menge, setMenge] = useState<string>(
    ocr?.gelesen && ocr.mengeTonnen !== undefined ? String(ocr.mengeTonnen).replace('.', ',') : ''
  );
  const [notiz, setNotiz] = useState('');
  const [zeigeUnlesbar, setZeigeUnlesbar] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [grossbild, setGrossbild] = useState(false);

  if (!wiegeschein?.fotoDateiId) return null;

  const fotoUrl = getLiefernachweisDateiUrl(wiegeschein.fotoDateiId);
  const istOffen = wiegeschein.pruefStatus === 'offen';
  const pruefer = { id: user?.$id, name: user?.name };

  // Deutsche Eingabe: Komma als Dezimaltrenner zulassen.
  const mengeAlsZahl = Number(menge.replace(',', '.').trim());
  const abweichung =
    Number.isFinite(mengeAlsZahl) && mengeAlsZahl > 0
      ? berechneAbweichung(mengeAlsZahl, projekt.liefergewicht)
      : null;
  const zeigeAbweichungswarnung =
    abweichung !== null && Math.abs(abweichung) > ABWEICHUNG_WARNSCHWELLE;

  const mitFehlerbehandlung = async (aktion: () => Promise<Projekt>) => {
    setSpeichert(true);
    setFehler(null);
    try {
      const aktualisiert = await aktion();
      setGespeichertesProjekt(aktualisiert);
      setNotiz('');
      setZeigeUnlesbar(false);
      onAktualisiert?.(aktualisiert);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichert(false);
    }
  };

  const bestaetigen = () =>
    mitFehlerbehandlung(() => bestaetigeWiegescheinMenge(projekt, mengeAlsZahl, pruefer, notiz));

  const alsUnlesbar = () =>
    mitFehlerbehandlung(() => markiereWiegescheinUnlesbar(projekt, notiz, pruefer));

  const zuruecksetzen = () =>
    mitFehlerbehandlung(() =>
      setzeWiegescheinPruefungZurueck(projekt, 'Erneute Prüfung angefordert', pruefer)
    );

  return (
    <>
      <div
        className={`rounded-xl border p-4 ${
          istOffen
            ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
            : 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30'
        }`}
      >
        <div className="mb-3 flex items-center gap-2">
          <Scale
            className={`h-5 w-5 ${
              istOffen
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-teal-600 dark:text-teal-400'
            }`}
          />
          <h3
            className={`font-semibold ${
              istOffen
                ? 'text-amber-900 dark:text-amber-200'
                : 'text-teal-900 dark:text-teal-200'
            }`}
          >
            Wiegeschein
          </h3>
          {istOffen ? (
            <span className="ml-auto rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
              Prüfung offen
            </span>
          ) : (
            <span className="ml-auto text-sm text-teal-800 dark:text-teal-300">
              {formatZeitpunkt(wiegeschein.geprueftAm)}
            </span>
          )}
        </div>

        {/* Der Beleg selbst — die eigentliche Autorität */}
        <button
          onClick={() => setGrossbild(true)}
          className="group block w-full text-left"
          title="Wiegeschein vergrößern"
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <Camera className="h-3.5 w-3.5" />
            Foto vom {formatZeitpunkt(wiegeschein.erfasstAm)} — zum Vergrößern tippen
          </div>
          <img
            src={fotoUrl}
            alt="Wiegeschein"
            className="max-h-64 w-auto rounded-lg border border-gray-200 bg-white object-contain transition-all group-hover:ring-2 group-hover:ring-amber-400 dark:border-gray-700"
          />
        </button>

        {/* Maschinenlesung — als Vorschlag gekennzeichnet, nie als Ergebnis */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Bot className="h-3.5 w-3.5" />
            Automatisch gelesen — ungeprüfter Vorschlag
          </div>

          {ocr?.gelesen ? (
            <>
              <p className="mt-1.5 text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatTonnen(ocr.mengeTonnen)}
                {ocr.menge !== undefined && ocr.einheit && (
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    (abgelesen: {ocr.menge.toLocaleString('de-DE')} {ocr.einheit})
                  </span>
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                {ocr.belegnummer && <span>Beleg-Nr. {ocr.belegnummer}</span>}
                {ocr.kennzeichen && <span>Kennzeichen {ocr.kennzeichen}</span>}
                {ocr.datum && <span>Datum {ocr.datum}</span>}
                {typeof ocr.konfidenz === 'number' && (
                  <span>Lesbarkeit {Math.round(ocr.konfidenz * 100)} %</span>
                )}
              </div>
              {typeof ocr.konfidenz === 'number' && ocr.konfidenz < 0.7 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  Unsichere Lesung — bitte besonders genau mit dem Foto abgleichen.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <ShieldQuestion className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {ocr?.fehler || 'Keine Menge automatisch gelesen — bitte vom Foto abtippen.'}
            </p>
          )}

          {ocr?.hinweis && (
            <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">
              Hinweis der Erkennung: {ocr.hinweis}
            </p>
          )}
        </div>

        {/* Prüfbereich */}
        {istOffen ? (
          <div className="mt-4 space-y-3">
            {!zeigeUnlesbar && (
              <>
                <label
                  htmlFor="gepruefteMenge"
                  className="block text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                  Nettomenge laut Wiegeschein
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="gepruefteMenge"
                    type="text"
                    inputMode="decimal"
                    value={menge}
                    onChange={(e) => setMenge(e.target.value)}
                    placeholder="z. B. 24,32"
                    disabled={speichert}
                    className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg font-semibold text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                    Tonnen
                  </span>
                </div>

                {zeigeAbweichungswarnung && abweichung !== null && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      Weicht um {(abweichung * 100).toFixed(1).replace('.', ',')} % vom geplanten
                      Gewicht ({formatTonnen(projekt.liefergewicht)}) ab. Bitte prüfen, ob das so
                      stimmt.
                    </span>
                  </p>
                )}

                <input
                  type="text"
                  value={notiz}
                  onChange={(e) => setNotiz(e.target.value)}
                  placeholder="Notiz (optional), z. B. Rückfrage bei der Waage"
                  disabled={speichert}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void bestaetigen()}
                    disabled={speichert || !menge.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {speichert ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Menge bestätigen
                  </button>
                  <button
                    onClick={() => setZeigeUnlesbar(true)}
                    disabled={speichert}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Menge nicht lesbar
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Mit dem Bestätigen wird diese Menge als Liefergewicht übernommen und beim
                  Rechnungsschreiben angezeigt.
                </p>
              </>
            )}

            {zeigeUnlesbar && (
              <div className="space-y-2 rounded-lg border border-gray-300 p-3 dark:border-gray-600">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Warum ist die Menge nicht feststellbar?
                </p>
                <input
                  type="text"
                  value={notiz}
                  onChange={(e) => setNotiz(e.target.value)}
                  placeholder="z. B. Foto unscharf, Fahrer kontaktiert"
                  disabled={speichert}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Das Liefergewicht bleibt unverändert bei {formatTonnen(projekt.liefergewicht)}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void alsUnlesbar()}
                    disabled={speichert || !notiz.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    {speichert && <Loader2 className="h-4 w-4 animate-spin" />}
                    Als nicht lesbar vermerken
                  </button>
                  <button
                    onClick={() => setZeigeUnlesbar(false)}
                    disabled={speichert}
                    className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:underline dark:text-gray-400"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Bereits geprüft */
          <div className="mt-4 rounded-lg border border-teal-200 bg-white/70 p-3 dark:border-teal-800 dark:bg-gray-900/40">
            {wiegeschein.pruefStatus === 'unlesbar' ? (
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Keine Menge feststellbar
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Geprüfte Nettomenge</p>
                <p className="text-2xl font-bold text-teal-800 dark:text-teal-300">
                  {formatTonnen(wiegeschein.gepruefteMengeTonnen)}
                </p>
              </>
            )}
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {wiegeschein.pruefStatus === 'korrigiert'
                ? 'Vom Vorschlag abweichend eingetragen'
                : wiegeschein.pruefStatus === 'bestaetigt'
                  ? 'Vorschlag der Erkennung bestätigt'
                  : 'Als nicht lesbar vermerkt'}
              {wiegeschein.geprueftVonName ? ` von ${wiegeschein.geprueftVonName}` : ''} am{' '}
              {formatZeitpunkt(wiegeschein.geprueftAm)}
            </p>
            {wiegeschein.pruefNotiz && (
              <p className="mt-1.5 text-sm italic text-gray-700 dark:text-gray-300">
                „{wiegeschein.pruefNotiz}"
              </p>
            )}
            <button
              onClick={() => void zuruecksetzen()}
              disabled={speichert}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
            >
              {speichert ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Erneut prüfen
            </button>
          </div>
        )}

        {fehler && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
            {fehler}
          </p>
        )}
      </div>

      {/* Großansicht des Belegs */}
      {grossbild && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setGrossbild(false)}
        >
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-white">Wiegeschein</span>
              <button
                onClick={() => setGrossbild(false)}
                className="rounded-lg bg-white/10 p-1.5 transition-colors hover:bg-white/20"
                title="Schließen"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
            <img
              src={fotoUrl}
              alt="Wiegeschein"
              className="max-h-[80vh] w-auto rounded-lg bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default WiegescheinKarte;
