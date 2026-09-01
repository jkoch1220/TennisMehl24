import { SaisonKunde, KundenTyp } from './saisonplanung';
import { Position } from './projektabwicklung';

/** Woher das Angebot eines Kunden stammt (Priorität: vorjahr > mosaik > plz_kalkulation > manuell). */
export type AngebotsQuelle = 'vorjahr' | 'mosaik' | 'plz_kalkulation' | 'manuell';

/** Produktprofil des Kandidaten, abgeleitet aus den Referenz-Positionen. */
export type Produktprofil = 'schuettgut' | 'paletten' | 'gemischt';

/** Datenbasis der Referenz („bestätigte Bestellung schlägt bloßes Angebot"). */
export type ReferenzTyp = 'auftragsbestaetigung' | 'rechnung' | 'angebot' | 'mosaik';

/** Die als Referenz gewählte „größte Bestellung des Jahres" eines Kunden. */
export interface ReferenzInfo {
  /** Referenz-Saisonjahr (bei Mosaik nur, wenn aus der Preishistorie ermittelbar). */
  jahr?: number;
  typ: ReferenzTyp;
  /** Schüttgut-Tonnage (TM-ZM-02/-03) der Referenz-Positionen. */
  tonnage: number;
  /** Netto-Auftragswert der Referenz (ohne Bedarfspositionen). */
  wert: number;
  /** Projekt, aus dem die Referenz stammt (nur Quelle „vorjahr"). */
  projektId?: string;
  /** Wie viele Vorjahres-Projekte der Kunde insgesamt hatte. */
  anzahlVorjahresProjekte?: number;
  /** true, wenn nur ein verlorenes Projekt als Referenz verfügbar war. */
  ausVerlorenemProjekt?: boolean;
}

/**
 * Status einer Vorschau-Zeile.
 * - neu:       wird (nach Bestätigung) erzeugt
 * - existiert: für die Zielsaison gibt es schon ein Projekt → überspringen (nie doppelt)
 * - fehler:    harte Validierung fehlgeschlagen (Menge/Preis/Adresse) → nicht erzeugen
 * - manuell:   keine verwertbare Quelle / Sonderfall (z.B. Platzbauer) → manuell prüfen
 */
export type KandidatStatus = 'neu' | 'existiert' | 'fehler' | 'manuell';

export interface MassenAngebotKandidat {
  kundeId: string;
  kundenname: string;
  kundennummer?: string;
  typ: KundenTyp;
  quelle: AngebotsQuelle;
  status: KandidatStatus;
  /** Erläuterung zum Status (z.B. "Platzbauer – manuell prüfen"). */
  statusGrund?: string;

  /** Editierbare Primärwerte (Ziegelmehl-Hauptposition). */
  menge: number;          // Tonnen
  preisProTonne: number;  // €/t (netto)
  angebotssumme: number;  // Netto-Summe aller (nicht-Bedarfs-)Positionen

  empfaengerEmail?: string;
  /** Empfänger fehlt → kann erzeugt, aber NICHT versendet werden. */
  emailFehlt: boolean;

  /** Produktprofil aus den Referenz-Positionen (Fallback: schuettgut). */
  produktprofil: Produktprofil;
  /** Referenz „größte Bestellung des Jahres" (Quelle vorjahr/mosaik). */
  referenz?: ReferenzInfo;
  /** Freitext-Notiz aus dem Detail-Panel (wird ins Projekt übernommen). */
  notiz?: string;

  positionen: Position[];
  /** id der editierbaren Primärposition innerhalb von positionen. */
  primaerPositionId?: string;

  /** Harte Validierungsfehler (blockieren Erzeugung). */
  fehler: string[];
  /** Weiche Hinweise (blockieren Erzeugung nicht). */
  warnungen: string[];

  /** Wenn bereits ein Projekt für die Zielsaison existiert. */
  existierendesProjektId?: string;

  /** Vom Nutzer in der Vorschau an-/abgewählt. */
  ausgewaehlt: boolean;

  /** Vollständiger Kundendatensatz (intern, für die Erzeugung). */
  kunde: SaisonKunde;
}

