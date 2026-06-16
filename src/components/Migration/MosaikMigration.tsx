import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Sparkles, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { mosaikMigrationService } from '../../services/mosaikMigrationService';
import { saisonplanungService } from '../../services/saisonplanungService';
import {
  berechneMatchesLokal,
  SCHWELLE_AUTO_MATCH,
} from '../../services/mosaikMatchingService';
import { mosaikApplyService } from '../../services/mosaikApplyService';
import { MigrationKandidat, MigrationStatus } from '../../types/mosaik';
import { SaisonKunde } from '../../types/saisonplanung';
import MosaikImportPanel from './MosaikImportPanel';
import MosaikKandidatenTabelle from './MosaikKandidatenTabelle';
import MosaikKandidatDetail from './MosaikKandidatDetail';

const STATUS_FOLGE: MigrationStatus[] = [
  'neu',
  'auto_match',
  'review',
  'bestaetigt',
  'angelegt',
  'uebersprungen',
  'fehler',
];

const STATUS_LABEL: Record<MigrationStatus, string> = {
  neu: 'Neu',
  auto_match: 'Auto-Match',
  review: 'Prüfen',
  bestaetigt: 'Bestätigt',
  angelegt: 'Angelegt',
  uebersprungen: 'Übersprungen',
  fehler: 'Fehler',
};

