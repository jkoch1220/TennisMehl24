import { useEffect, useState, useRef } from 'react';
import { X, Download, FileArchive, FileSpreadsheet, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  fuehreBulkDownloadAus,
  loestBrowserDownloadAus,
  ermittleSaisonsMitDokumenten,
  zaehleDokumente,
  type BulkDownloadFilter,
  type DownloadDokumentTyp,
  type DownloadStatusFilter,
  type BulkDownloadFortschritt,
  type BulkDownloadErgebnis,
  type AbbruchSignal,
} from '../../services/bulkDownloadService';

interface Props {
  onClose: () => void;
}

type Phase = 'konfiguration' | 'lauft' | 'fertig';

const STANDARD_TYPEN: DownloadDokumentTyp[] = ['rechnung'];
const STANDARD_STATUS: DownloadStatusFilter[] = ['aktiv'];

/**
 * Sammel-Export aller Rechnungs-PDFs einer Saison.
 *
 * Drei Phasen:
 *  1. Konfiguration: Saison, Dokumenttypen, Status — plus Live-Anzahl-Vorschau
 *  2. Lauft: Fortschrittsbalken mit aktuellem Dokumentname + Abbruch
 *  3. Fertig: Ergebnis-Zusammenfassung mit Download-Buttons (ZIP + CSV)
 */
