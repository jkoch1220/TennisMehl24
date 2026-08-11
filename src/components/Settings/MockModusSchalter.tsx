import { useState } from 'react';
import { FlaskConical, ShieldCheck, AlertTriangle, Database, Mail, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  istMockModusAktiv,
  getMockModusZustand,
  aktiviereMockModus,
  deaktiviereMockModus,
  MOCK_LAUFZEIT_STUNDEN,
  MOCK_DATABASE_ID,
  PRODUKTIONS_DATABASE_ID,
} from '../../config/mockModus';
import { TEST_EMAIL_ADDRESS } from '../../types/email';

/**
 * Admin-Schalter für die Sandbox (Settings → Sandbox).
 *
 * Die Sichtbarkeitsprüfung hier ist Komfort. Die eigentliche Absicherung sitzt
 * in `aktiviereMockModus()` / `deaktiviereMockModus()`, die selbst auf
 * Admin-Rechte prüfen und sonst werfen — ein ausgegrauter Button hält niemanden
 * auf, der die Konsole öffnet.
 */
export default function MockModusSchalter() {
  const { isAdmin } = useAuth();
  const [aktiv] = useState(istMockModusAktiv);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!isAdmin) return null;

  const zustand = getMockModusZustand();

  const einschalten = (): void => {
    const bestaetigt = window.confirm(
      'MOCK-DATENBANK-MODUS EINSCHALTEN\n\n' +
        'Danach arbeitest du auf einer Kopie der Produktionsdaten:\n\n' +
        `  • Alle Lese- und Schreibzugriffe gehen an "${MOCK_DATABASE_ID}".\n` +
        `  • "${PRODUKTIONS_DATABASE_ID}" wird nicht mehr berührt.\n` +
        `  • Alle E-Mails gehen ausschließlich an ${TEST_EMAIL_ADDRESS},\n` +
        '    unabhängig davon, welcher Empfänger im Formular steht.\n' +
        '  • Hochgeladene Dateien landen in eigenen Sandbox-Buckets.\n' +
        `  • Der Modus endet automatisch nach ${MOCK_LAUFZEIT_STUNDEN} Stunden und beim Logout.\n\n` +
        'Du kannst dort alles verändern und löschen — die echten Daten bleiben unberührt.\n\n' +
        'Die Seite wird jetzt neu geladen.'
    );
    if (!bestaetigt) return;
    try {
      aktiviereMockModus();
    } catch (error) {
      setFehler((error as Error).message);
    }
  };

  const ausschalten = (): void => {
    const bestaetigt = window.confirm(
      'ZURÜCK AUF ECHTDATEN\n\n' +
        'Die Sandbox-Daten bleiben erhalten und sind beim nächsten Einschalten\n' +
        'unverändert wieder da.\n\n' +
        'Zum Zurücksetzen auf den aktuellen Produktionsstand im Terminal:\n' +
        '  npm run mock:reset\n\n' +
        'Die Seite wird jetzt neu geladen.'
    );
    if (!bestaetigt) return;
    try {
      deaktiviereMockModus();
    } catch (error) {
      setFehler((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FlaskConical className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mock-Datenbank (Sandbox)
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Zum gefahrlosen Ausprobieren: eine vollständige Kopie der Produktionsdaten, auf der du
            alles verändern kannst, ohne dass echte Daten oder echte Empfänger betroffen sind.
          </p>
        </div>
      </div>

      <div
        className={`rounded-lg border p-4 ${
          aktiv
            ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
        }`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {aktiv ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-amber-800 dark:text-amber-200">
                  Sandbox aktiv
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  Echtdaten — Produktionsbetrieb
                </span>
              </>
            )}
          </div>

          {aktiv ? (
            <button
              type="button"
              onClick={ausschalten}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
            >
              Zurück zu Echtdaten
            </button>
          ) : (
            <button
              type="button"
              onClick={einschalten}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 text-sm font-semibold transition-colors"
            >
              Sandbox einschalten
            </button>
          )}
        </div>

        {aktiv && zustand.ablaufAm && (
          <p className="text-sm text-amber-800 dark:text-amber-200 mt-3">
            Eingeschaltet von {zustand.aktiviertVon || 'unbekannt'} · endet automatisch am{' '}
            {new Date(zustand.ablaufAm).toLocaleString('de-DE')}
          </p>
        )}
      </div>

      {fehler && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg p-3">
          {fehler}
        </p>
      )}

      <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
        <li className="flex items-start gap-2">
          <Database className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Datenbank wechselt auf <code className="text-xs">{MOCK_DATABASE_ID}</code>; Uploads gehen
            in eigene Sandbox-Buckets.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Mail className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Jede E-Mail wird auf <code className="text-xs">{TEST_EMAIL_ADDRESS}</code> umgeleitet —
            der ursprüngliche Empfänger steht im Betreff.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Endet automatisch nach {MOCK_LAUFZEIT_STUNDEN} Stunden und beim Logout. Der Schalter gilt
            nur für diesen Browser — Kollegen bleiben auf Echtdaten.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Einzelne Funktionen sind in der Sandbox gesperrt, weil sie an ihr vorbei nach außen
            wirken würden (z.&nbsp;B. Newsletter-Abmeldung, Postfach-Sync, Passwort-Reset-Mails).
            Sie melden sich dann mit einem Hinweis.
          </span>
        </li>
      </ul>
    </div>
  );
}
