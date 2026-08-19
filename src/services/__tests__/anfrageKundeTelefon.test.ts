/**
 * Kontakt-Übernahme aus einer Anfrage in den Kundenstamm.
 *
 * Regression: Bis 08/2026 landeten Name und Telefon nur im losen
 * `dispoAnsprechpartner`-Objekt am Kunden (die E-Mail gar nicht). Kundenakte und
 * Call-Liste lesen aber die Ansprechpartner-Collection — beim Nachtelefonieren war
 * dort nichts auffindbar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createKunde = vi.fn();
const loadKunde = vi.fn();
const updateKunde = vi.fn();
const setzeDispoAnsprechpartner = vi.fn();

vi.mock('../saisonplanungService', () => ({
  saisonplanungService: {
    createKunde: (...args: unknown[]) => createKunde(...args),
    loadKunde: (...args: unknown[]) => loadKunde(...args),
    updateKunde: (...args: unknown[]) => updateKunde(...args),
    setzeDispoAnsprechpartner: (...args: unknown[]) => setzeDispoAnsprechpartner(...args),
  },
}));

// Die uebrigen Service-Importe des Moduls sind fuer diese Funktionen irrelevant,
// ziehen aber Appwrite-Clients nach — daher stumpf gestubbt.
vi.mock('../projektService', () => ({ projektService: {} }));
vi.mock('../nummerierungService', () => ({ generiereNaechsteDokumentnummer: vi.fn() }));
vi.mock('../stammdatenService', () => ({ getStammdatenOderDefault: vi.fn() }));
vi.mock('../dokumentService', () => ({ generiereAngebotPDF: vi.fn() }));
vi.mock('../projektabwicklungDokumentService', () => ({ speichereAngebot: vi.fn() }));
vi.mock('../emailSendService', () => ({
  sendeEmailMitPdf: vi.fn(),
  pdfZuBase64: vi.fn(),
  wrapInEmailTemplate: vi.fn(),
}));
vi.mock('../anfragenService', () => ({ anfragenService: {} }));
vi.mock('../artikelService', () => ({ sucheArtikelNachNummer: vi.fn() }));

import { legeKundeAnOderLade, uebernehmeKontaktInKundenstamm } from '../anfrageVerarbeitungService';

/** Anfrage, wie sie der Dialog uebergibt — Absenderdaten in `analysiert` */
const ANFRAGE = {
  analysiert: {
    kundenname: 'TC Musterhausen e.V.',
    ansprechpartner: 'Max Platzwart',
    email: 'max.platzwart@gmx.de',
    telefon: '0170 1234567',
    plzOrt: '97070 Würzburg',
  },
} as never;

const KUNDENDATEN = {
  name: 'TC Musterhausen e.V.',
  email: 'vorstand@tc-musterhausen.de',
  telefon: '0170 1234567',
  strasse: 'Am Sportplatz 3',
  plz: '97070',
  ort: 'Würzburg',
  ansprechpartner: 'Max Platzwart',
};

/** Der Kontakt-Payload aus dem `setzeDispoAnsprechpartner`-Aufruf */
const kontaktArg = (aufrufIndex = 0) => setzeDispoAnsprechpartner.mock.calls[aufrufIndex][1];
/** Die Optionen aus dem `setzeDispoAnsprechpartner`-Aufruf */
const optionenArg = (aufrufIndex = 0) => setzeDispoAnsprechpartner.mock.calls[aufrufIndex][2];

beforeEach(() => {
  vi.clearAllMocks();
  createKunde.mockResolvedValue({ id: 'kunde-1', name: KUNDENDATEN.name, kundennummer: 'K-100' });
  setzeDispoAnsprechpartner.mockResolvedValue({ id: 'ap-1' });
});

