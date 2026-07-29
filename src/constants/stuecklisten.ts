/**
 * Vordefinierte Stücklisten für Quick-Add im Angebot
 *
 * Jede Stückliste enthält Artikelnummern, die aus der Artikeldatenbank geladen werden.
 * Artikel die nicht gefunden werden, werden übersprungen — sie fehlen dann im Angebot.
 *
 * ACHTUNG: Bis 07/2026 standen hier sieben Artikelnummern, die es im Artikelstamm
 * NIE gegeben hat (TM-PE-FOLIE, TM-MMP, TM-BB-SAND, TM-SW-SAND, TM-ANFAHRT,
 * TM-INST-PLATZ, TM-ZUSATZ). Folge: „BigBag Lieferung" und „Sackware Lieferung"
 * fügten ihr Hauptprodukt gar nicht ein, „Frühjahrs-Instandsetzung" nur 2 von 6
 * Positionen — gemeldet lediglich in einem Toast, der nach 3 Sekunden verschwand.
 * Jede Nummer hier MUSS im Artikelstamm existieren.
 */

export interface StuecklistenPosition {
  artikelnummer: string;
  menge?: number; // Default: 1
  mengeAusProjekt?: 'angefragteMenge'; // Optional: Menge aus Projekt übernehmen
}

export interface Stueckliste {
  id: string;
  name: string;
  beschreibung: string;
  kategorie: 'lieferung' | 'instandsetzung';
  positionen: StuecklistenPosition[];
}

export const STUECKLISTEN: Stueckliste[] = [
  // === LIEFERUNG ===
  {
    id: 'ziegelmehl-schuettgut',
    name: 'Ziegelmehl Schüttgut',
    beschreibung: 'Normale Schüttgut-Lieferung mit Sand, Folie und Frachtkostenpauschale',
    kategorie: 'lieferung',
    positionen: [
      { artikelnummer: 'TM-ZM-02', mengeAusProjekt: 'angefragteMenge' }, // Tennismehl 0/2 Schüttgut
      { artikelnummer: 'TM-PE', menge: 1 }, // PE-Folie zum Abdecken und Unterlegen
      { artikelnummer: 'TM-FP', menge: 1 }, // Frachtkostenpauschale
    ],
  },
  {
    id: 'bigbag',
    name: 'BigBag Lieferung',
    beschreibung: 'BigBag Sand mit Palette und Fracht',
    kategorie: 'lieferung',
    positionen: [
      { artikelnummer: 'TM-ZM-BIG-02', mengeAusProjekt: 'angefragteMenge' }, // Tennismehl 0/2 im BigBag
      { artikelnummer: 'TM-PAL', menge: 1 }, // Palette
      { artikelnummer: 'TM-FP', menge: 1 }, // Frachtkostenpauschale
    ],
  },
  {
    id: 'sackware',
    name: 'Sackware Lieferung',
    beschreibung: 'Sackware mit Palette und Fracht',
    kategorie: 'lieferung',
    positionen: [
      { artikelnummer: 'TM-ZM-02St', mengeAusProjekt: 'angefragteMenge' }, // Sackware 0/2, 25×40 kg
      { artikelnummer: 'TM-PAL', menge: 1 }, // Palette
      { artikelnummer: 'TM-FP', menge: 1 }, // Frachtkostenpauschale
    ],
  },

  // === INSTANDSETZUNG ===
  {
    id: 'fruehjahrs-instandsetzung',
    name: 'Frühjahrs-Instandsetzung',
    beschreibung: 'Komplette Frühjahrs-Instandsetzung mit Anfahrt, Arbeiten, Sand und Folie',
    kategorie: 'instandsetzung',
    positionen: [
      { artikelnummer: 'ZM-FI-A', menge: 1 }, // An- und Abfahrt der Geräte und Kolonne
      { artikelnummer: 'ZM-FI', menge: 1 }, // Instandsetzung des Tennisplatzes
      // OFFEN: ZM-FA (58,95 €/Std) vs. TM-ZSH (58,50 €/Std) — beide im Stamm, beide
      // im Einsatz. ZM-FA gewinnt vorerst, weil deutlich häufiger verwendet.
      { artikelnummer: 'ZM-FA', menge: 1 }, // Facharbeiter für Zusatzarbeiten
      { artikelnummer: 'TM-ZM-02', mengeAusProjekt: 'angefragteMenge' }, // Tennismehl 0/2 Schüttgut
      { artikelnummer: 'TM-PE', menge: 1 }, // PE-Folie zum Abdecken und Unterlegen
      { artikelnummer: 'TM-FP', menge: 1 }, // Frachtkostenpauschale
    ],
  },
];

// Helper: Stücklisten nach Kategorie gruppieren
export const getStuecklistenNachKategorie = () => {
  return {
    lieferung: STUECKLISTEN.filter(s => s.kategorie === 'lieferung'),
    instandsetzung: STUECKLISTEN.filter(s => s.kategorie === 'instandsetzung'),
  };
};
