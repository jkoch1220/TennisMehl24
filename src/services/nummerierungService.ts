import { databases, DATABASE_ID, STAMMDATEN_COLLECTION_ID, STAMMDATEN_DOCUMENT_ID, PROJEKTE_COLLECTION_ID } from '../config/appwrite';
import { Query } from 'appwrite';

export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'stornorechnung' | 'proformarechnung';

interface Zaehlerstaende {
  angebotZaehler: number;
  auftragsbestaetigungZaehler: number;
  lieferscheinZaehler: number;
  rechnungZaehler: number;
  stornoZaehler: number;
  proformaZaehler: number;
  jahr: number;
}

/**
 * Berechnet die aktuelle Saison basierend auf dem Monat.
 * Die Saison geht von November bis April:
 * - November 2025 - April 2026 = Saison 2026
 * - Mai 2026 - Oktober 2026 = Saison 2026 (Nachsaison)
 * - November 2026 - April 2027 = Saison 2027
 *
 * @param saisonStartMonat - Der Monat, ab dem die neue Saison beginnt (Standard: 11 = November)
 * @returns Das aktuelle Saisonjahr
 */
export const berechneAktuelleSaison = (saisonStartMonat: number = 11): number => {
  const heute = new Date();
  const aktuellerMonat = heute.getMonth() + 1; // getMonth() ist 0-basiert
  const aktuellesJahr = heute.getFullYear();

  // Ab dem Startmonat (z.B. November) gehört es zur nächsten Saison
  if (aktuellerMonat >= saisonStartMonat) {
    return aktuellesJahr + 1;
  }

  return aktuellesJahr;
};

/**
 * Lädt die konfigurierte Saison aus den Stammdaten oder berechnet sie automatisch
 */
export const getAktuelleSaison = async (): Promise<number> => {
  try {
    const stammdaten = await databases.getDocument(
      DATABASE_ID,
      STAMMDATEN_COLLECTION_ID,
      STAMMDATEN_DOCUMENT_ID
    );

    // Wenn eine manuelle Saison konfiguriert ist, verwende diese
    if (stammdaten.aktuelleSaison) {
      return stammdaten.aktuelleSaison;
    }

    // Sonst berechne automatisch basierend auf dem konfigurierten Startmonat
    const saisonStartMonat = stammdaten.saisonStartMonat || 11; // Standard: November
    return berechneAktuelleSaison(saisonStartMonat);
  } catch (error) {
    // Fallback: Automatische Berechnung mit Standard-Startmonat
    return berechneAktuelleSaison(11);
  }
};

/**
 * Prüft, ob eine Dokumentnummer bereits in der Datenbank existiert
 */
const nummerExistiertBereits = async (nummer: string, typ: DokumentTyp): Promise<boolean> => {
  try {
    let feldName: string;
    
    switch (typ) {
      case 'angebot':
        feldName = 'angebotsnummer';
        break;
      case 'auftragsbestaetigung':
        feldName = 'auftragsbestaetigungsnummer';
        break;
      case 'lieferschein':
        feldName = 'lieferscheinnummer';
        break;
      case 'rechnung':
        feldName = 'rechnungsnummer';
        break;
      case 'stornorechnung':
        feldName = 'stornoRechnungsnummer';
        break;
      case 'proformarechnung':
        feldName = 'proformaRechnungsnummer';
        break;
      default:
        return false;
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [
        Query.equal(feldName, nummer),
        Query.limit(1)
      ]
    );
    
    return response.documents.length > 0;
  } catch (error) {
    console.error('Fehler beim Prüfen der Dokumentnummer:', error);
    return false;
  }
};

/**
 * Generiert eine standardkonforme Dokumentnummer nach deutschem Muster
 * Format: PREFIX-SAISONJAHR-LAUFNUMMER
 * Beispiele:
 * - ANG-2026-0001 (Angebot)
 * - AB-2026-0001 (Auftragsbestätigung)
 * - LS-2026-0001 (Lieferschein)
 * - RE-2026-0001 (Rechnung)
 * - STORNO-2026-0001 (Stornorechnung)
 * - PRO-2026-0001 (Proforma-Rechnung)
 *
 * Das Saisonjahr wird aus den Stammdaten geladen oder automatisch berechnet.
 *
 * WICHTIG: Diese Funktion prüft IMMER, ob die generierte Nummer bereits existiert,
 * um doppelte Nummern zu vermeiden!
 */
