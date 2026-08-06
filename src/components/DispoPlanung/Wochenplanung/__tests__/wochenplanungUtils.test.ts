import { describe, it, expect } from 'vitest';
import type { Tour, TourStop, Fahrer } from '../../../../types/tour';
import type { Projekt } from '../../../../types/projekt';
import {
  tourTonnage,
  berechneAuslastung,
  zellenSchluessel,
  parseZellenSchluessel,
  gruppiereTourenNachZelle,
  ermittleBuchungslage,
  hatWochenbezug,
  gruppiereNachPlatzbauer,
  berechneMengenbilanz,
  ermittleRasterFahrer,
  tourenOhneRasterZeile,
  formatTonnen,
  OHNE_FAHRER,
} from '../wochenplanungUtils';

// === Fixtures ===

const stop = (projektId: string, tonnen: number, extra: Partial<TourStop> = {}): TourStop => ({
  projektId,
  position: 1,
  ankunftGeplant: '',
  abfahrtGeplant: '',
  kundenname: `Kunde ${projektId}`,
  adresse: { strasse: '', plz: '97070', ort: 'Würzburg' },
  tonnen,
  belieferungsart: 'mit_haenger',
  ...extra,
});

const tour = (over: Partial<Tour> = {}): Tour => ({
  id: 't1',
  datum: '2026-03-16',
  name: 'Tour #01',
  fahrzeugId: '',
  fahrerId: 'f1',
  lkwTyp: 'mit_haenger',
  kapazitaet: { motorwagenTonnen: 14, haengerTonnen: 10, gesamtTonnen: 24 },
  stops: [],
  routeDetails: {
    gesamtDistanzKm: 0,
    gesamtFahrzeitMinuten: 0,
    gesamtZeitMinuten: 0,
    startZeit: '',
    endeZeit: '',
    geschaetzteDieselkosten: 0,
    geschaetzteVerschleisskosten: 0,
    gesamtTonnen: 0,
    auslastungProzent: 0,
  },
  optimierung: { methode: 'manuell', optimiertAm: '', einschraenkungen: [] },
  status: 'geplant',
  erstelltAm: '',
  geaendertAm: '',
  ...over,
});

const projekt = (id: string, over: Partial<Projekt> = {}): Projekt =>
  ({
    id,
    kundenname: `Verein ${id}`,
    liefergewicht: 10,
    ...over,
  }) as Projekt;

const fahrer = (id: string, name: string, over: Partial<Fahrer> = {}): Fahrer =>
  ({
    id,
    name,
    fuehrerscheinklassen: ['CE'],
    verfuegbarkeit: {
      montag: true,
      dienstag: true,
      mittwoch: true,
      donnerstag: true,
      freitag: true,
      samstag: false,
    },
    maxArbeitszeitMinuten: 540,
    pausenregelMinuten: 45,
    aktiv: true,
    erstelltAm: '',
    geaendertAm: '',
    ...over,
  }) as Fahrer;

// === Tests ===

describe('tourTonnage', () => {
  it('summiert die Stops', () => {
    expect(tourTonnage(tour({ stops: [stop('a', 10), stop('b', 12.5)] }))).toBe(22.5);
  });

  it('behandelt eine leere Tour als 0', () => {
    expect(tourTonnage(tour())).toBe(0);
  });
});

describe('berechneAuslastung', () => {
  it('rechnet Prozent und freie Kapazität', () => {
    const a = berechneAuslastung(tour({ stops: [stop('a', 12)] }));
    expect(a.geladen).toBe(12);
    expect(a.kapazitaet).toBe(24);
    expect(a.prozent).toBe(50);
    expect(a.freieKapazitaet).toBe(12);
    expect(a.istUeberladen).toBe(false);
  });

  it('meldet Überladung, ohne sie zu verhindern', () => {
    // Die abgelöste Excel weist real Touren bis 26 t aus.
    const a = berechneAuslastung(tour({ stops: [stop('a', 26)] }));
    expect(a.istUeberladen).toBe(true);
    expect(a.freieKapazitaet).toBe(0);
    expect(a.prozent).toBeCloseTo(108.3, 1);
  });

  it('stürzt bei fehlender Kapazität nicht ab', () => {
    const a = berechneAuslastung(
      tour({ stops: [stop('a', 5)], kapazitaet: undefined as unknown as Tour['kapazitaet'] })
    );
    expect(a.prozent).toBe(0);
    expect(a.istUeberladen).toBe(false);
  });
});

describe('zellenSchluessel', () => {
  it('ist umkehrbar', () => {
    const s = zellenSchluessel('2026-03-16', 'f1');
    expect(parseZellenSchluessel(s)).toEqual({ datum: '2026-03-16', fahrerId: 'f1' });
  });

  it('behandelt den Backlog (leeres Datum)', () => {
    expect(parseZellenSchluessel(zellenSchluessel('', 'f1'))).toEqual({
      datum: '',
      fahrerId: 'f1',
    });
  });

  it('verträgt Fahrer-Ersatzschlüssel mit Trennzeichen im Namen', () => {
    const s = zellenSchluessel('2026-03-16', 'name:Meier|Sohn');
    expect(parseZellenSchluessel(s)).toEqual({
      datum: '2026-03-16',
      fahrerId: 'name:Meier|Sohn',
    });
  });
});

describe('gruppiereTourenNachZelle', () => {
  it('ordnet Touren nach Datum und Fahrer', () => {
    const zellen = gruppiereTourenNachZelle([
      tour({ id: 't1', datum: '2026-03-16', fahrerId: 'f1' }),
      tour({ id: 't2', datum: '2026-03-16', fahrerId: 'f2' }),
      tour({ id: 't3', datum: '2026-03-17', fahrerId: 'f1' }),
    ]);
    expect(zellen.get(zellenSchluessel('2026-03-16', 'f1'))?.map((t) => t.id)).toEqual(['t1']);
    expect(zellen.get(zellenSchluessel('2026-03-17', 'f1'))?.map((t) => t.id)).toEqual(['t3']);
  });

  it('sammelt mehrere Touren einer Zelle und sortiert sie nach Namen', () => {
    const zellen = gruppiereTourenNachZelle([
      tour({ id: 'b', name: 'Tour #02' }),
      tour({ id: 'a', name: 'Tour #01' }),
    ]);
    expect(zellen.get(zellenSchluessel('2026-03-16', 'f1'))?.map((t) => t.name)).toEqual([
      'Tour #01',
      'Tour #02',
    ]);
  });

  it('legt Touren ohne Fahrer in die Sammelzeile', () => {
    const zellen = gruppiereTourenNachZelle([
      tour({ id: 't1', fahrerId: undefined, fahrerName: undefined }),
    ]);
    expect(zellen.has(zellenSchluessel('2026-03-16', OHNE_FAHRER))).toBe(true);
  });

  it('nutzt den Freitext-Fahrernamen, wenn keine fahrerId vorliegt', () => {
    const zellen = gruppiereTourenNachZelle([
      tour({ id: 't1', fahrerId: undefined, fahrerName: 'Michelbau' }),
    ]);
    expect(zellen.has(zellenSchluessel('2026-03-16', 'name:Michelbau'))).toBe(true);
  });

  it('legt Touren ohne Datum in den Backlog', () => {
    const zellen = gruppiereTourenNachZelle([tour({ id: 't1', datum: '' })]);
    expect(zellen.has(zellenSchluessel('', 'f1'))).toBe(true);
  });
});