const BulkDownloadDialog = ({ onClose }: Props) => {
  const [phase, setPhase] = useState<Phase>('konfiguration');
  const [saisons, setSaisons] = useState<number[]>([]);
  const [saison, setSaison] = useState<number | null>(null);
  const [typen, setTypen] = useState<DownloadDokumentTyp[]>(STANDARD_TYPEN);
  const [statusFilter, setStatusFilter] = useState<DownloadStatusFilter[]>(STANDARD_STATUS);
  const [anzahlVorschau, setAnzahlVorschau] = useState<number | null>(null);
  const [vorschauLaedt, setVorschauLaedt] = useState(false);
  const [fortschritt, setFortschritt] = useState<BulkDownloadFortschritt>({ index: 0, gesamt: 0 });
  const [ergebnis, setErgebnis] = useState<BulkDownloadErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const abbruchRef = useRef<AbbruchSignal>({ abgebrochen: false });

  useEffect(() => {
    ermittleSaisonsMitDokumenten()
      .then((s) => {
        setSaisons(s);
        if (s.length > 0) setSaison(s[s.length - 1]);
      })
      .catch((e) => setFehler(e instanceof Error ? e.message : String(e)));
  }, []);

  // Vorschau-Anzahl: bei jedem Filter-Wechsel neu ermitteln (debounced via simplem Trigger)
  useEffect(() => {
    if (saison === null || typen.length === 0 || statusFilter.length === 0) {
      setAnzahlVorschau(0);
      return;
    }
    let aktiv = true;
    setVorschauLaedt(true);
    zaehleDokumente({ saisonjahr: saison, dokumentTypen: typen, statusFilter })
      .then((n) => {
        if (aktiv) setAnzahlVorschau(n);
      })
      .catch(() => {
        if (aktiv) setAnzahlVorschau(null);
      })
      .finally(() => {
        if (aktiv) setVorschauLaedt(false);
      });
    return () => {
      aktiv = false;
    };
  }, [saison, typen, statusFilter]);

  const toggleTyp = (typ: DownloadDokumentTyp) => {
    setTypen((prev) => (prev.includes(typ) ? prev.filter((t) => t !== typ) : [...prev, typ]));
  };

  const toggleStatus = (status: DownloadStatusFilter) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const downloadStarten = async () => {
    if (saison === null) return;
    setFehler(null);
    setPhase('lauft');
    abbruchRef.current = { abgebrochen: false };

    const filter: BulkDownloadFilter = {
      saisonjahr: saison,
      dokumentTypen: typen,
      statusFilter,
    };

    try {
      const result = await fuehreBulkDownloadAus(
        filter,
        (info) => setFortschritt(info),
        abbruchRef.current
      );
      setErgebnis(result);
      setPhase('fertig');
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e);
      setFehler(meldung);
      setPhase('konfiguration');
    }
  };

  const abbrechen = () => {
    abbruchRef.current.abgebrochen = true;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <FileArchive className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                Rechnungen herunterladen
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Sammel-Export als ZIP-Datei + CSV für Steuerberater
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'lauft'}
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

          {phase === 'konfiguration' && (
            <Konfiguration
              saisons={saisons}
              saison={saison}
              setSaison={setSaison}
              typen={typen}
              toggleTyp={toggleTyp}
              statusFilter={statusFilter}
              toggleStatus={toggleStatus}
              anzahlVorschau={anzahlVorschau}
              vorschauLaedt={vorschauLaedt}
              onStart={downloadStarten}
            />
          )}

          {phase === 'lauft' && <Lauft fortschritt={fortschritt} onAbbrechen={abbrechen} />}

          {phase === 'fertig' && ergebnis && (
            <Fertig ergebnis={ergebnis} onSchliessen={onClose} />
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Konfiguration
// ----------------------------------------------------------------------------

const Konfiguration = ({
  saisons,
  saison,
  setSaison,
  typen,
  toggleTyp,
  statusFilter,
  toggleStatus,
  anzahlVorschau,
  vorschauLaedt,
  onStart,
}: {
  saisons: number[];
  saison: number | null;
  setSaison: (n: number) => void;
  typen: DownloadDokumentTyp[];
  toggleTyp: (t: DownloadDokumentTyp) => void;
  statusFilter: DownloadStatusFilter[];
  toggleStatus: (s: DownloadStatusFilter) => void;
  anzahlVorschau: number | null;
  vorschauLaedt: boolean;
  onStart: () => void;
}) => {
  const startAktiv =
    saison !== null && typen.length > 0 && statusFilter.length > 0 && (anzahlVorschau ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Saisonjahr */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Saisonjahr
        </label>
        {saisons.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">Keine Dokumente verfügbar.</p>
        ) : (
          <select
            value={saison ?? ''}
            onChange={(e) => setSaison(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {saisons.map((j) => (
              <option key={j} value={j}>
                Saison {j}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Dokumenttypen */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Dokumenttypen
        </label>
        <div className="space-y-2">
          <Checkbox
            label="Rechnungen (RE-*)"
            checked={typen.includes('rechnung')}
            onChange={() => toggleTyp('rechnung')}
          />
          <Checkbox
            label="Stornorechnungen"
            checked={typen.includes('stornorechnung')}
            onChange={() => toggleTyp('stornorechnung')}
          />
          <Checkbox
            label="Proforma-Rechnungen (PRO-*)"
            checked={typen.includes('proformarechnung')}
            onChange={() => toggleTyp('proformarechnung')}
          />
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Status
        </label>
        <div className="space-y-2">
          <Checkbox
            label="Aktive Rechnungen"
            checked={statusFilter.includes('aktiv')}
            onChange={() => toggleStatus('aktiv')}
          />
          <Checkbox
            label="Stornierte Rechnungen"
            checked={statusFilter.includes('storniert')}
            onChange={() => toggleStatus('storniert')}
          />
        </div>
      </div>

      {/* Vorschau */}
      <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm text-gray-700 dark:text-slate-300">Vorschau</span>
        {vorschauLaedt ? (
          <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
        ) : (
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {anzahlVorschau ?? 0} <span className="text-sm font-normal text-gray-500 dark:text-slate-400">Dokumente</span>
          </span>
        )}
      </div>

      {(anzahlVorschau ?? 0) > 500 && (
        <div className="flex gap-2 text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p>
            Über 500 Dokumente — der Download kann mehrere Minuten dauern und benötigt deutlich
            Arbeitsspeicher im Browser. Bei Problemen die Saison eingrenzen oder pro Dokumenttyp
            laden.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onStart}
          disabled={!startAktiv}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Download starten
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Läuft
// ----------------------------------------------------------------------------

const Lauft = ({
  fortschritt,
  onAbbrechen,
}: {
  fortschritt: BulkDownloadFortschritt;
  onAbbrechen: () => void;
}) => {
  const prozent =
    fortschritt.gesamt > 0 ? Math.round((fortschritt.index / fortschritt.gesamt) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
        <div>
          <p className="font-medium text-gray-900 dark:text-slate-100">
            Lade Dokument {Math.min(fortschritt.index + 1, fortschritt.gesamt)} von {fortschritt.gesamt}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Bitte den Dialog nicht schließen.
          </p>
        </div>
      </div>

      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all"
          style={{ width: `${prozent}%` }}
        />
      </div>

      {fortschritt.aktuellerName && (
        <div className="text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-900/50 rounded p-2 font-mono truncate">
          {fortschritt.aktuellerName}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onAbbrechen}
          className="px-4 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Fertig
// ----------------------------------------------------------------------------

const Fertig = ({
  ergebnis,
  onSchliessen,
}: {
  ergebnis: BulkDownloadErgebnis;
  onSchliessen: () => void;
}) => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-green-900 dark:text-green-200">
          {ergebnis.gesamt - ergebnis.fehlgeschlagen.length} von {ergebnis.gesamt} Dokumenten gepackt
        </p>
        {ergebnis.fehlgeschlagen.length > 0 && (
          <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
            ⚠️ {ergebnis.fehlgeschlagen.length} Dokumente konnten nicht geladen werden — siehe Liste unten.
          </p>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <button
        onClick={() => loestBrowserDownloadAus(ergebnis.zipBlob, ergebnis.zipDateiname)}
        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-blue-600 text-white hover:bg-blue-700"
      >
        <FileArchive className="w-4 h-4" />
        ZIP herunterladen
      </button>
      <button
        onClick={() => loestBrowserDownloadAus(ergebnis.csvBlob, ergebnis.csvDateiname)}
        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
      >
        <FileSpreadsheet className="w-4 h-4" />
        CSV herunterladen
      </button>
    </div>

    {ergebnis.fehlgeschlagen.length > 0 && (
      <div className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
        <div className="px-3 py-2 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20">
          Fehlgeschlagene Dokumente
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-orange-100 dark:divide-orange-900/30">
          {ergebnis.fehlgeschlagen.map((f) => (
            <div key={f.dokumentNummer} className="px-3 py-2 text-xs">
              <div className="font-mono text-gray-900 dark:text-slate-100">{f.dokumentNummer}</div>
              <div className="text-gray-500 dark:text-slate-400">{f.fehler}</div>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="flex justify-end">
      <button
        onClick={onSchliessen}
        className="px-4 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
      >
        Schließen
      </button>
    </div>
  </div>
);

const Checkbox = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
    />
    <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>
  </label>
);

export default BulkDownloadDialog;
