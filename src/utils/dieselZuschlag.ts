/**
 * Dieselpreiszuschlag-Berechnung
 *
 * Berechnet den Dieselpreiszuschlag gemäß AGB §5:
 * - Zuschlag nur auf Schüttgut-Tonnen (TM-ZM-02, TM-ZM-03)
 * - Formel: Math.floor((tagesDieselPreis - basisPreis) / 0.05) * 0.45 €/t
 * - Zuschlag nur wenn tagesDieselPreis > basisPreis
 */

import { Position } from '../types/projektabwicklung';

// ==========================================
// KONFIGURATION - Zuschlagsstaffeln nach Jahr
// ==========================================

export interface DieselZuschlagConfig {
  basisPreis: number;        // €/L (aus AGB)
  zuschlagProStufe: number;  // 0.45 €/t
  stufenGroesse: number;     // 0.05 €/L
  gueltigBis: string;        // Format: 'YYYY-12-31'
}

/**
 * Zuschlagsstaffeln nach Angebotsgültigkeit/Jahr
 * Einfach erweiterbar für neue Jahre
 */
const DIESEL_STAFFELN: DieselZuschlagConfig[] = [
  {
    basisPreis: 1.699,        // €/L
    zuschlagProStufe: 0.45,   // €/t pro Stufe
    stufenGroesse: 0.05,      // €/L pro Stufe
    gueltigBis: '2025-12-31',
  },
  {
    basisPreis: 1.749,        // €/L
    zuschlagProStufe: 0.45,   // €/t pro Stufe
    stufenGroesse: 0.05,      // €/L pro Stufe
    gueltigBis: '2026-12-31',
  },
  // Für 2027+ hier weitere Staffeln hinzufügen
];

// Fallback-Staffel wenn kein passendes Jahr gefunden wird
const FALLBACK_STAFFEL: DieselZuschlagConfig = {
  basisPreis: 1.749,
  zuschlagProStufe: 0.45,
  stufenGroesse: 0.05,
  gueltigBis: '9999-12-31',
};

// ==========================================
// ZUSCHLAGSFÄHIGE ARTIKEL
// ==========================================

/**
 * Artikelnummern die für den Dieselzuschlag relevant sind
 * NUR loses Schüttgut mit eigener Lieferung per LKW
 */
const ZUSCHLAGSFAEHIGE_ARTIKEL = ['TM-ZM-02', 'TM-ZM-03'];

/**
 * Artikelnummer für die Diesel-Zuschlagsposition
 */
export const DIESEL_ZUSCHLAG_ARTIKELNUMMER = 'TM-DZ';

// ==========================================
// INTERFACES
// ==========================================

export interface DieselZuschlagErgebnis {
  zuschlagProTonne: number;   // Berechneter Zuschlag €/t (3 Dezimalstellen)
  tagesDieselPreis: number;   // Abgerufener/eingegebener Dieselpreis €/L
  basisPreis: number;         // Verwendeter Basispreis €/L
  stufen: number;             // Anzahl Zuschlagsstufen
  gesamtTonnen: number;       // Summe zuschlagsfähiger Tonnen
  gesamtZuschlag: number;     // zuschlagProTonne * gesamtTonnen (2 Dezimalstellen)
  hatZuschlag: boolean;       // true wenn Zuschlag > 0
  config: DieselZuschlagConfig;
}

export type DieselPreisStatus =
  | 'geladen'           // Aktueller Preis von API geladen
  | 'cache'             // Preis aus Cache
  | 'fallback'          // Fallback-Preis verwendet (API nicht erreichbar)
  | 'manuell'           // Manuell eingegebener Preis
  | 'historisch'        // Historisches Datum (>2 Tage) - manuell eingeben
  | 'zukunft';          // Zukünftiges Datum - aktueller Preis als Schätzung

// ==========================================
// KERNFUNKTIONEN
// ==========================================

/**
 * Bestimmt anhand des Leistungsdatums welcher Basispreis gilt
 *
 * @param leistungsdatum - ISO-Datumsstring (YYYY-MM-DD)
 * @returns Die passende Zuschlagskonfiguration
 */
export function getBasisPreisConfig(leistungsdatum: string): DieselZuschlagConfig {
  if (!leistungsdatum) {
    return FALLBACK_STAFFEL;
  }

  // Finde die passende Staffel basierend auf dem Leistungsdatum
  for (const staffel of DIESEL_STAFFELN) {
    if (leistungsdatum <= staffel.gueltigBis) {
      return staffel;
    }
  }

  // Fallback wenn Datum nach allen definierten Staffeln liegt
  return FALLBACK_STAFFEL;
}

/**
 * Berechnet den Zuschlag pro Tonne basierend auf aktuellem Dieselpreis
 *
 * @param dieselPreis - Aktueller Dieselpreis in €/L
 * @param config - Zuschlagskonfiguration
 * @returns Zuschlag in €/t (3 Dezimalstellen)
 */
export function berechneZuschlagProTonne(
  dieselPreis: number,
  config: DieselZuschlagConfig
): number {
  // Kein Zuschlag wenn Dieselpreis unter oder gleich Basispreis
  if (dieselPreis <= config.basisPreis) {
    return 0;
  }

  // Anzahl der Stufen berechnen (abgerundet)
  const stufen = Math.floor((dieselPreis - config.basisPreis) / config.stufenGroesse);

  // Zuschlag pro Tonne
  const zuschlag = stufen * config.zuschlagProStufe;

  // Auf 3 Dezimalstellen runden (cent-genau bei Multiplikation)
  return Math.round(zuschlag * 1000) / 1000;
}

