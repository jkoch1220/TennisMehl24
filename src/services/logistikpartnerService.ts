import { databases, DATABASE_ID, LOGISTIKPARTNER_COLLECTION_ID } from '../config/appwrite';
import { Logistikpartner, NeuerLogistikpartner, LogistikpartnerFilter } from '../types/logistikpartner';
import { ID, Query } from 'appwrite';

export const logistikpartnerService = {
  // Lade alle Logistikpartner
  async loadAlleLogistikpartner(): Promise<Logistikpartner[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        LOGISTIKPARTNER_COLLECTION_ID,
        [
          Query.orderDesc('$updatedAt'),
          Query.limit(5000)
        ]
      );

      const partner = response.documents.map(doc => this.parseDocument(doc));

      // Sortiere nach geaendertAm
      return partner.sort((a, b) => {
        const dateA = new Date(a.geaendertAm || a.erstelltAm || 0).getTime();
        const dateB = new Date(b.geaendertAm || b.erstelltAm || 0).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Logistikpartner:', error);
      return [];
    }
  },

  // Lade einen einzelnen Logistikpartner
  async loadLogistikpartner(id: string): Promise<Logistikpartner | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        LOGISTIKPARTNER_COLLECTION_ID,
        id
      );

      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Logistikpartners:', error);
      return null;
    }
  },

  // Erstelle neuen Logistikpartner
  async createLogistikpartner(partner: NeuerLogistikpartner): Promise<Logistikpartner> {
    const jetzt = new Date().toISOString();

    const neuerPartner: Logistikpartner = {
      ...partner,
      id: ID.unique(),
      ansprechpartner: partner.ansprechpartner || [],
      fahrzeuge: partner.fahrzeuge || [],
      liefergebiete: partner.liefergebiete || [],
      preisstrukturen: partner.preisstrukturen || [],
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        LOGISTIKPARTNER_COLLECTION_ID,
        neuerPartner.id,
        {
          data: JSON.stringify(neuerPartner),
        }
      );

      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Logistikpartners:', error);
      throw error;
    }
  },

  // Aktualisiere Logistikpartner
  async updateLogistikpartner(id: string, partner: Partial<NeuerLogistikpartner>): Promise<Logistikpartner> {
    try {
      const aktuell = await this.loadLogistikpartner(id);
      if (!aktuell) {
        throw new Error(`Logistikpartner ${id} nicht gefunden`);
      }

      const aktualisiert: Logistikpartner = {
        ...aktuell,
        ...partner,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        LOGISTIKPARTNER_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );

      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Logistikpartners:', error);
      throw error;
    }
  },

  // Lösche Logistikpartner
  async deleteLogistikpartner(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        LOGISTIKPARTNER_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Logistikpartners:', error);
      throw error;
    }
  },

  // Filtere Logistikpartner
  filterLogistikpartner(partner: Logistikpartner[], filter: LogistikpartnerFilter): Logistikpartner[] {
    return partner.filter(p => {
      // Status-Filter
      if (filter.status && filter.status.length > 0) {
        if (!filter.status.includes(p.status)) return false;
      }

      // PLZ-Bereich Filter (prüft Liefergebiete)
      if (filter.plzBereich) {
        const hatGebiet = p.liefergebiete.some(gebiet =>
          gebiet.plzBereiche.some(plz => plz.startsWith(filter.plzBereich!.substring(0, 2)))
        );
        if (!hatGebiet) return false;
      }

      // Schüttmaschine Filter
      if (filter.hatSchuettmaschine !== undefined) {
        const hatSchuettmaschine = p.fahrzeuge.some(f => f.hatSchuettmaschine);
        if (filter.hatSchuettmaschine !== hatSchuettmaschine) return false;
      }

      // Textsuche
      if (filter.suche) {
        const suchText = filter.suche.toLowerCase();
        const durchsuchbar = [
          p.firmenname,
          p.kurzname,
          p.ort,
          p.notizen,
          ...p.ansprechpartner.map(a => a.name),
        ].filter(Boolean).join(' ').toLowerCase();

        if (!durchsuchbar.includes(suchText)) return false;
      }

      return true;
    });
  },

  // Lade aktive Partner
  async loadAktiveLogistikpartner(): Promise<Logistikpartner[]> {
    const alle = await this.loadAlleLogistikpartner();
    return alle.filter(p => p.status === 'aktiv');
  },

  // Finde Partner für PLZ
  async findePartnerFuerPLZ(plz: string): Promise<Logistikpartner[]> {
    const aktive = await this.loadAktiveLogistikpartner();
    const plzPrefix = plz.substring(0, 2);

    return aktive.filter(partner =>
      partner.liefergebiete.some(gebiet =>
        gebiet.plzBereiche.some(bereich => bereich.startsWith(plzPrefix) || plzPrefix.startsWith(bereich))
      )
    );
  },

  // Finde Partner mit Schüttmaschine
  async findePartnerMitSchuettmaschine(): Promise<Logistikpartner[]> {
    const aktive = await this.loadAktiveLogistikpartner();
    return aktive.filter(partner =>
      partner.fahrzeuge.some(fahrzeug => fahrzeug.hatSchuettmaschine)
    );
  },

  // ========== HELPER FUNCTIONS ==========

  // Parse Dokument aus Appwrite
  parseDocument(doc: any): Logistikpartner {
    try {
      const data = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
      return {
        ...data,
        id: doc.$id,
        // Ensure arrays exist
        ansprechpartner: data.ansprechpartner || [],
        fahrzeuge: data.fahrzeuge || [],
        liefergebiete: data.liefergebiete || [],
        preisstrukturen: data.preisstrukturen || [],
      };
    } catch (error) {
      console.error('Fehler beim Parsen des Logistikpartner-Dokuments:', error);
      throw error;
    }
  },

  // Erstelle leeren Partner für Formulare
  createEmptyPartner(): NeuerLogistikpartner {
    return {
      firmenname: '',
      status: 'aktiv',
      ansprechpartner: [],
      fahrzeuge: [],
      liefergebiete: [],
      preisstrukturen: [],
    };
  },
};
