import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  NeuerSaisonKunde,
  NeuerAnsprechpartner,
  Telefonnummer,
  KundenTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import AdressAutocomplete from './AdressAutocomplete';

interface KundenFormularProps {
  kunde?: SaisonKundeMitDaten | null;
  saisonjahr: number;
  onSave: () => void;
  onCancel: () => void;
}

const KundenFormular = ({ kunde, saisonjahr, onSave, onCancel }: KundenFormularProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<NeuerSaisonKunde>>({
    typ: 'verein',
    name: '',
    kundennummer: '',
    adresse: {
      strasse: '',
      plz: '',
      ort: '',
    },
    email: '',
    notizen: '',
    aktiv: true,
  });

  const [ansprechpartner, setAnsprechpartner] = useState<NeuerAnsprechpartner[]>([]);
  const [neuerAnsprechpartner, setNeuerAnsprechpartner] = useState<Partial<NeuerAnsprechpartner>>({
    name: '',
    rolle: '',
    email: '',
    telefonnummern: [],
    bevorzugterKontaktweg: 'telefon',
    notizen: '',
    aktiv: true,
  });

  useEffect(() => {
    if (kunde) {
      setFormData({
        typ: kunde.kunde.typ,
        name: kunde.kunde.name,
        kundennummer: kunde.kunde.kundennummer || '',
        adresse: kunde.kunde.adresse,
        email: kunde.kunde.email || '',
        notizen: kunde.kunde.notizen || '',
        aktiv: kunde.kunde.aktiv,
      });
      setAnsprechpartner(
        kunde.ansprechpartner.map((ap) => ({
          ...ap,
          kundeId: kunde.kunde.id,
        }))
      );
    } else {
      // Reset für neuen Kunden
      setFormData({
        typ: 'verein',
        name: '',
        kundennummer: '',
        adresse: { strasse: '', plz: '', ort: '' },
        email: '',
        notizen: '',
        aktiv: true,
      });
      setAnsprechpartner([]);
    }
  }, [kunde]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validiere Pflichtfelder
      if (!formData.name || !formData.typ) {
        setError('Name und Typ sind Pflichtfelder');
        setLoading(false);
        return;
      }

      let kundeId: string;

      if (kunde) {
        // Update bestehender Kunde
        const updated = await saisonplanungService.updateKunde(kunde.kunde.id, {
          ...formData,
          adresse: formData.adresse || { strasse: '', plz: '', ort: '' },
        } as Partial<NeuerSaisonKunde>);
        kundeId = updated.id;
      } else {
        // Erstelle neuen Kunden
        const created = await saisonplanungService.createKunde({
          ...formData,
          adresse: formData.adresse || { strasse: '', plz: '', ort: '' },
        } as NeuerSaisonKunde);
        kundeId = created.id;
      }

      // Speichere Ansprechpartner
      const bestehendeAnsprechpartner = kunde?.ansprechpartner || [];
      
      // Lösche entfernte Ansprechpartner
      const zuLoeschendeIds = bestehendeAnsprechpartner
        .filter((ap) => !ansprechpartner.find((nap) => nap.id === ap.id))
        .map((ap) => ap.id);
      
      await Promise.all(
        zuLoeschendeIds.map((id) => saisonplanungService.deleteAnsprechpartner(id))
      );

      // Erstelle/Update Ansprechpartner
      for (const ap of ansprechpartner) {
        if (ap.id && bestehendeAnsprechpartner.find((bap) => bap.id === ap.id)) {
          // Update bestehender
          await saisonplanungService.updateAnsprechpartner(ap.id, ap);
        } else {
          // Erstelle neuen
          await saisonplanungService.createAnsprechpartner({
            ...ap,
            kundeId,
          });
        }
      }

      onSave();
    } catch (err: any) {
      console.error('Fehler beim Speichern:', err);
      setError(err.message || 'Fehler beim Speichern des Kunden');
    } finally {
      setLoading(false);
    }
  };

  const addAnsprechpartner = () => {
    if (!neuerAnsprechpartner.name) {
      alert('Bitte geben Sie einen Namen ein');
      return;
    }
    setAnsprechpartner([...ansprechpartner, neuerAnsprechpartner as NeuerAnsprechpartner]);
    setNeuerAnsprechpartner({
      name: '',
      rolle: '',
      email: '',
      telefonnummern: [],
      bevorzugterKontaktweg: 'telefon',
      notizen: '',
      aktiv: true,
    });
  };

  const removeAnsprechpartner = (index: number) => {
    setAnsprechpartner(ansprechpartner.filter((_, i) => i !== index));
  };

  const addTelefonnummer = (apIndex: number) => {
    const updated = [...ansprechpartner];
    updated[apIndex] = {
      ...updated[apIndex],
      telefonnummern: [
        ...(updated[apIndex].telefonnummern || []),
        { nummer: '', typ: '', beschreibung: '' },
      ],
    };
    setAnsprechpartner(updated);
  };

  const updateTelefonnummer = (
    apIndex: number,
    telIndex: number,
    field: keyof Telefonnummer,
    value: string
  ) => {
    const updated = [...ansprechpartner];
    const telefonnummern = [...(updated[apIndex].telefonnummern || [])];
    telefonnummern[telIndex] = {
      ...telefonnummern[telIndex],
      [field]: value,
    };
    updated[apIndex] = {
      ...updated[apIndex],
      telefonnummern,
    };
    setAnsprechpartner(updated);
  };

  const removeTelefonnummer = (apIndex: number, telIndex: number) => {
    const updated = [...ansprechpartner];
    updated[apIndex] = {
      ...updated[apIndex],
      telefonnummern: (updated[apIndex].telefonnummern || []).filter((_, i) => i !== telIndex),
    };
    setAnsprechpartner(updated);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {kunde ? 'Kunde bearbeiten' : 'Neuer Kunde'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Grunddaten */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Grunddaten</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Typ <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.typ || 'verein'}
                  onChange={(e) => setFormData({ ...formData, typ: e.target.value as KundenTyp })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                >
                  <option value="verein">Verein</option>
                  <option value="platzbauer">Platzbauer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kundennummer
                </label>
                <input
                  type="text"
                  value={formData.kundennummer || ''}
                  onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Adresse mit Autovervollständigung */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Adresse</h4>
              <AdressAutocomplete
                strasse={formData.adresse?.strasse || ''}
                plz={formData.adresse?.plz || ''}
                ort={formData.adresse?.ort || ''}
                onAdresseChange={(adresse) =>
                  setFormData({
                    ...formData,
                    adresse,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
              <textarea
                value={formData.notizen || ''}
                onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Ansprechpartner */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Ansprechpartner</h3>
            </div>

            {ansprechpartner.map((ap, apIndex) => (
              <div key={apIndex} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={ap.name || ''}
                        onChange={(e) => {
                          const updated = [...ansprechpartner];
                          updated[apIndex] = { ...updated[apIndex], name: e.target.value };
                          setAnsprechpartner(updated);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                      <input
                        type="text"
                        placeholder="z.B. Platzwart, Vorstand"
                        value={ap.rolle || ''}
                        onChange={(e) => {
                          const updated = [...ansprechpartner];
                          updated[apIndex] = { ...updated[apIndex], rolle: e.target.value };
                          setAnsprechpartner(updated);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                      <input
                        type="email"
                        value={ap.email || ''}
                        onChange={(e) => {
                          const updated = [...ansprechpartner];
                          updated[apIndex] = { ...updated[apIndex], email: e.target.value };
                          setAnsprechpartner(updated);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAnsprechpartner(apIndex)}
                    className="ml-4 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Telefonnummern */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Telefonnummern</label>
                    <button
                      type="button"
                      onClick={() => addTelefonnummer(apIndex)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Hinzufügen
                    </button>
                  </div>
                  {(ap.telefonnummern || []).map((tel, telIndex) => (
                    <div key={telIndex} className="flex gap-2">
                      <input
                        type="tel"
                        placeholder="Nummer"
                        value={tel.nummer || ''}
                        onChange={(e) =>
                          updateTelefonnummer(apIndex, telIndex, 'nummer', e.target.value)
                        }
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <input
                        type="text"
                        placeholder="Typ (z.B. Mobil)"
                        value={tel.typ || ''}
                        onChange={(e) =>
                          updateTelefonnummer(apIndex, telIndex, 'typ', e.target.value)
                        }
                        className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeTelefonnummer(apIndex, telIndex)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Neuer Ansprechpartner */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={neuerAnsprechpartner.name || ''}
                    onChange={(e) =>
                      setNeuerAnsprechpartner({ ...neuerAnsprechpartner, name: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                  <input
                    type="text"
                    placeholder="z.B. Platzwart, Vorstand"
                    value={neuerAnsprechpartner.rolle || ''}
                    onChange={(e) =>
                      setNeuerAnsprechpartner({ ...neuerAnsprechpartner, rolle: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addAnsprechpartner}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Ansprechpartner hinzufügen
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KundenFormular;
