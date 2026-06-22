/**
 * Rechnungs-Versand-Service (halbautomatisch)
 *
 * Versendet gespeicherte Rechnungen per E-Mail an die hinterlegte Rechnungs-/
 * Kunden-Adresse — einzeln oder im Bulk, mit Testmodus.
 * Wiederverwendung: gespeicherte Rechnungs-PDFs (bestellabwicklung_dokumente),
 * sendeEmailMitPdf, generiereStandardEmail. Versand-Tracking über email_protokoll
 * (kein zusätzliches Projekt-Feld → keine 10.000-Zeichen-/Schema-Falle).
 */

import { Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
} from '../config/appwrite';
import { projektService } from './projektService';
import { ladeDokumentNachTyp, ladeDokumentDaten } from './projektabwicklungDokumentService';
import {
  sendeEmailMitPdf,
  wrapInEmailTemplate,
  blobZuBase64,
} from './emailSendService';
import { berechneRechnungsSummen } from './rechnungService';
import { generiereStandardEmail } from '../utils/emailHelpers';
import { TEST_EMAIL_ADDRESS } from '../types/email';
import { GespeichertesDokument, RechnungsDaten } from '../types/projektabwicklung';
import { Projekt } from '../types/projekt';

const EMAIL_PROTOKOLL_COLLECTION_ID = 'email_protokoll';
const RECHNUNG_ABSENDER = 'info@tennismehl.com';

/** Empfänger-Regel: rechnungsEmail zuerst, sonst kundenEmail */
export const bestimmeRechnungEmpfaenger = (projekt: Projekt): string | undefined =>
  projekt.rechnungsEmail?.trim() || projekt.kundenEmail?.trim() || undefined;

/** Projekt-IDs, für die bereits eine Rechnung erfolgreich per E-Mail versendet wurde */
const ladeVersendeteProjektIds = async (): Promise<Set<string>> => {
  const versendet = new Set<string>();
  try {
    const response = await databases.listDocuments(DATABASE_ID, EMAIL_PROTOKOLL_COLLECTION_ID, [
      Query.equal('dokumentTyp', 'rechnung'),
      Query.equal('status', 'gesendet'),
      Query.orderDesc('gesendetAm'),
      Query.limit(1000),
    ]);
    for (const doc of response.documents as unknown as { projektId: string }[]) {
      if (doc.projektId) versendet.add(doc.projektId);
    }
  } catch (error) {
    console.warn('Versand-Protokoll konnte nicht geladen werden:', error);
  }
  return versendet;
};

/** Lädt die gespeicherte aktive Rechnung als Blob (für Anhang/Vorschau) */
const ladeRechnungPdfBlob = async (dateiId: string): Promise<Blob> => {
  const url = storage.getFileDownload(BESTELLABWICKLUNG_DATEIEN_BUCKET_ID, dateiId);
  const response = await fetch(url.toString(), { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`PDF-Download fehlgeschlagen (HTTP ${response.status})`);
  }
  return response.blob();
};

/** Betrag einer Rechnung ermitteln (Bruttobetrag aus Dokument, sonst aus Positionen berechnen) */
const ermittleRechnungsbetrag = (dok: GespeichertesDokument): number => {
  if (typeof dok.bruttobetrag === 'number') return dok.bruttobetrag;
  const daten = ladeDokumentDaten<RechnungsDaten>(dok);
  if (daten?.positionen) {
    return berechneRechnungsSummen(
      daten.positionen,
      daten.ohneMehrwertsteuer,
      daten.mehrwertsteuersatz
    ).bruttobetrag;
  }
  return 0;
};

export interface RechnungVersandItem {
  projektId: string;
  kundenname: string;
  kundennummer?: string;
  rechnungsnummer: string;
  betrag: number;
  empfaenger?: string;
  bereitsVersendet: boolean;
  hatAktiveRechnung: boolean;
}

/**
 * Liste aller Projekte im Status 'rechnung' mit Versand-Status.
 * Lädt je Projekt das aktive Rechnungsdokument (für Nummer/Betrag).
 */
export const ladeRechnungsVersandListe = async (
  saisonjahr?: number
): Promise<RechnungVersandItem[]> => {
  const [projekte, versendet] = await Promise.all([
    projektService.loadProjekte({ status: ['rechnung'], saisonjahr }),
    ladeVersendeteProjektIds(),
  ]);

  const items = await Promise.all(
    projekte.map(async (projekt): Promise<RechnungVersandItem> => {
      const projektId = projekt.$id || projekt.id;
      let rechnungsnummer = projekt.rechnungsnummer || '';
      let betrag = 0;
      let hatAktiveRechnung = false;

      try {
        const dok = await ladeDokumentNachTyp(projektId, 'rechnung');
        if (dok && dok.rechnungsStatus !== 'storniert') {
          hatAktiveRechnung = true;
          rechnungsnummer = dok.dokumentNummer || rechnungsnummer;
          betrag = ermittleRechnungsbetrag(dok);
        }
      } catch (error) {
        console.warn(`Rechnungsdokument für ${projektId} nicht ladbar:`, error);
      }

      return {
        projektId,
        kundenname: projekt.kundenname,
        kundennummer: projekt.kundennummer,
        rechnungsnummer,
        betrag,
        empfaenger: bestimmeRechnungEmpfaenger(projekt),
        bereitsVersendet: versendet.has(projektId),
        hatAktiveRechnung,
      };
    })
  );

  // Noch nicht versendete zuerst, dann alphabetisch.
  return items.sort((a, b) => {
    if (a.bereitsVersendet !== b.bereitsVersendet) return a.bereitsVersendet ? 1 : -1;
    return a.kundenname.localeCompare(b.kundenname, 'de');
  });
};

