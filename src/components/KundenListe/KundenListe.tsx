import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Users,
  Edit,
  Trash2,
  Save,
  X,
  Loader2,
  Search,
  Building2,
  FileText,
  Upload,
  Hash,
} from 'lucide-react';
import { KundenListenEintrag, NeuerKundenListenEintrag, KundenTyp } from '../../types/kundenliste';
import { KundenAktivitaet, KundenAktivitaetsTyp } from '../../types/kundenAktivitaet';
import { kundenListeService } from '../../services/kundenListeService';
import { kundenAktivitaetService } from '../../services/kundenAktivitaetService';
import { kundennummerService } from '../../services/kundennummerService';

const leeresFormular: NeuerKundenListenEintrag = {
  name: '',
  kundenTyp: 'verein',
  bestelltDirekt: true,
  adresse: { strasse: '', plz: '', ort: '' },
  lieferadresse: { strasse: '', plz: '', ort: '' },
  bestelltUeberIds: [],
  tennisplatzAnzahl: 0,
  tonnenProJahr: 0,
  bemerkungen: '',
  telefonnummer: '',
  ansprechpartner: '',
  email: '',
  zahlungsbedingungen: '',
  zahlungsverhalten: '',
  zahlungszielTage: 0,
};

const TYP_LABELS: Record<KundenTyp, string> = {
  verein: 'Verein',
  platzbauer: 'Platzbauer',
  sonstige: 'Sonstige',
};

