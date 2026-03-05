/**
 * Aktivitäts-Timeline für Shop-Bestellungen
 * Zeigt Status-Historie aus Gambio und interne Aktivitäten
 */

import {
  Clock,
  RefreshCw,
  Truck,
  MessageSquare,
  CheckCircle,
  Package,
  Mail,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import {
  GambioStatusHistorie,
  AktivitaetsEintrag,
} from '../../services/shopBestellungService';

interface AktivitaetsTimelineProps {
  statusHistorie: GambioStatusHistorie[];
  aktivitaetsLog: AktivitaetsEintrag[];
  kundenKommentar?: string;
  bestelldatum: string;
}

// Kombinierter Timeline-Eintrag
interface TimelineEintrag {
  id: string;
  datum: Date;
  typ: 'gambio' | 'portal' | 'kunde';
  titel: string;
  details?: string;
  icon: React.ElementType;
  farbe: string;
  kundeInformiert?: boolean;
}

// Gambio Status-Namen
const GAMBIO_STATUS_NAMEN: Record<number, string> = {
  1: 'Offen',
  2: 'In Bearbeitung',
  3: 'Versendet',
  4: 'Abgeschlossen',
  99: 'Storniert',
};

const AktivitaetsTimeline = ({
  statusHistorie,
  aktivitaetsLog,
  kundenKommentar,
  bestelldatum,
}: AktivitaetsTimelineProps) => {
  const [expanded, setExpanded] = useState(true);

  // Kombiniere alle Einträge zu einer Timeline
  const timelineEintraege: TimelineEintrag[] = [];

  // Gambio Status-Historie hinzufügen
  statusHistorie.forEach((entry) => {
    timelineEintraege.push({
      id: `gambio-${entry.id}`,
      datum: new Date(entry.dateAdded),
      typ: 'gambio',
      titel: GAMBIO_STATUS_NAMEN[entry.statusId] || `Status ${entry.statusId}`,
      details: entry.comment || undefined,
      icon: Package,
      farbe: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
      kundeInformiert: entry.customerNotified,
    });
  });

  // Interne Aktivitäten hinzufügen
  aktivitaetsLog.forEach((entry) => {
    let icon = Clock;
    let farbe = 'text-gray-500 bg-gray-100 dark:bg-gray-700';

    switch (entry.aktion) {
      case 'status_aenderung':
        icon = CheckCircle;
        farbe = 'text-green-500 bg-green-100 dark:bg-green-900/30';
        break;
      case 'tracking_gesetzt':
        icon = Truck;
        farbe = 'text-purple-500 bg-purple-100 dark:bg-purple-900/30';
        break;
      case 'kunde_benachrichtigt':
        icon = Mail;
        farbe = 'text-orange-500 bg-orange-100 dark:bg-orange-900/30';
        break;
      case 'sync':
        icon = RefreshCw;
        farbe = 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
        break;
    }

    timelineEintraege.push({
      id: entry.id,
      datum: new Date(entry.datum),
      typ: 'portal',
      titel: entry.details,
      details: entry.benutzer ? `Von: ${entry.benutzer}` : undefined,
      icon,
      farbe,
      kundeInformiert: entry.kundeInformiert,
    });
  });

  // Kunden-Kommentar als ersten Eintrag hinzufügen (wenn vorhanden)
  if (kundenKommentar) {
    timelineEintraege.push({
      id: 'kunde-kommentar',
      datum: new Date(bestelldatum),
      typ: 'kunde',
      titel: 'Nachricht vom Kunden',
      details: kundenKommentar,
      icon: MessageSquare,
      farbe: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    });
  }

  // Sortiere nach Datum (neueste zuerst)
  timelineEintraege.sort((a, b) => b.datum.getTime() - a.datum.getTime());

  if (timelineEintraege.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Aktivitäten ({timelineEintraege.length})
        </h3>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {timelineEintraege.map((eintrag) => {
            const Icon = eintrag.icon;
            const typLabel =
              eintrag.typ === 'gambio'
                ? 'Gambio'
                : eintrag.typ === 'kunde'
                ? 'Kunde'
                : 'Portal';

            return (
              <div key={eintrag.id} className="flex gap-3">
                {/* Icon */}
                <div className={`p-2 rounded-lg ${eintrag.farbe}`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {eintrag.titel}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        eintrag.typ === 'gambio'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : eintrag.typ === 'kunde'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {typLabel}
                    </span>
                    {eintrag.kundeInformiert && (
                      <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Kunde informiert
                      </span>
                    )}
                  </div>

                  {eintrag.details && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {eintrag.details}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {eintrag.datum.toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AktivitaetsTimeline;
