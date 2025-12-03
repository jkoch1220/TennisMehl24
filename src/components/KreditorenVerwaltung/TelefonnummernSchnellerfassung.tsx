import { useState, useEffect, useRef } from 'react';
import { X, Phone, ChevronRight, ChevronLeft, Check, Copy, CheckCheck } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  const currentRechnung = rechnungen[currentIndex];
  const progress = ((currentIndex + 1) / rechnungen.length) * 100;

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
      setTelefonnummer(kreditor?.telefon || '');
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      setTelefonnummer('');
    }
  };

  const handleSave = async () => {
    if (!currentRechnung?.kreditorId || !telefonnummer.trim()) {
      handleNext();
      return;
    }

    setSaving(true);
    try {
      // Lade Kreditor
      const kreditor = await kreditorService.loadKreditor(currentRechnung.kreditorId);
      
      if (kreditor) {
        // Update mit Telefonnummer
        await kreditorService.updateKreditor(kreditor.id, {
          ...kreditor,
          telefon: telefonnummer.trim(),
        });
        onUpdate();
      }

      // Weiter zur nächsten
      handleNext();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Telefonnummer');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < rechnungen.length - 1) {
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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
        {/* Header mit Progress */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-t-xl">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <Phone className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Telefonnummern-Schnellerfassung</h2>
                <p className="text-blue-100 text-sm">
                  {currentIndex + 1} von {rechnungen.length} Rechnungen
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

        {/* Content */}
        <div className="p-8">
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
        </div>

        {/* Bereits erfasste Telefonnummern */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            📞 Bereits erfasste Nummern:
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {rechnungen
              .slice(0, currentIndex)
              .filter((r) => {
                // Zeige nur die mit Telefonnummer
                const idx = rechnungen.findIndex(rech => rech.id === r.id);
                return idx < currentIndex;
              })
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
