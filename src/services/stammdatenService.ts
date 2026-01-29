/**
 * Service für Stammdaten-Verwaltung
 * Verwaltet die Firmenstammdaten (ähnlich wie Fixkosten - nur ein Datensatz)
 */

import { databases } from '../config/appwrite';
import { DATABASE_ID, STAMMDATEN_COLLECTION_ID, STAMMDATEN_DOCUMENT_ID } from '../config/appwrite';
import { Stammdaten, StammdatenInput } from '../types/stammdaten';

/**
 * Lädt die Stammdaten
 * Es gibt nur einen Stammdaten-Datensatz
 */
export const ladeStammdaten = async (): Promise<Stammdaten | null> => {
  try {
    const response = await databases.getDocument(
      DATABASE_ID,
      STAMMDATEN_COLLECTION_ID,
      STAMMDATEN_DOCUMENT_ID
    );
    return response as unknown as Stammdaten;
  } catch (error: any) {
    if (error.code === 404) {
      // Datensatz existiert noch nicht
      return null;
    }
    console.error('Fehler beim Laden der Stammdaten:', error);
    throw error;
  }
};

/**
 * Speichert die Stammdaten (erstellt oder aktualisiert)
 */
export const speichereStammdaten = async (daten: StammdatenInput): Promise<Stammdaten> => {
  try {
    const jetzt = new Date().toISOString();
    
    // Prüfe, ob bereits ein Datensatz existiert
    const bestehendeStammdaten = await ladeStammdaten();
    
    if (bestehendeStammdaten) {
      // Aktualisiere bestehende Stammdaten
      const response = await databases.updateDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID,
        {
          ...daten,
          aktualisiertAm: jetzt,
        }
      );
      return response as unknown as Stammdaten;
    } else {
      // Erstelle neue Stammdaten
      const response = await databases.createDocument(
        DATABASE_ID,
        STAMMDATEN_COLLECTION_ID,
        STAMMDATEN_DOCUMENT_ID,
        {
          ...daten,
          erstelltAm: jetzt,
          aktualisiertAm: jetzt,
        }
      );
      return response as unknown as Stammdaten;
    }
  } catch (error) {
    console.error('Fehler beim Speichern der Stammdaten:', error);
    throw error;
  }
};

/**
 * Initialisiert Stammdaten mit Standardwerten (falls noch keine existieren)
 */
export const initialisiereStammdaten = async (): Promise<Stammdaten> => {
  const defaultStammdaten: StammdatenInput = {
    // Firmendaten
    firmenname: 'TENNISMEHL GmbH',
    firmenstrasse: 'Wertheimer Str. 13',
    firmenPlz: '97959',
    firmenOrt: 'Großrinderfeld',
    firmenTelefon: '09391 9870-0',
    firmenEmail: 'info@tennismehl.com',
    firmenWebsite: 'www.tennismehl.com',
    
    // Geschäftsführung
    geschaeftsfuehrer: ['Stefan Egner'],
    
    // Handelsregister
    handelsregister: 'Würzburg HRB 731653',
    sitzGesellschaft: 'Großrinderfeld',
    
    // Steuerdaten
    steuernummer: '',
    ustIdNr: 'DE 320 029 255',
    
    // Bankdaten
    bankname: 'Sparkasse Tauberfranken',
    iban: 'DE49 6735 0130 0000254019',
    bic: 'SOLADES1TBB',
    
    // Werk/Verkauf
    werkName: 'TENNISMEHL GmbH',
    werkStrasse: 'Wertheimer Str. 3a',
    werkPlz: '97828',
    werkOrt: 'Marktheidenfeld',
  };
  
  return await speichereStammdaten(defaultStammdaten);
};

/**
 * Gibt die Stammdaten zurück oder erstellt sie mit Standardwerten
 */
export const getStammdatenOderDefault = async (): Promise<Stammdaten> => {
  const stammdaten = await ladeStammdaten();
  if (!stammdaten) {
    return await initialisiereStammdaten();
  }
  return stammdaten;
};

/**
 * Artikel-Preise aus der Appwrite Artikel-Collection oder Fallback
 * TODO: Später mit echtem Appwrite-Abruf ersetzen
 */
/**
 * Fallback-Preise für Artikel (werden verwendet wenn Appwrite nicht erreichbar)
 *
 * WICHTIG: Diese Preise müssen mit der Appwrite Artikel-Collection synchron sein!
 *
 * TM-ZM-02/03: Loses Material in €/Tonne (Werkspreis)
 * TM-ZM-02St/03St: Sackware per Spedition in €/Tonne (inkl. Absacken, ohne Fracht)
 * TM-ZM-02S/03S: Beiladung in €/Sack (einzelne 40kg Säcke)
 * TM-PE: PE-Folie pro Stück
 */
const ARTIKEL_PREISE_FALLBACK: Record<string, number> = {
  'TM-ZM-02': 95.75,    // Loses Material 0-2mm (€/t)
  'TM-ZM-03': 95.75,    // Loses Material 0-3mm (€/t)
  'TM-ZM-02St': 145.00, // Sackware 0-2mm per Spedition (€/t, ohne Frachtkosten!)
  'TM-ZM-03St': 145.00, // Sackware 0-3mm per Spedition (€/t, ohne Frachtkosten!)
  'TM-ZM-02S': 8.50,    // Beiladung 0-2mm (€/Sack à 40kg)
  'TM-ZM-03S': 8.50,    // Beiladung 0-3mm (€/Sack à 40kg)
  'TM-PE': 25.00,       // PE-Folie pro Stück
};

/**
 * Lädt den Preis für einen Artikel aus den Stammdaten/Artikel-Collection
 * Falls nicht verfügbar, wird ein Fallback-Preis verwendet
 *
 * @param artikelnummer - Die Artikelnummer (z.B. 'TM-PE', 'TM-ZM-02')
 * @returns Preis in EUR
 */
export const getArtikelPreis = async (artikelnummer: string): Promise<number> => {
  // TODO: Später aus Appwrite Artikel-Collection laden
  // const artikel = await databases.listDocuments(DATABASE_ID, 'artikel', [
  //   Query.equal('artikelnummer', artikelnummer)
  // ]);
  // if (artikel.documents.length > 0) {
  //   return artikel.documents[0].werkspreis;
  // }

  // Fallback auf vordefinierte Preise
  const fallbackPreis = ARTIKEL_PREISE_FALLBACK[artikelnummer];
  if (fallbackPreis !== undefined) {
    return fallbackPreis;
  }

  console.warn(`Kein Preis für Artikel ${artikelnummer} gefunden, verwende 0`);
  return 0;
};
