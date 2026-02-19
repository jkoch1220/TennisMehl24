/**
 * Dispo Material Parser
 *
 * Extrahiert Material-Aufschlüsselung aus Projekt-Positionen für die Dispo-Planung.
 * Unterscheidet zwischen:
 * - 0-2 lose (Schüttgut)
 * - 0-3 lose (Schüttgut)
 * - 0-2 gesackt (Sackware/Beiladung)
 * - 0-3 gesackt (Sackware/Beiladung)
 * - Palettenware
 */

import { Projekt } from '../types/projekt';
import { Position, AuftragsbestaetigungsDaten } from '../types/projektabwicklung';
import { TENNISMEHL_ARTIKEL, SACKWARE } from '../constants/artikelPreise';

/**
 * Material-Aufschlüsselung für Dispo-Anzeige
 */
export interface MaterialAufschluesselung {
  // Loses Material (Schüttgut) in Tonnen
  lose02: number;
  lose03: number;

  // Sackware in Tonnen (inkl. Beiladung, umgerechnet)
  gesackt02: number;
  gesackt03: number;

  // Beiladung in Stück (Säcke)
  beiladungSaecke02: number;
  beiladungSaecke03: number;

  // Summen
  gesamtLose: number;      // lose02 + lose03
  gesamtGesackt: number;   // gesackt02 + gesackt03
  gesamtTonnen: number;    // Alles zusammen

  // Flags
  hatSackware: boolean;
  hatBeiladung: boolean;
  istPalettenware: boolean;

  // Belieferungsart aus Projekt
  belieferungsart?: string;
}

/**
 * Parst die Positionen aus den Auftragsbestätigungs-Daten eines Projekts
 * und erstellt eine Material-Aufschlüsselung.
 */
