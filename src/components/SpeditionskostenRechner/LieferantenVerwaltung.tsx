import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Users } from 'lucide-react';
import { Lieferant, NeuerLieferant } from '../../types';
import { lieferantService } from '../../services/lieferantService';
import { NumberInput } from '../NumberInput';

interface LieferantenVerwaltungProps {
  onLieferantSaved?: () => void;
}

const LieferantenVerwaltung = ({ onLieferantSaved }: LieferantenVerwaltungProps) => {
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<NeuerLieferant>({
    name: '',
    firma: '',
    stundenlohn: 25.0,
    lkw: '',
    lieferVolumen: 1.0,
  });

  // Lade Lieferanten beim Mount
  useEffect(() => {
    loadLieferanten();
  }, []);

  const loadLieferanten = async () => {
    try {
      setLoading(true);
      const data = await lieferantService.loadAlleLieferanten();
      setLieferanten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Lieferanten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({
      name: '',
      firma: '',
      stundenlohn: 25.0,
      lkw: '',
      lieferVolumen: 1.0,
    });
  };

  const handleEdit = (lieferant: Lieferant) => {
    setIsEditing(lieferant.id);
    setFormData({
      name: lieferant.name,
      firma: lieferant.firma,
      stundenlohn: lieferant.stundenlohn,
      lkw: lieferant.lkw,
      lieferVolumen: lieferant.lieferVolumen,
    });
  };

  const handleCancel = () => {
    setIsEditing(null);
    setIsCreating(false);
    setFormData({
      name: '',
      firma: '',
      stundenlohn: 25.0,
      lkw: '',
      lieferVolumen: 1.0,
    });
  };

  const handleSave = async () => {
    try {
      if (isCreating) {
        await lieferantService.createLieferant(formData);
      } else if (isEditing) {
        await lieferantService.updateLieferant(isEditing, formData);
      }
      await loadLieferanten();
      handleCancel();
      if (onLieferantSaved) {
        onLieferantSaved();
      }
    } catch (error) {
      console.error('Fehler beim Speichern des Lieferanten:', error);
      alert('Fehler beim Speichern des Lieferanten');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Lieferanten wirklich löschen?')) {
      return;
    }
    try {
      await lieferantService.deleteLieferant(id);
      await loadLieferanten();
    } catch (error) {
      console.error('Fehler beim Löschen des Lieferanten:', error);
      alert('Fehler beim Löschen des Lieferanten');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Lieferanten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-6 h-6" />
          Lieferantenverwaltung
        </h2>
        {!isCreating && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neuer Lieferant
          </button>
        )}
      </div>

      {/* Erstellungsformular */}
      {isCreating && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Neuer Lieferant</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                placeholder="Max Mustermann"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Firma *
              </label>
              <input
                type="text"
                value={formData.firma}
                onChange={(e) => setFormData({ ...formData, firma: e.target.value })}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                placeholder="Transport GmbH"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Stundenlohn (€/h) *
              </label>
              <NumberInput
                value={formData.stundenlohn}
                onChange={(value) => setFormData({ ...formData, stundenlohn: value })}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                step={0.5}
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                LKW *
              </label>
              <input
                type="text"
                value={formData.lkw}
                onChange={(e) => setFormData({ ...formData, lkw: e.target.value })}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                placeholder="7,5t LKW"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Liefervolumen (t) *
              </label>
              <NumberInput
                value={formData.lieferVolumen}
                onChange={(value) => setFormData({ ...formData, lieferVolumen: value })}
                className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                step={0.1}
                min={0.1}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={!formData.name || !formData.firma || !formData.lkw}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Lieferantenliste */}
      {lieferanten.length === 0 && !isCreating ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>Noch keine Lieferanten vorhanden.</p>
          <p className="text-sm mt-2">Klicken Sie auf "Neuer Lieferant" um einen hinzuzufügen.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lieferanten.map((lieferant) => (
            <div
              key={lieferant.id}
              className={`p-4 rounded-lg border-2 ${
                isEditing === lieferant.id
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              {isEditing === lieferant.id ? (
                // Bearbeitungsformular
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Lieferant bearbeiten</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Firma *
                      </label>
                      <input
                        type="text"
                        value={formData.firma}
                        onChange={(e) => setFormData({ ...formData, firma: e.target.value })}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Stundenlohn (€/h) *
                      </label>
                      <NumberInput
                        value={formData.stundenlohn}
                        onChange={(value) => setFormData({ ...formData, stundenlohn: value })}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                        step={0.5}
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        LKW *
                      </label>
                      <input
                        type="text"
                        value={formData.lkw}
                        onChange={(e) => setFormData({ ...formData, lkw: e.target.value })}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Liefervolumen (t) *
                      </label>
                      <NumberInput
                        value={formData.lieferVolumen}
                        onChange={(value) => setFormData({ ...formData, lieferVolumen: value })}
                        className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none"
                        step={0.1}
                        min={0.1}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleSave}
                      disabled={!formData.name || !formData.firma || !formData.lkw}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      Speichern
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                // Anzeige
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-sm text-gray-600">Name</p>
                        <p className="font-semibold text-gray-900">{lieferant.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Firma</p>
                        <p className="font-semibold text-gray-900">{lieferant.firma}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Stundenlohn</p>
                        <p className="font-semibold text-gray-900">{lieferant.stundenlohn.toFixed(2)} €/h</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">LKW</p>
                        <p className="font-semibold text-gray-900">{lieferant.lkw}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Liefervolumen</p>
                        <p className="font-semibold text-gray-900">{lieferant.lieferVolumen.toFixed(1)} t</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(lieferant)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(lieferant.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LieferantenVerwaltung;

