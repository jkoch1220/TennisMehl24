/**
 * Liefernachweis.tsx — Öffentliche Seite für den Speditionsfahrer (KEIN Login!)
 *
 * Aufruf über den QR-Code auf dem Lieferschein:
 *   /liefernachweis/:projektId?token=<token>[&test=1]
 *
 * Leitprinzip: maximal einfach — Scan → Auftrag kompakt sehen → „Abgeladen ✓"
 * → 1 Foto (Kamera) → fertig, unter 20 Sekunden. Unterschrift + Name optional.
 *
 * Es gibt KEINEN direkten Appwrite-Zugriff: alle Lese-/Schreiboperationen
 * laufen über die Netlify Function /.netlify/functions/liefernachweis.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  PenLine,
  RefreshCw,
  Truck,
  XCircle,
} from 'lucide-react';

const FUNCTION_URL = '/.netlify/functions/liefernachweis';

interface AuftragsPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
}

interface AuftragsInfo {
  kundenname: string;
  lieferadresse: string;
  lieferscheinnummer: string;
  geplantesDatum: string | null;
  liefergewicht: number | null;
  anzahlPaletten: number | null;
  positionen: AuftragsPosition[];
  bereitsBestaetigt: boolean;
  liefernachweisAm: string | null;
}

type SeitenStatus = 'laden' | 'fehler' | 'auftrag' | 'foto' | 'senden' | 'fertig';

/** Foto auf sinnvolle Größe komprimieren (max. 1600 px, JPEG 80 %) */
const komprimiereFoto = (datei: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      try {
        const maxKante = 1600;
        const skalierung = Math.min(1, maxKante / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * skalierung);
        canvas.height = Math.round(img.height * skalierung);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas nicht verfügbar'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (fehler) {
        reject(fehler);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Foto konnte nicht gelesen werden'));
    };
    img.src = url;
  });

/** Geolocation abfragen (nur nach Browser-Freigabe, Fehler werden ignoriert) */
const holePosition = (): Promise<{ lat: number; lng: number; genauigkeitM?: number } | undefined> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(undefined);
      return;
    }
    const timeout = window.setTimeout(() => resolve(undefined), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timeout);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          genauigkeitM: pos.coords.accuracy,
        });
      },
      () => {
        window.clearTimeout(timeout);
        resolve(undefined);
      },
      { enableHighAccuracy: false, timeout: 4500, maximumAge: 60000 }
    );
  });

/** Einfaches Unterschriften-Canvas (optional, Pointer Events) */
const UnterschriftCanvas = ({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zeichnetRef = useRef(false);
  const hatInhaltRef = useRef(false);

  const holeKontext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3a8a';
    return ctx;
  };

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = holeKontext();
    if (!ctx) return;
    zeichnetRef.current = true;
    const p = punkt(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const bewege = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!zeichnetRef.current) return;
    e.preventDefault();
    const ctx = holeKontext();
    if (!ctx) return;
    const p = punkt(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hatInhaltRef.current = true;
  };

  const ende = () => {
    if (!zeichnetRef.current) return;
    zeichnetRef.current = false;
    if (hatInhaltRef.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const leeren = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hatInhaltRef.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-32 bg-white dark:bg-gray-100 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg touch-none"
        onPointerDown={start}
        onPointerMove={bewege}
        onPointerUp={ende}
        onPointerLeave={ende}
        onPointerCancel={ende}
      />
      <button
        type="button"
        onClick={leeren}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text"
      >
        <RefreshCw className="h-4 w-4" />
        Unterschrift löschen
      </button>
    </div>
  );
};

const Liefernachweis = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const testModus = searchParams.get('test') === '1';

  const [status, setStatus] = useState<SeitenStatus>('laden');
  const [fehlerText, setFehlerText] = useState<string>('');
  const [auftrag, setAuftrag] = useState<AuftragsInfo | null>(null);

  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [fotoVerarbeitet, setFotoVerarbeitet] = useState(false);
  const [zeigeUnterschrift, setZeigeUnterschrift] = useState(false);
  const [unterschriftDataUrl, setUnterschriftDataUrl] = useState<string | null>(null);
  const [unterzeichnerName, setUnterzeichnerName] = useState('');
  const [fahrerName, setFahrerName] = useState('');

  const [ergebnis, setErgebnis] = useState<{
    bereitsBestaetigt?: boolean;
    testModus?: boolean;
    statusGesetzt?: boolean;
    liefernachweisAm?: string | null;
  } | null>(null);

  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  // Dark Mode: Auf dieser öffentlichen Seite folgt das Theme der System-
  // Einstellung des Fahrer-Smartphones (das Portal-Theme ist class-basiert und
  // für externe Besucher immer "light"). Beim Verlassen wird der vorherige
  // Zustand wiederhergestellt.
  useEffect(() => {
    const root = document.documentElement;
    const warDark = root.classList.contains('dark');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const anwenden = () => root.classList.toggle('dark', mq.matches);
    anwenden();
    mq.addEventListener('change', anwenden);
    return () => {
      mq.removeEventListener('change', anwenden);
      root.classList.toggle('dark', warDark);
    };
  }, []);

  // Auftragsdaten laden
  const ladeAuftrag = useCallback(async () => {
    if (!projektId || !token) {
      setFehlerText('Der Link ist unvollständig. Bitte den QR-Code erneut scannen.');
      setStatus('fehler');
      return;
    }
    setStatus('laden');
    setFehlerText('');
    try {
      const res = await fetch(
        `${FUNCTION_URL}?projektId=${encodeURIComponent(projektId)}&token=${encodeURIComponent(token)}`
      );
      const json = (await res.json()) as { auftrag?: AuftragsInfo; error?: string };
      if (!res.ok || !json.auftrag) {
        setFehlerText(json.error || 'Der Auftrag konnte nicht geladen werden.');
        setStatus('fehler');
        return;
      }
      setAuftrag(json.auftrag);
      if (json.auftrag.bereitsBestaetigt) {
        setErgebnis({
          bereitsBestaetigt: true,
          liefernachweisAm: json.auftrag.liefernachweisAm,
        });
        setStatus('fertig');
      } else {
        setStatus('auftrag');
      }
    } catch {
      setFehlerText('Keine Verbindung. Bitte Empfang prüfen und erneut versuchen.');
      setStatus('fehler');
    }
  }, [projektId, token]);

  useEffect(() => {
    void ladeAuftrag();
  }, [ladeAuftrag]);

  // Fotoauswahl → komprimieren
  const handleFotoAuswahl = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = ''; // gleiche Datei erneut wählbar
    if (!datei) return;
    setFotoVerarbeitet(true);
    try {
      const dataUrl = await komprimiereFoto(datei);
      setFotoDataUrl(dataUrl);
      setStatus('foto');
    } catch {
      setFehlerText('Das Foto konnte nicht verarbeitet werden. Bitte erneut aufnehmen.');
    } finally {
      setFotoVerarbeitet(false);
    }
  };

  // Bestätigung absenden
  const sendeBestaetigung = async () => {
    if (!projektId || !fotoDataUrl || !fahrerName.trim()) return;
    setStatus('senden');
    setFehlerText('');
    try {
      const geo = await holePosition();
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projektId,
          token,
          fotoBase64: fotoDataUrl,
          fahrerName: fahrerName.trim(),
          unterschriftBase64: unterschriftDataUrl || undefined,
          unterzeichnerName: unterzeichnerName.trim() || undefined,
          geo,
          testModus: testModus || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        bereitsBestaetigt?: boolean;
        testModus?: boolean;
        statusGesetzt?: boolean;
        liefernachweisAm?: string | null;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setFehlerText(json.error || 'Die Bestätigung ist fehlgeschlagen. Bitte erneut versuchen.');
        setStatus('foto');
        return;
      }
      setErgebnis(json);
      setStatus('fertig');
    } catch {
      setFehlerText('Keine Verbindung. Bitte Empfang prüfen und erneut versuchen.');
      setStatus('foto');
    }
  };

  const formatiereDatum = (iso?: string | null): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Kopf */}
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-600 dark:bg-dark-accent rounded-xl p-2.5">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Lieferung bestätigen
            </h1>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">Tennismehl GmbH</p>
          </div>
        </div>

        {testModus && (
          <div className="mb-4 rounded-lg border border-amber-400 bg-amber-100 dark:bg-amber-900/30 dark:border-amber-600 px-4 py-2.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            [TEST] Testmodus — es wird nichts gespeichert und kein Status geändert.
          </div>
        )}

        {/* Laden */}
        {status === 'laden' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-red-600 dark:text-dark-accent mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Auftrag wird geladen …</p>
          </div>
        )}

        {/* Fehler (ungültiger/abgelaufener Link etc.) */}
        {status === 'fehler' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <p className="mt-4 font-semibold text-gray-900 dark:text-dark-text">{fehlerText}</p>
            <button
              onClick={() => void ladeAuftrag()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 font-medium text-gray-800 dark:text-dark-text"
            >
              <RefreshCw className="h-5 w-5" />
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Auftrag kompakt + großer Button */}
        {status === 'auftrag' && auftrag && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-600 dark:text-dark-accent" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-dark-text">{auftrag.kundenname}</p>
                  <p className="text-sm text-gray-600 dark:text-dark-textMuted break-words">
                    {auftrag.lieferadresse}
                  </p>
                  {auftrag.lieferscheinnummer && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-textMuted">
                      Lieferschein-Nr. {auftrag.lieferscheinnummer}
                    </p>
                  )}
                </div>
              </div>

              {auftrag.positionen.length > 0 && (
                <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-textMuted">
                    <Package className="h-3.5 w-3.5" />
                    Ladung
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {auftrag.positionen.map((pos, i) => (
                      <li
                        key={i}
                        className="flex justify-between gap-3 text-sm text-gray-800 dark:text-dark-text"
                      >
                        <span className="break-words">{pos.bezeichnung}</span>
                        <span className="whitespace-nowrap font-semibold">
                          {pos.menge} {pos.einheit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Fahrer-Name (Pflicht): wer bestätigt die Lieferung? */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <label
                htmlFor="fahrerName"
                className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text"
              >
                <Truck className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                Ihr Name (Fahrer)
              </label>
              <input
                id="fahrerName"
                type="text"
                value={fahrerName}
                onChange={(e) => setFahrerName(e.target.value)}
                placeholder="Vor- und Nachname"
                autoComplete="name"
                className="mt-3 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-lg text-gray-900 dark:text-dark-text placeholder-gray-400"
              />
            </div>

            {fehlerText && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
            )}

            <button
              onClick={() => fotoInputRef.current?.click()}
              disabled={fotoVerarbeitet || !fahrerName.trim()}
              className="w-full rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 text-white text-2xl font-bold py-6 shadow-lg transition-colors"
            >
              {fotoVerarbeitet ? (
                <span className="inline-flex items-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  Foto wird verarbeitet …
                </span>
              ) : (
                'Abgeladen ✓'
              )}
            </button>
            <p className="text-center text-sm text-gray-500 dark:text-dark-textMuted">
              {fahrerName.trim()
                ? 'Danach nur noch 1 Foto der abgeladenen Ware aufnehmen — fertig.'
                : 'Bitte zuerst Ihren Namen eintragen, dann Foto aufnehmen — fertig.'}
            </p>
          </div>
        )}

        {/* Foto-Schritt: Vorschau + optionale Unterschrift + Absenden */}
        {(status === 'foto' || status === 'senden') && fotoDataUrl && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Camera className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                Foto der abgeladenen Ware
              </p>
              <img
                src={fotoDataUrl}
                alt="Foto der abgeladenen Ware"
                className="mt-3 w-full max-h-72 object-contain rounded-xl bg-gray-50 dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                disabled={status === 'senden'}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-dark-accent"
              >
                <RefreshCw className="h-4 w-4" />
                Foto neu aufnehmen
              </button>
            </div>

            {/* Unterschrift optional (bei Schüttgut ist oft niemand vor Ort) */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <button
                type="button"
                onClick={() => setZeigeUnterschrift((v) => !v)}
                disabled={status === 'senden'}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                  <PenLine className="h-5 w-5 text-gray-500 dark:text-dark-textMuted" />
                  Unterschrift hinzufügen
                </span>
                <span className="text-xs text-gray-500 dark:text-dark-textMuted">optional</span>
              </button>
              {zeigeUnterschrift && (
                <div className="mt-4 space-y-3">
                  <UnterschriftCanvas onChange={setUnterschriftDataUrl} />
                  <input
                    type="text"
                    value={unterzeichnerName}
                    onChange={(e) => setUnterzeichnerName(e.target.value)}
                    placeholder="Name des Unterzeichners (optional)"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-dark-text placeholder-gray-400"
                  />
                </div>
              )}
            </div>

            {fehlerText && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
            )}

            <button
              onClick={() => void sendeBestaetigung()}
              disabled={status === 'senden'}
              className="w-full rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 text-white text-xl font-bold py-5 shadow-lg transition-colors"
            >
              {status === 'senden' ? (
                <span className="inline-flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Wird übermittelt …
                </span>
              ) : (
                'Lieferung bestätigen ✓'
              )}
            </button>
          </div>
        )}

        {/* Fertig / bereits bestätigt */}
        {status === 'fertig' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            {ergebnis?.bereitsBestaetigt ? (
              <>
                <p className="mt-4 text-xl font-bold text-gray-900 dark:text-dark-text">
                  Diese Lieferung wurde bereits bestätigt.
                </p>
                {ergebnis.liefernachweisAm && (
                  <p className="mt-2 text-gray-600 dark:text-dark-textMuted">
                    am {formatiereDatum(ergebnis.liefernachweisAm)} Uhr
                  </p>
                )}
                <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
                  Alles erledigt — es ist nichts weiter zu tun.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 text-xl font-bold text-gray-900 dark:text-dark-text">
                  {ergebnis?.testModus
                    ? '[TEST] Ablauf erfolgreich durchlaufen!'
                    : 'Vielen Dank! Lieferung bestätigt.'}
                </p>
                <p className="mt-2 text-gray-600 dark:text-dark-textMuted">
                  {ergebnis?.testModus
                    ? 'Es wurde nichts gespeichert und kein Status geändert.'
                    : 'Der Liefernachweis wurde übermittelt. Sie können die Seite jetzt schließen.'}
                </p>
                {ergebnis && ergebnis.statusGesetzt === false && (
                  <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                    Hinweis: Der Nachweis wurde gespeichert, die Statusaktualisierung erfolgt manuell.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Verstecktes Kamera-Input (capture=environment öffnet direkt die Kamera) */}
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFotoAuswahl(e)}
        />

        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Tennismehl GmbH · Digitaler Liefernachweis · Keine Anmeldung erforderlich
        </p>
      </div>
    </div>
  );
};

export default Liefernachweis;
