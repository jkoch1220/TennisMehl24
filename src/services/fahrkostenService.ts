import { databases, DATABASE_ID, FAHRTEN_COLLECTION_ID, DEFAULT_STRECKEN_COLLECTION_ID } from '../config/appwrite';
import { Fahrt, NeueFahrt, DefaultStrecke, DEFAULT_KILOMETER_PAUSCHALE, STANDARD_STRECKEN, MonatsZusammenfassung } from '../types/fahrtkosten';
import { ID, Query } from 'appwrite';

export const fahrkostenService = {
  // ==================== FAHRTEN ====================

  async ladeAlleFahrten(): Promise<Fahrt[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRTEN_COLLECTION_ID,
        [Query.orderDesc('datum'), Query.limit(5000)]
      );
      return response.documents.map(doc => this.parseFahrtDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Fahrten:', error);
      return [];
    }
  },

  async ladeFahrtenFuerMonat(monat: string): Promise<Fahrt[]> {
    try {
      const startDatum = `${monat}-01`;
      const [year, month] = monat.split('-').map(Number);
      const endDatum = new Date(year, month, 0).toISOString().split('T')[0]; // Letzter Tag des Monats

      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRTEN_COLLECTION_ID,
        [
          Query.greaterThanEqual('datum', startDatum),
          Query.lessThanEqual('datum', endDatum),
          Query.orderDesc('datum'),
          Query.limit(1000)
        ]
      );
      return response.documents.map(doc => this.parseFahrtDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Fahrten für Monat:', error);
      return [];
    }
  },

  async erstelleFahrt(neueFahrt: NeueFahrt): Promise<Fahrt> {
    const jetzt = new Date().toISOString();
    const pauschale = neueFahrt.kilometerPauschale ?? DEFAULT_KILOMETER_PAUSCHALE;
    const km = neueFahrt.hinpirsUndZurueck ? neueFahrt.kilometer * 2 : neueFahrt.kilometer;

    const fahrt: Fahrt = {
      ...neueFahrt,
      id: ID.unique(),
      kilometer: km,
      kilometerPauschale: pauschale,
      betrag: Math.round(km * pauschale * 100) / 100,
      hinpirsUndZurueck: neueFahrt.hinpirsUndZurueck ?? false,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    const document = await databases.createDocument(
      DATABASE_ID,
      FAHRTEN_COLLECTION_ID,
      fahrt.id,
      fahrt
    );

    return this.parseFahrtDocument(document);
  },

  async aktualisiereFahrt(id: string, daten: Partial<Fahrt>): Promise<Fahrt> {
    const aktualisierteDaten = {
      ...daten,
      geaendertAm: new Date().toISOString(),
    };

    // Neu berechnen falls km oder pauschale geändert
    if (daten.kilometer !== undefined || daten.kilometerPauschale !== undefined) {
      const existierend = await this.ladeFahrt(id);
      if (existierend) {
        const km = daten.kilometer ?? existierend.kilometer;
        const pauschale = daten.kilometerPauschale ?? existierend.kilometerPauschale;
        aktualisierteDaten.betrag = Math.round(km * pauschale * 100) / 100;
      }
    }

    const document = await databases.updateDocument(
      DATABASE_ID,
      FAHRTEN_COLLECTION_ID,
      id,
      aktualisierteDaten
    );

    return this.parseFahrtDocument(document);
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
        [Query.orderAsc('sortierung'), Query.limit(100)]
      );
      return response.documents.map(doc => this.parseDefaultStreckeDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Default-Strecken:', error);
      // Fallback: Standard-Strecken zurückgeben
      return STANDARD_STRECKEN.map((s, i) => ({ ...s, id: `standard-${i}` }));
    }
  },

  async erstelleDefaultStrecke(strecke: Omit<DefaultStrecke, 'id'>): Promise<DefaultStrecke> {
    const neueStrecke: DefaultStrecke = {
      ...strecke,
      id: ID.unique(),
    };

    const document = await databases.createDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      neueStrecke.id,
      neueStrecke
    );

    return this.parseDefaultStreckeDocument(document);
  },

  async aktualisiereDefaultStrecke(id: string, daten: Partial<DefaultStrecke>): Promise<DefaultStrecke> {
    const document = await databases.updateDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      id,
      daten
    );
    return this.parseDefaultStreckeDocument(document);
  },

  async loescheDefaultStrecke(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, DEFAULT_STRECKEN_COLLECTION_ID, id);
  },

  async initialisiereStandardStrecken(): Promise<void> {
    try {
      const existierend = await this.ladeDefaultStrecken();
      if (existierend.length === 0 || existierend[0].id.startsWith('standard-')) {
        // Keine echten Strecken vorhanden, Standard anlegen
        for (const strecke of STANDARD_STRECKEN) {
          await this.erstelleDefaultStrecke(strecke);
        }
        console.log('✅ Standard-Strecken initialisiert');
      }
    } catch (error) {
      console.error('Fehler beim Initialisieren der Standard-Strecken:', error);
    }
  },

  // ==================== ZUSAMMENFASSUNGEN ====================

  berechneMonatsZusammenfassung(fahrten: Fahrt[], monat: string): MonatsZusammenfassung {
    const monatsFahrten = fahrten.filter(f => f.datum.startsWith(monat));
    return {
      monat,
      anzahlFahrten: monatsFahrten.length,
      gesamtKilometer: monatsFahrten.reduce((sum, f) => sum + f.kilometer, 0),
      gesamtBetrag: Math.round(monatsFahrten.reduce((sum, f) => sum + f.betrag, 0) * 100) / 100,
      fahrten: monatsFahrten,
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
      .map(([monat, fahrten]) => this.berechneMonatsZusammenfassung(fahrten, monat));
  },

  // ==================== HELPERS ====================

  parseFahrtDocument(doc: Record<string, unknown>): Fahrt {
    return {
      id: doc.$id as string || doc.id as string,
      datum: doc.datum as string,
      fahrer: doc.fahrer as string,
      fahrerName: doc.fahrerName as string,
      startort: doc.startort as string,
      startAdresse: doc.startAdresse as string,
      zielort: doc.zielort as string,
      zielAdresse: doc.zielAdresse as string,
      kilometer: doc.kilometer as number,
      kilometerPauschale: doc.kilometerPauschale as number,
      betrag: doc.betrag as number,
      hinpirsUndZurueck: doc.hinpirsUndZurueck as boolean || false,
      zweck: doc.zweck as string | undefined,
      notizen: doc.notizen as string | undefined,
      defaultStreckeId: doc.defaultStreckeId as string | undefined,
      erstelltAm: doc.erstelltAm as string || doc.$createdAt as string,
      geaendertAm: doc.geaendertAm as string || doc.$updatedAt as string,
    };
  },

  parseDefaultStreckeDocument(doc: Record<string, unknown>): DefaultStrecke {
    return {
      id: doc.$id as string || doc.id as string,
      name: doc.name as string,
      startort: doc.startort as string,
      startAdresse: doc.startAdresse as string,
      zielort: doc.zielort as string,
      zielAdresse: doc.zielAdresse as string,
      kilometer: doc.kilometer as number,
      istFavorit: doc.istFavorit as boolean || false,
      sortierung: doc.sortierung as number || 0,
    };
  },
};