describe('ermittleBuchungslage', () => {
  it('berechnet die Restmenge über alle Touren', () => {
    const p = projekt('p1', { liefergewicht: 30 });
    const lage = ermittleBuchungslage(p, [
      tour({ id: 't1', stops: [stop('p1', 10)] }),
      tour({ id: 't2', stops: [stop('p1', 12)] }),
    ]);
    expect(lage.gesamtMenge).toBe(30);
    expect(lage.gebuchteTonnen).toBe(22);
    expect(lage.offeneTonnen).toBe(8);
    expect(lage.anzahlBuchungen).toBe(2);
    expect(lage.istVollstaendigGebucht).toBe(false);
  });

  it('erkennt vollständige Verplanung', () => {
    const lage = ermittleBuchungslage(projekt('p1', { liefergewicht: 20 }), [
      tour({ stops: [stop('p1', 20)] }),
    ]);
    expect(lage.offeneTonnen).toBe(0);
    expect(lage.istVollstaendigGebucht).toBe(true);
  });

  it('meldet keine negative Restmenge bei Überbuchung', () => {
    const lage = ermittleBuchungslage(projekt('p1', { liefergewicht: 10 }), [
      tour({ stops: [stop('p1', 15)] }),
    ]);
    expect(lage.offeneTonnen).toBe(0);
    expect(lage.gebuchteTonnen).toBe(15);
  });

  it('ignoriert Stops fremder Projekte', () => {
    const lage = ermittleBuchungslage(projekt('p1', { liefergewicht: 10 }), [
      tour({ stops: [stop('p2', 10)] }),
    ]);
    expect(lage.gebuchteTonnen).toBe(0);
    expect(lage.offeneTonnen).toBe(10);
  });

  it('gilt bei fehlender Menge erst als verplant, wenn es eine Buchung gibt', () => {
    const ohneMenge = projekt('p1', { liefergewicht: 0 });
    expect(ermittleBuchungslage(ohneMenge, []).istVollstaendigGebucht).toBe(false);
    expect(
      ermittleBuchungslage(ohneMenge, [tour({ stops: [stop('p1', 0)] })]).istVollstaendigGebucht
    ).toBe(true);
  });

  it('nutzt die Appwrite-Dokument-ID, wenn vorhanden', () => {
    const p = { ...projekt('alt'), $id: 'neu' } as unknown as Projekt;
    const lage = ermittleBuchungslage(p, [tour({ stops: [stop('neu', 4)] })]);
    expect(lage.projektId).toBe('neu');
    expect(lage.gebuchteTonnen).toBe(4);
  });
});

describe('gruppiereNachPlatzbauer', () => {
  const namen = new Map([
    ['pb1', 'Averbeck'],
    ['pb2', 'PTS'],
  ]);

  it('gruppiert und summiert', () => {
    const gruppen = gruppiereNachPlatzbauer(
      [
        ermittleBuchungslage(projekt('a', { liefergewicht: 10, platzbauerId: 'pb1' }), []),
        ermittleBuchungslage(projekt('b', { liefergewicht: 5, platzbauerId: 'pb1' }), []),
        ermittleBuchungslage(projekt('c', { liefergewicht: 20, platzbauerId: 'pb2' }), []),
      ],
      namen
    );
    expect(gruppen.map((g) => g.name)).toEqual(['PTS', 'Averbeck']); // nach Menge absteigend
    expect(gruppen[1].summeOffen).toBe(15);
    expect(gruppen[1].auftraege).toHaveLength(2);
  });

  it('stellt Aufträge ohne Platzbauer ans Ende', () => {
    const gruppen = gruppiereNachPlatzbauer(
      [
        ermittleBuchungslage(projekt('a', { liefergewicht: 1, platzbauerId: 'pb1' }), []),
        ermittleBuchungslage(projekt('b', { liefergewicht: 99 }), []),
      ],
      namen
    );
    expect(gruppen.map((g) => g.name)).toEqual(['Averbeck', 'Eigene Kunden']);
  });

  it('benennt unbekannte Platzbauer-Ids nachvollziehbar', () => {
    const gruppen = gruppiereNachPlatzbauer(
      [ermittleBuchungslage(projekt('a', { liefergewicht: 1, platzbauerId: 'weg' }), [])],
      namen
    );
    expect(gruppen[0].name).toBe('Unbekannter Platzbauer');
  });

  it('sortiert innerhalb der Gruppe nach Kundenname', () => {
    const gruppen = gruppiereNachPlatzbauer(
      [
        ermittleBuchungslage(
          projekt('a', { kundenname: 'Zeller SV', platzbauerId: 'pb1' }),
          []
        ),
        ermittleBuchungslage(
          projekt('b', { kundenname: 'Ansbach TC', platzbauerId: 'pb1' }),
          []
        ),
      ],
      namen
    );
    expect(gruppen[0].auftraege.map((a) => a.projekt.kundenname)).toEqual([
      'Ansbach TC',
      'Zeller SV',
    ]);
  });
});

