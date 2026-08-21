/**
 * Der Sammellauf entscheidet, welche Lieferung automatisch abgerechnet wird.
 * Jede dieser Entscheidungen erzeugt einen steuerlich relevanten Beleg — die
 * Sperren sind deshalb der wichtigste Teil des Dienstes, nicht die Erzeugung.
 *
 * Grundregel, die diese Tests festhalten: Im Zweifel NICHT erzeugen. Eine
 * Rechnung, die von Hand nachgeholt werden muss, kostet Minuten. Eine falsche
 * Rechnung kostet eine Stornierung, eine Korrektur und eine Erklärung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ladeDokumentNachTyp = vi.fn();
const ladePositionenVonVorherigem = vi.fn();
const ladeEntwurf = vi.fn();
const speichereRechnung = vi.fn();
const generiereNummer = vi.fn();
const updateProjektStatus = vi.fn();
const loadProjekte = vi.fn();
const ermittleAdressen = vi.fn();

vi.mock('../projektabwicklungDokumentService', () => ({
  ladeDokumentNachTyp: (...a: unknown[]) => ladeDokumentNachTyp(...a),
  ladePositionenVonVorherigem: (...a: unknown[]) => ladePositionenVonVorherigem(...a),
  ladeDokumentDaten: (dok: { daten?: string }) => (dok?.daten ? JSON.parse(dok.daten) : null),
  ladeEntwurf: (...a: unknown[]) => ladeEntwurf(...a),
  speichereRechnung: (...a: unknown[]) => speichereRechnung(...a),
}));
vi.mock('../nummerierungService', () => ({
  generiereNaechsteDokumentnummer: (...a: unknown[]) => generiereNummer(...a),
}));
vi.mock('../projektService', () => ({
  projektService: {
    loadProjekte: (...a: unknown[]) => loadProjekte(...a),
    updateProjektStatus: (...a: unknown[]) => updateProjektStatus(...a),
  },
}));
vi.mock('../rechnungsadressenService', () => ({
  ermittleRechnungsAdressen: (...a: unknown[]) => ermittleAdressen(...a),
}));
vi.mock('../rechnungService', () => ({
  berechneRechnungsSummen: (positionen: { gesamtpreis?: number }[]) => {
    const netto = positionen.reduce((s, p) => s + (p.gesamtpreis ?? 0), 0);
    return { nettobetrag: netto, bruttobetrag: Math.round(netto * 1.19 * 100) / 100 };
  },
}));

import {
  pruefeKandidat,
  sammleFakturierbare,
  erzeugeRechnungen,
  fasseZusammen,
} from '../sammelfakturierungService';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({
    id: 'p1',
    $id: 'p1',
    status: 'geliefert',
    saisonjahr: 2026,
    kundenname: 'TC Musterstadt',
    projektName: 'TC Musterstadt 2026',
    // Palettenware: kein Wiegeschein nötig, damit die Tests nur EINE Sache prüfen.
    auftragsbestaetigungsDaten: JSON.stringify({
      positionen: [{ artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 'Pal' }],
    }),
    ...teil,
  } as Projekt);

/**
 * Schüttgut-Projekt. Die Belieferungsart allein genügt NICHT: Sagen die
 * Positionen „nur Gebinde", schlagen sie die Belieferungsart (abwicklungsweg.ts).
 * Für einen Wiegeschein-Test müssen die Positionen also lose Ware zeigen.
 */
