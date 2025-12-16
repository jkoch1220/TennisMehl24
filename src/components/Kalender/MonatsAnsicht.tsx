import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { Termin } from '../../types/termin';

interface MonatsAnsichtProps {
  aktuellesDatum: Date;
  termine: Termin[];
  onTerminClick: (termin: Termin) => void;
  onNeuerTermin: (datum: Date) => void;
}

const MonatsAnsicht: React.FC<MonatsAnsichtProps> = ({
  aktuellesDatum,
  termine,
  onTerminClick,
  onNeuerTermin,
}) => {
  // Kalender-Grid berechnen
  const kalenderTage = useMemo(() => {
    const monatsStart = startOfMonth(aktuellesDatum);
    const monatsEnde = endOfMonth(aktuellesDatum);
    const kalenderStart = startOfWeek(monatsStart, { weekStartsOn: 1 });
    const kalenderEnde = endOfWeek(monatsEnde, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: kalenderStart, end: kalenderEnde });
  }, [aktuellesDatum]);

  // Termine nach Datum gruppieren
  const termineNachDatum = useMemo(() => {
    const gruppiert = new Map<string, Termin[]>();
    
    termine.forEach(termin => {
      const terminDatum = new Date(termin.startDatum);
      const datumKey = format(terminDatum, 'yyyy-MM-dd');
      
      if (!gruppiert.has(datumKey)) {
        gruppiert.set(datumKey, []);
      }
      gruppiert.get(datumKey)!.push(termin);
    });
    
    // Termine nach Startzeit sortieren
    gruppiert.forEach(termineAmTag => {
      termineAmTag.sort((a, b) => {
        const aStart = new Date(a.startDatum);
        const bStart = new Date(b.startDatum);
        return aStart.getTime() - bStart.getTime();
      });
    });
    
    return gruppiert;
  }, [termine]);

  const getTermineAmTag = (datum: Date): Termin[] => {
    const datumKey = format(datum, 'yyyy-MM-dd');
    return termineNachDatum.get(datumKey) || [];
  };

  const handleTagClick = (datum: Date, event: React.MouseEvent) => {
    // Wenn auf einen leeren Bereich geklickt wird, neuen Termin erstellen
    const target = event.target as HTMLElement;
    if (target.classList.contains('tag-content') || target.classList.contains('tag-nummer')) {
      onNeuerTermin(datum);
    }
  };

  const formatTerminZeit = (termin: Termin): string => {
    if (termin.ganztaegig) {
      return '';
    }
    
    const startZeit = new Date(termin.startDatum);
    return format(startZeit, 'HH:mm', { locale: de });
  };


  const MAX_SICHTBARE_TERMINE = 3;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Wochentage Header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((wochentag) => (
          <div
            key={wochentag}
            className="p-3 text-center text-sm font-medium text-gray-500 bg-gray-50"
          >
            {wochentag}
          </div>
        ))}
      </div>

      {/* Kalender Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {kalenderTage.map((tag) => {
          const istHeutiger = isToday(tag);
          const istImAktuellenMonat = isSameMonth(tag, aktuellesDatum);
          const tagTermine = getTermineAmTag(tag);
          const sichtbareTermine = tagTermine.slice(0, MAX_SICHTBARE_TERMINE);
          const weitereTermineAnzahl = Math.max(0, tagTermine.length - MAX_SICHTBARE_TERMINE);
          
          return (
            <div
              key={tag.toISOString()}
              className={`border-r border-b border-gray-200 min-h-[120px] overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors ${
                !istImAktuellenMonat ? 'bg-gray-50' : ''
              }`}
              onClick={(e) => handleTagClick(tag, e)}
            >
              <div className="h-full flex flex-col">
                {/* Tag Nummer */}
                <div className="p-2 flex justify-between items-start tag-content">
                  <span
                    className={`tag-nummer text-sm font-medium ${
                      istHeutiger
                        ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
                        : istImAktuellenMonat
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {format(tag, 'd')}
                  </span>
                </div>

                {/* Termine */}
                <div className="flex-1 px-1 pb-1 space-y-1">
                  {sichtbareTermine.map((termin) => {
                    const zeit = formatTerminZeit(termin);
                    
                    return (
                      <div
                        key={termin.id}
                        className="group relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTerminClick(termin);
                        }}
                      >
                        <div
                          className={`px-2 py-1 rounded text-xs font-medium cursor-pointer
                            hover:shadow-sm transition-all duration-200 truncate
                            ${termin.ganztaegig 
                              ? 'min-h-[20px]' 
                              : 'min-h-[24px]'
                            }`}
                          style={{
                            backgroundColor: termin.farbe || '#3b82f6',
                            color: 'white',
                          }}
                          title={`${termin.titel}${zeit ? ` (${zeit})` : ''}`}
                        >
                          <div className="flex items-start justify-between">
                            <span className="truncate flex-1">
                              {zeit && !termin.ganztaegig && (
                                <span className="opacity-90 mr-1">{zeit}</span>
                              )}
                              {termin.titel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* "X weitere" Anzeige */}
                  {weitereTermineAnzahl > 0 && (
                    <div className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 cursor-pointer">
                      + {weitereTermineAnzahl} weitere
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonatsAnsicht;