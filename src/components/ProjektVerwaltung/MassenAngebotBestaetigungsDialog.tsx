// Wiederverwendbarer Bestätigungsdialog des Massen-Angebots-Tools
// (Erzeugung, Rollback, Versand, Tauglichkeits-Markierung) mit konkreten Zahlen.

import { X } from 'lucide-react';

const BestaetigungsDialog = ({
  icon,
  titel,
  children,
  onAbbrechen,
  onBestaetigen,
  bestaetigenLabel,
  bestaetigenClass,
}: {
  icon: React.ReactNode;
  titel: string;
  children: React.ReactNode;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
  bestaetigenLabel: string;
  bestaetigenClass: string;
}) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-gray-100 dark:bg-slate-700 rounded-lg">{icon}</div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text">{titel}</h3>
      </div>
      <div className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{children}</div>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onAbbrechen}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <X className="w-4 h-4 inline mr-1" /> Abbrechen
        </button>
        <button onClick={onBestaetigen} className={`px-4 py-2 text-white rounded-lg ${bestaetigenClass}`}>
          {bestaetigenLabel}
        </button>
      </div>
    </div>
  </div>
);

export default BestaetigungsDialog;