describe('legeKundeAnOderLade — neuer Kunde', () => {
  it('schreibt die Telefonnummer als Hauptnummer an den Kunden', async () => {
    await legeKundeAnOderLade(true, undefined, KUNDENDATEN);

    expect(createKunde).toHaveBeenCalledTimes(1);
    expect(createKunde.mock.calls[0][0]).toMatchObject({ telefon: '0170 1234567' });
  });

  it('legt die Person mit Name, E-Mail und Nummer als Ansprechpartner an', async () => {
    await legeKundeAnOderLade(true, undefined, KUNDENDATEN);

    expect(setzeDispoAnsprechpartner).toHaveBeenCalledTimes(1);
    expect(setzeDispoAnsprechpartner.mock.calls[0][0]).toBe('kunde-1');
    expect(kontaktArg()).toEqual({
      name: 'Max Platzwart',
      telefon: '0170 1234567',
      email: KUNDENDATEN.email,
    });
  });

  it('markiert diesen Kontakt als Dispo-Ansprechpartner — es gibt keinen anderen', async () => {
    await legeKundeAnOderLade(true, undefined, KUNDENDATEN);

    expect(optionenArg()).toMatchObject({ dispo: 'setzen' });
  });

  it('legt den Ansprechpartner auch ohne Telefonnummer an — Name und E-Mail genuegen', async () => {
    await legeKundeAnOderLade(true, undefined, { ...KUNDENDATEN, telefon: undefined });

    expect(setzeDispoAnsprechpartner).toHaveBeenCalledTimes(1);
    expect(kontaktArg()).toMatchObject({
      name: 'Max Platzwart',
      email: KUNDENDATEN.email,
      telefon: '',
    });
  });

  it('nutzt den Kundennamen, wenn kein Ansprechpartner genannt ist', async () => {
    await legeKundeAnOderLade(true, undefined, { ...KUNDENDATEN, ansprechpartner: undefined });

    expect(kontaktArg()).toMatchObject({ name: KUNDENDATEN.name });
  });

  it('legt keinen leeren Kontakt an, wenn weder E-Mail noch Telefon vorliegen', async () => {
    await legeKundeAnOderLade(true, undefined, { ...KUNDENDATEN, telefon: undefined, email: '' });

    expect(setzeDispoAnsprechpartner).not.toHaveBeenCalled();
  });

  it('laesst telefon am Kunden undefiniert, wenn die Anfrage keine Nummer enthielt', async () => {
    await legeKundeAnOderLade(true, undefined, { ...KUNDENDATEN, telefon: undefined });

    expect(createKunde.mock.calls[0][0].telefon).toBeUndefined();
  });

  it('kippt nicht, wenn der Ansprechpartner-Stamm den Kontakt ablehnt', async () => {
    setzeDispoAnsprechpartner.mockRejectedValue(new Error('Appwrite offline'));

    const ergebnis = await legeKundeAnOderLade(true, undefined, KUNDENDATEN);

    expect(ergebnis.kundeId).toBe('kunde-1');
    expect(ergebnis.kundennummer).toBe('K-100');
  });
});

describe('legeKundeAnOderLade — bestehender Kunde', () => {
  it('traegt die Nummer nach, wenn beim Kunden noch keine hinterlegt ist', async () => {
    loadKunde.mockResolvedValue({ id: 'kunde-7', kundennummer: 'K-7', telefon: '' });

    await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    expect(updateKunde).toHaveBeenCalledWith('kunde-7', { telefon: '0170 1234567' });
    expect(setzeDispoAnsprechpartner).toHaveBeenCalledWith(
      'kunde-7',
      expect.objectContaining({ telefon: '0170 1234567' }),
      expect.anything()
    );
  });

  it('ueberschreibt eine gepflegte Hauptnummer nicht', async () => {
    loadKunde.mockResolvedValue({ id: 'kunde-7', kundennummer: 'K-7', telefon: '0931 999888' });

    await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    expect(updateKunde).not.toHaveBeenCalled();
    // Der Ansprechpartner-Stamm bekommt den Kontakt trotzdem — dort ergaenzt
    // setzeDispoAnsprechpartner, ohne bestehende Nummern zu verlieren.
    expect(setzeDispoAnsprechpartner).toHaveBeenCalled();
  });

  it('nimmt einem gepflegten Dispo-Ansprechpartner die Markierung nicht weg', async () => {
    loadKunde.mockResolvedValue({ id: 'kunde-7', kundennummer: 'K-7' });

    await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    // Sonst ruft die Tourenplanung spaeter den Absender der Anfrage statt des Platzwarts an.
    expect(optionenArg()).toMatchObject({ dispo: 'nur_wenn_keiner' });
  });

  it('legt keinen neuen Kunden an', async () => {
    loadKunde.mockResolvedValue({ id: 'kunde-7', kundennummer: 'K-7' });

    const ergebnis = await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    expect(createKunde).not.toHaveBeenCalled();
    expect(ergebnis.kundeId).toBe('kunde-7');
  });

  it('wirft, wenn der ausgewaehlte Kunde nicht mehr existiert', async () => {
    loadKunde.mockResolvedValue(null);

    await expect(legeKundeAnOderLade(false, 'kunde-weg', KUNDENDATEN, ANFRAGE)).rejects.toThrow();
  });
});

describe('uebernehmeKontaktInKundenstamm', () => {
  const KONTAKT = { name: 'Max Platzwart', email: 'max@gmx.de', telefon: '0170 1234567' };

  it('ignoriert reine Whitespace-Angaben', async () => {
    await uebernehmeKontaktInKundenstamm(
      'kunde-1',
      { ...KONTAKT, telefon: '   ', email: '  ' },
      'setzen'
    );

    expect(setzeDispoAnsprechpartner).not.toHaveBeenCalled();
  });

  it('trimmt Nummer und Namen vor der Uebernahme', async () => {
    await uebernehmeKontaktInKundenstamm(
      'kunde-1',
      { ...KONTAKT, telefon: '  0170 1234567  ', name: '  Max Platzwart  ' },
      'setzen'
    );

    expect(kontaktArg()).toMatchObject({ telefon: '0170 1234567', name: 'Max Platzwart' });
  });

  it('kennzeichnet die Herkunft ueber die Rolle', async () => {
    await uebernehmeKontaktInKundenstamm('kunde-1', KONTAKT, 'setzen');

    expect(optionenArg()).toMatchObject({ rolle: 'Ansprechpartner (aus Anfrage)' });
  });

  it('tut nichts ohne Kunden-ID', async () => {
    await uebernehmeKontaktInKundenstamm('', KONTAKT, 'setzen');

    expect(setzeDispoAnsprechpartner).not.toHaveBeenCalled();
  });
});

