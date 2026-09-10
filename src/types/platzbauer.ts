import { ProjektStatus } from './projekt';
import { SaisonKunde, SaisonKundeMitDaten } from './saisonplanung';

// ==================== PLATZBAUER-PROJEKT TYPES ====================

// Platzbauer-Projekt Typ (Saisonprojekt oder Nachtrag)
export type PlatzbauerprojektTyp = 'saisonprojekt' | 'nachtrag';

// Platzbauer-Saisonprojekt (z.B. "Vogel 2026" oder "Vogel 2026 - Nachtrag 1")
export interface PlatzbauerProjekt {
  id: string;
  $id?: string; // Appwrite Document ID

  // Platzbauer-Referenz
  platzbauerId: string;
  platzbauerName: string;

  // Projekt-Identifikation
  projektName: string;           // z.B. "Vogel 2026" oder "Vogel 2026 - Nachtrag 1"
  saisonjahr: number;
  status: ProjektStatus;
  typ: PlatzbauerprojektTyp;

  // Bei Nachträgen: Referenz auf Hauptprojekt
  hauptprojektId?: string;
  nachtragNummer?: number;       // z.B. 1, 2, 3 für "Nachtrag 1", "Nachtrag 2", etc.

  // Dokumente (wie bei normalen Projekten)
  angebotId?: string;
  angebotsnummer?: string;
  angebotsdatum?: string;

  auftragsbestaetigungId?: string;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;

  lieferscheinId?: string;
  lieferscheinnummer?: string;

  rechnungId?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;

  bezahltAm?: string;

  // Aggregierte Daten (berechnet aus zugeordneten Vereinsprojekten)
  gesamtMenge?: number;          // Summe aller Tonnen
  gesamtBrutto?: number;         // Summe aller Bruttopreise
  anzahlVereine?: number;        // Anzahl zugeordneter Vereine

  // JSON-Datenfeld für alle zusätzlichen Daten inkl. Entwürfe
  data?: string;

  // Zusätzliche Infos
  notizen?: string;

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

// Neues Platzbauer-Projekt (ohne generierte Felder)
export type NeuesPlatzbauerProjekt = Omit<PlatzbauerProjekt, 'id' | '$id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// ==================== ZUORDNUNG TYPES ====================

// Zuordnung: Vereinsprojekt -> Platzbauerprojekt
// WICHTIG: Mehrere Vereine können einem Projekt/Nachtrag zugeordnet sein!
export interface ProjektZuordnung {
  id: string;
  $id?: string;

  vereinsProjektId: string;      // Referenz auf normales Projekt
  platzbauerprojektId: string;   // Referenz auf PlatzbauerProjekt

  // Reihenfolge in Dokumenten (für Sortierung der Positionen)
  position: number;

  erstelltAm: string;
}

// Neue Zuordnung
export type NeueProjektZuordnung = Omit<ProjektZuordnung, 'id' | '$id' | 'erstelltAm'>;

// ==================== POSITION TYPES ====================

// Position für Platzbauer-Dokumente (eine Position pro Verein)
export interface PlatzbauerPosition {
  vereinId: string;              // SaisonKunde ID
  vereinsname: string;
  vereinsprojektId: string;      // Normales Projekt ID

  // Mengen und Preise
  menge: number;                 // Tonnen
  einzelpreis: number;           // Preis pro Tonne
  gesamtpreis: number;           // menge * einzelpreis

  // Lieferadresse des Vereins
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
  };

  // Status des Vereinsprojekts
  projektStatus?: ProjektStatus;

  // Lieferschein-Info
  lieferscheinErstellt?: boolean;
  lieferscheinId?: string;

  /**
   * Woher der Preis dieser Zeile stammt, im Klartext für den Beleg — z. B.
   * „Staffel Stufe 2 (ab 150 t)" oder „Direktpreis lt. Vereinbarung".
   * Erzeugt von `utils/preisHerkunft.ts`; fehlt bei Altbelegen.
   */
  preisHerkunft?: string;
}

