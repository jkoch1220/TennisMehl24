import { ID, Query, Models } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  SAISON_KUNDEN_COLLECTION_ID,
  SAISON_ANSPRECHPARTNER_COLLECTION_ID,
  SAISON_DATEN_COLLECTION_ID,
  SAISON_BEZIEHUNGEN_COLLECTION_ID,
  SAISON_AKTIVITAETEN_COLLECTION_ID,
} from '../config/appwrite';
import {
  SaisonKunde,
  NeuerSaisonKunde,
  Ansprechpartner,
  NeuerAnsprechpartner,
  SaisonDaten,
  NeueSaisonDaten,
  VereinPlatzbauerBeziehung,
  NeueVereinPlatzbauerBeziehung,
  SaisonAktivitaet,
  NeueSaisonAktivitaet,
  SaisonKundeMitDaten,
  CallListeFilter,
  SaisonplanungStatistik,
  GespraechsStatus,
  KundenTyp,
  AnrufStatus,
  AnrufErgebnis,
} from '../types/saisonplanung';
import { cacheService } from './cacheService';

// Helper: Parse Document mit data-Feld
function parseDocument<T>(doc: Models.Document, fallback: T): T {
  const anyDoc = doc as any;
  if (anyDoc?.data && typeof anyDoc.data === 'string') {
    try {
      const parsed = JSON.parse(anyDoc.data) as T;
      return {
        ...parsed,
        id: (parsed as any).id || doc.$id,
      };
    } catch (error) {
      console.warn('⚠️ Konnte Dokument nicht parsen:', error);
    }
  }
  return fallback;
}

// Helper: To Payload für Appwrite
// Nur die explizit übergebenen Attribute werden neben dem data-Feld gesetzt,
// um Unknown-Attribute-Fehler zu vermeiden.
function toPayload<T extends Record<string, any>>(
  obj: T,
  allowedKeys: string[] = []
): Record<string, any> {
  const payload: Record<string, any> = { data: JSON.stringify(obj) };
  for (const key of allowedKeys) {
    if (key in obj) payload[key] = (obj as any)[key];
  }
  return payload;
}

async function updatePreisHistorie(
  kundeId: string,
  preisProTonne: number | undefined,
  saisonjahr: number,
  updateKundeFn: (id: string, kunde: Partial<SaisonKunde>) => Promise<SaisonKunde>,
  loadKundeFn: (id: string) => Promise<SaisonKunde | null>
) {
  if (preisProTonne === undefined) return;
  const kunde = await loadKundeFn(kundeId);
  if (!kunde) return;

  const preisHistorie = kunde.preisHistorie ? [...kunde.preisHistorie] : [];
  const existierendIndex = preisHistorie.findIndex((p) => p.saisonjahr === saisonjahr);

  const eintrag = {
    saisonjahr,
    preisProTonne,
    geaendertAm: new Date().toISOString(),
  };

  if (existierendIndex >= 0) {
    preisHistorie[existierendIndex] = eintrag;
  } else {
    preisHistorie.push(eintrag);
  }

  await updateKundeFn(kundeId, {
    zuletztGezahlterPreis: preisProTonne,
    preisHistorie,
  });
}

async function setzeReferenzmengeFolgejahr(
  kundeId: string,
  saisonjahr: number,
  tatsaechlicheMenge: number | undefined,
  loadAktuelleSaisonFn: (kundeId: string, saisonjahr: number) => Promise<SaisonDaten | null>,
  updateSaisonFn: (id: string, daten: Partial<SaisonDaten>) => Promise<SaisonDaten>
) {
  if (tatsaechlicheMenge === undefined) return;
  const naechsteSaison = await loadAktuelleSaisonFn(kundeId, saisonjahr + 1);
  if (naechsteSaison) {
    await updateSaisonFn(naechsteSaison.id, { referenzmenge: tatsaechlicheMenge });
  }
}

