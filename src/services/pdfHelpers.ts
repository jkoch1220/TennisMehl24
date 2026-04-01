/**
 * PDF Helper Functions für professionelle, mehrseitige Dokumente
 * 
 * Diese Funktionen stellen sicher, dass PDF-Dokumente mit automatischen
 * Seitenumbrüchen generiert werden, die DIN-Norm-konform sind.
 */

import jsPDF from 'jspdf';
import { Stammdaten } from '../types/stammdaten';
import { loadLogoBase64 } from './logoLoader';
import { getLandName } from '../constants/laender';

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
  bottom: 30, // Platz für Footer (kompakter)
};

/**
 * Berechnet die maximale Y-Position für Content auf der aktuellen Seite
 * Berücksichtigt den Footer-Bereich
 */
export const getMaxContentY = (doc: jsPDF): number => {
  const pageHeight = doc.internal.pageSize.height;
  // Footer beginnt 20mm vom unteren Rand - kompakteres Layout
  return pageHeight - 28;
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
  doc.text(`${stammdaten.firmenname} · ${formatStrasseHausnummer(stammdaten.firmenstrasse)} · ${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`, 25, 45);
};

// === DIN 5008: Footer mit Stammdaten ===
export const addDIN5008Footer = (doc: jsPDF, stammdaten: Stammdaten) => {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const footerY = pageHeight - 20; // Kompakter: 20mm statt 22mm
  
  // DIN 5008 konforme Margins
  const marginLeft = 25;  // DIN 5008: 24,1mm (aufgerundet)
  const marginRight = 20; // DIN 5008: mindestens 20mm
  
  // Trennlinie über Footer - volle Breite
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, footerY - 3, pageWidth - marginRight, footerY - 3);

  // Seitennummerierung (nur bei mehrseitigen Dokumenten)
  const currentPage = doc.getCurrentPageInfo().pageNumber;
  const totalPages = doc.getNumberOfPages();

  if (totalPages > 1) {
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    const pageText = `Seite ${currentPage} von ${totalPages}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    // Zentriert über der Trennlinie
    doc.text(pageText, (pageWidth - pageTextWidth) / 2, footerY - 5);
  }

  doc.setFontSize(6);
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
  
  const lineHeight = 2.9; // Kompakter
  
  // === Spalte 1: Verwaltung ===
  const col1 = columns[0];
  doc.setFont('helvetica', 'bold');
  doc.text('Verwaltung:', col1.x, footerY);
  doc.setFont('helvetica', 'normal');
  doc.text(stammdaten.firmenname, col1.x, footerY + lineHeight);
  doc.text(formatStrasseHausnummer(stammdaten.firmenstrasse), col1.x, footerY + lineHeight * 2);
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

  // Handelsregister intelligent umbrechen (z.B. "Würzburg HRB 18235" -> zwei Zeilen)
  const hrb = stammdaten.handelsregister;
  const hrbMatch = hrb.match(/^(.+?)\s*(HRB?\s*.+)$/i);
  let hrbLineOffset = 1;
  if (hrbMatch && hrbMatch[1] && hrbMatch[2]) {
    // Aufteilen: Ort in Zeile 1, HRB-Nummer in Zeile 2
    doc.text(hrbMatch[1].trim(), col3.x, footerY + lineHeight);
    doc.text(hrbMatch[2].trim(), col3.x, footerY + lineHeight * 2);
    hrbLineOffset = 2;
  } else {
    // Kein HRB gefunden -> alles in einer Zeile
    doc.text(hrb, col3.x, footerY + lineHeight);
  }

  // USt-ID hat Vorrang vor Steuernummer (sobald vorhanden, ersetzt sie die Steuernummer)
  const hatUstId = stammdaten.ustIdNr && stammdaten.ustIdNr.trim() !== '';
  const steuerLabel = hatUstId ? 'USt-ID:' : 'Steuernummer:';
  const steuerWert = hatUstId ? stammdaten.ustIdNr : (stammdaten.steuernummer || '');

  doc.setFont('helvetica', 'bold');
  doc.text(steuerLabel, col3.x, footerY + lineHeight * (hrbLineOffset + 1));
  doc.setFont('helvetica', 'normal');
  doc.text(steuerWert, col3.x, footerY + lineHeight * (hrbLineOffset + 2));
  
  // === Spalte 4: Werk/Verkauf (nur wenn vorhanden) ===
  let nextColIndex = 3;
  if (hasWerk) {
    const col4 = columns[3];
    doc.setFont('helvetica', 'bold');
    doc.text('Werk/Verkauf:', col4.x, footerY);
    doc.setFont('helvetica', 'normal');
    doc.text(stammdaten.werkName!, col4.x, footerY + lineHeight);
    doc.text(formatStrasseHausnummer(stammdaten.werkStrasse!), col4.x, footerY + lineHeight * 2);
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
 * Formatiert eine Straßenadresse mit Hausnummer, sodass die Hausnummer NIEMALS umbrechen kann.
 * Ersetzt das letzte Leerzeichen vor der Hausnummer durch ein Non-Breaking Space (\u00A0).
 *
 * Beispiele:
 * - "Musterstraße 12a" → "Musterstraße\u00A012a"
 * - "Am Großen Anger 5" → "Am Großen Anger\u00A05"
 * - "Lange Straße 123-125" → "Lange Straße\u00A0123-125"
 */
export const formatStrasseHausnummer = (strasse: string): string => {
  if (!strasse) return '';

  // Regex: Findet das letzte Leerzeichen gefolgt von einer Hausnummer
  // Hausnummer = Zahl (evtl. mit Buchstaben wie 12a, 12b) oder Bereich (12-14)
  const hausnummerRegex = /\s+(\d+[\w\-\/]*)\s*$/;

  return strasse.replace(hausnummerRegex, '\u00A0$1');
};

/**
 * Formatiert PLZ + Ort + Land für PDF-Ausgabe
 * Bei Deutschland wird das Land NICHT angezeigt (Standard)
 * Bei Ausland: "PLZ Ort, Ländername" (z.B. "1010 Wien, Österreich")
 *
 * @param plz - Postleitzahl
 * @param ort - Ortsname
 * @param land - ISO-Ländercode (optional, Standard: 'DE')
 * @returns Formatierter String für PDF
 */
export const formatAdresszeile = (plz: string, ort: string, land?: string): string => {
  const basisAdresse = `${plz} ${ort}`;
  const landName = getLandName(land);

  if (landName) {
    return `${basisAdresse}, ${landName}`;
  }
  return basisAdresse;
};

/**
 * Formatiert einen Betrag als Währung
 * Verwendet Non-Breaking Space (\u00A0) zwischen Zahl und €, damit kein Umbruch entsteht
 */
export const formatWaehrung = (betrag: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(betrag).replace(/ /g, '\u00A0');
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
 * Gibt einen Text aus, der automatisch umgebrochen wird, wenn er zu lang ist.
 * Gibt die neue Y-Position nach dem Text zurück.
 * WICHTIG: Verwendet NICHT splitTextToSize da dies komische Abstände verursachen kann.
 * Stattdessen manueller Umbruch an sinnvollen Stellen (Leerzeichen, Schrägstrich).
 * @param doc - jsPDF Dokument
 * @param text - Der auszugebende Text
 * @param x - X-Position
 * @param y - Y-Position
 * @param maxWidth - Maximale Breite (Standard: 80mm für Adressfeld)
 * @param lineHeight - Zeilenhöhe (Standard: 5)
 * @returns Neue Y-Position nach dem Text
 */
export const addWrappedText = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number = 80,
  lineHeight: number = 5
): number => {
  if (!text) return y;

  // Prüfe ob Text in eine Zeile passt
  const textWidth = doc.getTextWidth(text);
  if (textWidth <= maxWidth) {
    // Text passt - einfach ausgeben
    doc.text(text, x, y);
    return y + lineHeight;
  }

  // Text ist zu lang - manuell an sinnvollen Stellen umbrechen
  // Umbruchpunkte: Leerzeichen, Schrägstrich mit Leerzeichen " / "
  const words = text.split(/(\s+|(?<=\/)\s*)/); // Split an Leerzeichen, behalte Trennzeichen
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + word;
    const testWidth = doc.getTextWidth(testLine.trim());

    if (testWidth > maxWidth && currentLine.trim().length > 0) {
      // Zeile ist voll - neue Zeile beginnen
      lines.push(currentLine.trim());
      currentLine = word.trim() + ' ';
    } else {
      currentLine = testLine;
    }
  }

  // Letzte Zeile hinzufügen
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }

  // Falls immer noch keine sinnvolle Aufteilung möglich, splitTextToSize als Fallback
  if (lines.length === 0) {
    const fallbackLines = doc.splitTextToSize(text, maxWidth);
    fallbackLines.forEach((line: string, index: number) => {
      doc.text(line, x, y + (index * lineHeight));
    });
    return y + (fallbackLines.length * lineHeight);
  }

  // Zeilen ausgeben - LINKSBÜNDIG
  lines.forEach((line: string, index: number) => {
    doc.text(line, x, y + (index * lineHeight), { align: 'left' });
  });

  // Neue Y-Position zurückgeben
  return y + (lines.length * lineHeight);
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
 * Text wird aus den Stammdaten generiert.
 * @param stammdaten - Die Stammdaten mit Liefersaison-Konfiguration
 * @returns Formatierter Text wie "Liefersaison voraussichtlich 02.03. - 17.04.2025 (10. - 16. KW 2025)."
 */
export const getLiefersaisonText = (stammdaten?: Stammdaten | null): string => {
  // Standard-Fallback falls keine Stammdaten vorhanden
  const startDatum = stammdaten?.liefersaisonStartDatum || '02.03.';
  const endDatum = stammdaten?.liefersaisonEndDatum || '17.04.';
  const startKW = stammdaten?.liefersaisonStartKW || 10;
  const endKW = stammdaten?.liefersaisonEndKW || 16;
  const jahr = stammdaten?.liefersaisonJahr || 2026;

  return `Liefersaison voraussichtlich ${startDatum} - ${endDatum}${jahr} (${startKW}. - ${endKW}. KW ${jahr}).`;
};

// === TEXTMARKER-EFFEKT (wie mit echtem Marker markiert) ===

/**
 * Zeichnet einen Textmarker-Effekt hinter Text
 * Sieht aus wie eine handgezogene Markierung mit leichten Unregelmäßigkeiten
 * @param doc - Das jsPDF-Dokument
 * @param x - X-Position (linker Rand)
 * @param y - Y-Position (Baseline des Textes)
 * @param width - Breite der Markierung
 * @param height - Höhe der Markierung (typisch: Schriftgröße + 2mm)
 * @param color - Farbe als RGB-Array (default: Gelb)
 * @param opacity - Deckkraft 0-1 (default: 0.4 für natürlichen Look)
 */
export const addHighlighterEffect = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number = 5,
  color: [number, number, number] = [255, 235, 59], // Gelb
  opacity: number = 0.4
): void => {
  // Speichere aktuellen Zustand
  const currentFillColor = (doc as any).getFillColor?.() || null;

  // Setze halbtransparente Füllfarbe
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setGState(new (doc as any).GState({ opacity: opacity }));

  // Zeichne mehrere leicht versetzte Rechtecke für natürlichen Marker-Look
  // Hauptrechteck (leicht nach oben versetzt, da y die Baseline ist)
  const yOffset = height * 0.7; // Markierung oberhalb der Baseline

  // Leichte Wellenform für natürliches Aussehen
  const segments = 5;
  const segmentWidth = width / segments;

  for (let i = 0; i < segments; i++) {
    // Kleine zufällige Variation in der Höhe (±0.3mm)
    const heightVar = (Math.sin(i * 1.7 + x) * 0.3);
    const yVar = (Math.cos(i * 2.1 + y) * 0.2);

    doc.rect(
      x + i * segmentWidth,
      y - yOffset + yVar,
      segmentWidth + 0.5, // Leichte Überlappung
      height + heightVar,
      'F'
    );
  }

  // Opacity zurücksetzen
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // Füllfarbe zurücksetzen falls möglich
  if (currentFillColor) {
    doc.setFillColor(currentFillColor);
  }
};

/**
 * Zeichnet Text mit Textmarker-Effekt dahinter
 * @param doc - Das jsPDF-Dokument
 * @param text - Der zu markierende Text
 * @param x - X-Position
 * @param y - Y-Position (Baseline)
 * @param fontSize - Schriftgröße in pt
 * @param highlightColor - Marker-Farbe (default: Gelb)
 */
export const addHighlightedText = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fontSize: number = 10,
  highlightColor: [number, number, number] = [255, 235, 59]
): void => {
  // Textbreite berechnen
  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(text);
  const textHeight = fontSize * 0.352778 * 1.4; // pt to mm + Padding

  // Marker-Effekt zeichnen
  addHighlighterEffect(doc, x - 1, y, textWidth + 2, textHeight, highlightColor, 0.45);

  // Text darüber zeichnen
  doc.text(text, x, y);
};

// === HANDSCHRIFT-EFFEKT (wie handgeschrieben) ===

// Pseudo-Zufallsgenerator für konsistente "Zufälligkeit" basierend auf Seed
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

/**
 * Zeichnet Text im Handschrift-Stil
 * Verwendet leichte Variationen in Position, Rotation und Größe für natürliches Aussehen
 * @param doc - Das jsPDF-Dokument
 * @param text - Der zu schreibende Text
 * @param x - X-Position
 * @param y - Y-Position
 * @param fontSize - Basis-Schriftgröße
 * @param color - Textfarbe als RGB-Array (default: Dunkelblau wie Kugelschreiber)
 * @param style - 'casual' für entspannte Handschrift, 'neat' für saubere Handschrift
 */
export const addHandwrittenText = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fontSize: number = 14,
  color: [number, number, number] = [25, 55, 95], // Dunkelblau (Kugelschreiber)
  style: 'casual' | 'neat' = 'casual'
): void => {
  // Speichere aktuellen Zustand
  const currentFont = doc.getFont();
  const currentFontSize = doc.getFontSize();
  const currentTextColor = doc.getTextColor();

  // Setze Handschrift-Stil
  doc.setTextColor(color[0], color[1], color[2]);

  // Variationsstärke basierend auf Stil
  const variation = style === 'casual' ? 1.0 : 0.4;

  // Seed basierend auf Text für konsistente Variation
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed += text.charCodeAt(i);
  }

  // Zeichne jeden Buchstaben einzeln mit leichten Variationen
  let currentX = x;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charSeed = seed + i * 7;

    // Leichte Variationen für natürliches Aussehen
    const sizeVar = 1 + (seededRandom(charSeed) - 0.5) * 0.08 * variation;
    const yVar = (seededRandom(charSeed + 1) - 0.5) * 0.8 * variation;
    const xVar = (seededRandom(charSeed + 2) - 0.5) * 0.3 * variation;

    // Schriftgröße für diesen Buchstaben
    const charSize = fontSize * sizeVar;
    doc.setFontSize(charSize);

    // Position mit Variation
    const charX = currentX + xVar;
    const charY = y + yVar;

    // Text zeichnen
    // Hinweis: jsPDF unterstützt keine direkte Text-Rotation, daher erzeugen
    // die Positions- und Größenvariationen den handgeschriebenen Look
    doc.text(char, charX, charY);

    // Berechne Breite für nächsten Buchstaben
    // Etwas variable Buchstabenabstände für Handschrift-Look
    const charWidth = doc.getTextWidth(char);
    const spacingVar = 1 + (seededRandom(charSeed + 4) - 0.5) * 0.15 * variation;
    currentX += charWidth * spacingVar;
  }

  // Zustand wiederherstellen
  doc.setFont(currentFont.fontName, currentFont.fontStyle);
  doc.setFontSize(currentFontSize);
  doc.setTextColor(currentTextColor);
};

/**
 * Zeichnet eine handschriftliche Notiz mit optionalem Unterstrich
 * Für Notizen wie "Motor" oder "Hänger" auf Lieferscheinen
 * @param doc - Das jsPDF-Dokument
 * @param text - Der Notiztext
 * @param x - X-Position
 * @param y - Y-Position
 * @param options - Optionen für Stil und Aussehen
 */
export const addHandwrittenNote = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: {
    fontSize?: number;
    color?: [number, number, number];
    underline?: boolean;
    circled?: boolean;
    style?: 'casual' | 'neat';
  } = {}
): void => {
  const {
    fontSize = 16,
    color = [25, 55, 95], // Dunkelblau (Kugelschreiber)
    underline = false,
    circled = false,
    style = 'casual'
  } = options;

  // Handschriftlichen Text zeichnen
  addHandwrittenText(doc, text, x, y, fontSize, color, style);

  // Textbreite für Unterstrich/Kreis berechnen
  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(text);
  const textHeight = fontSize * 0.352778;

  // Seed für konsistente Variation
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed += text.charCodeAt(i);
  }

  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.4);

  if (underline) {
    // Handgezeichneter Unterstrich (leicht wellig)
    const underlineY = y + 1.5;
    const segments = 8;
    const segmentWidth = textWidth / segments;

    doc.setLineCap('round');

    let lastX = x - 1;
    let lastY = underlineY + (seededRandom(seed) - 0.5) * 0.5;

    for (let i = 1; i <= segments; i++) {
      const nextX = x + i * segmentWidth + 1;
      const nextY = underlineY + (seededRandom(seed + i) - 0.5) * 0.6;

      // Leicht gebogene Linie
      doc.line(lastX, lastY, nextX, nextY);

      lastX = nextX;
      lastY = nextY;
    }
  }

  if (circled) {
    // Handgezeichneter Kreis/Oval um den Text
    const centerX = x + textWidth / 2;
    const centerY = y - textHeight / 3;
    const radiusX = textWidth / 2 + 3;
    const radiusY = textHeight / 2 + 2;

    // Unregelmäßige Ellipse für handgezeichneten Look
    const points = 24;
    doc.setLineCap('round');

    for (let i = 0; i < points; i++) {
      const angle1 = (i / points) * 2 * Math.PI;
      const angle2 = ((i + 1) / points) * 2 * Math.PI;

      // Leichte Variation im Radius
      const r1Var = 1 + (seededRandom(seed + i * 3) - 0.5) * 0.1;
      const r2Var = 1 + (seededRandom(seed + (i + 1) * 3) - 0.5) * 0.1;

      const x1 = centerX + Math.cos(angle1) * radiusX * r1Var;
      const y1 = centerY + Math.sin(angle1) * radiusY * r1Var;
      const x2 = centerX + Math.cos(angle2) * radiusX * r2Var;
      const y2 = centerY + Math.sin(angle2) * radiusY * r2Var;

      doc.line(x1, y1, x2, y2);
    }
  }
};
