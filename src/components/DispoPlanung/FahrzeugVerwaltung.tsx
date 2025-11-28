import { useState, useEffect } from 'react';
import { Plus, Truck, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Fahrzeug, NeuesFahrzeug, EigenlieferungStammdaten } from '../../types/dispo';
import { fahrzeugService } from '../../services/fahrzeugService';
import { NumberInput } from '../NumberInput';

const FahrzeugVerwaltung = () => {
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [bearbeiteFahrzeug, setBearbeiteFahrzeug] = useState<Fahrzeug | null>(null);

  const [formData, setFormData] = useState<Partial<NeuesFahrzeug>>({
    kennzeichen: '',
    typ: '',
    kapazitaetTonnen: 7.5,
    stammdaten: {
      dieselverbrauchDurchschnitt: 30.0,
      durchschnittsgeschwindigkeit: 60.0,
      dieselLiterKostenBrutto: 1.50,
      beladungszeit: 30,
      abladungszeit: 30,
      pausenzeit: 45,
      verschleisspauschaleProKm: 0.50,
      lkwLadungInTonnen: 7.5,
    },
    verfuegbarkeit: {
      verfuegbar: true,
    },
    fahrer: '',
    statistik: {
      gesamtKilometer: 0,
      gesamtLieferungen: 0,
      durchschnittlicheAuslastung: 0,
    },
  });

  useEffect(() => {
    ladeFahrzeuge();
  }, []);

  const ladeFahrzeuge = async () => {
    setIsLoading(true);
    try {
      const geladeneFahrzeuge = await fahrzeugService.loadAlleFahrzeuge();
      setFahrzeuge(geladeneFahrzeuge);
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeuge:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeichern = async () => {
    try {
      if (bearbeiteFahrzeug) {
        await fahrzeugService.updateFahrzeug(bearbeiteFahrzeug.id, formData as Partial<Fahrzeug>);
      } else {
        await fahrzeugService.createFahrzeug(formData as NeuesFahrzeug);
      }
      setShowFormular(false);
      setBearbeiteFahrzeug(null);
      ladeFahrzeuge();
    } catch (error) {
      console.error('Fehler beim Speichern des Fahrzeugs:', error);
      alert('Fehler beim Speichern des Fahrzeugs');
    }
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Möchten Sie dieses Fahrzeug wirklich löschen?')) return;
    
    try {
      await fahrzeugService.deleteFahrzeug(id);
      ladeFahrzeuge();
    } catch (error) {
      console.error('Fehler beim Löschen des Fahrzeugs:', error);
      alert('Fehler beim Löschen des Fahrzeugs');
    }
  };

  const oeffneBearbeitung = (fahrzeug: Fahrzeug) => {
    setBearbeiteFahrzeug(fahrzeug);
    setFormData(fahrzeug);
    setShowFormular(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Toolbar */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Fahrzeugverwaltung</h2>
          <button
            onClick={() => {
              setBearbeiteFahrzeug(null);
              setFormData({
                kennzeichen: '',
                typ: '',
                kapazitaetTonnen: 7.5,
                stammdaten: {
                  dieselverbrauchDurchschnitt: 30.0,
                  durchschnittsgeschwindigkeit: 60.0,
                  dieselLiterKostenBrutto: 1.50,
                  beladungszeit: 30,
                  abladungszeit: 30,
                  pausenzeit: 45,
                  verschleisspauschaleProKm: 0.50,
                  lkwLadungInTonnen: 7.5,
                },
                verfuegbarkeit: {
                  verfuegbar: true,
                },
                fahrer: '',
                statistik: {
                  gesamtKilometer: 0,
                  gesamtLieferungen: 0,
                  durchschnittlicheAuslastung: 0,
                },
              });
              setShowFormular(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neues Fahrzeug
          </button>
        </div>

        {/* Fahrzeuge Liste */}
        {fahrzeuge.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>Keine Fahrzeuge vorhanden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fahrzeuge.map((fahrzeug) => (
              <div
                key={fahrzeug.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {fahrzeug.kennzeichen}
                    </h3>
                    <p className="text-sm text-gray-600">{fahrzeug.typ}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {fahrzeug.verfuegbarkeit.verfuegbar ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <button
                      onClick={() => oeffneBearbeitung(fahrzeug)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleLoeschen(fahrzeug.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>Kapazität: {fahrzeug.kapazitaetTonnen} t</div>
                  {fahrzeug.fahrer && <div>Fahrer: {fahrzeug.fahrer}</div>}
                  <div>Verbrauch: {fahrzeug.stammdaten.dieselverbrauchDurchschnitt} L/100km</div>
                  <div>Verschleiß: {fahrzeug.stammdaten.verschleisspauschaleProKm.toFixed(2)} €/km</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formular Modal */}
      {showFormular && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {bearbeiteFahrzeug ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Kennzeichen
                    </label>
                    <input
                      type="text"
                      value={formData.kennzeichen || ''}
                      onChange={(e) => setFormData({ ...formData, kennzeichen: e.target.value })}
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Typ
                    </label>
                    <input
                      type="text"
                      value={formData.typ || ''}
                      onChange={(e) => setFormData({ ...formData, typ: e.target.value })}
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      placeholder="z.B. LKW 7,5t"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Kapazität (Tonnen)
                  </label>
                  <NumberInput
                    value={formData.kapazitaetTonnen || 7.5}
                    onChange={(value) => setFormData({ ...formData, kapazitaetTonnen: value })}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    min={0.1}
                    step={0.1}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Fahrer
                  </label>
                  <input
                    type="text"
                    value={formData.fahrer || ''}
                    onChange={(e) => setFormData({ ...formData, fahrer: e.target.value })}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-4">
                  Stammdaten
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Dieselverbrauch (L/100km)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.dieselverbrauchDurchschnitt || 30}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            dieselverbrauchDurchschnitt: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                      step={0.1}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Durchschnittsgeschwindigkeit (km/h)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.durchschnittsgeschwindigkeit || 60}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            durchschnittsgeschwindigkeit: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Dieselpreis (€/L)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.dieselLiterKostenBrutto || 1.5}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            dieselLiterKostenBrutto: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Verschleißpauschale (€/km)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.verschleisspauschaleProKm || 0.5}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            verschleisspauschaleProKm: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Beladungszeit (Minuten)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.beladungszeit || 30}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            beladungszeit: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Abladungszeit (Minuten)
                    </label>
                    <NumberInput
                      value={formData.stammdaten?.abladungszeit || 30}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          stammdaten: {
                            ...formData.stammdaten!,
                            abladungszeit: value,
                          },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                      min={0}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="verfuegbar"
                    checked={formData.verfuegbarkeit?.verfuegbar ?? true}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        verfuegbarkeit: {
                          ...formData.verfuegbarkeit!,
                          verfuegbar: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4"
                  />
                  <label htmlFor="verfuegbar" className="text-sm font-semibold text-gray-700">
                    Verfügbar
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowFormular(false);
                    setBearbeiteFahrzeug(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSpeichern}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FahrzeugVerwaltung;

