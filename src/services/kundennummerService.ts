import { databases, DATABASE_ID, KUNDEN_COLLECTION_ID, SAISON_KUNDEN_COLLECTION_ID } from '../config/appwrite';
import { Query } from 'appwrite';

/**
 * Service für die automatische Verwaltung von Kundennummern
 * 
 * Kundennummern werden fortlaufend vergeben, beginnend bei 231.
 * Die Nummer orientiert sich immer an der höchsten bereits vergebenen Nummer.
 */
export const kundennummerService = {
  /**
   * Ermittelt die höchste vergebene Kundennummer aus allen Kunden-Collections
   */
  async getHoechsteKundennummer(): Promise<number> {
    try {
      const alleNummern: number[] = [];

      // Lade alle Kunden aus der Dispo-Kunden-Collection
      try {
        const dispoKunden = await databases.listDocuments(
          DATABASE_ID,
          KUNDEN_COLLECTION_ID,
          [Query.limit(5000)]
        );

        dispoKunden.documents.forEach(doc => {
          try {
            let kundennummer: string | undefined;
            
            // Parse data field wenn vorhanden
            if (doc.data && typeof doc.data === 'string') {
              const parsed = JSON.parse(doc.data);
              kundennummer = parsed.kundennummer;
            } else {
              kundennummer = (doc as any).kundennummer;
            }

            if (kundennummer) {
              const nummer = parseInt(kundennummer);
              if (!isNaN(nummer)) {
                alleNummern.push(nummer);
              }
            }
          } catch (e) {
            // Fehler beim Parsen einzelner Dokumente ignorieren
          }
        });
      } catch (error) {
        console.warn('Fehler beim Laden der Dispo-Kunden:', error);
      }

      // Lade alle Kunden aus der Kundenliste-Collection
      try {
        const saisonKunden = await databases.listDocuments(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          [Query.limit(5000)]
        );

        saisonKunden.documents.forEach(doc => {
          try {
            let kundennummer: string | undefined;
            
            // Parse data field wenn vorhanden
            if (doc.data && typeof doc.data === 'string') {
              const parsed = JSON.parse(doc.data);
              kundennummer = parsed.kundennummer;
            } else {
              kundennummer = (doc as any).kundennummer;
            }

            if (kundennummer) {
              const nummer = parseInt(kundennummer);
              if (!isNaN(nummer)) {
                alleNummern.push(nummer);
              }
            }
          } catch (e) {
            // Fehler beim Parsen einzelner Dokumente ignorieren
          }
        });
      } catch (error) {
        console.warn('Fehler beim Laden der Saison-Kunden:', error);
      }

      // Ermittle die höchste Nummer
      if (alleNummern.length === 0) {
        return 230; // Start bei 230, sodass die erste Nummer 231 ist
      }

      const hoechsteNummer = Math.max(...alleNummern);
      return Math.max(230, hoechsteNummer); // Mindestens 230
    } catch (error) {
      console.error('Fehler beim Ermitteln der höchsten Kundennummer:', error);
      return 230; // Fallback
    }
  },

  /**
   * Generiert die nächste verfügbare Kundennummer
   */
  async generiereNaechsteKundennummer(): Promise<string> {
    const hoechsteNummer = await this.getHoechsteKundennummer();
    const naechsteNummer = hoechsteNummer + 1;
    return naechsteNummer.toString();
  },

  /**
   * Prüft, ob eine Kundennummer bereits vergeben ist
   */
  async istKundennummerVergeben(kundennummer: string): Promise<boolean> {
    const nummer = parseInt(kundennummer);
    if (isNaN(nummer)) {
      return false;
    }

    const hoechsteNummer = await this.getHoechsteKundennummer();
    return nummer <= hoechsteNummer;
  },

  /**
   * Generiert mehrere aufeinanderfolgende Kundennummern
   */
  async generiereKundennummern(anzahl: number): Promise<string[]> {
    const startNummer = await this.getHoechsteKundennummer() + 1;
    const nummern: string[] = [];
    
    for (let i = 0; i < anzahl; i++) {
      nummern.push((startNummer + i).toString());
    }
    
    return nummern;
  },
};




