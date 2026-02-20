import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Droplets,
  Download,
  Calendar,
  Package,
  Building2,
  MapPin,
  FileSignature,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  List,
  TrendingUp,
  Truck,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { AuftragsbestaetigungsDaten, Position } from '../../types/projektabwicklung';
import { ladeDokumentNachTyp, ladeDokumentDaten } from '../../services/projektabwicklungDokumentService';

// Hydrocourt-Bestellung Interface
interface HydrocourtBestellung {
  projektId: string;
  projekt: Projekt;
  position: Position;
  lieferdatum?: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
}

// Props
interface HydrocourtViewProps {
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

// Gruppierungs-Typ
type GroupBy = 'none' | 'lieferdatum' | 'status';

const HydrocourtView = ({ projekteGruppiert, onProjektClick }: HydrocourtViewProps) => {
  const [bestellungen, setBestellungen] = useState<HydrocourtBestellung[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('lieferdatum');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['alle']));

  // Alle bestellten Projekte (Status >= auftragsbestaetigung)
  const bestellteProjekte = useMemo(() => {
    return [
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
    ];
  }, [projekteGruppiert]);

  // Lade Hydrocourt-Positionen aus den Dokumenten
  const ladeHydrocourtBestellungen = useCallback(async () => {
    setLoading(true);
    const alleBestellungen: HydrocourtBestellung[] = [];

    try {
      // Parallel alle Dokumente laden
      const dokumentPromises = bestellteProjekte.map(async (projekt) => {
        const projektId = (projekt as any).$id || projekt.id;

        // Lade Auftragsbestätigung (die enthält die bestellten Positionen)
        const abDokument = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');

        if (!abDokument) return [];

        // Parse die Daten
        const abDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(abDokument);

        if (!abDaten || !abDaten.positionen) return [];

        // Filtere nach TM-HYC Artikelnummer (exakt)
        const hydrocourtPositionen = abDaten.positionen.filter(
          (pos) => pos.artikelnummer === 'TM-HYC'
        );

        // Erstelle Bestellungen für jede Hydrocourt-Position
        return hydrocourtPositionen.map((position) => ({
          projektId,
          projekt,
          position,
          lieferdatum: abDaten.lieferdatum || projekt.geplantesDatum,
          lieferKW: abDaten.lieferKW || projekt.lieferKW,
          lieferKWJahr: abDaten.lieferKWJahr || projekt.lieferKWJahr,
          auftragsbestaetigungsnummer: abDaten.auftragsbestaetigungsnummer || projekt.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: abDaten.auftragsbestaetigungsdatum || projekt.auftragsbestaetigungsdatum,
        }));
      });

      const results = await Promise.all(dokumentPromises);
      results.forEach((projektBestellungen) => {
        alleBestellungen.push(...projektBestellungen);
      });

      // Nach Lieferdatum sortieren (früheste zuerst)
      alleBestellungen.sort((a, b) => {
        const dateA = a.lieferdatum ? new Date(a.lieferdatum).getTime() : Infinity;
        const dateB = b.lieferdatum ? new Date(b.lieferdatum).getTime() : Infinity;
        return dateA - dateB;
      });

      setBestellungen(alleBestellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Hydrocourt-Bestellungen:', error);
    } finally {
      setLoading(false);
    }
  }, [bestellteProjekte]);

  useEffect(() => {
    ladeHydrocourtBestellungen();
  }, [ladeHydrocourtBestellungen]);

  // Gruppierte Bestellungen
  const gruppierteDaten = useMemo(() => {
    if (groupBy === 'none') {
      return { 'Alle Bestellungen': bestellungen };
    }

    const gruppen: Record<string, HydrocourtBestellung[]> = {};

    bestellungen.forEach((bestellung) => {
      let key: string;

      if (groupBy === 'lieferdatum') {
        if (bestellung.lieferKW && bestellung.lieferKWJahr) {
          key = `KW ${bestellung.lieferKW} / ${bestellung.lieferKWJahr}`;
        } else if (bestellung.lieferdatum) {
          const date = new Date(bestellung.lieferdatum);
          key = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        } else {
          key = 'Ohne Lieferdatum';
        }
      } else if (groupBy === 'status') {
        const config = getStatusConfig(bestellung.projekt.status);
        key = config.label;
      } else {
        key = 'Alle';
      }

      if (!gruppen[key]) {
        gruppen[key] = [];
      }
      gruppen[key].push(bestellung);
    });

    return gruppen;
  }, [bestellungen, groupBy]);

  // Summen berechnen
  const summen = useMemo(() => {
    const gesamtMenge = bestellungen.reduce((sum, b) => sum + (b.position.menge || 0), 0);
    const gesamtWert = bestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);
    return { gesamtMenge, gesamtWert, anzahl: bestellungen.length };
  }, [bestellungen]);

