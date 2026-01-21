import { useState, useEffect, useCallback } from 'react';
import {
  FileCheck,
  Send,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
  RefreshCw,
  Users,
  Package,
} from 'lucide-react';
import { PBVKanbanDaten, PlatzbauerProjekt, PBVFilter } from '../../types/platzbauer';
import { ProjektStatus } from '../../types/projekt';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import PlatzbauerlProjektDetail from './PlatzbauerlProjektDetail';

interface PlatzbauerlKanbanProps {
  saisonjahr: number;
  filter?: Partial<PBVFilter>;
  onRefresh: () => void;
}

// Kanban-Spalten Konfiguration
const KANBAN_COLUMNS: Array<{
  id: ProjektStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = [
  { id: 'angebot', label: 'Angebot', icon: FileCheck, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  { id: 'angebot_versendet', label: 'Versendet', icon: Send, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' },
  { id: 'auftragsbestaetigung', label: 'AB', icon: FileSignature, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
  { id: 'lieferschein', label: 'Lieferschein', icon: Truck, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' },
  { id: 'rechnung', label: 'Rechnung', icon: FileText, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  { id: 'bezahlt', label: 'Bezahlt', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
];

const PlatzbauerlKanban = ({
  saisonjahr,
  filter,
  onRefresh,
}: PlatzbauerlKanbanProps) => {
  const [loading, setLoading] = useState(true);
  const [kanbanDaten, setKanbanDaten] = useState<PBVKanbanDaten | null>(null);
  const [draggedProjekt, setDraggedProjekt] = useState<PlatzbauerProjekt | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProjektStatus | null>(null);
  const [selectedProjektId, setSelectedProjektId] = useState<string | null>(null);

  // Daten laden
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const daten = await platzbauerverwaltungService.loadKanbanDaten(saisonjahr, filter as PBVFilter);
      setKanbanDaten(daten);
    } catch (error) {
      console.error('Fehler beim Laden der Kanban-Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr, filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Drag & Drop Handler
  const handleDragStart = (e: React.DragEvent, projekt: PlatzbauerProjekt) => {
    setDraggedProjekt(projekt);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedProjekt(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: ProjektStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, neuerStatus: ProjektStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedProjekt || draggedProjekt.status === neuerStatus) {
      setDraggedProjekt(null);
      return;
    }

    try {
      await platzbauerverwaltungService.updateProjektStatus(draggedProjekt.id, neuerStatus);
      await loadData();
      onRefresh();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
    }

    setDraggedProjekt(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!kanbanDaten) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        Keine Daten verfügbar
      </div>
    );
  }

  return (
    <>
      {/* Statistik */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
        <span>{kanbanDaten.statistik.gesamt} Projekte gesamt</span>
        <span>·</span>
        <span>{kanbanDaten.statistik.nachTyp.saisonprojekt} Saisonprojekte</span>
        <span>·</span>
        <span>{kanbanDaten.statistik.nachTyp.nachtrag} Nachträge</span>
      </div>

      {/* Kanban-Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(column => {
          const spalte = kanbanDaten.spalten.find(s => s.id === column.id);
          const projekte = spalte?.projekte || [];
          const isDragOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-72"
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Spalten-Header */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-2 border-b-0 ${column.bgColor}`}>
                <column.icon className={`w-4 h-4 ${column.color}`} />
                <span className={`font-medium ${column.color}`}>{column.label}</span>
                <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                  {projekte.length}
                </span>
              </div>

              {/* Spalten-Content */}
              <div
                className={`min-h-[400px] p-2 rounded-b-lg border-2 border-t-0 transition-colors ${
                  isDragOver
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                    : 'bg-gray-50 dark:bg-dark-bg border-gray-200 dark:border-dark-border'
                }`}
              >
                {projekte.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Keine Projekte
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projekte.map(projekt => (
                      <ProjektCard
                        key={projekt.id}
                        projekt={projekt}
                        onDragStart={(e) => handleDragStart(e, projekt)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedProjektId(projekt.id)}
                        isDragging={draggedProjekt?.id === projekt.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Projekt-Detail-Popup */}
      {selectedProjektId && (
        <PlatzbauerlProjektDetail
          projektId={selectedProjektId}
          onClose={() => setSelectedProjektId(null)}
          onRefresh={() => {
            loadData();
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// Projekt-Card Komponente
interface ProjektCardProps {
  projekt: PlatzbauerProjekt;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  isDragging: boolean;
}

const ProjektCard = ({
  projekt,
  onDragStart,
  onDragEnd,
  onClick,
  isDragging,
}: ProjektCardProps) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`p-3 bg-white dark:bg-dark-surface rounded-lg border border-gray-200 dark:border-dark-border shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500 cursor-pointer transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white truncate">
            {projekt.platzbauerName}
          </div>
          {projekt.typ === 'nachtrag' && (
            <span className="inline-block px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded mt-1">
              Nachtrag {projekt.nachtragNummer}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {projekt.anzahlVereine || 0}
        </span>
        <span className="flex items-center gap-1">
          <Package className="w-3 h-3" />
          {projekt.gesamtMenge?.toFixed(0) || 0} t
        </span>
      </div>
    </div>
  );
};

export default PlatzbauerlKanban;
