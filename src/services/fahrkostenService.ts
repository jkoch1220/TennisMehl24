import {
  databases,
  DATABASE_ID,
  FAHRTEN_COLLECTION_ID,
  DEFAULT_STRECKEN_COLLECTION_ID,
  FAHRTKOSTEN_PERSONEN_COLLECTION_ID,
  FAHRTKOSTEN_AUTOS_COLLECTION_ID,
  FAHRTKOSTEN_FIRMEN_COLLECTION_ID,
} from '../config/appwrite';
import {
  Fahrt,
  NeueFahrt,
  DefaultStrecke,
  Person,
  Auto,
  Firma,
  FahrkostenFilter,
  DEFAULT_KILOMETER_PAUSCHALE,
  STANDARD_STRECKEN,
  MonatsZusammenfassung,
} from '../types/fahrtkosten';
import { ID, Query } from 'appwrite';
import { loadAllDocuments } from '../utils/appwritePagination';

// Fahrten werden mit echten Appwrite-Attributen gespeichert.
// Mapping: personId -> fahrer, personName -> fahrerName, kommentar -> notizen.

export const fahrkostenService = {
  // ==================== FAHRTEN ====================

  async ladeAlleFahrten(): Promise<Fahrt[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, FAHRTEN_COLLECTION_ID);
      return documents
        .map(doc => this.parseFahrtDocument(doc))
        .sort((a, b) => b.datum.localeCompare(a.datum)); // Neueste zuerst
    } catch (error) {
      console.error('Fehler beim Laden der Fahrten:', error);
      return [];
    }
  },

  /** Erstellt das Appwrite-Payload aus einer (berechneten) Fahrt */
  buildFahrtPayload(fahrt: Fahrt) {
    return {
      datum: fahrt.datum,
      fahrer: fahrt.personId,
      fahrerName: fahrt.personName,
      autoId: fahrt.autoId || null,
      autoName: fahrt.autoName || null,
      firmaId: fahrt.firmaId || null,
      firmaName: fahrt.firmaName || null,
      startort: fahrt.startort,
      startAdresse: fahrt.startAdresse,
      zielort: fahrt.zielort,
      zielAdresse: fahrt.zielAdresse,
      kilometer: fahrt.kilometer,
      kilometerPauschale: fahrt.kilometerPauschale,
      betrag: fahrt.betrag,
      hinpirsUndZurueck: fahrt.hinpirsUndZurueck,
      notizen: fahrt.kommentar || null,
      defaultStreckeId: fahrt.defaultStreckeId || null,
    };
  },

  /** Berechnet die Fahrt-Felder (km verdoppeln, Betrag) aus den Eingaben */
  berechneFahrt(neueFahrt: NeueFahrt, id: string, jetzt: string): Fahrt {
    const pauschale = neueFahrt.kilometerPauschale ?? DEFAULT_KILOMETER_PAUSCHALE;
    const km = neueFahrt.hinpirsUndZurueck ? neueFahrt.kilometer * 2 : neueFahrt.kilometer;
    return {
      id,
      datum: neueFahrt.datum,
      personId: neueFahrt.personId,
      personName: neueFahrt.personName,
      autoId: neueFahrt.autoId,
      autoName: neueFahrt.autoName,
      firmaId: neueFahrt.firmaId,
      firmaName: neueFahrt.firmaName,
      startort: neueFahrt.startort,
      startAdresse: neueFahrt.startAdresse,
      zielort: neueFahrt.zielort,
      zielAdresse: neueFahrt.zielAdresse,
      kilometer: km,
      kilometerPauschale: pauschale,
      betrag: Math.round(km * pauschale * 100) / 100,
      hinpirsUndZurueck: neueFahrt.hinpirsUndZurueck ?? false,
      kommentar: neueFahrt.kommentar,
      defaultStreckeId: neueFahrt.defaultStreckeId,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };
  },

  async erstelleFahrt(neueFahrt: NeueFahrt): Promise<Fahrt> {
    const jetzt = new Date().toISOString();
    const id = ID.unique();
    const fahrt = this.berechneFahrt(neueFahrt, id, jetzt);

    await databases.createDocument(
      DATABASE_ID,
      FAHRTEN_COLLECTION_ID,
      id,
      this.buildFahrtPayload(fahrt)
    );

    return fahrt;
  },

  /** Quick-Add: für jeden Tag eine eigene Fahrt anlegen (gleiche Strecke/Firma/Auto) */
  async erstelleFahrtenFuerTage(
    basis: Omit<NeueFahrt, 'datum'>,
    tage: string[]
  ): Promise<Fahrt[]> {
    const erstellte: Fahrt[] = [];
    for (const datum of tage) {
      const fahrt = await this.erstelleFahrt({ ...basis, datum });
      erstellte.push(fahrt);
    }
    return erstellte;
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
      this.buildFahrtPayload(aktualisiert)
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

  // ==================== PERSONEN ====================

  async ladePersonen(): Promise<Person[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, FAHRTKOSTEN_PERSONEN_COLLECTION_ID, [Query.limit(100)]);
      return response.documents
        .map(doc => this.parseStammDocument(doc) as Person)
        .sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Fehler beim Laden der Personen:', error);
      return [];
    }
  },

  async erstellePerson(person: Omit<Person, 'id'>): Promise<Person> {
    const id = ID.unique();
    await databases.createDocument(DATABASE_ID, FAHRTKOSTEN_PERSONEN_COLLECTION_ID, id, {
      name: person.name,
      aktiv: person.aktiv,
      sortierung: person.sortierung,
    });
    return { ...person, id };
  },

  async aktualisierePerson(id: string, daten: Partial<Omit<Person, 'id'>>): Promise<void> {
    await databases.updateDocument(DATABASE_ID, FAHRTKOSTEN_PERSONEN_COLLECTION_ID, id, daten);
  },

  async loeschePerson(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, FAHRTKOSTEN_PERSONEN_COLLECTION_ID, id);
  },

  // ==================== AUTOS ====================

  async ladeAutos(): Promise<Auto[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, FAHRTKOSTEN_AUTOS_COLLECTION_ID, [Query.limit(100)]);
      return response.documents
        .map(doc => ({
          id: doc.$id as string,
          name: (doc.name as string) || '',
          kmPauschale: (doc.kmPauschale as number) ?? DEFAULT_KILOMETER_PAUSCHALE,
          aktiv: (doc.aktiv as boolean) ?? true,
          sortierung: (doc.sortierung as number) || 0,
        }))
        .sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Fehler beim Laden der Autos:', error);
      return [];
    }
  },

  async erstelleAuto(auto: Omit<Auto, 'id'>): Promise<Auto> {
    const id = ID.unique();
    await databases.createDocument(DATABASE_ID, FAHRTKOSTEN_AUTOS_COLLECTION_ID, id, {
      name: auto.name,
      kmPauschale: auto.kmPauschale,
      aktiv: auto.aktiv,
      sortierung: auto.sortierung,
    });
    return { ...auto, id };
  },

  async aktualisiereAuto(id: string, daten: Partial<Omit<Auto, 'id'>>): Promise<void> {
    await databases.updateDocument(DATABASE_ID, FAHRTKOSTEN_AUTOS_COLLECTION_ID, id, daten);
  },

  async loescheAuto(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, FAHRTKOSTEN_AUTOS_COLLECTION_ID, id);
  },

  // ==================== FIRMEN ====================

  async ladeFirmen(): Promise<Firma[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, FAHRTKOSTEN_FIRMEN_COLLECTION_ID, [Query.limit(500)]);
      return response.documents
        .map(doc => this.parseStammDocument(doc) as Firma)
        .sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Fehler beim Laden der Firmen:', error);
      return [];
    }
  },

  async erstelleFirma(firma: Omit<Firma, 'id'>): Promise<Firma> {
    const id = ID.unique();
    await databases.createDocument(DATABASE_ID, FAHRTKOSTEN_FIRMEN_COLLECTION_ID, id, {
      name: firma.name,
      aktiv: firma.aktiv,
      sortierung: firma.sortierung,
    });
    return { ...firma, id };
  },

  async aktualisiereFirma(id: string, daten: Partial<Omit<Firma, 'id'>>): Promise<void> {
    await databases.updateDocument(DATABASE_ID, FAHRTKOSTEN_FIRMEN_COLLECTION_ID, id, daten);
  },

  async loescheFirma(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, FAHRTKOSTEN_FIRMEN_COLLECTION_ID, id);
  },

  // ==================== DEFAULT STRECKEN (Vorlagen) ====================

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
    const neueStrecke: DefaultStrecke = { ...strecke, id };

    await databases.createDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      id,
      this.buildStreckePayload(neueStrecke)
    );

    return neueStrecke;
  },

  async aktualisiereDefaultStrecke(id: string, daten: Partial<DefaultStrecke>): Promise<DefaultStrecke> {
    const existierend = await this.ladeDefaultStrecke(id);
    if (!existierend) {
      throw new Error('Strecke nicht gefunden');
    }

    const aktualisiert: DefaultStrecke = { ...existierend, ...daten };

    await databases.updateDocument(
      DATABASE_ID,
      DEFAULT_STRECKEN_COLLECTION_ID,
      id,
      this.buildStreckePayload(aktualisiert)
    );

    return aktualisiert;
  },

  buildStreckePayload(strecke: DefaultStrecke) {
    return {
      name: strecke.name,
      startort: strecke.startort,
      startAdresse: strecke.startAdresse,
      zielort: strecke.zielort,
      zielAdresse: strecke.zielAdresse,
      kilometer: strecke.kilometer,
      istFavorit: strecke.istFavorit,
      sortierung: strecke.sortierung,
      standardAutoId: strecke.standardAutoId || null,
      standardHinUndZurueck: strecke.standardHinUndZurueck ?? false,
    };
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

  // ==================== FILTER & ZUSAMMENFASSUNGEN ====================

  /** Filtert Fahrten nach Person, Firma und Zeitraum (alle optional) */
  filtereFahrten(fahrten: Fahrt[], filter: FahrkostenFilter): Fahrt[] {
    return fahrten.filter(f => {
      if (filter.personId && f.personId !== filter.personId) return false;
      if (filter.firmaId && f.firmaId !== filter.firmaId) return false;
      if (filter.von && f.datum < filter.von) return false;
      if (filter.bis && f.datum > filter.bis) return false;
      return true;
    });
  },

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

  parseStammDocument(doc: Record<string, unknown>): Person | Firma {
    return {
      id: doc.$id as string,
      name: (doc.name as string) || '',
      aktiv: (doc.aktiv as boolean) ?? true,
      sortierung: (doc.sortierung as number) || 0,
    };
  },

  parseFahrtDocument(doc: Record<string, unknown>): Fahrt {
    return {
      id: doc.$id as string,
      datum: (doc.datum as string) || '',
      personId: (doc.fahrer as string) || '',
      personName: (doc.fahrerName as string) || '',
      autoId: (doc.autoId as string) || undefined,
      autoName: (doc.autoName as string) || undefined,
      firmaId: (doc.firmaId as string) || '',
      firmaName: (doc.firmaName as string) || '',
      startort: (doc.startort as string) || '',
      startAdresse: (doc.startAdresse as string) || '',
      zielort: (doc.zielort as string) || '',
      zielAdresse: (doc.zielAdresse as string) || '',
      kilometer: (doc.kilometer as number) || 0,
      kilometerPauschale: (doc.kilometerPauschale as number) || DEFAULT_KILOMETER_PAUSCHALE,
      betrag: (doc.betrag as number) || 0,
      hinpirsUndZurueck: (doc.hinpirsUndZurueck as boolean) || false,
      kommentar: (doc.notizen as string) || undefined,
      defaultStreckeId: (doc.defaultStreckeId as string) || undefined,
      erstelltAm: (doc.$createdAt as string) || '',
      geaendertAm: (doc.$updatedAt as string) || '',
    };
  },

  parseDefaultStreckeDocument(doc: Record<string, unknown>): DefaultStrecke {
    return {
      id: doc.$id as string,
      name: (doc.name as string) || '',
      startort: (doc.startort as string) || '',
      startAdresse: (doc.startAdresse as string) || '',
      zielort: (doc.zielort as string) || '',
      zielAdresse: (doc.zielAdresse as string) || '',
      kilometer: (doc.kilometer as number) || 0,
      istFavorit: (doc.istFavorit as boolean) || false,
      sortierung: (doc.sortierung as number) || 0,
      standardAutoId: (doc.standardAutoId as string) || undefined,
      standardHinUndZurueck: (doc.standardHinUndZurueck as boolean) || false,
    };
  },
};
