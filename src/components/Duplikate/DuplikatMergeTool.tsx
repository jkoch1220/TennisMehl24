import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Check,
  X,
  Merge,
  Undo2,
  History,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { duplikatService } from '../../services/duplikatService';
import { DuplikatPaar, MergeKontext, MergeArchivEintrag } from '../../types/duplikat';
import { SaisonKunde } from '../../types/saisonplanung';

const konfidenz = (score: number) =>
  score >= 0.9
    ? { label: 'sehr sicher', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
    : score >= 0.75
    ? { label: 'wahrscheinlich', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
    : { label: 'möglich', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };

// Felder, die im Vergleich gegenübergestellt werden.
const VERGLEICH_FELDER: { key: keyof SaisonKunde; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'kundennummer', label: 'Kundennr.' },
  { key: 'email', label: 'E-Mail' },
  { key: 'rechnungsEmail', label: 'Rechnungs-E-Mail' },
  { key: 'telefon', label: 'Telefon' },
  { key: 'mobiltelefon', label: 'Mobil' },
  { key: 'mosaikKurzname', label: 'Mosaik-Kurzname' },
  { key: 'tonnenLetztesJahr', label: 'Tonnen Vorjahr' },
  { key: 'zuletztGezahlterPreis', label: 'Preis Vorjahr' },
  { key: 'notizen', label: 'Notizen' },
];

function adresse(k: SaisonKunde): string {
  const a = k.lieferadresse || k.rechnungsadresse;
  if (!a) return '';
  return [a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function wert(k: SaisonKunde, key: keyof SaisonKunde): string {
  const v = k[key];
  if (v === undefined || v === null || v === '') return '';
  return String(v);
}

const MergeDetail = ({
  kontext,
  benutzer,
  onAbbrechen,
  onMergeFertig,
}: {
  kontext: MergeKontext;
  benutzer?: string;
  onAbbrechen: () => void;
  onMergeFertig: () => void;
}) => {
  // survivorSeite: 'a' oder 'b' (welcher Datensatz bleibt erhalten)
  const [survivorSeite, setSurvivorSeite] = useState<'a' | 'b'>(() => {
    // Default: der mit mehr Referenzen / mehr ausgefüllten Feldern bleibt.
    const punkteA =
      kontext.referenzenA.projekte * 3 + kontext.referenzenA.ansprechpartner + kontext.referenzenA.saisonDaten;
    const punkteB =
      kontext.referenzenB.projekte * 3 + kontext.referenzenB.ansprechpartner + kontext.referenzenB.saisonDaten;
    return punkteB > punkteA ? 'b' : 'a';
  });
  const [bestaetigung, setBestaetigung] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const survivor = survivorSeite === 'a' ? kontext.a : kontext.b;
  const loser = survivorSeite === 'a' ? kontext.b : kontext.a;
  const refSurvivor = survivorSeite === 'a' ? kontext.referenzenA : kontext.referenzenB;
  const refLoser = survivorSeite === 'a' ? kontext.referenzenB : kontext.referenzenA;

  const vorschau = useMemo(() => duplikatService.baueMergePatch(survivor, loser), [survivor, loser]);

  const handleMerge = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      await duplikatService.fuehreMergeDurch(survivor.id, loser.id, benutzer);
      onMergeFertig();
    } catch (e) {
      console.error('Merge fehlgeschlagen:', e);
      setFehler(e instanceof Error ? e.message : 'Merge fehlgeschlagen');
      setLaeuft(false);
    }
  };

  const SeitenKopf = ({ seite, k, ref }: { seite: 'a' | 'b'; k: SaisonKunde; ref: typeof refSurvivor }) => {
    const istSurvivor = survivorSeite === seite;
    return (
      <button
        onClick={() => setSurvivorSeite(seite)}
        className={`flex-1 text-left p-3 rounded-lg border-2 transition-colors ${
          istSurvivor
            ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {istSurvivor ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-400">
              <ShieldCheck className="w-4 h-4" /> BLEIBT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
              <ShieldAlert className="w-4 h-4" /> wird entfernt
            </span>
          )}
        </div>
        <div className="font-semibold text-gray-900 dark:text-slate-100">{k.name}</div>
        <div className="text-xs text-gray-500">
          {k.kundennummer || '—'} · {adresse(k) || 'keine Adresse'}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {ref.projekte} Projekte · {ref.ansprechpartner} Ansprechp. · {ref.saisonDaten} Saisondaten ·{' '}
          {ref.aktivitaeten} Akt.
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <Merge className="w-5 h-5 text-purple-600" /> Duplikat zusammenführen
          </h2>
          <button onClick={onAbbrechen} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
          Wähle, welcher Datensatz <strong>bleibt</strong>. Der andere wird hineingefaltet und entfernt –
          alle Projekte, Ansprechpartner, Saisondaten usw. werden übernommen. Wiederherstellbar über das Archiv.
        </p>

        {/* Survivor-Auswahl */}
        <div className="flex gap-3 mb-4">
          <SeitenKopf seite="a" k={kontext.a} ref={kontext.referenzenA} />
          <div className="flex items-center">
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
          <SeitenKopf seite="b" k={kontext.b} ref={kontext.referenzenB} />
        </div>

        {/* Feldvergleich */}
        <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-1.5 text-left">Feld</th>
                <th className="px-3 py-1.5 text-left">Bleibt ({survivor.kundennummer || survivor.name})</th>
                <th className="px-3 py-1.5 text-left">Duplikat</th>
              </tr>
            </thead>
            <tbody>
              {VERGLEICH_FELDER.map(({ key, label }) => {
                const sv = wert(survivor, key);
                const lv = wert(loser, key);
                const konflikt = sv && lv && sv !== lv;
                const ergaenzt = !sv && lv;
                return (
                  <tr key={String(key)} className="border-t border-gray-100 dark:border-slate-700/60">
                    <td className="px-3 py-1.5 text-gray-500">{label}</td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-slate-100">
                      {sv || <span className="text-gray-300">—</span>}
                    </td>
                    <td
                      className={`px-3 py-1.5 ${
                        konflikt
                          ? 'text-amber-600 dark:text-amber-400'
                          : ergaenzt
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {lv || <span className="text-gray-300">—</span>}
                      {ergaenzt && <span className="ml-1 text-xs">(wird übernommen)</span>}
                      {konflikt && <span className="ml-1 text-xs">(als Notiz gesichert)</span>}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-gray-100 dark:border-slate-700/60">
                <td className="px-3 py-1.5 text-gray-500">Adresse</td>
                <td className="px-3 py-1.5 text-gray-900 dark:text-slate-100">{adresse(survivor) || '—'}</td>
                <td className="px-3 py-1.5 text-gray-400">{adresse(loser) || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {vorschau.konflikte.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-4 text-xs text-amber-700 dark:text-amber-300">
            <strong>{vorschau.konflikte.length} abweichende Felder</strong> werden als Notiz am bleibenden
            Kunden gesichert (kein Datenverlust).
          </div>
        )}

        {fehler && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {fehler}
          </div>
        )}

        {/* Aktionen */}
        {!bestaetigung ? (
          <div className="flex justify-end gap-3">
            <button
              onClick={onAbbrechen}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Abbrechen
            </button>
            <button
              onClick={() => setBestaetigung(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2"
            >
              <Merge className="w-4 h-4" /> Zusammenführen…
            </button>
          </div>
        ) : (
          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-3">
              <strong>{loser.name}</strong> ({loser.kundennummer || '—'}) wird in{' '}
              <strong>{survivor.name}</strong> ({survivor.kundennummer || '—'}) zusammengeführt.{' '}
              {refLoser.projekte + refLoser.ansprechpartner + refLoser.saisonDaten + refLoser.aktivitaeten}{' '}
              Referenzen werden umgehängt, dann wird das Duplikat entfernt.{' '}
              <span className="text-purple-700 dark:text-purple-300">Wiederherstellbar über das Archiv.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBestaetigung(false)}
                disabled={laeuft}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 disabled:opacity-50"
              >
                Zurück
              </button>
              <button
                onClick={handleMerge}
                disabled={laeuft}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {laeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Endgültig zusammenführen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DuplikatMergeTool = () => {
  const { user, isAdmin } = useAuth();
  const benutzer =
    (user as { name?: string; email?: string } | null)?.name ||
    (user as { name?: string; email?: string } | null)?.email;

  const [paare, setPaare] = useState<DuplikatPaar[]>([]);
  const [loading, setLoading] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ignoriert, setIgnoriert] = useState<Set<string>>(new Set());

  const [aktivesPaar, setAktivesPaar] = useState<DuplikatPaar | null>(null);
  const [kontext, setKontext] = useState<MergeKontext | null>(null);
  const [kontextLaedt, setKontextLaedt] = useState(false);

  const [archiv, setArchiv] = useState<MergeArchivEintrag[]>([]);
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  const ladeArchiv = useCallback(async () => {
    setArchiv(await duplikatService.ladeArchiv());
  }, []);

  const ladePaare = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const liste = await duplikatService.findeDuplikate();
      setPaare(liste);
      setGeladen(true);
      await ladeArchiv();
    } catch (e) {
      console.error(e);
      setFehler(e instanceof Error ? e.message : 'Fehler beim Suchen');
    } finally {
      setLoading(false);
    }
  }, [ladeArchiv]);

  useEffect(() => {
    void ladeArchiv();
  }, [ladeArchiv]);

  const sichtbar = useMemo(() => paare.filter((p) => !ignoriert.has(p.id)), [paare, ignoriert]);
  const zaehler = useMemo(
    () => ({
      sicher: sichtbar.filter((p) => p.score >= 0.9).length,
      wahrscheinlich: sichtbar.filter((p) => p.score >= 0.75 && p.score < 0.9).length,
    }),
    [sichtbar]
  );

  const oeffneMerge = async (paar: DuplikatPaar) => {
    setAktivesPaar(paar);
    setKontext(null);
    setKontextLaedt(true);
    try {
      setKontext(await duplikatService.ladeMergeKontext(paar.aId, paar.bId));
    } catch (e) {
      console.error(e);
      setFehler(e instanceof Error ? e.message : 'Kontext konnte nicht geladen werden');
      setAktivesPaar(null);
    } finally {
      setKontextLaedt(false);
    }
  };

  const onMergeFertig = (paarId: string) => {
    setPaare((prev) => prev.filter((p) => p.id !== paarId));
    setAktivesPaar(null);
    setKontext(null);
    void ladeArchiv();
  };

  const undo = async (archivId: string) => {
    try {
      await duplikatService.macheMergeRueckgaengig(archivId);
      await ladeArchiv();
      // Paare neu berechnen, damit das wiederhergestellte Duplikat wieder erscheint
      if (geladen) await ladePaare();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Rückgängig fehlgeschlagen');
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-amber-800 dark:text-amber-300 flex items-center gap-3">
          <ShieldAlert className="w-6 h-6" /> Das Duplikat-Tool ist nur für Administratoren verfügbar.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl shadow-lg">
            <Users className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-dark-text">
              Duplikate zusammenführen
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Findet doppelte Kunden (Mosaik-Import) und führt sie sicher zusammen – keine Daten gehen verloren.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZeigeArchiv((v) => !v)}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <History className="w-4 h-4" /> Archiv ({archiv.length})
          </button>
          <button
            onClick={ladePaare}
            disabled={loading}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Duplikate suchen
          </button>
        </div>
      </div>

      {fehler && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5 text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {fehler}
        </div>
      )}

      {/* Archiv */}
      {zeigeArchiv && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Merge-Archiv (rückgängig machbar)
          </div>
          {archiv.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Merges.</p>
          ) : (
            <div className="space-y-1 text-sm max-h-64 overflow-y-auto">
              {archiv.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700/50 pb-1"
                >
                  <span className="text-xs text-gray-400">{new Date(a.zeitpunkt).toLocaleString('de-DE')}</span>
                  <span className="text-gray-700 dark:text-slate-300">
                    {a.loserName} → {a.survivorName}
                  </span>
                  {a.benutzer && <span className="text-xs text-gray-400">{a.benutzer}</span>}
                  <div className="ml-auto">
                    {a.rueckgaengig ? (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">rückgängig</span>
                    ) : (
                      <button
                        onClick={() => undo(a.id)}
                        className="text-xs px-2 py-0.5 border border-gray-300 dark:border-slate-600 rounded text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" /> rückgängig
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!geladen ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center text-gray-500 dark:text-slate-400">
          „Duplikate suchen" startet einen Scan über alle Kunden (read-only).
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">{sichtbar.length} Kandidaten</span>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {zaehler.sicher} sehr sicher
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {zaehler.wahrscheinlich} wahrscheinlich
            </span>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-700/60">
            {sichtbar.length === 0 && (
              <div className="p-8 text-center text-gray-400">Keine offenen Duplikate. 🎉</div>
            )}
            {sichtbar.slice(0, 300).map((p) => {
              const k = konfidenz(p.score);
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${k.cls}`}>
                    {Math.round(p.score * 100)}%
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 dark:text-slate-100 truncate">
                      <strong>{p.aName}</strong> <span className="text-gray-400">[{p.aKundennummer || '—'}]</span>
                      <span className="text-gray-400 mx-1">↔</span>
                      <strong>{p.bName}</strong> <span className="text-gray-400">[{p.bKundennummer || '—'}]</span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {p.plz} {p.ort} · {p.signale.join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => setIgnoriert((prev) => new Set(prev).add(p.id))}
                    className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700"
                    title="Kein Duplikat – ausblenden"
                  >
                    kein Duplikat
                  </button>
                  <button
                    onClick={() => oeffneMerge(p)}
                    className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-1.5"
                  >
                    <Merge className="w-4 h-4" /> Prüfen
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Kontext lädt */}
      {kontextLaedt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl px-6 py-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" /> Lade Kundendaten…
          </div>
        </div>
      )}

      {/* Merge-Detail */}
      {aktivesPaar && kontext && (
        <MergeDetail
          kontext={kontext}
          benutzer={benutzer}
          onAbbrechen={() => {
            setAktivesPaar(null);
            setKontext(null);
          }}
          onMergeFertig={() => onMergeFertig(aktivesPaar.id)}
        />
      )}
    </div>
  );
};

export default DuplikatMergeTool;
