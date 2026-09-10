/**
 * Zentrale Staffelgrenzen für Platzbauer-Angebote (Vorschlag „Automatisierung
 * von Staffelpreisangeboten“, 09/2026).
 *
 * Geprüft wird, was die Bedienung verspricht: Grenzen einmal pflegen, Preise je
 * Sorte behalten, keine Lücke zwischen den Stufen – und zwar auch auf halb
 * getippten Zwischenständen, weil das Zahlenfeld jeden Tastendruck meldet.
 *
 * Nachbedingung nach jeder Operation: `staffelnLueckenlos` je Sorte und
 * `staffelGrenzenIdentisch` über alle Sorten. Diese Prüfungen werden hier nicht
 * nachgebaut, sondern importiert.
 */
import { describe, it, expect } from 'vitest';
import type { Preisstaffel } from '../../types/platzbauer';
import {
  findeStaffel,
  staffelGrenzenIdentisch,
  staffelnLueckenlos,
} from '../staffelpreisText';
import {
  gleicheGrenzenAn,
  gleicheStufenzahl,
  grenzenEinheitlich,
  grenzenSignatur,
  haengeStufeAn,
  istEchteObergrenze,
  koppleGrenzen,
  leseGrenzen,
  loescheStufe,
  neueStaffelId,
  preisAbstaende,
  preisLuecken,
  pruefeObergrenze,
  pruefeUntergrenze,
  rasterFuerNeueSorte,
  setzeObergrenze,
  setzeUntergrenze,
  spiegleGrenzen,
  waehleLeitIndex,
  wendeRasterAn,
} from '../staffelGrenzen';

const leiter = (...werte: Array<[number, number | null, number]>): Preisstaffel[] =>
  werte.map(([vonMenge, bisMenge, einzelpreis]) => ({ vonMenge, bisMenge, einzelpreis }));

const position = (artikelBezeichnung: string, staffeln: Preisstaffel[]) => ({
  id: `pos-${artikelBezeichnung}`,
  artikelnummer: 'TM-ZM-02',
  artikelBezeichnung,
  // `bezeichnung` nur, damit die Bestandsprüfungen aus staffelpreisText direkt
  // auf dieselben Objekte angewendet werden können.
  bezeichnung: artikelBezeichnung,
  einheit: 't',
  staffeln,
});

const standard = () => leiter([0, 50, 120], [50, 100, 115], [100, null, 110]);

describe('istEchteObergrenze', () => {
  it('erkennt eine echte Obergrenze', () => {
    expect(istEchteObergrenze(50, 0)).toBe(true);
  });

  it('behandelt 0, null und undefined als unbegrenzt', () => {
    expect(istEchteObergrenze(0, 0)).toBe(false);
    expect(istEchteObergrenze(null, 0)).toBe(false);
    expect(istEchteObergrenze(undefined, 0)).toBe(false);
  });

  it('lehnt eine Grenze auf oder unter der eigenen Untergrenze ab', () => {
    expect(istEchteObergrenze(50, 50)).toBe(false);
    expect(istEchteObergrenze(40, 50)).toBe(false);
  });
});

