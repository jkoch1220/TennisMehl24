import { databases, DATABASE_ID, PRODUKTION_COLLECTION_ID } from '../config/appwrite';
import { ID } from 'appwrite';
import type { ProduktionsEintrag, ProduktionsVerlauf } from '../types/produktion';
import { dashboardService } from './dashboardService';

export const PRODUKTION_DOCUMENT_ID = 'produktion_verlauf';

// Leerer Verlauf als Standard
const DEFAULT_VERLAUF: ProduktionsVerlauf = {
  eintraege: [],
};

export const produktionService = {
  // Produktionsverlauf laden
  async getVerlauf(): Promise<ProduktionsVerlauf> {
    try {
      const response = await databases.getDocument(
        DATABASE_ID,
        PRODUKTION_COLLECTION_ID,
        PRODUKTION_DOCUMENT_ID
      );

      const data = JSON.parse(response.data);
      return {
        ...data,
        letzteAktualisierung: response.$updatedAt,
      };
    } catch (error: any) {
      if (error.code === 404) {
        // Dokument existiert nicht, erstelle es
        return await produktionService.saveVerlauf(DEFAULT_VERLAUF);
      }
      console.error('Fehler beim Laden des Produktionsverlaufs:', error);
      throw error;
    }
  },

  // Produktionsverlauf speichern
  async saveVerlauf(verlauf: ProduktionsVerlauf): Promise<ProduktionsVerlauf> {
    try {
      const dataToSave = {
        eintraege: verlauf.eintraege,
      };

      try {
        const response = await databases.updateDocument(
          DATABASE_ID,
          PRODUKTION_COLLECTION_ID,
          PRODUKTION_DOCUMENT_ID,
          {
            data: JSON.stringify(dataToSave)
          }
        );

        return {
          ...dataToSave,
          letzteAktualisierung: response.$updatedAt,
        };
      } catch (updateError: any) {
        if (updateError.code === 404) {
          const response = await databases.createDocument(
            DATABASE_ID,
            PRODUKTION_COLLECTION_ID,
            PRODUKTION_DOCUMENT_ID,
            {
              data: JSON.stringify(dataToSave)
            }
          );

          return {
            ...dataToSave,
            letzteAktualisierung: response.$updatedAt,
          };
        }
        throw updateError;
      }
    } catch (error) {
      console.error('Fehler beim Speichern des Produktionsverlaufs:', error);
      throw error;
    }
  },

  // Neuen Eintrag hinzufügen
  async addEintrag(tonnen: number, notiz?: string): Promise<ProduktionsEintrag> {
    const jetzt = new Date();
    const datum = jetzt.toISOString().split('T')[0]; // YYYY-MM-DD

    const neuerEintrag: ProduktionsEintrag = {
      id: ID.unique(),
      datum,
      tonnen,
      zeitpunkt: jetzt.toISOString(),
      notiz,
    };

    // Hole aktuellen Verlauf
    const verlauf = await produktionService.getVerlauf();

    // Füge neuen Eintrag am Anfang hinzu
    verlauf.eintraege.unshift(neuerEintrag);

    // Speichere den aktualisierten Verlauf
    await produktionService.saveVerlauf(verlauf);

    // Aktualisiere Lagerbestand (Ziegelmehl Schüttware erhöhen)
    try {
      const lagerBestand = await dashboardService.getLagerBestand();
      lagerBestand.ziegelmehlSchuettware += tonnen;
      await dashboardService.updateLagerBestand(lagerBestand);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Lagerbestands:', error);
      // Nicht werfen, da der Eintrag schon gespeichert wurde
    }

    return neuerEintrag;
  },

  // Eintrag löschen
  async deleteEintrag(eintragId: string): Promise<void> {
    const verlauf = await produktionService.getVerlauf();

    // Finde den zu löschenden Eintrag
    const eintrag = verlauf.eintraege.find(e => e.id === eintragId);

    if (eintrag) {
      // Entferne Eintrag aus Verlauf
      verlauf.eintraege = verlauf.eintraege.filter(e => e.id !== eintragId);
      await produktionService.saveVerlauf(verlauf);

      // Reduziere Lagerbestand
      try {
        const lagerBestand = await dashboardService.getLagerBestand();
        lagerBestand.ziegelmehlSchuettware = Math.max(0, lagerBestand.ziegelmehlSchuettware - eintrag.tonnen);
        await dashboardService.updateLagerBestand(lagerBestand);
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Lagerbestands:', error);
      }
    }
  },

  // Statistiken für einen Zeitraum
  getStatistik(verlauf: ProduktionsVerlauf, tage: number = 30): {
    gesamtTonnen: number;
    durchschnittProTag: number;
    anzahlTage: number;
    tagesProduktionen: { datum: string; tonnen: number }[];
  } {
    const heute = new Date();
    const startDatum = new Date(heute);
    startDatum.setDate(startDatum.getDate() - tage);

    // Filtere Einträge im Zeitraum
    const relevantEintraege = verlauf.eintraege.filter(e => {
      const eintragDatum = new Date(e.datum);
      return eintragDatum >= startDatum && eintragDatum <= heute;
    });

    // Gruppiere nach Tag
    const tagesMap = new Map<string, number>();
    for (const eintrag of relevantEintraege) {
      const aktuell = tagesMap.get(eintrag.datum) || 0;
      tagesMap.set(eintrag.datum, aktuell + eintrag.tonnen);
    }

    const tagesProduktionen = Array.from(tagesMap.entries())
      .map(([datum, tonnen]) => ({ datum, tonnen }))
      .sort((a, b) => b.datum.localeCompare(a.datum));

    const gesamtTonnen = relevantEintraege.reduce((sum, e) => sum + e.tonnen, 0);
    const anzahlTage = tagesMap.size;

    return {
      gesamtTonnen,
      durchschnittProTag: anzahlTage > 0 ? gesamtTonnen / anzahlTage : 0,
      anzahlTage,
      tagesProduktionen,
    };
  },
};
