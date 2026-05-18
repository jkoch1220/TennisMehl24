import { databases, DATABASE_ID, COLLECTIONS, BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Projekt } from '../types/projekt';
import { GespeichertesDokument, RechnungsDaten as VolleRechnungsDaten } from '../types/projektabwicklung';

// Alias für RechnungsDokument - verwendet den gleichen Typ wie die UI
type RechnungsDokument = GespeichertesDokument;
import {
  DebitorMetadaten,
  NeueDebitorMetadaten,
  DebitorView,
  DebitorStatus,
  DebitorMahnstufe,
  DebitorZahlung,
  DebitorAktivitaet,
  DebitorenStatistik,
  DebitorFilter,
  MahnEmpfehlung,
  STANDARD_ZAHLUNGSZIEL_TAGE,
} from '../types/debitor';
import { projektService } from './projektService';

// Interface für geparste Rechnungsdaten aus Projekt
interface RechnungsDaten {
  gesamtBrutto?: number;
  gesamtNetto?: number;
  positionen?: Array<{
    bezeichnung: string;
    menge: number;
    einzelpreis: number;
    gesamtpreis: number;
  }>;
  zahlungsziel?: string;
  zahlungszielTage?: number; // Bereits geparstes Zahlungsziel in Tagen
}

// Helper: Zahlungsziel-String zu Tagen parsen
// z.B. "14 Tage", "30 Tage netto", "Vorkasse" → Zahl der Tage
const parseZahlungszielTage = (zahlungsziel: string | undefined): number | null => {
  if (!zahlungsziel) return null;

  const lower = zahlungsziel.toLowerCase().trim();

  // Vorkasse = sofort fällig
  if (lower.includes('vorkasse') || lower.includes('vorauskasse') || lower === 'sofort') {
    return 0;
  }

  // Extrahiere Zahl aus dem String (z.B. "14 Tage", "30 Tage netto", "netto 14 Tage")
  const zahlenMatch = zahlungsziel.match(/(\d+)/);
  if (zahlenMatch) {
    const tage = parseInt(zahlenMatch[1], 10);
    if (!isNaN(tage) && tage >= 0) {
      return tage;
    }
  }

  return null;
};

// Helper: Lädt das neueste AKTIVE Rechnungsdokument für ein Projekt (Fallback wenn rechnungsDaten fehlt).
// Stornierte Rechnungen werden übersprungen, damit nach Storno+Neuerstellung die aktuelle Rechnung gefunden wird.
const ladeRechnungsDokument = async (projektId: string): Promise<RechnungsDokument | null> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.equal('dokumentTyp', 'rechnung'),
        Query.orderDesc('$createdAt'),
        Query.limit(10)
      ]
    );
    const dokumente = response.documents as unknown as RechnungsDokument[];
    const aktiveRechnung = dokumente.find((doc) => doc.rechnungsStatus !== 'storniert');
    if (aktiveRechnung) {
      return aktiveRechnung;
    }
    return null;
  } catch (error) {
    console.error(`Fehler beim Laden des Rechnungsdokuments für Projekt ${projektId}:`, error);
    return null;
  }
};

// Helper: Batch-Load via einer einzigen listDocuments-Query (IN-Filter statt N Requests)
const ladeRechnungsDokumenteFuerProjekte = async (
  projektIds: string[]
): Promise<Map<string, RechnungsDokument>> => {
  const dokumenteMap = new Map<string, RechnungsDokument>();
  if (projektIds.length === 0) return dokumenteMap;

  // Appwrite listet alle Rechnungsdokumente für ALLE projektIds in einem Query (IN-Filter).
  // Bei vielen Projekten: in Chunks à 100 IDs aufteilen, parallel laden.
  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < projektIds.length; i += CHUNK_SIZE) {
    chunks.push(projektIds.slice(i, i + CHUNK_SIZE));
  }

  const alleDokumente: RechnungsDokument[] = [];

  await Promise.all(
    chunks.map(async (chunk) => {
      let offset = 0;
      const limit = 100;
      while (true) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
          [
            Query.equal('projektId', chunk),
            Query.equal('dokumentTyp', 'rechnung'),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
            Query.offset(offset),
          ]
        );
        alleDokumente.push(...(response.documents as unknown as RechnungsDokument[]));
        if (response.documents.length < limit) break;
        offset += limit;
        if (offset > 2000) break; // safety guard
      }
    })
  );

  // Pro projektId nur das neueste AKTIVE Dokument (Liste ist bereits nach $createdAt DESC sortiert).
  // Stornierte Rechnungen werden übersprungen, damit nach Storno+Neuerstellung die aktuelle Rechnung gefunden wird.
  for (const dok of alleDokumente) {
    if (!dok.projektId) continue;
    if (dok.rechnungsStatus === 'storniert') continue;
    if (!dokumenteMap.has(dok.projektId)) {
      dokumenteMap.set(dok.projektId, dok);
    }
  }

  return dokumenteMap;
};

class DebitorService {
  private readonly collectionId = COLLECTIONS.DEBITOREN_METADATEN;

  // =====================================================
  // LADEN
  // =====================================================