describe('A – Kopplung „ab“ folgt „unter“', () => {
  it('zieht das „ab“ der Folgestufe auf das „unter“ der Vorstufe', () => {
    const ergebnis = koppleGrenzen(leiter([0, 300, 120], [50, 100, 115], [100, null, 110]));
    expect(ergebnis[1].vonMenge).toBe(300);
    expect(ergebnis[1].bisMenge).toBe(100);
  });

  it('wirkt kettenweise über alle Stufen', () => {
    const ergebnis = koppleGrenzen(leiter([0, 300, 120], [0, 500, 115], [0, null, 110]));
    expect(ergebnis.map((s) => s.vonMenge)).toEqual([0, 300, 500]);
    expect(staffelnLueckenlos(ergebnis)).toBe(true);
  });

  it('lässt das „ab“ der ersten Stufe unangetastet', () => {
    const ergebnis = koppleGrenzen(leiter([50, 300, 120], [0, null, 110]));
    expect(ergebnis[0].vonMenge).toBe(50);
  });

  it('ändert niemals ein „unter“, sortiert nicht und löscht nicht', () => {
    const vorher = leiter([0, 40, 120], [300, 100, 115], [100, null, 110]);
    const ergebnis = koppleGrenzen(vorher);
    expect(ergebnis).toHaveLength(3);
    expect(ergebnis.map((s) => s.bisMenge)).toEqual([40, 100, null]);
    expect(ergebnis.map((s) => s.einzelpreis)).toEqual([120, 115, 110]);
  });

  it('propagiert weder 0 noch null als Grenze', () => {
    const ergebnis = koppleGrenzen(leiter([0, 0, 120], [50, null, 115]));
    expect(ergebnis[1].vonMenge).toBe(50);
    const mitNull = koppleGrenzen(leiter([0, null, 120], [50, null, 115]));
    expect(mitNull[1].vonMenge).toBe(50);
  });

  it('ist pfadunabhängig: 3 → 30 → 300 endet wie einmal 300', () => {
    const start = [position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, null, 110]))];
    // Tippen schreibt nur die eigene Zelle, erst das Verlassen koppelt.
    const getippt = [3, 30, 300].reduce(
      (stand, wert) => setzeObergrenze(stand, 0, 0, wert, { koppeln: false }),
      start
    );
    const nachVerlassen = setzeObergrenze(getippt, 0, 0, 300);
    const direkt = setzeObergrenze(start, 0, 0, 300);
    expect(nachVerlassen[0].staffeln).toEqual(direkt[0].staffeln);
    expect(nachVerlassen[0].staffeln[1].vonMenge).toBe(300);
  });

  it('reißt beim Tippen keine Folgestufe mit', () => {
    const start = [position('Ziegelmehl 0/2', standard())];
    const zwischenstand = setzeObergrenze(start, 0, 0, 3, { koppeln: false });
    expect(zwischenstand[0].staffeln[1].vonMenge).toBe(50);
    expect(zwischenstand[0].staffeln[2].vonMenge).toBe(100);
  });

  it('gibt bei unverändertem Ergebnis die identische Referenz zurück', () => {
    const staffeln = standard();
    expect(koppleGrenzen(staffeln)).toBe(staffeln);
    const positionen = [position('Ziegelmehl 0/2', staffeln)];
    expect(setzeObergrenze(positionen, 0, 0, 50)).toBe(positionen);
    expect(setzeObergrenze(positionen, 0, 0, 50, { koppeln: false })).toBe(positionen);
  });

  it('übernimmt Nachkommastellen unverändert', () => {
    const ergebnis = setzeObergrenze([position('Ziegelmehl 0/2', standard())], 0, 0, 300.5);
    expect(ergebnis[0].staffeln[0].bisMenge).toBe(300.5);
    expect(ergebnis[0].staffeln[1].vonMenge).toBe(300.5);
  });
});

