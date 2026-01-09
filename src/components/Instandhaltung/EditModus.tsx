import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, AlertCircle } from 'lucide-react';
import {
  InstandhaltungFrequenz,
  InstandhaltungChecklistItem,
  FREQUENZ_CONFIG,
} from '../../types/instandhaltung';
import { instandhaltungService } from '../../services/instandhaltungService';
import ChecklistItemFormular from './ChecklistItemFormular';

interface EditModusProps {
  frequenz: InstandhaltungFrequenz;
  items: InstandhaltungChecklistItem[];
  onItemsChange: (items: InstandhaltungChecklistItem[]) => void;
}

export default function EditModus({ frequenz, items, onItemsChange }: EditModusProps) {
  const [showFormular, setShowFormular] = useState(false);
  const [editItem, setEditItem] = useState<InstandhaltungChecklistItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const config = FREQUENZ_CONFIG[frequenz];

  const handleAdd = () => {
    setEditItem(null);
    setShowFormular(true);
  };

  const handleEdit = (item: InstandhaltungChecklistItem) => {
    setEditItem(item);
    setShowFormular(true);
  };

  const handleSave = async (titel: string, beschreibung: string) => {
    setLoading(true);
    try {
      if (editItem) {
        // Update
        const aktualisiert = await instandhaltungService.aktualisiereChecklistItem(
          editItem.id,
          { titel, beschreibung }
        );
        onItemsChange(
          items.map((item) => (item.id === aktualisiert.id ? aktualisiert : item))
        );
      } else {
        // Create
        const maxSortierung = items.length > 0 ? Math.max(...items.map((i) => i.sortierung)) : 0;
        const neuesItem = await instandhaltungService.erstelleChecklistItem({
          titel,
          beschreibung: beschreibung || undefined,
          frequenz,
          sortierung: maxSortierung + 1,
          istAktiv: true,
        });
        onItemsChange([...items, neuesItem]);
      }
      setShowFormular(false);
      setEditItem(null);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await instandhaltungService.loescheChecklistItem(id);
      onItemsChange(items.filter((item) => item.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    const temp = newItems[index].sortierung;
    newItems[index].sortierung = newItems[index - 1].sortierung;
    newItems[index - 1].sortierung = temp;
    [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];

    // Update in DB
    await instandhaltungService.sortierungAktualisieren([
      { id: newItems[index].id, sortierung: newItems[index].sortierung },
      { id: newItems[index - 1].id, sortierung: newItems[index - 1].sortierung },
    ]);

    onItemsChange(newItems);
  };

  const handleMoveDown = async (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    const temp = newItems[index].sortierung;
    newItems[index].sortierung = newItems[index + 1].sortierung;
    newItems[index + 1].sortierung = temp;
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];

    // Update in DB
    await instandhaltungService.sortierungAktualisieren([
      { id: newItems[index].id, sortierung: newItems[index].sortierung },
      { id: newItems[index + 1].id, sortierung: newItems[index + 1].sortierung },
    ]);

    onItemsChange(newItems);
  };

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-orange-800 dark:text-orange-300">
              Bearbeitungsmodus
            </h3>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Hier kannst du die Checklist-Punkte für {config.label.toLowerCase()}e
              Begehungen verwalten.
            </p>
          </div>
        </div>
      </div>

      {/* Item Liste */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-100 dark:border-dark-border"
            >
              <div className="flex items-center p-3 gap-3">
                {/* Drag Handle / Reihenfolge */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className={`p-1 rounded transition-colors ${
                      index === 0
                        ? 'text-gray-300 dark:text-dark-border cursor-not-allowed'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-border'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    className={`p-1 rounded transition-colors ${
                      index === items.length - 1
                        ? 'text-gray-300 dark:text-dark-border cursor-not-allowed'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-border'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>

                <GripVertical className="w-5 h-5 text-gray-300 dark:text-dark-border flex-shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {item.titel}
                  </p>
                  {item.beschreibung && (
                    <p className="text-sm text-gray-500 dark:text-dark-textMuted truncate">
                      {item.beschreibung}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-surface rounded-2xl p-8 shadow-sm text-center">
          <p className="text-gray-500 dark:text-dark-textMuted">
            Noch keine Checklist-Punkte vorhanden.
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-textMuted mt-1">
            Klicke auf "Neuen Punkt hinzufügen" um zu starten.
          </p>
        </div>
      )}

      {/* Add Button */}
      <button
        onClick={handleAdd}
        className={`w-full flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r ${config.color} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl active:scale-98 transition-all`}
      >
        <Plus className="w-5 h-5" />
        <span>Neuen Punkt hinzufügen</span>
      </button>

      {/* Formular Modal */}
      {showFormular && (
        <ChecklistItemFormular
          item={editItem}
          onSave={handleSave}
          onCancel={() => {
            setShowFormular(false);
            setEditItem(null);
          }}
          loading={loading}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Punkt löschen?
              </h3>
              <p className="text-gray-600 dark:text-dark-textMuted mb-6">
                Dieser Punkt wird aus der Checkliste entfernt.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-white font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-dark-border/80 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Löschen...' : 'Löschen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
