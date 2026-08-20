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
