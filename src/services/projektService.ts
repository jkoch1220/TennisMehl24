import { databases, DATABASE_ID, COLLECTIONS } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Projekt, NeuesProjekt, ProjektFilter, ProjektStatus } from '../types/projekt';
import { saisonplanungService } from './saisonplanungService';
import { kundenListeService } from './kundenListeService';
import { platzbauerverwaltungService } from './platzbauerverwaltungService';

class ProjektService {
  private readonly collectionId = COLLECTIONS.PROJEKTE;

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
      queries.push(Query.limit(1000));

      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);
      return response.documents.map(doc => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
      throw error;
    }
  }

  // Projekte gruppiert nach Status laden
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
      const queries: string[] = [Query.orderDesc('erstelltAm'), Query.limit(1000)];

      if (saisonjahr) {
        queries.push(Query.equal('saisonjahr', saisonjahr));
      }

      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);

      // WICHTIG: data JSON-Feld parsen, damit alle Felder (angebotsnummer, etc.) verfügbar sind!
      const projekte = response.documents.map(doc => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
      });

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
      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return response as unknown as Projekt;
        }
      }
      return response as unknown as Projekt;
    } catch (error) {
      console.error('Fehler beim Laden des Projekts:', error);
      throw error;
    }
  }

  // Alle Projekte für ein Saisonjahr laden (für Prüfung ob Kunde bereits Projekt hat)
  async getAllProjekte(saisonjahr: number): Promise<Projekt[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(5000),
      ]);
      
      return response.documents as unknown as Projekt[];
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
        const doc = response.documents[0];
        // WICHTIG: data JSON-Feld parsen, damit alle Felder (dispoAnsprechpartner, etc.) verfügbar sind!
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
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

      return response.documents.map(doc => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
      });
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
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(1000),
      ]);
      
      // Parse die Projekte und suche nach Kundennummer
      for (const doc of response.documents) {
        let projekt: Projekt;
        if (doc.data && typeof doc.data === 'string') {
          try {
            projekt = { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            projekt = doc as unknown as Projekt;
          }
        } else {
          projekt = doc as unknown as Projekt;
        }
        
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
  async createProjekt(projekt: NeuesProjekt): Promise<Projekt> {
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

      const dokument = {
        projektName: neuesProjekt.projektName,
        kundeId: neuesProjekt.kundeId,
        kundenname: neuesProjekt.kundenname,
        saisonjahr: neuesProjekt.saisonjahr,
        status: neuesProjekt.status,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify(neuesProjekt),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        dokumentId,
        dokument
      );

      let erstelltesProjekt: Projekt;
      if (response.data && typeof response.data === 'string') {
        try {
          erstelltesProjekt = { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          erstelltesProjekt = neuesProjekt;
        }
      } else {
        erstelltesProjekt = neuesProjekt;
      }

      // ===== AUTOMATISCHE PLATZBAUER-ZUORDNUNG =====
      // Prüfe ob der Kunde über einen Platzbauer bezieht
      if (projekt.kundeId && projekt.saisonjahr) {
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
      console.error('Fehler beim Erstellen des Projekts:', error);
      throw error;
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

      const dokument = {
        projektName: aktualisiert.projektName,
        kundeId: aktualisiert.kundeId,
        kundenname: aktualisiert.kundenname,
        saisonjahr: aktualisiert.saisonjahr,
        status: aktualisiert.status,
        geaendertAm: aktualisiert.geaendertAm,
        data: JSON.stringify(aktualisiert),
      };

      const response = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        projektId,
        dokument
      );

      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return aktualisiert;
        }
      }
      return aktualisiert;
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Projekts:', error);
      throw error;
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

      const dokument = {
        projektName: aktualisiert.projektName,
        kundeId: aktualisiert.kundeId,
        kundenname: aktualisiert.kundenname,
        saisonjahr: aktualisiert.saisonjahr,
        status: aktualisiert.status,
        geaendertAm: aktualisiert.geaendertAm,
        data: JSON.stringify(aktualisiert),
      };

      const response = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        projektId,
        dokument
      );

      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return aktualisiert;
        }
      }
      return aktualisiert;
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Projekt-Status:', error);
      throw error;
    }
  }

  // Projekt löschen
  async deleteProjekt(projekt: Projekt): Promise<void> {
    try {
      // Verwende $id falls vorhanden, sonst id
      const documentId = (projekt as any).$id || projekt.id;
      console.log('Lösche Projekt mit documentId:', documentId);
      await databases.deleteDocument(DATABASE_ID, this.collectionId, documentId);
    } catch (error) {
      console.error('Fehler beim Löschen des Projekts:', error);
      throw error;
    }
  }
}

export const projektService = new ProjektService();