export default function MosaikMigration() {
  const { user } = useAuth();
  const [kandidaten, setKandidaten] = useState<MigrationKandidat[]>([]);
  const [crmKunden, setCrmKunden] = useState<SaisonKunde[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [matchingLauft, setMatchingLauft] = useState(false);
  const [bulkLauft, setBulkLauft] = useState(false);
  const [importPanelOffen, setImportPanelOffen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const bearbeiter = user?.name || user?.email || 'unbekannt';

  const crmKundenById = useMemo(() => {
    return new Map(crmKunden.map((k) => [k.id, k]));
  }, [crmKunden]);

  const ladeAlles = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [k, crm] = await Promise.all([
        mosaikMigrationService.loadAlle(),
        saisonplanungService.loadAlleKunden(),
      ]);
      setKandidaten(k);
      setCrmKunden(crm);
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e);
      setFehler(meldung);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ladeAlles();
  }, [ladeAlles]);

  const counters = useMemo(() => {
    const counts: Record<MigrationStatus, number> = {
      neu: 0,
      auto_match: 0,
      review: 0,
      bestaetigt: 0,
      angelegt: 0,
      uebersprungen: 0,
      fehler: 0,
    };
    kandidaten.forEach((k) => {
      counts[k.status] = (counts[k.status] ?? 0) + 1;
    });
    return counts;
  }, [kandidaten]);

  async function matchingNeuBerechnen() {
    if (crmKunden.length === 0) {
      toast.warning('Keine CRM-Kunden geladen — kann nicht matchen');
      return;
    }
    if (kandidaten.length === 0) {
      toast.warning('Keine Kandidaten zum Matchen');
      return;
    }
    setMatchingLauft(true);
    try {
      const ergebnisse = berechneMatchesLokal(kandidaten, crmKunden);
      let geaendert = 0;
      for (const e of ergebnisse) {
        const k = kandidaten.find((x) => x.id === e.kandidatId);
        if (!k) continue;
        await mosaikMigrationService.update(e.kandidatId, {
          status: e.neuStatus,
          matchKundeId: e.matchKundeId,
          matchScore: e.matchScore,
          data: {
            ...k.data,
            feldDiff: e.feldDiff,
            matchBegruendung: e.matchBegruendung,
          },
        });
        geaendert++;
      }
      toast.success(`${geaendert} Kandidaten neu bewertet`);
      await ladeAlles();
    } catch (e) {
      console.error(e);
      toast.error('Matching fehlgeschlagen');
    } finally {
      setMatchingLauft(false);
    }
  }

  async function bulkAutoMatchBestaetigen() {
    const zuBestaetigen = kandidaten.filter(
      (k) => k.status === 'auto_match' && (k.matchScore ?? 0) >= 0.9
    );
    if (zuBestaetigen.length === 0) {
      toast.info('Keine Auto-Matches ab 90 % offen');
      return;
    }
    if (!window.confirm(`${zuBestaetigen.length} Auto-Matches als bestätigt markieren? (kein CRM-Schreibvorgang)`)) {
      return;
    }
    setBulkLauft(true);
    try {
      for (const k of zuBestaetigen) {
        await mosaikMigrationService.setStatus(k.id, 'bestaetigt', bearbeiter);
      }
      toast.success(`${zuBestaetigen.length} bestätigt`);
      await ladeAlles();
    } catch (e) {
      console.error(e);
      toast.error('Bulk-Bestätigen fehlgeschlagen');
    } finally {
      setBulkLauft(false);
    }
  }

  /**
   * Schreibt bestätigte Auto-Matches automatisch nach CRM.
   * Es werden nur LEERE CRM-Felder mit Mosaik-Werten ergänzt — niemals
   * überschrieben (siehe `FeldDiffEintrag.empfehlung`).
   */
  async function bulkBestaetigteAnwenden() {
    const zuSchreiben = kandidaten.filter((k) => k.status === 'bestaetigt' && k.matchKundeId);
    if (zuSchreiben.length === 0) {
      toast.info('Keine bestätigten Kandidaten zum Anwenden');
      return;
    }
    if (
      !window.confirm(
        `${zuSchreiben.length} bestätigte Matches in CRM schreiben?\n\n` +
          '• Nur LEERE CRM-Felder werden mit Mosaik-Werten gefüllt.\n' +
          '• Bestehende CRM-Werte bleiben unverändert.\n' +
          '• Mosaik-Ansprechpartner werden hinzugefügt.'
      )
    ) {
      return;
    }
    setBulkLauft(true);
    let erfolge = 0;
    let fehler = 0;
    try {
      for (const k of zuSchreiben) {
        const crm = crmKundenById.get(k.matchKundeId!);
        if (!crm) {
          fehler++;
          continue;
        }
        // Default-Patch: nur Felder ergänzen, die im CRM leer sind
        const m = k.data.rohdaten;
        const patch: Partial<SaisonKunde> = {};
        const rNeu = { ...(crm.rechnungsadresse ?? { strasse: '', plz: '', ort: '', bundesland: '' }) };
        const lNeu = { ...(crm.lieferadresse ?? rNeu) };
        let adresseGeaendert = false;
        if (!crm.email && m.Kommunikation) patch.email = m.Kommunikation.trim();
        // Notizen werden immer angehängt, nicht überschrieben — kein Verlust
        if (m.Info) {
          const mosaikNotiz = m.Info.trim();
          const crmNotiz = (crm.notizen ?? '').trim();
          if (crmNotiz && !crmNotiz.includes(mosaikNotiz)) {
            patch.notizen = `${crmNotiz}\n\n[Mosaik] ${mosaikNotiz}`;
          } else if (!crmNotiz) {
            patch.notizen = mosaikNotiz;
          }
        }
        if (!crm.kundennummer && m.Nummer) patch.kundennummer = m.Nummer;
        if (!rNeu.strasse && m.Straße) {
          rNeu.strasse = m.Straße.trim();
          lNeu.strasse = m.Straße.trim();
          adresseGeaendert = true;
        }
        if (!rNeu.plz && m.PLZ) {
          rNeu.plz = m.PLZ.trim();
          lNeu.plz = m.PLZ.trim();
          adresseGeaendert = true;
        }
        if (!rNeu.ort && m.Ort) {
          rNeu.ort = m.Ort.trim();
          lNeu.ort = m.Ort.trim();
          adresseGeaendert = true;
        }
        if (adresseGeaendert) {
          patch.rechnungsadresse = rNeu;
          patch.lieferadresse = lNeu;
        }
        const ergebnis = await mosaikApplyService.applyZusammenfuehren(
          k,
          {
            kundeId: crm.id,
            patch,
            neueKontakte: k.data.ansprechpartner,
          },
          bearbeiter
        );
        if (ergebnis.fehler) fehler++;
        else erfolge++;
      }
      toast.success(`${erfolge} angewendet, ${fehler} Fehler`);
      await ladeAlles();
    } finally {
      setBulkLauft(false);
    }
  }

  const selected = selectedId ? kandidaten.find((k) => k.id === selectedId) ?? null : null;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <Database className="w-6 h-6 text-red-600" />
            Mosaik-Migration
          </h1>
          <p className="text-sm text-gray-600 dark:text-dark-textMuted mt-1 max-w-2xl">
            Altsystem (MS-Access) → neues CRM. Für jeden Mosaik-Kunden wird ein passender
            CRM-Eintrag gesucht und entweder zusammengeführt oder neu angelegt. Nichts wird
            automatisch überschrieben.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setImportPanelOffen((v) => !v)}
            className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {importPanelOffen ? 'Import-Panel ausblenden' : 'Import-Panel zeigen'}
          </button>
          <button
            onClick={ladeAlles}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Neu laden
          </button>
        </div>
      </header>

      {importPanelOffen && <MosaikImportPanel onImportFertig={ladeAlles} />}

      {/* Counter */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {STATUS_FOLGE.map((s) => (
          <div
            key={s}
            className="px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 text-center"
          >
            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {STATUS_LABEL[s]}
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-dark-text">
              {counters[s]}
            </div>
          </div>
        ))}
      </div>

      {/* Aktionen */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <button
          onClick={matchingNeuBerechnen}
          disabled={matchingLauft || crmKunden.length === 0 || kandidaten.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40"
        >
          {matchingLauft ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Matching neu berechnen
        </button>
        <button
          onClick={bulkAutoMatchBestaetigen}
          disabled={bulkLauft}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
        >
          Auto-Matches (≥{Math.round(SCHWELLE_AUTO_MATCH * 100)} % &amp; ≥90&nbsp;%) bestätigen
        </button>
        <button
          onClick={bulkBestaetigteAnwenden}
          disabled={bulkLauft}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {bulkLauft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Bestätigte in CRM anwenden
        </button>
        <div className="ml-auto text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5" />
          CRM-Werte werden nie überschrieben — nur leere Felder ergänzt.
        </div>
      </div>

      {fehler && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Fehler beim Laden</div>
            <div>{fehler}</div>
            <div className="mt-1 text-xs">
              Wurde die Collection `migration_kandidaten` bereits angelegt? <br />
              Falls nicht: <code className="font-mono">npm run setup:mosaik-migration</code> ausführen.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Lade Kandidaten …
        </div>
      ) : kandidaten.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700">
          Noch keine Kandidaten in der Staging-Collection. Importiere die Mosaik-JSONs oben.
        </div>
      ) : (
        <MosaikKandidatenTabelle
          kandidaten={kandidaten}
          crmKundenById={crmKundenById}
          onOpen={setSelectedId}
        />
      )}

      {selected && (
        <MosaikKandidatDetail
          kandidat={selected}
          crmKunden={crmKunden}
          crmKundenById={crmKundenById}
          bearbeiter={bearbeiter}
          onClose={() => setSelectedId(null)}
          onSaved={async () => {
            setSelectedId(null);
            await ladeAlles();
          }}
        />
      )}
    </div>
  );
}
