import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Siebanalyse, SIEB_TOLERANZEN } from '../types/qualitaetssicherung';
import { Stammdaten } from '../types/stammdaten';
import { addDIN5008Footer, addDIN5008Header } from '../services/pdfHelpers';

// Fallback-Stammdaten wenn keine vorhanden
const FALLBACK_STAMMDATEN: Stammdaten = {
  firmenname: 'TennisMehl24',
  firmenstrasse: '',
  firmenPlz: '',
  firmenOrt: '',
  firmenTelefon: '',
  firmenEmail: '',
  firmenWebsite: '',
  geschaeftsfuehrer: [],
  handelsregister: '',
  sitzGesellschaft: '',
  steuernummer: '',
  ustIdNr: '',
  bankname: '',
  iban: '',
  bic: '',
};

/**
 * Generiert einen professionellen QS-Prüfbericht im PDF-Format
 * nach DIN 18035-5 für Tennismehl 0/2
 */
export async function generateQSPruefbericht(
  analyse: Siebanalyse,
  stammdatenInput: Stammdaten | null
): Promise<void> {
  const stammdaten = stammdatenInput || FALLBACK_STAMMDATEN;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.width;
  const marginLeft = 25;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let currentY = 17;

  // Header mit Logo
  try {
    await addDIN5008Header(doc, stammdaten);
  } catch (e) {
    console.warn('Logo konnte nicht geladen werden:', e);
  }

  // Titel
  currentY = 45;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // Emerald-500
  doc.text('PRÜFBERICHT SIEBANALYSE', marginLeft, currentY);

  // Untertitel
  currentY += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128); // Gray-500
  doc.text('Tennismehl 0/2 nach DIN 18035-5', marginLeft, currentY);

  // Trennlinie
  currentY += 5;
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);

  // Chargen-Info Box
  currentY += 10;
  doc.setFillColor(240, 253, 244); // Green-50
  doc.setDrawColor(187, 247, 208); // Green-200
  doc.roundedRect(marginLeft, currentY, contentWidth, 35, 3, 3, 'FD');

  // Chargen-Info Inhalt
  currentY += 8;
  doc.setFontSize(10);
  doc.setTextColor(22, 101, 52); // Green-800

  // Spalte 1
  doc.setFont('helvetica', 'bold');
  doc.text('Chargen-Nr.:', marginLeft + 5, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(analyse.chargenNummer, marginLeft + 35, currentY);

  // Spalte 2
  doc.setFont('helvetica', 'bold');
  doc.text('Prüfdatum:', marginLeft + 85, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(analyse.pruefDatum).toLocaleDateString('de-DE'), marginLeft + 115, currentY);

  // Zeile 2
  currentY += 8;
  if (analyse.kundeName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Kunde:', marginLeft + 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(analyse.kundeName, marginLeft + 35, currentY);
  }

  if (analyse.projektName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Projekt:', marginLeft + 85, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(analyse.projektName.substring(0, 30), marginLeft + 115, currentY);
  }

  // Zeile 3 - Erstellt
  currentY += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Erstellt am:', marginLeft + 5, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(analyse.erstelltAm).toLocaleString('de-DE'), marginLeft + 35, currentY);

  // Ergebnis-Box
  currentY += 20;
  const ergebnisColor = analyse.ergebnis === 'bestanden'
    ? { bg: [220, 252, 231], border: [34, 197, 94], text: [22, 101, 52] }  // Green
    : { bg: [254, 226, 226], border: [239, 68, 68], text: [127, 29, 29] }; // Red

  doc.setFillColor(ergebnisColor.bg[0], ergebnisColor.bg[1], ergebnisColor.bg[2]);
  doc.setDrawColor(ergebnisColor.border[0], ergebnisColor.border[1], ergebnisColor.border[2]);
  doc.setLineWidth(1);
  doc.roundedRect(marginLeft, currentY, contentWidth, 15, 3, 3, 'FD');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(ergebnisColor.text[0], ergebnisColor.text[1], ergebnisColor.text[2]);
  const ergebnisText = analyse.ergebnis === 'bestanden'
    ? 'ERGEBNIS: BESTANDEN'
    : 'ERGEBNIS: NICHT BESTANDEN';
  const textWidth = doc.getTextWidth(ergebnisText);
  doc.text(ergebnisText, marginLeft + (contentWidth - textWidth) / 2, currentY + 10);

  // Siebanalyse-Tabelle
  currentY += 25;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 41, 55); // Gray-800
  doc.text('Siebanalyse-Ergebnisse', marginLeft, currentY);

  currentY += 5;

  // Tabellen-Daten vorbereiten
  const tableData = SIEB_TOLERANZEN.map((toleranz) => {
    const wert = analyse.siebwerte[toleranz.sieb];
    const inToleranz = wert >= toleranz.min && wert <= toleranz.max;
    const sollBereich = toleranz.min === toleranz.max
      ? `${toleranz.min}%`
      : `${toleranz.min} - ${toleranz.max}%`;

    return [
      `${toleranz.label} ${toleranz.einheit}`,
      `${wert.toFixed(1)}%`,
      sollBereich,
      inToleranz ? 'OK' : 'ABWEICHUNG',
    ];
  });

  // AutoTable für Siebanalyse
  (doc as jsPDF & { autoTable: (options: Record<string, unknown>) => void }).autoTable({
    startY: currentY,
    head: [['Siebgröße', 'Ist-Wert', 'Soll-Bereich', 'Bewertung']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 40 },
      1: { halign: 'center', cellWidth: 35 },
      2: { halign: 'center', cellWidth: 45 },
      3: { halign: 'center', cellWidth: 45 },
    },
    bodyStyles: {
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244],
    },
    didParseCell: function(data: { column: { index: number }; cell: { raw: unknown; styles: { textColor: number[]; fontStyle: string } } }) {
      if (data.column.index === 3) {
        const value = data.cell.raw;
        if (value === 'OK') {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = 'bold';
        } else if (value === 'ABWEICHUNG') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: marginLeft, right: marginRight },
  });

  // Aktuelle Y-Position nach Tabelle
  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Abweichungen (falls vorhanden)
  if (analyse.abweichungen.length > 0) {
    doc.setFillColor(254, 242, 242); // Red-50
    doc.setDrawColor(252, 165, 165); // Red-300
    doc.roundedRect(marginLeft, currentY, contentWidth, 8 + analyse.abweichungen.length * 6, 3, 3, 'FD');

    currentY += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28); // Red-700
    doc.text('Abweichungen:', marginLeft + 5, currentY);

    doc.setFont('helvetica', 'normal');
    analyse.abweichungen.forEach((abw) => {
      currentY += 6;
      doc.text(`• ${abw}`, marginLeft + 8, currentY);
    });

    currentY += 10;
  }

  // Notizen (falls vorhanden)
  if (analyse.notizen) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 41, 55);
    doc.text('Bemerkungen:', marginLeft, currentY);

    currentY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    const notizenLines = doc.splitTextToSize(analyse.notizen, contentWidth);
    doc.text(notizenLines, marginLeft, currentY);
    currentY += notizenLines.length * 5;
  }

  // DIN-Norm Hinweis
  currentY += 10;
  doc.setFillColor(239, 246, 255); // Blue-50
  doc.setDrawColor(147, 197, 253); // Blue-300
  doc.roundedRect(marginLeft, currentY, contentWidth, 20, 3, 3, 'FD');

  currentY += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138); // Blue-900
  doc.text('Normkonformität', marginLeft + 5, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(59, 130, 246); // Blue-500
  doc.text('Prüfung erfolgte gemäß DIN 18035-5 (Sportplätze - Tennenflächen)', marginLeft + 5, currentY);
  currentY += 4;
  doc.text('und ITF Guide to Tennis Court Specifications.', marginLeft + 5, currentY);

  // Unterschriftsbereich
  currentY += 25;
  doc.setDrawColor(209, 213, 219); // Gray-300
  doc.setLineWidth(0.3);

  // Linke Unterschrift
  doc.line(marginLeft, currentY, marginLeft + 60, currentY);
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('Datum, Unterschrift Prüfer', marginLeft, currentY + 4);

  // Rechte Unterschrift
  doc.line(pageWidth - marginRight - 60, currentY, pageWidth - marginRight, currentY);
  doc.text('Freigabe Qualitätssicherung', pageWidth - marginRight - 60, currentY + 4);

  // Footer
  addDIN5008Footer(doc, stammdaten);

  // PDF speichern
  const fileName = `QS-Pruefbericht_${analyse.chargenNummer}_${new Date(analyse.pruefDatum).toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
