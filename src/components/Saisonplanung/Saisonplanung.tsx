import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Phone, Users, Building2, TrendingUp, CheckCircle2, Clock, Filter } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  SaisonplanungStatistik,
  GespraechsStatus,
  KundenTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import KundenFormular from './KundenFormular';
import CallListe from './CallListe';
import KundenDetail from './KundenDetail';
import BeziehungsUebersicht from './BeziehungsUebersicht';

const Saisonplanung = () => {
  const [kunden, setKunden] = useState<SaisonKundeMitDaten[]>([]);
  const [statistik, setStatistik] = useState<SaisonplanungStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [showCallListe, setShowCallListe] = useState(false);
  const [showBeziehungen, setShowBeziehungen] = useState(false);
  const [selectedKunde, setSelectedKunde] = useState<SaisonKundeMitDaten | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [saisonjahr] = useState(new Date().getFullYear());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kundenData, statistikData] = await Promise.all([
        saisonplanungService.loadCallListe({}, saisonjahr),
        saisonplanungService.berechneStatistik(saisonjahr),
      ]);
      setKunden(kundenData);
      setStatistik(statistikData);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    setShowFormular(false);
    setSelectedKunde(null);
    loadData();
  };

  const handleEdit = (kunde: SaisonKundeMitDaten) => {
    setSelectedKunde(kunde);
    setShowFormular(true);
    setShowDetail(false);
  };

  const handleOpenDetail = (kunde: SaisonKundeMitDaten) => {
    setSelectedKunde(kunde);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedKunde(null);
  };

  const handleDetailUpdate = async () => {
    if (selectedKunde) {
      const updated = await saisonplanungService.loadKundeMitDaten(
        selectedKunde.kunde.id,
        saisonjahr
      );
      if (updated) {
        setSelectedKunde(updated);
      }
    }
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Kunden wirklich löschen?')) return;
    try {
      await saisonplanungService.deleteKunde(id);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Kunden');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Saisonplanung {saisonjahr}</h1>
            <p className="text-gray-600 mt-1">Verwaltung der Kundenliste und Telefonaktion</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
            <button
              onClick={() => setShowBeziehungen(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Users className="w-5 h-5" />
              Beziehungen
            </button>
            <button
              onClick={() => setShowCallListe(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Call-Liste
            </button>
            <button
              onClick={() => {
                setSelectedKunde(null);
                setShowFormular(true);
              }}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neuer Kunde
            </button>
          </div>
        </div>

        {/* Statistik-Karten */}
        {statistik && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatistikKarte
              title="Gesamt Kunden"
              value={statistik.gesamtKunden.toString()}
              subtitle={`${statistik.nachTyp.verein} Vereine, ${statistik.nachTyp.platzbauer} Platzbauer`}
              icon={Users}
              color="blue"
            />
            <StatistikKarte
              title="Offen"
              value={statistik.offeneKunden.toString()}
              subtitle="Noch zu bearbeiten"
              icon={Clock}
              color="yellow"
            />
            <StatistikKarte
              title="Erledigt"
              value={statistik.erledigteKunden.toString()}
              subtitle="Bereits kontaktiert"
              icon={CheckCircle2}
              color="green"
            />
            <StatistikKarte
              title="Angefragte Menge"
              value={`${statistik.gesamtAngefragteMenge.toFixed(1)} t`}
              subtitle="Gesamt angefragt"
              icon={TrendingUp}
              color="orange"
            />
          </div>
        )}

        {/* Kundenliste */}
        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Kundenliste</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Filter className="w-4 h-4" />
                <span>{kunden.length} Kunden</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            {kunden.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">Keine Kunden gefunden</p>
                <p className="text-sm mt-2">Erstellen Sie den ersten Kunden, um zu beginnen.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {kunden.map((kunde) => (
                  <KundenKarte
                    key={kunde.kunde.id}
                    kunde={kunde}
                    onEdit={() => handleEdit(kunde)}
                    onDelete={() => handleDelete(kunde.kunde.id)}
                    onOpenDetail={() => handleOpenDetail(kunde)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Formular Modal */}
        {showFormular && (
          <KundenFormular
            kunde={selectedKunde}
            saisonjahr={saisonjahr}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedKunde(null);
            }}
          />
        )}

        {/* Call-Liste Modal */}
        {showCallListe && (
          <CallListe
            kunden={kunden}
            saisonjahr={saisonjahr}
            onClose={() => setShowCallListe(false)}
            onUpdate={loadData}
            onOpenDetail={handleOpenDetail}
          />
        )}

        {/* Beziehungsübersicht Modal */}
        {showBeziehungen && (
          <BeziehungsUebersicht
            kunden={kunden}
            onClose={() => setShowBeziehungen(false)}
            onUpdate={loadData}
          />
        )}

        {/* Detail Modal */}
        {showDetail && selectedKunde && (
          <KundenDetail
            kunde={selectedKunde}
            saisonjahr={saisonjahr}
            onClose={handleCloseDetail}
            onEdit={() => handleEdit(selectedKunde)}
            onUpdate={handleDetailUpdate}
          />
        )}
      </div>
    </div>
  );
};

// Statistik-Karte Komponente
interface StatistikKarteProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'yellow' | 'red' | 'orange' | 'green';
}

const StatistikKarte = ({ title, value, subtitle, icon: Icon, color }: StatistikKarteProps) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className={`${colorClasses[color]} rounded-lg p-3`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};

// Kunden-Karte Komponente
interface KundenKarteProps {
  kunde: SaisonKundeMitDaten;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}

const KundenKarte = ({ kunde, onEdit, onDelete, onOpenDetail }: KundenKarteProps) => {
  const statusColors: Record<GespraechsStatus, string> = {
    offen: 'bg-yellow-100 text-yellow-800',
    in_bearbeitung: 'bg-blue-100 text-blue-800',
    erledigt: 'bg-green-100 text-green-800',
  };

  const typLabels: Record<KundenTyp, string> = {
    verein: 'Verein',
    platzbauer: 'Platzbauer',
  };

  const status = kunde.aktuelleSaison?.gespraechsstatus || 'offen';
  const angefragteMenge = kunde.aktuelleSaison?.angefragteMenge;
  const preis = kunde.kunde.zuletztGezahlterPreis || kunde.aktuelleSaison?.preisProTonne;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onOpenDetail}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{kunde.kunde.name}</h3>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
              {typLabels[kunde.kunde.typ]}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status]}`}>
              {status === 'offen' ? 'Offen' : status === 'in_bearbeitung' ? 'In Bearbeitung' : 'Erledigt'}
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              {kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}
            </p>
            {kunde.ansprechpartner.length > 0 && (
              <p className="text-xs text-gray-500">
                {kunde.ansprechpartner.length} Ansprechpartner
              </p>
            )}
            {angefragteMenge && (
              <p className="text-sm font-medium text-gray-900">
                Angefragt: {angefragteMenge.toFixed(1)} t
              </p>
            )}
            {preis && (
              <p className="text-xs text-gray-500">Preis: {preis.toFixed(2)} €/t</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            Bearbeiten
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
};

export default Saisonplanung;
