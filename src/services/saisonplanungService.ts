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
} from '../types/saisonplanung';

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

// Helper: To Payload für Appwrite (nur data-Field nutzen)
function toPayload<T extends Record<string, any>>(obj: T): { data: string } {
  return {
    data: JSON.stringify(obj),
  };
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
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const doc = await databases.createDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        neuerKunde.id,
        toPayload(neuerKunde)
      );
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
      geaendertAm: new Date().toISOString(),
    };

    try {
      const doc = await databases.updateDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        id,
        toPayload(aktualisiert)
      );
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
          name: neuerAnsprechpartner.name,
          rolle: neuerAnsprechpartner.rolle || '',
          email: neuerAnsprechpartner.email || '',
          telefonnummern: neuerAnsprechpartner.telefonnummern || [],
          bevorzugterKontaktweg: neuerAnsprechpartner.bevorzugterKontaktweg || 'telefon',
          notizen: neuerAnsprechpartner.notizen || '',
          aktiv: neuerAnsprechpartner.aktiv,
          erstelltAm: neuerAnsprechpartner.erstelltAm,
          geaendertAm: neuerAnsprechpartner.geaendertAm,
          data: JSON.stringify(neuerAnsprechpartner),
        }
      );
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
          name: aktualisiert.name,
          rolle: aktualisiert.rolle || '',
          email: aktualisiert.email || '',
          telefonnummern: aktualisiert.telefonnummern || [],
          bevorzugterKontaktweg: aktualisiert.bevorzugterKontaktweg || 'telefon',
          notizen: aktualisiert.notizen || '',
          aktiv: aktualisiert.aktiv,
          erstelltAm: aktualisiert.erstelltAm,
          geaendertAm: aktualisiert.geaendertAm,
          data: JSON.stringify(aktualisiert),
        }
      );
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
          saisonjahr: new Date().getFullYear(),
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
        toPayload(neueSaisonDaten)
      );
      const parsed = parseDocument<SaisonDaten>(doc, neueSaisonDaten);
      await updatePreisHistorie(
        parsed.kundeId,
        parsed.preisProTonne,
        parsed.saisonjahr,
        this.updateKunde.bind(this),
        this.loadKunde.bind(this)
      );
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
        saisonjahr: new Date().getFullYear(),
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
        toPayload(aktualisiert)
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
        toPayload(neueBeziehung)
      );
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
        toPayload(aktualisiert)
      );
      return parseDocument<VereinPlatzbauerBeziehung>(updatedDoc, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Beziehung:', error);
      throw error;
    }
  },

  async deleteBeziehung(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, SAISON_BEZIEHUNGEN_COLLECTION_ID, id);
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

  async loadCallListe(filter: CallListeFilter = {}, saisonjahr: number): Promise<SaisonKundeMitDaten[]> {
    const alleKunden = await this.loadAlleKunden();
    let gefilterteKunden = alleKunden.filter((k) => k.aktiv);

    // Filter anwenden
    if (filter.typ && filter.typ.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) => filter.typ!.includes(k.typ));
    }

    if (filter.bundesland && filter.bundesland.length > 0) {
      gefilterteKunden = gefilterteKunden.filter((k) =>
        filter.bundesland!.some(
          (bundesland) =>
            (k.adresse.bundesland || '').toLowerCase() === bundesland.toLowerCase()
        )
      );
    }

    if (filter.suche) {
      const suche = filter.suche.toLowerCase();
      gefilterteKunden = gefilterteKunden.filter(
        (k) =>
          k.name.toLowerCase().includes(suche) ||
          k.adresse.ort.toLowerCase().includes(suche) ||
          k.kundennummer?.toLowerCase().includes(suche)
      );
    }

    // Lade erweiterte Daten für jeden Kunden
    const kundenMitDaten = await Promise.all(
      gefilterteKunden.map((k) => this.loadKundeMitDaten(k.id, saisonjahr))
    );

    let result = kundenMitDaten.filter((k): k is SaisonKundeMitDaten => k !== null);

    // Weitere Filter
    if (filter.status && filter.status.length > 0) {
      result = result.filter(
        (k) =>
          filter.status!.includes(k.aktuelleSaison?.gespraechsstatus || ('offen' as GespraechsStatus))
      );
    }

    if (filter.bezugsweg && filter.bezugsweg.length > 0) {
      result = result.filter(
        (k) => k.aktuelleSaison && filter.bezugsweg!.includes(k.aktuelleSaison.bezugsweg || 'direkt')
      );
    }

    if (filter.platzbauerId) {
      result = result.filter(
        (k) =>
          k.aktuelleSaison?.platzbauerId === filter.platzbauerId ||
          k.beziehungenAlsVerein?.some((b) => b.platzbauerId === filter.platzbauerId)
      );
    }

    return result;
  },

  async berechneStatistik(saisonjahr: number): Promise<SaisonplanungStatistik> {
    const alleKunden = await this.loadAlleKunden();
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
    const nachBezugsweg: Record<'direkt' | 'ueber_platzbauer', number> = {
      direkt: 0,
      ueber_platzbauer: 0,
    };

    for (const kunde of aktiveKunden) {
      nachTyp[kunde.typ]++;

      const saisonDaten = await this.loadAktuelleSaisonDaten(kunde.id, saisonjahr);
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

    return {
      gesamtKunden: aktiveKunden.length,
      offeneKunden,
      erledigteKunden,
      gesamtAngefragteMenge,
      gesamtTatsaechlicheMenge,
      nachTyp,
      nachStatus,
      nachBezugsweg,
    };
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
};
