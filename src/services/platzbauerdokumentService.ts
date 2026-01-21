/**
 * Platzbauer-Dokument-Service
 *
 * PDF-Generierung für Platzbauer-Dokumente:
 * - Angebote (alle Vereine als Positionen)
 * - Auftragsbestätigungen (alle Vereine als Positionen)
 * - Rechnungen (alle Vereine als Positionen)
 * - Lieferscheine (einzeln pro Verein)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Stammdaten } from '../types/stammdaten';
import { PlatzbauerPosition, PlatzbauerProjekt } from '../types/platzbauer';
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
  formatStrasseHausnummer
} from './pdfHelpers';

// Farbe für Platzbauer-Dokumente (orange)
const primaryColor: [number, number, number] = [237, 137, 54]; // orange-500

// ==================== TYPES ====================

export interface PlatzbauerAngebotsDaten {
  // Projekt-Informationen
  projekt: PlatzbauerProjekt;

  // Angebotsnummer & Datum
  angebotsnummer: string;
  angebotsdatum: string;
  gueltigBis: string;

  // Platzbauer-Daten (Empfänger)
  platzbauerId: string;
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Positionen (Vereine)
  positionen: PlatzbauerPosition[];

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

export interface PlatzbauerAuftragsbestaetigungsDaten {
  // Projekt-Informationen
  projekt: PlatzbauerProjekt;

  // AB-Nummer & Datum
  auftragsbestaetigungsnummer: string;
  auftragsbestaetigungsdatum: string;

  // Platzbauer-Daten (Empfänger)
  platzbauerId: string;
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Positionen (Vereine)
  positionen: PlatzbauerPosition[];

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

export interface PlatzbauerRechnungsDaten {
  // Projekt-Informationen
  projekt: PlatzbauerProjekt;

  // Rechnungsnummer & Datum
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;

  // Platzbauer-Daten (Empfänger)
  platzbauerId: string;
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Positionen (Vereine)
  positionen: PlatzbauerPosition[];

  // Zahlungsbedingungen
  zahlungsziel: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

export interface PlatzbauerLieferscheinDaten {
  // Projekt-Informationen
  projekt: PlatzbauerProjekt;

  // Lieferscheinnummer & Datum
  lieferscheinnummer: string;
  lieferdatum: string;

  // Verein (Empfänger des Lieferscheins)
  vereinId: string;
  vereinsname: string;
  vereinsstrasse: string;
  vereinsPlzOrt: string;
  vereinsAnsprechpartner?: string;

  // Lieferadresse (falls abweichend)
  lieferadresseAbweichend?: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;

  // Menge
  menge: number;
  einheit: string;

  // Platzbauer-Info (wird im Infoblock angezeigt)
  platzbauername?: string;

  // Bemerkung
  bemerkung?: string;

  // Empfangsbestätigung
  unterschriftenFuerEmpfangsbestaetigung?: boolean;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

// ==================== ANGEBOT ====================

export const generierePlatzbauerAngebotPDF = async (
  daten: PlatzbauerAngebotsDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === INFORMATIONSBLOCK - Rechts oben ===
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

  infoYPos += 10;
  doc.setTextColor(100, 100, 100);
  doc.text('Saison:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(daten.projekt.saisonjahr.toString(), infoX, infoYPos + 4);

  if (daten.ihreAnsprechpartner) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Ihr Ansprechpartner:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.ihreAnsprechpartner, infoX, infoYPos + 4);
  }

  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);

  // === EMPFÄNGERADRESSE (Platzbauer) ===
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.platzbauername, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(formatStrasseHausnummer(daten.platzbauerstrasse), 25, yPos);
  yPos += 5;
  doc.text(daten.platzbauerPlzOrt, 25, yPos);

  if (daten.platzbauerAnsprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.platzbauerAnsprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === BETREFF ===
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Angebot Nr. ${daten.angebotsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');

  // Untertitel mit Projektname
  yPos += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Projekt: ${daten.projekt.projektName}`, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);

  // === Einleitungstext ===
  yPos += 8;
  doc.text('gerne unterbreiten wir Ihnen folgendes Angebot für die Belieferung Ihrer Vereine:', 25, yPos);

  // === Positionen Tabelle (Vereine) ===
  yPos += 8;

  const tableData = daten.positionen.map((pos, index) => {
    // Adresse formatieren
    let adresseText = pos.vereinsname;
    if (pos.lieferadresse) {
      adresseText += `\n${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`;
    }

    return [
      (index + 1).toString(),
      adresseText,
      pos.menge.toFixed(1),
      't',
      formatWaehrung(pos.einzelpreis),
      formatWaehrung(pos.gesamtpreis)
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, top: 45, bottom: 30 },
    head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid',
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
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70, valign: 'top' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 14 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' }
    },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });

  // === Summen ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  summenY = await ensureSpace(doc, summenY, 35, stammdaten);

  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  const gesamtMenge = daten.positionen.reduce((sum, pos) => sum + pos.menge, 0);

  const summenX = 125;
  summenY += 6;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Gesamtmenge
  doc.text('Gesamtmenge:', summenX, summenY);
  doc.text(`${gesamtMenge.toFixed(1)} t`, 180, summenY, { align: 'right' });

  summenY += 6;
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
  summenY += 10;
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
    summenY += 4;
  }

  doc.text(`Anzahl Vereine: ${daten.positionen.length}`, 25, summenY);
  summenY += 4;

  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    summenY += 2;
    const lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    const lieferbedingungenHeight = getTextHeight(lieferbedingungenLines);
    summenY = await ensureSpace(doc, summenY, lieferbedingungenHeight, stammdaten);
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += lieferbedingungenHeight;
  }

  // === Zahlungsbedingungen ===
  summenY += 5;
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
    summenY += 6;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 4;
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);
    doc.setFontSize(9);
    doc.text('Bemerkung:', 25, summenY);
    summenY += 4;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }

  // === Grußformel ===
  summenY += 8;
  summenY = await ensureSpace(doc, summenY, 12, stammdaten);

  doc.setFontSize(10);
  doc.text('Wir freuen uns auf Ihre Rückmeldung und verbleiben', 25, summenY);
  summenY += 4;
  doc.text('mit freundlichen Grüßen', 25, summenY);
  summenY += 4;
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

// ==================== AUFTRAGSBESTÄTIGUNG ====================

export const generierePlatzbauerAuftragsbestaetigungPDF = async (
  daten: PlatzbauerAuftragsbestaetigungsDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === INFORMATIONSBLOCK - Rechts oben ===
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

  infoYPos += 10;
  doc.setTextColor(100, 100, 100);
  doc.text('Saison:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(daten.projekt.saisonjahr.toString(), infoX, infoYPos + 4);

  if (daten.ihreAnsprechpartner) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Ihr Ansprechpartner:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.ihreAnsprechpartner, infoX, infoYPos + 4);
  }

  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);

  // === EMPFÄNGERADRESSE (Platzbauer) ===
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.platzbauername, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(formatStrasseHausnummer(daten.platzbauerstrasse), 25, yPos);
  yPos += 5;
  doc.text(daten.platzbauerPlzOrt, 25, yPos);

  if (daten.platzbauerAnsprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.platzbauerAnsprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === BETREFF ===
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Auftragsbestätigung Nr. ${daten.auftragsbestaetigungsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');

  // Untertitel mit Projektname
  yPos += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Projekt: ${daten.projekt.projektName}`, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);

  // === Einleitungstext ===
  yPos += 8;
  doc.text('vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Lieferungen:', 25, yPos);

  // === Positionen Tabelle (Vereine) ===
  yPos += 8;

  const tableData = daten.positionen.map((pos, index) => {
    let adresseText = pos.vereinsname;
    if (pos.lieferadresse) {
      adresseText += `\n${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`;
    }

    return [
      (index + 1).toString(),
      adresseText,
      pos.menge.toFixed(1),
      't',
      formatWaehrung(pos.einzelpreis),
      formatWaehrung(pos.gesamtpreis)
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, top: 45, bottom: 30 },
    head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid',
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
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70, valign: 'top' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 14 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' }
    },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });

  // === Summen ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  summenY = await ensureSpace(doc, summenY, 35, stammdaten);

  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  const gesamtMenge = daten.positionen.reduce((sum, pos) => sum + pos.menge, 0);

  const summenX = 125;
  summenY += 6;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Gesamtmenge
  doc.text('Gesamtmenge:', summenX, summenY);
  doc.text(`${gesamtMenge.toFixed(1)} t`, 180, summenY, { align: 'right' });

  summenY += 6;
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
  summenY += 10;
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
    summenY += 4;
  }

  doc.text(`Anzahl Vereine: ${daten.positionen.length}`, 25, summenY);
  summenY += 4;

  doc.text('Lieferung erfolgt direkt an die jeweiligen Vereine laut Adressliste.', 25, summenY);
  summenY += 4;

  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    summenY += 2;
    const lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    const lieferbedingungenHeight = getTextHeight(lieferbedingungenLines);
    summenY = await ensureSpace(doc, summenY, lieferbedingungenHeight, stammdaten);
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += lieferbedingungenHeight;
  }

  // === Zahlungsbedingungen ===
  summenY += 5;
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
    summenY += 6;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 4;
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);
    doc.setFontSize(9);
    doc.text('Bemerkung:', 25, summenY);
    summenY += 4;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }

  // === Grußformel ===
  summenY += 8;
  summenY = await ensureSpace(doc, summenY, 15, stammdaten);

  doc.setFontSize(10);
  doc.text('Wir danken für Ihr Vertrauen und freuen uns auf eine erfolgreiche Zusammenarbeit.', 25, summenY);
  summenY += 5;
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 4;
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

// ==================== RECHNUNG ====================

export const generierePlatzbauerRechnungPDF = async (
  daten: PlatzbauerRechnungsDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === INFORMATIONSBLOCK - Rechts oben ===
  let infoYPos = 55;
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

  infoYPos += 10;
  doc.setTextColor(100, 100, 100);
  doc.text('Saison:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(daten.projekt.saisonjahr.toString(), infoX, infoYPos + 4);

  if (daten.ihreAnsprechpartner) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Ihr Ansprechpartner:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.ihreAnsprechpartner, infoX, infoYPos + 4);
  }

  // DIN 5008 Absenderzeile
  addAbsenderzeile(doc, stammdaten);

  // === EMPFÄNGERADRESSE (Platzbauer) ===
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.platzbauername, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(formatStrasseHausnummer(daten.platzbauerstrasse), 25, yPos);
  yPos += 5;
  doc.text(daten.platzbauerPlzOrt, 25, yPos);

  if (daten.platzbauerAnsprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.platzbauerAnsprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === BETREFF ===
  yPos = 95;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rechnung Nr. ${daten.rechnungsnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');

  // Untertitel mit Projektname
  yPos += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Projekt: ${daten.projekt.projektName}`, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);

  // === Einleitungstext ===
  yPos += 8;
  doc.text('wir erlauben uns, Ihnen folgende Lieferungen in Rechnung zu stellen:', 25, yPos);

  // === Positionen Tabelle (Vereine) ===
  yPos += 8;

  const tableData = daten.positionen.map((pos, index) => {
    let adresseText = pos.vereinsname;
    if (pos.lieferadresse) {
      adresseText += `\n${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`;
    }

    return [
      (index + 1).toString(),
      adresseText,
      pos.menge.toFixed(1),
      't',
      formatWaehrung(pos.einzelpreis),
      formatWaehrung(pos.gesamtpreis)
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, top: 45, bottom: 30 },
    head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid',
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
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70, valign: 'top' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 14 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' }
    },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });

  // === Summen ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  summenY = await ensureSpace(doc, summenY, 35, stammdaten);

  const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const umsatzsteuer = nettobetrag * 0.19;
  const bruttobetrag = nettobetrag + umsatzsteuer;
  const gesamtMenge = daten.positionen.reduce((sum, pos) => sum + pos.menge, 0);

  const summenX = 125;
  summenY += 6;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Gesamtmenge
  doc.text('Gesamtmenge:', summenX, summenY);
  doc.text(`${gesamtMenge.toFixed(1)} t`, 180, summenY, { align: 'right' });

  summenY += 6;
  doc.text('Nettobetrag:', summenX, summenY);
  doc.text(formatWaehrung(nettobetrag), 180, summenY, { align: 'right' });

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
  doc.text('Rechnungsbetrag:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 180, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // === Zahlungsbedingungen ===
  summenY += 10;
  summenY = await ensureSpace(doc, summenY, 25, stammdaten);

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

  // Bankverbindung
  summenY += 8;
  doc.setFontSize(9);
  doc.text(`Bitte überweisen Sie den Betrag auf folgendes Konto:`, 25, summenY);
  summenY += 4;
  doc.text(`${stammdaten.bankname} · IBAN: ${stammdaten.iban} · BIC: ${stammdaten.bic}`, 25, summenY);

  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 8;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 4;
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);
    doc.setFontSize(9);
    doc.text('Bemerkung:', 25, summenY);
    summenY += 4;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }

  // === Grußformel ===
  summenY += 8;
  summenY = await ensureSpace(doc, summenY, 10, stammdaten);

  doc.setFontSize(10);
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 4;
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

// ==================== LIEFERSCHEIN (EINZELN PRO VEREIN) ====================

export const generierePlatzbauerLieferscheinPDF = async (
  daten: PlatzbauerLieferscheinDaten,
  stammdaten?: Stammdaten
): Promise<jsPDF> => {
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === INFORMATIONSBLOCK - Rechts oben ===
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

  infoYPos += 10;
  doc.setTextColor(100, 100, 100);
  doc.text('Saison:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(daten.projekt.saisonjahr.toString(), infoX, infoYPos + 4);

  if (daten.platzbauername) {
    infoYPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.text('Platzbauer:', infoX, infoYPos);
    doc.setTextColor(0, 0, 0);
    doc.text(daten.platzbauername, infoX, infoYPos + 4);
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

  // === EMPFÄNGERADRESSE (Verein) ===
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.vereinsname, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(formatStrasseHausnummer(daten.vereinsstrasse), 25, yPos);
  yPos += 5;
  doc.text(daten.vereinsPlzOrt, 25, yPos);

  if (daten.vereinsAnsprechpartner) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.vereinsAnsprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === Lieferadresse (falls abweichend) ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    yPos += 9;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.line(30, yPos, 75, yPos);
    yPos += 9;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Lieferadresse:', 25, yPos);
    yPos += 6;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(daten.lieferadresseName, 25, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 6;

    if (daten.lieferadresseStrasse) {
      doc.text(formatStrasseHausnummer(daten.lieferadresseStrasse), 25, yPos);
      yPos += 5;
    }

    if (daten.lieferadressePlzOrt) {
      doc.text(daten.lieferadressePlzOrt, 25, yPos);
      yPos += 5;
    }
  }

  // === BETREFF ===
  const betrefYPos = daten.lieferadresseAbweichend && daten.lieferadresseName
    ? Math.max(yPos + 10, 95)
    : 95;
  yPos = betrefYPos;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Lieferschein Nr. ${daten.lieferscheinnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');

  // Untertitel mit Projektname
  yPos += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Projekt: ${daten.projekt.projektName}`, 25, yPos);
  doc.setTextColor(0, 0, 0);

  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);

  // === Einleitungstext ===
  yPos += 8;
  doc.text('wir liefern Ihnen wie folgt:', 25, yPos);

  // === Positionen Tabelle (OHNE PREISE) ===
  yPos += 8;

  const tableData = [
    [
      '1',
      'Ziegelmehl für Tennisplätze',
      daten.menge.toFixed(1),
      daten.einheit
    ]
  ];

  autoTable(doc, {
    startY: yPos,
    margin: { left: 25, right: 20, top: 45, bottom: 30 },
    head: [['Pos.', 'Artikel', 'Menge', 'Einheit']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid',
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
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 90, valign: 'top' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25 }
    },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) {
        addFollowPageHeader(doc, stammdaten);
        addDIN5008Footer(doc, stammdaten);
      }
    }
  });

  let signY = (doc as any).lastAutoTable.finalY || yPos + 40;

  // === Empfangsbestätigung ===
  const zeigeEmpfangsbestaetigung = daten.unterschriftenFuerEmpfangsbestaetigung !== false;

  if (zeigeEmpfangsbestaetigung) {
    signY += 20;
    signY = await ensureSpace(doc, signY, 30, stammdaten);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Empfangsbestätigung:', 25, signY);
    doc.setFont('helvetica', 'normal');

    signY += 10;
    doc.setFontSize(9);
    doc.text('Ware erhalten am:', 25, signY);
    doc.line(60, signY, 100, signY);

    signY += 15;
    doc.text('Unterschrift Empfänger:', 25, signY);
    doc.line(65, signY, 125, signY);
  }

  // === Bemerkung ===
  if (daten.bemerkung) {
    signY += 15;
    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 5;
    signY = await ensureSpace(doc, signY, bemerkungHeight, stammdaten);

    doc.setFontSize(9);
    doc.text('Bemerkung:', 25, signY);
    signY += 5;
    doc.text(bemerkungLines, 25, signY);
    signY += (bemerkungLines.length * 4);
  }

  // === Grußformel ===
  signY += 12;
  signY = await ensureSpace(doc, signY, 10, stammdaten);

  doc.setFontSize(10);
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

// ==================== HELPER FUNKTIONEN ====================

/**
 * Bereitet die Positionen für ein Platzbauer-Dokument vor
 * Sammelt alle zugeordneten Vereinsprojekte und formatiert sie als Positionen
 */
