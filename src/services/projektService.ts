import { databases, DATABASE_ID, COLLECTIONS } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Projekt, NeuesProjekt, ProjektFilter, ProjektStatus, HydrocourtStatus, TeilprojektTyp } from '../types/projekt';
import { loadAllDocuments } from '../utils/appwritePagination';
import { handleServiceError } from '../utils/errorHandling';
import { saisonplanungService } from './saisonplanungService';
import { kundenListeService } from './kundenListeService';
import { platzbauerverwaltungService } from './platzbauerverwaltungService';
import { generiereNaechsteDokumentnummer } from './nummerierungService';
import { AuftragsbestaetigungsDaten, Position } from '../types/projektabwicklung';

// Optionen für Projekt-Erstellung
export interface CreateProjektOptions {
  // Wenn true, wird KEINE automatische Zuordnung zu PlatzbauerProjekt gemacht
  // Nützlich für Platzbauer-Vereine die direkt als einzelne Projekte angelegt werden
  skipPlatzbauerProjektZuordnung?: boolean;
}

// Simple In-Memory Cache für schnelleres Laden
interface ProjektCache {
  projekte: Projekt[];
  timestamp: number;
  saisonjahr?: number;
}

const CACHE_TTL = 30000; // 30 Sekunden Cache
let projektCache: ProjektCache | null = null;

// Maximalgröße für das `data`-Feld in Appwrite (Schema: 100000, aber alte Collections können noch
// 10000 sein). Wir nutzen eine konservative Schwelle, um Sicherheitsmarge zu lassen.
const MAX_DATA_FIELD_SIZE = 9500;

// Felder, die als eigene Appwrite-Spalten existieren (Top-Level). Diese werden beim Lesen aus
// dem Dokument bevorzugt — die JSON-Kopie in `data` kann nach Partial-Updates veraltet sein.
const PROJEKT_TOP_LEVEL_FELDER = [
  'status',
  'geaendertAm',
  'bezahltAm',
  'rechnungsnummer',
  'rechnungsdatum',
  'rechnungVersendetAm',
  'erzeugungsBatchId',
] as const;

// Top-Level-Felder, die erst mit Schema-Version 39 (siehe appwriteSetup.ts) angelegt werden.
// Solange die Migration auf einer Umgebung noch nicht gelaufen ist, akzeptiert Appwrite sie nicht
// und wirft "Unknown attribute". `updateProjektMitSchemaFallback` entfernt fehlende Felder einzeln
// und wiederholt den Request — so degradiert das System graceful, statt einen 400 durchzulassen.
const SCHEMA_V39_OPTIONALE_FELDER: ReadonlySet<string> = new Set([
  'bezahltAm',
  'rechnungsnummer',
  'rechnungsdatum',
  'rechnungVersendetAm',
]);

function extrahiereUnbekanntesAttribut(message: string): string | null {
  const match = message.match(/Unknown attribute:\s*"?([\w-]+)"?/i);
  return match ? match[1] : null;
}

async function updateProjektMitSchemaFallback(
  collectionId: string,
  projektId: string,
  dokument: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    return (await databases.updateDocument(
      DATABASE_ID,
      collectionId,
      projektId,
      dokument
    )) as unknown as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unbekanntesFeld = extrahiereUnbekanntesAttribut(message);
    if (!unbekanntesFeld || !SCHEMA_V39_OPTIONALE_FELDER.has(unbekanntesFeld)) {
      throw error;
    }
    if (!(unbekanntesFeld in dokument)) {
      throw error;
    }
    console.warn(
      `Schema-Migration ausstehend: Top-Level-Feld "${unbekanntesFeld}" existiert noch nicht in Appwrite. Schreibe ohne dieses Feld weiter (npm run setup:appwrite ausführen, um Schema-Version 39 anzulegen).`
    );
    const { [unbekanntesFeld]: _entfernt, ...rest } = dokument;
    return updateProjektMitSchemaFallback(collectionId, projektId, rest);
  }
}

// Wandelt ein Appwrite-Dokument in ein Projekt um. Top-Level-Felder überschreiben den JSON-Blob
// in `data` (denormalisierte Spalten gelten als Source of Truth nach Partial-Updates).
function parseProjektDocument(doc: Record<string, unknown>): Projekt {
  let base: Record<string, unknown>;
  if (doc.data && typeof doc.data === 'string') {
    try {
      base = JSON.parse(doc.data);
    } catch {
      base = { ...doc };
    }
  } else {
    base = { ...doc };
  }

  for (const feld of PROJEKT_TOP_LEVEL_FELDER) {
    const wert = doc[feld];
    if (wert !== undefined && wert !== null && wert !== '') {
      base[feld] = wert;
    }
  }

  base.$id = doc.$id;
  return base as unknown as Projekt;
}

class ProjektService {
  private readonly collectionId = COLLECTIONS.PROJEKTE;

  // Cache invalidieren (nach Updates)
  invalidateCache() {
    projektCache = null;
  }

