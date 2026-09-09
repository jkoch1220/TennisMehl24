import { useMemo, useState } from 'react';
import { useCan } from '../../hooks/useCan';
import {
  AlertTriangle,
  Mail,
  MailX,
  FileText,
  ExternalLink,
  Send,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import {
  DebitorView,
  MahnEmpfehlung,
  MAHNSTUFEN_CONFIG,
  MAHN_EMPFEHLUNG_LABEL,
  istForderungGeschlossen,
} from '../../types/debitor';
import { MahnwesenDokumentTyp } from '../../types/mahnwesen';
import { TEST_EMAIL_ADDRESS } from '../../types/email';
import { berechneMahnEmpfehlung } from '../../services/debitorService';
import { bestimmeMahnEmpfaenger } from '../../services/mahnwesenService';
import MahnVersandDialog, { MahnVersandEntry } from './MahnVersandDialog';
import MahnEmailDialog from './MahnEmailDialog';
import HerkunftBadges from './HerkunftBadges';

interface MahnungenTabProps {
  debitoren: DebitorView[];
  onOpenDetail: (debitor: DebitorView) => void;
  /** Wird nach erfolgreichem (echtem) Versand aufgerufen, um die Liste neu zu laden */
  onReload?: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–');

// Wurde an diesem Debitor HEUTE bereits eine Mahnung versendet? (Doppelversand-Schutz)
const istHeute = (iso?: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const heute = new Date();
  return (
    d.getFullYear() === heute.getFullYear() &&
    d.getMonth() === heute.getMonth() &&
    d.getDate() === heute.getDate()
  );
};

// Empfehlung → versendbarer Mahn-Dokumenttyp (Inkasso/keine werden NICHT automatisch versendet)
const empfehlungZuTyp = (e: MahnEmpfehlung): MahnwesenDokumentTyp | null =>
  e === 'zahlungserinnerung' ? 'zahlungserinnerung' : e === 'mahnung_1' ? 'mahnung_1' : e === 'mahnung_2' ? 'mahnung_2' : null;

interface FaelligEntry {
  debitor: DebitorView;
  empfehlung: MahnEmpfehlung;
  typ: MahnwesenDokumentTyp | null;
  empfaenger?: string;
  /** Heute bereits eine Mahnung versendet → sichtbar markieren, nicht erneut senden */
  heuteVersendet: boolean;
}

/** Offener E-Mail-Dialog für genau einen Debitor */
interface MailDialogState {
  debitor: DebitorView;
  typ: MahnwesenDokumentTyp;
}

/**
 * Mahnwesen-Workflow: halbautomatischer E-Mail-Versand fälliger Mahnungen
 * (Vorschau, Einzel- und Bulk-Versand mit Testmodus) plus Eskalations-Pipeline
 * gruppiert nach Mahnstufe.
 */
const MahnungenTab = ({ debitoren, onOpenDetail, onReload }: MahnungenTabProps) => {
  const { can } = useCan();
  // Sicherheit zuerst: Testmodus ist Default-AN, echter Versand erst nach bewusstem Umschalten.
  const [testModus, setTestModus] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mailDialog, setMailDialog] = useState<MailDialogState | null>(null);
  // Versand-Dialog (Empfänger-Auswahl je Debitor). null = geschlossen.
  const [versandEntries, setVersandEntries] = useState<MahnVersandEntry[] | null>(null);

  const offene = useMemo(() => debitoren.filter((d) => d.status !== 'bezahlt' && !istForderungGeschlossen(d.status)), [debitoren]);

  // Fällige Mahnschritte (inkl. Inkasso-Hinweis). Heute bereits versendete bleiben
  // sichtbar — grün markiert mit Datum und ohne Sendeknopf. Sie verschwinden zu lassen
  // sah aus, als sei nichts passiert; der Doppelversand bleibt service-seitig (gleicher
  // Tag) blockiert und die Zeile lässt sich auch nicht auswählen.
  const faellig = useMemo<FaelligEntry[]>(
    () =>
      offene
        .map((d) => {
          const empfehlung = berechneMahnEmpfehlung(d);
          return {
            debitor: d,
            empfehlung,
            typ: empfehlungZuTyp(empfehlung),
            empfaenger: bestimmeMahnEmpfaenger(d),
            heuteVersendet: istHeute(d.letzteMahnungAm),
          };
        })
        .filter((e) => e.empfehlung !== 'keine'),
    [offene]
  );

  // Versendbar = konkreter Mahn-Typ vorhanden (nicht Inkasso/keine) UND heute noch nicht versendet.
  const istVersendbar = (e: FaelligEntry) => e.typ !== null && !e.heuteVersendet;

  const versendbareEntries = useMemo(
    () => faellig.filter((e) => e.typ !== null && !e.heuteVersendet),
    [faellig]
  );

  // Gruppierung nach Mahnstufe (0-4) — Eskalations-Pipeline.
  const gruppen = useMemo(() => {
    const map = new Map<number, DebitorView[]>();
    for (let stufe = 0; stufe <= 4; stufe++) map.set(stufe, []);
    for (const debitor of offene) {
      const liste = map.get(debitor.mahnstufe);
      if (liste) liste.push(debitor);
    }
    for (const liste of map.values()) liste.sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);
    return map;
  }, [offene]);

  const stufenTitel: Record<number, string> = {
    0: 'Keine Mahnstufe — Zahlungserinnerung prüfen',
    1: 'Mahnstufe 1: Zahlungserinnerung versendet',
    2: 'Mahnstufe 2: 1. Mahnung versendet',
    3: 'Mahnstufe 3: 2. Mahnung / Letzte Mahnung',
    4: 'Mahnstufe 4: Inkasso / Rechtsweg',
  };

  // ---- Auswahl ----
  const toggleSelect = (projektId: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(projektId) ? n.delete(projektId) : n.add(projektId);
      return n;
    });
  };
  const alleVersendbarSelected =
    versendbareEntries.length > 0 && versendbareEntries.every((e) => selected.has(e.debitor.projektId));
  const toggleSelectAll = () => {
    setSelected(alleVersendbarSelected ? new Set() : new Set(versendbareEntries.map((e) => e.debitor.projektId)));
  };

  // ---- Versand (öffnet den Dialog mit Empfänger-Auswahl) ----
  const toEntries = (items: FaelligEntry[]): MahnVersandEntry[] =>
    items
      .filter((e) => e.typ !== null)
      .map((e) => ({ debitor: e.debitor, typ: e.typ as MahnwesenDokumentTyp }));

  /**
   * Einzelversand läuft über den E-Mail-Client: Text prüfen/bearbeiten, PDF ansehen,
   * dann senden. Beim Öffnen wird noch nichts gespeichert.
   */
  const handleMailOeffnen = (entry: FaelligEntry) => {
    if (!can('debitoren', 'edit')) {
      alert('Keine Berechtigung zum Versenden von Mahnungen');
      return;
    }
    if (!entry.typ) return;
    setMailDialog({ debitor: entry.debitor, typ: entry.typ });
  };

  const handleSendSelected = () => {
    if (!can('debitoren', 'edit')) {
      alert('Keine Berechtigung zum Versenden von Mahnungen');
      return;
    }
    const entries = toEntries(versendbareEntries.filter((e) => selected.has(e.debitor.projektId)));
    if (entries.length === 0) return;
    setVersandEntries(entries);
  };

  const handleVersandFinished = (hatEchtenErfolg: boolean) => {
    if (hatEchtenErfolg) {
      setSelected(new Set());
      onReload?.();
    }
  };

  if (offene.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center">
        <p className="text-gray-500 dark:text-slate-400">
          Keine offenen Forderungen. Alle Rechnungen sind bezahlt 🎉
        </p>
      </div>
    );
  }

  const anzahlSelected = versendbareEntries.filter((e) => selected.has(e.debitor.projektId)).length;
  const heuteVersendetAnzahl = faellig.filter((e) => e.heuteVersendet).length;
  const offeneFaelligAnzahl = faellig.filter((e) => !e.heuteVersendet).length;

  return (
    <div className="space-y-6">
      {/* === Fällige Mahnungen: halbautomatischer Versand === */}
      {faellig.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-800 rounded-xl shadow-sm overflow-hidden">
          {/* Kopf */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-orange-50 dark:bg-orange-900/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-orange-900 dark:text-orange-200">
                    {offeneFaelligAnzahl} offene{offeneFaelligAnzahl === 1 ? 'r' : ''} Mahnschritt
                    {offeneFaelligAnzahl === 1 ? '' : 'e'}
                    {heuteVersendetAnzahl > 0 && (
                      <span className="ml-2 text-sm font-normal text-green-700 dark:text-green-400">
                        · {heuteVersendetAnzahl} heute versendet
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    Gesamtbetrag offen:{' '}
                    {formatCurrency(faellig.reduce((s, e) => s + e.debitor.offenerBetrag, 0))}
                  </p>
                </div>
              </div>

              {/* Test-Toggle */}
              <button
                onClick={() => setTestModus((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  testModus
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                }`}
                title="Testmodus umschalten"
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

            {/* Bulk-Leiste */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alleVersendbarSelected}
                  onChange={toggleSelectAll}
                  disabled={versendbareEntries.length === 0}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Alle auswählen ({versendbareEntries.length})
              </label>

              <button
                onClick={handleSendSelected}
                disabled={anzahlSelected === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                <Send className="w-4 h-4" />
                Ausgewählte senden ({anzahlSelected})
              </button>

              {!testModus && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Achtung: Versand an echte Kunden!
                </span>
              )}
            </div>
          </div>

          {/* Zeilen */}
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {faellig.map((entry) => {
              const { debitor, empfehlung, empfaenger, heuteVersendet } = entry;
              const id = debitor.projektId;
              const versendbar = istVersendbar(entry);
              const istInkasso = empfehlung === 'inkasso';

              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    heuteVersendet
                      ? 'bg-green-50 dark:bg-green-900/15'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleSelect(id)}
                    disabled={!versendbar}
                    className="w-4 h-4 rounded border-gray-300 disabled:opacity-30"
                  />

                  <button onClick={() => onOpenDetail(debitor)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                        {debitor.kundenname}
                      </span>
                      {debitor.vereinName && debitor.vereinName !== debitor.kundenname && (
                        <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap truncate" title="Lieferempfänger / Verein">
                          für {debitor.vereinName}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                        {debitor.rechnungsnummer}
                      </span>
                      {debitor.istPlatzbauerprojekt && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" title="Rechnung/Mahnung geht an den Platzbauer, nicht an den Verein">
                          Platzbauer
                        </span>
                      )}
                      <HerkunftBadges debitor={debitor} />
                      {heuteVersendet ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          <CheckCircle2 className="w-3 h-3" /> heute versendet
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            istInkasso
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          }`}
                        >
                          {MAHN_EMPFEHLUNG_LABEL[empfehlung]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      <span className="text-gray-500 dark:text-slate-400">
                        {debitor.tageUeberfaellig} Tage überfällig · Stufe {debitor.mahnstufe}
                      </span>
                      {/* Empfänger-Anzeige: fehlt → rot + Hinweis */}
                      {empfaenger ? (
                        <span className="flex items-center gap-1 text-gray-500 dark:text-slate-400">
                          <Mail className="w-3 h-3" />
                          {empfaenger}
                          {debitor.rechnungsEmail && (
                            <span className="text-[10px] text-gray-400">(Rechnungs-E-Mail)</span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                          <MailX className="w-3 h-3" /> keine Projekt-E-Mail – im Versand wählbar
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="text-right whitespace-nowrap mr-1">
                    <div className="font-semibold text-gray-900 dark:text-slate-100">
                      {formatCurrency(debitor.offenerBetrag)}
                    </div>
                  </div>

                  {/* Aktionen */}
                  <div className="flex items-center gap-1.5">
                    {heuteVersendet ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 px-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> versendet am {formatDate(debitor.letzteMahnungAm)}
                      </span>
                    ) : istInkasso ? (
                      <span className="text-xs text-red-600 dark:text-red-400 px-2">
                        manuell prüfen
                      </span>
                    ) : (
                      <button
                        onClick={() => handleMailOeffnen(entry)}
                        disabled={!versendbar}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        title="E-Mail öffnen: Text prüfen, PDF ansehen, dann senden"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        E-Mail öffnen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === Eskalations-Pipeline nach Mahnstufe === */}
      {[0, 1, 2, 3, 4].map((stufe) => {
        const liste = gruppen.get(stufe) || [];
        if (liste.length === 0) return null;

        const config = MAHNSTUFEN_CONFIG[stufe as 0 | 1 | 2 | 3 | 4];
        const gesamtBetrag = liste.reduce((s, d) => s + d.offenerBetrag, 0);

        return (
          <div
            key={stufe}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color} whitespace-nowrap`}
                >
                  {config.label}
                </span>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {stufenTitel[stufe]}
                </h3>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {liste.length} Debitor{liste.length === 1 ? '' : 'en'}
                </div>
                <div className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  {formatCurrency(gesamtBetrag)}
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {liste.map((debitor) => {
                const empfehlung = berechneMahnEmpfehlung(debitor);
                return (
                  <button
                    key={debitor.projektId}
                    onClick={() => onOpenDetail(debitor)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                          {debitor.kundenname}
                        </span>
                        {debitor.vereinName && debitor.vereinName !== debitor.kundenname && (
                          <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap truncate" title="Lieferempfänger / Verein">
                            für {debitor.vereinName}
                          </span>
                        )}
                        {debitor.istPlatzbauerprojekt && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" title="Rechnung/Mahnung geht an den Platzbauer, nicht an den Verein">
                            Platzbauer
                          </span>
                        )}
                        <HerkunftBadges debitor={debitor} />
                        {empfehlung !== 'keine' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                            <AlertTriangle className="w-3 h-3" />
                            {MAHN_EMPFEHLUNG_LABEL[empfehlung]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {debitor.rechnungsnummer}
                        </span>
                        <span>•</span>
                        <span>{debitor.tageUeberfaellig} Tage überfällig</span>
                        {debitor.letzteMahnungAm && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              Letzte Mahnung: {formatDate(debitor.letzteMahnungAm)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-semibold text-gray-900 dark:text-slate-100">
                        {formatCurrency(debitor.offenerBetrag)}
                      </div>
                      {debitor.bezahlterBetrag > 0 && (
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          von {formatCurrency(debitor.rechnungsbetrag)}
                        </div>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* === E-Mail-Client für den Einzelversand === */}
      {mailDialog && (
        <MahnEmailDialog
          debitor={mailDialog.debitor}
          typ={mailDialog.typ}
          testModusVorgabe={testModus}
          onClose={() => setMailDialog(null)}
          onSent={() => {
            setSelected(new Set());
            onReload?.();
          }}
        />
      )}

      {/* === Massenversand-Dialog mit Empfänger-Auswahl === */}
      {versandEntries && (
        <MahnVersandDialog
          entries={versandEntries}
          testModus={testModus}
          onClose={() => setVersandEntries(null)}
          onFinished={handleVersandFinished}
        />
      )}
    </div>
  );
};

export default MahnungenTab;
