import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Play, RefreshCw, FileWarning } from 'lucide-react';
import {
  berechneStornoMigrationsPlan,
  ermittleSaisonsMitStornos,
  fuehreStornoMigrationAus,
  type StornoMigrationsPlan,
  type StornoMigrationEintrag,
  type MigrationsErgebnis,
} from '../../services/stornoMigrationService';

interface Props {
  onClose: () => void;
}

type Phase = 'auswahl' | 'plan' | 'ausfuehrung' | 'ergebnis';

/**
 * Admin-Dialog für die einmalige Migration von STORNO-*-Nummern auf den RE-Nummernkreis.
 *
 * Drei Schritte:
 *  1. Saison wählen
 *  2. Plan-Vorschau (welche alte STORNO-Nummer wird zu welcher RE-Nummer)
 *  3. Ausführung mit Fortschritts-Anzeige + Abschlussbericht
 *
 * GoBD-Hinweis: Alte PDFs bleiben im Storage erhalten. Aktualisiert werden nur die
 * Metadaten und das aktuelle dateiId-Verweis auf die neu generierte PDF.
 */
const StornoMigrationDialog = ({ onClose }: Props) => {
  const [phase, setPhase] = useState<Phase>('auswahl');
  const [verfuegbareSaisons, setVerfuegbareSaisons] = useState<number[]>([]);
  const [saison, setSaison] = useState<number | null>(null);
  const [plan, setPlan] = useState<StornoMigrationsPlan | null>(null);
  const [planLaedt, setPlanLaedt] = useState(false);
  const [aktuellerEintrag, setAktuellerEintrag] = useState<StornoMigrationEintrag | null>(null);
  const [fortschritt, setFortschritt] = useState<{ index: number; gesamt: number }>({ index: 0, gesamt: 0 });
  const [ergebnisse, setErgebnisse] = useState<MigrationsErgebnis[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    ermittleSaisonsMitStornos()
      .then((s) => {
        if (!aktiv) return;
        setVerfuegbareSaisons(s);
        if (s.length > 0) setSaison(s[s.length - 1]); // neueste Saison vorausgewählt
      })
      .catch((e) => setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, []);

  const planBerechnen = async () => {
    if (saison === null) return;
    setPlanLaedt(true);
    setFehler(null);
    try {
      const p = await berechneStornoMigrationsPlan(saison);
      setPlan(p);
      setPhase('plan');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanLaedt(false);
    }
  };

  const migrationStarten = async () => {
    if (!plan) return;
    setPhase('ausfuehrung');
    setFortschritt({ index: 0, gesamt: plan.eintraege.length });

    const result = await fuehreStornoMigrationAus(plan, ({ index, gesamt, aktuell }) => {
      setFortschritt({ index, gesamt });
      setAktuellerEintrag(aktuell);
    });

    setErgebnisse(result);
    setPhase('ergebnis');
  };

  const anzahlErfolg = ergebnisse.filter((e) => e.status === 'erfolg').length;
  const anzahlFehler = ergebnisse.filter((e) => e.status === 'fehler').length;
  const anzahlUebersprungen = ergebnisse.filter((e) => e.status === 'uebersprungen').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <FileWarning className="w-6 h-6 text-orange-500" />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                Storno-Nummern auf RE-Kreis migrieren
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Einmalige Aktion: bestehende STORNO-*-Dokumente bekommen reguläre RE-Nummern
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'ausfuehrung'}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {fehler && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              ❌ {fehler}
            </div>
          )}

          {phase === 'auswahl' && (
            <Auswahl
              verfuegbareSaisons={verfuegbareSaisons}
              saison={saison}
              setSaison={setSaison}
              planLaedt={planLaedt}
              planBerechnen={planBerechnen}
            />
          )}

          {phase === 'plan' && plan && (
            <PlanVorschau
              plan={plan}
              onZurueck={() => setPhase('auswahl')}
              onStart={migrationStarten}
            />
          )}

          {phase === 'ausfuehrung' && (
            <Ausfuehrung fortschritt={fortschritt} aktuellerEintrag={aktuellerEintrag} />
          )}

          {phase === 'ergebnis' && (
            <ErgebnisBericht
              ergebnisse={ergebnisse}
              anzahlErfolg={anzahlErfolg}
              anzahlFehler={anzahlFehler}
              anzahlUebersprungen={anzahlUebersprungen}
              onSchliessen={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Sub-Komponenten
// ----------------------------------------------------------------------------

const Auswahl = ({
  verfuegbareSaisons,
  saison,
  setSaison,
  planLaedt,
  planBerechnen,
}: {
  verfuegbareSaisons: number[];
  saison: number | null;
  setSaison: (n: number) => void;
  planLaedt: boolean;
  planBerechnen: () => void;
}) => (
  <div className="space-y-6">
    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-orange-800 dark:text-orange-200 space-y-2">
          <p>
            <strong>Hinweis vor der Migration:</strong> Diese Aktion vergibt für bestehende Storno-Dokumente
            (Format <code>STORNO-2026-XXXX</code>) neue reguläre RE-Nummern und generiert die zugehörigen PDFs neu.
          </p>
          <p>
            Alte PDFs bleiben im Storage erhalten (GoBD). Der Vorgang ist nicht rückgängig zu machen.
            Erstelle vorher ein Backup, falls möglich.
          </p>
        </div>
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
        Saisonjahr auswählen
      </label>
      {verfuegbareSaisons.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Keine Stornorechnungen gefunden — Migration nicht erforderlich.
        </p>
      ) : (
        <select
          value={saison ?? ''}
          onChange={(e) => setSaison(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          {verfuegbareSaisons.map((j) => (
            <option key={j} value={j}>
              Saison {j}
            </option>
          ))}
        </select>
      )}
    </div>

    <div className="flex justify-end">
      <button
        onClick={planBerechnen}
        disabled={saison === null || planLaedt}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {planLaedt ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Plan erstellen (Dry-Run)
      </button>
    </div>
  </div>
);

const PlanVorschau = ({
  plan,
  onZurueck,
  onStart,
}: {
  plan: StornoMigrationsPlan;
  onZurueck: () => void;
  onStart: () => void;
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      <KennzahlBox label="Zu migrierende Stornos" wert={plan.eintraege.length} farbe="blue" />
      <KennzahlBox label="Bereits im RE-Kreis" wert={plan.bereitsMigriert} farbe="green" />
      <KennzahlBox label="Übrige offene Lücken" wert={plan.ungeloesteLuecken.length} farbe="gray" />
    </div>

    {plan.eintraege.length === 0 ? (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        <p className="text-sm text-green-800 dark:text-green-200">
          Alle Stornos für Saison {plan.saison} sind bereits im RE-Nummernkreis — nichts zu tun.
        </p>
      </div>
    ) : (
      <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Alte Nummer</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Neue Nummer</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Storno zu</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Erstellt am</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700 max-h-96 overflow-y-auto block">
            {plan.eintraege.map((e) => (
              <tr key={e.storno.$id} className="block lg:table-row">
                <td className="px-4 py-2 font-mono text-xs">{e.alteNummer}</td>
                <td className="px-4 py-2 font-mono text-xs font-bold text-green-700 dark:text-green-400">→ {e.neueNummer}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-slate-400">{e.originalRechnungsnummer}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-slate-400">
                  {e.storno.$createdAt ? new Date(e.storno.$createdAt).toLocaleDateString('de-DE') : '–'}
                </td>
                <td className="px-4 py-2 text-xs">
                  {e.konflikt ? (
                    <span className="text-orange-600 dark:text-orange-400" title={e.konflikt}>
                      ⚠️ {e.konflikt}
                    </span>
                  ) : (
                    <span className="text-gray-500 dark:text-slate-400">bereit</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div className="flex justify-between">
      <button
        onClick={onZurueck}
        className="px-4 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
      >
        Zurück
      </button>
      <button
        onClick={onStart}
        disabled={plan.eintraege.length === 0}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Play className="w-4 h-4" />
        Migration jetzt ausführen ({plan.eintraege.length})
      </button>
    </div>
  </div>
);

const Ausfuehrung = ({
  fortschritt,
  aktuellerEintrag,
}: {
  fortschritt: { index: number; gesamt: number };
  aktuellerEintrag: StornoMigrationEintrag | null;
}) => {
  const prozent = fortschritt.gesamt > 0 ? Math.round((fortschritt.index / fortschritt.gesamt) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
        <div>
          <p className="font-medium text-gray-900 dark:text-slate-100">
            Migration läuft — bitte nicht schließen
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {fortschritt.index} von {fortschritt.gesamt} verarbeitet
          </p>
        </div>
      </div>

      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all"
          style={{ width: `${prozent}%` }}
        />
      </div>

      {aktuellerEintrag && (
        <div className="text-sm text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 font-mono">
          {aktuellerEintrag.alteNummer} → {aktuellerEintrag.neueNummer}
        </div>
      )}
    </div>
  );
};

const ErgebnisBericht = ({
  ergebnisse,
  anzahlErfolg,
  anzahlFehler,
  anzahlUebersprungen,
  onSchliessen,
}: {
  ergebnisse: MigrationsErgebnis[];
  anzahlErfolg: number;
  anzahlFehler: number;
  anzahlUebersprungen: number;
  onSchliessen: () => void;
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      <KennzahlBox label="Erfolgreich" wert={anzahlErfolg} farbe="green" />
      <KennzahlBox label="Übersprungen" wert={anzahlUebersprungen} farbe="orange" />
      <KennzahlBox label="Fehler" wert={anzahlFehler} farbe="red" />
    </div>

    {(anzahlFehler > 0 || anzahlUebersprungen > 0) && (
      <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Alte Nummer</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Fehler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {ergebnisse
              .filter((e) => e.status !== 'erfolg')
              .map((e) => (
                <tr key={e.storno.$id}>
                  <td className="px-4 py-2 font-mono text-xs">{e.alteNummer}</td>
                  <td className="px-4 py-2 text-xs">
                    {e.status === 'fehler' ? (
                      <span className="text-red-600 dark:text-red-400">❌ Fehler</span>
                    ) : (
                      <span className="text-orange-600 dark:text-orange-400">⚠️ Übersprungen</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-slate-400">{e.fehler ?? '–'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    )}

    <div className="flex justify-end">
      <button
        onClick={onSchliessen}
        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
      >
        Schließen
      </button>
    </div>
  </div>
);

const FARB_KLASSEN: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300' },
  gray: { bg: 'bg-gray-50 dark:bg-slate-900/50', text: 'text-gray-700 dark:text-slate-300' },
};

const KennzahlBox = ({ label, wert, farbe }: { label: string; wert: number; farbe: string }) => {
  const klassen = FARB_KLASSEN[farbe] ?? FARB_KLASSEN.gray;
  return (
    <div className={`${klassen.bg} rounded-lg p-4`}>
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${klassen.text}`}>{wert}</p>
    </div>
  );
};

export default StornoMigrationDialog;
