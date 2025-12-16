/**
 * PDF Helper Functions für professionelle, mehrseitige Dokumente
 * 
 * Diese Funktionen stellen sicher, dass PDF-Dokumente mit automatischen
 * Seitenumbrüchen generiert werden, die DIN-Norm-konform sind.
 */

import jsPDF from 'jspdf';
import { Stammdaten } from '../types/stammdaten';
import { loadLogoBase64 } from './logoLoader';

const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

// Logo Cache für Performance
let logoCache: string | null = null;

/**
 * Lädt das Logo einmalig beim ersten Aufruf
 */
const ensureLogoLoaded = async (): Promise<string | null> => {
  if (!logoCache) {
    logoCache = await loadLogoBase64();
  }
  return logoCache;
};

// === KONSTANTEN FÜR SEITENLAYOUT (DIN 5008 konform) ===
export const PAGE_MARGINS = {
  left: 25,   // DIN 5008: 24,1mm (aufgerundet auf 25mm)
  right: 20,  // DIN 5008: mindestens 20mm
  top: 17,    // DIN 5008: 16,9mm (aufgerundet auf 17mm)
  bottom: 35, // Platz für professionellen Footer mit IBAN
};

/**
 * Berechnet die maximale Y-Position für Content auf der aktuellen Seite
 * Berücksichtigt den Footer-Bereich
 */
export const getMaxContentY = (doc: jsPDF): number => {
  const pageHeight = doc.internal.pageSize.height;
  // Footer beginnt 22mm vom unteren Rand, Trennlinie bei 27mm, wir lassen 5mm Puffer
  return pageHeight - 32;
};

/**
 * Berechnet die Start-Y-Position für Content auf Folgeseiten
 */
