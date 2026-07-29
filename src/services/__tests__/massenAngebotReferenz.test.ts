// Unit-Tests für die reine Referenz-/Paletten-Logik des Massen-Angebots-Tools:
// Artikel-Klassifikation, Produktprofil, „größte Bestellung des Jahres" und
// die Aufrundung von Sack-/Palettenware auf halbe/ganze Paletten.

import { describe, it, expect } from 'vitest';
import { _massenAngebotInternals as internals } from '../massenAngebotService';
import { Position } from '../../types/projektabwicklung';
import { MassenAngebotKandidat } from '../../types/massenAngebot';

let idZaehler = 0;
const pos = (teil: Partial<Position>): Position => ({
  id: `test-${++idZaehler}`,
  bezeichnung: 'Test',
  menge: 0,
  einheit: 't',
  einzelpreis: 0,
  gesamtpreis: 0,
  ...teil,
});

describe('klassifizierePosition', () => {
  it('erkennt Schüttgut, Sackware, Beiladung, BigBag und Palette an der Artikelnummer', () => {
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-02' }))).toBe('schuettgut');
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-03' }))).toBe('schuettgut');
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-02St' }))).toBe('sack_palette');
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-03S', einheit: 'Stk' }))).toBe(
      'beiladung_sack'
    );
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-02BB' }))).toBe('bigbag');
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-ZM-BIG-03' }))).toBe('bigbag');
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-PAL', einheit: 'Stk' }))).toBe(
      'paletten_zubehoer'
    );
    expect(internals.klassifizierePosition(pos({ artikelnummer: 'TM-PE', einheit: 'Stk' }))).toBe('sonstig');
  });
});

describe('bestimmeProduktprofil', () => {
  it('liefert schuettgut/paletten/gemischt je nach Material-Positionen', () => {
    const schuett = pos({ artikelnummer: 'TM-ZM-02', menge: 10 });
    const sack = pos({ artikelnummer: 'TM-ZM-02St', menge: 2 });
    expect(internals.bestimmeProduktprofil([schuett])).toBe('schuettgut');
    expect(internals.bestimmeProduktprofil([sack])).toBe('paletten');
    expect(internals.bestimmeProduktprofil([schuett, sack])).toBe('gemischt');
    // Zubehör allein → Fallback schuettgut
    expect(internals.bestimmeProduktprofil([pos({ artikelnummer: 'TM-PE', einheit: 'Stk' })])).toBe(
      'schuettgut'
    );
  });
});

describe('rundeAufHalbePaletten', () => {
  it('rundet auf 0,5 t auf', () => {
    expect(internals.rundeAufHalbePaletten(0.3)).toBe(0.5);
    expect(internals.rundeAufHalbePaletten(0.5)).toBe(0.5);
    expect(internals.rundeAufHalbePaletten(1.2)).toBe(1.5);
    expect(internals.rundeAufHalbePaletten(2.5)).toBe(2.5);
    expect(internals.rundeAufHalbePaletten(3)).toBe(3);
  });
});

