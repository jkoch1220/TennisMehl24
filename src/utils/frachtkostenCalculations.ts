/**
 * Berechnet die Frachtkostenpauschale basierend auf der Tonnage
 *
 * Staffelung:
 * - weniger als 5,4 to = 59,90 €
 * - von 5,4 to bis 7,4 to = 49,90 €
 * - von 7,5 bis 11,4 to = 39,90 €
 * - von 11,5 bis 15,4 to = 31,90 €
 * - von 15,5 bis 19,9 to = 24,90 €
 * - ab 20 to = 0,00 € (keine Frachtkostenpauschale)
 */
export function berechneFrachtkostenpauschale(tonnen: number): number {
  if (tonnen <= 0) {
    return 59.90; // Mindestpreis wenn keine Menge angegeben
  }

  if (tonnen < 5.4) {
    return 59.90;
  } else if (tonnen <= 7.4) {
    return 49.90;
  } else if (tonnen <= 11.4) {
    return 39.90;
  } else if (tonnen <= 15.4) {
    return 31.90;
  } else if (tonnen <= 19.9) {
    return 24.90;
  } else {
    // Ab 20 Tonnen keine Frachtkostenpauschale
    return 0;
  }
}

/**
 * Gibt die Staffelung als Text zurück für die Anzeige
 */
export function getFrachtkostenStaffelText(tonnen: number): string {
  if (tonnen < 5.4) {
    return 'unter 5,4t';
  } else if (tonnen <= 7.4) {
    return '5,4t - 7,4t';
  } else if (tonnen <= 11.4) {
    return '7,5t - 11,4t';
  } else if (tonnen <= 15.4) {
    return '11,5t - 15,4t';
  } else if (tonnen <= 19.9) {
    return '15,5t - 19,9t';
  } else {
    return 'ab 20t (entfällt)';
  }
}

// Artikelnummer für die Frachtkostenpauschale
export const FRACHTKOSTENPAUSCHALE_ARTIKELNUMMER = 'TM-FP';
