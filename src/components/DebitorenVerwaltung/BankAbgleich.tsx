import { useState, useMemo, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  TrendingUp,
  Loader2,
  Info,
} from 'lucide-react';
import { DebitorView } from '../../types/debitor';
import { debitorService } from '../../services/debitorService';
import {
  parseBankImport,
  matcheTransaktionen,
  BankTransaktion,
  MatchErgebnis,
  DebitorKandidat,
} from '../../utils/bankImportParser';

interface BankAbgleichProps {
  debitoren: DebitorView[];
  onDebitorAktualisiert: (patched: DebitorView) => void;
  onReload: () => void;
}

type Status = 'leer' | 'geladen' | 'verarbeite';

const BankAbgleich = ({ debitoren, onDebitorAktualisiert, onReload }: BankAbgleichProps) => {
  const [status, setStatus] = useState<Status>('leer');
  const [transaktionen, setTransaktionen] = useState<BankTransaktion[]>([]);
  const [format, setFormat] = useState<string>('');
  const [fehler, setFehler] = useState<string[]>([]);
  const [dateiName, setDateiName] = useState<string>('');
  const [verarbeiteteIds, setVerarbeiteteIds] = useState<Set<string>>(new Set());
  const [laufendeBuchung, setLaufendeBuchung] = useState<string | null>(null);
  const [nurMitVorschlag, setNurMitVorschlag] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Offene Debitoren (noch nicht bezahlt)
  const offeneDebitoren = useMemo(() => debitoren.filter((d) => d.status !== 'bezahlt'), [debitoren]);

  const kandidaten: DebitorKandidat[] = useMemo(
    () =>
      offeneDebitoren.map((d) => ({
        projektId: d.projektId,
        rechnungsnummer: d.rechnungsnummer,
        kundenname: d.kundenname,
        offenerBetrag: d.offenerBetrag,
      })),
    [offeneDebitoren]
  );

  const matches: MatchErgebnis[] = useMemo(
    () => matcheTransaktionen(transaktionen, kandidaten),
    [transaktionen, kandidaten]
  );

  const gefilterteMatches = useMemo(() => {
    return nurMitVorschlag ? matches.filter((m) => m.vorschlaege.length > 0) : matches;
  }, [matches, nurMitVorschlag]);

  const statistik = useMemo(() => {
    const mitVorschlag = matches.filter((m) => m.vorschlaege.length > 0).length;
    const ohne = matches.length - mitVorschlag;
    const summeEingaenge = transaktionen
      .filter((t) => t.betrag > 0)
      .reduce((s, t) => s + t.betrag, 0);
    return { gesamt: transaktionen.length, mitVorschlag, ohne, summeEingaenge };
  }, [matches, transaktionen]);

  const handleDatei = async (file: File) => {
    setStatus('verarbeite');
    setFehler([]);
    setDateiName(file.name);

    try {
      const text = await file.text();
      const ergebnis = parseBankImport(text, file.name);

      setTransaktionen(ergebnis.transaktionen);
      setFormat(ergebnis.format);
      setFehler(ergebnis.fehler);
      setStatus(ergebnis.transaktionen.length > 0 ? 'geladen' : 'leer');
    } catch (err) {
      console.error('Import-Fehler:', err);
      setFehler([`Datei konnte nicht gelesen werden: ${(err as Error).message}`]);
      setStatus('leer');
    }
  };

  const handleBuchen = async (tx: BankTransaktion, debitorKandidat: DebitorKandidat) => {
    if (laufendeBuchung) return;
    setLaufendeBuchung(tx.id);

    try {
      const kurzVwz = tx.verwendungszweck.replace(/\s+/g, ' ').trim().substring(0, 80);
      const kurzName = (tx.auftraggeber || '').substring(0, 60);
      const aktualisiert = await debitorService.addZahlung(debitorKandidat.projektId, {
        betrag: tx.betrag,
        datum: tx.valutaDatum || tx.datum,
        zahlungsart: 'ueberweisung',
        referenz: kurzName || undefined,
        notiz: kurzVwz ? `Bankimport: ${kurzVwz}` : 'Bankimport',
      });

      onDebitorAktualisiert(aktualisiert);
      setVerarbeiteteIds((prev) => new Set(prev).add(tx.id));
    } catch (err) {
      console.error('Fehler beim Buchen:', err);
      alert(`Buchung fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setLaufendeBuchung(null);
    }
  };

  const handleReset = () => {
    setStatus('leer');
    setTransaktionen([]);
    setFehler([]);
    setDateiName('');
    setFormat('');
    setVerarbeiteteIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleDatei(file);
  };

  return (
    <div className="space-y-6">
      {/* Upload-Bereich */}
      {status === 'leer' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="bg-white dark:bg-slate-900 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl p-10 text-center hover:border-green-500 dark:hover:border-green-400 transition-colors"
        >
          <Upload className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
            Kontoauszug hochladen
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-5 max-w-lg mx-auto">
            Exportiere im Online-Banking deine Umsätze als <strong>CSV</strong> (Sparkasse,
            Volksbank, DKB, Commerzbank, ING) oder <strong>MT940/.sta</strong> und lade die Datei
            hier hoch. Zahlungseingänge werden automatisch deinen offenen Rechnungen zugeordnet.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.sta,.mt940"
            onChange={(e) => e.target.files?.[0] && handleDatei(e.target.files[0])}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Datei auswählen
          </button>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-4">
            Oder Datei hierher ziehen
          </p>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700 text-left max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Wo finde ich den Export?
            </p>
            <ul className="text-xs text-gray-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li><strong>Sparkasse:</strong> Umsätze → Suche → "Als CSV exportieren"</li>
              <li><strong>Volksbank/VR-Banking:</strong> Umsätze → Druckersymbol → CSV-MT940</li>
              <li><strong>DKB:</strong> Umsätze → CSV-Export</li>
              <li><strong>Commerzbank:</strong> Umsätze → Export → CSV</li>
              <li><strong>ING:</strong> Umsätze → CSV/MT940 herunterladen</li>
            </ul>
          </div>
        </div>
      )}

      {status === 'verarbeite' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-10 text-center">
          <Loader2 className="w-10 h-10 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-slate-400">Datei wird verarbeitet…</p>
        </div>
      )}

      {fehler.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 dark:text-red-300 mb-1">
                Import nicht vollständig
              </p>
              <ul className="text-sm text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
                {fehler.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Geladen: Statistik + Transaktionsliste */}
      {status === 'geladen' && transaktionen.length > 0 && (
        <>
          {/* Statistik-Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-slate-100">{dateiName}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {statistik.gesamt} Transaktionen · Format: {format}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" /> Neue Datei
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-400 uppercase font-semibold">
                  Eingänge
                </p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                  {statistik.summeEingaenge.toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                <p className="text-xs text-green-700 dark:text-green-400 uppercase font-semibold">
                  Zuordnung
                </p>
                <p className="text-lg font-bold text-green-900 dark:text-green-300">
                  {statistik.mitVorschlag} Treffer
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 uppercase font-semibold">
                  Ohne Treffer
                </p>
                <p className="text-lg font-bold text-amber-900 dark:text-amber-300">
                  {statistik.ohne}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-gray-600 dark:text-slate-400 uppercase font-semibold">
                  Gebucht
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  {verarbeiteteIds.size}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 mt-4 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={nurMitVorschlag}
                onChange={(e) => setNurMitVorschlag(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Nur Transaktionen mit Zuordnungsvorschlag anzeigen
            </label>
          </div>

          {/* Transaktionsliste */}
          <div className="space-y-3">
            {gefilterteMatches.length === 0 && (
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center">
                <TrendingUp className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 dark:text-slate-400">
                  Keine Transaktionen mit Vorschlag gefunden.
                </p>
              </div>
            )}

            {gefilterteMatches.map((m) => {
              const tx = m.transaktion;
              const gebucht = verarbeiteteIds.has(tx.id);
              const buchendGerade = laufendeBuchung === tx.id;

              return (
                <div
                  key={tx.id}
                  className={`bg-white dark:bg-slate-900 border rounded-xl p-4 transition-colors ${
                    gebucht
                      ? 'border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {tx.datum}
                        </span>
                        {tx.auftraggeber && (
                          <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                            {tx.auftraggeber}
                          </span>
                        )}
                        {gebucht && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded text-xs font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> gebucht
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-slate-400 break-words">
                        {tx.verwendungszweck || <em className="text-gray-400">(kein Verwendungszweck)</em>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${
                          tx.betrag > 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tx.betrag > 0 ? '+' : ''}
                        {tx.betrag.toLocaleString('de-DE', {
                          style: 'currency',
                          currency: tx.waehrung || 'EUR',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Vorschläge */}
                  {!gebucht && m.vorschlaege.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                      {m.vorschlaege.map((v, idx) => {
                        const istTopTreffer = idx === 0 && v.score >= 80;
                        return (
                          <div
                            key={v.debitor.projektId}
                            className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg ${
                              istTopTreffer
                                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                : 'bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                                  {v.debitor.kundenname}
                                </span>
                                {v.debitor.rechnungsnummer && (
                                  <span className="text-xs text-gray-500 dark:text-slate-400">
                                    Rechn. {v.debitor.rechnungsnummer}
                                  </span>
                                )}
                                <span
                                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                    v.score >= 80
                                      ? 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100'
                                      : v.score >= 50
                                      ? 'bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100'
                                      : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                                  }`}
                                >
                                  {v.score}%
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-slate-400">
                                Offen:{' '}
                                {v.debitor.offenerBetrag.toLocaleString('de-DE', {
                                  style: 'currency',
                                  currency: 'EUR',
                                })}
                                {' · '}
                                {v.gruende.join(' · ')}
                              </p>
                            </div>
                            <button
                              onClick={() => handleBuchen(tx, v.debitor)}
                              disabled={buchendGerade}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              {buchendGerade ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Zahlung buchen
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!gebucht && m.vorschlaege.length === 0 && (
                    <p className="text-xs text-gray-500 dark:text-slate-500 pt-2 italic">
                      Kein passender Debitor gefunden.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {verarbeiteteIds.size > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm text-blue-800 dark:text-blue-300">
                {verarbeiteteIds.size} Zahlung(en) erfolgreich gebucht. Debitoren wurden
                aktualisiert.
              </span>
              <button
                onClick={onReload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Liste neu laden
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BankAbgleich;
