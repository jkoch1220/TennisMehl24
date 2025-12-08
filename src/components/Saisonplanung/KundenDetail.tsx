import { useState, useEffect } from 'react';
import { X, Edit, Plus, Calendar, TrendingUp, Users, Phone, Mail, Building2 } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  SaisonAktivitaet,
  NeueSaisonAktivitaet,
  AktivitaetsTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';

interface KundenDetailProps {
  kunde: SaisonKundeMitDaten;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

const KundenDetail = ({ kunde, onClose, onEdit, onUpdate }: KundenDetailProps) => {
  const [aktivitaeten, setAktivitaeten] = useState<SaisonAktivitaet[]>(kunde.aktivitaeten);
  const [showAddAktivitaet, setShowAddAktivitaet] = useState(false);
  const [aktivitaetTyp, setAktivitaetTyp] = useState<AktivitaetsTyp>('kommentar');
  const [aktivitaetTitel, setAktivitaetTitel] = useState('');
  const [aktivitaetBeschreibung, setAktivitaetBeschreibung] = useState('');

  useEffect(() => {
    loadAktivitaeten();
  }, [kunde.kunde.id]);

  const loadAktivitaeten = async () => {
    try {
      const akt = await saisonplanungService.loadAktivitaetenFuerKunde(kunde.kunde.id);
      setAktivitaeten(akt);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    }
  };

  const handleAddAktivitaet = async () => {
    if (!aktivitaetTitel.trim()) {
      alert('Bitte geben Sie einen Titel ein');
      return;
    }

    try {
      await saisonplanungService.createAktivitaet({
        kundeId: kunde.kunde.id,
        saisonDatenId: kunde.aktuelleSaison?.id,
        typ: aktivitaetTyp,
        titel: aktivitaetTitel,
        beschreibung: aktivitaetBeschreibung || undefined,
      } as NeueSaisonAktivitaet);

      setAktivitaetTitel('');
      setAktivitaetBeschreibung('');
      setShowAddAktivitaet(false);
      loadAktivitaeten();
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Erstellen der Aktivität:', error);
      alert('Fehler beim Erstellen der Aktivität');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{kunde.kunde.name}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Edit className="w-5 h-5" />
              Bearbeiten
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stammdaten */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Stammdaten
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Typ:</span>{' '}
                <span className="text-gray-900">
                  {kunde.kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'}
                </span>
              </div>
              {kunde.kunde.adresse.bundesland && (
                <div>
                  <span className="font-medium text-gray-700">Bundesland:</span>{' '}
                  <span className="text-gray-900">{kunde.kunde.adresse.bundesland}</span>
                </div>
              )}
              {kunde.kunde.kundennummer && (
                <div>
                  <span className="font-medium text-gray-700">Kundennummer:</span>{' '}
                  <span className="text-gray-900">{kunde.kunde.kundennummer}</span>
                </div>
              )}
              {kunde.kunde.email && (
                <div>
                  <span className="font-medium text-gray-700">E-Mail:</span>{' '}
                  <span className="text-gray-900">{kunde.kunde.email}</span>
                </div>
              )}
              {kunde.kunde.zuletztGezahlterPreis && (
                <div>
                  <span className="font-medium text-gray-700">Zuletzt gezahlter Preis:</span>{' '}
                  <span className="text-gray-900">
                    {formatCurrency(kunde.kunde.zuletztGezahlterPreis)}/t
                  </span>
                </div>
              )}
              {kunde.kunde.notizen && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700">Notizen:</span>{' '}
                  <span className="text-gray-900">{kunde.kunde.notizen}</span>
                </div>
              )}
              {kunde.kunde.standardBezugsweg && (
                <div>
                  <span className="font-medium text-gray-700">Standard Bezugsweg:</span>{' '}
                  <span className="text-gray-900">
                    {kunde.kunde.standardBezugsweg === 'direkt' ? 'Direkt' : 'Über Platzbauer'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Ansprechpartner */}
          {kunde.ansprechpartner.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Ansprechpartner
              </h3>
              <div className="space-y-3">
                {kunde.ansprechpartner.map((ap) => (
                  <div key={ap.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="font-medium text-gray-900">{ap.name}</div>
                    {ap.rolle && <div className="text-sm text-gray-600">{ap.rolle}</div>}
                    {ap.email && (
                      <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        <Mail className="w-4 h-4" />
                        {ap.email}
                      </div>
                    )}
                    {ap.telefonnummern.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {ap.telefonnummern.map((tel, idx) => (
                          <div key={idx} className="text-sm text-gray-600 flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {tel.nummer} {tel.typ && `(${tel.typ})`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Beziehungen */}
          {kunde.kunde.typ === 'verein' && (kunde.beziehungenAlsVerein?.length || 0) > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Platzbauer</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {kunde.beziehungenAlsVerein?.map((b) => (
                  <li key={b.id}>
                    {b.platzbauerId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
                    {b.status === 'inaktiv' && <span className="text-xs text-gray-500">(inaktiv)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {kunde.kunde.typ === 'platzbauer' &&
            (kunde.beziehungenAlsPlatzbauer?.length || 0) > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Vereine</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {kunde.beziehungenAlsPlatzbauer?.map((b) => (
                    <li key={b.id}>
                      {b.vereinId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
                      {b.status === 'inaktiv' && (
                        <span className="text-xs text-gray-500">(inaktiv)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Aktuelle Saison */}
          {kunde.aktuelleSaison && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Saison {kunde.aktuelleSaison.saisonjahr}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {kunde.aktuelleSaison.referenzmenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Referenzmenge:</span>{' '}
                    <span className="text-gray-900">{kunde.aktuelleSaison.referenzmenge.toFixed(1)} t</span>
                  </div>
                )}
                {kunde.aktuelleSaison.angefragteMenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Angefragte Menge:</span>{' '}
                    <span className="text-gray-900">
                      {kunde.aktuelleSaison.angefragteMenge.toFixed(1)} t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.tatsaechlicheMenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Tatsächliche Menge:</span>{' '}
                    <span className="text-gray-900">
                      {kunde.aktuelleSaison.tatsaechlicheMenge.toFixed(1)} t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.preisProTonne && (
                  <div>
                    <span className="font-medium text-gray-700">Preis:</span>{' '}
                    <span className="text-gray-900">
                      {formatCurrency(kunde.aktuelleSaison.preisProTonne)}/t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.bezugsweg && (
                  <div>
                    <span className="font-medium text-gray-700">Bezugsweg:</span>{' '}
                    <span className="text-gray-900">
                      {kunde.aktuelleSaison.bezugsweg === 'direkt' ? 'Direkt' : 'Über Platzbauer'}
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.bestellabsicht && (
                  <div>
                    <span className="font-medium text-gray-700">Bestellabsicht:</span>{' '}
                    <span className="text-gray-900">
                      {kunde.aktuelleSaison.bestellabsicht === 'bestellt'
                        ? 'Bestellt'
                        : kunde.aktuelleSaison.bestellabsicht === 'bestellt_nicht'
                        ? 'Bestellt nicht'
                        : 'Unklar'}
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.lieferfensterFrueh && (
                  <div>
                    <span className="font-medium text-gray-700">Frühestes Lieferdatum:</span>{' '}
                    <span className="text-gray-900">{formatDate(kunde.aktuelleSaison.lieferfensterFrueh)}</span>
                  </div>
                )}
                {kunde.aktuelleSaison.lieferfensterSpaet && (
                  <div>
                    <span className="font-medium text-gray-700">Spätestes Lieferdatum:</span>{' '}
                    <span className="text-gray-900">{formatDate(kunde.aktuelleSaison.lieferfensterSpaet)}</span>
                  </div>
                )}
                {kunde.aktuelleSaison.gespraechsnotizen && (
                  <div className="md:col-span-2">
                    <span className="font-medium text-gray-700">Notizen:</span>{' '}
                    <span className="text-gray-900">{kunde.aktuelleSaison.gespraechsnotizen}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Saison-Historie */}
          {kunde.saisonHistorie.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Saison-Historie
              </h3>
              <div className="space-y-2">
                {kunde.saisonHistorie
                  .sort((a, b) => b.saisonjahr - a.saisonjahr)
                  .map((saison) => (
                    <div key={saison.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-900 mb-2">Saison {saison.saisonjahr}</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {saison.angefragteMenge !== undefined && (
                          <div>
                            <span className="text-gray-600">Angefragt:</span>{' '}
                            <span className="font-medium">{saison.angefragteMenge.toFixed(1)} t</span>
                          </div>
                        )}
                        {saison.tatsaechlicheMenge !== undefined && (
                          <div>
                            <span className="text-gray-600">Tatsächlich:</span>{' '}
                            <span className="font-medium">{saison.tatsaechlicheMenge.toFixed(1)} t</span>
                          </div>
                        )}
                        {saison.preisProTonne && (
                          <div>
                            <span className="text-gray-600">Preis:</span>{' '}
                            <span className="font-medium">{formatCurrency(saison.preisProTonne)}/t</span>
                          </div>
                        )}
                        {saison.bezugsweg && (
                          <div>
                            <span className="text-gray-600">Bezugsweg:</span>{' '}
                            <span className="font-medium">
                              {saison.bezugsweg === 'direkt' ? 'Direkt' : 'Über Platzbauer'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Aktivitätsverlauf */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Aktivitätsverlauf
              </h3>
              <button
                onClick={() => setShowAddAktivitaet(!showAddAktivitaet)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Aktivität hinzufügen
              </button>
            </div>

            {showAddAktivitaet && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                  <select
                    value={aktivitaetTyp}
                    onChange={(e) => setAktivitaetTyp(e.target.value as AktivitaetsTyp)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="telefonat">Telefonat</option>
                    <option value="email">E-Mail</option>
                    <option value="kommentar">Kommentar</option>
                    <option value="mengen_aenderung">Mengenänderung</option>
                    <option value="preis_aenderung">Preisänderung</option>
                    <option value="status_aenderung">Statusänderung</option>
                    <option value="beziehung_aenderung">Beziehungsänderung</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
                  <input
                    type="text"
                    value={aktivitaetTitel}
                    onChange={(e) => setAktivitaetTitel(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="z.B. Telefonat mit Platzwart"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                  <textarea
                    value={aktivitaetBeschreibung}
                    onChange={(e) => setAktivitaetBeschreibung(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddAktivitaet}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => {
                      setShowAddAktivitaet(false);
                      setAktivitaetTitel('');
                      setAktivitaetBeschreibung('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {aktivitaeten.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Keine Aktivitäten vorhanden</p>
              ) : (
                aktivitaeten.map((akt) => (
                  <div key={akt.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{akt.titel}</div>
                        {akt.beschreibung && (
                          <div className="text-sm text-gray-600 mt-1">{akt.beschreibung}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          {new Date(akt.erstelltAm).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {akt.typ}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KundenDetail;
