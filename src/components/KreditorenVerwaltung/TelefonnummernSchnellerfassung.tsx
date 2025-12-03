import { useState, useEffect, useRef } from 'react';
import { X, Phone, ChevronRight, ChevronLeft, Check, Copy, CheckCheck, Search, Filter as FilterIcon } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';

interface TelefonnummernSchnellerfassungProps {
  rechnungen: OffeneRechnung[];
  onClose: () => void;
  onUpdate: () => void;
}

const TelefonnummernSchnellerfassung = ({ rechnungen, onClose, onUpdate }: TelefonnummernSchnellerfassungProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [telefonnummer, setTelefonnummer] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [filterKreditor, setFilterKreditor] = useState('');
  const [filterUnternehmen, setFilterUnternehmen] = useState<'alle' | 'TennisMehl' | 'Egner Bau'>('alle');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gefilterte Rechnungen
  const filteredRechnungen = rechnungen.filter(r => {
    const matchKreditor = !filterKreditor || 
      r.kreditorName.toLowerCase().includes(filterKreditor.toLowerCase()) ||
      r.rechnungsnummer?.toLowerCase().includes(filterKreditor.toLowerCase());
    
    const matchUnternehmen = filterUnternehmen === 'alle' || r.anUnternehmen === filterUnternehmen;
    
    return matchKreditor && matchUnternehmen;
  });

  const currentRechnung = filteredRechnungen[currentIndex];
  const progress = filteredRechnungen.length > 0 ? ((currentIndex + 1) / filteredRechnungen.length) * 100 : 0;

  // Reset Index beim Filtern
  useEffect(() => {
    setCurrentIndex(0);
  }, [filterKreditor, filterUnternehmen]);

  useEffect(() => {
    // Auto-focus auf Input
    inputRef.current?.focus();
  }, [currentIndex]);

  useEffect(() => {
    // Lade aktuelle Telefonnummer falls vorhanden
    if (currentRechnung?.kreditorId) {
      loadKreditorTelefon(currentRechnung.kreditorId);
    } else {
      setTelefonnummer('');
    }
  }, [currentRechnung]);

  const loadKreditorTelefon = async (kreditorId: string) => {
    try {
      const kreditor = await kreditorService.loadKreditor(kreditorId);
      // Prüfe beide Felder: direktes telefon oder kontakt.telefon
      const existingTelefon = kreditor?.telefon || kreditor?.kontakt?.telefon || '';
      setTelefonnummer(existingTelefon);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      setTelefonnummer('');
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    // Verhindere Form-Submit und Event-Bubbling
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!telefonnummer.trim()) {
      console.log('Keine Telefonnummer eingegeben, überspringe...');
      handleNext();
      return;
    }

    if (!currentRechnung) {
      console.error('Keine Rechnung vorhanden');
      return;
    }

    setSaving(true);
    try {
      console.log('=== START SPEICHERN ===');
      console.log('Kreditorname aus Rechnung:', currentRechnung.kreditorName);
      console.log('Telefonnummer:', telefonnummer.trim());
      
      // Suche oder erstelle Kreditor mit dem Namen aus der Rechnung
      const alleKreditoren = await kreditorService.loadAlleKreditoren();
      let kreditor = alleKreditoren.find(k => 
        k.name.toLowerCase().trim() === currentRechnung.kreditorName.toLowerCase().trim()
      );
      
      if (!kreditor) {
        // Erstelle neuen Kreditor mit Namen aus Rechnung
        console.log('Erstelle neuen Kreditor:', currentRechnung.kreditorName);
        kreditor = await kreditorService.createKreditor({
          name: currentRechnung.kreditorName,
          telefon: telefonnummer.trim(),
          kontakt: {
            telefon: telefonnummer.trim(),
          },
        });
        console.log('Neuer Kreditor erstellt:', kreditor.id);
        
        // Verknüpfe Rechnung mit Kreditor
        await kreditorService.updateRechnung(currentRechnung.id, {
          kreditorId: kreditor.id,
        });
      } else {
        // Update existierenden Kreditor
        console.log('Kreditor gefunden, aktualisiere:', kreditor.id);
        await kreditorService.updateKreditor(kreditor.id, {
          ...kreditor,
          telefon: telefonnummer.trim(),
          kontakt: {
            ...kreditor.kontakt,
            telefon: telefonnummer.trim(),
          },
        });
        console.log('Kreditor aktualisiert');
      }
      
      console.log('=== ERFOLGREICH GESPEICHERT ===');
      
      // Zeige Erfolgs-Feedback
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 1500);
      
      // Warte kurz und gehe zur nächsten
      await new Promise(resolve => setTimeout(resolve, 400));
      setSaving(false);
      onUpdate();
      handleNext();
      
    } catch (error) {
      console.error('=== FEHLER BEIM SPEICHERN ===', error);
      alert('Fehler beim Speichern der Telefonnummer: ' + (error as Error).message);
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < filteredRechnungen.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setTelefonnummer('');
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      handleSkip();
    } else if (e.ctrlKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrevious();
    }
  };

  const handleCopyPhone = (phone: string, index: number) => {
    navigator.clipboard.writeText(phone);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!currentRechnung) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header mit Progress */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-t-xl">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <Phone className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Telefonnummern-Schnellerfassung</h2>
                <p className="text-blue-100 text-sm">
                  {filteredRechnungen.length > 0 ? (
                    `${currentIndex + 1} von ${filteredRechnungen.length} Rechnungen`
                  ) : (
                    'Keine Rechnungen gefunden'
                  )}
                  {filterKreditor && ` (Filter aktiv)`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-blue-800 rounded-lg p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="bg-blue-800 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-green-400 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Filter */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <FilterIcon className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">Filter</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Kreditor-Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={filterKreditor}
                onChange={(e) => setFilterKreditor(e.target.value)}
                placeholder="Nach Kreditor suchen..."
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Unternehmen Filter */}
            <select
              value={filterUnternehmen}
              onChange={(e) => setFilterUnternehmen(e.target.value as any)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="alle">Alle Unternehmen</option>
              <option value="TennisMehl">TennisMehl</option>
              <option value="Egner Bau">Egner Bau</option>
            </select>
          </div>
          
          {/* Filter Reset */}
          {(filterKreditor || filterUnternehmen !== 'alle') && (
            <button
              onClick={() => {
                setFilterKreditor('');
                setFilterUnternehmen('alle');
              }}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              ✕ Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          {filteredRechnungen.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Keine Rechnungen gefunden
              </h3>
              <p className="text-gray-500 mb-4">
                Passe deine Filterkriterien an oder setze sie zurück.
              </p>
              <button
                onClick={() => {
                  setFilterKreditor('');
                  setFilterUnternehmen('alle');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Filter zurücksetzen
              </button>
            </div>
          ) : (
            <>
          {/* Kreditor Info */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <div className="text-sm text-gray-600 mb-1">Kreditor</div>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              {currentRechnung.kreditorName}
            </div>
            <div className="text-sm text-gray-600">
              {currentRechnung.betreff || currentRechnung.rechnungsnummer || 'Keine Beschreibung'}
            </div>
            {currentRechnung.rechnungsnummer && (
              <div className="text-xs text-gray-500 mt-1">
                RG-Nr: {currentRechnung.rechnungsnummer}
              </div>
            )}
          </div>

          {/* Telefonnummer Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Telefonnummer
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="tel"
                value={telefonnummer}
                onChange={(e) => setTelefonnummer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="z.B. 0171 1234567"
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              {showSaveSuccess && (
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-bounce">
                  <CheckCheck className="w-5 h-5" />
                  Gespeichert!
                </div>
              )}
            </div>
          </div>

          {/* Keyboard Shortcuts Hinweis */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="text-sm font-semibold text-blue-900 mb-2">⌨️ Tastatur-Shortcuts:</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
              <div><kbd className="px-2 py-1 bg-white rounded border">Enter</kbd> = Speichern & Weiter</div>
              <div><kbd className="px-2 py-1 bg-white rounded border">Esc</kbd> = Schließen</div>
              <div><kbd className="px-2 py-1 bg-white rounded border">Ctrl+→</kbd> = Überspringen</div>
              <div><kbd className="px-2 py-1 bg-white rounded border">Ctrl+←</kbd> = Zurück</div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                currentIndex === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              Zurück
            </button>

            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-3 bg-yellow-100 text-yellow-800 rounded-lg font-medium hover:bg-yellow-200 transition-colors flex items-center justify-center gap-2"
            >
              Überspringen
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                'Speichert...'
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Speichern & Weiter
                </>
              )}
            </button>
          </div>
            </>
          )}
        </div>
        </div>

        {/* Bereits erfasste Telefonnummern */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            📞 Bereits erfasste Nummern:
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {filteredRechnungen
              .slice(0, currentIndex)
              .slice(-10) // Nur die letzten 10
              .map((rechnung, idx) => (
                <div
                  key={rechnung.id}
                  className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs flex items-center gap-2 group hover:border-blue-400 transition-colors"
                >
                  <span className="text-gray-600">{rechnung.kreditorName.substring(0, 20)}</span>
                  {rechnung.kreditorId && (
                    <button
                      onClick={() => {
                        // Lade und zeige Telefonnummer
                        kreditorService.loadKreditor(rechnung.kreditorId!).then(k => {
                          if (k?.telefon) {
                            handleCopyPhone(k.telefon, idx);
                          }
                        });
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {copiedIndex === idx ? (
                        <CheckCheck className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelefonnummernSchnellerfassung;
