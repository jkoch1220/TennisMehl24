/**
 * Rücklesen gespeicherter Platzbauer-Angebote (Vorschlag „Auftragsbestätigung
 * für Staffelangebote + Rehydrierung“, 09/2026).
 *
 * Zwei Wege hängen daran: Die AB übernimmt die Staffeln aus dem Angebot, und
 * der Angebotstab stellt sich nach dem Erstellen aus dem Dokument wieder her.
 * Geprüft wird vor allem, was NICHT passieren darf: Staffelzeilen in Summen,
 * eine 0 als Obergrenze, ein neu erzeugter Vertragstext auf einer Bestätigung
 * und Projektzahlen, die von einer mengenlosen AB auf 0 gesetzt werden.
 */
import { describe, it, expect } from 'vitest';
import type { PlatzbauerAngebotPosition } from '../../types/platzbauer';
import {
  abProjektDatenUpdates,
  bezugIstAktuell,
  abStatusNachErstellen,
  berechneABKennzahlen,
  leseAngebotsStand,
  leseStaffelStand,
  mischeVereinPositionen,
  staffelSortenAusPositionen,
  uebernehmeStaffelnFuerAB,
  zerlegeStaffelBeschreibung,
} from '../staffelUebernahme';

const staffelZeile = (
  artikelnummer: string,
  bezeichnung: string,
  extra: Partial<PlatzbauerAngebotPosition> = {}
): PlatzbauerAngebotPosition => ({
  id: `pos-${artikelnummer}`,
  artikelnummer,
  bezeichnung,
  einheit: 't',
  menge: 0,
  einzelpreis: 0,
  gesamtpreis: 0,
  positionsTyp: 'staffelpreis',
  staffelpreise: {
    staffeln: [
      { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
      { vonMenge: 300, bisMenge: null, einzelpreis: 110 },
    ],
    basisArtikel: artikelnummer,
    basisBezeichnung: bezeichnung,
  },
  ...extra,
});

const angebotsDaten = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    angebotsnummer: 'PB-AG-2026-007',
    angebotsdatum: '2026-09-04',
    zahlungsziel: '30 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    bemerkung: 'Saisonvereinbarung',
    positionen: [],
    angebotPositionen: [staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2')],
    staffelKonditionen: {
      abrechnungsmodell: 'saisonbonus',
      mengenbasis: 'gesamt',
      zeitraumVon: '2026-01-01',
      zeitraumBis: '2026-10-31',
      gutschriftNurBeiZahlung: true,
      grenzenGekoppelt: true,
    },
    ...extra,
  });

