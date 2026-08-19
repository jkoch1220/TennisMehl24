/**
 * Dispo-Markierung beim Übernehmen eines Kontakts in den Ansprechpartner-Stamm.
 *
 * Die Markierung ist exklusiv (genau einer pro Kunde). Automatisch übernommene
 * Kontakte — etwa der Absender einer Anfrage — dürfen sie einem gepflegten
 * Platzwart deshalb nicht wegnehmen: Lieferschein und Tourenplanung lesen genau
 * diesen Eintrag, ein stiller Wechsel führt zum Anruf beim Falschen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('appwrite', () => ({
  ID: { unique: () => 'neue-id' },
  Query: { equal: vi.fn(), limit: vi.fn(), orderDesc: vi.fn(), orderAsc: vi.fn() },
  Models: {},
}));
vi.mock('../../config/appwrite', () => ({
  databases: {},
  DATABASE_ID: 'db',
  SAISON_KUNDEN_COLLECTION_ID: 'kunden',
  SAISON_ANSPRECHPARTNER_COLLECTION_ID: 'ansprechpartner',
  SAISON_DATEN_COLLECTION_ID: 'daten',
  SAISON_BEZIEHUNGEN_COLLECTION_ID: 'beziehungen',
  SAISON_AKTIVITAETEN_COLLECTION_ID: 'aktivitaeten',
  COLLECTIONS: {},
}));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: vi.fn() }));
vi.mock('../../utils/rateLimiter', () => ({ runBatched: vi.fn() }));
vi.mock('../pdfHelpers', () => ({ formatAdresszeile: vi.fn() }));
vi.mock('../cacheService', () => ({ cacheService: { invalidate: vi.fn(), get: vi.fn(), set: vi.fn() } }));
vi.mock('../kundennummerService', () => ({ generiereNaechsteKundennummer: vi.fn() }));

import { saisonplanungService } from '../saisonplanungService';

const ansprechpartner = (ueberschreibung: Record<string, unknown>) => ({
  id: 'ap-x',
  kundeId: 'kunde-1',
  name: 'Namenlos',
  telefonnummern: [],
  aktiv: true,
  erstelltAm: '',
  geaendertAm: '',
  ...ueberschreibung,
});

const PLATZWART = ansprechpartner({
  id: 'ap-platzwart',
  name: 'Hans Platzwart',
  telefonnummern: [{ nummer: '0170 111', typ: 'Mobil' }],
  istDispoAnsprechpartner: true,
});

let vorhandene: ReturnType<typeof ansprechpartner>[] = [];

beforeEach(() => {
  vorhandene = [];
  vi.restoreAllMocks();
  vi.spyOn(saisonplanungService, 'loadAnsprechpartnerFuerKunde').mockImplementation(
    async () => vorhandene as never
  );
  vi.spyOn(saisonplanungService, 'createAnsprechpartner').mockImplementation(
    async (neu) => ({ ...neu, id: 'ap-neu' }) as never
  );
  vi.spyOn(saisonplanungService, 'updateAnsprechpartner').mockImplementation(
    async (id, patch) => ({ id, ...patch }) as never
  );
});

describe("dispo: 'setzen' (Default)", () => {
  it('markiert einen neu angelegten Kontakt', async () => {
    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: 'Max Vorstand',
      telefon: '0170 222',
    });

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt).toMatchObject({ name: 'Max Vorstand', istDispoAnsprechpartner: true });
  });

  it('entzieht allen anderen die Markierung', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', { name: 'Max Vorstand' });

    expect(saisonplanungService.updateAnsprechpartner).toHaveBeenCalledWith('ap-platzwart', {
      istDispoAnsprechpartner: false,
    });
  });

  it('bleibt der Default, wenn keine Optionen uebergeben werden', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', { name: 'Neu' }, {});

    expect(saisonplanungService.updateAnsprechpartner).toHaveBeenCalledWith('ap-platzwart', {
      istDispoAnsprechpartner: false,
    });
  });
});

describe("dispo: 'nur_wenn_keiner'", () => {
  it('markiert, solange der Kunde keinen Dispo-Ansprechpartner hat', async () => {
    vorhandene = [ansprechpartner({ id: 'ap-alt', name: 'Alt', istDispoAnsprechpartner: false })];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Max Vorstand' },
      { dispo: 'nur_wenn_keiner' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.istDispoAnsprechpartner).toBe(true);
  });

  it('laesst die Markierung beim gepflegten Platzwart', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Max Vorstand', telefon: '0170 222' },
      { dispo: 'nur_wenn_keiner' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.istDispoAnsprechpartner).toBe(false);
    // Der Platzwart wird nicht angefasst
    expect(saisonplanungService.updateAnsprechpartner).not.toHaveBeenCalled();
  });

  it('ignoriert eine inaktive Alt-Markierung', async () => {
    vorhandene = [ansprechpartner({ id: 'ap-weg', istDispoAnsprechpartner: true, aktiv: false })];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Max Vorstand' },
      { dispo: 'nur_wenn_keiner' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.istDispoAnsprechpartner).toBe(true);
  });

  it('behaelt die Markierung, wenn der Kontakt selbst der markierte ist', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Hans Platzwart', telefon: '0170 999' },
      { dispo: 'nur_wenn_keiner' }
    );

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.istDispoAnsprechpartner).toBe(true);
  });
});

describe('Ergaenzen bestehender Kontakte', () => {
  it('haengt eine neue Nummer an, ohne bestehende zu verlieren', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: 'Hans Platzwart',
      telefon: '0931 555',
    });

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.telefonnummern).toEqual([
      { nummer: '0170 111', typ: 'Mobil' },
      { nummer: '0931 555', typ: 'Dispo' },
    ]);
  });

  it('legt eine bereits bekannte Nummer nicht doppelt an', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: 'Hans Platzwart',
      telefon: '0170 111',
    });

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.telefonnummern).toHaveLength(1);
  });

  it('matcht Namen unabhaengig von Gross-/Kleinschreibung und Rand-Leerzeichen', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: '  hans platzwart ',
      telefon: '0931 555',
    });

    expect(saisonplanungService.createAnsprechpartner).not.toHaveBeenCalled();
    expect(saisonplanungService.updateAnsprechpartner).toHaveBeenCalled();
  });

  it('ueberschreibt eine gepflegte E-Mail nicht mit einer leeren', async () => {
    vorhandene = [ansprechpartner({ id: 'ap-1', name: 'Hans', email: 'hans@verein.de' })];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', { name: 'Hans', telefon: '1' });

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.email).toBe('hans@verein.de');
  });

  it('ueberschreibt eine gepflegte E-Mail auch nicht mit einer ANDEREN', async () => {
    // Regression (Review 08/2026): Automatisch uebernommene Kontakte tragen oft die
    // allgemeine Vereinsadresse. Die darf die persoenliche Adresse des Ansprechpartners
    // nicht ersetzen — bei den Telefonnummern gilt dasselbe (sie werden nur angehaengt).
    vorhandene = [ansprechpartner({ id: 'ap-1', name: 'Hans', email: 'hans.privat@t-online.de' })];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: 'Hans',
      email: 'info@verein.de',
    });

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.email).toBe('hans.privat@t-online.de');
  });

  it('ergaenzt eine fehlende E-Mail', async () => {
    vorhandene = [ansprechpartner({ id: 'ap-1', name: 'Hans' })];

    await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      name: 'Hans',
      email: 'hans@verein.de',
    });

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.email).toBe('hans@verein.de');
  });
});

describe("dispo: 'nicht_aendern'", () => {
  it('laesst die Markierung des Platzwarts unangetastet', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Sabine Schriftführerin', email: 'sabine@gmx.de' },
      { dispo: 'nicht_aendern' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.istDispoAnsprechpartner).toBe(false);
    expect(saisonplanungService.updateAnsprechpartner).not.toHaveBeenCalled();
  });

  it('markiert auch dann nicht, wenn gar kein Dispo-Kontakt existiert', async () => {
    vorhandene = [];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Sabine', email: 'sabine@gmx.de' },
      { dispo: 'nicht_aendern' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.istDispoAnsprechpartner).toBe(false);
  });

  it('nimmt einem bereits markierten Kontakt seine Markierung nicht weg', async () => {
    vorhandene = [PLATZWART];

    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Hans Platzwart', telefon: '0931 555' },
      { dispo: 'nicht_aendern' }
    );

    const patch = vi.mocked(saisonplanungService.updateAnsprechpartner).mock.calls[0][1];
    expect(patch.istDispoAnsprechpartner).toBe(true);
  });
});

describe('Optionen', () => {
  it('uebernimmt die Rolle bei Neuanlage', async () => {
    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Max', email: 'max@verein.de' },
      { rolle: 'Ansprechpartner (aus Anfrage)' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.rolle).toBe('Ansprechpartner (aus Anfrage)');
  });

  it('nutzt den angegebenen Telefon-Typ', async () => {
    await saisonplanungService.setzeDispoAnsprechpartner(
      'kunde-1',
      { name: 'Max', telefon: '0170 222' },
      { telefonTyp: 'Telefon' }
    );

    const erstellt = vi.mocked(saisonplanungService.createAnsprechpartner).mock.calls[0][0];
    expect(erstellt.telefonnummern).toEqual([{ nummer: '0170 222', typ: 'Telefon' }]);
  });

  it('gibt ohne Namen null zurueck und legt nichts an', async () => {
    const ergebnis = await saisonplanungService.setzeDispoAnsprechpartner('kunde-1', {
      telefon: '0170 222',
    });

    expect(ergebnis).toBeNull();
    expect(saisonplanungService.createAnsprechpartner).not.toHaveBeenCalled();
  });
});