// ==================== STAFFELPREISE TYPES ====================

/**
 * Preis einer Lieferregion innerhalb einer Mengenstufe (09/2026).
 *
 * Ein Platzbauer beliefert Vereine in mehreren Gegenden; die Fracht macht den
 * Unterschied. Innerhalb derselben Mengenstufe kostet die Tonne in PLZ 97
 * deshalb mehr als in PLZ 90.
 *
 * `plzGebiete` ist die Eingabe des Sachbearbeiters, semikolongetrennt und mit
 * beliebig vielen Stellen: „47;42" trifft alle PLZ, die mit 47 oder 42
 * beginnen. Gilt für eine engere Region etwas anderes, gewinnt das längere
 * Präfix („972" schlägt „97") — siehe `utils/plzRegionen.ts`.
 */
export interface RegionPreis {
  /** PLZ-Präfixe, semikolongetrennt, z. B. „47;42". */
  plzGebiete: string;
  einzelpreis: number;
  /** Freie Bezeichnung für den Beleg, z. B. „Niederrhein". */
  bezeichnung?: string;
}

// Einzelne Staffel für Staffelpreise
export interface Preisstaffel {
  vonMenge: number;              // Ab dieser Menge gilt der Preis
  bisMenge: number | null;       // Bis zu dieser Menge (null = unbegrenzt)
  einzelpreis: number;           // Preis pro Einheit in dieser Staffel
  /**
   * Preise je Lieferregion innerhalb dieser Mengenstufe. Leer oder nicht
   * gesetzt heißt: `einzelpreis` gilt überall. Passt keine Region zur PLZ des
   * Vereins, gilt ebenfalls `einzelpreis` — eine Lieferung darf nie ohne Preis
   * dastehen, nur weil ein Gebiet nicht gepflegt wurde.
   */
  regionPreise?: RegionPreis[];
}

// Staffelpreis-Konfiguration
export interface StaffelpreisKonfiguration {
  staffeln: Preisstaffel[];      // Die Preisstaffeln
  basisArtikel: string;          // Basisartikel-Nummer (z.B. "TM-ZM-02")
  basisBezeichnung: string;      // Basisartikel-Bezeichnung
  /**
   * Lieferregion und Bemerkung zusätzlich strukturiert. Gedruckt wird
   * weiterhin die zusammengesetzte `beschreibung` der Position; diese Felder
   * dienen dem verlustfreien Zurücklesen (Rehydrierung, AB-Übernahme).
   */
  lieferregion?: string;
  bemerkung?: string;
}

/**
 * Wie die Staffel abgerechnet wird (Vorschlag „Hinweistext Staffelpreisangebot", 09/2026):
 *  - saisonbonus:      laufend zum Preis der 1. Stufe, zum Stichtag Gutschrift für die gesamte Menge
 *  - sofortumstellung: ab Erreichen einer Stufe sofort günstiger, Ausgleichsgutschrift für vorherige Tonnen
 *  - stufenpreis:      nur die Mehrmenge ab der Grenze wird günstiger, keine Gutschrift
 */
export type StaffelAbrechnungsmodell = 'saisonbonus' | 'sofortumstellung' | 'stufenpreis';

/** Zählt für die Einstufung die Menge aller Sorten zusammen oder jede Sorte für sich? */
export type StaffelMengenbasis = 'gesamt' | 'je-artikel';

// Konditionen eines Staffelpreis-Angebots (gilt für alle Staffelpositionen des Angebots)
export interface StaffelKonditionen {
  abrechnungsmodell: StaffelAbrechnungsmodell;
  mengenbasis: StaffelMengenbasis;
  zeitraumVon?: string;          // ISO-Datum, Beginn des Abnahmezeitraums
  zeitraumBis: string;           // ISO-Datum, Stichtag für die Gesamtabnahmemenge
  gutschriftNurBeiZahlung: boolean; // Gutschrift setzt fristgerechte Zahlung voraus
  hinweistext?: string;          // manuell überschriebener Text; leer = automatisch erzeugt
  /**
   * Pflegehilfe (kein Vertragsinhalt, erscheint NICHT auf dem PDF): Die
   * Stufengrenzen gelten für alle Sorten des Angebots und werden einmal
   * gepflegt. Die Preise bleiben je Sorte verschieden.
   * undefined = noch nicht entschieden, wird aus den Daten abgeleitet.
   */
  grenzenGekoppelt?: boolean;
}

// Positionstyp: Normal, Staffelpreis oder Bedarf
/**
 * 'preisliste': Standardkondition ohne Menge und ohne Summe (Fracht, Folie,
 * Palette, Schüttstelle, Hydrocourt). Steht im Angebot als Preisliste je
 * Einheit und wird pro Lieferung abgerechnet — siehe
 * `constants/platzbauerStandardartikel.ts`.
 */
export type PositionsTyp = 'normal' | 'staffelpreis' | 'bedarf' | 'preisliste';

// ==================== BEDARFSPOSITIONEN TYPES ====================

// Status einer Bedarfsposition
export type BedarfsStatus = 'geschaetzt' | 'bestaetigt' | 'storniert';

// ==================== ERWEITERTE POSITION ====================

// Erweiterte Position für Platzbauer-Angebote mit Artikel-Auswahl
export interface PlatzbauerAngebotPosition {
  id: string;                    // Eindeutige Position-ID (für UI)

  // Artikel-Daten
  artikelId?: string;            // Appwrite Artikel ID
  artikelnummer: string;         // z.B. "TM-ZM-02" oder "TM-ZM-03"
  bezeichnung: string;           // z.B. "Ziegelmehl 0/2"
  beschreibung?: string;         // z.B. "für TC Musterstadt"
  einheit: string;               // z.B. "t"

  // Mengen und Preise
  menge: number;                 // Tonnen
  einzelpreis: number;           // Preis pro Tonne
  gesamtpreis: number;           // menge * einzelpreis

  // Positionstyp (neu)
  positionsTyp?: PositionsTyp;   // 'normal' | 'staffelpreis' | 'bedarf' | 'preisliste'

  // Staffelpreis-Daten (wenn positionsTyp === 'staffelpreis')
  staffelpreise?: StaffelpreisKonfiguration;

  // Preislisten-Daten (wenn positionsTyp === 'preisliste')
  /** Gruppenüberschrift in der Preisliste, z. B. „Fracht & Verpackung". */
  preislisteGruppe?: string;
  /** Erläuterung unter der Zeile, z. B. die Abrechnungsregel. */
  preislisteHinweis?: string;
  /**
   * Eigene Mengenstaffel der Leistung — die Frachtkostenpauschale hat eine.
   * Sie steht als eingerückte Zeilen unter der Leistung, nicht als Fließtext:
   * „unter 5,4 t … 59,90 €" liest niemand in einer durchlaufenden Zeile.
   */
  preislisteStaffel?: Array<{ text: string; preis: number }>;

  // Bedarfsposition-Daten (wenn positionsTyp === 'bedarf')
  bedarfsStatus?: BedarfsStatus; // 'geschaetzt' | 'bestaetigt' | 'storniert'
  geschaetzteMenge?: number;     // Ursprünglich geschätzte Menge
  bedarfsNotiz?: string;         // Notiz zur Bedarfsschätzung

  // Verein-Referenz (optional - für Positionen die zu einem Verein gehören)
  vereinId?: string;             // SaisonKunde ID
  vereinsname?: string;
  vereinsprojektId?: string;     // Normales Projekt ID

  // Lieferadresse des Vereins
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
  };
}

// ==================== STAFFELPREIS-ANGEBOT ====================

