import { AlertTriangle, X, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

export type ProjektStatus = 'angebot' | 'angebot_versendet' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'bezahlt' | 'verloren';

interface StatusAenderungModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onConfirmOhneStatusAenderung?: () => void; // Optional: Aktion ohne Status-Änderung
  aktion: string; // z.B. "Auftragsbestätigung speichern"
  vonStatus: ProjektStatus;
  nachStatus: ProjektStatus;
  kundenname?: string;
  dokumentNummer?: string;
  isLoading?: boolean;
}

const STATUS_LABELS: Record<ProjektStatus, string> = {
  angebot: 'Angebot',
  angebot_versendet: 'Angebot versendet',
  auftragsbestaetigung: 'Auftragsbestätigung',
  lieferschein: 'Lieferschein',
  rechnung: 'Rechnung',
  bezahlt: 'Bezahlt',
  verloren: 'Verloren'
};

const STATUS_COLORS: Record<ProjektStatus, string> = {
  angebot: 'bg-gray-100 text-gray-800 border-gray-300',
  angebot_versendet: 'bg-blue-100 text-blue-800 border-blue-300',
  auftragsbestaetigung: 'bg-orange-100 text-orange-800 border-orange-300',
  lieferschein: 'bg-purple-100 text-purple-800 border-purple-300',
  rechnung: 'bg-green-100 text-green-800 border-green-300',
  bezahlt: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  verloren: 'bg-red-100 text-red-800 border-red-300'
};

export const StatusAenderungModal = ({
  isOpen,
  onClose,
  onConfirm,
  onConfirmOhneStatusAenderung,
  aktion,
  vonStatus,
  nachStatus,
  kundenname,
  dokumentNummer,
  isLoading = false
}: StatusAenderungModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full transform transition-all">
          {/* Header mit Warnung */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-2xl px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Status-Änderung bestätigen</h2>
              </div>
              <button
                onClick={onClose}
                disabled={isLoading}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Kundeninfo */}
            {kundenname && (
              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">Kunde</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">{kundenname}</div>
                {dokumentNummer && (
                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{dokumentNummer}</div>
                )}
              </div>
            )}

            {/* Status-Visualisierung */}
            <div className="flex items-center justify-center gap-4">
              <div className={`px-4 py-2 rounded-lg border-2 font-medium ${STATUS_COLORS[vonStatus]}`}>
                {STATUS_LABELS[vonStatus]}
              </div>
              <ArrowRight className="h-6 w-6 text-gray-400" />
              <div className={`px-4 py-2 rounded-lg border-2 font-medium ${STATUS_COLORS[nachStatus]}`}>
                {STATUS_LABELS[nachStatus]}
              </div>
            </div>

            {/* Warnung */}
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Diese Aktion verschiebt das Projekt in einen neuen Status!
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Bitte stellen Sie sicher, dass Sie "{aktion}" wirklich durchführen möchten.
                    Der Kunde wird dann in der <strong>{STATUS_LABELS[nachStatus]}</strong>-Phase angezeigt.
                  </p>
                </div>
              </div>
            </div>

            {/* Aktions-Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Ja, {aktion} und Status ändern
              </button>

              {onConfirmOhneStatusAenderung && (
                <button
                  onClick={onConfirmOhneStatusAenderung}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  Nur speichern, Status beibehalten
                </button>
              )}

              <button
                onClick={onClose}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors"
              >
                <XCircle className="h-5 w-5" />
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusAenderungModal;
