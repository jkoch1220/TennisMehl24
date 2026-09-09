/**
 * Ein Massen-Lauf darf nicht heimlich unvollständig bleiben.
 *
 * Beim Aufbau der Schüttgut-Kampagne (658 Zeilen) drosselte Appwrite ab der
 * 124. Zeile mit HTTP 429. Die gescheiterten Zeilen wurden gezählt, aber der
 * Zähler nirgends ausgewertet: Die Anzeige stand bei 96 %, die Erfolgsmeldung
 * nannte 658 aufgenommene Kunden — tatsächlich waren es 124. Wer das nicht
 * erfährt, verschickt eine Kampagne mit einem Fünftel der Vereine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createDocument = vi.fn();
const updateDocument = vi.fn();
const listDocuments = vi.fn();

vi.mock('../../config/appwrite', () => ({
  databases: {
    createDocument: (...a: unknown[]) => createDocument(...a),
    updateDocument: (...a: unknown[]) => updateDocument(...a),
    listDocuments: (...a: unknown[]) => listDocuments(...a),
  },
  DATABASE_ID: 'db',
  MASSEN_ANGEBOTE_COLLECTION_ID: 'massen_angebote',
  MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID: 'zeilen',
  SAISON_DATEN_COLLECTION_ID: 'saison_daten',
  PROJEKTE_COLLECTION_ID: 'projekte',
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID: 'dokumente',
  PROJECT_ID: 'p',
}));
vi.mock('../massenAngebotService', () => ({
  massenAngebotService: {}, ermittleEmpfaenger: () => undefined,
}));
vi.mock('../saisonplanungService', () => ({ saisonplanungService: {} }));
vi.mock('../projektService', () => ({ projektService: {} }));
vi.mock('../projektabwicklungDokumentService', () => ({
  ladeDokumentNachTyp: vi.fn(), ladeDokumentDaten: vi.fn(), speichereAngebot: vi.fn(),
  loescheDokumenteFuerProjekt: vi.fn(),
}));
vi.mock('../auditService', () => ({ auditService: { logAktion: vi.fn() } }));
vi.mock('../stammdatenService', () => ({ getArtikelPreis: vi.fn() }));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: (...a: unknown[]) => listDocuments(...a) }));

import { massenAngebotKampagnenService } from '../massenAngebotKampagnenService';

const zeile = (i: number) => ({ kundeId: `k${i}`, kundenname: `Verein ${i}`, positionen: [] });

beforeEach(() => {
  vi.clearAllMocks();
  listDocuments.mockResolvedValue([]);       // aktualisiereZaehler
  updateDocument.mockResolvedValue({});
});

describe('speichereZeilen', () => {
  it('zählt jede gescheiterte Zeile und meldet sie zurück', async () => {
    // Jede zweite Zeile scheitert hart (kein 429 — dann wird nicht gewartet).
    let n = 0;
    createDocument.mockImplementation(() => {
      n++;
      return n % 2 === 0
        ? Promise.reject(Object.assign(new Error('kaputt'), { code: 400 }))
        : Promise.resolve({});
    });

    const e = await massenAngebotKampagnenService.speichereZeilen(
      'kampagne-1', [1, 2, 3, 4, 5, 6].map(zeile), { startPauseMs: 0 }
    );

    expect(e.erstellt).toBe(3);
    expect(e.fehler).toBe(3);
  });

  it('meldet als Fortschritt die gespeicherten Zeilen, nicht die Versuche', async () => {
    // Der Kern des Fehlers: Die Anzeige zählte Schleifendurchläufe. Bei 658
    // Zeilen stand dort 96 %, während drei Viertel am Limit gescheitert waren.
    createDocument.mockRejectedValue(Object.assign(new Error('kaputt'), { code: 400 }));
    const stand: number[] = [];

    const e = await massenAngebotKampagnenService.speichereZeilen(
      'kampagne-1', [1, 2, 3, 4].map(zeile),
      { startPauseMs: 0, onFortschritt: (erledigt) => stand.push(erledigt) }
    );

    expect(e.fehler).toBe(4);
    expect(e.erstellt).toBe(0);
    expect(stand.every((s) => s === 0)).toBe(true);
  });

  it('speichert alles, wenn nichts dazwischenkommt', async () => {
    createDocument.mockResolvedValue({});
    const e = await massenAngebotKampagnenService.speichereZeilen(
      'kampagne-1', [1, 2, 3, 4, 5].map(zeile), { startPauseMs: 0 }
    );
    expect([e.erstellt, e.fehler]).toEqual([5, 0]);
  });

  it('unterscheidet neue Zeilen von Änderungen', async () => {
    createDocument.mockResolvedValue({});
    const e = await massenAngebotKampagnenService.speichereZeilen('kampagne-1', [
      { ...zeile(1), id: 'vorhanden' },
      zeile(2),
    ], { startPauseMs: 0 });
    expect([e.erstellt, e.aktualisiert]).toEqual([1, 1]);
  });
});
