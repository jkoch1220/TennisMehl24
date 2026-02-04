/**
 * Mahnwesen Service
 *
 * Generiert PDFs für Zahlungserinnerungen und Mahnungen,
 * speichert diese in Appwrite und verwaltet Dokumentnummern.
 */

import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { ID, Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
  COLLECTIONS
} from '../config/appwrite';
import {
  MahnwesenDokumentDaten,
  MahnwesenDokumentTyp,
  GespeichertesMahnwesenDokument,
  MahnwesenTextVorlagen,
  STANDARD_MAHNWESEN_VORLAGEN
} from '../types/mahnwesen';
import { DebitorView } from '../types/debitor';
import { getStammdatenOderDefault } from './stammdatenService';
import { Stammdaten } from '../types/stammdaten';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  ensureSpace,
  addWrappedText,
  formatStrasseHausnummer
} from './pdfHelpers';

// Farben
const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

// Hilfsfunktionen
const formatWaehrung = (betrag: number): string => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag);
};

const formatDatum = (datum: string): string => {
  return new Date(datum).toLocaleDateString('de-DE');
};

/**
 * Generiert einen EPC-QR-Code String nach dem GiroCode Standard
 * für SEPA-Überweisungen (identisch wie auf Rechnungen)
 */
const generiereEPCString = (
  empfaengerName: string,
  iban: string,
  bic: string,
  betrag: number,
  verwendungszweck: string
): string => {
  // IBAN ohne Leerzeichen
  const ibanOhneLeerzeichen = iban.replace(/\s/g, '');

  // Betrag auf 2 Dezimalstellen formatiert
  const betragFormatiert = betrag.toFixed(2);

  // Verwendungszweck auf 140 Zeichen begrenzen
  const verwendungszweckGekuerzt = verwendungszweck.substring(0, 140);

  // EPC-QR-Code String aufbauen (GiroCode Format)
  const epcLines = [
    'BCD',                    // Service Tag
    '002',                    // Version
    '1',                      // Character Set (1 = UTF-8)
    'SCT',                    // Identification (SEPA Credit Transfer)
    bic,                      // BIC
    empfaengerName,           // Empfängername (max 70 Zeichen)
    ibanOhneLeerzeichen,      // IBAN
    `EUR${betragFormatiert}`, // Währung und Betrag
    '',                       // Purpose (optional)
    '',                       // Structured Reference (optional)
    verwendungszweckGekuerzt, // Unstructured Remittance Information
    ''                        // Beneficiary to Originator Information (optional)
  ];

  return epcLines.join('\n');
};

// =====================================================
// DOKUMENTNUMMER-VERWALTUNG
// =====================================================

/**
 * Generiert die nächste Dokumentnummer für Zahlungserinnerung oder Mahnung
 * Format: ZE-YYYY-NNN (Zahlungserinnerung) oder MA-YYYY-NNN (Mahnung)
 */