/** Globale Preisanpassung für die neue Saison. */
export type Preisanpassung =
  | { typ: 'prozent'; wert: number } // +X % auf Vorjahrespreise
  | { typ: 'fix'; wert: number }     // fixer €/t-Preis
  | null;

/** Zusammenfassung der Kandidaten-Sammlung. */
export interface KandidatenZusammenfassung {
  gesamt: number;
  neu: number;
  existiert: number;
  fehler: number;
  manuell: number;
}

export interface AngebotsLauf {
  id: string;
  batchId: string;
  saisonjahr: number;
  zeitpunkt: string;        // ISO
  benutzer?: string;
  testModus: boolean;
  anzahlErzeugt: number;
  anzahlUebersprungen: number;
  anzahlFehler: number;
  rueckgaengigGemacht?: boolean;
}

/** Ein erzeugtes Angebot, das versendet werden kann. */
export interface VersandKandidat {
  projektId: string;
  kundeId: string;
  kundenname: string;
  angebotsnummer?: string;
  empfaengerEmail?: string;
  emailFehlt: boolean;
  ausgewaehlt: boolean;
}

/**
 * Vorschlag für die Opt-in-Pflege: Kunde hat im Vorjahr DIREKT bestellt
 * (eigenes Projekt, kein Platzbauer, kein Bezug über Platzbauer, E-Mail vorhanden),
 * ist aber noch nicht als massenangebots-tauglich markiert.
 */
export interface TauglichkeitsVorschlag {
  kundeId: string;
  kundenname: string;
  kundennummer?: string;
  email?: string;
  anzahlVorjahresProjekte: number;
  /** Mindestens ein Vorjahres-Projekt hat den Status AB oder später. */
  hatBestellung: boolean;
  ausgewaehlt: boolean;
}

/** Ergebnis der Batch-Markierung „massenangebots-tauglich". */
export interface MarkierungsErgebnis {
  erfolgreich: number;
  fehler: { kundeId: string; kundenname: string; fehler: string }[];
}

/** Ergebnis eines scharfen Erzeugungslaufs. */
export interface ErzeugungsErgebnis {
  batchId: string;
  erzeugt: { kundeId: string; kundenname: string; projektId: string; angebotsnummer: string }[];
  uebersprungen: { kundeId: string; kundenname: string; grund: string }[];
  fehler: { kundeId: string; kundenname: string; fehler: string }[];
  /**
   * Gesetzt, wenn der Lauf vorzeitig gestoppt wurde, weil der Fehler nicht am
   * einzelnen Kunden lag, sondern am System (z. B. Nummernvergabe nicht
   * prüfbar). Die restlichen Kandidaten wurden dann gar nicht erst versucht.
   */
  abgebrochen?: { grund: string; offen: number };
}

/**
 * Eine gefundene E-Mail-Adresse für einen Kunden samt Fundort. Die Auswahl
 * trifft immer ein Mensch: Bei „knut.christiansen@dhl.com" gegen
 * „tc-verein@web.de" kann keine Heuristik entscheiden, welche der
 * Vereinsvorstand ist.
 */
export interface EmailKandidat {
  email: string;
  /** Woher die Adresse stammt — entscheidet, wie vertrauenswürdig sie ist. */
  quelle: 'kunde' | 'rechnung' | 'ansprechpartner' | 'projekt';
  /** Zusatz für die Anzeige, z. B. der Name des Ansprechpartners. */
  hinweis?: string;
}

/** Ein Kunde, dessen Angebots-Empfänger vor dem Lauf geklärt werden muss. */
export interface EmailKlaerungsFall {
  kundeId: string;
  kundenname: string;
  kundennummer?: string;
  /** `fehlt` = keine Adresse auffindbar, `mehrdeutig` = mehrere zur Auswahl. */
  art: 'fehlt' | 'mehrdeutig';
  /** Was heute in `angebotsEmails` steht (leer, wenn nie gepflegt). */
  bisher: string[];
  /** Alle im System auffindbaren Adressen, ohne Duplikate. */
  kandidaten: EmailKandidat[];
}

