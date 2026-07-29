import { Projekt } from '../types/projekt';
import { SaisonKunde } from '../types/saisonplanung';

/**
 * Wörter, die für ein Platzbauer-Kürzel keine Information tragen (Rechtsformen,
 * Branchenzusätze). Werden vor der Kürzel-Bildung entfernt, damit aus
 * "Vogel Tennisplatzbau GmbH" ein "VOG" wird und nicht ein "VTG".
 */
const KUERZEL_STOPWOERTER = new Set([
  'gmbh', 'mbh', 'ug', 'ag', 'kg', 'kgaa', 'ohg', 'gbr', 'ek', 'e.k', 'e.k.', 'co',
  'und', 'sohn', 'söhne', 'gebr', 'gebrüder',
  'bau', 'platzbau', 'tennisplatzbau', 'sportanlagenbau', 'sportstättenbau',
  'sportanlagen', 'garten', 'landschaftsbau', 'galabau', 'tennisanlagen',
]);

/**
 * Bildet ein kurzes Kürzel aus dem Platzbauer-Namen.
 * Ein Wort → erste drei Buchstaben ("Vogel" → "VOG"),
 * mehrere Wörter → Initialen der ersten drei ("Meier Schmitt" → "MS").
 */
export function getPlatzbauerKuerzel(name?: string): string {
  if (!name) return '';

  const woerter = name
    .replace(/[.,()]/g, ' ')
    .split(/[\s\-/&+]+/)
    .filter(Boolean);

  const relevant = woerter.filter(w => !KUERZEL_STOPWOERTER.has(w.toLowerCase()));
  // Wenn nur Rechtsform/Branchenwörter übrig bleiben (z.B. "Platzbau GmbH"),
  // lieber den Originalnamen nutzen als ein leeres Kürzel.
  const basis = relevant.length > 0 ? relevant : woerter;
  if (basis.length === 0) return '';

  if (basis.length === 1) {
    return basis[0].slice(0, 3).toUpperCase();
  }
  return basis
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Läuft dieses Projekt über einen Platzbauer? Deckt alle drei Entstehungswege ab:
 * Anlage über die Platzbauer-Verwaltung (setzt `istPlatzbauerprojekt` + `platzbauerId`),
 * automatische Zuordnung beim Anlegen (setzt nur `istPlatzbauerprojekt`) und
 * manuell gesetzten Bezugsweg.
 */
export function istPlatzbauProjekt(projekt: Projekt): boolean {
  const bezugsweg = (projekt.bezugsweg || '').toLowerCase();
  return (
    projekt.istPlatzbauerprojekt === true ||
    bezugsweg === 'ueber_platzbauer' ||
    bezugsweg === 'platzbauer' ||
    !!projekt.platzbauerId
  );
}

/**
 * Name des Platzbauers zu einem Projekt. Primär über `platzbauerId`, ersatzweise
 * über den am Verein hinterlegten Standard-Platzbauer (bei automatisch
 * zugeordneten Projekten ist `platzbauerId` am Projekt nicht gesetzt).
 */
export function getPlatzbauerName(
  projekt: Projekt,
  kundenMap: Map<string, SaisonKunde>
): string | undefined {
  if (projekt.platzbauerId) {
    const direkt = kundenMap.get(projekt.platzbauerId);
    if (direkt) return direkt.name;
  }

  const verein = projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined;
  if (verein?.standardPlatzbauerId) {
    return kundenMap.get(verein.standardPlatzbauerId)?.name;
  }

  return undefined;
}