export const generiereNaechsteDokumentNummer = async (
  dokumentTyp: MahnwesenDokumentTyp
): Promise<string> => {
  const jahr = new Date().getFullYear();
  const prefix = dokumentTyp === 'zahlungserinnerung' ? 'ZE' : 'MA';

  try {
    // Zähle bestehende Dokumente dieses Typs in diesem Jahr
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.MAHNWESEN_DOKUMENTE,
      [
        Query.startsWith('dokumentNummer', `${prefix}-${jahr}`),
        Query.orderDesc('$createdAt'),
        Query.limit(1)
      ]
    );

    let laufendeNummer = 1;
    if (response.documents.length > 0) {
      const letzteDokumentNummer = (response.documents[0] as unknown as GespeichertesMahnwesenDokument).dokumentNummer;
      const match = letzteDokumentNummer.match(/(\d+)$/);
      if (match) {
        laufendeNummer = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}-${jahr}-${String(laufendeNummer).padStart(3, '0')}`;
  } catch (error) {
    // Falls Collection noch nicht existiert, starte bei 001
    console.warn('Mahnwesen Collection nicht gefunden, starte bei 001:', error);
    return `${prefix}-${jahr}-001`;
  }
};

// =====================================================
// TEXTVORLAGEN
// =====================================================

/**
 * Lädt die konfigurierbaren Textvorlagen aus den Stammdaten
 * Falls keine gespeichert sind, werden die Standardvorlagen zurückgegeben
 */
export const ladeTextVorlagen = async (): Promise<MahnwesenTextVorlagen> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.STAMMDATEN,
      [Query.equal('typ', 'mahnwesen_vorlagen'), Query.limit(1)]
    );

    if (response.documents.length > 0 && response.documents[0].data) {
      const data = response.documents[0].data;
      if (typeof data === 'string') {
        return JSON.parse(data) as MahnwesenTextVorlagen;
      }
    }
  } catch (error) {
    console.warn('Fehler beim Laden der Mahnwesen-Vorlagen, verwende Standard:', error);
  }

  return STANDARD_MAHNWESEN_VORLAGEN;
};

/**
 * Speichert die Textvorlagen in den Stammdaten
 */
export const speichereTextVorlagen = async (vorlagen: MahnwesenTextVorlagen): Promise<void> => {
  try {
    // Prüfe ob bereits ein Eintrag existiert
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.STAMMDATEN,
      [Query.equal('typ', 'mahnwesen_vorlagen'), Query.limit(1)]
    );

    const dokument = {
      typ: 'mahnwesen_vorlagen',
      data: JSON.stringify(vorlagen),
      geaendertAm: new Date().toISOString()
    };

    if (response.documents.length > 0) {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.STAMMDATEN,
        response.documents[0].$id,
        dokument
      );
    } else {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.STAMMDATEN,
        ID.unique(),
        {
          ...dokument,
          erstelltAm: new Date().toISOString()
        }
      );
    }

    console.log('✅ Mahnwesen-Textvorlagen gespeichert');
  } catch (error) {
    console.error('Fehler beim Speichern der Textvorlagen:', error);
    throw error;
  }
};

/**
 * Ersetzt Platzhalter in einem Text mit den tatsächlichen Werten
 */
const ersetzePlatzhalter = (text: string, daten: MahnwesenDokumentDaten): string => {
  return text
    .replace(/{kundenname}/g, daten.kundenname)
    .replace(/{rechnungsnummer}/g, daten.rechnungsnummer)
    .replace(/{rechnungsdatum}/g, formatDatum(daten.rechnungsdatum))
    .replace(/{rechnungsbetrag}/g, formatWaehrung(daten.rechnungsbetrag))
    .replace(/{offenerBetrag}/g, formatWaehrung(daten.offenerBetrag))
    .replace(/{faelligkeitsdatum}/g, formatDatum(daten.faelligkeitsdatum))
    .replace(/{tageUeberfaellig}/g, String(daten.tageUeberfaellig))
    .replace(/{neueZahlungsfrist}/g, formatDatum(daten.neueZahlungsfrist))
    .replace(/{gesamtforderung}/g, formatWaehrung(daten.gesamtforderung || daten.offenerBetrag));
};

// =====================================================
// PDF-GENERIERUNG
// =====================================================

/**
 * Generiert ein Mahnwesen-PDF (Zahlungserinnerung oder Mahnung)
 */
export const generiereMahnwesenPDF = async (
  daten: MahnwesenDokumentDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
  let yPos = 55;
  const infoX = 130;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Dokumentnummer:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.dokumentNummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');

  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Datum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.dokumentDatum), infoX, infoYPos + 4);

  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Rechnungsnummer:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(daten.rechnungsnummer, infoX, infoYPos + 4);

  if (daten.kundennummer) {
    infoYPos += 12;
    doc.setTextColor(100, 100, 100);
    doc.text('Kundennummer:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.kundennummer, infoX, infoYPos + 4);
  }

  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);

  // === EMPFÄNGERADRESSE ===
  const adressfeldBreite = 80;
  yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  yPos = addWrappedText(doc, daten.kundenname, 25, yPos, adressfeldBreite, 5);
  doc.setFont('helvetica', 'normal');
  yPos += 1;
  yPos = addWrappedText(doc, formatStrasseHausnummer(daten.kundenstrasse), 25, yPos, adressfeldBreite, 5);
  doc.text(daten.kundenPlzOrt, 25, yPos);
  yPos += 5;

  if (daten.ansprechpartner) {
    yPos += 1;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.ansprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === BETREFF ===
  yPos = 95;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');

  // Betreff-Farbe basierend auf Dokumenttyp
  if (daten.dokumentTyp === 'mahnung_2') {
    doc.setTextColor(...primaryColor);
  } else if (daten.dokumentTyp === 'mahnung_1') {
    doc.setTextColor(234, 88, 12); // orange-600
  } else {
    doc.setTextColor(0, 0, 0);
  }

  doc.text(daten.betreff, 25, yPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // === RECHNUNGSREFERENZ ===
  yPos += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Rechnung Nr. ${daten.rechnungsnummer} vom ${formatDatum(daten.rechnungsdatum)}`, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // === ANREDE ===
  yPos += 15;
  doc.setFontSize(11);
  doc.text(daten.anrede, 25, yPos);

  // === HAUPTTEXT ===
  yPos += 8;
  const haupttext = ersetzePlatzhalter(daten.haupttext, daten);
  const zeilen = haupttext.split('\n');

  for (const zeile of zeilen) {
    yPos = await ensureSpace(doc, yPos, 6, stammdaten);
    if (zeile.trim()) {
      yPos = addWrappedText(doc, zeile, 25, yPos, 160, 5);
    } else {
      yPos += 5; // Leerzeile
    }
  }

  // === FORDERUNGSÜBERSICHT ===
  yPos = await ensureSpace(doc, yPos, 50, stammdaten);
  yPos += 10;

  // Überschrift
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Forderungsübersicht:', 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 8;

  // Tabelle
  const tabelleX = 25;
  const betragX = 150;

  doc.setFontSize(10);

  // Ursprünglicher Rechnungsbetrag
  doc.text('Ursprünglicher Rechnungsbetrag', tabelleX, yPos);
  doc.text(formatWaehrung(daten.rechnungsbetrag), betragX, yPos, { align: 'right' });
  yPos += 5;

  // Bereits bezahlt (falls Teilzahlung)
  const bereitsGezahlt = daten.rechnungsbetrag - daten.offenerBetrag;
  if (bereitsGezahlt > 0.01) {
    doc.setTextColor(0, 128, 0);
    doc.text('Bereits bezahlt', tabelleX, yPos);
    doc.text(`- ${formatWaehrung(bereitsGezahlt)}`, betragX, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    yPos += 5;
  }

  // Offener Betrag
  doc.text('Offener Rechnungsbetrag', tabelleX, yPos);
  doc.text(formatWaehrung(daten.offenerBetrag), betragX, yPos, { align: 'right' });
  yPos += 5;

  // Mahngebühren (nur bei Mahnungen)
  if (daten.mahngebuehren && daten.mahngebuehren > 0) {
    doc.text('Mahngebühren', tabelleX, yPos);
    doc.text(formatWaehrung(daten.mahngebuehren), betragX, yPos, { align: 'right' });
    yPos += 5;
  }

  // Verzugszinsen (optional)
  if (daten.verzugszinsen && daten.verzugszinsen > 0) {
    doc.text('Verzugszinsen', tabelleX, yPos);
    doc.text(formatWaehrung(daten.verzugszinsen), betragX, yPos, { align: 'right' });
    yPos += 5;
  }

  // Trennlinie
  yPos += 2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(tabelleX, yPos, 170, yPos);
  yPos += 6;

  // Gesamtforderung
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Gesamtforderung', tabelleX, yPos);
  doc.setTextColor(...primaryColor);
  doc.text(formatWaehrung(daten.gesamtforderung || daten.offenerBetrag), betragX, yPos, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  yPos += 10;

  // === ZAHLUNGSFRIST ===
  yPos = await ensureSpace(doc, yPos, 20, stammdaten);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Zahlungsfrist: ${formatDatum(daten.neueZahlungsfrist)}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 10;

  // === SCHLUSSTEXT ===
  yPos = await ensureSpace(doc, yPos, 30, stammdaten);

  const schlusstext = ersetzePlatzhalter(daten.schlusstext, daten);
  const schlusszeilenArray = schlusstext.split('\n');

  for (const zeile of schlusszeilenArray) {
    yPos = await ensureSpace(doc, yPos, 6, stammdaten);
    if (zeile.trim()) {
      yPos = addWrappedText(doc, zeile, 25, yPos, 160, 5);
    } else {
      yPos += 5;
    }
  }

  // === Signatur ===
  yPos += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Ihr Team der Tennismehl', 25, yPos);
  doc.setFont('helvetica', 'normal');

  // === BANKVERBINDUNG MIT EPC-QR-CODE ===
  yPos = await ensureSpace(doc, yPos, 50, stammdaten);
  yPos += 5;

  const bankdatenStartY = yPos;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bankverbindung für Ihre Überweisung:', 25, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  yPos += 5;
  doc.setTextColor(0, 0, 0);
  doc.text(`Bank: ${daten.bankname}`, 25, yPos);
  yPos += 4;
  doc.text(`IBAN: ${daten.iban}`, 25, yPos);
  yPos += 4;
  doc.text(`BIC: ${daten.bic}`, 25, yPos);
  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Verwendungszweck: ${daten.rechnungsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');

  // === EPC-QR-Code (GiroCode) generieren ===
  try {
    const verwendungszweck = `${daten.rechnungsnummer}`;
    const zahlungsbetrag = daten.gesamtforderung || daten.offenerBetrag;

    const epcString = generiereEPCString(
      daten.firmenname,
      daten.iban,
      daten.bic,
      zahlungsbetrag,
      verwendungszweck
    );

    // QR-Code als Data URL generieren
    const qrDataUrl = await QRCode.toDataURL(epcString, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256
    });

    // QR-Code rechts neben den Bankdaten platzieren
    const qrSize = 35;
    const qrX = 145;
    const qrY = bankdatenStartY - 5;

    // GiroCode Überschrift
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('GiroCode', qrX + qrSize / 2, qrY - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    // QR-Code Beschriftung
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Zum Bezahlen', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
    doc.text('im Online Banking', qrX + qrSize / 2, qrY + qrSize + 6, { align: 'center' });
    doc.text('scannen', qrX + qrSize / 2, qrY + qrSize + 9, { align: 'center' });
  } catch (error) {
    console.error('Fehler beim Generieren des QR-Codes:', error);
    // Fortfahren ohne QR-Code, falls ein Fehler auftritt
  }

  // Zahlungshinweis
  yPos += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const hinweisText = 'Scannen Sie den QR-Code mit Ihrer Banking-App für eine schnelle und fehlerfreie Überweisung.';
  const hinweisLines = doc.splitTextToSize(hinweisText, 115);
  doc.text(hinweisLines, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // DIN 5008 Footer
  addDIN5008Footer(doc, stammdaten);

  return doc;
};

// =====================================================
// DOKUMENT ERSTELLEN UND SPEICHERN
// =====================================================

/**
 * Erstellt ein Mahnwesen-Dokument aus einem Debitor
 */
export const erstelleMahnwesenDokumentDaten = async (
  debitor: DebitorView,
  dokumentTyp: MahnwesenDokumentTyp,
  vorlagen?: MahnwesenTextVorlagen
): Promise<MahnwesenDokumentDaten> => {
  const stammdaten = await getStammdatenOderDefault();

  // Lade Vorlagen falls nicht übergeben
  if (!vorlagen) {
    vorlagen = await ladeTextVorlagen();
  }

  // Dokumentnummer generieren
  const dokumentNummer = await generiereNaechsteDokumentNummer(dokumentTyp);

  // Vorlage für den Dokumenttyp auswählen
  const vorlage = vorlagen[dokumentTyp];

  // Neue Zahlungsfrist berechnen
  const heute = new Date();
  const fristTage = 'fristTage' in vorlage ? vorlage.fristTage : 7;
  const neueFrist = new Date(heute);
  neueFrist.setDate(neueFrist.getDate() + fristTage);

  // Mahngebühren ermitteln
  const mahngebuehren = 'mahngebuehren' in vorlage ? vorlage.mahngebuehren : 0;

  // Gesamtforderung berechnen
  const gesamtforderung = debitor.offenerBetrag + (mahngebuehren || 0);

  // Betreff/Texte mit optionalem Inkassohinweis
  let schlusstext = vorlage.schlusstext;
  if (dokumentTyp === 'mahnung_2' && 'inkassoHinweis' in vorlage) {
    schlusstext = vorlage.inkassoHinweis + '\n\n' + schlusstext;
  }

  return {
    dokumentTyp,
    dokumentNummer,
    dokumentDatum: heute.toISOString().split('T')[0],

    projektId: debitor.projektId,
    rechnungsnummer: debitor.rechnungsnummer || '',
    rechnungsdatum: debitor.rechnungsdatum || '',
    rechnungsbetrag: debitor.rechnungsbetrag,
    offenerBetrag: debitor.offenerBetrag,
    faelligkeitsdatum: debitor.faelligkeitsdatum,
    tageUeberfaellig: debitor.tageUeberfaellig,

    kundennummer: debitor.kundennummer,
    kundenname: debitor.kundenname,
    kundenstrasse: '', // Muss aus Projekt/Kunde geladen werden
    kundenPlzOrt: '',
    ansprechpartner: debitor.ansprechpartner,

    firmenname: stammdaten.firmenname,
    firmenstrasse: `${stammdaten.firmenstrasse}`,
    firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
    firmenTelefon: stammdaten.firmenTelefon,
    firmenEmail: stammdaten.firmenEmail,

    bankname: stammdaten.bankname || '',
    iban: stammdaten.iban || '',
    bic: stammdaten.bic || '',

    steuernummer: stammdaten.steuernummer,
    ustIdNr: stammdaten.ustIdNr,

    betreff: vorlage.betreff,
    anrede: vorlage.anrede,
    haupttext: vorlage.haupttext,
    schlusstext: schlusstext,

    neueZahlungsfrist: neueFrist.toISOString().split('T')[0],

    mahngebuehren: mahngebuehren || 0,
    verzugszinsen: 0,
    gesamtforderung
  };
};

/**
 * Speichert ein Mahnwesen-Dokument (generiert PDF und speichert in Appwrite)
 */
export const speichereMahnwesenDokument = async (
  daten: MahnwesenDokumentDaten
): Promise<GespeichertesMahnwesenDokument> => {
  try {
    // PDF generieren
    const pdf = await generiereMahnwesenPDF(daten);
    const blob = pdf.output('blob');

    // Dateiname generieren
    const typLabel = daten.dokumentTyp === 'zahlungserinnerung' ? 'Zahlungserinnerung' :
      daten.dokumentTyp === 'mahnung_1' ? '1. Mahnung' : '2. Mahnung';
    const dateiname = `${typLabel} ${daten.kundenname} ${daten.dokumentNummer}.pdf`
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );

    // Dokument-Eintrag in DB erstellen
    const dokument = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.MAHNWESEN_DOKUMENTE,
      ID.unique(),
      {
        projektId: daten.projektId,
        dokumentTyp: daten.dokumentTyp,
        dokumentNummer: daten.dokumentNummer,
        dateiId: uploadedFile.$id,
        dateiname,
        betrag: daten.gesamtforderung || daten.offenerBetrag,
        daten: JSON.stringify(daten)
      }
    );

    console.log(`✅ ${typLabel} ${daten.dokumentNummer} gespeichert`);

    return dokument as unknown as GespeichertesMahnwesenDokument;
  } catch (error) {
    console.error('Fehler beim Speichern des Mahnwesen-Dokuments:', error);
    throw error;
  }
};

/**
 * Lädt alle Mahnwesen-Dokumente für ein Projekt
 */
export const ladeMahnwesenDokumenteFuerProjekt = async (
  projektId: string
): Promise<GespeichertesMahnwesenDokument[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.MAHNWESEN_DOKUMENTE,
      [
        Query.equal('projektId', projektId),
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]
    );

    return response.documents as unknown as GespeichertesMahnwesenDokument[];
  } catch (error) {
    console.error('Fehler beim Laden der Mahnwesen-Dokumente:', error);
    return [];
  }
};

/**
 * Generiert die Download-URL für ein Mahnwesen-Dokument
 */
export const getMahnwesenDokumentUrl = (dateiId: string): string => {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  return `${endpoint}/storage/buckets/${BESTELLABWICKLUNG_DATEIEN_BUCKET_ID}/files/${dateiId}/view?project=${projectId}`;
};

/**
 * Generiert die Download-URL für ein Mahnwesen-Dokument
 */
export const getMahnwesenDokumentDownloadUrl = (dateiId: string): string => {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  return `${endpoint}/storage/buckets/${BESTELLABWICKLUNG_DATEIEN_BUCKET_ID}/files/${dateiId}/download?project=${projectId}`;
};

/**
 * Regeneriert ein bestehendes Mahnwesen-Dokument (z.B. um QR-Code hinzuzufügen)
 * - Lädt die gespeicherten Daten
 * - Generiert ein neues PDF
 * - Ersetzt die alte Datei
 */
export const regeneriereMahnwesenDokument = async (
  dokumentId: string
): Promise<GespeichertesMahnwesenDokument> => {
  try {
    // 1. Bestehendes Dokument laden
    const dokument = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.MAHNWESEN_DOKUMENTE,
      dokumentId
    ) as unknown as GespeichertesMahnwesenDokument;

    if (!dokument.daten) {
      throw new Error('Keine Dokumentdaten gefunden');
    }

    // 2. Daten parsen
    const daten: MahnwesenDokumentDaten = JSON.parse(dokument.daten);

    // 3. Neues PDF generieren (mit QR-Code)
    const pdf = await generiereMahnwesenPDF(daten);
    const blob = pdf.output('blob');

    // 4. Dateiname generieren
    const typLabel = daten.dokumentTyp === 'zahlungserinnerung' ? 'Zahlungserinnerung' :
      daten.dokumentTyp === 'mahnung_1' ? '1. Mahnung' : '2. Mahnung';
    const dateiname = `${typLabel} ${daten.kundenname} ${daten.dokumentNummer}.pdf`
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 5. Alte Datei löschen (falls vorhanden)
    try {
      await storage.deleteFile(BESTELLABWICKLUNG_DATEIEN_BUCKET_ID, dokument.dateiId);
    } catch (error) {
      console.warn('Alte Datei konnte nicht gelöscht werden:', error);
    }

    // 6. Neue Datei hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );

    // 7. Dokument-Eintrag aktualisieren
    const aktualisiertesDokument = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.MAHNWESEN_DOKUMENTE,
      dokumentId,
      {
        dateiId: uploadedFile.$id,
        dateiname,
      }
    );

    console.log(`✅ ${typLabel} ${daten.dokumentNummer} neu generiert`);

    return aktualisiertesDokument as unknown as GespeichertesMahnwesenDokument;
  } catch (error) {
    console.error('Fehler beim Regenerieren des Mahnwesen-Dokuments:', error);
    throw error;
  }
};
