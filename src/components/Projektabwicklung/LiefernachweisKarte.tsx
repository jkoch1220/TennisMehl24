/**
 * LiefernachweisKarte
 *
 * Zeigt im Lieferschein-Tab, wie die Ware beim Kunden ankam — auf zwei Wegen,
 * die hier bewusst verschieden aussehen, weil sie verschiedene Dinge belegen:
 *
 * - FAHRER: Zeitpunkt, Fahrername, Abladefoto, optionale Unterschrift, GPS.
 * - ABHOLUNG AB WERK: Wer im Werk unterschrieben hat, mit welchem Fahrzeug,
 *   wer übergeben hat — und ob der unterschriebene Lieferschein beim Kunden
 *   angekommen ist. Genau das ist der Punkt, an dem im Büro etwas zu tun sein
 *   kann: Scheitert der automatische Versand (Tippfehler in der Adresse,
 *   Mailserver weg), lässt er sich hier erneut auslösen.
 *
 * Bis 07/2026 landeten diese Daten zwar in Appwrite, hatten im Portal aber keinen
 * einzigen Leser — sichtbar waren sie nur eingebettet im archivierten Nachweis-PDF.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  PackageCheck,
  PenLine,
  Truck,
  User,
  X,
} from 'lucide-react';
import { LieferscheinVersandInfo, Projekt } from '../../types/projekt';
import {
  getLiefernachweisDateiUrl,
  sendeLieferscheinErneut,
} from '../../services/liefernachweisService';
import { istAbholungsNachweis } from '../../utils/liefernachweisArt';

interface LiefernachweisKarteProps {
  projekt: Projekt;
}

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

const LiefernachweisKarte = ({ projekt }: LiefernachweisKarteProps) => {
  const [grossbild, setGrossbild] = useState<{ url: string; titel: string } | null>(null);
  const [zeigeVersandFeld, setZeigeVersandFeld] = useState(false);
  const [empfaenger, setEmpfaenger] = useState('');
  const [sendeStatus, setSendeStatus] = useState<'bereit' | 'senden'>('bereit');
  const [sendeFehler, setSendeFehler] = useState<string | null>(null);
  // Ergebnis des Versands aus DIESER Sitzung. Der Wert am Projekt wird erst
  // beim nächsten Laden neu gelesen — ohne diesen State stünde nach einem
  // erfolgreichen Nachversand weiterhin die alte Fehlermeldung da.
  const [versandLokal, setVersandLokal] = useState<LieferscheinVersandInfo | null>(null);

  // Ohne Bestätigungszeitpunkt gab es keinen Scan — dann zeigen wir gar nichts an.
  if (!projekt.liefernachweisAm) return null;

  const nachweis = projekt.liefernachweis;
  const abholung = istAbholungsNachweis(projekt);
  const fotoUrl = nachweis?.fotoDateiId ? getLiefernachweisDateiUrl(nachweis.fotoDateiId) : null;
  const unterschriftUrl = nachweis?.unterschriftDateiId
    ? getLiefernachweisDateiUrl(nachweis.unterschriftDateiId)
    : null;
  const geo = nachweis?.geo;
  const versand = versandLokal ?? nachweis?.lieferscheinVersand;

  const starteVersand = async () => {
    const ziel = empfaenger.trim();
    if (!ziel) return;
    setSendeStatus('senden');
    setSendeFehler(null);
    try {
      const ergebnis = await sendeLieferscheinErneut(projekt, ziel);
      setVersandLokal(ergebnis);
      setZeigeVersandFeld(false);
      setEmpfaenger('');
    } catch (fehler) {
      setSendeFehler(fehler instanceof Error ? fehler.message : String(fehler));
    } finally {
      setSendeStatus('bereit');
    }
  };

  const oeffneVersandFeld = () => {
    // Vorbelegen mit der zuletzt verwendeten Adresse, sonst der Kundenadresse —
    // im Fehlerfall ist meist genau die zu korrigieren.
    setEmpfaenger(versand?.an || projekt.kundenEmail || '');
    setSendeFehler(null);
    setZeigeVersandFeld(true);
  };

  return (
    <>
      <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          {abholung ? (
            <Truck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          ) : (
            <PackageCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          )}
          <h3 className="font-semibold text-teal-900 dark:text-teal-200">
            {abholung ? 'Im Werk abgeholt und unterschrieben' : 'Vom Fahrer bestätigt'}
          </h3>
          <span className="ml-auto text-sm text-teal-800 dark:text-teal-300">
            {formatZeitpunkt(projekt.liefernachweisAm)}
          </span>
        </div>

        <dl className="space-y-1.5 text-sm">
          {abholung ? (
            <>
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                <dt className="text-gray-600 dark:text-gray-400">Abholer:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {nachweis?.unterzeichnerName || '—'}
                </dd>
              </div>

              {nachweis?.kennzeichen && (
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                  <dt className="text-gray-600 dark:text-gray-400">Kennzeichen:</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {nachweis.kennzeichen}
                  </dd>
                </div>
              )}

            </>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                <dt className="text-gray-600 dark:text-gray-400">Fahrer:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {nachweis?.fahrerName || '—'}
                </dd>
              </div>

              {nachweis?.unterzeichnerName && (
                <div className="flex items-start gap-2">
                  <PenLine className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                  <dt className="text-gray-600 dark:text-gray-400">Abgenommen von:</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {nachweis.unterzeichnerName}
                  </dd>
                </div>
              )}
            </>
          )}

          {geo && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
              <dt className="text-gray-600 dark:text-gray-400">Position:</dt>
              <dd>
                <a
                  href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-teal-700 dark:text-teal-300 hover:underline"
                >
                  {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {(fotoUrl || unterschriftUrl) && (
          <div className="mt-4 flex flex-wrap gap-4">
            {unterschriftUrl && (
              <button
                onClick={() =>
                  setGrossbild({
                    url: unterschriftUrl,
                    titel: abholung ? 'Unterschrift des Abholers' : 'Unterschrift',
                  })
                }
                className="group text-left"
                title="Unterschrift vergrößern"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <PenLine className="h-3.5 w-3.5" />
                  Unterschrift
                </div>
                <img
                  src={unterschriftUrl}
                  alt={abholung ? 'Unterschrift des Abholers' : 'Unterschrift des Abnehmers'}
                  className="h-28 w-auto rounded-lg border border-teal-200 dark:border-teal-800 bg-white object-contain group-hover:ring-2 group-hover:ring-teal-400 transition-all"
                />
              </button>
            )}

            {fotoUrl && (
              <button
                onClick={() =>
                  setGrossbild({
                    url: fotoUrl,
                    titel: abholung ? 'Foto der Ladung' : 'Foto der abgeladenen Ware',
                  })
                }
                className="group text-left"
                title="Foto vergrößern"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <Camera className="h-3.5 w-3.5" />
                  {abholung ? 'Ladungsfoto' : 'Abladefoto'}
                </div>
                <img
                  src={fotoUrl}
                  alt={abholung ? 'Foto der Ladung' : 'Foto der abgeladenen Ware'}
                  className="h-28 w-auto rounded-lg border border-teal-200 dark:border-teal-800 object-cover group-hover:ring-2 group-hover:ring-teal-400 transition-all"
                />
              </button>
            )}
          </div>
        )}

        {/* Versand des unterschriebenen Lieferscheins — nur bei Abholung */}
        {abholung && (
          <div className="mt-4 border-t border-teal-200 dark:border-teal-800 pt-3">
            {versand?.status === 'gesendet' && (
              <p className="flex items-start gap-2 text-sm text-teal-900 dark:text-teal-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                <span>
                  Unterschriebener Lieferschein an{' '}
                  <span className="font-medium break-all">{versand.an}</span> gesendet (
                  {formatZeitpunkt(versand.am)}).
                </span>
              </p>
            )}

            {versand?.status === 'fehler' && (
              <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Der Versand an <span className="font-medium break-all">{versand.an}</span> ist
                  fehlgeschlagen{versand.fehler ? `: ${versand.fehler}` : '.'} Bitte hier erneut
                  senden.
                </span>
              </p>
            )}

            {!versand && (
              <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Der Abholer hat keine E-Mail-Adresse angegeben — der Lieferschein wurde nicht
                  verschickt.
                </span>
              </p>
            )}

            {zeigeVersandFeld ? (
              <div className="mt-3 space-y-2">
                {/* Kein type="email": Das Feld nimmt mehrere Adressen auf,
                    die Browser-Prüfung würde sie als ungültig abweisen. */}
                <input
                  type="text"
                  value={empfaenger}
                  onChange={(e) => setEmpfaenger(e.target.value)}
                  placeholder="name@verein.de, buchhaltung@verein.de"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                />
                {sendeFehler && (
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">{sendeFehler}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => void starteVersand()}
                    disabled={sendeStatus === 'senden' || !empfaenger.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    {sendeStatus === 'senden' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird gesendet …
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Jetzt senden
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setZeigeVersandFeld(false)}
                    disabled={sendeStatus === 'senden'}
                    className="rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={oeffneVersandFeld}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline"
              >
                <Mail className="h-4 w-4" />
                {versand?.status === 'gesendet'
                  ? 'An weitere Adresse senden'
                  : 'Lieferschein jetzt senden'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Großansicht */}
      {grossbild && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setGrossbild(null)}
        >
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{grossbild.titel}</span>
              <button
                onClick={() => setGrossbild(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Schließen"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
            <img
              src={grossbild.url}
              alt={grossbild.titel}
              className="max-h-[80vh] w-auto rounded-lg bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default LiefernachweisKarte;