describe('Bestandskunde: Kontaktdaten stammen vom Absender, nicht aus dem Kundenstamm', () => {
  // Regression (Review 08/2026): Sobald im Dialog ein bestehender Kunde zugeordnet wird,
  // ueberschreibt dieser `email` und `telefon` in editedData mit den KUNDEN-Stammdaten —
  // `ansprechpartner` bleibt aber der Absender. Wer das ungeprueft uebernimmt, legt einen
  // Ansprechpartner an, der den Namen der einen und die Kontaktdaten einer anderen Person
  // traegt (Vereinsadresse + Handynummer des Platzwarts unter dem Namen der Sekretaerin).
  const KONTAMINIERT = {
    ...KUNDENDATEN,
    ansprechpartner: 'Sabine Schriftführerin',
    email: 'info@tc-musterhausen.de', // Vereinsadresse aus dem Kundenstamm
    telefon: '0170 111',               // Nummer des Platzwarts aus dispoAnsprechpartner
  };

  const ANFRAGE_SABINE = {
    analysiert: {
      kundenname: 'TC Musterhausen e.V.',
      ansprechpartner: 'Sabine Schriftführerin',
      email: 'sabine@gmx.de',
      telefon: '0931 555',
      plzOrt: '97070 Würzburg',
    },
  } as never;

  beforeEach(() => {
    loadKunde.mockResolvedValue({ id: 'kunde-7', kundennummer: 'K-7', telefon: '0931 999888' });
  });

  it('nimmt die Absenderdaten aus der Anfrage statt der Kundenstammdaten', async () => {
    await legeKundeAnOderLade(false, 'kunde-7', KONTAMINIERT, ANFRAGE_SABINE);

    expect(kontaktArg()).toEqual({
      name: 'Sabine Schriftführerin',
      email: 'sabine@gmx.de',
      telefon: '0931 555',
    });
  });

  it('legt gar keinen Kontakt an, wenn die Anfragedaten fehlen', async () => {
    // Lieber kein Ansprechpartner als einer aus vermischten Daten.
    await legeKundeAnOderLade(false, 'kunde-7', KONTAMINIERT, undefined);

    expect(setzeDispoAnsprechpartner).not.toHaveBeenCalled();
  });

  it('legt keinen Kontakt an, wenn die Anfrage keinen Personennamen kennt', async () => {
    const ohneName = { analysiert: { kundenname: 'TC Musterhausen e.V.', email: 'info@tc.de', plzOrt: '' } } as never;

    await legeKundeAnOderLade(false, 'kunde-7', KONTAMINIERT, ohneName);

    expect(setzeDispoAnsprechpartner).not.toHaveBeenCalled();
  });

  it('nutzt beim NEUEN Kunden weiterhin die Dialogfelder — dort sind sie unverfaelscht', async () => {
    // Der Bearbeiter kann sie vor dem Anlegen korrigiert haben; ohne Kundenzuordnung
    // findet keine Ueberschreibung statt.
    await legeKundeAnOderLade(true, undefined, {
      ...KUNDENDATEN,
      ansprechpartner: 'Max Korrigiert',
      email: 'korrigiert@verein.de',
    }, ANFRAGE_SABINE);

    expect(kontaktArg()).toMatchObject({
      name: 'Max Korrigiert',
      email: 'korrigiert@verein.de',
    });
  });
});

describe('Bestandskunde: gepflegter Dispo-Kontakt bleibt zustaendig', () => {
  // Regression (Review 08/2026): 'nur_wenn_keiner' sieht nur die Ansprechpartner-Collection.
  // Bei migrierten Kunden und Altbestand steht der Dispo-Kontakt aber im losen Feld
  // `kunde.dispoAnsprechpartner` — dort waere die Sperre blind gewesen und der Absender
  // haette die Markierung bekommen. Lieferschein und Tourenplanung riefen dann den Falschen an.
  it('ruehrt die Markierung nicht an, wenn der Kunde einen Dispo-Kontakt im Stammfeld hat', async () => {
    loadKunde.mockResolvedValue({
      id: 'kunde-7',
      kundennummer: 'K-7',
      telefon: '0931 999888',
      dispoAnsprechpartner: { name: 'Hans Platzwart', telefon: '0170 111' },
    });

    await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    expect(optionenArg()).toMatchObject({ dispo: 'nicht_aendern' });
  });

  it('darf markieren, wenn im Stammfeld nur ein leerer Name steht', async () => {
    loadKunde.mockResolvedValue({
      id: 'kunde-7',
      kundennummer: 'K-7',
      dispoAnsprechpartner: { name: '   ', telefon: '' },
    });

    await legeKundeAnOderLade(false, 'kunde-7', KUNDENDATEN, ANFRAGE);

    expect(optionenArg()).toMatchObject({ dispo: 'nur_wenn_keiner' });
  });
});
