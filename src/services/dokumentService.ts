import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AngebotsDaten, AuftragsbestaetigungsDaten, LieferscheinDaten } from '../types/bestellabwicklung';
import { Stammdaten } from '../types/stammdaten';
import { getStammdatenOderDefault } from './stammdatenService';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  addFollowPageHeader,
  ensureSpace,
  formatWaehrung,
  formatDatum,
  getTextHeight,
  getLiefersaisonText
} from './pdfHelpers';

const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

// === ANGEBOT ===
export const generiereAngebotPDF = async (daten: AngebotsDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);
  
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
      pos.artikelnummer || '-',  // Artikel-Nr. als erste Spalte
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
    head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
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
      1: { cellWidth: 68, valign: 'top' },     // Bezeichnung
      2: { cellWidth: 16, halign: 'right' },   // Menge
      3: { cellWidth: 16 },                    // Einh.
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
        // Folgeseiten-Header (ohne Adressfeld)
        const currentPage = doc.getCurrentPageInfo().pageNumber;
        if (currentPage > 1) {
          addFollowPageHeader(doc, stammdaten);
        }
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });
  
  // === Summen ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  
  // Prüfe ob genug Platz für Summen-Block (ca. 40mm Höhe)
  summenY = await ensureSpace(doc, summenY, 40, stammdaten);
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 125;
  summenY += 10;
  
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
  
  // === Liefersaison-Hinweis ===
  summenY += 12;
  summenY = await ensureSpace(doc, summenY, 10, stammdaten);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  const liefersaisonText = getLiefersaisonText(2026);
  doc.text(liefersaisonText, 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  // === Lieferbedingungen ===
  summenY += 10;
  
  // Prüfe Platz für Lieferbedingungen-Block (ca. 25mm)
  summenY = await ensureSpace(doc, summenY, 25, stammdaten);
  
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
  
  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    summenY += 2;
    const lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    const lieferbedingungenHeight = getTextHeight(lieferbedingungenLines);
    
    // Prüfe ob genug Platz für Lieferbedingungen-Text
    summenY = await ensureSpace(doc, summenY, lieferbedingungenHeight, stammdaten);
    
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += lieferbedingungenHeight;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  
  // Prüfe Platz für Zahlungsbedingungen-Block (ca. 20mm)
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  summenY += 5;
  doc.text(`Zahlungsziel: ${daten.zahlungsziel}`, 25, summenY);
  
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
  
  // Prüfe Platz für Grußformel (ca. 15mm)
  summenY = await ensureSpace(doc, summenY, 15, stammdaten);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Wir freuen uns auf Ihre Rückmeldung und verbleiben', 25, summenY);
  summenY += 5;
  doc.text('mit freundlichen Grüßen', 25, summenY);
  summenY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');

  // Footer auf erster Seite (und allen weiteren, falls vorhanden)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addDIN5008Footer(doc, stammdaten);
  }

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
  await addDIN5008Header(doc, stammdaten);
  
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
      pos.artikelnummer || '-',  // Artikel-Nr. als erste Spalte
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
    head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [237, 137, 54], // orange-500
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
      1: { cellWidth: 68, valign: 'top' },     // Bezeichnung
      2: { cellWidth: 16, halign: 'right' },   // Menge
      3: { cellWidth: 16 },                    // Einh.
      4: { cellWidth: 22, halign: 'right', valign: 'top' },  // Stückpr. - oben ausgerichtet
      5: { cellWidth: 22, halign: 'right', valign: 'top' }    // Gesamt - oben ausgerichtet
    }, // Summe: 160mm (passt zu 165mm Content-Breite bei DIN 5008)
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
  
  // Prüfe ob genug Platz für Summen-Block
  summenY = await ensureSpace(doc, summenY, 40, stammdaten);
  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  
  const summenX = 125;
  summenY += 10;
  
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
  
  // === Liefersaison-Hinweis ===
  summenY += 12;
  summenY = await ensureSpace(doc, summenY, 10, stammdaten);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  const liefersaisonText = getLiefersaisonText(2026);
  doc.text(liefersaisonText, 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  // === Lieferbedingungen ===
  summenY += 10;
  
  // Prüfe Platz für Lieferbedingungen-Block
  summenY = await ensureSpace(doc, summenY, 25, stammdaten);
  
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
  
  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    summenY += 2;
    const lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    const lieferbedingungenHeight = getTextHeight(lieferbedingungenLines);
    
    // Prüfe ob genug Platz für Lieferbedingungen-Text
    summenY = await ensureSpace(doc, summenY, lieferbedingungenHeight, stammdaten);
    
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += lieferbedingungenHeight;
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;
  
  // Prüfe Platz für Zahlungsbedingungen-Block
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);
  
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
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Wir danken für Ihr Vertrauen und freuen uns auf eine erfolgreiche Zusammenarbeit.', 25, summenY);
  summenY += 8;
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

// === LIEFERSCHEIN ===
export const generiereLieferscheinPDF = async (daten: LieferscheinDaten, stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }
  
  const doc = new jsPDF();
  
  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);
  
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
      pos.artikelnummer || '-',  // Artikel-Nr. als erste Spalte
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
    margin: { left: 25, right: 20, bottom: 30 }, // DIN 5008: links 25mm, rechts 20mm
    head: [['Art.Nr.', 'Artikel', 'Menge', 'Einh.', 'Serien-/Chargennr.']],
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
      1: { cellWidth: 66 },                    // Artikel
      2: { cellWidth: 16, halign: 'right' },   // Menge
      3: { cellWidth: 18 },                    // Einh.
      4: { cellWidth: 44 }                     // Serien-/Chargennr.
    }, // Summe: 160mm
    // WICHTIG: Automatische Seitenumbrüche mit Header und Footer auf jeder Seite
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });
  
  let signY = (doc as any).lastAutoTable.finalY || yPos + 40;
  
  // === Empfangsbestätigung ===
  signY += 20;
  
  // Prüfe Platz für Empfangsbestätigung
  signY = await ensureSpace(doc, signY, 30, stammdaten);
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
    
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 5;
    
    // Prüfe Platz für Bemerkung
    signY = await ensureSpace(doc, signY, bemerkungHeight, stammdaten);
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Bemerkung:', 25, signY);
    signY += 5;
    doc.text(bemerkungLines, 25, signY);
    signY += (bemerkungLines.length * 4);
  }
  
  // === Grußformel ===
  signY += 12;
  
  // Prüfe Platz für Grußformel
  signY = await ensureSpace(doc, signY, 10, stammdaten);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Mit freundlichen Grüßen', 25, signY);
  signY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, signY);
  doc.setFont('helvetica', 'normal');

  // Footer auf allen Seiten
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addDIN5008Footer(doc, stammdaten);
  }

  return doc;
};
