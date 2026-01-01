import { useState, useEffect } from 'react';
import {
  X,
  Save,
  TestTube2,
  AlertCircle,
  CheckCircle,
  Users,
  Folder,
  Hammer,
  Beaker,
  Package,
  RotateCcw,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { qsService, berechneErgebnis } from '../../services/qsService';
import {
  Siebanalyse,
  Siebwerte,
  SIEB_TOLERANZEN,
  NeueSiebanalyse,
  ProbenTyp,
  HammerStatus,
  HammerInfo,
} from '../../types/qualitaetssicherung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { projektService } from '../../services/projektService';
import type { SaisonKunde } from '../../types/saisonplanung';
import type { Projekt } from '../../types/projekt';

interface Props {
  analyse: Siebanalyse | null;
  onSave: () => void;
  onCancel: () => void;
}

const HAMMER_STATUS_LABELS: Record<HammerStatus, { label: string; color: string; icon: typeof Hammer }> = {
  frisch: { label: 'Frisch', color: 'bg-green-100 text-green-700 border-green-300', icon: Hammer },
  genutzt: { label: 'Genutzt', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: Hammer },
  gedreht: { label: 'Gedreht', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: RotateCcw },
  wechsel_faellig: { label: 'Wechsel fällig', color: 'bg-red-100 text-red-700 border-red-300', icon: AlertTriangle },
};

export default function SiebanalyseFormular({ analyse, onSave, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [siebwerte, setSiebwerte] = useState<Siebwerte>({
    mm2_0: 100,
    mm1_0: 90,
    mm0_63: 72,
    mm0_315: 50,
    mm0_125: 27,
    mm0_063: 5,
  });
  const [pruefDatum, setPruefDatum] = useState(new Date().toISOString().split('T')[0]);
  const [pruefUhrzeit, setPruefUhrzeit] = useState(
    new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [notizen, setNotizen] = useState('');
  const [kundeId, setKundeId] = useState<string>('');
  const [projektId, setProjektId] = useState<string>('');
  const [kunden, setKunden] = useState<SaisonKunde[]>([]);
  const [projekte, setProjekte] = useState<Projekt[]>([]);

  // NEU: Probentyp und Hammer-Status
  const [probenTyp, setProbenTyp] = useState<ProbenTyp>('fertigprodukt');
  const [hammerStatus, setHammerStatus] = useState<HammerStatus>('genutzt');
  const [hammerDrehungen, setHammerDrehungen] = useState(0);

  // Vorschau der Bewertung
  const bewertung = berechneErgebnis(siebwerte, probenTyp);

  useEffect(() => {
    // Kunden und Projekte laden
    const loadData = async () => {
      try {
        const [kundenData, projekteData] = await Promise.all([
          saisonplanungService.loadAlleKunden(),
          projektService.loadProjekte(),
        ]);
        setKunden(kundenData);
        setProjekte(projekteData);
      } catch (error) {
        console.error('Fehler beim Laden:', error);
      }
    };
    loadData();

    // Vorhandene Analyse laden
    if (analyse) {
      setSiebwerte(analyse.siebwerte);
      // Datum und Uhrzeit parsen
      const datumParts = analyse.pruefDatum.split('T');
      setPruefDatum(datumParts[0]);
      if (datumParts[1]) {
        // Uhrzeit aus ISO-String extrahieren (HH:MM)
        setPruefUhrzeit(datumParts[1].substring(0, 5));
      }
      setNotizen(analyse.notizen || '');
      setKundeId(analyse.kundeId || '');
      setProjektId(analyse.projektId || '');
      setProbenTyp(analyse.probenTyp || 'fertigprodukt');
      if (analyse.hammerInfo) {
        setHammerStatus(analyse.hammerInfo.status);
        setHammerDrehungen(analyse.hammerInfo.anzahlDrehungen || 0);
      }
    }
  }, [analyse]);

  const handleSiebwertChange = (sieb: keyof Siebwerte, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSiebwerte((prev) => ({
      ...prev,
      [sieb]: Math.min(100, Math.max(0, numValue)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const kunde = kunden.find((k) => k.id === kundeId);
      const projekt = projekte.find((p) => p.id === projektId);

      // Datum und Uhrzeit kombinieren zu ISO-String
      const pruefDatumMitUhrzeit = `${pruefDatum}T${pruefUhrzeit}:00`;

      // Hammer-Info nur bei Mischproben
      const hammerInfo: HammerInfo | undefined =
        probenTyp === 'mischprobe'
          ? {
              status: hammerStatus,
              anzahlDrehungen: hammerDrehungen,
            }
          : undefined;

      if (analyse) {
        await qsService.updateSiebanalyse(analyse.id, {
          siebwerte,
          pruefDatum: pruefDatumMitUhrzeit,
          notizen,
          probenTyp,
          hammerInfo,
          kundeId: kundeId || undefined,
          projektId: projektId || undefined,
          kundeName: kunde?.name,
          projektName: projekt?.projektName,
        });
      } else {
        const neueDaten: NeueSiebanalyse = {
          siebwerte,
          pruefDatum: pruefDatumMitUhrzeit,
          notizen,
          probenTyp,
          hammerInfo,
          kundeId: kundeId || undefined,
          projektId: projektId || undefined,
          kundeName: kunde?.name,
          projektName: projekt?.projektName,
        };
        await qsService.createSiebanalyse(neueDaten);
      }
      onSave();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Siebanalyse');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <TestTube2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                {analyse ? 'Siebanalyse bearbeiten' : 'Neue Siebanalyse'}
              </h2>
              {analyse && (
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">{analyse.chargenNummer}</p>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Probentyp-Auswahl */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Probentyp
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProbenTyp('mischprobe')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                  probenTyp === 'mischprobe'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                }`}
              >
                <Beaker
                  className={`h-6 w-6 ${
                    probenTyp === 'mischprobe' ? 'text-amber-600' : 'text-gray-400'
                  }`}
                />
                <div className="text-left">
                  <p
                    className={`font-medium ${
                      probenTyp === 'mischprobe'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-gray-700 dark:text-dark-text'
                    }`}
                  >
                    Mischprobe
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                    Produktionsprobe (keine Bewertung)
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProbenTyp('fertigprodukt')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                  probenTyp === 'fertigprodukt'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                }`}
              >
                <Package
                  className={`h-6 w-6 ${
                    probenTyp === 'fertigprodukt' ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                />
                <div className="text-left">
                  <p
                    className={`font-medium ${
                      probenTyp === 'fertigprodukt'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-gray-700 dark:text-dark-text'
                    }`}
                  >
                    Fertigprodukt
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                    Auslieferungsware (DIN-Prüfung)
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Hammer-Status (nur bei Mischproben) */}
          {probenTyp === 'mischprobe' && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
              <label className="block text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
                <Hammer className="h-4 w-4 inline mr-1" />
                Hammer-Status
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(HAMMER_STATUS_LABELS) as HammerStatus[]).map((status) => {
                  const { label, color, icon: Icon } = HAMMER_STATUS_LABELS[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setHammerStatus(status)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        hammerStatus === status
                          ? `${color} border-2`
                          : 'bg-white dark:bg-dark-bg border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-textMuted hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Anzahl Drehungen */}
              <div className="mt-3">
                <label className="block text-sm text-amber-700 dark:text-amber-400 mb-1">
                  Anzahl Drehungen (max. 4 Seiten)
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setHammerDrehungen(n)}
                      className={`w-10 h-10 rounded-lg font-bold transition-all ${
                        hammerDrehungen === n
                          ? 'bg-amber-500 text-white'
                          : 'bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-textMuted hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Prüfdatum und Uhrzeit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Prüfdatum
              </label>
              <input
                type="date"
                value={pruefDatum}
                onChange={(e) => setPruefDatum(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                <Clock className="h-4 w-4 inline mr-1" />
                Uhrzeit
              </label>
              <input
                type="time"
                value={pruefUhrzeit}
                onChange={(e) => setPruefUhrzeit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          {/* Kunde & Projekt (nur bei Fertigprodukt) */}
          {probenTyp === 'fertigprodukt' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  <Users className="h-4 w-4 inline mr-1" />
                  Kunde (optional)
                </label>
                <select
                  value={kundeId}
                  onChange={(e) => setKundeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Keiner ausgewählt</option>
                  {kunden.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  <Folder className="h-4 w-4 inline mr-1" />
                  Projekt (optional)
                </label>
                <select
                  value={projektId}
                  onChange={(e) => setProjektId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Keines ausgewählt</option>
                  {projekte.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projektName} ({p.kundenname})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Siebwerte */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-3">
              Siebdurchgang [%] - DIN 18035-5
            </h3>
            <div className="bg-gray-50 dark:bg-dark-bg rounded-lg p-4 space-y-3">
              {SIEB_TOLERANZEN.map((toleranz) => {
                const wert = siebwerte[toleranz.sieb];
                const inToleranz = wert >= toleranz.min && wert <= toleranz.max;
                const isFixed = toleranz.sieb === 'mm2_0';

                return (
                  <div key={toleranz.sieb} className="flex items-center gap-4">
                    <div className="w-20 text-sm font-medium text-gray-700 dark:text-dark-textMuted">
                      {toleranz.label} {toleranz.einheit}
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={wert}
                        onChange={(e) => handleSiebwertChange(toleranz.sieb, e.target.value)}
                        disabled={isFixed}
                        className={`w-full px-3 py-2 border rounded-lg text-right focus:ring-2 focus:ring-emerald-500 ${
                          isFixed
                            ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 cursor-not-allowed'
                            : probenTyp === 'mischprobe'
                            ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10'
                            : inToleranz
                            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                            : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                        } dark:text-dark-text`}
                      />
                    </div>
                    <div className="w-24 text-xs text-gray-500 dark:text-dark-textMuted">
                      {toleranz.min === toleranz.max ? `${toleranz.min}%` : `${toleranz.min} - ${toleranz.max}%`}
                    </div>
                    <div className="w-6">
                      {probenTyp === 'mischprobe' ? (
                        <Beaker className="h-5 w-5 text-amber-500" />
                      ) : inToleranz ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vorschau Ergebnis */}
          <div
            className={`p-4 rounded-lg border-2 ${
              bewertung.ergebnis === 'mischprobe'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500'
                : bewertung.ergebnis === 'bestanden'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                : 'bg-red-50 dark:bg-red-900/20 border-red-500'
            }`}
          >
            <div className="flex items-center gap-2">
              {bewertung.ergebnis === 'mischprobe' ? (
                <>
                  <Beaker className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    MISCHPROBE (keine Bewertung)
                  </span>
                </>
              ) : bewertung.ergebnis === 'bestanden' ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  <span className="font-bold text-green-700 dark:text-green-400">BESTANDEN</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  <span className="font-bold text-red-700 dark:text-red-400">NICHT BESTANDEN</span>
                </>
              )}
            </div>
            {bewertung.abweichungen.length > 0 && (
              <ul className="mt-2 space-y-1">
                {bewertung.abweichungen.map((abw, i) => (
                  <li
                    key={i}
                    className={`text-sm ${
                      bewertung.ergebnis === 'mischprobe'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    • {abw}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Notizen (optional)
            </label>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
              placeholder="Zusätzliche Bemerkungen zur Probe..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
