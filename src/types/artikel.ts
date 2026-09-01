/**
 * Warengruppe klassifiziert den Artikel fachlich. Sie ersetzt die früher im
 * Code verstreuten Artikelnummern-Heuristiken (TENNISMEHL_ARTIKEL,
 * NICHT_MATERIAL_ARTIKEL, endsWith('St'), includes('BIG') …).
 */
export type Warengruppe = 'tennismehl' | 'fracht' | 'zubehoer' | 'dienstleistung' | 'universal';

/**
 * fest       = Preis steht im Stamm und darf nicht automatisch skaliert werden
 *              (Saison-Prozentanpassung u. Ä. lassen ihn unangetastet)
 * variabel   = Stammpreis ist Ausgangspunkt, je Kunde/Angebot verhandelbar
 * kalkuliert = Preis wird zur Laufzeit berechnet (z. B. Frachtpauschale nach
 *              Tonnage-Staffel) — der Stammpreis ist nur ein Platzhalter
 */
export type PreisTyp = 'fest' | 'variabel' | 'kalkuliert';

export type Lieferart = 'lose' | 'gesackt' | 'beiladung' | 'bigbag';

export type Koernung = '0-2' | '0-3';

export const WARENGRUPPEN: Array<{ wert: Warengruppe; label: string }> = [
  { wert: 'tennismehl', label: 'Tennismehl (Ware)' },
  { wert: 'fracht', label: 'Fracht / Versand' },
  { wert: 'zubehoer', label: 'Zubehör' },
  { wert: 'dienstleistung', label: 'Dienstleistung' },
  { wert: 'universal', label: 'Universal-Sortiment' },
];

export const PREIS_TYPEN: Array<{ wert: PreisTyp; label: string }> = [
  { wert: 'variabel', label: 'variabel (Stammpreis als Ausgangspunkt)' },
  { wert: 'fest', label: 'fest (keine automatische Anpassung)' },
  { wert: 'kalkuliert', label: 'kalkuliert (Preis wird berechnet)' },
];

export const LIEFERARTEN: Array<{ wert: Lieferart; label: string }> = [
  { wert: 'lose', label: 'lose (Schüttgut)' },
  { wert: 'gesackt', label: 'gesackt (Palettenware)' },
  { wert: 'beiladung', label: 'Beiladung (Säcke auf LKW)' },
  { wert: 'bigbag', label: 'BigBag' },
];

export interface Artikel {
  $id?: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string; // z.B. 't', 'kg', 'Stk', 'm²'
  einzelpreis?: number; // Optional - kann auch weggelassen werden (Verkaufspreis)
  einkaufspreis?: number; // Optional - Einkaufspreis/direkte Kosten für DB1-Berechnung
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen

  // === Klassifizierung (Stufe 1 Artikelverwaltung, 08/2026) ===
  // Alle optional, weil Bestandsdokumente sie erst nach dem Befüll-Skript
  // tragen; Konsumenten müssen null als „nicht klassifiziert" behandeln.
  warengruppe?: Warengruppe | null;
  /** Zählt dieser Artikel in die Saison-Tonnage? Ersetzt die Einheiten-Heuristik. */
  istTonnageRelevant?: boolean | null;
  preisTyp?: PreisTyp | null;
  /** Einheit, mit der Positionen dieses Artikels angelegt werden dürfen. Wird beim Speichern mit `einheit` synchron gehalten. */
  erlaubteEinheit?: string | null;
  /** Für Stück-Artikel mit Gewicht (z. B. 40-kg-Sack): Umrechnung Stück → Tonnen. */
  gewichtProStueckKg?: number | null;
  lieferart?: Lieferart | null;
  koernung?: Koernung | null;
  /** false = archiviert: bleibt für Altbelege lesbar, taucht aber nicht mehr in Auswahllisten auf. */
  aktiv?: boolean | null;

  erstelltAm?: string;
  aktualisiertAm?: string;
}

export interface ArtikelInput {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string;
  // Preisfelder: null = Wert in Appwrite LÖSCHEN (Feld wurde geleert),
  // undefined = Feld nicht anfassen. JSON.stringify verwirft undefined —
  // ein geleertes Feld muss deshalb als null gesendet werden, sonst bleibt
  // der alte Preis stehen.
  einzelpreis?: number | null; // Verkaufspreis; leer = „auf Anfrage"
  einkaufspreis?: number | null; // Einkaufspreis/direkte Kosten für DB1-Berechnung
  streichpreis?: number | null; // durchgestrichener Originalpreis für Rabattaktionen

  warengruppe?: Warengruppe | null;
  istTonnageRelevant?: boolean;
  preisTyp?: PreisTyp | null;
  gewichtProStueckKg?: number | null;
  lieferart?: Lieferart | null;
  koernung?: Koernung | null;
}