  /**
   * Lädt alle Debitoren (Projekte mit Status 'rechnung' oder 'bezahlt' + deren Metadaten)
   */
  async loadAlleDebitoren(filter?: DebitorFilter): Promise<DebitorView[]> {
    try {
      const statusFilter = ['rechnung', 'bezahlt'];
      const queries: string[] = [
        Query.equal('status', statusFilter),
        Query.orderDesc('geaendertAm'),
        Query.limit(1000),
      ];
      if (filter?.saisonjahr) {
        queries.push(Query.equal('saisonjahr', filter.saisonjahr));
      }

      // 1+2: Projekte UND Metadaten parallel laden (unabhängig voneinander)
      const [projekteResponse, metadatenResponse] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, queries),
        databases.listDocuments(DATABASE_ID, this.collectionId, [Query.limit(1000)]),
      ]);

      const projekte: Projekt[] = projekteResponse.documents.map((doc) => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
      });

      const metadatenMap = new Map<string, DebitorMetadaten>();
      for (const doc of metadatenResponse.documents) {
        const metadaten = this.parseMetadatenDocument(doc);
        if (metadaten) metadatenMap.set(metadaten.projektId, metadaten);
      }

      // 3: Rechnungsdokumente in Bulk-Queries laden (1-N Calls statt N)
      const alleProjektIds = projekte.map((p) => (p as any).$id || p.id);
      const rechnungsDokumenteMap = await ladeRechnungsDokumenteFuerProjekte(alleProjektIds);

      // 4: Kombiniere Projekte mit Metadaten zu DebitorViews
      const debitoren: DebitorView[] = [];
      for (const projekt of projekte) {
        const hatRechnungsStatus = projekt.status === 'rechnung' || projekt.status === 'bezahlt';
        const hatRechnungsdaten = projekt.rechnungsnummer || projekt.rechnungsdatum;
        if (!hatRechnungsStatus && !hatRechnungsdaten) continue;

        const projektId = (projekt as any).$id || projekt.id;
        const metadaten = metadatenMap.get(projektId) || metadatenMap.get(projekt.id) || null;
        const rechnungsDokument = rechnungsDokumenteMap.get(projektId) || null;
        const debitorView = this.createDebitorView(projekt, metadaten, rechnungsDokument);

        if (this.matchesFilter(debitorView, filter)) {
          debitoren.push(debitorView);
        }
      }

      // Sortieren nach offensten/kritischsten zuerst
      debitoren.sort((a, b) => {
        if (a.status === 'bezahlt' && b.status !== 'bezahlt') return 1;
        if (b.status === 'bezahlt' && a.status !== 'bezahlt') return -1;
        return b.tageUeberfaellig - a.tageUeberfaellig;
      });

      return debitoren;
    } catch (error) {
      console.error('Fehler beim Laden der Debitoren:', error);
      throw error;
    }
  }

  /**
   * Lädt einen einzelnen Debitor für ein Projekt
   */
  async loadDebitorFuerProjekt(projektId: string): Promise<DebitorView | null> {
    try {
      const projekt = await projektService.getProjekt(projektId);
      if (!projekt) {
        return null;
      }

      // Lade Rechnungsdokument als Fallback
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      // Prüfe ob Rechnungsnummer vorhanden (im Projekt oder im Dokument)
      const hatRechnungsnummer = projekt.rechnungsnummer || rechnungsDokument?.dokumentNummer;
      if (!hatRechnungsnummer) {
        return null;
      }

      const metadaten = await this.loadMetadatenFuerProjekt(projektId);
      return this.createDebitorView(projekt, metadaten, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Laden des Debitors:', error);
      throw error;
    }
  }

  /**
   * Lädt Metadaten für ein Projekt
   */
  async loadMetadatenFuerProjekt(projektId: string): Promise<DebitorMetadaten | null> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('projektId', projektId),
        Query.limit(1),
      ]);

      if (response.documents.length === 0) {
        return null;
      }

      return this.parseMetadatenDocument(response.documents[0]);
    } catch (error) {
      console.error('Fehler beim Laden der Metadaten:', error);
      return null;
    }
  }

  // =====================================================
  // METADATEN CRUD
  // =====================================================

  /**
   * Erstellt oder holt Metadaten für ein Projekt
   */
  async getOrCreateMetadaten(projektId: string): Promise<DebitorMetadaten> {
    try {
      // Prüfe ob Metadaten existieren
      const existing = await this.loadMetadatenFuerProjekt(projektId);
      if (existing) {
        return existing;
      }

      // Erstelle neue Metadaten
      const jetzt = new Date().toISOString();
      const neueMetadaten: NeueDebitorMetadaten = {
        projektId,
        status: 'offen',
        mahnstufe: 0,
        prioritaet: 'normal',
        zahlungen: [],
        aktivitaeten: [],
      };

      const dokument = {
        projektId,
        status: 'offen',
        mahnstufe: 0,
        prioritaet: 'normal',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify(neueMetadaten),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        ID.unique(),
        dokument
      );

      return this.parseMetadatenDocument(response)!;
    } catch (error) {
      console.error('Fehler beim Erstellen der Metadaten:', error);
      throw error;
    }
  }

  /**
   * Aktualisiert Metadaten
   */
  async updateMetadaten(
    projektId: string,
    updates: Partial<DebitorMetadaten>
  ): Promise<DebitorMetadaten> {
    try {
      // Hole oder erstelle Metadaten
      let metadaten = await this.getOrCreateMetadaten(projektId);

      // Aktualisiere
      const aktualisiert: DebitorMetadaten = {
        ...metadaten,
        ...updates,
        geaendertAm: new Date().toISOString(),
      };

      // Payload auf Appwrite-Limit (10000 Zeichen für data-Feld) begrenzen.
      // Strategie: alte Aktivitäten zuerst pruning, dann ggf. Notizen/Zahlungen beschneiden.
      const MAX_DATA = 9500;
      let serialisiert = JSON.stringify(aktualisiert);

      if (serialisiert.length > MAX_DATA) {
        const ak = [...(aktualisiert.aktivitaeten || [])];
        ak.sort((a, b) => (a.erstelltAm > b.erstelltAm ? 1 : -1)); // älteste zuerst
        while (serialisiert.length > MAX_DATA && ak.length > 10) {
          ak.shift();
          aktualisiert.aktivitaeten = ak;
          serialisiert = JSON.stringify(aktualisiert);
        }
      }

      if (serialisiert.length > MAX_DATA) {
        // Notiz kürzen
        if (aktualisiert.notizen && aktualisiert.notizen.length > 500) {
          aktualisiert.notizen = aktualisiert.notizen.substring(0, 500);
          serialisiert = JSON.stringify(aktualisiert);
        }
      }

      if (serialisiert.length > MAX_DATA) {
        // Zahlungs-Notizen kürzen
        aktualisiert.zahlungen = (aktualisiert.zahlungen || []).map((z) => ({
          ...z,
          notiz: z.notiz ? z.notiz.substring(0, 80) : undefined,
        }));
        serialisiert = JSON.stringify(aktualisiert);
      }

      if (serialisiert.length > MAX_DATA) {
        console.warn(
          `DebitorMetadaten zu groß (${serialisiert.length} chars) – weiteres Pruning notwendig`
        );
        // Notlösung: Aktivitäten vollständig entfernen außer die letzten 5
        const ak = [...(aktualisiert.aktivitaeten || [])].slice(-5);
        aktualisiert.aktivitaeten = ak;
        serialisiert = JSON.stringify(aktualisiert);
      }

      const dokument = {
        projektId: aktualisiert.projektId,
        status: aktualisiert.status,
        mahnstufe: aktualisiert.mahnstufe,
        prioritaet: aktualisiert.prioritaet,
        geaendertAm: aktualisiert.geaendertAm,
        data: serialisiert,
      };

      await databases.updateDocument(DATABASE_ID, this.collectionId, metadaten.id, dokument);

      return aktualisiert;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Metadaten:', error);
      throw error;
    }
  }

  // =====================================================
  // ZAHLUNGEN
  // =====================================================

  /**
   * Fügt eine Zahlung hinzu
   */
  async addZahlung(
    projektId: string,
    zahlung: Omit<DebitorZahlung, 'id' | 'erstelltAm'>
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback wenn projekt.rechnungsDaten fehlt
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      const neueZahlung: DebitorZahlung = {
        ...zahlung,
        id: ID.unique(),
        erstelltAm: new Date().toISOString(),
      };

      const zahlungen = [...(metadaten.zahlungen || []), neueZahlung];

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'zahlung_eingegangen',
        titel: `Zahlung eingegangen: ${zahlung.betrag.toFixed(2)} €`,
        beschreibung: zahlung.notiz,
        betrag: zahlung.betrag,
        erstelltAm: new Date().toISOString(),
        erstelltVon: zahlung.erstelltVon,
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      // Berechne neuen Status
      const rechnungsbetrag = this.parseRechnungsbetrag(projekt, rechnungsDokument);
      const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);
      let neuerStatus: DebitorStatus = metadaten.status;

      // Automatisch auf bezahlt setzen — aber NUR wenn ein gültiger Rechnungsbetrag bekannt ist.
      // Wenn parseRechnungsbetrag 0 zurückgibt (z.B. kein Rechnungsdokument gefunden), niemals
      // automatisch als bezahlt markieren — sonst würden Cent-Beträge sofort als "vollständig"
      // gelten.
      if (rechnungsbetrag > 0 && bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
        // Projekt-Status auch auf bezahlt setzen — Partial-Update, schont das data-Feld
        await projektService.markiereProjektAlsBezahlt(projektId);
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      }

      const aktualisiert = await this.updateMetadaten(projektId, {
        zahlungen,
        aktivitaeten,
        status: neuerStatus,
      });

      return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Zahlung:', error);
      throw error;
    }
  }

  /**
   * Löscht eine Zahlung
   */
  async deleteZahlung(projektId: string, zahlungId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback wenn projekt.rechnungsDaten fehlt
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      const zahlungen = (metadaten.zahlungen || []).filter((z) => z.id !== zahlungId);

      // Status neu berechnen
      const rechnungsbetrag = this.parseRechnungsbetrag(projekt, rechnungsDokument);
      const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);
      let neuerStatus: DebitorStatus;

      // bezahlt vergleichen wir nur, wenn der Rechnungsbetrag bekannt (>0) ist. Sonst gilt
      // 0 >= 0 als "bezahlt", was nach Löschen der letzten Zahlung falsch wäre.
      if (rechnungsbetrag > 0 && bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      } else if (metadaten.mahnstufe > 0) {
        neuerStatus = 'gemahnt';
      } else {
        neuerStatus = this.berechneStatusAusRechnung(projekt, metadaten.zahlungszielTage, rechnungsDokument);
      }

      const aktualisiert = await this.updateMetadaten(projektId, {
        zahlungen,
        status: neuerStatus,
      });

      return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Löschen der Zahlung:', error);
      throw error;
    }
  }

  // =====================================================
  // MAHNWESEN
  // =====================================================

  /**
   * Erhöht die Mahnstufe
   */
  async erhoeheMahnstufe(projektId: string, notiz?: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      const neueMahnstufe = Math.min(4, metadaten.mahnstufe + 1) as DebitorMahnstufe;

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'mahnung_versendet',
        titel: `Mahnstufe ${neueMahnstufe} erreicht`,
        beschreibung: notiz,
        mahnstufe: neueMahnstufe,
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        mahnstufe: neueMahnstufe,
        letzteMahnungAm: new Date().toISOString(),
        aktivitaeten,
        status: 'gemahnt',
      });

      return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Erhöhen der Mahnstufe:', error);
      throw error;
    }
  }

  /**
   * Markiert Mahnung als versendet
   */
  async markiereMahnungVersendet(
    projektId: string,
    mahnstufe: DebitorMahnstufe,
    notiz?: string
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'mahnung_versendet',
        titel: `Mahnung Stufe ${mahnstufe} versendet`,
        beschreibung: notiz,
        mahnstufe,
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        mahnstufe,
        letzteMahnungAm: new Date().toISOString(),
        aktivitaeten,
        status: 'gemahnt',
      });

      return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Markieren der Mahnung:', error);
      throw error;
    }
  }

  // =====================================================
  // AKTIVITÄTEN
  // =====================================================

  /**
   * Fügt eine Aktivität hinzu
   */
  async addAktivitaet(
    projektId: string,
    aktivitaet: Omit<DebitorAktivitaet, 'id' | 'erstelltAm'>
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      const neueAktivitaet: DebitorAktivitaet = {
        ...aktivitaet,
        id: ID.unique(),
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        aktivitaeten,
      });

      return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Aktivität:', error);
      throw error;
    }
  }

  // =====================================================
  // STATUS
  // =====================================================

  /**
   * Berechnet und aktualisiert den Status
   */
  async berechneUndAktualisiereStatus(projektId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback wenn projekt.rechnungsDaten fehlt
      // Immer das aktuelle Rechnungsdokument laden (Source of Truth) — projekt.rechnungsnummer/rechnungsDaten
      // kann nach Storno+Neuerstellung veraltet sein und auf eine stornierte Rechnung verweisen.
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      const rechnungsbetrag = this.parseRechnungsbetrag(projekt, rechnungsDokument);
      const bezahlt = (metadaten.zahlungen || []).reduce((sum, z) => sum + z.betrag, 0);

      let neuerStatus: DebitorStatus;

      // Nur als bezahlt markieren, wenn ein gültiger Rechnungsbetrag bekannt ist (>0).
      if (rechnungsbetrag > 0 && bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      } else if (metadaten.mahnstufe > 0) {
        neuerStatus = 'gemahnt';
      } else {
        neuerStatus = this.berechneStatusAusRechnung(projekt, metadaten.zahlungszielTage, rechnungsDokument);
      }

      if (neuerStatus !== metadaten.status) {
        const aktualisiert = await this.updateMetadaten(projektId, {
          status: neuerStatus,
        });
        return this.createDebitorView(projekt, aktualisiert, rechnungsDokument);
      }

      return this.createDebitorView(projekt, metadaten, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
      throw error;
    }
  }

  /**
   * Markiert als bezahlt
   *
   * Verwendet markiereProjektAlsBezahlt() statt updateProjekt(): Partial-Update auf nur die
   * Top-Level-Felder (status, bezahltAm, geaendertAm). Verhindert den 10000-Zeichen-Overflow
   * im `data`-Feld bei Projekten mit großen rechnungsDaten (z.B. TC Kürnach).
   */
  async markiereAlsBezahlt(projektId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);

      // Projekt-Status auf bezahlt setzen — KEIN volles updateProjekt (würde data überschreiben!)
      await projektService.markiereProjektAlsBezahlt(projektId);

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'status_aenderung',
        titel: 'Als bezahlt markiert',
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        status: 'bezahlt',
        aktivitaeten,
      });

      // Projekt neu laden nach Update
      const aktualisierteProjekt = await projektService.getProjekt(projektId);

      // Lade Rechnungsdokument als Fallback
      const rechnungsDokument = await ladeRechnungsDokument(projektId);

      return this.createDebitorView(aktualisierteProjekt, aktualisiert, rechnungsDokument);
    } catch (error) {
      console.error('Fehler beim Markieren als bezahlt:', error);
      throw error;
    }
  }

  // =====================================================
  // LÖSCHEN
  // =====================================================

  /**
   * Löscht die Debitor-Metadaten für ein Projekt. Das Projekt selbst bleibt unangetastet —
   * für Lösch-Operationen auf dem Projekt projektService.deleteProjekt() verwenden.
   *
   * Idempotent: wenn keine Metadaten existieren, wird nichts gemacht.
   */
  async deleteDebitor(projektId: string): Promise<void> {
    try {
      const metadaten = await this.loadMetadatenFuerProjekt(projektId);
      if (!metadaten) {
        return;
      }
      await databases.deleteDocument(DATABASE_ID, this.collectionId, metadaten.id);
    } catch (error) {
      console.error('Fehler beim Löschen des Debitors:', error);
      throw error;
    }
  }

  // =====================================================
  // STATISTIK
  // =====================================================

  /**
   * Berechnet die Debitorenstatistik
   */
  async berechneStatistik(saisonjahr?: number): Promise<DebitorenStatistik> {
    const debitoren = await this.loadAlleDebitoren({ saisonjahr });
    return this.berechneStatistikAus(debitoren);
  }

  /**
   * Berechnet Statistik aus bereits geladenen Debitoren (kein DB-Call).
   * Nutze dies statt berechneStatistik(), wenn du loadAlleDebitoren schon aufgerufen hast.
   */
  berechneStatistikAus(debitoren: DebitorView[]): DebitorenStatistik {
    try {
      const statistik: DebitorenStatistik = {
        gesamtForderungen: 0,
        gesamtOffen: 0,
        gesamtBezahlt: 0,
        anzahlOffen: 0,
        anzahlBezahlt: 0,
        ueberfaelligBetrag: 0,
        ueberfaelligAnzahl: 0,
        gemahntBetrag: 0,
        gemahntAnzahl: 0,
        nachMahnstufe: {
          0: { anzahl: 0, betrag: 0 },
          1: { anzahl: 0, betrag: 0 },
          2: { anzahl: 0, betrag: 0 },
          3: { anzahl: 0, betrag: 0 },
          4: { anzahl: 0, betrag: 0 },
        },
        nachSaisonjahr: {},
        kritischeDebitoren: [],
        naechsteFaelligkeiten: [],
      };

      const heute = new Date();
      const in7Tagen = new Date(heute);
      in7Tagen.setDate(in7Tagen.getDate() + 7);

      for (const debitor of debitoren) {
        statistik.gesamtForderungen += debitor.rechnungsbetrag;

        // Nach Saisonjahr
        if (!statistik.nachSaisonjahr[debitor.saisonjahr]) {
          statistik.nachSaisonjahr[debitor.saisonjahr] = { anzahl: 0, betrag: 0 };
        }
        statistik.nachSaisonjahr[debitor.saisonjahr].anzahl++;
        statistik.nachSaisonjahr[debitor.saisonjahr].betrag += debitor.offenerBetrag;

        // Nach Mahnstufe
        statistik.nachMahnstufe[debitor.mahnstufe].anzahl++;
        statistik.nachMahnstufe[debitor.mahnstufe].betrag += debitor.offenerBetrag;

        if (debitor.status === 'bezahlt') {
          statistik.gesamtBezahlt += debitor.rechnungsbetrag;
          statistik.anzahlBezahlt++;
        } else {
          statistik.gesamtOffen += debitor.offenerBetrag;
          statistik.anzahlOffen++;

          if (debitor.status === 'ueberfaellig' || debitor.tageUeberfaellig > 0) {
            statistik.ueberfaelligBetrag += debitor.offenerBetrag;
            statistik.ueberfaelligAnzahl++;
          }

          if (debitor.status === 'gemahnt' || debitor.mahnstufe > 0) {
            statistik.gemahntBetrag += debitor.offenerBetrag;
            statistik.gemahntAnzahl++;
          }

          // Kritische Debitoren (Top 10 nach offenem Betrag) — nur überfällig oder gemahnt,
          // niemals offene (noch nicht fällige) oder bezahlte Rechnungen.
          if (debitor.status === 'ueberfaellig' || debitor.status === 'gemahnt') {
            statistik.kritischeDebitoren.push(debitor);
          }

          // Nächste Fälligkeiten (in den nächsten 7 Tagen)
          const faelligkeit = new Date(debitor.faelligkeitsdatum);
          if (faelligkeit >= heute && faelligkeit <= in7Tagen) {
            statistik.naechsteFaelligkeiten.push(debitor);
          }
        }
      }

      // Sortiere kritische Debitoren: am längsten überfällig zuerst (klares Eskalations-Ranking).
      // Tie-Breaker: höherer offener Betrag, dann Kundenname für deterministische Reihenfolge.
      statistik.kritischeDebitoren.sort((a, b) => {
        if (b.tageUeberfaellig !== a.tageUeberfaellig) {
          return b.tageUeberfaellig - a.tageUeberfaellig;
        }
        if (b.offenerBetrag !== a.offenerBetrag) {
          return b.offenerBetrag - a.offenerBetrag;
        }
        return a.kundenname.localeCompare(b.kundenname);
      });
      statistik.kritischeDebitoren = statistik.kritischeDebitoren.slice(0, 10);

      // Sortiere nächste Fälligkeiten nach Datum
      statistik.naechsteFaelligkeiten.sort(
        (a, b) => new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime()
      );

      return statistik;
    } catch (error) {
      console.error('Fehler beim Berechnen der Statistik:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER
  // =====================================================

  /**
   * Parst ein Metadaten-Dokument
   */
  private parseMetadatenDocument(doc: unknown): DebitorMetadaten | null {
    try {
      const d = doc as Record<string, unknown>;
      if (d.data && typeof d.data === 'string') {
        const parsed = JSON.parse(d.data);
        return {
          ...parsed,
          id: d.$id as string,
        };
      }
      return {
        id: d.$id as string,
        projektId: d.projektId as string,
        status: (d.status as DebitorStatus) || 'offen',
        mahnstufe: (d.mahnstufe as DebitorMahnstufe) || 0,
        prioritaet: (d.prioritaet as string) || 'normal',
        zahlungen: [],
        aktivitaeten: [],
        erstelltAm: d.erstelltAm as string,
        geaendertAm: d.geaendertAm as string,
      } as DebitorMetadaten;
    } catch {
      return null;
    }
  }

  /**
   * Erstellt ein DebitorView aus Projekt + Metadaten + optionalem Rechnungsdokument
   */
  private createDebitorView(
    projekt: Projekt,
    metadaten: DebitorMetadaten | null,
    rechnungsDokument?: RechnungsDokument | null
  ): DebitorView {
    // Projekt-ID kann als $id (Appwrite) oder id (intern) vorliegen
    const projektId = (projekt as any).$id || projekt.id;

    // Rechnungsbetrag: Priorität = Projekt.rechnungsDaten > Rechnungsdokument
    const rechnungsbetrag = this.parseRechnungsbetrag(projekt, rechnungsDokument);
    const zahlungen = metadaten?.zahlungen || [];
    const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);

    // Rechnungsnummer und -datum: Dokument ist Source of Truth (denormalisiertes projekt.rechnungsnummer
    // kann nach Storno+Neuerstellung veraltet sein). Fallback auf Projekt-Felder nur wenn kein Dokument vorhanden.
    const rechnungsnummer = rechnungsDokument?.dokumentNummer || projekt.rechnungsnummer;

    // Fallback-Kette für rechnungsdatum:
    // 1. $createdAt des aktiven Rechnungsdokuments (zuverlässig — wird beim Speichern gesetzt)
    // 2. projekt.rechnungsdatum (Top-Level-Spalte)
    // 3. rechnungsdatum aus parsed rechnungsDaten (innerhalb data-JSON)
    // 4. KEIN Fallback auf projekt.erstelltAm — sonst gelten Rechnungen, die zu einem alten
    //    Projekt nachträglich erstellt werden, sofort als überfällig (Projekt-Erstellungsdatum
    //    liegt oft Monate vor dem Rechnungsdatum).
    let rechnungsdatum: string | undefined;
    if (rechnungsDokument?.$createdAt) {
      rechnungsdatum = rechnungsDokument.$createdAt.split('T')[0];
    } else if (projekt.rechnungsdatum) {
      rechnungsdatum = projekt.rechnungsdatum;
    } else {
      const rechnungsDatenInner = this.parseRechnungsDaten(projekt) as
        | (RechnungsDaten & Partial<VolleRechnungsDaten>)
        | null;
      if (rechnungsDatenInner?.rechnungsdatum) {
        rechnungsdatum = rechnungsDatenInner.rechnungsdatum;
      }
    }

    // Zahlungsziel-Priorität:
    // 1. Aus Debitor-Metadaten (explizit gesetzt)
    // 2. Aus Rechnungsdaten des Projekts (zahlungszielTage oder geparstes zahlungsziel)
    // 3. Standard: 14 Tage
    let zahlungszielTage = STANDARD_ZAHLUNGSZIEL_TAGE;
    if (metadaten?.zahlungszielTage !== undefined && metadaten.zahlungszielTage !== null) {
      zahlungszielTage = metadaten.zahlungszielTage;
    } else {
      // Versuche aus Rechnungsdaten zu extrahieren
      const rechnungsDaten = this.parseRechnungsDaten(projekt);
      if (rechnungsDaten?.zahlungszielTage !== undefined && rechnungsDaten.zahlungszielTage !== null) {
        zahlungszielTage = rechnungsDaten.zahlungszielTage;
      } else if (rechnungsDaten?.zahlungsziel) {
        const geparstes = parseZahlungszielTage(rechnungsDaten.zahlungsziel);
        if (geparstes !== null) {
          zahlungszielTage = geparstes;
        }
      }
    }

    // Letzter Fallback wenn kein rechnungsdatum ermittelbar war: erstelltAm. In dem Fall ist
    // die Berechnung zwar nicht ideal, aber wir haben keine andere Information.
    const datumFuerFaelligkeit = rechnungsdatum || projekt.erstelltAm;
    const faelligkeitsdatum = this.berechneFaelligkeitsdatum(
      datumFuerFaelligkeit,
      zahlungszielTage
    );

    const tageUeberfaellig = this.berechneTageUeberfaellig(faelligkeitsdatum);

    // Status berechnen
    // Sticky-Status (bleiben erhalten, bis Zahlung/Mahnung sie auflöst):
    //   - bezahlt:    Endzustand
    //   - teilbezahlt: bis vollständig bezahlt
    //   - gemahnt:    bis Zahlung oder neue Mahnstufe
    // Alle anderen (offen, faellig, ueberfaellig) werden bei jedem Laden frisch aus dem aktuellen
    // tageUeberfaellig abgeleitet — damit eingefrorene "ueberfaellig"-Werte aus alten Metadaten
    // nicht weiterleben, wenn die Rechnung gerade erst erstellt wurde.
    let status: DebitorStatus;
    if (projekt.status === 'bezahlt') {
      status = 'bezahlt';
    } else if (metadaten && (metadaten.status === 'bezahlt' || metadaten.status === 'teilbezahlt' || metadaten.status === 'gemahnt')) {
      status = metadaten.status;
    } else {
      status = this.statusAusTage(tageUeberfaellig);
    }

    return {
      projektId: projektId,
      kundeId: projekt.kundeId,
      kundennummer: projekt.kundennummer,
      kundenname: projekt.kundenname,
      kundenEmail: projekt.kundenEmail,
      ansprechpartner: projekt.ansprechpartner,
      rechnungsnummer: rechnungsnummer || undefined,
      rechnungsdatum: rechnungsdatum || undefined,
      rechnungsbetrag,
      saisonjahr: projekt.saisonjahr,

      metadatenId: metadaten?.id,
      status,
      mahnstufe: metadaten?.mahnstufe || 0,
      prioritaet: metadaten?.prioritaet || 'normal',
      zahlungen,
      aktivitaeten: metadaten?.aktivitaeten || [],
      notizen: metadaten?.notizen,
      gesperrt: metadaten?.gesperrt,
      sperrgrund: metadaten?.sperrgrund,
      letzteMahnungAm: metadaten?.letzteMahnungAm,

      offenerBetrag: Math.max(0, rechnungsbetrag - bezahlt),
      bezahlterBetrag: bezahlt,
      faelligkeitsdatum,
      tageUeberfaellig,
      prozentBezahlt: rechnungsbetrag > 0 ? (bezahlt / rechnungsbetrag) * 100 : 0,
      zahlungszielTage,
    };
  }

  /**
   * Parst den Rechnungsbetrag aus dem Rechnungsdokument (BESTELLABWICKLUNG_DOKUMENTE)
   * WICHTIG: Der Bruttobetrag ist im Dokument gespeichert, nicht im Projekt!
   * Priorität: 1. rechnungsDokument.bruttobetrag (primäre Quelle!), 2. projekt.rechnungsDaten (Fallback)
   */
  private parseRechnungsbetrag(projekt: Projekt, rechnungsDokument?: RechnungsDokument | null): number {
    // 1. PRIMÄRE QUELLE: Rechnungsdokument (BESTELLABWICKLUNG_DOKUMENTE)
    // Das ist die gleiche Quelle wie in der Projektabwicklung UI!
    if (rechnungsDokument) {
      console.log(`💰 parseRechnungsbetrag [${projekt.kundenname}]: Dokument gefunden:`, {
        dokumentNummer: rechnungsDokument.dokumentNummer,
        bruttobetrag: rechnungsDokument.bruttobetrag
      });

      // Direkt bruttobetrag aus Dokument - genau wie in der UI
      if (rechnungsDokument.bruttobetrag && rechnungsDokument.bruttobetrag > 0) {
        console.log(`💰 parseRechnungsbetrag [${projekt.kundenname}]: ✅ Betrag aus Dokument: ${rechnungsDokument.bruttobetrag}€`);
        return rechnungsDokument.bruttobetrag;
      }
    } else {
      console.log(`💰 parseRechnungsbetrag [${projekt.kundenname}]: ⚠️ Kein Rechnungsdokument gefunden!`);
    }

    // 2. FALLBACK: projekt.rechnungsDaten (für neue Rechnungen)
    const daten = this.parseRechnungsDaten(projekt);
    if (daten?.gesamtBrutto && daten.gesamtBrutto > 0) {
      console.log(`💰 parseRechnungsbetrag [${projekt.kundenname}]: Betrag aus rechnungsDaten: ${daten.gesamtBrutto}€`);
      return daten.gesamtBrutto;
    }

    console.log(`💰 parseRechnungsbetrag [${projekt.kundenname}]: ❌ KEIN BETRAG GEFUNDEN - return 0`);
    return 0;
  }

  /**
   * Parst die Rechnungsdaten aus dem Projekt
   */
  private parseRechnungsDaten(projekt: Projekt): RechnungsDaten | null {
    if (projekt.rechnungsDaten) {
      try {
        console.log(`🔍 parseRechnungsDaten [${projekt.kundenname}]: Raw-String (erste 500 Zeichen):`, projekt.rechnungsDaten.substring(0, 500));
        const parsed = JSON.parse(projekt.rechnungsDaten);
        console.log(`🔍 parseRechnungsDaten [${projekt.kundenname}]: Geparste Daten:`, parsed);
        console.log(`🔍 parseRechnungsDaten [${projekt.kundenname}]: gesamtBrutto=${parsed.gesamtBrutto}, bruttobetrag=${parsed.bruttobetrag}`);
        return parsed as RechnungsDaten;
      } catch (e) {
        console.error(`🔍 parseRechnungsDaten [${projekt.kundenname}]: PARSE-FEHLER:`, e);
        return null;
      }
    }
    return null;
  }

  /**
   * Berechnet das Fälligkeitsdatum
   */
  private berechneFaelligkeitsdatum(rechnungsdatum: string, zahlungszielTage: number): string {
    const datum = new Date(rechnungsdatum);
    datum.setDate(datum.getDate() + zahlungszielTage);
    return datum.toISOString().split('T')[0];
  }

  /**
   * Berechnet die Tage überfällig
   */
  private berechneTageUeberfaellig(faelligkeitsdatum: string): number {
    const heute = new Date();
    const faellig = new Date(faelligkeitsdatum);
    const diff = heute.getTime() - faellig.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Mapping tageUeberfaellig → Status (ohne Zahlungs-/Mahnungs-Logik).
   *   tageUeberfaellig > 14 → 'ueberfaellig'
   *   tageUeberfaellig >  0 → 'faellig'
   *   sonst                 → 'offen'
   */
  private statusAusTage(tageUeberfaellig: number): DebitorStatus {
    if (tageUeberfaellig > 14) return 'ueberfaellig';
    if (tageUeberfaellig > 0) return 'faellig';
    return 'offen';
  }

  /**
   * Berechnet den Status aus Rechnungsdaten. Nutzt — wenn vorhanden — den $createdAt-Zeitstempel
   * des Rechnungsdokuments als "Rechnungsstellung". Das vermeidet, dass nutzer-eingegebene
   * (möglicherweise rückdatierte) projekt.rechnungsdatum-Werte zu sofortiger Überfälligkeit führen.
   */
  private berechneStatusAusRechnung(
    projekt: Projekt,
    zahlungszielTage?: number,
    rechnungsDokument?: RechnungsDokument | null
  ): DebitorStatus {
    if (projekt.status === 'bezahlt' || projekt.bezahltAm) {
      return 'bezahlt';
    }

    // Rechnungsstellungs-Datum nach gleicher Priorität wie in createDebitorView:
    // 1. Rechnungsdokument.$createdAt (= wann die Rechnung im System erstellt wurde)
    // 2. projekt.rechnungsdatum (Top-Level, vom User gesetzt)
    // 3. rechnungsdatum aus geparstem rechnungsDaten-JSON
    // 4. erstelltAm (letzter Notnagel)
    let rechnungsdatum: string | undefined;
    if (rechnungsDokument?.$createdAt) {
      rechnungsdatum = rechnungsDokument.$createdAt.split('T')[0];
    } else if (projekt.rechnungsdatum) {
      rechnungsdatum = projekt.rechnungsdatum;
    } else {
      const inner = this.parseRechnungsDaten(projekt) as
        | (RechnungsDaten & Partial<VolleRechnungsDaten>)
        | null;
      if (inner?.rechnungsdatum) {
        rechnungsdatum = inner.rechnungsdatum;
      }
    }

    const faelligkeitsdatum = this.berechneFaelligkeitsdatum(
      rechnungsdatum || projekt.erstelltAm,
      zahlungszielTage || STANDARD_ZAHLUNGSZIEL_TAGE
    );
    return this.statusAusTage(this.berechneTageUeberfaellig(faelligkeitsdatum));
  }

  /**
   * Prüft ob ein Debitor dem Filter entspricht
   */
  private matchesFilter(debitor: DebitorView, filter?: DebitorFilter): boolean {
    if (!filter) return true;

    if (filter.status?.length && !filter.status.includes(debitor.status)) {
      return false;
    }

    if (filter.mahnstufe?.length && !filter.mahnstufe.includes(debitor.mahnstufe)) {
      return false;
    }

    if (filter.prioritaet?.length && !filter.prioritaet.includes(debitor.prioritaet)) {
      return false;
    }

    if (filter.nurUeberfaellig && debitor.tageUeberfaellig <= 0) {
      return false;
    }

    if (filter.nurGesperrt && !debitor.gesperrt) {
      return false;
    }

    if (filter.betragMin !== undefined && debitor.offenerBetrag < filter.betragMin) {
      return false;
    }

    if (filter.betragMax !== undefined && debitor.offenerBetrag > filter.betragMax) {
      return false;
    }

    if (filter.suche) {
      const suchtext = filter.suche.toLowerCase();
      const matches =
        debitor.kundenname.toLowerCase().includes(suchtext) ||
        debitor.rechnungsnummer?.toLowerCase().includes(suchtext) ||
        debitor.kundennummer?.toLowerCase().includes(suchtext);
      if (!matches) return false;
    }

    return true;
  }
}

export const debitorService = new DebitorService();

/**
 * Berechnet die Mahn-Empfehlung für einen Debitor.
 *
 * Regeln:
 *   - Bezahlte oder noch nicht fällige Debitoren: 'keine'
 *   - Mahnstufe 0 + tageUeberfaellig > 14: 'zahlungserinnerung'
 *   - Mahnstufe 1 + > 7 Tage seit letzter Mahnung: 'mahnung_1'
 *   - Mahnstufe 2 + > 7 Tage seit letzter Mahnung: 'mahnung_2'
 *   - Mahnstufe 3 + > 14 Tage seit letzter Mahnung: 'inkasso'
 *   - Sonst (gerade gemahnt, noch in Wartezeit): 'keine'
 */
export function berechneMahnEmpfehlung(debitor: DebitorView): MahnEmpfehlung {
  if (debitor.status === 'bezahlt') return 'keine';
  if (debitor.tageUeberfaellig <= 0) return 'keine';

  const heute = new Date();
  const tageSeitLetzterMahnung = debitor.letzteMahnungAm
    ? Math.floor((heute.getTime() - new Date(debitor.letzteMahnungAm).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  switch (debitor.mahnstufe) {
    case 0:
      return debitor.tageUeberfaellig > 14 ? 'zahlungserinnerung' : 'keine';
    case 1:
      return tageSeitLetzterMahnung > 7 ? 'mahnung_1' : 'keine';
    case 2:
      return tageSeitLetzterMahnung > 7 ? 'mahnung_2' : 'keine';
    case 3:
      return tageSeitLetzterMahnung > 14 ? 'inkasso' : 'keine';
    case 4:
      return 'keine'; // Bereits in Inkasso — kein weiterer Schritt
    default:
      return 'keine';
  }
}
