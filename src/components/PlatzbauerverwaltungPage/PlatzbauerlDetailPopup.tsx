import { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Mail,
  Users,
  FileCheck,
  Package,
  Euro,
  Plus,
  Building2,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PlatzbauermitVereinen, PlatzbauerProjekt } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import PlatzbauerlVereine from './PlatzbauerlVereine';
import PlatzbauerlProjektDetail from './PlatzbauerlProjektDetail';

interface PlatzbauerlDetailPopupProps {
  platzbauerId: string;
  saisonjahr: number;
  onClose: () => void;
  onRefresh: () => void;
  // URL-basierte Projekt-Auswahl (für Persistenz beim Reload)
  selectedProjektId: string | null;
  setSelectedProjektId: (id: string | null) => void;
}

type TabId = 'stammdaten' | 'vereine' | 'projekte';

const PlatzbauerlDetailPopup = ({
  platzbauerId,
  saisonjahr,
  onClose,
  onRefresh,
  selectedProjektId,
  setSelectedProjektId,
}: PlatzbauerlDetailPopupProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlatzbauermitVereinen | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('stammdaten');

  // Daten laden
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [platzbauer, vereine, projekte] = await Promise.all([
          platzbauerverwaltungService.loadPlatzbauer(platzbauerId),
          platzbauerverwaltungService.loadVereineFuerPlatzbauer(platzbauerId),
          platzbauerverwaltungService.loadProjekteFuerPlatzbauer(platzbauerId, saisonjahr),
        ]);

        if (platzbauer) {
          setData({
            platzbauer,
            vereine,
            projekte,
            statistik: {
              anzahlVereine: vereine.length,
              gesamtMenge: projekte.reduce((sum, p) => sum + (p.gesamtMenge || 0), 0),
              offeneProjekte: projekte.filter(p => !['bezahlt', 'verloren'].includes(p.status)).length,
              abgeschlosseneProjekte: projekte.filter(p => p.status === 'bezahlt').length,
            },
          });
        }
      } catch (error) {
        console.error('Fehler beim Laden der Platzbauer-Daten:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [platzbauerId, saisonjahr]);

  // Nachtrag erstellen
  const handleCreateNachtrag = async () => {
    if (!data?.projekte.length) return;

    // Finde das Haupt-Saisonprojekt
    const hauptprojekt = data.projekte.find(p => p.typ === 'saisonprojekt');
    if (!hauptprojekt) return;

    try {
      const nachtrag = await platzbauerverwaltungService.createNachtrag(hauptprojekt.id);
      setSelectedProjektId(nachtrag.id);
      onRefresh();
    } catch (error) {
      console.error('Fehler beim Erstellen des Nachtrags:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl p-8">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Lade Platzbauer-Daten...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl p-8 text-center">
          <p className="text-red-500">Platzbauer nicht gefunden</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-dark-border rounded-lg"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const { platzbauer, vereine, projekte, statistik } = data;
  const adresse = platzbauer.lieferadresse || platzbauer.rechnungsadresse;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-5xl my-8">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border rounded-t-2xl z-10">
            <div className="p-6 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {platzbauer.name}
                  </h2>
                  {adresse && (
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 mt-1">
                      <MapPin className="w-4 h-4" />
                      <span>{adresse.strasse}, {adresse.plz} {adresse.ort}</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 flex gap-1">
              {[
                { id: 'stammdaten' as TabId, label: 'Stammdaten', icon: Building2 },
                { id: 'vereine' as TabId, label: `Vereine (${vereine.length})`, icon: Users },
                { id: 'projekte' as TabId, label: `Projekte (${projekte.length})`, icon: FileCheck },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
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
            {activeTab === 'stammdaten' && (
              <StammdatenTab platzbauer={platzbauer} statistik={statistik} />
            )}
            {activeTab === 'vereine' && (
              <PlatzbauerlVereine
                vereine={vereine}
                platzbauerId={platzbauerId}
                saisonjahr={saisonjahr}
              />
            )}
            {activeTab === 'projekte' && (
              <ProjekteTab
                projekte={projekte}
                onSelectProjekt={setSelectedProjektId}
                onCreateNachtrag={handleCreateNachtrag}
              />
            )}
          </div>
        </div>
      </div>

      {/* Projekt-Detail-Popup */}
      {selectedProjektId && (
        <PlatzbauerlProjektDetail
          projektId={selectedProjektId}
          onClose={() => setSelectedProjektId(null)}
          onRefresh={() => {
            onRefresh();
            // Reload data
          }}
        />
      )}
    </>
  );
};

// Stammdaten-Tab
const StammdatenTab = ({
  platzbauer,
  statistik,
}: {
  platzbauer: SaisonKunde;
  statistik?: PlatzbauermitVereinen['statistik'];
}) => {
  const adresse = platzbauer.lieferadresse || platzbauer.rechnungsadresse;
  const rechnungsadresse = platzbauer.rechnungsadresse;

  return (
    <div className="space-y-6">
      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <Users className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {statistik?.anzahlVereine || 0}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Vereine</div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
          <Package className="w-6 h-6 text-green-600 dark:text-green-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {statistik?.gesamtMenge?.toFixed(0) || 0} t
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Gesamtmenge</div>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
          <FileCheck className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {statistik?.offeneProjekte || 0}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Offene Projekte</div>
        </div>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
          <Euro className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {statistik?.abgeschlosseneProjekte || 0}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Abgeschlossen</div>
        </div>
      </div>

      {/* Kontaktdaten */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Lieferadresse */}
        <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            Lieferadresse
          </h4>
          {adresse ? (
            <div className="text-gray-600 dark:text-gray-300 space-y-1">
              <p>{adresse.strasse}</p>
              <p>{adresse.plz} {adresse.ort}</p>
              {adresse.bundesland && <p className="text-sm text-gray-500">{adresse.bundesland}</p>}
            </div>
          ) : (
            <p className="text-gray-400">Keine Adresse hinterlegt</p>
          )}
        </div>

        {/* Rechnungsadresse */}
        <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            Rechnungsadresse
          </h4>
          {rechnungsadresse ? (
            <div className="text-gray-600 dark:text-gray-300 space-y-1">
              <p>{rechnungsadresse.strasse}</p>
              <p>{rechnungsadresse.plz} {rechnungsadresse.ort}</p>
            </div>
          ) : (
            <p className="text-gray-400">Wie Lieferadresse</p>
          )}
        </div>

        {/* Kontakt */}
        <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Kontakt</h4>
          <div className="space-y-2">
            {platzbauer.email && (
              <a
                href={`mailto:${platzbauer.email}`}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400"
              >
                <Mail className="w-4 h-4" />
                {platzbauer.email}
              </a>
            )}
            {!platzbauer.email && (
              <p className="text-gray-400">Keine Kontaktdaten hinterlegt</p>
            )}
          </div>
        </div>

        {/* Zusätzliche Infos */}
        <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Zusätzliche Infos</h4>
          <div className="space-y-2 text-sm">
            {platzbauer.kundennummer && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kundennummer</span>
                <span className="font-medium text-gray-900 dark:text-white">{platzbauer.kundennummer}</span>
              </div>
            )}
            {platzbauer.zahlungsziel && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Zahlungsziel</span>
                <span className="font-medium text-gray-900 dark:text-white">{platzbauer.zahlungsziel} Tage</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notizen */}
      {platzbauer.notizen && (
        <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Notizen</h4>
          <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{platzbauer.notizen}</p>
        </div>
      )}
    </div>
  );
};

// Projekte-Tab
const ProjekteTab = ({
  projekte,
  onSelectProjekt,
  onCreateNachtrag,
}: {
  projekte: PlatzbauerProjekt[];
  onSelectProjekt: (id: string) => void;
  onCreateNachtrag: () => void;
}) => {
  // Sortiere: Saisonprojekte zuerst, dann Nachträge nach Nummer
  const sortierteProjekte = [...projekte].sort((a, b) => {
    if (a.typ !== b.typ) return a.typ === 'saisonprojekt' ? -1 : 1;
    return (a.nachtragNummer || 0) - (b.nachtragNummer || 0);
  });

  const statusColors: Record<string, string> = {
    angebot: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    angebot_versendet: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    auftragsbestaetigung: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    lieferschein: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    rechnung: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    bezahlt: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    verloren: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };

  const statusLabels: Record<string, string> = {
    angebot: 'Angebot',
    angebot_versendet: 'Angebot versendet',
    auftragsbestaetigung: 'AB',
    lieferschein: 'Lieferschein',
    rechnung: 'Rechnung',
    bezahlt: 'Bezahlt',
    verloren: 'Verloren',
  };

  return (
    <div className="space-y-4">
      {/* Header mit Nachtrag-Button */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-white">
          {projekte.length} Projekt{projekte.length !== 1 ? 'e' : ''} in dieser Saison
        </h3>
        <button
          onClick={onCreateNachtrag}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nachtrag erstellen
        </button>
      </div>

      {/* Projekte-Liste */}
      {sortierteProjekte.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Keine Projekte für diese Saison vorhanden.
        </div>
      ) : (
        <div className="space-y-2">
          {sortierteProjekte.map(projekt => (
            <div
              key={projekt.id}
              onClick={() => onSelectProjekt(projekt.id)}
              className="flex items-center justify-between p-4 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg hover:border-amber-400 dark:hover:border-amber-500 cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${projekt.typ === 'saisonprojekt' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  <FileCheck className={`w-5 h-5 ${projekt.typ === 'saisonprojekt' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    {projekt.projektName}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {projekt.anzahlVereine || 0} Vereine · {projekt.gesamtMenge?.toFixed(1) || 0} t
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[projekt.status]}`}>
                  {statusLabels[projekt.status]}
                </span>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlatzbauerlDetailPopup;
