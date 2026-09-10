import { describe, expect, it } from 'vitest';
import { bestimmeHerkunftAusSorten, bestimmePreisHerkunft } from '../preisHerkunft';

const staffeln = [
  { vonMenge: 0, bisMenge: 150, einzelpreis: 118.5 },
  { vonMenge: 150, bisMenge: 300, einzelpreis: 113.5 },
  { vonMenge: 300, bisMenge: null, einzelpreis: 108.5 },
] as any;

describe('bestimmePreisHerkunft', () => {
  it('nennt die getroffene Staffelstufe mit ihrer Grenze', () => {
    const h = bestimmePreisHerkunft(113.5, staffeln);
    expect(h.art).toBe('staffel');
    expect(h.stufe).toBe(2);
    expect(h.text).toContain('ab 150');
  });

  it('beschreibt die Grundstufe über ihre Obergrenze', () => {
    expect(bestimmePreisHerkunft(118.5, staffeln).text).toContain('unter 150');
  });

  it('erkennt einen abweichenden Preis als Direktpreis', () => {
    const h = bestimmePreisHerkunft(105, staffeln);
    expect(h.art).toBe('direkt');
    expect(h.text).toContain('abweichend');
  });

  it('ohne Staffeln ist jeder Preis ein Direktpreis', () => {
    expect(bestimmePreisHerkunft(120, []).art).toBe('direkt');
    expect(bestimmePreisHerkunft(120, undefined).text).toBe('Direktpreis lt. Vereinbarung');
  });

  it('vergleicht cent-genau statt auf Fließkomma-Gleichheit', () => {
    expect(bestimmePreisHerkunft(113.5000001, staffeln).stufe).toBe(2);
    expect(bestimmePreisHerkunft(113.49, staffeln).art).toBe('direkt');
  });

  it('liefert für fehlende Preise keinen Text', () => {
    expect(bestimmePreisHerkunft(0, staffeln).text).toBe('');
  });
});

describe('bestimmeHerkunftAusSorten', () => {
  const sorteA = { bezeichnung: '0/2 lose', staffeln };
  const sorteB = {
    bezeichnung: '0/3 lose',
    staffeln: [
      { vonMenge: 0, bisMenge: 150, einzelpreis: 121 },
      { vonMenge: 150, bisMenge: null, einzelpreis: 116 },
    ] as any,
  };

  it('nennt bei gleichem Preis in allen Sorten keine Sorte', () => {
    const h = bestimmeHerkunftAusSorten(113.5, [sorteA, { ...sorteB, staffeln }]);
    expect(h.text).not.toContain('·');
    expect(h.stufe).toBe(2);
  });

  it('schreibt die Sorte dazu, wenn nur eine den Preis führt', () => {
    const h = bestimmeHerkunftAusSorten(116, [sorteA, sorteB]);
    expect(h.art).toBe('staffel');
    expect(h.text).toContain('0/3 lose');
  });

  it('meldet einen Preis, den keine Sorte führt, als Direktpreis', () => {
    expect(bestimmeHerkunftAusSorten(99, [sorteA, sorteB]).art).toBe('direkt');
  });
});
