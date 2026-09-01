/**
 * Wie viele Tonnen Ware stehen in einem Angebot?
 *
 * Daran hängt die Frachtkostenpauschale, deren Staffel bei 5,4 / 7,4 / 11,4 /
 * 15,4 / 19,9 t springt (`frachtkostenCalculations.ts`). Ein Fehler von einer
 * Tonne kann den Preis also eine Stufe verschieben.
 *
 * Bis 08/2026 zählte das Angebot schlicht jede Position mit der Einheit „t".
 * Das ging gut, solange nur Ziegelmehl in Tonnen abgerechnet wurde — aber
 * Dienstleistungen tragen dieselbe Einheit:
 *
 *   TM-HYC-V   Hydrocourt-Versandpauschale, Einheit „t", ist aber Fracht
 *   TM-FP      Frachtkostenpauschale selbst
 *   TM-PE      PE-Folie
 *
 * Eine Hydrocourt-Zeile mit Menge 1 erzeugte so eine Phantom-Tonne. Bei 11,0 t
 * echter Ware sprang die Staffel dadurch auf die nächste Stufe, und der Kunde
 * bekam eine zu teure Fracht berechnet.
 *
 * Zusätzlich bleiben Bedarfspositionen außen vor: Sie sind ausdrücklich noch
 * nicht bestellt und dürfen keine Fracht auslösen.
 */
import { Position } from '../types/projektabwicklung';
import { istTonnageRelevantePosition, summierePositionsTonnen } from './tonnage';

/**
 * Seit Stufe 2 (08/2026) delegiert dieses Modul an die zentrale Zähllogik in
 * `tonnage.ts` (Zweck 'fracht' — die preisrelevante Staffel-Semantik).
 * Die Wrapper bleiben, damit die vielen Aufrufer ihre gewohnte API behalten.
 */

/** Zählt diese Position als gelieferte Ware? */
export const istTonnagePosition = (position: Pick<Position, 'einheit' | 'artikelnummer' | 'menge' | 'istBedarfsposition'>): boolean =>
  istTonnageRelevantePosition(position, 'fracht');

/** Summe der tatsächlich zu liefernden Tonnage über mehrere Positionslisten. */
export const summiereTonnage = (
  ...listen: Array<Array<Pick<Position, 'einheit' | 'artikelnummer' | 'menge' | 'istBedarfsposition'>>>
): number => summierePositionsTonnen(listen.flat(), 'fracht');
