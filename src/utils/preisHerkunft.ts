/**
 * Woher stammt der Preis einer Vereinszeile? (09/2026)
 *
 * Ein Platzbauer sammelt Vereine mit unterschiedlichen Preisen ein: Die
 * meisten laufen über die Saisonstaffel, einzelne haben einen eigens
 * vereinbarten Preis. Auf der Rechnung stand bisher nur die Zahl. Wer
 * nachrechnen wollte — der Platzbauer wie wir selbst — musste Angebot und
 * Rechnung nebeneinanderlegen und raten, welcher Preis welcher Regel folgt.
 *
 * Diese Datei ordnet jeder Zeile ihre Herkunft zu. Sie ist rein und kennt
 * weder Appwrite noch jsPDF, damit die Regel im Test festgehalten ist.
 *
 * Grenzregel wie überall: „ab 300 t" schließt 300 t ein (von ≤ Menge < bis).
 */
import type { Preisstaffel } from '../types/platzbauer';
import { formatTonnen, sortiereStaffeln } from './staffelpreisText';

export type PreisHerkunftArt = 'staffel' | 'direkt' | 'unbekannt';

export interface PreisHerkunft {
  art: PreisHerkunftArt;
  /** Klartext für den Beleg. */
  text: string;
  /** 1-basierte Stufennummer, wenn die Zeile einer Staffelstufe folgt. */
  stufe?: number;
}

/** Cent-genauer Vergleich: Preise sind Fließkommazahlen. */
const gleicherPreis = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

/**
 * Bestimmt die Herkunft eines Zeilenpreises.
 *
 * - Trifft der Preis eine Stufe der Staffel, wird diese Stufe genannt. Es wird
 *   bewusst NICHT nach der Menge dieser einen Zeile eingestuft: Für die
 *   Einstufung zählt die Gesamtabnahme des Platzbauers, nicht die Lieferung an
 *   einen einzelnen Verein.
 * - Weicht der Preis von allen Stufen ab, ist es ein eigens vereinbarter
 *   Preis. Das ist eine Aussage über den Beleg, kein Fehler.
 * - Ohne Staffeln gibt es nichts zu vergleichen: Direktpreis.
 */
export const bestimmePreisHerkunft = (
  einzelpreis: number,
  staffeln?: Preisstaffel[] | null
): PreisHerkunft => {
  if (!Number.isFinite(einzelpreis) || einzelpreis <= 0) {
    return { art: 'unbekannt', text: '' };
  }
  if (!staffeln || staffeln.length === 0) {
    return { art: 'direkt', text: 'Direktpreis lt. Vereinbarung' };
  }

  const sortiert = sortiereStaffeln(staffeln);
  const index = sortiert.findIndex((s) => gleicherPreis(s.einzelpreis, einzelpreis));
  if (index < 0) {
    return { art: 'direkt', text: 'Direktpreis lt. Vereinbarung (abweichend von der Staffel)' };
  }

  const stufe = sortiert[index];
  const grenze =
    stufe.vonMenge > 0
      ? `ab ${formatTonnen(stufe.vonMenge)}`
      : stufe.bisMenge
        ? `unter ${formatTonnen(stufe.bisMenge)}`
        : 'Grundstufe';
  return { art: 'staffel', stufe: index + 1, text: `Staffel Stufe ${index + 1} (${grenze})` };
};

/** Eine Sorte mit ihrer Stufenleiter, wie sie im Beleg steht. */
export interface SortenStaffel {
  bezeichnung?: string;
  artikelnummer?: string;
  staffeln?: Preisstaffel[] | null;
}

/**
 * Herkunft eines Preises, wenn mehrere Sorten je eigene Staffeln tragen.
 *
 * Die Vereinszeilen eines Platzbauerbelegs führen keine Sorte mit — sie tragen
 * nur Menge und Preis. Deshalb wird über alle Staffelsorten gesucht: Die erste,
 * deren Stufe den Preis cent-genau trifft, bestimmt die Herkunft. Tragen
 * mehrere Sorten denselben Preis (der Normalfall bei 0/2 und 0/3), ist die
 * Stufennummer identisch und die Auswahl damit ohne Folgen; unterscheiden sie
 * sich, wird die Sorte dazugeschrieben.
 */
export const bestimmeHerkunftAusSorten = (
  einzelpreis: number,
  sorten: SortenStaffel[]
): PreisHerkunft => {
  const mitStaffeln = sorten.filter((s) => (s.staffeln?.length ?? 0) > 0);
  if (mitStaffeln.length === 0) return bestimmePreisHerkunft(einzelpreis, null);

  for (const sorte of mitStaffeln) {
    const herkunft = bestimmePreisHerkunft(einzelpreis, sorte.staffeln);
    if (herkunft.art === 'staffel') {
      const treffer = mitStaffeln.filter(
        (s) => bestimmePreisHerkunft(einzelpreis, s.staffeln).art === 'staffel'
      );
      // Nur wenn die Sorten sich unterscheiden, braucht der Beleg den Namen.
      return treffer.length === mitStaffeln.length || !sorte.bezeichnung
        ? herkunft
        : { ...herkunft, text: `${herkunft.text} · ${sorte.bezeichnung}` };
    }
  }

  return bestimmePreisHerkunft(einzelpreis, mitStaffeln[0].staffeln);
};
