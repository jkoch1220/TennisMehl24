/**
 * Vordefinierte Stücklisten für Quick-Add im Angebot
 *
 * Jede Stückliste enthält Artikelnummern, die aus der Artikeldatenbank geladen werden.
 * Artikel die nicht gefunden werden, werden übersprungen.
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
      { artikelnummer: 'TM-ZM-02', mengeAusProjekt: 'angefragteMenge' }, // Tennissand 0/2
      { artikelnummer: 'TM-PE-FOLIE', menge: 1 }, // PE Folie
      { artikelnummer: 'TM-MMP', menge: 1 }, // Mindermengenpauschale
    ],
  },
  {
    id: 'bigbag',
    name: 'BigBag Lieferung',
    beschreibung: 'BigBag Sand mit Palette und Fracht',
    kategorie: 'lieferung',
    positionen: [
      { artikelnummer: 'TM-BB-SAND', mengeAusProjekt: 'angefragteMenge' }, // BigBag Sand
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
      { artikelnummer: 'TM-SW-SAND', mengeAusProjekt: 'angefragteMenge' }, // Sackware Sand
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
      { artikelnummer: 'TM-ANFAHRT', menge: 1 }, // Anfahrt/Abfahrt
      { artikelnummer: 'TM-INST-PLATZ', menge: 1 }, // Instandsetzung Platz
      { artikelnummer: 'TM-ZUSATZ', menge: 1 }, // Zusatzarbeiten
      { artikelnummer: 'TM-ZM-02', mengeAusProjekt: 'angefragteMenge' }, // Sand 0/2
      { artikelnummer: 'TM-PE-FOLIE', menge: 1 }, // PE Folie
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
