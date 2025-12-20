import { useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { SaisonKundeMitDaten, VereinPlatzbauerBeziehung } from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';

interface Props {
  kunden: SaisonKundeMitDaten[];
  onClose: () => void;
  onUpdate: () => void;
}

const BeziehungsUebersicht = ({ kunden, onClose, onUpdate }: Props) => {
  const vereine = useMemo(() => kunden.filter((k) => k.kunde.typ === 'verein'), [kunden]);
  const platzbauer = useMemo(() => kunden.filter((k) => k.kunde.typ === 'platzbauer'), [kunden]);
  const [neueBeziehung, setNeueBeziehung] = useState<{
    vereinId: string;
    platzbauerId: string;
    notiz?: string;
  }>({ vereinId: '', platzbauerId: '', notiz: '' });
  const [saving, setSaving] = useState(false);

  const beziehungen: (VereinPlatzbauerBeziehung & {
    vereinName: string;
    platzbauerName: string;
  })[] = useMemo(() => {
    const platzbauerNames = new Map(platzbauer.map((p) => [p.kunde.id, p.kunde.name]));
    return vereine.flatMap((v) =>
      (v.beziehungenAlsVerein || []).map((b) => ({
        ...b,
        vereinName: v.kunde.name,
        platzbauerName: platzbauerNames.get(b.platzbauerId) || b.platzbauerId,
      }))
    );
  }, [vereine, platzbauer]);

  const handleCreate = async () => {
    if (!neueBeziehung.vereinId || !neueBeziehung.platzbauerId) return;
    setSaving(true);
    try {
      await saisonplanungService.createBeziehung({
        ...neueBeziehung,
        status: 'aktiv',
      });
      setNeueBeziehung({ vereinId: '', platzbauerId: '', notiz: '' });
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, patch: Partial<VereinPlatzbauerBeziehung>) => {
    setSaving(true);
    try {
      await saisonplanungService.updateBeziehung(id, patch);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Beziehung wirklich löschen?')) return;
    setSaving(true);
    try {
      await saisonplanungService.deleteBeziehung(id);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Beziehungen Verein ↔ Platzbauer</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Neue Beziehung */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Neue Zuordnung</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Verein</label>
                <select
                  value={neueBeziehung.vereinId}
                  onChange={(e) => setNeueBeziehung({ ...neueBeziehung, vereinId: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Bitte wählen</option>
                  {vereine.map((v) => (
                    <option key={v.kunde.id} value={v.kunde.id}>
                      {v.kunde.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Platzbauer</label>
                <select
                  value={neueBeziehung.platzbauerId}
                  onChange={(e) =>
                    setNeueBeziehung({ ...neueBeziehung, platzbauerId: e.target.value })
                  }
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Bitte wählen</option>
                  {platzbauer.map((p) => (
                    <option key={p.kunde.id} value={p.kunde.id}>
                      {p.kunde.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Notiz</label>
                <input
                  type="text"
                  value={neueBeziehung.notiz || ''}
                  onChange={(e) => setNeueBeziehung({ ...neueBeziehung, notiz: e.target.value })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="z.B. hauptsächlich"
                />
              </div>
            </div>
            <button
              disabled={saving}
              onClick={handleCreate}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              Anlegen
            </button>
          </div>

          {/* Liste */}
          <div className="space-y-2">
            {beziehungen.length === 0 ? (
              <p className="text-gray-500 dark:text-slate-400 text-center py-4">Keine Beziehungen erfasst.</p>
            ) : (
              beziehungen.map((b) => (
                <div
                  key={b.id}
                  className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-center"
                >
                  <div>
                    <div className="text-sm text-gray-600 dark:text-slate-400">Verein</div>
                    <div className="font-medium text-gray-900 dark:text-slate-100">{b.vereinName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-slate-400">Platzbauer</div>
                    <div className="font-medium text-gray-900 dark:text-slate-100">{b.platzbauerName}</div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Status</label>
                      <select
                        value={b.status}
                        onChange={(e) => handleUpdate(b.id, { status: e.target.value as any })}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="aktiv">Aktiv</option>
                        <option value="inaktiv">Inaktiv</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Notiz</label>
                      <input
                        type="text"
                        value={b.notiz || ''}
                        onChange={(e) => handleUpdate(b.id, { notiz: e.target.value })}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Löschen
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeziehungsUebersicht;
