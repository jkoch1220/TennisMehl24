/**
 * Artikel-Konstanten für das Anfragen-Tool
 *
 * Diese Datei definiert alle verfügbaren Tennismehl-Artikel mit ihren Werkspreisen.
 * Die Werkspreise werden für die automatische Angebotserstellung verwendet.
 *
 * WICHTIG: Beiladung-Artikel (TM-ZM-02S, TM-ZM-03S) werden verwendet wenn:
 * - Sackware zusammen mit losem Material bestellt wird UND
 * - die Sackware-Menge unter 1 Tonne liegt
 * → Dann wird die Sackware als "Beiladung" mit dem Schüttgut transportiert
 */

export interface ArtikelDefinition {
  artikelnummer: string;
  bezeichnung: string;
  einheit: 't' | 'Stk';
  werkspreis: number | null; // null = aus Stammdaten laden
  lieferart?: 'lose' | 'gesackt' | 'beiladung';
  koernung?: '0-2' | '0-3';
  pflichtBeiLose?: boolean;
  gewichtProStueckKg?: number; // Gewicht pro Sack in kg (für Sackware)
}

/**
 * Alle verfügbaren Tennismehl-Artikel
 */
export const TENNISMEHL_ARTIKEL: Record<string, ArtikelDefinition> = {
  // ==========================================
  // LOSES MATERIAL (Schüttgut)
  // ==========================================
  'TM-ZM-02': {
    artikelnummer: 'TM-ZM-02',
    bezeichnung: 'Tennismehl 0/2 mm lose',
    einheit: 't',
    werkspreis: 95.75, // €/t
    lieferart: 'lose',
    koernung: '0-2',
  },
  'TM-ZM-03': {
    artikelnummer: 'TM-ZM-03',
    bezeichnung: 'Tennismehl 0/3 mm lose',
    einheit: 't',
    werkspreis: 95.75, // €/t (gleicher Preis wie 0-2)
    lieferart: 'lose',
    koernung: '0-3',
  },

  // ==========================================
  // SACKWARE (regulär per Spedition Raben)
  // WICHTIG: Preis pro TONNE (nicht pro Sack!)
  // Diese Artikel werden bei ≥1t Sackware ODER bei reiner Sackware ohne Schüttgut verwendet
  // ==========================================
  'TM-ZM-02St': {
    artikelnummer: 'TM-ZM-02St',
    bezeichnung: 'Tennismehl 0/2 mm gesackt',
    einheit: 't', // TONNEN, nicht Stück!
    werkspreis: null, // WICHTIG: Preis aus Stammdaten laden! (145€/t)
    lieferart: 'gesackt',
    koernung: '0-2',
  },
  'TM-ZM-03St': {
    artikelnummer: 'TM-ZM-03St',
    bezeichnung: 'Tennismehl 0/3 mm gesackt',
    einheit: 't', // TONNEN, nicht Stück!
    werkspreis: null, // WICHTIG: Preis aus Stammdaten laden! (145€/t)
    lieferart: 'gesackt',
    koernung: '0-3',
  },

  // ==========================================
  // BEILADUNG (Sackware < 1t MIT Schüttgut!)
  // Wird per LKW zusammen mit losem Material geliefert
  // WICHTIG: Preis pro SACK (40kg), da einzelne Säcke auf den LKW geladen werden
  // ==========================================
  'TM-ZM-02S': {
    artikelnummer: 'TM-ZM-02S',
    bezeichnung: 'Tennismehl 0/2 mm gesackt - Beiladung (40kg Säcke)',
    einheit: 'Stk', // STÜCK = einzelne 40kg Säcke
    werkspreis: null, // WICHTIG: Preis aus Stammdaten laden! (8.50€/Sack)
    lieferart: 'beiladung',
    koernung: '0-2',
    gewichtProStueckKg: 40,
  },
  'TM-ZM-03S': {
    artikelnummer: 'TM-ZM-03S',
    bezeichnung: 'Tennismehl 0/3 mm gesackt - Beiladung (40kg Säcke)',
    einheit: 'Stk', // STÜCK = einzelne 40kg Säcke
    werkspreis: null, // WICHTIG: Preis aus Stammdaten laden! (8.50€/Sack)
    lieferart: 'beiladung',
    koernung: '0-3',
    gewichtProStueckKg: 40,
  },

  // ==========================================
  // BIGBAG (Großsäcke auf Palette, per Spedition)
  // Werden wie Palettenware per Spedition geliefert
  // ==========================================
  'TM-ZM-BIG-02': {
    artikelnummer: 'TM-ZM-BIG-02',
    bezeichnung: 'Tennismehl 0/2 mm BigBag (ca. 1000kg)',
    einheit: 't',
    werkspreis: null, // Preis aus Stammdaten laden
    lieferart: 'gesackt', // Wird wie Sackware behandelt (Spedition)
    koernung: '0-2',
  },
  'TM-ZM-BIG-03': {
    artikelnummer: 'TM-ZM-BIG-03',
    bezeichnung: 'Tennismehl 0/3 mm BigBag (ca. 1000kg)',
    einheit: 't',
    werkspreis: null, // Preis aus Stammdaten laden
    lieferart: 'gesackt', // Wird wie Sackware behandelt (Spedition)
    koernung: '0-3',
  },

  // ==========================================
  // PE-FOLIE (Pflicht bei losem Material!)
  // ==========================================
  'TM-PE': {
    artikelnummer: 'TM-PE',
    bezeichnung: 'PE-Folie für Abdeckung',
    einheit: 'Stk',
    werkspreis: null, // WICHTIG: Preis aus Stammdaten laden!
    pflichtBeiLose: true,
  },

  // ==========================================
  // FRACHTKOSTENPAUSCHALE / MINDERMENGENPAUSCHALE
  // Wird automatisch bei Schüttgut < 20t hinzugefügt
  // ==========================================
  'TM-FP': {
    artikelnummer: 'TM-FP',
    bezeichnung: 'Frachtkostenpauschale',
    einheit: 'Stk',
    werkspreis: null, // Preis wird dynamisch nach Tonnage berechnet!
  },

  // ==========================================
  // EINWEGPALETTE (für Sackware/BigBag)
  // ==========================================
  'TM-PAL': {
    artikelnummer: 'TM-PAL',
    bezeichnung: 'Einwegpalette',
    einheit: 'Stk',
    werkspreis: null, // Preis aus Stammdaten laden
  },
};