describe('berechneMengenbilanz', () => {
  const tage = [new Date(2026, 2, 16), new Date(2026, 2, 17)];
  const fahrerNamen = new Map([['f1', 'Marco']]);
  const platzbauerNamen = new Map([['pb1', 'Averbeck']]);

  it('trennt geplant, ungeplant und gesamt', () => {
    const pool = [
      ermittleBuchungslage(projekt('p1', { liefergewicht: 30, platzbauerId: 'pb1' }), [
        tour({ stops: [stop('p1', 10)] }),
      ]),
    ];
    const bilanz = berechneMengenbilanz(
      [tour({ stops: [stop('p1', 10)] })],
      pool,
      tage,
      fahrerNamen,
      platzbauerNamen
    );
    expect(bilanz.geplant).toBe(10);
    expect(bilanz.ungeplant).toBe(20);
    expect(bilanz.gesamt).toBe(30);
  });

  it('schlüsselt nach Tag, Fahrer und Platzbauer auf', () => {
    const pool = [
      ermittleBuchungslage(projekt('p1', { liefergewicht: 10, platzbauerId: 'pb1' }), []),
    ];
    const bilanz = berechneMengenbilanz(
      [
        tour({ id: 't1', datum: '2026-03-16', fahrerId: 'f1', stops: [stop('p1', 10)] }),
        tour({ id: 't2', datum: '2026-03-17', fahrerId: 'f1', stops: [stop('p1', 5)] }),
      ],
      pool,
      tage,
      fahrerNamen,
      platzbauerNamen
    );
    expect(bilanz.jeTag['2026-03-16']).toBe(10);
    expect(bilanz.jeTag['2026-03-17']).toBe(5);
    expect(bilanz.jeFahrer['Marco']).toBe(15);
    expect(bilanz.jePlatzbauer['Averbeck']).toBe(15);
  });

  it('zählt abgeschlossene Touren als ausgeliefert', () => {
    const bilanz = berechneMengenbilanz(
      [tour({ status: 'abgeschlossen', stops: [stop('p1', 12)] })],
      [],
      tage,
      fahrerNamen,
      platzbauerNamen
    );
    expect(bilanz.ausgeliefert).toBe(12);
  });

  it('zählt einzeln markierte Stops als ausgeliefert', () => {
    const bilanz = berechneMengenbilanz(
      [
        tour({
          status: 'geplant',
          stops: [stop('p1', 8, { markierung: 'ausgeliefert' }), stop('p2', 4)],
        }),
      ],
      [],
      tage,
      fahrerNamen,
      platzbauerNamen
    );
    expect(bilanz.ausgeliefert).toBe(8);
    expect(bilanz.geplant).toBe(12);
  });

  it('ignoriert Touren außerhalb der Rasterspalten in der Tagesaufteilung', () => {
    const bilanz = berechneMengenbilanz(
      [tour({ datum: '2026-04-01', stops: [stop('p1', 7)] })],
      [],
      tage,
      fahrerNamen,
      platzbauerNamen
    );
    expect(bilanz.geplant).toBe(7);
    expect(bilanz.jeTag['2026-03-16']).toBe(0);
  });

  it('initialisiert alle Tage, auch ohne Touren', () => {
    const bilanz = berechneMengenbilanz([], [], tage, fahrerNamen, platzbauerNamen);
    expect(bilanz.jeTag).toEqual({ '2026-03-16': 0, '2026-03-17': 0 });
    expect(bilanz.gesamt).toBe(0);
  });
});

