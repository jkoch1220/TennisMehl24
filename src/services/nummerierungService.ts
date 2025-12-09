import { databases, DATABASE_ID, STAMMDATEN_COLLECTION_ID, STAMMDATEN_DOCUMENT_ID, PROJEKTE_COLLECTION_ID } from '../config/appwrite';
import { Query } from 'appwrite';

export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';

interface Zaehlerstaende {
  angebotZaehler: number;
  auftragsbestaetigungZaehler: number;
  lieferscheinZaehler: number;
  rechnungZaehler: number;
  jahr: number;
}

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
 * Format: PREFIX-JAHR-LAUFNUMMER
 * Beispiele:
 * - ANG-2025-0001 (Angebot)
 * - AB-2025-0001 (Auftragsbestätigung)
 * - LS-2025-0001 (Lieferschein)
 * - RE-2025-0001 (Rechnung)
 * 
 * WICHTIG: Diese Funktion prüft IMMER, ob die generierte Nummer bereits existiert,
 * um doppelte Nummern zu vermeiden!
 */
export const generiereNaechsteDokumentnummer = async (typ: DokumentTyp): Promise<string> => {
  const MAX_VERSUCHE = 100; // Verhindere Endlosschleifen
  let versuch = 0;
  
  try {
    const aktuellesJahr = new Date().getFullYear();
    
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
      jahr: gespeichertesJahr,
    };
    
    if (gespeichertesJahr < aktuellesJahr) {
      // Neues Jahr: Zähler zurücksetzen
      zaehlerstaende = {
        angebotZaehler: 0,
        auftragsbestaetigungZaehler: 0,
        lieferscheinZaehler: 0,
        rechnungZaehler: 0,
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
    const jahr = new Date().getFullYear();
    const timestamp = Date.now();
    const zufall = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
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
      default:
        prefix = 'DOK';
    }
    
    const fallbackNummer = `${prefix}-${jahr}-TEMP-${timestamp}-${zufall}`;
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
    
    return {
      angebotZaehler: stammdaten.angebotZaehler || 0,
      auftragsbestaetigungZaehler: stammdaten.auftragsbestaetigungZaehler || 0,
      lieferscheinZaehler: stammdaten.lieferscheinZaehler || 0,
      rechnungZaehler: stammdaten.rechnungZaehler || 0,
      jahr: stammdaten.jahr || new Date().getFullYear(),
    };
  } catch (error) {
    console.error('Fehler beim Abrufen der Zählerstände:', error);
    return null;
  }
};
