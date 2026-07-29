/**
 * Datenpruefung.tsx — Öffentliche Seite für den Kunden (KEIN Login!)
 *
 * Aufruf über den Link in der AB-E-Mail:
 *   /daten-pruefung/:projektId?token=<token>[&test=1]
 *
 * Der Kunde prüft die im System hinterlegten Daten (Dispo-Kontakt, Menge &
 * Lieferanschrift inkl. Befahrbarkeit, Rechnungsadresse & Rechnungs-E-Mail)
 * und meldet nur Abweichungen zurück — alle Felder sind vorausgefüllt.
 *
 * Es gibt KEINEN direkten Appwrite-Zugriff: alle Lese-/Schreiboperationen
 * laufen über die Netlify Function /.netlify/functions/datenpruefung.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

const FUNCTION_URL = '/.netlify/functions/datenpruefung';

interface AuftragsPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
}

interface AuftragsInfo {
  kundenname: string;
  kundennummer: string;
  auftragsbestaetigungsnummer: string;
  dispoKontakt: { name: string; telefon: string; email: string };
  positionen: AuftragsPosition[];
  lieferanschrift: string;
  rechnungsadresse: string;
  rechnungsEmail: string;
  bereitsEingereicht: boolean;
  eingereichtAm: string | null;
}

type SeitenStatus = 'laden' | 'fehler' | 'formular' | 'senden' | 'fertig';

const Datenpruefung = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const testModus = searchParams.get('test') === '1';

  const [status, setStatus] = useState<SeitenStatus>('laden');
  const [fehlerText, setFehlerText] = useState('');
  const [auftrag, setAuftrag] = useState<AuftragsInfo | null>(null);

  // Formular-State (vorausgefüllt aus dem System)
  const [dispoName, setDispoName] = useState('');
  const [dispoTelefon, setDispoTelefon] = useState('');
  const [dispoEmail, setDispoEmail] = useState('');
  const [befahrbarkeitBestaetigt, setBefahrbarkeitBestaetigt] = useState(false);
  const [befahrbarkeitHinweis, setBefahrbarkeitHinweis] = useState('');
  const [mengeLieferanschriftHinweis, setMengeLieferanschriftHinweis] = useState('');
  const [rechnungsadresseHinweis, setRechnungsadresseHinweis] = useState('');
  const [rechnungsEmail, setRechnungsEmail] = useState('');

  const [ergebnis, setErgebnis] = useState<{ testModus?: boolean } | null>(null);

  // Dark Mode: Auf dieser öffentlichen Seite folgt das Theme der System-
  // Einstellung des Kunden (das Portal-Theme ist class-basiert und für
  // externe Besucher immer "light"). Beim Verlassen wird der vorherige
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

  const ladeAuftrag = useCallback(async () => {
    if (!projektId || !token) {
      setFehlerText('Der Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen.');
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
        setFehlerText(json.error || 'Die Auftragsdaten konnten nicht geladen werden.');
        setStatus('fehler');
        return;
      }
      setAuftrag(json.auftrag);
      setDispoName(json.auftrag.dispoKontakt.name);
      setDispoTelefon(json.auftrag.dispoKontakt.telefon);
      setDispoEmail(json.auftrag.dispoKontakt.email);
      setRechnungsEmail(json.auftrag.rechnungsEmail);
      setStatus('formular');
    } catch {
      setFehlerText('Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.');
      setStatus('fehler');
    }
  }, [projektId, token]);

  useEffect(() => {
    void ladeAuftrag();
  }, [ladeAuftrag]);

  // War beim Laden schon ein Dispo-Kontakt hinterlegt? Bezieht sich bewusst auf die
  // Server-Antwort, nicht auf den aktuellen Eingabestand — sonst würde der Hinweis
  // umspringen, während der Kunde tippt.
  const dispoKontaktVorbefuellt = Boolean(
    auftrag?.dispoKontakt.telefon?.trim() || auftrag?.dispoKontakt.email?.trim()
  );

  const sendeRueckmeldung = async () => {
    if (!projektId || !auftrag) return;

    // Pflicht: Kontaktdaten für die Dispositionsplanung
    if (!dispoTelefon.trim() || !dispoEmail.trim()) {
      setFehlerText(
        'Bitte geben Sie Telefonnummer und E-Mail-Adresse des Ansprechpartners für die Dispositionsplanung an.'
      );
      return;
    }
    // Pflicht: Befahrbarkeit bestätigen ODER Einschränkung beschreiben
    if (!befahrbarkeitBestaetigt && !befahrbarkeitHinweis.trim()) {
      setFehlerText(
        'Bitte bestätigen Sie die Befahrbarkeit der Zufahrt für LKW — oder beschreiben Sie die Einschränkung im Hinweisfeld.'
      );
      return;
    }

    // Nur tatsächlich geänderte Werte übermitteln (alles andere ist bestätigt)
    const dispoGeaendert =
      dispoName.trim() !== auftrag.dispoKontakt.name ||
      dispoTelefon.trim() !== auftrag.dispoKontakt.telefon ||
      dispoEmail.trim() !== auftrag.dispoKontakt.email;
    const rechnungsEmailGeaendert = rechnungsEmail.trim() !== auftrag.rechnungsEmail;
    const allesKorrekt =
      !dispoGeaendert &&
      !rechnungsEmailGeaendert &&
      befahrbarkeitBestaetigt &&
      !befahrbarkeitHinweis.trim() &&
      !mengeLieferanschriftHinweis.trim() &&
      !rechnungsadresseHinweis.trim();

    setStatus('senden');
    setFehlerText('');
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projektId,
          token,
          allesKorrekt,
          dispoKontakt: dispoGeaendert
            ? {
                name: dispoName.trim() || undefined,
                telefon: dispoTelefon.trim() || undefined,
                email: dispoEmail.trim() || undefined,
              }
            : undefined,
          befahrbarkeitBestaetigt,
          befahrbarkeitHinweis: befahrbarkeitHinweis.trim() || undefined,
          mengeLieferanschriftHinweis: mengeLieferanschriftHinweis.trim() || undefined,
          rechnungsadresseHinweis: rechnungsadresseHinweis.trim() || undefined,
          rechnungsEmail: rechnungsEmailGeaendert ? rechnungsEmail.trim() || undefined : undefined,
          testModus: testModus || undefined,
        }),
      });
      const json = (await res.json()) as { success?: boolean; testModus?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setFehlerText(json.error || 'Die Übermittlung ist fehlgeschlagen. Bitte erneut versuchen.');
        setStatus('formular');
        return;
      }
      setErgebnis(json);
      setStatus('fertig');
    } catch {
      setFehlerText('Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.');
      setStatus('formular');
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

  const eingabeKlasse =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-dark-text placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Kopf */}
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-600 dark:bg-dark-accent rounded-xl p-2.5">
            <ClipboardCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Auftragsdaten prüfen
            </h1>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">
              Tennismehl GmbH
              {auftrag?.auftragsbestaetigungsnummer &&
                ` · Auftragsbestätigung ${auftrag.auftragsbestaetigungsnummer}`}
            </p>
          </div>
        </div>

        {testModus && (
          <div className="mb-4 rounded-lg border border-amber-400 bg-amber-100 dark:bg-amber-900/30 dark:border-amber-600 px-4 py-2.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            [TEST] Testmodus — es wird nichts gespeichert.
          </div>
        )}

        {/* Laden */}
        {status === 'laden' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-red-600 dark:text-dark-accent mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Daten werden geladen …</p>
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

        {/* Formular */}
        {(status === 'formular' || status === 'senden') && auftrag && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-dark-textMuted">
              Bitte prüfen Sie die folgenden Daten aus unserem System und passen Sie sie nur bei
              Abweichungen an — sind alle Angaben korrekt, genügt ein Klick auf „Daten bestätigen".
            </p>

            {auftrag.bereitsEingereicht && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-300">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Sie haben bereits am {formatiereDatum(auftrag.eingereichtAm)} eine Rückmeldung
                  gesendet. Eine erneute Übermittlung ersetzt die bisherige Rückmeldung.
                </span>
              </div>
            )}

            {/* 1. Ansprechpartner Dispositionsplanung */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Phone className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                1. Ansprechpartner für die Dispositionsplanung
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                Über diese Kontaktdaten stimmen wir den Anliefertermin ab — Telefon und E-Mail sind
                erforderlich.
              </p>
              {/* Transparenz: der Kunde soll erkennen, was schon hinterlegt war und was fehlt —
                  sonst weiß er nicht, ob die Felder von ihm oder von uns stammen. */}
              {dispoKontaktVorbefuellt ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-600 dark:text-dark-textMuted">
                  <Info className="h-3.5 w-3.5" />
                  Aus unseren Unterlagen vorausgefüllt — bitte nur bei Abweichung ändern
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
                  <Info className="h-3.5 w-3.5" />
                  Diese Angaben fehlen uns noch
                </p>
              )}
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={dispoName}
                    onChange={(e) => setDispoName(e.target.value)}
                    placeholder="Name des Ansprechpartners"
                    disabled={status === 'senden'}
                    className={`${eingabeKlasse} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={dispoTelefon}
                    onChange={(e) => setDispoTelefon(e.target.value)}
                    placeholder="Telefonnummer *"
                    disabled={status === 'senden'}
                    className={`${eingabeKlasse} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={dispoEmail}
                    onChange={(e) => setDispoEmail(e.target.value)}
                    placeholder="E-Mail-Adresse *"
                    disabled={status === 'senden'}
                    className={`${eingabeKlasse} pl-10`}
                  />
                </div>
              </div>
            </div>

            {/* 2. Menge & Lieferanschrift + Befahrbarkeit */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Package className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                2. Menge &amp; Lieferanschrift
              </p>
              {auftrag.positionen.length > 0 && (
                <ul className="mt-3 space-y-1.5">
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
              <p className="mt-3 flex items-start gap-2 text-sm text-gray-800 dark:text-dark-text">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500 dark:text-dark-textMuted" />
                <span className="break-words">{auftrag.lieferanschrift || '— keine Lieferanschrift hinterlegt —'}</span>
              </p>

              <label className="mt-4 flex items-start gap-3 cursor-pointer select-none rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3">
                <input
                  type="checkbox"
                  checked={befahrbarkeitBestaetigt}
                  onChange={(e) => setBefahrbarkeitBestaetigt(e.target.checked)}
                  disabled={status === 'senden'}
                  className="mt-0.5 w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-800 dark:text-dark-text">
                  <span className="font-semibold inline-flex items-center gap-1.5">
                    <Truck className="h-4 w-4" />
                    Befahrbarkeit geprüft
                  </span>
                  <br />
                  Die Zufahrt zur Lieferanschrift ist für LKW geeignet und befahrbar.
                </span>
              </label>
              <textarea
                value={befahrbarkeitHinweis}
                onChange={(e) => setBefahrbarkeitHinweis(e.target.value)}
                placeholder="Hinweise zur Zufahrt (z.B. Engstelle, Gewichtsbeschränkung, nur Motorwagen) …"
                disabled={status === 'senden'}
                rows={2}
                className={`${eingabeKlasse} mt-3`}
              />
              <textarea
                value={mengeLieferanschriftHinweis}
                onChange={(e) => setMengeLieferanschriftHinweis(e.target.value)}
                placeholder="Änderungswunsch zu Menge oder Lieferanschrift (nur bei Abweichung ausfüllen) …"
                disabled={status === 'senden'}
                rows={2}
                className={`${eingabeKlasse} mt-3`}
              />
            </div>

            {/* 3. Rechnungsadresse & Rechnungs-E-Mail */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
              <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-dark-text">
                <Receipt className="h-5 w-5 text-red-600 dark:text-dark-accent" />
                3. Rechnungsadresse &amp; Rechnungsversand
              </p>
              <p className="mt-3 text-sm text-gray-800 dark:text-dark-text break-words">
                {auftrag.rechnungsadresse || '— keine Rechnungsadresse hinterlegt —'}
              </p>
              <div className="relative mt-3">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={rechnungsEmail}
                  onChange={(e) => setRechnungsEmail(e.target.value)}
                  placeholder="E-Mail-Adresse für den Rechnungsversand"
                  disabled={status === 'senden'}
                  className={`${eingabeKlasse} pl-10`}
                />
              </div>
              <textarea
                value={rechnungsadresseHinweis}
                onChange={(e) => setRechnungsadresseHinweis(e.target.value)}
                placeholder="Änderungswunsch zur Rechnungsadresse (nur bei Abweichung ausfüllen) …"
                disabled={status === 'senden'}
                rows={2}
                className={`${eingabeKlasse} mt-3`}
              />
            </div>

            {fehlerText && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehlerText}</p>
            )}

            <button
              onClick={() => void sendeRueckmeldung()}
              disabled={status === 'senden'}
              className="w-full rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 text-white text-xl font-bold py-5 shadow-lg transition-colors"
            >
              {status === 'senden' ? (
                <span className="inline-flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Wird übermittelt …
                </span>
              ) : (
                'Daten bestätigen ✓'
              )}
            </button>
          </div>
        )}

        {/* Fertig */}
        {status === 'fertig' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <p className="mt-4 text-xl font-bold text-gray-900 dark:text-dark-text">
              {ergebnis?.testModus
                ? '[TEST] Ablauf erfolgreich durchlaufen!'
                : 'Vielen Dank! Ihre Rückmeldung wurde übermittelt.'}
            </p>
            <p className="mt-2 text-gray-600 dark:text-dark-textMuted">
              {ergebnis?.testModus
                ? 'Es wurde nichts gespeichert.'
                : 'Wir haben Ihre Angaben erhalten und melden uns bei Rückfragen. Sie können die Seite jetzt schließen.'}
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Tennismehl GmbH · Datenprüfung zur Auftragsbestätigung · Keine Anmeldung erforderlich
        </p>
      </div>
    </div>
  );
};

export default Datenpruefung;
