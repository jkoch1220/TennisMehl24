import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, User, MessageSquare } from 'lucide-react';
import { Begehung } from '../../types/instandhaltung';
import ChecklistItemKarte from './ChecklistItemKarte';

interface BegehungDurchfuehrungProps {
  begehung: Begehung;
  onItemToggle: (checklistItemId: string, erledigt: boolean) => void;
  onBemerkungChange: (checklistItemId: string, bemerkung: string) => void;
  onAbschliessen: (notizen?: string) => void;
  onAbbrechen: () => void;
}

export default function BegehungDurchfuehrung({
  begehung,
  onItemToggle,
  onBemerkungChange,
  onAbschliessen,
  onAbbrechen,
}: BegehungDurchfuehrungProps) {
  const [showAbschlussModal, setShowAbschlussModal] = useState(false);
  const [notizen, setNotizen] = useState(begehung.notizen || '');
  const [showAbbrechenConfirm, setShowAbbrechenConfirm] = useState(false);

  const erledigteItems = begehung.checklistItems.filter((item) => item.erledigt).length;
  const gesamtItems = begehung.checklistItems.length;
  const fortschritt = gesamtItems > 0 ? (erledigteItems / gesamtItems) * 100 : 0;
  const alleErledigt = erledigteItems === gesamtItems;

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const handleAbschliessen = () => {
    onAbschliessen(notizen || undefined);
    setShowAbschlussModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Begehung läuft</h2>
              <p className="text-white/80 text-sm flex items-center gap-2">
                <span>Gestartet: {formatTime(begehung.startDatum)}</span>
                {begehung.bearbeiterName && (
                  <>
                    <span className="text-white/50">|</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {begehung.bearbeiterName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-white/80 mb-2">
            <span>Fortschritt</span>
            <span className="font-medium text-white">
              {erledigteItems}/{gesamtItems} erledigt
            </span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-300"
              style={{ width: `${fortschritt}%` }}
            />
          </div>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {begehung.checklistItems.map((item) => (
          <ChecklistItemKarte
            key={item.checklistItemId}
            item={item}
            onToggle={(erledigt) => onItemToggle(item.checklistItemId, erledigt)}
            onBemerkungChange={(bemerkung) =>
              onBemerkungChange(item.checklistItemId, bemerkung)
            }
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-20 sm:bottom-8 left-4 right-4 z-30">
        <div className="flex gap-3">
          <button
            onClick={() => setShowAbbrechenConfirm(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-700 dark:text-white font-medium rounded-xl shadow-lg hover:bg-gray-50 dark:hover:bg-dark-border active:scale-98 transition-all"
          >
            <XCircle className="w-5 h-5" />
            <span className="hidden sm:inline">Abbrechen</span>
          </button>
          <button
            onClick={() => setShowAbschlussModal(true)}
            disabled={!alleErledigt}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 font-semibold rounded-xl shadow-lg transition-all ${
              alleErledigt
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-xl active:scale-98'
                : 'bg-gray-200 dark:bg-dark-border text-gray-400 dark:text-dark-textMuted cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Abschließen</span>
          </button>
        </div>
      </div>

      {/* Spacer für Fixed Buttons */}
      <div className="h-24" />

      {/* Abschluss Modal */}
      {showAbschlussModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Begehung abschließen?
              </h3>
              <p className="text-gray-600 dark:text-dark-textMuted mb-4">
                Alle {gesamtItems} Punkte wurden erledigt.
              </p>

              {/* Notizen */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  <MessageSquare className="w-4 h-4 inline mr-2" />
                  Abschluss-Notizen (optional)
                </label>
                <textarea
                  value={notizen}
                  onChange={(e) => setNotizen(e.target.value)}
                  placeholder="z.B. Auffälligkeiten, besondere Vorkommnisse..."
                  className="w-full px-3 py-2 text-base bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-green-500 dark:text-white"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAbschlussModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-white font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-dark-border/80 transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={handleAbschliessen}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                >
                  Abschließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Abbrechen Confirmation */}
      {showAbbrechenConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Begehung abbrechen?
              </h3>
              <p className="text-gray-600 dark:text-dark-textMuted mb-6">
                Der bisherige Fortschritt ({erledigteItems}/{gesamtItems} erledigt) geht
                verloren.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAbbrechenConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-white font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-dark-border/80 transition-colors"
                >
                  Weiter machen
                </button>
                <button
                  onClick={() => {
                    onAbbrechen();
                    setShowAbbrechenConfirm(false);
                  }}
                  className="flex-1 px-4 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
