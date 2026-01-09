import { useState, useEffect, useCallback } from 'react';
import { Wrench, Settings, Sun, CalendarDays, Calendar, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { instandhaltungService } from '../../services/instandhaltungService';
import {
  InstandhaltungFrequenz,
  InstandhaltungChecklistItem,
  Begehung,
  OverdueInfo,
  FREQUENZ_CONFIG,
} from '../../types/instandhaltung';
import OverdueBanner from './OverdueBanner';
import FrequenzTab from './FrequenzTab';
import EditModus from './EditModus';

const FREQUENZ_ICONS = {
  taeglich: Sun,
  woechentlich: CalendarDays,
  monatlich: Calendar,
};

export default function Instandhaltung() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<InstandhaltungFrequenz>('taeglich');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Daten-States
  const [checklistItems, setChecklistItems] = useState<
    Record<InstandhaltungFrequenz, InstandhaltungChecklistItem[]>
  >({
    taeglich: [],
    woechentlich: [],
    monatlich: [],
  });
  const [letzteBegehungen, setLetzteBegehungen] = useState<
    Record<InstandhaltungFrequenz, Begehung | null>
  >({
    taeglich: null,
    woechentlich: null,
    monatlich: null,
  });
  const [aktiveBegehungen, setAktiveBegehungen] = useState<
    Record<InstandhaltungFrequenz, Begehung | null>
  >({
    taeglich: null,
    woechentlich: null,
    monatlich: null,
  });
  const [overdueInfos, setOverdueInfos] = useState<OverdueInfo[]>([]);

  // Daten laden
  const loadData = useCallback(async () => {
    try {
      const frequenzen: InstandhaltungFrequenz[] = [
        'taeglich',
        'woechentlich',
        'monatlich',
      ];

      // Checklist-Items laden
      const itemsPromises = frequenzen.map((f) =>
        instandhaltungService.ladeChecklistItemsNachFrequenz(f)
      );
      const itemsResults = await Promise.all(itemsPromises);
      setChecklistItems({
        taeglich: itemsResults[0],
        woechentlich: itemsResults[1],
        monatlich: itemsResults[2],
      });

      // Letzte abgeschlossene Begehungen laden
      const letztePromises = frequenzen.map((f) =>
        instandhaltungService.ladeLetzteAbgeschlosseneBegehung(f)
      );
      const letzteResults = await Promise.all(letztePromises);
      setLetzteBegehungen({
        taeglich: letzteResults[0],
        woechentlich: letzteResults[1],
        monatlich: letzteResults[2],
      });

      // Aktive Begehungen laden
      const aktivePromises = frequenzen.map((f) =>
        instandhaltungService.ladeAktiveBegehung(f)
      );
      const aktiveResults = await Promise.all(aktivePromises);
      setAktiveBegehungen({
        taeglich: aktiveResults[0],
        woechentlich: aktiveResults[1],
        monatlich: aktiveResults[2],
      });

      // Overdue-Status berechnen
      const overdue = await instandhaltungService.pruefeUeberfaellig();
      setOverdueInfos(overdue);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Begehung starten
  const handleStartBegehung = async (frequenz: InstandhaltungFrequenz) => {
    if (!user) return;
    try {
      const neueBegehung = await instandhaltungService.starteBegehung(
        frequenz,
        user.name || user.email || 'Unbekannt'
      );
      setAktiveBegehungen((prev) => ({
        ...prev,
        [frequenz]: neueBegehung,
      }));
    } catch (error) {
      console.error('Fehler beim Starten der Begehung:', error);
    }
  };

  // Item abhaken
  const handleItemToggle = async (
    begehungId: string,
    checklistItemId: string,
    erledigt: boolean,
    frequenz: InstandhaltungFrequenz
  ) => {
    try {
      const aktualisiert = await instandhaltungService.checklistItemAbhaken(
        begehungId,
        checklistItemId,
        erledigt
      );
      setAktiveBegehungen((prev) => ({
        ...prev,
        [frequenz]: aktualisiert,
      }));
    } catch (error) {
      console.error('Fehler beim Abhaken:', error);
    }
  };

  // Bemerkung aktualisieren
  const handleBemerkungChange = async (
    begehungId: string,
    checklistItemId: string,
    bemerkung: string,
    frequenz: InstandhaltungFrequenz
  ) => {
    try {
      const begehung = aktiveBegehungen[frequenz];
      if (!begehung) return;

      const item = begehung.checklistItems.find(
        (i) => i.checklistItemId === checklistItemId
      );
      if (!item) return;

      const aktualisiert = await instandhaltungService.checklistItemAbhaken(
        begehungId,
        checklistItemId,
        item.erledigt,
        bemerkung
      );
      setAktiveBegehungen((prev) => ({
        ...prev,
        [frequenz]: aktualisiert,
      }));
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Bemerkung:', error);
    }
  };

  // Begehung abschließen
  const handleBegehungAbschliessen = async (
    begehungId: string,
    frequenz: InstandhaltungFrequenz,
    notizen?: string
  ) => {
    try {
      const abgeschlossen = await instandhaltungService.begehungAbschliessen(
        begehungId,
        notizen
      );
      setAktiveBegehungen((prev) => ({
        ...prev,
        [frequenz]: null,
      }));
      setLetzteBegehungen((prev) => ({
        ...prev,
        [frequenz]: abgeschlossen,
      }));
      // Overdue-Status aktualisieren
      const overdue = await instandhaltungService.pruefeUeberfaellig();
      setOverdueInfos(overdue);
    } catch (error) {
      console.error('Fehler beim Abschließen:', error);
    }
  };

  // Begehung abbrechen
  const handleBegehungAbbrechen = async (
    begehungId: string,
    frequenz: InstandhaltungFrequenz
  ) => {
    try {
      await instandhaltungService.begehungAbbrechen(begehungId);
      setAktiveBegehungen((prev) => ({
        ...prev,
        [frequenz]: null,
      }));
    } catch (error) {
      console.error('Fehler beim Abbrechen:', error);
    }
  };

  // Edit-Mode Callbacks
  const handleChecklistItemsChange = (
    frequenz: InstandhaltungFrequenz,
    items: InstandhaltungChecklistItem[]
  ) => {
    setChecklistItems((prev) => ({
      ...prev,
      [frequenz]: items,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">
            Lade Instandhaltungsdaten...
          </p>
        </div>
      </div>
    );
  }

  const ueberfaelligeFrequenzen = overdueInfos.filter((info) => info.istUeberfaellig);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Instandhaltung
                </h1>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted hidden sm:block">
                  Begehungen der Produktionsanlage
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-dark-textMuted dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
              >
                <RefreshCw
                  className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`p-2 rounded-lg transition-colors ${
                  editMode
                    ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-dark-textMuted dark:hover:text-white dark:hover:bg-dark-border'
                }`}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Overdue Banner */}
        {ueberfaelligeFrequenzen.length > 0 && !editMode && (
          <OverdueBanner
            overdueInfos={ueberfaelligeFrequenzen}
            onTabSelect={setActiveTab}
          />
        )}

        {/* Tabs */}
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {(['taeglich', 'woechentlich', 'monatlich'] as InstandhaltungFrequenz[]).map(
              (frequenz) => {
                const config = FREQUENZ_CONFIG[frequenz];
                const Icon = FREQUENZ_ICONS[frequenz];
                const isActive = activeTab === frequenz;
                const isOverdue = overdueInfos.find(
                  (o) => o.frequenz === frequenz && o.istUeberfaellig
                );
                const hasActiveBegehung = !!aktiveBegehungen[frequenz];

                return (
                  <button
                    key={frequenz}
                    onClick={() => setActiveTab(frequenz)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
                      isActive
                        ? `bg-gradient-to-r ${config.color} text-white shadow-lg`
                        : 'bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-dark-border'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{config.label}</span>
                    <span className="sm:hidden">{config.labelKurz}</span>
                    {isOverdue && !isActive && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                    {hasActiveBegehung && (
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {editMode ? (
          <EditModus
            frequenz={activeTab}
            items={checklistItems[activeTab]}
            onItemsChange={(items) => handleChecklistItemsChange(activeTab, items)}
          />
        ) : (
          <FrequenzTab
            frequenz={activeTab}
            checklistItems={checklistItems[activeTab]}
            letzteBegehung={letzteBegehungen[activeTab]}
            aktiveBegehung={aktiveBegehungen[activeTab]}
            onStartBegehung={() => handleStartBegehung(activeTab)}
            onItemToggle={(checklistItemId, erledigt) =>
              aktiveBegehungen[activeTab] &&
              handleItemToggle(
                aktiveBegehungen[activeTab]!.id,
                checklistItemId,
                erledigt,
                activeTab
              )
            }
            onBemerkungChange={(checklistItemId, bemerkung) =>
              aktiveBegehungen[activeTab] &&
              handleBemerkungChange(
                aktiveBegehungen[activeTab]!.id,
                checklistItemId,
                bemerkung,
                activeTab
              )
            }
            onBegehungAbschliessen={(notizen) =>
              aktiveBegehungen[activeTab] &&
              handleBegehungAbschliessen(
                aktiveBegehungen[activeTab]!.id,
                activeTab,
                notizen
              )
            }
            onBegehungAbbrechen={() =>
              aktiveBegehungen[activeTab] &&
              handleBegehungAbbrechen(aktiveBegehungen[activeTab]!.id, activeTab)
            }
          />
        )}
      </div>
    </div>
  );
}