describe('bereitePalettenPositionAuf', () => {
  it('rundet Sackware auf ganze/halbe Paletten und weist den Anbruch zum normalen Tonnenpreis aus', () => {
    const sack = pos({
      artikelnummer: 'TM-ZM-02St',
      bezeichnung: 'Tennismehl 0/2 mm gesackt',
      menge: 2.2,
      einzelpreis: 150,
    });
    const { positionen, warnungen, anbrueche } = internals.bereitePalettenPositionAuf(
      sack,
      'sack_palette'
    );
    // 2,2 t → 2,5 t: 2 t ganze Paletten + 0,5 t Anbruch. Der Tonnenpreis bleibt
    // unangetastet — der Aufschlag ist eine eigene Pauschal-Position (siehe unten).
    expect(positionen).toHaveLength(2);
    expect(positionen[0].menge).toBe(2);
    expect(positionen[0].einzelpreis).toBe(150);
    expect(positionen[1].menge).toBe(0.5);
    expect(positionen[1].einzelpreis).toBe(150);
    expect(positionen[1].gesamtpreis).toBe(75);
    expect(positionen[1].bezeichnung).toContain('halbe Palette');
    expect(anbrueche).toBe(1);
    expect(warnungen.some((w) => w.includes('aufgerundet'))).toBe(true);
  });

  it('meldet keinen Anbruch, wenn die Menge auf ganze Paletten aufgeht', () => {
    const sack = pos({ artikelnummer: 'TM-ZM-02St', menge: 3, einzelpreis: 150 });
    const { positionen, anbrueche } = internals.bereitePalettenPositionAuf(sack, 'sack_palette');
    expect(positionen).toHaveLength(1);
    expect(positionen[0].menge).toBe(3);
    expect(anbrueche).toBe(0);
  });

  it('stellt Alt-Beiladungs-Säcke auf Palettenware um (25 Säcke ≙ 1 t)', () => {
    // 30 Säcke à 40 kg = 1,2 t → 1,5 t (1 ganze + halbe Palette), €/t = 8,50 × 25 = 212,50
    const saecke = pos({
      artikelnummer: 'TM-ZM-02S',
      bezeichnung: 'Beiladung',
      menge: 30,
      einheit: 'Stk',
      einzelpreis: 8.5,
    });
    const { positionen, anbrueche } = internals.bereitePalettenPositionAuf(saecke, 'beiladung_sack');
    expect(positionen).toHaveLength(2);
    expect(positionen[0].artikelnummer).toBe('TM-ZM-02St');
    expect(positionen[0].einheit).toBe('t');
    expect(positionen[0].menge).toBe(1);
    expect(positionen[0].einzelpreis).toBe(212.5);
    expect(positionen[1].menge).toBe(0.5);
    expect(anbrueche).toBe(1);
  });

  it('rundet BigBags auf ganze Gebinde auf', () => {
    const bigbag = pos({ artikelnummer: 'TM-ZM-02BB', menge: 2.3, einzelpreis: 125 });
    const { positionen, anbrueche } = internals.bereitePalettenPositionAuf(bigbag, 'bigbag');
    expect(positionen).toHaveLength(1);
    expect(positionen[0].menge).toBe(3);
    expect(positionen[0].gesamtpreis).toBe(375);
    expect(anbrueche).toBe(0);
  });
});

describe('baueAngebotsPositionenAusReferenz', () => {
  it('klont Schüttgut/Zubehör 1:1 und bereitet nur den Paletten-Block auf (gemischt = ein Angebot)', () => {
    const referenz = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 10, einzelpreis: 100, gesamtpreis: 1000 }),
      pos({ artikelnummer: 'TM-PE', menge: 1, einheit: 'Stk', einzelpreis: 20, gesamtpreis: 20 }),
      pos({ artikelnummer: 'TM-ZM-03St', menge: 1.2, einzelpreis: 150 }),
    ];
    const { positionen } = internals.baueAngebotsPositionenAusReferenz(referenz, 0);
    // 10 t Schüttgut + Folie + (1 t + 0,5 t Sackware); ohne Aufschlag keine Zusatzposition
    expect(positionen).toHaveLength(4);
    expect(positionen[0].artikelnummer).toBe('TM-ZM-02');
    expect(positionen[0].menge).toBe(10);
    expect(positionen[2].menge + positionen[3].menge).toBe(1.5);
  });

  it('weist den Anbruch-Aufschlag als eigene Pauschal-Position mit dem festen Euro-Betrag aus', () => {
    const referenz = [pos({ artikelnummer: 'TM-ZM-02St', menge: 1.2, einzelpreis: 150 })];
    const { positionen, warnungen } = internals.baueAngebotsPositionenAusReferenz(referenz, 25);
    // 1,2 t → 1 t ganze Palette + 0,5 t Anbruch + 1× Aufschlag-Pauschale
    expect(positionen).toHaveLength(3);
    // Warenpositionen zum unveränderten Tonnenpreis
    expect(positionen[0].einzelpreis).toBe(150);
    expect(positionen[1].einzelpreis).toBe(150);
    // Aufschlag als letzte, klar benannte Pauschal-Position
    const aufschlag = positionen[2];
    expect(aufschlag.bezeichnung).toBe(internals.ANBRUCH_AUFSCHLAG_BEZEICHNUNG);
    expect(aufschlag.einheit).toBe(internals.ANBRUCH_AUFSCHLAG_EINHEIT);
    expect(aufschlag.menge).toBe(1);
    expect(aufschlag.einzelpreis).toBe(25);
    expect(aufschlag.gesamtpreis).toBe(25);
    expect(warnungen.some((w) => w.includes('nicht konfiguriert'))).toBe(false);
  });

  it('bündelt mehrere Anbrüche in EINER Pauschal-Position (Menge = Anzahl der Anbrüche)', () => {
    const referenz = [
      pos({ artikelnummer: 'TM-ZM-02St', menge: 1.2, einzelpreis: 150 }),
      pos({ artikelnummer: 'TM-ZM-03St', menge: 2.1, einzelpreis: 160 }),
    ];
    const { positionen } = internals.baueAngebotsPositionenAusReferenz(referenz, 25);
    // (1 t + 0,5 t) + (2 t + 0,5 t) + 1× Aufschlag-Pauschale à 2
    expect(positionen).toHaveLength(5);
    const aufschlaege = positionen.filter(
      (p) => p.bezeichnung === internals.ANBRUCH_AUFSCHLAG_BEZEICHNUNG
    );
    expect(aufschlaege).toHaveLength(1);
    expect(aufschlaege[0].menge).toBe(2);
    expect(aufschlaege[0].einzelpreis).toBe(25);
    expect(aufschlaege[0].gesamtpreis).toBe(50);
  });

  it('erzeugt bei Aufschlag 0 keine Position, warnt aber „nicht konfiguriert"', () => {
    const referenz = [pos({ artikelnummer: 'TM-ZM-02St', menge: 1.2, einzelpreis: 150 })];
    const { positionen, warnungen } = internals.baueAngebotsPositionenAusReferenz(referenz, 0);
    expect(positionen).toHaveLength(2);
    expect(
      positionen.some((p) => p.bezeichnung === internals.ANBRUCH_AUFSCHLAG_BEZEICHNUNG)
    ).toBe(false);
    expect(warnungen.some((w) => w.includes('nicht konfiguriert'))).toBe(true);
  });

  it('erzeugt ohne Anbruch weder Aufschlag-Position noch Warnung', () => {
    const referenz = [pos({ artikelnummer: 'TM-ZM-02St', menge: 2, einzelpreis: 150 })];
    const { positionen, warnungen } = internals.baueAngebotsPositionenAusReferenz(referenz, 25);
    expect(positionen).toHaveLength(1);
    expect(warnungen).toHaveLength(0);
  });
});

