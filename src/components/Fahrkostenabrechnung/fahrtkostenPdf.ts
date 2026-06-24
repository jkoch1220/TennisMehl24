import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Fahrt } from '../../types/fahrtkosten';

interface PdfOptions {
  /** Bereits gefilterte & sortierte Fahrten */
  fahrten: Fahrt[];
  /** Name der Firma, wenn auf eine einzelne gefiltert wurde */
  firmaName?: string;
  /** Name der Person, wenn auf eine einzelne gefiltert wurde */
  personName?: string;
  von: string; // YYYY-MM-DD
  bis: string; // YYYY-MM-DD
}

const fmtDatum = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE');
const fmtEuro = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
const fmtZahl = (n: number) => String(n).replace('.', ',');

/**
 * Erzeugt eine abrechnungsfertige Fahrtkosten-PDF (A4 quer).
 * Jede Firma ist ein eigener Beleg auf einer eigenen Seite.
 */
export function generiereFahrtkostenPdf({ fahrten, firmaName, personName, von, bis }: PdfOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginLeft = 14;
  const pageWidth = doc.internal.pageSize.getWidth();   // ~297
  const pageHeight = doc.internal.pageSize.getHeight(); // ~210
  const rightX = pageWidth - marginLeft;
  const showPerson = !personName; // Person-Spalte nur, wenn nicht auf eine Person gefiltert
  const kmCol = showPerson ? 5 : 4;

  const head = [[
    'Datum',
    ...(showPerson ? ['Person'] : []),
    'Strecke',
    'Auto',
    'km-Stand',
    'km',
    '€/km',
    'Betrag',
    'Kommentar',
  ]];

  // ---- Gruppierung nach Firma ----
  const groups = new Map<string, Fahrt[]>();
  fahrten.forEach(f => {
    const key = f.firmaName || '(ohne Firma)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  });
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const zeichneBeleg = (name: string, rows: Fahrt[]) => {
    let y = 16;

    // Kopf
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Fahrtkosten-Abrechnung', marginLeft, y);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('TennisMehl GmbH', rightX, y, { align: 'right' });
    y += 9;

    // Firma prominent
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`Firma: ${name}`, marginLeft, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Zeitraum: ${fmtDatum(von)} – ${fmtDatum(bis)}`, marginLeft, y);
    if (personName) doc.text(`Person: ${personName}`, marginLeft + 110, y);
    y += 3;

    const body = rows.map(f => [
      fmtDatum(f.datum),
      ...(showPerson ? [f.personName || ''] : []),
      `${f.startort} → ${f.zielort}`,
      f.autoName || '',
      (f.startKm != null && f.endKm != null) ? `${f.startKm}–${f.endKm}` : '',
      fmtZahl(f.kilometer),
      f.kilometerPauschale.toFixed(2).replace('.', ','),
      fmtEuro(f.betrag),
      f.kommentar || '',
    ]);

    const summeKm = rows.reduce((s, f) => s + f.kilometer, 0);
    const summeBetrag = Math.round(rows.reduce((s, f) => s + f.betrag, 0) * 100) / 100;

    const foot = [head[0].map((_, i) => {
      if (i === 0) return 'Summe';
      if (i === kmCol) return fmtZahl(summeKm);
      if (i === kmCol + 2) return fmtEuro(summeBetrag);
      return '';
    })];

    autoTable(doc, {
      startY: y + 2,
      head,
      body,
      foot,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 1.4, overflow: 'linebreak' },
      columnStyles: {
        [kmCol]: { halign: 'right', cellWidth: 14 },
        [kmCol + 1]: { halign: 'right', cellWidth: 16 },
        [kmCol + 2]: { halign: 'right', cellWidth: 22 },
      },
      margin: { left: marginLeft, right: marginLeft },
    });

    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    // Unterschriften-Block (unten auf der Seite, sonst neue Seite)
    let sigY: number;
    if (finalY > pageHeight - 30) { doc.addPage(); sigY = 30; } else { sigY = pageHeight - 24; }
    const sigWidth = 80;
    doc.setDrawColor(120, 120, 120);
    doc.line(marginLeft, sigY, marginLeft + sigWidth, sigY);
    doc.line(rightX - sigWidth, sigY, rightX, sigY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Datum, Unterschrift Mitarbeiter', marginLeft, sigY + 4);
    doc.text('Geprüft – Buchhaltung', rightX - sigWidth, sigY + 4);
    doc.setTextColor(0, 0, 0);
  };

  sortedGroups.forEach(([name, rows], index) => {
    if (index > 0) doc.addPage();
    zeichneBeleg(name, rows);
  });

  const fileLabel = (firmaName || 'AlleFirmen').replace(/[\\/?*[\]:\s]+/g, '_');
  doc.save(`Fahrtkosten_${fileLabel}_${von}_bis_${bis}.pdf`);
}