describe('A2 – Prüfung der Eingabe beim Verlassen des Feldes', () => {
  it('nimmt eine Grenze über der eigenen Untergrenze an', () => {
    expect(pruefeObergrenze(standard(), 1, 90)).toEqual({ gueltig: true });
  });

  it('lehnt eine Grenze auf oder unter dem eigenen „ab“ ab und sagt warum', () => {
    const ergebnis = pruefeObergrenze(standard(), 1, 50);
    expect(ergebnis.gueltig).toBe(false);
    expect(ergebnis.hinweis).toContain('50');
  });

  it('lehnt eine Grenze ab, die über die nächste feste Grenze hinausgeht', () => {
    const ergebnis = pruefeObergrenze(standard(), 0, 150);
    expect(ergebnis.gueltig).toBe(false);
    expect(ergebnis.hinweis).toContain('100');
  });

  it('erlaubt ein geleertes Feld und eine 0 nur in der letzten Stufe', () => {
    expect(pruefeObergrenze(standard(), 2, null).gueltig).toBe(true);
    expect(pruefeObergrenze(standard(), 2, 0).gueltig).toBe(true);
    // Offen in der Mitte hieße: „ab“ der Folgestufe bleibt stehen, Lücke.
    expect(pruefeObergrenze(standard(), 1, null).gueltig).toBe(false);
    expect(pruefeObergrenze(standard(), 1, 0).hinweis).toContain('letzte Stufe');
  });

  it('prüft die Mindestabnahme in Stufe 1 gegen die eigene Obergrenze', () => {
    expect(pruefeUntergrenze(standard(), 0, 20).gueltig).toBe(true);
    expect(pruefeUntergrenze(standard(), 0, 50).gueltig).toBe(false);
    expect(pruefeUntergrenze(standard(), 0, 60).hinweis).toContain('50');
    expect(pruefeUntergrenze(standard(), 0, -5).gueltig).toBe(false);
    // Offene Stufe: jede Untergrenze ab 0 ist möglich.
    expect(pruefeUntergrenze(leiter([0, null, 120]), 0, 500).gueltig).toBe(true);
  });

  it('schreibt die Mindestabnahme, ohne die übrigen Grenzen zu berühren', () => {
    const ergebnis = setzeUntergrenze([position('Ziegelmehl 0/2', standard())], 0, 0, 20);
    expect(ergebnis[0].staffeln[0].vonMenge).toBe(20);
    expect(ergebnis[0].staffeln.map(s => s.bisMenge)).toEqual([50, 100, null]);
    expect(setzeUntergrenze(ergebnis, 0, 0, 20)).toBe(ergebnis);
  });
});

