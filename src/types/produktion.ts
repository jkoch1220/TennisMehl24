/**
 * Produktions-Erfassung — Datenmodell
 * ============================================================================
 *
 * Das Tool erfasst DREI Bereiche entlang des Materialflusses:
 *
 *   Rohmaterial  →  Mahlen  →  Abfüllung
 *   (Ziegelschutt   (Ziegelmehl   (Paletten, BigBags,
 *    kommt an)       lose)         Einzelsäcke)
 *
 * Bis 09/2026 gab es nur „Mahlen": ein einziges Appwrite-Dokument
 * (`produktion_eintraege/produktion_verlauf`) mit einem JSON-String aller
 * Einträge. Das Feld ist auf 100.000 Zeichen deklariert, die Zeile selbst aber
 * auf 65.535 Bytes — bei ~130 Bytes je Eintrag wäre nach rund 450 Buchungen
 * ohne Vorwarnung Schluss gewesen. Seit 09/2026 ist jede Buchung ein eigenes
 * Dokument in `produktion_buchungen`; die Alt-Einträge wurden migriert
 * (scripts/migriere-produktion-buchungen.mjs).
 */

// ---------------------------------------------------------------------------
// Bereiche
// ---------------------------------------------------------------------------

export type ProduktionsBereich = 'rohmaterial' | 'mahlen' | 'abfuellung';

export interface BereichDef {
  wert: ProduktionsBereich;
  label: string;
  kurz: string;
  /** Was in diesem Bereich gezählt wird — steht als Untertitel in der Erfassung. */
  beschreibung: string;
  /** Tailwind-Gradient für Kacheln/Chips */
  farbe: string;
  /** Einzelne Tailwind-Akzentfarbe (Text, Ringe) */
  akzent: string;
}

export const BEREICHE: BereichDef[] = [
  {
    wert: 'rohmaterial',
    label: 'Rohmaterial',
    kurz: 'Schutt',
    beschreibung: 'Angelieferter Ziegelschutt',
    farbe: 'from-stone-500 to-stone-700',
    akzent: 'stone',
  },
  {
    wert: 'mahlen',
    label: 'Mahlen',
    kurz: 'Mehl',
    beschreibung: 'Produziertes Ziegelmehl, lose',
    farbe: 'from-orange-500 to-amber-600',
    akzent: 'orange',
  },
  {
    wert: 'abfuellung',
    label: 'Abfüllung',
    kurz: 'Gebinde',
    beschreibung: 'Paletten, BigBags und Säcke',
    farbe: 'from-sky-500 to-indigo-600',
    akzent: 'sky',
  },
];

export const getBereich = (wert: ProduktionsBereich): BereichDef =>
  BEREICHE.find((b) => b.wert === wert) ?? BEREICHE[1];

// ---------------------------------------------------------------------------
// Körnung
// ---------------------------------------------------------------------------

/**
 * Die verkauften Körnungen — identisch mit `Koernung` aus types/artikel.ts,
 * damit Produktion und Artikelstamm dieselbe Sprache sprechen.
 */
export type ProduktKoernung = '0-2' | '0-3';

/**
 * Alt-Werte aus der ersten Fassung des Trackers (bis 09/2026). Sie beschreiben
 * eine grobe Feinheit, keine verkaufbare Körnung, und werden NICHT auf 0/2/0/3
 * umgedeutet — geraten wäre schlimmer als unbekannt. Neue Buchungen benutzen
 * sie nicht mehr; in Auswertungen erscheinen sie als „Alt: …".
 */
export type LegacyKoernung = 'fein' | 'fein_grob' | 'mittel' | 'grob';

export type Koernung = ProduktKoernung | LegacyKoernung;

export interface KoernungDef {
  value: Koernung;
  label: string;
  /** Kurzform für enge Stellen (Chips, Tabellen) */
  kurz: string;
  color: string;
  /** true = Altbestand, nicht mehr auswählbar */
  legacy?: boolean;
}

/** Auswählbare Körnungen für neue Buchungen. */
export const PRODUKT_KOERNUNGEN: KoernungDef[] = [
  { value: '0-2', label: '0/2 mm', kurz: '0/2', color: 'from-amber-400 to-orange-500' },
  { value: '0-3', label: '0/3 mm', kurz: '0/3', color: 'from-rose-500 to-red-600' },
];

/** Nur noch zum Anzeigen von Altbestand. */
export const LEGACY_KOERNUNGEN: KoernungDef[] = [
  { value: 'fein', label: 'Alt: Fein', kurz: 'fein', color: 'from-amber-300 to-amber-400', legacy: true },
  { value: 'fein_grob', label: 'Alt: Fein-Grob', kurz: 'fein-grob', color: 'from-orange-300 to-orange-400', legacy: true },
  { value: 'mittel', label: 'Alt: Mittel', kurz: 'mittel', color: 'from-red-300 to-red-400', legacy: true },
  { value: 'grob', label: 'Alt: Grob', kurz: 'grob', color: 'from-rose-400 to-rose-500', legacy: true },
];

