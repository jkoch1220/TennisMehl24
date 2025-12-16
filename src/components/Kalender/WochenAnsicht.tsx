import React, { useMemo, useState, useRef, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Termin, TerminPosition } from '../../types/termin';

interface WochenAnsichtProps {
  aktuellesDatum: Date;
  termine: Termin[];
  onTerminClick: (termin: Termin) => void;
  onNeuerTermin: (datum: Date) => void;
  onTerminVerschieben: (terminId: string, neueStartZeit: string, neueDauer?: number) => void;
}

const WochenAnsicht: React.FC<WochenAnsichtProps> = ({
  aktuellesDatum,
  termine,
  onTerminClick,
  onNeuerTermin,
  onTerminVerschieben,
}) => {
  const [draggedTermin, setDraggedTermin] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Wochentage berechnen
  const wochenTage = useMemo(() => {
    const wochenStart = startOfWeek(aktuellesDatum, { weekStartsOn: 1 });
    const wochenEnde = endOfWeek(aktuellesDatum, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: wochenStart, end: wochenEnde });
  }, [aktuellesDatum]);

  // Stunden für die Seitenleiste (6:00 - 22:00)
  const stunden = useMemo(() => {
    const stundenArray: number[] = [];
    for (let i = 6; i <= 22; i++) {
      stundenArray.push(i);
    }
    return stundenArray;
  }, []);

  // Stunde Höhe konstant definieren
  const STUNDEN_HOEHE = 60; // 60px pro Stunde

  // Termine nach Tag gruppieren
  const termineNachTag = useMemo(() => {
    const gruppiert = new Map<string, Termin[]>();
    
    wochenTage.forEach(tag => {
      const tagKey = format(tag, 'yyyy-MM-dd');
      gruppiert.set(tagKey, []);
    });
    
    termine.forEach(termin => {
      const terminDatum = new Date(termin.startDatum);
      const tagKey = format(terminDatum, 'yyyy-MM-dd');
      
      if (gruppiert.has(tagKey)) {
        gruppiert.get(tagKey)!.push(termin);
      }
    });
    
    return gruppiert;
  }, [termine, wochenTage]);

  // Termin-Positionen berechnen
  const berechneTerminPosition = useCallback((termin: Termin, tagIndex: number): TerminPosition => {
    const startZeit = new Date(termin.startDatum);
    const endZeit = new Date(termin.endDatum);
    
    // Stunden ab 6:00 Uhr
    const minutenVon6Uhr = (startZeit.getHours() - 6) * 60 + startZeit.getMinutes();
    const dauerMinuten = differenceInMinutes(endZeit, startZeit);
    
    // Position berechnen (STUNDEN_HOEHE px pro Stunde)
    const top = Math.max(0, (minutenVon6Uhr / 60) * STUNDEN_HOEHE);
    const height = Math.max(20, (dauerMinuten / 60) * STUNDEN_HOEHE); // Mindesthöhe 20px
    
    // Breite und Position horizontal
    const left = (tagIndex * (100 / 7)) + 0.5; // Kleine Margin
    const width = (100 / 7) - 1; // Platz für Margin
    
    return { top, height, left, width };
  }, [STUNDEN_HOEHE]);

  // Zeitslot Click Handler
  const handleZeitSlotClick = (tag: Date, stunde: number, minute: number = 0) => {
    const neuesDatum = new Date(tag);
    neuesDatum.setHours(stunde, minute, 0, 0);
    onNeuerTermin(neuesDatum);
  };

  // Drag & Drop Handlers
  const handleMouseDown = (e: React.MouseEvent, terminId: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setDraggedTermin(terminId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedTermin || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top - dragOffset.y;
    
    // Snap zu 15-Minuten-Intervallen
    const minutenVon6Uhr = Math.round((relativeY / STUNDEN_HOEHE) * 60 / 15) * 15;
    
    // Update dragged element position
    const draggedElement = document.querySelector(`[data-termin-id="${draggedTermin}"]`) as HTMLElement;
    if (draggedElement) {
      draggedElement.style.top = `${Math.max(0, (minutenVon6Uhr / 60) * STUNDEN_HOEHE)}px`;
    }
  }, [draggedTermin, dragOffset.y, STUNDEN_HOEHE]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!draggedTermin || !containerRef.current) {
      setDraggedTermin(null);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - containerRect.left;
    const relativeY = e.clientY - containerRect.top - dragOffset.y;
    
    // Berechne Tag (Spalte)
    const spaltenBreite = containerRect.width / 7;
    const tagIndex = Math.floor(relativeX / spaltenBreite);
    
    if (tagIndex >= 0 && tagIndex < wochenTage.length) {
      // Berechne Zeit (Zeile)
      const minutenVon6Uhr = Math.round((relativeY / STUNDEN_HOEHE) * 60 / 15) * 15;
      const stunden = Math.floor(minutenVon6Uhr / 60) + 6;
      const minuten = minutenVon6Uhr % 60;
      
      if (stunden >= 6 && stunden <= 22) {
        const neueStartZeit = new Date(wochenTage[tagIndex]);
        neueStartZeit.setHours(stunden, minuten, 0, 0);
        
        onTerminVerschieben(draggedTermin, neueStartZeit.toISOString());
      }
    }
    
    setDraggedTermin(null);
  }, [draggedTermin, wochenTage, onTerminVerschieben, dragOffset.y, STUNDEN_HOEHE]);

  // Event Listeners für Drag & Drop
  React.useEffect(() => {
    if (draggedTermin) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
      };
    }
  }, [draggedTermin, handleMouseMove, handleMouseUp]);

  // Aktuelle Zeit Linie
  const aktuelleZeit = useMemo(() => {
    const jetzt = new Date();
    const istHeuteInWoche = wochenTage.some(tag => isSameDay(tag, jetzt));
    
    if (!istHeuteInWoche) return null;
    
    const stunden = jetzt.getHours();
    const minuten = jetzt.getMinutes();
    
    if (stunden < 6 || stunden > 22) return null;
    
    const minutenVon6Uhr = (stunden - 6) * 60 + minuten;
    const top = (minutenVon6Uhr / 60) * STUNDEN_HOEHE;
    
    return {
      top,
      tagIndex: wochenTage.findIndex(tag => isSameDay(tag, jetzt))
    };
  }, [wochenTage, STUNDEN_HOEHE]);

  return (
    <div className="h-full flex bg-white" ref={containerRef}>
      {/* Zeit-Spalte */}
      <div className="w-16 flex-shrink-0 border-r border-gray-200">
        {/* Header Spacer */}
        <div className="h-16 border-b border-gray-200"></div>
        
        {/* Stunden */}
        {stunden.map((stunde) => (
          <div 
            key={stunde} 
            className="border-b border-gray-100 flex items-start justify-end pr-2 pt-1"
            style={{ height: `${STUNDEN_HOEHE}px` }}
          >
            <span className="text-xs text-gray-500 font-medium">
              {format(new Date().setHours(stunde, 0, 0, 0), 'HH:mm')}
            </span>
          </div>
        ))}
      </div>

      {/* Kalender Grid */}
      <div className="flex-1 flex flex-col">
        {/* Wochentage Header */}
        <div className="h-16 grid grid-cols-7 border-b border-gray-200">
          {wochenTage.map((tag) => {
            const istHeute = isToday(tag);
            
            return (
              <div
                key={tag.toISOString()}
                className={`border-r border-gray-200 flex flex-col items-center justify-center ${
                  istHeute ? 'bg-blue-50' : 'bg-gray-50'
                }`}
              >
                <div className="text-xs text-gray-600 font-medium uppercase">
                  {format(tag, 'EEE', { locale: de })}
                </div>
                <div
                  className={`text-lg font-semibold mt-1 ${
                    istHeute 
                      ? 'bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center'
                      : 'text-gray-900'
                  }`}
                >
                  {format(tag, 'd')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Zeit-Grid */}
        <div className="flex-1 relative">
          {/* Stunden-Grid */}
          <div className="absolute inset-0">
            {stunden.map((stunde) => (
              <div 
                key={stunde} 
                className="grid grid-cols-7"
                style={{ height: `${STUNDEN_HOEHE}px` }}
              >
                {wochenTage.map((tag, tagIndex) => (
                  <div
                    key={`${tagIndex}-${stunde}`}
                    className="border-r border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleZeitSlotClick(tag, stunde)}
                  >
                    {/* 15-Minuten Intervalle */}
                    <div className="h-full grid grid-rows-4">
                      {[0, 15, 30, 45].map((minute) => (
                        <div
                          key={minute}
                          className="border-b border-gray-50 hover:bg-blue-50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleZeitSlotClick(tag, stunde, minute);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Termine */}
          <div className="absolute inset-0 pointer-events-none">
            {wochenTage.map((tag, tagIndex) => {
              const tagKey = format(tag, 'yyyy-MM-dd');
              const tagTermine = termineNachTag.get(tagKey) || [];
              
              return tagTermine.map((termin) => {
                const position = berechneTerminPosition(termin, tagIndex);
                const istDragged = draggedTermin === termin.id;
                
                return (
                  <div
                    key={termin.id}
                    data-termin-id={termin.id}
                    className={`absolute pointer-events-auto cursor-pointer transition-shadow duration-200
                      ${istDragged ? 'z-10 shadow-lg' : 'hover:shadow-md'}`}
                    style={{
                      top: `${position.top}px`,
                      height: `${position.height}px`,
                      left: `${position.left}%`,
                      width: `${position.width}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTerminClick(termin);
                    }}
                    onMouseDown={(e) => handleMouseDown(e, termin.id)}
                  >
                    <div
                      className={`h-full rounded-md px-2 py-1 text-sm text-white font-medium
                        ${istDragged ? 'opacity-80' : 'hover:opacity-90'} 
                        transition-opacity duration-200`}
                      style={{ backgroundColor: termin.farbe || '#3b82f6' }}
                    >
                      <div className="font-semibold truncate">{termin.titel}</div>
                      {position.height > 40 && (
                        <div className="text-xs opacity-90 truncate">
                          {format(new Date(termin.startDatum), 'HH:mm')} - {format(new Date(termin.endDatum), 'HH:mm')}
                        </div>
                      )}
                      {position.height > 60 && termin.ort && (
                        <div className="text-xs opacity-75 truncate mt-1">
                          📍 {termin.ort}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })}
          </div>

          {/* Aktuelle Zeit Linie */}
          {aktuelleZeit && (
            <div
              className="absolute pointer-events-none z-20"
              style={{
                top: `${aktuelleZeit.top}px`,
                left: `${(aktuelleZeit.tagIndex * (100 / 7)) + 0.5}%`,
                width: `${(100 / 7) - 1}%`,
                height: '2px',
              }}
            >
              <div className="w-full h-full bg-red-500 relative">
                <div className="absolute -left-1 -top-1 w-3 h-3 bg-red-500 rounded-full"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WochenAnsicht;