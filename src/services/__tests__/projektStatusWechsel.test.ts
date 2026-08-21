/**
 * Der Statuswechsel im Kanban führt `bezahltAm` mit — in BEIDE Richtungen.
 *
 * Auf 'bezahlt' zu ziehen setzt das Zahldatum. Wieder herauszuziehen — per
 * Widerruf, nach einer Rücklastschrift oder weil die Karte danebenlag — muss es
 * löschen. Sonst steht das Kanban auf „offen" und die Debitorenverwaltung auf
 * „bezahlt", ohne dass jemand den Widerspruch sieht.
 *
 * Entscheidend ist, dass `bezahltAm` als TOP-LEVEL-Spalte geschrieben wird:
 * Sie steht in PROJEKT_TOP_LEVEL_FELDER und gewinnt beim Lesen gegen die
 * JSON-Kopie in `data`. Ein Fix, der das Feld nur aus `data` entfernt, sieht im
 * Code richtig aus und bewirkt nichts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDocument = vi.fn();
const getDocument = vi.fn();

vi.mock('../../config/appwrite', () => ({
  databases: {
    updateDocument: (...a: unknown[]) => updateDocument(...a),
    getDocument: (...a: unknown[]) => getDocument(...a),
  },
  DATABASE_ID: 'db',
  COLLECTIONS: { PROJEKTE: 'projekte' },
}));
vi.mock('../auditService', () => ({
  auditService: { logAktion: vi.fn() },
  bearbeiterStempel: () => ({}),
  erstellerStempel: () => ({}),
}));
vi.mock('../nummerierungService', () => ({ generiereNaechsteDokumentnummer: vi.fn() }));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: vi.fn() }));
vi.mock('../saisonplanungService', () => ({ saisonplanungService: {} }));
vi.mock('../kundenListeService', () => ({ kundenListeService: {} }));
vi.mock('../platzbauerverwaltungService', () => ({ platzbauerverwaltungService: {} }));

import { projektService } from '../projektService';

const projektDoc = (felder: Record<string, unknown>) => ({
  $id: 'p1',
  projektName: 'TC Musterstadt',
  kundeId: 'k1',
  kundenname: 'TC Musterstadt',
  saisonjahr: 2026,
  ...felder,
  data: JSON.stringify({ id: 'p1', projektName: 'TC Musterstadt', ...felder }),
});

/** Das an Appwrite übergebene Update-Objekt des letzten Aufrufs. */
const geschriebeneFelder = () => {
  const calls = updateDocument.mock.calls;
  return calls[calls.length - 1]?.[3] as Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  updateDocument.mockImplementation((_db, _col, _id, felder) =>
    Promise.resolve(projektDoc(felder as Record<string, unknown>))
  );
});

describe('updateProjektStatus und das Zahldatum', () => {
  it('setzt beim Zug auf „bezahlt" ein Zahldatum', async () => {
    getDocument.mockResolvedValue(projektDoc({ status: 'rechnung' }));
    await projektService.updateProjektStatus('p1', 'bezahlt');
    expect(geschriebeneFelder().bezahltAm).toEqual(expect.any(String));
  });

  it('behält ein vorhandenes Zahldatum bei — der Tag des Zugs ist nicht der Zahlungseingang', async () => {
    getDocument.mockResolvedValue(projektDoc({ status: 'rechnung', bezahltAm: '2026-03-15' }));
    await projektService.updateProjektStatus('p1', 'bezahlt');
    expect(geschriebeneFelder().bezahltAm).toBe('2026-03-15');
  });

  it('nimmt bei Shop-Bestellungen den tatsächlichen Vorab-Zahlungseingang', async () => {
    getDocument.mockResolvedValue(projektDoc({ status: 'rechnung', vorabBezahltAm: '2026-02-01' }));
    await projektService.updateProjektStatus('p1', 'bezahlt');
    expect(geschriebeneFelder().bezahltAm).toBe('2026-02-01');
  });

  it('LÖSCHT das Zahldatum, wenn das Projekt aus „bezahlt" herausgezogen wird', async () => {
    getDocument.mockResolvedValue(projektDoc({ status: 'bezahlt', bezahltAm: '2026-03-15' }));
    await projektService.updateProjektStatus('p1', 'rechnung');
    expect(geschriebeneFelder().bezahltAm).toBeNull();
  });

  it('schreibt die Löschung als Top-Level-Spalte, nicht nur in die JSON-Kopie', async () => {
    // Die Kernfalle: `bezahltAm` steht in PROJEKT_TOP_LEVEL_FELDER und gewinnt
    // beim Lesen. Nur aus `data` zu entfernen sieht richtig aus und bewirkt nichts.
    getDocument.mockResolvedValue(projektDoc({ status: 'bezahlt', bezahltAm: '2026-03-15' }));
    await projektService.updateProjektStatus('p1', 'rechnung');
    const felder = geschriebeneFelder();
    expect(Object.prototype.hasOwnProperty.call(felder, 'bezahltAm')).toBe(true);
    expect(felder.bezahltAm).toBeNull();
    expect(JSON.parse(felder.data as string).bezahltAm).toBeUndefined();
  });

  it('rührt `vorabBezahltAm` nicht an — der Shop-Zahlungseingang bleibt eine eigene Tatsache', async () => {
    getDocument.mockResolvedValue(
      projektDoc({ status: 'bezahlt', bezahltAm: '2026-03-15', vorabBezahltAm: '2026-02-01' })
    );
    await projektService.updateProjektStatus('p1', 'rechnung');
    expect(JSON.parse(geschriebeneFelder().data as string).vorabBezahltAm).toBe('2026-02-01');
  });
});
