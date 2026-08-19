/**
 * Entfernung Versandwerk -> Abladestelle
 *
 * Einzige Quelle für die Kilometerzahl, die ab 2027 den Dieselpreiszuschlag staffelt
 * (siehe dieselZuschlag.ts). Angebot, Auftragsbestätigung und Rechnung müssen zwingend
 * denselben Wert verwenden — sonst weicht die Rechnung von der Zusage im Angebot ab.
 *
 * Ausgangspunkt ist die VERLADESTELLE Marktheidenfeld (97828), nicht der Firmensitz
 * Giebelstadt: von dort fährt der LKW los, und dieselbe PLZ liegt bereits der
 * Lieferkostenberechnung (routeCalculation.ts) und dem Dieselpreis-Abruf zugrunde.
 *
 * Maßgeblich ist die EINFACHE Strecke (Hinweg). `berechneFremdlieferungRoute` liefert
 * dagegen Hin- und Rückweg zusammen — wer die dortige `distanz` verwendet, verdoppelt
 * die Staffel.
 */

import { berechneDistanzVonPLZ } from './routeCalculation';
import { geocodeByPLZ, berechneStrassenEntfernungKm } from '../data/plzKoordinaten';

/** PLZ der Verladestelle (Wertheimer Str. 30, 97828 Marktheidenfeld) */
export const WERK_PLZ = '97828';

/** Koordinaten der Verladestelle für die synchrone Schätzung */
const WERK_KOORDINATEN = { lat: 49.85, lng: 9.60 };

export type EntfernungsQuelle =
  | 'route'      // Über Routing/Geocoding ermittelt (genau)
  | 'schaetzung' // Luftlinie × 1,3 aus der PLZ-Tabelle (grob)
  | 'manuell';   // Von Hand eingetragen

export interface EntfernungsErgebnis {
  km: number;
  quelle: EntfernungsQuelle;
}

/**
 * Zieht die 5-stellige PLZ aus einem Feld wie "97232 Giebelstadt" oder
 * "Raiffeisenweg 1, 97232 Giebelstadt".
 */
export function extrahierePlz(plzOrt?: string | null): string | null {
  if (!plzOrt) return null;
  const treffer = plzOrt.match(/\b\d{5}\b/);
  return treffer ? treffer[0] : null;
}

/**
 * Synchrone Schätzung aus der PLZ-Tabelle (Luftlinie × 1,3).
 *
 * Für die Anzeige und als Startwert gedacht, wenn kein await möglich ist. Die Tabelle
 * kennt nur PLZ-Präfixe, die Abweichung liegt im zweistelligen Kilometerbereich — an einer
 * Staffelgrenze kann das den Satz kippen. Deshalb immer die genaue Ermittlung nachziehen.
 */
export function schaetzeEntfernungAbWerkKm(plzOrt?: string | null): EntfernungsErgebnis | null {
  const plz = extrahierePlz(plzOrt);
  if (!plz) return null;

  const ziel = geocodeByPLZ(plz);
  if (!ziel) return null;

  return {
    km: Math.round(berechneStrassenEntfernungKm(WERK_KOORDINATEN, ziel) * 10) / 10,
    quelle: 'schaetzung',
  };
}

/**
 * Genaue Ermittlung der einfachen Strecke Verladestelle -> Abladestelle.
 *
 * Nutzt dieselbe gecachte Routenberechnung wie der Lieferkosten-Vorschlag. Fällt intern
 * auf eine Schätzung zurück, wenn das Geocoding scheitert — deshalb wird das Ergebnis hier
 * nicht als 'route' ausgewiesen, wenn es der Schätzung entspricht.
 *
 * @param plzOrt - Lieferadresse in der Form "97232 Giebelstadt"
 * @returns Entfernung in km oder null, wenn keine PLZ erkennbar ist
 */
export async function ermittleEntfernungAbWerkKm(
  plzOrt?: string | null
): Promise<EntfernungsErgebnis | null> {
  const plz = extrahierePlz(plzOrt);
  if (!plz) return null;

  // Abholung am Werk: keine Fahrt, keine Staffel
  if (plz === WERK_PLZ) {
    return { km: 0, quelle: 'route' };
  }

  try {
    const km = await berechneDistanzVonPLZ(WERK_PLZ, plz);
    if (Number.isFinite(km) && km > 0) {
      return { km: Math.round(km * 10) / 10, quelle: 'route' };
    }
  } catch (error) {
    console.warn('Entfernung konnte nicht über die Route ermittelt werden:', error);
  }

  return schaetzeEntfernungAbWerkKm(plzOrt);
}

/**
 * Wählt die für die Lieferung maßgebliche Adresse: abweichende Lieferadresse vor
 * Kundenadresse. Dieselbe Reihenfolge wie im Lieferkosten-Vorschlag des Angebots.
 */
export function getMassgeblichePlzOrt(daten: {
  lieferadresseAbweichend?: boolean;
  lieferadressePlzOrt?: string;
  kundenPlzOrt?: string;
}): string | undefined {
  if (daten.lieferadresseAbweichend && daten.lieferadressePlzOrt) {
    return daten.lieferadressePlzOrt;
  }
  return daten.kundenPlzOrt;
}

/** Formatiert eine Entfernung für die Anzeige ("83 km") */
export function formatEntfernung(km: number): string {
  return `${Math.round(km)} km`;
}
