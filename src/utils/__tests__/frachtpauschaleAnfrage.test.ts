import { describe, it, expect } from 'vitest';
import { berechneMindermengenpauschale } from '../../constants/artikelPreise';
import { berechneFrachtkostenpauschale } from '../frachtkostenCalculations';
import { istLosePosition, summiereLoseTonnage, zieheFrachtpauschaleNach } from '../loseTonnage';
import type { Position } from '../../types/projektabwicklung';

/**
 * Vorschlag 3: „Anfrage Frachtkostenpauschale nicht richtig angepasst".
 *
 * Zwei Ursachen steckten dahinter:
 *  1. Das Anfragetool rechnete mit einer EIGENEN Staffel, deren Obergrenzen
 *     ausschließend waren — entgegen dem Kommentar direkt darüber und entgegen
 *     Angebot, AB, Rechnung und Bestellportal. Bei exakt 7,4 t bekam dieselbe
 *     Anfrage je nach Maske 39,90 € oder 49,90 €.
 *  2. Die Pauschale zog einer Mengenänderung nicht nach.
 */
const pos = (teil: Partial<Position>): Position =>
  ({ id: 'x', bezeichnung: 'x', menge: 0, einheit: 't', einzelpreis: 0, gesamtpreis: 0, ...teil } as Position);

describe('Staffel im Anfragetool', () => {
  it('stimmt jetzt an JEDER Menge mit dem übrigen Portal überein', () => {
    for (const t of [0.5, 3, 5.39, 5.4, 6, 7.39, 7.4, 7.41, 11.4, 11.41, 15.4, 15.41, 19.9, 19.95]) {
      const ausAnfrage = berechneMindermengenpauschale(t);
      const ausPortal = berechneFrachtkostenpauschale(t);
      // Das Anfragetool legt bei 0 € gar keine Position an, das Portal führt 0.
      expect(ausAnfrage ?? 0, `bei ${t} t`).toBe(ausPortal);
    }
  });

  it('zählt die Obergrenze zur günstigeren Stufe — „von 5,4 bis 7,4 t = 49,90 €"', () => {
    // Genau diese drei Werte lieferten vorher eine Stufe zu wenig.
    expect(berechneMindermengenpauschale(7.4)).toBe(49.9);
    expect(berechneMindermengenpauschale(11.4)).toBe(39.9);
    expect(berechneMindermengenpauschale(15.4)).toBe(31.9);
  });

  it('bleibt unterhalb der Grenze bei der teureren Stufe', () => {
    expect(berechneMindermengenpauschale(7.41)).toBe(39.9);
    expect(berechneMindermengenpauschale(5.39)).toBe(59.9);
  });

  it('entfällt ab 20 t und bei leerer Menge', () => {
    expect(berechneMindermengenpauschale(20)).toBeNull();
    expect(berechneMindermengenpauschale(25)).toBeNull();
    expect(berechneMindermengenpauschale(0)).toBeNull();
    expect(berechneMindermengenpauschale(-1)).toBeNull();
  });

  it('entfällt auch knapp über 19,9 t — wie im übrigen Portal', () => {
    // Vorher lieferte das Anfragetool hier 24,90 €, alle anderen Masken 0 €.
    expect(berechneMindermengenpauschale(19.95)).toBeNull();
  });
});

describe('Bezugsgröße der Pauschale', () => {
  it('zählt nur loses Schüttgut', () => {
    // Sackware und BigBag tragen die Speditionsfracht bereits im Tonnenpreis —
    // mitzuzählen hieße, die Fracht ein zweites Mal zu berücksichtigen.
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-02', einheit: 't' }))).toBe(true);
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-03', einheit: 't' }))).toBe(true);
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-02St', einheit: 't' }))).toBe(false);
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-BIG-02', einheit: 't' }))).toBe(false);
    expect(istLosePosition(pos({ artikelnummer: 'TM-FP', einheit: 'Stk' }))).toBe(false);
  });

  it('lässt Beiladungssäcke in Stück außen vor', () => {
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-02S', einheit: 'Stk' }))).toBe(false);
  });

  it('überspringt Bedarfspositionen', () => {
    expect(istLosePosition(pos({ artikelnummer: 'TM-ZM-02', einheit: 't', istBedarfsposition: true }))).toBe(false);
  });

  it('summiert über mehrere Körnungen', () => {
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 4 }),
      pos({ artikelnummer: 'TM-ZM-03', menge: 2.5 }),
      pos({ artikelnummer: 'TM-ZM-02St', menge: 3 }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk' }),
    ];
    expect(summiereLoseTonnage(positionen)).toBe(6.5);
  });
});

