/**
 * Der Abwicklungsweg bestimmt, welche Arbeitsschritte ein Projekt braucht.
 *
 * Wichtigste Eigenschaft: Es ist eine MENGE. Der Code hält „ein Projekt = eine
 * Produktart" nicht durch — ein Auftrag mit Schüttgut und Hydrocourt ist der
 * Normalfall, und ein Filter, der ihn nur einer Seite zuschlägt, versteckt ihn
 * vor der anderen.
 */
import { describe, it, expect } from 'vitest';
import {
  getAbwicklungswege,
  hatAbwicklungsweg,
  wegNochOffen,
  wiegescheinVorgesehen,
  faehrtEigenerLkw,
} from '../abwicklungsweg';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'auftragsbestaetigung', saisonjahr: 2027, ...teil } as Projekt);

const mitPositionen = (positionen: unknown[], teil: Partial<Projekt> = {}) =>
  projekt({
    ...teil,
    auftragsbestaetigungsDaten: JSON.stringify({ positionen }),
  } as Partial<Projekt>);

describe('getAbwicklungswege', () => {
  it('leitet Schüttgut aus der Belieferungsart ab', () => {
    expect([...getAbwicklungswege(projekt({ belieferungsart: 'mit_haenger' }))]).toEqual(['schuettgut']);
    expect([...getAbwicklungswege(projekt({ belieferungsart: 'nur_motorwagen' }))]).toEqual(['schuettgut']);
  });

  it('führt Kranwagen als eigenen Weg NEBEN der Palette', () => {
    // Der Kran ist ein Koordinationstermin, die Ware bleibt Palettenware —
    // beides muss auffindbar sein.
    const wege = getAbwicklungswege(projekt({ belieferungsart: 'palette_mit_ladekran' }));
    expect(wege.has('kranwagen')).toBe(true);
    expect(wege.has('palette')).toBe(true);
  });

  it('zählt BigBag zur Palettenware', () => {
    expect([...getAbwicklungswege(projekt({ belieferungsart: 'bigbag' }))]).toEqual(['palette']);
  });

  it('erkennt Abholung ab Werk', () => {
    expect([...getAbwicklungswege(projekt({ belieferungsart: 'abholung_ab_werk' }))]).toEqual([
      'abholung',
    ]);
  });

  it('führt abgeholte Palettenware unter BEIDEM — Abholung ist kein Warenersatz', () => {
    // Abholung ab Werk gilt für alles: loses Schüttgut, einzelne Säcke, ganze
    // Paletten, BigBags. Wer sie als Warenart führte, ließe einen abgeholten
    // Palettenauftrag aus dem Palettenfilter verschwinden.
    const p = mitPositionen(
      [{ artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 'Pal' }],
      { belieferungsart: 'abholung_ab_werk' }
    );
    const wege = getAbwicklungswege(p);
    expect(wege.has('abholung')).toBe(true);
    expect(wege.has('palette')).toBe(true);
  });

  it('führt abgeholtes Schüttgut unter Schüttgut und Abholung', () => {
    const p = mitPositionen(
      [{ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' }],
      { belieferungsart: 'abholung_ab_werk' }
    );
    const wege = getAbwicklungswege(p);
    expect(wege.has('abholung')).toBe(true);
    expect(wege.has('schuettgut')).toBe(true);
  });

  it('rät bei Abholung keine Warenart aus dem Dispo-Bezug', () => {
    // Wir fahren nicht — dann darf auch nicht „Schüttgut" unterstellt werden.
    const p = projekt({ belieferungsart: 'abholung_ab_werk', dispoStatus: 'offen' });
    expect([...getAbwicklungswege(p)]).toEqual(['abholung']);
  });

  it('erkennt Hydrocourt an der Artikelnummer', () => {
    const p = mitPositionen([{ artikelnummer: 'TM-HYC', bezeichnung: 'Hydrocourt' }]);
    expect(hatAbwicklungsweg(p, 'hydrocourt')).toBe(true);
  });

  it('erkennt Universal an der Positionsmarkierung', () => {
    const p = mitPositionen([{ istUniversalArtikel: true, bezeichnung: 'Netz' }]);
    expect(hatAbwicklungsweg(p, 'universal')).toBe(true);
  });

  it('führt einen gemischten Auftrag unter BEIDEN Wegen', () => {
    // Genau der Fall, der bisher unter den Tisch fiel: Der Split ist freiwillig,
    // also gibt es Projekte mit Schüttgut UND Hydrocourt.
    const p = mitPositionen([{ artikelnummer: 'TM-HYC' }], { belieferungsart: 'mit_haenger' });
    const wege = getAbwicklungswege(p);
    expect(wege.has('hydrocourt')).toBe(true);
    expect(wege.has('schuettgut')).toBe(true);
    expect(wege.size).toBe(2);
  });

  it('lässt den Weg offen, solange nichts bestimmbar ist', () => {
    // Ein Angebot ohne Positionen und ohne Belieferungsart — ehrliches „noch offen".
    const p = projekt({});
    expect(getAbwicklungswege(p).size).toBe(0);
    expect(wegNochOffen(p)).toBe(true);
  });

  it('führt ein Projekt mit Dispo-Bezug als Schüttgut, auch ohne Belieferungsart', () => {
    // Es wird gefahren, nur ist nicht hinterlegt womit. Der überwiegende Teil des
    // Direktgeschäfts ist lose Ware — das ist näher an der Wahrheit als gar nichts.
    const p = projekt({ dispoStatus: 'offen' });
    expect(hatAbwicklungsweg(p, 'schuettgut')).toBe(true);
    expect(wegNochOffen(p)).toBe(false);
  });

  it('unterstellt einem Shop-Auftrag kein Schüttgut, nur weil er in der Dispo liegt', () => {
    // Der Shop verkauft Sackware, BigBags und Zubehör. Der Dispo-Fallback ist
    // eine Direktgeschäfts-Regel und traf hier systematisch daneben — 7 von 27
    // Shop-Projekten landeten so im falschen Filter.
    const p = projekt({ projektName: 'Shop #178 (Eigen)', dispoStatus: 'geliefert' });
    expect(getAbwicklungswege(p).has('schuettgut')).toBe(false);
    expect(wegNochOffen(p)).toBe(true);
  });

  it('zählt den Ladekran-Zuschlag für Sackware nicht als loses Material', () => {
    // TM-LKW-KR wird in Tonnen fakturiert, ist aber eine Dienstleistung. Als Ware
    // gezählt machte er aus einem Palettenauftrag einen Schüttgutauftrag.
    const p = mitPositionen([
      { artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 'Pal' },
      { artikelnummer: 'TM-LKW-KR', bezeichnung: 'Entladung Sackware mit LKW Ladekran', menge: 2, einheit: 't' },
    ]);
    const wege = getAbwicklungswege(p);
    expect(wege.has('palette')).toBe(true);
    expect(wege.has('schuettgut')).toBe(false);
  });

  it('zählt die Hydrocourt-Versandpauschale nicht als loses Material', () => {
    const p = mitPositionen([
      { artikelnummer: 'TM-HYC', bezeichnung: 'HYDROcourt© 25 Ltr', menge: 1, einheit: 'Stk' },
      { artikelnummer: 'TM-HYC-V', bezeichnung: 'Hydrocourt Versand Standard Pauschal', menge: 1, einheit: 't' },
    ]);
    expect([...getAbwicklungswege(p)]).toEqual(['hydrocourt']);
  });

  it('überschreibt einen erkannten Fremdbezug nicht mit dem Dispo-Fallback', () => {
    const p = mitPositionen([{ artikelnummer: 'TM-HYC' }], { dispoStatus: 'offen' });
    const wege = getAbwicklungswege(p);
    expect(wege.has('hydrocourt')).toBe(true);
    // Kein Schüttgut-Fallback, weil bereits ein Weg erkannt wurde.
    expect(wege.has('schuettgut')).toBe(false);
  });

  it('erkennt Hydrocourt auch am Teilprojekt-Typ, ohne Positionen', () => {
    expect(hatAbwicklungsweg(projekt({ teilprojektTyp: 'hydrocourt' }), 'hydrocourt')).toBe(true);
  });
});

describe('wiegescheinVorgesehen', () => {
  it('erwartet einen Wiegeschein bei losem Material', () => {
    expect(wiegescheinVorgesehen(projekt({ belieferungsart: 'mit_haenger' }))).toBe(true);
  });

  it('erwartet einen Wiegeschein auch bei Abholung ab Werk — der Kunde fährt über die Waage', () => {
    expect(wiegescheinVorgesehen(projekt({ belieferungsart: 'abholung_ab_werk' }))).toBe(true);
  });

  it('erwartet KEINEN Wiegeschein bei reiner Palettenware', () => {
    // Sonst steht an jedem Sackware-Auftrag dauerhaft „Wiegeschein fehlt" —
    // eine Warnung, die niemand je erfüllen kann.
    expect(wiegescheinVorgesehen(projekt({ belieferungsart: 'bigbag' }))).toBe(false);
  });

  it('erwartet einen Wiegeschein, sobald auch loses Material dabei ist', () => {
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' }], {
      belieferungsart: 'palette_mit_ladekran',
    });
    expect(wiegescheinVorgesehen(p)).toBe(true);
  });

  it('schweigt, solange die Warenart unbestimmt ist', () => {
    expect(wiegescheinVorgesehen(projekt({}))).toBeNull();
  });
});

