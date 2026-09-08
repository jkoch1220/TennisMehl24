/**
 * AbholungQrKarte
 *
 * Der QR-Code zur Empfangsbestätigung — am Bildschirm, nicht auf Papier.
 *
 * Bei einer Abholung ab Werk steht der Abholer vor jemandem von uns. Läge der
 * Code nur auf dem gedruckten Lieferschein, müsste für einen Vorgang, der
 * gerade papierlos werden soll, zuerst Papier entstehen. Deshalb zeigt diese
 * Karte denselben Code direkt an: Der Kollege im Werk dreht den Bildschirm
 * (oder öffnet die Karte am Handy), der Abholer scannt, unterschreibt auf
 * seinem eigenen Gerät — fertig.
 *
 * Der Link ist derselbe wie auf dem Lieferschein: dasselbe Token, dieselbe
 * Prüfung serverseitig. Er wird beim Öffnen der Karte erzeugt und dabei am
 * Projekt gesichert (holeLiefernachweisUrlFuerProjekt), damit ein danach
 * gedruckter Lieferschein exakt denselben Code trägt.
 */

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, Maximize2, QrCode, RefreshCw, X } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { holeLiefernachweisUrlFuerProjekt } from '../../services/liefernachweisService';

interface AbholungQrKarteProps {
  projekt: Projekt;
}

const AbholungQrKarte = ({ projekt }: AbholungQrKarteProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'laden' | 'bereit' | 'fehler'>('laden');
  const [kopiert, setKopiert] = useState(false);
  const [vollbild, setVollbild] = useState(false);

  const projektId = projekt.$id || projekt.id;

  const ladeCode = useCallback(async () => {
    setStatus('laden');
    try {
      const link = await holeLiefernachweisUrlFuerProjekt(projektId);
      if (!link) {
        setStatus('fehler');
        return;
      }
      // Grosszügige Auflösung: Der Code wird vom Bildschirm abfotografiert,
      // teils über eine Fensterscheibe oder in der Halle bei schlechtem Licht.
      const bild = await QRCode.toDataURL(link, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
      setUrl(link);
      setQrDataUrl(bild);
      setStatus('bereit');
    } catch (fehler) {
      console.warn('QR-Code für die Abholung konnte nicht erzeugt werden:', fehler);
      setStatus('fehler');
    }
  }, [projektId]);

  useEffect(() => {
    void ladeCode();
  }, [ladeCode]);

  const kopiereLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2500);
    } catch {
      // Ohne Zwischenablage-Freigabe bleibt der Link sichtbar zum Abtippen.
    }
  };

  return (
    <>
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h3 className="font-semibold text-amber-900 dark:text-amber-200">
            Abholung: Empfang digital unterschreiben
          </h3>
        </div>
        <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
          Diesen Code dem Abholer zeigen. Er scannt ihn mit dem eigenen Handy, trägt seinen Namen
          ein und unterschreibt. Der unterschriebene Lieferschein geht danach automatisch per
          E-Mail an den Kunden — ein Ausdruck ist nicht nötig.
        </p>

        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            {status === 'laden' && (
              <div className="flex h-40 w-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
              </div>
            )}
            {status === 'fehler' && (
              <div className="flex h-40 w-40 flex-col items-center justify-center gap-2 px-2 text-center">
                <p className="text-xs text-gray-600">Code konnte nicht erzeugt werden.</p>
                <button
                  onClick={() => void ladeCode()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Erneut versuchen
                </button>
              </div>
            )}
            {status === 'bereit' && qrDataUrl && (
              <button onClick={() => setVollbild(true)} title="Groß anzeigen">
                <img src={qrDataUrl} alt="QR-Code zur Empfangsbestätigung" className="h-40 w-40" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {status === 'bereit' && (
              <>
                <button
                  onClick={() => setVollbild(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <Maximize2 className="h-4 w-4" />
                  Groß anzeigen
                </button>
                <button
                  onClick={() => void kopiereLink()}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  {kopiert ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {kopiert ? 'Kopiert' : 'Link kopieren'}
                </button>
                <p className="break-all text-xs text-amber-900/70 dark:text-amber-200/70">{url}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Vollbild: der eigentliche Übergabemoment — der Code muss quer durch
          den Raum und aus schrägem Winkel scannbar sein. */}
      {vollbild && qrDataUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-6"
          onClick={() => setVollbild(false)}
        >
          <button
            onClick={() => setVollbild(false)}
            className="absolute right-6 top-6 rounded-lg p-2 hover:bg-gray-100"
            title="Schließen"
          >
            <X className="h-6 w-6 text-gray-700" />
          </button>
          <p className="mb-4 text-center text-xl font-bold text-gray-900">
            Bitte scannen und Empfang bestätigen
          </p>
          <img
            src={qrDataUrl}
            alt="QR-Code zur Empfangsbestätigung"
            className="h-auto w-[min(80vw,80vh)] max-w-[520px]"
          />
          <p className="mt-4 max-w-md text-center text-sm text-gray-600">
            {projekt.kundenname}
            {projekt.lieferscheinnummer ? ` · Lieferschein ${projekt.lieferscheinnummer}` : ''}
          </p>
        </div>
      )}
    </>
  );
};

export default AbholungQrKarte;
