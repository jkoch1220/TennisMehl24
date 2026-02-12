import { useState, useEffect } from 'react';
import { Save, Calendar, Info, RefreshCw } from 'lucide-react';
import { ladeStammdaten, speichereStammdaten } from '../../services/stammdatenService';
import { berechneAktuelleSaison, getAktuelleSaison } from '../../services/nummerierungService';

const MONATE = [
  { value: 1, label: 'Januar' },
  { value: 2, label: 'Februar' },
  { value: 3, label: 'März' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Dezember' },
];

const SaisonEinstellungenTab = () => {
  const [loading, setLoading] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [aktuelleSaison, setAktuelleSaison] = useState<number | null>(null);
  const [berechneteSaison, setBerechneteSaison] = useState<number>(0);
  const [formData, setFormData] = useState({
    aktuelleSaison: '' as string | number,
    saisonStartMonat: 11,
    // Liefersaison für PDF
    liefersaisonStartDatum: '',
    liefersaisonEndDatum: '',
    liefersaisonStartKW: '' as string | number,
    liefersaisonEndKW: '' as string | number,
    liefersaisonJahr: '' as string | number,
  });

  useEffect(() => {
    ladeDaten();
  }, []);

  const ladeDaten = async () => {
    setLoading(true);
    try {
      const stammdaten = await ladeStammdaten();
      const saisonStartMonat = stammdaten?.saisonStartMonat || 11;
      const berechnet = berechneAktuelleSaison(saisonStartMonat);
      setBerechneteSaison(berechnet);

      if (stammdaten) {
        setFormData({
          aktuelleSaison: stammdaten.aktuelleSaison || '',
          saisonStartMonat: saisonStartMonat,
          // Liefersaison
          liefersaisonStartDatum: stammdaten.liefersaisonStartDatum || '',
          liefersaisonEndDatum: stammdaten.liefersaisonEndDatum || '',
          liefersaisonStartKW: stammdaten.liefersaisonStartKW || '',
          liefersaisonEndKW: stammdaten.liefersaisonEndKW || '',
          liefersaisonJahr: stammdaten.liefersaisonJahr || '',
        });
      }

      // Lade die effektiv verwendete Saison
      const effektiveSaison = await getAktuelleSaison();
      setAktuelleSaison(effektiveSaison);
    } catch (error) {
      console.error('Fehler beim Laden der Saison-Einstellungen:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpeichern = async () => {
    setSpeichert(true);
    setErfolg(false);
    try {
      const stammdaten = await ladeStammdaten();
      if (stammdaten) {
        // Baue das Update-Objekt - nur Felder mit Werten hinzufügen
        const updateData: Record<string, unknown> = {
          ...stammdaten,
          saisonStartMonat: formData.saisonStartMonat,
        };

        // Saison nur setzen wenn vorhanden
        if (formData.aktuelleSaison) {
          updateData.aktuelleSaison = Number(formData.aktuelleSaison);
        }

        // Liefersaison-Felder nur setzen wenn vorhanden
        if (formData.liefersaisonStartDatum) {
          updateData.liefersaisonStartDatum = formData.liefersaisonStartDatum;
        }
        if (formData.liefersaisonEndDatum) {
          updateData.liefersaisonEndDatum = formData.liefersaisonEndDatum;
        }
        if (formData.liefersaisonStartKW) {
          updateData.liefersaisonStartKW = Number(formData.liefersaisonStartKW);
        }
        if (formData.liefersaisonEndKW) {
          updateData.liefersaisonEndKW = Number(formData.liefersaisonEndKW);
        }
        if (formData.liefersaisonJahr) {
          updateData.liefersaisonJahr = Number(formData.liefersaisonJahr);
        }

        await speichereStammdaten(updateData as any);
        setErfolg(true);
        // Aktualisiere die berechnete Saison
        const berechnet = berechneAktuelleSaison(formData.saisonStartMonat);
        setBerechneteSaison(berechnet);
        // Aktualisiere die effektiv verwendete Saison
        const effektiveSaison = await getAktuelleSaison();
        setAktuelleSaison(effektiveSaison);
        setTimeout(() => setErfolg(false), 3000);
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Saison-Einstellungen');
    } finally {
      setSpeichert(false);
    }
  };

  const handleStartMonatChange = (monat: number) => {
    setFormData(prev => ({ ...prev, saisonStartMonat: monat }));
    // Berechne die neue Saison basierend auf dem neuen Startmonat
    const neueBerechneteSaison = berechneAktuelleSaison(monat);
    setBerechneteSaison(neueBerechneteSaison);
  };

  const handleSaisonReset = () => {
    setFormData(prev => ({ ...prev, aktuelleSaison: '' }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Saison-Einstellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">Saison-Einstellungen</h2>
          </div>
          <button
            onClick={handleSpeichern}
            disabled={speichert}
            className={`px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all ${
              erfolg
                ? 'bg-green-600 text-white'
                : 'bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-700 hover:to-amber-700'
            } disabled:opacity-50`}
          >
            {speichert ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Speichern...
              </>
            ) : erfolg ? (
              <>
                <Save className="w-4 h-4" />
                Gespeichert!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Speichern
              </>
            )}
          </button>
        </div>

        {/* Aktuelle Saison Anzeige */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-orange-800 dark:text-orange-300">Aktuelle Saison</span>
          </div>
          <p className="text-3xl font-bold text-orange-700 dark:text-orange-400">
            {aktuelleSaison}
          </p>
          <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
            {formData.aktuelleSaison
              ? 'Manuell konfiguriert'
              : `Automatisch berechnet (ab ${MONATE.find(m => m.value === formData.saisonStartMonat)?.label})`}
          </p>
        </div>

        {/* Info-Box */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium mb-2">So funktioniert die Saison-Berechnung:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                <li>Die Saison beginnt im {MONATE.find(m => m.value === formData.saisonStartMonat)?.label} und endet im April des Folgejahres</li>
                <li>Beispiel: {MONATE.find(m => m.value === formData.saisonStartMonat)?.label} 2025 - April 2026 = <strong>Saison 2026</strong></li>
                <li>Alle Dokumentnummern werden im Format <strong>PREFIX-{aktuelleSaison}-0001</strong> generiert</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Einstellungen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Saison-Startmonat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Saison beginnt im
            </label>
            <select
              value={formData.saisonStartMonat}
              onChange={(e) => handleStartMonatChange(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-dark-bg dark:text-dark-text"
            >
              {MONATE.map((monat) => (
                <option key={monat.value} value={monat.value}>
                  {monat.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
              Ab diesem Monat wird automatisch die nächste Saison verwendet
            </p>
          </div>

          {/* Manuelle Saison-Überschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Saison manuell überschreiben (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="2020"
                max="2099"
                value={formData.aktuelleSaison}
                onChange={(e) => setFormData(prev => ({ ...prev, aktuelleSaison: e.target.value }))}
                placeholder={`Auto: ${berechneteSaison}`}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-dark-bg dark:text-dark-text"
              />
              {formData.aktuelleSaison && (
                <button
                  onClick={handleSaisonReset}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 dark:text-dark-textMuted dark:hover:text-dark-text border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors"
                  title="Auf automatische Berechnung zurücksetzen"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
              Leer lassen für automatische Berechnung
            </p>
          </div>
        </div>
      </div>

      {/* Liefersaison für PDF */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">Liefersaison für PDF-Dokumente</h3>
        </div>

        {/* Info-Box */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800 dark:text-green-300">
              <p className="font-medium mb-2">Diese Einstellungen erscheinen auf den PDF-Dokumenten:</p>
              <p className="text-green-700 dark:text-green-400 italic">
                "Liefersaison voraussichtlich {formData.liefersaisonStartDatum || '02.03.'} - {formData.liefersaisonEndDatum || '17.04.'}{formData.liefersaisonJahr || '2026'} ({formData.liefersaisonStartKW || '10'}. - {formData.liefersaisonEndKW || '16'}. KW {formData.liefersaisonJahr || '2026'})."
              </p>
            </div>
          </div>
        </div>

        {/* Eingabefelder */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Jahr */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Jahr
            </label>
            <input
              type="number"
              min="2020"
              max="2099"
              value={formData.liefersaisonJahr}
              onChange={(e) => setFormData(prev => ({ ...prev, liefersaisonJahr: e.target.value }))}
              placeholder="z.B. 2026"
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-bg dark:text-dark-text"
            />
          </div>

          {/* Start-Datum */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Start-Datum
            </label>
            <input
              type="text"
              value={formData.liefersaisonStartDatum}
              onChange={(e) => setFormData(prev => ({ ...prev, liefersaisonStartDatum: e.target.value }))}
              placeholder="z.B. 02.03."
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-bg dark:text-dark-text"
            />
            <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">Format: TT.MM.</p>
          </div>

          {/* End-Datum */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              End-Datum
            </label>
            <input
              type="text"
              value={formData.liefersaisonEndDatum}
              onChange={(e) => setFormData(prev => ({ ...prev, liefersaisonEndDatum: e.target.value }))}
              placeholder="z.B. 17.04."
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-bg dark:text-dark-text"
            />
            <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">Format: TT.MM.</p>
          </div>

          {/* Start-KW */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Start-Kalenderwoche
            </label>
            <input
              type="number"
              min="1"
              max="52"
              value={formData.liefersaisonStartKW}
              onChange={(e) => setFormData(prev => ({ ...prev, liefersaisonStartKW: e.target.value }))}
              placeholder="z.B. 10"
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-bg dark:text-dark-text"
            />
          </div>

          {/* End-KW */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              End-Kalenderwoche
            </label>
            <input
              type="number"
              min="1"
              max="52"
              value={formData.liefersaisonEndKW}
              onChange={(e) => setFormData(prev => ({ ...prev, liefersaisonEndKW: e.target.value }))}
              placeholder="z.B. 16"
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-dark-bg dark:text-dark-text"
            />
          </div>
        </div>
      </div>

      {/* Vorschau */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Nummern-Vorschau</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 text-center border-2 border-orange-300 dark:border-orange-700">
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Angebot</p>
            <p className="font-mono font-bold text-orange-700 dark:text-orange-300">ANG-{aktuelleSaison}-0001</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 text-center border-2 border-orange-300 dark:border-orange-700">
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Auftragsbestätigung</p>
            <p className="font-mono font-bold text-orange-700 dark:text-orange-300">AB-{aktuelleSaison}-0001</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 text-center border-2 border-orange-300 dark:border-orange-700">
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Lieferschein</p>
            <p className="font-mono font-bold text-orange-700 dark:text-orange-300">LS-{aktuelleSaison}-0001</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 text-center border-2 border-orange-300 dark:border-orange-700">
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Rechnung</p>
            <p className="font-mono font-bold text-orange-700 dark:text-orange-300">RE-{aktuelleSaison}-0001</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaisonEinstellungenTab;
