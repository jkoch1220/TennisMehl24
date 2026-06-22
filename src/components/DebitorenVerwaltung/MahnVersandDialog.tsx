import { useEffect, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, XCircle, AlertTriangle, Mail } from 'lucide-react';
import { DebitorView } from '../../types/debitor';
import { MahnwesenDokumentTyp, MahnwesenTextVorlagen } from '../../types/mahnwesen';
import { TEST_EMAIL_ADDRESS } from '../../types/email';
import {
  ladeMahnEmailKandidaten,
  hinterlegeRechnungsEmail,
  sendeMahnungPerEmail,
  ladeTextVorlagen,
  mahnTypLabel,
  MahnEmailKandidat,
  SendeMahnungErgebnis,
} from '../../services/mahnwesenService';

export interface MahnVersandEntry {
  debitor: DebitorView;
  typ: MahnwesenDokumentTyp;
}

interface MahnVersandDialogProps {
  entries: MahnVersandEntry[];
  testModus: boolean;
  onClose: () => void;
  /** wird aufgerufen, wenn mind. ein ECHTER Versand erfolgreich war (→ Liste neu laden) */
  onFinished: (hatEchtenErfolg: boolean) => void;
}

const MANUELL = '__manuell__';

interface RowState {
  debitor: DebitorView;
  typ: MahnwesenDokumentTyp;
  hatRechnungsEmail: boolean;
  kandidaten: MahnEmailKandidat[];
  loadingKandidaten: boolean;
  auswahl: string; // gewählte E-Mail ODER MANUELL
  manuellEmail: string;
  hinterlegen: boolean;
  status: 'idle' | 'sending' | 'success' | 'error';
  ergebnis?: SendeMahnungErgebnis;
}

const istValideEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Felder enthalten oft mehrere Adressen ("a@x.de; b@y.de") → einzeln aufsplitten.
const splitEmails = (raw?: string): string[] =>
  (raw || '')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);