// ===========================================================================
// KAMPAGNEN — ein Massen-Angebot als eigener, über Tage bearbeitbarer Vorgang
// ===========================================================================
//
// Bisher lebte die Vorschau nur im Browser: Wer das Fenster schloss, fing von
// vorn an. Ein echter Lauf über mehrere hundert Vereine dauert Tage — E-Mails
// klären, Mengen prüfen, Sonderfälle nachfragen. Deshalb ist ein Massen-Angebot
// jetzt ein gespeicherter Vorgang mit Kopf (`MassenAngebotKampagne`) und einer
// Zeile je Kunde (`MassenAngebotZeile`).
//
// Zwei Collections statt eines großen Dokuments: Eine Zeile zu ändern schreibt
// wenige hundert Byte statt eines Megabyte-Pakets. Das macht Zwischenspeichern
// billig — und zwei offene Tabs überschreiben sich nicht gegenseitig.

/**
 * Sortiment eines Massen-Angebots. Die drei Typen sind überschneidungsfrei und
 * bestimmen, wo die Zielgruppe gesucht wird:
 *
 * - `schuettgut`             loses Ziegelmehl (TM-ZM-02/-03)
 * - `fruehjahrsinstandsetzung` Kunden, die die ARBEIT am Platz beauftragt haben
 *                            (Instandsetzung, Linien, sonstige Platzarbeiten) —
 *                            nicht bloß Material. Wir schicken dafür einen
 *                            Platzbauer hin.
 * - `paletten`               Kunden, die AUSSCHLIESSLICH Sackware/Paletten
 *                            bezogen haben. Sie werden anders disponiert und
 *                            gehören deshalb in einen eigenen Lauf.
 *
 * Universalartikel sind in allen drei Typen ausgeschlossen.
 */
export type MassenAngebotTyp = 'schuettgut' | 'fruehjahrsinstandsetzung' | 'paletten' | 'abholung';

export const MASSEN_ANGEBOT_TYP_LABELS: Record<MassenAngebotTyp, string> = {
  schuettgut: 'Schüttgut',
  fruehjahrsinstandsetzung: 'Frühjahrsinstandsetzung',
  paletten: 'Palettenware',
  abholung: 'Abholer',
};

export const MASSEN_ANGEBOT_TYP_BESCHREIBUNG: Record<MassenAngebotTyp, string> = {
  schuettgut: 'Loses Ziegelmehl — der Regelfall. Beiladungs-Säcke gehören dazu.',
  fruehjahrsinstandsetzung: 'Kunden, die die Arbeit am Platz beauftragt haben, nicht nur das Material.',
  paletten: 'Kunden, die Sackware auf Paletten beziehen und geliefert bekommen — eigene Disposition.',
  abholung: 'Abholer ab Werk — keine Spedition, Werkspreise. Auch wer nur Sackware holt.',
};

/**
 * Status einer Kampagne.
 *
 * `versendet` ist eine Einbahnstraße: Was beim Verein im Postfach liegt, lässt
 * sich nicht nachträglich ändern. Die Zeilen werden dann schreibgeschützt.
 */
export type KampagnenStatus = 'entwurf' | 'in_bearbeitung' | 'versendet' | 'abgebrochen';

export const KAMPAGNEN_STATUS_LABELS: Record<KampagnenStatus, string> = {
  entwurf: 'Entwurf',
  in_bearbeitung: 'In Bearbeitung',
  versendet: 'Versendet',
  abgebrochen: 'Abgebrochen',
};

/** Bearbeitungsmarkierung einer Zeile — der Arbeitsvorrat des Nutzers. */
export type ZeilenMarkierung =
  | 'offen'          // noch nicht angesehen
  | 'geprueft'       // in Ordnung, geht so raus
  | 'kompliziert'    // braucht einen zweiten Blick / Rücksprache
  | 'archivieren'    // Kunde gehört ins Archiv, nicht in dieses Angebot
  | 'platzbauer'     // wird über einen Platzbauer beliefert → kein Direktangebot
  | 'zurueckgestellt'; // diesmal nicht, aber auch kein Fehler

export const ZEILEN_MARKIERUNG_LABELS: Record<ZeilenMarkierung, string> = {
  offen: 'Offen',
  geprueft: 'Geprüft',
  kompliziert: 'Kompliziert',
  archivieren: 'Ins Archiv',
  platzbauer: 'Über Platzbauer',
  zurueckgestellt: 'Zurückgestellt',
};

