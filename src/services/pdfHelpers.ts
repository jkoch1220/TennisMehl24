/**
 * PDF Helper Functions für professionelle, mehrseitige Dokumente
 * 
 * Diese Funktionen stellen sicher, dass PDF-Dokumente mit automatischen
 * Seitenumbrüchen generiert werden, die DIN-Norm-konform sind.
 */

import jsPDF from 'jspdf';
import { Stammdaten } from '../types/stammdaten';

const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

// === KONSTANTEN FÜR SEITENLAYOUT ===
export const PAGE_MARGINS = {
  left: 25,
  right: 25,
  top: 15,
  bottom: 40, // Erhöht, um Platz für Footer zu lassen
};

/**
 * Berechnet die maximale Y-Position für Content auf der aktuellen Seite
 * Berücksichtigt den Footer-Bereich
 */
export const getMaxContentY = (doc: jsPDF): number => {
  const pageHeight = doc.internal.pageSize.height;
  // Footer beginnt 20mm vom unteren Rand, wir lassen 5mm Puffer
  return pageHeight - 25;
};

/**
 * Berechnet die Start-Y-Position für Content auf Folgeseiten
 */
export const getFollowPageStartY = (): number => {
  return 60; // Nach Logo und Falzmarken
};

/**
 * Prüft, ob noch genügend Platz auf der aktuellen Seite ist
 * @param doc - Das jsPDF-Dokument
 * @param currentY - Aktuelle Y-Position
 * @param neededHeight - Benötigte Höhe für den nächsten Content
 * @returns true, wenn genug Platz vorhanden ist
 */
export const hasEnoughSpace = (doc: jsPDF, currentY: number, neededHeight: number): boolean => {
  const maxY = getMaxContentY(doc);
  return (currentY + neededHeight) <= maxY;
};

/**
 * Fügt eine neue Seite hinzu und rendert Header und Footer
 * @param doc - Das jsPDF-Dokument
 * @param stammdaten - Stammdaten für Footer
 * @param isFirstPage - Ob es die erste Seite ist (für Adressfeld)
 * @returns Die Start-Y-Position für Content auf der neuen Seite
 */
export const addNewPage = (doc: jsPDF, stammdaten: Stammdaten): number => {
  doc.addPage();
  
  // Füge Header-Elemente für Folgeseite hinzu
  addFollowPageHeader(doc, stammdaten);
  
  // Füge Footer hinzu
  addDIN5008Footer(doc, stammdaten);
  
  return getFollowPageStartY();
};

/**
 * Prüft, ob eine neue Seite benötigt wird und fügt sie ggf. hinzu
 * @param doc - Das jsPDF-Dokument
 * @param currentY - Aktuelle Y-Position
 * @param neededHeight - Benötigte Höhe für den nächsten Content
 * @param stammdaten - Stammdaten für Footer
 * @returns Die Y-Position, an der der Content platziert werden soll
 */
export const ensureSpace = (
  doc: jsPDF,
  currentY: number,
  neededHeight: number,
  stammdaten: Stammdaten
): number => {
  if (!hasEnoughSpace(doc, currentY, neededHeight)) {
    return addNewPage(doc, stammdaten);
  }
  return currentY;
};

// === DIN 5008: Gemeinsamer Header für erste Seite ===
export const addDIN5008Header = (doc: jsPDF, stammdaten: Stammdaten) => {
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

// === Header für Folgeseiten (ohne Adressfeld) ===
export const addFollowPageHeader = (doc: jsPDF, stammdaten: Stammdaten) => {
  // === FALZMARKEN auch auf Folgeseiten ===
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.line(3, 87, 8, 87);
  doc.line(3, 192, 8, 192);
  
  // === LOGO BOX - Kleiner auf Folgeseiten ===
  const logoBoxX = 150;
  const logoBoxY = 15;
  const logoBoxWidth = 45;
  const logoBoxHeight = 25;
  
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.rect(logoBoxX, logoBoxY, logoBoxWidth, logoBoxHeight);
  
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, logoBoxX + logoBoxWidth / 2, logoBoxY + 10, { align: 'center' });
  
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('GmbH', logoBoxX + logoBoxWidth / 2, logoBoxY + 14, { align: 'center' });
  doc.text('Tennismehl', logoBoxX + logoBoxWidth / 2, logoBoxY + 19, { align: 'center' });
  
  // "Fortsetzung" Text
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('- Fortsetzung -', 25, 30);
  doc.setFont('helvetica', 'normal');
};

// === DIN 5008: Absenderzeile für Fensterkuvert ===
export const addAbsenderzeile = (doc: jsPDF, stammdaten: Stammdaten) => {
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`${stammdaten.firmenname} · ${stammdaten.firmenstrasse} · ${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, 25, 45);
};

// === DIN 5008: Footer mit Stammdaten ===
export const addDIN5008Footer = (doc: jsPDF, stammdaten: Stammdaten) => {
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

/**
 * Formatiert einen Betrag als Währung
 */
export const formatWaehrung = (betrag: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(betrag);
};

/**
 * Formatiert ein Datum
 */
export const formatDatum = (datum: string): string => {
  return new Date(datum).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Berechnet die Höhe eines mehrzeiligen Texts
 */
export const getTextHeight = (text: string | string[], lineHeight: number = 4): number => {
  if (Array.isArray(text)) {
    return text.length * lineHeight;
  }
  return lineHeight;
};

/**
 * Berechnet die ISO-Kalenderwoche für ein Datum
 * ISO-Wochen beginnen am Montag, die erste Woche des Jahres ist die Woche mit dem ersten Donnerstag
 */
export const getKalenderwoche = (datum: Date): number => {
  const d = new Date(datum.getTime());
  d.setHours(0, 0, 0, 0);
  // Setze auf den nächsten Donnerstag
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  // Hol den ersten Tag des Jahres
  const jahrStart = new Date(d.getFullYear(), 0, 1);
  // Berechne die Anzahl der Wochen
  const woche = Math.ceil((((d.getTime() - jahrStart.getTime()) / 86400000) + 1) / 7);
  return woche;
};

/**
 * Generiert den Liefersaison-Text mit Datumsbereich und Kalenderwochen
 * @param jahr - Das Jahr der Liefersaison
 * @returns Formatierter Text wie "Liefersaison voraussichtlich 03.03. - 18.04.2026 (10. - 16. KW 2026)"
 */
export const getLiefersaisonText = (jahr: number = 2026): string => {
  // Liefersaison: 3. März bis 18. April
  const startDatum = new Date(jahr, 2, 3); // Monat 2 = März (0-basiert)
  const endDatum = new Date(jahr, 3, 18);  // Monat 3 = April
  
  // Berechne Kalenderwochen
  const startKW = getKalenderwoche(startDatum);
  const endKW = getKalenderwoche(endDatum);
  
  // Formatiere Daten (dd.MM.)
  const startFormatiert = `${startDatum.getDate().toString().padStart(2, '0')}.${(startDatum.getMonth() + 1).toString().padStart(2, '0')}.`;
  const endFormatiert = `${endDatum.getDate().toString().padStart(2, '0')}.${(endDatum.getMonth() + 1).toString().padStart(2, '0')}.${endDatum.getFullYear()}`;
  
  return `Liefersaison voraussichtlich ${startFormatiert} - ${endFormatiert} (${startKW}. - ${endKW}. KW ${jahr})`;
};
