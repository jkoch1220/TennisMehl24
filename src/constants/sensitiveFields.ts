/**
 * Bekannte sensible Felder pro Tool (D9-Startliste) — im Rollen-Editor
 * an-/abwählbar und um eigene Feld-Schlüssel erweiterbar.
 *
 * Die Schlüssel werden in Phase 4 an den Anzeigepfaden über
 * isFieldHidden(user, toolId, key) durchgesetzt (Wert wird nicht gerendert).
 */

export interface SensitiveFieldDef {
  key: string;
  label: string;
}

export const KNOWN_SENSITIVE_FIELDS: Record<string, SensitiveFieldDef[]> = {
  'projekt-verwaltung': [
    { key: 'einkaufspreis', label: 'Einkaufspreise' },
    { key: 'grosshaendlerPreisNetto', label: 'Großhändler-Preis (Netto)' },
    { key: 'db1', label: 'DB1 / Marge' },
  ],
  stammdaten: [
    { key: 'bankdaten', label: 'Bankdaten' },
    { key: 'firmendaten', label: 'Firmendaten' },
    { key: 'grosshaendlerPreisNetto', label: 'Großhändler-Preis (Netto)' },
  ],
  dashboard: [{ key: 'db1', label: 'Gewinn / DB1-Kennzahlen' }],
  /**
   * Produktion ist gestaffelt: Mitarbeiter an der Anlage erfassen ALLE drei
   * Bereiche (Rohmaterial, Mahlen, Abfüllung), sehen aber weder Auswertungen
   * noch Bestände noch die Buchungen der Kollegen. Produktionsleitung und
   * Admin sehen alles.
   */
  produktion: [
    { key: 'auswertung', label: 'Auswertung (Statistik, Trends, Prognose)' },
    { key: 'lagerbestand', label: 'Lagerbestand & Materialbilanz' },
    { key: 'fremde-buchungen', label: 'Buchungen anderer Mitarbeiter' },
  ],
};

export const getSensitiveFields = (toolId: string): SensitiveFieldDef[] =>
  KNOWN_SENSITIVE_FIELDS[toolId] ?? [];
