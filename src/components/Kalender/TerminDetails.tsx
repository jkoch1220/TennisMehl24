import React, { useState } from 'react';
import { X, Edit2, Trash2, Calendar, Clock, MapPin, Repeat, Bell, User } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Termin } from '../../types/termin';

interface TerminDetailsProps {
  termin: Termin;
  onEdit: (termin: Termin) => void;
  onDelete: (terminId: string) => void;
  onClose: () => void;
}

const TerminDetails: React.FC<TerminDetailsProps> = ({
  termin,
  onEdit,
  onDelete,
  onClose,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const startDatum = new Date(termin.startDatum);
  const endDatum = new Date(termin.endDatum);
  const dauer = differenceInMinutes(endDatum, startDatum);

  const formatDauer = (minuten: number): string => {
    if (minuten < 60) {
      return `${minuten} Min`;
    }
    const stunden = Math.floor(minuten / 60);
    const restMinuten = minuten % 60;
    if (restMinuten === 0) {
      return `${stunden} Std`;
    }
    return `${stunden} Std ${restMinuten} Min`;
  };

  const formatWiederholung = (wiederholung: string): string => {
    switch (wiederholung) {
      case 'taeglich': return 'Täglich';
      case 'woechentlich': return 'Wöchentlich';
      case 'monatlich': return 'Monatlich';
      case 'jaehrlich': return 'Jährlich';
      default: return 'Keine';
    }
  };

  const formatErinnerung = (minuten: number): string => {
    if (minuten === 0) return 'Keine';
    if (minuten < 60) return `${minuten} Min vorher`;
    if (minuten === 60) return '1 Std vorher';
    if (minuten === 120) return '2 Std vorher';
    if (minuten === 1440) return '1 Tag vorher';
    const stunden = Math.floor(minuten / 60);
    return `${stunden} Std vorher`;
  };

  const handleDelete = () => {
    onDelete(termin.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: termin.farbe || '#3b82f6' }}
              />
              <h2 className="text-xl font-semibold text-gray-900">{termin.titel}</h2>
            </div>
            {termin.beschreibung && (
              <p className="text-gray-600 text-sm mt-2">{termin.beschreibung}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          {/* Datum und Zeit */}
          <div className="flex items-start space-x-3">
            <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
            <div>
              <div className="font-medium text-gray-900">
                {format(startDatum, 'EEEE, d. MMMM yyyy', { locale: de })}
              </div>
              {termin.ganztaegig ? (
                <div className="text-sm text-gray-600">Ganztägig</div>
              ) : (
                <div className="text-sm text-gray-600">
                  {format(startDatum, 'HH:mm')} - {format(endDatum, 'HH:mm')}
                  <span className="ml-2 text-gray-500">({formatDauer(dauer)})</span>
                </div>
              )}
            </div>
          </div>

          {/* Ort */}
          {termin.ort && (
            <div className="flex items-start space-x-3">
              <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-gray-900">{termin.ort}</div>
              </div>
            </div>
          )}

          {/* Wiederholung */}
          {termin.wiederholung && termin.wiederholung !== 'keine' && (
            <div className="flex items-start space-x-3">
              <Repeat className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-gray-900">{formatWiederholung(termin.wiederholung)}</div>
                {termin.wiederholungEnde && (
                  <div className="text-sm text-gray-600">
                    Bis {format(new Date(termin.wiederholungEnde), 'd. MMMM yyyy', { locale: de })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Erinnerung */}
          {termin.erinnerung && termin.erinnerung > 0 && (
            <div className="flex items-start space-x-3">
              <Bell className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-gray-900">{formatErinnerung(termin.erinnerung)}</div>
              </div>
            </div>
          )}

          {/* Erstellt von */}
          {termin.erstelltVon && (
            <div className="flex items-start space-x-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-gray-900">Erstellt von {termin.erstelltVon}</div>
                <div className="text-sm text-gray-600">
                  {format(new Date(termin.erstelltAm), 'd. MMM yyyy, HH:mm', { locale: de })}
                </div>
              </div>
            </div>
          )}

          {/* Letztes Update */}
          {termin.geaendertAm !== termin.erstelltAm && (
            <div className="flex items-start space-x-3">
              <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-600">
                  Zuletzt geändert: {format(new Date(termin.geaendertAm), 'd. MMM yyyy, HH:mm', { locale: de })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Aktionen */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200">
          <div>
            {showDeleteConfirm ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-red-600">Wirklich löschen?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                >
                  Ja
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors"
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Löschen</span>
              </button>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Schließen
            </button>
            <button
              onClick={() => onEdit(termin)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              <span>Bearbeiten</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminDetails;