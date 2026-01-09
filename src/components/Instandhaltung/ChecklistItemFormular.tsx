import { useState } from 'react';
import { X } from 'lucide-react';
import { InstandhaltungChecklistItem } from '../../types/instandhaltung';

interface ChecklistItemFormularProps {
  item: InstandhaltungChecklistItem | null;
  onSave: (titel: string, beschreibung: string) => void;
  onCancel: () => void;
  loading: boolean;
}

export default function ChecklistItemFormular({
  item,
  onSave,
  onCancel,
  loading,
}: ChecklistItemFormularProps) {
  const [titel, setTitel] = useState(item?.titel || '');
  const [beschreibung, setBeschreibung] = useState(item?.beschreibung || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titel.trim()) return;
    onSave(titel.trim(), beschreibung.trim());
  };

  const isValid = titel.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {item ? 'Punkt bearbeiten' : 'Neuer Punkt'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Titel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Titel *
            </label>
            <input
              type="text"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z.B. Wasserspender reinigen"
              className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white"
              autoFocus
            />
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Beschreibung (optional)
            </label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Weitere Details oder Anweisungen..."
              className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white"
              rows={3}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-white font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-dark-border/80 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className={`flex-1 px-4 py-3 font-semibold rounded-xl transition-all ${
                isValid && !loading
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg'
                  : 'bg-gray-200 dark:bg-dark-border text-gray-400 dark:text-dark-textMuted cursor-not-allowed'
              }`}
            >
              {loading ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
