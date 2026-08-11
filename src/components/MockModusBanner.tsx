import { useState, useEffect } from 'react';
import { FlaskConical, ArrowLeftRight } from 'lucide-react';
import {
  istMockModusAktiv,
  getMockModusZustand,
  getRestlaufzeitMs,
  deaktiviereMockModus,
  darfMockModusSchalten,
  onMockModusChange,
} from '../config/mockModus';
import { TEST_EMAIL_ADDRESS } from '../types/email';

/**
 * Dauerhafte Warnung, solange die Sandbox läuft.
 *
 * Anforderung war: der Modus muss JEDERZEIT sichtbar sein — ohne Scrollen, auf
 * jeder Seite, auch in Vollbild-Dialogen. Das leistet keine einzelne Anzeige,
 * deshalb vier voneinander unabhängige Signale:
 *
 *   1. Balken oben (fixed, über allem)
 *   2. Amber-Rahmen um das komplette Viewport — bleibt auch dann sichtbar, wenn
 *      ein Modal den Balken überdeckt
 *   3. Präfix im Browser-Tab-Titel — sichtbar, wenn das Portal im Hintergrund
 *      liegt und man in einem anderen Tab arbeitet
 *   4. Favicon-Wechsel auf ein Warndreieck
 *
 * Die Farbe (Amber) ist bewusst eine andere als beim OfflineBanner (Rot):
 * "keine Verbindung" und "du arbeitest auf Kopien" sind verschiedene Zustände
 * und dürfen nicht verwechselt werden.
 */

const ORIGINAL_TITEL = document.title;
const ORIGINAL_FAVICON = '/tennisball.svg';

/** Warndreieck als Data-URI — spart eine zusätzliche Datei in public/. */
const MOCK_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="6" fill="#f59e0b"/>' +
      '<path d="M16 7l9 17H7z" fill="#78350f"/>' +
      '<rect x="14.6" y="12" width="2.8" height="7" rx="1.4" fill="#fef3c7"/>' +
      '<circle cx="16" cy="21" r="1.5" fill="#fef3c7"/>' +
      '</svg>'
  );

function setzeFavicon(href: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = href;
}

/** "11 h 42 min" — bei unter einer Stunde minutengenau. */
function formatiereRestlaufzeit(ms: number): string {
  const minutenGesamt = Math.max(0, Math.floor(ms / 60000));
  const stunden = Math.floor(minutenGesamt / 60);
  const minuten = minutenGesamt % 60;
  if (stunden === 0) return `${minuten} min`;
  return `${stunden} h ${minuten} min`;
}

export default function MockModusBanner() {
  const [aktiv, setAktiv] = useState(istMockModusAktiv);
  const [restlaufzeit, setRestlaufzeit] = useState(getRestlaufzeitMs);

  useEffect(() => onMockModusChange(setAktiv), []);

  // Minütlich nachrechnen. istMockModusAktiv() prüft dabei den Ablauf mit und
  // schaltet die Sandbox nach 12 Stunden von selbst ab.
  useEffect(() => {
    if (!aktiv) return;
    const timer = window.setInterval(() => {
      setRestlaufzeit(getRestlaufzeitMs());
      setAktiv(istMockModusAktiv());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [aktiv]);

  // Tab-Titel, Favicon und der Platz für den Balken.
  useEffect(() => {
    if (aktiv) {
      document.title = `🧪 [MOCK] ${ORIGINAL_TITEL}`;
      setzeFavicon(MOCK_FAVICON);
      // Der Balken liegt fixed über der Seite — ohne diesen Abstand würde er
      // die oberste Zeile des Portals verdecken.
      document.body.style.paddingTop = '2.25rem';
    } else {
      document.title = ORIGINAL_TITEL;
      setzeFavicon(ORIGINAL_FAVICON);
      document.body.style.paddingTop = '';
    }
    return () => {
      document.body.style.paddingTop = '';
    };
  }, [aktiv]);

  if (!aktiv) return null;

  const zustand = getMockModusZustand();
  const knapp = restlaufzeit < 30 * 60 * 1000;

  const zurueckZuEchtdaten = (): void => {
    const bestaetigt = window.confirm(
      'Zurück auf Echtdaten schalten?\n\n' +
        'Die Sandbox-Daten bleiben erhalten und sind beim nächsten Einschalten wieder da.\n' +
        'Zum Zurücksetzen auf den Produktionsstand: npm run mock:reset\n\n' +
        'Die Seite wird anschließend neu geladen.'
    );
    if (!bestaetigt) return;
    try {
      deaktiviereMockModus();
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  return (
    <>
      {/* Rahmen ums Viewport — bleibt sichtbar, wenn ein Modal den Balken überdeckt. */}
      <div
        className="fixed inset-0 z-[10001] border-[3px] border-amber-500 dark:border-amber-400"
        style={{ pointerEvents: 'none' }}
        aria-hidden="true"
      />

      <div
        role="status"
        className="fixed top-0 left-0 right-0 z-[10002] bg-amber-500 dark:bg-amber-600 text-amber-950 dark:text-amber-50 py-1.5 px-4 text-sm font-semibold shadow-lg flex items-center justify-center gap-x-3 gap-y-1 flex-wrap"
      >
        <span className="flex items-center gap-1.5">
          <FlaskConical className="w-4 h-4 shrink-0" />
          MOCK-DATENBANK AKTIV
        </span>

        <span className="font-normal hidden sm:inline">
          Daten sind eine Kopie · E-Mails gehen nur an {TEST_EMAIL_ADDRESS}
        </span>

        <span
          className={`font-normal tabular-nums ${knapp ? 'font-bold underline' : ''}`}
          title={`Automatisches Ende: ${new Date(zustand.ablaufAm).toLocaleString('de-DE')}`}
        >
          noch {formatiereRestlaufzeit(restlaufzeit)}
        </span>

        {darfMockModusSchalten() && (
          <button
            type="button"
            onClick={zurueckZuEchtdaten}
            className="flex items-center gap-1.5 bg-amber-950/85 hover:bg-amber-950 text-amber-50 px-2.5 py-1 rounded font-semibold transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Zurück zu Echtdaten
          </button>
        )}
      </div>
    </>
  );
}
