/**
 * Service für Instandsetzungsaufträge
 *
 * Verwaltet Sammelaufträge an Platzbauer für "Direkt Platzbauer"-Kunden.
 * Diese Kunden bestellen direkt bei TennisMehl, aber die Instandsetzung
 * wird von einem Platzbauer durchgeführt.
 */

import { ID, Query, Models } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
  STAMMDATEN_COLLECTION_ID,
  STAMMDATEN_DOCUMENT_ID,
} from '../config/appwrite';
import {
  Instandsetzungsauftrag,
  InstandsetzungsauftragStatus,
  InstandsetzungsPosition,
  NeuerInstandsetzungsauftrag,
} from '../types/instandsetzungsauftrag';
import { SaisonKundeMitDaten } from '../types/saisonplanung';
import { Projekt, ProjektStatus } from '../types/projekt';
import { saisonplanungService } from './saisonplanungService';
import { projektService } from './projektService';
import { getAktuelleSaison } from './nummerierungService';

// Erweiterte Daten für Instandsetzungsvereine inkl. Projekt
export interface InstandsetzungsVereinMitProjekt extends SaisonKundeMitDaten {
  projekt?: Projekt;
  hatBestaetigenAuftrag: boolean; // Status >= 'auftragsbestaetigung'
  // aktuelleSaison enthält anzahlPlaetze
}

// Gültige Projektstatus für Instandsetzungsaufträge
const GUELTIGE_PROJEKT_STATUS: ProjektStatus[] = [
  'auftragsbestaetigung',
  'lieferschein',
  'rechnung',
  'bezahlt',
];

// Helper: Parse Document
function parseDocument(doc: Models.Document): Instandsetzungsauftrag {
  const anyDoc = doc as unknown as Record<string, unknown>;

  // Parse positionen von JSON-String
  let positionen: InstandsetzungsPosition[] = [];
  if (anyDoc.positionen) {
    try {
      positionen = typeof anyDoc.positionen === 'string'
        ? JSON.parse(anyDoc.positionen)
        : anyDoc.positionen as InstandsetzungsPosition[];
    } catch (error) {
      console.warn('⚠️ Konnte positionen nicht parsen:', error);
    }
  }

  // Parse data-Feld für zusätzliche Daten
  let extraData: Record<string, unknown> = {};
  if (anyDoc.data && typeof anyDoc.data === 'string') {
    try {
      extraData = JSON.parse(anyDoc.data);
    } catch (error) {
      console.warn('⚠️ Konnte data-Feld nicht parsen:', error);
    }
  }

  return {
    id: doc.$id,
    $id: doc.$id,
    platzbauerId: anyDoc.platzbauerId as string,
    platzbauerName: (anyDoc.platzbauerName as string) || (extraData.platzbauerName as string),
    saisonjahr: anyDoc.saisonjahr as number,
    auftragsnummer: anyDoc.auftragsnummer as string,
    status: anyDoc.status as InstandsetzungsauftragStatus,
    positionen,
    erstelltAm: anyDoc.erstelltAm as string || doc.$createdAt,
    gesendetAm: anyDoc.gesendetAm as string | undefined,
    bestaetigtAm: anyDoc.bestaetigtAm as string | undefined,
    erledigtAm: anyDoc.erledigtAm as string | undefined,
  };
}

class InstandsetzungsauftragService {
  /**
   * Generiert die nächste Auftragsnummer im Format IA-JAHR-XXX
   */
  async generiereNaechsteAuftragsnummer(saisonjahr?: number): Promise<string> {
    const jahr = saisonjahr || await getAktuelleSaison();

    try {
      // Lade Stammdaten für Zähler
      const stammdaten = await databases.getDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID
      );

      let zaehler = (stammdaten.instandsetzungsauftragZaehler || 0) + 1;

      // Prüfe ob Jahr gewechselt hat (Zähler Reset)
      // Hinweis: In einer erweiterten Version könnte man auch das Jahr im Zähler speichern

      // Aktualisiere Zähler in Stammdaten
      await databases.updateDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID,
        {
          instandsetzungsauftragZaehler: zaehler,
        }
      );

