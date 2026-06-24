import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  X,
  Search,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { DebitorView } from '../../types/debitor';
import { EmailProtokoll } from '../../types/email';
import { ladeAlleEmailProtokolle } from '../../services/emailSendService';

interface VersendeteMailsTabProps {
  /** Aktuelle Debitoren – um projektId → Kundenname/Rechnungsnummer aufzulösen */
  debitoren: DebitorView[];
}

const formatDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–');

// Mahn-Stufe aus dem Protokoll ableiten: pdfDateiname enthält das exakte Label
// ("Zahlungserinnerung" / "1. Mahnung" / "2. Mahnung"), Fallback über dokumentNummer-Präfix.
const mahnTyp = (e: EmailProtokoll): string => {
  const dn = e.pdfDateiname || '';
  if (dn.startsWith('2. Mahnung')) return '2. Mahnung';
  if (dn.startsWith('1. Mahnung')) return '1. Mahnung';
  if (dn.startsWith('Zahlungserinnerung')) return 'Zahlungserinnerung';
  const nr = (e.dokumentNummer || '').toUpperCase();
  if (nr.startsWith('ZE')) return 'Zahlungserinnerung';
  if (nr.startsWith('MA')) return 'Mahnung';
  return 'Mahnung';
};

const typBadgeClass = (typ: string): string => {
  if (typ === 'Zahlungserinnerung') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
  if (typ === '1. Mahnung') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  if (typ === '2. Mahnung') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
};

// Kundenname als Fallback aus dem PDF-Dateinamen extrahieren
// Format: "{typLabel} {kundenname} {dokumentNummer}.pdf"
const kundeAusDateiname = (e: EmailProtokoll): string => {
  let s = (e.pdfDateiname || '').replace(/\.pdf$/i, '');
  s = s.replace(/^(2\. Mahnung|1\. Mahnung|Zahlungserinnerung)\s+/, '');
  if (e.dokumentNummer) {
    const esc = e.dokumentNummer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('\\s+' + esc + '$'), '');
  }
  return s.trim();
};

interface Gruppe {
  projektId: string;
  kundenname: string;
  rechnungsnummer?: string;
  mails: EmailProtokoll[];
  letzteAm: string;
}

