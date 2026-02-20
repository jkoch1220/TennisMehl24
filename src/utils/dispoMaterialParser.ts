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
 * Transport-Typ für Dispo-Planung
 * - eigenlager: Schüttgut + Beiladung → eigener LKW
 * - spedition: Palettenware + BigBag → externe Spedition (z.B. Raben)
 * - gemischt: Beides in einem Auftrag → muss separat geplant werden
 */
export type TransportTyp = 'eigenlager' | 'spedition' | 'gemischt';

/**
 * Beiladungs-Hinweis für Disponenten
 */
export interface BeiladungsHinweis {
  anzeigeText: string;    // z.B. "25× 0-2 + 10× 0-3"
  dringend: boolean;      // true wenn Beiladung UND loses Material vorhanden
  anzahlSaecke02: number;
  anzahlSaecke03: number;
}

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

  // Palettenware in Tonnen (TM-ZM-02St, TM-ZM-03St)
  palettenTonnen02: number;
  palettenTonnen03: number;

  // BigBag in Tonnen (TM-ZM-BIG-02, TM-ZM-BIG-03)
  bigBagTonnen02: number;
  bigBagTonnen03: number;

  // Summen
  gesamtLose: number;      // lose02 + lose03
  gesamtGesackt: number;   // gesackt02 + gesackt03
  gesamtPalette: number;   // palettenTonnen02 + palettenTonnen03
  gesamtBigBag: number;    // bigBagTonnen02 + bigBagTonnen03
  gesamtSpedition: number; // gesamtPalette + gesamtBigBag
  gesamtTonnen: number;    // Alles zusammen

  // Flags
  hatSackware: boolean;
  hatBeiladung: boolean;
  istPalettenware: boolean;
  hatPalettenware: boolean;  // Hat TM-ZM-02St oder TM-ZM-03St
  hatBigBag: boolean;        // Hat TM-ZM-BIG-02 oder TM-ZM-BIG-03
  hatSpeditionsware: boolean; // hatPalettenware ODER hatBigBag

  // Transport-Klassifizierung
  transportTyp: TransportTyp;

  // Beiladungs-Hinweis (nur wenn hatBeiladung UND gesamtLose > 0)
  beiladungsHinweis: BeiladungsHinweis | null;

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
    palettenTonnen02: 0,
    palettenTonnen03: 0,
    bigBagTonnen02: 0,
    bigBagTonnen03: 0,
    gesamtLose: 0,
    gesamtGesackt: 0,
    gesamtPalette: 0,
    gesamtBigBag: 0,
    gesamtSpedition: 0,
    gesamtTonnen: 0,
    hatSackware: false,
    hatBeiladung: false,
    istPalettenware: projekt.belieferungsart === 'palette_mit_ladekran',
    hatPalettenware: false,
    hatBigBag: false,
    hatSpeditionsware: false,
    transportTyp: 'eigenlager',
    beiladungsHinweis: null,
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
    const artikelnummerRaw = pos.artikelnummer || '';
    const artikelnummerUpper = artikelnummerRaw.toUpperCase();
    const menge = pos.menge || 0;
    const einheit = pos.einheit?.toLowerCase() || '';

    // Überspringe Bedarfspositionen und Nicht-Material-Artikel
    if (pos.istBedarfsposition) continue;

    // PE-Folie und Frachtkostenpauschale überspringen
    if (artikelnummerUpper === 'TM-PE' || artikelnummerUpper === 'TM-FP') continue;

    // Tennismehl-Artikel kategorisieren (Case-Insensitive Lookup)
    // Suche nach exaktem Match oder case-insensitive Match
    let artikelDef = TENNISMEHL_ARTIKEL[artikelnummerRaw] || TENNISMEHL_ARTIKEL[artikelnummerUpper];

    // Fallback: Suche case-insensitive durch alle Keys
    if (!artikelDef) {
      const matchingKey = Object.keys(TENNISMEHL_ARTIKEL).find(
        key => key.toUpperCase() === artikelnummerUpper
      );
      if (matchingKey) {
        artikelDef = TENNISMEHL_ARTIKEL[matchingKey];
      }
    }

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
        // Unterscheide: BigBag vs. normale Palettenware
        if (artikelnummerUpper.includes('BIG')) {
          // BigBag (TM-ZM-BIG-02, TM-ZM-BIG-03)
          if (koernung === '0-2') {
            result.bigBagTonnen02 += menge;
          } else if (koernung === '0-3') {
            result.bigBagTonnen03 += menge;
          }
          result.hatBigBag = true;
        } else {
          // Normale Palettenware (TM-ZM-02St, TM-ZM-03St)
          if (koernung === '0-2') {
            result.palettenTonnen02 += menge;
            result.gesackt02 += menge;
          } else if (koernung === '0-3') {
            result.palettenTonnen03 += menge;
            result.gesackt03 += menge;
          }
          result.hatPalettenware = true;
        }
        result.hatSackware = true;
      } else if (lieferart === 'beiladung') {
        // Beiladung (Stück → in Tonnen umrechnen)
        // WICHTIG: Prüfe ob es Paletten sind (z.B. "25x40kg" = 1t pro Palette)
        const bezeichnung = pos.bezeichnung?.toLowerCase() || '';
        const palettenMatch = bezeichnung.match(/(\d+)\s*x\s*(\d+)\s*kg/i);

        let tonnen: number;
        let istPalette = false;

        if (palettenMatch) {
          // Berechne Gewicht pro "Stück" aus dem Muster (z.B. "25x40kg" = 1000kg = 1t)
          const anzahlSaecke = parseInt(palettenMatch[1], 10);
          const gewichtProSack = parseInt(palettenMatch[2], 10);
          const tonnenProStueck = (anzahlSaecke * gewichtProSack) / 1000;
          tonnen = menge * tonnenProStueck;
          istPalette = tonnenProStueck >= 0.5; // Ab 500kg ist es eine Palette
        } else {
          // Fallback: Einzelne Säcke à 40kg
          tonnen = (menge * SACKWARE.GEWICHT_PRO_SACK_KG) / 1000;
        }

        if (koernung === '0-2') {
          result.gesackt02 += tonnen;
          result.palettenTonnen02 += tonnen;
          if (!istPalette) result.beiladungSaecke02 += menge;
        } else if (koernung === '0-3') {
          result.gesackt03 += tonnen;
          result.palettenTonnen03 += tonnen;
          if (!istPalette) result.beiladungSaecke03 += menge;
        }
        if (!istPalette) {
          result.hatBeiladung = true;
        }
        result.hatSackware = true;
        result.hatPalettenware = true;
      }
    } else {
      // Fallback: Artikel ohne Definition - nach Bezeichnung/Einheit kategorisieren
      const bezeichnung = pos.bezeichnung?.toLowerCase() || '';

      // Tonnen-Positionen verarbeiten
      if (einheit === 't' || einheit === 'to' || einheit === 'tonnen') {
        const ist02 = bezeichnung.includes('0/2') || bezeichnung.includes('0-2');
        const ist03 = bezeichnung.includes('0/3') || bezeichnung.includes('0-3');
        const istBigBag = bezeichnung.includes('bigbag') || bezeichnung.includes('big bag') || bezeichnung.includes('big-bag');
        const istSackware = bezeichnung.includes('gesackt') || bezeichnung.includes('sack');

        if (ist02 || ist03) {
          if (istBigBag) {
            // BigBag erkannt → Speditionsware
            if (ist02) {
              result.bigBagTonnen02 += menge;
            } else {
              result.bigBagTonnen03 += menge;
            }
            result.hatBigBag = true;
          } else if (istSackware) {
            // Sackware/Palettenware erkannt → Speditionsware
            if (ist02) {
              result.gesackt02 += menge;
              result.palettenTonnen02 += menge;
            } else {
              result.gesackt03 += menge;
              result.palettenTonnen03 += menge;
            }
            result.hatSackware = true;
            result.hatPalettenware = true;
          } else {
            // Weder BigBag noch Sack → loses Material (Schüttgut)
            if (ist02) {
              result.lose02 += menge;
            } else {
              result.lose03 += menge;
            }
          }
        } else {
          // Unbekannte Körnung - Default zu 0-2 lose
          result.lose02 += menge;
        }
      }
      // Stück-Positionen für Sackware/Paletten (z.B. "3 Stk Sackware")
      else if (einheit === 'stk' || einheit === 'stück') {
        const ist02 = bezeichnung.includes('0/2') || bezeichnung.includes('0-2');
        const ist03 = bezeichnung.includes('0/3') || bezeichnung.includes('0-3');
        const istSackware = bezeichnung.includes('sack') || bezeichnung.includes('gesackt');

        if (istSackware && (ist02 || ist03)) {
          // Prüfe ob es sich um Paletten handelt (z.B. "25x40kg" = 1t pro Palette)
          // Muster: "25x40kg", "25x 40kg", "25 x 40kg" etc.
          const palettenMatch = bezeichnung.match(/(\d+)\s*x\s*(\d+)\s*kg/i);

          let tonnenProStueck: number;
          let istPalette = false;

          if (palettenMatch) {
            // Berechne Gewicht pro "Stück" aus dem Muster
            const anzahlSaecke = parseInt(palettenMatch[1], 10);
            const gewichtProSack = parseInt(palettenMatch[2], 10);
            tonnenProStueck = (anzahlSaecke * gewichtProSack) / 1000;
            istPalette = tonnenProStueck >= 0.5; // Ab 500kg ist es eine Palette
          } else {
            // Fallback: Einzelne Säcke à 40kg
            tonnenProStueck = SACKWARE.GEWICHT_PRO_SACK_KG / 1000;
          }

          const tonnen = menge * tonnenProStueck;

          if (ist02) {
            result.gesackt02 += tonnen;
            result.palettenTonnen02 += tonnen;
            if (!istPalette) result.beiladungSaecke02 += menge;
          } else {
            result.gesackt03 += tonnen;
            result.palettenTonnen03 += tonnen;
            if (!istPalette) result.beiladungSaecke03 += menge;
          }
          result.hatSackware = true;
          result.hatPalettenware = true;
          if (!istPalette) {
            result.hatBeiladung = true;  // Wird später ggf. auf false gesetzt wenn kein Schüttgut
          }
        }
      }
    }
  }

  // Summen berechnen
  result.gesamtLose = result.lose02 + result.lose03;
  result.gesamtGesackt = result.gesackt02 + result.gesackt03;
  result.gesamtPalette = result.palettenTonnen02 + result.palettenTonnen03;
  result.gesamtBigBag = result.bigBagTonnen02 + result.bigBagTonnen03;

  // Speditionsware = BigBag + Palettenware
  // WICHTIG: Wenn kein Schüttgut vorhanden ist, zählt ALLE Sackware als Speditionsware!
  const hatSchuettgutTemp = result.lose02 + result.lose03 > 0;
  if (hatSchuettgutTemp) {
    // Mit Schüttgut: Nur Palette + BigBag sind Spedition (Beiladung geht mit dem LKW)
    result.gesamtSpedition = result.gesamtPalette + result.gesamtBigBag;
  } else {
    // Ohne Schüttgut: ALLE Sackware + BigBag sind Spedition
    result.gesamtSpedition = result.gesamtGesackt + result.gesamtBigBag;
  }

  result.gesamtTonnen = result.gesamtLose + result.gesamtGesackt + result.gesamtBigBag;

  // Speditionsware-Flag setzen
  result.hatSpeditionsware = result.hatPalettenware || result.hatBigBag;

  // Transport-Typ bestimmen
  // WICHTIG: "Beiladung" bedeutet Säcke die MIT dem Schüttgut-LKW mitfahren
  // Wenn es KEIN Schüttgut gibt, können Säcke nicht "beigeladen" werden
  // → Sie müssen dann per Spedition als Palettenware gehen!
  const hatSchuettgut = result.gesamtLose > 0;

  // Eigentransport nur wenn Schüttgut (ggf. mit Beiladung)
  const hatEigentransport = hatSchuettgut;

  // Spedition wenn: BigBag/Palette ODER Säcke ohne Schüttgut
  const hatSpedition = result.hatSpeditionsware ||
                       (result.hatSackware && !hatSchuettgut);

  if (hatEigentransport && hatSpedition) {
    result.transportTyp = 'gemischt';
  } else if (hatSpedition) {
    result.transportTyp = 'spedition';
  } else if (hatEigentransport) {
    result.transportTyp = 'eigenlager';
  } else {
    result.transportTyp = 'eigenlager'; // Fallback
  }

  // Beiladungs-Flag nur setzen wenn es AUCH Schüttgut gibt
  // (sonst gehen die Säcke per Spedition, nicht als Beiladung!)
  if (!hatSchuettgut) {
    result.hatBeiladung = false;
    result.beiladungSaecke02 = 0;
    result.beiladungSaecke03 = 0;
  }

  // Beiladungs-Hinweis erstellen (wenn Beiladung UND loses Material)
  if (result.hatBeiladung && result.gesamtLose > 0) {
    const parts: string[] = [];
    if (result.beiladungSaecke02 > 0) {
      parts.push(`${result.beiladungSaecke02}× 0-2`);
    }
    if (result.beiladungSaecke03 > 0) {
      parts.push(`${result.beiladungSaecke03}× 0-3`);
    }
    result.beiladungsHinweis = {
      anzeigeText: parts.join(' + '),
      dringend: true,
      anzahlSaecke02: result.beiladungSaecke02,
      anzahlSaecke03: result.beiladungSaecke03,
    };
  }

  // Fallback: Wenn keine Positionen gefunden, nutze liefergewicht/angefragteMenge
  if (result.gesamtTonnen === 0) {
    const fallbackMenge = projekt.liefergewicht || projekt.angefragteMenge || 0;

    // Prüfe Belieferungsart für korrekte Klassifizierung
    if (projekt.belieferungsart === 'palette_mit_ladekran' || projekt.belieferungsart === 'bigbag') {
      // Palettenware/BigBag → Spedition
      result.palettenTonnen02 = fallbackMenge;
      result.gesamtPalette = fallbackMenge;
      result.gesamtSpedition = fallbackMenge;
      result.gesamtGesackt = fallbackMenge;
      result.gesamtTonnen = fallbackMenge;
      result.hatPalettenware = true;
      result.hatSpeditionsware = true;
      result.hatSackware = true;
      result.transportTyp = 'spedition';
    } else {
      // Standard: 0-2 lose (Eigentransport)
      result.lose02 = fallbackMenge;
      result.gesamtLose = fallbackMenge;
      result.gesamtTonnen = fallbackMenge;
    }
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

/**
 * Gibt ein Label für den Transport-Typ zurück
 */
export function getTransportTypLabel(transportTyp: TransportTyp): string {
  switch (transportTyp) {
    case 'eigenlager': return 'Eigentransport';
    case 'spedition': return 'Spedition';
    case 'gemischt': return 'Gemischt';
    default: return '';
  }
}

/**
 * Gibt die Farbe für den Transport-Typ zurück (Tailwind-Klassen)
 */
export function getTransportTypFarbe(transportTyp: TransportTyp): { bg: string; text: string; border: string } {
  switch (transportTyp) {
    case 'eigenlager':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/50',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-300 dark:border-blue-700'
      };
    case 'spedition':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/50',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-300 dark:border-orange-700'
      };
    case 'gemischt':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/50',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-300 dark:border-amber-700'
      };
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-800',
        text: 'text-gray-500 dark:text-gray-400',
        border: 'border-gray-300 dark:border-gray-700'
      };
  }
}

/**
 * Prüft ob ein Auftrag Speditionsware enthält (für Filter)
 */
export function istSpeditionsauftrag(material: MaterialAufschluesselung): boolean {
  return material.hatSpeditionsware;
}

/**
 * Prüft ob ein Auftrag nur Speditionsware enthält (kein Eigentransport)
 */
export function istNurSpedition(material: MaterialAufschluesselung): boolean {
  return material.transportTyp === 'spedition';
}

/**
 * Prüft ob ein Auftrag Eigentransport-Material enthält
 */
export function istEigentransport(material: MaterialAufschluesselung): boolean {
  return material.gesamtLose > 0 || material.hatBeiladung;
}
