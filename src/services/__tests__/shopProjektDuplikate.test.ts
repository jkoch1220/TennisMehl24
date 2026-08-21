/**
 * Zu einer Shop-Bestellung darf je Warenart genau EIN Projekt entstehen.
 *
 * Bis 08/2026 liessen sich beliebig viele anlegen. Die Duplikatsuche fragte
 * `Query.equal('auftragsbestaetigungsnummer', …)` ab — ein Feld, das es als
 * Appwrite-SPALTE nie gab. Appwrite antwortete mit „Invalid query: Attribute not
 * found in schema", der Catch lieferte „keine Projekte gefunden", und die
 * Oberflaeche schloss daraus, dass noch keines existiert. Bestellung #173 traegt
 * real zwei Projekte.
 *
 * Zwei Projekte zur selben Bestellung heissen am Ende zwei Auftragsbestaetigungen
 * und zwei Rechnungen an denselben Kunden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listDocuments = vi.fn();
const updateDocument = vi.fn();
const createProjekt = vi.fn();

vi.mock('../../config/appwrite', () => ({
  databases: {
    listDocuments: (...a: unknown[]) => listDocuments(...a),
    updateDocument: (...a: unknown[]) => updateDocument(...a),
  },
  DATABASE_ID: 'db',
  UNIVERSA_ARTIKEL_COLLECTION_ID: 'universa_artikel',
  COLLECTIONS: { PROJEKTE: 'projekte', SHOP_BESTELLUNGEN: 'shop_bestellungen' },
}));
vi.mock('../projektService', () => ({
  projektService: { createProjekt: (...a: unknown[]) => createProjekt(...a) },
}));
vi.mock('../../config/backend', () => ({ BACKEND_CONFIG: {}, backendFetch: vi.fn() }));
vi.mock('../../config/mockModus', () => ({ blockiereImMockModus: vi.fn() }));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: vi.fn() }));

import { shopBestellungService, ProjektBereitsVorhandenError } from '../shopBestellungService';

/** Appwrite-Dokument: die meisten Felder liegen im data-JSON, nicht top-level. */
const projektDoc = (id: string, felder: Record<string, unknown>) => ({
  $id: id,
  projektName: felder.projektName,
  data: JSON.stringify(felder),
});

beforeEach(() => {
  vi.clearAllMocks();
  updateDocument.mockResolvedValue({});
});

describe('getExistierendeProjekte', () => {
  it('fragt ueber die echte Spalte `shopBestellnummer` ab', async () => {
    listDocuments.mockResolvedValue({ documents: [] });
    await shopBestellungService.getExistierendeProjekte('173');
    const queries = listDocuments.mock.calls[0][2] as string[];
    expect(JSON.stringify(queries)).toMatch(/shopBestellnummer/);
    expect(JSON.stringify(queries)).not.toMatch(/auftragsbestaetigungsnummer/);
  });

  it('liest die AB-Nummer aus dem data-JSON, nicht von der Dokumentwurzel', async () => {
    // Der zweite Fehler derselben Funktion: `doc as unknown as Projekt` lieferte
    // fuer `auftragsbestaetigungsnummer` undefined — und genau daran haengt die
    // Unterscheidung Universal-/Eigen-Projekt.
    listDocuments.mockResolvedValue({
      documents: [
        projektDoc('p-uni', { projektName: 'Shop #173 (Universal)', auftragsbestaetigungsnummer: 'SHOP-173-U' }),
        projektDoc('p-eig', { projektName: 'Shop #173 (Eigen)', auftragsbestaetigungsnummer: 'SHOP-173-E' }),
      ],
    });
    const { universal, eigen } = await shopBestellungService.getExistierendeProjekte('173');
    expect(universal?.$id).toBe('p-uni');
    expect(eigen?.$id).toBe('p-eig');
  });

  it('weicht auf die Namenssuche aus, wenn die Spalte fehlt', async () => {
    // Sandbox vor der Migration: still nichts zu finden waere genau der alte Fehler.
    listDocuments
      .mockRejectedValueOnce(new Error('Attribute not found in schema: shopBestellnummer'))
      .mockResolvedValueOnce({
        documents: [projektDoc('p-alt', { projektName: 'Shop #173', auftragsbestaetigungsnummer: 'SHOP-173-U' })],
      });
    const { universal } = await shopBestellungService.getExistierendeProjekte('173');
    expect(universal?.$id).toBe('p-alt');
    const zweiterQuery = JSON.stringify(listDocuments.mock.calls[1][2]);
    expect(zweiterQuery).toMatch(/projektName/);
  });

  it('ordnet Altprojekte ohne Suffix anhand ihrer Positionen zu', async () => {
    listDocuments.mockResolvedValue({
      documents: [
        projektDoc('p-alt', {
          projektName: 'Shop #171',
          auftragsbestaetigungsnummer: 'SHOP-171',
          auftragsbestaetigungsDaten: JSON.stringify({
            positionen: [{ istUniversalArtikel: true, bezeichnung: 'Netz' }],
          }),
        }),
      ],
    });
    const { universal, eigen } = await shopBestellungService.getExistierendeProjekte('171');
    expect(universal?.$id).toBe('p-alt');
    expect(eigen).toBeNull();
  });

  it('meldet nichts, wenn es nichts gibt', async () => {
    listDocuments.mockResolvedValue({ documents: [] });
    const r = await shopBestellungService.getExistierendeProjekte('999');
    expect(r).toEqual({ universal: null, eigen: null });
  });
});

describe('ProjektBereitsVorhandenError', () => {
  it('traegt die Projekt-ID mit, damit die Oberflaeche dorthin verweisen kann', () => {
    const e = new ProjektBereitsVorhandenError('173', 'universal', 'p-uni');
    expect(e.projektId).toBe('p-uni');
    expect(e.bestellnummer).toBe('173');
    expect(e.message).toMatch(/173/);
    expect(e).toBeInstanceOf(Error);
  });
});
