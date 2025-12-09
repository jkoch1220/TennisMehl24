import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AngebotsDaten, AuftragsbestaetigungsDaten, LieferscheinDaten, BaseDokument } from '../types/bestellabwicklung';
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

// Gemeinsamer Header für alle Dokumente
const addHeader = (doc: jsPDF, daten: BaseDokument) => {
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
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`${daten.firmenname} · ${daten.firmenstrasse} · ${daten.firmenPlzOrt}`, 20, 20);
  
  // === Kontaktdaten unter Logo ===
  let yPos = logoBoxY + logoBoxHeight + 5;
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Tel: ${daten.firmenTelefon}`, logoBoxX + 2, yPos);
  yPos += 4;
  doc.text(`E-Mail: ${daten.firmenEmail}`, logoBoxX + 2, yPos);
  if (daten.firmenWebsite) {
    yPos += 4;
    doc.text(`Web: ${daten.firmenWebsite}`, logoBoxX + 2, yPos);
  }
};

// Gemeinsamer Footer für alle Dokumente (mit Stammdaten)
const addFooter = (doc: jsPDF, stammdaten: Stammdaten) => {
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
  doc.text(stammdaten.firmenname, col1X, footerY + 4);
  doc.text(stammdaten.firmenstrasse, col1X, footerY + 8);
  doc.text(`${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, col1X, footerY + 12);
  
  // Spalte 2: Geschäftsführer
  let col2X = 40;
  doc.setFont('helvetica', 'bold');
  const gfLabel = stammdaten.geschaeftsfuehrer.length > 1 ? 'Geschäftsführer:' : 'Geschäftsführer:';
  doc.text(gfLabel, col2X, footerY);
  doc.setFont('helvetica', 'normal');
  const geschaeftsfuehrerText = stammdaten.geschaeftsfuehrer.join(', ');
  doc.text(geschaeftsfuehrerText, col2X, footerY + 4);
  doc.text('Sitz d. Gesellschaft:', col2X, footerY + 8);
  doc.text(stammdaten.sitzGesellschaft, col2X, footerY + 12);
  
  // Spalte 3: Registergericht
  let col3X = 70;
  doc.setFont('helvetica', 'bold');
  doc.text('Registergericht:', col3X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.handelsregister, col3X, footerY + 4);
  doc.text('USt-ID:', col3X, footerY + 8);
  doc.text(stammdaten.ustIdNr, col3X, footerY + 12);
  
  // Spalte 4: Werk/Verkauf (falls vorhanden)
  let col4X = 100;
  if (stammdaten.werkName && stammdaten.werkStrasse && stammdaten.werkPlz && stammdaten.werkOrt) {
    doc.setFont('helvetica', 'bold');
    doc.text('Werk/Verkauf:', col4X, footerY);
    doc.setFont('helvetica', 'normal');
    doc.text(stammdaten.werkName, col4X, footerY + 4);
    doc.text(stammdaten.werkStrasse, col4X, footerY + 8);
    doc.text(`${stammdaten.werkPlz} ${stammdaten.werkOrt}`, col4X, footerY + 12);
  }

  // Spalte 5: Kontakt
  let col5X = 130;
  doc.setFont('helvetica', 'bold');
  doc.text(`Telefon ${stammdaten.firmenTelefon}`, col5X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.firmenEmail, col5X, footerY + 4);
  if (stammdaten.firmenWebsite) {
    doc.text(stammdaten.firmenWebsite, col5X, footerY + 8);
  }
  
  // Spalte 6: Bankverbindung
  let col6X = 160;
  doc.setFont('helvetica', 'bold');
  doc.text('Bankverbindung:', col6X, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.bankname, col6X, footerY + 4);
  doc.text(`IBAN: ${stammdaten.iban}`, col6X, footerY + 8);
  doc.text(`BIC: ${stammdaten.bic}`, col6X, footerY + 12);
};