export const preparePositionenFuerPlatzbauer = (
  vereine: Array<{
    id: string;
    name: string;
    menge: number;
    einzelpreis: number;
    lieferadresse?: {
      strasse: string;
      plz: string;
      ort: string;
    };
    projektStatus?: string;
    vereinsprojektId: string;
    lieferscheinErstellt?: boolean;
    lieferscheinId?: string;
  }>
): PlatzbauerPosition[] => {
  return vereine.map(verein => ({
    vereinId: verein.id,
    vereinsname: verein.name,
    vereinsprojektId: verein.vereinsprojektId,
    menge: verein.menge,
    einzelpreis: verein.einzelpreis,
    gesamtpreis: verein.menge * verein.einzelpreis,
    lieferadresse: verein.lieferadresse,
    projektStatus: verein.projektStatus as any,
    lieferscheinErstellt: verein.lieferscheinErstellt,
    lieferscheinId: verein.lieferscheinId
  }));
};

/**
 * Berechnet die Gesamtsummen für ein Platzbauer-Dokument
 */
export const berechnePlatzbauerSummen = (positionen: PlatzbauerPosition[]) => {
  const nettobetrag = positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const gesamtMenge = positionen.reduce((sum, pos) => sum + pos.menge, 0);
  const umsatzsteuer = nettobetrag * 0.19;
  const bruttobetrag = nettobetrag + umsatzsteuer;

  return {
    gesamtMenge,
    nettobetrag,
    umsatzsteuer,
    bruttobetrag,
    anzahlPositionen: positionen.length
  };
};
