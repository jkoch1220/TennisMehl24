import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Lieferung, NeueLieferung, Warenart, AufschlagTyp, Lieferart, Prioritaet, LieferungStatus } from '../../types/dispo';
import { lieferungService } from '../../services/lieferungService';
import { kundenService } from '../../services/kundenService';
import { Kunde } from '../../types/dispo';
import { NumberInput } from '../NumberInput';

interface LieferungFormularProps {
  lieferung: Lieferung | null;
  onClose: () => void;
}

const LieferungFormular = ({ lieferung, onClose }: LieferungFormularProps) => {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<Kunde | null>(null);
  const [neuerKunde, setNeuerKunde] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<Partial<NeueLieferung>>({
    kundenname: '',
    kundennummer: '',
    adresse: {
      strasse: '',
      plz: '',
      ort: '',
    },
    kontakt: {
      name: '',
      telefon: '',
      email: '',
    },
    lieferdetails: {
      warenart: 'sackware',
      paletten: 1,
      gewicht: 1000,
      tonnen: 1,
      kundentyp: 'endkunde',
    },
    zeitfenster: {
      gewuenscht: new Date().toISOString().split('T')[0],
      zeitfenster: {
        von: '08:00',
        bis: '17:00',
      },
    },
    status: 'geplant',
    prioritaet: 'normal',
    lieferart: 'eigenlieferung',
  });

  useEffect(() => {
    ladeKunden();
    if (lieferung) {
      setFormData({
        ...lieferung,
        zeitfenster: {
          ...lieferung.zeitfenster,
          gewuenscht: lieferung.zeitfenster.gewuenscht.split('T')[0],
        },
      });
      // Finde Kunde falls vorhanden
      if (lieferung.kundennummer) {
        kundenService.sucheKunden(lieferung.kundennummer).then((kunden) => {
          if (kunden.length > 0) {
            setAusgewaehlterKunde(kunden[0]);
          }
        });
      }
    }
  }, [lieferung]);

  const ladeKunden = async () => {
    try {
      const alleKunden = await kundenService.loadAlleKunden();
      setKunden(alleKunden);
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
    }
  };

  const handleKundeAuswaehlen = (kunde: Kunde) => {
    setAusgewaehlterKunde(kunde);
    setFormData({
      ...formData,
      kundenname: kunde.name,
      kundennummer: kunde.kundennummer,
      adresse: kunde.adresse,
      kontakt: kunde.kontakt,
      lieferdetails: {
        ...formData.lieferdetails!,
        kundentyp: kunde.kundentyp,
      },
    });
    setNeuerKunde(false);
  };

  const handleSpeichern = async () => {
    setIsLoading(true);
    try {
      const tonnen = formData.lieferdetails!.gewicht / 1000;
      const neueLieferung: NeueLieferung = {
        kundenname: formData.kundenname!,
        kundennummer: formData.kundennummer,
        adresse: formData.adresse!,
        kontakt: formData.kontakt,
        lieferdetails: {
          ...formData.lieferdetails!,
          tonnen,
        },
        zeitfenster: {
          gewuenscht: new Date(formData.zeitfenster!.gewuenscht + 'T12:00:00').toISOString(),
          zeitfenster: formData.zeitfenster!.zeitfenster,
        },
        status: formData.status!,
        prioritaet: formData.prioritaet!,
        lieferart: formData.lieferart!,
        erstelltAm: lieferung?.erstelltAm || new Date().toISOString(),
        geaendertAm: new Date().toISOString(),
      };

      if (lieferung) {
        await lieferungService.updateLieferung(lieferung.id, neueLieferung as Lieferung);
      } else {
        await lieferungService.createLieferung(neueLieferung);
      }

      onClose();
    } catch (error) {
      console.error('Fehler beim Speichern der Lieferung:', error);
      alert('Fehler beim Speichern der Lieferung');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {lieferung ? 'Lieferung bearbeiten' : 'Neue Lieferung'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formular */}
        <div className="p-6 space-y-6">
          {/* Kunde */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Kunde
            </label>
            {!neuerKunde ? (
              <div className="space-y-2">
                <select
                  value={ausgewaehlterKunde?.id || ''}
                  onChange={(e) => {
                    const kunde = kunden.find(k => k.id === e.target.value);
                    if (kunde) handleKundeAuswaehlen(kunde);
                  }}
                  className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Kunde auswählen...</option>
                  {kunden.map((kunde) => (
                    <option key={kunde.id} value={kunde.id}>
                      {kunde.name} ({kunde.kundennummer})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setNeuerKunde(true)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Neuer Kunde
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Kundenname"
                  value={formData.kundenname || ''}
                  onChange={(e) => setFormData({ ...formData, kundenname: e.target.value })}
                  className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Kundennummer"
                  value={formData.kundennummer || ''}
                  onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
                  className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                />
                <button
                  onClick={() => setNeuerKunde(false)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  ← Zurück zur Auswahl
                </button>
              </div>
            )}
          </div>

          {/* Adresse */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Straße
              </label>
              <input
                type="text"
                value={formData.adresse?.strasse || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    adresse: { ...formData.adresse!, strasse: e.target.value },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                PLZ
              </label>
              <input
                type="text"
                value={formData.adresse?.plz || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    adresse: { ...formData.adresse!, plz: e.target.value },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ort
              </label>
              <input
                type="text"
                value={formData.adresse?.ort || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    adresse: { ...formData.adresse!, ort: e.target.value },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Lieferdetails */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Warenart
              </label>
              <select
                value={formData.lieferdetails?.warenart}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lieferdetails: {
                      ...formData.lieferdetails!,
                      warenart: e.target.value as Warenart,
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="sackware">Sackware</option>
                <option value="schuettware">Schüttware</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Kundentyp
              </label>
              <select
                value={formData.lieferdetails?.kundentyp}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lieferdetails: {
                      ...formData.lieferdetails!,
                      kundentyp: e.target.value as AufschlagTyp,
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="endkunde">Endkunde</option>
                <option value="grosskunde">Großkunde</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Paletten
              </label>
              <NumberInput
                value={formData.lieferdetails?.paletten || 1}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    lieferdetails: {
                      ...formData.lieferdetails!,
                      paletten: value,
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Gewicht (kg)
              </label>
              <NumberInput
                value={formData.lieferdetails?.gewicht || 1000}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    lieferdetails: {
                      ...formData.lieferdetails!,
                      gewicht: value,
                      tonnen: value / 1000,
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                min={1}
              />
            </div>
          </div>

          {/* Zeitfenster */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Gewünschtes Datum
              </label>
              <input
                type="date"
                value={formData.zeitfenster?.gewuenscht || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    zeitfenster: {
                      ...formData.zeitfenster!,
                      gewuenscht: e.target.value,
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Von
              </label>
              <input
                type="time"
                value={formData.zeitfenster?.zeitfenster?.von || '08:00'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    zeitfenster: {
                      ...formData.zeitfenster!,
                      zeitfenster: {
                        ...formData.zeitfenster!.zeitfenster!,
                        von: e.target.value,
                      },
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Bis
              </label>
              <input
                type="time"
                value={formData.zeitfenster?.zeitfenster?.bis || '17:00'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    zeitfenster: {
                      ...formData.zeitfenster!,
                      zeitfenster: {
                        ...formData.zeitfenster!.zeitfenster!,
                        bis: e.target.value,
                      },
                    },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Status & Priorität */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as LieferungStatus,
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="geplant">Geplant</option>
                <option value="bestaetigt">Bestätigt</option>
                <option value="beladen">Beladen</option>
                <option value="unterwegs">Unterwegs</option>
                <option value="geliefert">Geliefert</option>
                <option value="abgerechnet">Abgerechnet</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Priorität
              </label>
              <select
                value={formData.prioritaet}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    prioritaet: e.target.value as Prioritaet,
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="niedrig">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="hoch">Hoch</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Lieferart
              </label>
              <select
                value={formData.lieferart}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lieferart: e.target.value as Lieferart,
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="spedition">Spedition</option>
                <option value="eigenlieferung">Eigenlieferung</option>
              </select>
            </div>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notizen
            </label>
            <textarea
              value={formData.notizen || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notizen: e.target.value,
                })
              }
              rows={3}
              className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              placeholder="Zusätzliche Informationen..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {isLoading ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LieferungFormular;