export const generiereNaechsteDokumentnummer = async (typ: DokumentTyp): Promise<string> => {
  const MAX_VERSUCHE = 100; // Verhindere Endlosschleifen
  let versuch = 0;

  try {
    // Lade aktuelle Saison aus Stammdaten oder berechne automatisch
    const aktuellesJahr = await getAktuelleSaison();
    
    // Hole die aktuellen Zählerstände
    let stammdaten: any;
    
    try {
      stammdaten = await databases.getDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID
      );
    } catch (error: any) {
      // Falls noch kein Datensatz existiert, erstelle ihn
      if (error.code === 404) {
        stammdaten = await databases.createDocument(
          DATABASE_ID,
          STAMMDATEN_COLLECTION_ID,
          STAMMDATEN_DOCUMENT_ID,
          {
            angebotZaehler: 0,
            auftragsbestaetigungZaehler: 0,
            lieferscheinZaehler: 0,
            rechnungZaehler: 0,
            stornoZaehler: 0,
            proformaZaehler: 0,
            jahr: aktuellesJahr,
          }
        );
      } else {
        throw error;
      }
    }
    
    // Wenn ein neues Jahr begonnen hat, setze alle Zähler zurück
    const gespeichertesJahr = stammdaten.jahr || aktuellesJahr;
    let zaehlerstaende: Zaehlerstaende = {
      angebotZaehler: stammdaten.angebotZaehler || 0,
      auftragsbestaetigungZaehler: stammdaten.auftragsbestaetigungZaehler || 0,
      lieferscheinZaehler: stammdaten.lieferscheinZaehler || 0,
      rechnungZaehler: stammdaten.rechnungZaehler || 0,
      stornoZaehler: stammdaten.stornoZaehler || 0,
      proformaZaehler: stammdaten.proformaZaehler || 0,
      jahr: gespeichertesJahr,
    };

    if (gespeichertesJahr < aktuellesJahr) {
      // Neues Jahr: Zähler zurücksetzen
      zaehlerstaende = {
        angebotZaehler: 0,
        auftragsbestaetigungZaehler: 0,
        lieferscheinZaehler: 0,
        rechnungZaehler: 0,
        stornoZaehler: 0,
        proformaZaehler: 0,
        jahr: aktuellesJahr,
      };
    }
    
    // Bestimme den Präfix und den entsprechenden Zähler
    let prefix: string;
    let zaehlerFeld: keyof Zaehlerstaende;
    
    switch (typ) {
      case 'angebot':
        prefix = 'ANG';
        zaehlerFeld = 'angebotZaehler';
        break;
      case 'auftragsbestaetigung':
        prefix = 'AB';
        zaehlerFeld = 'auftragsbestaetigungZaehler';
        break;
      case 'lieferschein':
        prefix = 'LS';
        zaehlerFeld = 'lieferscheinZaehler';
        break;
      case 'rechnung':
        prefix = 'RE';
        zaehlerFeld = 'rechnungZaehler';
        break;
      case 'stornorechnung':
        prefix = 'STORNO';
        zaehlerFeld = 'stornoZaehler';
        break;
      case 'proformarechnung':
        prefix = 'PRO';
        zaehlerFeld = 'proformaZaehler';
        break;
      default:
        throw new Error(`Unbekannter Dokumenttyp: ${typ}`);
    }
    
    // Schleife, um eine eindeutige Nummer zu finden
    while (versuch < MAX_VERSUCHE) {
      versuch++;

      // Erhöhe den Zähler
      const neuerZaehler = zaehlerstaende[zaehlerFeld] + 1;

      // Formatiere die Nummer mit führenden Nullen (4-stellig)
      const laufnummer = neuerZaehler.toString().padStart(4, '0');

      // Generiere die vollständige Dokumentnummer
      // Alle Dokumenttypen enthalten das Saisonjahr: ANG-2026-0001, AB-2026-0001, LS-2026-0001, RE-2026-0001
      const dokumentnummer = `${prefix}-${aktuellesJahr}-${laufnummer}`;
      
      // KRITISCH: Prüfe, ob diese Nummer bereits existiert
      const existiert = await nummerExistiertBereits(dokumentnummer, typ);
      
      if (!existiert) {
        // Nummer ist frei! Speichere den aktualisierten Zählerstand
        zaehlerstaende[zaehlerFeld] = neuerZaehler;
        
        await databases.updateDocument(
          DATABASE_ID,
          STAMMDATEN_COLLECTION_ID,
          STAMMDATEN_DOCUMENT_ID,
          zaehlerstaende
        );
        
        console.log(`✅ Neue ${typ}nummer generiert: ${dokumentnummer} (Versuch ${versuch})`);
        
        return dokumentnummer;
      } else {
        // Nummer existiert bereits, erhöhe den Zähler und versuche es erneut
        console.warn(`⚠️ Dokumentnummer ${dokumentnummer} existiert bereits, versuche nächste Nummer...`);
        zaehlerstaende[zaehlerFeld] = neuerZaehler;
      }
    }
    
    // Falls nach MAX_VERSUCHE keine freie Nummer gefunden wurde
    throw new Error(`Konnte nach ${MAX_VERSUCHE} Versuchen keine freie ${typ}nummer generieren`);
    
  } catch (error) {
    console.error('❌ KRITISCHER Fehler bei der Generierung der Dokumentnummer:', error);
    // Fallback: Verwende Timestamp-basierte eindeutige Nummer
    const timestamp = Date.now();
    // Verwende die letzten 4 Ziffern des Timestamps als Laufnummer
    const laufnummer = (timestamp % 10000).toString().padStart(4, '0');
    let prefix: string;

    switch (typ) {
      case 'angebot':
        prefix = 'ANG';
        break;
      case 'auftragsbestaetigung':
        prefix = 'AB';
        break;
      case 'lieferschein':
        prefix = 'LS';
        break;
      case 'rechnung':
        prefix = 'RE';
        break;
      case 'stornorechnung':
        prefix = 'STORNO';
        break;
      case 'proformarechnung':
        prefix = 'PRO';
        break;
      default:
        prefix = 'DOK';
    }

    // Im Fallback das Saisonjahr für alle Dokumenttypen einfügen
    const fallbackSaison = berechneAktuelleSaison();
    const fallbackNummer = `${prefix}-${fallbackSaison}-${laufnummer}`;
    console.error(`⚠️ Verwende Fallback-Nummer: ${fallbackNummer}`);

    return fallbackNummer;
  }
};