describe('B – ein Raster für alle Sorten', () => {
  const zweiSorten = () => [
    position('Ziegelmehl 0/2', standard()),
    position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, 100, 90], [100, null, 85])),
  ];

  it('überträgt die Grenzen der Leitsorte, lässt die Preise je Sorte stehen', () => {
    const geaendert = setzeObergrenze(zweiSorten(), 0, 0, 40);
    const ergebnis = spiegleGrenzen(geaendert, 0);
    expect(leseGrenzen(ergebnis[1].staffeln)).toEqual(leseGrenzen(ergebnis[0].staffeln));
    expect(ergebnis[1].staffeln.map((s) => s.einzelpreis)).toEqual([95, 90, 85]);
    expect(staffelGrenzenIdentisch(ergebnis)).toBe(true);
    expect(ergebnis.every((p) => staffelnLueckenlos(p.staffeln))).toBe(true);
  });

  it('ergänzt fehlende Stufen mit dem Preis der letzten vorhandenen', () => {
    const positionen = [
      position('Ziegelmehl 0/2', standard()),
      position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, null, 90])),
    ];
    const ergebnis = spiegleGrenzen(positionen, 0);
    expect(ergebnis[1].staffeln).toHaveLength(3);
    expect(ergebnis[1].staffeln[2].einzelpreis).toBe(90);
    expect(ergebnis[1].staffeln[2].bisMenge).toBeNull();
  });

  it('schneidet überzählige Stufen ab und macht die neue letzte offen', () => {
    const positionen = [
      position('Ziegelmehl 0/2', leiter([0, 100, 120], [100, null, 110])),
      position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, 100, 90], [100, 200, 85], [200, null, 80])),
    ];
    const ergebnis = spiegleGrenzen(positionen, 0);
    expect(ergebnis[1].staffeln).toHaveLength(2);
    expect(ergebnis[1].staffeln[1].bisMenge).toBeNull();
    expect(ergebnis[1].staffeln.map((s) => s.einzelpreis)).toEqual([95, 90]);
  });

  it('lässt alles außer den Grenzen unverändert', () => {
    const positionen = zweiSorten();
    const ergebnis = spiegleGrenzen(setzeObergrenze(positionen, 0, 0, 40), 0);
    expect(ergebnis[1].id).toBe(positionen[1].id);
    expect(ergebnis[1].artikelnummer).toBe(positionen[1].artikelnummer);
    expect(ergebnis[1].artikelBezeichnung).toBe(positionen[1].artikelBezeichnung);
  });

  it('ist idempotent und referenzstabil', () => {
    const positionen = zweiSorten();
    expect(spiegleGrenzen(positionen, 0)).toBe(positionen);
    const einmal = spiegleGrenzen(setzeObergrenze(positionen, 0, 0, 40), 0);
    expect(spiegleGrenzen(einmal, 0)).toBe(einmal);
  });

  it('speichert eine 0 nie als Obergrenze – sie bedeutet portalweit „unbegrenzt“', () => {
    const ergebnis = setzeObergrenze([position('Ziegelmehl 0/2', standard())], 0, 2, 0);
    expect(ergebnis[0].staffeln[2].bisMenge).toBeNull();
    // Altbestand mit einer gespeicherten 0 wird beim nächsten Schreiben geheilt.
    const altbestand = [position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, 0, 110]))];
    expect(setzeObergrenze(altbestand, 0, 1, 0, { koppeln: false })[0].staffeln[1].bisMenge).toBeNull();
    // Steht dort schon null, passiert nichts.
    const sauber = [position('Ziegelmehl 0/2', standard())];
    expect(setzeObergrenze(sauber, 0, 2, 0, { koppeln: false })).toBe(sauber);
  });

  it('legt einer Sorte ganz ohne Stufen wieder eine erste Stufe an', () => {
    const ohneStufen = [position('Ziegelmehl 0/2', [])];
    const ergebnis = haengeStufeAn(ohneStufen);
    expect(ergebnis[0].staffeln).toHaveLength(1);
    expect(ergebnis[0].staffeln[0]).toEqual({ vonMenge: 0, bisMenge: null, einzelpreis: 0 });
  });

  it('verträgt eine leere Liste und Sorten ohne Stufen', () => {
    expect(spiegleGrenzen([], 0)).toEqual([]);
    const ohneStufen = [position('Ziegelmehl 0/2', []), position('Ziegelmehl 0/3', standard())];
    expect(() => spiegleGrenzen(ohneStufen, 0)).not.toThrow();
    expect(spiegleGrenzen(ohneStufen, 0)).toBe(ohneStufen);
  });

  it('wählt die Sorte mit den meisten Stufen als Leitsorte', () => {
    const positionen = [
      position('Ziegelmehl 0/2', leiter([0, null, 120])),
      position('Ziegelmehl 0/3', standard()),
    ];
    expect(waehleLeitIndex(positionen)).toBe(1);
    expect(waehleLeitIndex(zweiSorten())).toBe(0);
  });

  it('erkennt, ob ein Raster überhaupt indexweise übertragbar ist', () => {
    // Nur bei gleicher Stufenzahl bedeutet Stufe i in jeder Sorte dasselbe;
    // sonst gehört der Angleich in gleicheGrenzenAn (Preis über die Menge).
    expect(gleicheStufenzahl(zweiSorten())).toBe(true);
    expect(
      gleicheStufenzahl([
        position('Ziegelmehl 0/2', standard()),
        position('Ziegelmehl 0/3', leiter([0, 100, 95], [100, null, 85])),
      ])
    ).toBe(false);
    expect(gleicheStufenzahl([])).toBe(true);
  });

  it('erkennt einheitliche und abweichende Raster', () => {
    expect(grenzenEinheitlich(zweiSorten())).toBe(true);
    expect(grenzenEinheitlich(setzeObergrenze(zweiSorten(), 0, 0, 40))).toBe(false);
    expect(grenzenSignatur(standard())).toBe('0-50|50-100|100-inf');
  });
});

