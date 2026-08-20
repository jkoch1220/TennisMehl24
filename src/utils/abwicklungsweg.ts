/**
 * Der Abwicklungsweg eines Projekts — wie die Ware zum Verein kommt.
 *
 * Fünf Wege mit völlig verschiedenen Arbeitsschritten:
 * - Schüttgut fährt der eigene LKW, es braucht Tourplanung und einen Wiegeschein.
 * - Palettenware geht über eine Spedition, teils mit Ladekran beim Verein.
 * - Hydrocourt wird beim Lieferanten bestellt und von dort direkt zugestellt.
 * - Universal wird per Lieferschein beim Lieferanten abgerufen.
 * - Abholung heißt: Der Verein holt selbst ab, wir tun nichts.
 *
 * Bewusst eine MENGE und kein einzelner Wert. Der Code hält „ein Projekt = eine
 * Produktart" nämlich nicht durch: Der Split in Teilprojekte ist freiwillig und
 * erst ab der Auftragsbestätigung möglich; für Schüttgut plus Palette gibt es ihn
 * gar nicht. Ein gemischter Auftrag ist der Normalfall, nicht die Ausnahme — und
 * ein Filter, der ihn nur einer Kategorie zuschlägt, versteckt ihn vor der
 * anderen.
 *
 * Vor der Auftragsbestätigung ist der Weg oft noch gar nicht bestimmbar: Die
 * Positionen stehen erst in der AB fest. Dann bleibt die Menge leer — das ist ein
 * ehrliches „noch offen", kein Fehler.
 */

import { Projekt } from '../types/projekt';
import { istHydrocourtProjekt, istUniversalProjekt } from './projektHerkunft';

export type Abwicklungsweg =
  | 'schuettgut'
  | 'palette'
  | 'kranwagen'
  | 'hydrocourt'
  | 'universal'
  | 'abholung';

export const ABWICKLUNGSWEG_LABEL: Record<Abwicklungsweg, string> = {
  schuettgut: 'Schüttgut',
  palette: 'Palette',
  kranwagen: 'Kranwagen',
  hydrocourt: 'Hydrocourt',
  universal: 'Universal',
  abholung: 'Abholung',
};

/** Kurzform für die Karte — muss neben Vereinsname und Termin Platz haben. */
export const ABWICKLUNGSWEG_KUERZEL: Record<Abwicklungsweg, string> = {
  schuettgut: 'LKW',
  palette: 'SPED',
  kranwagen: 'KRAN',
  hydrocourt: 'HYC',
  universal: 'UNI',
  abholung: 'ABH',
};

/** Reihenfolge in der Filterleiste — häufigster Weg zuerst. */
export const ABWICKLUNGSWEGE: Abwicklungsweg[] = [
  'schuettgut',
  'palette',
  'kranwagen',
  'hydrocourt',
  'universal',
  'abholung',
];

/**
 * Ermittelt alle Abwicklungswege, die an diesem Projekt hängen.
 *
 * Leere Menge heißt „noch nicht bestimmbar" — typischerweise ein Angebot, dessen
 * Positionen noch nicht feststehen.
 */
export function getAbwicklungswege(projekt: Projekt): Set<Abwicklungsweg> {
  const wege = new Set<Abwicklungsweg>();

  // Fremdbezug wird an den Positionen erkannt (Artikelnummer bzw. Universal-Flag)
  // und ist unabhängig von der Belieferungsart: Ein Projekt kann Hydrocourt UND
  // eigenes Schüttgut enthalten.
  if (istHydrocourtProjekt(projekt)) wege.add('hydrocourt');
  if (istUniversalProjekt(projekt)) wege.add('universal');

  switch (projekt.belieferungsart) {
    case 'abholung_ab_werk':
      wege.add('abholung');
      break;
    case 'palette_mit_ladekran':
      // Eigener Weg, weil beim Verein ein Kran bereitstehen muss — das ist ein
      // Termin, den jemand koordiniert, keine bloße Speditionslieferung.
      wege.add('kranwagen');
      break;
    case 'bigbag':
      wege.add('palette');
      break;
    case 'nur_motorwagen':
    case 'mit_haenger':
      wege.add('schuettgut');
      break;
    default:
      break;
  }

  // Ohne Belieferungsart, aber mit Dispo-Bezug: Es wird gefahren, nur ist noch
  // nicht hinterlegt womit. Als Schüttgut führen ist näher an der Wahrheit als
  // gar nichts — der überwiegende Teil des Direktgeschäfts ist lose Ware.
  if (wege.size === 0 && projekt.dispoStatus) {
    wege.add('schuettgut');
  }

  return wege;
}

/** Trägt das Projekt diesen Weg? Für die Filterleiste. */
export function hatAbwicklungsweg(projekt: Projekt, weg: Abwicklungsweg): boolean {
  return getAbwicklungswege(projekt).has(weg);
}

/**
 * Ist der Weg noch unbestimmt? Eigener Filterwert, damit diese Projekte nicht
 * still aus jeder Wegauswahl herausfallen.
 */
export function wegNochOffen(projekt: Projekt): boolean {
  return getAbwicklungswege(projekt).size === 0;
}
