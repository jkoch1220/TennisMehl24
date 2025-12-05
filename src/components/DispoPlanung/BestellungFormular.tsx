import { useState, useEffect } from 'react';
import { X, Save, MapPin } from 'lucide-react';
import { Bestellung, NeueBestellung, Warenart, AufschlagTyp, BestellungsStatus } from '../../types/bestellung';
import { bestellungService } from '../../services/bestellungService';
import { kundenService } from '../../services/kundenService';
import { Kunde } from '../../types/dispo';
import { geocodeAdresse } from '../../utils/geocoding';
import { NumberInput } from '../NumberInput';

interface BestellungFormularProps {
  bestellung: Bestellung | null;
  onClose: () => void;
}

const BestellungFormular = ({ bestellung, onClose }: BestellungFormularProps) => {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<Kunde | null>(null);
  const [neuerKunde, setNeuerKunde] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [formData, setFormData] = useState<Partial<NeueBestellung>>({
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
    bestelldetails: {
      warenart: 'sackware',
      paletten: 1,
      gewicht: 1000,
      tonnen: 1,
      kundentyp: 'endkunde',
    },
    lieferdatum: undefined, // { von: string, bis: string }
    prioritaet: 'normal',
    status: 'offen',
  });

  useEffect(() => {
    ladeKunden();
    if (bestellung) {
      setFormData({
        ...bestellung,
        lieferdatum: bestellung.lieferdatum
          ? {
              von: bestellung.lieferdatum.von.split('T')[0],
              bis: bestellung.lieferdatum.bis.split('T')[0],
            }
          : undefined,
      });
      if (bestellung.kundennummer) {
        kundenService.sucheKunden(bestellung.kundennummer).then((kunden) => {
          if (kunden.length > 0) {
            setAusgewaehlterKunde(kunden[0]);
          }
        });
      }
    }
  }, [bestellung]);

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
      bestelldetails: {
        ...formData.bestelldetails!,
        kundentyp: kunde.kundentyp,
      },
    });
    setNeuerKunde(false);
  };

  const handleGeocode = async () => {
    if (!formData.adresse?.plz) {
      alert('Bitte geben Sie mindestens eine PLZ ein.');
      return;
    }

    setIsGeocoding(true);
    try {
      const koordinaten = await geocodeAdresse(
        formData.adresse.strasse || '',
        formData.adresse.plz,
        formData.adresse.ort || ''
      );

      if (koordinaten) {
        setFormData({
          ...formData,
          adresse: {
            ...formData.adresse!,
            koordinaten,
          },
        });
        alert('Koordinaten erfolgreich ermittelt!');
      } else {
        alert(
          'Koordinaten konnten nicht ermittelt werden.\n\n' +
          'Mögliche Lösungen:\n' +
          '• Überprüfen Sie die Adresse auf Tippfehler\n' +
          '• Versuchen Sie es mit einer vereinfachten Adresse (nur PLZ und Ort)\n' +
          '• Die Adresse wird beim Speichern automatisch erneut versucht'
        );
      }
    } catch (error) {
      console.error('Fehler beim Geocoding:', error);
      alert('Fehler beim Ermitteln der Koordinaten');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSpeichern = async () => {
    setIsLoading(true);
    try {
      // Automatisches Geocoding, falls keine Koordinaten vorhanden sind
      let adresseMitKoordinaten = formData.adresse!;
      if (!adresseMitKoordinaten.koordinaten && adresseMitKoordinaten.plz) {
        try {
          const koordinaten = await geocodeAdresse(
            adresseMitKoordinaten.strasse || '',
            adresseMitKoordinaten.plz,
            adresseMitKoordinaten.ort || ''
          );
          if (koordinaten) {
            adresseMitKoordinaten = {
              ...adresseMitKoordinaten,
              koordinaten,
            };
            console.log('✅ Koordinaten automatisch ermittelt:', koordinaten);
          } else {
            console.warn('⚠️ Koordinaten konnten nicht automatisch ermittelt werden - Bestellung wird ohne Koordinaten gespeichert');
          }
        } catch (error) {
          console.error('Fehler beim automatischen Geocoding:', error);
        }
      }

      const tonnen = formData.bestelldetails!.gewicht / 1000;
      const neueBestellung: NeueBestellung = {
        kundenname: formData.kundenname!,
        kundennummer: formData.kundennummer,
        adresse: adresseMitKoordinaten,
        kontakt: formData.kontakt,
        bestelldetails: {
          ...formData.bestelldetails!,
          tonnen,
        },
        lieferdatum: formData.lieferdatum
          ? {
              von: new Date(formData.lieferdatum.von + 'T00:00:00').toISOString(),
              bis: new Date(formData.lieferdatum.bis + 'T23:59:59').toISOString(),
            }
          : undefined,
        prioritaet: formData.prioritaet!,
        status: formData.status!,
        notizen: formData.notizen,
        erstelltAm: bestellung?.erstelltAm || new Date().toISOString(),
        geaendertAm: new Date().toISOString(),
      };

      if (bestellung) {
        await bestellungService.updateBestellung(bestellung.id, neueBestellung as Bestellung);
      } else {
        await bestellungService.createBestellung(neueBestellung);
      }

      onClose();
    } catch (error) {
      console.error('Fehler beim Speichern der Bestellung:', error);
      alert('Fehler beim Speichern der Bestellung');
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
            {bestellung ? 'Bestellung bearbeiten' : 'Neue Bestellung'}
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
                    const kunde = kunden.find((k) => k.id === e.target.value);
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
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Adresse
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Straße"
                value={formData.adresse?.strasse || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    adresse: { ...formData.adresse!, strasse: e.target.value },
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="PLZ"
                  value={formData.adresse?.plz || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      adresse: { ...formData.adresse!, plz: e.target.value },
                    })
                  }
                  className="p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Ort"
                  value={formData.adresse?.ort || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      adresse: { ...formData.adresse!, ort: e.target.value },
                    })
                  }
                  className="col-span-2 p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                />
              </div>
              <button
                onClick={handleGeocode}
                disabled={isGeocoding}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <MapPin className="w-4 h-4" />
                {isGeocoding ? 'Ermittle Koordinaten...' : 'Koordinaten ermitteln'}
              </button>
              {formData.adresse?.koordinaten && (
                <p className="text-xs text-green-600">
                  ✓ Koordinaten: {formData.adresse.koordinaten[0].toFixed(4)},{' '}
                  {formData.adresse.koordinaten[1].toFixed(4)}
                </p>
              )}
            </div>
          </div>

          {/* Bestelldetails */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Warenart
              </label>
              <select
                value={formData.bestelldetails?.warenart}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bestelldetails: {
                      ...formData.bestelldetails!,
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
                value={formData.bestelldetails?.kundentyp}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bestelldetails: {
                      ...formData.bestelldetails!,
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
                value={formData.bestelldetails?.paletten || 1}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    bestelldetails: {
                      ...formData.bestelldetails!,
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
                value={formData.bestelldetails?.gewicht || 1000}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    bestelldetails: {
                      ...formData.bestelldetails!,
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

          {/* Status & Priorität */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as BestellungsStatus,
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="offen">Offen</option>
                <option value="geplant">Geplant</option>
                <option value="in_produktion">In Produktion</option>
                <option value="bereit">Bereit</option>
                <option value="geliefert">Geliefert</option>
                <option value="storniert">Storniert</option>
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
                    prioritaet: e.target.value as 'hoch' | 'normal' | 'niedrig',
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
                Lieferdatum von
              </label>
              <input
                type="date"
                value={formData.lieferdatum?.von || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lieferdatum: e.target.value
                      ? {
                          von: e.target.value,
                          bis: formData.lieferdatum?.bis || e.target.value,
                        }
                      : undefined,
                  })
                }
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Lieferdatum bis */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Lieferdatum bis
              </label>
              <input
                type="date"
                value={formData.lieferdatum?.bis || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lieferdatum: e.target.value
                      ? {
                          von: formData.lieferdatum?.von || e.target.value,
                          bis: e.target.value,
                        }
                      : undefined,
                  })
                }
                min={formData.lieferdatum?.von}
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
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

export default BestellungFormular;