const VersendeteMailsTab = ({ debitoren }: VersendeteMailsTabProps) => {
  const [protokolle, setProtokolle] = useState<EmailProtokoll[]>([]);
  const [laden, setLaden] = useState(true);
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [vorschau, setVorschau] = useState<EmailProtokoll | null>(null);

  const projektInfo = useMemo(() => {
    const m = new Map<string, { kundenname: string; rechnungsnummer?: string }>();
    for (const d of debitoren) m.set(d.projektId, { kundenname: d.kundenname, rechnungsnummer: d.rechnungsnummer });
    return m;
  }, [debitoren]);

  const laden_ = async () => {
    setLaden(true);
    try {
      const alle = await ladeAlleEmailProtokolle(500);
      setProtokolle(alle.filter((e) => e.dokumentTyp === 'mahnwesen'));
    } finally {
      setLaden(false);
    }
  };

  useEffect(() => {
    laden_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nach Projekt (= Kunde/Rechnung) gruppieren
  const gruppen: Gruppe[] = useMemo(() => {
    const map = new Map<string, EmailProtokoll[]>();
    for (const e of protokolle) {
      const key = e.projektId || e.dokumentNummer || e.$id || 'unbekannt';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const result: Gruppe[] = [];
    for (const [projektId, mails] of map) {
      // chronologisch (älteste zuerst → Eskalations-Reihenfolge)
      mails.sort((a, b) => new Date(a.gesendetAm).getTime() - new Date(b.gesendetAm).getTime());
      const info = projektInfo.get(projektId);
      const kundenname = info?.kundenname || kundeAusDateiname(mails[0]) || 'Unbekannter Kunde';
      const letzteAm = mails[mails.length - 1]?.gesendetAm || '';
      result.push({ projektId, kundenname, rechnungsnummer: info?.rechnungsnummer, mails, letzteAm });
    }
    // jüngste Aktivität zuerst
    result.sort((a, b) => new Date(b.letzteAm).getTime() - new Date(a.letzteAm).getTime());
    return result;
  }, [protokolle, projektInfo]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return gruppen;
    return gruppen.filter(
      (g) =>
        g.kundenname.toLowerCase().includes(q) ||
        (g.rechnungsnummer || '').toLowerCase().includes(q) ||
        g.mails.some((m) => m.empfaenger.toLowerCase().includes(q))
    );
  }, [gruppen, suche]);

  const toggle = (id: string) =>
    setOffen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const gesamtMails = protokolle.length;

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            Versendete Mahn-E-Mails
          </h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {gesamtMails} versendete Zahlungserinnerung{gesamtMails === 1 ? '' : 'en'}/Mahnung
            {gesamtMails === 1 ? '' : 'en'} · {gefiltert.length} Kunde{gefiltert.length === 1 ? '' : 'n'}
          </p>
        </div>
        <button
          onClick={laden_}
          disabled={laden}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {laden ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Aktualisieren
        </button>
      </div>

      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Kunde, Rechnungsnummer oder E-Mail suchen…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
        />
      </div>

      {/* Inhalt */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Lade Versand-Protokoll…
        </div>
      ) : gefiltert.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
          <Inbox className="w-10 h-10 mb-3" />
          <p className="text-sm">
            {gesamtMails === 0
              ? 'Noch keine Mahn-E-Mails versendet (Testversand wird nicht protokolliert).'
              : 'Keine Treffer für die Suche.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {gefiltert.map((g) => {
            const istOffen = offen.has(g.projektId);
            return (
              <div
                key={g.projektId}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
              >
                {/* Gruppen-Kopf (Kunde) */}
                <button
                  onClick={() => toggle(g.projektId)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {istOffen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                          {g.kundenname}
                        </span>
                        {g.rechnungsnummer && (
                          <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                            {g.rechnungsnummer}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        zuletzt {formatDate(g.letzteAm)}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 whitespace-nowrap">
                    {g.mails.length} Nachricht{g.mails.length === 1 ? '' : 'en'}
                  </span>
                </button>

                {/* Aufgeklappt: Liste der Mails */}
                {istOffen && (
                  <div className="border-t border-gray-100 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
                    {g.mails.map((m) => {
                      const typ = mahnTyp(m);
                      return (
                        <div
                          key={m.$id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 pl-11 bg-gray-50/50 dark:bg-slate-800/40"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {m.status === 'gesendet' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                            )}
                            <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap w-32">
                              {formatDateTime(m.gesendetAm)}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${typBadgeClass(typ)}`}
                            >
                              {typ}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400 truncate hidden sm:inline">
                              an {m.empfaenger}
                            </span>
                            {m.status === 'fehler' && (
                              <span className="text-xs text-red-600 dark:text-red-400 truncate">
                                {m.fehlerMeldung || 'Fehler'}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => setVorschau(m)}
                            className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ansehen
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Vorschau-Modal */}
      {vorschau && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVorschau(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-slate-700">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${typBadgeClass(mahnTyp(vorschau))}`}
                  >
                    {mahnTyp(vorschau)}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{vorschau.betreff}</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  an {vorschau.empfaenger} · {formatDateTime(vorschau.gesendetAm)}
                  {vorschau.dokumentNummer ? ` · ${vorschau.dokumentNummer}` : ''}
                </p>
              </div>
              <button
                onClick={() => setVorschau(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 flex-shrink-0"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {vorschau.htmlContent ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-slate-200 [&_*]:!text-inherit"
                  dangerouslySetInnerHTML={{ __html: vorschau.htmlContent }}
                />
              ) : (
                <p className="text-sm text-gray-400">Kein E-Mail-Inhalt gespeichert.</p>
              )}
            </div>

            {vorschau.pdfDateiname && (
              <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> Anhang: {vorschau.pdfDateiname}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VersendeteMailsTab;