export const ALLE_KOERNUNGEN: KoernungDef[] = [...PRODUKT_KOERNUNGEN, ...LEGACY_KOERNUNGEN];

export const getKoernung = (wert: Koernung | null | undefined): KoernungDef | null =>
  wert ? ALLE_KOERNUNGEN.find((k) => k.value === wert) ?? null : null;

/**
 * @deprecated Ersetzt durch PRODUKT_KOERNUNGEN. Bleibt exportiert, weil die
 * öffentliche Erfassungsseite (PublicProduktion) und Altcode darauf zeigen.
 */
export const KOERNUNGEN = PRODUKT_KOERNUNGEN;

// ---------------------------------------------------------------------------
// Gebinde (Abfüllung)
// ---------------------------------------------------------------------------

export type Gebinde = 'palette' | 'bigbag' | 'sack';

export interface GebindeDef {
  wert: Gebinde;
  label: string;
  /** Mehrzahl, ausgeschrieben. Eine Regel („+n" bzw. „+s") liefert für
   *  „Einzelsack" ein „Einzelsacks" — deutsche Plurale werden gepflegt, nicht
   *  gerechnet. */
  mehrzahl: string;
  kurz: string;
  /** Wie sich ein Gebinde zusammensetzt — steht als Untertitel am Auswahlfeld. */
  aufbau: string;
  /**
   * Nettogewicht EINES Gebindes in Kilogramm. Grundlage der automatischen
   * Tonnage: `tonnen = anzahl * kiloProEinheit / 1000`.
   *
   * Belegt gegen den Artikelstamm: eine Palette Sackware sind 25 Säcke à 40 kg
   * (siehe constants/stuecklisten.ts → TM-ZM-02St), ein BigBag fasst rund
   * 1.000 kg (TM-ZM-BIG-02: „BigBag (ca. 1000kg)"), ein Einzelsack 40 kg
   * (TM-ZM-02S, gewichtProStueckKg: 40).
   */
  kiloProEinheit: number;
  /** Nur für Paletten/BigBags: Anzahl Säcke je Gebinde (Anzeige). */
  saeckeProEinheit?: number;
  farbe: string;
}

export const GEBINDE_ARTEN: GebindeDef[] = [
  {
    wert: 'palette',
    label: 'Palette',
    mehrzahl: 'Paletten',
    kurz: 'Pal.',
    aufbau: '25 Säcke × 40 kg = 1,0 t',
    kiloProEinheit: 1000,
    saeckeProEinheit: 25,
    farbe: 'from-sky-500 to-blue-600',
  },
  {
    wert: 'bigbag',
    label: 'BigBag',
    mehrzahl: 'BigBags',
    kurz: 'BB',
    aufbau: 'ca. 1.000 kg je Sack',
    kiloProEinheit: 1000,
    farbe: 'from-indigo-500 to-violet-600',
  },
  {
    wert: 'sack',
    label: 'Einzelsack',
    mehrzahl: 'Einzelsäcke',
    kurz: 'Sack',
    aufbau: '40 kg',
    kiloProEinheit: 40,
    farbe: 'from-teal-500 to-emerald-600',
  },
];

export const getGebinde = (wert: Gebinde | null | undefined): GebindeDef | null =>
  wert ? GEBINDE_ARTEN.find((g) => g.wert === wert) ?? null : null;

/**
 * Stückzahl → Tonnen. Bewusst auf drei Nachkommastellen gerundet: ein
 * Einzelsack sind 0,04 t, und Fließkomma-Summen aus 40/1000 laufen sonst als
 * 12,000000000000002 durch die Auswertung.
 */
export const gebindeInTonnen = (gebinde: Gebinde, anzahl: number): number => {
  const def = getGebinde(gebinde);
  if (!def || !Number.isFinite(anzahl)) return 0;
  return Math.round(((anzahl * def.kiloProEinheit) / 1000) * 1000) / 1000;
};

// ---------------------------------------------------------------------------
// Buchung
// ---------------------------------------------------------------------------

/** Woher die Buchung stammt — für Nachvollziehbarkeit im Verlauf. */
export type BuchungsQuelle = 'portal' | 'oeffentlich' | 'migration';

