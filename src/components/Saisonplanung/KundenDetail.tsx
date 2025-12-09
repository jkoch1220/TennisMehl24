import { useState, useEffect } from 'react';
import { X, Edit, Plus, Calendar, TrendingUp, Users, Phone, Mail, Building2, FileCheck, FileSignature, Truck, FileText, CheckCircle2, Layers } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  SaisonAktivitaet,
  NeueSaisonAktivitaet,
  AktivitaetsTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { projektService } from '../../services/projektService';
import { Projekt, NeuesProjekt } from '../../types/projekt';
import { useNavigate } from 'react-router-dom';
import ProjektDialog from '../Shared/ProjektDialog';

interface KundenDetailProps {
  kunde: SaisonKundeMitDaten;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

const KundenDetail = ({ kunde, onClose, onEdit, onUpdate }: KundenDetailProps) => {
  const navigate = useNavigate();
  const [aktivitaeten, setAktivitaeten] = useState<SaisonAktivitaet[]>(kunde.aktivitaeten);
  const [showAddAktivitaet, setShowAddAktivitaet] = useState(false);
  const [aktivitaetTyp, setAktivitaetTyp] = useState<AktivitaetsTyp>('kommentar');
  const [aktivitaetTitel, setAktivitaetTitel] = useState('');
  const [aktivitaetBeschreibung, setAktivitaetBeschreibung] = useState('');
  const [kundenNamen, setKundenNamen] = useState<Record<string, string>>({});
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [loadingProjekte, setLoadingProjekte] = useState(false);
  const [showProjektDialog, setShowProjektDialog] = useState(false);
  const [savingProjekt, setSavingProjekt] = useState(false);

  useEffect(() => {
    loadAktivitaeten();
    resolveKundenNamen();
    loadProjekte();
  }, [kunde.kunde.id, kunde.beziehungenAlsVerein, kunde.beziehungenAlsPlatzbauer]);

  const loadAktivitaeten = async () => {
    try {
      const akt = await saisonplanungService.loadAktivitaetenFuerKunde(kunde.kunde.id);
      setAktivitaeten(akt);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    }
  };

  const loadProjekte = async () => {
    setLoadingProjekte(true);
    try {
      // Lade alle Projekte für diesen Kunden (alle Saisonjahre)
      const alleProjekte = await projektService.loadProjekte({ suche: kunde.kunde.name });
      // Filtere nach KundeId, da die Suche möglicherweise mehrere Kunden zurückgibt
      const kundeProjekte = alleProjekte.filter(p => p.kundeId === kunde.kunde.id);
      // Sortiere nach Saisonjahr (neueste zuerst)
      kundeProjekte.sort((a, b) => b.saisonjahr - a.saisonjahr);
      setProjekte(kundeProjekte);
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
    } finally {
      setLoadingProjekte(false);
    }
  };

  const handleNeuesProjekt = () => {
    setShowProjektDialog(true);
  };

  const handleSaveProjekt = async (neuesProjekt: NeuesProjekt) => {
    setSavingProjekt(true);
    try {
      await projektService.createProjekt(neuesProjekt);
      
      // Schließe Dialog
      setShowProjektDialog(false);
      
      // Navigiere zur Projektverwaltung
      navigate('/projektverwaltung');
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      alert('Fehler beim Erstellen des Projekts');
    } finally {
      setSavingProjekt(false);
    }
  };

  const handleProjektClick = (projekt: Projekt) => {
    const projektId = (projekt as any).$id || projekt.id;
    navigate(`/bestellabwicklung/${projektId}`);
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

  const resolveKundenNamen = async () => {
    const ids = new Set<string>();
    kunde.beziehungenAlsVerein?.forEach((b) => b.platzbauerId && ids.add(b.platzbauerId));
    kunde.beziehungenAlsPlatzbauer?.forEach((b) => b.vereinId && ids.add(b.vereinId));

    const unknownIds = Array.from(ids).filter((id) => !kundenNamen[id]);
    if (unknownIds.length === 0) return;

    const entries = await Promise.all(
      unknownIds.map(async (id) => {
        const k = await saisonplanungService.loadKunde(id);
        return { id, name: k?.name || id };
      })
    );

    setKundenNamen((prev) => {
      const next = { ...prev };
      for (const { id, name } of entries) {
        next[id] = name;
      }
      return next;
    });
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
              {kunde.kunde.typ === 'verein' && (
                <div>
                  <span className="font-medium text-gray-700">Bezug Platzbauer über uns:</span>{' '}
                  <span className="text-gray-900">
                    {kunde.kunde.beziehtUeberUnsPlatzbauer ? 'Ja' : 'Nein'}
                  </span>
                </div>
              )}
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
                          <div key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-red-600" />
                            <a
                              href={`tel:${tel.nummer}`}
                              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              {tel.nummer}
                            </a>
                            {tel.typ && <span className="text-gray-500">({tel.typ})</span>}
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
                    {kundenNamen[b.platzbauerId] || b.platzbauerId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
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
                      {kundenNamen[b.vereinId] || b.vereinId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
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

          {/* Projekte */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Projekte
              </h3>
              <button
                onClick={handleNeuesProjekt}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Neues Projekt
              </button>
            </div>

            {loadingProjekte ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Lade Projekte...</p>
              </div>
            ) : projekte.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 mb-2">Noch keine Projekte vorhanden</p>
                <p className="text-sm text-gray-500">
                  Erstellen Sie ein neues Projekt, um mit der Bestellabwicklung zu beginnen.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projekte.map((projekt) => (
                  <div
                    key={(projekt as any).$id || projekt.id}
                    onClick={() => handleProjektClick(projekt)}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-green-300 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">Saison {projekt.saisonjahr}</span>
                          <StatusBadge status={projekt.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {projekt.angefragteMenge && (
                            <div className="text-gray-600">
                              Menge: <span className="font-medium text-gray-900">{projekt.angefragteMenge.toFixed(1)} t</span>
                            </div>
                          )}
                          {projekt.preisProTonne && (
                            <div className="text-gray-600">
                              Preis: <span className="font-medium text-gray-900">{formatCurrency(projekt.preisProTonne)}/t</span>
                            </div>
                          )}
                          {projekt.bezugsweg && (
                            <div className="text-gray-600">
                              Bezugsweg: <span className="font-medium text-gray-900">
                                {projekt.bezugsweg === 'direkt' ? 'Direkt' : 'Über Platzbauer'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          {projekt.angebotsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <FileCheck className="w-3 h-3 text-blue-500" />
                              Angebot: {projekt.angebotsnummer}
                              {projekt.angebotsdatum && (
                                <span> • {new Date(projekt.angebotsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.auftragsbestaetigungsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <FileSignature className="w-3 h-3 text-orange-500" />
                              AB: {projekt.auftragsbestaetigungsnummer}
                              {projekt.auftragsbestaetigungsdatum && (
                                <span> • {new Date(projekt.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.lieferscheinnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Truck className="w-3 h-3 text-green-500" />
                              Lieferschein: {projekt.lieferscheinnummer}
                              {projekt.lieferdatum && (
                                <span> • {new Date(projekt.lieferdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.rechnungsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <FileText className="w-3 h-3 text-red-500" />
                              Rechnung: {projekt.rechnungsnummer}
                              {projekt.rechnungsdatum && (
                                <span> • {new Date(projekt.rechnungsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.status === 'bezahlt' && projekt.bezahltAm && (
                            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Bezahlt am {new Date(projekt.bezahltAm).toLocaleDateString('de-DE')}
                            </div>
                          )}
                        </div>
                        {projekt.notizen && (
                          <div className="text-xs text-gray-400 mt-2 line-clamp-1 italic">
                            "{projekt.notizen}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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

        {/* Projekt-Dialog */}
        {showProjektDialog && (
          <ProjektDialog
            kundenname={kunde.kunde.name}
            kundeId={kunde.kunde.id}
            kundennummer={kunde.kunde.kundennummer}
            kundenstrasse={kunde.kunde.adresse.strasse}
            kundenPlzOrt={`${kunde.kunde.adresse.plz} ${kunde.kunde.adresse.ort}`}
            angefragteMenge={kunde.aktuelleSaison?.angefragteMenge}
            preisProTonne={kunde.aktuelleSaison?.preisProTonne || kunde.kunde.zuletztGezahlterPreis}
            bezugsweg={kunde.aktuelleSaison?.bezugsweg || kunde.kunde.standardBezugsweg}
            onSave={handleSaveProjekt}
            onCancel={() => setShowProjektDialog(false)}
            saving={savingProjekt}
          />
        )}
      </div>
    </div>
  );
};

// Status Badge Komponente für Projekte
interface StatusBadgeProps {
  status: string;
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    angebot: { label: 'Angebot', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    auftragsbestaetigung: { label: 'Auftragsbestätigung', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    lieferschein: { label: 'Lieferschein', color: 'text-green-700', bgColor: 'bg-green-100' },
    rechnung: { label: 'Rechnung', color: 'text-red-700', bgColor: 'bg-red-100' },
    bezahlt: { label: 'Bezahlt', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  };

  const config = statusConfig[status] || { label: status, color: 'text-gray-700', bgColor: 'bg-gray-100' };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
};

export default KundenDetail;
