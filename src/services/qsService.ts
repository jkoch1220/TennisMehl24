import { ID, Query } from 'appwrite';
import { databases, DATABASE_ID, SIEBANALYSEN_COLLECTION_ID } from '../config/appwrite';
import {
  Siebanalyse,
  NeueSiebanalyse,
  Siebwerte,
  QSErgebnis,
  SIEB_TOLERANZEN,
  TrendDaten,
  SiebanalyseFilter
} from '../types/qualitaetssicherung';

// Cache für Performance
const cache = new Map<string, { data: Siebanalyse[]; timestamp: number }>();
const CACHE_TTL = 5000; // 5 Sekunden

// Parse Appwrite Document zu Siebanalyse
function parseDocument(doc: Record<string, unknown>): Siebanalyse {
  const data = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
  return {
    id: doc.$id as string,
    chargenNummer: data.chargenNummer || '',
    pruefDatum: data.pruefDatum || '',
    kundeId: data.kundeId,
    projektId: data.projektId,
    kundeName: data.kundeName,
    projektName: data.projektName,
    siebwerte: data.siebwerte || {
      mm2_0: 100,
      mm1_0: 90,
      mm0_63: 72,
      mm0_315: 50,
      mm0_125: 27,
      mm0_063: 5,
    },
    ergebnis: data.ergebnis || 'bestanden',
    abweichungen: data.abweichungen || [],
    notizen: data.notizen,
    erstelltAm: data.erstelltAm || (doc.$createdAt as string),
    erstelltVon: data.erstelltVon,
  };
}

// Siebanalyse zu Appwrite Payload
function toPayload(analyse: Siebanalyse): Record<string, unknown> {
  return {
    data: JSON.stringify({
      chargenNummer: analyse.chargenNummer,
      pruefDatum: analyse.pruefDatum,
      kundeId: analyse.kundeId,
      projektId: analyse.projektId,
      kundeName: analyse.kundeName,
      projektName: analyse.projektName,
      siebwerte: analyse.siebwerte,
      ergebnis: analyse.ergebnis,
      abweichungen: analyse.abweichungen,
      notizen: analyse.notizen,
      erstelltAm: analyse.erstelltAm,
      erstelltVon: analyse.erstelltVon,
    }),
  };
}

// PASS/FAIL Berechnung nach DIN 18035-5
export function berechneErgebnis(siebwerte: Siebwerte): { ergebnis: QSErgebnis; abweichungen: string[] } {
  const abweichungen: string[] = [];

  for (const toleranz of SIEB_TOLERANZEN) {
    const wert = siebwerte[toleranz.sieb];

    if (wert < toleranz.min) {
      abweichungen.push(`${toleranz.label}${toleranz.einheit}: ${wert}% (Min: ${toleranz.min}%)`);
    } else if (wert > toleranz.max) {
      abweichungen.push(`${toleranz.label}${toleranz.einheit}: ${wert}% (Max: ${toleranz.max}%)`);
    }
  }

  return {
    ergebnis: abweichungen.length === 0 ? 'bestanden' : 'nicht_bestanden',
    abweichungen,
  };
}

// Chargen-Nummer generieren: CH-{Jahr}-{Laufnummer}
async function generiereChargenNummer(): Promise<string> {
  const jahr = new Date().getFullYear();
  const prefix = `CH-${jahr}-`;

  try {
    // Lade alle Analysen des Jahres
    const response = await databases.listDocuments(
      DATABASE_ID,
      SIEBANALYSEN_COLLECTION_ID,
      [Query.limit(1000), Query.orderDesc('$createdAt')]
    );

    // Finde die höchste Nummer
    let maxNummer = 0;
    for (const doc of response.documents) {
      const analyse = parseDocument(doc as Record<string, unknown>);
      if (analyse.chargenNummer.startsWith(prefix)) {
        const nummerStr = analyse.chargenNummer.replace(prefix, '');
        const nummer = parseInt(nummerStr, 10);
        if (!isNaN(nummer) && nummer > maxNummer) {
          maxNummer = nummer;
        }
      }
    }

    return `${prefix}${String(maxNummer + 1).padStart(3, '0')}`;
  } catch {
    // Bei Fehler: Timestamp-basierte Nummer
    return `${prefix}${Date.now().toString().slice(-4)}`;
  }
}

