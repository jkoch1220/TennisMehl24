// Die Zuordnung entscheidet, wer ein Serienangebot bekommt — und vor allem, wer
// keins bekommt. Ein Verein, der über seinen Platzbauer beliefert wird, darf
// niemals direkt angeschrieben werden; das unterläuft die Vereinbarung mit dem
// Platzbauer und ist der teuerste Fehler, den dieser Lauf machen kann.

import { describe, it, expect } from 'vitest';
import { ordneZu, bestimmeProfilAusBelegen, istUniversalartikel, Kundenkontext } from '../massenAngebotZielgruppen';
import { SaisonKunde } from '../../types/saisonplanung';
import { Position } from '../../types/projektabwicklung';

const pos = (artikelnummer: string, extra: Partial<Position> = {}): Position =>
  ({ id: artikelnummer, artikelnummer, bezeichnung: artikelnummer, menge: 10, einheit: 't', einzelpreis: 100, gesamtpreis: 1000, ...extra } as Position);

const kunde = (extra: Partial<SaisonKunde> = {}): SaisonKunde =>
  ({
    id: 'k1', typ: 'verein', name: 'TC Musterstadt', aktiv: true, automatischesAngebot: true,
    rechnungsadresse: { strasse: 'Weg 1', plz: '97070', ort: 'Würzburg', bundesland: '' },
    lieferadresse: { strasse: 'Weg 1', plz: '97070', ort: 'Würzburg', bundesland: '' },
    ...extra,
  } as SaisonKunde);

const kontext = (extra: Partial<Kundenkontext> = {}): Kundenkontext => ({
  kunde: kunde(), belege: [], hatZielsaisonProjekt: false, ...extra,
});

