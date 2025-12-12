import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { RechnungsDaten, DokumentBerechnung, Position } from '../types/bestellabwicklung';
import { Stammdaten } from '../types/stammdaten';
import { getStammdatenOderDefault } from './stammdatenService';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  addFollowPageHeader,
  ensureSpace,
  formatWaehrung as formatWaehrungHelper,
  formatDatum as formatDatumHelper,
  getTextHeight
} from './pdfHelpers';

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
 * Generiert einen EPC-QR-Code String nach dem GiroCode Standard
 * für SEPA-Überweisungen
 */
const generiereEPCString = (
  empfaengerName: string,
  iban: string,
  bic: string,
  betrag: number,
  verwendungszweck: string
): string => {
  // EPC-QR-Code Format (GiroCode)
  // https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
  
  // IBAN ohne Leerzeichen
  const ibanOhneLeerzeichen = iban.replace(/\s/g, '');
  
  // Betrag auf 2 Dezimalstellen formatiert (max 999999999.99)
  const betragFormatiert = betrag.toFixed(2);
  
  // Verwendungszweck auf 140 Zeichen begrenzen
  const verwendungszweckGekuerzt = verwendungszweck.substring(0, 140);
  
  // EPC-QR-Code String aufbauen
  const epcLines = [
    'BCD',                    // Service Tag
    '002',                    // Version
    '1',                      // Character Set (1 = UTF-8)
    'SCT',                    // Identification (SEPA Credit Transfer)
    bic,                      // BIC
    empfaengerName,           // Empfängername (max 70 Zeichen)
    ibanOhneLeerzeichen,      // IBAN
    `EUR${betragFormatiert}`, // Währung und Betrag
    '',                       // Purpose (optional, meist leer)
    '',                       // Structured Reference (optional)
    verwendungszweckGekuerzt, // Unstructured Remittance Information
    ''                        // Beneficiary to Originator Information (optional)
  ];
  
  return epcLines.join('\n');
};

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
  
  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);
  
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
  
  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);
  
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
  
  const tableData = daten.positionen.map(pos => {
    // Bezeichnung mit Beschreibung (falls vorhanden)
    let bezeichnungMitBeschreibung = pos.bezeichnung;
    if (pos.beschreibung && pos.beschreibung.trim()) {
      bezeichnungMitBeschreibung += '\n' + pos.beschreibung;
    }
    
    // Einzelpreis mit optionalem Streichpreis und Grund
    let einzelpreisText = formatWaehrung(pos.einzelpreis);
    if (pos.streichpreis && pos.streichpreis > pos.einzelpreis) {
      // Format: "Grund" (falls vorhanden), dann Streichpreis, dann neuer Preis
      if (pos.streichpreisGrund) {
        einzelpreisText = pos.streichpreisGrund + '\n' + formatWaehrung(pos.streichpreis) + '\n' + formatWaehrung(pos.einzelpreis);
      } else {
        einzelpreisText = formatWaehrung(pos.streichpreis) + '\n' + formatWaehrung(pos.einzelpreis);
      }
    }
    
    return [
      pos.artikelnummer || '-',  // Artikel-Nr. (mit Fallback)
      bezeichnungMitBeschreibung,
      pos.menge.toString(),
      pos.einheit,
      einzelpreisText,
      formatWaehrung(pos.gesamtpreis)
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, bottom: 30 }, // DIN 5008: links 25mm, rechts 20mm
    head: [['Art.Nr.', 'Leistung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
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
      0: { cellWidth: 16, halign: 'left' },    // Art.Nr.
      1: { cellWidth: 68, halign: 'left', valign: 'top' },  // Leistung
      2: { cellWidth: 16, halign: 'right' },   // Menge
      3: { cellWidth: 16, halign: 'center' },  // Einh.
      4: { cellWidth: 22, halign: 'right', valign: 'top' },  // Stückpr. - oben ausgerichtet
      5: { cellWidth: 22, halign: 'right', valign: 'top' }    // Gesamt - oben ausgerichtet
    }, // Summe: 160mm
    didParseCell: function(data: any) {
      // Für die Bezeichnungsspalte im Body: Erste Zeile fett, weitere Zeilen normal
      if (data.column.index === 1 && data.section === 'body') {
        data.cell.styles.fontSize = 9;
      }
    },
    didDrawCell: function(data: any) {
      // Streichpreis durchstreichen und Grund fett anzeigen (wenn vorhanden)
      if (data.column.index === 4 && data.section === 'body') {
        const position = daten.positionen[data.row.index];
        if (position && position.streichpreis && position.streichpreis > position.einzelpreis) {
          const cell = data.cell;
          const lines = cell.text;
          
          // Prüfe ob ein Grund vorhanden ist (ORIGINAL aus dem Datenobjekt!)
          const streichpreisGrund = (position.streichpreisGrund ?? '').trim();
          const hasGrund = streichpreisGrund.length > 0;
          
          // BOMBENSICHERE LOGIK: Finde die Zeile mit dem Streichpreis
          // Der Streichpreis ist IMMER formatiert als Währung (z.B. "125,50 €")
          const streichpreisFormatiert = formatWaehrung(position.streichpreis);
          let streichpreisLineIndex = -1;
          
          // Suche die Zeile, die den Streichpreis enthält
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === streichpreisFormatiert) {
              streichpreisLineIndex = i;
              break;
            }
          }
          
          // NUR den Streichpreis durchstreichen (wenn gefunden)
          if (streichpreisLineIndex >= 0) {
            const streichpreisText = lines[streichpreisLineIndex];
            
            // Textbreite berechnen
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const textWidth = doc.getTextWidth(streichpreisText);
            
            // Linie nur über dem Text, rechtsbündig in der Zelle
            const x2 = cell.x + cell.width - cell.padding('right');
            const x1 = x2 - textWidth;
            
            // Y-Position berechnen für valign: 'top'
            const fontSizeInMm = 9 * 0.352778;
            const lineHeight = fontSizeInMm * 1.15;
            
            // Baseline für die Streichpreis-Zeile berechnen (oben ausgerichtet)
            const lineBaseline = cell.y + cell.padding('top') + (streichpreisLineIndex + 1) * fontSizeInMm + streichpreisLineIndex * (lineHeight - fontSizeInMm);
            
            // Streichlinie mittig durch den Text (35% über der Baseline)
            const y = lineBaseline - (fontSizeInMm * 0.35);
            
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.4);
            doc.line(x1, y, x2, y);
          }
          
          // Grund fett und KLEINER überschreiben - NICHT DURCHSTREICHEN!
          if (hasGrund) {
            // Gesamten Zellinhalt überschreiben mit korrekt formatiertem Text
            const x2 = cell.x + cell.width - cell.padding('right');
            const startY = cell.y + cell.padding('top');
            
            // Hintergrund mit der gleichen Farbe wie die Zelle zeichnen (für striped theme)
            // Bei striped theme: gerade Zeilen sind weiß (255,255,255), ungerade sind hellgrau (245,245,245)
            const isEvenRow = data.row.index % 2 === 0;
            if (isEvenRow) {
              doc.setFillColor(255, 255, 255); // Weiß
            } else {
              doc.setFillColor(245, 245, 245); // Hellgrau (striped)
            }
            doc.rect(cell.x + cell.padding('left'), cell.y + cell.padding('top'), 
                    cell.width - cell.padding('left') - cell.padding('right'), 
                    cell.height - cell.padding('top') - cell.padding('bottom'), 'F');
            
            // 1. Nachlassgrund in KLEINERER Schrift (7pt) und FETT - BOMBENSICHER ohne Umbruch
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            const grundY = startY + (7 * 0.352778);
            // Kürze den Text falls zu lang (maximal 25 Zeichen)
            const grundTextGekuerzt = streichpreisGrund.length > 25 
              ? streichpreisGrund.substring(0, 22) + '...' 
              : streichpreisGrund;
            doc.text(grundTextGekuerzt, x2, grundY, { align: 'right' });
            
            // 2. Streichpreis (normal, 9pt) - WIRD GLEICH DURCHGESTRICHEN
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const streichpreisY = grundY + (9 * 0.352778) + 0.5;
            doc.text(formatWaehrung(position.streichpreis), x2, streichpreisY, { align: 'right' });
            
            // 3. Neuer Preis (normal, 9pt)
            const neuerPreisY = streichpreisY + (9 * 0.352778) + 0.5;
            doc.text(formatWaehrung(position.einzelpreis), x2, neuerPreisY, { align: 'right' });
            
            // JETZT Streichlinie über dem Streichpreis
            doc.setFontSize(9);
            const streichpreisTextWidth = doc.getTextWidth(formatWaehrung(position.streichpreis));
            const lineX1 = x2 - streichpreisTextWidth;
            const lineY = streichpreisY - (9 * 0.352778 * 0.35);
            
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.4);
            doc.line(lineX1, lineY, x2, lineY);
            
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
          }
        }
      }
    },
    // WICHTIG: Automatische Seitenumbrüche mit Header und Footer auf jeder Seite
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });
  
  // === Summen ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  const berechnung = berechneRechnungsSummen(daten.positionen);
  
  // Prüfe ob genug Platz für Summen-Block (inkl. QR-Code, ca. 50mm)
  summenY = await ensureSpace(doc, summenY, 50, stammdaten);
  
  const summenX = 125;
  summenY += 10;
  
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
  
  // Prüfe Platz für Zahlungsbedingungen + Bankdaten + QR-Code (ca. 45mm)
  summenY = await ensureSpace(doc, summenY, 45, stammdaten);
  
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
  
  // === Bankdaten mit EPC-QR-Code ===
  summenY += 8;
  const bankdatenStartY = summenY;
  
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
  
  // === EPC-QR-Code generieren und einfügen ===
  try {
    const verwendungszweck = `Rechnung ${daten.rechnungsnummer}`;
    const epcString = generiereEPCString(
      stammdaten.firmenname,
      stammdaten.iban,
      stammdaten.bic,
      berechnung.bruttobetrag,
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
    doc.text('GiroCode', qrX + qrSize/2, qrY - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    
    // QR-Code Beschriftung
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Zum Bezahlen', qrX + qrSize/2, qrY + qrSize + 3, { align: 'center' });
    doc.text('im Online Banking', qrX + qrSize/2, qrY + qrSize + 6, { align: 'center' });
    doc.text('scannen', qrX + qrSize/2, qrY + qrSize + 9, { align: 'center' });
  } catch (error) {
    console.error('Fehler beim Generieren des QR-Codes:', error);
    // Fortfahren ohne QR-Code, falls ein Fehler auftritt
  }
  
  // === Zahlungshinweis ===
  summenY += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const hinweisText = 'Bitte verwenden Sie für die Zahlung die angegebene Rechnungsnummer als Verwendungszweck, damit wir Ihre Zahlung korrekt zuordnen können.';
  const hinweisLines = doc.splitTextToSize(hinweisText, 115); // Breite reduziert wegen QR-Code
  doc.text(hinweisLines, 25, summenY);
  
  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 10;
    
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 5;
    
    // Prüfe Platz für Bemerkung
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 25, summenY);
    summenY += 5;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }
  
  // === Grußformel ===
  summenY += 12;
  
  // Prüfe Platz für Grußformel
  summenY = await ensureSpace(doc, summenY, 10, stammdaten);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');
  
  // Footer auf allen Seiten
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addDIN5008Footer(doc, stammdaten);
  }
  
  return doc;
};

// Helper-Funktionen aus pdfHelpers verwenden
const formatWaehrung = formatWaehrungHelper;
const formatDatum = formatDatumHelper;