describe('hatWochenbezug', () => {
  it('erkennt die Liefer-Kalenderwoche', () => {
    expect(hatWochenbezug(projekt('p1', { lieferKW: 12 }))).toBe(true);
  });

  it('erkennt das geplante Datum', () => {
    expect(hatWochenbezug(projekt('p1', { geplantesDatum: '2026-03-16' }))).toBe(true);
  });

  it('erkennt KW 0 als gesetzt, nicht als leer', () => {
    // Regression: eine reine Wahrheitsprüfung hätte die 0 verschluckt.
    expect(hatWochenbezug(projekt('p1', { lieferKW: 0 }))).toBe(true);
  });

  it('meldet Aufträge ohne jeden Termin', () => {
    expect(hatWochenbezug(projekt('p1'))).toBe(false);
    expect(hatWochenbezug(projekt('p1', { geplantesDatum: '' }))).toBe(false);
  });
});

describe('berechneMengenbilanz — Aufträge ohne Kalenderwoche', () => {
  const tage = [new Date(2026, 2, 16)];

  it('weist sie getrennt aus und lässt sie aus der Wochensumme heraus', () => {
    const ohneWoche = [ermittleBuchungslage(projekt('x', { liefergewicht: 40 }), [])];
    const bilanz = berechneMengenbilanz(
      [tour({ stops: [stop('p1', 10)] })],
      [ermittleBuchungslage(projekt('p1', { liefergewicht: 10 }), [tour({ stops: [stop('p1', 10)] })])],
      tage,
      new Map(),
      new Map(),
      ohneWoche
    );
    expect(bilanz.ohneWoche).toBe(40);
    expect(bilanz.gesamt).toBe(10); // nur die Woche selbst
    expect(bilanz.ungeplant).toBe(0);
  });

  it('ist ohne den Parameter abwärtskompatibel', () => {
    const bilanz = berechneMengenbilanz([], [], tage, new Map(), new Map());
    expect(bilanz.ohneWoche).toBe(0);
  });
});

describe('ermittleRasterFahrer', () => {
  it('zeigt aktive Fahrer, eigene vor fremden', () => {
    const liste = ermittleRasterFahrer(
      [
        fahrer('f1', 'Michelbau', { istFremdfahrer: true }),
        fahrer('f2', 'Olaf'),
        fahrer('f3', 'Marco'),
      ],
      []
    );
    expect(liste.map((f) => f.name)).toEqual(['Marco', 'Olaf', 'Michelbau']);
  });

  it('blendet inaktive Fahrer aus', () => {
    const liste = ermittleRasterFahrer([fahrer('f1', 'Alt', { aktiv: false })], []);
    expect(liste).toHaveLength(0);
  });

  it('zeigt inaktive Fahrer, die in dieser Woche noch eine Tour haben', () => {
    const liste = ermittleRasterFahrer(
      [fahrer('f1', 'Alt', { aktiv: false })],
      [tour({ fahrerId: 'f1' })]
    );
    expect(liste.map((f) => f.name)).toEqual(['Alt']);
  });
});

describe('tourenOhneRasterZeile', () => {
  it('findet Touren, deren Fahrer keine Zeile hat', () => {
    const rest = tourenOhneRasterZeile(
      [
        tour({ id: 't1', fahrerId: 'f1' }),
        tour({ id: 't2', fahrerId: 'unbekannt' }),
        tour({ id: 't3', fahrerId: undefined, fahrerName: 'Freitext' }),
      ],
      [fahrer('f1', 'Marco')]
    );
    expect(rest.map((t) => t.id)).toEqual(['t2', 't3']);
  });
});

describe('formatTonnen', () => {
  it('formatiert ganze Zahlen ohne Nachkomma', () => {
    expect(formatTonnen(24)).toBe('24 t');
  });

  it('rundet auf eine Nachkommastelle und nutzt das deutsche Komma', () => {
    expect(formatTonnen(22.54)).toBe('22,5 t');
    expect(formatTonnen(19.5)).toBe('19,5 t');
  });

  it('verträgt ungültige Werte', () => {
    expect(formatTonnen(NaN)).toBe('0 t');
  });
});
