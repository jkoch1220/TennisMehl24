import { useState, useEffect } from 'react';
import { X, CheckCircle2, Phone, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  GespraechsStatus,
  Bestellabsicht,
  Bezugsweg,
  NeueSaisonDaten,
  CallListeFilter,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';

interface CallListeProps {
  kunden: SaisonKundeMitDaten[];
  saisonjahr: number;
  onClose: () => void;
  onUpdate: () => void;
}

const CallListe = ({ kunden, saisonjahr, onClose, onUpdate }: CallListeProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [offeneKunden, setOffeneKunden] = useState<SaisonKundeMitDaten[]>([]);
  const [filter, setFilter] = useState<CallListeFilter>({});
  const [formData, setFormData] = useState<Partial<NeueSaisonDaten>>({});

  const matchesFilter = (k: SaisonKundeMitDaten) => {
    if (filter.typ && filter.typ.length > 0 && !filter.typ.includes(k.kunde.typ)) return false;
    if (filter.status && filter.status.length > 0) {
      const status = k.aktuelleSaison?.gespraechsstatus || 'offen';
      if (!filter.status.includes(status)) return false;
    }
    if (filter.bezugsweg && filter.bezugsweg.length > 0) {
      const bezug = k.aktuelleSaison?.bezugsweg || 'direkt';
      if (!filter.bezugsweg.includes(bezug)) return false;
    }
    if (filter.bundesland && filter.bundesland.length > 0) {
      const bl = (k.kunde.lieferadresse.bundesland || '').toLowerCase();
      if (!filter.bundesland.some((b) => b.toLowerCase() === bl)) return false;
    }
    if (filter.platzbauerId) {
      const matchPlatzbauer =
        k.aktuelleSaison?.platzbauerId === filter.platzbauerId ||
        k.beziehungenAlsVerein?.some((b) => b.platzbauerId === filter.platzbauerId);
      if (!matchPlatzbauer) return false;
    }
    if (filter.suche) {
      const s = filter.suche.toLowerCase();
      if (
        !(
          k.kunde.name.toLowerCase().includes(s) ||
          k.kunde.lieferadresse.ort.toLowerCase().includes(s) ||
          k.kunde.lieferadresse.plz.toLowerCase().includes(s)
        )
      ) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const gefiltert = kunden.filter(matchesFilter);
    const offen = gefiltert.filter(
      (k) => !k.aktuelleSaison || k.aktuelleSaison.gespraechsstatus !== 'erledigt'
    );
    setOffeneKunden(offen);
    if (offen.length > 0) {
      setCurrentIndex(0);
    } else {
      setCurrentIndex(0);
      setFormData({});
    }
  }, [kunden, filter]);

  const currentKunde = offeneKunden[currentIndex];

  useEffect(() => {
    if (currentKunde?.aktuelleSaison) {
      setFormData({
        angefragteMenge: currentKunde.aktuelleSaison.angefragteMenge,
        tatsaechlicheMenge: currentKunde.aktuelleSaison.tatsaechlicheMenge,
        preisProTonne: currentKunde.aktuelleSaison.preisProTonne,
        bezugsweg: currentKunde.aktuelleSaison.bezugsweg,
        platzbauerId: currentKunde.aktuelleSaison.platzbauerId,
        bestellabsicht: currentKunde.aktuelleSaison.bestellabsicht,
        lieferfensterFrueh: currentKunde.aktuelleSaison.lieferfensterFrueh?.split('T')[0],
        lieferfensterSpaet: currentKunde.aktuelleSaison.lieferfensterSpaet?.split('T')[0],
        gespraechsnotizen: currentKunde.aktuelleSaison.gespraechsnotizen,
        gespraechsstatus: currentKunde.aktuelleSaison.gespraechsstatus,
      });
    } else {
      // Neue Saison-Daten
      setFormData({
        gespraechsstatus: 'offen',
      });
    }
  }, [currentKunde]);

  const handleSave = async (override?: Partial<NeueSaisonDaten>) => {
    if (!currentKunde) return;
    const payload: Partial<NeueSaisonDaten> = { ...formData, ...override };

    try {
      if (currentKunde.aktuelleSaison) {
        // Update bestehende Saison-Daten
        await saisonplanungService.updateSaisonDaten(currentKunde.aktuelleSaison.id, {
          ...payload,
          lieferfensterFrueh: payload.lieferfensterFrueh
            ? new Date(payload.lieferfensterFrueh).toISOString()
            : undefined,
          lieferfensterSpaet: payload.lieferfensterSpaet
            ? new Date(payload.lieferfensterSpaet).toISOString()
            : undefined,
        } as Partial<NeueSaisonDaten>);
      } else {
        // Erstelle neue Saison-Daten
        await saisonplanungService.createSaisonDaten({
          kundeId: currentKunde.kunde.id,
          saisonjahr,
          ...payload,
          lieferfensterFrueh: payload.lieferfensterFrueh
            ? new Date(payload.lieferfensterFrueh).toISOString()
            : undefined,
          lieferfensterSpaet: payload.lieferfensterSpaet
            ? new Date(payload.lieferfensterSpaet).toISOString()
            : undefined,
        } as NeueSaisonDaten);
      }

      // Erstelle Aktivität
      await saisonplanungService.createAktivitaet({
        kundeId: currentKunde.kunde.id,
        typ: 'telefonat',
        titel: 'Telefonat geführt',
        beschreibung: `Gesprächsstatus: ${payload.gespraechsstatus}`,
      });

      onUpdate();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern');
    }
  };

  const handleErledigt = async () => {
    if (!currentKunde) return;

    try {
      await handleSave({ gespraechsstatus: 'erledigt' });
      // Springe zum nächsten offenen Kunden
      const naechsteOffene = offeneKunden.findIndex(
        (k, idx) => idx > currentIndex && k.aktuelleSaison?.gespraechsstatus !== 'erledigt'
      );
      if (naechsteOffene !== -1) {
        setCurrentIndex(naechsteOffene);
      } else {
        // Keine weiteren offenen Kunden, schließe Modal
        onClose();
      }
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  const handleNext = () => {
    if (currentIndex < offeneKunden.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (offeneKunden.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Call-Liste</h2>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium text-gray-900 dark:text-slate-100">Alle Kunden erledigt!</p>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">Es gibt keine offenen Kunden mehr.</p>
          </div>
        </div>
      </div>
    );
  }

  const platzbauerKunden = kunden.filter((k) => k.kunde.typ === 'platzbauer');
  const bundeslaender = Array.from(
    new Set(
      kunden
        .map((k) => k.kunde.lieferadresse.bundesland)
        .filter((b): b is string => !!b && b.trim().length > 0)
    )
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Call-Liste</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
              Kunde {currentIndex + 1} von {offeneKunden.length}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filter */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Suche</label>
              <input
                type="text"
                value={filter.suche || ''}
                onChange={(e) => setFilter({ ...filter, suche: e.target.value })}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Name, Ort, PLZ"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Typ</label>
              <select
                value={filter.typ?.[0] || ''}
                onChange={(e) =>
                  setFilter({ ...filter, typ: e.target.value ? [e.target.value as any] : undefined })
                }
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Alle</option>
                <option value="verein">Verein</option>
                <option value="platzbauer">Platzbauer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Status</label>
              <select
                value={filter.status?.[0] || ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    status: e.target.value ? [e.target.value as GespraechsStatus] : undefined,
                  })
                }
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Alle</option>
                <option value="offen">Offen</option>
                <option value="in_bearbeitung">In Bearbeitung</option>
                <option value="erledigt">Erledigt</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Bezugsweg</label>
              <select
                value={filter.bezugsweg?.[0] || ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    bezugsweg: e.target.value ? [e.target.value as Bezugsweg] : undefined,
                  })
                }
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Alle</option>
                <option value="direkt">Direkt</option>
                <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
                <option value="ueber_platzbauer">Platzbauer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Bundesland</label>
              <select
                value={filter.bundesland?.[0] || ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    bundesland: e.target.value ? [e.target.value] : undefined,
                  })
                }
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Alle</option>
                {bundeslaender.map((bl) => (
                  <option key={bl} value={bl}>
                    {bl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Platzbauer</label>
              <select
                value={filter.platzbauerId || ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    platzbauerId: e.target.value || undefined,
                  })
                }
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Alle</option>
                {platzbauerKunden.map((pb) => (
                  <option key={pb.kunde.id} value={pb.kunde.id}>
                    {pb.kunde.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {currentKunde && (
          <div className="p-6 space-y-6">
            {/* Kunden-Info */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">{currentKunde.kunde.name}</h3>
              <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                <p>
                  {currentKunde.kunde.lieferadresse.plz} {currentKunde.kunde.lieferadresse.ort}
                </p>
                {currentKunde.ansprechpartner.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Ansprechpartner:</p>
                    {currentKunde.ansprechpartner.map((ap) => (
                      <div key={ap.id} className="ml-4">
                        <p>{ap.name} {ap.rolle && `(${ap.rolle})`}</p>
                        {ap.telefonnummern.map((tel, idx) => (
                          <p key={idx} className="text-blue-600">
                            {tel.nummer} {tel.typ && `(${tel.typ})`}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Formular */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Angefragte Menge (t)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.angefragteMenge || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        angefragteMenge: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Preis pro Tonne (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preisProTonne || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        preisProTonne: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Bestellabsicht
                  </label>
                  <select
                    value={formData.bestellabsicht || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bestellabsicht: e.target.value as Bestellabsicht,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Bitte wählen</option>
                    <option value="bestellt">Bestellt</option>
                    <option value="bestellt_nicht">Bestellt nicht</option>
                    <option value="unklar">Unklar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Gesprächsstatus
                  </label>
                  <select
                    value={formData.gespraechsstatus || 'offen'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gespraechsstatus: e.target.value as GespraechsStatus,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="offen">Offen</option>
                    <option value="in_bearbeitung">In Bearbeitung</option>
                    <option value="erledigt">Erledigt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Bezugsweg</label>
                  <select
                    value={formData.bezugsweg || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bezugsweg: e.target.value as Bezugsweg,
                        platzbauerId: e.target.value === 'ueber_platzbauer' ? formData.platzbauerId : undefined,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Bitte wählen</option>
                    <option value="direkt">Direkt</option>
                    <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
                    <option value="ueber_platzbauer">Platzbauer</option>
                  </select>
                </div>

                {formData.bezugsweg === 'ueber_platzbauer' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                      Platzbauer
                    </label>
                    <select
                      value={formData.platzbauerId || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, platzbauerId: e.target.value })
                      }
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Bitte wählen</option>
                      {platzbauerKunden.map((pb) => (
                        <option key={pb.kunde.id} value={pb.kunde.id}>
                          {pb.kunde.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Frühestes Lieferdatum
                  </label>
                  <input
                    type="date"
                    value={formData.lieferfensterFrueh || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, lieferfensterFrueh: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Spätestes Lieferdatum
                  </label>
                  <input
                    type="date"
                    value={formData.lieferfensterSpaet || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, lieferfensterSpaet: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                  Gesprächsnotizen
                </label>
                <textarea
                  value={formData.gespraechsnotizen || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, gespraechsnotizen: e.target.value })
                  }
                  rows={4}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Navigation & Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-slate-700">
              <div className="flex gap-2">
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Zurück
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === offeneKunden.length - 1}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Weiter
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSave()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Speichern
                </button>
                <button
                  onClick={handleErledigt}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Erledigt & Weiter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallListe;