// ==========================================
// HILFSFUNKTIONEN
// ==========================================

/**
 * Findet den passenden Artikel anhand Körnung und Lieferart
 *
 * @param koernung - '0-2' oder '0-3'
 * @param lieferart - 'lose', 'gesackt' oder 'beiladung'
 * @returns ArtikelDefinition oder undefined
 */
export function findeArtikel(
  koernung: '0-2' | '0-3',
  lieferart: 'lose' | 'gesackt' | 'beiladung'
): ArtikelDefinition | undefined {
  let suffix: string;

  switch (lieferart) {
    case 'lose':
      suffix = '';
      break;
    case 'gesackt':
      suffix = 'St';
      break;
    case 'beiladung':
      suffix = 'S';
      break;
    default:
      return undefined;
  }

  const artikelnummer = koernung === '0-2'
    ? `TM-ZM-02${suffix}`
    : `TM-ZM-03${suffix}`;

  return TENNISMEHL_ARTIKEL[artikelnummer];
}

/**
 * Bestimmt, ob Sackware als Beiladung transportiert werden soll
 *
 * REGEL: Sackware wird als Beiladung transportiert wenn:
 * 1. Es auch loses Material in der Bestellung gibt UND
 * 2. Die Sackware-Menge unter 1 Tonne liegt
 *
 * @param mengeSackwareTonnen - Menge der Sackware in Tonnen
 * @param mengeLoseTonnen - Menge des losen Materials in Tonnen
 * @returns true wenn als Beiladung, false wenn per Spedition
 */
export function istBeiladung(
  mengeSackwareTonnen: number,
  mengeLoseTonnen: number
): boolean {
  // Beiladung nur wenn:
  // 1. Es überhaupt loses Material gibt (> 0)
  // 2. Sackware unter 1 Tonne
  return mengeLoseTonnen > 0 && mengeSackwareTonnen > 0 && mengeSackwareTonnen < 1;
}

