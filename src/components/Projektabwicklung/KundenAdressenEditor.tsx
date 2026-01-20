import { useState } from 'react';
import { MapPin, FileText, Truck, Edit, Check, X, Loader2, Copy } from 'lucide-react';
import { Adresse } from '../../types/dispo';
import { SaisonKunde } from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';

interface KundenAdressenEditorProps {
  kundeId: string;
  kundeName: string;
  rechnungsadresse: Adresse;
  lieferadresse: Adresse;
  onUpdate: () => void;
}

type AdressTyp = 'rechnungsadresse' | 'lieferadresse';

const KundenAdressenEditor = ({
  kundeId,
  kundeName,
  rechnungsadresse,
  lieferadresse,
  onUpdate,
}: KundenAdressenEditorProps) => {
  const [editingType, setEditingType] = useState<AdressTyp | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Adresse>({
    strasse: '',
    plz: '',
    ort: '',
    bundesland: '',
  });

  const startEdit = (type: AdressTyp) => {
    const existingAddress = type === 'rechnungsadresse' ? rechnungsadresse : lieferadresse;
    setFormData({
      strasse: existingAddress.strasse,
      plz: existingAddress.plz,
      ort: existingAddress.ort,
      bundesland: existingAddress.bundesland || '',
    });
    setEditingType(type);
  };

  const cancelEdit = () => {
    setEditingType(null);
    setFormData({ strasse: '', plz: '', ort: '', bundesland: '' });
  };

  const saveAddress = async () => {
    if (!editingType) return;

    // Validierung
    if (!formData.strasse.trim() || !formData.plz.trim() || !formData.ort.trim()) {
      alert('Bitte füllen Sie Straße, PLZ und Ort aus.');
      return;
    }

    setSaving(true);
    try {
      const updateData: Partial<SaisonKunde> = {
        [editingType]: {
          strasse: formData.strasse.trim(),
          plz: formData.plz.trim(),
          ort: formData.ort.trim(),
          bundesland: formData.bundesland?.trim() || undefined,
        },
      };

      await saisonplanungService.updateKunde(kundeId, updateData);

      setEditingType(null);
      setFormData({ strasse: '', plz: '', ort: '', bundesland: '' });
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Speichern der Adresse:', error);
      alert('Fehler beim Speichern der Adresse. Bitte versuchen Sie es erneut.');
    } finally {
      setSaving(false);
    }
  };

  // Kopiere Lieferadresse in das Formular (nur für Rechnungsadresse verfügbar)
  const copyLieferadresse = () => {
    setFormData({
      strasse: lieferadresse.strasse,
      plz: lieferadresse.plz,
      ort: lieferadresse.ort,
      bundesland: lieferadresse.bundesland || '',
    });
  };

  const formatAdresse = (adresse: Adresse) => {
    return `${adresse.strasse}, ${adresse.plz} ${adresse.ort}${adresse.bundesland ? ` (${adresse.bundesland})` : ''}`;
  };

  // Prüfe ob beide Adressen gleich sind
  const adressenSindGleich =
    rechnungsadresse.strasse === lieferadresse.strasse &&
    rechnungsadresse.plz === lieferadresse.plz &&
    rechnungsadresse.ort === lieferadresse.ort;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-4">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <MapPin className="w-5 h-5 text-red-600" />
        <h3 className="font-semibold">Adressen für {kundeName}</h3>
      </div>

      {/* Lieferadresse (Hauptadresse/Standort) */}
      <div className="border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Truck className="w-4 h-4 text-green-600" />
            <span className="font-medium">Lieferadresse / Standort</span>
          </div>
          {editingType !== 'lieferadresse' && (
            <button
              onClick={() => startEdit('lieferadresse')}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm transition-colors text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
            >
              <Edit className="w-4 h-4" />
              Bearbeiten
            </button>
          )}
        </div>

        {editingType === 'lieferadresse' ? (
          <AddressForm
            formData={formData}
            setFormData={setFormData}
            onSave={saveAddress}
            onCancel={cancelEdit}
            saving={saving}
            label="Lieferadresse"
          />
        ) : (
          <p className="text-gray-900 dark:text-white font-medium">
            {formatAdresse(lieferadresse)}
          </p>
        )}
      </div>

      {/* Rechnungsadresse */}
      <div className="border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Rechnungsadresse</span>
            {adressenSindGleich && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                = Lieferadresse
              </span>
            )}
          </div>
          {editingType !== 'rechnungsadresse' && (
            <button
              onClick={() => startEdit('rechnungsadresse')}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm transition-colors text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            >
              <Edit className="w-4 h-4" />
              Bearbeiten
            </button>
          )}
        </div>

        {editingType === 'rechnungsadresse' ? (
          <AddressForm
            formData={formData}
            setFormData={setFormData}
            onSave={saveAddress}
            onCancel={cancelEdit}
            onCopyLieferadresse={copyLieferadresse}
            saving={saving}
            label="Rechnungsadresse"
          />
        ) : (
          <p className="text-gray-900 dark:text-white font-medium">
            {formatAdresse(rechnungsadresse)}
          </p>
        )}
      </div>
    </div>
  );
};

// Separates Formular-Komponente für die Adresseingabe
interface AddressFormProps {
  formData: Adresse;
  setFormData: (data: Adresse) => void;
  onSave: () => void;
  onCancel: () => void;
  onCopyLieferadresse?: () => void;
  saving: boolean;
  label: string;
}

const AddressForm = ({
  formData,
  setFormData,
  onSave,
  onCancel,
  onCopyLieferadresse,
  saving,
  label,
}: AddressFormProps) => {
  return (
    <div className="space-y-3 mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label} bearbeiten</span>
        {onCopyLieferadresse && (
          <button
            onClick={onCopyLieferadresse}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            <Copy className="w-3 h-3" />
            Lieferadresse übernehmen
          </button>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Straße und Hausnummer *"
          value={formData.strasse}
          onChange={(e) => setFormData({ ...formData, strasse: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="PLZ *"
            value={formData.plz}
            onChange={(e) => setFormData({ ...formData, plz: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Ort *"
            value={formData.ort}
            onChange={(e) => setFormData({ ...formData, ort: e.target.value })}
            className="col-span-2 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
        <input
          type="text"
          placeholder="Bundesland (optional)"
          value={formData.bundesland || ''}
          onChange={(e) => setFormData({ ...formData, bundesland: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Speichern...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Speichern
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default KundenAdressenEditor;
