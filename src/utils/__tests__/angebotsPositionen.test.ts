/**
 * Die Regeln, an denen im Praxistest echtes Geld hing.
 *
 * Der Auslöser: Eine Preisanpassung traf ALLE Positionen. Im Angebot stand
 * danach eine Einwegpalette zu 161,20 € und die Summe sprang von ~635 € auf
 * 1.612 €. Seitdem gilt: Der Tonnenpreis wirkt ausschließlich auf die
 * Primärposition.
 */
import { describe, it, expect } from 'vitest';
import {
  findePrimaerPosition, summiere, setzeMengeAufPrimaer, setzePreisAufPrimaer,
  aenderePositionsWert,
} from '../angebotsPositionen';
import { Position } from '../../types/projektabwicklung';

const pos = (over: Partial<Position> & { id: string }): Position => ({
  bezeichnung: 'Position', menge: 1, einheit: 'Stk', einzelpreis: 0, gesamtpreis: 0, ...over,
});

/** Ein Schüttgut-Angebot, wie es aus der Zielgruppen-Ermittlung fällt. */
const angebot: Position[] = [
  pos({ id: 'ware', artikelnummer: 'TM-ZM-02', bezeichnung: 'Tennismehl 0/2', menge: 10, einheit: 't', einzelpreis: 130, gesamtpreis: 1300 }),
  pos({ id: 'entladung', bezeichnung: 'Entladung', menge: 10, einheit: 't', einzelpreis: 5, gesamtpreis: 50 }),
  pos({ id: 'palette', artikelnummer: 'TM-EP', bezeichnung: 'Einwegpalette', menge: 1, einheit: 'Stk', einzelpreis: 12.4, gesamtpreis: 12.4 }),
  pos({ id: 'fracht', artikelnummer: 'TM-FP', bezeichnung: 'Frachtkostenpauschale', menge: 1, einheit: 'Stk', einzelpreis: 39.9, gesamtpreis: 39.9 }),
  pos({ id: 'bedarf', bezeichnung: 'Facharbeiter', menge: 0, einheit: 'Std', einzelpreis: 58.95, gesamtpreis: 0, istBedarfsposition: true }),
];

describe('findePrimaerPosition', () => {
  it('nimmt die erste Tonnen-Position, wenn nichts gemerkt ist', () => {
    expect(findePrimaerPosition(angebot)?.id).toBe('ware');
  });

  it('folgt der gemerkten Id auch gegen die Tonnen-Regel', () => {
    expect(findePrimaerPosition(angebot, 'entladung')?.id).toBe('entladung');
  });

  it('fällt auf die Tonnen-Regel zurück, wenn die gemerkte Zeile gelöscht wurde', () => {
    expect(findePrimaerPosition(angebot, 'geloescht')?.id).toBe('ware');
  });

  it('findet nichts in einem reinen Instandsetzungsangebot', () => {
    const ohneWare = angebot.filter((p) => p.einheit !== 't');
    expect(findePrimaerPosition(ohneWare)).toBeUndefined();
  });
});

describe('setzePreisAufPrimaer', () => {
  it('lässt die Einwegpalette in Ruhe', () => {
    const neu = setzePreisAufPrimaer(angebot, 'ware', 161.2);
    expect(neu.find((p) => p.id === 'ware')).toMatchObject({ einzelpreis: 161.2, gesamtpreis: 1612 });
    // Der eigentliche Fehler von damals:
    expect(neu.find((p) => p.id === 'palette')).toMatchObject({ einzelpreis: 12.4, gesamtpreis: 12.4 });
    expect(neu.find((p) => p.id === 'fracht')?.einzelpreis).toBe(39.9);
  });
});

describe('setzeMengeAufPrimaer', () => {
  const neu = setzeMengeAufPrimaer(angebot, 'ware', 15);

  it('rechnet die Hauptposition neu', () => {
    expect(neu.find((p) => p.id === 'ware')).toMatchObject({ menge: 15, gesamtpreis: 1950 });
  });

  it('lässt mengenabhängige Tonnen-Zeilen mitwachsen', () => {
    expect(neu.find((p) => p.id === 'entladung')).toMatchObject({ menge: 15, gesamtpreis: 75 });
  });

  it('rührt Pauschalen nicht an', () => {
    // Doppelte Ware heißt nicht doppelte Frachtpauschale.
    expect(neu.find((p) => p.id === 'fracht')).toMatchObject({ menge: 1, gesamtpreis: 39.9 });
    expect(neu.find((p) => p.id === 'palette')?.menge).toBe(1);
  });

  it('lässt Bedarfspositionen unberührt', () => {
    expect(neu.find((p) => p.id === 'bedarf')).toMatchObject({ menge: 0, gesamtpreis: 0 });
  });

  it('stolpert nicht über eine Ausgangsmenge von 0', () => {
    const beiNull = setzeMengeAufPrimaer([pos({ id: 'x', menge: 0, einheit: 't', einzelpreis: 100 })], 'x', 8);
    expect(beiNull[0]).toMatchObject({ menge: 8, gesamtpreis: 800 });
  });
});

describe('summiere', () => {
  it('zählt alle Positionen, nicht nur die Ware', () => {
    // 1300 + 50 + 12,40 + 39,90 — die Bedarfsposition bleibt draußen.
    expect(summiere(angebot)).toBe(1402.3);
  });

  it('bleibt bei einer leeren Liste bei 0', () => {
    expect(summiere([])).toBe(0);
  });
});

describe('aenderePositionsWert', () => {
  it('führt den Gesamtpreis mit', () => {
    const neu = aenderePositionsWert(angebot, 'palette', 'menge', 3);
    expect(neu.find((p) => p.id === 'palette')).toMatchObject({ menge: 3, gesamtpreis: 37.2 });
  });

  it('fasst keine andere Position an', () => {
    const neu = aenderePositionsWert(angebot, 'palette', 'einzelpreis', 20);
    expect(neu.filter((p) => p.id !== 'palette')).toEqual(angebot.filter((p) => p.id !== 'palette'));
  });
});
