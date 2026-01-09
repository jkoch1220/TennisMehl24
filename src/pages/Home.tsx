import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, BarChart3, TrendingUp, AlertTriangle, Wrench, X, ChevronRight, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import { ALL_TOOLS } from '../constants/tools';
import { instandhaltungService } from '../services/instandhaltungService';
import { OverdueInfo, FREQUENZ_CONFIG, InstandhaltungFrequenz, InstandhaltungChecklistItem } from '../types/instandhaltung';

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [overdueInfos, setOverdueInfos] = useState<OverdueInfo[]>([]);
  const [showOverduePopup, setShowOverduePopup] = useState(false);
  const [checklistItems, setChecklistItems] = useState<Record<InstandhaltungFrequenz, InstandhaltungChecklistItem[]>>({
    taeglich: [],
    woechentlich: [],
    monatlich: [],
  });
  const [expandedFrequenz, setExpandedFrequenz] = useState<InstandhaltungFrequenz | null>(null);

  // Prüfe Überfälligkeiten beim Laden der Seite
  useEffect(() => {
    const checkOverdue = async () => {
      // Nur prüfen wenn User Zugriff auf Instandhaltung hat
      const hasAccess = filterAllowedTools(user, ALL_TOOLS).some(t => t.id === 'instandhaltung');
      if (!hasAccess) return;

      // Prüfen ob Popup heute schon dismissed wurde (Session-basiert)
      const dismissedToday = sessionStorage.getItem('instandhaltung_popup_dismissed');
      if (dismissedToday === new Date().toDateString()) {
        return;
      }

      try {
        const infos = await instandhaltungService.pruefeUeberfaellig();
        const ueberfaellige = infos.filter(info => info.istUeberfaellig);
        setOverdueInfos(ueberfaellige);

        if (ueberfaellige.length > 0) {
          // Lade Checklist-Items für alle überfälligen Frequenzen
          const itemsMap: Record<InstandhaltungFrequenz, InstandhaltungChecklistItem[]> = {
            taeglich: [],
            woechentlich: [],
            monatlich: [],
          };

          for (const info of ueberfaellige) {
            const items = await instandhaltungService.ladeChecklistItemsNachFrequenz(info.frequenz);
            itemsMap[info.frequenz] = items;
          }

          setChecklistItems(itemsMap);
          setShowOverduePopup(true);
          // Erste überfällige Frequenz automatisch expandieren
          if (ueberfaellige.length > 0) {
            setExpandedFrequenz(ueberfaellige[0].frequenz);
          }
        }
      } catch (error) {
        console.error('Fehler beim Prüfen der Instandhaltung:', error);
      }
    };

    checkOverdue();
  }, [user]);

  const handleDismissPopup = () => {
    setShowOverduePopup(false);
    sessionStorage.setItem('instandhaltung_popup_dismissed', new Date().toDateString());
  };

  const handleGoToInstandhaltung = () => {
    setShowOverduePopup(false);
    navigate('/instandhaltung');
  };

  const formatLetzteBegehung = (info: OverdueInfo): string => {
    if (!info.letzteBegehung || !info.letzteBegehung.abschlussDatum) {
      return 'Noch nie durchgeführt';
    }
    const datum = new Date(info.letzteBegehung.abschlussDatum);
    const jetzt = new Date();
    const diffMs = jetzt.getTime() - datum.getTime();
    const diffTage = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffTage === 0) return 'Heute';
    if (diffTage === 1) return 'Gestern';
    return `Vor ${diffTage} Tagen`;
  };
  
  // Tools basierend auf User-Berechtigungen filtern
  const enabledTools = filterAllowedTools(user, ALL_TOOLS);
  
  // Zusätzlich lokale Visibility-Settings beachten
  const localVisibility = (() => {
    try {
      const stored = localStorage.getItem('tm_local_tool_visibility_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })();
  
  // Nur Tools anzeigen die sowohl erlaubt als auch lokal nicht ausgeblendet sind
  const visibleTools = enabledTools.filter(tool => localVisibility[tool.id] !== false);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 mt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            TennisMehl24 Kalkulationstools
          </h1>
          <p className="text-xl text-gray-600 dark:text-dark-textMuted max-w-2xl mx-auto transition-colors duration-300">
            Professionelle Tools für Preisberechnungen, Kalkulationen und
            Analysen
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 hover:shadow-xl dark:hover:shadow-dark-xl transition-all duration-300 cursor-pointer hover:scale-105 border border-transparent dark:border-dark-border">
                <div
                  className={`w-16 h-16 rounded-lg bg-gradient-to-r ${tool.color} flex items-center justify-center mb-4 shadow-md`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-2 transition-colors duration-300">
                  {tool.name}
                </h3>
                <p className="text-gray-600 dark:text-dark-textMuted mb-4 transition-colors duration-300">{tool.description}</p>
              </div>
            );

            return (
              <Link key={tool.name} to={tool.href}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Info Section */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-8 border border-transparent dark:border-dark-border transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            Über diese Tools
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Präzise Kalkulationen
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Alle Berechnungen basieren auf aktuellen Herstellungskosten
                  und Preismodellen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Aktuelle Daten
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Preise und Kalkulationen werden regelmäßig aktualisiert.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Erweiterbar
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Weitere Tools können einfach hinzugefügt werden.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instandhaltung Überfällig Popup */}
      {showOverduePopup && overdueInfos.length > 0 && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-dark-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header mit Warnung */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white">
                    Instandhaltung überfällig!
                  </h2>
                  <p className="text-white/90 mt-1">
                    {overdueInfos.length === 1
                      ? 'Eine Begehung muss durchgeführt werden'
                      : `${overdueInfos.length} Begehungen müssen durchgeführt werden`}
                  </p>
                </div>
                <button
                  onClick={handleDismissPopup}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Liste der überfälligen Begehungen mit Checklist-Punkten */}
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {overdueInfos.map((info) => {
                const config = FREQUENZ_CONFIG[info.frequenz];
                const items = checklistItems[info.frequenz] || [];
                const isExpanded = expandedFrequenz === info.frequenz;

                return (
                  <div
                    key={info.frequenz}
                    className="bg-gray-50 dark:bg-dark-border rounded-xl overflow-hidden"
                  >
                    {/* Header - klickbar zum Expandieren */}
                    <button
                      onClick={() => setExpandedFrequenz(isExpanded ? null : info.frequenz)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${config.color} flex items-center justify-center flex-shrink-0`}>
                          <Wrench className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {config.label}e Begehung
                          </p>
                          <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                            {formatLetzteBegehung(info)}
                            {info.tageUeberfaellig > 0 && (
                              <span className="text-red-500 ml-1">
                                ({info.tageUeberfaellig} {info.tageUeberfaellig === 1 ? 'Tag' : 'Tage'} überfällig)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {items.length > 0 && (
                          <span className="text-xs font-medium text-gray-500 dark:text-dark-textMuted bg-gray-200 dark:bg-dark-surface px-2 py-1 rounded-full">
                            {items.length} Punkte
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Expandierte Checklist-Punkte */}
                    {isExpanded && items.length > 0 && (
                      <div className="px-4 pb-4 space-y-2">
                        <div className="border-t border-gray-200 dark:border-dark-surface pt-3">
                          <p className="text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-2 uppercase tracking-wide">
                            Zu erledigende Punkte:
                          </p>
                          <div className="space-y-1.5">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-start gap-2 text-sm"
                              >
                                <Circle className="w-4 h-4 text-gray-300 dark:text-dark-border flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-gray-700 dark:text-gray-300">
                                    {item.titel}
                                  </span>
                                  {item.beschreibung && (
                                    <p className="text-xs text-gray-400 dark:text-dark-textMuted mt-0.5">
                                      {item.beschreibung}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Keine Items vorhanden */}
                    {isExpanded && items.length === 0 && (
                      <div className="px-4 pb-4">
                        <p className="text-sm text-gray-400 dark:text-dark-textMuted italic">
                          Keine Checklist-Punkte definiert
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-100 dark:border-dark-border space-y-2">
              <button
                onClick={handleGoToInstandhaltung}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:shadow-lg active:scale-98 transition-all"
              >
                <Wrench className="w-5 h-5" />
                <span>Jetzt zur Instandhaltung</span>
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={handleDismissPopup}
                className="w-full px-4 py-3 text-gray-600 dark:text-dark-textMuted font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
              >
                Später erinnern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

