/**
 * Liefernachweis.tsx — Öffentliche Seite zur Lieferbestätigung (KEIN Login!)
 *
 * Aufruf über den QR-Code auf dem Lieferschein:
 *   /liefernachweis/:projektId?token=<token>[&test=1]
 *
 * ZWEI ABLÄUFE, EINE SEITE. Welcher gilt, sagt der Server (`auftrag.modus`) —
 * nie die Seite selbst, denn die läuft auf einem fremden Handy:
 *
 * 1. FAHRER (Standard, Belieferung durch uns):
 *    Scan → Auftrag kompakt sehen → „Abgeladen ✓" → Foto der Ware → Foto des
 *    Wiegescheins → fertig, unter 30 Sekunden. Unterschrift optional.
 *
 * 2. ABHOLUNG AB WERK (der Kunde holt selbst):
 *    Scan im Werk → Auftrag prüfen → Name des Abholers und E-Mail → mit dem
 *    Finger unterschreiben → fertig. Der unterschriebene Lieferschein geht
 *    sofort per E-Mail an den Kunden; ein Ausdruck ist nicht mehr nötig.
 *    Hier ist die Unterschrift Pflicht und die Fotos sind freiwillig — genau
 *    umgekehrt zum Fahrer-Ablauf, weil der Abholer selbst quittiert, was er
 *    mitnimmt, und niemand ein Abladen fotografieren kann, das erst später
 *    beim Kunden stattfindet.
 *
 * Der Wiegeschein trägt die Menge, nach der abgerechnet wird. Deshalb wird er
 * als eigener, deutlich angekündigter Schritt abgefragt und nicht als Zusatz
 * zum Warenfoto — der Fahrer soll wissen, dass er ein zweites Blatt braucht,
 * bevor er den LKW verlässt. Ob das Foto Pflicht ist, entscheidet der Server
 * (`wiegescheinPflicht` aus dem GET); die Seite passt nur ihre Führung an.
 *
 * Es gibt KEINEN direkten Appwrite-Zugriff: alle Lese-/Schreiboperationen
 * laufen über die Netlify Function /.netlify/functions/liefernachweis.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Package,
  PenLine,
  RefreshCw,
  Scale,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

const FUNCTION_URL = '/.netlify/functions/liefernachweis';

interface AuftragsPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
}

/** Ergebnis des automatischen Lieferschein-Versands nach einer Abholung */
interface LieferscheinVersand {
  an: string;
  am: string;
  status: 'gesendet' | 'fehler';
  fehler?: string;
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
  /** Server-Vorgabe: muss der Fahrer den Wiegeschein fotografieren? */
  wiegescheinPflicht?: boolean;
  /**
   * Welcher Ablauf gilt. Kommt ausschliesslich vom Server (aus der
   * Belieferungsart des Auftrags) — fehlt er, gilt der Fahrer-Ablauf, weil
   * der die strengeren Pflichtfelder hat.
   */
  modus?: 'fahrer' | 'abholung';
  /** Vorbelegung des E-Mail-Feldes bei einer Abholung (leer beim Fahrer) */
  empfaengerVorschlag?: string;
  /** Stand eines früheren Versands, falls die Abholung schon bestätigt ist */
  lieferscheinVersand?: LieferscheinVersand;
}

/**
 * Schritte des Ablaufs.
 *
 * Fahrer:   auftrag → wiegeschein → abschluss → senden → fertig
 * Abholung: auftrag → unterschrift → senden → fertig
 *           (die Fotos sind dort freiwillig und hängen im Unterschrift-Schritt)
 */
type SeitenStatus =
  | 'laden'
  | 'fehler'
  | 'auftrag'
  | 'wiegeschein'
  | 'unterschrift'
  | 'abschluss'
  | 'senden'
  | 'fertig';

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

/**
 * Einfaches Unterschriften-Canvas (Pointer Events).
 *
 * `gross` für die Abholung: Dort ist die Unterschrift der eigentliche Zweck
 * der Seite und wird mit dem Finger auf einem Handy geleistet — ein
 * briefmarkengrosses Feld erzeugt eine Unterschrift, die niemand wiedererkennt.
 */
