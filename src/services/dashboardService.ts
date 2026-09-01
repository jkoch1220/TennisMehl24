import { databases } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, ANFRAGEN_COLLECTION_ID } from '../config/appwrite';
import { Query } from 'appwrite';
import type { LagerBestand, DashboardStats, ProjektStats, AnfragenStats } from '../types/dashboard';
import type { Projekt } from '../types/projekt';
import { loadAllDocuments } from '../utils/appwritePagination';
import { getAlleArtikel } from './artikelService';
import { erstelleArtikelIndex, summierePositionsTonnen, TonnagePosition, ArtikelIndex } from '../utils/tonnage';

/**
 * Lädt je Projekt die daten-JSONs der jeweils NEUESTEN finalisierten Belege
 * (Angebot/AB/Lieferschein/Rechnung). Stornierte Rechnungen und ihre Stornos
 * fallen raus, Proforma zählt nicht als Rechnung. Chunked über projektId,
 * damit nur die Belege der gewählten Saison geladen werden.
 */
export async function ladeFinalisierteBelege(
  projektIds: string[]
): Promise<Map<string, Partial<Record<'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung', string>>>> {
  interface BelegDoc {
    $id: string;
    $createdAt: string;
    projektId?: string;
    dokumentTyp?: string;
    daten?: string;
    stornoRechnungId?: string | null;
  }

  const ergebnis = new Map<string, Partial<Record<'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung', string>>>();
  const neuestes = new Map<string, string>(); // `${projektId}|${typ}` -> $createdAt

  for (let i = 0; i < projektIds.length; i += 100) {
    const chunk = projektIds.slice(i, i + 100);
    const docs = (await loadAllDocuments(DATABASE_ID, COLLECTIONS.BESTELLABWICKLUNG_DOKUMENTE, {
      queries: [Query.equal('projektId', chunk)],
    })) as unknown as BelegDoc[];

    for (const doc of docs) {
      const typ = doc.dokumentTyp;
      if (!doc.projektId || !doc.daten) continue;
      if (typ !== 'angebot' && typ !== 'auftragsbestaetigung' && typ !== 'lieferschein' && typ !== 'rechnung') continue;
      if (typ === 'rechnung' && doc.stornoRechnungId) continue; // storniert

      const key = `${doc.projektId}|${typ}`;
      const bisher = neuestes.get(key);
      if (bisher && bisher >= doc.$createdAt) continue;
      neuestes.set(key, doc.$createdAt);

      const eintrag = ergebnis.get(doc.projektId) ?? {};
      eintrag[typ] = doc.daten;
      ergebnis.set(doc.projektId, eintrag);
    }
  }

  return ergebnis;
}

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
      const documents = await loadAllDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, {
        queries: [Query.equal('saisonjahr', saisonjahr)],
      });

      const projekte = documents as unknown as Projekt[];

      // Kennzahlen-Quelle sind seit 09/2026 die FINALISIERTEN Belege
      // (bestellabwicklung_dokumente), nicht mehr der letzte Auto-Save der
      // Tabs (Julians Entscheidung vom 01.09.2026). Nur wo (noch) kein
      // finalisiertes Dokument existiert, zählt der Entwurf — als Prognose,
      // ausgewiesen über anzahlAusEntwurf.
      const belegeJeProjekt = await ladeFinalisierteBelege(projekte.map((p) => p.$id!).filter(Boolean));

      // Artikelstamm einmal laden: die Tonnage-Zählung entscheidet über
      // istTonnageRelevant statt über Einheiten-Raten. Schlägt das Laden fehl,
      // greift der Code-Fallback in tonnage.ts.
      let artikelIndex: ArtikelIndex | undefined;
      try {
        artikelIndex = erstelleArtikelIndex(await getAlleArtikel());
      } catch (e) {
        console.warn('Artikelstamm für Tonnage-Zählung nicht ladbar — Code-Fallback aktiv:', e);
      }

      let verkaufteTonnen = 0;
      let bestellteTonnen = 0;
      let angebotTonnen = 0;
      let angebotsSumme = 0;
      let bestellSumme = 0;
      let bezahlteSumme = 0;
      let angebotDB1 = 0;
      let bestellDB1 = 0;
      let bezahltDB1 = 0;
      let anzahlAngebote = 0;
      let anzahlBestellungen = 0;
      let anzahlBezahlt = 0;
      let anzahlVerloren = 0;
      let anzahlAusEntwurf = 0;

      for (const projekt of projekte) {
        // Parse Projekt-Daten falls in data-Feld (Appwrite-Pattern: JSON-Blob im 'data'-String)
        const projektWithData = projekt as Projekt & { data?: string };
        let projektDaten: Projekt = projekt;
        if (typeof projektWithData.data === 'string') {
          try {
            projektDaten = { ...JSON.parse(projektWithData.data), $id: projekt.$id };
          } catch {
            // Fallback auf Original
          }
        }

        // Finalisierte Belege verdrängen das Entwurfs-JSON als Datenquelle;
        // der restliche Rechenweg (Status-Switch unten) bleibt unverändert.
        const belege = belegeJeProjekt.get(projekt.$id!);
        const massgeblicherTyp: Record<string, 'angebot' | 'auftragsbestaetigung' | 'rechnung' | undefined> = {
          angebot: 'angebot',
          angebot_versendet: 'angebot',
          auftragsbestaetigung: 'auftragsbestaetigung',
          lieferschein: 'auftragsbestaetigung',
          geliefert: 'auftragsbestaetigung',
          rechnung: 'rechnung',
          bezahlt: 'rechnung',
        };
        const noetig = massgeblicherTyp[projektDaten.status as string];
        if (noetig && !belege?.[noetig]) {
          anzahlAusEntwurf++;
        }
        if (belege?.angebot) projektDaten.angebotsDaten = belege.angebot;
        if (belege?.auftragsbestaetigung) projektDaten.auftragsbestaetigungsDaten = belege.auftragsbestaetigung;
        if (belege?.lieferschein) projektDaten.lieferscheinDaten = belege.lieferschein;
        if (belege?.rechnung) projektDaten.rechnungsDaten = belege.rechnung;

        const menge = projektDaten.angefragteMenge || 0;
        const preis = projektDaten.preisProTonne || 0;
        const fallbackSumme = menge * preis;

        // Hilfsfunktion: Extrahiere Summe aus Dokument-Daten
        const extrahiereSumme = (datenString: string | undefined): number => {
          if (!datenString) return 0;
          try {
            const daten = typeof datenString === 'string' ? JSON.parse(datenString) : datenString;
            if (daten.positionen && Array.isArray(daten.positionen)) {
              return daten.positionen.reduce((sum: number, pos: { menge?: number; einzelpreis?: number; einheit?: string; bezeichnung?: string }) => {
                return sum + (pos.menge || 0) * (pos.einzelpreis || 0);
              }, 0);
            }
          } catch {
            // Ignorieren
          }
          return 0;
        };

        // Hilfsfunktion: Extrahiere DB1 (Umsatz - Einkaufskosten) aus Dokument-Daten
        const extrahiereDB1 = (datenString: string | undefined): number => {
          if (!datenString) return 0;
          try {
            const daten = typeof datenString === 'string' ? JSON.parse(datenString) : datenString;
            if (daten.positionen && Array.isArray(daten.positionen)) {
              let umsatz = 0;
              let einkauf = 0;
              for (const pos of daten.positionen) {
                const menge = pos.menge || 0;
                umsatz += menge * (pos.einzelpreis || 0);
                // Einkaufspreis nur wenn vorhanden
                if (pos.einkaufspreis !== undefined && pos.einkaufspreis !== null) {
                  einkauf += menge * pos.einkaufspreis;
                }
              }
              return umsatz - einkauf;
            }
          } catch {
            // Ignorieren
          }
          return 0;
        };

        // Hilfsfunktion: Extrahiere Waren-Tonnen aus Dokument-Daten.
        // Zentrale Zähllogik (Stufe 2, 08/2026): vorher zählte hier
        // `einheit.includes('t')` — das matchte auch „Stk", „Std" und „Pkt",
        // sodass Folie, Paletten und Stunden als Tonnen in die Kennzahlen
        // liefen. Jetzt entscheidet der Artikelstamm (istTonnageRelevant);
        // Sackware in Stück wird über gewichtProStueckKg in Tonnen umgerechnet.
        const extrahiereTonnen = (datenString: string | undefined): number => {
          if (!datenString) return 0;
          try {
            const daten = typeof datenString === 'string' ? JSON.parse(datenString) : datenString;
            if (daten.positionen && Array.isArray(daten.positionen)) {
              return summierePositionsTonnen(daten.positionen as TonnagePosition[], 'auswertung', artikelIndex);
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
            const db1 = extrahiereDB1(projektDaten.angebotsDaten);
            dokumentSumme = angebotSumme > 0 ? angebotSumme : fallbackSumme;
            dokumentTonnen = angebotTonnenExtrahiert > 0 ? angebotTonnenExtrahiert : menge;
            angebotTonnen += dokumentTonnen;
            angebotsSumme += dokumentSumme;
            angebotDB1 += db1 > 0 ? db1 : dokumentSumme; // Fallback: wenn kein EK, dann Umsatz = DB1
            anzahlAngebote++;
            break;
          }
          case 'auftragsbestaetigung': {
            // Nutze AB-Daten oder Angebots-Daten als Fallback
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const angebotSumme = extrahiereSumme(projektDaten.angebotsDaten);
            const abTonnen = extrahiereTonnen(projektDaten.auftragsbestaetigungsDaten);
            const angebotTonnenExtrahiert = extrahiereTonnen(projektDaten.angebotsDaten);
            const abDB1 = extrahiereDB1(projektDaten.auftragsbestaetigungsDaten);
            const angebotDBFallback = extrahiereDB1(projektDaten.angebotsDaten);
            dokumentSumme = abSumme > 0 ? abSumme : (angebotSumme > 0 ? angebotSumme : fallbackSumme);
            dokumentTonnen = abTonnen > 0 ? abTonnen : (angebotTonnenExtrahiert > 0 ? angebotTonnenExtrahiert : menge);
            const db1 = abDB1 > 0 ? abDB1 : (angebotDBFallback > 0 ? angebotDBFallback : dokumentSumme);
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            bestellDB1 += db1;
            anzahlBestellungen++;
            break;
          }
          // 'geliefert' (Fahrer hat per QR-Scan bestätigt) fehlte hier bis
          // 08/2026 komplett — gelieferte, noch nicht fakturierte Projekte
          // verschwanden aus Tonnen UND Umsatz.
          case 'lieferschein':
          case 'geliefert': {
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const angebotSumme = extrahiereSumme(projektDaten.angebotsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            const abTonnen = extrahiereTonnen(projektDaten.auftragsbestaetigungsDaten);
            const abDB1 = extrahiereDB1(projektDaten.auftragsbestaetigungsDaten);
            const angebotDBFallback = extrahiereDB1(projektDaten.angebotsDaten);
            dokumentSumme = lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : (angebotSumme > 0 ? angebotSumme : fallbackSumme));
            dokumentTonnen = lsTonnen > 0 ? lsTonnen : (abTonnen > 0 ? abTonnen : menge);
            const db1 = abDB1 > 0 ? abDB1 : (angebotDBFallback > 0 ? angebotDBFallback : dokumentSumme);
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            bestellDB1 += db1;
            anzahlBestellungen++;
            break;
          }
          case 'rechnung': {
            const reSumme = extrahiereSumme(projektDaten.rechnungsDaten);
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const reTonnen = extrahiereTonnen(projektDaten.rechnungsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            const reDB1 = extrahiereDB1(projektDaten.rechnungsDaten);
            const abDB1 = extrahiereDB1(projektDaten.auftragsbestaetigungsDaten);
            const angebotDBFallback = extrahiereDB1(projektDaten.angebotsDaten);
            dokumentSumme = reSumme > 0 ? reSumme : (lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : fallbackSumme));
            dokumentTonnen = reTonnen > 0 ? reTonnen : (lsTonnen > 0 ? lsTonnen : menge);
            const db1 = reDB1 > 0 ? reDB1 : (abDB1 > 0 ? abDB1 : (angebotDBFallback > 0 ? angebotDBFallback : dokumentSumme));
            bestellteTonnen += dokumentTonnen;
            bestellSumme += dokumentSumme;
            bestellDB1 += db1;
            anzahlBestellungen++;
            break;
          }
          case 'bezahlt': {
            const reSumme = extrahiereSumme(projektDaten.rechnungsDaten);
            const lsSumme = extrahiereSumme(projektDaten.lieferscheinDaten);
            const abSumme = extrahiereSumme(projektDaten.auftragsbestaetigungsDaten);
            const reTonnen = extrahiereTonnen(projektDaten.rechnungsDaten);
            const lsTonnen = extrahiereTonnen(projektDaten.lieferscheinDaten);
            const reDB1 = extrahiereDB1(projektDaten.rechnungsDaten);
            const abDB1 = extrahiereDB1(projektDaten.auftragsbestaetigungsDaten);
            const angebotDBFallback = extrahiereDB1(projektDaten.angebotsDaten);
            dokumentSumme = reSumme > 0 ? reSumme : (lsSumme > 0 ? lsSumme : (abSumme > 0 ? abSumme : fallbackSumme));
            dokumentTonnen = reTonnen > 0 ? reTonnen : (lsTonnen > 0 ? lsTonnen : menge);
            const db1 = reDB1 > 0 ? reDB1 : (abDB1 > 0 ? abDB1 : (angebotDBFallback > 0 ? angebotDBFallback : dokumentSumme));
            verkaufteTonnen += dokumentTonnen;
            bezahlteSumme += dokumentSumme;
            bezahltDB1 += db1;
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
        angebotDB1,
        bestellDB1,
        bezahltDB1,
        anzahlAngebote,
        anzahlBestellungen,
        anzahlBezahlt,
        anzahlVerloren,
        anzahlAusEntwurf,
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
        angebotDB1: 0,
        bestellDB1: 0,
        bezahltDB1: 0,
        anzahlAngebote: 0,
        anzahlBestellungen: 0,
        anzahlBezahlt: 0,
        anzahlVerloren: 0,
        anzahlAusEntwurf: 0,
      };
    }
  },

  // Anfragen-Statistiken laden
  async getAnfragenStats(): Promise<AnfragenStats> {
    try {
      const anfragen = await loadAllDocuments(DATABASE_ID, ANFRAGEN_COLLECTION_ID);

      let anzahlNeu = 0;
      let anzahlZugeordnet = 0;
      let anzahlAngebotErstellt = 0;
      let angefrgteTonnenGesamt = 0;

      for (const anfrage of anfragen) {
        // Parse extrahierte Daten
        let extrahierteDaten: { menge?: number } = {};
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
