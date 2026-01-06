import { useState, useEffect } from 'react';
import {
  Download,
  Eye,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
  Ban
} from 'lucide-react';
import { DokumentVerlaufEintrag, DokumentTyp } from '../../types/bestellabwicklung';
import { ladeDokumentVerlauf } from '../../services/bestellabwicklungDokumentService';

interface DokumentVerlaufProps {
  projektId: string;
  dokumentTyp: DokumentTyp;
  titel?: string;
  maxAnzeige?: number; // Wie viele Einträge initial anzeigen
  onNeuladen?: () => void; // Callback wenn neu geladen werden soll
  ladeZaehler?: number; // Trigger für Neuladen
}

// Farben und Icons je nach Dokumenttyp
const dokumentTypConfig: Record<DokumentTyp, { 
  farbe: string; 
  hintergrund: string; 
  border: string;
  label: string;
}> = {
  angebot: {
    farbe: 'text-blue-700',
    hintergrund: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Angebot'
  },
  auftragsbestaetigung: {
    farbe: 'text-orange-700',
    hintergrund: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'AB'
  },
  lieferschein: {
    farbe: 'text-green-700',
    hintergrund: 'bg-green-50',
    border: 'border-green-200',
    label: 'Lieferschein'
  },
  rechnung: {
    farbe: 'text-red-700',
    hintergrund: 'bg-red-50',
    border: 'border-red-200',
    label: 'Rechnung'
  },
  stornorechnung: {
    farbe: 'text-purple-700',
    hintergrund: 'bg-purple-50',
    border: 'border-purple-200',
    label: 'Storno'
  }
};

const DokumentVerlauf = ({
  projektId,
  dokumentTyp,
  titel,
  maxAnzeige = 3,
  ladeZaehler = 0
}: DokumentVerlaufProps) => {
  const [verlauf, setVerlauf] = useState<DokumentVerlaufEintrag[]>([]);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'fehler'>('laden');
  const [alleAnzeigen, setAlleAnzeigen] = useState(false);
  
  // Verlauf laden
  useEffect(() => {
    const ladeVerlauf = async () => {
      console.log(`🔄 DokumentVerlauf: useEffect ausgelöst für ${dokumentTyp}, ladeZaehler=${ladeZaehler}, projektId=${projektId}`);
      if (!projektId) {
        console.log(`⚠️ Keine projektId - Verlauf wird nicht geladen`);
        setVerlauf([]);
        setLadeStatus('bereit');
        return;
      }

      try {
        setLadeStatus('laden');
        console.log(`📥 Lade Verlauf für Projekt ${projektId}, Typ: ${dokumentTyp}...`);
        const daten = await ladeDokumentVerlauf(projektId, dokumentTyp);
        console.log(`📄 Verlauf geladen: ${daten.length} Einträge`, daten);
        setVerlauf(daten);
        setLadeStatus('bereit');
      } catch (error) {
        console.error('❌ Fehler beim Laden des Dokumentverlaufs:', error);
        setLadeStatus('fehler');
      }
    };

    ladeVerlauf();
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
          <span className="text-sm text-gray-600 dark:text-dark-textMuted">Lade Dateiverlauf...</span>
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
          <span className="text-sm text-gray-500 dark:text-dark-textMuted">
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
            <span className="text-sm font-semibold text-gray-800 dark:text-dark-text">
              {titel || `${dokumentTypConfig[dokumentTyp].label}-Verlauf`}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.hintergrund} ${config.farbe}`}>
              {verlauf.length}
            </span>
          </div>
        </div>
      </div>
      
      {/* Verlauf-Liste */}
      <div className="divide-y divide-gray-100">
        {anzeigeVerlauf.map((eintrag) => (
          <div
            key={eintrag.id}
            className={`px-4 py-3 ${eintrag.istAktuell ? 'bg-white' : 'bg-gray-50/50'} hover:bg-white/80 transition-colors`}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Links: Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Dokumentnummer */}
                  <span className={`font-medium text-sm ${config.farbe}`}>
                    {eintrag.nummer}
                  </span>
                  
                  {/* Version Badge (für Angebote/AB/LS) */}
                  {eintrag.version && (
                    <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 dark:text-dark-textMuted rounded">
                      v{eintrag.version}
                    </span>
                  )}
                  
                  {/* Status Badges */}
                  {eintrag.istAktuell && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Aktuell
                    </span>
                  )}
                  
                  {eintrag.istStorniert && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Storniert
                    </span>
                  )}
                  
                  {eintrag.typ === 'stornorechnung' && (
                    <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Stornorechnung
                    </span>
                  )}
                  
                  {eintrag.istFinal && dokumentTyp !== 'rechnung' && dokumentTyp !== 'stornorechnung' && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                      Final
                    </span>
                  )}
                </div>
                
                {/* Datum und Betrag */}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-dark-textMuted">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDatum(eintrag.erstelltAm)}
                  </span>
                  {eintrag.bruttobetrag !== undefined && (
                    <span className={`font-medium ${eintrag.bruttobetrag < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {formatBetrag(eintrag.bruttobetrag)}
                    </span>
                  )}
                </div>
                
                {/* Stornogrund */}
                {eintrag.stornoGrund && (
                  <div className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{eintrag.stornoGrund}</span>
                  </div>
                )}
              </div>
              
              {/* Rechts: Aktionen */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={eintrag.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-500 dark:text-dark-textMuted hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Ansehen"
                >
                  <Eye className="h-4 w-4" />
                </a>
                <a
                  href={eintrag.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-500 dark:text-dark-textMuted hover:text-green-600 hover:bg-green-50 rounded transition-colors"
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
          className="w-full px-4 py-2 text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:text-dark-text hover:bg-white dark:bg-slate-900/50 transition-colors flex items-center justify-center gap-1 border-t border-gray-100"
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
      {verlauf.length > 0 && (dokumentTyp === 'rechnung' || dokumentTyp === 'stornorechnung') && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-700">
          <p className="text-xs text-gray-500 dark:text-dark-textMuted flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Dokumente werden 10 Jahre aufbewahrt (GoBD)
          </p>
        </div>
      )}
    </div>
  );
};

export default DokumentVerlauf;