/**
 * Prüft ob eine Position für den Dieselzuschlag relevant ist
 *
 * @param position - Die zu prüfende Position
 * @returns true wenn die Position zuschlagsfähig ist
 */
export function istZuschlagsfaehig(position: Position): boolean {
  // Nur wenn Artikelnummer in der Liste der zuschlagsfähigen Artikel
  if (!position.artikelnummer) return false;

  // Nur Tonnen-Positionen (loses Schüttgut)
  if (position.einheit !== 't') return false;

  // Nur TM-ZM-02 und TM-ZM-03
  return ZUSCHLAGSFAEHIGE_ARTIKEL.includes(position.artikelnummer);
}

/**
 * Prüft ob eine Position die Dieselzuschlag-Position ist
 */
export function istDieselZuschlagPosition(position: Position): boolean {
  return position.artikelnummer === DIESEL_ZUSCHLAG_ARTIKELNUMMER;
}

/**
 * Berechnet den Gesamtzuschlag für alle Positionen
 *
 * @param positionen - Alle Rechnungspositionen
 * @param dieselPreis - Aktueller Dieselpreis in €/L
 * @param leistungsdatum - Leistungsdatum für Staffelbestimmung
 * @returns Detailliertes Ergebnis der Zuschlagsberechnung
 */
export function berechneGesamtZuschlag(
  positionen: Position[],
  dieselPreis: number,
  leistungsdatum: string
): DieselZuschlagErgebnis {
  // Konfiguration basierend auf Leistungsdatum
  const config = getBasisPreisConfig(leistungsdatum);

  // Zuschlag pro Tonne berechnen
  const zuschlagProTonne = berechneZuschlagProTonne(dieselPreis, config);

  // Stufen berechnen
  const stufen = dieselPreis > config.basisPreis
    ? Math.floor((dieselPreis - config.basisPreis) / config.stufenGroesse)
    : 0;

  // Summe der zuschlagsfähigen Tonnen (ohne bestehende TM-DZ Position!)
  const gesamtTonnen = positionen
    .filter(p => !istDieselZuschlagPosition(p)) // Bestehende Zuschlagsposition ignorieren
    .filter(istZuschlagsfaehig)
    .reduce((sum, p) => sum + (p.menge || 0), 0);

  // Gesamtzuschlag berechnen (auf 2 Dezimalstellen runden)
  const gesamtZuschlag = Math.round(zuschlagProTonne * gesamtTonnen * 100) / 100;

  return {
    zuschlagProTonne,
    tagesDieselPreis: dieselPreis,
    basisPreis: config.basisPreis,
    stufen,
    gesamtTonnen,
    gesamtZuschlag,
    hatZuschlag: gesamtZuschlag > 0,
    config,
  };
}

/**
 * Erstellt eine Dieselzuschlag-Position für die Rechnung
 *
 * @param ergebnis - Das Berechnungsergebnis
 * @returns Position-Objekt für die Rechnung
 */
export function erstelleDieselZuschlagPosition(
  ergebnis: DieselZuschlagErgebnis
): Position {
  const beschreibung = ergebnis.hatZuschlag
    ? `Basis: ${ergebnis.basisPreis.toFixed(3)} €/L | Aktuell: ${ergebnis.tagesDieselPreis.toFixed(3)} €/L | ${ergebnis.stufen} Stufe(n) à 0,45 €/t`
    : `Kein Zuschlag - Dieselpreis (${ergebnis.tagesDieselPreis.toFixed(3)} €/L) unter Basis (${ergebnis.basisPreis.toFixed(3)} €/L)`;

  return {
    id: 'diesel-zuschlag',
    artikelnummer: DIESEL_ZUSCHLAG_ARTIKELNUMMER,
    bezeichnung: 'Dieselpreiszuschlag',
    beschreibung,
    menge: ergebnis.gesamtTonnen,
    einheit: 't',
    einzelpreis: ergebnis.zuschlagProTonne,
    gesamtpreis: ergebnis.gesamtZuschlag,
    istBedarfsposition: false,
    ohneMwSt: false,
  };
}

/**
 * Bestimmt den Status des Dieselpreises basierend auf dem Datum
 *
 * @param leistungsdatum - ISO-Datumsstring
 * @returns Status des Dieselpreises
 */
export function getDieselPreisStatus(leistungsdatum: string): 'aktuell' | 'historisch' | 'zukunft' {
  if (!leistungsdatum) return 'aktuell';

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  const leistung = new Date(leistungsdatum);
  leistung.setHours(0, 0, 0, 0);

  const diffTage = Math.floor((leistung.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));

  if (diffTage < -2) {
    return 'historisch'; // Mehr als 2 Tage in der Vergangenheit
  } else if (diffTage > 0) {
    return 'zukunft'; // In der Zukunft
  }

  return 'aktuell'; // Heute oder gestern
}

/**
 * Formatiert den Dieselpreis für die Anzeige
 */
export function formatDieselPreis(preis: number): string {
  return preis.toFixed(3).replace('.', ',') + ' €/L';
}

/**
 * Formatiert den Zuschlag pro Tonne für die Anzeige
 */
export function formatZuschlagProTonne(zuschlag: number): string {
  return zuschlag.toFixed(2).replace('.', ',') + ' €/t';
}

/**
 * Formatiert den Gesamtzuschlag für die Anzeige
 */
export function formatGesamtZuschlag(zuschlag: number): string {
  return zuschlag.toFixed(2).replace('.', ',') + ' €';
}