/** Baut Betreff + HTML-Body einer Rechnungs-E-Mail aus den Beleg-Templates */
const baueRechnungEmail = async (
  dokumentNummer: string,
  kundenname: string,
  kundennummer?: string
): Promise<{ betreff: string; html: string }> => {
  const standard = await generiereStandardEmail('rechnung', dokumentNummer, kundenname, kundennummer);
  const html = wrapInEmailTemplate(standard.html || standard.text, standard.signatur);
  return { betreff: standard.betreff, html };
};

export interface RechnungEmailVorschau {
  betreff: string;
  html: string;
  empfaenger?: string;
  pdfBlob: Blob;
  dokumentNummer: string;
}

/** Vorschau einer Rechnungs-E-Mail (Betreff, HTML, PDF-Blob). Persistiert nichts. */
export const erstelleRechnungEmailVorschau = async (
  projektId: string
): Promise<RechnungEmailVorschau> => {
  const projekt = await projektService.getProjekt(projektId);
  if (!projekt) throw new Error('Projekt nicht gefunden');

  const dok = await ladeDokumentNachTyp(projektId, 'rechnung');
  if (!dok || dok.rechnungsStatus === 'storniert') {
    throw new Error('Keine aktive Rechnung vorhanden');
  }

  const { betreff, html } = await baueRechnungEmail(dok.dokumentNummer, projekt.kundenname, projekt.kundennummer);
  const pdfBlob = await ladeRechnungPdfBlob(dok.dateiId);

  return {
    betreff,
    html,
    empfaenger: bestimmeRechnungEmpfaenger(projekt),
    pdfBlob,
    dokumentNummer: dok.dokumentNummer,
  };
};

export interface SendeRechnungParams {
  projektId: string;
  testModus: boolean;
  testEmpfaenger?: string;
}

export interface SendeRechnungErgebnis {
  success: boolean;
  empfaenger: string;
  dokumentNummer?: string;
  fehler?: string;
}

/**
 * Versendet eine gespeicherte Rechnung per E-Mail.
 * Testmodus: an Testadresse, [TEST]-Präfix, kein Protokoll, kein Status-Update.
 * Wirft NICHT — Fehler werden zurückgegeben (Bulk-tauglich).
 */
export const sendeRechnungPerEmail = async (
  params: SendeRechnungParams
): Promise<SendeRechnungErgebnis> => {
  const { projektId, testModus } = params;
  const testEmpfaenger = params.testEmpfaenger || TEST_EMAIL_ADDRESS;

  try {
    const projekt = await projektService.getProjekt(projektId);
    if (!projekt) return { success: false, empfaenger: '', fehler: 'Projekt nicht gefunden' };

    const kundenEmpfaenger = bestimmeRechnungEmpfaenger(projekt);
    if (!testModus && !kundenEmpfaenger) {
      return { success: false, empfaenger: '', fehler: 'Keine E-Mail-Adresse hinterlegt' };
    }
    const empfaenger = testModus ? (kundenEmpfaenger || testEmpfaenger) : (kundenEmpfaenger as string);

    const dok = await ladeDokumentNachTyp(projektId, 'rechnung');
    if (!dok || dok.rechnungsStatus === 'storniert') {
      return { success: false, empfaenger, fehler: 'Keine aktive Rechnung vorhanden' };
    }

    const pdfBlob = await ladeRechnungPdfBlob(dok.dateiId);
    const pdfBase64 = await blobZuBase64(pdfBlob);
    const { betreff, html } = await baueRechnungEmail(dok.dokumentNummer, projekt.kundenname, projekt.kundennummer);
    const finalBetreff = testModus ? `[TEST] ${betreff}` : betreff;

    const result = await sendeEmailMitPdf({
      empfaenger,
      absender: RECHNUNG_ABSENDER,
      betreff: finalBetreff,
      htmlBody: html,
      pdfBase64,
      pdfDateiname: dok.dateiname || `${dok.dokumentNummer}.pdf`,
      projektId,
      dokumentTyp: 'rechnung',
      dokumentNummer: dok.dokumentNummer,
      testModus,
      skipProtokoll: testModus,
    });

    if (!result.success) {
      return {
        success: false,
        empfaenger,
        dokumentNummer: dok.dokumentNummer,
        fehler: result.error || 'Unbekannter Fehler beim Versand',
      };
    }

    return { success: true, empfaenger, dokumentNummer: dok.dokumentNummer };
  } catch (error) {
    console.error('Fehler beim Rechnungs-Versand:', error);
    return {
      success: false,
      empfaenger: '',
      fehler: error instanceof Error ? error.message : 'Unbekannter Fehler beim Versand',
    };
  }
};
