import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Hash } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  NeuerSaisonKunde,
  NeuerAnsprechpartner,
  Telefonnummer,
  KundenTyp,
  Bezugsweg,
  SaisonKunde,
  Belieferungsart,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { kundennummerService } from '../../services/kundennummerService';
import AdressAutocomplete from './AdressAutocomplete.tsx';

interface KundenFormularProps {
  kunde?: SaisonKundeMitDaten | null;
  onSave: () => void;
  onCancel: () => void;
}

const KundenFormular = ({ kunde, onSave, onCancel }: KundenFormularProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplikate, setDuplikate] = useState<SaisonKunde[]>([]);
  const [showDuplikatWarnung, setShowDuplikatWarnung] = useState(false);

  const [formData, setFormData] = useState<Partial<NeuerSaisonKunde>>({
    typ: 'verein',
    name: '',
    kundennummer: '',
    adresse: {
      strasse: '',
      plz: '',
      ort: '',
      bundesland: '',
    },
    email: '',
    notizen: '',
    aktiv: true,
    standardBezugsweg: 'direkt',
    standardPlatzbauerId: '',
    zuletztGezahlterPreis: undefined,
    tonnenLetztesJahr: undefined,
    beziehtUeberUnsPlatzbauer: false,
    abwerkspreis: false,
    zahlungsziel: 14,
    schuettstellenAnzahl: undefined,
    belieferungsart: undefined,
  });

  const [ansprechpartner, setAnsprechpartner] = useState<NeuerAnsprechpartner[]>([]);
  const [neuerAnsprechpartner, setNeuerAnsprechpartner] = useState<Partial<NeuerAnsprechpartner>>({
    name: '',
    rolle: '',
    email: '',
    telefonnummern: [{ nummer: '', typ: 'Mobil', beschreibung: '' }],
    bevorzugterKontaktweg: 'telefon',
    notizen: '',
    aktiv: true,
  });
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde[]>([]);
  const [zugeordnetePlatzbauer, setZugeordnetePlatzbauer] = useState<string[]>([]);

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
        standardBezugsweg: kunde.kunde.standardBezugsweg,
        standardPlatzbauerId: kunde.kunde.standardPlatzbauerId,
        zuletztGezahlterPreis: kunde.kunde.zuletztGezahlterPreis,
        tonnenLetztesJahr: kunde.kunde.tonnenLetztesJahr,
        beziehtUeberUnsPlatzbauer: kunde.kunde.beziehtUeberUnsPlatzbauer,
        abwerkspreis: kunde.kunde.abwerkspreis || false,
        schuettstellenAnzahl: kunde.kunde.schuettstellenAnzahl,
        belieferungsart: kunde.kunde.belieferungsart,
      });
      setAnsprechpartner(
        kunde.ansprechpartner.map((ap) => ({
          ...ap,
          kundeId: kunde.kunde.id,
          telefonnummern:
            ap.telefonnummern && ap.telefonnummern.length > 0
              ? ap.telefonnummern
              : [{ nummer: '', typ: 'Mobil', beschreibung: '' }],
        }))
      );
      setZugeordnetePlatzbauer(
        kunde.beziehungenAlsVerein?.map((b) => b.platzbauerId) || []
      );
    } else {
      // Reset für neuen Kunden
      setFormData({
        typ: 'verein',
        name: '',
        kundennummer: '',
        adresse: { strasse: '', plz: '', ort: '', bundesland: '' },
        email: '',
        notizen: '',
        aktiv: true,
        standardBezugsweg: 'direkt',
        standardPlatzbauerId: '',
        zuletztGezahlterPreis: undefined,
        tonnenLetztesJahr: undefined,
        beziehtUeberUnsPlatzbauer: false,
        abwerkspreis: false,
        belieferungsart: undefined,
      });
      setAnsprechpartner([]);
      setZugeordnetePlatzbauer([]);
    }
  }, [kunde]);

  useEffect(() => {
    const ladePlatzbauer = async () => {
      const alle = await saisonplanungService.loadAlleKunden();
      setPlatzbauer(alle.filter((k) => k.typ === 'platzbauer'));
    };
    ladePlatzbauer();
  }, []);

  useEffect(() => {
    if (formData.typ === 'platzbauer') {
      if (zugeordnetePlatzbauer.length > 0) {
        setZugeordnetePlatzbauer([]);
      }
      if (formData.standardBezugsweg) {
        setFormData((prev) => ({
          ...prev,
          standardBezugsweg: undefined,
          standardPlatzbauerId: '',
        }));
      }
    }
  }, [formData.typ]);

  const generiereKundennummer = async () => {
    try {
      const neueNummer = await kundennummerService.generiereNaechsteKundennummer();
      setFormData({ ...formData, kundennummer: neueNummer });
    } catch (error) {
      console.error('Fehler beim Generieren der Kundennummer:', error);
      setError('Fehler beim Generieren der Kundennummer');
    }
  };

  const handleSubmit = async (e: React.FormEvent, ignoreDuplikate = false) => {
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

      // Duplikatsprüfung nur bei neuen Kunden
      if (!kunde && !ignoreDuplikate) {
        const gefundeneDuplikate = await saisonplanungService.pruefeDuplikat(
          formData.name || '',
          formData.adresse?.plz || '',
          formData.adresse?.ort || ''
        );
        
        if (gefundeneDuplikate.length > 0) {
          setDuplikate(gefundeneDuplikate);
          setShowDuplikatWarnung(true);
          setLoading(false);
          return;
        }
      }

      // Automatische Kundennummernvergabe für neue Kunden ohne Nummer
      let kundenDaten = { ...formData };
      if (!kunde && !kundenDaten.kundennummer) {
        const neueNummer = await kundennummerService.generiereNaechsteKundennummer();
        kundenDaten.kundennummer = neueNummer;
      }

      let kundeId: string;

      if (kunde) {
        // Update bestehender Kunde
        const updated = await saisonplanungService.updateKunde(kunde.kunde.id, {
          ...kundenDaten,
          adresse: kundenDaten.adresse || { strasse: '', plz: '', ort: '', bundesland: '' },
          standardPlatzbauerId:
            kundenDaten.standardBezugsweg === 'ueber_platzbauer'
              ? kundenDaten.standardPlatzbauerId
              : '',
        } as Partial<NeuerSaisonKunde>);
        kundeId = updated.id;
      } else {
        // Erstelle neuen Kunden
        const created = await saisonplanungService.createKunde({
          ...kundenDaten,
          adresse: kundenDaten.adresse || { strasse: '', plz: '', ort: '', bundesland: '' },
          standardPlatzbauerId:
            kundenDaten.standardBezugsweg === 'ueber_platzbauer'
              ? kundenDaten.standardPlatzbauerId
              : '',
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

      // Beziehungen Verein ↔ Platzbauer (nur für Vereine)
      if ((formData.typ || kunde?.kunde.typ) === 'verein') {
        const bestehendeBeziehungen = kunde?.beziehungenAlsVerein || [];
        const zuLoeschende = bestehendeBeziehungen.filter(
          (b) => !zugeordnetePlatzbauer.includes(b.platzbauerId)
        );
        const zuErstellende = zugeordnetePlatzbauer.filter(
          (platzbauerId) =>
            !bestehendeBeziehungen.some((b) => b.platzbauerId === platzbauerId)
        );

        await Promise.all([
          ...zuLoeschende.map((b) => saisonplanungService.deleteBeziehung(b.id)),
          ...zuErstellende.map((platzbauerId) =>
            saisonplanungService.createBeziehung({
              vereinId: kundeId,
              platzbauerId,
              status: 'aktiv',
            })
          ),
        ]);
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
    setAnsprechpartner([
      ...ansprechpartner,
      {
        ...(neuerAnsprechpartner as NeuerAnsprechpartner),
        telefonnummern:
          neuerAnsprechpartner.telefonnummern && neuerAnsprechpartner.telefonnummern.length > 0
            ? neuerAnsprechpartner.telefonnummern
            : [{ nummer: '', typ: 'Mobil', beschreibung: '' }],
      },
    ]);
    setNeuerAnsprechpartner({
      name: '',
      rolle: '',
      email: '',
      telefonnummern: [{ nummer: '', typ: 'Mobil', beschreibung: '' }],
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.kundennummer || ''}
                    onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
                    placeholder={kunde ? '' : 'Wird automatisch vergeben'}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  {!kunde && (
                    <button
                      type="button"
                      onClick={generiereKundennummer}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                      title="Kundennummer generieren"
                    >
                      <Hash className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!kunde && !formData.kundennummer && (
                  <p className="text-xs text-gray-500 mt-1">
                    Kundennummer wird beim Speichern automatisch vergeben
                  </p>
                )}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Zuletzt gezahlter Preis (€/t)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.zuletztGezahlterPreis ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      zuletztGezahlterPreis: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tonnen abgenommen letztes Jahr
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.tonnenLetztesJahr ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tonnenLetztesJahr: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schüttstellen Anzahl
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.schuettstellenAnzahl ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      schuettstellenAnzahl: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Belieferungsart
                </label>
                <select
                  value={formData.belieferungsart ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      belieferungsart: e.target.value ? (e.target.value as Belieferungsart) : undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Bitte wählen</option>
                  <option value="nur_motorwagen">Nur Motorwagen</option>
                  <option value="mit_haenger">Mit Hänger Belieferbar</option>
                  <option value="abholung_ab_werk">Abholung ab Werk</option>
                  <option value="palette_mit_ladekran">Palette mit Ladekran</option>
                  <option value="bigbag">BigBag</option>
                </select>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <input
                    id="aktiv"
                    type="checkbox"
                    checked={formData.aktiv ?? true}
                    onChange={(e) => setFormData({ ...formData, aktiv: e.target.checked })}
                    className="h-4 w-4 text-red-600 border-gray-300 rounded"
                  />
                  <label htmlFor="aktiv" className="text-sm font-medium text-gray-700">
                    Aktiv
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    id="abwerkspreis"
                    type="checkbox"
                    checked={formData.abwerkspreis ?? false}
                    onChange={(e) => setFormData({ ...formData, abwerkspreis: e.target.checked })}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="abwerkspreis" className="text-sm font-medium text-gray-700">
                    Abwerkspreis
                  </label>
                </div>
              </div>
            </div>

            {/* Adresse mit Autovervollständigung */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Adresse</h4>
              <AdressAutocomplete
                strasse={formData.adresse?.strasse || ''}
                plz={formData.adresse?.plz || ''}
                ort={formData.adresse?.ort || ''}
                bundesland={formData.adresse?.bundesland || ''}
                onAdresseChange={(adresse: { strasse: string; plz: string; ort: string; bundesland?: string }) =>
                  setFormData({
                    ...formData,
                    adresse,
                  })
                }
              />
            </div>

            {/* Standard-Bezugsweg für Vereine */}
            {formData.typ === 'verein' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Standard Bezugsweg
                  </label>
                  <select
                    value={formData.standardBezugsweg || 'direkt'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        standardBezugsweg: e.target.value as Bezugsweg,
                        standardPlatzbauerId:
                          e.target.value === 'ueber_platzbauer'
                            ? formData.standardPlatzbauerId
                            : '',
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="direkt">Direkt</option>
                    <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
                    <option value="ueber_platzbauer">Platzbauer</option>
                  </select>
                </div>
                {formData.standardBezugsweg === 'ueber_platzbauer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Standard Platzbauer
                    </label>
                    <select
                      value={formData.standardPlatzbauerId || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, standardPlatzbauerId: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Bitte wählen</option>
                      {platzbauer.map((pb) => (
                        <option key={pb.id} value={pb.id}>
                          {pb.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

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

          {/* Beziehungen Verein ↔ Platzbauer */}
          {formData.typ === 'verein' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Platzbauer-Zuordnung</h3>
                <span className="text-xs text-gray-500">Mehrfachauswahl möglich</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {platzbauer.map((pb) => (
                  <label
                    key={pb.id}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={zugeordnetePlatzbauer.includes(pb.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setZugeordnetePlatzbauer([...zugeordnetePlatzbauer, pb.id]);
                        } else {
                          setZugeordnetePlatzbauer(
                            zugeordnetePlatzbauer.filter((id) => id !== pb.id)
                          );
                        }
                      }}
                      className="h-4 w-4 text-red-600 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{pb.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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

      {/* Duplikat-Warnung Modal */}
      {showDuplikatWarnung && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-red-600 mb-4">⚠️ Mögliche Duplikate gefunden</h3>
            <p className="text-gray-700 mb-4">
              Es wurden bereits Kunden mit ähnlichem Namen oder Adresse gefunden:
            </p>
            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
              {duplikate.map((dup) => (
                <div key={dup.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="font-semibold text-gray-900">{dup.name}</div>
                  <div className="text-sm text-gray-600">
                    {dup.adresse.strasse && `${dup.adresse.strasse}, `}
                    {dup.adresse.plz} {dup.adresse.ort}
                    {dup.adresse.bundesland && ` (${dup.adresse.bundesland})`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Typ: {dup.typ === 'verein' ? 'Verein' : 'Platzbauer'}
                    {dup.kundennummer && ` • Kundennummer: ${dup.kundennummer}`}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDuplikatWarnung(false);
                  setDuplikate([]);
                  setLoading(false);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={(e) => {
                  setShowDuplikatWarnung(false);
                  handleSubmit(e as any, true);
                }}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Trotzdem speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KundenFormular;
