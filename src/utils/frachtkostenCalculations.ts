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
/** Eine Stufe der Frachtkostenpauschale. `bis` ist einschließlich, null = offen. */
export interface Frachtstufe {
  /** Obergrenze in Tonnen, einschließlich; null bei der letzten Stufe. */
  bis: number | null;
  preis: number;
  /** Beschriftung für Belege und Masken. */
  text: string;
}

/**
 * Die Staffel als Daten — eine Quelle für Berechnung UND Anzeige (09/2026).
 *
 * Vorher stand sie dreimal da: als if-Kette, als Textfunktion und als
 * handgeschriebener Fließtext in den Angebotsvorlagen („unter 5,4 t 59,90 € ·
 * 5,4–7,4 t 49,90 € · …"). Auf dem Beleg war dieser Satz unlesbar, und jede
 * Preisänderung hätte an drei Stellen gepflegt werden müssen.
 *
 * ACHTUNG, Grenzsemantik ist historisch uneinheitlich: Die erste Stufe gilt
 * UNTER 5,4 t, alle weiteren BIS EINSCHLIESSLICH ihrer Obergrenze. Das bleibt
 * so — die Beträge stehen in versandten Angeboten.
 */
export const FRACHTKOSTEN_STAFFEL: Frachtstufe[] = [
  { bis: 5.4, preis: 59.9, text: 'unter 5,4 t' },
  { bis: 7.4, preis: 49.9, text: '5,4 – 7,4 t' },
  { bis: 11.4, preis: 39.9, text: '7,5 – 11,4 t' },
  { bis: 15.4, preis: 31.9, text: '11,5 – 15,4 t' },
  { bis: 19.9, preis: 24.9, text: '15,5 – 19,9 t' },
  { bis: null, preis: 0, text: 'ab 20 t' },
];

export function berechneFrachtkostenpauschale(tonnen: number): number {
  if (tonnen <= 0) {
    return FRACHTKOSTEN_STAFFEL[0].preis; // Mindestpreis wenn keine Menge angegeben
  }

  // Erste Stufe: UNTER ihrer Grenze. Alle weiteren: bis einschließlich.
  if (tonnen < (FRACHTKOSTEN_STAFFEL[0].bis as number)) return FRACHTKOSTEN_STAFFEL[0].preis;
  const stufe = FRACHTKOSTEN_STAFFEL.slice(1).find((s) => s.bis === null || tonnen <= s.bis);
  return stufe ? stufe.preis : 0;
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
