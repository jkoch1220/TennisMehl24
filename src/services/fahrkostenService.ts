import { databases, DATABASE_ID, FAHRTEN_COLLECTION_ID, DEFAULT_STRECKEN_COLLECTION_ID } from '../config/appwrite';
import { Fahrt, NeueFahrt, DefaultStrecke, DEFAULT_KILOMETER_PAUSCHALE, STANDARD_STRECKEN, MonatsZusammenfassung } from '../types/fahrtkosten';
import { ID, Query } from 'appwrite';

// Robustes Pattern: Alle Daten als JSON im "data" Feld speichern
// So brauchen wir nur ein Feld in Appwrite

export const fahrkostenService = {
  // ==================== FAHRTEN ====================

  async ladeAlleFahrten(): Promise<Fahrt[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRTEN_COLLECTION_ID,
        [Query.limit(5000)]
      );
      return response.documents
        .map(doc => this.parseFahrtDocument(doc))
        .sort((a, b) => b.datum.localeCompare(a.datum)); // Neueste zuerst
    } catch (error) {
      console.error('Fehler beim Laden der Fahrten:', error);
      return [];
    }
  },

  async erstelleFahrt(neueFahrt: NeueFahrt): Promise<Fahrt> {
    const jetzt = new Date().toISOString();
    const pauschale = neueFahrt.kilometerPauschale ?? DEFAULT_KILOMETER_PAUSCHALE;
    const km = neueFahrt.hinpirsUndZurueck ? neueFahrt.kilometer * 2 : neueFahrt.kilometer;
    const id = ID.unique();

    const fahrt: Fahrt = {
      ...neueFahrt,
      id,
      kilometer: km,
      kilometerPauschale: pauschale,
      betrag: Math.round(km * pauschale * 100) / 100,
      hinpirsUndZurueck: neueFahrt.hinpirsUndZurueck ?? false,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    await databases.createDocument(
      DATABASE_ID,
      FAHRTEN_COLLECTION_ID,
      id,
      { data: JSON.stringify(fahrt) }
    );

    return fahrt;
  },

  async aktualisiereFahrt(id: string, daten: Partial<Fahrt>): Promise<Fahrt> {
    const existierend = await this.ladeFahrt(id);
    if (!existierend) {
      throw new Error('Fahrt nicht gefunden');
    }

    const aktualisiert: Fahrt = {
      ...existierend,
      ...daten,
      geaendertAm: new Date().toISOString(),
    };

    // Neu berechnen falls km oder pauschale geändert
    if (daten.kilometer !== undefined || daten.kilometerPauschale !== undefined || daten.hinpirsUndZurueck !== undefined) {
      const km = aktualisiert.kilometer;
      const pauschale = aktualisiert.kilometerPauschale;
      aktualisiert.betrag = Math.round(km * pauschale * 100) / 100;
    }

    await databases.updateDocument(
      DATABASE_ID,
      FAHRTEN_COLLECTION_ID,
      id,
      { data: JSON.stringify(aktualisiert) }
    );

    return aktualisiert;
  },

  async loescheFahrt(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, FAHRTEN_COLLECTION_ID, id);
  },

  async ladeFahrt(id: string): Promise<Fahrt | null> {
    try {
      const document = await databases.getDocument(DATABASE_ID, FAHRTEN_COLLECTION_ID, id);
      return this.parseFahrtDocument(document);
    } catch {
      return null;
    }
  },

  // ==================== DEFAULT STRECKEN ====================

  async ladeDefaultStrecken(): Promise<DefaultStrecke[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        DEFAULT_STRECKEN_COLLECTION_ID,
        [Query.limit(100)]
      );
      const strecken = response.documents.map(doc => this.parseDefaultStreckeDocument(doc));
      return strecken.sort((a, b) => a.sortierung - b.sortierung);
    } catch (error) {
      console.error('Fehler beim Laden der Default-Strecken:', error);
      // Fallback: Standard-Strecken aus Memory zurückgeben
      return STANDARD_STRECKEN.map((s, i) => ({ ...s, id: `standard-${i}` }));
    }
  },

  async erstelleDefaultStrecke(strecke: Omit<DefaultStrecke, 'id'>): Promise<DefaultStrecke> {
    const id = ID.unique();
    const neueStrecke: DefaultStrecke = {
      ...strecke,
      id,
    };

    await databases.createDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      id,
      { data: JSON.stringify(neueStrecke) }
    );

    return neueStrecke;
  },

  async aktualisiereDefaultStrecke(id: string, daten: Partial<DefaultStrecke>): Promise<DefaultStrecke> {
    const existierend = await this.ladeDefaultStrecke(id);
    if (!existierend) {
      throw new Error('Strecke nicht gefunden');
    }

    const aktualisiert: DefaultStrecke = {
      ...existierend,
      ...daten,
    };

    await databases.updateDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      id,
      { data: JSON.stringify(aktualisiert) }
    );

    return aktualisiert;
  },

  async ladeDefaultStrecke(id: string): Promise<DefaultStrecke | null> {
    try {
      const document = await databases.getDocument(DATABASE_ID, DEFAULT_STRECKEN_COLLECTION_ID, id);
      return this.parseDefaultStreckeDocument(document);
    } catch {
      return null;
    }
  },

  async loescheDefaultStrecke(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, DEFAULT_STRECKEN_COLLECTION_ID, id);
  },

  // ==================== ZUSAMMENFASSUNGEN ====================

  berechneMonatsZusammenfassung(fahrten: Fahrt[], monat: string): MonatsZusammenfassung {
    const monatsFahrten = fahrten.filter(f => f.datum.startsWith(monat));
    return {
      monat,
      anzahlFahrten: monatsFahrten.length,
      gesamtKilometer: monatsFahrten.reduce((sum, f) => sum + f.kilometer, 0),
      gesamtBetrag: Math.round(monatsFahrten.reduce((sum, f) => sum + f.betrag, 0) * 100) / 100,
      fahrten: monatsFahrten.sort((a, b) => b.datum.localeCompare(a.datum)),
    };
  },

  gruppiereNachMonat(fahrten: Fahrt[]): MonatsZusammenfassung[] {
    const monate = new Map<string, Fahrt[]>();

    fahrten.forEach(fahrt => {
      const monat = fahrt.datum.substring(0, 7); // YYYY-MM
      if (!monate.has(monat)) {
        monate.set(monat, []);
      }
      monate.get(monat)!.push(fahrt);
    });

    return Array.from(monate.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // Neueste zuerst
      .map(([monat, monatsFahrten]) => this.berechneMonatsZusammenfassung(monatsFahrten, monat));
  },

  // ==================== HELPERS ====================

  parseFahrtDocument(doc: Record<string, unknown>): Fahrt {
    // Daten aus JSON "data" Feld parsen
    if (doc.data && typeof doc.data === 'string') {
      try {
        const parsed = JSON.parse(doc.data) as Fahrt;
        return {
          ...parsed,
          id: doc.$id as string || parsed.id,
        };
      } catch {
        console.error('Fehler beim Parsen der Fahrt-Daten');
      }
    }

    // Fallback: Direkte Felder (falls vorhanden)
    return {
      id: doc.$id as string || doc.id as string,
      datum: doc.datum as string || '',
      fahrer: doc.fahrer as string || '',
      fahrerName: doc.fahrerName as string || '',
      startort: doc.startort as string || '',
      startAdresse: doc.startAdresse as string || '',
      zielort: doc.zielort as string || '',
      zielAdresse: doc.zielAdresse as string || '',
      kilometer: (doc.kilometer as number) || 0,
      kilometerPauschale: (doc.kilometerPauschale as number) || DEFAULT_KILOMETER_PAUSCHALE,
      betrag: (doc.betrag as number) || 0,
      hinpirsUndZurueck: (doc.hinpirsUndZurueck as boolean) || false,
      zweck: doc.zweck as string | undefined,
      notizen: doc.notizen as string | undefined,
      defaultStreckeId: doc.defaultStreckeId as string | undefined,
      erstelltAm: doc.erstelltAm as string || doc.$createdAt as string || '',
      geaendertAm: doc.geaendertAm as string || doc.$updatedAt as string || '',
    };
  },

  parseDefaultStreckeDocument(doc: Record<string, unknown>): DefaultStrecke {
    // Daten aus JSON "data" Feld parsen
    if (doc.data && typeof doc.data === 'string') {
      try {
        const parsed = JSON.parse(doc.data) as DefaultStrecke;
        return {
          ...parsed,
          id: doc.$id as string || parsed.id,
        };
      } catch {
        console.error('Fehler beim Parsen der Strecken-Daten');
      }
    }

    // Fallback: Direkte Felder
    return {
      id: doc.$id as string || doc.id as string,
      name: doc.name as string || '',
      startort: doc.startort as string || '',
      startAdresse: doc.startAdresse as string || '',
      zielort: doc.zielort as string || '',
      zielAdresse: doc.zielAdresse as string || '',
      kilometer: (doc.kilometer as number) || 0,
      istFavorit: (doc.istFavorit as boolean) || false,
      sortierung: (doc.sortierung as number) || 0,
    };
  },
};
