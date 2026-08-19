/**
 * Preisempfehlung für loses Material (Schüttgut) aus einer Anfrage.
 *
 * Bis 08/2026 gab es dafür drei getrennte Rechenwege, die sich widersprachen:
 *  - `berechneEmpfohlenenPreis` (anfrageParserService) — PLZ-Zonen-Heuristik mit
 *    hartkodiertem Basispreis; füllte das Preisfeld beim Öffnen des Dialogs vor.
 *  - ein useEffect im AnfrageBearbeitungDialog, der Werkspreis + Lieferkosten
 *    geteilt durch die **Gesamtmenge** rechnete (also inkl. Sackware/BigBag).
 *  - die grüne „Preiskalkulation"-Box, die durch die **lose** Menge teilte.
 *
 * Ergebnis: Das vorausgefüllte Preis/t-Feld wich von der darunter angezeigten
 * Empfehlung ab — und weil `erstelleAnfragePositionen` das Feld als Endpreis in
 * die Angebotspositionen übernimmt, ging der falsche Preis an den Kunden raus.
 *
 * Diese Funktion ist jetzt die einzige Quelle: Anzeige und Vorbefüllung rechnen
 * beide hierüber.
 *
 * Fachliche Regel: Loses Material fährt per Silo-LKW, die Lieferkosten dieser
 * Fuhre werden auf die **lose** Tonnage umgelegt. Sackware, BigBags und Paletten
 * gehen per Spedition und haben eine eigene Frachtkalkulation
 * (`berechneSpeditionskosten`) — sie dürfen die Lieferkosten pro Tonne des
 * Schüttguts nicht verwässern.
 */

export interface LosePreisEmpfehlung {
  /** Werkspreis ab Werk aus dem Artikelstamm (EUR/t) */
  werkspreis: number;
  /** Auf die lose Tonnage umgelegte Lieferkosten (EUR/t) */
  lieferkostenProTonne: number;
  /** Lieferkosten der Fuhre gesamt (EUR) */
  lieferkostenGesamt: number;
  /** Zugrunde gelegte lose Tonnage (t) */
  loseTonnage: number;
  /** Werkspreis + Lieferkosten/t, auf Cent gerundet (EUR/t) */
  empfohlenerPreis: number;
}

/** Auf Cent runden — an genau einer Stelle, damit Anzeige und Feldwert identisch sind. */
export const aufCent = (wert: number): number => Math.round(wert * 100) / 100;

/**
 * Empfohlener Endpreis pro Tonne für loses Material.
 *
 * Gibt `null` zurück, wenn keine Empfehlung möglich ist — also ohne lose Tonnage
 * oder ohne vorliegende Lieferkosten. In dem Fall darf das Preisfeld **nicht**
 * überschrieben werden: Bei reiner Sackware wäre ein Lose-Preis schlicht falsch.
 */
export function berechneLosePreisEmpfehlung(input: {
  /** Werkspreis loses Material ab Werk (EUR/t), aus dem Artikelstamm */
  werkspreis: number;
  /** Lohnkosten der Fremdlieferungs-Route (EUR), oder null wenn noch nicht berechnet */
  lieferkostenGesamt: number | null;
  /** Summe der losen Tonnen (0-2mm + 0-3mm) */
  loseTonnage: number;
}): LosePreisEmpfehlung | null {
  const { werkspreis, lieferkostenGesamt, loseTonnage } = input;

  if (!Number.isFinite(loseTonnage) || loseTonnage <= 0) return null;
  if (lieferkostenGesamt === null || !Number.isFinite(lieferkostenGesamt)) return null;
  if (!Number.isFinite(werkspreis) || werkspreis <= 0) return null;

  const lieferkostenProTonne = lieferkostenGesamt / loseTonnage;

  return {
    werkspreis,
    lieferkostenProTonne,
    lieferkostenGesamt,
    loseTonnage,
    empfohlenerPreis: aufCent(werkspreis + lieferkostenProTonne),
  };
}

/**
 * Weicht der eingetragene Preis nennenswert von der Empfehlung ab?
 *
 * Toleranz von einem Cent, damit reine Rundungsdifferenzen keinen Warnhinweis
 * auslösen.
 */
export function weichtVonEmpfehlungAb(preisProTonne: number, empfohlenerPreis: number): boolean {
  return Math.abs(preisProTonne - empfohlenerPreis) > 0.01;
}
