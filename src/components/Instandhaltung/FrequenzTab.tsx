import { Clock, Play, User } from 'lucide-react';
import {
  InstandhaltungFrequenz,
  InstandhaltungChecklistItem,
  Begehung,
  FREQUENZ_CONFIG,
} from '../../types/instandhaltung';
import BegehungDurchfuehrung from './BegehungDurchfuehrung';

interface FrequenzTabProps {
  frequenz: InstandhaltungFrequenz;
  checklistItems: InstandhaltungChecklistItem[];
  letzteBegehung: Begehung | null;
  aktiveBegehung: Begehung | null;
  onStartBegehung: () => void;
  onItemToggle: (checklistItemId: string, erledigt: boolean) => void;
  onBemerkungChange: (checklistItemId: string, bemerkung: string) => void;
  onBegehungAbschliessen: (notizen?: string) => void;
  onBegehungAbbrechen: () => void;
}

export default function FrequenzTab({
  frequenz,
  checklistItems,
  letzteBegehung,
  aktiveBegehung,
  onStartBegehung,
  onItemToggle,
  onBemerkungChange,
  onBegehungAbschliessen,
  onBegehungAbbrechen,
}: FrequenzTabProps) {
  const config = FREQUENZ_CONFIG[frequenz];

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Wenn aktive Begehung vorhanden, zeige die Durchführung
  if (aktiveBegehung) {
    return (
      <BegehungDurchfuehrung
        begehung={aktiveBegehung}
        onItemToggle={onItemToggle}
        onBemerkungChange={onBemerkungChange}
        onAbschliessen={onBegehungAbschliessen}
        onAbbrechen={onBegehungAbbrechen}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Letzte Begehung Info */}
      {letzteBegehung && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 text-gray-600 dark:text-dark-textMuted">
            <Clock className="w-5 h-5" />
            <div>
              <p className="text-sm font-medium">Letzte Begehung</p>
              <p className="text-xs">
                {formatDate(letzteBegehung.abschlussDatum || letzteBegehung.startDatum)}
                {letzteBegehung.bearbeiterName && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {letzteBegehung.bearbeiterName}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Checklist-Vorschau (nur Anzeige, nicht interaktiv) */}
      {checklistItems.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-dark-textMuted px-1">
            {checklistItems.length} Punkte für {config.label.toLowerCase()}e Begehung
          </h3>
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-dark-border flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.titel}
                    </p>
                    {item.beschreibung && (
                      <p className="text-sm text-gray-500 dark:text-dark-textMuted mt-1">
                        {item.beschreibung}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-surface rounded-2xl p-8 shadow-sm text-center">
          <p className="text-gray-500 dark:text-dark-textMuted">
            Keine Checklist-Punkte definiert.
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-textMuted mt-1">
            Aktiviere den Bearbeitungsmodus um Punkte hinzuzufügen.
          </p>
        </div>
      )}

      {/* Start Button */}
      {checklistItems.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-8 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto z-30">
          <button
            onClick={onStartBegehung}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r ${config.color} text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl active:scale-98 transition-all`}
          >
            <Play className="w-5 h-5" />
            <span>Begehung starten</span>
          </button>
        </div>
      )}

      {/* Spacer für den Fixed Button */}
      {checklistItems.length > 0 && <div className="h-24" />}
    </div>
  );
}
