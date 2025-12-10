import { useState } from 'react';
import { X, Layers, Building2, MapPin, Calendar, Package, Euro, User } from 'lucide-react';
import { NeuesProjekt } from '../../types/projekt';

interface ProjektDialogProps {
  kundenname: string;
  kundeId: string;
  kundennummer?: string;
  kundenstrasse?: string;
  kundenPlzOrt: string;
  angefragteMenge?: number;
  preisProTonne?: number;
  bezugsweg?: string;
  onSave: (projekt: NeuesProjekt) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const ProjektDialog = ({
  kundenname,
  kundeId,
  kundennummer,
  kundenstrasse,
  kundenPlzOrt,
  angefragteMenge,
  preisProTonne,
  bezugsweg,
  onSave,
  onCancel,
  saving = false,
}: ProjektDialogProps) => {
  const [formData, setFormData] = useState({
    projektName: `${kundenname} - 2026`,
    saisonjahr: 2026,
    angefragteMenge: angefragteMenge || 0,
    preisProTonne: preisProTonne || 0,
    bezugsweg: bezugsweg || 'direkt',
    notizen: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.projektName.trim()) {
      alert('Bitte geben Sie einen Projektnamen ein.');
      return;
    }

    const neuesProjekt: NeuesProjekt = {
      projektName: formData.projektName,
      kundeId: kundeId,
      kundennummer: kundennummer,
      kundenname: kundenname,
      kundenstrasse: kundenstrasse || '',
      kundenPlzOrt: kundenPlzOrt,
      saisonjahr: formData.saisonjahr,
      status: 'angebot',
      angefragteMenge: formData.angefragteMenge || undefined,
      preisProTonne: formData.preisProTonne || undefined,
      bezugsweg: formData.bezugsweg || undefined,
      notizen: formData.notizen || undefined,
    };

    await onSave(neuesProjekt);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-7 h-7 text-green-600" />
              Neues Projekt erstellen
            </h2>
            <p className="text-sm text-gray-600 mt-1">Legen Sie ein neues Projekt für die Bestellabwicklung an</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={saving}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Kunden-Info (Read-only) */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Kunde
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Name:</span>
                <span className="ml-2 text-blue-900">{kundenname}</span>
              </div>
              {kundennummer && (
                <div>
                  <span className="text-blue-700 font-medium">Kundennummer:</span>
                  <span className="ml-2 text-blue-900">{kundennummer}</span>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-blue-700 font-medium flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  Adresse:
                </span>
                <span className="ml-2 text-blue-900">
                  {kundenstrasse && `${kundenstrasse}, `}{kundenPlzOrt}
                </span>
              </div>
            </div>
          </div>

          {/* Projektname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Layers className="w-4 h-4 inline mr-1" />
              Projektname *
            </label>
            <input
              type="text"
              value={formData.projektName}
              onChange={(e) => setFormData({ ...formData, projektName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg font-medium"
              placeholder="z.B. TC Musterstadt - 2026"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Geben Sie einen aussagekräftigen Namen für das Projekt ein
            </p>
          </div>

          {/* Saisonjahr */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Saisonjahr *
            </label>
            <input
              type="number"
              value={formData.saisonjahr}
              onChange={(e) => setFormData({ ...formData, saisonjahr: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              min="2020"
              max="2099"
              required
            />
          </div>

          {/* Angefragte Menge & Preis */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Package className="w-4 h-4 inline mr-1" />
                Angefragte Menge (Tonnen)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.angefragteMenge}
                onChange={(e) => setFormData({ ...formData, angefragteMenge: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="z.B. 5.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Euro className="w-4 h-4 inline mr-1" />
                Preis pro Tonne (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.preisProTonne}
                onChange={(e) => setFormData({ ...formData, preisProTonne: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="z.B. 450.00"
              />
            </div>
          </div>

          {/* Bezugsweg */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Bezugsweg
            </label>
            <select
              value={formData.bezugsweg}
              onChange={(e) => setFormData({ ...formData, bezugsweg: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Bitte wählen</option>
              <option value="direkt">Direkt</option>
              <option value="ueber_platzbauer">Über Platzbauer</option>
            </select>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notizen
            </label>
            <textarea
              value={formData.notizen}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Optionale Notizen zum Projekt..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Erstelle Projekt...
                </>
              ) : (
                <>
                  <Layers className="w-5 h-5" />
                  Projekt erstellen
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjektDialog;
