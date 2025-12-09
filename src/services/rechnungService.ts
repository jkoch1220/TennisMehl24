import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RechnungsDaten, RechnungsBerechnung } from '../types/bestellabwicklung';

export const berechneRechnungsSummen = (daten: RechnungsDaten): RechnungsBerechnung => {
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const umsatzsteuersatz = 19; // Standard MwSt.-Satz in Deutschland
  const umsatzsteuer = nettobetrag * (umsatzsteuersatz / 100);
  const bruttobetrag = nettobetrag + umsatzsteuer;
  
  return {
    nettobetrag,
    umsatzsteuer,
    umsatzsteuersatz,
    bruttobetrag
  };
};

export const generiereRechnungPDF = (daten: RechnungsDaten): jsPDF => {
  const doc = new jsPDF();
  
  // Farben
  const primaryColor: [number, number, number] = [220, 38, 38]; // red-600
  
  let yPos = 15;
  
  // === LOGO BOX - Oben rechts ===
  const logoBoxX = 130;
  const logoBoxY = 15;
  const logoBoxWidth = 65;
  const logoBoxHeight = 35;
  
  // Logo Box mit rotem Rand
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.rect(logoBoxX, logoBoxY, logoBoxWidth, logoBoxHeight);
  
  // Firmenname im Logo
  doc.setFontSize(14);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('TennisMehl', logoBoxX + logoBoxWidth / 2, logoBoxY + 10, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('GmbH', logoBoxX + logoBoxWidth / 2, logoBoxY + 15, { align: 'center' });
  
  doc.setFontSize(8);
  doc.text('Tennismehl', logoBoxX + logoBoxWidth / 2, logoBoxY + 21, { align: 'center' });
  doc.text('Tennisplatzzubehör', logoBoxX + logoBoxWidth / 2, logoBoxY + 26, { align: 'center' });
  doc.text('seit 1985', logoBoxX + logoBoxWidth / 2, logoBoxY + 31, { align: 'center' });
  
  // === HEADER Links - Absenderzeile klein ===
  yPos = 20;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`${daten.firmenname} · ${daten.firmenstrasse} · ${daten.firmenPlzOrt}`, 20, yPos);
  
  // === Kontaktdaten unter Logo ===
  yPos = logoBoxY + logoBoxHeight + 5;
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Tel: ${daten.firmenTelefon}`, logoBoxX + 2, yPos);
  yPos += 4;
  doc.text(`E-Mail: ${daten.firmenEmail}`, logoBoxX + 2, yPos);
  if (daten.firmenWebsite) {
    yPos += 4;
    doc.text(`Web: ${daten.firmenWebsite}`, logoBoxX + 2, yPos);
  }
  
  // === Empfängeradresse ===
  yPos = 55;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.kundenname, 20, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(daten.kundenstrasse, 20, yPos);
  yPos += 5;
  doc.text(daten.kundenPlzOrt, 20, yPos);
  
  // === Rechnungsinformationen rechts ===
  let infoY = 68;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Rechnungsnr.:', 130, infoY);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.rechnungsnummer, 165, infoY);
  doc.setFont('helvetica', 'normal');
  
  infoY += 5;
  doc.text('Rechnungsdatum:', 130, infoY);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDatum(daten.rechnungsdatum), 165, infoY);
  doc.setFont('helvetica', 'normal');
  
  if (daten.leistungsdatum) {
    infoY += 5;
    doc.text('Leistungsdatum:', 130, infoY);
    doc.setFont('helvetica', 'bold');
    doc.text(formatDatum(daten.leistungsdatum), 165, infoY);
    doc.setFont('helvetica', 'normal');
  }
  
  // === Betreff ===
  yPos += 20;
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Rechnung', 20, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Positionen Tabelle ===
  yPos += 10;
  
  const tableData = daten.positionen.map(pos => [
    pos.bezeichnung,
    pos.menge.toString(),
    pos.einheit,
    formatWaehrung(pos.einzelpreis),
    formatWaehrung(pos.gesamtpreis)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamtpreis']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 25 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const berechnung = berechneRechnungsSummen(daten);
  
  const summenX = 120;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(berechnung.nettobetrag), 185, summenY, { align: 'right' });
  
  summenY += 6;
  doc.text(`MwSt. (${berechnung.umsatzsteuersatz}%):`, summenX, summenY);
  doc.text(formatWaehrung(berechnung.umsatzsteuer), 185, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 185, summenY);
  
  // Bruttobetrag (fett)
  summenY += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Gesamtbetrag:', summenX, summenY);
  doc.text(formatWaehrung(berechnung.bruttobetrag), 185, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Zahlungsbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  const faelligkeitsdatum = new Date(daten.rechnungsdatum);
  faelligkeitsdatum.setDate(faelligkeitsdatum.getDate() + daten.zahlungsziel);
  
  doc.text(`Zahlungsziel: ${daten.zahlungsziel} Tage (fällig bis ${formatDatum(faelligkeitsdatum.toISOString())})`, 20, summenY);
  
  if (daten.skonto) {
    summenY += 5;
    const skontoBetrag = berechnung.bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      20,
      summenY
    );
  }
  
  // === Bankdaten ===
  summenY += 10;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Bankverbindung:', 20, summenY);
  summenY += 5;
  doc.text(`Bank: ${daten.bankname}`, 20, summenY);
  summenY += 4;
  doc.text(`IBAN: ${daten.iban}`, 20, summenY);
  summenY += 4;
  doc.text(`BIC: ${daten.bic}`, 20, summenY);
  
  // === Steuerdaten ===
  if (daten.steuernummer || daten.ustIdNr) {
    summenY += 8;
    if (daten.steuernummer) {
      doc.text(`Steuernummer: ${daten.steuernummer}`, 20, summenY);
      summenY += 4;
    }
    if (daten.ustIdNr) {
      doc.text(`USt-IdNr.: ${daten.ustIdNr}`, 20, summenY);
    }
  }
  
  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 10;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 20, summenY);
    summenY += 5;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 170);
    doc.text(bemerkungLines, 20, summenY);
  }
  
  // === Footer ===
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `${daten.firmenname} | ${daten.firmenstrasse} | ${daten.firmenPlzOrt}`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
  
  return doc;
};

const formatWaehrung = (betrag: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(betrag);
};

const formatDatum = (datum: string): string => {
  return new Date(datum).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};