describe('Produktprofil aus Belegen', () => {
  it('erkennt lose Ware, Sackware und die Mischung', () => {
    expect(bestimmeProfilAusBelegen([{ jahr: 2026, positionen: [pos('TM-ZM-02')] }]).profil).toBe('schuettgut');
    expect(bestimmeProfilAusBelegen([{ jahr: 2026, positionen: [pos('TM-ZM-02St')] }]).profil).toBe('paletten');
    expect(bestimmeProfilAusBelegen([{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-03BB')] }]).profil).toBe('gemischt');
    expect(bestimmeProfilAusBelegen([]).profil).toBe('keine_daten');
  });

  it('zählt Bedarfspositionen nicht mit — sie sind unverbindlich', () => {
    const belege = [{ jahr: 2026, positionen: [pos('TM-ZM-02St'), pos('TM-ZM-02', { istBedarfsposition: true })] }];
    expect(bestimmeProfilAusBelegen(belege).profil).toBe('paletten');
  });

  it('erkennt Universalartikel an Nummer und Bezeichnung', () => {
    expect(istUniversalartikel(pos('TM-UN-01'))).toBe(true);
    expect(istUniversalartikel(pos('X-1', { bezeichnung: 'Universal Sportplatzbelag' }))).toBe(true);
    expect(istUniversalartikel(pos('TM-ZM-02'))).toBe(false);
  });
});

describe('Harte Ausschlüsse — gelten für jeden Lauf', () => {
  const alleTypen = ['schuettgut', 'paletten', 'fruehjahrsinstandsetzung'] as const;

  it('schließt über Platzbauer belieferte Vereine aus', () => {
    for (const typ of alleTypen) {
      const z = ordneZu(kontext({ bezugswegVorjahr: 'ueber_platzbauer', belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')] }] }), typ);
      expect(z.passt).toBe(false);
      expect(z.hartAusgeschlossen).toMatch(/Platzbauer/);
    }
  });

  it('schließt Kunden mit gesetztem beziehtUeberUnsPlatzbauer aus', () => {
    const z = ordneZu(kontext({ kunde: kunde({ beziehtUeberUnsPlatzbauer: true }) }), 'schuettgut');
    expect(z.passt).toBe(false);
  });

  it('schließt Platzbauer selbst aus', () => {
    expect(ordneZu(kontext({ kunde: kunde({ typ: 'platzbauer' }) }), 'schuettgut').passt).toBe(false);
  });

  it('schließt archivierte und inaktive Kunden aus', () => {
    expect(ordneZu(kontext({ kunde: kunde({ archiviert: true }) }), 'schuettgut').passt).toBe(false);
    expect(ordneZu(kontext({ kunde: kunde({ aktiv: false }) }), 'schuettgut').passt).toBe(false);
  });

  it('schließt Kunden ohne Opt-in aus', () => {
    expect(ordneZu(kontext({ kunde: kunde({ automatischesAngebot: false }) }), 'schuettgut').passt).toBe(false);
    expect(ordneZu(kontext({ kunde: kunde({ automatischesAngebot: undefined }) }), 'schuettgut').passt).toBe(false);
  });

  it('schließt Universalartikel-Kunden aus', () => {
    const z = ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-UN-05')] }] }), 'schuettgut');
    expect(z.passt).toBe(false);
    expect(z.hartAusgeschlossen).toMatch(/Universal/);
  });

  it('verhindert ein zweites Angebot, wenn die Zielsaison schon ein Projekt hat', () => {
    expect(ordneZu(kontext({ hatZielsaisonProjekt: true }), 'schuettgut').passt).toBe(false);
  });
});

describe('Zuordnung zu den drei Läufen', () => {
  it('Instandsetzung: nur der Bezugsweg entscheidet', () => {
    const mit = ordneZu(kontext({ bezugswegVorjahr: 'direkt_instandsetzung' }), 'fruehjahrsinstandsetzung');
    expect(mit.passt).toBe(true);
    expect(mit.herkunft).toMatch(/Instandsetzung/);
    expect(ordneZu(kontext({ bezugswegVorjahr: 'direkt' }), 'fruehjahrsinstandsetzung').passt).toBe(false);
  });

  it('Instandsetzungskunden landen NICHT zusätzlich im Schüttgut-Lauf', () => {
    const z = ordneZu(kontext({ bezugswegVorjahr: 'direkt_instandsetzung', belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')] }] }), 'schuettgut');
    expect(z.passt).toBe(false);
    expect(z.herkunft).toMatch(/Instandsetzungs-Lauf/);
  });

  it('Paletten: nur wer ausschließlich Sackware bezog', () => {
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02St')], typ: 'rechnung' }] }), 'paletten').passt).toBe(true);
    // Gemischt gehört zum Schüttgut — dort ist die lose Ware die Hauptposition.
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-02St')] }] }), 'paletten').passt).toBe(false);
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-02St')] }] }), 'schuettgut').passt).toBe(true);
  });

  it('Schüttgut fängt Kunden ohne Belege auf und nennt die Ersatzquelle', () => {
    const mitMosaik = ordneZu(kontext({ mosaikLetztesJahr: 2019 }), 'schuettgut');
    expect(mitMosaik.passt).toBe(true);
    expect(mitMosaik.quelle).toBe('mosaik');
    expect(mitMosaik.herkunft).toMatch(/2019/);

    const ohneAlles = ordneZu(kontext(), 'schuettgut');
    expect(ohneAlles.passt).toBe(true);
    expect(ohneAlles.quelle).toBe('plz_kalkulation');
  });

  it('reine Palettenkunden landen nicht im Schüttgut-Lauf', () => {
    const z = ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-03St')] }] }), 'schuettgut');
    expect(z.passt).toBe(false);
    expect(z.herkunft).toMatch(/Paletten-Lauf/);
  });

  it('kein Kunde landet in zwei Läufen gleichzeitig', () => {
    const abholerKunde = kunde({ belieferungsart: 'abholung_ab_werk' });
    const faelle: Kundenkontext[] = [
      kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')] }] }),
      kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02St')] }] }),
      kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-02St')] }] }),
      kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-02S')] }] }),
      kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02S')] }] }),
      kontext({ bezugswegVorjahr: 'direkt_instandsetzung' }),
      kontext({ kunde: abholerKunde, belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')] }] }),
      kontext({ kunde: abholerKunde, belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02S')] }] }),
      kontext(),
    ];
    for (const f of faelle) {
      const treffer = (['schuettgut', 'paletten', 'fruehjahrsinstandsetzung', 'abholung'] as const).filter((t) => ordneZu(f, t).passt);
      expect(treffer.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('Angebot ist keine Bestellung', () => {
  it('markiert eine Zeile, die nur auf einem unbeantworteten Angebot beruht', () => {
    const z = ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02St')], typ: 'angebot' }] }), 'paletten');
    expect(z.passt).toBe(true);
    expect(z.nurAngebotKeineBestellung).toBe(true);
    // Der Text darf nicht behaupten, der Verein habe bezogen.
    expect(z.herkunft).toMatch(/nicht bestellt/);
    expect(z.herkunft).not.toMatch(/[Bb]ezog/);
  });

  it('markiert sie NICHT, wenn eine Rechnung oder AB dahintersteht', () => {
    for (const typ of ['rechnung', 'auftragsbestaetigung'] as const) {
      const z = ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02St')], typ }] }), 'paletten');
      expect(z.nurAngebotKeineBestellung).toBe(false);
    }
  });

  it('nennt die Belegart im Klartext', () => {
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')], typ: 'rechnung' }] }), 'schuettgut').herkunft)
      .toMatch(/Rechnung 2026/);
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')], typ: 'auftragsbestaetigung' }] }), 'schuettgut').herkunft)
      .toMatch(/Auftragsbestätigung 2026/);
  });
});

describe('Abholer ab Werk', () => {
  const abholer = (positionen = [pos('TM-ZM-02')]) =>
    kontext({ kunde: kunde({ belieferungsart: 'abholung_ab_werk' }), belege: [{ jahr: 2026, positionen, typ: 'rechnung' as const }] });

  it('landen im Abholer-Lauf, nicht im Schüttgut-Lauf', () => {
    const ab = ordneZu(abholer(), 'abholung');
    expect(ab.passt).toBe(true);
    expect(ab.selbstabholer).toBe(true);
    expect(ordneZu(abholer(), 'schuettgut').passt).toBe(false);
  });

  it('ein Abholer, der nur Säcke holt, ist KEIN Palettenkunde', () => {
    // Genau der Fall aus dem Betrieb: jemand holt sich ein paar Säcke ab.
    // Ihm ein Palettenangebot zu schicken, geht am Geschäft vorbei.
    const nurSaecke = abholer([pos('TM-ZM-02S')]);
    expect(ordneZu(nurSaecke, 'paletten').passt).toBe(false);
    expect(ordneZu(nurSaecke, 'abholung').passt).toBe(true);
    expect(ordneZu(nurSaecke, 'abholung').herkunft).toMatch(/nur Sackware/);
  });

  it('nimmt keine belieferten Kunden auf', () => {
    expect(ordneZu(kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02')] }] }), 'abholung').passt).toBe(false);
  });
});

describe('Beiladungs-Säcke sind keine Palettenware', () => {
  it('Schüttgut mit ein paar Säcken bleibt Schüttgut', () => {
    const k = kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-02'), pos('TM-ZM-02S')], typ: 'rechnung' }] });
    expect(ordneZu(k, 'schuettgut').passt).toBe(true);
    expect(ordneZu(k, 'paletten').passt).toBe(false);
  });

  it('NUR Beiladungs-Säcke ergeben keinen Palettenkunden', () => {
    const k = kontext({ belege: [{ jahr: 2026, positionen: [pos('TM-ZM-03S')], typ: 'rechnung' }] });
    const paletten = ordneZu(k, 'paletten');
    expect(paletten.passt).toBe(false);
    expect(paletten.herkunft).toMatch(/keine Palettenware/);
    expect(ordneZu(k, 'schuettgut').passt).toBe(true);
  });

  it('Sackware auf Palette und BigBag bleiben Palettenware', () => {
    for (const artikel of ['TM-ZM-02St', 'TM-ZM-02BB', 'TM-ZM-BIG-03']) {
      const k = kontext({ belege: [{ jahr: 2026, positionen: [pos(artikel)], typ: 'rechnung' }] });
      expect(ordneZu(k, 'paletten').passt).toBe(true);
    }
  });
});
