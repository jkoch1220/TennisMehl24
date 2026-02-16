import { useState, useEffect } from 'react';
import { X, Plus, User, MapPin, Phone, Package, Loader2 } from 'lucide-react';
import { saisonplanungService } from '../../services/saisonplanungService';
import { Bezugsweg } from '../../types/saisonplanung';

interface VereinSchnellerfassungProps {
  platzbauerId: string;
  platzbauerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  ansprechpartnerName: string;
  ansprechpartnerTelefon: string;
  tonnen: string;
  bezugsweg: Bezugsweg;
}

const VereinSchnellerfassung = ({
  platzbauerId,
  platzbauerName,
  onClose,
  onSuccess,
}: VereinSchnellerfassungProps) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    strasse: '',
    plz: '',
    ort: '',
    ansprechpartnerName: '',
    ansprechpartnerTelefon: '',
    tonnen: '',
    bezugsweg: 'ueber_platzbauer',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC zum Schließen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, saving]);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validierung
    if (!formData.name.trim()) {
      setError('Bitte Vereinsname eingeben');
      return;
    }
    if (!formData.plz.trim() || !formData.ort.trim()) {
      setError('Bitte PLZ und Ort eingeben');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Verein anlegen
      const neuerVerein = await saisonplanungService.createKunde({
        typ: 'verein',
        name: formData.name.trim(),
        rechnungsadresse: {
          strasse: formData.strasse.trim(),
          plz: formData.plz.trim(),
          ort: formData.ort.trim(),
          bundesland: '',
        },
        lieferadresse: {
          strasse: formData.strasse.trim(),
          plz: formData.plz.trim(),
          ort: formData.ort.trim(),
          bundesland: '',
        },
        standardBezugsweg: formData.bezugsweg,
        standardPlatzbauerId: platzbauerId,
        aktiv: true,
        tonnenLetztesJahr: formData.tonnen ? parseFloat(formData.tonnen) : undefined,
        // Dispo-Ansprechpartner direkt setzen wenn angegeben
        dispoAnsprechpartner: formData.ansprechpartnerName ? {
          name: formData.ansprechpartnerName.trim(),
          telefon: formData.ansprechpartnerTelefon.trim(),
        } : undefined,
      });

      // 2. Falls Ansprechpartner angegeben, auch als vollständigen Ansprechpartner anlegen
      if (formData.ansprechpartnerName.trim()) {
        await saisonplanungService.createAnsprechpartner({
          kundeId: neuerVerein.id,
          name: formData.ansprechpartnerName.trim(),
          rolle: 'Platzwart',
          telefonnummern: formData.ansprechpartnerTelefon.trim()
            ? [{ nummer: formData.ansprechpartnerTelefon.trim(), typ: 'Mobil' }]
            : [],
          aktiv: true,
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Fehler beim Anlegen des Vereins:', err);
      setError('Fehler beim Anlegen des Vereins. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Verein schnell anlegen
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Wird {platzbauerName} zugeordnet
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Vereinsname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Vereinsname *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="TC Musterstadt e.V."
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Lieferadresse */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <MapPin className="w-4 h-4" />
              Lieferadresse
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.strasse}
                onChange={(e) => handleChange('strasse', e.target.value)}
                placeholder="Straße + Hausnummer"
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.plz}
                  onChange={(e) => handleChange('plz', e.target.value)}
                  placeholder="PLZ *"
                  className="w-28 px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={formData.ort}
                  onChange={(e) => handleChange('ort', e.target.value)}
                  placeholder="Ort *"
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Ansprechpartner */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <User className="w-4 h-4" />
              Ansprechpartner (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.ansprechpartnerName}
                onChange={(e) => handleChange('ansprechpartnerName', e.target.value)}
                placeholder="Name"
                className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
              />
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.ansprechpartnerTelefon}
                  onChange={(e) => handleChange('ansprechpartnerTelefon', e.target.value)}
                  placeholder="Telefon"
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tonnen + Bezugsweg */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Package className="w-4 h-4" />
                Tonnen (ca.)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.tonnen}
                  onChange={(e) => handleChange('tonnen', e.target.value)}
                  placeholder="z.B. 5"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">t</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Bezugsweg
              </label>
              <select
                value={formData.bezugsweg}
                onChange={(e) => handleChange('bezugsweg', e.target.value as Bezugsweg)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:border-amber-500 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="ueber_platzbauer">Platzbauer</option>
                <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium rounded-lg transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird angelegt...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Verein anlegen
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VereinSchnellerfassung;
