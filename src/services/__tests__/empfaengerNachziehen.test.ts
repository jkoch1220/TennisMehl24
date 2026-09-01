/**
 * Die Empfängeradresse muss dort ankommen, wo der Versand sie liest.
 *
 * Der Fehler, der das nötig machte: Die Empfänger-Klärung schreibt den
 * geklärten Verteiler nach `angebotsEmails` am Kunden. Der Kampagnen-Weg las
 * aber nur `rechnungsEmail || email` — geklärte Adressen kamen dort nie an,
 * und die Zeile blieb „ohne E-Mail", obwohl die Arbeit getan war.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadAlleKunden = vi.fn();
const updateKunde = vi.fn();
const loadAllDocuments = vi.fn();

vi.mock('../saisonplanungService', () => ({
  saisonplanungService: {
    loadAlleKunden: (...a: unknown[]) => loadAlleKunden(...a),
    updateKunde: (...a: unknown[]) => updateKunde(...a),
  },
}));
vi.mock('../../utils/appwritePagination', () => ({
  loadAllDocuments: (...a: unknown[]) => loadAllDocuments(...a),
}));
vi.mock('../auditService', () => ({ auditService: { logAktion: vi.fn() } }));
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

type Kundenfelder = { angebotsEmails?: string[]; rechnungsEmail?: string; email?: string };
const empfaenger = (felder: Kundenfelder) =>
  massenAngebotService.ermittleEmpfaenger({ id: 'k1', name: 'TC Musterstadt', ...felder } as never);

beforeEach(() => {
  vi.clearAllMocks();
  loadAllDocuments.mockResolvedValue([]);
});

describe('ermittleEmpfaenger', () => {
  it('gibt dem geklärten Verteiler den Vorrang', () => {
    // Genau der Fall, der vorher unterging: Die Klärung hat entschieden,
    // die Rechnungsadresse ist die des Steuerberaters von vorletztem Jahr.
    expect(empfaenger({
      angebotsEmails: ['vorstand@tc-musterstadt.de'],
      rechnungsEmail: 'alt@kanzlei.de',
      email: 'info@tc-musterstadt.de',
    })).toBe('vorstand@tc-musterstadt.de');
  });

  it('reicht mehrere Empfänger kommasepariert weiter', () => {
    // nodemailer nimmt das im To-Feld direkt entgegen; alle sehen sich
    // gegenseitig, was bei Vereinsverteilern gewollt ist.
    expect(empfaenger({ angebotsEmails: ['a@v.de', 'b@v.de'] })).toBe('a@v.de, b@v.de');
  });

  it('nennt eine doppelt gepflegte Adresse nur einmal', () => {
    expect(empfaenger({ angebotsEmails: ['a@v.de', 'a@v.de'] })).toBe('a@v.de');
  });

  it('fällt auf die Rechnungsadresse zurück, dann auf die Kundenadresse', () => {
    expect(empfaenger({ rechnungsEmail: 'r@v.de', email: 'k@v.de' })).toBe('r@v.de');
    expect(empfaenger({ email: 'k@v.de' })).toBe('k@v.de');
  });

  it('wertet einen leeren Verteiler nicht als Adresse', () => {
    // Ein geleerter Verteiler heißt „Fallback gilt wieder", nicht „keine Mail".
    expect(empfaenger({ angebotsEmails: [], rechnungsEmail: 'r@v.de' })).toBe('r@v.de');
    expect(empfaenger({ angebotsEmails: ['  '], rechnungsEmail: 'r@v.de' })).toBe('r@v.de');
  });

  it('meldet nichts, wenn nirgends eine Adresse steht', () => {
    expect(empfaenger({})).toBeUndefined();
  });
});
