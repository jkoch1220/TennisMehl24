import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  FileSpreadsheet,
  Building2,
  Package,
  RefreshCw,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { AuftragsbestaetigungsDaten } from '../../types/projektabwicklung';
import { ladeDokumentNachTyp, ladeDokumentDaten } from '../../services/projektabwicklungDokumentService';
import * as XLSX from 'xlsx';

// Props
interface ExportsViewProps {
  projekteGruppiert: {
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  };
  onProjektClick: (projekt: Projekt) => void;
}

// Status Badge Helper
const getStatusConfig = (status: ProjektStatus) => {
  const configs: Record<ProjektStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
    angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: FileSignature },
    angebot_versendet: { label: 'Versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300', icon: FileSignature },
    auftragsbestaetigung: { label: 'AB', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', icon: FileSignature },
    lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: Truck },
    rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: FileText },
    bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300', icon: CheckCircle2 },
    verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: FileSignature },
  };
  return configs[status];
};

// AB-Daten Interface für Export
interface ABExportDaten {
  projektId: string;
  projekt: Projekt;
  abDaten: AuftragsbestaetigungsDaten;
}

const ExportsView = ({ projekteGruppiert, onProjektClick }: ExportsViewProps) => {
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Alle Projekte mit AB (Status >= auftragsbestaetigung)
  const projekteAb = useMemo(() => {
    return [
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
    ];
  }, [projekteGruppiert]);

  // KPIs berechnen
  const kpis = useMemo(() => {
    return {
      anzahlABs: projekteAb.length,
      nachStatus: {
        auftragsbestaetigung: projekteGruppiert.auftragsbestaetigung.length,
        lieferschein: projekteGruppiert.lieferschein.length,
        rechnung: projekteGruppiert.rechnung.length,
        bezahlt: projekteGruppiert.bezahlt.length,
      }
    };
  }, [projekteAb, projekteGruppiert]);

  // Excel Export aller ABs
  const exportAlleABs = useCallback(async () => {
    setLoading(true);
    setExportProgress('Lade Auftragsbestätigungen...');

    try {
      const abDatenListe: ABExportDaten[] = [];

      // Alle AB-Dokumente laden
      for (let i = 0; i < projekteAb.length; i++) {
        const projekt = projekteAb[i];
        const projektId = (projekt as any).$id || projekt.id;
        setExportProgress(`Lade AB ${i + 1} von ${projekteAb.length}...`);

        try {
          // Zuerst Dokument-Referenz laden
          const dokument = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');
          if (dokument) {
            // Dann vollständige Daten laden
            const abDaten = await ladeDokumentDaten<AuftragsbestaetigungsDaten>(dokument);
            if (abDaten) {
              abDatenListe.push({ projektId, projekt, abDaten });
            }
          }
        } catch (err) {
          console.warn(`Konnte AB für Projekt ${projektId} nicht laden:`, err);
        }
      }

      setExportProgress('Erstelle Excel-Datei...');

      // Excel-Daten vorbereiten
      const excelData = abDatenListe.map((item) => {
        const { projekt, abDaten } = item;

        // Summen berechnen
        const positionen = abDaten.positionen || [];
        const nettosumme = positionen
          .filter(p => !p.istBedarfsposition)
          .reduce((sum, p) => sum + (p.gesamtpreis || 0), 0);
        const mwst = nettosumme * 0.19;
        const bruttosumme = nettosumme + mwst;

        // Ziegelmehl-Menge berechnen (Position mit "Ziegelmehl" oder "TM-" im Namen)
        const ziegelmehlMenge = positionen
          .filter(p => !p.istBedarfsposition &&
            (p.bezeichnung?.toLowerCase().includes('ziegelmehl') ||
             p.artikelnummer?.startsWith('TM-')))
          .reduce((sum, p) => sum + (p.menge || 0), 0);

        // Lieferdatum formatieren
        let liefertermin = '';
        if (abDaten.lieferdatum) {
          liefertermin = new Date(abDaten.lieferdatum).toLocaleDateString('de-DE');
        } else if (abDaten.lieferKW && abDaten.lieferKWJahr) {
          liefertermin = `KW ${abDaten.lieferKW}/${abDaten.lieferKWJahr}`;
        }

        return {
          'AB-Nr.': abDaten.auftragsbestaetigungsnummer || '',
          'AB-Datum': abDaten.auftragsbestaetigungsdatum
            ? new Date(abDaten.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')
            : '',
          'Kundenname': projekt.kundenname || '',
          'Kundennummer': projekt.kundennummer || '',
          'PLZ': projekt.kundenPlzOrt?.match(/^(\d{5})/)?.[1] || '',
          'Ort': projekt.kundenPlzOrt?.replace(/^\d{5}\s*/, '') || '',
          'Straße': projekt.kundenstrasse || '',
          'Liefertermin': liefertermin,
          'Belieferungsart': abDaten.belieferungsart || '',
          'Ziegelmehl (t)': ziegelmehlMenge || '',
          'Netto (€)': Math.round(nettosumme * 100) / 100,
          'MwSt (€)': Math.round(mwst * 100) / 100,
          'Brutto (€)': Math.round(bruttosumme * 100) / 100,
          'Status': getStatusConfig(projekt.status)?.label || projekt.status,
          'Ansprechpartner': abDaten.ansprechpartner || projekt.ansprechpartner || '',
          'Telefon': abDaten.dispoAnsprechpartner?.telefon || '',
        };
      });

      // Nach AB-Nummer sortieren (neueste zuerst)
      excelData.sort((a, b) => {
        const numA = a['AB-Nr.'];
        const numB = b['AB-Nr.'];
        return numB.localeCompare(numA);
      });

      // Excel-Workbook erstellen
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Spaltenbreiten anpassen
      ws['!cols'] = [
        { wch: 12 },  // AB-Nr.
        { wch: 12 },  // AB-Datum
        { wch: 35 },  // Kundenname
        { wch: 12 },  // Kundennummer
        { wch: 8 },   // PLZ
        { wch: 20 },  // Ort
        { wch: 25 },  // Straße
        { wch: 15 },  // Liefertermin
        { wch: 15 },  // Belieferungsart
        { wch: 12 },  // Ziegelmehl
        { wch: 12 },  // Netto
        { wch: 10 },  // MwSt
        { wch: 12 },  // Brutto
        { wch: 12 },  // Status
        { wch: 20 },  // Ansprechpartner
        { wch: 15 },  // Telefon
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Auftragsbestätigungen');

      // Download
      const heute = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `ABs_Export_${heute}.xlsx`);

      setExportProgress(null);
    } catch (error) {
      console.error('Fehler beim Export:', error);
      alert('Fehler beim Export. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
      setExportProgress(null);
    }
  }, [projekteAb]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
              <FileSpreadsheet className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Daten-Exports</h2>
              <p className="text-gray-600 dark:text-gray-400">Excel-Exporte für Auftragsbestätigungen und mehr</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-1">
              <FileSignature className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">AB</span>
            </div>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
              {kpis.nachStatus.auftragsbestaetigung}
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Lieferung</span>
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">
              {kpis.nachStatus.lieferschein}
            </div>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-xs text-red-600 dark:text-red-400 font-medium">Rechnung</span>
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">
              {kpis.nachStatus.rechnung}
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Bezahlt</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {kpis.nachStatus.bezahlt}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Gesamt</span>
            </div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {kpis.anzahlABs}
            </div>
          </div>
        </div>
      </div>

      {/* Export-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* AB Export Karte */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-950/50 rounded-lg">
              <FileSignature className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Alle Auftragsbestätigungen
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Exportiert alle ABs mit Kundendaten, Lieferterminen und Summen als Excel-Datei.
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                <span className="font-medium">{kpis.anzahlABs}</span> Auftragsbestätigungen
              </div>
              <button
                onClick={exportAlleABs}
                disabled={loading || kpis.anzahlABs === 0}
                className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {exportProgress || 'Exportiere...'}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Excel exportieren
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Weitere Export-Möglichkeiten können hier hinzugefügt werden */}
        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 p-6 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="font-medium">Weitere Exports</p>
            <p className="text-sm">Demnächst verfügbar</p>
          </div>
        </div>
      </div>

      {/* Tabelle mit allen ABs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            Übersicht aller Auftragsbestätigungen
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">AB-Nr.</th>
                <th className="px-4 py-3 text-left font-semibold">Kunde</th>
                <th className="px-4 py-3 text-left font-semibold">PLZ / Ort</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Menge (t)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {projekteAb.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Keine Auftragsbestätigungen vorhanden
                  </td>
                </tr>
              ) : (
                projekteAb
                  .sort((a, b) => (b.auftragsbestaetigungsnummer || '').localeCompare(a.auftragsbestaetigungsnummer || ''))
                  .map((projekt) => {
                    const statusConfig = getStatusConfig(projekt.status);
                    return (
                      <tr
                        key={(projekt as any).$id || projekt.id}
                        onClick={() => onProjektClick(projekt)}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                            {projekt.auftragsbestaetigungsnummer || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {projekt.kundenname}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {projekt.kundenPlzOrt}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusConfig?.color}`}>
                            {statusConfig?.label || projekt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {projekt.angefragteMenge ? `${projekt.angefragteMenge}` : '-'}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExportsView;