export const saisonplanungService = {
  // ========== KUNDEN ==========

  async loadAlleKunden(): Promise<SaisonKunde[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        [Query.limit(5000), Query.orderDesc('$createdAt')]
      );
      return response.documents.map((doc) =>
        parseDocument<SaisonKunde>(doc, {
          id: doc.$id,
          typ: 'verein',
          name: '',
          adresse: { strasse: '', plz: '', ort: '', bundesland: '' },
          aktiv: true,
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
      return [];
    }
  },

  async loadKunde(id: string): Promise<SaisonKunde | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        id
      );
      return parseDocument<SaisonKunde>(doc, {
        id: doc.$id,
        typ: 'verein',
        name: '',
        adresse: { strasse: '', plz: '', ort: '', bundesland: '' },
        aktiv: true,
        erstelltAm: doc.$createdAt,
        geaendertAm: doc.$updatedAt || doc.$createdAt,
      });
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
      return null;
    }
  },

  async createKunde(kunde: NeuerSaisonKunde): Promise<SaisonKunde> {
    const jetzt = new Date().toISOString();
    const neuerKunde: SaisonKunde = {
      ...kunde,
      id: kunde.id || ID.unique(),
      adresse: {
        strasse: kunde.adresse?.strasse || '',
        plz: kunde.adresse?.plz || '',
        ort: kunde.adresse?.ort || '',
        bundesland: kunde.adresse?.bundesland || '',
      },
      aktiv: kunde.aktiv !== undefined ? kunde.aktiv : true,
      beziehtUeberUnsPlatzbauer: kunde.beziehtUeberUnsPlatzbauer ?? false,
      abwerkspreis: kunde.abwerkspreis ?? false,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        neuerKunde.id,
        toPayload(neuerKunde) // Collection hat nur "data"
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('statistik');
      cacheService.invalidate('dashboard');
      
      return parseDocument<SaisonKunde>(doc, neuerKunde);
    } catch (error) {
      console.error('Fehler beim Erstellen des Kunden:', error);
      throw error;
    }
  },

  async updateKunde(id: string, kunde: Partial<SaisonKunde>): Promise<SaisonKunde> {
    const aktuell = await this.loadKunde(id);
    if (!aktuell) {
      throw new Error(`Kunde ${id} nicht gefunden`);
    }

    const aktualisiert: SaisonKunde = {
      ...aktuell,
      ...kunde,
      id,
      adresse: {
        strasse: kunde.adresse?.strasse || aktuell.adresse.strasse,
        plz: kunde.adresse?.plz || aktuell.adresse.plz,
        ort: kunde.adresse?.ort || aktuell.adresse.ort,
        bundesland:
          kunde.adresse?.bundesland !== undefined
            ? kunde.adresse?.bundesland
            : aktuell.adresse.bundesland,
      },
      beziehtUeberUnsPlatzbauer:
        kunde.beziehtUeberUnsPlatzbauer !== undefined
          ? kunde.beziehtUeberUnsPlatzbauer
          : aktuell.beziehtUeberUnsPlatzbauer,
      abwerkspreis:
        kunde.abwerkspreis !== undefined
          ? kunde.abwerkspreis
          : aktuell.abwerkspreis,
      geaendertAm: new Date().toISOString(),
    };

    try {
      const doc = await databases.updateDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        id,
        toPayload(aktualisiert) // Collection hat nur "data"
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('statistik');
      cacheService.invalidate('dashboard');
      
      return parseDocument<SaisonKunde>(doc, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kunden:', error);
      throw error;
    }
  },

  async deleteKunde(id: string): Promise<void> {
    // Lösche auch alle abhängigen Daten
    await Promise.all([
      this.deleteAnsprechpartnerFuerKunde(id),
      this.deleteSaisonDatenFuerKunde(id),
      this.deleteBeziehungenFuerKunde(id),
      this.deleteAktivitaetenFuerKunde(id),
    ]);
    await databases.deleteDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, id);

    // Cache invalidieren
    cacheService.invalidate('callliste');
    cacheService.invalidate('statistik');
    cacheService.invalidate('dashboard');
  },

  // Kunde anhand der Kundennummer finden
  async loadKundeByKundennummer(kundennummer: string): Promise<SaisonKunde | null> {
    if (!kundennummer) return null;

    try {
      // Lade alle Kunden und suche nach Kundennummer
      const alleKunden = await this.loadAlleKunden();
      const gefunden = alleKunden.find(
        (k) => k.kundennummer?.toLowerCase() === kundennummer.toLowerCase()
      );
      return gefunden || null;
    } catch (error) {
      console.error('Fehler beim Suchen des Kunden nach Kundennummer:', error);
      return null;
    }
  },

  // Preis nach Rechnungsstellung aktualisieren (Last Year Price)
  async aktualisiereKundenPreisNachRechnung(
    kundennummer: string,
    preisProTonne: number,
    mengeInTonnen: number,
    saisonjahr: number
  ): Promise<void> {
    if (!kundennummer || !preisProTonne) return;

    try {
      const kunde = await this.loadKundeByKundennummer(kundennummer);
      if (!kunde) {
        console.warn(`Kunde mit Kundennummer ${kundennummer} nicht in Saisonplanung gefunden`);
        return;
      }

      // Preis-Historie aktualisieren
      await updatePreisHistorie(
        kunde.id,
        preisProTonne,
        saisonjahr,
        this.updateKunde.bind(this),
        this.loadKunde.bind(this)
      );

      // Tonnen letztes Jahr aktualisieren
      if (mengeInTonnen > 0) {
        await this.updateKunde(kunde.id, {
          tonnenLetztesJahr: mengeInTonnen
        });
      }

      console.log(`✓ Kundenpreis aktualisiert: ${kunde.name} - ${preisProTonne}€/t, ${mengeInTonnen}t (Saison ${saisonjahr})`);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kundenpreises:', error);
    }
  },

  // ========== ANSPRECHPARTNER ==========

  async loadAnsprechpartnerFuerKunde(kundeId: string): Promise<Ansprechpartner[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        [Query.equal('kundeId', kundeId), Query.limit(500)]
      );
      return response.documents.map((doc) =>
        parseDocument<Ansprechpartner>(doc, {
          id: doc.$id,
          kundeId,
          name: '',
          telefonnummern: [],
          aktiv: true,
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Ansprechpartner:', error);
      return [];
    }
  },

  async createAnsprechpartner(
    ansprechpartner: NeuerAnsprechpartner
  ): Promise<Ansprechpartner> {
    const jetzt = new Date().toISOString();
    const neuerAnsprechpartner: Ansprechpartner = {
      ...ansprechpartner,
      id: ansprechpartner.id || ID.unique(),
      telefonnummern: ansprechpartner.telefonnummern || [],
      aktiv: ansprechpartner.aktiv !== undefined ? ansprechpartner.aktiv : true,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        neuerAnsprechpartner.id,
        {
          kundeId: neuerAnsprechpartner.kundeId,
          data: JSON.stringify(neuerAnsprechpartner),
        }
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('dashboard');
      
      return parseDocument<Ansprechpartner>(doc, neuerAnsprechpartner);
    } catch (error) {
      console.error('Fehler beim Erstellen des Ansprechpartners:', error);
      throw error;
    }
  },

  async updateAnsprechpartner(
    id: string,
    ansprechpartner: Partial<Ansprechpartner>
  ): Promise<Ansprechpartner> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        id
      );
      const aktuell = parseDocument<Ansprechpartner>(doc, {
        id: doc.$id,
        kundeId: '',
        name: '',
        telefonnummern: [],
        aktiv: true,
        erstelltAm: doc.$createdAt,
        geaendertAm: doc.$updatedAt || doc.$createdAt,
      });

      const aktualisiert: Ansprechpartner = {
        ...aktuell,
        ...ansprechpartner,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const updatedDoc = await databases.updateDocument(
        DATABASE_ID,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        id,
        {
          kundeId: aktualisiert.kundeId,
          data: JSON.stringify(aktualisiert),
        }
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('dashboard');
      
      return parseDocument<Ansprechpartner>(updatedDoc, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Ansprechpartners:', error);
      throw error;
    }
  },

  async deleteAnsprechpartner(id: string): Promise<void> {
    await databases.deleteDocument(
      DATABASE_ID,
      SAISON_ANSPRECHPARTNER_COLLECTION_ID,
      id
    );
    
    // Cache invalidieren
    cacheService.invalidate('callliste');
    cacheService.invalidate('dashboard');
  },

  async deleteAnsprechpartnerFuerKunde(kundeId: string): Promise<void> {
    const ansprechpartner = await this.loadAnsprechpartnerFuerKunde(kundeId);
    await Promise.all(ansprechpartner.map((ap) => this.deleteAnsprechpartner(ap.id)));
  },

  // ========== SAISON-DATEN ==========

  async loadSaisonDatenFuerKunde(kundeId: string): Promise<SaisonDaten[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.equal('kundeId', kundeId), Query.orderDesc('saisonjahr'), Query.limit(100)]
      );
      return response.documents.map((doc) =>
        parseDocument<SaisonDaten>(doc, {
          id: doc.$id,
          kundeId,
          saisonjahr: 2026, // Aktuelle Saison
          gespraechsstatus: 'offen',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Saison-Daten:', error);
      return [];
    }
  },

  async loadAktuelleSaisonDaten(kundeId: string, saisonjahr: number): Promise<SaisonDaten | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.equal('kundeId', kundeId), Query.equal('saisonjahr', saisonjahr), Query.limit(1)]
      );
      if (response.documents.length === 0) return null;
      return parseDocument<SaisonDaten>(response.documents[0], {
        id: response.documents[0].$id,
        kundeId,
        saisonjahr,
        gespraechsstatus: 'offen',
        erstelltAm: response.documents[0].$createdAt,
        geaendertAm: response.documents[0].$updatedAt || response.documents[0].$createdAt,
      });
    } catch (error) {
      console.error('Fehler beim Laden der aktuellen Saison-Daten:', error);
      return null;
    }
  },

  async createSaisonDaten(saisonDaten: NeueSaisonDaten): Promise<SaisonDaten> {
    const jetzt = new Date().toISOString();
    const neueSaisonDaten: SaisonDaten = {
      ...saisonDaten,
      id: saisonDaten.id || ID.unique(),
      gespraechsstatus: saisonDaten.gespraechsstatus || 'offen',
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        neueSaisonDaten.id,
        toPayload(neueSaisonDaten, ['kundeId', 'saisonjahr'])
      );
      const parsed = parseDocument<SaisonDaten>(doc, neueSaisonDaten);
      await updatePreisHistorie(
        parsed.kundeId,
        parsed.preisProTonne,
        parsed.saisonjahr,
        this.updateKunde.bind(this),
        this.loadKunde.bind(this)
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('statistik');
      cacheService.invalidate('dashboard');
      
      return parsed;
    } catch (error) {
      console.error('Fehler beim Erstellen der Saison-Daten:', error);
      throw error;
    }
  },

  async updateSaisonDaten(id: string, saisonDaten: Partial<SaisonDaten>): Promise<SaisonDaten> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        id
      );
      const aktuell = parseDocument<SaisonDaten>(doc, {
        id: doc.$id,
        kundeId: '',
        saisonjahr: 2026, // Aktuelle Saison
        gespraechsstatus: 'offen',
        erstelltAm: doc.$createdAt,
        geaendertAm: doc.$updatedAt || doc.$createdAt,
      });

      const aktualisiert: SaisonDaten = {
        ...aktuell,
        ...saisonDaten,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const updatedDoc = await databases.updateDocument(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        id,
        toPayload(aktualisiert, ['kundeId', 'saisonjahr'])
      );
      const parsed = parseDocument<SaisonDaten>(updatedDoc, aktualisiert);
      await updatePreisHistorie(
        parsed.kundeId,
        parsed.preisProTonne,
        parsed.saisonjahr,
        this.updateKunde.bind(this),
        this.loadKunde.bind(this)
      );
      await setzeReferenzmengeFolgejahr(
        parsed.kundeId,
        parsed.saisonjahr,
        parsed.tatsaechlicheMenge,
        this.loadAktuelleSaisonDaten.bind(this),
        this.updateSaisonDaten.bind(this)
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('statistik');
      cacheService.invalidate('dashboard');
      
      return parsed;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Saison-Daten:', error);
      throw error;
    }
  },

  async deleteSaisonDatenFuerKunde(kundeId: string): Promise<void> {
    const saisonDaten = await this.loadSaisonDatenFuerKunde(kundeId);
    await Promise.all(
      saisonDaten.map((sd) =>
        databases.deleteDocument(DATABASE_ID, SAISON_DATEN_COLLECTION_ID, sd.id)
      )
    );
  },

  // ========== BEZIEHUNGEN ==========

  async loadBeziehungenFuerVerein(vereinId: string): Promise<VereinPlatzbauerBeziehung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        [Query.equal('vereinId', vereinId), Query.limit(100)]
      );
      return response.documents.map((doc) =>
        parseDocument<VereinPlatzbauerBeziehung>(doc, {
          id: doc.$id,
          vereinId,
          platzbauerId: '',
          status: 'aktiv',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Beziehungen:', error);
      return [];
    }
  },

  async loadBeziehungenFuerPlatzbauer(platzbauerId: string): Promise<VereinPlatzbauerBeziehung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        [Query.equal('platzbauerId', platzbauerId), Query.limit(100)]
      );
      return response.documents.map((doc) =>
        parseDocument<VereinPlatzbauerBeziehung>(doc, {
          id: doc.$id,
          vereinId: '',
          platzbauerId,
          status: 'aktiv',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Beziehungen:', error);
      return [];
    }
  },

  async createBeziehung(
    beziehung: NeueVereinPlatzbauerBeziehung
  ): Promise<VereinPlatzbauerBeziehung> {
    const jetzt = new Date().toISOString();
    const neueBeziehung: VereinPlatzbauerBeziehung = {
      ...beziehung,
      id: beziehung.id || ID.unique(),
      status: beziehung.status || 'aktiv',
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        neueBeziehung.id,
        toPayload(neueBeziehung, ['vereinId', 'platzbauerId'])
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('dashboard');
      
      return parseDocument<VereinPlatzbauerBeziehung>(doc, neueBeziehung);
    } catch (error) {
      console.error('Fehler beim Erstellen der Beziehung:', error);
      throw error;
    }
  },

  async updateBeziehung(
    id: string,
    beziehung: Partial<VereinPlatzbauerBeziehung>
  ): Promise<VereinPlatzbauerBeziehung> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        id
      );
      const aktuell = parseDocument<VereinPlatzbauerBeziehung>(doc, {
        id: doc.$id,
        vereinId: '',
        platzbauerId: '',
        status: 'aktiv',
        erstelltAm: doc.$createdAt,
        geaendertAm: doc.$updatedAt || doc.$createdAt,
      });

      const aktualisiert: VereinPlatzbauerBeziehung = {
        ...aktuell,
        ...beziehung,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const updatedDoc = await databases.updateDocument(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        id,
        toPayload(aktualisiert, ['vereinId', 'platzbauerId'])
      );
      
      // Cache invalidieren
      cacheService.invalidate('callliste');
      cacheService.invalidate('dashboard');
      
      return parseDocument<VereinPlatzbauerBeziehung>(updatedDoc, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Beziehung:', error);
      throw error;
    }
  },

  async deleteBeziehung(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, SAISON_BEZIEHUNGEN_COLLECTION_ID, id);
    
    // Cache invalidieren
    cacheService.invalidate('callliste');
    cacheService.invalidate('dashboard');
  },

  async deleteBeziehungenFuerKunde(kundeId: string): Promise<void> {
    const [alsVerein, alsPlatzbauer] = await Promise.all([
      this.loadBeziehungenFuerVerein(kundeId),
      this.loadBeziehungenFuerPlatzbauer(kundeId),
    ]);
    await Promise.all([
      ...alsVerein.map((b) => this.deleteBeziehung(b.id)),
      ...alsPlatzbauer.map((b) => this.deleteBeziehung(b.id)),
    ]);
  },

  // ========== AKTIVITÄTEN ==========

  async loadAktivitaetenFuerKunde(kundeId: string): Promise<SaisonAktivitaet[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_AKTIVITAETEN_COLLECTION_ID,
        [Query.equal('kundeId', kundeId), Query.orderDesc('erstelltAm'), Query.limit(500)]
      );
      return response.documents.map((doc) =>
        parseDocument<SaisonAktivitaet>(doc, {
          id: doc.$id,
          kundeId,
          typ: 'kommentar',
          titel: '',
          erstelltAm: doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
      return [];
    }
  },

  async createAktivitaet(
    aktivitaet: NeueSaisonAktivitaet
  ): Promise<SaisonAktivitaet> {
    const jetzt = new Date().toISOString();
    const neueAktivitaet: SaisonAktivitaet = {
      ...aktivitaet,
      id: aktivitaet.id || ID.unique(),
      erstelltAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_AKTIVITAETEN_COLLECTION_ID,
        neueAktivitaet.id,
        {
          kundeId: neueAktivitaet.kundeId,
          erstelltAm: neueAktivitaet.erstelltAm,
          data: JSON.stringify(neueAktivitaet),
        }
      );
      return parseDocument<SaisonAktivitaet>(doc, neueAktivitaet);
    } catch (error) {
      console.error('Fehler beim Erstellen der Aktivität:', error);
      throw error;
    }
  },

  async deleteAktivitaetenFuerKunde(kundeId: string): Promise<void> {
    const aktivitaeten = await this.loadAktivitaetenFuerKunde(kundeId);
    await Promise.all(
      aktivitaeten.map((a) =>
        databases.deleteDocument(DATABASE_ID, SAISON_AKTIVITAETEN_COLLECTION_ID, a.id)
      )
    );
  },

  // ========== BATCH-LOADING FUNKTIONEN (Performance-Optimierung) ==========

  /**
   * Lädt ALLE Ansprechpartner in einer Query und gruppiert sie nach kundeId
   * Ersetzt hunderte einzelne Queries durch eine einzige
   */
  async loadAlleAnsprechpartner(): Promise<Map<string, Ansprechpartner[]>> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        [Query.limit(5000)] // Lade alle Ansprechpartner
      );

      const ansprechpartnerMap = new Map<string, Ansprechpartner[]>();
      
      for (const doc of response.documents) {
        const ansprechpartner = parseDocument<Ansprechpartner>(doc, {
          id: doc.$id,
          kundeId: '',
          name: '',
          telefonnummern: [],
          aktiv: true,
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        });

        if (!ansprechpartnerMap.has(ansprechpartner.kundeId)) {
          ansprechpartnerMap.set(ansprechpartner.kundeId, []);
        }
        ansprechpartnerMap.get(ansprechpartner.kundeId)!.push(ansprechpartner);
      }

      return ansprechpartnerMap;
    } catch (error) {
      console.error('Fehler beim Batch-Laden der Ansprechpartner:', error);
      return new Map();
    }
  },

  /**
   * Lädt ALLE Saison-Daten für ein bestimmtes Jahr in einer Query
   * Gruppiert nach kundeId für schnellen Zugriff
   */
  async loadAlleSaisonDatenFuerJahr(saisonjahr: number): Promise<Map<string, SaisonDaten>> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.equal('saisonjahr', saisonjahr), Query.limit(5000)]
      );

      const saisonDatenMap = new Map<string, SaisonDaten>();
      
      for (const doc of response.documents) {
        const saisonDaten = parseDocument<SaisonDaten>(doc, {
          id: doc.$id,
          kundeId: '',
          saisonjahr,
          gespraechsstatus: 'offen',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        });

        saisonDatenMap.set(saisonDaten.kundeId, saisonDaten);
      }

      return saisonDatenMap;
    } catch (error) {
      console.error('Fehler beim Batch-Laden der Saison-Daten:', error);
      return new Map();
    }
  },

  /**
   * Lädt ALLE Beziehungen in einer Query
   * Gruppiert sowohl nach vereinId als auch platzbauerId
   */
  async loadAlleBeziehungen(): Promise<{
    alsVerein: Map<string, VereinPlatzbauerBeziehung[]>;
    alsPlatzbauer: Map<string, VereinPlatzbauerBeziehung[]>;
  }> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        [Query.limit(5000)]
      );

      const alsVerein = new Map<string, VereinPlatzbauerBeziehung[]>();
      const alsPlatzbauer = new Map<string, VereinPlatzbauerBeziehung[]>();
      
      for (const doc of response.documents) {
        const beziehung = parseDocument<VereinPlatzbauerBeziehung>(doc, {
          id: doc.$id,
          vereinId: '',
          platzbauerId: '',
          status: 'aktiv',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        });

        // Gruppiere nach vereinId
        if (!alsVerein.has(beziehung.vereinId)) {
          alsVerein.set(beziehung.vereinId, []);
        }
        alsVerein.get(beziehung.vereinId)!.push(beziehung);

        // Gruppiere nach platzbauerId
        if (!alsPlatzbauer.has(beziehung.platzbauerId)) {
          alsPlatzbauer.set(beziehung.platzbauerId, []);
        }
        alsPlatzbauer.get(beziehung.platzbauerId)!.push(beziehung);
      }

      return { alsVerein, alsPlatzbauer };
    } catch (error) {
      console.error('Fehler beim Batch-Laden der Beziehungen:', error);
      return { alsVerein: new Map(), alsPlatzbauer: new Map() };
    }
  },

  /**
   * Lädt ALLE Saison-Historie-Daten in einer Query
   * Gruppiert nach kundeId mit allen Jahren
   */
  async loadAlleSaisonHistorie(): Promise<Map<string, SaisonDaten[]>> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.orderDesc('saisonjahr'), Query.limit(5000)]
      );

      const historieMap = new Map<string, SaisonDaten[]>();
      
      for (const doc of response.documents) {
        const saisonDaten = parseDocument<SaisonDaten>(doc, {
          id: doc.$id,
          kundeId: '',
          saisonjahr: 2026, // Aktuelle Saison
          gespraechsstatus: 'offen',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        });

        if (!historieMap.has(saisonDaten.kundeId)) {
          historieMap.set(saisonDaten.kundeId, []);
        }
        historieMap.get(saisonDaten.kundeId)!.push(saisonDaten);
      }

      return historieMap;
    } catch (error) {
      console.error('Fehler beim Batch-Laden der Saison-Historie:', error);
      return new Map();
    }
  },

  // ========== ERWEITERTE FUNKTIONEN ==========

  async loadKundeMitDaten(
    kundeId: string,
    saisonjahr: number
  ): Promise<SaisonKundeMitDaten | null> {
    const kunde = await this.loadKunde(kundeId);
    if (!kunde) return null;

    const [
      ansprechpartner,
      saisonHistorie,
      aktivitaeten,
      beziehungenAlsVerein,
      beziehungenAlsPlatzbauer,
    ] = await Promise.all([
      this.loadAnsprechpartnerFuerKunde(kundeId),
      this.loadSaisonDatenFuerKunde(kundeId),
      this.loadAktivitaetenFuerKunde(kundeId),
      kunde.typ === 'verein' ? this.loadBeziehungenFuerVerein(kundeId) : Promise.resolve([]),
      kunde.typ === 'platzbauer' ? this.loadBeziehungenFuerPlatzbauer(kundeId) : Promise.resolve([]),
    ]);

    const aktuelleSaison = saisonHistorie.find((s) => s.saisonjahr === saisonjahr);

    return {
      kunde,
      ansprechpartner,
      aktuelleSaison,
      saisonHistorie,
      aktivitaeten,
      beziehungenAlsVerein: kunde.typ === 'verein' ? beziehungenAlsVerein : undefined,
      beziehungenAlsPlatzbauer: kunde.typ === 'platzbauer' ? beziehungenAlsPlatzbauer : undefined,
    };
  },

  /**
   * OPTIMIERTE Version: Lädt Call-Liste mit Batch-Loading + Caching
   * Reduziert von 1.200+ Queries auf nur 4-5 Queries!
   * Mit Cache: Wiederholte Aufrufe innerhalb 2 Sekunden aus Cache
   */
  async loadCallListe(filter: CallListeFilter = {}, saisonjahr: number): Promise<SaisonKundeMitDaten[]> {
    // Cache-Key basierend auf Filter und Jahr
    const cacheKey = `callliste_${saisonjahr}_${JSON.stringify(filter)}`;
    
    // Prüfe Cache
    const cached = cacheService.get<SaisonKundeMitDaten[]>(cacheKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log('✨ Cache-Hit: loadCallListe', { saisonjahr, filter });
      }
      return cached;
    }

    // Schritt 1: Lade ALLE Basis-Daten parallel in nur 4 Queries
    const [
      alleKunden,
      ansprechpartnerMap,
      saisonDatenMap,
      beziehungenMaps
    ] = await Promise.all([
      this.loadAlleKunden(),
      this.loadAlleAnsprechpartner(),
      this.loadAlleSaisonDatenFuerJahr(saisonjahr),
      this.loadAlleBeziehungen()
    ]);

    // Schritt 2: Filter auf Kunden anwenden (im Speicher, keine DB-Queries)
    let gefilterteKunden = alleKunden.filter((k) => k.aktiv);

    // Typ-Filter
    if (filter.typ && filter.typ.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) => filter.typ!.includes(k.typ));
    }

    // Bundesland-Filter
    if (filter.bundesland && filter.bundesland.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) =>
        filter.bundesland!.some(
          (bundesland) =>
            (k.adresse.bundesland || '').toLowerCase() === bundesland.toLowerCase()
        )
      );
    }

    // Such-Filter
    if (filter.suche) {
      const suche = filter.suche.toLowerCase();
      gefilterteKunden = gefilterteKunden.filter(
        (k) =>
          k.name.toLowerCase().includes(suche) ||
          k.adresse.ort.toLowerCase().includes(suche) ||
          k.kundennummer?.toLowerCase().includes(suche)
      );
    }

    // Schritt 3: Kombiniere Daten im Speicher (keine DB-Queries!)
    const kundenMitDaten: SaisonKundeMitDaten[] = gefilterteKunden.map((kunde) => {
      const ansprechpartner = ansprechpartnerMap.get(kunde.id) || [];
      const aktuelleSaison = saisonDatenMap.get(kunde.id);
      
      // Beziehungen basierend auf Typ
      const beziehungenAlsVerein = kunde.typ === 'verein' 
        ? beziehungenMaps.alsVerein.get(kunde.id) 
        : undefined;
      const beziehungenAlsPlatzbauer = kunde.typ === 'platzbauer' 
        ? beziehungenMaps.alsPlatzbauer.get(kunde.id) 
        : undefined;

      return {
        kunde,
        ansprechpartner,
        aktuelleSaison,
        saisonHistorie: aktuelleSaison ? [aktuelleSaison] : [], // Nur aktuelles Jahr
        aktivitaeten: [], // Lazy Loading - nur bei Bedarf laden
        beziehungenAlsVerein,
        beziehungenAlsPlatzbauer,
      };
    });

    // Schritt 4: Weitere Filter anwenden
    let result = kundenMitDaten;

    // Status-Filter
    if (filter.status && filter.status.length > 0) {
      result = result.filter(
        (k) =>
          filter.status!.includes(k.aktuelleSaison?.gespraechsstatus || ('offen' as GespraechsStatus))
      );
    }

    // Bezugsweg-Filter
    if (filter.bezugsweg && filter.bezugsweg.length > 0) {
      result = result.filter(
        (k) => k.aktuelleSaison && filter.bezugsweg!.includes(k.aktuelleSaison.bezugsweg || 'direkt')
      );
    }

    // Platzbauer-Filter
    if (filter.platzbauerId) {
      result = result.filter(
        (k) =>
          k.aktuelleSaison?.platzbauerId === filter.platzbauerId ||
          k.beziehungenAlsVerein?.some((b) => b.platzbauerId === filter.platzbauerId)
      );
    }

    // Speichere im Cache
    cacheService.set(cacheKey, result);

    return result;
  },

  /**
   * OPTIMIERTE Version: Berechnet Statistik mit Batch-Loading + Caching
   * Reduziert von 300+ Queries auf nur 2 Queries!
   * Mit Cache: Wiederholte Aufrufe innerhalb 2 Sekunden aus Cache
   */
  async berechneStatistik(saisonjahr: number): Promise<SaisonplanungStatistik> {
    // Cache-Key basierend auf Jahr
    const cacheKey = `statistik_${saisonjahr}`;
    
    // Prüfe Cache
    const cached = cacheService.get<SaisonplanungStatistik>(cacheKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log('✨ Cache-Hit: berechneStatistik', { saisonjahr });
      }
      return cached;
    }

    // Lade alle Daten parallel in nur 2 Queries
    const [alleKunden, saisonDatenMap] = await Promise.all([
      this.loadAlleKunden(),
      this.loadAlleSaisonDatenFuerJahr(saisonjahr)
    ]);

    const aktiveKunden = alleKunden.filter((k) => k.aktiv);

    let gesamtAngefragteMenge = 0;
    let gesamtTatsaechlicheMenge = 0;
    let offeneKunden = 0;
    let erledigteKunden = 0;

    const nachTyp: Record<KundenTyp, number> = { verein: 0, platzbauer: 0 };
    const nachStatus: Record<GespraechsStatus, number> = {
      offen: 0,
      in_bearbeitung: 0,
      erledigt: 0,
    };
    const nachBezugsweg: Record<'direkt' | 'direkt_instandsetzung' | 'ueber_platzbauer', number> = {
      direkt: 0,
      direkt_instandsetzung: 0,
      ueber_platzbauer: 0,
    };

    // Berechne Statistik im Speicher (keine DB-Queries mehr!)
    for (const kunde of aktiveKunden) {
      nachTyp[kunde.typ]++;

      const saisonDaten = saisonDatenMap.get(kunde.id);
      if (saisonDaten) {
        if (saisonDaten.angefragteMenge) {
          gesamtAngefragteMenge += saisonDaten.angefragteMenge;
        }
        if (saisonDaten.tatsaechlicheMenge) {
          gesamtTatsaechlicheMenge += saisonDaten.tatsaechlicheMenge;
        }

        nachStatus[saisonDaten.gespraechsstatus]++;
        if (saisonDaten.gespraechsstatus === 'offen') offeneKunden++;
        if (saisonDaten.gespraechsstatus === 'erledigt') erledigteKunden++;

        if (saisonDaten.bezugsweg) {
          nachBezugsweg[saisonDaten.bezugsweg]++;
        }
      } else {
        nachStatus.offen++;
        offeneKunden++;
      }
    }

    const statistik: SaisonplanungStatistik = {
      gesamtKunden: aktiveKunden.length,
      offeneKunden,
      erledigteKunden,
      gesamtAngefragteMenge,
      gesamtTatsaechlicheMenge,
      nachTyp,
      nachStatus,
      nachBezugsweg,
    };

    // Speichere im Cache
    cacheService.set(cacheKey, statistik);

    return statistik;
  },

  /**
   * SUPER-OPTIMIERT: Lädt Dashboard-Daten (CallListe + Statistik) in einem Durchgang
   * Verwendet die gleichen Batch-Queries für beide, um doppelte Abfragen zu vermeiden
   * Perfekt für die Kundenliste-Übersichtsseite
   */
  async loadSaisonplanungDashboard(
    filter: CallListeFilter = {},
    saisonjahr: number
  ): Promise<{
    callListe: SaisonKundeMitDaten[];
    statistik: SaisonplanungStatistik;
  }> {
    const cacheKey = `dashboard_${saisonjahr}_${JSON.stringify(filter)}`;
    
    // Prüfe Cache
    const cached = cacheService.get<{ callListe: SaisonKundeMitDaten[]; statistik: SaisonplanungStatistik }>(cacheKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log('✨ Cache-Hit: loadSaisonplanungDashboard', { saisonjahr, filter });
      }
      return cached;
    }

    // Lade ALLE Daten in nur 4 Queries (statt 600+ Queries!)
    const [
      alleKunden,
      ansprechpartnerMap,
      saisonDatenMap,
      beziehungenMaps
    ] = await Promise.all([
      this.loadAlleKunden(),
      this.loadAlleAnsprechpartner(),
      this.loadAlleSaisonDatenFuerJahr(saisonjahr),
      this.loadAlleBeziehungen()
    ]);

    // === Berechne Statistik im Speicher ===
    const aktiveKunden = alleKunden.filter((k) => k.aktiv);
    let gesamtAngefragteMenge = 0;
    let gesamtTatsaechlicheMenge = 0;
    let offeneKunden = 0;
    let erledigteKunden = 0;

    const nachTyp: Record<KundenTyp, number> = { verein: 0, platzbauer: 0 };
    const nachStatus: Record<GespraechsStatus, number> = {
      offen: 0,
      in_bearbeitung: 0,
      erledigt: 0,
    };
    const nachBezugsweg: Record<'direkt' | 'direkt_instandsetzung' | 'ueber_platzbauer', number> = {
      direkt: 0,
      direkt_instandsetzung: 0,
      ueber_platzbauer: 0,
    };

    for (const kunde of aktiveKunden) {
      nachTyp[kunde.typ]++;

      const saisonDaten = saisonDatenMap.get(kunde.id);
      if (saisonDaten) {
        if (saisonDaten.angefragteMenge) {
          gesamtAngefragteMenge += saisonDaten.angefragteMenge;
        }
        if (saisonDaten.tatsaechlicheMenge) {
          gesamtTatsaechlicheMenge += saisonDaten.tatsaechlicheMenge;
        }

        nachStatus[saisonDaten.gespraechsstatus]++;
        if (saisonDaten.gespraechsstatus === 'offen') offeneKunden++;
        if (saisonDaten.gespraechsstatus === 'erledigt') erledigteKunden++;

        if (saisonDaten.bezugsweg) {
          nachBezugsweg[saisonDaten.bezugsweg]++;
        }
      } else {
        nachStatus.offen++;
        offeneKunden++;
      }
    }

    const statistik: SaisonplanungStatistik = {
      gesamtKunden: aktiveKunden.length,
      offeneKunden,
      erledigteKunden,
      gesamtAngefragteMenge,
      gesamtTatsaechlicheMenge,
      nachTyp,
      nachStatus,
      nachBezugsweg,
    };

    // === Erstelle CallListe im Speicher ===
    let gefilterteKunden = aktiveKunden;

    // Typ-Filter
    if (filter.typ && filter.typ.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) => filter.typ!.includes(k.typ));
    }

    // Bundesland-Filter
    if (filter.bundesland && filter.bundesland.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) =>
        filter.bundesland!.some(
          (bundesland) =>
            (k.adresse.bundesland || '').toLowerCase() === bundesland.toLowerCase()
        )
      );
    }

    // Such-Filter
    if (filter.suche) {
      const suche = filter.suche.toLowerCase();
      gefilterteKunden = gefilterteKunden.filter(
        (k) =>
          k.name.toLowerCase().includes(suche) ||
          k.adresse.ort.toLowerCase().includes(suche) ||
          k.kundennummer?.toLowerCase().includes(suche)
      );
    }

    // Kombiniere Daten
    const kundenMitDaten: SaisonKundeMitDaten[] = gefilterteKunden.map((kunde) => {
      const ansprechpartner = ansprechpartnerMap.get(kunde.id) || [];
      const aktuelleSaison = saisonDatenMap.get(kunde.id);
      
      const beziehungenAlsVerein = kunde.typ === 'verein' 
        ? beziehungenMaps.alsVerein.get(kunde.id) 
        : undefined;
      const beziehungenAlsPlatzbauer = kunde.typ === 'platzbauer' 
        ? beziehungenMaps.alsPlatzbauer.get(kunde.id) 
        : undefined;

      return {
        kunde,
        ansprechpartner,
        aktuelleSaison,
        saisonHistorie: aktuelleSaison ? [aktuelleSaison] : [],
        aktivitaeten: [], // Lazy Loading
        beziehungenAlsVerein,
        beziehungenAlsPlatzbauer,
      };
    });

    // Weitere Filter
    let callListe = kundenMitDaten;

    if (filter.status && filter.status.length > 0) {
      callListe = callListe.filter(
        (k) =>
          filter.status!.includes(k.aktuelleSaison?.gespraechsstatus || ('offen' as GespraechsStatus))
      );
    }

    if (filter.bezugsweg && filter.bezugsweg.length > 0) {
      callListe = callListe.filter(
        (k) => k.aktuelleSaison && filter.bezugsweg!.includes(k.aktuelleSaison.bezugsweg || 'direkt')
      );
    }

    if (filter.platzbauerId) {
      callListe = callListe.filter(
        (k) =>
          k.aktuelleSaison?.platzbauerId === filter.platzbauerId ||
          k.beziehungenAlsVerein?.some((b) => b.platzbauerId === filter.platzbauerId)
      );
    }

    const result = { callListe, statistik };

    // Speichere im Cache
    cacheService.set(cacheKey, result);

    return result;
  },

  // Erstelle neue Saison für alle Kunden
  async erstelleNeueSaison(saisonjahr: number): Promise<void> {
    const alleKunden = await this.loadAlleKunden();
    const aktiveKunden = alleKunden.filter((k) => k.aktiv);

    for (const kunde of aktiveKunden) {
      // Prüfe ob Saison bereits existiert
      const existiert = await this.loadAktuelleSaisonDaten(kunde.id, saisonjahr);
      if (existiert) continue;

      // Lade Vorjahres-Saison
      const vorjahresSaison = await this.loadAktuelleSaisonDaten(kunde.id, saisonjahr - 1);
      const referenzmenge = vorjahresSaison?.tatsaechlicheMenge;

      // Erstelle neue Saison-Daten
      await this.createSaisonDaten({
        kundeId: kunde.id,
        saisonjahr,
        referenzmenge,
        gespraechsstatus: 'offen',
      });
    }
  },

  // ========== CALL-LISTEN-TOOL FUNKTIONEN ==========

  /**
   * Aktualisiert den Anruf-Status eines Kunden
   */
  async updateAnrufStatus(
    kundeId: string,
    saisonjahr: number,
    neuerStatus: AnrufStatus,
    optionen?: {
      notiz?: string;
      rueckrufDatum?: string;
      rueckrufNotiz?: string;
    }
  ): Promise<SaisonDaten> {
    let saisonDaten = await this.loadAktuelleSaisonDaten(kundeId, saisonjahr);
    
    const updateData: Partial<SaisonDaten> = {
      anrufStatus: neuerStatus,
      letztAngerufen: new Date().toISOString(),
    };

    if (optionen?.rueckrufDatum) {
      updateData.rueckrufDatum = optionen.rueckrufDatum;
    }
    if (optionen?.rueckrufNotiz) {
      updateData.rueckrufNotiz = optionen.rueckrufNotiz;
    }

    let result: SaisonDaten;
    if (saisonDaten) {
      result = await this.updateSaisonDaten(saisonDaten.id, updateData);
    } else {
      // Erstelle neue Saison-Daten wenn nicht vorhanden
      result = await this.createSaisonDaten({
        kundeId,
        saisonjahr,
        gespraechsstatus: 'offen',
        ...updateData,
      });
    }

    // Cache invalidieren (zusätzlich zu dem bereits in update/create)
    // Dies stellt sicher, dass auch gruppierte Listen aktualisiert werden
    cacheService.invalidate('callliste');
    cacheService.invalidate('statistik');
    cacheService.invalidate('dashboard');

    return result;
  },

  /**
   * Erfasst ein Anruf-Ergebnis (bei "Erreicht")
   */
  async erfasseAnrufErgebnis(
    kundeId: string,
    saisonjahr: number,
    ergebnis: AnrufErgebnis
  ): Promise<SaisonDaten> {
    let saisonDaten = await this.loadAktuelleSaisonDaten(kundeId, saisonjahr);
    
    const updateData: Partial<SaisonDaten> = {
      anrufStatus: ergebnis.erreicht ? 'erreicht' : 'nicht_erreicht',
      letztAngerufen: new Date().toISOString(),
      gespraechsstatus: ergebnis.erreicht ? 'erledigt' : 'in_bearbeitung',
    };

    if (ergebnis.angefragteMenge !== undefined) {
      updateData.angefragteMenge = ergebnis.angefragteMenge;
    }
    if (ergebnis.preisProTonne !== undefined) {
      updateData.preisProTonne = ergebnis.preisProTonne;
    }
    if (ergebnis.bestellabsicht) {
      updateData.bestellabsicht = ergebnis.bestellabsicht;
    }
    if (ergebnis.bezugsweg) {
      updateData.bezugsweg = ergebnis.bezugsweg;
    }
    if (ergebnis.platzbauerId) {
      updateData.platzbauerId = ergebnis.platzbauerId;
    }
    if (ergebnis.lieferfensterFrueh) {
      updateData.lieferfensterFrueh = new Date(ergebnis.lieferfensterFrueh).toISOString();
    }
    if (ergebnis.lieferfensterSpaet) {
      updateData.lieferfensterSpaet = new Date(ergebnis.lieferfensterSpaet).toISOString();
    }
    if (ergebnis.notizen) {
      updateData.gespraechsnotizen = ergebnis.notizen;
    }
    if (ergebnis.rueckrufDatum) {
      updateData.rueckrufDatum = ergebnis.rueckrufDatum;
      updateData.anrufStatus = 'rueckruf';
    }
    if (ergebnis.rueckrufNotiz) {
      updateData.rueckrufNotiz = ergebnis.rueckrufNotiz;
    }
    if (ergebnis.fruehjahresinstandsetzungUeberUns !== undefined) {
      updateData.fruehjahresinstandsetzungUeberUns = ergebnis.fruehjahresinstandsetzungUeberUns;
    }
    if (ergebnis.anzahlPlaetze !== undefined) {
      updateData.anzahlPlaetze = ergebnis.anzahlPlaetze;
    }
    if (ergebnis.fruehjahresinstandsetzungPlatzbauerId) {
      updateData.fruehjahresinstandsetzungPlatzbauerId = ergebnis.fruehjahresinstandsetzungPlatzbauerId;
    }

    let result: SaisonDaten;
    if (saisonDaten) {
      result = await this.updateSaisonDaten(saisonDaten.id, updateData);
    } else {
      result = await this.createSaisonDaten({
        kundeId,
        saisonjahr,
        gespraechsstatus: 'offen',
        ...updateData,
      });
    }

    // Erstelle Aktivität
    const statusText = ergebnis.erreicht ? 'Kunde erreicht' : 'Kunde nicht erreicht';
    const mengenText = ergebnis.angefragteMenge ? ` - ${ergebnis.angefragteMenge}t angefragt` : '';
    await this.createAktivitaet({
      kundeId,
      typ: 'telefonat',
      titel: statusText,
      beschreibung: `${statusText}${mengenText}${ergebnis.notizen ? '\n' + ergebnis.notizen : ''}`,
    });

    // Cache invalidieren (zusätzlich zu dem bereits in update/create)
    cacheService.invalidate('callliste');
    cacheService.invalidate('statistik');
    cacheService.invalidate('dashboard');

    return result;
  },

  /**
   * Ermittelt den Anruf-Status für einen Kunden basierend auf der 4-Wochen-Regel
   */
  berechneAnrufStatus(saisonDaten?: SaisonDaten): AnrufStatus {
    if (!saisonDaten) return 'anrufen';
    
    // Wenn expliziter Status gesetzt und nicht erreicht
    if (saisonDaten.anrufStatus && saisonDaten.anrufStatus !== 'erreicht') {
      return saisonDaten.anrufStatus;
    }

    // 4-Wochen-Regel für "erreicht"
    if (saisonDaten.anrufStatus === 'erreicht' && saisonDaten.letztAngerufen) {
      const letztAngerufen = new Date(saisonDaten.letztAngerufen);
      const vierWochenAlt = new Date();
      vierWochenAlt.setDate(vierWochenAlt.getDate() - 28);
      
      if (letztAngerufen > vierWochenAlt) {
        return 'erreicht'; // Noch innerhalb von 4 Wochen
      } else {
        return 'anrufen'; // Älter als 4 Wochen, wieder anrufen
      }
    }

    // Rückruf-Check
    if (saisonDaten.rueckrufDatum) {
      const rueckrufDatum = new Date(saisonDaten.rueckrufDatum);
      const heute = new Date();
      heute.setHours(0, 0, 0, 0);
      rueckrufDatum.setHours(0, 0, 0, 0);
      
      if (rueckrufDatum <= heute) {
        return 'anrufen'; // Rückruf fällig
      }
      return 'rueckruf';
    }

    return saisonDaten.anrufStatus || 'anrufen';
  },

  /**
   * Lädt alle Kunden gruppiert nach Anruf-Status
   */
  async loadCallListeGruppiert(saisonjahr: number): Promise<{
    anrufen: SaisonKundeMitDaten[];
    nichtErreicht: SaisonKundeMitDaten[];
    erreicht: SaisonKundeMitDaten[];
    rueckruf: SaisonKundeMitDaten[];
  }> {
    const alleKunden = await this.loadCallListe({}, saisonjahr);
    
    const result = {
      anrufen: [] as SaisonKundeMitDaten[],
      nichtErreicht: [] as SaisonKundeMitDaten[],
      erreicht: [] as SaisonKundeMitDaten[],
      rueckruf: [] as SaisonKundeMitDaten[],
    };

    for (const kunde of alleKunden) {
      const status = this.berechneAnrufStatus(kunde.aktuelleSaison);
      
      switch (status) {
        case 'anrufen':
          result.anrufen.push(kunde);
          break;
        case 'nicht_erreicht':
          result.nichtErreicht.push(kunde);
          break;
        case 'erreicht':
          result.erreicht.push(kunde);
          break;
        case 'rueckruf':
          result.rueckruf.push(kunde);
          break;
      }
    }

    // Sortiere Rückrufe nach Datum
    result.rueckruf.sort((a, b) => {
      const dateA = a.aktuelleSaison?.rueckrufDatum || '';
      const dateB = b.aktuelleSaison?.rueckrufDatum || '';
      return dateA.localeCompare(dateB);
    });

    return result;
  },

  /**
   * Prüft ob ein Kunde mit ähnlichem Namen/Adresse bereits existiert
   */
  async pruefeDuplikat(
    name: string,
    plz: string,
    ort: string
  ): Promise<SaisonKunde[]> {
    const alleKunden = await this.loadAlleKunden();
    const nameLower = name.toLowerCase().trim();
    const plzTrimmed = plz.trim();
    const ortLower = ort.toLowerCase().trim();

    return alleKunden.filter((k) => {
      const kundeNameLower = k.name.toLowerCase().trim();
      const kundePlz = k.adresse.plz.trim();
      const kundeOrt = k.adresse.ort.toLowerCase().trim();

      // Exakte Namensübereinstimmung
      const nameMatch = kundeNameLower === nameLower;
      
      // Adressübereinstimmung (PLZ + Ort)
      const adresseMatch = kundePlz === plzTrimmed && kundeOrt === ortLower;

      // Als Duplikat markieren wenn:
      // 1) Exakter Name + gleiche Adresse
      // 2) Exakter Name (auch wenn Adresse unterschiedlich - Warnung)
      return nameMatch || adresseMatch;
    });
  },
};
