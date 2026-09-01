/**
 * Mengeneinheiten für Artikel und Positionen.
 *
 * Vorher stand die Liste an zwei Stellen im Code — und war dort bereits
 * auseinandergelaufen: die Artikelverwaltung kannte m³, Std und Pkt, das
 * Lieferschein-Modal dafür Pal. Eine Einheit, die man im Artikelstamm anlegt,
 * ließ sich im Lieferschein also nicht mehr auswählen.
 *
 * „Platz" ist seit 08/2026 dabei: Instandsetzungen werden pro Tennisplatz
 * abgerechnet (Vorschlag [5]). Der Artikel ZM-FI „Instandsetzung des
 * Tennisplatzes" trägt im Stamm bis heute „Stk" — er kann jetzt umgestellt
 * werden.
 *
 * ACHTUNG bei Erweiterungen: Die Tonnage-Rechnung (`angebotsTonnage.ts`) zählt
 * ausschließlich „t" und „to". Eine neue Einheit fließt also NICHT in Fracht-
 * und Mengenberechnungen ein — das ist so gewollt, muss aber bewusst sein, wenn
 * jemand eine Gewichtseinheit ergänzt.
 */

export interface Einheit {
  /** Wert, wie er am Artikel und an der Position gespeichert wird. */
  wert: string;
  /** Beschriftung mit ausgeschriebener Bedeutung. */
  label: string;
}

export const EINHEITEN: Einheit[] = [
  { wert: 't', label: 't (Tonnen)' },
  { wert: 'kg', label: 'kg (Kilogramm)' },
  { wert: 'Stk', label: 'Stk (Stück)' },
  { wert: 'Pal', label: 'Pal (Palette)' },
  { wert: 'Platz', label: 'Platz (je Tennisplatz)' },
  { wert: 'm', label: 'm (Meter)' },
  { wert: 'm²', label: 'm² (Quadratmeter)' },
  { wert: 'm³', label: 'm³ (Kubikmeter)' },
  { wert: 'Std', label: 'Std (Stunden)' },
  { wert: 'Pkt', label: 'Pkt (Pauschal)' },
];

/**
 * Einheitenliste inklusive eines bereits gesetzten, unbekannten Werts.
 *
 * Die Einheit ist in Appwrite ein freies String-Feld ohne Enum, und mehrere
 * Belegmasken lassen sie als Text eintippen. Ohne diese Ergänzung zeigte ein
 * <select> bei so einem Wert nichts an — und beim nächsten Speichern wäre er
 * stillschweigend überschrieben.
 */
export const einheitenMit = (aktuell?: string): Einheit[] => {
  if (!aktuell || EINHEITEN.some((e) => e.wert === aktuell)) return EINHEITEN;
  return [{ wert: aktuell, label: aktuell }, ...EINHEITEN];
};