const schuettgutProjekt = (teil: Partial<Projekt> = {}): Projekt =>
  projekt({
    belieferungsart: 'mit_haenger',
    auftragsbestaetigungsDaten: JSON.stringify({
      positionen: [{ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' }],
    }),
    ...teil,
  });

const POSITIONEN = [{ id: '1', bezeichnung: 'Tennissand 0/2', menge: 10, gesamtpreis: 1000 }];

beforeEach(() => {
  vi.clearAllMocks();
  ladeDokumentNachTyp.mockResolvedValue(null);
  ladePositionenVonVorherigem.mockResolvedValue(POSITIONEN);
  ladeEntwurf.mockResolvedValue(null);
  ermittleAdressen.mockResolvedValue({
    kundenname: 'TC Musterstadt',
    kundenstrasse: 'Hauptstr. 1',
    kundenPlzOrt: '97070 Würzburg',
    lieferadresseAbweichend: false,
    regel: 'direkt',
  });
  speichereRechnung.mockResolvedValue({ $id: 'dok1' });
  generiereNummer.mockResolvedValue('RE-2026-0001');
  updateProjektStatus.mockResolvedValue({});
});

describe('Sperren', () => {
  it('lässt einen vollständigen Vorgang durch', async () => {
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toEqual([]);
    expect(k.daten).toBeDefined();
    expect(k.betrag).toBe(1190);
  });

  it('sperrt, wenn bereits eine aktive Rechnung existiert', async () => {
    ladeDokumentNachTyp.mockResolvedValue({ $id: 'r1', rechnungsStatus: 'offen' });
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toContain('rechnung_vorhanden');
    expect(k.daten).toBeUndefined();
  });

  it('lässt eine stornierte Rechnung passieren — dafür ist Stornieren da', async () => {
    ladeDokumentNachTyp.mockImplementation((_id: string, typ: string) =>
      Promise.resolve(typ === 'rechnung' ? { $id: 'r1', rechnungsStatus: 'storniert' } : null)
    );
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).not.toContain('rechnung_vorhanden');
  });

  it('sperrt bei Schüttgut ohne Wiegeschein', async () => {
    // Die gelieferte Menge ist der Rechnungsbetrag. Ohne Wiegeschein ist sie
    // nicht bestätigt — hier zu raten heißt, den Betrag zu raten.
    const k = await pruefeKandidat(schuettgutProjekt());
    expect(k.sperren).toContain('wiegeschein_fehlt');
  });

  it('verlangt bei Palettenware KEINEN Wiegeschein', async () => {
    // Sackware wird gezählt, nicht gewogen. Eine Sperre wäre hier unerfüllbar.
    const k = await pruefeKandidat(projekt({ belieferungsart: 'bigbag' }));
    expect(k.sperren).not.toContain('wiegeschein_fehlt');
  });

  it('lässt Schüttgut MIT Wiegeschein durch', async () => {
    const k = await pruefeKandidat(
      schuettgutProjekt({
        wiegeschein: { pruefStatus: 'bestaetigt', gepruefteMengeTonnen: 10 },
      } as Partial<Projekt>)
    );
    expect(k.sperren).toEqual([]);
  });

  it('sperrt ohne übernehmbare Positionen', async () => {
    ladePositionenVonVorherigem.mockResolvedValue([]);
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toContain('keine_positionen');
  });

  it('sperrt bei einem Nullbetrag', async () => {
    ladePositionenVonVorherigem.mockResolvedValue([{ id: '1', bezeichnung: 'x', gesamtpreis: 0 }]);
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toContain('kein_betrag');
  });

  it('sperrt ohne Rechnungsanschrift', async () => {
    ermittleAdressen.mockResolvedValue({
      kundenname: '',
      kundenstrasse: '',
      kundenPlzOrt: '',
      lieferadresseAbweichend: false,
      regel: 'nur_projektdaten',
    });
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toContain('keine_adresse');
  });

  it('sperrt, wenn die Prüfung selbst scheitert', async () => {
    // Nicht wissen ist ein Grund zu sperren, kein Grund weiterzumachen.
    ladeDokumentNachTyp.mockRejectedValue(new Error('Netzwerk'));
    const k = await pruefeKandidat(projekt({}));
    expect(k.sperren).toContain('rechnung_vorhanden');
  });

  it('zieht bei der Prüfung noch keine Rechnungsnummer', async () => {
    // Zwischen Vorschau und Erzeugung liegen Minuten; eine gezogene und dann
    // verworfene Nummer reißt eine Lücke in den fortlaufenden Kreis.
    await pruefeKandidat(projekt({}));
    expect(generiereNummer).not.toHaveBeenCalled();
  });

  it('übernimmt Rabatt und Steueroption aus der Auftragsbestätigung', async () => {
    // Die Rechnung muss denselben Betrag ausweisen wie die bestätigte AB.
    ladeDokumentNachTyp.mockImplementation((_id: string, typ: string) =>
      Promise.resolve(
        typ === 'auftragsbestaetigung'
          ? { $id: 'ab1', daten: JSON.stringify({ gesamtrabattProzent: 5, ohneMehrwertsteuer: true }) }
          : null
      )
    );
    const k = await pruefeKandidat(projekt({}));
    expect(k.daten?.gesamtrabattProzent).toBe(5);
    expect(k.daten?.ohneMehrwertsteuer).toBe(true);
  });
});

describe('Liste', () => {
  it('stellt Erzeugbare nach vorn und sortiert nach Betrag', async () => {
    loadProjekte.mockResolvedValue([
      projekt({ id: 'klein', $id: 'klein', kundenname: 'A' }),
      projekt({ id: 'gross', $id: 'gross', kundenname: 'B' }),
    ]);
    ladePositionenVonVorherigem.mockImplementation((id: string) =>
      Promise.resolve([{ id: '1', bezeichnung: 'x', gesamtpreis: id === 'gross' ? 5000 : 100 }])
    );
    const liste = await sammleFakturierbare(2026);
    expect(liste.map((k) => k.projektId)).toEqual(['gross', 'klein']);
  });

  it('behält gesperrte Vorgänge in der Liste', async () => {
    // Dass acht Lieferungen wegen fehlender Wiegescheine offen sind, ist die
    // wichtigere Information. Eine Liste, die sie wegfiltert, sieht erledigt aus.
    loadProjekte.mockResolvedValue([
      projekt({ id: 'ok', $id: 'ok' }),
      schuettgutProjekt({ id: 'gesperrt', $id: 'gesperrt' }),
    ]);
    const liste = await sammleFakturierbare(2026);
    expect(liste).toHaveLength(2);
    expect(liste[1].sperren).toContain('wiegeschein_fehlt');
    expect(liste[1].hinweis).toMatch(/Wiegeschein/);
  });
});

describe('Erzeugung', () => {
  it('erzeugt nur ungesperrte Vorgänge', async () => {
    const kandidaten = [
      await pruefeKandidat(projekt({ id: 'ok', $id: 'ok' })),
      await pruefeKandidat(schuettgutProjekt({ id: 'sperr', $id: 'sperr' })),
    ];
    const e = await erzeugeRechnungen(kandidaten);
    expect(e.erzeugt).toHaveLength(1);
    expect(e.erzeugt[0].projektId).toBe('ok');
    expect(speichereRechnung).toHaveBeenCalledTimes(1);
  });

  it('zieht für jede Rechnung eine eigene Nummer', async () => {
    generiereNummer
      .mockResolvedValueOnce('RE-2026-0001')
      .mockResolvedValueOnce('RE-2026-0002');
    const kandidaten = [
      await pruefeKandidat(projekt({ id: 'a', $id: 'a' })),
      await pruefeKandidat(projekt({ id: 'b', $id: 'b' })),
    ];
    const e = await erzeugeRechnungen(kandidaten);
    expect(e.erzeugt.map((r) => r.rechnungsnummer)).toEqual(['RE-2026-0001', 'RE-2026-0002']);
  });

  it('bricht bei einem Fehler nicht ab, sondern notiert ihn', async () => {
    speichereRechnung
      .mockRejectedValueOnce(new Error('Nummer bereits vergeben'))
      .mockResolvedValueOnce({ $id: 'dok2' });
    const kandidaten = [
      await pruefeKandidat(projekt({ id: 'a', $id: 'a', kundenname: 'A' })),
      await pruefeKandidat(projekt({ id: 'b', $id: 'b', kundenname: 'B' })),
    ];
    const e = await erzeugeRechnungen(kandidaten);
    expect(e.fehler).toHaveLength(1);
    expect(e.fehler[0].grund).toMatch(/bereits vergeben/);
    expect(e.erzeugt).toHaveLength(1);
  });

  it('meldet die Rechnung als erzeugt, wenn nur der Statuswechsel scheitert', async () => {
    // Der Beleg ist in der Welt. Ihn als Fehler zu melden führte dazu, dass
    // jemand ihn ein zweites Mal erzeugt.
    updateProjektStatus.mockRejectedValue(new Error('data zu groß'));
    const kandidaten = [await pruefeKandidat(projekt({}))];
    const e = await erzeugeRechnungen(kandidaten);
    expect(e.erzeugt).toHaveLength(1);
    expect(e.fehler).toHaveLength(0);
  });

  it('hält beim Abbruchsignal vor dem nächsten Beleg an', async () => {
    const kandidaten = [
      await pruefeKandidat(projekt({ id: 'a', $id: 'a' })),
      await pruefeKandidat(projekt({ id: 'b', $id: 'b' })),
    ];
    let gerufen = 0;
    const e = await erzeugeRechnungen(kandidaten, { abbruchSignal: () => ++gerufen > 1 });
    expect(e.abgebrochen).toBe(true);
    expect(e.erzeugt).toHaveLength(1);
  });
});

describe('fasseZusammen', () => {
  it('trennt erzeugbare von gesperrten und summiert nur die erzeugbaren', async () => {
    const kandidaten = [
      await pruefeKandidat(projekt({ id: 'a', $id: 'a' })),
      await pruefeKandidat(schuettgutProjekt({ id: 'b', $id: 'b' })),
    ];
    const z = fasseZusammen(kandidaten);
    expect(z.erzeugbar).toBe(1);
    expect(z.gesperrt).toBe(1);
    expect(z.summe).toBe(1190);
    expect(z.proSperre.wiegeschein_fehlt).toBe(1);
  });
});
