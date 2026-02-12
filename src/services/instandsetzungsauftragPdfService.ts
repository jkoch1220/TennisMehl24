/**
 * PDF-Service für Instandsetzungsaufträge
 *
 * Generiert Sammelaufträge an Platzbauer für "Direkt Platzbauer"-Kunden.
 * Enthält: Verein, Adresse, Anzahl Plätze, Dienst, Termin
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Stammdaten } from '../types/stammdaten';
import { Instandsetzungsauftrag } from '../types/instandsetzungsauftrag';
import { getStammdatenOderDefault } from './stammdatenService';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  addFollowPageHeader,
  formatDatum,
} from './pdfHelpers';

// Farbe für Instandsetzungsaufträge (orange wie Platzbauer-Dokumente)
const primaryColor: [number, number, number] = [237, 137, 54]; // orange-500

// ==================== TYPES ====================

export interface InstandsetzungsauftragPdfDaten {
  auftrag: Instandsetzungsauftrag;

  // Platzbauer-Daten (Empfänger)
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Bemerkung
  bemerkung?: string;
}

// ==================== PDF GENERIERUNG ====================

/**
 * Generiert ein PDF für einen Instandsetzungsauftrag
 */
export const generiereInstandsetzungsauftragPDF = async (
  daten: InstandsetzungsauftragPdfDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  // Stammdaten laden falls nicht übergeben
  const sd = stammdaten || await getStammdatenOderDefault();

  // PDF erstellen (A4)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // === SEITE 1: HEADER ===
  addDIN5008Header(doc, sd);
  addDIN5008Footer(doc, sd);
  addAbsenderzeile(doc, sd);

  // === EMPFÄNGERADRESSE ===
  let yPos = 60;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  // Empfänger
  doc.text(daten.platzbauername, 25, yPos);
  yPos += 5;
  if (daten.platzbauerAnsprechpartner) {
    doc.text(daten.platzbauerAnsprechpartner, 25, yPos);
    yPos += 5;
  }
  doc.text(daten.platzbauerstrasse, 25, yPos);
  yPos += 5;
  doc.text(daten.platzbauerPlzOrt, 25, yPos);

  // === INFO-BLOCK (rechts oben) ===
  const infoX = 140;
  let infoY = 60;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);

  // Auftragsnummer
  doc.text('Instandsetzungsauftrag Nr.', infoX, infoY);
  infoY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(daten.auftrag.auftragsnummer, infoX, infoY);
  infoY += 7;

  // Datum
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Datum', infoX, infoY);
  infoY += 4;
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.auftrag.erstelltAm), infoX, infoY);
  infoY += 7;

  // Saison
  doc.setTextColor(100, 100, 100);
  doc.text('Saison', infoX, infoY);
  infoY += 4;
  doc.setTextColor(0, 0, 0);
  doc.text(daten.auftrag.saisonjahr.toString(), infoX, infoY);

  // === BETREFF ===
  yPos = 105;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Instandsetzungsauftrag', 25, yPos);

  // === ANREDE ===
  yPos += 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);
  yPos += 8;
  doc.text('hiermit beauftragen wir Sie mit der Instandsetzung folgender Tennisanlagen:', 25, yPos);
  yPos += 10;

  // === POSITIONEN-TABELLE ===
  const tableHeaders = ['Pos.', 'Verein', 'Adresse', 'Plätze', 'Dienst', 'Ansprechpartner', 'Termin'];

  const tableData = daten.auftrag.positionen.map((pos, index) => {
    // Volle Lieferadresse mit Straße
    let adresseText = '-';
    if (pos.adresse) {
      const zeilen: string[] = [];
      if (pos.adresse.strasse) {
        zeilen.push(pos.adresse.strasse);
      }
      zeilen.push(`${pos.adresse.plz} ${pos.adresse.ort}`);
      adresseText = zeilen.join('\n');
    }

    const terminText = pos.gewuenschterTermin
      ? formatDatum(pos.gewuenschterTermin)
      : 'Nach Absprache';

    // Ansprechpartner formatieren
    let ansprechpartnerText = '-';
    if (pos.ansprechpartner) {
      ansprechpartnerText = pos.ansprechpartner.name;
      if (pos.ansprechpartner.telefon) {
        ansprechpartnerText += `\nTel: ${pos.ansprechpartner.telefon}`;
      }
    }

    return [
      (index + 1).toString(),
      pos.vereinName,
      adresseText,
      pos.anzahlPlaetze.toString(),
      pos.dienst,
      ansprechpartnerText,
      terminText,
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, top: 45, bottom: 30 },
    head: [tableHeaders],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [50, 50, 50],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' }, // Pos.
      1: { cellWidth: 32 }, // Verein
      2: { cellWidth: 38 }, // Adresse (mit Straße)
      3: { cellWidth: 12, halign: 'center' }, // Plätze
      4: { cellWidth: 28 }, // Dienst
      5: { cellWidth: 32 }, // Ansprechpartner
      6: { cellWidth: 23, halign: 'center' }, // Termin
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didDrawPage: function (data) {
      // Folgeseiten-Header und Footer
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, sd);
        addDIN5008Footer(doc, sd);
      }
    },
  });

  // Position nach Tabelle
  yPos = (doc as any).lastAutoTable?.finalY + 15 || yPos + 50;

  // === ZUSAMMENFASSUNG ===
  const gesamtPlaetze = daten.auftrag.positionen.reduce((sum, p) => sum + p.anzahlPlaetze, 0);
  const anzahlVereine = daten.auftrag.positionen.length;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Gesamt: ${anzahlVereine} Vereine, ${gesamtPlaetze} Plätze`, 25, yPos);
  yPos += 10;

  // === BEMERKUNG ===
  if (daten.bemerkung) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Bemerkung:', 25, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');

    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    doc.text(bemerkungLines, 25, yPos);
    yPos += bemerkungLines.length * 5 + 5;
  }

  // === HINWEIS ===
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const hinweisText = [
    'Bitte bestätigen Sie uns die Auftragsannahme. Die Terminkoordination erfolgt direkt',
    'mit den jeweiligen Vereinen. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.',
  ];
  doc.text(hinweisText, 25, yPos);
  yPos += 15;

  // === GRUSSFORMEL ===
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text('Mit freundlichen Grüßen', 25, yPos);
  yPos += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(sd.firmenname || 'TennisMehl24 GmbH', 25, yPos);

  return doc;
};

/**
 * Generiert PDF und gibt es als Blob zurück
 */
export const generiereInstandsetzungsauftragPDFBlob = async (
  daten: InstandsetzungsauftragPdfDaten,
  stammdaten?: Stammdaten
): Promise<Blob> => {
  const doc = await generiereInstandsetzungsauftragPDF(daten, stammdaten);
  return doc.output('blob');
};

/**
 * Generiert PDF und öffnet Druckvorschau
 */
export const generiereInstandsetzungsauftragPDFPreview = async (
  daten: InstandsetzungsauftragPdfDaten,
  stammdaten?: Stammdaten
): Promise<void> => {
  const doc = await generiereInstandsetzungsauftragPDF(daten, stammdaten);

  // PDF in neuem Tab öffnen
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};

/**
 * Generiert Dateiname für Instandsetzungsauftrag
 */
export const generiereInstandsetzungsauftragDateiname = (
  auftrag: Instandsetzungsauftrag,
  platzbauerName: string
): string => {
  const datum = new Date().toISOString().split('T')[0];
  const saubererName = platzbauerName.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
  return `Instandsetzungsauftrag_${auftrag.auftragsnummer}_${saubererName}_${datum}.pdf`;
};
