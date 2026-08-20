/**
 * Massenversand der Frühjahrsangebote.
 *
 * Drei Dinge müssen bei mehreren hundert Mails an echte Vereine stimmen:
 * kein Doppelversand, eine Pause zwischen den Nachrichten, und ein Abbruch, der
 * greift, bevor die nächste Mail rausgeht.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProjekt = vi.fn();
const updateProjektStatus = vi.fn();
const ladeDokumentNachTyp = vi.fn();
const ladeDokumentDaten = vi.fn();
const sendeEmailMitPdf = vi.fn();

vi.mock('../projektService', () => ({
  projektService: {
    getProjekt: (...a: unknown[]) => getProjekt(...a),
    updateProjektStatus: (...a: unknown[]) => updateProjektStatus(...a),
  },
}));
vi.mock('../projektabwicklungDokumentService', () => ({
  ladeDokumentNachTyp: (...a: unknown[]) => ladeDokumentNachTyp(...a),
  ladeDokumentDaten: (...a: unknown[]) => ladeDokumentDaten(...a),
  speichereAngebot: vi.fn(),
  loescheDokumenteFuerProjekt: vi.fn(),
}));
vi.mock('../emailSendService', () => ({
  sendeEmailMitPdf: (...a: unknown[]) => sendeEmailMitPdf(...a),
  pdfZuBase64: () => 'base64',
  wrapInEmailTemplate: (t: string) => t,
}));
vi.mock('../dokumentService', () => ({ generiereAngebotPDF: vi.fn() }));
vi.mock('../stammdatenService', () => ({
  getArtikelPreis: vi.fn(),
  getStammdatenOderDefault: vi.fn().mockResolvedValue({}),
  getPreisKonfiguration: vi.fn(),
}));
vi.mock('../../utils/emailHelpers', () => ({
  generiereStandardEmail: vi.fn().mockResolvedValue({ betreff: 'B', text: 'T', signatur: 'S' }),
}));
vi.mock('../saisonplanungService', () => ({ saisonplanungService: {} }));
vi.mock('../nummerierungService', () => ({
  generiereNaechsteDokumentnummer: vi.fn(),
  NummernPruefungFehlgeschlagen: class extends Error {},
}));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: vi.fn() }));
vi.mock('../auditService', () => ({ auditService: { logAktion: vi.fn() } }));
vi.mock('../../config/appwrite', () => ({
  databases: {}, DATABASE_ID: 'db', ANGEBOTS_LAEUFE_COLLECTION_ID: 'l',
  SAISON_ANSPRECHPARTNER_COLLECTION_ID: 'ap', PROJEKTE_COLLECTION_ID: 'p', PROJECT_ID: 'x',
}));

import { massenAngebotService } from '../massenAngebotService';

const kandidat = (n: number) => ({
  projektId: `p${n}`,
  kundeId: `k${n}`,
  kundenname: `Verein ${n}`,
  angebotsnummer: `ANG-2027-000${n}`,
  empfaengerEmail: `verein${n}@example.com`,
  emailFehlt: false,
  ausgewaehlt: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  getProjekt.mockResolvedValue({ status: 'angebot' });
  ladeDokumentNachTyp.mockResolvedValue({ id: 'd1' });
  ladeDokumentDaten.mockReturnValue({ angebotsnummer: 'ANG-2027-0001', kundenname: 'V', kundennummer: '1' });
  sendeEmailMitPdf.mockResolvedValue({ success: true });
});

describe('Doppelversand-Schutz', () => {
  it('sendet nicht, wenn das Projekt inzwischen versendet wurde', async () => {
    getProjekt.mockResolvedValue({ status: 'angebot_versendet' });
    const res = await massenAngebotService.versendeAngebot('p1', 'a@b.de', false);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/bereits versendet/i);
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
  });

  it('meldet ein zwischenzeitlich gelöschtes Projekt als Zustand, nicht als Absturz', async () => {
    getProjekt.mockRejectedValue(new Error('could not be found'));
    const res = await massenAngebotService.versendeAngebot('p1', 'a@b.de', false);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/existiert nicht mehr/i);
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
  });

  it('prüft im Testmodus nicht — dort kommt beim Kunden nichts an', async () => {
    getProjekt.mockResolvedValue({ status: 'angebot_versendet' });
    const res = await massenAngebotService.versendeAngebot('p1', 'a@b.de', true);
    expect(res.success).toBe(true);
    expect(sendeEmailMitPdf).toHaveBeenCalled();
    // Kein Statuswechsel beim Testversand.
    expect(updateProjektStatus).not.toHaveBeenCalled();
  });
});

describe('versendeBatch', () => {
  it('hält vor der nächsten Mail an, wenn das Abbruchsignal kommt', async () => {
    let gesendet = 0;
    sendeEmailMitPdf.mockImplementation(async () => {
      gesendet += 1;
      return { success: true };
    });
    // Nach der zweiten Mail abbrechen.
    const res = await massenAngebotService.versendeBatch(
      [kandidat(1), kandidat(2), kandidat(3), kandidat(4)],
      true,
      undefined,
      { abbruchSignal: () => gesendet >= 2, pauseMs: 0 }
    );
    expect(res.gesendet).toBe(2);
    expect(res.abgebrochen).toEqual({ offen: 2 });
    expect(sendeEmailMitPdf).toHaveBeenCalledTimes(2);
  });

  it('sammelt Fehler je Empfänger, ohne den Lauf abzubrechen', async () => {
    sendeEmailMitPdf
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const res = await massenAngebotService.versendeBatch(
      [kandidat(1), kandidat(2), kandidat(3)],
      true,
      undefined,
      { pauseMs: 0 }
    );
    expect(res.gesendet).toBe(2);
    expect(res.fehler).toHaveLength(1);
    expect(res.fehler[0].kundenname).toBe('Verein 2');
    expect(res.abgebrochen).toBeUndefined();
  });

  it('meldet den Fortschritt für jeden Empfänger', async () => {
    const schritte: number[] = [];
    await massenAngebotService.versendeBatch(
      [kandidat(1), kandidat(2)],
      true,
      (done) => schritte.push(done),
      { pauseMs: 0 }
    );
    expect(schritte).toEqual([1, 2]);
  });

  it('pausiert zwischen den Mails, aber nicht nach der letzten', async () => {
    vi.useFakeTimers();
    try {
      const lauf = massenAngebotService.versendeBatch(
        [kandidat(1), kandidat(2)],
        false,
        undefined,
        { pauseMs: 500 }
      );
      // Genau eine Pause bei zwei Empfängern.
      await vi.advanceTimersByTimeAsync(2000);
      const res = await lauf;
      expect(res.gesendet).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
