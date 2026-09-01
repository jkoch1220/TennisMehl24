/**
 * Preisanpassung darf nur die Hauptware treffen.
 *
 * Ein Angebot besteht aus mehreren Positionen mit völlig verschiedenen Preisen:
 * Ziegelmehl nach Tonne, Einwegpalette pro Stück, Entladung, Frachtpauschale.
 * Wer den Tonnenpreis auf alle schreibt, erzeugt eine Palette zu 161,20 € —
 * genau so entstand ein Angebot mit mehr als der doppelten Summe.
 */
import { describe, it, expect } from 'vitest';
import { Position } from '../../types/projektabwicklung';

const pos = (id: string, artikelnummer: string, einheit: string, menge: number, einzelpreis: number): Position =>
  ({ id, artikelnummer, bezeichnung: artikelnummer, einheit, menge, einzelpreis,
     gesamtpreis: menge * einzelpreis } as Position);

/** Bildet die Anpassung aus wendePreisanpassungAn/Detail-Panel nach. */
const passeAn = (positionen: Position[], primaerId: string | undefined, neuerPreis: number): Position[] =>
  positionen.map((p) =>
    p.id === primaerId
      ? { ...p, einzelpreis: neuerPreis, gesamtpreis: Math.round((p.menge ?? 0) * neuerPreis * 100) / 100 }
      : p
  );

const angebot = (): Position[] => [
  pos('p1', 'TM-ZM-02St', 't', 3, 155.0),   // Hauptware
  pos('p2', 'TM-PAL', 'Stk', 3, 12.5),      // Einwegpalette
  pos('p3', 'TM-ENT', 't', 3, 18.0),        // Entladung
  pos('p4', 'TM-FP', 'Pkt', 1, 59.9),       // Frachtpauschale
];

describe('Preisanpassung', () => {
  it('ändert nur die Primärposition', () => {
    const neu = passeAn(angebot(), 'p1', 161.2);
    expect(neu[0].einzelpreis).toBe(161.2);
    expect(neu[1].einzelpreis).toBe(12.5);
    expect(neu[2].einzelpreis).toBe(18.0);
    expect(neu[3].einzelpreis).toBe(59.9);
  });

  it('lässt die Summe realistisch bleiben', () => {
    const neu = passeAn(angebot(), 'p1', 161.2);
    const summe = neu.reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
    // 483,60 + 37,50 + 54,00 + 59,90
    expect(summe).toBeCloseTo(635.0, 2);
    // Der Fehlerfall — alle Positionen zum Tonnenpreis — ergäbe deutlich mehr.
    const falsch = angebot().reduce((s, p) => s + (p.menge ?? 0) * 161.2, 0);
    expect(falsch).toBeGreaterThan(summe * 2);
  });

  it('erkennt die Primärposition auch ohne gespeicherte Id', () => {
    // Rückfall für Zeilen aus einem früheren Lauf: erste Ziegelmehl-Position
    // mit Tonnen-Einheit.
    const gefunden = angebot().find(
      (p) => /^TM-ZM/i.test(String(p.artikelnummer)) && /^(t|to)$/i.test(String(p.einheit))
    );
    expect(gefunden?.id).toBe('p1');
  });

  it('fasst die Frachtpauschale nie über den Tonnenpreis an', () => {
    const neu = passeAn(angebot(), 'p1', 200);
    const fracht = neu.find((p) => p.artikelnummer === 'TM-FP');
    expect(fracht?.einzelpreis).toBe(59.9);
    expect(fracht?.gesamtpreis).toBe(59.9);
  });
});