describe('leseStaffelStand', () => {
  it('liest Staffelzeilen samt Staffeln und Konditionen zurück', () => {
    const stand = leseStaffelStand(angebotsDaten(), 2026);
    expect(stand.hatStaffel).toBe(true);
    expect(stand.staffelPositionen).toHaveLength(1);
    expect(stand.staffelPositionen[0].staffelpreise?.staffeln).toHaveLength(2);
    expect(stand.konditionen.abrechnungsmodell).toBe('saisonbonus');
    expect(stand.konditionen.zeitraumBis).toBe('2026-10-31');
    expect(stand.angebotsdatum).toBe('2026-09-04');
  });

  it('setzt bei einem Altbeleg ohne Konditionen den Saison-Standard ein', () => {
    const stand = leseStaffelStand(angebotsDaten({ staffelKonditionen: undefined }), 2026);
    expect(stand.konditionen.abrechnungsmodell).toBe('sofortumstellung');
    expect(stand.konditionen.mengenbasis).toBe('gesamt');
    expect(stand.konditionen.zeitraumBis).toBe('2026-04-30');
  });

  it('verträgt kaputtes JSON, null und ein leeres Dokument', () => {
    expect(leseStaffelStand('{kaputt', 2026).hatStaffel).toBe(false);
    expect(leseStaffelStand(null, 2026).staffelPositionen).toEqual([]);
    expect(leseStaffelStand('{}', 2026).hatStaffel).toBe(false);
    expect(() => leseStaffelStand(undefined, 2026)).not.toThrow();
  });

  it('nimmt nur Staffelzeilen – keine 0-t-Zeilen aus Bedarf oder Zusatz', () => {
    const daten = angebotsDaten({
      angebotPositionen: [
        staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2'),
        { id: 'z1', artikelnummer: 'TM-DZ', bezeichnung: 'Zuschlag', einheit: 'pauschal', menge: 1, einzelpreis: 50, gesamtpreis: 50, positionsTyp: 'normal' },
        { id: 'b1', artikelnummer: '', bezeichnung: 'Bedarf', einheit: 't', menge: 100, einzelpreis: 90, gesamtpreis: 9000, positionsTyp: 'bedarf', bedarfsStatus: 'geschaetzt' },
      ],
    });
    expect(leseStaffelStand(daten, 2026).staffelPositionen).toHaveLength(1);
  });

  it('liest auch eine gespeicherte AB (abPositionen)', () => {
    const abDaten = JSON.stringify({ abPositionen: [staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2')] });
    expect(leseStaffelStand(abDaten, 2026).hatStaffel).toBe(true);
  });
});

describe('uebernehmeStaffelnFuerAB', () => {
  it('friert einen leeren Hinweistext ein', () => {
    const stand = leseStaffelStand(angebotsDaten(), 2026);
    const uebernommen = uebernehmeStaffelnFuerAB(stand);
    expect(uebernommen.konditionen.hinweistext).toBeTruthy();
    expect(uebernommen.konditionen.hinweistext).toContain('Staffelung');
  });

  it('lässt einen manuell gepflegten Text unverändert', () => {
    const stand = leseStaffelStand(
      angebotsDaten({
        staffelKonditionen: {
          abrechnungsmodell: 'stufenpreis',
          mengenbasis: 'gesamt',
          zeitraumBis: '2026-10-31',
          gutschriftNurBeiZahlung: false,
          hinweistext: 'Wie am 3.9. besprochen.',
        },
      }),
      2026
    );
    expect(uebernehmeStaffelnFuerAB(stand).konditionen.hinweistext).toBe('Wie am 3.9. besprochen.');
  });

  it('entfernt die Pflegehilfe grenzenGekoppelt, behält die Vertragsangaben', () => {
    const uebernommen = uebernehmeStaffelnFuerAB(leseStaffelStand(angebotsDaten(), 2026));
    expect(uebernommen.konditionen.grenzenGekoppelt).toBeUndefined();
    expect(uebernommen.konditionen.zeitraumVon).toBe('2026-01-01');
    expect(uebernommen.konditionen.gutschriftNurBeiZahlung).toBe(true);
  });
});

describe('Kennzahlen und Status einer AB', () => {
  const staffeln = [staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2')];

  it('zählt Staffelzeilen nie in Menge, Betrag oder Vereinszahl', () => {
    const k = berechneABKennzahlen([], staffeln);
    expect(k).toMatchObject({ nurStaffel: true, hatVereine: false, gesamtMenge: 0, nettobetrag: 0, anzahlVereine: 0 });
  });

  it('rechnet im Mischfall ausschließlich über die Vereinspositionen', () => {
    const k = berechneABKennzahlen([{ menge: 120, gesamtpreis: 12000 }, { menge: 80, gesamtpreis: 8000 }], staffeln);
    expect(k).toMatchObject({ nurStaffel: false, hatVereine: true, gesamtMenge: 200, nettobetrag: 20000, anzahlVereine: 2 });
  });

  it('schreibt bei einer reinen Staffel-AB keine Projektzahlen zurück', () => {
    expect(abProjektDatenUpdates(berechneABKennzahlen([], staffeln))).toEqual({});
    const misch = abProjektDatenUpdates(berechneABKennzahlen([{ menge: 100, gesamtpreis: 10000 }], staffeln));
    expect(misch.gesamtMenge).toBe(100);
    expect(misch.anzahlVereine).toBe(1);
    expect(misch.gesamtBrutto).toBeCloseTo(11900, 2);
  });

  it('springt bei einer Saisonvereinbarung nicht in die Lieferphase', () => {
    expect(abStatusNachErstellen(berechneABKennzahlen([], staffeln))).toBe('auftragsbestaetigung');
    expect(abStatusNachErstellen(berechneABKennzahlen([{ menge: 10, gesamtpreis: 1000 }], staffeln))).toBe('lieferschein');
  });
});

describe('zerlegeStaffelBeschreibung', () => {
  it('trennt Lieferregion und Bemerkung eines Altbelegs', () => {
    expect(zerlegeStaffelBeschreibung('Lieferregion: Bayern\nNur ganze Lkw')).toEqual({
      lieferregion: 'Bayern',
      bemerkung: 'Nur ganze Lkw',
    });
  });

  it('behält eine mehrzeilige Bemerkung vollständig', () => {
    expect(zerlegeStaffelBeschreibung('Lieferregion: Bayern\nZeile 1\nZeile 2').bemerkung).toBe('Zeile 1\nZeile 2');
  });

  it('legt einen Text ohne Präfix vollständig in die Bemerkung', () => {
    expect(zerlegeStaffelBeschreibung('inkl. Fracht')).toEqual({ bemerkung: 'inkl. Fracht' });
    expect(zerlegeStaffelBeschreibung('')).toEqual({});
    expect(zerlegeStaffelBeschreibung(undefined)).toEqual({});
  });
});

describe('staffelSortenAusPositionen', () => {
  it('überträgt die Staffeln wertgleich und lässt „unbegrenzt“ unbegrenzt', () => {
    const sorten = staffelSortenAusPositionen([staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2')]);
    expect(sorten[0].staffeln).toEqual([
      { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
      { vonMenge: 300, bisMenge: null, einzelpreis: 110 },
    ]);
    expect(sorten[0].artikelnummer).toBe('TM-ZM-02');
    expect(sorten[0].einheit).toBe('t');
  });

  it('bevorzugt die strukturierten Felder gegenüber der Freitext-Heuristik', () => {
    const mitBeidem = staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2', {
      beschreibung: 'Lieferregion: Hessen\nAlter Text',
      staffelpreise: {
        staffeln: [{ vonMenge: 0, bisMenge: null, einzelpreis: 120 }],
        basisArtikel: 'TM-ZM-02',
        basisBezeichnung: 'Ziegelmehl 0/2',
        lieferregion: 'Bayern',
        bemerkung: 'Neuer Text',
      },
    });
    const sorte = staffelSortenAusPositionen([mitBeidem])[0];
    expect(sorte.lieferregion).toBe('Bayern');
    expect(sorte.bemerkung).toBe('Neuer Text');
  });

  it('heilt eine gespeicherte 0 als „unbegrenzt“', () => {
    // 0 bedeutet portalweit unbegrenzt – bliebe sie stehen, zeigte die Maske
    // „0" und das PDF „unbegrenzt".
    const mitNull = staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2', {
      staffelpreise: {
        staffeln: [
          { vonMenge: 0, bisMenge: 300, einzelpreis: 120 },
          { vonMenge: 300, bisMenge: 0, einzelpreis: 110 },
        ],
        basisArtikel: 'TM-ZM-02',
        basisBezeichnung: 'Ziegelmehl 0/2',
      },
    });
    expect(staffelSortenAusPositionen([mitNull])[0].staffeln[1].bisMenge).toBeNull();
  });

  it('fällt für Altbelege auf die Beschreibung zurück', () => {
    const alt = staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2', { beschreibung: 'Lieferregion: Hessen\nNur Silo' });
    const sorte = staffelSortenAusPositionen([alt])[0];
    expect(sorte.lieferregion).toBe('Hessen');
    expect(sorte.bemerkung).toBe('Nur Silo');
  });
});

describe('leseAngebotsStand', () => {
  it('leitet den Staffelmodus aus den gespeicherten Zeilen ab', () => {
    const stand = leseAngebotsStand(angebotsDaten(), 2026);
    expect(stand.angebotsModus).toBe('staffelpreis');
    expect(stand.hatInhalt).toBe(true);
    expect(stand.staffelSorten).toHaveLength(1);
    expect(stand.formData.zahlungsziel).toBe('30 Tage netto');
    expect(stand.formData.angebotsnummer).toBe('PB-AG-2026-007');
  });

  it('bleibt im Standardmodus, wenn nur Vereinszeilen gespeichert sind', () => {
    const daten = JSON.stringify({
      positionen: [{ vereinId: 'v1', vereinsname: 'TC Musterstadt', menge: 120, einzelpreis: 95 }],
      angebotPositionen: [],
    });
    const stand = leseAngebotsStand(daten, 2026);
    expect(stand.angebotsModus).toBe('standard');
    expect(stand.hatInhalt).toBe(true);
    expect(stand.vereinsPositionen[0].menge).toBe(120);
  });

  it('trennt Zusatz- und Bedarfspositionen', () => {
    const daten = angebotsDaten({
      angebotPositionen: [
        staffelZeile('TM-ZM-02', 'Ziegelmehl 0/2'),
        { id: 'z1', artikelnummer: 'TM-DZ', bezeichnung: 'Zuschlag', einheit: 'pauschal', menge: 1, einzelpreis: 50, gesamtpreis: 50, positionsTyp: 'normal' },
        { id: 'b1', artikelnummer: '', bezeichnung: 'Bedarf 2026', einheit: 't', menge: 100, einzelpreis: 90, gesamtpreis: 9000, positionsTyp: 'bedarf', bedarfsStatus: 'bestaetigt', geschaetzteMenge: 100, bedarfsNotiz: 'grob' },
      ],
    });
    const stand = leseAngebotsStand(daten, 2026);
    expect(stand.zusatzPositionen).toHaveLength(1);
    expect(stand.bedarfsPositionen).toEqual([
      { id: 'b1', bezeichnung: 'Bedarf 2026', beschreibung: undefined, geschaetzteMenge: 100, einheit: 't', einzelpreis: 90, notiz: 'grob', status: 'bestaetigt' },
    ]);
  });

  it('führt die im Angebot gewählte Sorte je Verein mit', () => {
    const daten = JSON.stringify({
      positionen: [{ vereinId: 'v1', vereinsname: 'TC Musterstadt', menge: 120, einzelpreis: 95 }],
      angebotPositionen: [
        {
          id: 'p1',
          vereinId: 'v1',
          artikelnummer: 'TM-ZM-03',
          bezeichnung: 'TC Musterstadt',
          beschreibung: 'Ziegelmehl 0/3',
          einheit: 't',
          menge: 120,
          einzelpreis: 95,
          gesamtpreis: 11400,
          positionsTyp: 'normal',
        },
      ],
    });
    const stand = leseAngebotsStand(daten, 2026);
    expect(stand.vereinsPositionen[0].artikelnummer).toBe('TM-ZM-03');
    // `bezeichnung` ist bei Vereinszeilen der Vereinsname – die darf nie als
    // Artikelbezeichnung zurückkommen.
    expect(stand.vereinsPositionen[0]).not.toHaveProperty('artikelBezeichnung');
    // Der Verein selbst wird nicht als Zusatzposition mitgezählt.
    expect(stand.zusatzPositionen).toHaveLength(0);
  });

  it('liest die Belegversion aus dem JSON, nicht vom Dokument', () => {
    expect(leseAngebotsStand(angebotsDaten({ version: 3 }), 2026).version).toBe(3);
    expect(leseAngebotsStand(angebotsDaten(), 2026).version).toBeUndefined();
  });

  it('meldet ein leeres Dokument als inhaltslos', () => {
    expect(leseAngebotsStand('{}', 2026).hatInhalt).toBe(false);
    expect(leseAngebotsStand('{kaputt', 2026).hatInhalt).toBe(false);
  });
});

describe('bezugIstAktuell', () => {
  it('erkennt ein zwischenzeitlich neu erstelltes Angebot', () => {
    expect(bezugIstAktuell({ nummer: 'PB-AG-2026-007', dokumentId: 'a1' }, { nummer: 'PB-AG-2026-008', dokumentId: 'a2' })).toBe(false);
    expect(bezugIstAktuell({ nummer: 'PB-AG-2026-007', dokumentId: 'a1' }, { nummer: 'PB-AG-2026-007', dokumentId: 'a1' })).toBe(true);
  });

  it('vergleicht über die Nummer, wenn keine Beleg-ID mitgeführt wurde (Altentwürfe)', () => {
    expect(bezugIstAktuell({ nummer: 'PB-AG-2026-007' }, { nummer: 'PB-AG-2026-008', dokumentId: 'a2' })).toBe(false);
    expect(bezugIstAktuell({ nummer: 'PB-AG-2026-007' }, { nummer: 'PB-AG-2026-007' })).toBe(true);
  });

  it('meldet keinen Konflikt, wenn nichts zu vergleichen ist', () => {
    expect(bezugIstAktuell(null, { nummer: 'PB-AG-2026-008' })).toBe(true);
    expect(bezugIstAktuell({ nummer: '' }, { nummer: '' })).toBe(true);
  });
});

describe('mischeVereinPositionen', () => {
  const aktuell = [
    { vereinId: 'v1', vereinsname: 'TC A', menge: 50, einzelpreis: 100, ausgewaehlt: false },
    { vereinId: 'v2', vereinsname: 'TC B', menge: 60, einzelpreis: 100, ausgewaehlt: false },
  ];

  it('übernimmt Menge, Preis und Auswahl aus dem Dokument', () => {
    const { positionen, nichtZugeordnet } = mischeVereinPositionen(aktuell, [
      { vereinId: 'v1', vereinsname: 'TC A', menge: 120, einzelpreis: 95 },
    ]);
    expect(positionen[0]).toMatchObject({ menge: 120, einzelpreis: 95, ausgewaehlt: true });
    // Nicht im Angebot enthaltene Vereine behalten ihre Vorbelegung.
    expect(positionen[1]).toMatchObject({ menge: 60, ausgewaehlt: false });
    expect(nichtZugeordnet).toEqual([]);
  });

  it('behält die im Angebot gewählte Sorte statt des Standardartikels', () => {
    const mitArtikel = [
      { vereinId: 'v1', vereinsname: 'TC A', menge: 50, einzelpreis: 100, ausgewaehlt: false, artikelnummer: 'TM-ZM-02' },
    ];
    const { positionen } = mischeVereinPositionen(mitArtikel, [
      { vereinId: 'v1', vereinsname: 'TC A', menge: 120, einzelpreis: 95, artikelnummer: 'TM-ZM-03' },
    ]);
    expect(positionen[0].artikelnummer).toBe('TM-ZM-03');
  });

  it('meldet Vereine, die im Angebot standen und heute nicht mehr zugeordnet sind', () => {
    const { nichtZugeordnet } = mischeVereinPositionen(aktuell, [
      { vereinId: 'v9', vereinsname: 'TC Ehemalig', menge: 30, einzelpreis: 90 },
    ]);
    expect(nichtZugeordnet).toEqual(['TC Ehemalig']);
  });

  it('gibt ohne Dokumentstand die Ausgangsliste unverändert zurück', () => {
    expect(mischeVereinPositionen(aktuell, []).positionen).toBe(aktuell);
  });
});
