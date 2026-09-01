/**
 * Die Sandbox darf niemals einen echten Verein erreichen.
 *
 * Die Generalprobe vor dem Herbstlauf spielt den kompletten Ablauf durch —
 * inklusive „scharf versenden". Ginge dabei eine Mail an einen echten Verein
 * hinaus, wäre der Schaden real und nicht zurückzuholen. Deshalb hängt der
 * Empfänger nicht am Testmodus-Schalter allein, sondern zusätzlich am
 * Mock-Modus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendeEmailMitPdf = vi.fn();
const getProjekt = vi.fn();
const istMockModusAktiv = vi.fn();

vi.mock('../projektService', () => ({
  projektService: {
    getProjekt: (...a: unknown[]) => getProjekt(...a),
    updateProjektStatus: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../projektabwicklungDokumentService', () => ({
  ladeDokumentNachTyp: vi.fn().mockResolvedValue({ $id: 'd1', dokumentNummer: 'ANG-2027-0001' }),
  ladeDokumentDaten: vi.fn().mockReturnValue({ kundenname: 'TC Musterstadt', angebotsnummer: 'ANG-2027-0001', positionen: [] }),
  speichereAngebot: vi.fn(),
  loescheDokumenteFuerProjekt: vi.fn(),
}));
vi.mock('../emailSendService', () => ({
  sendeEmailMitPdf: (...a: unknown[]) => sendeEmailMitPdf(...a),
  pdfZuBase64: () => 'base64',
  wrapInEmailTemplate: (t: string) => t,
  ladeEmailProtokollFuerDokument: vi.fn().mockResolvedValue([]),
  istTestversand: () => false,
}));
vi.mock('../dokumentService', () => ({ generiereAngebotPDF: vi.fn().mockResolvedValue(new Blob()) }));
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
vi.mock('../../config/mockModus', () => ({
  istMockModusAktiv: () => istMockModusAktiv(),
}));

import { massenAngebotService } from '../massenAngebotService';

const ECHTER_VEREIN = 'vorstand@tc-musterstadt.de';
const TESTADRESSE = 'jtatwcook@gmail.com';

const empfaengerDerMail = () => (sendeEmailMitPdf.mock.calls[0]?.[0] as { empfaenger?: string })?.empfaenger;

describe('Versand-Empfänger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjekt.mockResolvedValue({ id: 'p1', status: 'angebot' });
    sendeEmailMitPdf.mockResolvedValue({ success: true });
  });

  it('erreicht den Verein NUR in der Produktion und nur scharf', async () => {
    istMockModusAktiv.mockReturnValue(false);
    await massenAngebotService.versendeAngebot('p1', ECHTER_VEREIN, false);
    expect(empfaengerDerMail()).toBe(ECHTER_VEREIN);
  });

  it('biegt den Empfänger im Testmodus auf die Testadresse um', async () => {
    istMockModusAktiv.mockReturnValue(false);
    await massenAngebotService.versendeAngebot('p1', ECHTER_VEREIN, true);
    expect(empfaengerDerMail()).toBe(TESTADRESSE);
  });

  it('erreicht aus der Sandbox NIEMALS den Verein — auch bei scharfem Versand', async () => {
    istMockModusAktiv.mockReturnValue(true);
    await massenAngebotService.versendeAngebot('p1', ECHTER_VEREIN, false);
    expect(empfaengerDerMail()).toBe(TESTADRESSE);
    expect(empfaengerDerMail()).not.toBe(ECHTER_VEREIN);
  });

  it('erreicht auch im Sandbox-Testmodus nur die Testadresse', async () => {
    istMockModusAktiv.mockReturnValue(true);
    await massenAngebotService.versendeAngebot('p1', ECHTER_VEREIN, true);
    expect(empfaengerDerMail()).toBe(TESTADRESSE);
  });
});
