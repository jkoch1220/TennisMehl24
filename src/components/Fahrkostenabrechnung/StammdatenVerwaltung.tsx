import { useState } from 'react';
import { X, Trash2, Plus, Check, Car, Building2, Users, Edit3 } from 'lucide-react';
import { fahrkostenService } from '../../services/fahrkostenService';
import { Person, Auto, Firma } from '../../types/fahrtkosten';

type Tab = 'autos' | 'firmen' | 'personen';

const TAB_META: Record<Tab, { label: string; icon: typeof Car }> = {
  autos: { label: 'Autos', icon: Car },
  firmen: { label: 'Firmen', icon: Building2 },
  personen: { label: 'Personen', icon: Users },
};

interface StammdatenVerwaltungProps {
  /** Welche Tabs angezeigt werden */
  tabs: Tab[];
  /** Person, zu der Autos/Firmen gehören (für die Tabs autos/firmen erforderlich) */
  personId?: string;
  personName?: string;
  personen?: Person[];
  autos?: Auto[];
  firmen?: Firma[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function StammdatenVerwaltung({
  tabs,
  personId,
  personName,
  personen = [],
  autos = [],
  firmen = [],
  onClose,
  onUpdate,
}: StammdatenVerwaltungProps) {
  const [tab, setTab] = useState<Tab>(tabs[0]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Stammdaten{personName ? ` · ${personName}` : ''}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex border-b dark:border-dark-border">
            {tabs.map(key => {
              const { label, icon: Icon } = TAB_META[key];
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b-2 ${
                    tab === key
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="p-4 overflow-y-auto">
          {tab === 'autos' && personId && <AutoListe autos={autos} personId={personId} onUpdate={onUpdate} />}
          {tab === 'firmen' && personId && <FirmaListe firmen={firmen} personId={personId} onUpdate={onUpdate} />}
          {tab === 'personen' && <PersonListe personen={personen} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

// ==================== AUTOS ====================
function AutoListe({ autos, personId, onUpdate }: { autos: Auto[]; personId: string; onUpdate: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kennzeichen, setKennzeichen] = useState('');
  const [pauschale, setPauschale] = useState<string>('0,30');
  const [showForm, setShowForm] = useState(false);

  const pauschaleNum = parseFloat(pauschale.replace(',', '.'));

  const reset = () => { setEditId(null); setName(''); setKennzeichen(''); setPauschale('0,30'); setShowForm(false); };

  const speichern = async () => {
    if (!name.trim() || !(pauschaleNum > 0)) return;
    try {
      const kennzeichenWert = kennzeichen.trim() || undefined;
      if (editId) {
        await fahrkostenService.aktualisiereAuto(editId, { name: name.trim(), kennzeichen: kennzeichenWert, kmPauschale: pauschaleNum });
      } else {
        await fahrkostenService.erstelleAuto({ personId, name: name.trim(), kennzeichen: kennzeichenWert, kmPauschale: pauschaleNum, aktiv: true, sortierung: autos.length });
      }
      reset();
      onUpdate();
    } catch (e) { console.error(e); alert('Fehler beim Speichern.'); }
  };

  const loeschen = async (id: string) => {
    if (!confirm('Auto wirklich löschen?')) return;
    try { await fahrkostenService.loescheAuto(id); onUpdate(); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-3">
      {autos.length === 0 && <p className="text-sm text-gray-500 dark:text-dark-textMuted text-center py-2">Noch keine Autos für diese Person.</p>}
      {autos.map(a => (
        <div key={a.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-xl">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"><Car className="w-4 h-4 text-gray-500" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{a.name}</p>
            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
              {a.kennzeichen ? `${a.kennzeichen} · ` : ''}{a.kmPauschale.toFixed(2)} €/km
            </p>
          </div>
          <button onClick={() => { setEditId(a.id); setName(a.name); setKennzeichen(a.kennzeichen || ''); setPauschale(String(a.kmPauschale).replace('.', ',')); setShowForm(true); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={() => loeschen(a.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="p-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bezeichnung (z.B. VW Caddy)"
            className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
          />
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Kennzeichen (optional)</label>
            <input
              type="text"
              value={kennzeichen}
              onChange={e => setKennzeichen(e.target.value)}
              placeholder="z.B. WÜ-TM 123"
              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">km-Pauschale (€/km)</label>
            <input
              type="text"
              inputMode="decimal"
              value={pauschale}
              onChange={e => setPauschale(e.target.value)}
              placeholder="0,30"
              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300">Abbrechen</button>
            <button onClick={speichern} className="flex-1 py-2 bg-red-600 text-white rounded-lg flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Speichern</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" /> Neues Auto
        </button>
      )}
    </div>
  );
}

// ==================== FIRMEN ====================
function FirmaListe({ firmen, personId, onUpdate }: { firmen: Firma[]; personId: string; onUpdate: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const reset = () => { setEditId(null); setName(''); setShowForm(false); };

  const speichern = async () => {
    if (!name.trim()) return;
    try {
      if (editId) {
        await fahrkostenService.aktualisiereFirma(editId, { name: name.trim() });
      } else {
        await fahrkostenService.erstelleFirma({ personId, name: name.trim(), aktiv: true, sortierung: firmen.length });
      }
      reset();
      onUpdate();
    } catch (e) { console.error(e); alert('Fehler beim Speichern.'); }
  };

  const loeschen = async (id: string) => {
    if (!confirm('Firma wirklich löschen?')) return;
    try { await fahrkostenService.loescheFirma(id); onUpdate(); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-3">
      {firmen.length === 0 && <p className="text-sm text-gray-500 dark:text-dark-textMuted text-center py-2">Noch keine Firmen für diese Person.</p>}
      {firmen.map(f => (
        <div key={f.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-xl">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"><Building2 className="w-4 h-4 text-gray-500" /></div>
          <p className="flex-1 min-w-0 font-medium text-gray-900 dark:text-white truncate">{f.name}</p>
          <button onClick={() => { setEditId(f.id); setName(f.name); setShowForm(true); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={() => loeschen(f.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="p-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Firmenname"
            className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300">Abbrechen</button>
            <button onClick={speichern} className="flex-1 py-2 bg-red-600 text-white rounded-lg flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Speichern</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" /> Neue Firma
        </button>
      )}
    </div>
  );
}

// ==================== PERSONEN ====================
function PersonListe({ personen, onUpdate }: { personen: Person[]; onUpdate: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const reset = () => { setEditId(null); setName(''); setShowForm(false); };

  const speichern = async () => {
    if (!name.trim()) return;
    try {
      if (editId) {
        await fahrkostenService.aktualisierePerson(editId, { name: name.trim() });
      } else {
        await fahrkostenService.erstellePerson({ name: name.trim(), aktiv: true, sortierung: personen.length });
      }
      reset();
      onUpdate();
    } catch (e) { console.error(e); alert('Fehler beim Speichern.'); }
  };

  const loeschen = async (id: string) => {
    if (!confirm('Person wirklich löschen? Bestehende Fahrten bleiben erhalten.')) return;
    try { await fahrkostenService.loeschePerson(id); onUpdate(); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-3">
      {personen.map(p => (
        <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-xl">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"><Users className="w-4 h-4 text-gray-500" /></div>
          <p className="flex-1 min-w-0 font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
          <button onClick={() => { setEditId(p.id); setName(p.name); setShowForm(true); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={() => loeschen(p.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="p-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300">Abbrechen</button>
            <button onClick={speichern} className="flex-1 py-2 bg-red-600 text-white rounded-lg flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Speichern</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" /> Neue Person
        </button>
      )}
    </div>
  );
}