// === ANGEBOT ===
export const generiereAngebotPDF = async (daten: AngebotsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  addHeader(doc, daten);
  
  // === Empfängeradresse ===
  let yPos = 55;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  
  // Kundennummer
  if (daten.kundennummer) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Kundennr.: ${daten.kundennummer}`, 20, yPos);
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
  
  // === Lieferadresse (falls abweichend) ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    yPos += 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', 20, yPos);
    yPos += 4;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
    doc.text(daten.lieferadresseStrasse || '', 20, yPos);
    yPos += 4;
    doc.text(daten.lieferadressePlzOrt || '', 20, yPos);
    doc.setFontSize(11);
  }

  // === Betreff ===
  yPos += 20;
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Angebot', 15, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Angebotsinformationen unter Betreff ===
  yPos += 8;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Angebotsnummer: ${daten.angebotsnummer}`, 15, yPos);
  
  yPos += 5;
  doc.text(`Angebotsdatum: ${formatDatum(daten.angebotsdatum)}`, 15, yPos);
  
  yPos += 5;
  doc.text(`Gültig bis: ${formatDatum(daten.gueltigBis)}`, 15, yPos);
  
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
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 120;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(nettobetrag), 185, summenY, { align: 'right' });
  
  if (frachtUndVerpackung > 0) {
    summenY += 6;
    doc.text('Fracht/Verpackung:', summenX, summenY);
    doc.text(formatWaehrung(frachtUndVerpackung), 185, summenY, { align: 'right' });
  }
  
  summenY += 6;
  doc.text('MwSt. (19%):', summenX, summenY);
  doc.text(formatWaehrung(umsatzsteuer), 185, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 185, summenY);
  
  // Bruttobetrag
  summenY += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Gesamtbetrag:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 185, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Lieferbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 20, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 20, summenY);
    summenY += 4;
  }
  if (daten.lieferdatum) {
    doc.text(`Lieferdatum: ${formatDatum(daten.lieferdatum)}`, 20, summenY);
    summenY += 4;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 20, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel} Tage`, 20, summenY);
  
  if (daten.skonto) {
    summenY += 4;
    const skontoBetrag = bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      20,
      summenY
    );
  }
  
  if (daten.zahlungsart) {
    summenY += 4;
    doc.text(`Zahlungsart: ${daten.zahlungsart}`, 20, summenY);
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

  addFooter(doc, stammdaten);

  return doc;
};

// === AUFTRAGSBESTÄTIGUNG ===
export const generiereAuftragsbestaetigungPDF = async (daten: AuftragsbestaetigungsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  addHeader(doc, daten);
  
  // === Empfängeradresse ===
  let yPos = 55;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  
  // Kundennummer
  if (daten.kundennummer) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Kundennr.: ${daten.kundennummer}`, 20, yPos);
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
  
  // === Lieferadresse (falls abweichend) ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    yPos += 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', 20, yPos);
    yPos += 4;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
    doc.text(daten.lieferadresseStrasse || '', 20, yPos);
    yPos += 4;
    doc.text(daten.lieferadressePlzOrt || '', 20, yPos);
    doc.setFontSize(11);
  }

  // === Betreff ===
  yPos += 20;
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Auftragsbestätigung', 15, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Auftragsbestätigungsinformationen unter Betreff ===
  yPos += 8;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Auftragsbestätigungsnummer: ${daten.auftragsbestaetigungsnummer}`, 15, yPos);
  
  yPos += 5;
  doc.text(`Datum: ${formatDatum(daten.auftragsbestaetigungsdatum)}`, 15, yPos);
  
  if (daten.kundennummerExtern) {
    yPos += 5;
    doc.text(`Ihre Bestellnummer: ${daten.kundennummerExtern}`, 15, yPos);
  }
  
  // === Einleitungstext ===
  yPos += 10;
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die Bestellung wie folgt:', 15, yPos);
  
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
      0: { cellWidth: 80 },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 25 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' }
    }
  });
  
  // === Summen ===
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 120;
  let summenY = finalY + 10;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  // Nettobetrag
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(nettobetrag), 185, summenY, { align: 'right' });
  
  if (frachtUndVerpackung > 0) {
    summenY += 6;
    doc.text('Fracht/Verpackung:', summenX, summenY);
    doc.text(formatWaehrung(frachtUndVerpackung), 185, summenY, { align: 'right' });
  }
  
  summenY += 6;
  doc.text('MwSt. (19%):', summenX, summenY);
  doc.text(formatWaehrung(umsatzsteuer), 185, summenY, { align: 'right' });
  
  // Trennlinie
  summenY += 2;
  doc.setLineWidth(0.5);
  doc.line(summenX, summenY, 185, summenY);
  
  // Bruttobetrag
  summenY += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Auftragssumme:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 185, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // === Lieferbedingungen ===
  summenY += 15;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 20, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 20, summenY);
    summenY += 4;
  }
  if (daten.lieferdatum) {
    doc.text(`Lieferdatum: ${formatDatum(daten.lieferdatum)}`, 20, summenY);
    summenY += 4;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 20, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel}`, 20, summenY);
  
  if (daten.skontoAktiviert && daten.skonto) {
    summenY += 4;
    const skontoBetrag = bruttobetrag * (1 - daten.skonto.prozent / 100);
    doc.text(
      `${daten.skonto.prozent}% Skonto bei Zahlung innerhalb von ${daten.skonto.tage} Tagen: ${formatWaehrung(skontoBetrag)}`,
      20,
      summenY
    );
  }
  
  if (daten.zahlungsart) {
    summenY += 4;
    doc.text(`Zahlungsart: ${daten.zahlungsart}`, 20, summenY);
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
  
  // === Abschlusstext ===
  summenY += 12;
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Wir danken für Ihr Vertrauen und freuen uns auf eine erfolgreiche Zusammenarbeit.', 20, summenY);

  addFooter(doc, stammdaten);

  return doc;
};

