import { databases, DATABASE_ID, KREDITOREN_COLLECTION_ID, OFFENE_RECHNUNGEN_COLLECTION_ID } from '../config/appwrite';
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
  Unternehmen
} from '../types/kreditor';
import { ID } from 'appwrite';

export const kreditorService = {
  // ========== KREDITOREN VERWALTUNG ==========
  
  // Lade alle Kreditoren
  async loadAlleKreditoren(): Promise<Kreditor[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KREDITOREN_COLLECTION_ID
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
        KREDITOREN_COLLECTION_ID,
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
        KREDITOREN_COLLECTION_ID,
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
        KREDITOREN_COLLECTION_ID,
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
        KREDITOREN_COLLECTION_ID,
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
        OFFENE_RECHNUNGEN_COLLECTION_ID
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
        OFFENE_RECHNUNGEN_COLLECTION_ID,
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
        OFFENE_RECHNUNGEN_COLLECTION_ID,
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
        OFFENE_RECHNUNGEN_COLLECTION_ID,
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
        OFFENE_RECHNUNGEN_COLLECTION_ID,
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

      if (filter.anUnternehmen && filter.anUnternehmen.length > 0) {
        rechnungen = rechnungen.filter(r => filter.anUnternehmen!.includes(r.anUnternehmen));
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
      
      // Suche nach Rechnung mit gleicher Nummer (case-insensitive)
      const gefundeneRechnung = alleRechnungen.find(r => 
        r.rechnungsnummer?.toLowerCase().trim() === rechnungsnummer.toLowerCase().trim() &&
        r.id !== ausschlussId // Eigene ID bei Bearbeitung ausschließen
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
  async berechneStatistik(): Promise<KreditorenStatistik> {
    try {
      const rechnungen = await this.loadAlleRechnungen();
      const jetzt = new Date();

      // Initialisiere Statistik-Struktur
      const statusKeys: RechnungsStatus[] = ['offen', 'faellig', 'gemahnt', 'in_bearbeitung', 'verzug', 'inkasso', 'bezahlt', 'storniert'];
      const mahnstufen: Mahnstufe[] = [0, 1, 2, 3, 4];
      const kategorien: Rechnungskategorie[] = ['lieferanten', 'dienstleister', 'energie', 'miete', 'versicherung', 'steuern', 'sonstiges'];
      const unternehmen: Unternehmen[] = ['TennisMehl', 'Egner Bau'];

      const nachStatus: Record<RechnungsStatus, { anzahl: number; betrag: number }> = {} as any;
      const nachMahnstufe: Record<Mahnstufe, { anzahl: number; betrag: number }> = {} as any;
      const nachKategorie: Record<Rechnungskategorie, { anzahl: number; betrag: number }> = {} as any;
      const nachUnternehmen: Record<Unternehmen, { anzahl: number; betrag: number }> = {} as any;

      // Initialisiere alle Werte
      statusKeys.forEach(status => {
        nachStatus[status] = { anzahl: 0, betrag: 0 };
      });
      mahnstufen.forEach(stufe => {
        nachMahnstufe[stufe] = { anzahl: 0, betrag: 0 };
      });
      kategorien.forEach(kat => {
        nachKategorie[kat] = { anzahl: 0, betrag: 0 };
      });
      unternehmen.forEach(unter => {
        nachUnternehmen[unter] = { anzahl: 0, betrag: 0 };
      });

      let gesamtOffen = 0;
      let gesamtBetrag = 0;
      let faelligBetrag = 0;
      let verzugBetrag = 0;
      let gemahntBetrag = 0;
      const kritischeRechnungen: OffeneRechnung[] = [];
      const naechsteFaelligkeiten: OffeneRechnung[] = [];

      rechnungen.forEach(rechnung => {
        // Berechne den offenen Betrag (Summe minus bereits bezahlte Zahlungen)
        const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
        const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
        
        // Nur offene, fällige, gemahnte, im Verzug oder Inkasso befindliche Rechnungen zählen
        // UND nur wenn noch ein offener Betrag vorhanden ist
        if (['offen', 'faellig', 'gemahnt', 'in_bearbeitung', 'verzug', 'inkasso'].includes(rechnung.status) && offenerBetrag > 0) {
          gesamtOffen++;
          gesamtBetrag += offenerBetrag;

          // Status-Statistik
          nachStatus[rechnung.status].anzahl++;
          nachStatus[rechnung.status].betrag += offenerBetrag;

          // Mahnstufe-Statistik
          nachMahnstufe[rechnung.mahnstufe].anzahl++;
          nachMahnstufe[rechnung.mahnstufe].betrag += offenerBetrag;

          // Kategorie-Statistik
          nachKategorie[rechnung.kategorie].anzahl++;
          nachKategorie[rechnung.kategorie].betrag += offenerBetrag;

          // Unternehmen-Statistik
          nachUnternehmen[rechnung.anUnternehmen].anzahl++;
          nachUnternehmen[rechnung.anUnternehmen].betrag += offenerBetrag;

          // Fällige Rechnungen
          const faelligDatum = new Date(rechnung.faelligkeitsdatum);
          if (faelligDatum <= jetzt && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            faelligBetrag += offenerBetrag;
          }

          // Verzug
          const tageUeberfaellig = Math.floor((jetzt.getTime() - faelligDatum.getTime()) / (1000 * 60 * 60 * 24));
          if (tageUeberfaellig > 0 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            verzugBetrag += offenerBetrag;
          }

          // Gemahnt
          if (rechnung.mahnstufe > 0) {
            gemahntBetrag += offenerBetrag;
          }

          // Kritische Rechnungen (hohe Priorität oder im Verzug)
          if (rechnung.prioritaet === 'kritisch' || rechnung.status === 'verzug' || tageUeberfaellig > 30) {
            kritischeRechnungen.push(rechnung);
          }

          // Nächste Fälligkeiten (in den nächsten 7 Tagen)
          const tageBisFaellig = Math.floor((faelligDatum.getTime() - jetzt.getTime()) / (1000 * 60 * 60 * 24));
          if (tageBisFaellig >= 0 && tageBisFaellig <= 7 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert') {
            naechsteFaelligkeiten.push(rechnung);
          }
        }
      });

      // Sortiere kritische Rechnungen nach Priorität und Fälligkeit
      kritischeRechnungen.sort((a, b) => {
        const prioritaetOrder = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 };
        if (prioritaetOrder[a.prioritaet] !== prioritaetOrder[b.prioritaet]) {
          return prioritaetOrder[a.prioritaet] - prioritaetOrder[b.prioritaet];
        }
        return new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime();
      });

      // Sortiere nächste Fälligkeiten nach Datum
      naechsteFaelligkeiten.sort((a, b) => 
        new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime()
      );

      return {
        gesamtOffen,
        gesamtBetrag,
        faelligBetrag,
        verzugBetrag,
        gemahntBetrag,
        nachStatus,
        nachMahnstufe,
        nachKategorie,
        nachUnternehmen,
        kritischeRechnungen: kritischeRechnungen.slice(0, 10), // Top 10
        naechsteFaelligkeiten: naechsteFaelligkeiten.slice(0, 10), // Top 10
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
};
