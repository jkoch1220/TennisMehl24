/**
 * Welche Menge trägt die Frachtkostenpauschale (TM-FP) im Anfrage-Angebot?
 *
 * Antwort: nur das LOSE Schüttgut. Sackware und BigBag reisen per Spedition und
 * tragen ihre Fracht bereits im Tonnenpreis (`preisSackwareAbWerk +
 * frachtProTonneSackware` in anfrageVerarbeitungService.ts). Zählte man sie für
 * die Staffel mit, bezahlte der Kunde die Fracht zweimal — einmal im Preis je
 * Tonne, einmal über eine niedrigere Staffelstufe hinaus.
 *
 * Diese Datei hält die Regel an einer Stelle fest, damit die Erstgenerierung der
 * Positionen (`erstelleAnfragePositionen`) und die Neuberechnung nach einer
 * Mengenänderung im Dialog dieselbe Bezugsgröße verwenden. Vorher gab es die
 * Neuberechnung gar nicht: Wer die Menge änderte, behielt die Pauschale der
 * ursprünglichen Menge — genau die Beobachtung aus Vorschlag 3.
 */
import type { Position } from '../types/projektabwicklung';

/** Loses Schüttgut, das per Silo-LKW gefahren wird. */
export const ARTIKELNUMMERN_LOSE: string[] = ['TM-ZM-02', 'TM-ZM-03'];
const LOSE_ARTIKEL = new Set(ARTIKELNUMMERN_LOSE);

/** Die Frachtkostenpauschale selbst. */
export const FRACHTPAUSCHALE_ARTIKEL = 'TM-FP';

export const istLosePosition = (p: Pick<Position, 'artikelnummer' | 'einheit' | 'istBedarfsposition'>): boolean =>
  !p.istBedarfsposition &&
  /^(t|to)$/i.test(String(p.einheit ?? '')) &&
  LOSE_ARTIKEL.has(String(p.artikelnummer ?? '').trim().toUpperCase());

/** Summe der losen Tonnen über alle Positionen. */
export const summiereLoseTonnage = (positionen: Position[]): number =>
  positionen.filter(istLosePosition).reduce((summe, p) => summe + (Number(p.menge) || 0), 0);

/**
 * Passt eine vorhandene TM-FP-Position an die aktuelle lose Tonnage an.
 *
 * - Ohne TM-FP passiert nichts: Ob überhaupt eine Pauschale anfällt, entscheidet
 *   die Erstgenerierung (reine Sackware bekommt keine).
 * - `preisQuelle: 'manuell'` bleibt unangetastet. Ein von Hand gesetzter Betrag
 *   ist eine Absprache mit dem Kunden („Fracht frei", verhandelte 45 €); ohne
 *   diese Ausnahme sprang die Eingabe sofort auf den Staffelwert zurück und das
 *   Feld war faktisch schreibgeschützt.
 * - Ab 20 t entfällt die Pauschale und die Position wird entfernt.
 *
 * `berechnePauschale` wird hereingereicht, damit diese Datei nicht von den
 * Artikel-Konstanten abhängt (die ihrerseits die Staffel importieren).
 */
export const zieheFrachtpauschaleNach = (
  positionen: Position[],
  berechnePauschale: (tonnen: number) => number | null
): Position[] => {
  const index = positionen.findIndex((p) => p.artikelnummer === FRACHTPAUSCHALE_ARTIKEL);
  if (index === -1) return positionen;
  if (positionen[index].preisQuelle === 'manuell') return positionen;

  const pauschale = berechnePauschale(summiereLoseTonnage(positionen));
  if (pauschale === null) return positionen.filter((_, i) => i !== index);

  const alt = positionen[index];
  const menge = alt.menge || 1;
  if (alt.einzelpreis === pauschale && alt.gesamtpreis === menge * pauschale) return positionen;

  const neu = [...positionen];
  neu[index] = { ...alt, einzelpreis: pauschale, gesamtpreis: menge * pauschale };
  return neu;
};