/**
 * Prüft, ob eine Dokumentnummer bereits existiert (für manuelle Nummern)
 * Diese Funktion wird verwendet, wenn Benutzer manuell eine Nummer eingeben.
 * 
 * @param nummer - Die zu prüfende Dokumentnummer
 * @param typ - Der Typ des Dokuments
 * @param projektId - Optional: Die ID des aktuellen Projekts (wird von der Suche ausgeschlossen)
 * @returns Objekt mit existiert-Flag und ggf. dem gefundenen Projekt
 */
export const pruefeDokumentnummer = async (
  nummer: string,
  typ: DokumentTyp,
  projektId?: string
): Promise<{ existiert: boolean; projekt?: any }> => {
  try {
    if (!nummer || nummer.trim() === '') {
      return { existiert: false };
    }
    
    let feldName: string;
    
    // Bestimme den Feldnamen je nach Dokumenttyp
    switch (typ) {
      case 'angebot':
        feldName = 'angebotsnummer';
        break;
      case 'auftragsbestaetigung':
        feldName = 'auftragsbestaetigungsnummer';
        break;
      case 'lieferschein':
        feldName = 'lieferscheinnummer';
        break;
      case 'rechnung':
        feldName = 'rechnungsnummer';
        break;
      case 'stornorechnung':
        feldName = 'stornoRechnungsnummer';
        break;
      case 'proformarechnung':
        feldName = 'proformaRechnungsnummer';
        break;
      default:
        return { existiert: false };
    }

    const queries = [
      Query.equal(feldName, nummer.trim()),
      Query.limit(1)
    ];

    // Wenn projektId angegeben ist, schließe dieses Projekt aus der Suche aus
    // (z.B. beim Bearbeiten eines existierenden Projekts)
    if (projektId) {
      queries.push(Query.notEqual('$id', projektId));
    }
    
    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      queries
    );
    
    if (response.documents.length > 0) {
      console.warn(`⚠️ Dokumentnummer ${nummer} existiert bereits in Projekt: ${response.documents[0].kundenname}`);
      return {
        existiert: true,
        projekt: response.documents[0],
      };
    }
    
    return { existiert: false };
    
  } catch (error) {
    console.error('Fehler beim Prüfen der Dokumentnummer:', error);
    // Im Fehlerfall gehen wir davon aus, dass die Nummer nicht existiert
    // (besser als fälschlicherweise eine Nummer als "existiert" zu melden)
    return { existiert: false };
  }
};

/**
 * Gibt die aktuellen Zählerstände zurück (für Debugging/Verwaltung)
 */
export const getZaehlerstaende = async (): Promise<Zaehlerstaende | null> => {
  try {
    const stammdaten = await databases.getDocument(
      DATABASE_ID,
      STAMMDATEN_COLLECTION_ID,
      STAMMDATEN_DOCUMENT_ID
    );

    const aktuelleSaison = await getAktuelleSaison();

    return {
      angebotZaehler: stammdaten.angebotZaehler || 0,
      auftragsbestaetigungZaehler: stammdaten.auftragsbestaetigungZaehler || 0,
      lieferscheinZaehler: stammdaten.lieferscheinZaehler || 0,
      rechnungZaehler: stammdaten.rechnungZaehler || 0,
      stornoZaehler: stammdaten.stornoZaehler || 0,
      proformaZaehler: stammdaten.proformaZaehler || 0,
      jahr: stammdaten.jahr || aktuelleSaison,
    };
  } catch (error) {
    console.error('Fehler beim Abrufen der Zählerstände:', error);
    return null;
  }
};

