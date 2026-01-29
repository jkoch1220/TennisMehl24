import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  FileCheck,
  FileSignature,
  Truck,
  FileText,
  TrendingUp,
  Calendar,
  Euro,
  Package,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';

interface ProjektStatistikProps {
  projekteGruppiert: {
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  };
}

// Hilfsfunktion: Datum parsen
const parseDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

// Hilfsfunktion: JSON sicher parsen
const safeParseJSON = (jsonStr: string | undefined): Record<string, unknown> | null => {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

// Hilfsfunktion: Datum aus Projekt extrahieren (mit Fallbacks)
const getAngebotsdatum = (projekt: Projekt): Date | null => {
  // 1. Direkt vom Projekt
  let date = parseDate(projekt.angebotsdatum);
  if (date) return date;

  // 2. Aus JSON-Daten
  const angebotsDaten = safeParseJSON(projekt.angebotsDaten);
  if (angebotsDaten?.angebotsdatum) {
    date = parseDate(angebotsDaten.angebotsdatum as string);
    if (date) return date;
  }

  // 3. Fallback: erstelltAm wenn Status angebot oder höher
  if (['angebot', 'angebot_versendet', 'auftragsbestaetigung', 'lieferschein', 'rechnung', 'bezahlt'].includes(projekt.status)) {
    return parseDate(projekt.erstelltAm);
  }
  return null;
};

const getABDatum = (projekt: Projekt): Date | null => {
  let date = parseDate(projekt.auftragsbestaetigungsdatum);
  if (date) return date;

  const abDaten = safeParseJSON(projekt.auftragsbestaetigungsDaten);
  if (abDaten?.auftragsbestaetigungsdatum) {
    date = parseDate(abDaten.auftragsbestaetigungsdatum as string);
    if (date) return date;
  }
  return null;
};

const getLieferscheindatum = (projekt: Projekt): Date | null => {
  let date = parseDate(projekt.lieferdatum);
  if (date) return date;

  const lsDaten = safeParseJSON(projekt.lieferscheinDaten);
  if (lsDaten?.lieferdatum) {
    date = parseDate(lsDaten.lieferdatum as string);
    if (date) return date;
  }
  return null;
};

const getRechnungsdatum = (projekt: Projekt): Date | null => {
  let date = parseDate(projekt.rechnungsdatum);
  if (date) return date;

  const reDaten = safeParseJSON(projekt.rechnungsDaten);
  if (reDaten?.rechnungsdatum) {
    date = parseDate(reDaten.rechnungsdatum as string);
    if (date) return date;
  }
  return null;
};

// Hilfsfunktion: Monat aus Datum extrahieren
const getMonthKey = (date: Date): string => {
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

// Hilfsfunktion: Tag als Key formatieren (DD.MM)
const getDayKey = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
};

// Hilfsfunktion: Volles Datum formatieren für Tooltip
const getFullDateKey = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

// Farben für die Charts
const COLORS = {
  angebot: '#3B82F6',      // Blau
  ab: '#F97316',           // Orange
  lieferschein: '#22C55E', // Grün
  rechnung: '#EF4444',     // Rot
  bezahlt: '#10B981',      // Emerald
  verloren: '#6B7280',     // Grau
};

const ProjektStatistik = ({ projekteGruppiert }: ProjektStatistikProps) => {
  // Alle Projekte zusammenführen
  const alleProjekte = useMemo(() => [
    ...projekteGruppiert.angebot,
    ...projekteGruppiert.angebot_versendet,
    ...projekteGruppiert.auftragsbestaetigung,
    ...projekteGruppiert.lieferschein,
    ...projekteGruppiert.rechnung,
    ...projekteGruppiert.bezahlt,
    ...projekteGruppiert.verloren,
  ], [projekteGruppiert]);

  // Statistik-Daten berechnen (mit Fallbacks aus JSON-Daten und erstelltAm)
  const stats = useMemo(() => {
    const angeboteDaten: { date: Date; projekt: Projekt }[] = [];
    const abDaten: { date: Date; projekt: Projekt }[] = [];
    const lieferscheinDaten: { date: Date; projekt: Projekt }[] = [];
    const rechnungDaten: { date: Date; projekt: Projekt }[] = [];

    alleProjekte.forEach(projekt => {
      // Angebotsdatum (mit Fallback auf erstelltAm)
      const angebotDate = getAngebotsdatum(projekt);
      if (angebotDate) {
        angeboteDaten.push({ date: angebotDate, projekt });
      }

      // Auftragsbestätigungsdatum (mit Fallback aus JSON)
      const abDate = getABDatum(projekt);
      if (abDate) {
        abDaten.push({ date: abDate, projekt });
      }

      // Lieferscheindatum (mit Fallback aus JSON)
      const lsDate = getLieferscheindatum(projekt);
      if (lsDate) {
        lieferscheinDaten.push({ date: lsDate, projekt });
      }

      // Rechnungsdatum (mit Fallback aus JSON)
      const reDate = getRechnungsdatum(projekt);
      if (reDate) {
        rechnungDaten.push({ date: reDate, projekt });
      }
    });

    return { angeboteDaten, abDaten, lieferscheinDaten, rechnungDaten };
  }, [alleProjekte]);

  // Daten nach Monat gruppieren für Balkendiagramm
  const monatsDaten = useMemo(() => {
    const monthMap = new Map<string, {
      month: string;
      angebote: number;
      abs: number;
      lieferscheine: number;
      rechnungen: number;
      sortKey: number;
    }>();

    // Angebote
    stats.angeboteDaten.forEach(({ date }) => {
      const key = getMonthKey(date);
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      const existing = monthMap.get(key) || { month: key, angebote: 0, abs: 0, lieferscheine: 0, rechnungen: 0, sortKey };
      existing.angebote++;
      monthMap.set(key, existing);
    });

    // ABs
    stats.abDaten.forEach(({ date }) => {
      const key = getMonthKey(date);
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      const existing = monthMap.get(key) || { month: key, angebote: 0, abs: 0, lieferscheine: 0, rechnungen: 0, sortKey };
      existing.abs++;
      monthMap.set(key, existing);
    });

    // Lieferscheine
    stats.lieferscheinDaten.forEach(({ date }) => {
      const key = getMonthKey(date);
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      const existing = monthMap.get(key) || { month: key, angebote: 0, abs: 0, lieferscheine: 0, rechnungen: 0, sortKey };
      existing.lieferscheine++;
      monthMap.set(key, existing);
    });

    // Rechnungen
    stats.rechnungDaten.forEach(({ date }) => {
      const key = getMonthKey(date);
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      const existing = monthMap.get(key) || { month: key, angebote: 0, abs: 0, lieferscheine: 0, rechnungen: 0, sortKey };
      existing.rechnungen++;
      monthMap.set(key, existing);
    });

    return Array.from(monthMap.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-12); // Letzte 12 Monate
  }, [stats]);


  // Durchschnittliche Bearbeitungszeiten berechnen
  const bearbeitungszeiten = useMemo(() => {
    const zeiten: {
      angebotZuAB: number[];
      abZuLieferschein: number[];
      lieferscheinZuRechnung: number[];
      gesamtDurchlauf: number[];
    } = {
      angebotZuAB: [],
      abZuLieferschein: [],
      lieferscheinZuRechnung: [],
      gesamtDurchlauf: [],
    };

    alleProjekte.forEach(projekt => {
      const angebotDate = getAngebotsdatum(projekt);
      const abDate = getABDatum(projekt);
      const lsDate = getLieferscheindatum(projekt);
      const reDate = getRechnungsdatum(projekt);

      // Angebot → AB
      if (angebotDate && abDate) {
        const diff = Math.floor((abDate.getTime() - angebotDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) zeiten.angebotZuAB.push(diff);
      }

      // AB → Lieferschein
      if (abDate && lsDate) {
        const diff = Math.floor((lsDate.getTime() - abDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) zeiten.abZuLieferschein.push(diff);
      }

      // Lieferschein → Rechnung
      if (lsDate && reDate) {
        const diff = Math.floor((reDate.getTime() - lsDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) zeiten.lieferscheinZuRechnung.push(diff);
      }

      // Gesamtdurchlauf Angebot → Rechnung
      if (angebotDate && reDate) {
        const diff = Math.floor((reDate.getTime() - angebotDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) zeiten.gesamtDurchlauf.push(diff);
      }
    });

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return {
      angebotZuAB: avg(zeiten.angebotZuAB),
      abZuLieferschein: avg(zeiten.abZuLieferschein),
      lieferscheinZuRechnung: avg(zeiten.lieferscheinZuRechnung),
      gesamtDurchlauf: avg(zeiten.gesamtDurchlauf),
      anzahlAngebotZuAB: zeiten.angebotZuAB.length,
      anzahlGesamtDurchlauf: zeiten.gesamtDurchlauf.length,
    };
  }, [alleProjekte]);

  // Tagesgenaue Aktivität der letzten 30 Tage
  const tagesgenaueDaten = useMemo(() => {
    const heute = new Date();
    heute.setHours(23, 59, 59, 999);
    const vor30Tagen = new Date(heute);
    vor30Tagen.setDate(vor30Tagen.getDate() - 30);
    vor30Tagen.setHours(0, 0, 0, 0);

    // Erstelle Map für alle Tage der letzten 30 Tage
    const dayMap = new Map<string, {
      datum: string;
      datumVoll: string;
      angebote: number;
      abs: number;
      lieferscheine: number;
      rechnungen: number;
      sortKey: number;
    }>();

    // Initialisiere alle 30 Tage mit 0
    for (let i = 0; i <= 30; i++) {
      const d = new Date(vor30Tagen);
      d.setDate(d.getDate() + i);
      const key = getDayKey(d);
      const fullKey = getFullDateKey(d);
      const sortKey = d.getTime();
      dayMap.set(fullKey, {
        datum: key,
        datumVoll: fullKey,
        angebote: 0,
        abs: 0,
        lieferscheine: 0,
        rechnungen: 0,
        sortKey
      });
    }

    // Fülle mit tatsächlichen Daten
    stats.angeboteDaten.forEach(({ date }) => {
      if (date >= vor30Tagen && date <= heute) {
        const fullKey = getFullDateKey(date);
        const existing = dayMap.get(fullKey);
        if (existing) {
          existing.angebote++;
        }
      }
    });

    stats.abDaten.forEach(({ date }) => {
      if (date >= vor30Tagen && date <= heute) {
        const fullKey = getFullDateKey(date);
        const existing = dayMap.get(fullKey);
        if (existing) {
          existing.abs++;
        }
      }
    });

    stats.lieferscheinDaten.forEach(({ date }) => {
      if (date >= vor30Tagen && date <= heute) {
        const fullKey = getFullDateKey(date);
        const existing = dayMap.get(fullKey);
        if (existing) {
          existing.lieferscheine++;
        }
      }
    });

    stats.rechnungDaten.forEach(({ date }) => {
      if (date >= vor30Tagen && date <= heute) {
        const fullKey = getFullDateKey(date);
        const existing = dayMap.get(fullKey);
        if (existing) {
          existing.rechnungen++;
        }
      }
    });

    return Array.from(dayMap.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [stats]);

  // Angebote in den letzten 7 und 30 Tagen
  const angeboteProZeit = useMemo(() => {
    const heute = new Date();
    heute.setHours(23, 59, 59, 999);

    const vor7Tagen = new Date(heute);
    vor7Tagen.setDate(vor7Tagen.getDate() - 7);
    vor7Tagen.setHours(0, 0, 0, 0);

    const vor30Tagen = new Date(heute);
    vor30Tagen.setDate(vor30Tagen.getDate() - 30);
    vor30Tagen.setHours(0, 0, 0, 0);

    // Angebote der letzten 7 Tage
    const letzte7Tage = stats.angeboteDaten.filter(({ date }) => date >= vor7Tagen && date <= heute).length;

    // Angebote der letzten 30 Tage
    const letzte30Tage = stats.angeboteDaten.filter(({ date }) => date >= vor30Tagen && date <= heute).length;

    // Heute
    const heuteStart = new Date(heute);
    heuteStart.setHours(0, 0, 0, 0);
    const heuteAngebote = stats.angeboteDaten.filter(({ date }) => date >= heuteStart && date <= heute).length;

    // Gestern
    const gesternStart = new Date(heuteStart);
    gesternStart.setDate(gesternStart.getDate() - 1);
    const gesternEnd = new Date(gesternStart);
    gesternEnd.setHours(23, 59, 59, 999);
    const gesternAngebote = stats.angeboteDaten.filter(({ date }) => date >= gesternStart && date <= gesternEnd).length;

    return {
      heute: heuteAngebote,
      gestern: gesternAngebote,
      letzte7Tage,
      letzte30Tage,
      durchschnittProTag: Math.round((letzte30Tage / 30) * 10) / 10,
    };
  }, [stats]);

  // Status-Verteilung für Pie-Chart
  const statusVerteilung = useMemo(() => [
    { name: 'Angebot', value: projekteGruppiert.angebot.length + projekteGruppiert.angebot_versendet.length, color: COLORS.angebot },
    { name: 'AB', value: projekteGruppiert.auftragsbestaetigung.length, color: COLORS.ab },
    { name: 'Lieferschein', value: projekteGruppiert.lieferschein.length, color: COLORS.lieferschein },
    { name: 'Rechnung', value: projekteGruppiert.rechnung.length, color: COLORS.rechnung },
    { name: 'Bezahlt', value: projekteGruppiert.bezahlt.length, color: COLORS.bezahlt },
    { name: 'Verloren', value: projekteGruppiert.verloren.length, color: COLORS.verloren },
  ].filter(item => item.value > 0), [projekteGruppiert]);

  // Umsatz-Daten berechnen
  const umsatzDaten = useMemo(() => {
    let gesamtUmsatz = 0;
    let bezahlterUmsatz = 0;
    let offenerUmsatz = 0;

    [...projekteGruppiert.rechnung, ...projekteGruppiert.bezahlt].forEach(projekt => {
      const menge = projekt.angefragteMenge || 0;
      const preis = projekt.preisProTonne || 0;
      const umsatz = menge * preis;
      gesamtUmsatz += umsatz;
    });

    projekteGruppiert.bezahlt.forEach(projekt => {
      const menge = projekt.angefragteMenge || 0;
      const preis = projekt.preisProTonne || 0;
      bezahlterUmsatz += menge * preis;
    });

    projekteGruppiert.rechnung.forEach(projekt => {
      const menge = projekt.angefragteMenge || 0;
      const preis = projekt.preisProTonne || 0;
      offenerUmsatz += menge * preis;
    });

    return { gesamtUmsatz, bezahlterUmsatz, offenerUmsatz };
  }, [projekteGruppiert]);

  // Tonnen berechnen
  const tonnenDaten = useMemo(() => {
    let geplant = 0;
    let geliefert = 0;

    alleProjekte.forEach(projekt => {
      const menge = projekt.angefragteMenge || 0;
      if (['lieferschein', 'rechnung', 'bezahlt'].includes(projekt.status)) {
        geliefert += menge;
      } else if (['angebot', 'angebot_versendet', 'auftragsbestaetigung'].includes(projekt.status)) {
        geplant += menge;
      }
    });

    return { geplant, geliefert, gesamt: geplant + geliefert };
  }, [alleProjekte]);

  // Konversionsraten berechnen
  const konversionsraten = useMemo(() => {
    const totalAngebote = stats.angeboteDaten.length;
    const totalABs = stats.abDaten.length;
    const totalRechnungen = stats.rechnungDaten.length;
    const totalBezahlt = projekteGruppiert.bezahlt.length;
    const totalVerloren = projekteGruppiert.verloren.length;

    return {
      angebotZuAB: totalAngebote > 0 ? Math.round((totalABs / totalAngebote) * 100) : 0,
      abZuRechnung: totalABs > 0 ? Math.round((totalRechnungen / totalABs) * 100) : 0,
      rechnungZuBezahlt: totalRechnungen > 0 ? Math.round((totalBezahlt / totalRechnungen) * 100) : 0,
      verlorenRate: totalAngebote > 0 ? Math.round((totalVerloren / totalAngebote) * 100) : 0,
    };
  }, [stats, projekteGruppiert]);

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Gesamt Projekte */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Gesamt Projekte</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{alleProjekte.length}</p>
            </div>
          </div>
        </div>

        {/* Angebote erstellt */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <FileCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Angebote erstellt</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.angeboteDaten.length}</p>
            </div>
          </div>
        </div>

        {/* Rechnungen */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-lg">
              <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Rechnungen</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.rechnungDaten.length}</p>
            </div>
          </div>
        </div>

        {/* Konversionsrate */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Erfolgsquote</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{konversionsraten.angebotZuAB}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Umsatz & Tonnen Karten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Euro className="w-6 h-6" />
            <span className="text-emerald-100">Bezahlter Umsatz</span>
          </div>
          <p className="text-3xl font-bold">{umsatzDaten.bezahlterUmsatz.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Euro className="w-6 h-6" />
            <span className="text-amber-100">Offene Rechnungen</span>
          </div>
          <p className="text-3xl font-bold">{umsatzDaten.offenerUmsatz.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6" />
            <span className="text-blue-100">Gelieferte Tonnen</span>
          </div>
          <p className="text-3xl font-bold">{tonnenDaten.geliefert.toLocaleString('de-DE', { minimumFractionDigits: 1 })} t</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dokumente pro Monat - Balkendiagramm */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Dokumente pro Monat
          </h3>
          {monatsDaten.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monatsDaten}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis stroke="#6b7280" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="angebote" name="Angebote" fill={COLORS.angebot} radius={[4, 4, 0, 0]} />
                <Bar dataKey="abs" name="ABs" fill={COLORS.ab} radius={[4, 4, 0, 0]} />
                <Bar dataKey="lieferscheine" name="Lieferscheine" fill={COLORS.lieferschein} radius={[4, 4, 0, 0]} />
                <Bar dataKey="rechnungen" name="Rechnungen" fill={COLORS.rechnung} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Status-Verteilung - Pie Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            Aktuelle Status-Verteilung
          </h3>
          {statusVerteilung.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusVerteilung}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusVerteilung.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Tagesgenaue Aktivität - Area Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            Tagesgenaue Aktivität (letzte 30 Tage)
          </h3>
          {tagesgenaueDaten.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={tagesgenaueDaten}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="datum"
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                  interval={2}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis stroke="#6b7280" allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length && payload[0].payload) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700">
                          <p className="font-semibold text-gray-900 dark:text-white mb-2">{data.datumVoll}</p>
                          <p style={{ color: COLORS.angebot }}>Angebote: {data.angebote}</p>
                          <p style={{ color: COLORS.ab }}>ABs: {data.abs}</p>
                          <p style={{ color: COLORS.lieferschein }}>Lieferscheine: {data.lieferscheine}</p>
                          <p style={{ color: COLORS.rechnung }}>Rechnungen: {data.rechnungen}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="angebote"
                  name="Angebote"
                  stackId="1"
                  stroke={COLORS.angebot}
                  fill={COLORS.angebot}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="abs"
                  name="ABs"
                  stackId="1"
                  stroke={COLORS.ab}
                  fill={COLORS.ab}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="lieferscheine"
                  name="Lieferscheine"
                  stackId="1"
                  stroke={COLORS.lieferschein}
                  fill={COLORS.lieferschein}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="rechnungen"
                  name="Rechnungen"
                  stackId="1"
                  stroke={COLORS.rechnung}
                  fill={COLORS.rechnung}
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>
      </div>

      {/* Konversions-Funnel */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-600" />
          Konversions-Übersicht
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
            <FileCheck className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.angeboteDaten.length}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">Angebote</p>
          </div>
          <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/30 rounded-xl relative">
            <div className="absolute -left-2 top-1/2 transform -translate-y-1/2 text-gray-400">→</div>
            <FileSignature className="w-8 h-8 text-orange-600 dark:text-orange-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.abDaten.length}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">ABs</p>
            <p className="text-xs text-gray-500 mt-1">{konversionsraten.angebotZuAB}% Konversion</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-xl relative">
            <div className="absolute -left-2 top-1/2 transform -translate-y-1/2 text-gray-400">→</div>
            <Truck className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.lieferscheinDaten.length}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">Lieferscheine</p>
          </div>
          <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-xl relative">
            <div className="absolute -left-2 top-1/2 transform -translate-y-1/2 text-gray-400">→</div>
            <FileText className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.rechnungDaten.length}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">Rechnungen</p>
            <p className="text-xs text-gray-500 mt-1">{konversionsraten.rechnungZuBezahlt}% bezahlt</p>
          </div>
        </div>
      </div>

      {/* Durchschnittliche Bearbeitungszeiten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Durchschnittliche Bearbeitungszeiten
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-orange-50 dark:from-blue-900/20 dark:to-orange-900/20 rounded-xl">
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-blue-600" />
                <span className="text-gray-700 dark:text-slate-300">Angebot → AB</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{bearbeitungszeiten.angebotZuAB}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-1">Tage</span>
                <p className="text-xs text-gray-400">({bearbeitungszeiten.anzahlAngebotZuAB} Datensätze)</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-green-50 dark:from-orange-900/20 dark:to-green-900/20 rounded-xl">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-orange-600" />
                <span className="text-gray-700 dark:text-slate-300">AB → Lieferschein</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{bearbeitungszeiten.abZuLieferschein}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-1">Tage</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-red-50 dark:from-green-900/20 dark:to-red-900/20 rounded-xl">
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5 text-green-600" />
                <span className="text-gray-700 dark:text-slate-300">Lieferschein → Rechnung</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{bearbeitungszeiten.lieferscheinZuRechnung}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-1">Tage</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-900/10 rounded-xl border-2 border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-700 dark:text-slate-300">Gesamter Durchlauf</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{bearbeitungszeiten.gesamtDurchlauf}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-1">Tage</span>
                <p className="text-xs text-gray-400">({bearbeitungszeiten.anzahlGesamtDurchlauf} abgeschlossene Projekte)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tagesgenaue Angebote */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Angebote pro Tag (letzte 30 Tage)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tagesgenaueDaten}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="datum"
                stroke="#6b7280"
                tick={{ fontSize: 10 }}
                interval={2}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis stroke="#6b7280" allowDecimals={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700">
                        <p className="font-semibold text-gray-900 dark:text-white">{payload[0].payload.datumVoll}</p>
                        <p className="text-blue-600">{payload[0].value} Angebote</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="angebote" fill={COLORS.angebot} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produktivitäts-KPIs - Tagesgenau */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-600" />
          Angebote - Tagesaktuelle Zahlen
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-900/10 rounded-xl border-2 border-emerald-200 dark:border-emerald-800">
            <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{angeboteProZeit.heute}</p>
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mt-2">Heute</p>
          </div>
          <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-900/10 rounded-xl">
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{angeboteProZeit.gestern}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">Gestern</p>
          </div>
          <div className="text-center p-5 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-900/10 rounded-xl">
            <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{angeboteProZeit.letzte7Tage}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">Letzte 7 Tage</p>
          </div>
          <div className="text-center p-5 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-900/10 rounded-xl">
            <p className="text-4xl font-bold text-orange-600 dark:text-orange-400">{angeboteProZeit.letzte30Tage}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">Letzte 30 Tage</p>
          </div>
          <div className="text-center p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/30 dark:to-gray-900/10 rounded-xl">
            <p className="text-4xl font-bold text-gray-600 dark:text-gray-400">{angeboteProZeit.durchschnittProTag}</p>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">Durchschnitt/Tag</p>
            <p className="text-xs text-gray-400">(30 Tage)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjektStatistik;