describe('wendePreisanpassungAn', () => {
  // Der Aufschlag ist ein heute gepflegter Stammdaten-Betrag, kein Vorjahrespreis —
  // die Saison-Preisanpassung darf ihn deshalb nicht anheben (25 € dürfen nicht 26 € werden).
  it('lässt den Anbruch-Aufschlag von der prozentualen Preisanpassung unberührt', () => {
    const referenz = [pos({ artikelnummer: 'TM-ZM-02St', menge: 1.2, einzelpreis: 150 })];
    const { positionen } = internals.baueAngebotsPositionenAusReferenz(referenz, 25);
    const primaer = internals.findePrimaerPosition(positionen);

    const kandidat: MassenAngebotKandidat = {
      kundeId: 'k1',
      kundenname: 'Testverein',
      typ: 'verein',
      quelle: 'vorjahr',
      status: 'neu',
      menge: primaer?.menge ?? 0,
      preisProTonne: primaer?.einzelpreis ?? 0,
      angebotssumme: internals.berechneSumme(positionen),
      empfaengerEmail: 'test@example.com',
      emailFehlt: false,
      produktprofil: 'paletten',
      positionen,
      primaerPositionId: primaer?.id,
      fehler: [],
      warnungen: [],
      ausgewaehlt: true,
      // Nur die für validiere() relevanten Felder — der Rest des Kundendatensatzes
      // spielt für die Preisanpassung keine Rolle.
      kunde: {
        id: 'k1',
        name: 'Testverein',
        typ: 'verein',
        aktiv: true,
        lieferadresse: { strasse: 'Teststr. 1', plz: '97232', ort: 'Giebelstadt' },
      } as unknown as MassenAngebotKandidat['kunde'],
    };

    const [angepasst] = internals.wendePreisanpassungAn([kandidat], { typ: 'prozent', wert: 4 });

    const aufschlag = angepasst.positionen.find(
      (p) => p.bezeichnung === internals.ANBRUCH_AUFSCHLAG_BEZEICHNUNG
    );
    expect(aufschlag?.einzelpreis).toBe(25);
    expect(aufschlag?.gesamtpreis).toBe(25);
    // Die Warenpositionen werden dagegen sehr wohl angehoben.
    const ware = angepasst.positionen.filter((p) => p.artikelnummer === 'TM-ZM-02St');
    expect(ware).toHaveLength(2);
    ware.forEach((p) => expect(p.einzelpreis).toBe(156));
  });
});

describe('berechneSchuettgutTonnage', () => {
  it('zählt nur Schüttgut-Positionen (ohne Bedarfspositionen)', () => {
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 10 }),
      pos({ artikelnummer: 'TM-ZM-03', menge: 4 }),
      pos({ artikelnummer: 'TM-ZM-02', menge: 5, istBedarfsposition: true }),
      pos({ artikelnummer: 'TM-ZM-02St', menge: 3 }),
    ];
    expect(internals.berechneSchuettgutTonnage(positionen)).toBe(14);
  });
});

