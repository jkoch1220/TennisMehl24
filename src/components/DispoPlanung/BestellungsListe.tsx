import { useState, useEffect } from 'react';
import { Plus, MapPin, Package, Edit, Trash2, Filter } from 'lucide-react';
import { Bestellung, BestellungsStatus } from '../../types/bestellung';
import { bestellungService } from '../../services/bestellungService';
import { formatDatum } from '../../utils/kalenderUtils';
import BestellungFormular from './BestellungFormular';
import { geocodeAdresse } from '../../utils/geocoding';

interface BestellungsListeProps {
  onBestellungAktualisiert?: () => void;
}

const BestellungsListe = ({ onBestellungAktualisiert }: BestellungsListeProps) => {
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [gefilterteBestellungen, setGefilterteBestellungen] = useState<Bestellung[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [bearbeiteBestellung, setBearbeiteBestellung] = useState<Bestellung | null>(null);
  const [filterStatus, setFilterStatus] = useState<BestellungsStatus | 'alle'>('alle');
  const [suchbegriff, setSuchbegriff] = useState('');

  useEffect(() => {
    ladeBestellungen();
  }, []);

  useEffect(() => {
    filtereBestellungen();
  }, [bestellungen, filterStatus, suchbegriff]);

  const ladeBestellungen = async () => {
    setIsLoading(true);
    try {
      const geladeneBestellungen = await bestellungService.loadAlleBestellungen();
      setBestellungen(geladeneBestellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellungen:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filtereBestellungen = () => {
    let gefiltert = bestellungen;

    // Status-Filter
    if (filterStatus !== 'alle') {
      gefiltert = gefiltert.filter((b) => b.status === filterStatus);
    }

    // Suchbegriff-Filter
    if (suchbegriff) {
      const begriff = suchbegriff.toLowerCase();
      gefiltert = gefiltert.filter(
        (b) =>
          b.kundenname.toLowerCase().includes(begriff) ||
          b.adresse.ort.toLowerCase().includes(begriff) ||
          b.adresse.plz.includes(begriff) ||
          (b.bestellnummer && b.bestellnummer.toLowerCase().includes(begriff))
      );
    }

    setGefilterteBestellungen(gefiltert);
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Möchten Sie diese Bestellung wirklich löschen?')) return;

    try {
      await bestellungService.deleteBestellung(id);
      ladeBestellungen();
    } catch (error) {
      console.error('Fehler beim Löschen der Bestellung:', error);
      alert('Fehler beim Löschen der Bestellung');
    }
  };

  const handleGeocodeBestellung = async (bestellung: Bestellung) => {
    if (!bestellung.adresse.strasse || !bestellung.adresse.plz || !bestellung.adresse.ort) {
      alert('Adresse ist unvollständig. Bitte bearbeiten Sie die Bestellung.');
      return;
    }

    try {
      const koordinaten = await geocodeAdresse(
        bestellung.adresse.strasse,
        bestellung.adresse.plz,
        bestellung.adresse.ort
      );

      if (koordinaten) {
        await bestellungService.updateBestellung(bestellung.id, {
          ...bestellung,
          adresse: {
            ...bestellung.adresse,
            koordinaten,
          },
        });
        ladeBestellungen();
        alert('Koordinaten erfolgreich ermittelt!');
      } else {
        alert('Koordinaten konnten nicht ermittelt werden. Bitte überprüfen Sie die Adresse.');
      }
    } catch (error) {
      console.error('Fehler beim Geocoding:', error);
      alert('Fehler beim Ermitteln der Koordinaten');
    }
  };

  const getStatusFarbe = (status: BestellungsStatus): string => {
    const farben: Record<BestellungsStatus, string> = {
      offen: 'bg-blue-100 text-blue-800',
      geplant: 'bg-yellow-100 text-yellow-800',
      in_produktion: 'bg-purple-100 text-purple-800',
      bereit: 'bg-green-100 text-green-800',
      geliefert: 'bg-gray-100 text-gray-800',
      storniert: 'bg-red-100 text-red-800',
    };
    return farben[status] || 'bg-gray-100 text-gray-800';
  };

  const getPrioritaetFarbe = (prioritaet: Bestellung['prioritaet']): string => {
    const farben = {
      hoch: 'text-red-600',
      normal: 'text-yellow-600',
      niedrig: 'text-gray-600',
    };
    return farben[prioritaet] || 'text-gray-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Bestellungen suchen..."
              value={suchbegriff}
              onChange={(e) => setSuchbegriff(e.target.value)}
              className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as BestellungsStatus | 'alle')}
              className="px-4 py-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
            >
              <option value="alle">Alle Status</option>
              <option value="offen">Offen</option>
              <option value="geplant">Geplant</option>
              <option value="in_produktion">In Produktion</option>
              <option value="bereit">Bereit</option>
              <option value="geliefert">Geliefert</option>
              <option value="storniert">Storniert</option>
            </select>
          </div>
          <button
            onClick={() => {
              setBearbeiteBestellung(null);
              setShowFormular(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neue Bestellung
          </button>
        </div>

        {/* Bestellungsliste */}
        {gefilterteBestellungen.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>
              {bestellungen.length === 0
                ? 'Keine Bestellungen vorhanden'
                : 'Keine Bestellungen gefunden'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {gefilterteBestellungen.map((bestellung) => (
              <div
                key={bestellung.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {bestellung.kundenname}
                      </h3>
                      <span
                        className={`text-xs px-2 py-1 rounded ${getStatusFarbe(bestellung.status)}`}
                      >
                        {bestellung.status}
                      </span>
                      {bestellung.prioritaet === 'hoch' && (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">
                          Hoch
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {bestellung.adresse.plz} {bestellung.adresse.ort}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        {bestellung.bestelldetails.paletten} Paletten -{' '}
                        {bestellung.bestelldetails.tonnen.toFixed(2)} t
                      </span>
                      {bestellung.bestellnummer && (
                        <span>Bestellnr.: {bestellung.bestellnummer}</span>
                      )}
                    </div>
                    {bestellung.lieferdatum && (
                      <div className="text-sm text-gray-600">
                        Lieferdatum: {formatDatum(new Date(bestellung.lieferdatum.von))} - {formatDatum(new Date(bestellung.lieferdatum.bis))}
                      </div>
                    )}
                    {bestellung.notizen && (
                      <div className="text-sm text-gray-500 mt-2 italic">
                        {bestellung.notizen}
                      </div>
                    )}
                    {!bestellung.adresse.koordinaten && (
                      <div className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Keine Koordinaten - wird nicht auf Karte angezeigt
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!bestellung.adresse.koordinaten && (
                      <button
                        onClick={() => handleGeocodeBestellung(bestellung)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Koordinaten ermitteln"
                      >
                        <MapPin className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setBearbeiteBestellung(bestellung);
                        setShowFormular(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleLoeschen(bestellung.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bestellung Formular Modal */}
      {showFormular && (
        <BestellungFormular
          bestellung={bearbeiteBestellung}
          onClose={() => {
            setShowFormular(false);
            setBearbeiteBestellung(null);
            ladeBestellungen();
            onBestellungAktualisiert?.();
          }}
        />
      )}
    </>
  );
};

export default BestellungsListe;

