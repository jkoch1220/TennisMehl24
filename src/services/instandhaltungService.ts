import { ID, Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
  INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
} from '../config/appwrite';
import {
  InstandhaltungChecklistItem,
  NeuerChecklistItem,
  Begehung,
  InstandhaltungFrequenz,
  BegehungChecklistItem,
  OverdueInfo,
  FREQUENZ_CONFIG,
} from '../types/instandhaltung';

export const instandhaltungService = {
  // ==================== CHECKLIST ITEMS ====================

  async ladeAlleChecklistItems(): Promise<InstandhaltungChecklistItem[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
        [Query.limit(1000)]
      );
      return response.documents.map((doc) => this.parseChecklistDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Checklist-Items:', error);
      return [];
    }
  },

  async ladeChecklistItemsNachFrequenz(
    frequenz: InstandhaltungFrequenz
  ): Promise<InstandhaltungChecklistItem[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
        [Query.equal('frequenz', frequenz), Query.limit(1000)]
      );
      return response.documents
        .map((doc) => this.parseChecklistDocument(doc))
        .filter((item) => item.istAktiv)
        .sort((a, b) => a.sortierung - b.sortierung);
    } catch (error) {
      console.error('Fehler beim Laden der Checklist-Items:', error);
      return [];
    }
  },

  async erstelleChecklistItem(
    item: NeuerChecklistItem
  ): Promise<InstandhaltungChecklistItem> {
    const id = ID.unique();
    const neuesItem: InstandhaltungChecklistItem = {
      ...item,
      id,
      erstelltAm: new Date().toISOString(),
    };

    await databases.createDocument(
      DATABASE_ID,
      INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
      id,
      {
        frequenz: neuesItem.frequenz,
        data: JSON.stringify(neuesItem),
      }
    );

    return neuesItem;
  },

  async aktualisiereChecklistItem(
    id: string,
    daten: Partial<InstandhaltungChecklistItem>
  ): Promise<InstandhaltungChecklistItem> {
    const aktuell = await this.ladeChecklistItem(id);
    if (!aktuell) {
      throw new Error(`Checklist-Item ${id} nicht gefunden`);
    }

    const aktualisiert: InstandhaltungChecklistItem = {
      ...aktuell,
      ...daten,
      id,
    };

    await databases.updateDocument(
      DATABASE_ID,
      INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
      id,
      {
        frequenz: aktualisiert.frequenz,
        data: JSON.stringify(aktualisiert),
      }
    );

    return aktualisiert;
  },

  async ladeChecklistItem(id: string): Promise<InstandhaltungChecklistItem | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
        id
      );
      return this.parseChecklistDocument(doc);
    } catch {
      return null;
    }
  },

  async loescheChecklistItem(id: string): Promise<void> {
    // Soft delete durch Setzen von istAktiv = false
    await this.aktualisiereChecklistItem(id, { istAktiv: false });
  },

  async sortierungAktualisieren(
    items: { id: string; sortierung: number }[]
  ): Promise<void> {
    for (const item of items) {
      await this.aktualisiereChecklistItem(item.id, {
        sortierung: item.sortierung,
      });
    }
  },

  // ==================== BEGEHUNGEN (INSPECTIONS) ====================

  async ladeAlleBegehungen(): Promise<Begehung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
        [Query.limit(1000), Query.orderDesc('$createdAt')]
      );
      return response.documents.map((doc) => this.parseBegehungDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Begehungen:', error);
      return [];
    }
  },

  async ladeBegehungenNachFrequenz(
    frequenz: InstandhaltungFrequenz
  ): Promise<Begehung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
        [
          Query.equal('frequenz', frequenz),
          Query.limit(100),
          Query.orderDesc('$createdAt'),
        ]
      );
      return response.documents.map((doc) => this.parseBegehungDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Begehungen:', error);
      return [];
    }
  },

  async ladeLetzteAbgeschlosseneBegehung(
    frequenz: InstandhaltungFrequenz
  ): Promise<Begehung | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
        [
          Query.equal('frequenz', frequenz),
          Query.equal('status', 'abgeschlossen'),
          Query.limit(1),
          Query.orderDesc('$createdAt'),
        ]
      );
      if (response.documents.length === 0) return null;
      return this.parseBegehungDocument(response.documents[0]);
    } catch (error) {
      console.error('Fehler beim Laden der letzten Begehung:', error);
      return null;
    }
  },

  async ladeAktiveBegehung(
    frequenz: InstandhaltungFrequenz
  ): Promise<Begehung | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
        [
          Query.equal('frequenz', frequenz),
          Query.equal('status', 'in_bearbeitung'),
          Query.limit(1),
        ]
      );
      if (response.documents.length === 0) return null;
      return this.parseBegehungDocument(response.documents[0]);
    } catch (error) {
      console.error('Fehler beim Laden der aktiven Begehung:', error);
      return null;
    }
  },

  async starteBegehung(
    frequenz: InstandhaltungFrequenz,
    bearbeiterName: string
  ): Promise<Begehung> {
    // 1. Lade alle aktiven Checklist-Items für diese Frequenz
    const checklistItems = await this.ladeChecklistItemsNachFrequenz(frequenz);

    // 2. Erstelle BegehungChecklistItem[] Snapshot
    const begehungItems: BegehungChecklistItem[] = checklistItems.map((item) => ({
      checklistItemId: item.id,
      titel: item.titel,
      beschreibung: item.beschreibung,
      erledigt: false,
    }));

    // 3. Erstelle Begehung
    const id = ID.unique();
    const neueBegehung: Begehung = {
      id,
      frequenz,
      startDatum: new Date().toISOString(),
      status: 'in_bearbeitung',
      bearbeiterName,
      checklistItems: begehungItems,
      erstelltAm: new Date().toISOString(),
    };

    await databases.createDocument(
      DATABASE_ID,
      INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
      id,
      {
        frequenz: neueBegehung.frequenz,
        status: neueBegehung.status,
        data: JSON.stringify(neueBegehung),
      }
    );

    return neueBegehung;
  },

  async aktualisiereBegehung(
    id: string,
    daten: Partial<Begehung>
  ): Promise<Begehung> {
    const aktuell = await this.ladeBegehung(id);
    if (!aktuell) {
      throw new Error(`Begehung ${id} nicht gefunden`);
    }

    const aktualisiert: Begehung = {
      ...aktuell,
      ...daten,
      id,
    };

    await databases.updateDocument(
      DATABASE_ID,
      INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
      id,
      {
        frequenz: aktualisiert.frequenz,
        status: aktualisiert.status,
        data: JSON.stringify(aktualisiert),
      }
    );

    return aktualisiert;
  },

  async ladeBegehung(id: string): Promise<Begehung | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
        id
      );
      return this.parseBegehungDocument(doc);
    } catch {
      return null;
    }
  },

  async checklistItemAbhaken(
    begehungId: string,
    checklistItemId: string,
    erledigt: boolean,
    bemerkung?: string
  ): Promise<Begehung> {
    const begehung = await this.ladeBegehung(begehungId);
    if (!begehung) {
      throw new Error(`Begehung ${begehungId} nicht gefunden`);
    }

    const updatedItems = begehung.checklistItems.map((item) => {
      if (item.checklistItemId === checklistItemId) {
        return {
          ...item,
          erledigt,
          erledigtAm: erledigt ? new Date().toISOString() : undefined,
          bemerkung: bemerkung !== undefined ? bemerkung : item.bemerkung,
        };
      }
      return item;
    });

    return this.aktualisiereBegehung(begehungId, { checklistItems: updatedItems });
  },

  async begehungAbschliessen(id: string, notizen?: string): Promise<Begehung> {
    return this.aktualisiereBegehung(id, {
      status: 'abgeschlossen',
      abschlussDatum: new Date().toISOString(),
      notizen,
    });
  },

  async begehungAbbrechen(id: string): Promise<Begehung> {
    return this.aktualisiereBegehung(id, {
      status: 'abgebrochen',
    });
  },

  // ==================== OVERDUE CHECKS ====================

  async pruefeUeberfaellig(): Promise<OverdueInfo[]> {
    const frequenzen: InstandhaltungFrequenz[] = [
      'taeglich',
      'woechentlich',
      'monatlich',
    ];
    const results: OverdueInfo[] = [];

    for (const frequenz of frequenzen) {
      const letzteBegehung = await this.ladeLetzteAbgeschlosseneBegehung(frequenz);
      results.push(this.berechneUeberfaelligStatus(letzteBegehung, frequenz));
    }

    return results;
  },

  berechneUeberfaelligStatus(
    letzteBegehung: Begehung | null,
    frequenz: InstandhaltungFrequenz
  ): OverdueInfo {
    const config = FREQUENZ_CONFIG[frequenz];
    const jetzt = new Date();

    if (!letzteBegehung || !letzteBegehung.abschlussDatum) {
      return {
        frequenz,
        letzteBegehung: null,
        istUeberfaellig: true,
        tageUeberfaellig: config.warningDays,
      };
    }

    const letztesDatum = new Date(letzteBegehung.abschlussDatum);
    const diffMs = jetzt.getTime() - letztesDatum.getTime();
    const diffTage = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return {
      frequenz,
      letzteBegehung,
      istUeberfaellig: diffTage >= config.warningDays,
      tageUeberfaellig: Math.max(0, diffTage - config.warningDays),
    };
  },

  // ==================== HELPERS ====================

  parseChecklistDocument(doc: Record<string, unknown>): InstandhaltungChecklistItem {
    if (doc.data && typeof doc.data === 'string') {
      try {
        return JSON.parse(doc.data);
      } catch {
        console.error('Fehler beim Parsen des Checklist-Dokuments:', doc);
      }
    }
    return doc as unknown as InstandhaltungChecklistItem;
  },

  parseBegehungDocument(doc: Record<string, unknown>): Begehung {
    if (doc.data && typeof doc.data === 'string') {
      try {
        return JSON.parse(doc.data);
      } catch {
        console.error('Fehler beim Parsen des Begehung-Dokuments:', doc);
      }
    }
    return doc as unknown as Begehung;
  },
};