      // Format: IA-2026-001
      const laufnummer = zaehler.toString().padStart(3, '0');
      return `IA-${jahr}-${laufnummer}`;
    } catch (error) {
      console.error('Fehler beim Generieren der Auftragsnummer:', error);
      // Fallback mit Timestamp
      const timestamp = Date.now() % 1000;
      return `IA-${jahr}-${timestamp.toString().padStart(3, '0')}`;
    }
  }

  /**
   * Lädt alle Aufträge für einen Platzbauer in einem Jahr
   */
  async loadAuftraegeFuerPlatzbauer(
    platzbauerId: string,
    saisonjahr: number
  ): Promise<Instandsetzungsauftrag[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
        [
          Query.equal('platzbauerId', platzbauerId),
          Query.equal('saisonjahr', saisonjahr),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ]
      );

      return response.documents.map(parseDocument);
    } catch (error: any) {
      // Collection existiert noch nicht
      if (error.code === 404) {
        console.warn('Collection instandsetzungsauftraege existiert noch nicht');
        return [];
      }
      throw error;
    }
  }

  /**
   * Lädt einen einzelnen Auftrag
   */
  async loadAuftrag(auftragId: string): Promise<Instandsetzungsauftrag | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
        auftragId
      );
      return parseDocument(doc);
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Erstellt einen neuen Instandsetzungsauftrag
   */
  async createAuftrag(
    auftrag: NeuerInstandsetzungsauftrag
  ): Promise<Instandsetzungsauftrag> {
    const dokumentId = ID.unique();
    const jetzt = new Date().toISOString();

    // Generiere Auftragsnummer falls nicht vorhanden
    const auftragsnummer = auftrag.auftragsnummer ||
      await this.generiereNaechsteAuftragsnummer(auftrag.saisonjahr);

    const payload = {
      platzbauerId: auftrag.platzbauerId,
      saisonjahr: auftrag.saisonjahr,
      auftragsnummer,
      status: auftrag.status || 'erstellt',
      positionen: JSON.stringify(auftrag.positionen),
      erstelltAm: jetzt,
      gesendetAm: auftrag.gesendetAm || null,
      bestaetigtAm: auftrag.bestaetigtAm || null,
      erledigtAm: auftrag.erledigtAm || null,
      data: JSON.stringify({
        platzbauerName: auftrag.platzbauerName,
      }),
    };

    const doc = await databases.createDocument(
      DATABASE_ID,
      INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
      dokumentId,
      payload
    );

    return parseDocument(doc);
  }

  /**
   * Aktualisiert einen Auftrag
   */
  async updateAuftrag(
    auftragId: string,
    updates: Partial<Instandsetzungsauftrag>
  ): Promise<Instandsetzungsauftrag> {
    const payload: Record<string, unknown> = {};

    if (updates.status) payload.status = updates.status;
    if (updates.positionen) payload.positionen = JSON.stringify(updates.positionen);
    if (updates.gesendetAm !== undefined) payload.gesendetAm = updates.gesendetAm;
    if (updates.bestaetigtAm !== undefined) payload.bestaetigtAm = updates.bestaetigtAm;
    if (updates.erledigtAm !== undefined) payload.erledigtAm = updates.erledigtAm;

    // Update data-Feld für zusätzliche Felder
    if (updates.platzbauerName) {
      const bestehendesDoc = await this.loadAuftrag(auftragId);
      payload.data = JSON.stringify({
        platzbauerName: updates.platzbauerName || bestehendesDoc?.platzbauerName,
      });
    }

    const doc = await databases.updateDocument(
      DATABASE_ID,
      INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
      auftragId,
      payload
    );

    return parseDocument(doc);
  }

  /**
   * Ändert den Status eines Auftrags
   */
  async updateStatus(
    auftragId: string,
    status: InstandsetzungsauftragStatus
  ): Promise<Instandsetzungsauftrag> {
    const jetzt = new Date().toISOString();
    const updates: Partial<Instandsetzungsauftrag> = { status };

    // Setze Timestamp je nach Status
    switch (status) {
      case 'gesendet':
        updates.gesendetAm = jetzt;
        break;
      case 'bestaetigt':
        updates.bestaetigtAm = jetzt;
        break;
      case 'erledigt':
        updates.erledigtAm = jetzt;
        break;
    }

    return this.updateAuftrag(auftragId, updates);
  }

  /**
   * Löscht einen Auftrag
   */
  async deleteAuftrag(auftragId: string): Promise<void> {
    await databases.deleteDocument(
      DATABASE_ID,
      INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
      auftragId
    );
  }

  /**
   * Lädt alle Vereine mit Bezugsweg 'direkt_instandsetzung' für einen Platzbauer
   */
  async loadDirektInstandsetzungVereine(
    platzbauerId: string
  ): Promise<SaisonKundeMitDaten[]> {
    const alleKunden = await saisonplanungService.loadAlleKunden();

    const vereine = alleKunden.filter(
      k =>
        k.typ === 'verein' &&
        k.aktiv &&
        k.standardBezugsweg === 'direkt_instandsetzung' &&
        k.standardPlatzbauerId === platzbauerId
    );

    return vereine.map(v => ({ kunde: v } as SaisonKundeMitDaten));
  }

  /**
   * Lädt alle Vereine mit Bezugsweg 'direkt_instandsetzung' für einen Platzbauer
   * INKL. Projekt-Daten, Ansprechpartner und Filter für gültige Auftrags-Status
   *
   * Nur Vereine mit Projekt-Status >= 'auftragsbestaetigung' können in
   * einen Instandsetzungsauftrag aufgenommen werden.
   */
  async loadDirektInstandsetzungVereineMitProjekt(
    platzbauerId: string,
    saisonjahr: number,
    nurMitBestaetigung: boolean = false
  ): Promise<InstandsetzungsVereinMitProjekt[]> {
    // Lade ALLE Kunden mit VOLLSTÄNDIGEN Daten (inkl. Ansprechpartner)
    const { callListe } = await saisonplanungService.loadSaisonplanungDashboard({}, saisonjahr);

    const vereine = callListe.filter(
      k =>
        k.kunde.typ === 'verein' &&
        k.kunde.aktiv &&
        k.kunde.standardBezugsweg === 'direkt_instandsetzung' &&
        k.kunde.standardPlatzbauerId === platzbauerId
    );

    // Lade Projekte für alle Vereine
    const ergebnis: InstandsetzungsVereinMitProjekt[] = [];

    for (const vereinMitDaten of vereine) {
      const projekt = await projektService.getProjektFuerKunde(vereinMitDaten.kunde.id, saisonjahr);
      const hatBestaetigenAuftrag = projekt !== null &&
        GUELTIGE_PROJEKT_STATUS.includes(projekt.status);

      // Filter anwenden falls gewünscht
      if (nurMitBestaetigung && !hatBestaetigenAuftrag) {
        continue;
      }

      ergebnis.push({
        kunde: vereinMitDaten.kunde,
        ansprechpartner: vereinMitDaten.ansprechpartner || [],
        aktuelleSaison: vereinMitDaten.aktuelleSaison,
        saisonHistorie: vereinMitDaten.saisonHistorie || [],
        aktivitaeten: vereinMitDaten.aktivitaeten || [],
        projekt: projekt || undefined,
        hatBestaetigenAuftrag,
      });
    }

    return ergebnis;
  }

  /**
   * Lädt die konfigurierten Instandsetzungsdienste aus den Stammdaten
   */
  async loadInstandsetzungsDienste(): Promise<string[]> {
    try {
      const stammdaten = await databases.getDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID
      );

      if (stammdaten.instandsetzungsDienste) {
        // Falls als JSON-String gespeichert
        if (typeof stammdaten.instandsetzungsDienste === 'string') {
          return JSON.parse(stammdaten.instandsetzungsDienste);
        }
        return stammdaten.instandsetzungsDienste as string[];
      }

      // Default-Dienst
      return ['Frühjahrs-Instandsetzung'];
    } catch (error) {
      console.error('Fehler beim Laden der Instandsetzungsdienste:', error);
      return ['Frühjahrs-Instandsetzung'];
    }
  }

  /**
   * Speichert die Instandsetzungsdienste in den Stammdaten
   */
  async speichereInstandsetzungsDienste(dienste: string[]): Promise<void> {
    await databases.updateDocument(
      DATABASE_ID,
      STAMMDATEN_COLLECTION_ID,
      STAMMDATEN_DOCUMENT_ID,
      {
        instandsetzungsDienste: JSON.stringify(dienste),
      }
    );
  }
}

export const instandsetzungsauftragService = new InstandsetzungsauftragService();
