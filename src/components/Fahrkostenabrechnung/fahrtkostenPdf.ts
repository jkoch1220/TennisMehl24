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

/** Erzeugt eine abrechnungsfertige Fahrtkosten-PDF (A4 quer, gruppiert pro Firma) und lädt sie herunter. */
export function generiereFahrtkostenPdf({ fahrten, firmaName, personName, von, bis }: PdfOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginLeft = 14;
  const pageWidth = doc.internal.pageSize.getWidth();   // ~297
  const pageHeight = doc.internal.pageSize.getHeight(); // ~210
  const rightX = pageWidth - marginLeft;
  const showPerson = !personName; // Person-Spalte nur, wenn nicht auf eine Person gefiltert
  let y = 16;

  // ---- Kopf ----
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Fahrtkosten-Abrechnung', marginLeft, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TennisMehl GmbH', rightX, y, { align: 'right' });
  y += 8;

  doc.setFontSize(10);
  doc.text(`Zeitraum: ${fmtDatum(von)} – ${fmtDatum(bis)}`, marginLeft, y);
  if (personName) doc.text(`Person: ${personName}`, marginLeft + 90, y);
  if (firmaName) doc.text(`Firma: ${firmaName}`, marginLeft + 180, y);
  y += 4;

  // ---- Gruppierung nach Firma ----
  const groups = new Map<string, Fahrt[]>();
  fahrten.forEach(f => {
    const key = f.firmaName || '(ohne Firma)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  });
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let gesamtKm = 0;
  let gesamtBetrag = 0;

  const head = [[
    'Datum',
    ...(showPerson ? ['Person'] : []),
    'Firma',
    'Strecke',
    'Auto',
    'km-Stand',
    'km',
    '€/km',
    'Betrag',
    'Kommentar',
  ]];

  sortedGroups.forEach(([name, rows]) => {
    if (y > pageHeight - 45) { doc.addPage(); y = 16; }

    // Firmen-Überschrift
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(name, marginLeft, y);
    doc.setFont('helvetica', 'normal');

    const body = rows.map(f => [
      fmtDatum(f.datum),
      ...(showPerson ? [f.personName || ''] : []),
      f.firmaName || '',
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
    gesamtKm += summeKm;
    gesamtBetrag += summeBetrag;

    const kmCol = showPerson ? 6 : 5;
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

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  });

  // ---- Gesamtsumme (bei mehreren Firmen) ----
  if (sortedGroups.length > 1) {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    doc.setDrawColor(220, 38, 38);
    doc.line(marginLeft, y - 2, rightX, y - 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Gesamt: ${fmtZahl(gesamtKm)} km`, marginLeft, y + 4);
    doc.text(fmtEuro(gesamtBetrag), rightX, y + 4, { align: 'right' });
    y += 10;
  }

  // ---- Unterschriften-Block ----
  if (y > pageHeight - 30) { doc.addPage(); y = 20; }
  const sigY = Math.max(y + 16, pageHeight - 24);
  const sigWidth = 80;
  doc.setDrawColor(120, 120, 120);
  doc.line(marginLeft, sigY, marginLeft + sigWidth, sigY);
  doc.line(rightX - sigWidth, sigY, rightX, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Datum, Unterschrift Mitarbeiter', marginLeft, sigY + 4);
  doc.text('Geprüft – Buchhaltung', rightX - sigWidth, sigY + 4);

  const fileLabel = (firmaName || 'AlleFirmen').replace(/[\\/?*[\]:\s]+/g, '_');
  doc.save(`Fahrtkosten_${fileLabel}_${von}_bis_${bis}.pdf`);
}