export const getFollowPageStartY = (): number => {
  return 45; // Nach Logo und "Fortsetzung"-Text
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
export const addNewPage = async (doc: jsPDF, stammdaten: Stammdaten): Promise<number> => {
  doc.addPage();
  
  // Füge Header-Elemente für Folgeseite hinzu
  await addFollowPageHeader(doc, stammdaten);
  
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
export const ensureSpace = async (
  doc: jsPDF,
  currentY: number,
  neededHeight: number,
  stammdaten: Stammdaten
): Promise<number> => {
  if (!hasEnoughSpace(doc, currentY, neededHeight)) {
    return await addNewPage(doc, stammdaten);
  }
  return currentY;
};

// === DIN 5008: Gemeinsamer Header für alle Seiten ===
export const addDIN5008Header = async (doc: jsPDF, stammdaten: Stammdaten) => {
  // === DIN 5008: FALZMARKEN ===
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.line(3, 87, 8, 87);  // Falzmarke 1 bei 87mm
  doc.line(3, 192, 8, 192); // Falzmarke 2 bei 192mm
  
  // === TENNISMEHL LOGO - Einheitlich auf allen Seiten ===
  const pageWidth = doc.internal.pageSize.width;
  // Logo rechts positioniert mit 20mm Abstand zum rechten Rand
  const logoWidth = 45;  // Kompakte Größe für bessere Performance
  const logoHeight = 22; // Proportional skaliert
  const logoX = pageWidth - 20 - logoWidth; // Rechter Rand (DIN 5008: 20mm) minus Logo-Breite
  const logoY = 12;
  
  // Logo als Image einfügen
  try {
    const logoData = await ensureLogoLoaded();
    
    if (logoData) {
      // Logo mit Kompression einfügen für bessere Performance
      doc.addImage(logoData, 'PNG', logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
    } else {
      throw new Error('Logo konnte nicht geladen werden');
    }
  } catch (error) {
    console.error('Logo konnte nicht geladen werden, verwende Fallback:', error);
    
    // FALLBACK: Wenn Logo nicht geladen werden kann, verwende Text
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.rect(logoX, logoY, logoWidth, logoHeight);
    
    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text(stammdaten.firmenname, logoX + logoWidth / 2, logoY + 10, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('GmbH', logoX + logoWidth / 2, logoY + 15, { align: 'center' });
  }
};

// === Header für Folgeseiten (ohne Adressfeld) ===
export const addFollowPageHeader = async (doc: jsPDF, stammdaten: Stammdaten) => {
  // Verwende gleichen Header wie erste Seite (einheitliches Logo)
  await addDIN5008Header(doc, stammdaten);
  
  // "Fortsetzung" Text - links mit DIN 5008 Abstand
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'italic');
  doc.text('- Fortsetzung -', 25, 38);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
};

// === DIN 5008: Absenderzeile für Fensterkuvert ===
export const addAbsenderzeile = (doc: jsPDF, stammdaten: Stammdaten) => {
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  // DIN 5008 konformer linker Abstand (25mm)
  doc.text(`${stammdaten.firmenname} · ${stammdaten.firmenstrasse} · ${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, 25, 45);
};

// === DIN 5008: Footer mit Stammdaten ===
export const addDIN5008Footer = (doc: jsPDF, stammdaten: Stammdaten) => {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const footerY = pageHeight - 22;
  
  // DIN 5008 konforme Margins
  const marginLeft = 25;  // DIN 5008: 24,1mm (aufgerundet)
  const marginRight = 20; // DIN 5008: mindestens 20mm
  
  // Trennlinie über Footer - volle Breite
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, footerY - 5, pageWidth - marginRight, footerY - 5);
  
  // Seitennummerierung (nur bei mehrseitigen Dokumenten)
  const currentPage = doc.getCurrentPageInfo().pageNumber;
  const totalPages = doc.getNumberOfPages();
  
  if (totalPages > 1) {
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    const pageText = `Seite ${currentPage} von ${totalPages}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    // Zentriert über der Trennlinie
    doc.text(pageText, (pageWidth - pageTextWidth) / 2, footerY - 7);
  }
  
  doc.setFontSize(6.5);
  doc.setTextColor(70, 70, 70);
  
  // Prüfe ob Werk/Verkauf vorhanden ist
  const hasWerk = stammdaten.werkName && stammdaten.werkStrasse && stammdaten.werkPlz && stammdaten.werkOrt;
  
  // Spaltenbreiten berechnen - proportional zur Inhaltslänge
  // 6 Spalten: Verwaltung | Geschäftsführer | Register/USt | Werk | Kontakt | Bank
  // 5 Spalten: Verwaltung | Geschäftsführer | Register/USt | Kontakt | Bank (wenn kein Werk)
  
  let columns: { x: number; width: number }[];
  
  if (hasWerk) {
    // 6 Spalten mit optimierten Breiten (Summe = 165mm)
    const widths = [23, 27, 23, 25, 27, 40]; // = 165mm
    let currentX = marginLeft;
    columns = widths.map(w => {
      const col = { x: currentX, width: w };
      currentX += w;
      return col;
    });
  } else {
    // 5 Spalten mit mehr Platz pro Spalte (Summe = 165mm)
    const widths = [27, 30, 28, 32, 48]; // = 165mm
    let currentX = marginLeft;
    columns = widths.map(w => {
      const col = { x: currentX, width: w };
      currentX += w;
      return col;
    });
  }
  
  const lineHeight = 3.2;
  
  // === Spalte 1: Verwaltung ===
  const col1 = columns[0];
  doc.setFont('helvetica', 'bold');
  doc.text('Verwaltung:', col1.x, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.firmenname, col1.x, footerY + lineHeight);
  doc.text(stammdaten.firmenstrasse, col1.x, footerY + lineHeight * 2);
  doc.text(`${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, col1.x, footerY + lineHeight * 3);
  
  // === Spalte 2: Geschäftsführer ===
  const col2 = columns[1];
  doc.setFont('helvetica', 'bold');
  doc.text('Geschäftsführer:', col2.x, footerY);
  doc.setFont('helvetica', 'normal');
  
  // Geschäftsführer untereinander
  stammdaten.geschaeftsfuehrer.forEach((gf, index) => {
    doc.text(gf, col2.x, footerY + lineHeight * (index + 1));
  });
  
  // Sitz nach den Geschäftsführern
  const sitzY = footerY + lineHeight * (stammdaten.geschaeftsfuehrer.length + 1);
  doc.text(`Sitz: ${stammdaten.sitzGesellschaft}`, col2.x, sitzY);
  
  // === Spalte 3: Registergericht & USt-ID ===
  const col3 = columns[2];
  doc.setFont('helvetica', 'bold');
  doc.text('Registergericht:', col3.x, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.handelsregister, col3.x, footerY + lineHeight);
  doc.setFont('helvetica', 'bold');
  doc.text('USt-ID:', col3.x, footerY + lineHeight * 2);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.ustIdNr, col3.x, footerY + lineHeight * 3);
  
  // === Spalte 4: Werk/Verkauf (nur wenn vorhanden) ===
  let nextColIndex = 3;
  if (hasWerk) {
    const col4 = columns[3];
    doc.setFont('helvetica', 'bold');
    doc.text('Werk/Verkauf:', col4.x, footerY);
    doc.setFont('helvetica', 'normal');
    doc.text(stammdaten.werkName!, col4.x, footerY + lineHeight);
    doc.text(stammdaten.werkStrasse!, col4.x, footerY + lineHeight * 2);
    doc.text(`${stammdaten.werkPlz} ${stammdaten.werkOrt}`, col4.x, footerY + lineHeight * 3);
    nextColIndex = 4;
  }
  
  // === Spalte 5 (oder 4): Kontakt ===
  const colKontakt = columns[nextColIndex];
  doc.setFont('helvetica', 'bold');
  doc.text('Kontakt:', colKontakt.x, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tel: ${stammdaten.firmenTelefon}`, colKontakt.x, footerY + lineHeight);
  doc.text(stammdaten.firmenEmail, colKontakt.x, footerY + lineHeight * 2);
  if (stammdaten.firmenWebsite) {
    doc.text(stammdaten.firmenWebsite, colKontakt.x, footerY + lineHeight * 3);
  }
  
  // === Spalte 6 (oder 5): Bankverbindung ===
  const colBank = columns[nextColIndex + 1];
  doc.setFont('helvetica', 'bold');
  doc.text('Bank:', colBank.x, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.bankname, colBank.x, footerY + lineHeight);
  
  // IBAN professionell formatieren (DE XX XXXX XXXX XXXX XXXX XX)
  // Standard-Format: Ländercode + 2er Block + 4er Blöcke
  const ibanClean = stammdaten.iban.replace(/\s/g, ''); // Alle Leerzeichen entfernen
  let ibanFormatted = '';
  
  if (ibanClean.length >= 2) {
    // Ländercode (DE)
    ibanFormatted = ibanClean.substring(0, 2);
    // Prüfziffern (2 Zeichen)
    if (ibanClean.length >= 4) {
      ibanFormatted += ibanClean.substring(2, 4);
    }
    // Rest in 4er-Blöcken
    for (let i = 4; i < ibanClean.length; i += 4) {
      ibanFormatted += ' ' + ibanClean.substring(i, Math.min(i + 4, ibanClean.length));
    }
  } else {
    ibanFormatted = stammdaten.iban;
  }
  
  // IBAN intelligent umbrechen - nach ca. halber Länge am Leerzeichen
  const ibanParts = ibanFormatted.split(' ');
  const midPoint = Math.ceil(ibanParts.length / 2);
  const ibanLine1 = ibanParts.slice(0, midPoint).join(' ');
  const ibanLine2 = ibanParts.slice(midPoint).join(' ');
  
  // IBAN über zwei Zeilen für bessere Lesbarkeit
  doc.text(ibanLine1, colBank.x, footerY + lineHeight * 2);
  doc.text(ibanLine2, colBank.x, footerY + lineHeight * 3);
  doc.text(`BIC: ${stammdaten.bic}`, colBank.x, footerY + lineHeight * 4);
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
 * Generiert den Liefersaison-Text mit Datumsbereich
 * @returns Formatierter Text wie "Liefersaison voraussichtlich 02.03 bis 22.03"
 */
export const getLiefersaisonText = (): string => {
  return 'Liefersaison voraussichtlich 02.03 bis 22.03';
};
