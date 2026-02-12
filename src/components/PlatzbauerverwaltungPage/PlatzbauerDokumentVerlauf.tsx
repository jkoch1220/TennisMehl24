/**
 * PlatzbauerDokumentVerlauf
 *
 * Zeigt den Dateiverlauf für Platzbauer-Dokumente an.
 * Basiert auf der gleichen UI-Logik wie DokumentVerlauf für Vereine.
 */

import { useState, useEffect } from 'react';
import {
  Download,
  Eye,
  FileText,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
} from 'lucide-react';
import { PlatzbauerDokumentTyp, PlatzbauerDokumentVerlaufEintrag } from '../../types/platzbauer';
import { ladeDokumentVerlauf } from '../../services/platzbauerprojektabwicklungDokumentService';

interface PlatzbauerDokumentVerlaufProps {
  projektId: string;
  dokumentTyp: PlatzbauerDokumentTyp;
  titel?: string;
  maxAnzeige?: number;
  ladeZaehler?: number;
}

// Farben und Icons je nach Dokumenttyp
const dokumentTypConfig: Record<PlatzbauerDokumentTyp, {
  farbe: string;
  hintergrund: string;
  border: string;
  label: string;
}> = {
  angebot: {
    farbe: 'text-blue-700 dark:text-blue-400',
    hintergrund: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    label: 'Angebot'
  },
  auftragsbestaetigung: {
    farbe: 'text-orange-700 dark:text-orange-400',
    hintergrund: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    label: 'AB'
  },
  rechnung: {
    farbe: 'text-red-700 dark:text-red-400',
    hintergrund: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    label: 'Rechnung'
  },
  proformarechnung: {
    farbe: 'text-amber-700 dark:text-amber-400',
    hintergrund: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Proforma'
  },
};

const PlatzbauerDokumentVerlauf = ({
  projektId,
  dokumentTyp,
  titel,
  maxAnzeige = 3,
  ladeZaehler = 0
}: PlatzbauerDokumentVerlaufProps) => {
  const [verlauf, setVerlauf] = useState<PlatzbauerDokumentVerlaufEintrag[]>([]);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'fehler'>('laden');
  const [alleAnzeigen, setAlleAnzeigen] = useState(false);

  // Verlauf laden
  useEffect(() => {
    const ladeVerlaufDaten = async () => {
      if (!projektId) {
        console.log('📂 DokumentVerlauf: Keine projektId');
        setVerlauf([]);
        setLadeStatus('bereit');
        return;
      }

      try {
        setLadeStatus('laden');
        console.log('📂 Lade Dokumentverlauf:', { projektId, dokumentTyp });
        const daten = await ladeDokumentVerlauf(projektId, dokumentTyp);
        console.log('📂 Dokumentverlauf geladen:', daten.length, 'Dokumente', daten);
        setVerlauf(daten);
        setLadeStatus('bereit');
      } catch (error) {
        console.error('❌ Fehler beim Laden des Dokumentverlaufs:', error);
        setLadeStatus('fehler');
      }
    };

    ladeVerlaufDaten();
  }, [projektId, dokumentTyp, ladeZaehler]);

  const config = dokumentTypConfig[dokumentTyp];
  const anzeigeVerlauf = alleAnzeigen ? verlauf : verlauf.slice(0, maxAnzeige);
  const hatMehrEintraege = verlauf.length > maxAnzeige;

  // Formatierung
  const formatDatum = (datum: Date) => {
    return datum.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatBetrag = (betrag?: number) => {
    if (betrag === undefined || betrag === null) return null;
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(betrag);
  };

  // Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className={`${config.hintergrund} ${config.border} border rounded-lg p-4`}>
        <div className="flex items-center gap-2">
          <Loader2 className={`h-4 w-4 animate-spin ${config.farbe}`} />
          <span className="text-sm text-gray-600 dark:text-gray-400">Lade Dateiverlauf...</span>
        </div>
      </div>
    );
  }

  // Keine Dokumente
  if (verlauf.length === 0) {
    return (
      <div className={`${config.hintergrund} ${config.border} border rounded-lg p-4`}>
        <div className="flex items-center gap-2">
          <History className={`h-4 w-4 ${config.farbe} opacity-50`} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Noch keine {titel || dokumentTypConfig[dokumentTyp].label} erstellt
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${config.hintergrund} ${config.border} border rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className={`h-4 w-4 ${config.farbe}`} />
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {titel || `${dokumentTypConfig[dokumentTyp].label}-Verlauf`}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.hintergrund} ${config.farbe}`}>
              {verlauf.length}
            </span>
          </div>
        </div>
      </div>

      {/* Verlauf-Liste */}
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        {anzeigeVerlauf.map((eintrag) => (
          <div
            key={eintrag.id}
            className={`px-4 py-3 ${eintrag.istAktuell ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/50 dark:bg-slate-900/50'} hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors`}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Links: Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Dokumentnummer */}
                  <span className={`font-medium text-sm ${config.farbe}`}>
                    {eintrag.nummer}
                  </span>

                  {/* Version Badge */}
                  {eintrag.version && (
                    <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 rounded">
                      v{eintrag.version}
                    </span>
                  )}

                  {/* Status Badges */}
                  {eintrag.istAktuell && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Aktuell
                    </span>
                  )}

                  {eintrag.istFinal && dokumentTyp !== 'rechnung' && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                      Final
                    </span>
                  )}
                </div>

                {/* Datum, Menge und Betrag */}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDatum(eintrag.erstelltAm)}
                  </span>
                  {eintrag.gesamtMenge !== undefined && (
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                      {eintrag.gesamtMenge.toFixed(1)} t
                    </span>
                  )}
                  {eintrag.bruttobetrag !== undefined && (
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      {formatBetrag(eintrag.bruttobetrag)}
                    </span>
                  )}
                </div>
              </div>

              {/* Rechts: Aktionen */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={eintrag.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                  title="Ansehen"
                >
                  <Eye className="h-4 w-4" />
                </a>
                <a
                  href={eintrag.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                  title="Herunterladen"
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mehr anzeigen Button */}
      {hatMehrEintraege && (
        <button
          onClick={() => setAlleAnzeigen(!alleAnzeigen)}
          className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1 border-t border-gray-100 dark:border-slate-700"
        >
          {alleAnzeigen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {verlauf.length - maxAnzeige} weitere anzeigen
            </>
          )}
        </button>
      )}

      {/* Hinweis zur Aufbewahrung */}
      {verlauf.length > 0 && dokumentTyp === 'rechnung' && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Dokumente werden 10 Jahre aufbewahrt (GoBD)
          </p>
        </div>
      )}
    </div>
  );
};

export default PlatzbauerDokumentVerlauf;