describe('Warenart schlaegt Belieferungsart', () => {
  it('fuehrt einen Sackware-Auftrag auf eigenem LKW nicht als Schuettgut', () => {
    // Der Haengerzug faehrt Paletten. „mit_haenger" benennt das Fahrzeug, nicht
    // den Inhalt — sonst stuende an jedem solchen Auftrag „Wiegeschein fehlt".
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02St', menge: 1.5, einheit: 't' }], {
      belieferungsart: 'mit_haenger',
    });
    const wege = getAbwicklungswege(p);
    expect(wege.has('palette')).toBe(true);
    expect(wege.has('schuettgut')).toBe(false);
    expect(wiegescheinVorgesehen(p)).toBe(false);
  });

  it('laesst Schuettgut stehen, sobald loses Material dabei ist', () => {
    const p = mitPositionen(
      [
        { artikelnummer: 'TM-ZM-02St', menge: 1, einheit: 't' },
        { artikelnummer: 'TM-ZM-02', menge: 10, einheit: 't' },
      ],
      { belieferungsart: 'mit_haenger' }
    );
    const wege = getAbwicklungswege(p);
    expect(wege.has('schuettgut')).toBe(true);
    expect(wege.has('palette')).toBe(true);
  });

  it('leitet ohne Positionen weiterhin Schuettgut aus der Belieferungsart ab', () => {
    expect(getAbwicklungswege(projekt({ belieferungsart: 'mit_haenger' })).has('schuettgut')).toBe(
      true
    );
  });
});

describe('faehrtEigenerLkw', () => {
  it('zaehlt den Sackware-Auftrag auf eigenem LKW zur eigenen Dispo', () => {
    // Genau der Auftrag, der ueber den Schuettgut-Weg in die Speditionsspalte
    // gerutscht waere.
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02St', menge: 1.5, einheit: 't' }], {
      belieferungsart: 'mit_haenger',
    });
    expect(faehrtEigenerLkw(p)).toBe(true);
  });

  it('faehrt bei Abholung ab Werk nicht selbst', () => {
    expect(faehrtEigenerLkw(projekt({ belieferungsart: 'abholung_ab_werk' }))).toBe(false);
    expect(
      faehrtEigenerLkw(projekt({ belieferungsart: 'abholung_ab_werk', dispoStatus: 'offen' }))
    ).toBe(false);
  });

  it('faehrt bei Speditionsware nicht selbst', () => {
    expect(faehrtEigenerLkw(projekt({ belieferungsart: 'bigbag' }))).toBe(false);
  });
});
