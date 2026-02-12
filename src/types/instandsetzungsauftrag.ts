/**
 * Type-Definitionen für Instandsetzungsaufträge
 *
 * Instandsetzungsaufträge werden für Kunden mit Bezugsweg "direkt_instandsetzung" erstellt.
 * Diese Kunden bestellen direkt bei TennisMehl, aber die Frühjahresinstandsetzung
 * wird von einem Platzbauer durchgeführt. TennisMehl beauftragt den Platzbauer.
 */

import { Adresse } from './dispo';

// Status-Workflow für Instandsetzungsaufträge
export type InstandsetzungsauftragStatus = 'erstellt' | 'gesendet' | 'bestaetigt' | 'erledigt';

// Labels für Status-Anzeige
export const INSTANDSETZUNGSAUFTRAG_STATUS_LABELS: Record<InstandsetzungsauftragStatus, string> = {
  erstellt: 'Erstellt',
  gesendet: 'Gesendet',
  bestaetigt: 'Bestätigt',
  erledigt: 'Erledigt',
};

// Farben für Status-Badges
export const INSTANDSETZUNGSAUFTRAG_STATUS_COLORS: Record<InstandsetzungsauftragStatus, { bg: string; text: string }> = {
  erstellt: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  gesendet: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  bestaetigt: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  erledigt: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
};

// Ansprechpartner für Instandsetzung
export interface InstandsetzungsAnsprechpartner {
  name: string;
  telefon?: string;
  email?: string;
  rolle?: string;  // z.B. "Platzwart", "Vorstand"
}

// Eine Position im Instandsetzungsauftrag (ein Verein)
export interface InstandsetzungsPosition {
  vereinId: string;              // SaisonKunde ID
  vereinName: string;
  adresse: Adresse;
  anzahlPlaetze: number;
  dienst: string;                // z.B. "Frühjahrs-Instandsetzung"
  gewuenschterTermin?: string;   // ISO Date
  projektId?: string;            // Link zum Vereinsprojekt
  ansprechpartner?: InstandsetzungsAnsprechpartner;  // PFLICHT für Kontakt zum Verein
}

// Hauptinterface für Instandsetzungsauftrag
export interface Instandsetzungsauftrag {
  id: string;
  $id?: string;                  // Appwrite Document ID
  platzbauerId: string;
  platzbauerName?: string;       // Cached für Anzeige
  saisonjahr: number;
  auftragsnummer: string;        // Format: IA-2026-001
  status: InstandsetzungsauftragStatus;
  positionen: InstandsetzungsPosition[];
  erstelltAm: string;
  gesendetAm?: string;
  bestaetigtAm?: string;
  erledigtAm?: string;
}

// Typ für neue Aufträge (ohne automatisch generierte Felder)
export type NeuerInstandsetzungsauftrag = Omit<
  Instandsetzungsauftrag,
  'id' | '$id' | 'erstelltAm'
> & {
  id?: string;
};

// Filter-Optionen für Auftrags-Liste
export interface InstandsetzungsauftragFilter {
  platzbauerId?: string;
  saisonjahr?: number;
  status?: InstandsetzungsauftragStatus[];
}
