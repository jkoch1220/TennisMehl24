/**
 * Empfänger-Klärung vor dem Massenangebots-Lauf.
 *
 * Der Lauf schickt jedem Kunden genau eine Mail. Fehlt die Adresse, fällt der
 * Kunde still heraus; sind mehrere hinterlegt, entscheidet sonst die Reihenfolge
 * im Code. Beides muss vorher auffallen — aber ohne Fehlalarm bei Kunden, deren
 * Verteiler bewusst gepflegt ist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadAlleKunden = vi.fn();
const updateKunde = vi.fn();
const loadAllDocuments = vi.fn();
const logAktion = vi.fn();

vi.mock('../saisonplanungService', () => ({
  saisonplanungService: {
    loadAlleKunden: (...a: unknown[]) => loadAlleKunden(...a),
    updateKunde: (...a: unknown[]) => updateKunde(...a),
  },
}));
vi.mock('../../utils/appwritePagination', () => ({
  loadAllDocuments: (...a: unknown[]) => loadAllDocuments(...a),
}));
vi.mock('../auditService', () => ({ auditService: { logAktion: (...a: unknown[]) => logAktion(...a) } }));

// Die übrigen Importe des Moduls ziehen Appwrite-Clients nach — gestubbt.
vi.mock('../projektService', () => ({ projektService: {} }));
vi.mock('../projektabwicklungDokumentService', () => ({
  ladeDokumentNachTyp: vi.fn(), ladeDokumentDaten: vi.fn(), speichereAngebot: vi.fn(),
  loescheDokumenteFuerProjekt: vi.fn(),
}));
vi.mock('../nummerierungService', () => ({
  generiereNaechsteDokumentnummer: vi.fn(),
  NummernPruefungFehlgeschlagen: class extends Error {},
}));
vi.mock('../emailSendService', () => ({
  sendeEmailMitPdf: vi.fn(), pdfZuBase64: vi.fn(), wrapInEmailTemplate: vi.fn(),
}));
vi.mock('../dokumentService', () => ({ generiereAngebotPDF: vi.fn() }));
vi.mock('../stammdatenService', () => ({
  getArtikelPreis: vi.fn(), getStammdatenOderDefault: vi.fn(), getPreisKonfiguration: vi.fn(),
}));
vi.mock('../../config/appwrite', () => ({
  databases: {}, DATABASE_ID: 'db', ANGEBOTS_LAEUFE_COLLECTION_ID: 'laeufe',
  SAISON_ANSPRECHPARTNER_COLLECTION_ID: 'ap', PROJEKTE_COLLECTION_ID: 'projekte', PROJECT_ID: 'p',
}));

import { massenAngebotService } from '../massenAngebotService';

const kunde = (teil: Record<string, unknown>) => ({
  id: 'k1', name: 'TC Musterstadt', kundennummer: '100', ...teil,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Standard: keine Ansprechpartner, keine Projekte
  loadAllDocuments.mockResolvedValue([]);
});

describe('sammleEmailKlaerungsfaelle', () => {
  it('meldet einen Kunden ganz ohne Adresse als „fehlt"', async () => {
    loadAlleKunden.mockResolvedValue([kunde({})]);
    const faelle = await massenAngebotService.sammleEmailKlaerungsfaelle(['k1']);
    expect(faelle).toHaveLength(1);
    expect(faelle[0].art).toBe('fehlt');
    expect(faelle[0].kandidaten).toEqual([]);
  });

  it('meldet nichts, wenn genau eine Adresse auffindbar ist', async () => {
    loadAlleKunden.mockResolvedValue([kunde({ email: 'verein@example.com' })]);
    expect(await massenAngebotService.sammleEmailKlaerungsfaelle(['k1'])).toEqual([]);
  });

  it('meldet zwei verschiedene Adressen als „mehrdeutig"', async () => {
    loadAlleKunden.mockResolvedValue([
      kunde({ email: 'kassenwart@example.com', rechnungsEmail: 'vorstand@example.com' }),
    ]);
    const faelle = await massenAngebotService.sammleEmailKlaerungsfaelle(['k1']);
    expect(faelle).toHaveLength(1);
    expect(faelle[0].art).toBe('mehrdeutig');
    expect(faelle[0].kandidaten.map((k) => k.email).sort()).toEqual([
      'kassenwart@example.com', 'vorstand@example.com',
    ]);
  });

  it('behandelt dieselbe Adresse in zwei Feldern als eindeutig', async () => {
    loadAlleKunden.mockResolvedValue([
      kunde({ email: 'verein@example.com', rechnungsEmail: 'verein@example.com' }),
    ]);
    expect(await massenAngebotService.sammleEmailKlaerungsfaelle(['k1'])).toEqual([]);
  });

  it('lässt einen gepflegten Verteiler in Ruhe — auch mit mehreren Empfängern', async () => {
    // Zwei Vorstände sollen das Angebot bewusst gemeinsam bekommen.
    loadAlleKunden.mockResolvedValue([
      kunde({
        angebotsEmails: ['erster@example.com', 'zweiter@example.com'],
        email: 'noch-eine@example.com',
      }),
    ]);
    expect(await massenAngebotService.sammleEmailKlaerungsfaelle(['k1'])).toEqual([]);
  });

  it('schlägt die Adresse eines Ansprechpartners vor, wenn am Kunden nichts steht', async () => {
    loadAlleKunden.mockResolvedValue([kunde({})]);
    loadAllDocuments.mockImplementation(async (_db: string, collection: string) =>
      collection === 'ap'
        ? [{ kundeId: 'k1', data: JSON.stringify({ email: 'vorstand@example.com', name: 'M. Meier', funktion: '1. Vorstand' }) }]
        : []
    );
    const faelle = await massenAngebotService.sammleEmailKlaerungsfaelle(['k1']);
    // Genau ein Fund = eindeutig, keine Rückfrage nötig.
    expect(faelle).toEqual([]);
  });

  it('verwirft formal ungültige Adressen, statt sie vorzuschlagen', async () => {
    loadAlleKunden.mockResolvedValue([kunde({ email: 'kein-at-zeichen', rechnungsEmail: 'auch@keine' })]);
    const faelle = await massenAngebotService.sammleEmailKlaerungsfaelle(['k1']);
    expect(faelle).toHaveLength(1);
    expect(faelle[0].art).toBe('fehlt');
  });

  it('sortiert fehlende Adressen vor mehrdeutige', async () => {
    loadAlleKunden.mockResolvedValue([
      kunde({ id: 'k1', name: 'B-Verein', email: 'a@example.com', rechnungsEmail: 'b@example.com' }),
      kunde({ id: 'k2', name: 'A-Verein' }),
    ]);
    const faelle = await massenAngebotService.sammleEmailKlaerungsfaelle(['k1', 'k2']);
    expect(faelle.map((f) => f.art)).toEqual(['fehlt', 'mehrdeutig']);
  });

  it('fragt nichts ab, wenn keine Kunden übergeben werden', async () => {
    expect(await massenAngebotService.sammleEmailKlaerungsfaelle([])).toEqual([]);
    expect(loadAlleKunden).not.toHaveBeenCalled();
  });
});

describe('setzeAngebotsEmails', () => {
  it('speichert bereinigt und ohne Duplikate', async () => {
    await massenAngebotService.setzeAngebotsEmails('k1', [
      '  Vorstand@Example.com  ', 'Vorstand@Example.com', 'unbrauchbar', 'zweiter@example.com',
    ]);
    expect(updateKunde).toHaveBeenCalledWith('k1', {
      angebotsEmails: ['Vorstand@Example.com', 'zweiter@example.com'],
    });
  });

  it('erlaubt das Leeren des Verteilers', async () => {
    await massenAngebotService.setzeAngebotsEmails('k1', []);
    expect(updateKunde).toHaveBeenCalledWith('k1', { angebotsEmails: [] });
  });
});