const KundenListe = () => {
  const [kunden, setKunden] = useState<KundenListenEintrag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suchbegriff, setSuchbegriff] = useState('');
  const [formData, setFormData] = useState<NeuerKundenListenEintrag>(leeresFormular);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [showFormular, setShowFormular] = useState(false);
  const [detailKunde, setDetailKunde] = useState<KundenListenEintrag | null>(null);
  const [aktivitaeten, setAktivitaeten] = useState<KundenAktivitaet[]>([]);
  const [aktivitaetLoading, setAktivitaetLoading] = useState(false);
  const [aktivitaetForm, setAktivitaetForm] = useState<{
    typ: KundenAktivitaetsTyp;
    titel: string;
    beschreibung: string;
    file?: File | null;
  }>({
    typ: 'notiz',
    titel: '',
    beschreibung: '',
    file: null,
  });

  useEffect(() => {
    ladeKunden();
  }, []);

  const ladeKunden = async () => {
    setIsLoading(true);
    try {
      const daten = await kundenListeService.list();
      setKunden(daten);
    } catch (error) {
      console.error('Fehler beim Laden der Kundenliste:', error);
      alert('Kunden konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetFormular = () => {
    setFormData(leeresFormular);
    setBearbeiteId(null);
  };

  const generiereKundennummer = async () => {
    try {
      const neueNummer = await kundennummerService.generiereNaechsteKundennummer();
      setFormData({ ...formData, kundennummer: neueNummer });
    } catch (error) {
      console.error('Fehler beim Generieren der Kundennummer:', error);
      alert('Fehler beim Generieren der Kundennummer');
    }
  };

  const handleSpeichern = async () => {
    if (!formData.name.trim()) {
      alert('Bitte einen Kundennamen eintragen.');
      return;
    }

    setSaving(true);
    try {
      const payload: NeuerKundenListenEintrag = {
        ...formData,
        adresse: {
          strasse: formData.adresse?.strasse || '',
          plz: formData.adresse?.plz || '',
          ort: formData.adresse?.ort || '',
        },
        lieferadresse: formData.lieferadresse?.strasse
          ? {
              strasse: formData.lieferadresse?.strasse || '',
              plz: formData.lieferadresse?.plz || '',
              ort: formData.lieferadresse?.ort || '',
            }
          : undefined,
        bestelltUeberIds: formData.bestelltUeberIds?.filter(Boolean) || [],
        tennisplatzAnzahl: Number(formData.tennisplatzAnzahl) || 0,
        tonnenProJahr: Number(formData.tonnenProJahr) || 0,
      };

      if (bearbeiteId) {
        await kundenListeService.update(bearbeiteId, payload);
      } else {
        await kundenListeService.create(payload);
      }

      await ladeKunden();
      setShowFormular(false);
      resetFormular();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const handleBearbeiten = (eintrag: KundenListenEintrag) => {
    setBearbeiteId(eintrag.id);
    setFormData({
      ...eintrag,
      id: undefined,
      bestelltUeberIds: eintrag.bestelltUeberIds || [],
      lieferadresse: eintrag.lieferadresse || { strasse: '', plz: '', ort: '' },
    });
    setShowFormular(true);
  };

  const ladeAktivitaeten = async (kundeId: string) => {
    setAktivitaetLoading(true);
    try {
      const list = await kundenAktivitaetService.list(kundeId);
      setAktivitaeten(list);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    } finally {
      setAktivitaetLoading(false);
    }
  };

  const openDetails = async (kunde: KundenListenEintrag) => {
    setDetailKunde(kunde);
    setAktivitaeten([]);
    await ladeAktivitaeten(kunde.id);
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Diesen Kunden wirklich löschen?')) return;
    try {
      await kundenListeService.remove(id);
      await ladeKunden();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Löschen fehlgeschlagen.');
    }
  };

  const gefilterteKunden = useMemo(() => {
    if (!suchbegriff.trim()) return kunden;
    const begriff = suchbegriff.toLowerCase();
    return kunden.filter((k) =>
      [k.name, k.adresse?.ort, TYP_LABELS[k.kundenTyp]]
        .filter(Boolean)
        .some((wert) => wert.toLowerCase().includes(begriff))
    );
  }, [kunden, suchbegriff]);

  const nameFuerId = useMemo(() => {
    const map = new Map<string, string>();
    kunden.forEach((k) => map.set(k.id, k.name));
    return map;
  }, [kunden]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kunden Liste</h1>
          <p className="text-gray-600">
            Kunden mit Kernfeldern erfassen und direkt in Appwrite speichern.
          </p>
        </div>
        <button
          onClick={() => {
            resetFormular();
            setShowFormular(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Neuer Kunde
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md p-4 md:p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-100">
            <div className="text-sm text-gray-600">Gesamt</div>
            <div className="text-2xl font-bold text-red-700">{kunden.length}</div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
            <div className="text-sm text-gray-600">Bestellen direkt</div>
            <div className="text-2xl font-bold text-orange-700">
              {kunden.filter((k) => k.bestelltDirekt).length}
            </div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="text-sm text-gray-600">Ø Tonnen / Jahr</div>
            <div className="text-2xl font-bold text-emerald-700">
              {kunden.length
                ? Math.round(
                    (kunden.reduce((sum, k) => sum + (k.tonnenProJahr || 0), 0) / kunden.length) * 10
                  ) / 10
                : 0}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              value={suchbegriff}
              onChange={(e) => setSuchbegriff(e.target.value)}
              placeholder="Suchen nach Name, Ort oder Typ..."
              className="w-full pl-10 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Lädt Kunden...
          </div>
        ) : gefilterteKunden.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            Keine Kunden vorhanden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Nr.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Kunde
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Typ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Bestellt direkt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Tennisplätze
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Tonnen/Jahr
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Kontakt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Bestellt über
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gefilterteKunden.map((kunde) => (
                  <tr
                    key={kunde.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openDetails(kunde)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-gray-900">
                        {kunde.kundennummer || kunde.id.substring(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{kunde.name}</div>
                      <div className="text-sm text-gray-500">
                        {kunde.adresse.strasse}, {kunde.adresse.plz} {kunde.adresse.ort}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-800">
                        {TYP_LABELS[kunde.kundenTyp]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {kunde.bestelltDirekt ? (
                        <span className="text-emerald-600 font-semibold">Ja</span>
                      ) : (
                        <span className="text-gray-600">Nein</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{kunde.tennisplatzAnzahl}</td>
                    <td className="px-4 py-3 text-gray-800">{kunde.tonnenProJahr}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {kunde.telefonnummer && <div>📞 {kunde.telefonnummer}</div>}
                      {kunde.email && <div>✉️ {kunde.email}</div>}
                      {kunde.ansprechpartner && <div>👤 {kunde.ansprechpartner}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {kunde.bestelltUeberIds.length === 0
                        ? '—'
                        : kunde.bestelltUeberIds
                            .map((id) => nameFuerId.get(id) || id)
                            .slice(0, 3)
                            .join(', ')}
                      {kunde.bestelltUeberIds.length > 3 && (
                        <span className="text-sm text-gray-500">
                          {' '}
                          +{kunde.bestelltUeberIds.length - 3} mehr
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetails(kunde);
                        }}
                        className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        aria-label="Details"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBearbeiten(kunde);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        aria-label="Bearbeiten"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoeschen(kunde.id);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFormular && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {bearbeiteId ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
                </h2>
                <p className="text-sm text-gray-600">
                  Pflichtfelder: Name, Kunden-Typ, Adressen & Bestell-Beziehung.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowFormular(false);
                  resetFormular();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Kundenname</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                    placeholder="z.B. TC Musterstadt"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Kundennummer</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.kundennummer || ''}
                      onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
                      placeholder={bearbeiteId ? '' : 'Wird automatisch vergeben'}
                      className="flex-1 p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                    />
                    {!bearbeiteId && (
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
                  {!bearbeiteId && !formData.kundennummer && (
                    <p className="text-xs text-gray-500 mt-1">
                      Kundennummer wird beim Speichern automatisch vergeben
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Kunden-Typ</label>
                  <select
                    value={formData.kundenTyp}
                    onChange={(e) =>
                      setFormData({ ...formData, kundenTyp: e.target.value as KundenTyp })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  >
                    <option value="verein">Verein</option>
                    <option value="platzbauer">Platzbauer</option>
                    <option value="sonstige">Sonstige</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <input
                    id="bestelltDirekt"
                    type="checkbox"
                    checked={formData.bestelltDirekt}
                    onChange={(e) => setFormData({ ...formData, bestelltDirekt: e.target.checked })}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <label htmlFor="bestelltDirekt" className="text-sm font-semibold text-gray-700">
                    Bestellt direkt
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tennisplätze (Anzahl)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.tennisplatzAnzahl}
                    onChange={(e) =>
                      setFormData({ ...formData, tennisplatzAnzahl: Number(e.target.value) || 0 })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tonnen Abnahme pro Jahr
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={formData.tonnenProJahr}
                    onChange={(e) =>
                      setFormData({ ...formData, tonnenProJahr: Number(e.target.value) || 0 })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2 mb-3 text-gray-700 font-semibold">
                    <Building2 className="w-4 h-4" />
                    Adresse
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={formData.adresse?.strasse || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          adresse: { ...formData.adresse, strasse: e.target.value },
                        })
                      }
                      placeholder="Straße"
                      className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={formData.adresse?.plz || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                          adresse: {
                            strasse: formData.adresse?.strasse || '',
                            plz: e.target.value || '',
                            ort: formData.adresse?.ort || '',
                            bundesland: formData.adresse?.bundesland,
                          },
                          })
                        }
                        placeholder="PLZ"
                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={formData.adresse?.ort || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                          adresse: {
                            strasse: formData.adresse?.strasse || '',
                            plz: formData.adresse?.plz || '',
                            ort: e.target.value || '',
                            bundesland: formData.adresse?.bundesland,
                          },
                          })
                        }
                        placeholder="Ort"
                        className="w-full col-span-2 p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2 mb-3 text-gray-700 font-semibold">
                    <Building2 className="w-4 h-4" />
                    Lieferadresse (optional)
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={formData.lieferadresse?.strasse || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          lieferadresse: {
                            strasse: e.target.value || '',
                            plz: formData.lieferadresse?.plz || '',
                            ort: formData.lieferadresse?.ort || '',
                            bundesland: formData.lieferadresse?.bundesland,
                          },
                        })
                      }
                      placeholder="Straße"
                      className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={formData.lieferadresse?.plz || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                          lieferadresse: {
                            strasse: formData.lieferadresse?.strasse || '',
                            plz: e.target.value || '',
                            ort: formData.lieferadresse?.ort || '',
                            bundesland: formData.lieferadresse?.bundesland,
                          },
                          })
                        }
                        placeholder="PLZ"
                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={formData.lieferadresse?.ort || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                          lieferadresse: {
                            strasse: formData.lieferadresse?.strasse || '',
                            plz: formData.lieferadresse?.plz || '',
                            ort: e.target.value || '',
                            bundesland: formData.lieferadresse?.bundesland,
                          },
                          })
                        }
                        placeholder="Ort"
                        className="w-full col-span-2 p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bestellt über (andere Kunden)
                  </label>
                  <div className="border border-gray-200 rounded-lg max-h-44 overflow-y-auto divide-y">
                    {kunden
                      .filter((k) => k.id !== bearbeiteId)
                      .map((k) => (
                        <label key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.bestelltUeberIds?.includes(k.id) || false}
                            onChange={(e) => {
                              const aktuelle = new Set(formData.bestelltUeberIds || []);
                              if (e.target.checked) {
                                aktuelle.add(k.id);
                              } else {
                                aktuelle.delete(k.id);
                              }
                              setFormData({
                                ...formData,
                                bestelltUeberIds: Array.from(aktuelle),
                              });
                            }}
                            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                          />
                          <div>
                            <div className="font-semibold text-gray-900">{k.name}</div>
                            <div className="text-xs text-gray-500">
                              {k.adresse.plz} {k.adresse.ort} • {TYP_LABELS[k.kundenTyp]}
                            </div>
                          </div>
                        </label>
                      ))}
                    {kunden.filter((k) => k.id !== bearbeiteId).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500">Keine weiteren Kunden vorhanden.</div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Bemerkungen</label>
                  <textarea
                    value={formData.bemerkungen || ''}
                    onChange={(e) => setFormData({ ...formData, bemerkungen: e.target.value })}
                    rows={7}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                    placeholder="Optionale Notizen zur Kundenbeziehung"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">Kontakt</label>
                  <input
                    type="text"
                    placeholder="Telefonnummer"
                    value={formData.telefonnummer || ''}
                    onChange={(e) => setFormData({ ...formData, telefonnummer: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Ansprechpartner"
                    value={formData.ansprechpartner || ''}
                    onChange={(e) => setFormData({ ...formData, ansprechpartner: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="E-Mail"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">Zahlungen</label>
                  <input
                    type="text"
                    placeholder="Zahlungsbedingungen"
                    value={formData.zahlungsbedingungen || ''}
                    onChange={(e) => setFormData({ ...formData, zahlungsbedingungen: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Zahlungsverhalten (z.B. pünktlich)"
                    value={formData.zahlungsverhalten || ''}
                    onChange={(e) => setFormData({ ...formData, zahlungsverhalten: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Zahlungsziel in Tagen"
                    value={formData.zahlungszielTage || 0}
                    onChange={(e) =>
                      setFormData({ ...formData, zahlungszielTage: Number(e.target.value) || 0 })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                Diese Felder werden als Appwrite-Attribute gespeichert (inkl. Spalten).
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowFormular(false);
                    resetFormular();
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSpeichern}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-70"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailKunde && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm z-50 flex items-start justify-center p-4">
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden relative">
            <button
              onClick={() => {
                setDetailKunde(null);
                setAktivitaeten([]);
                setAktivitaetForm({ typ: 'notiz', titel: '', beschreibung: '', file: null });
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid lg:grid-cols-3 gap-0">
              {/* Linke Spalte: Stammdaten */}
              <div className="bg-gray-50 border-r border-gray-200 p-6 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Kunde</p>
                  <h2 className="text-2xl font-bold text-gray-900 mt-1">{detailKunde.name}</h2>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-3 py-1 rounded-full bg-white border border-gray-200 text-sm">
                      {TYP_LABELS[detailKunde.kundenTyp]}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white border border-gray-200 text-sm">
                      {detailKunde.bestelltDirekt ? 'Bestellt direkt' : 'Über Vermittler'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-700">
                  <div><span className="font-semibold">Ansprechpartner:</span> {detailKunde.ansprechpartner || '—'}</div>
                  <div><span className="font-semibold">Telefon:</span> {detailKunde.telefonnummer || '—'}</div>
                  <div><span className="font-semibold">E-Mail:</span> {detailKunde.email || '—'}</div>
                  <div><span className="font-semibold">Zahlungsbedingungen:</span> {detailKunde.zahlungsbedingungen || '—'}</div>
                  <div><span className="font-semibold">Zahlungsverhalten:</span> {detailKunde.zahlungsverhalten || '—'}</div>
                  <div><span className="font-semibold">Notizen:</span> {detailKunde.bemerkungen || '—'}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white border border-gray-200">
                    <p className="text-xs text-gray-500">Tennisplätze</p>
                    <p className="text-xl font-bold text-gray-900">{detailKunde.tennisplatzAnzahl}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-gray-200">
                    <p className="text-xs text-gray-500">Tonnen / Jahr</p>
                    <p className="text-xl font-bold text-gray-900">{detailKunde.tonnenProJahr}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-gray-200">
                    <p className="text-xs text-gray-500">Bestellt über</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {detailKunde.bestelltUeberIds.length === 0 ? 'Direkt' : `${detailKunde.bestelltUeberIds.length} Kunden`}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-gray-200">
                    <p className="text-xs text-gray-500">Zahlungsziel</p>
                    <p className="text-xl font-bold text-gray-900">{detailKunde.zahlungszielTage ?? 0} Tage</p>
                    <p className="text-xs text-gray-600">{detailKunde.zahlungsverhalten || 'n/a'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Adresse</p>
                    <p className="text-sm text-gray-800 mt-1">
                      {detailKunde.adresse.strasse}, {detailKunde.adresse.plz} {detailKunde.adresse.ort}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Lieferadresse</p>
                    <p className="text-sm text-gray-800 mt-1">
                      {detailKunde.lieferadresse
                        ? `${detailKunde.lieferadresse.strasse}, ${detailKunde.lieferadresse.plz} ${detailKunde.lieferadresse.ort}`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Rechte Spalte: Aktivitäten */}
              <div className="lg:col-span-2 p-6 space-y-6 bg-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Aktivitäten</h3>
                  <button
                    onClick={() => ladeAktivitaeten(detailKunde.id)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Neu laden
                  </button>
                </div>

                {aktivitaetLoading ? (
                  <div className="flex items-center text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lädt...
                  </div>
                ) : aktivitaeten.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
                    Noch keine Aktivitäten erfasst.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {aktivitaeten.map((a) => (
                      <div key={a.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{a.titel}</div>
                            <div className="text-xs text-gray-500">
                              {a.typ} • {new Date(a.erstelltAm).toLocaleString('de-DE')}
                            </div>
                          </div>
                          <button
                            onClick={() => kundenAktivitaetService.remove(a.id).then(() => ladeAktivitaeten(detailKunde.id))}
                            className="text-red-600 hover:bg-red-50 rounded p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {a.beschreibung && (
                          <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{a.beschreibung}</p>
                        )}
                        {a.dateiId && (
                          <a
                            href={kundenAktivitaetService.getDownloadUrl(a.dateiId)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <Upload className="w-4 h-4" />
                            {a.dateiName || 'Datei'}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">Aktivität hinzufügen</h3>
                  <select
                    value={aktivitaetForm.typ}
                    onChange={(e) =>
                      setAktivitaetForm({ ...aktivitaetForm, typ: e.target.value as KundenAktivitaetsTyp })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none bg-white"
                  >
                    <option value="notiz">Notiz</option>
                    <option value="telefonat">Telefonat</option>
                    <option value="email">E-Mail</option>
                    <option value="besuch">Besuch</option>
                    <option value="bestellung">Bestellung</option>
                    <option value="datei">Datei</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Titel"
                    value={aktivitaetForm.titel}
                    onChange={(e) => setAktivitaetForm({ ...aktivitaetForm, titel: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none bg-white"
                  />
                  <textarea
                    placeholder="Beschreibung"
                    value={aktivitaetForm.beschreibung}
                    onChange={(e) => setAktivitaetForm({ ...aktivitaetForm, beschreibung: e.target.value })}
                    rows={4}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none bg-white"
                  />
                  {aktivitaetForm.typ === 'datei' && (
                    <input
                      type="file"
                      onChange={(e) => setAktivitaetForm({ ...aktivitaetForm, file: e.target.files?.[0] || null })}
                      className="w-full text-sm"
                    />
                  )}
                  <button
                    onClick={async () => {
                      if (!detailKunde) return;
                      if (!aktivitaetForm.titel.trim()) {
                        alert('Bitte Titel angeben.');
                        return;
                      }
                      try {
                        if (aktivitaetForm.typ === 'datei' && aktivitaetForm.file) {
                          await kundenAktivitaetService.uploadDatei(
                            detailKunde.id,
                            aktivitaetForm.file,
                            aktivitaetForm.beschreibung
                          );
                        } else {
                          await kundenAktivitaetService.create({
                            kundeId: detailKunde.id,
                            typ: aktivitaetForm.typ,
                            titel: aktivitaetForm.titel,
                            beschreibung: aktivitaetForm.beschreibung || undefined,
                          });
                        }
                        setAktivitaetForm({ typ: 'notiz', titel: '', beschreibung: '', file: null });
                        await ladeAktivitaeten(detailKunde.id);
                      } catch (error) {
                        console.error('Aktivität konnte nicht erstellt werden', error);
                        alert('Aktivität konnte nicht gespeichert werden.');
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-70 w-full justify-center"
                  >
                    <Save className="w-4 h-4" />
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KundenListe;