  // Alle Projekte laden mit optionalen Filtern
  async loadProjekte(filter?: ProjektFilter): Promise<Projekt[]> {
    try {
      const queries: string[] = [];

      if (filter?.status && filter.status.length > 0) {
        queries.push(Query.equal('status', filter.status));
      }

      if (filter?.saisonjahr) {
        queries.push(Query.equal('saisonjahr', filter.saisonjahr));
      }

      if (filter?.suche) {
        // Verwende Query.contains statt Query.search (benötigt keinen Fulltext-Index)
        queries.push(Query.contains('kundenname', filter.suche));
      }

      queries.push(Query.orderDesc('erstelltAm'));

      const documents = await loadAllDocuments(DATABASE_ID, this.collectionId, { queries });
      return documents.map(doc => parseProjektDocument(doc as Record<string, unknown>));
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
      throw error;
    }
  }

  // Alle Projekte eines Massen-Angebots-Laufs laden (für Rollback).
  // Primär über die top-level Spalte erzeugungsBatchId; Fallback (Schema noch nicht migriert):
  // alle Projekte laden und nach dem Wert im geparsten Dokument filtern.
  async loadProjekteFuerBatch(batchId: string): Promise<Projekt[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, this.collectionId, {
        queries: [Query.equal('erzeugungsBatchId', batchId)],
      });
      return documents.map(doc => parseProjektDocument(doc as Record<string, unknown>));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Unknown attribute|Attribute not found/i.test(message)) {
        console.error('Fehler beim Laden der Batch-Projekte:', error);
        throw error;
      }
      console.warn(
        'erzeugungsBatchId-Spalte fehlt (Schema < v43). Rollback fällt auf Volltext-Scan zurück.'
      );
      const alle = await loadAllDocuments(DATABASE_ID, this.collectionId, {
        queries: [Query.orderDesc('erstelltAm')],
      });
      return alle
        .map(doc => parseProjektDocument(doc as Record<string, unknown>))
        .filter(p => p.erzeugungsBatchId === batchId);
    }
  }

  // Projekte gruppiert nach Status laden (mit Cache!)
  async loadProjekteGruppiert(saisonjahr?: number): Promise<{
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  }> {
    try {
      // Cache prüfen
      const now = Date.now();
      if (projektCache &&
          projektCache.saisonjahr === saisonjahr &&
          (now - projektCache.timestamp) < CACHE_TTL) {
        const projekte = projektCache.projekte;
        return {
          angebot: projekte.filter((p) => p.status === 'angebot'),
          angebot_versendet: projekte.filter((p) => p.status === 'angebot_versendet'),
          auftragsbestaetigung: projekte.filter((p) => p.status === 'auftragsbestaetigung'),
          lieferschein: projekte.filter((p) => p.status === 'lieferschein'),
          rechnung: projekte.filter((p) => p.status === 'rechnung'),
          bezahlt: projekte.filter((p) => p.status === 'bezahlt'),
          verloren: projekte.filter((p) => p.status === 'verloren'),
        };
      }

      const queries: string[] = [Query.orderDesc('erstelltAm')];

      if (saisonjahr) {
        queries.push(Query.equal('saisonjahr', saisonjahr));
      }

      const documents = await loadAllDocuments(DATABASE_ID, this.collectionId, { queries });

      // WICHTIG: data JSON-Feld parsen + Top-Level-Felder mergen (siehe parseProjektDocument).
      const projekte = documents.map(doc =>
        parseProjektDocument(doc as Record<string, unknown>)
      );

      // Cache aktualisieren
      projektCache = {
        projekte,
        timestamp: now,
        saisonjahr,
      };

      return {
        angebot: projekte.filter((p) => p.status === 'angebot'),
        angebot_versendet: projekte.filter((p) => p.status === 'angebot_versendet'),
        auftragsbestaetigung: projekte.filter((p) => p.status === 'auftragsbestaetigung'),
        lieferschein: projekte.filter((p) => p.status === 'lieferschein'),
        rechnung: projekte.filter((p) => p.status === 'rechnung'),
        bezahlt: projekte.filter((p) => p.status === 'bezahlt'),
        verloren: projekte.filter((p) => p.status === 'verloren'),
      };
    } catch (error) {
      console.error('Fehler beim Laden der gruppierten Projekte:', error);
      throw error;
    }
  }

  // Einzelnes Projekt laden
  async getProjekt(projektId: string): Promise<Projekt> {
    try {
      const response = await databases.getDocument(DATABASE_ID, this.collectionId, projektId);
      return parseProjektDocument(response as unknown as Record<string, unknown>);
    } catch (error: unknown) {
      // 404-Fehler sind erwartet (Projekt gelöscht) - nicht loggen
      const is404 = error instanceof Error && error.message?.includes('could not be found');
      if (!is404) {
        console.error('Fehler beim Laden des Projekts:', error);
      }
      throw error;
    }
  }

  // Alle Projekte für ein Saisonjahr laden (für Prüfung ob Kunde bereits Projekt hat)
  async getAllProjekte(saisonjahr: number): Promise<Projekt[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, this.collectionId, {
        queries: [Query.equal('saisonjahr', saisonjahr)],
      });

      return documents as unknown as Projekt[];
    } catch (error) {
      console.error('Fehler beim Laden aller Projekte:', error);
      return []; // Return leeres Array bei Fehler (z.B. Collection existiert noch nicht)
    }
  }

  // Projekt für einen Kunden finden (aktuelle Saison)
  async getProjektFuerKunde(kundeId: string, saisonjahr: number): Promise<Projekt | null> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('kundeId', kundeId),
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(1),
      ]);

      if (response.documents.length > 0) {
        return parseProjektDocument(response.documents[0] as Record<string, unknown>);
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Laden des Projekts für Kunde:', error);
      throw error;
    }
  }

  // ALLE Projekte für einen Kunden laden (über alle Saisonjahre)
  // KRITISCH: Verwendet kundeId statt kundenname für zuverlässige Verknüpfung
  async loadProjekteFuerKundeId(kundeId: string): Promise<Projekt[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('kundeId', kundeId),
        Query.orderDesc('saisonjahr'),
        Query.limit(100),
      ]);

      return response.documents.map(doc => parseProjektDocument(doc as Record<string, unknown>));
    } catch (error) {
      console.error('Fehler beim Laden der Projekte für KundeId:', error);
      return [];
    }
  }

  // Projekt für eine Kundennummer finden (aktuelle Saison)
  async getProjektFuerKundennummer(kundennummer: string, saisonjahr: number): Promise<Projekt | null> {
    try {
      if (!kundennummer) return null;

      // Lade alle Projekte für das Saisonjahr und filtere nach Kundennummer
      const documents = await loadAllDocuments(DATABASE_ID, this.collectionId, {
        queries: [Query.equal('saisonjahr', saisonjahr)],
      });

      // Parse die Projekte und suche nach Kundennummer
      for (const doc of documents) {
        const projekt = parseProjektDocument(doc as Record<string, unknown>);
        if (projekt.kundennummer === kundennummer) {
          return projekt;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Fehler beim Laden des Projekts für Kundennummer:', error);
      throw error;
    }
  }

  // Neues Projekt erstellen
  async createProjekt(projekt: NeuesProjekt, options?: CreateProjektOptions): Promise<Projekt> {
    try {
      const dokumentId = projekt.id || ID.unique();
      const jetzt = new Date().toISOString();

      // WICHTIG: Stelle sicher, dass die Kundennummer gesetzt ist
      // Lade sie aus dem Kunden-Datensatz falls nicht vorhanden
      let kundennummer = projekt.kundennummer;
      let lieferadresse = projekt.lieferadresse;
      let rechnungsEmail = projekt.rechnungsEmail;

      if (projekt.kundeId) {
        // Versuche zuerst aus Kundenliste zu laden
        try {
          const kundenListeKunde = await kundenListeService.get(projekt.kundeId);
          if (kundenListeKunde) {
            if (!kundennummer && kundenListeKunde.kundennummer) {
              kundennummer = kundenListeKunde.kundennummer;
            }
            // Übernehme Lieferadresse aus Kundenliste, falls vorhanden
            if (!lieferadresse && kundenListeKunde.lieferadresse) {
              lieferadresse = kundenListeKunde.lieferadresse;
            }
          }
        } catch (error) {
          console.warn('Konnte Kunde nicht aus Kundenliste laden, versuche Saisonplanung:', error);
        }

        // Falls nicht in Kundenliste gefunden, versuche Saisonplanung
        if (!kundennummer || !rechnungsEmail) {
          try {
            const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
            if (kunde) {
              if (!kundennummer && kunde.kundennummer) {
                kundennummer = kunde.kundennummer;
              }
              // Übernehme abweichende Rechnungs-E-Mail falls vorhanden
              if (!rechnungsEmail && kunde.rechnungsEmail) {
                rechnungsEmail = kunde.rechnungsEmail;
              }
            }
          } catch (error) {
            console.warn('Konnte Kundendaten nicht aus Kunden-Datensatz laden:', error);
            // Verwende undefined als Fallback
          }
        }
      }

      const neuesProjekt: Projekt = {
        ...projekt,
        kundennummer: kundennummer, // Stelle sicher, dass Kundennummer gesetzt ist
        lieferadresse: lieferadresse, // Übernehme Lieferadresse aus Kunde
        rechnungsEmail: rechnungsEmail, // Übernehme abweichende Rechnungs-E-Mail aus Kunde
        id: dokumentId,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      } as Projekt;

      const dokument: Record<string, unknown> = {
        projektName: neuesProjekt.projektName,
        kundeId: neuesProjekt.kundeId,
        kundenname: neuesProjekt.kundenname,
        saisonjahr: neuesProjekt.saisonjahr,
        status: neuesProjekt.status,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify(neuesProjekt),
      };
      // Massen-Angebots-Tool: Batch-ID als top-level Spalte für Rollback. Der Wert liegt
      // zusätzlich in `data`, daher ist ein Fallback ohne die Spalte verlustfrei (Schema v43).
      if (neuesProjekt.erzeugungsBatchId) {
        dokument.erzeugungsBatchId = neuesProjekt.erzeugungsBatchId;
      }

      let response;
      try {
        response = await databases.createDocument(
          DATABASE_ID,
          this.collectionId,
          dokumentId,
          dokument
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (dokument.erzeugungsBatchId && /Unknown attribute/i.test(message)) {
          console.warn(
            'Schema-Migration ausstehend: projekte.erzeugungsBatchId existiert noch nicht (npm run setup:appwrite für v43). Batch-ID bleibt nur in `data`.'
          );
          const { erzeugungsBatchId: _entfernt, ...ohneFeld } = dokument;
          response = await databases.createDocument(
            DATABASE_ID,
            this.collectionId,
            dokumentId,
            ohneFeld
          );
        } else {
          throw error;
        }
      }

      // Cache invalidieren nach Erstellung
      this.invalidateCache();

      let erstelltesProjekt: Projekt = parseProjektDocument(
        response as unknown as Record<string, unknown>
      );

      // ===== AUTOMATISCHE PLATZBAUER-ZUORDNUNG =====
      // Prüfe ob der Kunde über einen Platzbauer bezieht
      // WICHTIG: Überspringen wenn skipPlatzbauerProjektZuordnung gesetzt ist!
      if (projekt.kundeId && projekt.saisonjahr && !options?.skipPlatzbauerProjektZuordnung) {
        try {
          const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
          if (kunde && kunde.standardBezugsweg === 'ueber_platzbauer' && kunde.standardPlatzbauerId) {
            console.log('Auto-Zuordnung: Verein bezieht über Platzbauer', kunde.standardPlatzbauerId);

            // Prüfe ob Platzbauer ein Saisonprojekt hat, sonst erstelle eines
            const platzbauerprojekte = await platzbauerverwaltungService.loadProjekteFuerPlatzbauer(
              kunde.standardPlatzbauerId,
              projekt.saisonjahr
            );

            // Finde das Saisonprojekt (nicht Nachtrag)
            let saisonprojekt = platzbauerprojekte.find(p => p.typ === 'saisonprojekt');

            if (!saisonprojekt) {
              // Erstelle Saisonprojekt für diesen Platzbauer
              console.log('Erstelle Saisonprojekt für Platzbauer:', kunde.standardPlatzbauerId);
              saisonprojekt = await platzbauerverwaltungService.createPlatzbauerprojekt(
                kunde.standardPlatzbauerId,
                projekt.saisonjahr,
                { status: 'angebot' }
              );
            }

            // Ordne Vereinsprojekt dem Platzbauerprojekt zu
            await platzbauerverwaltungService.ordneVereinsprojektZu(
              erstelltesProjekt.id,
              saisonprojekt.id
            );

            // Aktualisiere das Projekt mit der Zuordnung
            erstelltesProjekt = await this.updateProjekt(erstelltesProjekt.id, {
              istPlatzbauerprojekt: true,
              zugeordnetesPlatzbauerprojektId: saisonprojekt.id,
            });

            console.log('Vereinsprojekt dem Platzbauer-Saisonprojekt zugeordnet:', saisonprojekt.id);
          }
        } catch (zuordnungError) {
          console.error('Fehler bei automatischer Platzbauer-Zuordnung:', zuordnungError);
          // Projekt wurde trotzdem erstellt, nur Zuordnung fehlgeschlagen
        }
      }

      return erstelltesProjekt;
    } catch (error) {
      handleServiceError(error, 'Erstellen des Projekts');
    }
  }

  // Projekt aktualisieren
  async updateProjekt(projektId: string, updates: Partial<Projekt>): Promise<Projekt> {
    try {
      // Erst das aktuelle Projekt laden
      const aktuell = await this.getProjekt(projektId);
      
      // WICHTIG: Wenn der Kundenname geändert wird, lade die Kundennummer aus dem Kunden-Datensatz
      // um die Verknüpfung zum Projekt zu erhalten
      let kundennummer = updates.kundennummer !== undefined ? updates.kundennummer : aktuell.kundennummer;
      
      // Wenn kundeId vorhanden ist und der Kundenname geändert wird, aktualisiere die Kundennummer
      if (aktuell.kundeId && (updates.kundenname !== undefined || updates.kundennummer === undefined)) {
        try {
          const kunde = await saisonplanungService.loadKunde(aktuell.kundeId);
          if (kunde && kunde.kundennummer) {
            kundennummer = kunde.kundennummer;
          }
        } catch (error) {
          console.warn('Konnte Kundennummer nicht aus Kunden-Datensatz laden:', error);
          // Verwende die vorhandene Kundennummer als Fallback
        }
      }
      
      const aktualisiert = {
        ...aktuell,
        ...updates,
        kundennummer: kundennummer, // Stelle sicher, dass Kundennummer gesetzt ist
        geaendertAm: new Date().toISOString(),
      };

      const dokument: Record<string, unknown> = {
        projektName: aktualisiert.projektName,
        kundeId: aktualisiert.kundeId,
        kundenname: aktualisiert.kundenname,
        saisonjahr: aktualisiert.saisonjahr,
        status: aktualisiert.status,
        geaendertAm: aktualisiert.geaendertAm,
        // Top-Level-Spalten für Debitorenverwaltung — werden beim Lesen bevorzugt (siehe parseProjektDocument).
        // Null statt undefined senden, damit Appwrite das Feld bei Bedarf leert.
        bezahltAm: aktualisiert.bezahltAm ?? null,
        rechnungsnummer: aktualisiert.rechnungsnummer ?? null,
        rechnungsdatum: aktualisiert.rechnungsdatum ?? null,
      };

      // Wenn das serialisierte `data` über dem Appwrite-Limit liegt (z.B. Projekte mit großen
      // rechnungsDaten), nur die Top-Level-Felder schreiben. Verhindert den 10000-chars-Fehler.
      const serialisiert = JSON.stringify(aktualisiert);
      if (serialisiert.length <= MAX_DATA_FIELD_SIZE) {
        dokument.data = serialisiert;
      } else {
        console.warn(
          `Projekt ${projektId}: data-Blob ist zu groß (${serialisiert.length} Zeichen) — Partial-Update auf Top-Level-Felder, data bleibt unverändert.`
        );
      }

      const response = await updateProjektMitSchemaFallback(this.collectionId, projektId, dokument);

      // Cache invalidieren nach Update
      this.invalidateCache();

      return parseProjektDocument(response);
    } catch (error) {
      handleServiceError(error, 'Aktualisieren des Projekts');
    }
  }

  /**
   * Partial-Update: Setzt ein Projekt auf "bezahlt" — schreibt NUR die Top-Level-Felder
   * (status, bezahltAm, geaendertAm) und lässt das große `data`-Feld unangetastet.
   * Erforderlich für Projekte mit großen rechnungsDaten, deren `data` das Appwrite-Limit ausreizt.
   */
  async markiereProjektAlsBezahlt(projektId: string, bezahltAm?: string): Promise<Projekt> {
    try {
      const jetzt = new Date().toISOString();
      const response = await updateProjektMitSchemaFallback(this.collectionId, projektId, {
        status: 'bezahlt',
        bezahltAm: bezahltAm ?? jetzt,
        geaendertAm: jetzt,
      });
      this.invalidateCache();
      return parseProjektDocument(response);
    } catch (error) {
      handleServiceError(error, 'Markieren des Projekts als bezahlt');
    }
  }

  /**
   * Partial-Update: setzt rechnungsnummer + rechnungsdatum + status='rechnung' auf dem Projekt.
   *
   * Schreibt NUR die Top-Level-Felder (kein `data`-Blob) — wichtig wenn das data-Feld am
   * Appwrite-10000-Zeichen-Limit kratzt und ein voller updateProjekt() fehlschlagen würde.
   *
   * Invariante: Projekt mit aktiver Rechnung MUSS status='rechnung' (oder 'bezahlt') und eine
   * rechnungsnummer haben. Diese Methode stellt beides in einem Schritt sicher.
   */
  async setzeRechnungsdaten(
    projektId: string,
    rechnungsnummer: string,
    rechnungsdatum: string
  ): Promise<Projekt> {
    try {
      const response = await updateProjektMitSchemaFallback(this.collectionId, projektId, {
        status: 'rechnung',
        rechnungsnummer,
        rechnungsdatum,
        geaendertAm: new Date().toISOString(),
      });
      this.invalidateCache();
      return parseProjektDocument(response);
    } catch (error) {
      handleServiceError(error, 'Setzen der Rechnungsdaten');
    }
  }

  /**
   * Markiert eine Rechnung als per E-Mail versendet (setzt rechnungVersendetAm).
   * Schreibt NUR das Top-Level-Feld (kein data-Blob → keine 10.000-Zeichen-Falle).
   */
  async markiereRechnungVersendet(projektId: string, versendetAm?: string): Promise<Projekt> {
    try {
      const response = await updateProjektMitSchemaFallback(this.collectionId, projektId, {
        rechnungVersendetAm: versendetAm ?? new Date().toISOString(),
        geaendertAm: new Date().toISOString(),
      });
      this.invalidateCache();
      return parseProjektDocument(response);
    } catch (error) {
      handleServiceError(error, 'Markieren der Rechnung als versendet');
    }
  }

  // Projekt-Status ändern
  async updateProjektStatus(projektId: string, neuerStatus: ProjektStatus): Promise<Projekt> {
    try {
      // Erst das aktuelle Projekt laden
      const aktuell = await this.getProjekt(projektId);

      const aktualisiert = {
        ...aktuell,
        status: neuerStatus,
        geaendertAm: new Date().toISOString(),
      };

      const dokument: Record<string, unknown> = {
        projektName: aktualisiert.projektName,
        kundeId: aktualisiert.kundeId,
        kundenname: aktualisiert.kundenname,
        saisonjahr: aktualisiert.saisonjahr,
        status: aktualisiert.status,
        geaendertAm: aktualisiert.geaendertAm,
      };

      const serialisiert = JSON.stringify(aktualisiert);
      if (serialisiert.length <= MAX_DATA_FIELD_SIZE) {
        dokument.data = serialisiert;
      } else {
        console.warn(
          `Projekt ${projektId}: data-Blob ist zu groß (${serialisiert.length} Zeichen) — Status-Partial-Update.`
        );
      }

      const response = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        projektId,
        dokument
      );

      // Cache invalidieren nach Status-Update
      this.invalidateCache();

      return parseProjektDocument(response as unknown as Record<string, unknown>);
    } catch (error) {
      handleServiceError(error, 'Aktualisieren des Projekt-Status');
    }
  }

  // Projekt löschen
  async deleteProjekt(projekt: Projekt): Promise<void> {
    try {
      // Verwende $id falls vorhanden, sonst id
      const documentId = projekt.$id || projekt.id;
      console.log('Lösche Projekt mit documentId:', documentId);
      await databases.deleteDocument(DATABASE_ID, this.collectionId, documentId);
      // Cache invalidieren nach Löschen
      this.invalidateCache();
    } catch (error) {
      handleServiceError(error, 'Löschen des Projekts');
    }
  }

  // Koordinaten eines Projekts aktualisieren (für Geocoding)
  async updateProjektKoordinaten(
    projektId: string,
    koordinaten: [number, number],
    quelle: 'exakt' | 'plz' | 'manuell'
  ): Promise<Projekt> {
    try {
      return await this.updateProjekt(projektId, {
        koordinaten,
        koordinatenQuelle: quelle,
        adresseUnbekannt: false,
      });
    } catch (error) {
      handleServiceError(error, 'Aktualisieren der Koordinaten');
    }
  }

  // Markiere Projekt als "Adresse unbekannt"
  async markiereAdresseUnbekannt(projektId: string): Promise<Projekt> {
    try {
      return await this.updateProjekt(projektId, {
        koordinaten: undefined,
        koordinatenQuelle: undefined,
        adresseUnbekannt: true,
      });
    } catch (error) {
      handleServiceError(error, 'Markieren der Adresse als unbekannt');
    }
  }

  // === HYDROCOURT STATUS MANAGEMENT ===

  // Hydrocourt-Status aktualisieren
  async updateHydrocourtStatus(
    projektId: string,
    status: HydrocourtStatus,
    zusatzDaten?: {
      bestelltAm?: string;
      trackingNummer?: string;
      versendetAm?: string;
      notizen?: string;
    }
  ): Promise<Projekt> {
    try {
      const updates: Partial<Projekt> = {
        hydrocourtStatus: status,
      };

      // Status-spezifische Timestamps setzen
      if (status === 'bestellt' && !zusatzDaten?.bestelltAm) {
        updates.hydrocourtBestelltAm = new Date().toISOString();
      }
      if (status === 'versendet' && !zusatzDaten?.versendetAm) {
        updates.hydrocourtVersendetAm = new Date().toISOString();
      }

      // Zusätzliche Daten übernehmen
      if (zusatzDaten?.bestelltAm) updates.hydrocourtBestelltAm = zusatzDaten.bestelltAm;
      if (zusatzDaten?.trackingNummer) updates.hydrocourtTrackingNummer = zusatzDaten.trackingNummer;
      if (zusatzDaten?.versendetAm) updates.hydrocourtVersendetAm = zusatzDaten.versendetAm;
      if (zusatzDaten?.notizen !== undefined) updates.hydrocourtNotizen = zusatzDaten.notizen;

      return await this.updateProjekt(projektId, updates);
    } catch (error) {
      handleServiceError(error, 'Aktualisieren des Hydrocourt-Status');
    }
  }

  // Tracking-Nummer setzen und automatisch auf "versendet" wechseln
  async setHydrocourtTracking(projektId: string, trackingNummer: string): Promise<Projekt> {
    try {
      return await this.updateProjekt(projektId, {
        hydrocourtStatus: 'versendet',
        hydrocourtTrackingNummer: trackingNummer,
        hydrocourtVersendetAm: new Date().toISOString(),
      });
    } catch (error) {
      handleServiceError(error, 'Setzen der Hydrocourt-Tracking-Nummer');
    }
  }

  // Mehrere Projekte auf "bestellt" setzen (Batch-Update für "An Schwab senden")
  async setHydrocourtBestellt(projektIds: string[]): Promise<void> {
    try {
      const bestelltAm = new Date().toISOString();
      await Promise.all(
        projektIds.map(projektId =>
          this.updateProjekt(projektId, {
            hydrocourtStatus: 'bestellt',
            hydrocourtBestelltAm: bestelltAm,
          })
        )
      );
    } catch (error) {
      handleServiceError(error, 'Batch-Update des Hydrocourt-Status');
    }
  }

  // === PROJEKT SPLITTING ===

  /**
   * Teilt ein Projekt in ein Haupt- und ein Teilprojekt auf.
   * Die gefilterten Positionen (Universal oder Hydrocourt) werden in ein neues Projekt verschoben.
   *
   * @param quellProjektId - ID des Projekts, das aufgeteilt werden soll
   * @param positionsFilter - 'universal' oder 'hydrocourt' - welche Positionen ausgelagert werden
   * @returns Das neue Teilprojekt und das aktualisierte Quellprojekt
   */
  async splitProjekt(
    quellProjektId: string,
    positionsFilter: TeilprojektTyp
  ): Promise<{ neuesProjekt: Projekt; aktualisiertesQuellProjekt: Projekt }> {
    try {
      console.log(`🔀 Starte Projekt-Split: ${quellProjektId} → ${positionsFilter}`);

      // 1. Quellprojekt laden
      const quellProjekt = await this.getProjekt(quellProjektId);

      // Prüfe ob AB vorhanden
      if (!quellProjekt.auftragsbestaetigungsDaten) {
        throw new Error('Projekt hat keine Auftragsbestätigung. Split ist nur nach AB-Erstellung möglich.');
      }

      // Parse AB-Daten
      let abDaten: AuftragsbestaetigungsDaten;
      try {
        abDaten = JSON.parse(quellProjekt.auftragsbestaetigungsDaten);
      } catch {
        throw new Error('Auftragsbestätigungsdaten konnten nicht gelesen werden.');
      }

      if (!abDaten.positionen || abDaten.positionen.length === 0) {
        throw new Error('Auftragsbestätigung enthält keine Positionen.');
      }

      // 2. Positionen aufteilen
      const auszulagern: Position[] = [];
      const verbleibend: Position[] = [];

      for (const position of abDaten.positionen) {
        const istUniversal = position.istUniversalArtikel === true ||
                              position.beschreibung?.startsWith('Universal:');
        const istHydrocourt = position.artikelnummer === 'TM-HYC';

        if (positionsFilter === 'universal' && istUniversal) {
          auszulagern.push(position);
        } else if (positionsFilter === 'hydrocourt' && istHydrocourt) {
          auszulagern.push(position);
        } else {
          verbleibend.push(position);
        }
      }

      if (auszulagern.length === 0) {
        throw new Error(`Keine ${positionsFilter === 'universal' ? 'Universal' : 'Hydrocourt'}-Positionen zum Auslagern gefunden.`);
      }

      if (verbleibend.length === 0) {
        throw new Error('Es würden keine Positionen im Originalprojekt verbleiben. Split nicht möglich.');
      }

      console.log(`📦 Positionen: ${auszulagern.length} auslagern, ${verbleibend.length} verbleiben`);

      // 3. Neue AB-Nummer generieren
      const neueAbNummer = await generiereNaechsteDokumentnummer('auftragsbestaetigung');
      const jetzt = new Date().toISOString();
      const heute = jetzt.split('T')[0];

      // 4. Neues Teilprojekt erstellen
      const teilprojektName = positionsFilter === 'universal'
        ? `${quellProjekt.kundenname} - Universal`
        : `${quellProjekt.kundenname} - Hydrocourt`;

      // AB-Daten für Teilprojekt (mit ausgelagerten Positionen)
      const teilprojektAbDaten: AuftragsbestaetigungsDaten = {
        ...abDaten,
        auftragsbestaetigungsnummer: neueAbNummer,
        auftragsbestaetigungsdatum: heute,
        positionen: auszulagern,
      };

      const neuesProjektDaten: NeuesProjekt = {
        projektName: teilprojektName,
        kundeId: quellProjekt.kundeId,
        kundennummer: quellProjekt.kundennummer,
        kundenname: quellProjekt.kundenname,
        kundenstrasse: quellProjekt.kundenstrasse,
        kundenPlzOrt: quellProjekt.kundenPlzOrt,
        kundenEmail: quellProjekt.kundenEmail,
        kundenTelefon: quellProjekt.kundenTelefon,
        rechnungsEmail: quellProjekt.rechnungsEmail,
        ansprechpartner: quellProjekt.ansprechpartner,
        lieferadresse: quellProjekt.lieferadresse,
        saisonjahr: quellProjekt.saisonjahr,
        status: 'auftragsbestaetigung',

        // AB-Daten
        auftragsbestaetigungsnummer: neueAbNummer,
        auftragsbestaetigungsdatum: heute,
        auftragsbestaetigungsDaten: JSON.stringify(teilprojektAbDaten),

        // Lieferdetails übernehmen
        lieferKW: quellProjekt.lieferKW,
        lieferKWJahr: quellProjekt.lieferKWJahr,
        bevorzugterTag: quellProjekt.bevorzugterTag,
        belieferungsart: quellProjekt.belieferungsart,
        lieferzeitfenster: quellProjekt.lieferzeitfenster,
        lieferdatumTyp: quellProjekt.lieferdatumTyp,
        geplantesDatum: quellProjekt.geplantesDatum,
        dispoAnsprechpartner: quellProjekt.dispoAnsprechpartner,

        // Teilprojekt-Markierungen
        quellProjektId: quellProjektId,
        istTeilprojekt: true,
        teilprojektTyp: positionsFilter,
        teilprojektErstelltAm: jetzt,

        // Kein Dispo-Status für Universal/Hydrocourt (wird nicht über Dispo geliefert)
        dispoStatus: undefined,
      };

      // Projekt ohne Platzbauer-Zuordnung erstellen (da es ein Teilprojekt ist)
      const neuesProjekt = await this.createProjekt(neuesProjektDaten, {
        skipPlatzbauerProjektZuordnung: true,
      });
      console.log(`✅ Teilprojekt erstellt: ${neuesProjekt.id} (${neueAbNummer})`);

      // 5. Quellprojekt aktualisieren (verbleibende Positionen)
      const aktualisierteeAbDaten: AuftragsbestaetigungsDaten = {
        ...abDaten,
        positionen: verbleibend,
      };

      // Bestehendes teilprojektIds Array erweitern oder erstellen
      const teilprojektIds = quellProjekt.teilprojektIds
        ? [...quellProjekt.teilprojektIds, neuesProjekt.id]
        : [neuesProjekt.id];

      const aktualisiertesQuellProjekt = await this.updateProjekt(quellProjektId, {
        auftragsbestaetigungsDaten: JSON.stringify(aktualisierteeAbDaten),
        teilprojektIds: teilprojektIds,
        // Liefergewicht neu berechnen (nur eigene Produkte)
        liefergewicht: verbleibend.reduce((sum, p) => {
          const einheit = p.einheit?.toLowerCase() || '';
          if (einheit === 't' || einheit === 'to' || einheit === 'tonnen') {
            return sum + (p.menge || 0);
          }
          return sum;
        }, 0) || undefined,
      });
      console.log(`✅ Quellprojekt aktualisiert: ${verbleibend.length} Positionen verbleiben`);

      return {
        neuesProjekt,
        aktualisiertesQuellProjekt,
      };
    } catch (error) {
      console.error('❌ Fehler beim Projekt-Split:', error);
      throw error;
    }
  }

  /**
   * Prüft ob ein Projekt gemischte Artikelgruppen enthält und ob ein Split möglich ist.
   * @returns Informationen über die Artikelgruppen im Projekt
   */
  analysierePositionen(projekt: Projekt): {
    hatGemischteGruppen: boolean;
    eigeneProdukte: Position[];
    universalArtikel: Position[];
    hydrocourtArtikel: Position[];
    splitMoeglich: boolean;
    splitBlockiert?: string;
  } {
    const result = {
      hatGemischteGruppen: false,
      eigeneProdukte: [] as Position[],
      universalArtikel: [] as Position[],
      hydrocourtArtikel: [] as Position[],
      splitMoeglich: false,
      splitBlockiert: undefined as string | undefined,
    };

    // Prüfe ob bereits ein Teilprojekt (dann kein weiterer Split möglich)
    if (projekt.istTeilprojekt) {
      result.splitBlockiert = 'Teilprojekte können nicht weiter aufgeteilt werden.';
      return result;
    }

    // Prüfe ob Status zu weit fortgeschritten
    const statusOrdnung: Record<ProjektStatus, number> = {
      angebot: 0,
      angebot_versendet: 1,
      auftragsbestaetigung: 2,
      lieferschein: 3,
      rechnung: 4,
      bezahlt: 5,
      verloren: -1,
    };

    if (statusOrdnung[projekt.status] < 2) {
      result.splitBlockiert = 'Split ist erst nach Auftragsbestätigung möglich.';
      return result;
    }

    // Parse AB-Daten
    if (!projekt.auftragsbestaetigungsDaten) {
      result.splitBlockiert = 'Keine Auftragsbestätigungsdaten vorhanden.';
      return result;
    }

    let abDaten: AuftragsbestaetigungsDaten;
    try {
      abDaten = JSON.parse(projekt.auftragsbestaetigungsDaten);
    } catch {
      result.splitBlockiert = 'Auftragsbestätigungsdaten können nicht gelesen werden.';
      return result;
    }

    if (!abDaten.positionen || abDaten.positionen.length === 0) {
      result.splitBlockiert = 'Keine Positionen in der Auftragsbestätigung.';
      return result;
    }

    // Positionen kategorisieren
    for (const position of abDaten.positionen) {
      const istUniversal = position.istUniversalArtikel === true ||
                            position.beschreibung?.startsWith('Universal:');
      const istHydrocourt = position.artikelnummer === 'TM-HYC';

      if (istUniversal) {
        result.universalArtikel.push(position);
      } else if (istHydrocourt) {
        result.hydrocourtArtikel.push(position);
      } else {
        result.eigeneProdukte.push(position);
      }
    }

    // Prüfe ob gemischte Gruppen vorhanden
    const gruppenMitInhalt = [
      result.eigeneProdukte.length > 0,
      result.universalArtikel.length > 0,
      result.hydrocourtArtikel.length > 0,
    ].filter(Boolean).length;

    result.hatGemischteGruppen = gruppenMitInhalt >= 2;

    // Split nur möglich wenn mindestens 2 Gruppen UND nach dem Split noch was übrig bleibt
    result.splitMoeglich = result.hatGemischteGruppen &&
      (result.eigeneProdukte.length > 0 ||
       (result.universalArtikel.length > 0 && result.hydrocourtArtikel.length > 0));

    return result;
  }
}

export const projektService = new ProjektService();
