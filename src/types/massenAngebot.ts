import { SaisonKunde, KundenTyp } from './saisonplanung';
import { Position } from './projektabwicklung';

/** Woher das Angebot eines Kunden stammt (Priorität: vorjahr > mosaik > plz_kalkulation > manuell). */
export type AngebotsQuelle = 'vorjahr' | 'mosaik' | 'plz_kalkulation' | 'manuell';

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

/** Ergebnis eines scharfen Erzeugungslaufs. */
export interface ErzeugungsErgebnis {
  batchId: string;
  erzeugt: { kundeId: string; kundenname: string; projektId: string; angebotsnummer: string }[];
  uebersprungen: { kundeId: string; kundenname: string; grund: string }[];
  fehler: { kundeId: string; kundenname: string; fehler: string }[];
}
