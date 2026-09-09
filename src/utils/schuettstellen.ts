/**
 * Zusätzliche Schüttstellen (Artikel TM-STS).
 *
 * Wünscht der Kunde, dass an mehreren Stellen abgekippt wird, fährt der LKW auf
 * dem Platz ein Stück weiter. Das kostet wenige Minuten und wird je zusätzlicher
 * Stelle pauschal berechnet (Stand 09/2026: 15,90 €).
 *
 * Warum als Position und nicht über die Standzeit-Klausel:
 *  - Die Klausel ist eine Nachberechnung. Um sie durchzusetzen, bräuchte es eine
 *    dokumentierte Standzeit — die erfasst das Portal nirgends. Sie wirkt
 *    abschreckend, abgerechnet wird sie nie.
 *  - Als Position steht der Aufpreis vor der Bestellung im Angebot. Der Kunde
 *    stimmt zu, die Dispo kann die Tour takten, und hinterher gibt es keine
 *    Diskussion über Minuten.
 *
 * Warum NICHT über `anzahlAbladestellen` der Routenberechnung: Dort verschwände
 * der Aufpreis im Preis pro Tonne. Zusammen mit dieser Position würde er doppelt
 * berechnet.
 */

/** Die erste Schüttstelle ist im Preis enthalten; nur jede weitere kostet. */
export const SCHUETTSTELLE_ARTIKEL = 'TM-STS';

/** Notnagel, falls der Artikel im Stamm fehlt. Preispflege gehört in den Stamm. */
export const SCHUETTSTELLE_PREIS_FALLBACK = 15.9;

export interface SchuettstellenAufpreis {
  /** Anzahl zusätzlicher Stellen (= Menge der Position). */
  menge: number;
  einzelpreis: number;
  gesamtpreis: number;
}

/**
 * Was für zusätzliche Schüttstellen berechnet wird — oder `null`, wenn keine
 * Position entsteht.
 *
 * Kein Aufpreis entsteht bei:
 *  - null zusätzlichen Stellen (Normalfall, die erste ist im Preis enthalten)
 *  - fehlendem losem Material: Sackware und BigBag werden abgesetzt, nicht
 *    geschüttet — dort gibt es keine „Schüttstelle"
 *  - unsinnigen Eingaben (negativ); Bruchteile werden abgerundet
 */
export const berechneSchuettstellenAufpreis = (
  zusaetzlicheStellen: number | undefined,
  loseTonnage: number,
  einzelpreis: number = SCHUETTSTELLE_PREIS_FALLBACK
): SchuettstellenAufpreis | null => {
  const stellen = Math.max(0, Math.floor(zusaetzlicheStellen ?? 0));
  if (stellen <= 0 || loseTonnage <= 0) return null;
  return {
    menge: stellen,
    einzelpreis,
    gesamtpreis: Math.round(stellen * einzelpreis * 100) / 100,
  };
};

/**
 * Beschreibung der Position.
 *
 * Bewusst ohne absolute Stellenzahl: Wird die Menge später im Angebots- oder
 * AB-Tab korrigiert, bliebe ein eingefrorener Text („Abladung an 3 Stellen")
 * stehen und widerspräche der Menge daneben — bis in die Rechnung hinein.
 */
export const SCHUETTSTELLE_BESCHREIBUNG =
  'Abkippen an einer weiteren Stelle auf dem Gelände, je Stelle';
