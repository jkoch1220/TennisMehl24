/**
 * lieferscheinWarnings.ts
 *
 * Utility zur Erkennung von Sonderpositionen in Lieferscheinen.
 * Warnt bei speziellen Artikeln, die beim Beladen besondere Aufmerksamkeit erfordern.
 */

import { LieferscheinPosition } from '../types/projektabwicklung';

// Warning Severity Levels
export type WarningSeverity = 'critical' | 'important';

// Warning Types für verschiedene Sonderpositionen
export type WarningType =
  | '03_material'    // 0/3 statt 0/2 Material
  | 'sackware'       // Sackware Beiladung auf dem LKW
  | 'bigbag'         // BigBag (braucht Kran/Stapler)
  | 'universal'      // Universal-Artikel (Fremdprodukt)
  | 'hydrocourt';    // Hydrocourt-Material

// Interface für ein einzelnes Position-Warning
export interface PositionWarning {
  positionId: string;
  artikelnummer: string;
  artikel: string;
  menge: number;
  einheit: string;
  severity: WarningSeverity;
  warningType: WarningType;
  message: string;
  /** Zusätzliche Details (z.B. berechnete Säcke-Anzahl) */
  details?: string;
}

// Interface für aggregierte Warnings pro Lieferschein
export interface LieferscheinWarnings {
  lieferscheinKey: string;
  stopIndex: number;
  kundenname: string;
  warnings: PositionWarning[];
  hatKritisch: boolean;
  hatWichtig: boolean;
}

// Artikelnummern die IGNORIERT werden (kein Warning)
const IGNORIERTE_ARTIKELNUMMERN = new Set([
  'TM-ZM-02',     // Standard-Schüttgut 0/2
  'TM-ZM-02St',   // Spedition Raben (nicht eigener LKW)
  'TM-ZM-03St',   // Spedition Raben (nicht eigener LKW)
  'TM-PE',        // PE-Folie (Standardzubehör)
  'TM-FP',        // Frachtkostenpauschale
  'TM-PAL',       // Palette
]);

/**
 * Berechnet die Anzahl Säcke aus einer Tonnage
 * 1 Sack = 40kg = 0.04t
 */
const berechneSaeckeAnzahl = (menge: number, einheit: string): number => {
  let tonnen = menge;
  if (einheit === 'kg') {
    tonnen = menge / 1000;
  }
  return Math.round(tonnen / 0.04); // 40kg pro Sack
};

/**
 * Prüft ob eine Artikelnummer auf Speditions-Versand hinweist
 * (TM-ZM-02St, TM-ZM-03St → gehen über Raben, nicht eigener LKW)
 */
const istSpeditionsArtikel = (artikelnummer: string): boolean => {
  if (!artikelnummer) return false;
  return artikelnummer.endsWith('St');
};

/**
 * Erkennt Sonderpositionen in einer Liste von Lieferschein-Positionen.
 *
 * @param positionen - Array von LieferscheinPosition
 * @returns Array von PositionWarning für alle erkannten Sonderpositionen
 */