// === LIEFERSCHEIN ===
export const generiereLieferscheinPDF = async (daten: LieferscheinDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  addHeader(doc, daten);
  
  // === Empfängeradresse ===
  let yPos = 55;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  
  // Kundennummer
  if (daten.kundennummer) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Kundennr.: ${daten.kundennummer}`, 20, yPos);
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
  
  // === Lieferadresse (falls abweichend) ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    yPos += 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', 20, yPos);
    yPos += 4;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
    doc.text(daten.lieferadresseStrasse || '', 20, yPos);
    yPos += 4;
    doc.text(daten.lieferadressePlzOrt || '', 20, yPos);
    doc.setFontSize(11);
  }

  // === Betreff ===
  yPos += 20;
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferschein', 15, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Lieferscheininformationen unter Betreff ===
  yPos += 8;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Lieferscheinnummer: ${daten.lieferscheinnummer}`, 15, yPos);
  
  yPos += 5;
  doc.text(`Lieferdatum: ${formatDatum(daten.lieferdatum)}`, 15, yPos);
  
  if (daten.bestellnummer) {
    yPos += 5;
    doc.text(`Bestellnummer: ${daten.bestellnummer}`, 15, yPos);
  }
  
  // === Positionen Tabelle (OHNE PREISE!) ===
  yPos += 10;
  
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
      0: { cellWidth: 90 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 30 },
      3: { cellWidth: 45 }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 40;
  
  // === Empfangsbestätigung ===
  let signY = finalY + 30;
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  
  doc.text('Ware erhalten am:', 20, signY);
  doc.line(55, signY, 95, signY); // Linie für Datum
  
  signY += 15;
  doc.text('Unterschrift Empfänger:', 20, signY);
  doc.line(60, signY, 120, signY); // Linie für Unterschrift
  
  // === Bemerkung ===
  if (daten.bemerkung) {
    signY += 15;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 20, signY);
    signY += 5;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 170);
    doc.text(bemerkungLines, 20, signY);
  }

  addFooter(doc, stammdaten);

  return doc;
};

export { formatWaehrung, formatDatum };
