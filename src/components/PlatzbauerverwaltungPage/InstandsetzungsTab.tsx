/**
 * InstandsetzungsTab - Tab für Instandsetzungsaufträge in der Platzbauer-Verwaltung
 *
 * Zeigt alle "Direkt Instandsetzung"-Vereine und ermöglicht das Erstellen
 * von Sammelaufträgen an den Platzbauer.
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  FileText,
  Users,
  Calendar,
  CheckCircle2,
  Send,
  Clock,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  Instandsetzungsauftrag,
  INSTANDSETZUNGSAUFTRAG_STATUS_LABELS,
  INSTANDSETZUNGSAUFTRAG_STATUS_COLORS,
} from '../../types/instandsetzungsauftrag';
import {
  instandsetzungsauftragService,
  InstandsetzungsVereinMitProjekt,
} from '../../services/instandsetzungsauftragService';
import InstandsetzungsauftragFormular from './InstandsetzungsauftragFormular';
import InstandsetzungsauftragDetail from './InstandsetzungsauftragDetail';
import { useNavigate } from 'react-router-dom';

interface InstandsetzungsTabProps {
  platzbauerId: string;
  platzbauerName: string;
  saisonjahr: number;
  onRefresh: () => void;
}

const InstandsetzungsTab = ({
  platzbauerId,
  platzbauerName,
  saisonjahr,
  onRefresh,
}: InstandsetzungsTabProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [vereine, setVereine] = useState<InstandsetzungsVereinMitProjekt[]>([]);
  const [auftraege, setAuftraege] = useState<Instandsetzungsauftrag[]>([]);
  const [showFormular, setShowFormular] = useState(false);
  const [selectedAuftrag, setSelectedAuftrag] = useState<Instandsetzungsauftrag | null>(null);

  // Daten laden
  const loadData = async () => {
    setLoading(true);
    try {
      const [vereineDaten, auftraegeDaten] = await Promise.all([
        instandsetzungsauftragService.loadDirektInstandsetzungVereineMitProjekt(platzbauerId, saisonjahr, false),
        instandsetzungsauftragService.loadAuftraegeFuerPlatzbauer(platzbauerId, saisonjahr),
      ]);
      setVereine(vereineDaten);
      setAuftraege(auftraegeDaten);
    } catch (error) {
      console.error('Fehler beim Laden der Instandsetzungsdaten:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [platzbauerId, saisonjahr]);

  // Vereine mit bestätigtem Auftrag (für Sammelauftrag verfügbar)
  const vereineMitBestaetigung = vereine.filter(v => v.hatBestaetigenAuftrag);

  // Zum Projekt navigieren
  const handleProjektOeffnen = (projektId: string) => {
    navigate(`/projektabwicklung/${projektId}`);
  };

  // Statistiken
  const anzahlVereine = vereine.length;
  const anzahlVereineMitAuftrag = vereineMitBestaetigung.length;
  const anzahlAuftraege = auftraege.length;
  const offeneAuftraege = auftraege.filter(a => a.status !== 'erledigt').length;

  // Status-Icons
  const StatusIcon = ({ status }: { status: Instandsetzungsauftrag['status'] }) => {
    switch (status) {
      case 'erstellt':
        return <Clock className="w-4 h-4" />;
      case 'gesendet':
        return <Send className="w-4 h-4" />;
      case 'bestaetigt':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'erledigt':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
        <span className="ml-2 text-gray-500">Lade Instandsetzungsdaten...</span>
      </div>
    );
  }

  // Formular anzeigen - nur Vereine mit bestätigtem Auftrag
  if (showFormular) {
    return (
      <InstandsetzungsauftragFormular
        platzbauerId={platzbauerId}
        platzbauerName={platzbauerName}
        saisonjahr={saisonjahr}
        vereine={vereineMitBestaetigung}
        onSave={() => {
          setShowFormular(false);
          loadData();
          onRefresh();
        }}
        onCancel={() => setShowFormular(false)}
        onProjektOeffnen={handleProjektOeffnen}
      />
    );
  }

  // Auftragsdetail anzeigen
  if (selectedAuftrag) {
    return (
      <InstandsetzungsauftragDetail
        auftrag={selectedAuftrag}
        platzbauerName={platzbauerName}
        onBack={() => {
          setSelectedAuftrag(null);
          loadData();
        }}
        onStatusChange={() => {
          loadData();
          onRefresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Statistiken */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
          <Users className="w-6 h-6 text-orange-600 dark:text-orange-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {anzahlVereine}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Direkt Instandsetzung
          </div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {anzahlVereineMitAuftrag}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Mit Auftrag bestätigt
          </div>
        </div>
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {anzahlAuftraege}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            IA-Aufträge
          </div>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
          <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {offeneAuftraege}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Offen
          </div>
        </div>
      </div>

      {/* Keine Vereine */}
      {anzahlVereine === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl">
          <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            Keine &quot;Direkt Instandsetzung&quot;-Vereine zugeordnet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Vereine mit diesem Bezugsweg werden hier angezeigt
          </p>
        </div>
      ) : (
        <>
          {/* Aktion: Neuen Auftrag erstellen */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-white">
              Instandsetzungsaufträge Saison {saisonjahr}
            </h3>
            <div className="flex items-center gap-3">
              {anzahlVereineMitAuftrag === 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Keine Vereine mit bestätigtem Auftrag
                </span>
              )}
              <button
                onClick={() => setShowFormular(true)}
                disabled={anzahlVereineMitAuftrag === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Sammelauftrag erstellen
              </button>
            </div>
          </div>

          {/* Aufträge-Liste */}
          {auftraege.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-dark-bg rounded-xl">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Noch keine Aufträge für diese Saison
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Erstellen Sie einen Sammelauftrag für die {anzahlVereine} Vereine
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {auftraege.map(auftrag => {
                const statusColors = INSTANDSETZUNGSAUFTRAG_STATUS_COLORS[auftrag.status];
                const statusLabel = INSTANDSETZUNGSAUFTRAG_STATUS_LABELS[auftrag.status];

                return (
                  <div
                    key={auftrag.id}
                    onClick={() => setSelectedAuftrag(auftrag)}
                    className="flex items-center justify-between p-4 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg hover:border-amber-400 dark:hover:border-amber-500 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                        <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          {auftrag.auftragsnummer}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {auftrag.positionen.length} Vereine
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(auftrag.erstelltAm).toLocaleDateString('de-DE')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusColors.bg} ${statusColors.text}`}
                      >
                        <StatusIcon status={auftrag.status} />
                        {statusLabel}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Vereine-Übersicht */}
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Zugeordnete Vereine ({anzahlVereine})
              {anzahlVereineMitAuftrag > 0 && (
                <span className="ml-2 text-green-600 dark:text-green-400 font-normal">
                  - {anzahlVereineMitAuftrag} mit bestätigtem Auftrag
                </span>
              )}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {vereine.slice(0, 8).map(({ kunde, projekt, hatBestaetigenAuftrag }) => (
                <div
                  key={kunde.id}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    hatBestaetigenAuftrag
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-gray-50 dark:bg-dark-bg'
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      hatBestaetigenAuftrag ? 'bg-green-500' : 'bg-orange-400'
                    }`}
                  />
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                    {kunde.name}
                  </span>
                  {kunde.lieferadresse && (
                    <span className="text-gray-400 text-xs truncate">
                      {kunde.lieferadresse.plz}
                    </span>
                  )}
                  {projekt && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProjektOeffnen(projekt.$id || projekt.id);
                      }}
                      className="p-1 text-gray-400 hover:text-amber-500 transition-colors"
                      title="Projekt öffnen"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {vereine.length > 8 && (
                <div className="flex items-center justify-center p-2 text-sm text-gray-400">
                  +{vereine.length - 8} weitere Vereine
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InstandsetzungsTab;
