import { databases } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, ANFRAGEN_COLLECTION_ID } from '../config/appwrite';
import { Query } from 'appwrite';
import type { LagerBestand, DashboardStats, ProjektStats, AnfragenStats } from '../types/dashboard';
import type { Projekt } from '../types/projekt';

export const LAGER_COLLECTION_ID = 'lager_bestand';
export const LAGER_DOCUMENT_ID = 'lager_data';

// Default-Werte für neuen Lagerbestand
const DEFAULT_LAGER_BESTAND: LagerBestand = {
  ziegelschutt: 0,
  ziegelmehlSchuettware: 0,
  ziegelmehlSackware: 0,
  hammerBestand: 0,
  anstehendeAuslieferungen: 0,
  
  ziegelschuttMin: 100,
  ziegelschuttMax: 1000,
  ziegelmehlSchuettwareMin: 50,
  ziegelmehlSchuettwareMax: 500,
  ziegelmehlSackwareMin: 200,
  ziegelmehlSackwareMax: 2000,
  hammerBestandMin: 10,
  hammerBestandMax: 100,
};

export const dashboardService = {
  // Lagerbestand abrufen
  async getLagerBestand(): Promise<LagerBestand> {
    try {
      const response = await databases.getDocument(
        DATABASE_ID,
        LAGER_COLLECTION_ID,
        LAGER_DOCUMENT_ID
      );
      
      // Parse data aus JSON-String
      const data = JSON.parse(response.data);
      
      return {
        id: response.$id,
        ...data,
        letztesUpdate: response.$updatedAt,
      };
    } catch (error: any) {
      if (error.code === 404) {
        // Dokument existiert nicht, erstelle es
        return await dashboardService.updateLagerBestand(DEFAULT_LAGER_BESTAND);
      }
      console.error('Fehler beim Laden des Lagerbestands:', error);
      throw error;
    }
  },

  // Lagerbestand aktualisieren
  async updateLagerBestand(bestand: LagerBestand): Promise<LagerBestand> {
    try {
      // Speichere alle Daten als JSON-String im data-Feld
      const dataToSave = {
        ziegelschutt: bestand.ziegelschutt,
        ziegelmehlSchuettware: bestand.ziegelmehlSchuettware,
        ziegelmehlSackware: bestand.ziegelmehlSackware,
        hammerBestand: bestand.hammerBestand,
        anstehendeAuslieferungen: bestand.anstehendeAuslieferungen,
        ziegelschuttMin: bestand.ziegelschuttMin,
        ziegelschuttMax: bestand.ziegelschuttMax,
        ziegelmehlSchuettwareMin: bestand.ziegelmehlSchuettwareMin,
        ziegelmehlSchuettwareMax: bestand.ziegelmehlSchuettwareMax,
        ziegelmehlSackwareMin: bestand.ziegelmehlSackwareMin,
        ziegelmehlSackwareMax: bestand.ziegelmehlSackwareMax,
        hammerBestandMin: bestand.hammerBestandMin,
        hammerBestandMax: bestand.hammerBestandMax,
        verfuegbareTonnen: bestand.verfuegbareTonnen || 0,
      };

      try {
        // Versuche zu aktualisieren
        const response = await databases.updateDocument(
          DATABASE_ID,
          LAGER_COLLECTION_ID,
          LAGER_DOCUMENT_ID,
          {
            data: JSON.stringify(dataToSave)
          }
        );
        
        return {
          id: response.$id,
          ...dataToSave,
          letztesUpdate: response.$updatedAt,
        };
      } catch (updateError: any) {
        if (updateError.code === 404) {
          // Dokument existiert nicht, erstelle es
          const response = await databases.createDocument(
            DATABASE_ID,
            LAGER_COLLECTION_ID,
            LAGER_DOCUMENT_ID,
            {
              data: JSON.stringify(dataToSave)
            }
          );
          
          return {
            id: response.$id,
            ...dataToSave,
            letztesUpdate: response.$updatedAt,
          };
        }
        throw updateError;
      }
    } catch (error) {
      console.error('Fehler beim Speichern des Lagerbestands:', error);
      throw error;
    }
  },

  // Projekt-Statistiken laden
  async getProjektStats(saisonjahr: number): Promise<ProjektStats> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, [
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(5000),
      ]);

      const projekte = response.documents as unknown as Projekt[];

      let verkaufteTonnen = 0;
      let bestellteTonnen = 0;
      let angebotTonnen = 0;
      let angebotsSumme = 0;
      let bestellSumme = 0;
      let bezahlteSumme = 0;
      let anzahlAngebote = 0;
      let anzahlBestellungen = 0;
      let anzahlBezahlt = 0;
      let anzahlVerloren = 0;

      for (const projekt of projekte) {
        // Parse Projekt-Daten falls in data-Feld
        let projektDaten = projekt;
        if ((projekt as any).data && typeof (projekt as any).data === 'string') {
          try {
            projektDaten = { ...JSON.parse((projekt as any).data), $id: projekt.$id };
          } catch {
            // Fallback auf Original
          }
        }

        const menge = projektDaten.angefragteMenge || 0;
        const preis = projektDaten.preisProTonne || 0;
        const fallbackSumme = menge * preis;

        // Hilfsfunktion: Extrahiere Summe aus Dokument-Daten
        const extrahiereSumme = (datenString: string | undefined): number => {
          if (!datenString) return 0;
          try {
            const daten = typeof datenString === 'string' ? JSON.parse(datenString) : datenString;
            if (daten.positionen && Array.isArray(daten.positionen)) {
              return daten.positionen.reduce((sum: number, pos: any) => {
                return sum + (pos.menge || 0) * (pos.einzelpreis || 0);
              }, 0);
            }
          } catch {
            // Ignorieren
          }
          return 0;
        };

        // Hilfsfunktion: Extrahiere Tonnen aus Dokument-Daten
        const extrahiereTonnen = (datenString: string | undefined): number => {
          if (!datenString) return 0;
          try {
            const daten = typeof datenString === 'string' ? JSON.parse(datenString) : datenString;
            if (daten.positionen && Array.isArray(daten.positionen)) {
              // Suche nach Positionen die Tonnen enthalten (typischerweise Ziegelmehl)
              return daten.positionen.reduce((sum: number, pos: any) => {
                // Prüfe ob es sich um Tonnen handelt (Einheit oder Bezeichnung)
                const einheit = (pos.einheit || '').toLowerCase();
                const bezeichnung = (pos.bezeichnung || '').toLowerCase();
                if (einheit.includes('t') || einheit.includes('tonne') ||
                    bezeichnung.includes('ziegelmehl') || bezeichnung.includes('schütt')) {
                  return sum + (pos.menge || 0);
                }
                return sum;
              }, 0);
            }
          } catch {
            // Ignorieren
          }
          return 0;
        };

        // Bestimme die relevante Summe basierend auf Status
        let dokumentSumme = fallbackSumme;
        let dokumentTonnen = menge;

        switch (projektDaten.status) {
          case 'angebot':
          case 'angebot_versendet': {
            const angebotSumme = extrahiereSumme(projektDaten.angebotsDaten);
            const angebotTonnenExtrahiert = extrahiereTonnen(projektDaten.angebotsDaten);
            dokumentSumme = angebotSumme > 0 ? angebotSumme : fallbackSumme;
            dokumentTonnen = angebotTonnenExtrahiert > 0 ? angebotTonnenExtrahiert : menge;
            angebotTonnen += dokumentTonnen;
            angebotsSumme += dokumentSumme;
            anzahlAngebote++;
            break;
          }
          case 'auftragsbestaetigung': {
            // Nutze AB-Daten oder Angebots-Daten als Fallback
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const angebotSumme = extrahiereSumme(projektDaten.angebotsDaten);
            const abTonnen = extrahiereTonnen(projektDaten.auftragsbestaetigungsDaten);
            const angebotTonnenExtrahiert = extrahiereTonnen(projektDaten.angebotsDaten);
            dokumentSumme = abSumme > 0 ? abSumme : (angebotSumme > 0 ? angebotSumme : fallbackSumme);
            dokumentTonnen = abTonnen > 0 ? abTonnen : (angebotTonnenExtrahiert > 0 ? angebotTonnenExtrahiert : menge);
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            anzahlBestellungen++;
            break;
          }
          case 'lieferschein': {
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const angebotSumme = extrahiereSumme(projektDaten.angebotsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            const abTonnen = extrahiereTonnen(projektDaten.auftragsbestaetigungsDaten);
            dokumentSumme = lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : (angebotSumme > 0 ? angebotSumme : fallbackSumme));
            dokumentTonnen = lsTonnen > 0 ? lsTonnen : (abTonnen > 0 ? abTonnen : menge);
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            anzahlBestellungen++;
            break;
          }
          case 'rechnung': {
            const reSumme = extrahiereSumme(projektDaten.rechnungsDaten);
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const reTonnen = extrahiereTonnen(projektDaten.rechnungsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            dokumentSumme = reSumme > 0 ? reSumme : (lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : fallbackSumme));
            dokumentTonnen = reTonnen > 0 ? reTonnen : (lsTonnen > 0 ? lsTonnen : menge);
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            anzahlBestellungen++;
            break;
          }
          case 'bezahlt': {
            const reSumme = extrahiereSumme(projektDaten.rechnungsDaten);
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const reTonnen = extrahiereTonnen(projektDaten.rechnungsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            dokumentSumme = reSumme > 0 ? reSumme : (lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : fallbackSumme));
            dokumentTonnen = reTonnen > 0 ? reTonnen : (lsTonnen > 0 ? lsTonnen : menge);
            verkaufteTonnen += dokumentTonnen;
            bezahlteSumme += dokumentSumme;
            anzahlBezahlt++;
            break;
          }
          case 'verloren':
            anzahlVerloren++;
            break;
        }
      }

      return {
        verkaufteTonnen,
        bestellteTonnen,
        angebotTonnen,
        angebotsSumme,
        bestellSumme,
        bezahlteSumme,
        anzahlAngebote,
        anzahlBestellungen,
        anzahlBezahlt,
        anzahlVerloren,
      };
    } catch (error) {
      console.error('Fehler beim Laden der Projektstatistiken:', error);
      return {
        verkaufteTonnen: 0,
        bestellteTonnen: 0,
        angebotTonnen: 0,
        angebotsSumme: 0,
        bestellSumme: 0,
        bezahlteSumme: 0,
        anzahlAngebote: 0,
        anzahlBestellungen: 0,
        anzahlBezahlt: 0,
        anzahlVerloren: 0,
      };
    }
  },

  // Anfragen-Statistiken laden
  async getAnfragenStats(): Promise<AnfragenStats> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, ANFRAGEN_COLLECTION_ID, [
        Query.limit(5000),
      ]);

      const anfragen = response.documents;

      let anzahlNeu = 0;
      let anzahlZugeordnet = 0;
      let anzahlAngebotErstellt = 0;
      let angefrgteTonnenGesamt = 0;

      for (const anfrage of anfragen) {
        // Parse extrahierte Daten
        let extrahierteDaten: any = {};
        if (anfrage.extrahierteDaten) {
          try {
            extrahierteDaten = typeof anfrage.extrahierteDaten === 'string'
              ? JSON.parse(anfrage.extrahierteDaten)
              : anfrage.extrahierteDaten;
          } catch {
            // Ignorieren
          }
        }

        if (extrahierteDaten.menge) {
          angefrgteTonnenGesamt += extrahierteDaten.menge;
        }

        switch (anfrage.status) {
          case 'neu':
            anzahlNeu++;
            break;
          case 'zugeordnet':
            anzahlZugeordnet++;
            break;
          case 'angebot_erstellt':
          case 'angebot_versendet':
            anzahlAngebotErstellt++;
            break;
        }
      }

      return {
        anzahlGesamt: anfragen.length,
        anzahlNeu,
        anzahlZugeordnet,
        anzahlAngebotErstellt,
        angefrgteTonnenGesamt,
      };
    } catch (error) {
      console.error('Fehler beim Laden der Anfragenstatistiken:', error);
      return {
        anzahlGesamt: 0,
        anzahlNeu: 0,
        anzahlZugeordnet: 0,
        anzahlAngebotErstellt: 0,
        angefrgteTonnenGesamt: 0,
      };
    }
  },

  // Alle Dashboard-Statistiken
  async getDashboardStats(saisonjahr?: number): Promise<DashboardStats> {
    // Standard: 2026 (aktuelle Saison der Anwendung)
    const aktuellesSaisonjahr = saisonjahr || 2026;

    const [lagerBestand, projektStats, anfragenStats] = await Promise.all([
      dashboardService.getLagerBestand(),
      dashboardService.getProjektStats(aktuellesSaisonjahr),
      dashboardService.getAnfragenStats(),
    ]);

    return {
      lagerBestand,
      projektStats,
      anfragenStats,
      saisonjahr: aktuellesSaisonjahr,
    };
  },
};