  // CSV Export
  const exportCSV = useCallback(() => {
    const headers = [
      'AB-Nr.',
      'AB-Datum',
      'Kundenname',
      'PLZ/Ort',
      'Artikelnr.',
      'Bezeichnung',
      'Menge',
      'Einheit',
      'Einzelpreis',
      'Gesamtpreis',
      'Lieferdatum',
      'Liefer-KW',
      'Status',
    ];

    const rows = bestellungen.map((b) => [
      b.auftragsbestaetigungsnummer || '',
      b.auftragsbestaetigungsdatum
        ? new Date(b.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')
        : '',
      b.projekt.kundenname || '',
      b.projekt.kundenPlzOrt || '',
      b.position.artikelnummer || 'TM-HYC',
      b.position.bezeichnung || '',
      b.position.menge?.toString().replace('.', ',') || '',
      b.position.einheit || '',
      b.position.einzelpreis?.toFixed(2).replace('.', ',') || '',
      b.position.gesamtpreis?.toFixed(2).replace('.', ',') || '',
      b.lieferdatum ? new Date(b.lieferdatum).toLocaleDateString('de-DE') : '',
      b.lieferKW ? `KW ${b.lieferKW}${b.lieferKWJahr ? '/' + b.lieferKWJahr : ''}` : '',
      getStatusConfig(b.projekt.status).label,
    ]);

    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hydrocourt_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [bestellungen]);

  // Toggle Gruppe
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Hydrocourt-Bestellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card mit Summen */}
      <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-xl backdrop-blur-sm">
              <Droplets className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Hydrocourt Bestellungen</h2>
              <p className="text-cyan-100 mt-1">
                Artikel TM-HYC aus bestätigten Aufträgen
              </p>
            </div>
          </div>

          <button
            onClick={ladeHydrocourtBestellungen}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-cyan-100 text-sm mb-1">
              <Package className="w-4 h-4" />
              Positionen
            </div>
            <div className="text-3xl font-bold">{summen.anzahl}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-cyan-100 text-sm mb-1">
              <Layers className="w-4 h-4" />
              Gesamtmenge
            </div>
            <div className="text-3xl font-bold">
              {summen.gesamtMenge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} t
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-cyan-100 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Gesamtwert
            </div>
            <div className="text-3xl font-bold">
              {summen.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Gruppierung */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Gruppieren:</span>
          <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setGroupBy('lieferdatum')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'lieferdatum'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Lieferdatum
            </button>
            <button
              onClick={() => setGroupBy('status')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'status'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              Status
            </button>
            <button
              onClick={() => setGroupBy('none')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'none'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              Keine
            </button>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={exportCSV}
          disabled={bestellungen.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg"
        >
          <Download className="w-5 h-5" />
          CSV Export
        </button>
      </div>

      {/* Bestellungen Liste */}
      {bestellungen.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <Droplets className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Keine Hydrocourt-Bestellungen
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Es gibt aktuell keine bestätigten Aufträge mit dem Artikel TM-HYC.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(gruppierteDaten).map(([gruppenKey, gruppenBestellungen]) => {
            const isExpanded = expandedGroups.has(gruppenKey) || expandedGroups.has('alle');
            const gruppenMenge = gruppenBestellungen.reduce((sum, b) => sum + (b.position.menge || 0), 0);
            const gruppenWert = gruppenBestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);

            return (
              <div
                key={gruppenKey}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Gruppen-Header */}
                <button
                  onClick={() => toggleGroup(gruppenKey)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">{gruppenKey}</span>
                    <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 text-sm rounded-full">
                      {gruppenBestellungen.length} Position{gruppenBestellungen.length !== 1 ? 'en' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">
                      {gruppenMenge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} t
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {gruppenWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                </button>

                {/* Bestellungen Tabelle */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">AB-Nr.</th>
                          <th className="px-4 py-3 text-left font-semibold">Kunde</th>
                          <th className="px-4 py-3 text-left font-semibold">Lieferadresse</th>
                          <th className="px-4 py-3 text-left font-semibold">Lieferdatum</th>
                          <th className="px-4 py-3 text-right font-semibold">Menge</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {gruppenBestellungen.map((bestellung, idx) => {
                          const statusConfig = getStatusConfig(bestellung.projekt.status);
                          const StatusIcon = statusConfig.icon;

                          return (
                            <tr
                              key={`${bestellung.projektId}-${idx}`}
                              onClick={() => onProjektClick(bestellung.projekt)}
                              className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                                  {bestellung.auftragsbestaetigungsnummer || '-'}
                                </span>
                                {bestellung.auftragsbestaetigungsdatum && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {new Date(bestellung.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {bestellung.projekt.kundenname}
                                  </span>
                                </div>
                                {bestellung.projekt.kundennummer && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">
                                    Nr. {bestellung.projekt.kundennummer}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-1.5 text-gray-600 dark:text-gray-400">
                                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
                                  <div>
                                    {bestellung.projekt.kundenstrasse && (
                                      <div className="text-sm">{bestellung.projekt.kundenstrasse}</div>
                                    )}
                                    <div className="text-sm">{bestellung.projekt.kundenPlzOrt}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {bestellung.lieferKW ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-cyan-500" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      KW {bestellung.lieferKW}
                                      {bestellung.lieferKWJahr && (
                                        <span className="text-gray-500">/{bestellung.lieferKWJahr}</span>
                                      )}
                                    </span>
                                  </div>
                                ) : bestellung.lieferdatum ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-cyan-500" />
                                    <span className="text-gray-900 dark:text-white">
                                      {new Date(bestellung.lieferdatum).toLocaleDateString('de-DE')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Package className="w-4 h-4 text-cyan-500" />
                                  <span className="font-bold text-lg text-gray-900 dark:text-white">
                                    {bestellung.position.menge?.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                                    {bestellung.position.einheit || 't'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
                                >
                                  <StatusIcon className="w-3.5 h-3.5" />
                                  {statusConfig.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HydrocourtView;
