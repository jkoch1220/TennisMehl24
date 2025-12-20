import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, MapPin, Package, X, AlertTriangle } from 'lucide-react';
import { Konkurrent, NeuerKonkurrent, ProduktTyp, LieferkostenModell } from '../../types/konkurrent';
import { konkurrentService } from '../../services/konkurrentService';
import KonkurrentenKarte from './KonkurrentenKarte';

const KonkurrentenVerwaltung = () => {
  const [konkurrenten, setKonkurrenten] = useState<Konkurrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [konkurrentToDelete, setKonkurrentToDelete] = useState<Konkurrent | null>(null);
  const [editingKonkurrent, setEditingKonkurrent] = useState<Konkurrent | null>(null);
  const [formData, setFormData] = useState<Partial<NeuerKonkurrent>>({
    name: '',
    produkte: [],
    adresse: {
      strasse: '',
      plz: '',
      ort: '',
    },
    lieferkostenModell: {
      typ: 'fest',
      festerPreisProTonne: 0,
    },
  });

  useEffect(() => {
    loadKonkurrenten();
  }, []);

  const loadKonkurrenten = async () => {
    try {
      setLoading(true);
      const data = await konkurrentService.loadAlleKonkurrenten();
      setKonkurrenten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Konkurrenten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingKonkurrent) {
        await konkurrentService.updateKonkurrent(editingKonkurrent.id, formData as Partial<Konkurrent>);
      } else {
        await konkurrentService.createKonkurrent(formData as NeuerKonkurrent);
      }
      setShowFormular(false);
      setEditingKonkurrent(null);
      setFormData({
        name: '',
        produkte: [],
        adresse: {
          strasse: '',
          plz: '',
          ort: '',
        },
        lieferkostenModell: {
          typ: 'fest',
          festerPreisProTonne: 0,
        },
      });
      loadKonkurrenten();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern des Konkurrenten');
    }
  };

  const handleEdit = (konkurrent: Konkurrent) => {
    setEditingKonkurrent(konkurrent);
    setFormData({
      name: konkurrent.name,
      produkte: konkurrent.produkte,
      adresse: konkurrent.adresse,
      kontakt: konkurrent.kontakt,
      lieferkostenModell: konkurrent.lieferkostenModell,
      notizen: konkurrent.notizen,
    });
    setShowFormular(true);
  };

  const handleDeleteClick = (konkurrent: Konkurrent) => {
    setKonkurrentToDelete(konkurrent);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!konkurrentToDelete) return;
    
    try {
      await konkurrentService.deleteKonkurrent(konkurrentToDelete.id);
      setShowDeleteModal(false);
      setKonkurrentToDelete(null);
      loadKonkurrenten();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Konkurrenten');
    }
  };

  const handleProduktToggle = (produkt: ProduktTyp) => {
    const aktuelleProdukte = formData.produkte || [];
    const neueProdukte = aktuelleProdukte.includes(produkt)
      ? aktuelleProdukte.filter(p => p !== produkt)
      : [...aktuelleProdukte, produkt];
    setFormData({ ...formData, produkte: neueProdukte });
  };

  const updateLieferkostenModell = (updates: Partial<LieferkostenModell>) => {
    setFormData({
      ...formData,
      lieferkostenModell: {
        ...formData.lieferkostenModell!,
        ...updates,
      } as LieferkostenModell,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Konkurrenten...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Konkurrenten-Verwaltung</h1>
            <p className="text-gray-600 dark:text-dark-textMuted mt-2">
              Verwalten Sie Konkurrenten und analysieren Sie Lieferkosten
            </p>
          </div>
          <button
            onClick={() => {
              setShowFormular(true);
              setEditingKonkurrent(null);
              setFormData({
                name: '',
                produkte: [],
                adresse: {
                  strasse: '',
                  plz: '',
                  ort: '',
                },
                lieferkostenModell: {
                  typ: 'fest',
                  festerPreisProTonne: 0,
                },
              });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neuer Konkurrent
          </button>
        </div>

        {/* Modal für Formular */}
        {showFormular && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowFormular(false);
                setEditingKonkurrent(null);
                setFormData({
                  name: '',
                  produkte: [],
                  adresse: {
                    strasse: '',
                    plz: '',
                    ort: '',
                  },
                  lieferkostenModell: {
                    typ: 'fest',
                    festerPreisProTonne: 0,
                  },
                });
              }
            }}
          >
            <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">
                  {editingKonkurrent ? 'Konkurrent bearbeiten' : 'Neuer Konkurrent'}
                </h2>
                <button
                  onClick={() => {
                    setShowFormular(false);
                    setEditingKonkurrent(null);
                    setFormData({
                      name: '',
                      produkte: [],
                      adresse: {
                        strasse: '',
                        plz: '',
                        ort: '',
                      },
                      lieferkostenModell: {
                        typ: 'fest',
                        festerPreisProTonne: 0,
                      },
                    });
                  }}
                  className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  Produkte *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.produkte?.includes('tennissand') || false}
                      onChange={() => handleProduktToggle('tennissand')}
                      className="w-4 h-4"
                    />
                    <span>Tennis-Sand</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.produkte?.includes('tennismehl') || false}
                      onChange={() => handleProduktToggle('tennismehl')}
                      className="w-4 h-4"
                    />
                    <span>Tennis-Mehl</span>
                  </label>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    Straße
                  </label>
                  <input
                    type="text"
                    value={formData.adresse?.strasse || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      adresse: { ...formData.adresse!, strasse: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    PLZ *
                  </label>
                  <input
                    type="text"
                    value={formData.adresse?.plz || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      adresse: { ...formData.adresse!, plz: e.target.value.replace(/\D/g, '').slice(0, 5) }
                    })}
                    required
                    maxLength={5}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    Ort *
                  </label>
                  <input
                    type="text"
                    value={formData.adresse?.ort || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      adresse: { ...formData.adresse!, ort: e.target.value }
                    })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  Lieferkosten-Modell
                </label>
                <select
                  value={formData.lieferkostenModell?.typ || 'fest'}
                  onChange={(e) => {
                    const typ = e.target.value as 'fest' | 'pro_km' | 'pro_tonne_km' | 'zonen';
                    updateLieferkostenModell({ typ });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="fest">Fester Preis pro Tonne</option>
                  <option value="pro_km">Preis pro Kilometer</option>
                  <option value="pro_tonne_km">Preis pro Tonne pro Kilometer</option>
                  <option value="zonen">Zonen-basiert (nach PLZ)</option>
                </select>
              </div>

              {formData.lieferkostenModell?.typ === 'fest' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    Fester Preis pro Tonne (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.lieferkostenModell.festerPreisProTonne || 0}
                    onChange={(e) => updateLieferkostenModell({
                      festerPreisProTonne: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

              {formData.lieferkostenModell?.typ === 'pro_km' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    Preis pro Kilometer (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.lieferkostenModell.preisProKm || 0}
                    onChange={(e) => updateLieferkostenModell({
                      preisProKm: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

              {formData.lieferkostenModell?.typ === 'pro_tonne_km' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                    Preis pro Tonne pro Kilometer (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.lieferkostenModell.preisProTonneKm || 0}
                    onChange={(e) => updateLieferkostenModell({
                      preisProTonneKm: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

                <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-dark-border">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    {editingKonkurrent ? 'Aktualisieren' : 'Erstellen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFormular(false);
                      setEditingKonkurrent(null);
                      setFormData({
                        name: '',
                        produkte: [],
                        adresse: {
                          strasse: '',
                          plz: '',
                          ort: '',
                        },
                        lieferkostenModell: {
                          typ: 'fest',
                          festerPreisProTonne: 0,
                        },
                      });
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 dark:text-dark-textMuted rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal für Löschbestätigung */}
        {showDeleteModal && konkurrentToDelete && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowDeleteModal(false);
                setKonkurrentToDelete(null);
              }
            }}
          >
            <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-md w-full">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">
                    Konkurrent löschen?
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setKonkurrentToDelete(null);
                  }}
                  className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                <p className="text-gray-700 dark:text-dark-textMuted mb-4">
                  Möchten Sie den Konkurrenten <strong>{konkurrentToDelete.name}</strong> wirklich löschen?
                </p>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setKonkurrentToDelete(null);
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 dark:text-dark-textMuted rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Konkurrenten-Karte */}
        <KonkurrentenKarte />

        {/* Konkurrenten-Liste */}
        {konkurrenten.length > 0 && (
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Alle Konkurrenten</h2>
            <div className="space-y-4">
              {konkurrenten.map((konkurrent) => (
                <div
                  key={konkurrent.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-dark-border"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-dark-text">{konkurrent.name}</div>
                    <div className="text-sm text-gray-600 dark:text-dark-textMuted mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {konkurrent.adresse.plz} {konkurrent.adresse.ort}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        {konkurrent.produkte.map(p => p === 'tennissand' ? 'Tennis-Sand' : 'Tennis-Mehl').join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(konkurrent)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(konkurrent)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KonkurrentenVerwaltung;
