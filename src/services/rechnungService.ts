import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RechnungsDaten, DokumentBerechnung, Position } from '../types/bestellabwicklung';
import { Stammdaten } from '../types/stammdaten';
import { getStammdatenOderDefault } from './stammdatenService';

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

/**
 * Generiert eine Rechnung als PDF
 * Optional können Stammdaten übergeben werden, sonst werden diese aus der DB geladen
 */
export const generiereRechnungPDF = async (daten: RechnungsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // Farben
  const primaryColor: [number, number, number] = [220, 38, 38]; // red-600
  
  // === DIN 5008: FALZMARKEN ===
  // Falzmarke 1 bei 87mm (für C6/5)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.line(3, 87, 8, 87);
  // Falzmarke 2 bei 192mm
  doc.line(3, 192, 8, 192);
  
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
  doc.text(stammdaten.firmenname, logoBoxX + logoBoxWidth / 2, logoBoxY + 10, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('GmbH', logoBoxX + logoBoxWidth / 2, logoBoxY + 15, { align: 'center' });
  
  doc.setFontSize(8);
  doc.text('Tennismehl', logoBoxX + logoBoxWidth / 2, logoBoxY + 21, { align: 'center' });
  doc.text('Tennisplatzzubehör', logoBoxX + logoBoxWidth / 2, logoBoxY + 26, { align: 'center' });
  doc.text('Tennisplatzbau', logoBoxX + logoBoxWidth / 2, logoBoxY + 30, { align: 'center' });
  doc.text('Ziegelsplittprodukte', logoBoxX + logoBoxWidth / 2, logoBoxY + 34, { align: 'center' });
  
  // === DIN 5008: INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
  let yPos = 55;
  const infoX = 130;
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Rechnungsnummer:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.rechnungsnummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');
  
  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Rechnungsdatum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.rechnungsdatum), infoX, infoYPos + 4);
  
  if (daten.leistungsdatum) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Leistungsdatum:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDatum(daten.leistungsdatum), infoX, infoYPos + 4);
  }
  
  if (daten.kundennummer) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Kundennummer:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.kundennummer, infoX, infoYPos + 4);
  }
  
  if (daten.projektnummer) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Projektnummer:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.projektnummer, infoX, infoYPos + 4);
  }
  
  if (daten.ihreAnsprechpartner) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Ihr Ansprechpartner:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.ihreAnsprechpartner, infoX, infoYPos + 4);
  }
  
  // === DIN 5008: ABSENDERZEILE (für Fensterkuvert) ===
  yPos = 45;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`${stammdaten.firmenname} · ${stammdaten.firmenstrasse} · ${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, 25, yPos);
  
  // === DIN 5008: EMPFÄNGERADRESSE ===
  yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.kundenname, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(daten.kundenstrasse, 25, yPos);
  yPos += 5;
  doc.text(daten.kundenPlzOrt, 25, yPos);
  
  // Ansprechpartner
  if (daten.ansprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.ansprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }
  
  // === Lieferadresse (falls abweichend) - Rechts neben Empfängeradresse ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    let lieferYPos = 50;
    const lieferX = 120;
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', lieferX, lieferYPos);
    lieferYPos += 5;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, lieferX, lieferYPos);
    doc.setFont('helvetica', 'normal');
    lieferYPos += 5;
    doc.text(daten.lieferadresseStrasse || '', lieferX, lieferYPos);
    lieferYPos += 4;
    doc.text(daten.lieferadressePlzOrt || '', lieferX, lieferYPos);
  }
  
  // === DIN 5008: BETREFF ===
  yPos = 95; // DIN 5008: Betreff beginnt nach Empfängerfeld
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rechnung Nr. ${daten.rechnungsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const anrede = daten.ansprechpartner ? `Sehr geehrte Damen und Herren,` : 'Sehr geehrte Damen und Herren,';
  doc.text(anrede, 25, yPos);
  
  // === Einleitungstext ===
  yPos += 8;
  doc.setFontSize(10);
  doc.text('für die erbrachten Leistungen erlauben wir uns, Ihnen folgende Positionen in Rechnung zu stellen:', 25, yPos);
  
  // === Positionen Tabelle ===
  yPos += 8;
  
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
    margin: { left: 25, right: 25 },
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
      1: { cellWidth: 70, halign: 'left' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const berechnung = berechneRechnungsSummen(daten.positionen);
  
  const summenX = 125;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(berechnung.nettobetrag), 180, summenY, { align: 'right' });
  
  summenY += 6;
  doc.text(`MwSt. (${berechnung.umsatzsteuersatz}%):`, summenX, summenY);
  doc.text(formatWaehrung(berechnung.umsatzsteuer), 180, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 180, summenY);
  
  // Bruttobetrag (fett)
  summenY += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Rechnungsbetrag:', summenX, summenY);
  doc.text(formatWaehrung(berechnung.bruttobetrag), 180, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Zahlungsbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel}`, 25, summenY);
  
  // Skonto nur anzeigen wenn aktiviert
  if (daten.skontoAktiviert && daten.skonto) {
    summenY += 4;
    const skontoBetrag = berechnung.bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      25,
      summenY
    );
  }
  
  // === Bankdaten ===
  summenY += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bankverbindung:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Bank: ${stammdaten.bankname}`, 25, summenY);
  summenY += 4;
  doc.text(`IBAN: ${stammdaten.iban}`, 25, summenY);
  summenY += 4;
  doc.text(`BIC: ${stammdaten.bic}`, 25, summenY);
  
  // === Zahlungshinweis ===
  summenY += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const hinweisText = 'Bitte verwenden Sie für die Zahlung die angegebene Rechnungsnummer als Verwendungszweck, damit wir Ihre Zahlung korrekt zuordnen können.';
  const hinweisLines = doc.splitTextToSize(hinweisText, 160);
  doc.text(hinweisLines, 25, summenY);
  
  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 10;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 25, summenY);
    summenY += 5;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    doc.text(bemerkungLines, 25, summenY);
  }
  
  // === Grußformel ===
  summenY += 12;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');
  
  // === DIN 5008: Footer mit Stammdaten ===
  const pageHeight = doc.internal.pageSize.height;
  const footerY = pageHeight - 20;
  
  // Trennlinie über Footer
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(25, footerY - 6, 185, footerY - 6);
  
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  
  // Spalte 1: Verwaltung
  let col1X = 25;
  doc.setFont('helvetica', 'bold');
  doc.text('Verwaltung:', col1X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.firmenname, col1X, footerY + 4);
  doc.text(stammdaten.firmenstrasse, col1X, footerY + 8);
  doc.text(`${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, col1X, footerY + 12);
  
  // Spalte 2: Geschäftsführer
  let col2X = 55;
  doc.setFont('helvetica', 'bold');
  doc.text('Geschäftsführer:', col2X, footerY);
  doc.setFont('helvetica', 'normal');
  
  // Geschäftsführer untereinander schreiben
  let gfYPos = footerY + 4;
  stammdaten.geschaeftsfuehrer.forEach((gf, index) => {
    doc.text(gf, col2X, gfYPos + (index * 3));
  });
  
  // Sitz d. Gesellschaft dynamisch positionieren
  const gfEndPos = gfYPos + (stammdaten.geschaeftsfuehrer.length * 3);
  doc.text('Sitz: ' + stammdaten.sitzGesellschaft, col2X, gfEndPos + 1);
  
  // Spalte 3: Registergericht & USt-ID
  let col3X = 85;
  doc.setFont('helvetica', 'bold');
  doc.text('Registergericht:', col3X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.handelsregister, col3X, footerY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text('USt-ID:', col3X, footerY + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.ustIdNr, col3X, footerY + 12);
  
  // Spalte 4: Werk/Verkauf (falls vorhanden)
  let col4X = 115;
  if (stammdaten.werkName && stammdaten.werkStrasse && stammdaten.werkPlz && stammdaten.werkOrt) {
    doc.setFont('helvetica', 'bold');
    doc.text('Werk/Verkauf:', col4X, footerY);
    doc.setFont('helvetica', 'normal');
    doc.text(stammdaten.werkName, col4X, footerY + 4);
    doc.text(stammdaten.werkStrasse, col4X, footerY + 8);
    doc.text(`${stammdaten.werkPlz} ${stammdaten.werkOrt}`, col4X, footerY + 12);
  }

  // Spalte 5: Kontakt
  let col5X = 145;
  doc.setFont('helvetica', 'bold');
  doc.text('Kontakt:', col5X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tel: ${stammdaten.firmenTelefon}`, col5X, footerY + 4);
  doc.text(stammdaten.firmenEmail, col5X, footerY + 8);
  if (stammdaten.firmenWebsite) {
    doc.text(stammdaten.firmenWebsite, col5X, footerY + 12);
  }
  
  // Spalte 6: Bankverbindung
  let col6X = 170;
  doc.setFont('helvetica', 'bold');
  doc.text('Bank:', col6X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.bankname, col6X, footerY + 4);
  const ibanFormatted = stammdaten.iban.match(/.{1,4}/g)?.join(' ') || stammdaten.iban;
  doc.text(ibanFormatted, col6X, footerY + 8);
  doc.text(`BIC: ${stammdaten.bic}`, col6X, footerY + 12);
  
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