/** Der Kopf einer Kampagne — steht in `massen_angebote`. */
export interface MassenAngebotKampagne {
  id: string;
  /** Frei wählbar, z. B. „Schüttgut Nordbayern" — sonst aus Typ + Saison erzeugt. */
  name: string;
  typ: MassenAngebotTyp;
  /** Liefersaison, für die die Angebote gelten. */
  saisonjahr: number;
  status: KampagnenStatus;
  erstelltAm: string;
  erstelltVon?: string;
  geaendertAm?: string;
  /** Gesetzt, sobald der Versand gelaufen ist — ab dann schreibgeschützt. */
  versendetAm?: string;
  /** Verknüpft die erzeugten Projekte (siehe `erzeugungsBatchId` am Projekt). */
  batchId?: string;
  /** Freitext des Bearbeiters. */
  notiz?: string;
  /**
   * Preissteigerung gegenüber dem Vorjahr, in Prozent.
   *
   * Wirkt immer auf den GESPEICHERTEN Vorjahrespreis der Zeile, nie auf den
   * bereits angepassten. Sonst würde zweimaliges Anwenden von 4 % zu 8,16 %,
   * und niemand könnte nachvollziehen, welcher Aufschlag tatsächlich im
   * Angebot steht.
   */
  preisanpassungProzent?: number;
  /** Wann die Anpassung zuletzt auf die Zeilen geschrieben wurde. */
  preisanpassungAngewendetAm?: string;
  /** Zähler für die Listenansicht, beim Speichern der Zeilen fortgeschrieben. */
  anzahlZeilen: number;
  anzahlGeprueft: number;
  anzahlKompliziert: number;
  anzahlVersendet: number;
}

/** Eine Zeile der Kampagne — ein Kunde. Steht in `massen_angebot_zeilen`. */
export interface MassenAngebotZeile {
  id: string;
  kampagneId: string;
  kundeId: string;
  kundenname: string;
  kundennummer?: string;

  markierung: ZeilenMarkierung;
  /** Vom Nutzer an-/abgewählt — nur Angewählte werden erzeugt. */
  ausgewaehlt: boolean;

  /** Editierbare Werte. */
  menge: number;
  preisProTonne: number;
  /**
   * Der Preis aus dem Referenzbeleg — die Basis für die Preisanpassung.
   *
   * Getrennt von `preisProTonne`, damit die Anpassung wiederholbar bleibt und
   * man jederzeit sieht, was der Verein letztes Jahr gezahlt hat.
   */
  basisPreisProTonne?: number;
  empfaengerEmail?: string;
  notiz?: string;
  positionen: Position[];
  /**
   * Die Position, an der Menge und Tonnenpreis hängen.
   *
   * Ohne sie würde eine Preisänderung ALLE Positionen treffen — auch
   * Einwegpalette, Entladung und Frachtpauschale, die eigene Preise haben.
   * Genau so entstand ein Angebot, in dem die Palette 161,20 € kostete.
   */
  primaerPositionId?: string;

  /**
   * Warum ist dieser Kunde in der Liste?
   *
   * Ohne diese Begründung ist die Liste eine Blackbox: Wer 500 Vereine
   * durchgeht, muss bei jedem sehen können, worauf der Vorschlag beruht —
   * „AB 2026 über 12 t" wiegt anders als „Mosaik-Preishistorie 2019".
   */
  herkunft: string;
  quelle: AngebotsQuelle;
  referenz?: ReferenzInfo;
  produktprofil: Produktprofil;
  /** Kunde holt selbst ab — keine Frachtposition, eigene Abstimmung. */
  selbstabholer: boolean;

  fehler: string[];
  warnungen: string[];

  /** Nach der Erzeugung: das entstandene Projekt. */
  projektId?: string;
  angebotsnummer?: string;
  versendetAm?: string;

  /**
   * Angepasster E-Mail-Text für genau diesen Kunden.
   *
   * Leer heißt: Es gilt die Vorlage aus den Stammdaten. Gefüllt heißt: Jemand
   * hat für diesen Verein bewusst etwas anderes formuliert — etwa einen Hinweis
   * auf die letzte Lieferung oder eine offene Absprache.
   */
  emailBetreff?: string;
  emailText?: string;

  geaendertAm?: string;
  geaendertVon?: string;
}
