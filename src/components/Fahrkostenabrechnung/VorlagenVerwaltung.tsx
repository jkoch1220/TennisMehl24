import { useState } from 'react';
import { X, Route, Zap, Trash2, Edit3, Plus, Check } from 'lucide-react';
import { fahrkostenService } from '../../services/fahrkostenService';
import { DefaultStrecke, Auto } from '../../types/fahrtkosten';

interface VorlagenVerwaltungProps {
  strecken: DefaultStrecke[];
  autos: Auto[];
  /** Person, zu der die Vorlagen gehören */
  personId: string;
  /** Wenn gesetzt: direkt im Anlege-Formular starten */
  direktAnlegen?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const LEER = {
  name: '',
  startort: '',
  startAdresse: '',
  zielort: '',
  zielAdresse: '',
  kilometer: 0,
  istFavorit: true,
  standardAutoId: '',
  standardHinUndZurueck: true, // immer Hin- und Rückfahrt
};

export default function VorlagenVerwaltung({ strecken, autos, personId, direktAnlegen, onClose, onUpdate }: VorlagenVerwaltungProps) {
  const [showForm, setShowForm] = useState(!!direktAnlegen);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...LEER, standardAutoId: autos[0]?.id || '' });

  const reset = () => {
    setForm({ ...LEER, standardAutoId: autos[0]?.id || '' });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (s: DefaultStrecke) => {
    setForm({
      name: s.name,
      startort: s.startort,
      startAdresse: s.startAdresse,
      zielort: s.zielort,
      zielAdresse: s.zielAdresse,
      kilometer: s.kilometer,
      istFavorit: s.istFavorit,
      standardAutoId: s.standardAutoId || '',
      standardHinUndZurueck: s.standardHinUndZurueck ?? false,
    });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleSpeichern = async () => {
    if (!form.name || !form.startort || !form.zielort) return;
    try {
      if (editId) {
        await fahrkostenService.aktualisiereDefaultStrecke(editId, {
          ...form,
          startAdresse: form.startAdresse || form.startort,
          zielAdresse: form.zielAdresse || form.zielort,
          standardAutoId: form.standardAutoId || undefined,
        });
      } else {
        await fahrkostenService.erstelleDefaultStrecke({
          ...form,
          personId,
          startAdresse: form.startAdresse || form.startort,
          zielAdresse: form.zielAdresse || form.zielort,
          standardAutoId: form.standardAutoId || undefined,
          sortierung: strecken.length,
        });
      }
      reset();
      onUpdate();
    } catch (error) {
      console.error('Fehler:', error);
      alert('Fehler beim Speichern der Vorlage.');
    }
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Vorlage wirklich löschen?')) return;
    try {
      await fahrkostenService.loescheDefaultStrecke(id);
      onUpdate();
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  const handleFavoritToggle = async (s: DefaultStrecke) => {
    try {
      await fahrkostenService.aktualisiereDefaultStrecke(s.id, { istFavorit: !s.istFavorit });
      onUpdate();
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Vorlagen verwalten</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {/* Liste */}
          {strecken.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-xl">
              <button
                onClick={() => handleFavoritToggle(s)}
                title="Quick-Add Favorit"
                className={`p-2 rounded-lg ${s.istFavorit ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
              >
                <Zap className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                  {s.kilometer} km einfach · {s.kilometer * 2} km Hin+Rück
                  {s.standardAutoId && autos.find(a => a.id === s.standardAutoId)
                    ? ` · ${autos.find(a => a.id === s.standardAutoId)!.name}`
                    : ''}
                </p>
              </div>
              <button onClick={() => handleEdit(s)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={() => handleLoeschen(s.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Formular */}
          {showForm ? (
            <div className="p-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl space-y-3">
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Name (z.B. Büro → Kunde)"
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={form.startort}
                  onChange={e => setForm({ ...form, startort: e.target.value })}
                  placeholder="Start"
                  className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  value={form.zielort}
                  onChange={e => setForm({ ...form, zielort: e.target.value })}
                  placeholder="Ziel"
                  className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
                />
              </div>
              <input
                type="number"
                value={form.kilometer || ''}
                onChange={e => setForm({ ...form, kilometer: Number(e.target.value) })}
                placeholder="Kilometer (einfach)"
                min="0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
              <select
                value={form.standardAutoId}
                onChange={e => setForm({ ...form, standardAutoId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              >
                <option value="">Standard-Auto (optional)</option>
                {autos.filter(a => a.aktiv).map(a => (
                  <option key={a.id} value={a.id}>{a.name} · {a.kmPauschale.toFixed(2)} €/km</option>
                ))}
              </select>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.istFavorit}
                  onChange={e => setForm({ ...form, istFavorit: e.target.checked })}
                  className="rounded border-gray-300 text-red-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Als Quick-Add Favorit anzeigen</span>
              </label>
              <div className="flex gap-2">
                <button onClick={reset} className="flex-1 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300">
                  Abbrechen
                </button>
                <button onClick={handleSpeichern} className="flex-1 py-2 bg-red-600 text-white rounded-lg flex items-center justify-center gap-1">
                  <Check className="w-4 h-4" /> Speichern
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" /> Neue Vorlage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
