/**
 * Platzbauer-Projekt-Detail
 *
 * Vollständige Projektabwicklung für Platzbauer-Projekte:
 * - Übersicht mit Statistiken
 * - Angebot erstellen/bearbeiten
 * - Auftragsbestätigung erstellen/bearbeiten
 * - Rechnung erstellen (final)
 * - Lieferscheine pro Verein
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  FileCheck,
  FileText,
  Euro,
  Truck,
  RefreshCw,
  ChevronRight,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Users,
  Package,
  Download,
  Eye,
  Save,
  Clock,
  FileSignature,
  History,
  Plus,
  Trash2,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import {
  PlatzbauerProjekt,
  PlatzbauerPosition,
  PlatzbauerAngebotPosition,
  PlatzbauerAngebotFormularDaten,
  PlatzbauerABFormularDaten,
  PlatzbauerRechnungFormularDaten,
  PlatzbauerLieferscheinFormularDaten,
  GespeicherterPlatzbauerLieferschein,
  PlatzbauerDokumentVerlaufEintrag,
} from '../../types/platzbauer';
import { Artikel } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import { SaisonKunde } from '../../types/saisonplanung';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import {
  platzbauerprojektabwicklungDokumentService,
  speicherePlatzbauerAngebot,
  speicherePlatzbauerAuftragsbestaetigung,
  speicherePlatzbauerRechnung,
  speicherePlatzbauerLieferschein,
  ladeDokumentVerlauf,
  ladeLieferscheineFuerProjekt,
  speichereEntwurf,
  ladeEntwurf,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import { useNavigate } from 'react-router-dom';

interface PlatzbauerlProjektDetailProps {
  projektId: string;
  onClose: () => void;
  onRefresh: () => void;
}

type TabId = 'uebersicht' | 'angebot' | 'auftragsbestaetigung' | 'rechnung' | 'lieferscheine';

const PlatzbauerlProjektDetail = ({
  projektId,
  onClose,
  onRefresh,
}: PlatzbauerlProjektDetailProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projekt, setProjekt] = useState<PlatzbauerProjekt | null>(null);
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde | null>(null);
  const [positionen, setPositionen] = useState<PlatzbauerPosition[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Daten laden
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projektDaten, pos] = await Promise.all([
        platzbauerverwaltungService.getPlatzbauerprojekt(projektId),
        platzbauerverwaltungService.aggregierePositionen(projektId),
      ]);
      setProjekt(projektDaten);
      setPositionen(pos);

      // Platzbauer-Daten laden
      if (projektDaten) {
        const pbData = await platzbauerverwaltungService.loadPlatzbauer(projektDaten.platzbauerId);
        setPlatzbauer(pbData);
      }
    } catch (err) {
      console.error('Fehler beim Laden des Projekts:', err);
      setError('Fehler beim Laden der Projektdaten');
    } finally {
      setLoading(false);
    }
  }, [projektId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Erfolgs-/Fehlermeldungen ausblenden
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl p-8">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Lade Projekt...</p>
        </div>
      </div>
    );
  }

  if (!projekt || !platzbauer) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 font-medium">Projekt nicht gefunden</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 dark:bg-dark-border rounded-lg">
            Schließen
          </button>
        </div>
      </div>
    );
  }

  // Berechnungen
  const gesamtMenge = positionen.reduce((sum, p) => sum + p.menge, 0);
  const gesamtPreis = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);

  const statusColors: Record<string, string> = {
    angebot: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    angebot_versendet: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    auftragsbestaetigung: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    lieferschein: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    rechnung: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    bezahlt: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  const statusLabels: Record<string, string> = {
    angebot: 'Angebot',
    angebot_versendet: 'Angebot versendet',
    auftragsbestaetigung: 'Auftragsbestätigung',
    lieferschein: 'Lieferschein',
    rechnung: 'Rechnung',
    bezahlt: 'Bezahlt',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-5xl my-8">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border rounded-t-2xl z-10">
          <div className="p-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {projekt.projektName}
                </h2>
                <span className={`px-2 py-1 text-sm font-medium rounded-full ${statusColors[projekt.status] || 'bg-gray-100 text-gray-700'}`}>
                  {statusLabels[projekt.status] || projekt.status}
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Saison {projekt.saisonjahr} · {platzbauer.name}
                {projekt.typ === 'nachtrag' && ` · Nachtrag ${projekt.nachtragNummer}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Meldungen */}
          {error && (
            <div className="mx-6 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mx-6 mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="px-6 flex gap-1 overflow-x-auto">
            {[
              { id: 'uebersicht' as TabId, label: 'Übersicht', icon: FileCheck },
              { id: 'angebot' as TabId, label: 'Angebot', icon: FileText },
              { id: 'auftragsbestaetigung' as TabId, label: 'AB', icon: FileSignature },
              { id: 'rechnung' as TabId, label: 'Rechnung', icon: Euro },
              { id: 'lieferscheine' as TabId, label: `Lieferscheine`, icon: Truck },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-amber-600 dark:text-amber-400 border-amber-500'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'uebersicht' && (
            <UebersichtTab
              projekt={projekt}
              platzbauer={platzbauer}
              positionen={positionen}
              gesamtMenge={gesamtMenge}
              gesamtPreis={gesamtPreis}
              onNavigateToVerein={(id) => navigate(`/kundenliste?kunde=${id}`)}
            />
          )}
          {activeTab === 'angebot' && (
            <AngebotTab
              projekt={projekt}
              platzbauer={platzbauer}
              positionen={positionen}
              onSave={async (daten) => {
                setSaving(true);
                setError(null);
                try {
                  await speicherePlatzbauerAngebot(projekt, daten);
                  setSuccess('Angebot wurde erfolgreich gespeichert');
                  await loadData();
                  onRefresh();
                } catch (err: any) {
                  setError(err.message || 'Fehler beim Speichern des Angebots');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
            />
          )}
          {activeTab === 'auftragsbestaetigung' && (
            <AuftragsbestaetigungTab
              projekt={projekt}
              platzbauer={platzbauer}
              positionen={positionen}
              onSave={async (daten) => {
                setSaving(true);
                setError(null);
                try {
                  await speicherePlatzbauerAuftragsbestaetigung(projekt, daten);
                  setSuccess('Auftragsbestätigung wurde erfolgreich gespeichert');
                  await loadData();
                  onRefresh();
                } catch (err: any) {
                  setError(err.message || 'Fehler beim Speichern der AB');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
            />
          )}
          {activeTab === 'rechnung' && (
            <RechnungTab
              projekt={projekt}
              platzbauer={platzbauer}
              positionen={positionen}
              onSave={async (daten) => {
                setSaving(true);
                setError(null);
                try {
                  await speicherePlatzbauerRechnung(projekt, daten);
                  setSuccess('Rechnung wurde erfolgreich gespeichert');
                  await loadData();
                  onRefresh();
                } catch (err: any) {
                  setError(err.message || 'Fehler beim Speichern der Rechnung');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
            />
          )}
          {activeTab === 'lieferscheine' && (
            <LieferscheineTab
              projekt={projekt}
              platzbauer={platzbauer}
              positionen={positionen}
              onCreateLieferschein={async (position, daten) => {
                setSaving(true);
                setError(null);
                try {
                  await speicherePlatzbauerLieferschein(projekt, position, daten);
                  setSuccess(`Lieferschein für ${position.vereinsname} wurde erstellt`);
                  await loadData();
                  onRefresh();
                } catch (err: any) {
                  setError(err.message || 'Fehler beim Erstellen des Lieferscheins');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== ÜBERSICHT TAB ====================

interface UebersichtTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde;
  positionen: PlatzbauerPosition[];
  gesamtMenge: number;
  gesamtPreis: number;
  onNavigateToVerein: (id: string) => void;
}

const UebersichtTab = ({
  projekt,
  platzbauer,
  positionen,
  gesamtMenge,
  gesamtPreis,
  onNavigateToVerein,
}: UebersichtTabProps) => {
  const [lieferscheine, setLieferscheine] = useState<GespeicherterPlatzbauerLieferschein[]>([]);

  useEffect(() => {
    ladeLieferscheineFuerProjekt(projekt.id).then(setLieferscheine);
  }, [projekt.id]);

  const lieferscheineErstellt = lieferscheine.length;

  return (
    <div className="space-y-6">
      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Vereine" value={positionen.length} color="blue" />
        <StatCard icon={Package} label="Gesamtmenge" value={`${gesamtMenge.toFixed(1)} t`} color="green" />
        <StatCard
          icon={Euro}
          label="Gesamtbetrag"
          value={`${gesamtPreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`}
          color="amber"
        />
        <StatCard
          icon={Truck}
          label="Lieferscheine"
          value={`${lieferscheineErstellt}/${positionen.length}`}
          color="purple"
        />
      </div>

      {/* Dokument-Status */}
      <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">Dokument-Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <DokumentStatusCard
            label="Angebot"
            nummer={projekt.angebotsnummer}
            datum={projekt.angebotsdatum}
            icon={FileText}
            color="blue"
          />
          <DokumentStatusCard
            label="Auftragsbestätigung"
            nummer={projekt.auftragsbestaetigungsnummer}
            datum={projekt.auftragsbestaetigungsdatum}
            icon={FileSignature}
            color="purple"
          />
          <DokumentStatusCard
            label="Rechnung"
            nummer={projekt.rechnungsnummer}
            datum={projekt.rechnungsdatum}
            icon={Euro}
            color="amber"
          />
          <DokumentStatusCard
            label="Bezahlt"
            nummer={projekt.bezahltAm ? 'Ja' : undefined}
            datum={projekt.bezahltAm}
            icon={CheckCircle2}
            color="green"
          />
        </div>
      </div>

      {/* Platzbauer-Info */}
      <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-3">Platzbauer</h3>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-white">{platzbauer.name}</p>
            {platzbauer.lieferadresse && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {platzbauer.lieferadresse.strasse}, {platzbauer.lieferadresse.plz} {platzbauer.lieferadresse.ort}
              </p>
            )}
            {platzbauer.email && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{platzbauer.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Positionen-Tabelle */}
      <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Positionen ({positionen.length} Vereine)
          </h3>
        </div>
        {positionen.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
            <p>Keine Vereinsprojekte zugeordnet</p>
            <p className="text-sm mt-1">
              Vereinsprojekte werden automatisch zugeordnet, wenn Projekte für Vereine erstellt werden.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-bg">
                <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">Verein</th>
                  <th className="px-4 py-3">Ort</th>
                  <th className="px-4 py-3 text-right">Menge</th>
                  <th className="px-4 py-3 text-right">Preis/t</th>
                  <th className="px-4 py-3 text-right">Gesamt</th>
                  <th className="px-4 py-3 text-center">LS</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {positionen.map((pos, index) => {
                  const hatLieferschein = lieferscheine.some(ls => ls.vereinId === pos.vereinId);
                  return (
                    <tr key={`${pos.vereinsprojektId}-${index}`} className="hover:bg-gray-50 dark:hover:bg-dark-bg">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {pos.vereinsname}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {pos.lieferadresse ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {pos.lieferadresse.plz} {pos.lieferadresse.ort}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {pos.menge.toFixed(1)} t
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                        {pos.einzelpreis.toFixed(2)} €
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {pos.gesamtpreis.toFixed(2)} €
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hatLieferschein ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <span className="w-5 h-5 block rounded-full border-2 border-gray-300 dark:border-gray-600 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onNavigateToVerein(pos.vereinId)}
                          className="p-1 text-gray-400 hover:text-amber-500 rounded"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-dark-bg border-t-2 border-gray-200 dark:border-dark-border">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-gray-900 dark:text-white">Summe</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {gesamtMenge.toFixed(1)} t
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {gesamtPreis.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== ANGEBOT TAB ====================

// Ziegelmehl-Artikel für Platzbauer (TM-ZM-02 und TM-ZM-03)
const ZIEGELMEHL_ARTIKEL_NUMMERN = ['TM-ZM-02', 'TM-ZM-03'];

// Type für gespeicherte Angebots-Entwurfsdaten
interface AngebotEntwurfsDaten {
  vereineAuswahl: {
    vereinId: string;
    ausgewaehlt: boolean;
    menge: number;
    einzelpreis: number;
    artikelnummer: string;
  }[];
  zusatzPositionen: PlatzbauerAngebotPosition[];
  formData: Partial<PlatzbauerAngebotFormularDaten>;
}

// Interface für Verein mit Auswahl-Status
interface VereinAuswahl {
  verein: SaisonKunde;
  ausgewaehlt: boolean;
  menge: number;
  einzelpreis: number;
  artikelnummer: string;
}

interface AngebotTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde;
  positionen: PlatzbauerPosition[];
  onSave: (daten: PlatzbauerAngebotFormularDaten) => Promise<void>;
  saving: boolean;
}

const AngebotTab = ({ projekt, platzbauer, positionen, onSave, saving }: AngebotTabProps) => {
  const [verlauf, setVerlauf] = useState<PlatzbauerDokumentVerlaufEintrag[]>([]);
  const [ziegelmehlArtikel, setZiegelmehlArtikel] = useState<Artikel[]>([]);
  const [alleArtikel, setAlleArtikel] = useState<Artikel[]>([]); // Alle Artikel für Zusatzpositionen
  const [laden, setLaden] = useState(true);

  // Alle Vereine des Platzbauers
  const [vereineAuswahl, setVereineAuswahl] = useState<VereinAuswahl[]>([]);

  // Zusätzliche manuelle Positionen (ohne Verein)
  const [zusatzPositionen, setZusatzPositionen] = useState<PlatzbauerAngebotPosition[]>([]);

  // Auto-Save Status
  const [autoSaveStatus, setAutoSaveStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);
  const initialLaden = useRef(true);

  const [formData, setFormData] = useState<PlatzbauerAngebotFormularDaten>({
    platzbauerId: platzbauer.id,
    platzbauername: platzbauer.name,
    platzbauerstrasse: platzbauer.lieferadresse?.strasse || platzbauer.rechnungsadresse?.strasse || '',
    platzbauerPlzOrt: platzbauer.lieferadresse
      ? `${platzbauer.lieferadresse.plz} ${platzbauer.lieferadresse.ort}`
      : platzbauer.rechnungsadresse
      ? `${platzbauer.rechnungsadresse.plz} ${platzbauer.rechnungsadresse.ort}`
      : '',
    positionen,
    angebotsnummer: projekt.angebotsnummer || '',
    angebotsdatum: projekt.angebotsdatum || new Date().toISOString().split('T')[0],
    gueltigBis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
  });

  // Artikel, Vereine und gespeicherte Entwurfsdaten laden
  useEffect(() => {
    const ladeDaten = async () => {
      setLaden(true);
      initialLaden.current = true;
      try {
        // Artikel laden
        const artikelListe = await getAlleArtikel();
        setAlleArtikel(artikelListe); // Alle Artikel für Zusatzpositionen
        const ziegelmehl = artikelListe.filter(a => ZIEGELMEHL_ARTIKEL_NUMMERN.includes(a.artikelnummer));
        setZiegelmehlArtikel(ziegelmehl);

        const defaultArtikel = ziegelmehl.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehl[0];
        const defaultPreis = defaultArtikel?.einzelpreis || 0;

        // Vereine des Platzbauers laden
        const vereineDaten = await platzbauerverwaltungService.loadVereineFuerPlatzbauer(platzbauer.id);

        // Gespeicherten Entwurf laden
        const gespeicherterEntwurf = await ladeEntwurf<AngebotEntwurfsDaten>(projekt.id, 'angebot');

        // Vereine mit Auswahl-Status initialisieren
        const vereineMitAuswahl: VereinAuswahl[] = vereineDaten.map(v => {
          // Prüfen ob gespeicherte Entwurfsdaten für diesen Verein existieren
          const gespeicherteAuswahl = gespeicherterEntwurf?.vereineAuswahl?.find(
            va => va.vereinId === v.kunde.id
          );

          if (gespeicherteAuswahl) {
            return {
              verein: v.kunde,
              ausgewaehlt: gespeicherteAuswahl.ausgewaehlt,
              menge: gespeicherteAuswahl.menge,
              einzelpreis: gespeicherteAuswahl.einzelpreis,
              artikelnummer: gespeicherteAuswahl.artikelnummer,
            };
          }

          // Falls kein Entwurf, prüfen ob Verein in existierenden Positionen ist
          const existierendePos = positionen.find(p => p.vereinId === v.kunde.id);
          return {
            verein: v.kunde,
            ausgewaehlt: !!existierendePos,
            menge: existierendePos?.menge || 0,
            einzelpreis: existierendePos?.einzelpreis || defaultPreis,
            artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
          };
        });

        setVereineAuswahl(vereineMitAuswahl);

        // Zusatzpositionen aus Entwurf laden
        if (gespeicherterEntwurf?.zusatzPositionen) {
          setZusatzPositionen(gespeicherterEntwurf.zusatzPositionen);
        }

        // FormData aus Entwurf laden (wenn vorhanden)
        if (gespeicherterEntwurf?.formData) {
          // Standard-Platzbauer-Daten als Fallback
          const defaultPlatzbauerStrasse = platzbauer.lieferadresse?.strasse || platzbauer.rechnungsadresse?.strasse || '';
          const defaultPlatzbauerPlzOrt = platzbauer.lieferadresse
            ? `${platzbauer.lieferadresse.plz} ${platzbauer.lieferadresse.ort}`
            : platzbauer.rechnungsadresse
            ? `${platzbauer.rechnungsadresse.plz} ${platzbauer.rechnungsadresse.ort}`
            : '';

          setFormData(prev => ({
            ...prev,
            ...gespeicherterEntwurf.formData,
            // Platzbauer-ID immer aktuell, aber Adressdaten aus Entwurf wenn vorhanden
            platzbauerId: platzbauer.id,
            platzbauername: gespeicherterEntwurf.formData.platzbauername || platzbauer.name,
            platzbauerstrasse: gespeicherterEntwurf.formData.platzbauerstrasse || defaultPlatzbauerStrasse,
            platzbauerPlzOrt: gespeicherterEntwurf.formData.platzbauerPlzOrt || defaultPlatzbauerPlzOrt,
            platzbauerAnsprechpartner: gespeicherterEntwurf.formData.platzbauerAnsprechpartner || prev.platzbauerAnsprechpartner,
          }));
        }

        // Wenn Entwurf geladen wurde, Status auf "gespeichert" setzen
        if (gespeicherterEntwurf) {
          setAutoSaveStatus('gespeichert');
        }
      } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
      } finally {
        setLaden(false);
        // Nach kurzem Delay initialLaden auf false setzen, damit Änderungen gespeichert werden
        setTimeout(() => {
          initialLaden.current = false;
        }, 500);
      }
    };
    ladeDaten();
  }, [platzbauer.id, projekt.id, positionen]);

  useEffect(() => {
    ladeDokumentVerlauf(projekt.id, 'angebot').then(setVerlauf);
  }, [projekt.id]);

  // Verein auswählen/abwählen
  const toggleVerein = (index: number) => {
    setVereineAuswahl(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        ausgewaehlt: !updated[index].ausgewaehlt,
      };
      return updated;
    });
  };

  // Alle Vereine auswählen
  const selectAlleVereine = () => {
    setVereineAuswahl(prev => prev.map(v => ({ ...v, ausgewaehlt: true })));
  };

  // Keine Vereine auswählen
  const deselectAlleVereine = () => {
    setVereineAuswahl(prev => prev.map(v => ({ ...v, ausgewaehlt: false })));
  };

  // Verein-Daten aktualisieren
  const updateVerein = (index: number, updates: Partial<VereinAuswahl>) => {
    setVereineAuswahl(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  // Artikel für Verein ändern
  const handleVereinArtikelChange = (index: number, artikelnummer: string) => {
    const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === artikelnummer);
    if (artikel) {
      updateVerein(index, {
        artikelnummer: artikel.artikelnummer,
        einzelpreis: artikel.einzelpreis ?? vereineAuswahl[index].einzelpreis,
      });
    }
  };

  // Neue leere Zusatz-Position hinzufügen
  const addZusatzPosition = () => {
    const defaultArtikel = alleArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || alleArtikel[0];
    const neuePosition: PlatzbauerAngebotPosition = {
      id: `zusatz-${Date.now()}`,
      artikelId: defaultArtikel?.$id,
      artikelnummer: defaultArtikel?.artikelnummer || '',
      bezeichnung: defaultArtikel?.bezeichnung || '',
      beschreibung: '',
      einheit: defaultArtikel?.einheit || 't',
      menge: 0,
      einzelpreis: defaultArtikel?.einzelpreis || 0,
      gesamtpreis: 0,
    };
    setZusatzPositionen(prev => [...prev, neuePosition]);
  };

  // Zusatz-Position aktualisieren
  const updateZusatzPosition = (index: number, updates: Partial<PlatzbauerAngebotPosition>) => {
    setZusatzPositionen(prev => {
      const updated = [...prev];
      const current = updated[index];
      const newPos = { ...current, ...updates };
      if ('menge' in updates || 'einzelpreis' in updates) {
        newPos.gesamtpreis = newPos.menge * newPos.einzelpreis;
      }
      updated[index] = newPos;
      return updated;
    });
  };

  // Zusatz-Position Artikel ändern
  const handleZusatzArtikelChange = (index: number, artikelnummer: string) => {
    const artikel = alleArtikel.find(a => a.artikelnummer === artikelnummer);
    if (artikel) {
      updateZusatzPosition(index, {
        artikelId: artikel.$id,
        artikelnummer: artikel.artikelnummer,
        bezeichnung: artikel.bezeichnung,
        einheit: artikel.einheit,
        einzelpreis: artikel.einzelpreis ?? zusatzPositionen[index].einzelpreis,
      });
    }
  };

  // Zusatz-Position entfernen
  const removeZusatzPosition = (index: number) => {
    setZusatzPositionen(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-Save Funktion
  const speichereAutomatisch = useCallback(async () => {
    if (!projekt.id || initialLaden.current) return;

    try {
      setAutoSaveStatus('speichern');

      const entwurfsDaten: AngebotEntwurfsDaten = {
        vereineAuswahl: vereineAuswahl.map(v => ({
          vereinId: v.verein.id,
          ausgewaehlt: v.ausgewaehlt,
          menge: v.menge,
          einzelpreis: v.einzelpreis,
          artikelnummer: v.artikelnummer,
        })),
        zusatzPositionen: zusatzPositionen,
        formData: {
          // Platzbauer-Adressdaten (für manuelle Änderungen)
          platzbauerId: formData.platzbauerId,
          platzbauername: formData.platzbauername,
          platzbauerstrasse: formData.platzbauerstrasse,
          platzbauerPlzOrt: formData.platzbauerPlzOrt,
          platzbauerAnsprechpartner: formData.platzbauerAnsprechpartner,
          // Angebots-Daten
          angebotsnummer: formData.angebotsnummer,
          angebotsdatum: formData.angebotsdatum,
          gueltigBis: formData.gueltigBis,
          zahlungsziel: formData.zahlungsziel,
          zahlungsart: formData.zahlungsart,
          skontoAktiviert: formData.skontoAktiviert,
          skonto: formData.skonto,
          lieferzeit: formData.lieferzeit,
          frachtkosten: formData.frachtkosten,
          verpackungskosten: formData.verpackungskosten,
          lieferbedingungenAktiviert: formData.lieferbedingungenAktiviert,
          lieferbedingungen: formData.lieferbedingungen,
          bemerkung: formData.bemerkung,
          ihreAnsprechpartner: formData.ihreAnsprechpartner,
        },
      };

      await speichereEntwurf(projekt.id, 'angebot', entwurfsDaten);
      setAutoSaveStatus('gespeichert');
      console.log('✅ Platzbauer Angebot Auto-Save erfolgreich');
    } catch (error) {
      console.error('Fehler beim Auto-Save:', error);
      setAutoSaveStatus('fehler');
    }
  }, [projekt.id, vereineAuswahl, zusatzPositionen, formData]);

  // Debounced Auto-Save bei Änderungen
  useEffect(() => {
    if (initialLaden.current || !hatGeaendert.current) {
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch();
    }, 1500); // 1.5 Sekunden Debounce

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [vereineAuswahl, zusatzPositionen, formData, speichereAutomatisch]);

  // Änderungs-Tracking für Vereine
  const toggleVereinMitAenderung = (index: number) => {
    hatGeaendert.current = true;
    toggleVerein(index);
  };

  const updateVereinMitAenderung = (index: number, updates: Partial<VereinAuswahl>) => {
    hatGeaendert.current = true;
    updateVerein(index, updates);
  };

  const handleVereinArtikelChangeMitAenderung = (index: number, artikelnummer: string) => {
    hatGeaendert.current = true;
    handleVereinArtikelChange(index, artikelnummer);
  };

  // Änderungs-Tracking für Zusatzpositionen
  const addZusatzPositionMitAenderung = () => {
    hatGeaendert.current = true;
    addZusatzPosition();
  };

  const updateZusatzPositionMitAenderung = (index: number, updates: Partial<PlatzbauerAngebotPosition>) => {
    hatGeaendert.current = true;
    updateZusatzPosition(index, updates);
  };

  const handleZusatzArtikelChangeMitAenderung = (index: number, artikelnummer: string) => {
    hatGeaendert.current = true;
    handleZusatzArtikelChange(index, artikelnummer);
  };

  const removeZusatzPositionMitAenderung = (index: number) => {
    hatGeaendert.current = true;
    removeZusatzPosition(index);
  };

  // Änderungs-Tracking für FormData
  const setFormDataMitAenderung = (updates: Partial<PlatzbauerAngebotFormularDaten>) => {
    hatGeaendert.current = true;
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Positionen aus ausgewählten Vereinen erstellen
    const vereinsPositionen: PlatzbauerAngebotPosition[] = vereineAuswahl
      .filter(v => v.ausgewaehlt && v.menge > 0)
      .map((v, index) => {
        const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === v.artikelnummer);
        return {
          id: `verein-${index + 1}`,
          artikelId: artikel?.$id,
          artikelnummer: v.artikelnummer,
          bezeichnung: artikel?.bezeichnung || 'Ziegelmehl',
          beschreibung: `für ${v.verein.name}`,
          einheit: artikel?.einheit || 't',
          menge: v.menge,
          einzelpreis: v.einzelpreis,
          gesamtpreis: v.menge * v.einzelpreis,
          vereinId: v.verein.id,
          vereinsname: v.verein.name,
          lieferadresse: v.verein.lieferadresse,
        };
      });

    // Alle Positionen zusammenführen
    const allePositionen = [...vereinsPositionen, ...zusatzPositionen.filter(p => p.menge > 0)];

    const dataToSave: PlatzbauerAngebotFormularDaten = {
      ...formData,
      angebotPositionen: allePositionen,
      positionen: allePositionen.map(ap => ({
        vereinId: ap.vereinId || '',
        vereinsname: ap.vereinsname || ap.beschreibung || '',
        vereinsprojektId: ap.vereinsprojektId || '',
        menge: ap.menge,
        einzelpreis: ap.einzelpreis,
        gesamtpreis: ap.gesamtpreis,
        lieferadresse: ap.lieferadresse,
      })),
    };
    await onSave(dataToSave);
  };

  // Summen berechnen
  const vereinsSumme = vereineAuswahl
    .filter(v => v.ausgewaehlt)
    .reduce((sum, v) => sum + (v.menge * v.einzelpreis), 0);
  const zusatzSumme = zusatzPositionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const nettobetrag = vereinsSumme + zusatzSumme;
  const bruttobetrag = nettobetrag * 1.19;

  const ausgewaehlteVereineCount = vereineAuswahl.filter(v => v.ausgewaehlt).length;
  const gesamtMenge = vereineAuswahl
    .filter(v => v.ausgewaehlt)
    .reduce((sum, v) => sum + v.menge, 0) + zusatzPositionen.reduce((sum, p) => sum + p.menge, 0);

  if (laden) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Lade Daten...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Verlauf */}
      {verlauf.length > 0 && (
        <DokumentVerlauf verlauf={verlauf} />
      )}

      {/* Formular */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Platzbauer-Adresse (readonly) */}
        <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Empfänger</h4>
          <div className="text-gray-600 dark:text-gray-300">
            <p className="font-medium">{formData.platzbauername}</p>
            <p>{formData.platzbauerstrasse}</p>
            <p>{formData.platzbauerPlzOrt}</p>
          </div>
        </div>

        {/* Angebots-Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Angebotsnummer
            </label>
            <input
              type="text"
              value={formData.angebotsnummer}
              onChange={(e) => setFormDataMitAenderung({ angebotsnummer: e.target.value })}
              placeholder="Wird automatisch generiert"
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Angebotsdatum
            </label>
            <input
              type="date"
              value={formData.angebotsdatum}
              onChange={(e) => setFormDataMitAenderung({ angebotsdatum: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Gültig bis
            </label>
            <input
              type="date"
              value={formData.gueltigBis}
              onChange={(e) => setFormDataMitAenderung({ gueltigBis: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Vereine-Auswahl */}
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                Vereine auswählen ({ausgewaehlteVereineCount} von {vereineAuswahl.length})
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAlleVereine}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Alle auswählen
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button
                  type="button"
                  onClick={deselectAlleVereine}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Keine
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Wählen Sie die Vereine aus und geben Sie die jeweilige Menge an.
            </p>
          </div>

          {vereineAuswahl.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p>Keine Vereine für diesen Platzbauer gefunden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg">
                  <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 w-12"></th>
                    <th className="px-4 py-3">Verein</th>
                    <th className="px-4 py-3 w-32">Artikel</th>
                    <th className="px-4 py-3 w-28 text-right">Menge (t)</th>
                    <th className="px-4 py-3 w-28 text-right">Preis/t (€)</th>
                    <th className="px-4 py-3 w-28 text-right">Gesamt (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {vereineAuswahl.map((v, index) => (
                    <tr
                      key={v.verein.id}
                      className={`transition-colors ${
                        v.ausgewaehlt
                          ? 'bg-amber-50/50 dark:bg-amber-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-dark-bg'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={v.ausgewaehlt}
                          onChange={() => toggleVereinMitAenderung(index)}
                          className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{v.verein.name}</div>
                        {v.verein.lieferadresse && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {v.verein.lieferadresse.plz} {v.verein.lieferadresse.ort}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={v.artikelnummer}
                          onChange={(e) => handleVereinArtikelChangeMitAenderung(index, e.target.value)}
                          disabled={!v.ausgewaehlt}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50"
                        >
                          {ziegelmehlArtikel.map(art => (
                            <option key={art.$id} value={art.artikelnummer}>
                              {art.artikelnummer}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={v.menge || ''}
                          onChange={(e) => updateVereinMitAenderung(index, { menge: parseFloat(e.target.value) || 0 })}
                          disabled={!v.ausgewaehlt}
                          placeholder="0"
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.einzelpreis || ''}
                          onChange={(e) => updateVereinMitAenderung(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                          disabled={!v.ausgewaehlt}
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                        {v.ausgewaehlt ? (v.menge * v.einzelpreis).toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Zusätzliche Positionen */}
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              Zusätzliche Positionen ({zusatzPositionen.length})
            </h4>
            <button
              type="button"
              onClick={addZusatzPositionMitAenderung}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Position hinzufügen
            </button>
          </div>

          {zusatzPositionen.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
              Keine zusätzlichen Positionen. Hier können Sie weitere Artikel hinzufügen.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg">
                  <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                    <th className="px-3 py-3 w-12">Pos.</th>
                    <th className="px-3 py-3 w-32">Artikel</th>
                    <th className="px-3 py-3">Beschreibung</th>
                    <th className="px-3 py-3 w-24 text-right">Menge</th>
                    <th className="px-3 py-3 w-28 text-right">Preis/t</th>
                    <th className="px-3 py-3 w-28 text-right">Gesamt</th>
                    <th className="px-3 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {zusatzPositionen.map((pos, index) => (
                    <tr key={pos.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg">
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-center">
                        {ausgewaehlteVereineCount + index + 1}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={pos.artikelnummer}
                          onChange={(e) => handleZusatzArtikelChangeMitAenderung(index, e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                        >
                          {alleArtikel.map(art => (
                            <option key={art.$id} value={art.artikelnummer}>
                              {art.artikelnummer} - {art.bezeichnung}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={pos.bezeichnung || ''}
                          onChange={(e) => updateZusatzPositionMitAenderung(index, { bezeichnung: e.target.value })}
                          placeholder="Bezeichnung"
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={pos.beschreibung || ''}
                          onChange={(e) => updateZusatzPositionMitAenderung(index, { beschreibung: e.target.value })}
                          placeholder="Beschreibung (optional)"
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white mt-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={pos.menge || ''}
                          onChange={(e) => updateZusatzPositionMitAenderung(index, { menge: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={pos.einzelpreis || ''}
                          onChange={(e) => updateZusatzPositionMitAenderung(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                        {pos.gesamtpreis.toFixed(2)} €
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeZusatzPositionMitAenderung(index)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Position entfernen"
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

        {/* Summen */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 dark:text-gray-300">Gesamtmenge</span>
            <span className="font-medium text-gray-900 dark:text-white">{gesamtMenge.toFixed(1)} t</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 dark:text-gray-300">Positionen</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {ausgewaehlteVereineCount + zusatzPositionen.filter(p => p.menge > 0).length}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 dark:text-gray-300">Nettobetrag</span>
            <span className="font-medium text-gray-900 dark:text-white">{nettobetrag.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 dark:text-gray-300">MwSt. (19%)</span>
            <span className="font-medium text-gray-900 dark:text-white">{(nettobetrag * 0.19).toFixed(2)} €</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-amber-200 dark:border-amber-800">
            <span className="font-semibold text-gray-900 dark:text-white">Bruttobetrag</span>
            <span className="font-bold text-lg text-amber-600 dark:text-amber-400">{bruttobetrag.toFixed(2)} €</span>
          </div>
        </div>

        {/* Zahlungsbedingungen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Zahlungsziel
            </label>
            <select
              value={formData.zahlungsziel}
              onChange={(e) => setFormDataMitAenderung({ zahlungsziel: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            >
              <option value="Vorkasse">Vorkasse</option>
              <option value="14 Tage netto">14 Tage netto</option>
              <option value="30 Tage netto">30 Tage netto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lieferzeit
            </label>
            <input
              type="text"
              value={formData.lieferzeit || ''}
              onChange={(e) => setFormDataMitAenderung({ lieferzeit: e.target.value })}
              placeholder="z.B. März 2026"
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Bemerkung */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bemerkung
          </label>
          <textarea
            value={formData.bemerkung || ''}
            onChange={(e) => setFormDataMitAenderung({ bemerkung: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
          />
        </div>

        {/* Auto-Save Status + Buttons */}
        <div className="flex justify-between items-center gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
          {/* Auto-Save Status Anzeige */}
          <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${
            autoSaveStatus === 'gespeichert' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
            autoSaveStatus === 'speichern' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
            autoSaveStatus === 'fehler' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
            'bg-gray-50 dark:bg-dark-bg text-gray-500 dark:text-gray-400'
          }`}>
            {autoSaveStatus === 'gespeichert' && (
              <>
                <Cloud className="w-4 h-4" />
                <span>Entwurf gespeichert</span>
              </>
            )}
            {autoSaveStatus === 'speichern' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Speichern...</span>
              </>
            )}
            {autoSaveStatus === 'fehler' && (
              <>
                <CloudOff className="w-4 h-4" />
                <span>Speichern fehlgeschlagen</span>
              </>
            )}
            {autoSaveStatus === 'idle' && (
              <>
                <Cloud className="w-4 h-4 opacity-50" />
                <span>Entwurf</span>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || (ausgewaehlteVereineCount === 0 && zusatzPositionen.filter(p => p.menge > 0).length === 0)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {verlauf.length > 0 ? 'Neue Version erstellen' : 'Angebot erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==================== AUFTRAGSBESTÄTIGUNG TAB ====================

interface AuftragsbestaetigungTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde;
  positionen: PlatzbauerPosition[];
  onSave: (daten: PlatzbauerABFormularDaten) => Promise<void>;
  saving: boolean;
}

const AuftragsbestaetigungTab = ({ projekt, platzbauer, positionen, onSave, saving }: AuftragsbestaetigungTabProps) => {
  const [verlauf, setVerlauf] = useState<PlatzbauerDokumentVerlaufEintrag[]>([]);
  const [formData, setFormData] = useState<PlatzbauerABFormularDaten>({
    platzbauerId: platzbauer.id,
    platzbauername: platzbauer.name,
    platzbauerstrasse: platzbauer.lieferadresse?.strasse || platzbauer.rechnungsadresse?.strasse || '',
    platzbauerPlzOrt: platzbauer.lieferadresse
      ? `${platzbauer.lieferadresse.plz} ${platzbauer.lieferadresse.ort}`
      : platzbauer.rechnungsadresse
      ? `${platzbauer.rechnungsadresse.plz} ${platzbauer.rechnungsadresse.ort}`
      : '',
    positionen,
    auftragsbestaetigungsnummer: projekt.auftragsbestaetigungsnummer || '',
    auftragsbestaetigungsdatum: projekt.auftragsbestaetigungsdatum || new Date().toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
  });

  useEffect(() => {
    ladeDokumentVerlauf(projekt.id, 'auftragsbestaetigung').then(setVerlauf);
  }, [projekt.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const nettobetrag = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const bruttobetrag = nettobetrag * 1.19;

  return (
    <div className="space-y-6">
      {verlauf.length > 0 && <DokumentVerlauf verlauf={verlauf} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Empfänger</h4>
          <div className="text-gray-600 dark:text-gray-300">
            <p className="font-medium">{formData.platzbauername}</p>
            <p>{formData.platzbauerstrasse}</p>
            <p>{formData.platzbauerPlzOrt}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AB-Nummer
            </label>
            <input
              type="text"
              value={formData.auftragsbestaetigungsnummer}
              onChange={(e) => setFormData({ ...formData, auftragsbestaetigungsnummer: e.target.value })}
              placeholder="Wird automatisch generiert"
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Datum
            </label>
            <input
              type="date"
              value={formData.auftragsbestaetigungsdatum}
              onChange={(e) => setFormData({ ...formData, auftragsbestaetigungsdatum: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Positionen */}
        <PositionenTabelle positionen={positionen} />

        {/* Summen */}
        <SummenBlock nettobetrag={nettobetrag} bruttobetrag={bruttobetrag} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Zahlungsziel
            </label>
            <select
              value={formData.zahlungsziel}
              onChange={(e) => setFormData({ ...formData, zahlungsziel: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            >
              <option value="Vorkasse">Vorkasse</option>
              <option value="14 Tage netto">14 Tage netto</option>
              <option value="30 Tage netto">30 Tage netto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lieferzeit
            </label>
            <input
              type="text"
              value={formData.lieferzeit || ''}
              onChange={(e) => setFormData({ ...formData, lieferzeit: e.target.value })}
              placeholder="z.B. März 2026"
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bemerkung
          </label>
          <textarea
            value={formData.bemerkung || ''}
            onChange={(e) => setFormData({ ...formData, bemerkung: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
          <button
            type="submit"
            disabled={saving || positionen.length === 0}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {verlauf.length > 0 ? 'Neue Version erstellen' : 'Auftragsbestätigung erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==================== RECHNUNG TAB ====================

interface RechnungTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde;
  positionen: PlatzbauerPosition[];
  onSave: (daten: PlatzbauerRechnungFormularDaten) => Promise<void>;
  saving: boolean;
}

const RechnungTab = ({ projekt, platzbauer, positionen, onSave, saving }: RechnungTabProps) => {
  const [verlauf, setVerlauf] = useState<PlatzbauerDokumentVerlaufEintrag[]>([]);
  const [formData, setFormData] = useState<PlatzbauerRechnungFormularDaten>({
    platzbauerId: platzbauer.id,
    platzbauername: platzbauer.name,
    platzbauerstrasse: platzbauer.lieferadresse?.strasse || platzbauer.rechnungsadresse?.strasse || '',
    platzbauerPlzOrt: platzbauer.lieferadresse
      ? `${platzbauer.lieferadresse.plz} ${platzbauer.lieferadresse.ort}`
      : platzbauer.rechnungsadresse
      ? `${platzbauer.rechnungsadresse.plz} ${platzbauer.rechnungsadresse.ort}`
      : '',
    positionen,
    rechnungsnummer: projekt.rechnungsnummer || '',
    rechnungsdatum: projekt.rechnungsdatum || new Date().toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
  });

  useEffect(() => {
    ladeDokumentVerlauf(projekt.id, 'rechnung').then(setVerlauf);
  }, [projekt.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const nettobetrag = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const bruttobetrag = nettobetrag * 1.19;

  const hatRechnung = verlauf.length > 0;

  return (
    <div className="space-y-6">
      {hatRechnung ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-800 dark:text-green-300">Rechnung erstellt</h3>
              <p className="text-green-600 dark:text-green-400 mt-1">
                Rechnungsnummer: {verlauf[0].nummer}
              </p>
              <p className="text-green-600 dark:text-green-400">
                Bruttobetrag: {verlauf[0].bruttobetrag?.toFixed(2)} €
              </p>
              <div className="mt-4 flex gap-3">
                <a
                  href={verlauf[0].viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Anzeigen
                </a>
                <a
                  href={verlauf[0].downloadUrl}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-surface border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Herunterladen
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">Achtung: Rechnungen sind unveränderbar</p>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                  Nach dem Erstellen kann die Rechnung nicht mehr geändert werden. Bitte prüfen Sie alle Angaben sorgfältig.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Empfänger</h4>
            <div className="text-gray-600 dark:text-gray-300">
              <p className="font-medium">{formData.platzbauername}</p>
              <p>{formData.platzbauerstrasse}</p>
              <p>{formData.platzbauerPlzOrt}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rechnungsnummer
              </label>
              <input
                type="text"
                value={formData.rechnungsnummer}
                onChange={(e) => setFormData({ ...formData, rechnungsnummer: e.target.value })}
                placeholder="Wird automatisch generiert"
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rechnungsdatum
              </label>
              <input
                type="date"
                value={formData.rechnungsdatum}
                onChange={(e) => setFormData({ ...formData, rechnungsdatum: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Leistungsdatum
              </label>
              <input
                type="date"
                value={formData.leistungsdatum || ''}
                onChange={(e) => setFormData({ ...formData, leistungsdatum: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <PositionenTabelle positionen={positionen} />
          <SummenBlock nettobetrag={nettobetrag} bruttobetrag={bruttobetrag} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Zahlungsziel
              </label>
              <select
                value={formData.zahlungsziel}
                onChange={(e) => setFormData({ ...formData, zahlungsziel: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              >
                <option value="Vorkasse">Vorkasse</option>
                <option value="14 Tage netto">14 Tage netto</option>
                <option value="30 Tage netto">30 Tage netto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bemerkung
            </label>
            <textarea
              value={formData.bemerkung || ''}
              onChange={(e) => setFormData({ ...formData, bemerkung: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="submit"
              disabled={saving || positionen.length === 0}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-lg transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
              Rechnung erstellen (final)
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ==================== LIEFERSCHEINE TAB ====================

interface LieferscheineTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde;
  positionen: PlatzbauerPosition[];
  onCreateLieferschein: (position: PlatzbauerPosition, daten: PlatzbauerLieferscheinFormularDaten) => Promise<void>;
  saving: boolean;
}

const LieferscheineTab = ({ projekt, platzbauer, positionen, onCreateLieferschein, saving }: LieferscheineTabProps) => {
  const [lieferscheine, setLieferscheine] = useState<GespeicherterPlatzbauerLieferschein[]>([]);
  const [lieferdatum, setLieferdatum] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    ladeLieferscheineFuerProjekt(projekt.id).then(setLieferscheine);
  }, [projekt.id]);

  const handleCreateLieferschein = async (position: PlatzbauerPosition) => {
    const daten: PlatzbauerLieferscheinFormularDaten = {
      vereinId: position.vereinId,
      vereinsname: position.vereinsname,
      vereinsstrasse: position.lieferadresse?.strasse || '',
      vereinsPlzOrt: position.lieferadresse ? `${position.lieferadresse.plz} ${position.lieferadresse.ort}` : '',
      lieferscheinnummer: '',
      lieferdatum,
      menge: position.menge,
      einheit: 't',
      platzbauername: platzbauer.name,
      unterschriftenFuerEmpfangsbestaetigung: true,
    };

    await onCreateLieferschein(position, daten);
    const updated = await ladeLieferscheineFuerProjekt(projekt.id);
    setLieferscheine(updated);
  };

  const offene = positionen.filter(p => !lieferscheine.some(ls => ls.vereinId === p.vereinId));
  const erstellte = positionen.filter(p => lieferscheine.some(ls => ls.vereinId === p.vereinId));

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
        <p className="text-gray-600 dark:text-gray-300">
          Lieferscheine werden einzeln pro Verein erstellt. Der Platzbauer {platzbauer.name} ist als Auftraggeber vermerkt.
        </p>
      </div>

      {/* Lieferdatum */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Lieferdatum für neue Lieferscheine:
        </label>
        <input
          type="date"
          value={lieferdatum}
          onChange={(e) => setLieferdatum(e.target.value)}
          className="px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
        />
      </div>

      {/* Offene Lieferscheine */}
      {offene.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Noch zu erstellen ({offene.length})
          </h4>
          <div className="space-y-2">
            {offene.map((pos, index) => (
              <div
                key={`open-${pos.vereinsprojektId}-${index}`}
                className="flex items-center justify-between p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{pos.vereinsname}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                    <Package className="w-4 h-4" />
                    {pos.menge.toFixed(1)} t
                    {pos.lieferadresse && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <MapPin className="w-4 h-4" />
                        {pos.lieferadresse.plz} {pos.lieferadresse.ort}
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleCreateLieferschein(pos)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg transition-colors"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  Erstellen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Erstellte Lieferscheine */}
      {erstellte.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Bereits erstellt ({erstellte.length})
          </h4>
          <div className="space-y-2">
            {erstellte.map((pos, index) => {
              const ls = lieferscheine.find(l => l.vereinId === pos.vereinId);
              if (!ls) return null;
              return (
                <div
                  key={`done-${pos.vereinsprojektId}-${index}`}
                  className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{pos.vereinsname}</div>
                      <div className="text-sm text-green-600 dark:text-green-400">
                        {ls.lieferscheinnummer} · {ls.menge.toFixed(1)} t · {new Date(ls.lieferdatum).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={platzbauerprojektabwicklungDokumentService.getFileViewUrl(ls.dateiId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Anzeigen
                    </a>
                    <a
                      href={platzbauerprojektabwicklungDokumentService.getFileDownloadUrl(ls.dateiId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {positionen.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>Keine Vereine vorhanden</p>
          <p className="text-sm mt-1">
            Lieferscheine können erst erstellt werden, wenn Vereinsprojekte zugeordnet sind.
          </p>
        </div>
      )}
    </div>
  );
};

// ==================== SHARED COMPONENTS ====================

const StatCard = ({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) => {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className={`p-4 rounded-xl ${colors[color]}`}>
      <Icon className="w-6 h-6 mb-2" />
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
};

const DokumentStatusCard = ({
  label,
  nummer,
  datum,
  icon: Icon,
  color,
}: {
  label: string;
  nummer?: string;
  datum?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'purple' | 'amber' | 'green';
}) => {
  const colors = {
    blue: nummer ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
    purple: nummer ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
    amber: nummer ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
    green: nummer ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
  };

  return (
    <div className={`p-3 rounded-lg ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {nummer ? (
        <div className="text-sm">
          <div className="font-medium">{nummer}</div>
          {datum && <div className="text-xs opacity-75">{new Date(datum).toLocaleDateString('de-DE')}</div>}
        </div>
      ) : (
        <div className="text-sm">Nicht erstellt</div>
      )}
    </div>
  );
};

const DokumentVerlauf = ({ verlauf }: { verlauf: PlatzbauerDokumentVerlaufEintrag[] }) => {
  return (
    <div className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4">
      <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <History className="w-5 h-5 text-gray-400" />
        Dokumentverlauf
      </h4>
      <div className="space-y-2">
        {verlauf.map((dok) => (
          <div
            key={dok.id}
            className={`flex items-center justify-between p-3 rounded-lg ${
              dok.istAktuell
                ? 'bg-white dark:bg-dark-surface border border-amber-200 dark:border-amber-800'
                : 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white">{dok.nummer}</span>
                {dok.istAktuell && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                    Aktuell
                  </span>
                )}
                {dok.version && <span className="text-sm text-gray-500 dark:text-gray-400">v{dok.version}</span>}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {dok.erstelltAm.toLocaleDateString('de-DE')} · {dok.bruttobetrag?.toFixed(2)} €
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={dok.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
              >
                <Eye className="w-5 h-5" />
              </a>
              <a
                href={dok.downloadUrl}
                className="p-2 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
              >
                <Download className="w-5 h-5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PositionenTabelle = ({ positionen }: { positionen: PlatzbauerPosition[] }) => (
  <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
    <div className="p-4 border-b border-gray-200 dark:border-dark-border">
      <h4 className="font-medium text-gray-900 dark:text-white">
        Positionen ({positionen.length} Vereine)
      </h4>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-dark-bg">
          <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
            <th className="px-4 py-3">Pos.</th>
            <th className="px-4 py-3">Verein / Lieferort</th>
            <th className="px-4 py-3 text-right">Menge</th>
            <th className="px-4 py-3 text-right">Preis/t</th>
            <th className="px-4 py-3 text-right">Gesamt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {positionen.map((pos, index) => (
            <tr key={index}>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-white">{pos.vereinsname}</div>
                {pos.lieferadresse && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {pos.lieferadresse.plz} {pos.lieferadresse.ort}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                {pos.menge.toFixed(1)} t
              </td>
              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                {pos.einzelpreis.toFixed(2)} €
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                {pos.gesamtpreis.toFixed(2)} €
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SummenBlock = ({ nettobetrag, bruttobetrag }: { nettobetrag: number; bruttobetrag: number }) => (
  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
    <div className="flex justify-between items-center mb-2">
      <span className="text-gray-600 dark:text-gray-300">Nettobetrag</span>
      <span className="font-medium text-gray-900 dark:text-white">{nettobetrag.toFixed(2)} €</span>
    </div>
    <div className="flex justify-between items-center mb-2">
      <span className="text-gray-600 dark:text-gray-300">MwSt. (19%)</span>
      <span className="font-medium text-gray-900 dark:text-white">{(nettobetrag * 0.19).toFixed(2)} €</span>
    </div>
    <div className="flex justify-between items-center pt-2 border-t border-amber-200 dark:border-amber-800">
      <span className="font-semibold text-gray-900 dark:text-white">Bruttobetrag</span>
      <span className="font-bold text-lg text-amber-600 dark:text-amber-400">{bruttobetrag.toFixed(2)} €</span>
    </div>
  </div>
);

export default PlatzbauerlProjektDetail;
