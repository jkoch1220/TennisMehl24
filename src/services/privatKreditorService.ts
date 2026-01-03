import { databases, DATABASE_ID } from '../config/appwrite';
import { Query } from 'appwrite';
import {
  Kreditor,
  NeuerKreditor,
  OffeneRechnung,
  NeueOffeneRechnung,
  RechnungsFilter,
  SortierFeld,
  SortierRichtung,
  KreditorenStatistik,
  RechnungsStatus,
  Mahnstufe,
  Rechnungskategorie,
} from '../types/kreditor';
import { ID } from 'appwrite';

// Einfacher Typ für private Kreditoren (ohne Unternehmen-Auswahl)
export type PrivatUnternehmen = 'Privat';

export interface PrivatKreditorenStatistik extends Omit<KreditorenStatistik, 'nachUnternehmen'> {
  nachUnternehmen: Record<PrivatUnternehmen, { anzahl: number; betrag: number }>;
}

// Factory-Funktion für privaten Kreditor-Service
export const createPrivatKreditorService = (
  rechnungenCollectionId: string,
  kreditorenCollectionId: string
) => ({
  // ========== KREDITOREN VERWALTUNG ==========

  // Lade alle Kreditoren
  async loadAlleKreditoren(): Promise<Kreditor[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        kreditorenCollectionId,
        [
          Query.limit(5000)
        ]
      );

      return response.documents.map(doc => this.parseKreditorDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Kreditoren:', error);
      return [];
    }
  },

  // Lade einen einzelnen Kreditor
  async loadKreditor(id: string): Promise<Kreditor | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        kreditorenCollectionId,
        id
      );

      return this.parseKreditorDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Kreditors:', error);
      return null;
    }
  },

  // Erstelle neuen Kreditor
  async createKreditor(kreditor: NeuerKreditor): Promise<Kreditor> {
    const jetzt = new Date().toISOString();
    const neuerKreditor: Kreditor = {
      ...kreditor,
      id: ID.unique(),
      erstelltAm: kreditor.erstelltAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        kreditorenCollectionId,
        neuerKreditor.id,
        {
          data: JSON.stringify(neuerKreditor),
        }
      );

      return this.parseKreditorDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Kreditors:', error);
      throw error;
    }
  },

  // Aktualisiere Kreditor
  async updateKreditor(id: string, kreditor: Partial<Kreditor>): Promise<Kreditor> {
    try {
      const aktuell = await this.loadKreditor(id);
      if (!aktuell) {
        throw new Error(`Kreditor ${id} nicht gefunden`);
      }

      const aktualisiert: Kreditor = {
        ...aktuell,
        ...kreditor,
        id,
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        kreditorenCollectionId,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );

      return this.parseKreditorDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kreditors:', error);
      throw error;
    }
  },

  // Lösche Kreditor
  async deleteKreditor(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        kreditorenCollectionId,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Kreditors:', error);
      throw error;
    }
  },

  // ========== RECHNUNGEN VERWALTUNG ==========

  // Lade alle Rechnungen
  async loadAlleRechnungen(): Promise<OffeneRechnung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        rechnungenCollectionId,
        [
          Query.limit(5000)
        ]
      );

      return response.documents.map(doc => this.parseRechnungsDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Rechnungen:', error);
      return [];
    }
  },

  // Lade eine einzelne Rechnung
  async loadRechnung(id: string): Promise<OffeneRechnung | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        rechnungenCollectionId,
        id
      );

      return this.parseRechnungsDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden der Rechnung:', error);
      return null;
    }
  },

  // Erstelle neue Rechnung
  async createRechnung(rechnung: NeueOffeneRechnung): Promise<OffeneRechnung> {
    const jetzt = new Date().toISOString();
    const neueRechnung: OffeneRechnung = {
      ...rechnung,
      id: ID.unique(),
      erstelltAm: rechnung.erstelltAm || jetzt,
      geaendertAm: rechnung.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        rechnungenCollectionId,
        neueRechnung.id,
        {
          data: JSON.stringify(neueRechnung),
        }
      );

      return this.parseRechnungsDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Rechnung:', error);
      throw error;
    }
  },

  // Aktualisiere Rechnung
  async updateRechnung(id: string, rechnung: Partial<OffeneRechnung>): Promise<OffeneRechnung> {
    try {
      const aktuell = await this.loadRechnung(id);
      if (!aktuell) {
        throw new Error(`Rechnung ${id} nicht gefunden`);
      }

      const aktualisiert: OffeneRechnung = {
        ...aktuell,
        ...rechnung,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        rechnungenCollectionId,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );

      return this.parseRechnungsDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Rechnung:', error);
      throw error;
    }
  },

  // Lösche Rechnung
  async deleteRechnung(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        rechnungenCollectionId,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Rechnung:', error);
      throw error;
    }
  },

  // Filtere und sortiere Rechnungen
  async filterRechnungen(
    filter: RechnungsFilter = {},
    sortFeld: SortierFeld = 'faelligkeitsdatum',
    sortRichtung: SortierRichtung = 'asc'
  ): Promise<OffeneRechnung[]> {
    try {
      let rechnungen = await this.loadAlleRechnungen();

      // Filter anwenden
      if (filter.status && filter.status.length > 0) {
        rechnungen = rechnungen.filter(r => filter.status!.includes(r.status));
      }

      if (filter.mahnstufe && filter.mahnstufe.length > 0) {
        rechnungen = rechnungen.filter(r => filter.mahnstufe!.includes(r.mahnstufe));
      }

      if (filter.kategorie && filter.kategorie.length > 0) {
        rechnungen = rechnungen.filter(r => filter.kategorie!.includes(r.kategorie));
      }

      if (filter.kreditorId) {
        rechnungen = rechnungen.filter(r => r.kreditorId === filter.kreditorId);
      }

      if (filter.prioritaet && filter.prioritaet.length > 0) {
        rechnungen = rechnungen.filter(r => filter.prioritaet!.includes(r.prioritaet));
      }

      if (filter.faelligVon) {
        rechnungen = rechnungen.filter(r => r.faelligkeitsdatum >= filter.faelligVon!);
      }

      if (filter.faelligBis) {
        rechnungen = rechnungen.filter(r => r.faelligkeitsdatum <= filter.faelligBis!);
      }

      if (filter.betragMin !== undefined) {
        rechnungen = rechnungen.filter(r => r.summe >= filter.betragMin!);
      }

      if (filter.betragMax !== undefined) {
        rechnungen = rechnungen.filter(r => r.summe <= filter.betragMax!);
      }

      if (filter.suche) {
        const suche = filter.suche.toLowerCase();
        rechnungen = rechnungen.filter(r =>
          r.rechnungsnummer?.toLowerCase().includes(suche) ||
          r.betreff?.toLowerCase().includes(suche) ||
          r.kreditorName.toLowerCase().includes(suche) ||
          r.kommentar?.toLowerCase().includes(suche)
        );
      }

      // Sortierung anwenden
      rechnungen.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortFeld) {
          case 'faelligkeitsdatum':
            aVal = new Date(a.faelligkeitsdatum).getTime();
            bVal = new Date(b.faelligkeitsdatum).getTime();
            break;
          case 'summe':
            aVal = a.summe;
            bVal = b.summe;
            break;
          case 'status':
            aVal = a.status;
            bVal = b.status;
            break;
          case 'mahnstufe':
            aVal = a.mahnstufe;
            bVal = b.mahnstufe;
            break;
          case 'prioritaet':
            const prioritaetOrder = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 };
            aVal = prioritaetOrder[a.prioritaet];
            bVal = prioritaetOrder[b.prioritaet];
            break;
          case 'erstelltAm':
            aVal = new Date(a.erstelltAm).getTime();
            bVal = new Date(b.erstelltAm).getTime();
            break;
          case 'kreditorName':
            aVal = a.kreditorName.toLowerCase();
            bVal = b.kreditorName.toLowerCase();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortRichtung === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortRichtung === 'asc' ? 1 : -1;
        return 0;
      });

      return rechnungen;
    } catch (error) {
      console.error('Fehler beim Filtern der Rechnungen:', error);
      return [];
    }
  },

  // Prüfe ob Rechnungsnummer bereits existiert
  async pruefeRechnungsnummerDuplikat(
    rechnungsnummer: string,
    ausschlussId?: string
  ): Promise<{ existiert: boolean; rechnung?: OffeneRechnung }> {
    try {
      if (!rechnungsnummer || rechnungsnummer.trim() === '') {
        return { existiert: false };
      }

      const alleRechnungen = await this.loadAlleRechnungen();

      const gefundeneRechnung = alleRechnungen.find(r =>
        r.rechnungsnummer?.toLowerCase().trim() === rechnungsnummer.toLowerCase().trim() &&
        r.id !== ausschlussId
      );

      if (gefundeneRechnung) {
        return {
          existiert: true,
          rechnung: gefundeneRechnung,
        };
      }

      return { existiert: false };
    } catch (error) {
      console.error('Fehler bei Duplikat-Prüfung:', error);
      return { existiert: false };
    }
  },

  // Berechne Statistik
  async berechneStatistik(): Promise<PrivatKreditorenStatistik> {
    try {
      const rechnungen = await this.loadAlleRechnungen();
      const jetzt = new Date();
      jetzt.setHours(0, 0, 0, 0);

      const statusKeys: RechnungsStatus[] = ['offen', 'faellig', 'gemahnt', 'in_bearbeitung', 'in_ratenzahlung', 'verzug', 'inkasso', 'bezahlt', 'storniert'];
      const mahnstufen: Mahnstufe[] = [0, 1, 2, 3, 4];
      const kategorien: Rechnungskategorie[] = ['lieferanten', 'dienstleister', 'energie', 'miete', 'versicherung', 'steuern', 'darlehen', 'sonstiges'];

      const nachStatus: Record<RechnungsStatus, { anzahl: number; betrag: number }> = {} as any;
      const nachMahnstufe: Record<Mahnstufe, { anzahl: number; betrag: number }> = {} as any;
      const nachKategorie: Record<Rechnungskategorie, { anzahl: number; betrag: number }> = {} as any;
      const nachUnternehmen: Record<PrivatUnternehmen, { anzahl: number; betrag: number }> = {
        'Privat': { anzahl: 0, betrag: 0 }
      };

      statusKeys.forEach(status => {
        nachStatus[status] = { anzahl: 0, betrag: 0 };
      });
      mahnstufen.forEach(stufe => {
        nachMahnstufe[stufe] = { anzahl: 0, betrag: 0 };
      });
      kategorien.forEach(kat => {
        nachKategorie[kat] = { anzahl: 0, betrag: 0 };
      });

      let gesamtOffen = 0;
      let gesamtBetrag = 0;
      let faelligBetrag = 0;
      let heuteBetrag = 0;
      let verzugBetrag = 0;
      const kritischeRechnungen: OffeneRechnung[] = [];
      const naechsteFaelligkeiten: OffeneRechnung[] = [];

      rechnungen.forEach(rechnung => {
        const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
        const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);

        const faelligerBetrag = (rechnung.status === 'in_ratenzahlung' && rechnung.monatlicheRate)
          ? rechnung.monatlicheRate
          : offenerBetrag;

        if (['offen', 'faellig', 'gemahnt', 'in_bearbeitung', 'in_ratenzahlung', 'verzug', 'inkasso'].includes(rechnung.status) && offenerBetrag > 0) {
          gesamtOffen++;
          gesamtBetrag += offenerBetrag;

          nachStatus[rechnung.status].anzahl++;
          nachStatus[rechnung.status].betrag += offenerBetrag;

          nachMahnstufe[rechnung.mahnstufe].anzahl++;
          nachMahnstufe[rechnung.mahnstufe].betrag += offenerBetrag;

          nachKategorie[rechnung.kategorie].anzahl++;
          nachKategorie[rechnung.kategorie].betrag += offenerBetrag;

          // Alle Rechnungen als "Privat" zählen
          nachUnternehmen['Privat'].anzahl++;
          nachUnternehmen['Privat'].betrag += offenerBetrag;

          const faelligDatum = (rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm)
            ? new Date(rechnung.rateFaelligAm)
            : new Date(rechnung.faelligkeitsdatum);
          faelligDatum.setHours(0, 0, 0, 0);

          const tageBisFaellig = Math.floor((faelligDatum.getTime() - jetzt.getTime()) / (1000 * 60 * 60 * 24));

          if (tageBisFaellig >= 0 && tageBisFaellig <= 7 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            faelligBetrag += faelligerBetrag;
          }

          if (tageBisFaellig === 0 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            heuteBetrag += faelligerBetrag;
          }

          if (tageBisFaellig < 0 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            verzugBetrag += faelligerBetrag;
          }

          if (rechnung.prioritaet === 'kritisch' || rechnung.status === 'verzug' || tageBisFaellig < -30) {
            kritischeRechnungen.push(rechnung);
          }

          if (tageBisFaellig >= 0 && tageBisFaellig <= 7 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            naechsteFaelligkeiten.push(rechnung);
          }
        }
      });

      kritischeRechnungen.sort((a, b) => {
        const prioritaetOrder = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 };
        if (prioritaetOrder[a.prioritaet] !== prioritaetOrder[b.prioritaet]) {
          return prioritaetOrder[a.prioritaet] - prioritaetOrder[b.prioritaet];
        }
        return new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime();
      });

      naechsteFaelligkeiten.sort((a, b) =>
        new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime()
      );

      return {
        gesamtOffen,
        gesamtBetrag,
        faelligBetrag,
        heuteBetrag,
        verzugBetrag,
        nachStatus,
        nachMahnstufe,
        nachKategorie,
        nachUnternehmen,
        kritischeRechnungen: kritischeRechnungen.slice(0, 10),
        naechsteFaelligkeiten: naechsteFaelligkeiten.slice(0, 10),
      };
    } catch (error) {
      console.error('Fehler beim Berechnen der Statistik:', error);
      throw error;
    }
  },

  // ========== HELPER FUNCTIONS ==========

  parseKreditorDocument(doc: any): Kreditor {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    return doc as Kreditor;
  },

  parseRechnungsDocument(doc: any): OffeneRechnung {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    return doc as OffeneRechnung;
  },
});
