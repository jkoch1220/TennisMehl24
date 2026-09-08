/**
 * Wie ein Projekt seinen Liefernachweis bekommt — und wie er zustande kam.
 *
 * Zwei Fragen, die leicht verwechselt werden:
 * - `erwartetAbholungsNachweis(projekt)`: Was steht BEVOR: Holt der Kunde ab?
 *   Dann unterschreibt er im Werk auf dem Handy, statt dass ein Fahrer beim
 *   Abladen fotografiert. Entscheidet die Belieferungsart.
 * - `istAbholungsNachweis(projekt)`: Was ist PASSIERT: Wurde der vorhandene
 *   Nachweis per Abholung erfasst? Entscheidet das gespeicherte `art`-Feld,
 *   nicht die Belieferungsart — die kann nachträglich umgestellt worden sein,
 *   und der Nachweis bleibt, was er war.
 */

import { Projekt } from '../types/projekt';

/** Holt der Kunde ab Werk ab? Dann läuft der Nachweis über die Unterschrift im Werk. */
export const erwartetAbholungsNachweis = (projekt: Pick<Projekt, 'belieferungsart'>): boolean =>
  projekt.belieferungsart === 'abholung_ab_werk';

/** Ist der vorhandene Liefernachweis eine Abholung im Werk? Ohne Nachweis: false. */
export const istAbholungsNachweis = (
  projekt: Pick<Projekt, 'liefernachweisAm' | 'liefernachweis'>
): boolean => Boolean(projekt.liefernachweisAm) && projekt.liefernachweis?.art === 'abholung';