describe('Nachziehen nach einer Mengenänderung', () => {
  // Die echte Funktion, die auch der Dialog aufruft — kein Nachbau im Test.
  const nachziehen = (positionen: Position[]): Position[] =>
    zieheFrachtpauschaleNach(positionen, berechneMindermengenpauschale);

  const mitPauschale = (loseTonnen: number, alterPreis: number): Position[] => [
    pos({ artikelnummer: 'TM-ZM-02', menge: loseTonnen, einzelpreis: 98.7, gesamtpreis: loseTonnen * 98.7 }),
    pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: alterPreis, gesamtpreis: alterPreis }),
  ];

  it('senkt die Pauschale, wenn die Menge über eine Stufengrenze steigt', () => {
    // 5 t → 59,90 €; auf 6 t erhöht → 49,90 €. Vorher blieben 59,90 € stehen.
    const ergebnis = nachziehen(mitPauschale(6, 59.9));
    const fp = ergebnis.find((p) => p.artikelnummer === 'TM-FP');
    expect(fp?.einzelpreis).toBe(49.9);
    expect(fp?.gesamtpreis).toBe(49.9);
  });

  it('hebt die Pauschale, wenn die Menge unter eine Stufengrenze fällt', () => {
    const fp = nachziehen(mitPauschale(4, 49.9)).find((p) => p.artikelnummer === 'TM-FP');
    expect(fp?.einzelpreis).toBe(59.9);
  });

  it('entfernt die Position ab 20 t', () => {
    expect(nachziehen(mitPauschale(22, 24.9)).some((p) => p.artikelnummer === 'TM-FP')).toBe(false);
  });

  it('legt keine Pauschale an, wo vorher keine war', () => {
    // Reine Sackware bekommt im Anfragetool bewusst keine Pauschale.
    const nurSackware = [pos({ artikelnummer: 'TM-ZM-02St', menge: 5, einheit: 't' })];
    expect(nachziehen(nurSackware)).toHaveLength(1);
    expect(nachziehen(nurSackware).some((p) => p.artikelnummer === 'TM-FP')).toBe(false);
  });

  it('ignoriert Sackware bei der Neuberechnung', () => {
    // 4 t lose + 10 t Sackware: maßgeblich sind die 4 t → 59,90 €.
    const gemischt = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 4 }),
      pos({ artikelnummer: 'TM-ZM-02St', menge: 10 }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: 24.9, gesamtpreis: 24.9 }),
    ];
    expect(nachziehen(gemischt).find((p) => p.artikelnummer === 'TM-FP')?.einzelpreis).toBe(59.9);
  });

  /**
   * Aus dem Review: Das Nachziehen überschrieb den Preis bedingungslos. Wer
   * „Fracht frei" oder einen verhandelten Betrag eintrug, sah ihn sofort wieder
   * auf den Staffelwert springen — das Feld war faktisch schreibgeschützt.
   */
  it('lässt eine von Hand gesetzte Pauschale stehen', () => {
    const verhandelt = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 4 }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: 45, gesamtpreis: 45, preisQuelle: 'manuell' }),
    ];
    const fp = nachziehen(verhandelt).find((p) => p.artikelnummer === 'TM-FP');
    expect(fp?.einzelpreis).toBe(45);
  });

  it('lässt „Fracht frei" (0 €) stehen', () => {
    const frei = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 4 }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: 0, gesamtpreis: 0, preisQuelle: 'manuell' }),
    ];
    expect(nachziehen(frei).find((p) => p.artikelnummer === 'TM-FP')?.einzelpreis).toBe(0);
  });

  it('entfernt auch eine manuelle Pauschale nicht ab 20 t', () => {
    // Wer bewusst einen Betrag vereinbart hat, verliert ihn nicht durch eine Mengenänderung.
    const verhandelt = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 25 }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: 45, gesamtpreis: 45, preisQuelle: 'manuell' }),
    ];
    expect(nachziehen(verhandelt).some((p) => p.artikelnummer === 'TM-FP')).toBe(true);
  });

  it('gibt dieselbe Liste zurück, wenn sich nichts ändert', () => {
    // Sonst löst jeder Aufruf einen Re-Render aus, obwohl nichts passiert ist.
    const unveraendert = mitPauschale(4, 59.9);
    expect(nachziehen(unveraendert)).toBe(unveraendert);
  });
});
