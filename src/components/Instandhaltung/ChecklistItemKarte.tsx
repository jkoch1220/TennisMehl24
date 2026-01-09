import { useState } from 'react';
import { Check, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { BegehungChecklistItem } from '../../types/instandhaltung';

interface ChecklistItemKarteProps {
  item: BegehungChecklistItem;
  onToggle: (erledigt: boolean) => void;
  onBemerkungChange: (bemerkung: string) => void;
  disabled?: boolean;
}

export default function ChecklistItemKarte({
  item,
  onToggle,
  onBemerkungChange,
  disabled = false,
}: ChecklistItemKarteProps) {
  const [showBemerkung, setShowBemerkung] = useState(!!item.bemerkung);
  const [bemerkungText, setBemerkungText] = useState(item.bemerkung || '');

  const handleToggle = () => {
    if (disabled) return;
    onToggle(!item.erledigt);
  };

  const handleBemerkungBlur = () => {
    if (bemerkungText !== item.bemerkung) {
      onBemerkungChange(bemerkungText);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`bg-white dark:bg-dark-surface rounded-2xl shadow-sm border-2 transition-all ${
        item.erledigt
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
          : 'border-transparent'
      }`}
    >
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Checkbox - 44px touch target */}
          <button
            onClick={handleToggle}
            disabled={disabled}
            className={`flex-shrink-0 w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all ${
              disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer active:scale-95'
            } ${
              item.erledigt
                ? 'bg-green-500 border-green-500'
                : 'bg-white dark:bg-dark-bg border-gray-300 dark:border-dark-border hover:border-green-400'
            }`}
          >
            {item.erledigt && <Check className="w-6 h-6 text-white" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-1">
            <h3
              className={`font-medium text-base ${
                item.erledigt
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {item.titel}
            </h3>
            {item.beschreibung && (
              <p className="text-sm text-gray-500 dark:text-dark-textMuted mt-1">
                {item.beschreibung}
              </p>
            )}
            {item.erledigt && item.erledigtAm && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {formatTime(item.erledigtAm)} erledigt
              </p>
            )}
          </div>
        </div>

        {/* Bemerkung Toggle */}
        {!disabled && (
          <button
            onClick={() => setShowBemerkung(!showBemerkung)}
            className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {item.bemerkung ? 'Bemerkung bearbeiten' : 'Bemerkung hinzufügen'}
            {showBemerkung ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Bemerkung anzeigen wenn vorhanden und im Disabled-Mode */}
        {disabled && item.bemerkung && (
          <div className="mt-3 p-3 bg-gray-100 dark:bg-dark-border rounded-lg">
            <p className="text-sm text-gray-600 dark:text-dark-textMuted flex items-start gap-2">
              <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {item.bemerkung}
            </p>
          </div>
        )}
      </div>

      {/* Bemerkung Input */}
      {showBemerkung && !disabled && (
        <div className="px-4 pb-4">
          <textarea
            value={bemerkungText}
            onChange={(e) => setBemerkungText(e.target.value)}
            onBlur={handleBemerkungBlur}
            placeholder="Bemerkung eingeben..."
            className="w-full px-3 py-2 text-base bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