// Staffelpreis-Angebot Typ (für reine Staffelpreis-Angebote ohne Vereine)
export interface StaffelpreisAngebot {
  id: string;
  bezeichnung: string;           // z.B. "Saisonpreise 2026"
  beschreibung?: string;
  staffelpreise: StaffelpreisKonfiguration;
  gueltigAb: string;
  gueltigBis: string;
}

// ==================== AGGREGIERTE TYPES ====================

// Platzbauer mit zugeordneten Vereinen und Projekten
export interface PlatzbauermitVereinen {
  platzbauer: SaisonKunde;

  // Zugeordnete Vereine (alle die standardPlatzbauerId = platzbauer.id haben)
  vereine: SaisonKundeMitDaten[];

  // Projekte für diesen Platzbauer
  projekte: PlatzbauerProjekt[];

  // Statistik für diesen Platzbauer
  statistik?: {
    anzahlVereine: number;
    gesamtMenge: number;
    offeneProjekte: number;
    abgeschlosseneProjekte: number;
  };
}

// Vereinsprojekt mit Zuordnung (für Detail-Ansicht)
export interface VereinsprojektMitZuordnung {
  projekt: import('./projekt').Projekt;
  zuordnung: ProjektZuordnung;
  kunde: SaisonKunde;
}

// ==================== FILTER & STATISTIK ====================

// Filter für PBV
export interface PBVFilter {
  saisonjahr?: number;
  status?: ProjektStatus[];
  suche?: string;
  platzbauerId?: string;
  nurMitVereinsprojekten?: boolean;
}

// Statistik für PBV Dashboard
export interface PBVStatistik {
  // Übersicht
  gesamtPlatzbauer: number;
  aktivePlatzbauer: number;      // Mit mindestens einem Vereinsprojekt
  gesamtVereine: number;         // Alle zugeordneten Vereine

  // Projekte nach Status
  projekteNachStatus: Record<ProjektStatus, number>;

  // Mengen und Umsatz
  gesamtMenge: number;           // Summe aller Tonnen
  gesamtUmsatz: number;          // Summe aller Bruttopreise

  // Lieferscheine
  lieferscheineGesamt: number;
  lieferscheineOffen: number;
}

// ==================== DOKUMENT TYPES ====================

// Dokumenttyp für Platzbauer
export type PlatzbauerDokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'rechnung' | 'proformarechnung' | 'stornorechnung';

// Gespeichertes Platzbauer-Dokument (in Appwrite)
export interface GespeichertesPlatzbauerDokument {
  $id?: string;
  id?: string;
  platzbauerprojektId: string;        // Verknüpfung zum Platzbauer-Projekt
  dokumentTyp: PlatzbauerDokumentTyp;
  dokumentNummer: string;              // z.B. "PB-AG-2026-001"
  dateiId: string;                     // Appwrite Storage File ID
  dateiname: string;                   // z.B. "Angebot Vogel 2026.pdf"
  bruttobetrag?: number;               // Gesamtbetrag
  nettobetrag?: number;
  gesamtMenge?: number;                // Tonnen
  anzahlPositionen?: number;           // Anzahl Vereine
  istFinal: boolean;                   // true bei Rechnungen
  daten?: string;                      // JSON-String der Dokument-Daten
  version?: number;                    // Versionsnummer
  $createdAt?: string;
  $updatedAt?: string;
}

// Gespeicherter Platzbauer-Lieferschein (einzeln pro Verein)
export interface GespeicherterPlatzbauerLieferschein {
  $id?: string;
  id?: string;
  platzbauerprojektId: string;        // Verknüpfung zum Platzbauer-Projekt
  vereinId: string;                    // Verknüpfung zum Verein
  vereinsprojektId: string;            // Verknüpfung zum Vereinsprojekt
  vereinsname: string;
  lieferscheinnummer: string;
  lieferdatum: string;
  dateiId: string;                     // Appwrite Storage File ID
  dateiname: string;
  menge: number;                       // Tonnen
  daten?: string;                      // JSON-String der Lieferschein-Daten
  $createdAt?: string;
  $updatedAt?: string;
}

