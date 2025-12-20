import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { format, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import MonatsAnsicht from './MonatsAnsicht';
import WochenAnsicht from './WochenAnsicht';
import TerminDialog from './TerminDialog';
import TerminDetails from './TerminDetails';
import { terminService } from '../../services/terminService';
import { Termin, KalenderAnsicht, NeuerTermin } from '../../types/termin';

const Kalender: React.FC = () => {
  const [ansicht, setAnsicht] = useState<KalenderAnsicht>('monat');
  const [aktuellesDatum, setAktuellesDatum] = useState<Date>(new Date());
  const [termine, setTermine] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTerminDialog, setShowTerminDialog] = useState(false);
  const [selectedTermin, setSelectedTermin] = useState<Termin | null>(null);
  const [showTerminDetails, setShowTerminDetails] = useState(false);
  const [neuerTerminDatum, setNeuerTerminDatum] = useState<Date | null>(null);

  // Termine laden
  useEffect(() => {
    loadTermine();
  }, []);

  const loadTermine = async () => {
    try {
      setLoading(true);
      const termineListe = await terminService.loadAlleTermine();
      setTermine(termineListe);
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
    } finally {
      setLoading(false);
    }
  };

  // Navigation
  const navigateVorwaerts = () => {
    if (ansicht === 'monat') {
      setAktuellesDatum(prev => addMonths(prev, 1));
    } else {
      setAktuellesDatum(prev => addWeeks(prev, 1));
    }
  };

  const navigateRueckwaerts = () => {
    if (ansicht === 'monat') {
      setAktuellesDatum(prev => subMonths(prev, 1));
    } else {
      setAktuellesDatum(prev => subWeeks(prev, 1));
    }
  };

  const navigateHeute = () => {
    setAktuellesDatum(new Date());
  };

  // Termin-Management
  const handleNeuerTermin = (datum?: Date) => {
    if (datum) {
      setNeuerTerminDatum(datum);
    }
    setSelectedTermin(null);
    setShowTerminDialog(true);
  };

  const handleTerminClick = (termin: Termin) => {
    setSelectedTermin(termin);
    setShowTerminDetails(true);
  };

  const handleTerminBearbeiten = (termin: Termin) => {
    setSelectedTermin(termin);
    setShowTerminDetails(false);
    setShowTerminDialog(true);
  };

  const handleTerminSpeichern = async (terminData: NeuerTermin) => {
    try {
      if (selectedTermin) {
        // Termin aktualisieren
        const aktualisiertermTermin = await terminService.updateTermin(selectedTermin.id, terminData);
        setTermine(prev => prev.map(t => t.id === selectedTermin.id ? aktualisiertermTermin : t));
      } else {
        // Neuen Termin erstellen
        const neuerTermin = await terminService.createTermin(terminData);
        setTermine(prev => [...prev, neuerTermin]);
      }
      setShowTerminDialog(false);
      setSelectedTermin(null);
      setNeuerTerminDatum(null);
    } catch (error) {
      console.error('Fehler beim Speichern des Termins:', error);
    }
  };

  const handleTerminLoeschen = async (terminId: string) => {
    try {
      await terminService.deleteTermin(terminId);
      setTermine(prev => prev.filter(t => t.id !== terminId));
      setShowTerminDetails(false);
      setSelectedTermin(null);
    } catch (error) {
      console.error('Fehler beim Löschen des Termins:', error);
    }
  };

  const handleTerminVerschieben = async (terminId: string, neueStartZeit: string, neueDauer?: number) => {
    try {
      const verschobenerTermin = await terminService.verschiebeTermin(terminId, neueStartZeit, neueDauer);
      setTermine(prev => prev.map(t => t.id === terminId ? verschobenerTermin : t));
    } catch (error) {
      console.error('Fehler beim Verschieben des Termins:', error);
    }
  };

  // Titel für Header generieren
  const getHeaderTitel = () => {
    if (ansicht === 'monat') {
      return format(aktuellesDatum, 'MMMM yyyy', { locale: de });
    } else {
      const wochenStart = startOfWeek(aktuellesDatum, { weekStartsOn: 1 });
      const wochenEnde = endOfWeek(aktuellesDatum, { weekStartsOn: 1 });
      
      if (wochenStart.getMonth() === wochenEnde.getMonth()) {
        return format(wochenStart, 'd.', { locale: de }) + 
               format(wochenEnde, 'd. MMMM yyyy', { locale: de });
      } else {
        return format(wochenStart, 'd. MMM', { locale: de }) + ' - ' +
               format(wochenEnde, 'd. MMM yyyy', { locale: de });
      }
    }
  };

  const istHeute = isSameDay(aktuellesDatum, new Date());

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-dark-surface">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-dark-text flex items-center">
              <Calendar className="h-6 w-6 mr-2 text-blue-600" />
              Kalender
            </h1>
            
            {/* Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={navigateRueckwaerts}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-dark-textMuted" />
              </button>
              
              <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text min-w-[200px] text-center">
                {getHeaderTitel()}
              </h2>
              
              <button
                onClick={navigateVorwaerts}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600 dark:text-dark-textMuted" />
              </button>
            </div>

            {/* Heute Button */}
            <button
              onClick={navigateHeute}
              disabled={istHeute}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                istHeute 
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <RotateCcw className="h-4 w-4 inline mr-1" />
              Heute
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {/* Ansicht Toggle */}
            <div className="flex border border-gray-300 dark:border-dark-border rounded-md overflow-hidden">
              <button
                onClick={() => setAnsicht('monat')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  ansicht === 'monat'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Monat
              </button>
              <button
                onClick={() => setAnsicht('woche')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  ansicht === 'woche'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Woche
              </button>
            </div>

            {/* Neuer Termin Button */}
            <button
              onClick={() => handleNeuerTermin()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Neuer Termin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kalender Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600 dark:text-dark-textMuted">Termine werden geladen...</p>
            </div>
          </div>
        ) : ansicht === 'monat' ? (
          <MonatsAnsicht
            aktuellesDatum={aktuellesDatum}
            termine={termine}
            onTerminClick={handleTerminClick}
            onNeuerTermin={handleNeuerTermin}
          />
        ) : (
          <WochenAnsicht
            aktuellesDatum={aktuellesDatum}
            termine={termine}
            onTerminClick={handleTerminClick}
            onNeuerTermin={handleNeuerTermin}
            onTerminVerschieben={handleTerminVerschieben}
          />
        )}
      </div>

      {/* Dialoge */}
      {showTerminDialog && (
        <TerminDialog
          termin={selectedTermin}
          initialDatum={neuerTerminDatum}
          onSave={handleTerminSpeichern}
          onCancel={() => {
            setShowTerminDialog(false);
            setSelectedTermin(null);
            setNeuerTerminDatum(null);
          }}
        />
      )}

      {showTerminDetails && selectedTermin && (
        <TerminDetails
          termin={selectedTermin}
          onEdit={handleTerminBearbeiten}
          onDelete={handleTerminLoeschen}
          onClose={() => {
            setShowTerminDetails(false);
            setSelectedTermin(null);
          }}
        />
      )}
    </div>
  );
};

export default Kalender;