import { useState } from 'react';
import {
  Sparkles,
  Play,
  FlaskConical,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  mosaikPipelineService,
  PipelineBilanz,
  PipelineFortschritt,
} from '../../services/mosaikPipelineService';

interface Props {
  bearbeiter?: string;
  onFertig: () => void;
}

const PHASEN: Record<PipelineFortschritt['phase'], string> = {
  lade: 'Lade Kandidaten & CRM-Kunden',
  klassifiziere: 'Klassifiziere (deterministisch + Fuzzy)',
  ki: 'KI-Bewertung im Graubereich (Sonnet 4)',
  apply: 'Schreibe ins CRM',
  fertig: 'Fertig',
};

export default function MosaikPipelinePanel({ bearbeiter, onFertig }: Props) {
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState<PipelineFortschritt | null>(null);
  const [bilanz, setBilanz] = useState<PipelineBilanz | null>(null);
  const [letzterModus, setLetzterModus] = useState<'dry-run' | 'echt' | null>(null);
  const [limit, setLimit] = useState<number>(0);
  const [inaktiveUeberspringen, setInaktiveUeberspringen] = useState(true);

  async function starte(modus: 'dry-run' | 'echt') {
    if (modus === 'echt') {
      const ok = window.confirm(
        'Pipeline ECHT durchlaufen?\n\n' +
          '• Sichere Matches werden gemerged (nur leere CRM-Felder ergänzt, Notizen angehängt).\n' +
          '• Klare Neuanlagen werden im CRM angelegt.\n' +
          '• Grenzfälle landen in der Review-Queue.\n\n' +
          'Du kannst die Tabelle anschließend filtern.'
      );
      if (!ok) return;
    }

    setLaeuft(true);
    setBilanz(null);
    setLetzterModus(modus);
    try {
      const result = await mosaikPipelineService.run({
        modus,
        bearbeiter,
        inaktiveUeberspringen,
        limit: limit > 0 ? limit : undefined,
        onProgress: (f) => {
          setFortschritt({ ...f, bilanz: { ...f.bilanz } });
        },
      });
      setBilanz(result.bilanz);
      toast.success(
        modus === 'dry-run'
          ? `Trockendurchlauf fertig: ${result.bilanz.gesamt} Kandidaten analysiert`
          : `Pipeline fertig: ${result.bilanz.apply?.gemerged ?? 0} gemerged, ${result.bilanz.apply?.angelegt ?? 0} neu, ${result.bilanz.nachAktion.review_queue} in Review`
      );
      onFertig();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Pipeline fehlgeschlagen: ${msg}`);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/10 dark:to-red-900/10 rounded-xl border border-orange-200 dark:border-orange-800 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-600" />
            Automatik-Pipeline
          </h2>
          <p className="text-sm text-gray-700 dark:text-dark-textMuted mt-1 max-w-3xl">
            Klassifiziert alle Kandidaten (deterministisch + Fuzzy + KI im
            Graubereich) und wendet sichere Entscheidungen ans CRM an. Grenzfälle
            landen in der Review-Queue. <strong>CRM-Werte werden nie überschrieben.</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={inaktiveUeberspringen}
            onChange={(e) => setInaktiveUeberspringen(e.target.checked)}
            disabled={laeuft}
            className="rounded"
          />
          Mosaik-inaktive überspringen
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          Pilot-Limit (0 = alle):
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value || '0', 10))}
            disabled={laeuft}
            className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </label>
        <div className="flex-1" />
        <button
          onClick={() => starte('dry-run')}
          disabled={laeuft}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium disabled:opacity-40"
        >
          {laeuft && letzterModus === 'dry-run' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FlaskConical className="w-4 h-4" />
          )}
          Trockendurchlauf
        </button>
        <button
          onClick={() => starte('echt')}
          disabled={laeuft}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 text-white font-medium hover:from-red-700 hover:to-orange-700 disabled:opacity-40 shadow"
        >
          {laeuft && letzterModus === 'echt' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Echt durchlaufen
        </button>
      </div>

      {fortschritt && (
        <div className="bg-white dark:bg-dark-surface rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {PHASEN[fortschritt.phase]}
            </span>
            <span className="font-mono text-xs text-gray-500">
              {fortschritt.verarbeitet} / {fortschritt.gesamt}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all"
              style={{
                width: `${fortschritt.gesamt > 0 ? (fortschritt.verarbeitet / fortschritt.gesamt) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {bilanz && (
        <BilanzAnzeige bilanz={bilanz} modus={letzterModus ?? 'dry-run'} />
      )}
    </div>
  );
}

function BilanzAnzeige({ bilanz, modus }: { bilanz: PipelineBilanz; modus: 'dry-run' | 'echt' }) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3 text-sm">
      <div className="flex items-center gap-2 text-gray-900 dark:text-dark-text font-semibold">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        Bilanz ({modus === 'dry-run' ? 'Trockendurchlauf' : 'Echt durchgelaufen'})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Kachel label="Gesamt" wert={bilanz.gesamt} />
        <Kachel label="Sicher (≥95 %)" wert={bilanz.sicherMatch} farbe="emerald" />
        <Kachel label="Wahrscheinlich" wert={bilanz.wahrscheinlichMatch} farbe="emerald" />
        <Kachel label="Graubereich → KI" wert={bilanz.graubereich} farbe="amber" />
        <Kachel label="Klare Neuanlage" wert={bilanz.klareNeuanlage} farbe="sky" />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
          <Bot className="w-3.5 h-3.5" />
          Aktion nach KI
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kachel label="Auto-Merge" wert={bilanz.nachAktion.auto_merge} farbe="emerald" />
          <Kachel label="Auto-Anlegen" wert={bilanz.nachAktion.auto_anlegen} farbe="sky" />
          <Kachel label="Review (Mensch)" wert={bilanz.nachAktion.review_queue} farbe="amber" />
          <Kachel label="Bereits erledigt" wert={bilanz.bereitsErledigt} farbe="gray" />
        </div>
      </div>

      {bilanz.ki.aufrufe > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 text-xs text-gray-700 dark:text-gray-300 flex flex-wrap gap-x-4">
          <span>KI-Aufrufe: {bilanz.ki.aufrufe}</span>
          <span>Match: {bilanz.ki.match}</span>
          <span>kein Match: {bilanz.ki.keinMatch}</span>
          {bilanz.ki.fehler > 0 && (
            <span className="text-red-600 dark:text-red-400">
              Fehler: {bilanz.ki.fehler}
            </span>
          )}
        </div>
      )}

      {bilanz.apply && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            CRM-Schreibvorgänge
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Kachel label="Gemerged" wert={bilanz.apply.gemerged} farbe="emerald" />
            <Kachel label="Neu angelegt" wert={bilanz.apply.angelegt} farbe="sky" />
            <Kachel
              label="Fehler"
              wert={bilanz.apply.fehler}
              farbe={bilanz.apply.fehler > 0 ? 'red' : 'gray'}
            />
          </div>
          {bilanz.apply.fehlerListe.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Fehler-Details ({bilanz.apply.fehlerListe.length})
              </summary>
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {bilanz.apply.fehlerListe.map((e, i) => (
                  <li
                    key={i}
                    className="text-xs font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded"
                  >
                    <strong>{e.kurzname}:</strong> {e.meldung}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Kachel({
  label,
  wert,
  farbe = 'gray',
}: {
  label: string;
  wert: number;
  farbe?: 'gray' | 'emerald' | 'amber' | 'sky' | 'red';
}) {
  const farbKlassen = {
    gray: 'bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100',
    emerald:
      'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300',
    amber:
      'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300',
    sky: 'bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300',
  }[farbe];
  return (
    <div className={`rounded-lg px-3 py-2 ${farbKlassen}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold">{wert}</div>
    </div>
  );
}
