/**
 * Raben-Dieselfloater-Berechnung
 *
 * Für Palettenware, die per Raben-Spedition verschickt wird, wird der
 * Raben-Dieselfloater (% auf Speditionsdienste-Basispreis) durchgereicht.
 *
 * Tabelle: RABEN_DIESELFLOATER in src/constants/rabenPricing.ts
 * Basis:   115 ct/L, 5%-Preisdifferenz-Stufen → 1,25% Zuschlag pro Stufe
 */

import { Position } from '../types/projektabwicklung';
import { berechneRabenDieselzuschlag } from '../constants/rabenPricing';

export const RABEN_DIESELFLOATER_ARTIKELNUMMER = 'TM-DZ-R';

export interface RabenDieselfloaterErgebnis {
  basispreis: number;          // EUR (Summe Speditionsdienste lt. Raben)
  dieselPreisEuroProL: number; // €/L (wie bei generischem Zuschlag)
  dieselPreisCent: number;     // ct/L (für Raben-Tabellen-Lookup)
  floaterProzent: number;      // z.B. 23.75
  floaterBetrag: number;       // EUR, auf 2 Nachkommastellen gerundet
  hatFloater: boolean;
}

export function berechneRabenDieselfloater(
  basispreis: number,
  dieselPreisEuroProL: number
): RabenDieselfloaterErgebnis {
  const sicherBasispreis = basispreis > 0 ? basispreis : 0;
  const dieselPreisCent = dieselPreisEuroProL * 100;
  const floaterProzent = berechneRabenDieselzuschlag(dieselPreisCent);
  const floaterBetrag = Math.round(sicherBasispreis * floaterProzent) / 100;

  return {
    basispreis: sicherBasispreis,
    dieselPreisEuroProL,
    dieselPreisCent,
    floaterProzent,
    floaterBetrag,
    hatFloater: sicherBasispreis > 0 && floaterProzent > 0,
  };
}

export function istRabenDieselfloaterPosition(position: Position): boolean {
  return position.artikelnummer === RABEN_DIESELFLOATER_ARTIKELNUMMER;
}

/**
 * Artikelnummern, deren €/t-Dieselzuschlag (TM-DZ) entfällt, wenn der
 * Raben-Dieselfloater (TM-DZ-R) aktiv ist. Palettenware + BigBag wird von
 * Raben-Spedition transportiert und dort über den Floater abgerechnet.
 */
export const RABEN_SPEDITION_ARTIKELNUMMERN = [
  'TM-ZM-02St',
  'TM-ZM-03St',
  'TM-ZM-BIG-02',
  'TM-ZM-BIG-03',
];

export function istRabenSpeditionArtikel(position: Position): boolean {
  return !!position.artikelnummer && RABEN_SPEDITION_ARTIKELNUMMERN.includes(position.artikelnummer);
}

export function erstelleRabenDieselfloaterPosition(
  ergebnis: RabenDieselfloaterErgebnis
): Position {
  const beschreibung = ergebnis.hatFloater
    ? `${ergebnis.basispreis.toFixed(2).replace('.', ',')} € Speditionsbasis × ${ergebnis.floaterProzent
        .toFixed(2)
        .replace('.', ',')}% (Raben-Dieselfloater, Basis 115,00 ct/L, aktuell ${ergebnis.dieselPreisCent
        .toFixed(2)
        .replace('.', ',')} ct/L)`
    : `Kein Raben-Dieselfloater fällig (Basispreis ${ergebnis.basispreis.toFixed(2)} €, Dieselpreis ${ergebnis.dieselPreisCent.toFixed(2)} ct/L ≤ 120,75 ct/L)`;

  return {
    id: 'raben-dieselfloater',
    artikelnummer: RABEN_DIESELFLOATER_ARTIKELNUMMER,
    bezeichnung: 'Raben-Dieselfloater (Palettenspedition)',
    beschreibung,
    menge: 1,
    einheit: 'psch',
    einzelpreis: ergebnis.floaterBetrag,
    gesamtpreis: ergebnis.floaterBetrag,
    istBedarfsposition: false,
    ohneMwSt: false,
  };
}

export function formatFloaterProzent(prozent: number): string {
  return prozent.toFixed(2).replace('.', ',') + '%';
}

export function formatFloaterBetrag(betrag: number): string {
  return betrag.toFixed(2).replace('.', ',') + ' €';
}
