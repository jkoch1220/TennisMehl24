/**
 * Service für Stammdaten-Verwaltung
 * Verwaltet die Firmenstammdaten (ähnlich wie Fixkosten - nur ein Datensatz)
 */

import { databases } from '../config/appwrite';
import { DATABASE_ID, STAMMDATEN_COLLECTION_ID, STAMMDATEN_DOCUMENT_ID } from '../config/appwrite';
import { Stammdaten, StammdatenInput } from '../types/stammdaten';
import { auditService, bearbeiterStempel } from './auditService';
import { sucheArtikelNachNummer } from './artikelService';

// ===== STAMMDATEN CACHE =====
// Stammdaten ändern sich sehr selten, daher 5 Minuten Cache
interface StammdatenCache {
  data: Stammdaten | null;
  timestamp: number;
}
const STAMMDATEN_CACHE_TTL = 5 * 60 * 1000; // 5 Minuten
let stammdatenCache: StammdatenCache | null = null;

/**
 * Cache invalidieren (nach Speichern)
 */
export const invalidateStammdatenCache = (): void => {
  stammdatenCache = null;
};

/**
 * Lädt die Stammdaten (mit Cache!)
 * Es gibt nur einen Stammdaten-Datensatz
 */
export const ladeStammdaten = async (): Promise<Stammdaten | null> => {
  // Cache prüfen
  const now = Date.now();
  if (stammdatenCache && (now - stammdatenCache.timestamp) < STAMMDATEN_CACHE_TTL) {
    return stammdatenCache.data;
  }

  try {
    const response = await databases.getDocument(
      DATABASE_ID,
      STAMMDATEN_COLLECTION_ID,
      STAMMDATEN_DOCUMENT_ID
    );
    const stammdaten = response as unknown as Stammdaten;

    // Cache aktualisieren
    stammdatenCache = {
      data: stammdaten,
      timestamp: now,
    };

    return stammdaten;
  } catch (error: any) {
    if (error.code === 404) {
      // Datensatz existiert noch nicht - auch cachen (null)
      stammdatenCache = {
        data: null,
        timestamp: now,
      };
      return null;
    }
    console.error('Fehler beim Laden der Stammdaten:', error);
    throw error;
  }
};

/**
 * Speichert die Stammdaten (erstellt oder aktualisiert)
 * OPTIMIERT: Versucht erst Update, dann Create (statt vorher laden)
 */
