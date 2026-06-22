import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Mail,
  MailX,
  FileWarning,
  Eye,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  FlaskConical,
  RefreshCw,
  X,
} from 'lucide-react';
import { TEST_EMAIL_ADDRESS } from '../../types/email';
import {
  ladeRechnungsVersandListe,
  erstelleRechnungEmailVorschau,
  sendeRechnungPerEmail,
  RechnungVersandItem,
  SendeRechnungErgebnis,
} from '../../services/rechnungVersandService';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

interface PreviewState {
  item: RechnungVersandItem;
  loading: boolean;
  betreff?: string;
  html?: string;
  empfaenger?: string;
  pdfUrl?: string;
}

/**
 * Halbautomatischer Rechnungs-Versand: listet alle Projekte im Status "Rechnung",
 * markiert bereits versendete und ermöglicht Einzel-/Bulk-Versand per E-Mail mit
 * Vorschau und Testmodus.
 */
const RechnungsVersandTab = () => {
  const [items, setItems] = useState<RechnungVersandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testModus, setTestModus] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, SendeRechnungErgebnis>>({});
  const [bulkProgress, setBulkProgress] = useState<{ total: number; done: number } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ erfolg: number; fehler: { kunde: string; grund?: string }[] } | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const laden = async () => {
    setLoading(true);
    try {
      setItems(await ladeRechnungsVersandListe());
    } catch (error) {
      console.error('Fehler beim Laden der Rechnungsliste:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    laden();
  }, []);

  const istVersendbar = (item: RechnungVersandItem) =>
    item.hatAktiveRechnung && (testModus || !!item.empfaenger);

  const versendbareItems = useMemo(() => items.filter(istVersendbar), [items, testModus]);

  // ---- Auswahl ----
  const toggleSelect = (projektId: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(projektId) ? n.delete(projektId) : n.add(projektId);
      return n;
    });
  };
  const alleVersendbarSelected =
    versendbareItems.length > 0 && versendbareItems.every((i) => selected.has(i.projektId));
  const toggleSelectAll = () => {
    setSelected(alleVersendbarSelected ? new Set() : new Set(versendbareItems.map((i) => i.projektId)));
  };

  // ---- Versand ----
  const versendeEinzeln = async (item: RechnungVersandItem): Promise<SendeRechnungErgebnis> => {
    setSendingIds((prev) => new Set(prev).add(item.projektId));
    try {
      const res = await sendeRechnungPerEmail({ projektId: item.projektId, testModus });
      setResults((prev) => ({ ...prev, [item.projektId]: res }));
      return res;
    } finally {
      setSendingIds((prev) => {
        const n = new Set(prev);
        n.delete(item.projektId);
        return n;
      });
    }
  };

  const handleSendOne = async (item: RechnungVersandItem) => {
    const warnung = item.bereitsVersendet ? ' Diese Rechnung wurde bereits versendet!' : '';
    if (!testModus && !window.confirm(`Rechnung ${item.rechnungsnummer} an ${item.empfaenger} ECHT versenden?${warnung}`)) {
      return;
    }
    const res = await versendeEinzeln(item);
    if (res.success && !testModus) laden();
  };

  const handleSendSelected = async () => {
    const ziele = versendbareItems.filter((i) => selected.has(i.projektId));
    if (ziele.length === 0) return;
    if (!testModus && !window.confirm(`${ziele.length} Rechnung(en) ECHT per E-Mail versenden?`)) return;

    setBulkSummary(null);
    setBulkProgress({ total: ziele.length, done: 0 });
    const summary = { erfolg: 0, fehler: [] as { kunde: string; grund?: string }[] };

    let index = 0;
    const worker = async () => {
      while (index < ziele.length) {
        const item = ziele[index++];
        const res = await versendeEinzeln(item);
        if (res.success) summary.erfolg++;
        else summary.fehler.push({ kunde: item.kundenname, grund: res.fehler });
        setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, ziele.length) }, worker));

    setBulkProgress(null);
    setBulkSummary(summary);
    setSelected(new Set());
    if (!testModus && summary.erfolg > 0) laden();
  };

  // ---- Vorschau ----
  const handlePreview = async (item: RechnungVersandItem) => {
    setPreview({ item, loading: true });
    try {
      const v = await erstelleRechnungEmailVorschau(item.projektId);
      const pdfUrl = URL.createObjectURL(v.pdfBlob);
      setPreview({ item, loading: false, betreff: v.betreff, html: v.html, empfaenger: v.empfaenger, pdfUrl });
    } catch (error) {
      console.error('Fehler bei der Rechnungs-Vorschau:', error);
      setPreview(null);
      alert('Fehler beim Erstellen der Vorschau.');
    }
  };
  const closePreview = () => {
    if (preview?.pdfUrl) URL.revokeObjectURL(preview.pdfUrl);
    setPreview(null);
  };

  const anzahlSelected = versendbareItems.filter((i) => selected.has(i.projektId)).length;
  const offeneAnzahl = items.filter((i) => !i.bereitsVersendet).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Rechnungen werden geladen…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center">
        <p className="text-gray-500 dark:text-slate-400">Keine Rechnungen zum Versand vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      {/* Kopf */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Rechnungen zum Versand
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {offeneAnzahl} offen · {items.length} im Status „Rechnung"
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={laden}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <RefreshCw className="w-4 h-4" /> Aktualisieren
            </button>
            <button
              onClick={() => setTestModus((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                testModus
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              {testModus ? (
                <span>
                  Testmodus AN → <strong>{TEST_EMAIL_ADDRESS}</strong>
                </span>
              ) : (
                <span>Echter Versand (an Kunden!)</span>
              )}
            </button>
          </div>
        </div>

        {/* Bulk-Leiste */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alleVersendbarSelected}
              onChange={toggleSelectAll}
              disabled={versendbareItems.length === 0 || !!bulkProgress}
              className="w-4 h-4 rounded border-gray-300"
            />
            Alle versendbaren auswählen ({versendbareItems.length})
          </label>
          <button
            onClick={handleSendSelected}
            disabled={anzahlSelected === 0 || !!bulkProgress}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {bulkProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {bulkProgress ? `Sende ${bulkProgress.done} von ${bulkProgress.total}…` : `Ausgewählte senden (${anzahlSelected})`}
          </button>
          {!testModus && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Achtung: Versand an echte Kunden!
            </span>
          )}
        </div>

        {bulkSummary && (
          <div className="mt-3 p-3 rounded-lg bg-white dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm">
            <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              {bulkSummary.erfolg} erfolgreich
              {bulkSummary.fehler.length > 0 && (
                <>
                  <XCircle className="w-4 h-4 text-red-600 ml-2" />
                  {bulkSummary.fehler.length} fehlgeschlagen
                </>
              )}
            </div>
            {bulkSummary.fehler.length > 0 && (
              <ul className="mt-1 ml-6 list-disc text-red-600 dark:text-red-400">
                {bulkSummary.fehler.map((f, i) => (
                  <li key={i}>
                    {f.kunde}: {f.grund || 'Unbekannter Fehler'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Zeilen */}
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        {items.map((item) => {
          const sending = sendingIds.has(item.projektId);
          const result = results[item.projektId];
          const versendbar = istVersendbar(item);

          return (
            <div
              key={item.projektId}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(item.projektId)}
                onChange={() => toggleSelect(item.projektId)}
                disabled={!versendbar || !!bulkProgress}
                className="w-4 h-4 rounded border-gray-300 disabled:opacity-30"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-slate-100 truncate">{item.kundenname}</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {item.rechnungsnummer || '— keine Rechnungsnr.'}
                  </span>
                  {item.bereitsVersendet && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="w-3 h-3" /> bereits versendet
                    </span>
                  )}
                  {!item.hatAktiveRechnung && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      <FileWarning className="w-3 h-3" /> keine aktive Rechnung
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  {item.empfaenger ? (
                    <span className="flex items-center gap-1 text-gray-500 dark:text-slate-400">
                      <Mail className="w-3 h-3" />
                      {item.empfaenger}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                      <MailX className="w-3 h-3" /> keine E-Mail hinterlegt
                    </span>
                  )}
                </div>
                {result && (
                  <div
                    className={`mt-0.5 text-xs flex items-center gap-1 ${
                      result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {result.success ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> Gesendet an {result.empfaenger}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" /> {result.fehler}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="text-right whitespace-nowrap mr-1">
                <div className="font-semibold text-gray-900 dark:text-slate-100">{formatCurrency(item.betrag)}</div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePreview(item)}
                  disabled={!item.hatAktiveRechnung || sending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  <Eye className="w-3.5 h-3.5" /> Vorschau
                </button>
                <button
                  onClick={() => handleSendOne(item)}
                  disabled={!versendbar || sending || !!bulkProgress}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Senden
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vorschau-Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closePreview}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-slate-100">
                Vorschau: Rechnung {preview.item.rechnungsnummer} – {preview.item.kundenname}
              </h3>
              <button onClick={closePreview} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {preview.loading ? (
              <div className="flex items-center justify-center p-12 gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Vorschau wird erstellt…
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-4 p-5 overflow-auto">
                <div className="md:w-1/2 space-y-2">
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    An:{' '}
                    <span className={`font-medium ${preview.empfaenger ? 'text-gray-700 dark:text-slate-200' : 'text-red-600'}`}>
                      {testModus
                        ? `${TEST_EMAIL_ADDRESS} (Testmodus)`
                        : preview.empfaenger || 'keine E-Mail hinterlegt'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {testModus ? '[TEST] ' : ''}
                    {preview.betreff}
                  </div>
                  <div
                    className="text-sm text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-900/40 rounded-lg p-3 border border-gray-200 dark:border-slate-700 prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: preview.html || '' }}
                  />
                </div>
                <div className="md:w-1/2 min-h-[400px]">
                  {preview.pdfUrl && (
                    <iframe
                      title="Rechnungs-PDF Vorschau"
                      src={preview.pdfUrl}
                      className="w-full h-[60vh] rounded-lg border border-gray-200 dark:border-slate-700"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RechnungsVersandTab;