// Begrenzte Parallelität
async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>, limit = 5) {
  let index = 0;
  const next = async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

const MahnVersandDialog = ({ entries, testModus, onClose, onFinished }: MahnVersandDialogProps) => {
  const [rows, setRows] = useState<RowState[]>(() =>
    entries.map((e) => {
      const initial: MahnEmailKandidat[] = [];
      for (const em of splitEmails(e.debitor.rechnungsEmail)) initial.push({ email: em, quelle: 'Rechnungs-E-Mail (Projekt)' });
      for (const em of splitEmails(e.debitor.kundenEmail)) initial.push({ email: em, quelle: 'Kunden-E-Mail (Projekt)' });
      const standard = initial[0]?.email || '';
      return {
        debitor: e.debitor,
        typ: e.typ,
        hatRechnungsEmail: !!e.debitor.rechnungsEmail?.trim(),
        kandidaten: initial,
        loadingKandidaten: true,
        auswahl: standard || MANUELL,
        manuellEmail: '',
        hinterlegen: !e.debitor.rechnungsEmail?.trim(), // wenn noch keine Rechnungs-E-Mail → standardmäßig hinterlegen
        status: 'idle',
      };
    })
  );
  const [sending, setSending] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null);

  // Kandidaten (Kunde + Ansprechpartner) im Hintergrund nachladen und Dropdown anreichern.
  useEffect(() => {
    let abgebrochen = false;
    runPool(
      entries,
      async (e, i) => {
        try {
          const kandidaten = await ladeMahnEmailKandidaten(e.debitor);
          if (abgebrochen) return;
          setRows((prev) => {
            const next = [...prev];
            const row = next[i];
            if (!row) return prev;
            const auswahl =
              row.auswahl && row.auswahl !== MANUELL
                ? row.auswahl
                : kandidaten[0]?.email || MANUELL;
            next[i] = { ...row, kandidaten, loadingKandidaten: false, auswahl };
            return next;
          });
        } catch {
          if (!abgebrochen) {
            setRows((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], loadingKandidaten: false };
              return next;
            });
          }
        }
      },
      5
    );
    return () => {
      abgebrochen = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effektiveEmail = (row: RowState) => (row.auswahl === MANUELL ? row.manuellEmail.trim() : row.auswahl.trim());

  const updateRow = (index: number, patch: Partial<RowState>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleSenden = async () => {
    if (!testModus) {
      const ok = window.confirm(
        `${rows.length} Zahlungserinnerung(en)/Mahnung(en) ECHT an die Kunden versenden? Mahnstufen werden hochgesetzt.`
      );
      if (!ok) return;
    }

    setSending(true);
    setProgress({ total: rows.length, done: 0 });
    const vorlagen: MahnwesenTextVorlagen = await ladeTextVorlagen();
    let echterErfolg = false;

    await runPool(
      rows.map((_, i) => i),
      async (i) => {
        const row = rows[i];
        const email = effektiveEmail(row);

        // Ohne gültige E-Mail im Echtbetrieb überspringen.
        if (!testModus && (!email || !istValideEmail(email))) {
          updateRow(i, {
            status: 'error',
            ergebnis: { success: false, empfaenger: email, fehler: 'Keine gültige E-Mail gewählt' },
          });
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          return;
        }

        updateRow(i, { status: 'sending' });
        try {
          // Rechnungs-E-Mail hinterlegen (nur echter Versand, nur wenn gewünscht + gültig).
          if (!testModus && row.hinterlegen && email && istValideEmail(email)) {
            await hinterlegeRechnungsEmail(row.debitor, email);
          }
          const res = await sendeMahnungPerEmail({
            debitor: row.debitor,
            dokumentTyp: row.typ,
            testModus,
            vorlagen,
            empfaengerOverride: email || undefined,
          });
          updateRow(i, { status: res.success ? 'success' : 'error', ergebnis: res });
          if (res.success && !testModus) echterErfolg = true;
        } catch (error) {
          updateRow(i, {
            status: 'error',
            ergebnis: {
              success: false,
              empfaenger: email,
              fehler: error instanceof Error ? error.message : 'Unbekannter Fehler',
            },
          });
        } finally {
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      },
      4
    );

    setSending(false);
    setFertig(true);
    setProgress(null);
    onFinished(echterErfolg);
  };

  const erfolge = rows.filter((r) => r.status === 'success').length;
  const fehler = rows.filter((r) => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Kopf */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-slate-100">
              Versand vorbereiten – {rows.length} Mahnung{rows.length === 1 ? '' : 'en'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Empfänger je Debitor prüfen/wählen. {testModus ? `Testmodus → ${TEST_EMAIL_ADDRESS}` : 'ECHTER Versand an Kunden'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-auto divide-y divide-gray-100 dark:divide-slate-700">
          {rows.map((row, i) => {
            const email = effektiveEmail(row);
            const emailFehlt = !email || !istValideEmail(email);
            return (
              <div key={row.debitor.projektId} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-slate-100 truncate">{row.debitor.kundenname}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">{row.debitor.rechnungsnummer}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                        {mahnTypLabel(row.typ)}
                      </span>
                    </div>
                  </div>
                  {/* Status je Zeile */}
                  <div className="text-xs whitespace-nowrap">
                    {row.status === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {row.status === 'success' && row.ergebnis && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> gesendet an {row.ergebnis.empfaenger}
                      </span>
                    )}
                    {row.status === 'error' && row.ergebnis && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5" /> {row.ergebnis.fehler}
                      </span>
                    )}
                  </div>
                </div>

                {/* Empfänger-Auswahl */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Mail className={`w-4 h-4 flex-shrink-0 ${emailFehlt ? 'text-red-500' : 'text-gray-400'}`} />
                  <select
                    value={row.auswahl}
                    disabled={sending || fertig}
                    onChange={(e) => updateRow(i, { auswahl: e.target.value })}
                    className="text-sm px-2 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 max-w-[60%]"
                  >
                    {row.kandidaten.map((k) => (
                      <option key={k.email} value={k.email}>
                        {k.email} — {k.quelle}
                      </option>
                    ))}
                    <option value={MANUELL}>✏️ Andere E-Mail eingeben…</option>
                  </select>

                  {row.loadingKandidaten && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}

                  {row.auswahl === MANUELL && (
                    <input
                      type="email"
                      value={row.manuellEmail}
                      disabled={sending || fertig}
                      onChange={(e) => updateRow(i, { manuellEmail: e.target.value })}
                      placeholder="email@kunde.de"
                      className="text-sm px-2 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 flex-1 min-w-[180px]"
                    />
                  )}

                  {/* Hinterlegen-Haken (nur sinnvoll, wenn noch keine Rechnungs-E-Mail existiert) */}
                  {!row.hatRechnungsEmail && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none ml-auto">
                      <input
                        type="checkbox"
                        checked={row.hinterlegen}
                        disabled={sending || fertig}
                        onChange={(e) => updateRow(i, { hinterlegen: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-gray-300"
                      />
                      als Rechnungs-E-Mail speichern
                    </label>
                  )}
                  {row.hatRechnungsEmail && (
                    <span className="text-xs text-gray-400 ml-auto">Rechnungs-E-Mail bereits hinterlegt</span>
                  )}
                </div>

                {emailFehlt && !testModus && row.status === 'idle' && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Keine gültige E-Mail – bitte wählen oder eingeben (wird sonst übersprungen).
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Fuß */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {progress
              ? `Sende ${progress.done} von ${progress.total}…`
              : fertig
              ? `Fertig: ${erfolge} erfolgreich${fehler > 0 ? `, ${fehler} fehlgeschlagen` : ''}`
              : `${rows.length} Empfänger`}
            {!testModus && !fertig && (
              <span className="ml-2 text-red-600 dark:text-red-400 font-medium">· ECHTER Versand!</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              {fertig ? 'Schließen' : 'Abbrechen'}
            </button>
            {!fertig && (
              <button
                onClick={handleSenden}
                disabled={sending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {testModus ? 'Test senden' : 'Jetzt senden'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MahnVersandDialog;