// UI-Darstellung eines Platzbauer-Dokuments
export interface PlatzbauerDokumentAnzeige {
  id: string;
  typ: PlatzbauerDokumentTyp;
  nummer: string;
  dateiname: string;
  erstelltAm: Date;
  bruttobetrag?: number;
  gesamtMenge?: number;
  istFinal: boolean;
  downloadUrl: string;
  viewUrl: string;
  version?: number;
}

// Dokumentverlauf für die UI
export interface PlatzbauerDokumentVerlaufEintrag extends PlatzbauerDokumentAnzeige {
  istAktuell: boolean;
}

// ==================== FORMULAR-DATEN TYPES ====================

// Basis für alle Platzbauer-Dokument-Formulare
export interface PlatzbauerDokumentBasis {
  // Platzbauer-Daten (Empfänger)
  platzbauerId: string;
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Positionen (Vereine)
  positionen: PlatzbauerPosition[];

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

// Formular-Daten für Angebot
export interface PlatzbauerAngebotFormularDaten extends PlatzbauerDokumentBasis {
  angebotsnummer: string;
  angebotsdatum: string;
  gueltigBis: string;

  // Erweiterte Positionen mit Artikel-Auswahl (optional - überschreibt positionen wenn vorhanden)
  angebotPositionen?: PlatzbauerAngebotPosition[];

  // Abrechnungsmodell und Hinweistext für Staffelpreis-Angebote
  staffelKonditionen?: StaffelKonditionen;

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
}

// Formular-Daten für Auftragsbestätigung
export interface PlatzbauerABFormularDaten extends PlatzbauerDokumentBasis {
  auftragsbestaetigungsnummer: string;
  auftragsbestaetigungsdatum: string;

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
  /**
   * Staffelzeilen aus dem bestätigten Angebot. Eigenes Feld, weil sie keine
   * Menge tragen und in keine Summe gehören (Rechnung und Lieferschein lesen
   * bewusst weiterhin nur `positionen`).
   */
  abPositionen?: PlatzbauerAngebotPosition[];
  staffelKonditionen?: StaffelKonditionen;
  /** Bezug auf das bestätigte Angebot. */
  angebotsbezug?: { nummer: string; datum?: string };
}

// Formular-Daten für Rechnung
export interface PlatzbauerRechnungFormularDaten extends PlatzbauerDokumentBasis {
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;

  // Zahlungsbedingungen
  zahlungsziel: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Proforma-Abzug (optional)
  proformaAbzugAktiviert?: boolean;
  proformaAbzugBetrag?: number;
  proformaAbzugNummer?: string;
}

// Formular-Daten für Proforma-Rechnung
export interface PlatzbauerProformaRechnungFormularDaten extends PlatzbauerDokumentBasis {
  proformarechnungsnummer: string;
  proformarechnungsdatum: string;
  leistungsdatum?: string;

  // Zahlungsbedingungen
  zahlungsziel: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
}

// Formular-Daten für Lieferschein (einzeln pro Verein)
export interface PlatzbauerLieferscheinFormularDaten {
  // Verein (Empfänger)
  vereinId: string;
  vereinsname: string;
  vereinsstrasse: string;
  vereinsPlzOrt: string;
  vereinsAnsprechpartner?: string;

  // Lieferadresse (falls abweichend)
  lieferadresseAbweichend?: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;

  // Lieferschein-Daten
  lieferscheinnummer: string;
  lieferdatum: string;
  menge: number;
  einheit: string;

  // Platzbauer-Info
  platzbauername?: string;

  // Bemerkung
  bemerkung?: string;

  // Empfangsbestätigung
  unterschriftenFuerEmpfangsbestaetigung?: boolean;

  // Ihr Ansprechpartner
  ihreAnsprechpartner?: string;
}