export const speichereStammdaten = async (daten: StammdatenInput): Promise<Stammdaten> => {
  try {
    const jetzt = new Date().toISOString();

    // Cache invalidieren VOR dem Speichern
    invalidateStammdatenCache();

    // Bearbeiter-Stempel; Fallback: solange neue Attribute (Stempel via
    // scripts/setup-bearbeitet-felder.mjs, Preis-Konfiguration via
    // scripts/add-stammdaten-preis-konfiguration.js bzw. appwriteSetup) noch
    // nicht angelegt sind, werden unbekannte Attribute einzeln entfernt und
    // der Request wiederholt (gleiches Muster wie projektService).
    const schreibe = async (payload: Record<string, unknown>) => {
      let aktuellerPayload = { ...payload };
      // Bounded Loop: pro Durchlauf wird höchstens ein unbekanntes Attribut entfernt
      for (let versuch = 0; versuch < 6; versuch++) {
        try {
          return await databases.updateDocument(
            DATABASE_ID,
            STAMMDATEN_COLLECTION_ID,
            STAMMDATEN_DOCUMENT_ID,
            aktuellerPayload
          );
        } catch (error) {
          if (!(error instanceof Error) || !/Unknown attribute/i.test(error.message)) {
            throw error;
          }
          const match = error.message.match(/Unknown attribute:?\s*"?([A-Za-z0-9_]+)"?/i);
          const unbekannt = match?.[1];
          if (!unbekannt || !(unbekannt in aktuellerPayload)) {
            // Attribut nicht identifizierbar → alter Fallback: nur Stempel entfernen
            const { bearbeitetVon: _v, bearbeitetVonName: _n, bearbeitetAm: _a, ...ohneStempel } = aktuellerPayload;
            return await databases.updateDocument(
              DATABASE_ID,
              STAMMDATEN_COLLECTION_ID,
              STAMMDATEN_DOCUMENT_ID,
              ohneStempel
            );
          }
          console.warn(`Stammdaten: Attribut "${unbekannt}" existiert noch nicht im Schema — wird für dieses Update übersprungen.`);
          const rest = { ...aktuellerPayload };
          delete rest[unbekannt];
          aktuellerPayload = rest;
        }
      }
      throw new Error('Stammdaten-Update fehlgeschlagen (zu viele unbekannte Attribute)');
    };

    try {
      // Versuche erst Update (häufigster Fall)
      const response = await schreibe({
        ...daten,
        aktualisiertAm: jetzt,
        ...bearbeiterStempel(),
      });
      const stammdaten = response as unknown as Stammdaten;

      // Cache mit neuen Daten aktualisieren
      stammdatenCache = {
        data: stammdaten,
        timestamp: Date.now(),
      };

      auditService.logAktion({
        action: 'update',
        entityType: 'stammdaten',
        entityId: STAMMDATEN_DOCUMENT_ID,
        summary: 'Stammdaten bearbeitet',
      });

      return stammdaten;
    } catch (updateError: any) {
      // Wenn Dokument nicht existiert, erstelle es
      if (updateError.code === 404) {
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
        const stammdaten = response as unknown as Stammdaten;

        // Cache mit neuen Daten aktualisieren
        stammdatenCache = {
          data: stammdaten,
          timestamp: Date.now(),
        };

        auditService.logAktion({
          action: 'create',
          entityType: 'stammdaten',
          entityId: STAMMDATEN_DOCUMENT_ID,
          summary: 'Stammdaten angelegt',
        });

        return stammdaten;
      }
      throw updateError;
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

// ===== PREIS-KONFIGURATION =====
// Zentrale, jederzeit (auch unterjährig) änderbare Preis-Parameter.
// Wirken ausschließlich auf NEU erzeugte Angebote/Kalkulationen — nie rückwirkend.

/** Default: globale Preisanpassung in % auf Vorjahrespreise für neue Saison-Angebote */
export const SAISON_PREISANPASSUNG_PROZENT_DEFAULT = 4;
/**
 * @deprecated Der Anbruch-Aufschlag ist ein fester Euro-Betrag (siehe
 * HALBE_PALETTE_AUFSCHLAG_EURO_DEFAULT). Nur noch für Altbestand vorhanden.
 */
export const HALBE_PALETTE_AUFSCHLAG_PROZENT_DEFAULT = 0;
/** Default: fester Aufschlag in EURO je angebrochener (halber) Palette */
export const HALBE_PALETTE_AUFSCHLAG_EURO_DEFAULT = 0;

export interface PreisKonfiguration {
  /** Globale Preisanpassung in % auf Vorjahrespreise für neue Saison-Angebote */
  saisonPreisanpassungProzent: number;
  /**
   * @deprecated Nicht mehr in der Kalkulation verwendet — ersetzt durch
   * halbePaletteAufschlagEuro. Wird nur noch für Altbestand mitgeliefert.
   */
  halbePaletteAufschlagProzent: number;
  /**
   * Fester Aufschlag in EURO je angebrochener (halber) Palette. Wird im Angebot als
   * eigene Pauschal-Position ausgewiesen (0 = kein Aufschlag).
   */
  halbePaletteAufschlagEuro: number;
}

/** Pure Ableitung der Preis-Konfiguration aus (evtl. unvollständigen) Stammdaten */
export const leitePreisKonfigurationAb = (stammdaten: Stammdaten | null): PreisKonfiguration => ({
  saisonPreisanpassungProzent:
    stammdaten?.saisonPreisanpassungProzent ?? SAISON_PREISANPASSUNG_PROZENT_DEFAULT,
  halbePaletteAufschlagProzent:
    stammdaten?.halbePaletteAufschlagProzent ?? HALBE_PALETTE_AUFSCHLAG_PROZENT_DEFAULT,
  halbePaletteAufschlagEuro:
    stammdaten?.halbePaletteAufschlagEuro ?? HALBE_PALETTE_AUFSCHLAG_EURO_DEFAULT,
});

/**
 * Lädt die Preis-Konfiguration aus den Stammdaten (mit Defaults als Fallback).
 * Nutzt den Stammdaten-Cache — Änderungen greifen ohne Deploy/Neustart.
 */
export const getPreisKonfiguration = async (): Promise<PreisKonfiguration> => {
  try {
    return leitePreisKonfigurationAb(await ladeStammdaten());
  } catch (error) {
    console.warn('Preis-Konfiguration konnte nicht geladen werden, verwende Defaults:', error);
    return leitePreisKonfigurationAb(null);
  }
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
  'TM-ZM-02': 98.70,    // Loses Material 0-2mm (€/t)
  'TM-ZM-03': 98.70,    // Loses Material 0-3mm (€/t)
  'TM-ZM-02St': 155.00, // Sackware 0-2mm per Spedition (€/t, ohne Frachtkosten!)
  'TM-ZM-03St': 155.00, // Sackware 0-3mm per Spedition (€/t, ohne Frachtkosten!)
  'TM-ZM-02S': 8.50,    // Beiladung 0-2mm (€/Sack à 40kg)
  'TM-ZM-03S': 8.50,    // Beiladung 0-3mm (€/Sack à 40kg)
  'TM-ZM-BIG-02': 125.90, // BigBag 0-2mm (€/t)
  'TM-ZM-BIG-03': 125.90, // BigBag 0-3mm (€/t)
  'TM-PE': 18.20,       // PE-Folie pro Stück
  // TM-FP: Frachtkostenpauschale - Preis wird DYNAMISCH nach Tonnage berechnet!
  // Staffelung: <5.4t=59.90€, <7.4t=49.90€, <11.4t=39.90€, <15.4t=31.90€, <20t=24.90€
  // Siehe berechneMindermengenpauschale() in artikelPreise.ts
};

/**
 * Lädt den Preis für einen Artikel — PRIMÄR aus der Appwrite-Artikel-Collection,
 * die Tabelle oben ist nur noch Notnagel, falls der Artikel dort fehlt oder
 * Appwrite nicht erreichbar ist.
 *
 * Bis 07/2026 war die Appwrite-Abfrage auskommentiert („TODO: später"), sodass
 * ausschließlich die hartkodierten Preise galten — die zu dem Zeitpunkt seit
 * Längerem nicht mehr stimmten (95,75 statt 98,70 €/t). Preispflege gehört in die
 * Artikelverwaltung, nicht in ein Deployment.
 *
 * @param artikelnummer - Die Artikelnummer (z.B. 'TM-PE', 'TM-ZM-02')
 * @returns Preis in EUR (0, wenn nirgends hinterlegt)
 */
export const getArtikelPreis = async (artikelnummer: string): Promise<number> => {
  try {
    const artikel = await sucheArtikelNachNummer(artikelnummer);
    if (artikel && typeof artikel.einzelpreis === 'number' && artikel.einzelpreis > 0) {
      return artikel.einzelpreis;
    }
  } catch (error) {
    console.warn(
      `Artikelstamm für ${artikelnummer} nicht erreichbar, nutze Fallback-Preis:`,
      error
    );
  }

  const fallbackPreis = ARTIKEL_PREISE_FALLBACK[artikelnummer];
  if (fallbackPreis !== undefined) {
    console.warn(
      `Kein Preis im Artikelstamm für ${artikelnummer} – Fallback ${fallbackPreis} € verwendet.`
    );
    return fallbackPreis;
  }

  console.warn(`Kein Preis für Artikel ${artikelnummer} gefunden, verwende 0`);
  return 0;
};
