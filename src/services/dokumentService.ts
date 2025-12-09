import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AngebotsDaten, AuftragsbestaetigungsDaten, LieferscheinDaten } from '../types/bestellabwicklung';
import { Stammdaten } from '../types/stammdaten';
import { getStammdatenOderDefault } from './stammdatenService';

const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

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

// DIN 5008: Gemeinsamer Header mit Absender aus Stammdaten
const addDIN5008Header = (doc: jsPDF, stammdaten: Stammdaten) => {
  // === DIN 5008: FALZMARKEN ===
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.line(3, 87, 8, 87);  // Falzmarke 1 bei 87mm
  doc.line(3, 192, 8, 192); // Falzmarke 2 bei 192mm
  
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
};

// DIN 5008: Absenderzeile für Fensterkuvert
const addAbsenderzeile = (doc: jsPDF, stammdaten: Stammdaten) => {
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`${stammdaten.firmenname} · ${stammdaten.firmenstrasse} · ${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, 25, 45);
};

// DIN 5008: Footer mit Stammdaten
const addDIN5008Footer = (doc: jsPDF, stammdaten: Stammdaten) => {
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
};

// === ANGEBOT ===
export const generiereAngebotPDF = async (daten: AngebotsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // DIN 5008 Header
  addDIN5008Header(doc, stammdaten);
  
  // === DIN 5008: INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
  const infoX = 130;
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Angebotsnummer:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.angebotsnummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');
  
  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Angebotsdatum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.angebotsdatum), infoX, infoYPos + 4);
  
  infoYPos += 10;
  doc.setTextColor(100, 100, 100);
  doc.text('Gültig bis:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.gueltigBis), infoX, infoYPos + 4);
  
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
  
  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);
  
  // === DIN 5008: EMPFÄNGERADRESSE ===
  let yPos = 50;
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
  
  // === Lieferadresse (falls abweichend) ===
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
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Angebot Nr. ${daten.angebotsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);
  
  // === Einleitungstext ===
  yPos += 8;
  doc.setFontSize(10);
  doc.text('vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:', 25, yPos);
  
  // === Positionen Tabelle ===
  yPos += 8;
  
  const tableData = daten.positionen.map(pos => [
    pos.bezeichnung,
    pos.menge.toString(),
    pos.einheit,
    formatWaehrung(pos.einzelpreis),
    formatWaehrung(pos.gesamtpreis)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 25 },
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
      0: { cellWidth: 75 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 22 },
      3: { cellWidth: 27, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 125;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(nettobetrag), 180, summenY, { align: 'right' });
  
  if (frachtUndVerpackung > 0) {
    summenY += 6;
    doc.text('Fracht/Verpackung:', summenX, summenY);
    doc.text(formatWaehrung(frachtUndVerpackung), 180, summenY, { align: 'right' });
  }
  
  summenY += 6;
  doc.text('MwSt. (19%):', summenX, summenY);
  doc.text(formatWaehrung(umsatzsteuer), 180, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 180, summenY);
  
  // Bruttobetrag
  summenY += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Angebotssumme:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 180, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Lieferbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
    summenY += 4;
  }
  if (daten.lieferdatum) {
    doc.text(`Lieferdatum: ${formatDatum(daten.lieferdatum)}`, 25, summenY);
    summenY += 4;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel} Tage`, 25, summenY);
  
  if (daten.skonto) {
    summenY += 4;
    const skontoBetrag = bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      25,
      summenY
    );
  }
  
  if (daten.zahlungsart) {
    summenY += 4;
    doc.text(`Zahlungsart: ${daten.zahlungsart}`, 25, summenY);
  }
  
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
  doc.text('Wir freuen uns auf Ihre Rückmeldung und verbleiben', 25, summenY);
  summenY += 5;
  doc.text('mit freundlichen Grüßen', 25, summenY);
  summenY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');

  addDIN5008Footer(doc, stammdaten);

  return doc;
};

