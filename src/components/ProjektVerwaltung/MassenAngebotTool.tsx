import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Calculator,
  Send,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FlaskConical,
  Play,
  X,
  Mail,
  Loader2,
  History,
  ShieldAlert,
  Undo2,
  Filter as FilterIcon,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { massenAngebotService } from '../../services/massenAngebotService';
import {
  MassenAngebotKandidat,
  AngebotsQuelle,
  KandidatStatus,
  ErzeugungsErgebnis,
  VersandKandidat,
  AngebotsLauf,
} from '../../types/massenAngebot';

const QUELLE_LABEL: Record<AngebotsQuelle, string> = {
  vorjahr: 'Vorjahr',
  mosaik: 'Mosaik/Historie',
  plz_kalkulation: 'PLZ-Kalkulation',
  manuell: '—',
};

const STATUS_BADGE: Record<KandidatStatus, { label: string; className: string }> = {
  neu: { label: 'neu', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  existiert: {
    label: 'existiert bereits',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  fehler: { label: 'Fehler/prüfen', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  manuell: {
    label: 'manuell prüfen',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

type FilterTyp = 'alle' | 'vorjahr' | 'neukunden' | 'fehler' | 'manuell';

const eur = (wert: number) =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

// Eine Tabellenzeile (memoisiert über React-Standard-Rerender; bewusst leichtgewichtig gehalten).
const KandidatZeile = ({
  kandidat,
  editierbar,
  onToggle,
  onMengePreis,
}: {
  kandidat: MassenAngebotKandidat;
  editierbar: boolean;
  onToggle: (kundeId: string) => void;
  onMengePreis: (kundeId: string, menge: number, preis: number) => void;
}) => {
  const badge = STATUS_BADGE[kandidat.status];
  return (
    <tr className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800/40">
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={kandidat.ausgewaehlt}
          disabled={kandidat.status !== 'neu'}
          onChange={() => onToggle(kandidat.kundeId)}
          className="h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-slate-600 disabled:opacity-40"
        />
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-gray-900 dark:text-slate-100">{kandidat.kundenname}</div>
        {kandidat.kundennummer && (
          <div className="text-xs text-gray-400">{kandidat.kundennummer}</div>
        )}
        {kandidat.statusGrund && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{kandidat.statusGrund}</div>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 dark:text-slate-400">
        {kandidat.typ === 'platzbauer' ? 'Platzbauer' : 'Verein'}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 dark:text-slate-400">{QUELLE_LABEL[kandidat.quelle]}</td>
      <td className="px-3 py-2 text-right">
        {editierbar ? (
          <input
            type="number"
            value={kandidat.menge || ''}
            min={0}
            step={0.5}
            onChange={(e) => onMengePreis(kandidat.kundeId, Number(e.target.value), kandidat.preisProTonne)}
            className="w-20 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
          />
        ) : (
          <span className="text-gray-500">{kandidat.menge ? `${kandidat.menge} t` : '—'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editierbar ? (
          <input
            type="number"
            value={kandidat.preisProTonne || ''}
            min={0}
            step={0.5}
            onChange={(e) => onMengePreis(kandidat.kundeId, kandidat.menge, Number(e.target.value))}
            className="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
          />
        ) : (
          <span className="text-gray-500">{kandidat.preisProTonne ? eur(kandidat.preisProTonne) : '—'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-slate-100">
        {kandidat.angebotssumme ? eur(kandidat.angebotssumme) : '—'}
      </td>
      <td className="px-3 py-2 text-sm">
        {kandidat.empfaengerEmail ? (
          <span className="text-gray-600 dark:text-slate-400">{kandidat.empfaengerEmail}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> fehlt
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        {kandidat.fehler.length > 0 && (
          <div className="text-xs text-red-500 mt-0.5">{kandidat.fehler.join(', ')}</div>
        )}
      </td>
    </tr>
  );
};

const MassenAngebotTool = ({ saisonjahr }: { saisonjahr: number }) => {
  const { user, isAdmin } = useAuth();
  const istTestumgebung = useMemo(() => massenAngebotService.istTestumgebung(), []);

  const [kandidaten, setKandidaten] = useState<MassenAngebotKandidat[]>([]);
  const [loading, setLoading] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [fehlerMeldung, setFehlerMeldung] = useState<string | null>(null);

  const [testModus, setTestModus] = useState(true);
  const [filter, setFilter] = useState<FilterTyp>('alle');

  const [anpassungsTyp, setAnpassungsTyp] = useState<'prozent' | 'fix'>('prozent');
  const [anpassungsWert, setAnpassungsWert] = useState('');

  const [limit, setLimit] = useState('');
  const [erzeugeBestaetigung, setErzeugeBestaetigung] = useState(false);
  const [erzeugung, setErzeugung] = useState<{ done: number; total: number; aktuell: string } | null>(null);
  const [ergebnis, setErgebnis] = useState<ErzeugungsErgebnis | null>(null);

  const [rollbackBestaetigung, setRollbackBestaetigung] = useState(false);
  const [rollbackInfo, setRollbackInfo] = useState<string | null>(null);
  const [rollbackLaeuft, setRollbackLaeuft] = useState(false);

  const [versandKandidaten, setVersandKandidaten] = useState<VersandKandidat[] | null>(null);
  const [versandBestaetigung, setVersandBestaetigung] = useState(false);
  const [versand, setVersand] = useState<{ done: number; total: number; aktuell: string } | null>(null);
  const [versandErgebnis, setVersandErgebnis] = useState<{
    gesendet: number;
    fehler: { kundenname: string; fehler: string }[];
  } | null>(null);

  const [laeufe, setLaeufe] = useState<AngebotsLauf[]>([]);

  const benutzer = (user as { name?: string; email?: string } | null)?.name
    || (user as { name?: string; email?: string } | null)?.email;

  const ladeLaeufe = useCallback(async () => {
    setLaeufe(await massenAngebotService.ladeLaeufe(saisonjahr));
  }, [saisonjahr]);

  const ladeKandidaten = useCallback(async () => {
    setLoading(true);
    setFehlerMeldung(null);
    try {
      const liste = await massenAngebotService.sammleKandidaten(saisonjahr);
      setKandidaten(liste);
      setGeladen(true);
      await ladeLaeufe();
    } catch (error) {
      console.error('Fehler beim Sammeln der Kandidaten:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [saisonjahr, ladeLaeufe]);

  useEffect(() => {
    void ladeLaeufe();
  }, [ladeLaeufe]);

  const zusammenfassung = useMemo(
    () => massenAngebotService.berechneZusammenfassung(kandidaten),
    [kandidaten]
  );

  const gefiltert = useMemo(() => {
    switch (filter) {
      case 'vorjahr':
        return kandidaten.filter((k) => k.quelle === 'vorjahr');
      case 'neukunden':
        return kandidaten.filter((k) => k.quelle === 'plz_kalkulation' || k.quelle === 'mosaik');
      case 'fehler':
        return kandidaten.filter((k) => k.status === 'fehler');
      case 'manuell':
        return kandidaten.filter((k) => k.status === 'manuell' || k.status === 'existiert');
      default:
        return kandidaten;
    }
  }, [kandidaten, filter]);

  const ausgewaehlteNeu = useMemo(
    () => kandidaten.filter((k) => k.status === 'neu' && k.ausgewaehlt),
    [kandidaten]
  );

  const handleToggle = useCallback((kundeId: string) => {
    setKandidaten((prev) =>
      prev.map((k) => (k.kundeId === kundeId && k.status === 'neu' ? { ...k, ausgewaehlt: !k.ausgewaehlt } : k))
    );
  }, []);

  const handleMengePreis = useCallback((kundeId: string, menge: number, preis: number) => {
    setKandidaten((prev) =>
      prev.map((k) =>
        k.kundeId === kundeId ? massenAngebotService.aktualisiereMengePreis(k, menge, preis) : k
      )
    );
  }, []);

  const handlePreisanpassung = useCallback(() => {
    const wert = Number(anpassungsWert);
    if (!Number.isFinite(wert) || wert === 0) return;
    setKandidaten((prev) =>
      massenAngebotService.wendePreisanpassungAn(prev, { typ: anpassungsTyp, wert })
    );
  }, [anpassungsTyp, anpassungsWert]);

  const limitZahl = limit ? Math.max(0, Math.floor(Number(limit))) : 0;
  const anzahlZuErzeugen = limitZahl > 0 ? Math.min(limitZahl, ausgewaehlteNeu.length) : ausgewaehlteNeu.length;

  const bestaetigeErzeugung = useCallback(async () => {
    setErzeugeBestaetigung(false);
    setErgebnis(null);
    setErzeugung({ done: 0, total: anzahlZuErzeugen, aktuell: '' });
    try {
      const res = await massenAngebotService.erzeugeBatch(kandidaten, saisonjahr, {
        benutzer,
        limit: limitZahl > 0 ? limitZahl : undefined,
        onFortschritt: (done, total, aktuell) => setErzeugung({ done, total, aktuell }),
      });
      setErgebnis(res);
      // Vorschau neu laden (erzeugte gelten jetzt als "existiert"), Versandliste vorbereiten
      await ladeKandidaten();
      const vk = await massenAngebotService.ladeVersandKandidaten(res.batchId);
      setVersandKandidaten(vk);
    } catch (error) {
      console.error('Fehler bei der Erzeugung:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Erzeugung fehlgeschlagen');
    } finally {
      setErzeugung(null);
    }
  }, [anzahlZuErzeugen, kandidaten, saisonjahr, benutzer, limitZahl, ladeKandidaten]);

  const bestaetigeRollback = useCallback(async () => {
    if (!ergebnis) return;
    setRollbackBestaetigung(false);
    setRollbackLaeuft(true);
    setRollbackInfo(null);
    try {
      const res = await massenAngebotService.rollbackBatch(ergebnis.batchId);
      setRollbackInfo(
        `${res.geloescht} gelöscht, ${res.uebersprungenVersendet} behalten (versendet), ${res.fehler} Fehler.`
      );
      setErgebnis(null);
      setVersandKandidaten(null);
      await ladeKandidaten();
    } catch (error) {
      console.error('Rollback fehlgeschlagen:', error);
      setRollbackInfo(`Rollback fehlgeschlagen: ${error instanceof Error ? error.message : 'Fehler'}`);
    } finally {
      setRollbackLaeuft(false);
    }
  }, [ergebnis, ladeKandidaten]);

  const versandAuswahl = useMemo(
    () => (versandKandidaten ?? []).filter((v) => v.ausgewaehlt && v.empfaengerEmail) ,
    [versandKandidaten]
  );
  const versandAuswahlTest = useMemo(
    () => (versandKandidaten ?? []).filter((v) => v.ausgewaehlt),
    [versandKandidaten]
  );

  const bestaetigeVersand = useCallback(async () => {
    if (!versandKandidaten) return;
    setVersandBestaetigung(false);
    setVersandErgebnis(null);
    // Im Testmodus dürfen auch Zeilen ohne Kunden-E-Mail mit (gehen an Testadresse).
    const liste = testModus ? versandAuswahlTest : versandAuswahl;
    setVersand({ done: 0, total: liste.length, aktuell: '' });
    try {
      const res = await massenAngebotService.versendeBatch(liste, testModus, (done, total, aktuell) =>
        setVersand({ done, total, aktuell })
      );
      setVersandErgebnis(res);
      if (!testModus && ergebnis) {
        const vk = await massenAngebotService.ladeVersandKandidaten(ergebnis.batchId);
        setVersandKandidaten(vk);
      }
    } catch (error) {
      console.error('Versand fehlgeschlagen:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Versand fehlgeschlagen');
    } finally {
      setVersand(null);
    }
  }, [versandKandidaten, testModus, versandAuswahl, versandAuswahlTest, ergebnis]);

  if (!isAdmin) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-amber-800 dark:text-amber-300 flex items-center gap-3">
        <ShieldAlert className="w-6 h-6" />
        Das Massen-Angebots-Tool ist nur für Administratoren verfügbar.
      </div>
    );
  }

  const versandAnzahl = testModus ? versandAuswahlTest.length : versandAuswahl.length;

  return (
    <div className="space-y-5">
      {/* Kopf: Titel + Sicherheitshinweise */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
            <Calculator className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Frühjahrs-Angebote · Saison {saisonjahr}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Erzeugt Angebote für alle Kunden mit „Für automatisches Saison-Angebot".
            </p>
          </div>
        </div>

        {/* Testmodus-Schalter mit klarer Konsequenz */}
        <button
          onClick={() => setTestModus((v) => !v)}
          className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 transition-colors ${
            testModus
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
          }`}
          title="Steuert den E-Mail-Versand"
        >
          <FlaskConical className="w-5 h-5" />
          <span className="font-semibold">Testmodus {testModus ? 'AN' : 'AUS'}</span>
        </button>
      </div>

      {/* Banner Testumgebung / Konsequenz */}
      {istTestumgebung && (
        <div className="bg-purple-100 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 rounded-lg px-4 py-2.5 text-purple-800 dark:text-purple-300 font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> TESTUMGEBUNG – Erzeugung schreibt in die Staging-Datenbank.
        </div>
      )}
      <div
        className={`rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${
          testModus
            ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
        }`}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        {testModus ? (
          <span>
            Testmodus AN: E-Mails gehen <strong>ausschließlich</strong> an die Testadresse
            (jtatwcook@gmail.com), kein Statuswechsel beim Kunden. Die Erzeugung legt echte Projekte an –
            erst nach Bestätigung.
          </span>
        ) : (
          <span>
            Testmodus AUS: E-Mails gehen an <strong>echte Kunden</strong>. Bitte besonders sorgfältig prüfen.
          </span>
        )}
      </div>

      {fehlerMeldung && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5 text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {fehlerMeldung}
        </div>
      )}

      {/* Schritt 1: Vorschau berechnen */}
      {!geladen ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center">
          <p className="text-gray-600 dark:text-slate-400 mb-4">
            Probelauf (Dry-Run): berechnet alle Angebote und zeigt die Vorschau – es wird{' '}
            <strong>nichts</strong> gespeichert.
          </p>
          <button
            onClick={ladeKandidaten}
            disabled={loading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Vorschau berechnen
          </button>
        </div>
      ) : (
        <>
          {/* Zähler + Werkzeuge */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-semibold text-gray-900 dark:text-slate-100">
                {ausgewaehlteNeu.length} werden erzeugt
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600 dark:text-slate-400">{zusammenfassung.existiert} übersprungen</span>
              <span className="text-gray-400">·</span>
              <span className="text-amber-600 dark:text-amber-400">
                {zusammenfassung.fehler + zusammenfassung.manuell} benötigen Prüfung
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{zusammenfassung.gesamt} gesamt</span>
              <button
                onClick={ladeKandidaten}
                disabled={loading}
                className="ml-auto px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Neu berechnen
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 dark:border-slate-700 pt-3">
              {/* Preisanpassung */}
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Preisanpassung:</span>
              <select
                value={anpassungsTyp}
                onChange={(e) => setAnpassungsTyp(e.target.value as 'prozent' | 'fix')}
                className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              >
                <option value="prozent">+/− Prozent</option>
                <option value="fix">fixer €/t</option>
              </select>
              <input
                type="number"
                value={anpassungsWert}
                onChange={(e) => setAnpassungsWert(e.target.value)}
                placeholder={anpassungsTyp === 'prozent' ? 'z.B. 5' : 'z.B. 99.50'}
                className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              />
              <button
                onClick={handlePreisanpassung}
                className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-200"
              >
                Anwenden
              </button>

              {/* Filter */}
              <div className="ml-auto flex items-center gap-2">
                <FilterIcon className="w-4 h-4 text-gray-400" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as FilterTyp)}
                  className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="alle">Alle</option>
                  <option value="vorjahr">Nur Vorjahr</option>
                  <option value="neukunden">Nur Neukunden</option>
                  <option value="fehler">Nur mit Fehlern</option>
                  <option value="manuell">Nur Prüffälle</option>
                </select>
              </div>
            </div>
          </div>

          {/* Vorschau-Tabelle */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900/60 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2">Kunde</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2">Quelle</th>
                    <th className="px-3 py-2 text-right">Menge</th>
                    <th className="px-3 py-2 text-right">Preis/t</th>
                    <th className="px-3 py-2 text-right">Summe</th>
                    <th className="px-3 py-2">E-Mail</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((kandidat) => (
                    <KandidatZeile
                      key={kandidat.kundeId}
                      kandidat={kandidat}
                      editierbar={kandidat.status === 'neu' || kandidat.status === 'fehler'}
                      onToggle={handleToggle}
                      onMengePreis={handleMengePreis}
                    />
                  ))}
                  {gefiltert.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                        Keine Kandidaten für diesen Filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Schritt 2: Erzeugen */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-slate-400">Stufenweise (Limit):</label>
              <input
                type="number"
                value={limit}
                min={0}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="alle"
                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              />
            </div>
            <button
              onClick={() => setErzeugeBestaetigung(true)}
              disabled={anzahlZuErzeugen === 0 || !!erzeugung}
              className="ml-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-5 h-5" /> {anzahlZuErzeugen} Angebote erzeugen
            </button>
          </div>
        </>
      )}

      {/* Fortschritt Erzeugung */}
      {erzeugung && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            Erzeuge {erzeugung.done} von {erzeugung.total}… {erzeugung.aktuell}
          </div>
          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${erzeugung.total ? (erzeugung.done / erzeugung.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Ergebnis Erzeugung + Rollback + Versand-Einstieg */}
      {ergebnis && (
        <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" /> Lauf abgeschlossen
          </div>
          <div className="text-sm text-gray-700 dark:text-slate-300">
            {ergebnis.erzeugt.length} erzeugt · {ergebnis.uebersprungen.length} übersprungen ·{' '}
            {ergebnis.fehler.length} fehlerhaft · Batch <code className="text-xs">{ergebnis.batchId}</code>
          </div>
          {ergebnis.fehler.length > 0 && (
            <div className="text-xs text-red-600 dark:text-red-400 max-h-24 overflow-y-auto">
              {ergebnis.fehler.map((f) => (
                <div key={f.kundeId}>
                  {f.kundenname}: {f.fehler}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={() => setRollbackBestaetigung(true)}
              disabled={rollbackLaeuft || ergebnis.erzeugt.length === 0}
              className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg inline-flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              {rollbackLaeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              Letzten Lauf rückgängig machen
            </button>
            {versandKandidaten && versandKandidaten.length > 0 && (
              <button
                onClick={() => setVersandBestaetigung(true)}
                disabled={!!versand || versandAnzahl === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {versandAnzahl} Angebote versenden
              </button>
            )}
          </div>
          {rollbackInfo && <div className="text-sm text-gray-600 dark:text-slate-400">{rollbackInfo}</div>}
        </div>
      )}

      {/* Fortschritt / Ergebnis Versand */}
      {versand && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            Versende {versand.done} von {versand.total}… {versand.aktuell}
          </div>
          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all"
              style={{ width: `${versand.total ? (versand.done / versand.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {versandErgebnis && (
        <div className="bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-400 mb-1">
            <Mail className="w-4 h-4" /> Versand abgeschlossen
            {testModus && <span className="text-xs font-normal">(Testmodus – nur Testadresse)</span>}
          </div>
          <div className="text-gray-700 dark:text-slate-300">
            {versandErgebnis.gesendet} gesendet · {versandErgebnis.fehler.length} fehlerhaft
          </div>
          {versandErgebnis.fehler.length > 0 && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-h-24 overflow-y-auto">
              {versandErgebnis.fehler.map((f, i) => (
                <div key={i}>
                  {f.kundenname}: {f.fehler}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Protokoll der letzten Läufe */}
      {laeufe.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-slate-300 mb-3">
            <History className="w-4 h-4" /> Protokoll
          </div>
          <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {laeufe.map((lauf) => (
              <div
                key={lauf.id}
                className="flex items-center gap-2 text-gray-600 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700/50 pb-1"
              >
                <span className="text-xs text-gray-400">
                  {new Date(lauf.zeitpunkt).toLocaleString('de-DE')}
                </span>
                <span>Saison {lauf.saisonjahr}</span>
                <span className="text-green-600 dark:text-green-400">{lauf.anzahlErzeugt} erzeugt</span>
                <span>{lauf.anzahlUebersprungen} übersprungen</span>
                {lauf.anzahlFehler > 0 && <span className="text-red-500">{lauf.anzahlFehler} Fehler</span>}
                {lauf.testModus && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                    Testumgebung
                  </span>
                )}
                {lauf.rueckgaengigGemacht && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">rückgängig</span>
                )}
                {lauf.benutzer && <span className="ml-auto text-xs text-gray-400">{lauf.benutzer}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bestätigungsdialog Erzeugung */}
      {erzeugeBestaetigung && (
        <BestaetigungsDialog
          icon={<Play className="w-6 h-6 text-emerald-600" />}
          titel="Angebote erzeugen?"
          onAbbrechen={() => setErzeugeBestaetigung(false)}
          onBestaetigen={bestaetigeErzeugung}
          bestaetigenLabel={`${anzahlZuErzeugen} erzeugen`}
          bestaetigenClass="bg-emerald-600 hover:bg-emerald-700"
        >
          Es werden <strong>{anzahlZuErzeugen}</strong> neue Angebots-Projekte für Saison{' '}
          <strong>{saisonjahr}</strong> angelegt
          {istTestumgebung ? ' (TESTUMGEBUNG)' : ''}. Bestehende Projekte werden nie verändert. Versand
          erfolgt erst später in einem separaten Schritt.
        </BestaetigungsDialog>
      )}

      {/* Bestätigungsdialog Rollback */}
      {rollbackBestaetigung && ergebnis && (
        <BestaetigungsDialog
          icon={<Undo2 className="w-6 h-6 text-red-600" />}
          titel="Lauf rückgängig machen?"
          onAbbrechen={() => setRollbackBestaetigung(false)}
          onBestaetigen={bestaetigeRollback}
          bestaetigenLabel="Endgültig löschen"
          bestaetigenClass="bg-red-600 hover:bg-red-700"
        >
          Alle <strong>{ergebnis.erzeugt.length}</strong> noch nicht versendeten Angebote dieses Laufs werden
          gelöscht. Bereits versendete bleiben erhalten (GoBD).
        </BestaetigungsDialog>
      )}

      {/* Bestätigungsdialog Versand */}
      {versandBestaetigung && (
        <BestaetigungsDialog
          icon={<Send className="w-6 h-6 text-purple-600" />}
          titel={testModus ? 'Test-Versand starten?' : 'E-Mails an echte Kunden senden?'}
          onAbbrechen={() => setVersandBestaetigung(false)}
          onBestaetigen={bestaetigeVersand}
          bestaetigenLabel={`${versandAnzahl} senden`}
          bestaetigenClass={testModus ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'}
        >
          {testModus ? (
            <>
              <strong>{versandAnzahl}</strong> Test-E-Mails gehen ausschließlich an die Testadresse
              (jtatwcook@gmail.com). Kein Statuswechsel beim Kunden.
            </>
          ) : (
            <>
              <strong>{versandAnzahl}</strong> E-Mails gehen an <strong>echte Kunden</strong>. Dieser Schritt
              ist nicht umkehrbar.
            </>
          )}
        </BestaetigungsDialog>
      )}
    </div>
  );
};

// Wiederverwendbarer Bestätigungsdialog mit konkreten Zahlen.
const BestaetigungsDialog = ({
  icon,
  titel,
  children,
  onAbbrechen,
  onBestaetigen,
  bestaetigenLabel,
  bestaetigenClass,
}: {
  icon: React.ReactNode;
  titel: string;
  children: React.ReactNode;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
  bestaetigenLabel: string;
  bestaetigenClass: string;
}) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-gray-100 dark:bg-slate-700 rounded-lg">{icon}</div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text">{titel}</h3>
      </div>
      <div className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{children}</div>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onAbbrechen}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <X className="w-4 h-4 inline mr-1" /> Abbrechen
        </button>
        <button onClick={onBestaetigen} className={`px-4 py-2 text-white rounded-lg ${bestaetigenClass}`}>
          {bestaetigenLabel}
        </button>
      </div>
    </div>
  </div>
);

export default MassenAngebotTool;
