/**
 * Wie viele Tonnen hängen an einem Projekt — und woher die Zahl stammt.
 *
 * Es gibt drei Quellen, und sie entstehen zu verschiedenen Zeitpunkten:
 *
 *   `liefergewicht`     Ist-Menge, gewogen. Entsteht ERST mit der Lieferung.
 *   Positionen          Soll-Menge aus AB bzw. Angebot. Steht ab Auftragserteilung.
 *   `angefragteMenge`   Soll-Menge aus der Anfrage. Frühester, gröbster Wert.
 *
 * Das Wochenbrett fragte bis 08/2026 nur `liefergewicht ?? angefragteMenge ?? 0`.
 * Da `angefragteMenge` in der Praxis nie gepflegt wird, hieß das faktisch: nur
 * das Ist-Gewicht. Gemessen an Saison 2026 stand damit die Tonnage genau
 * verkehrt herum — bei abgerechneten Projekten (12 von 12) korrekt, in der
 * Planungsphase dagegen bei 8 von 9 auftragsbestätigten Projekten auf „0 t",
 * obwohl die Menge in den Positionen liegt. Für ein Planungswerkzeug ist das die
 * falsche Hälfte.
 *
 * Wichtig ist die Unterscheidung zwischen „null Tonnen" und „Menge unbekannt".
 * Eine Wochensumme, die unbekannte Mengen still als 0 zählt, sieht vollständig
 * aus und ist es nicht — deshalb gibt `summiereTonnage` beides zurück.
 */

import { Projekt } from '../types/projekt';
import { parseMaterialAufschluesselung } from './dispoMaterialParser';

export type TonnageQuelle = 'gewogen' | 'beauftragt' | 'angefragt';

export interface ProjektTonnage {
  tonnen: number;
  quelle: TonnageQuelle;
}

const QUELLE_LABEL: Record<TonnageQuelle, string> = {
  gewogen: 'gewogene Liefermenge',
  beauftragt: 'beauftragte Menge laut Positionen',
  angefragt: 'angefragte Menge',
};

/** Ausgeschriebene Herkunft der Zahl, für Tooltips. */
export function tonnageQuelleLabel(quelle: TonnageQuelle): string {
  return QUELLE_LABEL[quelle];
}

/**
 * Die belastbarste verfügbare Menge eines Projekts, oder `null`, wenn keine
 * Quelle etwas hergibt.
 *
 * Reihenfolge nach Verbindlichkeit: Was gewogen wurde, schlägt was beauftragt
 * wurde, und das schlägt was angefragt wurde.
 */
export function projektTonnage(projekt: Projekt): ProjektTonnage | null {
  if (projekt.liefergewicht && projekt.liefergewicht > 0) {
    return { tonnen: projekt.liefergewicht, quelle: 'gewogen' };
  }

  // Der Parser rechnet Sackware und BigBags bereits in Tonnen um und lässt
  // Pauschalen und Zuschläge außen vor (siehe NICHT_MATERIAL_ARTIKEL).
  //
  // `ausFallback` ist hier entscheidend: Findet der Parser keine Positionen,
  // greift er selbst auf `liefergewicht`/`angefragteMenge` zurück. Diese Zahl als
  // „beauftragte Menge laut Positionen" auszuweisen wäre falsch — sie stammt aus
  // der Anfrage und ist entsprechend grob.
  const material = parseMaterialAufschluesselung(projekt);
  if (material.gesamtTonnen > 0 && !material.ausFallback) {
    return { tonnen: material.gesamtTonnen, quelle: 'beauftragt' };
  }

  if (projekt.angefragteMenge && projekt.angefragteMenge > 0) {
    return { tonnen: projekt.angefragteMenge, quelle: 'angefragt' };
  }

  return null;
}

export interface TonnageSumme {
  /** Summe über alle Projekte, deren Menge bekannt ist. */
  tonnen: number;
  /** Projekte ohne jede Mengenangabe — die Summe ist um sie unvollständig. */
  unbekannt: number;
  /** Enthält die Summe mindestens einen noch nicht gewogenen Wert? */
  enthaeltPrognose: boolean;
}

/**
 * Summiert eine Gruppe und sagt dazu, wie belastbar die Summe ist.
 *
 * `unbekannt` gehört mit angezeigt: Eine Wochensumme über zehn Aufträge, von
 * denen vier keine Mengenangabe haben, ist keine Wochenmenge — und wer sie für
 * eine hält, plant zu wenig Fahrzeuge ein.
 */
export function summiereTonnage(projekte: Projekt[]): TonnageSumme {
  let tonnen = 0;
  let unbekannt = 0;
  let enthaeltPrognose = false;

  for (const projekt of projekte) {
    const t = projektTonnage(projekt);
    if (!t) {
      unbekannt += 1;
      continue;
    }
    tonnen += t.tonnen;
    if (t.quelle !== 'gewogen') enthaeltPrognose = true;
  }

  return { tonnen, unbekannt, enthaeltPrognose };
}