/**
 * Bestimmt die richtige Artikelnummer für Sackware basierend auf Bestellkontext
 *
 * @param koernung - '0-2' oder '0-3'
 * @param mengeSackwareTonnen - Menge der Sackware in Tonnen
 * @param mengeLoseTonnen - Menge des losen Materials in Tonnen
 * @returns Artikelnummer (z.B. 'TM-ZM-02St' oder 'TM-ZM-02S')
 */
export function ermittleSackwareArtikelnummer(
  koernung: '0-2' | '0-3',
  mengeSackwareTonnen: number,
  mengeLoseTonnen: number
): string {
  const beiladung = istBeiladung(mengeSackwareTonnen, mengeLoseTonnen);
  const suffix = beiladung ? 'S' : 'St';

  return koernung === '0-2'
    ? `TM-ZM-02${suffix}`
    : `TM-ZM-03${suffix}`;
}

/**
 * Konstanten für Sackware
 */
export const SACKWARE = {
  GEWICHT_PRO_SACK_KG: 40, // Ein Sack wiegt 40kg
} as const;

/**
 * Berechnet die Anzahl der Säcke aus Tonnage
 * Rundet immer AUF (man kann keine halben Säcke verkaufen)
 *
 * @param tonnen - Menge in Tonnen
 * @returns Anzahl Säcke (aufgerundet)
 */
export function berechneAnzahlSaecke(tonnen: number): number {
  const gewichtKg = tonnen * 1000;
  return Math.ceil(gewichtKg / SACKWARE.GEWICHT_PRO_SACK_KG);
}

/**
 * Konstanten für die Lieferberechnung
 */
export const LIEFERUNG = {
  // Stundensatz für Fremdlieferung (LKW)
  FREMDLIEFERUNG_STUNDENSATZ: 108, // €/Stunde

  // Standardzeiten
  BELADEZEIT_MINUTEN: 30,
  ABLADEZEIT_MINUTEN: 30,

  // Ausgangsort (Marktheidenfeld)
  AUSGANGS_PLZ: '97828',
} as const;

/**
 * Staffelung der Mindermengenpauschale (Frachtkostenpauschale) für Schüttgut
 *
 * Bei Schüttgut unter 20 Tonnen wird eine Mindermengenpauschale berechnet.
 * Je größer die Menge, desto geringer die Pauschale.
 */
export const MINDERMENGENPAUSCHALE_STAFFELUNG = [
  { bisTo: 5.4, pauschale: 59.90 },   // weniger als 5,4 to
  { bisTo: 7.4, pauschale: 49.90 },   // von 5,4 to bis 7,4 to
  { bisTo: 11.4, pauschale: 39.90 },  // von 7,5 to bis 11,4 to
  { bisTo: 15.4, pauschale: 31.90 },  // von 11,5 bis 15,4 to
  { bisTo: 19.9, pauschale: 24.90 },  // von 15,5 bis 19,9 to
  // Ab 20 to: keine Pauschale
] as const;

/**
 * Berechnet die Mindermengenpauschale für Schüttgut basierend auf der Gesamtmenge
 *
 * @param tonnenSchuettgut - Gesamtmenge Schüttgut (loses Material) in Tonnen
 * @returns Pauschale in EUR oder null wenn keine Pauschale fällig (ab 20t)
 */
export function berechneMindermengenpauschale(tonnenSchuettgut: number): number | null {
  // Keine Pauschale bei 0 oder negativer Menge
  if (tonnenSchuettgut <= 0) {
    return null;
  }

  // Ab 20 Tonnen: keine Pauschale
  if (tonnenSchuettgut >= 20) {
    return null;
  }

  // Finde die passende Staffel
  for (const staffel of MINDERMENGENPAUSCHALE_STAFFELUNG) {
    if (tonnenSchuettgut < staffel.bisTo) {
      return staffel.pauschale;
    }
  }

  // Zwischen 15.4 und 19.9 to (letzte Staffel)
  if (tonnenSchuettgut < 20) {
    return 24.90;
  }

  return null;
}
