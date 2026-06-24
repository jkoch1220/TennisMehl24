import { useState } from 'react';
import { X, Check, Zap, MapPin, CalendarDays } from 'lucide-react';
import MiniKalender from './MiniKalender';
import { fahrkostenService } from '../../services/fahrkostenService';
import { DefaultStrecke, Person, Auto, Firma, NeueFahrt, Fahrt } from '../../types/fahrtkosten';

interface QuickAddModalProps {
  vorlage: DefaultStrecke;
  person: Person;
  autos: Auto[];
  firmen: Firma[];
  onClose: () => void;
  onCreated: (fahrten: Fahrt[]) => void;
}

export default function QuickAddModal({ vorlage, person, autos, firmen, onClose, onCreated }: QuickAddModalProps) {
  const [tage, setTage] = useState<string[]>([]);
  const [autoId, setAutoId] = useState<string>(vorlage.standardAutoId || autos[0]?.id || '');
  const [firmaId, setFirmaId] = useState<string>('');
  const [kommentar, setKommentar] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const auto = autos.find(a => a.id === autoId);
  const firma = firmen.find(f => f.id === firmaId);
  const pauschale = auto?.kmPauschale ?? 0.3;
  const kmProTag = vorlage.kilometer * 2; // immer Hin- und Rückfahrt
  const betragProTag = Math.round(kmProTag * pauschale * 100) / 100;
  const gesamtBetrag = Math.round(betragProTag * tage.length * 100) / 100;

  const kannSpeichern = tage.length > 0 && !!firmaId && !!auto && !saving;

  const toggleTag = (datum: string) => {
    setTage(prev => (prev.includes(datum) ? prev.filter(d => d !== datum) : [...prev, datum]));
  };

  const handleSpeichern = async () => {
    if (!kannSpeichern || !auto || !firma) return;
    setSaving(true);
    try {
      const basis: Omit<NeueFahrt, 'datum'> = {
        personId: person.id,
        personName: person.name,
        autoId: auto.id,
        autoName: auto.name,
        firmaId: firma.id,
        firmaName: firma.name,
        startort: vorlage.startort,
        startAdresse: vorlage.startAdresse,
        zielort: vorlage.zielort,
        zielAdresse: vorlage.zielAdresse,
        kilometer: vorlage.kilometer,
        kilometerPauschale: auto.kmPauschale,
        hinpirsUndZurueck: true,
        kommentar: kommentar.trim() || undefined,
        defaultStreckeId: vorlage.id,
      };
      const erstellte = await fahrkostenService.erstelleFahrtenFuerTage(basis, tage.sort());
      onCreated(erstellte);
      onClose();
    } catch (error) {
      console.error('Fehler beim Quick-Add:', error);
      alert('Fehler beim Speichern der Fahrten.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{vorlage.name}</h2>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {vorlage.kilometer} km · {person.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Kalender */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CalendarDays className="w-4 h-4" /> Tage auswählen
              {tage.length > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded-full">
                  {tage.length} Tag{tage.length === 1 ? '' : 'e'}
                </span>
              )}
            </label>
            <MiniKalender selected={tage} onToggle={toggleTag} />
          </div>

          {/* Firma */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Firma <span className="text-red-500">*</span>
            </label>
            <select
              value={firmaId}
              onChange={e => setFirmaId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            >
              <option value="">Firma wählen …</option>
              {firmen.filter(f => f.aktiv).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Auto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Auto <span className="text-red-500">*</span>
            </label>
            <select
              value={autoId}
              onChange={e => setAutoId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            >
              <option value="">Auto wählen …</option>
              {autos.filter(a => a.aktiv).map(a => (
                <option key={a.id} value={a.id}>{a.name} · {a.kmPauschale.toFixed(2)} €/km</option>
              ))}
            </select>
          </div>

          {/* Kommentar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Kommentar <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={kommentar}
              onChange={e => setKommentar(e.target.value)}
              rows={2}
              placeholder="z.B. Material abgeholt"
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white resize-none"
            />
          </div>

          {/* Vorschau */}
          {tage.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{tage.length} × {kmProTag} km (Hin+Rück) × {pauschale.toFixed(2)} €</span>
                <span>{betragProTag.toFixed(2)} € / Tag</span>
              </div>
              <div className="flex items-center justify-between font-bold text-lg">
                <span className="text-gray-900 dark:text-white">Gesamt</span>
                <span className="text-red-600">{gesamtBetrag.toFixed(2)} €</span>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="p-4 border-t dark:border-dark-border">
          <button
            type="button"
            onClick={handleSpeichern}
            disabled={!kannSpeichern}
            className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            {saving ? 'Speichert …' : `${tage.length || ''} Fahrt${tage.length === 1 ? '' : 'en'} erfassen`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