describe('C – Stufe anhängen und löschen', () => {
  const zweiSorten = () => [
    position('Ziegelmehl 0/2', standard()),
    position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, 100, 90], [100, null, 85])),
  ];

  it('hängt in allen Sorten dieselbe Stufe an, nur die neue bleibt offen', () => {
    const ergebnis = haengeStufeAn(zweiSorten());
    expect(ergebnis[0].staffeln).toHaveLength(4);
    expect(leseGrenzen(ergebnis[1].staffeln)).toEqual(leseGrenzen(ergebnis[0].staffeln));
    expect(ergebnis[0].staffeln[2].bisMenge).toBe(150);
    expect(ergebnis[0].staffeln[3].bisMenge).toBeNull();
    expect(staffelnLueckenlos(ergebnis[0].staffeln)).toBe(true);
  });

  it('leitet den Preis der neuen Stufe je Sorte aus ihrer eigenen Vorstufe ab', () => {
    const ergebnis = haengeStufeAn(zweiSorten());
    expect(ergebnis[0].staffeln[3].einzelpreis).toBe(105);
    expect(ergebnis[1].staffeln[3].einzelpreis).toBe(80);
  });

  it('nutzt bei einer begrenzten letzten Stufe deren Grenze statt des Schritts', () => {
    const ergebnis = haengeStufeAn([position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, 400, 110]))]);
    expect(ergebnis[0].staffeln[2].vonMenge).toBe(400);
    expect(ergebnis[0].staffeln[2].bisMenge).toBeNull();
  });

  it('behandelt eine letzte Stufe mit „unter 0“ als unbegrenzt', () => {
    const ergebnis = haengeStufeAn([position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, 0, 110]))]);
    expect(ergebnis[0].staffeln[2].vonMenge).toBe(100);
  });

  it('lässt beim Löschen einer mittleren Stufe keine Lücke zurück', () => {
    const ergebnis = loescheStufe(zweiSorten(), 1);
    expect(leseGrenzen(ergebnis[0].staffeln)).toEqual([
      { vonMenge: 0, bisMenge: 100 },
      { vonMenge: 100, bisMenge: null },
    ]);
    expect(ergebnis[0].staffeln[0].einzelpreis).toBe(120);
    expect(staffelnLueckenlos(ergebnis[0].staffeln)).toBe(true);
    expect(staffelGrenzenIdentisch(ergebnis)).toBe(true);
  });

  it('lässt beim Löschen der ersten Stufe die neue erste bei 0 beginnen', () => {
    const ergebnis = loescheStufe(zweiSorten(), 0);
    expect(ergebnis[0].staffeln[0].vonMenge).toBe(0);
    expect(ergebnis[0].staffeln[0].einzelpreis).toBe(115);
    expect(staffelnLueckenlos(ergebnis[0].staffeln)).toBe(true);
  });

  it('macht beim Löschen der letzten Stufe die neue letzte offen', () => {
    const ergebnis = loescheStufe(zweiSorten(), 2);
    expect(ergebnis[0].staffeln).toHaveLength(2);
    expect(ergebnis[0].staffeln[1].bisMenge).toBeNull();
  });

  it('lässt eine gedeckelte letzte Stufe gedeckelt, wenn eine andere gelöscht wird', () => {
    // „unter 500 t" steht so im Kundenangebot – es darf nicht stillschweigend
    // zu „unbegrenzt" werden, nur weil eine Stufe darüber entfällt.
    const gedeckelt = [position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, 100, 115], [100, 500, 110]))];
    expect(loescheStufe(gedeckelt, 1)[0].staffeln.map(s => s.bisMenge)).toEqual([100, 500]);
    expect(loescheStufe(gedeckelt, 0)[0].staffeln.map(s => s.bisMenge)).toEqual([100, 500]);
    expect(loescheStufe(gedeckelt, 2)[0].staffeln.map(s => s.bisMenge)).toEqual([50, null]);
  });

  it('löscht in allen Sorten dieselbe Stufe, ohne die Preise zu verschieben', () => {
    const ergebnis = loescheStufe(zweiSorten(), 1);
    expect(ergebnis[1].staffeln.map((s) => s.einzelpreis)).toEqual([95, 85]);
  });

  it('lässt die letzte verbliebene Stufe stehen', () => {
    const eine = [position('Ziegelmehl 0/2', leiter([0, null, 120]))];
    expect(loescheStufe(eine, 0)).toBe(eine);
  });

  it('wirkt mit nurPosition ausschließlich auf eine Sorte', () => {
    const ergebnis = haengeStufeAn(zweiSorten(), { nurPosition: 1 });
    expect(ergebnis[0].staffeln).toHaveLength(3);
    expect(ergebnis[1].staffeln).toHaveLength(4);
  });
});

