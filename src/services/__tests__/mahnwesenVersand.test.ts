/**
 * Der Mahnversand hat vier Nebenwirkungen, die auseinandergehalten werden müssen:
 * PDF archivieren (GoBD), Protokoll schreiben, Mahnstufe fortschreiben, Audit-Eintrag.
 *
 * Seit der E-Mail-Client davorgeschaltet ist, kann der Nutzer die Mahnung ansehen und
 * bearbeiten, BEVOR irgendetwas davon passiert. Diese Trennung ist der eigentliche
 * Vertrag: `bereiteMahnungVersandVor` darf nichts schreiben, `sendeVorbereiteteMahnung`
 * darf im Testmodus die Mahnstufe nicht anfassen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendeEmailMitPdf = vi.fn();
const createDocument = vi.fn();
const listDocuments = vi.fn();
const createFile = vi.fn();
const markiereMahnungVersendet = vi.fn();
const logAktion = vi.fn();

vi.mock('../emailSendService', () => ({
  sendeEmailMitPdf: (...a: unknown[]) => sendeEmailMitPdf(...a),
  wrapInEmailTemplate: (t: string) => t,
  blobZuBase64: vi.fn().mockResolvedValue('base64'),
  textToHtml: (t: string) => t,
}));
vi.mock('../debitorService', () => ({
  debitorService: {
    markiereMahnungVersendet: (...a: unknown[]) => markiereMahnungVersendet(...a),
  },
}));
vi.mock('../auditService', () => ({ auditService: { logAktion: (...a: unknown[]) => logAktion(...a) } }));
vi.mock('../projektService', () => ({ projektService: { updateProjekt: vi.fn() } }));
vi.mock('../saisonplanungService', () => ({ saisonplanungService: {} }));
vi.mock('../platzbauerverwaltungService', () => ({ platzbauerverwaltungService: {} }));
vi.mock('../stammdatenService', () => ({
  getStammdatenOderDefault: vi.fn().mockResolvedValue({}),
  ladeStammdaten: vi.fn().mockResolvedValue(null),
  speichereStammdaten: vi.fn(),
}));
vi.mock('../../utils/emailHelpers', () => ({
  ladeStandardSignatur: vi.fn().mockResolvedValue('<p>Signatur</p>'),
}));
// Die Layout-Helfer reichen die Y-Position durch — ohne das wird sie NaN und jsPDF wirft.
vi.mock('../pdfHelpers', () => ({
  addDIN5008Header: vi.fn().mockResolvedValue(undefined),
  addDIN5008Footer: vi.fn(),
  addAbsenderzeile: vi.fn(),
  ensureSpace: vi.fn(async (_doc: unknown, currentY: number) => currentY),
  addWrappedText: vi.fn((_doc: unknown, _text: string, _x: number, y: number) => y + 10),
  formatStrasseHausnummer: (s: string) => s,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockRejectedValue(new Error('kein QR im Test')) } }));
vi.mock('../../config/appwrite', () => ({
  databases: {
    createDocument: (...a: unknown[]) => createDocument(...a),
    listDocuments: (...a: unknown[]) => listDocuments(...a),
  },
  storage: { createFile: (...a: unknown[]) => createFile(...a) },
  DATABASE_ID: 'db',
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID: 'bucket',
  COLLECTIONS: { MAHNWESEN_DOKUMENTE: 'mahnwesen_dokumente' },
}));
vi.mock('../../config/mockModus', () => ({ getBucketId: (id: string) => id }));

import {
  bereiteMahnungVersandVor,
  sendeVorbereiteteMahnung,
  sendeMahnungPerEmail,
} from '../mahnwesenService';
import { DebitorView } from '../../types/debitor';

const debitor = {
  projektId: 'p1',
  kundenname: 'TC Musterstadt',
  kundennummer: '10042',
  rechnungsnummer: 'RE-2026-0042',
  rechnungsbetrag: 1190,
  offenerBetrag: 1190,
  bezahlterBetrag: 0,
  rechnungsdatum: '2026-06-01',
  faelligkeitsdatum: '2026-06-15',
  tageUeberfaellig: 30,
  status: 'ueberfaellig',
  mahnstufe: 1,
  kundenEmail: 'kasse@tc-musterstadt.de',
  kundenstrasse: 'Musterweg 1',
  kundenPlzOrt: '97218 Gerbrunn',
  aktivitaeten: [],
  zahlungen: [],
} as unknown as DebitorView;

beforeEach(() => {
  vi.clearAllMocks();
  // Nummernvergabe + Kollisionsprüfung laufen beide über listDocuments
  listDocuments.mockResolvedValue({ documents: [] });
  createFile.mockResolvedValue({ $id: 'datei1' });
  createDocument.mockResolvedValue({ $id: 'dok1', dateiname: '1. Mahnung TC Musterstadt MA-2026-001.pdf' });
  sendeEmailMitPdf.mockResolvedValue({ success: true });
});

describe('bereiteMahnungVersandVor', () => {
  it('persistiert nichts — das bloße Öffnen des Dialogs bleibt folgenlos', async () => {
    await bereiteMahnungVersandVor(debitor, 'mahnung_1');

    expect(createFile).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
    expect(markiereMahnungVersendet).not.toHaveBeenCalled();
    expect(logAktion).not.toHaveBeenCalled();
  });

  it('liefert Betreff, HTML-Text, Signatur, PDF und Empfängervorschlag', async () => {
    const vorb = await bereiteMahnungVersandVor(debitor, 'mahnung_1');

    expect(vorb.betreff).toBeTruthy();
    expect(vorb.htmlBody).toBeTruthy();
    expect(vorb.signatur).toBe('<p>Signatur</p>');
    expect(vorb.pdf).toBeTruthy();
    expect(vorb.empfaenger).toBe('kasse@tc-musterstadt.de');
    expect(vorb.dateiname).toContain('1. Mahnung');
  });

  it('nimmt eine vorgegebene Anschrift statt der Debitor-Adresse', async () => {
    const vorb = await bereiteMahnungVersandVor(debitor, 'mahnung_1', undefined, undefined, {
      strasse: 'Andere Straße 9',
      plzOrt: '97070 Würzburg',
    });

    expect(vorb.daten.kundenstrasse).toBe('Andere Straße 9');
    expect(vorb.daten.kundenPlzOrt).toBe('97070 Würzburg');
  });
});

describe('sendeVorbereiteteMahnung', () => {
  const senden = async (overrides: Record<string, unknown> = {}) => {
    const vorb = await bereiteMahnungVersandVor(debitor, 'mahnung_1');
    return sendeVorbereiteteMahnung({
      debitor,
      dokumentTyp: 'mahnung_1',
      daten: vorb.daten,
      pdf: vorb.pdf,
      betreff: vorb.betreff,
      htmlBody: vorb.htmlBody,
      empfaenger: 'kasse@tc-musterstadt.de',
      testModus: false,
      ...overrides,
    });
  };

  it('erhöht die Mahnstufe im Testmodus NICHT', async () => {
    const res = await senden({ testModus: true });

    expect(res.success).toBe(true);
    expect(markiereMahnungVersendet).not.toHaveBeenCalled();
  });

  it('protokolliert auch Testversände (kein skipProtokoll)', async () => {
    await senden({ testModus: true });

    const params = sendeEmailMitPdf.mock.calls[0][0];
    expect(params.skipProtokoll).toBeUndefined();
    expect(params.dokumentTyp).toBe('mahnwesen');
    expect(params.betreff).toMatch(/^\[TEST\] /);
  });

  it('schreibt bei echtem Versand Mahnstufe, Zeitstempel und Audit-Eintrag', async () => {
    const res = await senden();

    expect(res.success).toBe(true);
    expect(markiereMahnungVersendet).toHaveBeenCalledTimes(1);
    // mahnung_1 → Stufe 2
    expect(markiereMahnungVersendet.mock.calls[0][1]).toBe(2);
    expect(logAktion).toHaveBeenCalled();
  });

  it('schreibt auch bei einer Wiederholmahnung derselben Stufe fort — ohne zurückzustufen', async () => {
    const hoeherGestuft = { ...debitor, mahnstufe: 3 } as DebitorView;
    const vorb = await bereiteMahnungVersandVor(hoeherGestuft, 'mahnung_1');

    await sendeVorbereiteteMahnung({
      debitor: hoeherGestuft,
      dokumentTyp: 'mahnung_1',
      daten: vorb.daten,
      pdf: vorb.pdf,
      betreff: vorb.betreff,
      htmlBody: vorb.htmlBody,
      empfaenger: 'kasse@tc-musterstadt.de',
      testModus: false,
    });

    expect(markiereMahnungVersendet).toHaveBeenCalledTimes(1);
    // Stufe 3 bleibt, statt auf 2 zurückzufallen
    expect(markiereMahnungVersendet.mock.calls[0][1]).toBe(3);
  });

  it('blockt einen zweiten echten Versand am selben Tag', async () => {
    const heuteGemahnt = { ...debitor, letzteMahnungAm: new Date().toISOString() } as DebitorView;
    const vorb = await bereiteMahnungVersandVor(heuteGemahnt, 'mahnung_1');

    const res = await sendeVorbereiteteMahnung({
      debitor: heuteGemahnt,
      dokumentTyp: 'mahnung_1',
      daten: vorb.daten,
      pdf: vorb.pdf,
      betreff: vorb.betreff,
      htmlBody: vorb.htmlBody,
      empfaenger: 'kasse@tc-musterstadt.de',
      testModus: false,
    });

    expect(res.success).toBe(false);
    expect(res.fehler).toContain('bereits eine Mahnung versendet');
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('meldet einen fehlgeschlagenen Versand ehrlich und sagt, dass das PDF schon archiviert ist', async () => {
    sendeEmailMitPdf.mockResolvedValue({ success: false, error: 'SMTP nicht erreichbar' });

    const res = await senden();

    expect(res.success).toBe(false);
    expect(res.fehler).toContain('SMTP nicht erreichbar');
    expect(res.fehler).toContain('bereits archiviert');
    expect(markiereMahnungVersendet).not.toHaveBeenCalled();
  });

  it('archiviert genau das PDF, das auch angehängt wird', async () => {
    await senden();

    // Ein Upload, ein DB-Eintrag, ein Anhang — kein zweites Rendern
    expect(createFile).toHaveBeenCalledTimes(1);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(sendeEmailMitPdf.mock.calls[0][0].pdfDateiname).toBe(
      '1. Mahnung TC Musterstadt MA-2026-001.pdf'
    );
  });

  it('lehnt einen Versand ohne Empfänger ab', async () => {
    const res = await senden({ empfaenger: '  ' });

    expect(res.success).toBe(false);
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
  });
});

/**
 * Der Massenversand ging vor dem Umbau einen eigenen Weg. Jetzt ist er ein Wrapper
 * über dieselben zwei Bausteine — diese Tests halten fest, dass sein Vertrag
 * (wirft nie, kennt die Empfängerregel, blockt Doppelversand) unverändert gilt.
 */
