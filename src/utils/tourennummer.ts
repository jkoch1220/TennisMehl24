/**
 * Lesbare Tourennummer für die Dispo.
 *
 * Bis 08/2026 war eine Tour nur über ihren Namen ansprechbar („Tour 1 - MSP-ZM
 * 123"), der frei getippt und jederzeit geändert wird. Am Telefon oder auf dem
 * Papier gab es damit nichts Eindeutiges zum Nennen (Vorschlag [26]).
 *
 * ABGELEITET, NICHT VERGEBEN — und zwar mit Absicht:
 *
 * 1. Die Touren-Collection arbeitet mit echten Appwrite-Attributen und hat ihr
 *    Spaltenlimit erreicht (siehe Kommentar in tourenService.createTour, wo
 *    schon `optimierung` deswegen nicht mehr gespeichert wird). Ein neues Feld
 *    `tourennummer` ginge dort nicht ohne Umbau.
 * 2. Vergebene Nummernkreise sind in diesem Projekt mehrfach schiefgegangen —
 *    tote Eindeutigkeitsprüfungen, Zähler ohne Jahresbezug, Nummern aus dem
 *    Folgejahr im Bestand. Eine Nummer, die sich aus vorhandenen Daten ergibt,
 *    kann keine Lücken reißen und keine Dubletten erzeugen.
 *
 * Format: TO-JJJJMMTT-N — Datum der Tour plus laufende Nummer INNERHALB des
 * Tages, nach Anlagezeitpunkt. Damit ist die Nummer für den Fahrer sprechend
 * („die zweite Tour am Montag") und für die Dispo eindeutig.
 *
 * GRENZE, die man kennen muss: Wird eine Tour desselben Tages gelöscht, rücken
 * die nachfolgenden Nummern auf. Innerhalb eines Tages ist die Nummer also
 * stabil, solange nichts gelöscht wird — für eine Tagesdisposition reicht das.
 * Wer eine dauerhaft unveränderliche Nummer braucht (z.B. für Abrechnung),
 * muss sie speichern; das ist dann eine eigene Entscheidung samt Schema.
 */

export interface TourFuerNummer {
  id: string;
  datum?: string;
  /** Anlagezeitpunkt aus Appwrite — bestimmt die Reihenfolge innerhalb des Tages. */
  $createdAt?: string;
}

const DATUMSTEIL = (datum?: string): string =>
  datum ? datum.split('-').join('') : 'ohne-Datum';

/**
 * Nummern für alle Touren eines Bestands berechnen.
 *
 * Bewusst als Gesamtabbildung statt einzeln: Die laufende Nummer ergibt sich
 * nur aus dem Vergleich mit den anderen Touren desselben Tages.
 */
export const berechneTourennummern = (touren: TourFuerNummer[]): Map<string, string> => {
  const nachTag = new Map<string, TourFuerNummer[]>();
  for (const tour of touren) {
    const tag = DATUMSTEIL(tour.datum);
    const liste = nachTag.get(tag);
    if (liste) liste.push(tour);
    else nachTag.set(tag, [tour]);
  }

  const nummern = new Map<string, string>();
  for (const [tag, liste] of nachTag) {
    // Nach Anlagezeitpunkt sortieren; fehlt er, entscheidet die ID —
    // Hauptsache, die Reihenfolge ist bei jedem Aufruf dieselbe.
    const sortiert = [...liste].sort((a, b) => {
      const zeit = (a.$createdAt || '').localeCompare(b.$createdAt || '');
      return zeit !== 0 ? zeit : a.id.localeCompare(b.id);
    });
    sortiert.forEach((tour, index) => {
      nummern.set(tour.id, `TO-${tag}-${index + 1}`);
    });
  }

  return nummern;
};

/** Kurzform für eine einzelne Tour im Kontext ihres Tages. */
export const tourennummer = (tour: TourFuerNummer, tourenDesTages: TourFuerNummer[]): string =>
  berechneTourennummern(tourenDesTages).get(tour.id) || `TO-${DATUMSTEIL(tour.datum)}-?`;