export interface ProduktionsBuchung {
  $id: string;
  bereich: ProduktionsBereich;
  /** YYYY-MM-DD — der Produktionstag, nicht der Erfassungszeitpunkt. */
  datum: string;
  /** ISO-DateTime der Erfassung (bei Nacherfassung: 12:00 des Produktionstags). */
  zeitpunkt: string;
  /** Maßgebliche Tonnage. Bei Gebinden aus Stückzahl × Gebindegewicht berechnet. */
  tonnen: number;

  /** Mahlen und Abfüllung: welche Körnung. Rohmaterial: null. */
  koernung?: Koernung | null;

  // --- Rohmaterial ---
  lieferant?: string | null;
  kennzeichen?: string | null;
  wiegeschein?: string | null;

  // --- Abfüllung ---
  gebinde?: Gebinde | null;
  /** Stückzahl der Gebinde (Paletten / BigBags / Säcke). */
  gebindeAnzahl?: number | null;

  notiz?: string | null;

  // --- Nachvollziehbarkeit ---
  erfasstVonId?: string | null;
  erfasstVonName?: string | null;
  quelle?: BuchungsQuelle | null;

  /**
   * Stornieren statt Löschen: eine Buchung, die einmal den Lagerbestand
   * bewegt hat, verschwindet nicht spurlos. Stornierte Buchungen zählen in
   * keiner Auswertung mit, bleiben im Verlauf aber sichtbar.
   */
  storniert: boolean;
  storniertVonName?: string | null;
  storniertAm?: string | null;
  storniertGrund?: string | null;

  /**
   * Im Browser erzeugter Schlüssel, der die Buchung eindeutig macht, BEVOR sie
   * gesendet wird. Trägt die Idempotenz beim Nachsenden aus der Warteschlange:
   * eine Buchung, die beim Verbindungsabbruch schon angekommen war, läuft beim
   * zweiten Versuch in einen Unique-Konflikt statt ein zweites Mal zu landen.
   */
  clientId?: string | null;
  /** false = die Buchung steht, der Lagerbestand wurde aber NICHT fortgeschrieben. */
  lagerGebucht?: boolean;
  /** Bei einer Korrekturbuchung: die stornierte Buchung, die sie ersetzt. */
  ersetztBuchungId?: string | null;
  /** Erkannte Wiegeschein-Dublette wurde bewusst gebucht. */
  dublettenBestaetigt?: boolean;

  erstelltAm?: string;
}

/** Eingabe für eine neue Buchung. Die Tonnage berechnet der Service. */
export interface BuchungsEingabe {
  bereich: ProduktionsBereich;
  datum: string;
  /** Direkt eingegebene Tonnen (Rohmaterial, Mahlen). */
  tonnen?: number;
  koernung?: Koernung | null;
  lieferant?: string | null;
  kennzeichen?: string | null;
  wiegeschein?: string | null;
  gebinde?: Gebinde | null;
  gebindeAnzahl?: number | null;
  notiz?: string | null;
  quelle?: BuchungsQuelle;
  /** Vorab erzeugter Idempotenz-Schlüssel (siehe ProduktionsBuchung.clientId). */
  clientId?: string;
  ersetztBuchungId?: string | null;
  dublettenBestaetigt?: boolean;
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export interface TagesWert {
  datum: string;
  rohmaterial: number;
  mahlen: number;
  abfuellung: number;
}

export interface BereichsKennzahlen {
  heute: number;
  dieseWoche: number;
  letzteWoche: number;
  dieserMonat: number;
  letzterMonat: number;
  gesamt: number;
  durchschnittProTag: number;
  produktiveTage: number;
  besterTag: { datum: string; tonnen: number };
  trend7Tage: number;
}

/**
 * Materialbilanz — die Frage, die ein Produktionsbetrieb wirklich stellt:
 * wie viel Mehl kommt aus einer Tonne Schutt, und wie viel davon geht in
 * Gebinde?
 */
export interface Materialbilanz {
  rohmaterialTonnen: number;
  gemahlenTonnen: number;
  abgefuelltTonnen: number;
  /** gemahlen / rohmaterial — null, wenn kein Rohmaterial erfasst ist. */
  ausbeute: number | null;
  /** abgefüllt / gemahlen — Anteil der Produktion, der in Gebinde geht. */
  abfuellQuote: number | null;
}

// ---------------------------------------------------------------------------
// Altbestand (bis 09/2026) — nur noch für die Migration
// ---------------------------------------------------------------------------

/** @deprecated Struktur des alten JSON-Verlaufs. */
export interface ProduktionsEintrag {
  id?: string;
  datum: string;
  tonnen: number;
  koernung: Koernung;
  zeitpunkt: string;
  notiz?: string;
}

/** @deprecated Struktur des alten JSON-Verlaufs. */
export interface ProduktionsVerlauf {
  eintraege: ProduktionsEintrag[];
  letzteAktualisierung?: string;
}