export function parseMaterialAufschluesselung(projekt: Projekt): MaterialAufschluesselung {
  const result: MaterialAufschluesselung = {
    lose02: 0,
    lose03: 0,
    gesackt02: 0,
    gesackt03: 0,
    beiladungSaecke02: 0,
    beiladungSaecke03: 0,
    gesamtLose: 0,
    gesamtGesackt: 0,
    gesamtTonnen: 0,
    hatSackware: false,
    hatBeiladung: false,
    istPalettenware: projekt.belieferungsart === 'palette_mit_ladekran',
    belieferungsart: projekt.belieferungsart,
  };

  // Versuche Positionen aus auftragsbestaetigungsDaten zu parsen
  let positionen: Position[] = [];

  if (projekt.auftragsbestaetigungsDaten) {
    try {
      const abDaten: AuftragsbestaetigungsDaten =
        typeof projekt.auftragsbestaetigungsDaten === 'string'
          ? JSON.parse(projekt.auftragsbestaetigungsDaten)
          : projekt.auftragsbestaetigungsDaten;

      positionen = abDaten.positionen || [];
    } catch (e) {
      console.warn('Fehler beim Parsen der AB-Daten:', e);
    }
  }

  // Falls keine AB-Positionen, versuche Angebots-Positionen
  if (positionen.length === 0 && projekt.angebotsDaten) {
    try {
      const angDaten =
        typeof projekt.angebotsDaten === 'string'
          ? JSON.parse(projekt.angebotsDaten)
          : projekt.angebotsDaten;

      positionen = angDaten.positionen || [];
    } catch (e) {
      console.warn('Fehler beim Parsen der Angebots-Daten:', e);
    }
  }

  // Positionen durchgehen und kategorisieren
  for (const pos of positionen) {
    const artikelnummer = pos.artikelnummer?.toUpperCase() || '';
    const menge = pos.menge || 0;
    const einheit = pos.einheit?.toLowerCase() || '';

    // Überspringe Bedarfspositionen und Nicht-Material-Artikel
    if (pos.istBedarfsposition) continue;

    // PE-Folie und Frachtkostenpauschale überspringen
    if (artikelnummer === 'TM-PE' || artikelnummer === 'TM-FP') continue;

    // Tennismehl-Artikel kategorisieren
    const artikelDef = TENNISMEHL_ARTIKEL[artikelnummer];

    if (artikelDef) {
      const koernung = artikelDef.koernung;
      const lieferart = artikelDef.lieferart;

      if (lieferart === 'lose') {
        // Loses Material (Schüttgut)
        if (koernung === '0-2') {
          result.lose02 += menge;
        } else if (koernung === '0-3') {
          result.lose03 += menge;
        }
      } else if (lieferart === 'gesackt') {
        // Sackware (Tonnen)
        if (koernung === '0-2') {
          result.gesackt02 += menge;
        } else if (koernung === '0-3') {
          result.gesackt03 += menge;
        }
        result.hatSackware = true;
      } else if (lieferart === 'beiladung') {
        // Beiladung (Stück → in Tonnen umrechnen)
        const tonnen = (menge * SACKWARE.GEWICHT_PRO_SACK_KG) / 1000;
        if (koernung === '0-2') {
          result.gesackt02 += tonnen;
          result.beiladungSaecke02 += menge;
        } else if (koernung === '0-3') {
          result.gesackt03 += tonnen;
          result.beiladungSaecke03 += menge;
        }
        result.hatBeiladung = true;
        result.hatSackware = true;
      }
    } else {
      // Fallback: Artikel ohne Definition - nach Bezeichnung/Einheit kategorisieren
      const bezeichnung = pos.bezeichnung?.toLowerCase() || '';

      // Nur Tonnen-Positionen berücksichtigen
      if (einheit === 't' || einheit === 'to' || einheit === 'tonnen') {
        if (bezeichnung.includes('0/2') || bezeichnung.includes('0-2')) {
          if (bezeichnung.includes('gesackt') || bezeichnung.includes('sack')) {
            result.gesackt02 += menge;
            result.hatSackware = true;
          } else {
            result.lose02 += menge;
          }
        } else if (bezeichnung.includes('0/3') || bezeichnung.includes('0-3')) {
          if (bezeichnung.includes('gesackt') || bezeichnung.includes('sack')) {
            result.gesackt03 += menge;
            result.hatSackware = true;
          } else {
            result.lose03 += menge;
          }
        } else {
          // Unbekannte Körnung - Default zu 0-2 lose
          result.lose02 += menge;
        }
      }
    }
  }

  // Summen berechnen
  result.gesamtLose = result.lose02 + result.lose03;
  result.gesamtGesackt = result.gesackt02 + result.gesackt03;
  result.gesamtTonnen = result.gesamtLose + result.gesamtGesackt;

  // Fallback: Wenn keine Positionen gefunden, nutze liefergewicht/angefragteMenge
  if (result.gesamtTonnen === 0) {
    const fallbackMenge = projekt.liefergewicht || projekt.angefragteMenge || 0;
    // Ohne weitere Info nehmen wir 0-2 lose an
    result.lose02 = fallbackMenge;
    result.gesamtLose = fallbackMenge;
    result.gesamtTonnen = fallbackMenge;
  }

  return result;
}

/**
 * Formatiert die Material-Aufschlüsselung für Anzeige
 */
export function formatMaterialKurz(material: MaterialAufschluesselung): string {
  const parts: string[] = [];

  if (material.lose02 > 0) {
    parts.push(`${material.lose02}t 0-2`);
  }
  if (material.lose03 > 0) {
    parts.push(`${material.lose03}t 0-3`);
  }
  if (material.gesamtGesackt > 0) {
    parts.push(`${material.gesamtGesackt.toFixed(1)}t Sack`);
  }

  if (parts.length === 0) {
    return `${material.gesamtTonnen}t`;
  }

  return parts.join(' + ');
}

/**
 * Gibt ein Label für die Belieferungsart zurück
 */
export function getBelieungsartLabel(belieferungsart?: string): string {
  switch (belieferungsart) {
    case 'nur_motorwagen': return 'MW';
    case 'mit_haenger': return 'MW+H';
    case 'abholung_ab_werk': return 'Abholung';
    case 'palette_mit_ladekran': return 'Palette';
    case 'bigbag': return 'BigBag';
    default: return '';
  }
}

/**
 * Gibt die Farbe für die Belieferungsart zurück (Tailwind-Klassen)
 */
export function getBelieungsartFarbe(belieferungsart?: string): { bg: string; text: string } {
  switch (belieferungsart) {
    case 'nur_motorwagen':
      return { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300' };
    case 'mit_haenger':
      return { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300' };
    case 'abholung_ab_werk':
      return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' };
    case 'palette_mit_ladekran':
      return { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-300' };
    case 'bigbag':
      return { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-300' };
    default:
      return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' };
  }
}