const UnterschriftCanvas = ({
  onChange,
  gross,
}: {
  onChange: (dataUrl: string | null) => void;
  gross?: boolean;
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
        className={`w-full ${gross ? 'h-56' : 'h-32'} bg-white dark:bg-gray-100 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg touch-none`}
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
  // Aus einem Sandbox-QR-Code: die Function soll gegen die Mock-Datenbank
  // arbeiten. Der Parameter stammt aus der URL des QR-Codes, nicht aus dem
  // localStorage — diese Seite wird ja auf einem fremden Handy geöffnet.
  const mockModus = searchParams.get('mock') === '1';

  const [status, setStatus] = useState<SeitenStatus>('laden');
  const [fehlerText, setFehlerText] = useState<string>('');
  const [auftrag, setAuftrag] = useState<AuftragsInfo | null>(null);

  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [wiegescheinDataUrl, setWiegescheinDataUrl] = useState<string | null>(null);
  const [fotoVerarbeitet, setFotoVerarbeitet] = useState(false);
  const [zeigeUnterschrift, setZeigeUnterschrift] = useState(false);
  const [unterschriftDataUrl, setUnterschriftDataUrl] = useState<string | null>(null);
  const [unterzeichnerName, setUnterzeichnerName] = useState('');
  const [fahrerName, setFahrerName] = useState('');
  // nur Abholung
  const [kennzeichen, setKennzeichen] = useState('');
  const [empfaenger, setEmpfaenger] = useState('');
  const [zeigeFotos, setZeigeFotos] = useState(false);

  const [ergebnis, setErgebnis] = useState<{
    bereitsBestaetigt?: boolean;
    testModus?: boolean;
    statusGesetzt?: boolean;
    liefernachweisAm?: string | null;
    modus?: 'fahrer' | 'abholung';
    lieferscheinVersand?: LieferscheinVersand;
  } | null>(null);

  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const wiegescheinInputRef = useRef<HTMLInputElement | null>(null);

  // Standard ist Pflicht: Antwortet ein älterer Server das Feld nicht mit,
  // wird der Wiegeschein trotzdem verlangt statt still übersprungen.
  const wiegescheinPflicht = auftrag?.wiegescheinPflicht !== false;

  // Abholung nur, wenn der Server sie ausdrücklich meldet. Ein alter Server
  // ohne dieses Feld führt zum Fahrer-Ablauf — dem mit den strengeren
  // Pflichtfeldern; im Zweifel lieber ein Foto zu viel als ein Nachweis zu wenig.
  const istAbholung = auftrag?.modus === 'abholung';
  const abholerName = unterzeichnerName.trim();
  // Die Prüfung ist bewusst grob: Sie fängt Tippfehler wie fehlendes @ ab.
  // Die verbindliche Prüfung macht der Server, der die Mail auch verschickt.
  const empfaengerGefuellt = empfaenger.trim().length > 0;
  const empfaengerPlausibel =
    !empfaengerGefuellt ||
    empfaenger
      .split(/[\s,;]+/)
      .filter(Boolean)
      .every((adresse) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(adresse));
  const abholungAbsendbar = Boolean(abholerName && unterschriftDataUrl && empfaengerPlausibel);

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
        `${FUNCTION_URL}?projektId=${encodeURIComponent(projektId)}&token=${encodeURIComponent(token)}${mockModus ? '&mock=1' : ''}`
      );
      const json = (await res.json()) as { auftrag?: AuftragsInfo; error?: string };
      if (!res.ok || !json.auftrag) {
        setFehlerText(json.error || 'Der Auftrag konnte nicht geladen werden.');
        setStatus('fehler');
        return;
      }
      setAuftrag(json.auftrag);
      // Vorschlag nur setzen, solange der Nutzer nichts eigenes eingetippt hat
      // (das Neuladen nach einem Fehler darf keine Korrektur überschreiben).
      if (json.auftrag.empfaengerVorschlag) {
        setEmpfaenger((bisher) => bisher || json.auftrag!.empfaengerVorschlag || '');
      }
      if (json.auftrag.bereitsBestaetigt) {
        setErgebnis({
          bereitsBestaetigt: true,
          liefernachweisAm: json.auftrag.liefernachweisAm,
          modus: json.auftrag.modus,
          lieferscheinVersand: json.auftrag.lieferscheinVersand,
        });
        setStatus('fertig');
      } else {
        setStatus('auftrag');
      }
    } catch {
      setFehlerText('Keine Verbindung. Bitte Empfang prüfen und erneut versuchen.');
      setStatus('fehler');
    }
  }, [projektId, token, mockModus]);

  useEffect(() => {
    void ladeAuftrag();
  }, [ladeAuftrag]);

  // Foto der abgeladenen Ware → komprimieren → weiter zum Wiegeschein
  const handleFotoAuswahl = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = ''; // gleiche Datei erneut wählbar
    if (!datei) return;
    setFotoVerarbeitet(true);
    setFehlerText('');
    try {
      const dataUrl = await komprimiereFoto(datei);
      setFotoDataUrl(dataUrl);
      // Bei der Abholung ist das Foto ein freiwilliger Zusatz im laufenden
      // Schritt — der Abholer soll dadurch nicht aus seinem Ablauf fliegen.
      if (istAbholung) return;
      // Ist der Wiegeschein schon im Kasten (Foto neu aufgenommen), bleibt der
      // Fahrer im Abschluss-Schritt statt erneut durch den Ablauf geschickt zu werden.
      setStatus(wiegescheinDataUrl ? 'abschluss' : 'wiegeschein');
    } catch {
      setFehlerText('Das Foto konnte nicht verarbeitet werden. Bitte erneut aufnehmen.');
    } finally {
      setFotoVerarbeitet(false);
    }
  };

  // Foto des Wiegescheins → komprimieren → weiter zum Abschluss
  const handleWiegescheinAuswahl = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;
    setFotoVerarbeitet(true);
    setFehlerText('');
    try {
      const dataUrl = await komprimiereFoto(datei);
      setWiegescheinDataUrl(dataUrl);
      if (istAbholung) return;
      setStatus('abschluss');
    } catch {
      setFehlerText('Das Foto konnte nicht verarbeitet werden. Bitte erneut aufnehmen.');
    } finally {
      setFotoVerarbeitet(false);
    }
  };

  // Bestätigung absenden — beide Abläufe, unterschiedliche Pflichtfelder
  const sendeBestaetigung = async () => {
    if (!projektId) return;
    // Wohin es zurückgeht, wenn etwas schiefläuft: der Schritt, in dem der
    // Nutzer gerade stand. Sonst landet ein Abholer im Fahrer-Bildschirm.
    const rueckfallSchritt: SeitenStatus = istAbholung ? 'unterschrift' : 'abschluss';
    if (istAbholung) {
      if (!abholungAbsendbar) return;
    } else {
      if (!fotoDataUrl || !fahrerName.trim()) return;
      if (wiegescheinPflicht && !wiegescheinDataUrl) return;
    }
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
          fotoBase64: fotoDataUrl || undefined,
          wiegescheinBase64: wiegescheinDataUrl || undefined,
          fahrerName: istAbholung ? undefined : fahrerName.trim(),
          unterschriftBase64: unterschriftDataUrl || undefined,
          unterzeichnerName: unterzeichnerName.trim() || undefined,
          ...(istAbholung
            ? {
                kennzeichen: kennzeichen.trim() || undefined,
                empfaenger: empfaenger.trim() || undefined,
              }
            : {}),
          geo,
          testModus: testModus || undefined,
          mock: mockModus || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        bereitsBestaetigt?: boolean;
        testModus?: boolean;
        statusGesetzt?: boolean;
        liefernachweisAm?: string | null;
        modus?: 'fahrer' | 'abholung';
        lieferscheinVersand?: LieferscheinVersand;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setFehlerText(json.error || 'Die Bestätigung ist fehlgeschlagen. Bitte erneut versuchen.');
        setStatus(rueckfallSchritt);
        return;
      }
      setErgebnis(json);
      setStatus('fertig');
    } catch {
      setFehlerText('Keine Verbindung. Bitte Empfang prüfen und erneut versuchen.');
      setStatus(rueckfallSchritt);
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
              {istAbholung ? 'Abholung bestätigen' : 'Lieferung bestätigen'}
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

            {/* ===================== ABHOLUNG AB WERK ===================== */}
            {istAbholung ? (
              <>
                <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5 space-y-4">
                  <div>
                    <label
                      htmlFor="abholerName"
                      className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text"
                    >
                      <User className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                      Name des Abholers
                    </label>
                    <input
                      id="abholerName"
                      type="text"
                      value={unterzeichnerName}
                      onChange={(e) => setUnterzeichnerName(e.target.value)}
                      placeholder="Vor- und Nachname"
                      autoComplete="name"
                      className="mt-3 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-lg text-gray-900 dark:text-dark-text placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="kennzeichen"
                      className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text"
                    >
                      <Truck className="h-5 w-5 text-gray-500 dark:text-dark-textMuted" />
                      Kennzeichen
                      <span className="text-xs font-normal text-gray-500 dark:text-dark-textMuted">
                        optional
                      </span>
                    </label>
                    <input
                      id="kennzeichen"
                      type="text"
                      value={kennzeichen}
                      onChange={(e) => setKennzeichen(e.target.value)}
                      placeholder="z. B. WÜ-AB 123"
                      autoCapitalize="characters"
                      className="mt-3 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-lg text-gray-900 dark:text-dark-text placeholder-gray-400"
                    />
                  </div>
                </div>

                {/* Wohin der unterschriebene Lieferschein geht.
                    Kein type="email": Das Feld nimmt auch mehrere Adressen auf,
                    und die Browser-Prüfung würde sie als ungültig abweisen. */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
                  <label
                    htmlFor="empfaenger"
                    className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text"
                  >
                    <Mail className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                    Lieferschein per E-Mail an
                  </label>
                  <input
                    id="empfaenger"
                    type="text"
                    inputMode="email"
                    value={empfaenger}
                    onChange={(e) => setEmpfaenger(e.target.value)}
                    placeholder="name@verein.de"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="mt-3 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-lg text-gray-900 dark:text-dark-text placeholder-gray-400"
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-dark-textMuted">
                    Der unterschriebene Lieferschein wird sofort dorthin geschickt. Mehrere
                    Adressen mit Komma trennen. Feld leer lassen, wenn keine E-Mail gewünscht ist.
                  </p>
                  {!empfaengerPlausibel && (
                    <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      Diese Adresse sieht nicht vollständig aus — bitte prüfen.
                    </p>
                  )}
                </div>

                {fehlerText && (
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
                )}

                <button
                  onClick={() => setStatus('unterschrift')}
                  disabled={!abholerName || !empfaengerPlausibel}
                  className="w-full rounded-2xl bg-green-600 py-6 text-2xl font-bold text-white shadow-lg transition-colors hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
                >
                  Weiter zur Unterschrift
                </button>
                <p className="text-center text-sm text-gray-500 dark:text-dark-textMuted">
                  {abholerName
                    ? 'Im nächsten Schritt mit dem Finger unterschreiben — das ersetzt die Quittung auf Papier.'
                    : 'Bitte zuerst den Namen des Abholers eintragen.'}
                </p>
              </>
            ) : (
              <>
                {/* ===================== BELIEFERUNG DURCH FAHRER ===================== */}
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
                    ? wiegescheinPflicht
                      ? 'Danach 2 Fotos: die abgeladene Ware und der Wiegeschein.'
                      : 'Danach nur noch 1 Foto der abgeladenen Ware aufnehmen — fertig.'
                    : 'Bitte zuerst Ihren Namen eintragen, dann Fotos aufnehmen.'}
                </p>
                {wiegescheinPflicht && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
                    <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                      <Scale className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <span>
                        <span className="font-semibold">Wiegeschein bereithalten.</span> Er wird im
                        nächsten Schritt fotografiert — bitte noch nicht weglegen.
                      </span>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ============ ABHOLUNG: Unterschrift des Abholers (Pflicht) ============ */}
        {(status === 'unterschrift' || (status === 'senden' && istAbholung)) && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-lg">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <PenLine className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                Empfang mit Unterschrift bestätigen
              </p>
              <p className="mt-2 text-sm text-gray-600 dark:text-dark-textMuted">
                <span className="font-semibold">{abholerName}</span> bestätigt, die Ware
                vollständig und in einwandfreiem Zustand im Werk übernommen zu haben.
              </p>

              {auftrag && auftrag.positionen.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
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
              )}

              <div className="mt-4">
                <UnterschriftCanvas gross onChange={setUnterschriftDataUrl} />
              </div>
            </div>

            {/* Fotos sind bei der Abholung freiwillig — eingeklappt, damit sie
                den Ablauf nicht verlängern, aber greifbar, wenn jemand die
                Ladung oder den Wiegeschein dokumentieren will. */}
            <div className="rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-lg">
              <button
                type="button"
                onClick={() => setZeigeFotos((v) => !v)}
                disabled={status === 'senden'}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                  <Camera className="h-5 w-5 text-gray-500 dark:text-dark-textMuted" />
                  Fotos hinzufügen
                </span>
                <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                  {fotoDataUrl || wiegescheinDataUrl
                    ? `${[fotoDataUrl, wiegescheinDataUrl].filter(Boolean).length} aufgenommen`
                    : 'optional'}
                </span>
              </button>
              {zeigeFotos && (
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => fotoInputRef.current?.click()}
                    disabled={fotoVerarbeitet || status === 'senden'}
                    className="w-full rounded-xl border border-gray-300 py-3 font-medium text-gray-800 dark:border-gray-600 dark:text-dark-text disabled:opacity-60"
                  >
                    {fotoDataUrl ? 'Foto der Ladung neu aufnehmen' : 'Foto der Ladung aufnehmen'}
                  </button>
                  {fotoDataUrl && (
                    <img
                      src={fotoDataUrl}
                      alt="Foto der Ladung"
                      className="max-h-48 w-full rounded-xl bg-gray-50 object-contain dark:bg-gray-800"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => wiegescheinInputRef.current?.click()}
                    disabled={fotoVerarbeitet || status === 'senden'}
                    className="w-full rounded-xl border border-gray-300 py-3 font-medium text-gray-800 dark:border-gray-600 dark:text-dark-text disabled:opacity-60"
                  >
                    {wiegescheinDataUrl ? 'Wiegeschein neu aufnehmen' : 'Wiegeschein fotografieren'}
                  </button>
                  {wiegescheinDataUrl && (
                    <img
                      src={wiegescheinDataUrl}
                      alt="Foto des Wiegescheins"
                      className="max-h-48 w-full rounded-xl bg-gray-50 object-contain dark:bg-gray-800"
                    />
                  )}
                </div>
              )}
            </div>

            {fehlerText && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
            )}

            <button
              onClick={() => void sendeBestaetigung()}
              disabled={status === 'senden' || !abholungAbsendbar}
              className="w-full rounded-2xl bg-green-600 py-5 text-xl font-bold text-white shadow-lg transition-colors hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
            >
              {status === 'senden' ? (
                <span className="inline-flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Wird übermittelt …
                </span>
              ) : (
                'Abholung bestätigen ✓'
              )}
            </button>
            {!unterschriftDataUrl && (
              <p className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
                Zum Bestätigen fehlt noch die Unterschrift.
              </p>
            )}
            <button
              type="button"
              onClick={() => setStatus('auftrag')}
              disabled={status === 'senden'}
              className="w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-600 underline dark:text-dark-textMuted"
            >
              Zurück zu Name und E-Mail
            </button>
          </div>
        )}

        {/* Wiegeschein-Schritt: eigener Bildschirm, damit er nicht übersehen wird */}
        {status === 'wiegeschein' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-lg">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Scale className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                Jetzt den Wiegeschein fotografieren
              </p>
              <p className="mt-2 text-sm text-gray-600 dark:text-dark-textMuted">
                Bitte den ganzen Schein aufs Bild bringen und darauf achten, dass die
                <span className="font-semibold"> Nettomenge </span>
                gut lesbar ist. Lieber im Hellen und ohne Schatten.
              </p>

              {fotoDataUrl && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-green-50 dark:bg-green-950/40 px-3 py-2">
                  <img
                    src={fotoDataUrl}
                    alt="Foto der abgeladenen Ware"
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300">
                    Foto der Ware ist gespeichert ✓
                  </span>
                </div>
              )}
            </div>

            {fehlerText && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
            )}

            <button
              onClick={() => wiegescheinInputRef.current?.click()}
              disabled={fotoVerarbeitet}
              className="w-full rounded-2xl bg-green-600 py-6 text-2xl font-bold text-white shadow-lg transition-colors hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
            >
              {fotoVerarbeitet ? (
                <span className="inline-flex items-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  Foto wird verarbeitet …
                </span>
              ) : (
                'Wiegeschein fotografieren'
              )}
            </button>

            {/* Nur sichtbar, wenn der Server den Wiegeschein nicht erzwingt. */}
            {!wiegescheinPflicht && (
              <button
                onClick={() => setStatus('abschluss')}
                disabled={fotoVerarbeitet}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-600 underline dark:text-dark-textMuted"
              >
                Es gibt keinen Wiegeschein — ohne fortfahren
              </button>
            )}
          </div>
        )}

        {/* Abschluss (nur Fahrer): beide Fotos prüfen, optional unterschreiben, absenden.
            Der Abholer hat seinen eigenen Abschluss im Unterschrift-Schritt — ohne
            die Bedingung stünden bei ihm während des Sendens beide Ansichten übereinander. */}
        {!istAbholung && (status === 'abschluss' || status === 'senden') && fotoDataUrl && (
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

            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Scale className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                Wiegeschein
              </p>
              {wiegescheinDataUrl ? (
                <>
                  <img
                    src={wiegescheinDataUrl}
                    alt="Foto des Wiegescheins"
                    className="mt-3 w-full max-h-72 object-contain rounded-xl bg-gray-50 dark:bg-gray-800"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-dark-textMuted">
                    Ist die Nettomenge auf dem Bild gut lesbar? Wenn nicht, bitte neu aufnehmen.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-600 dark:text-dark-textMuted">
                  Kein Wiegeschein aufgenommen.
                </p>
              )}
              <button
                type="button"
                onClick={() => wiegescheinInputRef.current?.click()}
                disabled={status === 'senden'}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-dark-accent"
              >
                <RefreshCw className="h-4 w-4" />
                {wiegescheinDataUrl ? 'Wiegeschein neu aufnehmen' : 'Wiegeschein fotografieren'}
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
              disabled={status === 'senden' || (wiegescheinPflicht && !wiegescheinDataUrl)}
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
            {wiegescheinPflicht && !wiegescheinDataUrl && (
              <p className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
                Zum Bestätigen fehlt noch das Foto des Wiegescheins.
              </p>
            )}
          </div>
        )}

        {/* Fertig / bereits bestätigt */}
        {status === 'fertig' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            {ergebnis?.bereitsBestaetigt ? (
              <>
                <p className="mt-4 text-xl font-bold text-gray-900 dark:text-dark-text">
                  {istAbholung
                    ? 'Diese Abholung wurde bereits bestätigt.'
                    : 'Diese Lieferung wurde bereits bestätigt.'}
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
                    : istAbholung
                      ? 'Vielen Dank! Abholung bestätigt.'
                      : 'Vielen Dank! Lieferung bestätigt.'}
                </p>
                <p className="mt-2 text-gray-600 dark:text-dark-textMuted">
                  {ergebnis?.testModus
                    ? 'Es wurde nichts gespeichert, kein Status geändert und keine E-Mail verschickt.'
                    : istAbholung
                      ? 'Der unterschriebene Lieferschein ist archiviert. Sie können die Seite jetzt schließen.'
                      : 'Der Liefernachweis wurde übermittelt. Sie können die Seite jetzt schließen.'}
                </p>
                {ergebnis && ergebnis.statusGesetzt === false && (
                  <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                    Hinweis: Der Nachweis wurde gespeichert, die Statusaktualisierung erfolgt manuell.
                  </p>
                )}
              </>
            )}

            {/* Wohin der Lieferschein ging — oder warum nicht. Ein stiller
                Fehlschlag wäre genau das, was später zum Anruf führt. */}
            {ergebnis?.lieferscheinVersand?.status === 'gesendet' && (
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-left dark:bg-green-950/40">
                <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-900 dark:text-green-200">
                  Der unterschriebene Lieferschein wurde an{' '}
                  <span className="font-semibold break-all">{ergebnis.lieferscheinVersand.an}</span>{' '}
                  geschickt.
                </p>
              </div>
            )}
            {ergebnis?.lieferscheinVersand?.status === 'fehler' && (
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-left dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  Die Abholung ist bestätigt und archiviert. Der E-Mail-Versand an{' '}
                  <span className="font-semibold break-all">{ergebnis.lieferscheinVersand.an}</span>{' '}
                  hat nicht geklappt — das Büro sieht das und schickt den Lieferschein nach.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Versteckte Kamera-Inputs (capture=environment öffnet direkt die Kamera).
            Zwei getrennte Felder, damit ein neu aufgenommenes Warenfoto nie
            versehentlich den Wiegeschein überschreibt. */}
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFotoAuswahl(e)}
        />
        <input
          ref={wiegescheinInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleWiegescheinAuswahl(e)}
        />

        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Tennismehl GmbH ·{' '}
          {istAbholung ? 'Digitale Empfangsbestätigung' : 'Digitaler Liefernachweis'} · Keine
          Anmeldung erforderlich
        </p>

        {/* Pflichtangaben nach § 5 DDG — auf jeder Seite erreichbar, die ein
            Kunde oder Fahrer ohne Login zu sehen bekommt. */}
        <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
          <Link to="/impressum" className="hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2">
            Impressum
          </Link>
          <span className="mx-2">·</span>
          <Link to="/datenschutz" className="hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2">
            Datenschutz
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Liefernachweis;