describe('D – neue Sorte, Altdaten und Nachbedingungen', () => {
  it('legt eine neue Sorte direkt im bestehenden Raster an', () => {
    const raster = leseGrenzen(standard());
    const neu = rasterFuerNeueSorte(raster, 95);
    expect(leseGrenzen(neu)).toEqual(raster);
    expect(neu.map((s) => s.einzelpreis)).toEqual([95, 90, 85]);
  });

  it('übernimmt die Preisabstände der Leitsorte statt eines festen Abschlags', () => {
    const abstaende = preisAbstaende(standard());
    expect(abstaende).toEqual([0, -5, -10]);
    const neu = rasterFuerNeueSorte(leseGrenzen(standard()), 80, preisAbstaende(leiter([0, 50, 120], [50, 100, 108], [100, null, 100])));
    expect(neu.map((s) => s.einzelpreis)).toEqual([80, 68, 60]);
  });

  it('lässt keinen negativen Preis entstehen', () => {
    const neu = rasterFuerNeueSorte(leseGrenzen(standard()), 5);
    expect(neu.map((s) => s.einzelpreis)).toEqual([5, 0, 0]);
  });

  it('gleicht Altdaten über den Preis an, den die Sorte bei dieser Menge hatte', () => {
    const positionen = [
      position('Ziegelmehl 0/2', leiter([0, 300, 120], [300, null, 110])),
      position('Ziegelmehl 0/3', leiter([0, 100, 95], [100, 400, 90], [400, null, 85])),
    ];
    const ergebnis = gleicheGrenzenAn(positionen, 0);
    expect(leseGrenzen(ergebnis[1].staffeln)).toEqual(leseGrenzen(positionen[0].staffeln));
    // 0 t lag in der alten Leiter bei 95, 300 t in der Stufe 100–400 bei 90.
    expect(ergebnis[1].staffeln.map((s) => s.einzelpreis)).toEqual([95, 90]);
    expect(staffelGrenzenIdentisch(ergebnis)).toBe(true);
  });

  it('gleicht auch die Leitsorte an, damit nach dem Klick kein Loch bleibt', () => {
    // Leitsorte mit Lücke (0–3, dann ab 50): Der Angleich darf sie nicht in
    // alle Sorten kopieren, sonst sperrt die Lückenwarnung danach den Submit.
    const positionen = [
      position('Ziegelmehl 0/2', leiter([0, 3, 120], [50, 100, 115], [100, null, 110])),
      position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, null, 90])),
    ];
    const ergebnis = gleicheGrenzenAn(positionen, 0);
    expect(staffelnLueckenlos(ergebnis[0].staffeln)).toBe(true);
    expect(staffelnLueckenlos(ergebnis[1].staffeln)).toBe(true);
    expect(staffelGrenzenIdentisch(ergebnis)).toBe(true);
  });

  it('ist beim Angleich deterministisch und referenzstabil', () => {
    const positionen = [
      position('Ziegelmehl 0/2', standard()),
      position('Ziegelmehl 0/3', leiter([0, 50, 95], [50, 100, 90], [100, null, 85])),
    ];
    expect(gleicheGrenzenAn(positionen, 0)).toBe(positionen);
  });

  it('meldet Stufen ohne Preis', () => {
    const positionen = [position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, null, 0]))];
    expect(preisLuecken(positionen)).toEqual([
      { bezeichnung: 'Ziegelmehl 0/2', stufenIndex: 1, vonMenge: 50 },
    ]);
    expect(preisLuecken([position('Ziegelmehl 0/2', standard())])).toEqual([]);
  });

  it('hält die Grenzregel „ab 300 t“ ein: die Grenze gehört zur höheren Stufe', () => {
    const zweiStufen = [position('Ziegelmehl 0/2', leiter([0, 50, 120], [50, null, 110]))];
    const ergebnis = setzeObergrenze(zweiStufen, 0, 0, 300);
    expect(findeStaffel(ergebnis[0].staffeln, 300)?.einzelpreis).toBe(110);
    expect(findeStaffel(ergebnis[0].staffeln, 299)?.einzelpreis).toBe(120);
  });

  it('hält die Liste aufsteigend, weil das PDF nach Array-Index nummeriert', () => {
    const ergebnis = loescheStufe(haengeStufeAn([position('Ziegelmehl 0/2', standard())]), 1);
    const von = ergebnis[0].staffeln.map((s) => s.vonMenge);
    expect([...von].sort((a, b) => a - b)).toEqual(von);
  });

  it('vergibt auch bei zwei Aufrufen in derselben Millisekunde verschiedene IDs', () => {
    expect(neueStaffelId()).not.toBe(neueStaffelId());
  });

  it('lässt eine von Hand gebaute Lücke erkennbar (die Utility bügelt nichts unter den Teppich)', () => {
    const mitLuecke = leiter([0, 300, 120], [400, null, 110]);
    expect(staffelnLueckenlos(koppleGrenzen(mitLuecke))).toBe(true);
    const offeneMitte = leiter([0, null, 120], [400, null, 110]);
    expect(staffelnLueckenlos(koppleGrenzen(offeneMitte))).toBe(false);
  });
});

