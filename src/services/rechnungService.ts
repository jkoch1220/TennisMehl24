import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RechnungsDaten, DokumentBerechnung, Position } from '../types/bestellabwicklung';

// Gemeinsame Berechnungsfunktion
export const berechneDokumentSummen = (positionen: Position[]): DokumentBerechnung => {
  const nettobetrag = positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
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

// Legacy-Support
export const berechneRechnungsSummen = berechneDokumentSummen;

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
  doc.text('Tennisplatzbau', logoBoxX + logoBoxWidth / 2, logoBoxY + 30, { align: 'center' });
  doc.text('Ziegelsplittprodukte', logoBoxX + logoBoxWidth / 2, logoBoxY + 34, { align: 'center' });

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
  
  // === Empfängeradresse (Rechnungsadresse) - Links ===
  yPos = 55;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  
  // Kundennummer und Projektnummer
  if (daten.kundennummer || daten.projektnummer) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    let infoText = '';
    if (daten.kundennummer) infoText += `Kundennr.: ${daten.kundennummer}`;
    if (daten.projektnummer) {
      if (infoText) infoText += '  |  ';
      infoText += `Projektnr.: ${daten.projektnummer}`;
    }
    doc.text(infoText, 20, yPos);
    yPos += 5;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.text(daten.kundenname, 20, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(daten.kundenstrasse, 20, yPos);
  yPos += 5;
  doc.text(daten.kundenPlzOrt, 20, yPos);
  
  // Ansprechpartner
  if (daten.ansprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Ihr Ansprechpartner: ${daten.ansprechpartner}`, 20, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }
  
  // === Lieferadresse (falls abweichend) - Rechts ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    let lieferYPos = 55;
    const lieferX = 120;
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', lieferX, lieferYPos);
    lieferYPos += 5;
    
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, lieferX, lieferYPos);
    doc.setFont('helvetica', 'normal');
    lieferYPos += 6;
    doc.text(daten.lieferadresseStrasse || '', lieferX, lieferYPos);
    lieferYPos += 5;
    doc.text(daten.lieferadressePlzOrt || '', lieferX, lieferYPos);
  }
  
  // === Betreff ===
  yPos += 20;
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rechnung ${daten.rechnungsnummer}`, 15, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Rechnungsinformationen unter Betreff ===
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  
  yPos += 5;
  doc.text(`Rechnungsdatum: ${formatDatum(daten.rechnungsdatum)}`, 15, yPos);
  
  if (daten.leistungsdatum) {
    yPos += 5;
    doc.text(`Leistungsdatum: ${formatDatum(daten.leistungsdatum)}`, 15, yPos);
  }
  
  // === Positionen Tabelle ===
  yPos += 10;
  
  const tableData = daten.positionen.map(pos => [
    pos.artikelnummer || '',
    pos.bezeichnung,
    pos.menge.toString(),
    pos.einheit,
    formatWaehrung(pos.einzelpreis),
    formatWaehrung(pos.gesamtpreis)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Artikel-Nr.', 'Leistungsbeschreibung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 25, halign: 'left' },
      1: { cellWidth: 75, halign: 'left' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 27, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const berechnung = berechneRechnungsSummen(daten.positionen);
  
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
  
  doc.text(`Zahlungsziel: ${daten.zahlungsziel}`, 20, summenY);
  
  // Skonto nur anzeigen wenn aktiviert
  if (daten.skontoAktiviert && daten.skonto) {
    summenY += 5;
    const skontoBetrag = berechnung.bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      20,
      summenY
    );
  }
  
  // === Zahlungshinweis ===
  summenY += 10;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const hinweisText = 'Verwenden Sie für die Zahlung bitte die angegebene Rechnungs- und Kundennummer, damit wir Ihre Zahlung zuordnen können.';
  const hinweisLines = doc.splitTextToSize(hinweisText, 170);
  doc.text(hinweisLines, 20, summenY);
  
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
  const footerY = pageHeight - 20;
  
  // Trennlinie über Footer
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(20, footerY - 6, 195, footerY - 6);
  
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  
  // Spalte 1: Verwaltung
  let col1X = 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Verwaltung:', col1X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('TENNISMEHL GmbH', col1X, footerY + 4);
  doc.text('Wertheimer Str. 13', col1X, footerY + 8);
  doc.text('97959 Großrinderfeld', col1X, footerY + 12);
  
  // Spalte 2: Geschäftsführer
  let col2X = 40;
  doc.setFont('helvetica', 'bold');
  doc.text('Geschäftsführer:', col2X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('Stefan Egner', col2X, footerY + 4);
  doc.text('Sitz d. Gesellschaft:', col2X, footerY + 8);
  doc.text('Großrinderfeld', col2X, footerY + 12);
  
  // Spalte 3: Registergericht
  let col3X = 70;
  doc.setFont('helvetica', 'bold');
  doc.text('Registergericht:', col3X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('Würzburg HRB 731653', col3X, footerY + 4);
  doc.text('USt-ID:', col3X, footerY + 8);
  doc.text('DE 320 029 255', col3X, footerY + 12);
  
  // Spalte 4: Werk/Verkauf
  let col4X = 100;
  doc.setFont('helvetica', 'bold');
  doc.text('Werk/Verkauf:', col4X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('TENNISMEHL GmbH', col4X, footerY + 4);
  doc.text('Wertheimer Str. 3a', col4X, footerY + 8);
  doc.text('97828 Marktheidenfeld', col4X, footerY + 12);

  // Telefon
  let col5X = 130;
  doc.setFont('helvetica', 'bold');
  doc.text('Telefon 09391 9870-0', col5X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('Telefax 09391 9870-26', col5X, footerY + 4);
  doc.text('info@tennismehl.com', col5X, footerY + 8);
  doc.text('www.tennismehl.com', col5X, footerY + 12);
  
  // Bankverbindung
  let col6X = 160;
  doc.setFont('helvetica', 'bold');
  doc.text('Bankverbindung:', col6X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text('Sparkasse Tauberfranken', col6X, footerY + 4);
  doc.text('IBAN: DE49 6735 0130 0000254019', col6X, footerY + 8);
  doc.text('BIC: SOLADES1TBB', col6X, footerY + 12);
  
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
