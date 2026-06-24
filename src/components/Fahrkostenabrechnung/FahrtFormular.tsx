import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { fahrkostenService } from '../../services/fahrkostenService';
import { DefaultStrecke, Person, Auto, Firma, Fahrt, NeueFahrt } from '../../types/fahrtkosten';
import { toISODate } from './dateUtils';

interface FahrtFormularProps {
  person: Person;
  autos: Auto[];
  firmen: Firma[];
  defaultStrecken: DefaultStrecke[];
  bearbeitungsFahrt: Fahrt | null;
  onClose: () => void;
  onSaved: (fahrt: Fahrt, istNeu: boolean) => void;
}

export default function FahrtFormular({
  person,
  autos,
  firmen,
  defaultStrecken,
  bearbeitungsFahrt,
  onClose,
  onSaved,
}: FahrtFormularProps) {
  const istBearbeitung = !!bearbeitungsFahrt;
  const [saving, setSaving] = useState(false);

  const [datum, setDatum] = useState(bearbeitungsFahrt?.datum || toISODate(new Date()));
  const [startort, setStartort] = useState(bearbeitungsFahrt?.startort || '');
  const [startAdresse, setStartAdresse] = useState(bearbeitungsFahrt?.startAdresse || '');
  const [zielort, setZielort] = useState(bearbeitungsFahrt?.zielort || '');
  const [zielAdresse, setZielAdresse] = useState(bearbeitungsFahrt?.zielAdresse || '');
  // km im Formular = einfache Strecke; es wird immer Hin- und Rückfahrt gerechnet
  const [kilometer, setKilometer] = useState<number>(
    bearbeitungsFahrt
      ? (bearbeitungsFahrt.hinpirsUndZurueck ? bearbeitungsFahrt.kilometer / 2 : bearbeitungsFahrt.kilometer)
      : 0
  );
  const [autoId, setAutoId] = useState(bearbeitungsFahrt?.autoId || autos[0]?.id || '');
  const [firmaId, setFirmaId] = useState(bearbeitungsFahrt?.firmaId || '');
  const [kommentar, setKommentar] = useState(bearbeitungsFahrt?.kommentar || '');

  const auto = autos.find(a => a.id === autoId);
  const pauschale = auto?.kmPauschale ?? 0.3;
  const effektivKm = kilometer * 2; // immer Hin- und Rückfahrt
  const betrag = Math.round(effektivKm * pauschale * 100) / 100;

  const kannSpeichern = !!startort && !!zielort && kilometer > 0 && !!firmaId && !!auto && !saving;

  const handleStreckeAuswahl = (s: DefaultStrecke) => {
    setStartort(s.startort);
    setStartAdresse(s.startAdresse);
    setZielort(s.zielort);
    setZielAdresse(s.zielAdresse);
    setKilometer(s.kilometer);
    if (s.standardAutoId) setAutoId(s.standardAutoId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kannSpeichern || !auto) return;
    const firma = firmen.find(f => f.id === firmaId);
    if (!firma) return;

    setSaving(true);
    try {
      const daten: NeueFahrt = {
        datum,
        personId: person.id,
        personName: person.name,
        autoId: auto.id,
        autoName: auto.name,
        firmaId: firma.id,
        firmaName: firma.name,
        startort,
        startAdresse: startAdresse || startort,
        zielort,
        zielAdresse: zielAdresse || zielort,
        kilometer,
        kilometerPauschale: auto.kmPauschale,
        hinpirsUndZurueck: true,
        kommentar: kommentar.trim() || undefined,
        defaultStreckeId: bearbeitungsFahrt?.defaultStreckeId,
      };

      if (bearbeitungsFahrt) {
        // km auf effektiven Wert bringen, da aktualisiereFahrt mit bereits verdoppeltem km rechnet
        const aktualisiert = await fahrkostenService.aktualisiereFahrt(bearbeitungsFahrt.id, {
          datum: daten.datum,
          personId: daten.personId,
          personName: daten.personName,
          autoId: daten.autoId,
          autoName: daten.autoName,
          firmaId: daten.firmaId,
          firmaName: daten.firmaName,
          startort: daten.startort,
          startAdresse: daten.startAdresse,
          zielort: daten.zielort,
          zielAdresse: daten.zielAdresse,
          kilometer: effektivKm,
          kilometerPauschale: auto.kmPauschale,
          hinpirsUndZurueck: true,
          kommentar: daten.kommentar,
        });
        onSaved(aktualisiert, false);
      } else {
        const erstellt = await fahrkostenService.erstelleFahrt(daten);
        onSaved(erstellt, true);
      }
      onClose();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Fahrt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {istBearbeitung ? 'Fahrt bearbeiten' : 'Neue Fahrt'} · {person.name}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* Vorlage */}
          {!istBearbeitung && defaultStrecken.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vorlage wählen</label>
              <div className="flex flex-wrap gap-2">
                {defaultStrecken.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStreckeAuswahl(s)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                      startort === s.startort && zielort === s.zielort
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Datum */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Datum</label>
            <input
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>

          {/* Start & Ziel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Start</label>
              <input
                type="text"
                value={startort}
                onChange={e => setStartort(e.target.value)}
                placeholder="z.B. Giebelstadt"
                className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ziel</label>
              <input
                type="text"
                value={zielort}
                onChange={e => setZielort(e.target.value)}
                placeholder="z.B. Produktion"
                className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
            </div>
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
              {firmen.filter(f => f.aktiv || f.id === firmaId).map(f => (
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
              {autos.filter(a => a.aktiv || a.id === autoId).map(a => (
                <option key={a.id} value={a.id}>{a.name} · {a.kmPauschale.toFixed(2)} €/km</option>
              ))}
            </select>
          </div>

          {/* Kilometer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Kilometer (einfache Strecke)
            </label>
            <input
              type="number"
              value={kilometer || ''}
              onChange={e => setKilometer(Number(e.target.value))}
              placeholder="45"
              min="0"
              step="0.1"
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">Wird automatisch als Hin- und Rückfahrt (×2) gerechnet.</p>
          </div>

          {/* Kommentar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Kommentar <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={kommentar}
              onChange={e => setKommentar(e.target.value)}
              placeholder="z.B. Material abgeholt"
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>

          {/* Vorschau */}
          {kilometer > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Berechnung</span>
                <div className="text-right">
                  <p className="font-bold text-lg text-red-600">{betrag.toFixed(2)} €</p>
                  <p className="text-xs text-gray-500">{effektivKm} km × {pauschale.toFixed(2)} €</p>
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="p-4 border-t dark:border-dark-border">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!kannSpeichern}
            className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            {saving ? 'Speichert …' : istBearbeitung ? 'Speichern' : 'Fahrt erfassen'}
          </button>
        </div>
      </div>
    </div>
  );
}