export const erkenneSonderPositionen = (positionen: LieferscheinPosition[]): PositionWarning[] => {
  const warnings: PositionWarning[] = [];

  for (const pos of positionen) {
    const artNr = (pos.artikelnummer || '').trim().toUpperCase();
    const artikel = (pos.artikel || '').trim();

    // Früher Exit: Ignorierte Artikel
    if (IGNORIERTE_ARTIKELNUMMERN.has(pos.artikelnummer || '')) {
      continue;
    }

    // Früher Exit: Speditions-Artikel (gehen über Raben)
    if (istSpeditionsArtikel(pos.artikelnummer || '')) {
      continue;
    }

    // === KRITISCH: 0/3 Material (enthält "03" aber NICHT "St" am Ende) ===
    // Matches: TM-ZM-03, TM-ZM-03S, TM-ZM-BIG-03
    if (artNr.includes('03') && !artNr.endsWith('ST')) {
      warnings.push({
        positionId: pos.id,
        artikelnummer: pos.artikelnummer || '-',
        artikel,
        menge: pos.menge,
        einheit: pos.einheit,
        severity: 'critical',
        warningType: '03_material',
        message: '⚠️ ACHTUNG: 0/3 Material statt 0/2! Richtiges Silo verwenden!',
      });
      // Weiter prüfen für kombinierte Warnings (z.B. 0/3 + Sackware)
    }

    // === KRITISCH: Sackware Beiladung (endet auf "S" aber nicht "St") ===
    // Matches: TM-ZM-02S, TM-ZM-03S
    if (artNr.endsWith('S') && !artNr.endsWith('ST')) {
      const saecke = berechneSaeckeAnzahl(pos.menge, pos.einheit);
      warnings.push({
        positionId: pos.id,
        artikelnummer: pos.artikelnummer || '-',
        artikel,
        menge: pos.menge,
        einheit: pos.einheit,
        severity: 'critical',
        warningType: 'sackware',
        message: `⚠️ SACKWARE auf dem LKW! ${saecke} Säcke à 40kg einladen!`,
        details: `${saecke} Säcke`,
      });
      continue; // Bereits gewarnt, keine weiteren Checks
    }

    // === WICHTIG: BigBag (enthält "BIG") ===
    // Matches: TM-ZM-BIG-02, TM-ZM-BIG-03
    if (artNr.includes('BIG')) {
      warnings.push({
        positionId: pos.id,
        artikelnummer: pos.artikelnummer || '-',
        artikel,
        menge: pos.menge,
        einheit: pos.einheit,
        severity: 'important',
        warningType: 'bigbag',
        message: 'BigBag-Lieferung – Ablademöglichkeit beim Kunden sicherstellen',
      });
      continue;
    }

    // === WICHTIG: Hydrocourt ===
    if (artNr === 'TM-HYC' || (pos.artikelnummer || '') === 'TM-HYC') {
      warnings.push({
        positionId: pos.id,
        artikelnummer: pos.artikelnummer || '-',
        artikel,
        menge: pos.menge,
        einheit: pos.einheit,
        severity: 'important',
        warningType: 'hydrocourt',
        message: 'Hydrocourt-Material – Sonderverladung',
      });
      continue;
    }

    // === WICHTIG: Universal-Artikel ===
    // Erkennung: istUniversalArtikel Flag oder Bezeichnung beginnt mit "Universal:"
    const istUniversal =
      (pos as any).istUniversalArtikel === true ||
      artikel.toLowerCase().startsWith('universal:') ||
      artikel.toLowerCase().startsWith('universal ');

    if (istUniversal) {
      warnings.push({
        positionId: pos.id,
        artikelnummer: pos.artikelnummer || '-',
        artikel,
        menge: pos.menge,
        einheit: pos.einheit,
        severity: 'important',
        warningType: 'universal',
        message: 'Fremdprodukt – separat kommissionieren',
      });
      continue;
    }
  }

  return warnings;
};

/**
 * Prüft ob kritische Warnings in der Liste vorhanden sind
 */
export const hatKritischeWarnings = (warnings: PositionWarning[]): boolean => {
  return warnings.some(w => w.severity === 'critical');
};

/**
 * Prüft ob irgendwelche Warnings in der Liste vorhanden sind
 */
export const hatWarnings = (warnings: PositionWarning[]): boolean => {
  return warnings.length > 0;
};

/**
 * Filtert nur kritische Warnings
 */
export const filterKritischeWarnings = (warnings: PositionWarning[]): PositionWarning[] => {
  return warnings.filter(w => w.severity === 'critical');
};

/**
 * Filtert nur wichtige (nicht-kritische) Warnings
 */
export const filterWichtigeWarnings = (warnings: PositionWarning[]): PositionWarning[] => {
  return warnings.filter(w => w.severity === 'important');
};

/**
 * Zählt Warnings nach Severity
 */
export const zaehleWarnings = (warnings: PositionWarning[]): { kritisch: number; wichtig: number; gesamt: number } => {
  const kritisch = warnings.filter(w => w.severity === 'critical').length;
  const wichtig = warnings.filter(w => w.severity === 'important').length;
  return { kritisch, wichtig, gesamt: kritisch + wichtig };
};

/**
 * Gruppiert Warnings nach WarningType
 */
export const gruppiereNachTyp = (warnings: PositionWarning[]): Map<WarningType, PositionWarning[]> => {
  const grouped = new Map<WarningType, PositionWarning[]>();

  for (const warning of warnings) {
    const existing = grouped.get(warning.warningType) || [];
    existing.push(warning);
    grouped.set(warning.warningType, existing);
  }

  return grouped;
};

/**
 * Gibt ein Label für den Warning-Typ zurück
 */
export const getWarningTypeLabel = (type: WarningType): string => {
  switch (type) {
    case '03_material': return '0/3 Material';
    case 'sackware': return 'Sackware Beiladung';
    case 'bigbag': return 'BigBag';
    case 'universal': return 'Universal-Artikel';
    case 'hydrocourt': return 'Hydrocourt';
    default: return type;
  }
};