describe('sendeMahnungPerEmail (Massenversand)', () => {
  it('sendet an die Rechnungs-/Kunden-E-Mail und schreibt die Mahnstufe fort', async () => {
    const res = await sendeMahnungPerEmail({ debitor, dokumentTyp: 'mahnung_1', testModus: false });

    expect(res.success).toBe(true);
    expect(res.empfaenger).toBe('kasse@tc-musterstadt.de');
    expect(sendeEmailMitPdf.mock.calls[0][0].dokumentTyp).toBe('mahnwesen');
    expect(markiereMahnungVersendet).toHaveBeenCalledTimes(1);
  });

  it('bricht ohne hinterlegte E-Mail ab, statt zu werfen', async () => {
    const ohneMail = { ...debitor, kundenEmail: undefined, rechnungsEmail: undefined } as DebitorView;

    const res = await sendeMahnungPerEmail({ debitor: ohneMail, dokumentTyp: 'mahnung_1', testModus: false });

    expect(res.success).toBe(false);
    expect(res.fehler).toContain('Keine E-Mail-Adresse');
    expect(sendeEmailMitPdf).not.toHaveBeenCalled();
  });

  it('weicht im Testmodus auf die Testadresse aus, wenn keine Kunden-Mail existiert', async () => {
    const ohneMail = { ...debitor, kundenEmail: undefined, rechnungsEmail: undefined } as DebitorView;

    const res = await sendeMahnungPerEmail({ debitor: ohneMail, dokumentTyp: 'mahnung_1', testModus: true });

    expect(res.success).toBe(true);
    expect(res.empfaenger).toBe('jtatwcook@gmail.com');
    expect(markiereMahnungVersendet).not.toHaveBeenCalled();
  });

  it('respektiert einen explizit gewählten Empfänger (Platzbauer-Fall)', async () => {
    const res = await sendeMahnungPerEmail({
      debitor,
      dokumentTyp: 'mahnung_1',
      testModus: false,
      empfaengerOverride: 'buchhaltung@platzbauer.de',
    });

    expect(res.empfaenger).toBe('buchhaltung@platzbauer.de');
    expect(sendeEmailMitPdf.mock.calls[0][0].empfaenger).toBe('buchhaltung@platzbauer.de');
  });

  it('rendert und archiviert auch im Bulk nur EIN PDF je Mahnung', async () => {
    await sendeMahnungPerEmail({ debitor, dokumentTyp: 'mahnung_1', testModus: false });

    expect(createFile).toHaveBeenCalledTimes(1);
    expect(createDocument).toHaveBeenCalledTimes(1);
  });
});
