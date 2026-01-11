import { useState } from 'react';
import { X, Sunrise, Sun, Moon, Clock, Users } from 'lucide-react';
import { SchichtEinstellungen, SchichtTyp } from '../../types/schichtplanung';

interface SchichtEinstellungenDialogProps {
  einstellungen: SchichtEinstellungen;
  onSave: (einstellungen: SchichtEinstellungen) => void;
  onClose: () => void;
}

export default function SchichtEinstellungenDialog({
  einstellungen,
  onSave,
  onClose,
}: SchichtEinstellungenDialogProps) {
  const [formData, setFormData] = useState<SchichtEinstellungen>(einstellungen);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const schichtTypen: { typ: SchichtTyp; name: string; icon: typeof Sunrise; gradient: string }[] = [
    { typ: 'fruehschicht', name: 'Frühschicht', icon: Sunrise, gradient: 'from-amber-400 to-orange-500' },
    { typ: 'spaetschicht', name: 'Spätschicht', icon: Sun, gradient: 'from-blue-400 to-indigo-500' },
    { typ: 'nachtschicht', name: 'Nachtschicht', icon: Moon, gradient: 'from-purple-500 to-indigo-700' },
  ];

  const updateSchicht = (typ: SchichtTyp, field: 'startZeit' | 'endZeit' | 'minBesetzung', value: string | number) => {
    setFormData({
      ...formData,
      [typ]: {
        ...formData[typ],
        [field]: value,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Schicht-Einstellungen
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {schichtTypen.map(({ typ, name, icon: Icon, gradient }) => (
            <div
              key={typ}
              className="bg-gray-50 dark:bg-dark-bg rounded-xl p-4 border border-gray-200 dark:border-dark-border"
            >
              {/* Schicht Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg bg-gradient-to-r ${gradient} text-white`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">{name}</span>
              </div>

              {/* Zeiten */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1.5">
                    <Clock className="w-3 h-3" />
                    Start
                  </label>
                  <input
                    type="time"
                    value={formData[typ].startZeit}
                    onChange={(e) => updateSchicht(typ, 'startZeit', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1.5">
                    <Clock className="w-3 h-3" />
                    Ende
                  </label>
                  <input
                    type="time"
                    value={formData[typ].endZeit}
                    onChange={(e) => updateSchicht(typ, 'endZeit', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1.5">
                    <Users className="w-3 h-3" />
                    Min. Besetzung
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData[typ].minBesetzung}
                    onChange={(e) => updateSchicht(typ, 'minBesetzung', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-dark-textMuted bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3">
            <p className="font-medium text-violet-700 dark:text-violet-400 mb-1">Hinweis:</p>
            <p>
              Die Einstellungen werden für diese Sitzung gespeichert. Bei Unterbesetzung wird eine Warnung
              im Kalender angezeigt.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
