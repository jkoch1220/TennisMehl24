import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Phone, Users, Building2, TrendingUp, CheckCircle2, Clock, Filter, Search, X, FileX } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  SaisonplanungStatistik,
  GespraechsStatus,
  KundenTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { projektService } from '../../services/projektService';
import { fuzzySearch } from '../../utils/fuzzySearch';
import KundenFormular from './KundenFormular';
import KundenDetail from './KundenDetail';
import BeziehungsUebersicht from './BeziehungsUebersicht.tsx';

const Saisonplanung = () => {
  const navigate = useNavigate();
  const [kunden, setKunden] = useState<SaisonKundeMitDaten[]>([]);
  const [statistik, setStatistik] = useState<SaisonplanungStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [showBeziehungen, setShowBeziehungen] = useState(false);
  const [selectedKunde, setSelectedKunde] = useState<SaisonKundeMitDaten | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [saisonjahr] = useState(2026); // Aktuelle Saison
  const [searchText, setSearchText] = useState('');

  // Filter-States
  const [filterOhneProjekt, setFilterOhneProjekt] = useState(false);
  const [filterKundenTyp, setFilterKundenTyp] = useState<KundenTyp | ''>('');
  const [filterPlatzbauer, setFilterPlatzbauer] = useState<string>(''); // Platzbauer-ID
  const [kundenMitProjekt, setKundenMitProjekt] = useState<Set<string>>(new Set());

  // Projekte laden um zu prüfen welche Kunden bereits ein Projekt haben
  const ladeProjekte = useCallback(async () => {
    try {
      const projekte = await projektService.getAllProjekte(saisonjahr);
      // Sammle sowohl kundeId als auch kundennummer für den Abgleich
      const kundenIds = new Set<string>();
      projekte.forEach((p) => {
        if (p.kundeId) kundenIds.add(p.kundeId);
        if (p.kundennummer) kundenIds.add(p.kundennummer);
      });
      setKundenMitProjekt(kundenIds);
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
    }
  }, [saisonjahr]);

  // OPTIMIERT: useCallback verhindert unnötige Re-Renders
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // OPTIMIERT: Eine kombinierte Abfrage statt zwei separate
      // Reduziert von ~1.200 Queries auf nur ~4 Queries!
      const { callListe, statistik: statistikData } =
        await saisonplanungService.loadSaisonplanungDashboard({}, saisonjahr);

      setKunden(callListe);
      setStatistik(statistikData);

      // Projekte laden für Filter
      await ladeProjekte();
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr, ladeProjekte]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = () => {
    setShowFormular(false);
    setSelectedKunde(null);
    loadData();
  };

  const handleEdit = (kunde: SaisonKundeMitDaten) => {
    setSelectedKunde(kunde);
    setShowFormular(true);
    setShowDetail(false);
  };

  const handleOpenDetail = (kunde: SaisonKundeMitDaten) => {
    setSelectedKunde(kunde);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedKunde(null);
  };

  // OPTIMIERT: useCallback für stabile Funktion-Referenz
  const handleDetailUpdate = useCallback(async () => {
    if (selectedKunde) {
      const updated = await saisonplanungService.loadKundeMitDaten(
        selectedKunde.kunde.id,
        saisonjahr
      );
      if (updated) {
        setSelectedKunde(updated);
      }
    }
    loadData();
  }, [selectedKunde, saisonjahr, loadData]);

  const handleNeueSaison = async () => {
    try {
      await saisonplanungService.erstelleNeueSaison(saisonjahr);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Anlegen der neuen Saison:', error);
      alert('Neue Saison konnte nicht angelegt werden.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Kunden wirklich löschen?')) return;
    try {
      await saisonplanungService.deleteKunde(id);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Kunden');
    }
  };

  // Prüft ob ein Kunde bereits ein Projekt hat
  const hatProjekt = (kunde: SaisonKundeMitDaten): boolean => {
    return (
      kundenMitProjekt.has(kunde.kunde.id) ||
      (kunde.kunde.kundennummer ? kundenMitProjekt.has(kunde.kunde.kundennummer) : false)
    );
  };

  // ULTIMATE FUZZY SEARCH - Die beste Suche der Welt
  // Features: Tippfehler-tolerant, Wort-basiert, Präfix-Matching, Ähnlichkeitssuche
  const filteredKunden = useMemo(() => {
    // Erst die Standard-Filter anwenden (ohne Textsuche)
    let vorgefilterteKunden = kunden.filter((kunde) => {
      // Filter: Nur Kunden ohne Projekt
      if (filterOhneProjekt && hatProjekt(kunde)) {
        return false;
      }

      // Filter: Nach Kundentyp
      if (filterKundenTyp && kunde.kunde.typ !== filterKundenTyp) {
        return false;
      }

      // Filter: Nach Platzbauer
      if (filterPlatzbauer) {
        const platzbauerId = kunde.aktuelleSaison?.platzbauerId || kunde.kunde.standardPlatzbauerId;
        if (platzbauerId !== filterPlatzbauer) {
          return false;
        }
      }

      return true;
    });

    // Wenn keine Textsuche, gib die vorgefilterten Kunden zurück
    if (!searchText.trim()) {
      return vorgefilterteKunden;
    }

    // FUZZY SEARCH mit allen relevanten Feldern
    const searchResults = fuzzySearch<SaisonKundeMitDaten>(
      vorgefilterteKunden,
      searchText,
      (kunde) => [
        // Name hat höchstes Gewicht
        { field: 'name', value: kunde.kunde.name, weight: 2.0 },
        // Ort ist wichtig
        { field: 'ort', value: kunde.kunde.lieferadresse.ort, weight: 1.5 },
        // PLZ
        { field: 'plz', value: kunde.kunde.lieferadresse.plz, weight: 1.2 },
        // Bundesland
        { field: 'bundesland', value: kunde.kunde.lieferadresse.bundesland || '', weight: 1.0 },
        // Straße
        { field: 'strasse', value: kunde.kunde.lieferadresse.strasse || '', weight: 0.8 },
        // Kundennummer - hohe Gewichtung für exakte Suche!
        { field: 'kundennummer', value: kunde.kunde.kundennummer || '', weight: 3.0 },
        // E-Mail
        { field: 'email', value: kunde.kunde.email || '', weight: 0.8 },
        // Ansprechpartner Namen
        ...kunde.ansprechpartner.map((ap, i) => ({
          field: `ansprechpartner_${i}`,
          value: ap.name,
          weight: 0.7,
        })),
        // Ansprechpartner E-Mails
        ...kunde.ansprechpartner.filter(ap => ap.email).map((ap, i) => ({
          field: `ansprechpartner_email_${i}`,
          value: ap.email || '',
          weight: 0.5,
        })),
      ],
      {
        minScore: 0.25,       // Niedrig genug für fuzzy matches
        fuzzyThreshold: 0.6,  // Tolerant für Tippfehler
        maxResults: 500,      // Genug für alle Kunden
        matchAll: true,       // Alle Suchwörter müssen matchen
      }
    );

    // Gib die sortierten Ergebnisse zurück (beste Matches zuerst)
    return searchResults.map(r => r.item);
  }, [kunden, searchText, filterOhneProjekt, filterKundenTyp, filterPlatzbauer, kundenMitProjekt]);

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Kundenliste {saisonjahr}</h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">Verwaltung der Kundenliste und Telefonaktion</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
            <button
              onClick={handleNeueSaison}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Clock className="w-5 h-5" />
              Neue Saison anlegen
            </button>
            <button
              onClick={() => setShowBeziehungen(true)}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Users className="w-5 h-5" />
              Beziehungen
            </button>
            <button
              onClick={() => navigate('/call-liste')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Call-Liste
            </button>
            <button
              onClick={() => {
                setSelectedKunde(null);
                setShowFormular(true);
              }}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neuer Kunde
            </button>
          </div>
        </div>

        {/* Statistik-Karten */}
        {statistik && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatistikKarte
              title="Gesamt Kunden"
              value={statistik.gesamtKunden.toString()}
              subtitle={`${statistik.nachTyp.verein} Vereine, ${statistik.nachTyp.platzbauer} Platzbauer`}
              icon={Users}
              color="blue"
            />
            <StatistikKarte
              title="Offen"
              value={statistik.offeneKunden.toString()}
              subtitle="Noch zu bearbeiten"
              icon={Clock}
              color="yellow"
            />
            <StatistikKarte
              title="Erledigt"
              value={statistik.erledigteKunden.toString()}
              subtitle="Bereits kontaktiert"
              icon={CheckCircle2}
              color="green"
            />
            <StatistikKarte
              title="Angefragte Menge"
              value={`${statistik.gesamtAngefragteMenge.toFixed(1)} t`}
              subtitle="Gesamt angefragt"
              icon={TrendingUp}
              color="orange"
            />
            <StatistikKarte
              title="Bezugsweg Direkt"
              value={statistik.nachBezugsweg.direkt.toString()}
              subtitle="Direkt beliefert"
              icon={Building2}
              color="blue"
            />
            <StatistikKarte
              title="Direkt Instandsetzung"
              value={statistik.nachBezugsweg.direkt_instandsetzung.toString()}
              subtitle="Direkt FIS"
              icon={Building2}
              color="green"
            />
            <StatistikKarte
              title="Über Platzbauer"
              value={statistik.nachBezugsweg.ueber_platzbauer.toString()}
              subtitle="Über Partner"
              icon={Filter}
              color="yellow"
            />
          </div>
        )}

        {/* Kundenliste */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl dark:shadow-2xl border border-gray-200/50 dark:border-slate-700/50">
          {/* Header mit Glassmorphism */}
          <div className="border-b border-gray-200/50 dark:border-slate-700/50 p-6 pb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Kundenliste</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                  {filteredKunden.length === kunden.length
                    ? `${kunden.length} Kunden`
                    : `${filteredKunden.length} von ${kunden.length} Kunden`}
                </p>
              </div>
              {(filterOhneProjekt || filterKundenTyp || filterPlatzbauer || searchText) && (
                <button
                  onClick={() => {
                    setFilterKundenTyp('');
                    setFilterPlatzbauer('');
                    setFilterOhneProjekt(false);
                    setSearchText('');
                  }}
                  className="text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
                >
                  Alle Filter zurücksetzen
                </button>
              )}
            </div>

            {/* Suchfeld - Apple Style */}
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Name, PLZ, Kundennummer..."
                className="w-full pl-12 pr-12 py-3 bg-gray-100/80 dark:bg-slate-700/50 border-0 rounded-xl text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white dark:focus:bg-slate-700 transition-all duration-200"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 bg-gray-400 dark:bg-slate-500 rounded-full flex items-center justify-center hover:bg-gray-500 dark:hover:bg-slate-400 transition-colors duration-200"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>

            {/* Filter Section */}
            <div className="space-y-4">
              {/* Kundentyp - Segmented Control */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 min-w-[80px]">Typ</span>
                <div className="inline-flex p-1 bg-gray-100 dark:bg-slate-700/50 rounded-xl">
                  {[
                    { value: '', label: 'Alle' },
                    { value: 'verein', label: 'Vereine' },
                    { value: 'platzbauer', label: 'Platzbauer' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFilterKundenTyp(option.value as KundenTyp | '')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                        filterKundenTyp === option.value
                          ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm'
                          : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platzbauer - Elegantes Dropdown */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 min-w-[80px]">Platzbauer</span>
                <div className="relative">
                  <select
                    value={filterPlatzbauer}
                    onChange={(e) => setFilterPlatzbauer(e.target.value)}
                    className={`appearance-none pl-4 pr-10 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/50 ${
                      filterPlatzbauer
                        ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-2 border-red-200 dark:border-red-800'
                        : 'bg-gray-100 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <option value="">Alle Platzbauer</option>
                    {kunden
                      .filter((k) => k.kunde.typ === 'platzbauer')
                      .sort((a, b) => a.kunde.name.localeCompare(b.kunde.name))
                      .map((pb) => (
                        <option key={pb.kunde.id} value={pb.kunde.id}>
                          {pb.kunde.name}
                        </option>
                      ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className={`w-4 h-4 ${filterPlatzbauer ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {filterPlatzbauer && (
                  <button
                    onClick={() => setFilterPlatzbauer('')}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors duration-200"
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>

              {/* Ohne Projekt - Toggle Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 min-w-[80px]">Status</span>
                <label className="inline-flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={filterOhneProjekt}
                      onChange={(e) => setFilterOhneProjekt(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full transition-all duration-300 ${
                      filterOhneProjekt
                        ? 'bg-gradient-to-r from-orange-400 to-orange-500'
                        : 'bg-gray-200 dark:bg-slate-600'
                    }`}></div>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                      filterOhneProjekt ? 'translate-x-5' : 'translate-x-0'
                    }`}></div>
                  </div>
                  <span className={`text-sm font-medium transition-colors duration-200 ${
                    filterOhneProjekt
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-slate-200'
                  }`}>
                    Nur ohne Projekt
                  </span>
                </label>
              </div>
            </div>

            {/* Aktive Filter Pills */}
            {(filterOhneProjekt || filterKundenTyp || filterPlatzbauer) && (
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-200/50 dark:border-slate-700/50 flex-wrap">
                <span className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aktiv:</span>
                {filterKundenTyp && (
                  <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium shadow-sm">
                    {filterKundenTyp === 'verein' ? 'Vereine' : 'Platzbauer'}
                    <button
                      onClick={() => setFilterKundenTyp('')}
                      className="w-5 h-5 rounded-full bg-blue-200/50 dark:bg-blue-700/50 hover:bg-blue-300 dark:hover:bg-blue-600 flex items-center justify-center transition-colors duration-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterPlatzbauer && (
                  <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/40 dark:to-red-800/40 text-red-700 dark:text-red-300 rounded-full text-sm font-medium shadow-sm">
                    <Users className="w-3.5 h-3.5" />
                    {kunden.find((k) => k.kunde.id === filterPlatzbauer)?.kunde.name || 'Unbekannt'}
                    <button
                      onClick={() => setFilterPlatzbauer('')}
                      className="w-5 h-5 rounded-full bg-red-200/50 dark:bg-red-700/50 hover:bg-red-300 dark:hover:bg-red-600 flex items-center justify-center transition-colors duration-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterOhneProjekt && (
                  <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/40 dark:to-orange-800/40 text-orange-700 dark:text-orange-300 rounded-full text-sm font-medium shadow-sm">
                    <FileX className="w-3.5 h-3.5" />
                    Ohne Projekt
                    <button
                      onClick={() => setFilterOhneProjekt(false)}
                      className="w-5 h-5 rounded-full bg-orange-200/50 dark:bg-orange-700/50 hover:bg-orange-300 dark:hover:bg-orange-600 flex items-center justify-center transition-colors duration-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-6">
            {kunden.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 rounded-2xl flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-gray-400 dark:text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">Keine Kunden vorhanden</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Erstellen Sie den ersten Kunden, um mit der Planung zu beginnen.
                </p>
              </div>
            ) : filteredKunden.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 rounded-2xl flex items-center justify-center">
                  <Search className="w-8 h-8 text-gray-400 dark:text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">Keine Ergebnisse</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Keine Kunden entsprechen den aktuellen Filterkriterien.
                </p>
                <button
                  onClick={() => {
                    setFilterKundenTyp('');
                    setFilterPlatzbauer('');
                    setFilterOhneProjekt(false);
                    setSearchText('');
                  }}
                  className="mt-4 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                >
                  Filter zurücksetzen
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredKunden.map((kunde) => (
                  <KundenKarte
                    key={kunde.kunde.id}
                    kunde={kunde}
                    onEdit={() => handleEdit(kunde)}
                    onDelete={() => handleDelete(kunde.kunde.id)}
                    onOpenDetail={() => handleOpenDetail(kunde)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Formular Modal */}
        {showFormular && (
          <KundenFormular
            kunde={selectedKunde}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedKunde(null);
            }}
          />
        )}

        {/* Beziehungsübersicht Modal */}
        {showBeziehungen && (
          <BeziehungsUebersicht
            kunden={kunden}
            onClose={() => setShowBeziehungen(false)}
            onUpdate={loadData}
          />
        )}

        {/* Detail Modal */}
        {showDetail && selectedKunde && (
          <KundenDetail
            kunde={selectedKunde}
            onClose={handleCloseDetail}
            onEdit={() => handleEdit(selectedKunde)}
            onUpdate={handleDetailUpdate}
          />
        )}
      </div>
    </div>
  );
};

// Statistik-Karte Komponente
interface StatistikKarteProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'yellow' | 'red' | 'orange' | 'green';
}

const StatistikKarte = ({ title, value, subtitle, icon: Icon, color }: StatistikKarteProps) => {
  const colorConfig = {
    blue: { bg: 'bg-blue-500', gradient: 'from-blue-400 to-blue-600', light: 'bg-blue-50 dark:bg-blue-900/20' },
    yellow: { bg: 'bg-amber-500', gradient: 'from-amber-400 to-amber-600', light: 'bg-amber-50 dark:bg-amber-900/20' },
    red: { bg: 'bg-red-500', gradient: 'from-red-400 to-red-600', light: 'bg-red-50 dark:bg-red-900/20' },
    orange: { bg: 'bg-orange-500', gradient: 'from-orange-400 to-orange-600', light: 'bg-orange-50 dark:bg-orange-900/20' },
    green: { bg: 'bg-emerald-500', gradient: 'from-emerald-400 to-emerald-600', light: 'bg-emerald-50 dark:bg-emerald-900/20' },
  };

  const colors = colorConfig[color];

  return (
    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-slate-700/50 p-5 transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">{value}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{subtitle}</p>
        </div>
        <div className={`${colors.light} rounded-xl p-2.5 group-hover:scale-110 transition-transform duration-300`}>
          <div className={`bg-gradient-to-br ${colors.gradient} rounded-lg p-2`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Kunden-Karte Komponente
interface KundenKarteProps {
  kunde: SaisonKundeMitDaten;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}

const KundenKarte = ({ kunde, onEdit, onDelete, onOpenDetail }: KundenKarteProps) => {
  const statusConfig: Record<GespraechsStatus, { bg: string; text: string; dot: string }> = {
    offen: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
    in_bearbeitung: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-400' },
    erledigt: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
  };

  const status = kunde.aktuelleSaison?.gespraechsstatus || 'offen';
  const angefragteMenge = kunde.aktuelleSaison?.angefragteMenge;
  const preis = kunde.kunde.zuletztGezahlterPreis || kunde.aktuelleSaison?.preisProTonne;
  const statusStyle = statusConfig[status];

  return (
    <div
      className="group bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl p-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 hover:border-gray-200 dark:hover:border-slate-600 transition-all duration-200 cursor-pointer"
      onClick={onOpenDetail}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 truncate">{kunde.kunde.name}</h3>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${
                kunde.kunde.typ === 'platzbauer'
                  ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-slate-400'
              }`}>
                {kunde.kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md ${statusStyle.bg} ${statusStyle.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}></span>
                {status === 'offen' ? 'Offen' : status === 'in_bearbeitung' ? 'In Bearbeitung' : 'Erledigt'}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {kunde.kunde.lieferadresse.plz} {kunde.kunde.lieferadresse.ort}
              {kunde.kunde.lieferadresse.bundesland && (
                <span className="text-gray-400 dark:text-slate-500">· {kunde.kunde.lieferadresse.bundesland}</span>
              )}
            </span>
            {kunde.ansprechpartner.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {kunde.ansprechpartner.length}
              </span>
            )}
            {angefragteMenge && (
              <span className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-slate-300">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {angefragteMenge.toFixed(1)} t
              </span>
            )}
            {preis && (
              <span className="inline-flex items-center gap-1">
                {preis.toFixed(2)} €/t
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors duration-200"
            title="Bearbeiten"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors duration-200"
            title="Löschen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Saisonplanung;