// Trend-Daten berechnen
export function berechneTrend(analysen: Siebanalyse[]): TrendDaten {
  if (analysen.length === 0) {
    return {
      analysen: [],
      durchschnitt: { mm2_0: 100, mm1_0: 90, mm0_63: 72, mm0_315: 50, mm0_125: 27, mm0_063: 5 },
      standardabweichung: { mm2_0: 0, mm1_0: 0, mm0_63: 0, mm0_315: 0, mm0_125: 0, mm0_063: 0 },
      trend: { mm2_0: 'stabil', mm1_0: 'stabil', mm0_63: 'stabil', mm0_315: 'stabil', mm0_125: 'stabil', mm0_063: 'stabil' },
      warnungen: [],
    };
  }

  const siebe: (keyof Siebwerte)[] = ['mm2_0', 'mm1_0', 'mm0_63', 'mm0_315', 'mm0_125', 'mm0_063'];

  // Durchschnitt berechnen
  const durchschnitt: Siebwerte = { mm2_0: 0, mm1_0: 0, mm0_63: 0, mm0_315: 0, mm0_125: 0, mm0_063: 0 };
  for (const sieb of siebe) {
    const summe = analysen.reduce((acc, a) => acc + a.siebwerte[sieb], 0);
    durchschnitt[sieb] = Math.round((summe / analysen.length) * 10) / 10;
  }

  // Standardabweichung berechnen
  const standardabweichung: Siebwerte = { mm2_0: 0, mm1_0: 0, mm0_63: 0, mm0_315: 0, mm0_125: 0, mm0_063: 0 };
  for (const sieb of siebe) {
    const varianz = analysen.reduce((acc, a) => {
      const diff = a.siebwerte[sieb] - durchschnitt[sieb];
      return acc + diff * diff;
    }, 0) / analysen.length;
    standardabweichung[sieb] = Math.round(Math.sqrt(varianz) * 10) / 10;
  }

  // Trend berechnen (letzte 5 vs. vorherige 5)
  const trend: Record<keyof Siebwerte, 'steigend' | 'fallend' | 'stabil'> = {
    mm2_0: 'stabil', mm1_0: 'stabil', mm0_63: 'stabil',
    mm0_315: 'stabil', mm0_125: 'stabil', mm0_063: 'stabil'
  };

  if (analysen.length >= 3) {
    const letzte = analysen.slice(0, Math.min(3, analysen.length));
    const vorherige = analysen.slice(3, Math.min(6, analysen.length));

    if (vorherige.length > 0) {
      for (const sieb of siebe) {
        const avgLetzte = letzte.reduce((acc, a) => acc + a.siebwerte[sieb], 0) / letzte.length;
        const avgVorherige = vorherige.reduce((acc, a) => acc + a.siebwerte[sieb], 0) / vorherige.length;
        const diff = avgLetzte - avgVorherige;

        if (diff > 3) trend[sieb] = 'steigend';
        else if (diff < -3) trend[sieb] = 'fallend';
      }
    }
  }

  // Warnungen generieren
  const warnungen: string[] = [];

  // Warnung bei hoher Standardabweichung (>5%)
  for (const sieb of siebe) {
    if (standardabweichung[sieb] > 5) {
      const toleranz = SIEB_TOLERANZEN.find(t => t.sieb === sieb);
      if (toleranz) {
        warnungen.push(`Hohe Streuung bei ${toleranz.label}mm: ±${standardabweichung[sieb]}%`);
      }
    }
  }

  // Warnung bei zu vielen nicht bestandenen Proben
  const nichtBestanden = analysen.filter(a => a.ergebnis === 'nicht_bestanden').length;
  const rate = (nichtBestanden / analysen.length) * 100;
  if (rate > 20) {
    warnungen.push(`${Math.round(rate)}% der Proben nicht bestanden!`);
  }

  return { analysen, durchschnitt, standardabweichung, trend, warnungen };
}