describe('wendeRasterAn', () => {
  it('gibt bei leerem Raster die Ausgangsleiter zurück', () => {
    const staffeln = standard();
    expect(wendeRasterAn(staffeln, [])).toBe(staffeln);
  });
});

describe('Regionpreise überleben die Grenzenpflege', () => {
  const mitRegion = (): Array<{ artikelBezeichnung: string; staffeln: Preisstaffel[] }> => [
    {
      artikelBezeichnung: '0/2',
      staffeln: [
        { vonMenge: 0, bisMenge: 200, einzelpreis: 160 },
        {
          vonMenge: 200,
          bisMenge: null,
          einzelpreis: 150,
          regionPreise: [{ plzGebiete: '97', einzelpreis: 155 }],
        },
      ],
    },
    {
      artikelBezeichnung: '0/3',
      staffeln: [
        { vonMenge: 0, bisMenge: 300, einzelpreis: 158 },
        { vonMenge: 300, bisMenge: null, einzelpreis: 148 },
      ],
    },
  ];

  it('spiegleGrenzen lässt die Regionpreise der Leitsorte stehen', () => {
    const ergebnis = spiegleGrenzen(mitRegion(), 0);
    expect(ergebnis[0].staffeln[1].regionPreise?.[0].einzelpreis).toBe(155);
  });

  it('gleicheGrenzenAn trägt die Regionpreise in die angeglichene Sorte mit', () => {
    const ergebnis = gleicheGrenzenAn(mitRegion(), 0);
    expect(ergebnis[0].staffeln[1].regionPreise?.[0].plzGebiete).toBe('97');
  });

  it('erkennt eine geänderte PLZ-Liste als Änderung', () => {
    const positionen = mitRegion();
    const geaendert = [
      positionen[0],
      {
        ...positionen[1],
        staffeln: [
          positionen[1].staffeln[0],
          {
            ...positionen[1].staffeln[1],
            regionPreise: [{ plzGebiete: '90', einzelpreis: 140 }],
          },
        ],
      },
    ];
    // spiegleGrenzen darf die neue Region nicht als "unverändert" verwerfen
    const ergebnis = spiegleGrenzen(geaendert, 1);
    expect(ergebnis[1].staffeln[1].regionPreise?.[0].plzGebiete).toBe('90');
  });
});
