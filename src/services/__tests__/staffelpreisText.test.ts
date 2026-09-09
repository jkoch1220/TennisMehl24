import { describe, it, expect } from 'vitest';
import {
  berechneStufenpreisAnteile,
  erzeugeStaffelBeispiel,
  erzeugeStaffelHinweistext,
  findeStaffel,
  formatDatumDe,
  formatTonnen,
  staffelEinleitung,
  staffelGrenzenIdentisch,
  staffelnLueckenlos,
  staffelKurzfassung,
  standardStaffelKonditionen,
} from '../../utils/staffelpreisText';
import type { Preisstaffel, StaffelKonditionen } from '../../types/platzbauer';

/**
 * Vorschlag „Hinweistext für Staffelpreisangebot anpassen" (09/2026):
 * Der Platzbauer zahlt die ersten 300 t zu 120 €/t, ab 300 t nur 110 €/t.
 * Der Text auf dem Angebot muss sagen, ob das rückwirkend gilt und wie die
 * Differenz zurückfließt. Diese Tests halten die Rechen- und Textregeln fest.
 */
// Intl und formatTonnen setzen geschützte Leerzeichen; für die Prüfung egalisieren.
const nbsp = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

const staffeln: Preisstaffel[] = [
  { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
  { vonMenge: 300, bisMenge: null, einzelpreis: 110 },
];

const artikel = [{ artikelnummer: 'TM-ZM-02', bezeichnung: 'Ziegelmehl 0/2', staffeln }];

const konditionen = (teil: Partial<StaffelKonditionen> = {}): StaffelKonditionen => ({
  ...standardStaffelKonditionen(2026),
  ...teil,
});

describe('standardStaffelKonditionen', () => {
  it('setzt Saisonbonus, alle Sorten zusammen und den Stichtag 31.10.', () => {
    const k = standardStaffelKonditionen(2026);
    expect(k.abrechnungsmodell).toBe('saisonbonus');
    expect(k.mengenbasis).toBe('gesamt');
    expect(k.zeitraumVon).toBe('2026-01-01');
    expect(k.zeitraumBis).toBe('2026-10-31');
    expect(k.gutschriftNurBeiZahlung).toBe(true);
  });
});

describe('Formatierung', () => {
  it('schreibt Tonnen deutsch mit Tausenderpunkt, Komma und geschütztem Leerzeichen', () => {
    expect(formatTonnen(1234.5)).toBe('1.234,5 t');
    expect(nbsp(formatTonnen(300))).toBe('300 t');
  });

  it('wandelt ISO-Datum in TT.MM.JJJJ', () => {
    expect(formatDatumDe('2026-10-31')).toBe('31.10.2026');
    expect(formatDatumDe(undefined)).toBe('');
    expect(formatDatumDe('')).toBe('');
  });
});

describe('findeStaffel', () => {
  it('rechnet die Grenze zur höheren Stufe („ab 300 t" schließt 300 t ein)', () => {
    expect(findeStaffel(staffeln, 299.9)?.einzelpreis).toBe(120);
    expect(findeStaffel(staffeln, 300)?.einzelpreis).toBe(110);
    expect(findeStaffel(staffeln, 5000)?.einzelpreis).toBe(110);
  });

  it('nimmt unterhalb der ersten Grenze die erste Stufe', () => {
    const abZehn: Preisstaffel[] = [
      { vonMenge: 10, bisMenge: 20, einzelpreis: 100 },
      { vonMenge: 20, bisMenge: null, einzelpreis: 90 },
    ];
    expect(findeStaffel(abZehn, 3)?.einzelpreis).toBe(100);
  });

  it('sortiert unsortierte Staffeln vor der Suche', () => {
    const verdreht = [staffeln[1], staffeln[0]];
    expect(findeStaffel(verdreht, 100)?.einzelpreis).toBe(120);
  });

  it('behandelt bisMenge 0 wie „unbegrenzt" (so speichert es das Eingabefeld)', () => {
    const mitNull: Preisstaffel[] = [
      { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
      { vonMenge: 300, bisMenge: 0, einzelpreis: 110 },
    ];
    expect(findeStaffel(mitNull, 900)?.einzelpreis).toBe(110);
    expect(berechneStufenpreisAnteile(mitNull, 350).map((a) => a.tonnen)).toEqual([300, 50]);
  });
});

describe('berechneStufenpreisAnteile', () => {
  it('teilt 350 t in 300 t zur ersten und 50 t zur zweiten Stufe', () => {
    const anteile = berechneStufenpreisAnteile(staffeln, 350);
    expect(anteile.map((a) => [a.tonnen, a.staffel.einzelpreis])).toEqual([
      [300, 120],
      [50, 110],
    ]);
  });

  it('lässt leere Stufen weg', () => {
    const anteile = berechneStufenpreisAnteile(staffeln, 120);
    expect(anteile).toHaveLength(1);
    expect(anteile[0].tonnen).toBe(120);
  });
});

describe('staffelnLueckenlos', () => {
  it('akzeptiert aneinanderschließende Staffeln mit offener letzter Stufe', () => {
    expect(staffelnLueckenlos(staffeln)).toBe(true);
    expect(
      staffelnLueckenlos([
        { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
        { vonMenge: 300, bisMenge: 600, einzelpreis: 110 },
        { vonMenge: 600, bisMenge: 0, einzelpreis: 105 },
      ])
    ).toBe(true);
  });

  it('erkennt Lücken, Überlappungen und eine offene Stufe in der Mitte', () => {
    expect(
      staffelnLueckenlos([
        { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
        { vonMenge: 400, bisMenge: null, einzelpreis: 110 },
      ])
    ).toBe(false);
    expect(
      staffelnLueckenlos([
        { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
        { vonMenge: 250, bisMenge: null, einzelpreis: 110 },
      ])
    ).toBe(false);
    expect(
      staffelnLueckenlos([
        { vonMenge: 0, bisMenge: null, einzelpreis: 120 },
        { vonMenge: 300, bisMenge: null, einzelpreis: 110 },
      ])
    ).toBe(false);
  });

  it('liefert bei Lücken kein Beispiel, der übrige Text bleibt', () => {
    const mitLuecke = [
      {
        artikelnummer: 'X',
        bezeichnung: 'X',
        staffeln: [
          { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
          { vonMenge: 400, bisMenge: null, einzelpreis: 110 },
        ],
      },
    ];
    expect(erzeugeStaffelBeispiel(konditionen(), mitLuecke)).toBeNull();
    expect(erzeugeStaffelHinweistext(konditionen(), mitLuecke)).toContain('Abrechnung:');
  });
});

describe('staffelGrenzenIdentisch', () => {
  it('erkennt gleiche und abweichende Grenzen', () => {
    const zweite = { artikelnummer: 'TM-ZM-03', bezeichnung: 'Ziegelmehl 0/3', staffeln };
    expect(staffelGrenzenIdentisch([artikel[0], zweite])).toBe(true);

    const andereGrenze = {
      ...zweite,
      staffeln: [
        { vonMenge: 0, bisMenge: 200, einzelpreis: 120 },
        { vonMenge: 200, bisMenge: null, einzelpreis: 110 },
      ],
    };
    expect(staffelGrenzenIdentisch([artikel[0], andereGrenze])).toBe(false);
  });
});

describe('erzeugeStaffelBeispiel', () => {
  it('Saisonbonus: Gutschrift für die gesamte Menge (350 t × 10 € = 3.500 € netto)', () => {
    const text = nbsp(erzeugeStaffelBeispiel(konditionen(), artikel));
    expect(text).toContain('Beispiel (Ziegelmehl 0/2):');
    expect(text).toContain('110,00 €/t für alle 350 t');
    expect(text).toContain('350 t × 10,00 € = 3.500,00 € netto');
  });

  it('Sofortumstellung: Grenzlieferung schon zum neuen Preis, Ausgleich nur für die Tonnen davor', () => {
    const text = nbsp(erzeugeStaffelBeispiel(konditionen({ abrechnungsmodell: 'sofortumstellung' }), artikel));
    // 280 t davor + 25 t Lieferung = 305 t ≥ 300 t; gutgeschrieben werden die 280 t
    expect(text).toContain('bisher 280 t erhalten');
    expect(text).toContain('Lieferung über 25 t bringt die Gesamtabnahme auf 305 t');
    expect(text).toContain('bereits vollständig zu 110,00 €/t');
    expect(text).toContain('280 t × 10,00 € = 2.800,00 € netto');
    expect(text).not.toContain('300 t × 10,00 €');
  });

  it('Stufenpreis: nur die Mehrmenge wird günstiger (300 × 120 + 50 × 110 = 41.500 €)', () => {
    const text = nbsp(erzeugeStaffelBeispiel(konditionen({ abrechnungsmodell: 'stufenpreis' }), artikel));
    expect(text).toContain('300 t × 120,00 € + 50 t × 110,00 € = 41.500,00 € netto');
  });

  it('hält die Beispielmenge in der zweiten Stufe, wenn diese schmal ist', () => {
    const schmal = [
      {
        artikelnummer: 'X',
        bezeichnung: 'X',
        staffeln: [
          { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
          { vonMenge: 300, bisMenge: 340, einzelpreis: 110 },
          { vonMenge: 340, bisMenge: null, einzelpreis: 100 },
        ],
      },
    ];
    const text = nbsp(erzeugeStaffelBeispiel(konditionen({ abrechnungsmodell: 'stufenpreis' }), schmal));
    // 300 + 50 = 350 läge in Stufe 3 → stattdessen Mitte der Stufe 2 (320 t)
    expect(text).toContain('Bei 320 t ergibt das 300 t × 120,00 € + 20 t × 110,00 €');
    expect(text).not.toContain('100,00 €');
  });

  it('liefert kein Beispiel, wenn die erste Stufe eine Mindestabnahme trägt', () => {
    // Die Tabelle im Angebot begänne bei „ab 20 t", die Beispielrechnung rechnet
    // die erste Stufe ab 0 t – zwei verschiedene Zahlen auf einem Beleg.
    const mitMindestabnahme = [
      {
        artikelnummer: 'X',
        bezeichnung: 'X',
        staffeln: [
          { vonMenge: 20, bisMenge: 300, einzelpreis: 120 },
          { vonMenge: 300, bisMenge: null, einzelpreis: 110 },
        ],
      },
    ];
    expect(erzeugeStaffelBeispiel(konditionen(), mitMindestabnahme)).toBeNull();
    // Der erklärende Text bleibt vollständig, nur die Beispielrechnung entfällt.
    expect(erzeugeStaffelHinweistext(konditionen(), mitMindestabnahme)).toContain('So funktioniert die Staffelung');
    expect(erzeugeStaffelHinweistext(konditionen(), mitMindestabnahme)).not.toContain('Beispiel (');
  });

  it('liefert kein Beispiel bei nur einer Stufe oder steigenden Preisen', () => {
    const eineStufe = [{ artikelnummer: 'X', bezeichnung: 'X', staffeln: [staffeln[0]] }];
    expect(erzeugeStaffelBeispiel(konditionen(), eineStufe)).toBeNull();

    const steigend = [
      {
        artikelnummer: 'X',
        bezeichnung: 'X',
        staffeln: [
          { vonMenge: 0, bisMenge: 300, einzelpreis: 100 },
          { vonMenge: 300, bisMenge: null, einzelpreis: 120 },
        ],
      },
    ];
    expect(erzeugeStaffelBeispiel(konditionen(), steigend)).toBeNull();
  });
});

describe('erzeugeStaffelHinweistext', () => {
  it('Saisonbonus: rückwirkend, Grenzregel, Stichtag, Gutschrift mit USt, Zahlungsvoraussetzung', () => {
    const text = nbsp(erzeugeStaffelHinweistext(konditionen(), artikel));
    expect(text).toContain('So funktioniert die Staffelung:');
    expect(text).toContain('im Zeitraum 01.01.2026 bis 31.10.2026');
    expect(text).toContain('gilt rückwirkend für die gesamte');
    expect(text).toContain('Eine Stufengrenze zählt bereits zur höheren Stufe.');
    expect(text).toContain('außerhalb dieses Zeitraums');
    expect(text).toContain('Zum Stichtag 31.10.2026');
    expect(text).toContain('Gutschrift (Staffelbonus)');
    expect(text).toContain('weist die Umsatzsteuer aus, nennt die betroffenen Rechnungen');
    expect(text).toContain('innerhalb von 14 Tagen nach Gutschriftsdatum');
    expect(text).toContain('bei Erstellung der Gutschrift vollständig bezahlt');
    expect(text).toContain('laut Wiegeschein');
    expect(text).toContain('netto zuzüglich der gesetzlichen Umsatzsteuer');
  });

  it('lässt die Zahlungsvoraussetzung weg, wenn sie abgewählt ist', () => {
    const text = erzeugeStaffelHinweistext(konditionen({ gutschriftNurBeiZahlung: false }), artikel);
    expect(text).not.toContain('vollständig bezahlt');
  });

  it('Sofortumstellung: Grenzlieferung zum neuen Preis, Ausgleich für die Tonnen davor', () => {
    const text = erzeugeStaffelHinweistext(konditionen({ abrechnungsmodell: 'sofortumstellung' }), artikel);
    expect(text).toContain('erreicht oder überschreitet, berechnen wir bereits vollständig zum Preis der neuen Stufe');
    expect(text).toContain('Für alle davor gelieferten Tonnen');
    expect(text).toContain('Ausgleichsgutschrift');
  });

  it('Stufenpreis: keine Gutschrift, Aufteilung nur beim Überschreiten', () => {
    const text = erzeugeStaffelHinweistext(konditionen({ abrechnungsmodell: 'stufenpreis' }), artikel);
    expect(text).toContain('Eine nachträgliche Gutschrift erfolgt nicht.');
    expect(text).toContain('Überschreitet eine Lieferung eine Stufengrenze');
    expect(text).toContain('nicht nachträglich günstiger');
    expect(text).not.toContain('vollständig bezahlt');
    expect(text).not.toContain('Staffelbonus');
  });

  it('nennt die Einstufung und die Differenz je Sorte nur bei mehreren Sorten', () => {
    const zweiSorten = [artikel[0], { artikelnummer: 'TM-ZM-03', bezeichnung: 'Ziegelmehl 0/3', staffeln }];
    const eine = erzeugeStaffelHinweistext(konditionen(), artikel);
    expect(eine).not.toContain('Sorten zusammen');
    expect(eine).not.toContain('je Sorte aus deren Staffeltabelle');

    const gesamt = erzeugeStaffelHinweistext(konditionen(), zweiSorten);
    expect(gesamt).toContain('alle angebotenen Sorten zusammen');
    expect(gesamt).toContain('Die Differenz ermitteln wir je Sorte aus deren Staffeltabelle.');

    const getrennt = erzeugeStaffelHinweistext(konditionen({ mengenbasis: 'je-artikel' }), zweiSorten);
    expect(getrennt).toContain('für jede Sorte getrennt');
    expect(getrennt).not.toContain('je Sorte aus deren Staffeltabelle');
  });

  it('kommt ohne Zeitraum aus und schreibt dann „Nach Saisonende"', () => {
    const ohne = konditionen({ zeitraumVon: '', zeitraumBis: '' });
    const text = erzeugeStaffelHinweistext(ohne, artikel);
    expect(text).toContain('während der Saison');
    expect(text).toContain('Nach Saisonende stellen wir');
    expect(text).not.toContain('Stichtag Saisonende');
    expect(text).not.toContain('außerhalb dieses Zeitraums');
    expect(staffelKurzfassung(ohne).join(' ')).toContain('Nach Saisonende erhalten Sie');
  });

  it('nennt einen Beginn auch ohne Stichtag', () => {
    const nurVon = konditionen({ zeitraumVon: '2026-03-01', zeitraumBis: '' });
    expect(staffelEinleitung(nurVon)).toContain('ab dem 01.03.2026');
    expect(erzeugeStaffelHinweistext(nurVon, artikel)).toContain('ab dem 01.03.2026');
  });
});

describe('staffelKurzfassung', () => {
  it('passt die Kurzfassung ans Modell an', () => {
    expect(staffelKurzfassung(konditionen()).join(' ')).toContain('Zum Stichtag 31.10.2026');
    expect(staffelKurzfassung(konditionen({ abrechnungsmodell: 'stufenpreis' })).join(' ')).toContain(
      'keine nachträgliche Gutschrift'
    );
  });
});
