import { useState, useEffect } from 'react';
import { Plus, Users, Edit, Trash2, Search } from 'lucide-react';
import { Kunde, NeuerKunde } from '../../types/dispo';
import { kundenService } from '../../services/kundenService';

const KundenVerwaltung = () => {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [suchbegriff, setSuchbegriff] = useState('');
  const [showFormular, setShowFormular] = useState(false);
  const [bearbeiteKunde, setBearbeiteKunde] = useState<Kunde | null>(null);

  const [formData, setFormData] = useState<Partial<NeuerKunde>>({
    kundennummer: '',
    name: '',
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
    kundentyp: 'endkunde',
    lieferhinweise: '',
    zahlungsbedingungen: '',
    lieferhistorie: [],
  });

  useEffect(() => {
    ladeKunden();
  }, []);

  const ladeKunden = async () => {
    setIsLoading(true);
    try {
      const alleKunden = await kundenService.loadAlleKunden();
      setKunden(alleKunden);
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeichern = async () => {
    try {
      if (bearbeiteKunde) {
        await kundenService.updateKunde(bearbeiteKunde.id, formData as Partial<Kunde>);
      } else {
        await kundenService.createKunde(formData as NeuerKunde);
      }
      setShowFormular(false);
      setBearbeiteKunde(null);
      ladeKunden();
    } catch (error) {
      console.error('Fehler beim Speichern des Kunden:', error);
      alert('Fehler beim Speichern des Kunden');
    }
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Möchten Sie diesen Kunden wirklich löschen?')) return;
    
    try {
      await kundenService.deleteKunde(id);
      ladeKunden();
    } catch (error) {
      console.error('Fehler beim Löschen des Kunden:', error);
      alert('Fehler beim Löschen des Kunden');
    }
  };

  const gefilterteKunden = suchbegriff
    ? kunden.filter(
        (k) =>
          k.name.toLowerCase().includes(suchbegriff.toLowerCase()) ||
          k.kundennummer.toLowerCase().includes(suchbegriff.toLowerCase()) ||
          k.adresse.ort.toLowerCase().includes(suchbegriff.toLowerCase())
      )
    : kunden;

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
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Kunden suchen..."
                value={suchbegriff}
                onChange={(e) => setSuchbegriff(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => {
              setBearbeiteKunde(null);
              setFormData({
                kundennummer: '',
                name: '',
                adresse: { strasse: '', plz: '', ort: '' },
                kontakt: { name: '', telefon: '', email: '' },
                kundentyp: 'endkunde',
                lieferhinweise: '',
                zahlungsbedingungen: '',
                lieferhistorie: [],
              });
              setShowFormular(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neuer Kunde
          </button>
        </div>

        {/* Kunden Liste */}
        {gefilterteKunden.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>Keine Kunden gefunden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gefilterteKunden.map((kunde) => (
              <div
                key={kunde.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {kunde.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {kunde.kundennummer}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setBearbeiteKunde(kunde);
                        setFormData(kunde);
                        setShowFormular(true);
                      }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleLoeschen(kunde.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div>
                    📍 {kunde.adresse.strasse}, {kunde.adresse.plz} {kunde.adresse.ort}
                  </div>
                  {kunde.kontakt.telefon && (
                    <div>📞 {kunde.kontakt.telefon}</div>
                  )}
                  {kunde.kontakt.email && (
                    <div>✉️ {kunde.kontakt.email}</div>
                  )}
                  <div className="mt-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        kunde.kundentyp === 'endkunde'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {kunde.kundentyp === 'endkunde' ? 'Endkunde' : 'Großkunde'}
                    </span>
                  </div>
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
                {bearbeiteKunde ? 'Kunde bearbeiten' : 'Neuer Kunde'}
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Kundennummer
                    </label>
                    <input
                      type="text"
                      value={formData.kundennummer || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, kundennummer: e.target.value })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
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

                <div className="grid grid-cols-2 gap-4">
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
                  <div>
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

                <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-4">
                  Kontakt
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Kontaktperson
                    </label>
                    <input
                      type="text"
                      value={formData.kontakt?.name || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          kontakt: { ...formData.kontakt!, name: e.target.value },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Telefon
                    </label>
                    <input
                      type="text"
                      value={formData.kontakt?.telefon || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          kontakt: { ...formData.kontakt!, telefon: e.target.value },
                        })
                      }
                      className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={formData.kontakt?.email || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        kontakt: { ...formData.kontakt!, email: e.target.value },
                      })
                    }
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Kundentyp
                  </label>
                  <select
                    value={formData.kundentyp}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        kundentyp: e.target.value as 'endkunde' | 'grosskunde',
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
                    Lieferhinweise
                  </label>
                  <textarea
                    value={formData.lieferhinweise || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, lieferhinweise: e.target.value })
                    }
                    rows={3}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    placeholder="z.B. Nur vormittags, Hofeinfahrt eng..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowFormular(false);
                    setBearbeiteKunde(null);
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

export default KundenVerwaltung;




