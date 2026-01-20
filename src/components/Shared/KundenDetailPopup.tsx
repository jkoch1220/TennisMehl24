import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { SaisonKundeMitDaten } from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import KundenDetail from '../Saisonplanung/KundenDetail';
import KundenFormular from '../Saisonplanung/KundenFormular';

interface KundenDetailPopupProps {
  kundeId: string;
  onClose: () => void;
}

const KundenDetailPopup = ({ kundeId, onClose }: KundenDetailPopupProps) => {
  const [kunde, setKunde] = useState<SaisonKundeMitDaten | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFormular, setShowFormular] = useState(false);

  // Aktuelles Saisonjahr ermitteln (Jahr + 1 wenn nach Oktober)
  const getAktuellesSaisonjahr = () => {
    const now = new Date();
    const monat = now.getMonth(); // 0-11
    const jahr = now.getFullYear();
    // Ab November (Monat 10) gilt das nächste Jahr als Saisonjahr
    return monat >= 10 ? jahr + 1 : jahr;
  };

  const loadKundenDaten = async () => {
    try {
      setLoading(true);
      setError(null);

      const saisonjahr = getAktuellesSaisonjahr();
      const kundenDaten = await saisonplanungService.loadKundeMitDaten(kundeId, saisonjahr);

      if (kundenDaten) {
        setKunde(kundenDaten);
      } else {
        setError('Kunde nicht gefunden');
      }
    } catch (err) {
      console.error('Fehler beim Laden des Kunden:', err);
      setError('Fehler beim Laden der Kundendaten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKundenDaten();
  }, [kundeId]);

  const handleUpdate = async () => {
    // Daten neu laden nach Änderungen
    await loadKundenDaten();
  };

  const handleEdit = () => {
    setShowFormular(true);
  };

  const handleFormularSave = async () => {
    setShowFormular(false);
    // Daten neu laden nach Speichern
    await loadKundenDaten();
  };

  const handleFormularCancel = () => {
    setShowFormular(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-xl">
          <Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Kundendaten...</p>
        </div>
      </div>
    );
  }

  if (error || !kunde) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-xl text-center">
          <p className="text-red-600 mb-4">{error || 'Kunde nicht gefunden'}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">ID: {kundeId}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  // Wenn Formular angezeigt werden soll
  if (showFormular) {
    return (
      <KundenFormular
        kunde={kunde}
        onSave={handleFormularSave}
        onCancel={handleFormularCancel}
      />
    );
  }

  return (
    <KundenDetail
      kunde={kunde}
      onClose={onClose}
      onEdit={handleEdit}
      onUpdate={handleUpdate}
    />
  );
};

export default KundenDetailPopup;