// === AUFTRAGSBESTÄTIGUNG ===
export const generiereAuftragsbestaetigungPDF = async (daten: AuftragsbestaetigungsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // DIN 5008 Header
  addDIN5008Header(doc, stammdaten);
  
  // === DIN 5008: INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
  const infoX = 130;
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('AB-Nummer:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.auftragsbestaetigungsnummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');
  
  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Datum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.auftragsbestaetigungsdatum), infoX, infoYPos + 4);
  
  if (daten.kundennummerExtern) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Ihre Bestellung:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.kundennummerExtern, infoX, infoYPos + 4);
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
  
  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);
  
  // === DIN 5008: EMPFÄNGERADRESSE ===
  let yPos = 50;
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
  
  // === Lieferadresse (falls abweichend) ===
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
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Auftragsbestätigung Nr. ${daten.auftragsbestaetigungsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Anrede & Einleitungstext ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);
  yPos += 8;
  doc.text('vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Bestellung:', 25, yPos);
  
  // === Positionen Tabelle ===
  yPos += 6;
  
  const tableData = daten.positionen.map(pos => [
    pos.bezeichnung,
    pos.menge.toString(),
    pos.einheit,
    formatWaehrung(pos.einzelpreis),
    formatWaehrung(pos.gesamtpreis)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 25 },
    head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamtpreis']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [237, 137, 54], // orange-500
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 22 },
      3: { cellWidth: 27, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 125;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(nettobetrag), 180, summenY, { align: 'right' });
  
  if (frachtUndVerpackung > 0) {
    summenY += 6;
    doc.text('Fracht/Verpackung:', summenX, summenY);
    doc.text(formatWaehrung(frachtUndVerpackung), 180, summenY, { align: 'right' });
  }
  
  summenY += 6;
  doc.text('MwSt. (19%):', summenX, summenY);
  doc.text(formatWaehrung(umsatzsteuer), 180, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 180, summenY);
  
  // Bruttobetrag
  summenY += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Auftragssumme:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 180, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Lieferbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
    summenY += 4;
  }
  if (daten.lieferdatum) {
    doc.text(`Lieferdatum: ${formatDatum(daten.lieferdatum)}`, 25, summenY);
    summenY += 4;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel}`, 25, summenY);
  
  if (daten.skontoAktiviert && daten.skonto) {
    summenY += 4;
    const skontoBetrag = bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      25,
      summenY
    );
  }
  
  if (daten.zahlungsart) {
    summenY += 4;
    doc.text(`Zahlungsart: ${daten.zahlungsart}`, 25, summenY);
  }
  
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
  doc.text('Wir danken für Ihr Vertrauen und freuen uns auf eine erfolgreiche Zusammenarbeit.', 25, summenY);
  summenY += 8;
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');

  addDIN5008Footer(doc, stammdaten);

  return doc;
};

// === LIEFERSCHEIN ===
export const generiereLieferscheinPDF = async (daten: LieferscheinDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // DIN 5008 Header
  addDIN5008Header(doc, stammdaten);
  
  // === DIN 5008: INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
  const infoX = 130;
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Lieferschein-Nr.:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.lieferscheinnummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');
  
  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Lieferdatum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.lieferdatum), infoX, infoYPos + 4);
  
  if (daten.bestellnummer) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Bestellnummer:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.bestellnummer, infoX, infoYPos + 4);
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
  
  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);
  
  // === DIN 5008: EMPFÄNGERADRESSE ===
  let yPos = 50;
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
  
  // === Lieferadresse (falls abweichend) ===
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
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Lieferschein Nr. ${daten.lieferscheinnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Anrede & Einleitungstext ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);
  yPos += 8;
  doc.text('wir liefern Ihnen wie folgt:', 25, yPos);
  
  // === Positionen Tabelle (OHNE PREISE!) ===
  yPos += 6;
  
  const tableData = daten.positionen.map(pos => {
    const row = [
      pos.artikel,
      pos.menge.toString(),
      pos.einheit
    ];
    
    // Optional: Serien-/Chargennummer
    const zusatz = [];
    if (pos.seriennummer) zusatz.push(`SN: ${pos.seriennummer}`);
    if (pos.chargennummer) zusatz.push(`Ch: ${pos.chargennummer}`);
    row.push(zusatz.join(' / '));
    
    return row;
  });
  
  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 25 },
    head: [['Artikel', 'Menge', 'Einheit', 'Serien-/Chargennr.']],
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
      0: { cellWidth: 85 },
      1: { cellWidth: 22, halign: 'right' },
      2: { cellWidth: 25 },
      3: { cellWidth: 37 }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  
  // === Empfangsbestätigung ===
  let signY = finalY + 20;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Empfangsbestätigung:', 25, signY);
  doc.setFont('helvetica', 'normal');
  
  signY += 10;
  doc.setFontSize(9);
  doc.text('Ware erhalten am:', 25, signY);
  doc.line(60, signY, 100, signY); // Linie für Datum
  
  signY += 15;
  doc.text('Unterschrift Empfänger:', 25, signY);
  doc.line(65, signY, 125, signY); // Linie für Unterschrift
  
  // === Bemerkung ===
  if (daten.bemerkung) {
    signY += 15;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 25, signY);
    signY += 5;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    doc.text(bemerkungLines, 25, signY);
  }
  
  // === Grußformel ===
  signY += 12;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Mit freundlichen Grüßen', 25, signY);
  signY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, signY);
  doc.setFont('helvetica', 'normal');

  addDIN5008Footer(doc, stammdaten);

  return doc;
};

export { formatWaehrung, formatDatum };
