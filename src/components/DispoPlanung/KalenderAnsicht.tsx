import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Truck } from 'lucide-react';
import { Lieferung, Route } from '../../types/dispo';
import { lieferungService } from '../../services/lieferungService';
import { routeService } from '../../services/routeService';
import {
  getTageDesMonats,
  getErsterTagDesMonats,
  addMonate,
  formatDatum,
  istGleicherTag,
} from '../../utils/kalenderUtils';
import LieferungFormular from './LieferungFormular';

type Ansicht = 'monat' | 'woche' | 'tag';

const KalenderAnsicht = () => {
  const [ansicht, setAnsicht] = useState<Ansicht>('monat');
  const [aktuellesDatum, setAktuellesDatum] = useState(new Date());
  const [lieferungen, setLieferungen] = useState<Lieferung[]>([]);
  const [routen, setRouten] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [bearbeiteLieferung, setBearbeiteLieferung] = useState<Lieferung | null>(null);

  useEffect(() => {
    ladeDaten();
  }, [aktuellesDatum, ansicht]);

  const ladeDaten = async () => {
    setIsLoading(true);
    try {
      let von: Date;
      let bis: Date;

      if (ansicht === 'monat') {
        von = getErsterTagDesMonats(aktuellesDatum);
        bis = addMonate(von, 1);
      } else if (ansicht === 'woche') {
        von = new Date(aktuellesDatum);
        von.setDate(von.getDate() - 7);
        bis = new Date(aktuellesDatum);
        bis.setDate(bis.getDate() + 7);
      } else {
        von = new Date(aktuellesDatum);
        bis = new Date(aktuellesDatum);
      }

      const [geladeneLieferungen, geladeneRouten] = await Promise.all([
        lieferungService.loadLieferungenVonBis(von, bis),
        routeService.loadRoutenFuerDatum(aktuellesDatum),
      ]);

      setLieferungen(geladeneLieferungen);
      setRouten(geladeneRouten);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVorheriger = () => {
    if (ansicht === 'monat') {
      setAktuellesDatum(addMonate(aktuellesDatum, -1));
    } else {
      const neu = new Date(aktuellesDatum);
      neu.setDate(neu.getDate() - (ansicht === 'woche' ? 7 : 1));
      setAktuellesDatum(neu);
    }
  };

  const handleNaechster = () => {
    if (ansicht === 'monat') {
      setAktuellesDatum(addMonate(aktuellesDatum, 1));
    } else {
      const neu = new Date(aktuellesDatum);
      neu.setDate(neu.getDate() + (ansicht === 'woche' ? 7 : 1));
      setAktuellesDatum(neu);
    }
  };

  const handleHeute = () => {
    setAktuellesDatum(new Date());
  };

  const getLieferungenFuerTag = (datum: Date): Lieferung[] => {
    return lieferungen.filter(l => {
      const lieferDatum = new Date(l.zeitfenster.gewuenscht);
      return istGleicherTag(lieferDatum, datum);
    });
  };

  const getRoutenFuerTag = (datum: Date): Route[] => {
    return routen.filter(r => {
      const routeDatum = new Date(r.datum);
      return istGleicherTag(routeDatum, datum);
    });
  };

  const getStatusFarbe = (status: Lieferung['status']): string => {
    const farben: Record<Lieferung['status'], string> = {
      geplant: 'bg-blue-100 text-blue-800',
      bestaetigt: 'bg-yellow-100 text-yellow-800',
      beladen: 'bg-purple-100 text-purple-800',
      unterwegs: 'bg-orange-100 text-orange-800',
      geliefert: 'bg-green-100 text-green-800',
      abgerechnet: 'bg-gray-100 text-gray-800',
    };
    return farben[status] || 'bg-gray-100 text-gray-800';
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
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleVorheriger}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleHeute}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Heute
            </button>
            <button
              onClick={handleNaechster}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text ml-4">
              {ansicht === 'monat'
                ? aktuellesDatum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
                : formatDatum(aktuellesDatum)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {(['monat', 'woche', 'tag'] as Ansicht[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAnsicht(a)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    ansicht === a
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {a === 'monat' ? 'Monat' : a === 'woche' ? 'Woche' : 'Tag'}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setBearbeiteLieferung(null);
                setShowFormular(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Neue Lieferung
            </button>
          </div>
        </div>

        {/* Kalender */}
        {ansicht === 'monat' && (
          <div className="grid grid-cols-7 gap-2">
            {/* Wochentage Header */}
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((tag) => (
              <div key={tag} className="text-center font-semibold text-gray-700 dark:text-dark-textMuted py-2">
                {tag}
              </div>
            ))}
            {/* Tage */}
            {getTageDesMonats(aktuellesDatum).map((tag, index) => {
              const tagLieferungen = getLieferungenFuerTag(tag);
              const tagRouten = getRoutenFuerTag(tag);
              const istHeute = istGleicherTag(tag, new Date());
              const istAndererMonat = tag.getMonth() !== aktuellesDatum.getMonth();

              return (
                <div
                  key={index}
                  className={`
                    min-h-24 border border-gray-200 rounded-lg p-2 cursor-pointer hover:bg-gray-50 transition-colors
                    ${istHeute ? 'ring-2 ring-red-500' : ''}
                    ${istAndererMonat ? 'opacity-40' : ''}
                  `}
                  onClick={() => {
                    setAktuellesDatum(tag);
                    setAnsicht('tag');
                  }}
                >
                  <div className={`text-sm font-medium mb-1 ${istHeute ? 'text-red-600' : 'text-gray-900'}`}>
                    {tag.getDate()}
                  </div>
                  <div className="space-y-1">
                    {tagRouten.map((route) => (
                      <div
                        key={route.id}
                        className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 rounded px-1 py-0.5"
                      >
                        <Truck className="w-3 h-3" />
                        <span className="truncate">{route.name}</span>
                      </div>
                    ))}
                    {tagLieferungen.slice(0, 3).map((lieferung) => (
                      <div
                        key={lieferung.id}
                        className={`text-xs rounded px-1 py-0.5 truncate ${getStatusFarbe(lieferung.status)}`}
                      >
                        {lieferung.kundenname}
                      </div>
                    ))}
                    {tagLieferungen.length > 3 && (
                      <div className="text-xs text-gray-500 dark:text-dark-textMuted">
                        +{tagLieferungen.length - 3} weitere
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ansicht === 'tag' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
              {formatDatum(aktuellesDatum)}
            </h3>
            <div className="space-y-3">
              {getRoutenFuerTag(aktuellesDatum).map((route) => (
                <div key={route.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-dark-text">{route.name}</h4>
                    <span className="text-sm text-gray-600 dark:text-dark-textMuted">
                      {route.zeitplan.stops.length} Lieferungen
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dark-textMuted">
                    <span>🚛 {route.fahrzeugId}</span>
                    <span>📍 {route.routeDetails.gesamtDistanz.toFixed(1)} km</span>
                    <span>💰 {route.routeDetails.gesamtkosten.toFixed(2)} €</span>
                  </div>
                </div>
              ))}
              {getLieferungenFuerTag(aktuellesDatum)
                .filter(l => !l.route)
                .map((lieferung) => (
                  <div
                    key={lieferung.id}
                    className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-md dark:shadow-dark-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setBearbeiteLieferung(lieferung);
                      setShowFormular(true);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 dark:text-dark-text">{lieferung.kundenname}</h4>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusFarbe(lieferung.status)}`}>
                        {lieferung.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dark-textMuted">
                      <span>📍 {lieferung.adresse.plz} {lieferung.adresse.ort}</span>
                      <span>📦 {lieferung.lieferdetails.paletten} Paletten</span>
                      <span>⚖️ {lieferung.lieferdetails.tonnen.toFixed(2)} t</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Lieferung Formular Modal */}
      {showFormular && (
        <LieferungFormular
          lieferung={bearbeiteLieferung}
          onClose={() => {
            setShowFormular(false);
            setBearbeiteLieferung(null);
            ladeDaten();
          }}
        />
      )}
    </>
  );
};

export default KalenderAnsicht;