describe('waehleGroessteBestellung', () => {
  type ProjektRef = { id: string; kundeId: string; status?: string };
  const dok = (projektId: string, typ: string, positionen: Position[]) => ({
    projektId,
    dokumentTyp: typ,
    dokumentNummer: 'X',
    dateiId: 'f',
    dateiname: 'x.pdf',
    istFinal: false,
    daten: JSON.stringify({ positionen }),
  });

  it('wählt das Projekt mit der größten Schüttgut-Tonnage (AB schlägt Angebot als Datenbasis)', () => {
    const projekte: ProjektRef[] = [
      { id: 'p1', kundeId: 'k1', status: 'bezahlt' },
      { id: 'p2', kundeId: 'k1', status: 'angebot_versendet' },
    ];
    const dokumente = new Map<string, Record<string, unknown>>([
      // p1: AB mit 8 t (und ein neueres Angebot mit 20 t, das NICHT zählen darf)
      [
        'p1',
        {
          auftragsbestaetigung: dok('p1', 'auftragsbestaetigung', [
            pos({ artikelnummer: 'TM-ZM-02', menge: 8, einzelpreis: 100, gesamtpreis: 800 }),
          ]),
          angebot: dok('p1', 'angebot', [
            pos({ artikelnummer: 'TM-ZM-02', menge: 20, einzelpreis: 100, gesamtpreis: 2000 }),
          ]),
        },
      ],
      // p2: nur Angebot mit 12 t
      [
        'p2',
        {
          angebot: dok('p2', 'angebot', [
            pos({ artikelnummer: 'TM-ZM-02', menge: 12, einzelpreis: 100, gesamtpreis: 1200 }),
          ]),
        },
      ],
    ]);
    const referenz = internals.waehleGroessteBestellung(
      projekte as Parameters<typeof internals.waehleGroessteBestellung>[0],
      dokumente as Parameters<typeof internals.waehleGroessteBestellung>[1]
    );
    // p2 gewinnt: 12 t (Angebot) > 8 t (AB) — Metrik ist die Tonnage
    expect(referenz?.projekt.id).toBe('p2');
    expect(referenz?.typ).toBe('angebot');
    expect(referenz?.tonnage).toBe(12);
  });

  it('vergleicht reine Palettenkunden (0 t) über den Auftragswert und meidet verlorene Projekte', () => {
    const projekte: ProjektRef[] = [
      { id: 'p1', kundeId: 'k1', status: 'verloren' },
      { id: 'p2', kundeId: 'k1', status: 'bezahlt' },
    ];
    const dokumente = new Map<string, Record<string, unknown>>([
      [
        'p1',
        {
          angebot: dok('p1', 'angebot', [
            pos({ artikelnummer: 'TM-ZM-02St', menge: 9, einzelpreis: 150, gesamtpreis: 1350 }),
          ]),
        },
      ],
      [
        'p2',
        {
          rechnung: dok('p2', 'rechnung', [
            pos({ artikelnummer: 'TM-ZM-02St', menge: 2, einzelpreis: 150, gesamtpreis: 300 }),
          ]),
        },
      ],
    ]);
    const referenz = internals.waehleGroessteBestellung(
      projekte as Parameters<typeof internals.waehleGroessteBestellung>[0],
      dokumente as Parameters<typeof internals.waehleGroessteBestellung>[1]
    );
    // p1 hätte den größeren Wert, ist aber verloren → p2 (Rechnung) gewinnt
    expect(referenz?.projekt.id).toBe('p2');
    expect(referenz?.typ).toBe('rechnung');
    expect(referenz?.tonnage).toBe(0);
    expect(referenz?.wert).toBe(300);
  });
});

describe('ermittleMosaikReferenzJahr', () => {
  it('liefert das neueste Saisonjahr aus der Preishistorie', () => {
    const kunde = {
      preisHistorie: [
        { saisonjahr: 2022, preisProTonne: 90, geaendertAm: '' },
        { saisonjahr: 2024, preisProTonne: 95, geaendertAm: '' },
      ],
    };
    expect(
      internals.ermittleMosaikReferenzJahr(kunde as Parameters<typeof internals.ermittleMosaikReferenzJahr>[0])
    ).toBe(2024);
    expect(
      internals.ermittleMosaikReferenzJahr({} as Parameters<typeof internals.ermittleMosaikReferenzJahr>[0])
    ).toBeUndefined();
  });
});