export const qsService = {
  // Alle Siebanalysen laden
  async loadAlleSiebanalysen(): Promise<Siebanalyse[]> {
    const cached = cache.get('alle');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SIEBANALYSEN_COLLECTION_ID,
        [Query.limit(1000), Query.orderDesc('$createdAt')]
      );

      const analysen = response.documents.map(doc => parseDocument(doc as Record<string, unknown>));
      cache.set('alle', { data: analysen, timestamp: Date.now() });
      return analysen;
    } catch (error) {
      console.error('Fehler beim Laden der Siebanalysen:', error);
      return [];
    }
  },

  // Einzelne Siebanalyse laden
  async loadSiebanalyse(id: string): Promise<Siebanalyse | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SIEBANALYSEN_COLLECTION_ID,
        id
      );
      return parseDocument(doc as Record<string, unknown>);
    } catch (error) {
      console.error('Fehler beim Laden der Siebanalyse:', error);
      return null;
    }
  },

  // Siebanalysen für einen Kunden
  async loadSiebanalysenFuerKunde(kundeId: string): Promise<Siebanalyse[]> {
    const alle = await this.loadAlleSiebanalysen();
    return alle.filter(a => a.kundeId === kundeId);
  },

  // Siebanalysen für ein Projekt
  async loadSiebanalysenFuerProjekt(projektId: string): Promise<Siebanalyse[]> {
    const alle = await this.loadAlleSiebanalysen();
    return alle.filter(a => a.projektId === projektId);
  },

  // Gefilterte Siebanalysen
  async loadGefilterteSiebanalysen(filter: SiebanalyseFilter): Promise<Siebanalyse[]> {
    let analysen = await this.loadAlleSiebanalysen();

    // Suche
    if (filter.suche) {
      const suche = filter.suche.toLowerCase();
      analysen = analysen.filter(a =>
        a.chargenNummer.toLowerCase().includes(suche) ||
        a.kundeName?.toLowerCase().includes(suche) ||
        a.projektName?.toLowerCase().includes(suche) ||
        a.notizen?.toLowerCase().includes(suche)
      );
    }

    // Ergebnis-Filter
    if (filter.ergebnis && filter.ergebnis !== 'alle') {
      analysen = analysen.filter(a => a.ergebnis === filter.ergebnis);
    }

    // Zeitraum-Filter
    if (filter.zeitraum && filter.zeitraum !== 'alle') {
      const jetzt = new Date();
      let startDatum: Date;

      switch (filter.zeitraum) {
        case 'heute':
          startDatum = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
          break;
        case 'woche':
          startDatum = new Date(jetzt.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monat':
          startDatum = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
          break;
        case 'jahr':
          startDatum = new Date(jetzt.getFullYear(), 0, 1);
          break;
        default:
          startDatum = new Date(0);
      }

      analysen = analysen.filter(a => new Date(a.pruefDatum) >= startDatum);
    }

    // Kunden-Filter
    if (filter.kundeId) {
      analysen = analysen.filter(a => a.kundeId === filter.kundeId);
    }

    return analysen;
  },

  // Neue Siebanalyse erstellen
  async createSiebanalyse(daten: NeueSiebanalyse): Promise<Siebanalyse> {
    const chargenNummer = await generiereChargenNummer();
    const { ergebnis, abweichungen } = berechneErgebnis(daten.siebwerte);

    const neueSiebanalyse: Siebanalyse = {
      id: daten.id || ID.unique(),
      chargenNummer,
      pruefDatum: daten.pruefDatum,
      kundeId: daten.kundeId,
      projektId: daten.projektId,
      kundeName: daten.kundeName,
      projektName: daten.projektName,
      siebwerte: daten.siebwerte,
      ergebnis,
      abweichungen,
      notizen: daten.notizen,
      erstelltAm: new Date().toISOString(),
      erstelltVon: daten.erstelltVon,
    };

    const doc = await databases.createDocument(
      DATABASE_ID,
      SIEBANALYSEN_COLLECTION_ID,
      neueSiebanalyse.id,
      toPayload(neueSiebanalyse)
    );

    cache.delete('alle');
    return parseDocument(doc as Record<string, unknown>);
  },

  // Siebanalyse aktualisieren
  async updateSiebanalyse(id: string, daten: Partial<Siebanalyse>): Promise<Siebanalyse> {
    const aktuell = await this.loadSiebanalyse(id);
    if (!aktuell) {
      throw new Error('Siebanalyse nicht gefunden');
    }

    // Bei Änderung der Siebwerte: Ergebnis neu berechnen
    let ergebnis = aktuell.ergebnis;
    let abweichungen = aktuell.abweichungen;

    if (daten.siebwerte) {
      const berechnung = berechneErgebnis(daten.siebwerte);
      ergebnis = berechnung.ergebnis;
      abweichungen = berechnung.abweichungen;
    }

    const aktualisiert: Siebanalyse = {
      ...aktuell,
      ...daten,
      id,
      ergebnis,
      abweichungen,
    };

    const doc = await databases.updateDocument(
      DATABASE_ID,
      SIEBANALYSEN_COLLECTION_ID,
      id,
      toPayload(aktualisiert)
    );

    cache.delete('alle');
    return parseDocument(doc as Record<string, unknown>);
  },

  // Siebanalyse löschen
  async deleteSiebanalyse(id: string): Promise<void> {
    await databases.deleteDocument(
      DATABASE_ID,
      SIEBANALYSEN_COLLECTION_ID,
      id
    );
    cache.delete('alle');
  },

  // Trend-Analyse
  async getTrendDaten(anzahl: number = 10): Promise<TrendDaten> {
    const analysen = await this.loadAlleSiebanalysen();
    const letzteN = analysen.slice(0, anzahl);
    return berechneTrend(letzteN);
  },

  // Statistiken
  async getStatistiken(): Promise<{
    gesamt: number;
    bestanden: number;
    nichtBestanden: number;
    bestandenRate: number;
    letzteWoche: number;
  }> {
    const analysen = await this.loadAlleSiebanalysen();
    const bestanden = analysen.filter(a => a.ergebnis === 'bestanden').length;
    const nichtBestanden = analysen.filter(a => a.ergebnis === 'nicht_bestanden').length;

    const eineWocheZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const letzteWoche = analysen.filter(a => new Date(a.pruefDatum) >= eineWocheZurueck).length;

    return {
      gesamt: analysen.length,
      bestanden,
      nichtBestanden,
      bestandenRate: analysen.length > 0 ? Math.round((bestanden / analysen.length) * 100) : 0,
      letzteWoche,
    };
  },

  // Cache invalidieren
  invalidateCache(): void {
    cache.clear();
  },
};
