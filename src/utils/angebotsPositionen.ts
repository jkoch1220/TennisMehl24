/**
 * Rechenregeln für die Positionen eines Massen-Angebots.
 *
 * Warum eigene Funktionen und keine Zeilen im Klickhandler: Hier ist schon
 * einmal ein teurer Fehler entstanden — eine Preisänderung traf ALLE
 * Positionen, wodurch im Angebot eine Einwegpalette zu 161,20 € stand und die
 * Summe von ~635 € auf 1.612 € sprang. Diese Regeln gehören an eine Stelle,
 * die man prüfen kann.
 */
import { Position } from '../types/projektabwicklung';

export const round2 = (n: number): number => Number(n.toFixed(2));

/** Lose Ware wird in Tonnen gemessen — daran hängen Menge und Tonnenpreis. */
const istTonnenPosition = (p: Position): boolean => /^(t|to)$/i.test(String(p.einheit ?? ''));

/**
 * Die Position, auf die „Menge" und „Preis (€/t)" wirken.
 *
 * Bevorzugt die ausdrücklich gemerkte `primaerPositionId`; sonst die erste
 * Tonnen-Position, die keine Bedarfsposition ist.
 */
export function findePrimaerPosition(
  positionen: Position[],
  gemerkteId?: string
): Position | undefined {
  if (gemerkteId) {
    const gemerkt = positionen.find((p) => p.id === gemerkteId);
    if (gemerkt) return gemerkt;
  }
  return positionen.find((p) => !p.istBedarfsposition && istTonnenPosition(p));
}

/** Netto ohne Bedarfspositionen — dieselbe Regel wie in `berechneSumme`. */
export function summiere(positionen: Position[]): number {
  return round2(
    positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0)
  );
}

/**
 * Menge der Primärposition ändern.
 *
 * Mengenabhängige Nebenpositionen (Entladung, Paletten — alles in Tonnen)
 * wachsen im selben Verhältnis mit. Pauschalen in Stk oder Pkt zu Festpreis
 * bleiben unberührt: Eine Frachtkostenpauschale wird nicht doppelt, nur weil
 * doppelt so viel Ware fährt.
 */
export function setzeMengeAufPrimaer(
  positionen: Position[],
  primaerId: string | undefined,
  neueMenge: number
): Position[] {
  const primaer = positionen.find((p) => p.id === primaerId);
  const alteMenge = Number(primaer?.menge ?? 0);
  const faktor = alteMenge > 0 ? neueMenge / alteMenge : 1;
  return positionen.map((p) => {
    if (p.istBedarfsposition) return p;
    if (p.id === primaerId) {
      return { ...p, menge: neueMenge, gesamtpreis: round2(neueMenge * Number(p.einzelpreis ?? 0)) };
    }
    if (istTonnenPosition(p)) {
      const m = round2(Number(p.menge ?? 0) * faktor);
      return { ...p, menge: m, gesamtpreis: round2(m * Number(p.einzelpreis ?? 0)) };
    }
    return p;
  });
}

/** Tonnenpreis ändern — ausschließlich an der Primärposition. */
export function setzePreisAufPrimaer(
  positionen: Position[],
  primaerId: string | undefined,
  neuerPreis: number
): Position[] {
  return positionen.map((p) =>
    p.id === primaerId
      ? { ...p, einzelpreis: neuerPreis, gesamtpreis: round2(Number(p.menge ?? 0) * neuerPreis) }
      : p
  );
}

/** Menge oder Einzelpreis einer beliebigen Position setzen; Gesamtpreis folgt. */
export function aenderePositionsWert(
  positionen: Position[],
  id: string,
  feld: 'menge' | 'einzelpreis',
  wert: number
): Position[] {
  return positionen.map((p) => {
    if (p.id !== id) return p;
    const menge = feld === 'menge' ? wert : Number(p.menge ?? 0);
    const einzelpreis = feld === 'einzelpreis' ? wert : Number(p.einzelpreis ?? 0);
    return { ...p, menge, einzelpreis, gesamtpreis: round2(menge * einzelpreis) };
  });
}
