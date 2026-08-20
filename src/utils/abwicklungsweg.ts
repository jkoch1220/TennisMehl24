/**
 * Der Abwicklungsweg eines Projekts — wie die Ware zum Verein kommt.
 *
 * Fünf Wege mit völlig verschiedenen Arbeitsschritten:
 * - Schüttgut fährt der eigene LKW, es braucht Tourplanung und einen Wiegeschein.
 * - Palettenware geht über eine Spedition, teils mit Ladekran beim Verein.
 * - Hydrocourt wird beim Lieferanten bestellt und von dort direkt zugestellt.
 * - Universal wird per Lieferschein beim Lieferanten abgerufen.
 * - Abholung heißt: Der Verein holt selbst ab, zu Ab-Werk-Preisen. Das ist KEINE
 *   Warenart, sondern der Verzicht auf unseren Transport — abgeholt wird alles:
 *   loses Schüttgut, einzelne Säcke, ganze Paletten, BigBags. Deshalb steht
 *   „Abholung" neben der Warenart, nicht an ihrer Stelle.
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
import { parseMaterialAufschluesselung } from './dispoMaterialParser';
import { istShopProjekt } from './projektHerkunft';

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

  // WARENART aus den Positionen — unabhängig davon, wer sie transportiert.
  // Der Parser kennt die Artikelnummern und trennt lose Ware, Sackware auf
  // Paletten und BigBags sauber.
  const material = parseMaterialAufschluesselung(projekt);
  if (material.gesamtLose > 0) wege.add('schuettgut');
  if (material.hatPalettenware || material.hatBigBag) wege.add('palette');

  // Sagen die Positionen eindeutig „nur Gebinde, nichts loses", widersprechen sie
  // damit einer Belieferungsart wie „mit Hänger". Beide sind wahr: Die Ware ist
  // Palettenware, gefahren wird sie vom eigenen LKW. Die Belieferungsart benennt
  // das FAHRZEUG, nicht den Inhalt — deshalb gewinnen hier die Positionen.
  // Für die Frage „fährt unser LKW?" gibt es faehrtEigenerLkw().
  const positionenSchliessenLosesAus =
    material.gesamtLose === 0 && (material.hatPalettenware || material.hatBigBag);

  // TRANSPORTWEG aus der Belieferungsart. Wichtig: Abholung ab Werk ist KEINE
  // Warenart, sondern der Verzicht auf unseren Transport — der Verein holt
  // selbst ab, zu Ab-Werk-Preisen. Abgeholt werden kann alles: loses Schüttgut
  // ebenso wie einzelne Säcke, ganze Paletten oder BigBags. Deshalb steht
  // „Abholung" NEBEN der Warenart und nicht an ihrer Stelle — sonst verschwände
  // ein abgeholter Palettenauftrag aus dem Palettenfilter.
  switch (projekt.belieferungsart) {
    case 'abholung_ab_werk':
      wege.add('abholung');
      break;
    case 'palette_mit_ladekran':
      // Eigener Weg, weil beim Verein ein Kran bereitstehen muss — das ist ein
      // Termin, den jemand koordiniert, keine bloße Speditionslieferung.
      wege.add('kranwagen');
      wege.add('palette');
      break;
    case 'bigbag':
      wege.add('palette');
      break;
    case 'nur_motorwagen':
    case 'mit_haenger':
      if (!positionenSchliessenLosesAus) wege.add('schuettgut');
      break;
    default:
      break;
  }

  // Ohne erkennbare Warenart, aber mit Dispo-Bezug: Es wird gefahren, nur ist
  // noch nicht hinterlegt womit. Als Schüttgut führen ist näher an der Wahrheit
  // als gar nichts — der überwiegende Teil des Direktgeschäfts ist lose Ware.
  // Greift bewusst NICHT, wenn bereits „Abholung" gesetzt ist: Dann wäre die
  // Warenart geraten, obwohl wir gar nicht fahren.
  // Greift ebenfalls NICHT bei Shop-Aufträgen: Der Shop verkauft Sackware,
  // BigBags und Zubehör, kein loses Material per LKW. „Es hat einen Dispo-Bezug,
  // also ist es Schüttgut" ist eine Regel aus dem Direktgeschäft und trifft dort
  // systematisch daneben.
  const nurTransportweg = [...wege].every((w) => w === 'abholung' || w === 'kranwagen');
  if (nurTransportweg && projekt.dispoStatus && !wege.has('abholung') && !istShopProjekt(projekt)) {
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

/**
 * Ist für diesen Vorgang überhaupt ein Wiegeschein zu erwarten?
 *
 * Gewogen wird loses Material: Der eigene LKW fährt über die Brücke, und auch
 * wer ab Werk abholt, fährt über die Waage. Palettenware, Sackware, Hydrocourt
 * und Universal-Artikel werden gezählt, nicht gewogen — dort einen Wiegeschein
 * anzumahnen erzeugt eine Warnung, die niemand je erfüllen kann.
 *
 * `null` heißt „noch nicht entscheidbar": Solange die Warenart nicht feststeht,
 * ist jede Aussage geraten. Aufrufer sollen dann schweigen, nicht mahnen.
 */
export function wiegescheinVorgesehen(projekt: Projekt): boolean | null {
  const wege = getAbwicklungswege(projekt);
  if (wege.size === 0) return null;
  if (wege.has('schuettgut') || wege.has('abholung')) return true;
  // Reine Paletten-/Fremdbezugswege: nichts zu wiegen.
  return false;
}

/**
 * Fährt dieser Auftrag mit unserem eigenen LKW?
 *
 * Nicht dasselbe wie „ist Schüttgut": Ein Hängerzug kann auch Paletten fahren,
 * und genau das tut er bei Sackware-Aufträgen im Umkreis. Wer die eigene Dispo
 * über den Schüttgut-Weg zählt, verliert diese Aufträge an die Speditionsspalte,
 * in die sie nicht gehören.
 *
 * Abholung ab Werk ist ausgeschlossen — dort fahren wir gerade nicht.
 */
export function faehrtEigenerLkw(projekt: Projekt): boolean {
  if (projekt.belieferungsart === 'abholung_ab_werk') return false;
  if (projekt.belieferungsart === 'nur_motorwagen' || projekt.belieferungsart === 'mit_haenger') {
    return true;
  }
  // Ohne hinterlegte Belieferungsart ist der Dispo-Bezug das beste Indiz: Der
  // Auftrag ist in der eigenen Tourenplanung gelandet.
  if (projekt.dispoStatus) return true;
  return getAbwicklungswege(projekt).has('schuettgut');
}
