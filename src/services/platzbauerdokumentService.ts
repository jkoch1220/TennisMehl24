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
import QRCode from 'qrcode';
import { Stammdaten } from '../types/stammdaten';
import { PlatzbauerPosition, PlatzbauerProjekt, PlatzbauerAngebotPosition, StaffelKonditionen } from '../types/platzbauer';
import {
  STAFFEL_KEINE_SUMME,
  StaffelBelegart,
  erzeugeStaffelHinweistext,
  formatTonnen,
  staffelAbrufhinweis,
  staffelBestaetigungssatz,
  staffelBetreffzeile,
  staffelEinleitung,
  staffelInfoblockZeilen,
  staffelKopfzeile,
  staffelKurzfassung,
  staffelKurzfassungTitel,
  standardStaffelKonditionen,
} from '../utils/staffelpreisText';
import { getStammdatenOderDefault } from './stammdatenService';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  addFollowPageHeader,
  ensureSpace,
  formatWaehrung,
  formatDatum,
  getMaxContentY,
  getTextHeight,
  formatStrasseHausnummer
} from './pdfHelpers';

// Farbe für Platzbauer-Dokumente (orange)
const primaryColor: [number, number, number] = [237, 137, 54]; // orange-500

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
  // IBAN ohne Leerzeichen
  const ibanOhneLeerzeichen = iban.replace(/\s/g, '');

  // Betrag auf 2 Dezimalstellen formatiert
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
    '',                       // Purpose (optional)
    '',                       // Structured Reference (optional)
    verwendungszweckGekuerzt, // Unstructured Remittance Information
    ''                        // Beneficiary to Originator Information (optional)
  ];

  return epcLines.join('\n');
};

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

  // Positionen (Vereine) - alte Struktur für Kompatibilität
  positionen: PlatzbauerPosition[];

  // Erweiterte Positionen mit Artikel-Auswahl (bevorzugt falls vorhanden)
  angebotPositionen?: PlatzbauerAngebotPosition[];

  // Abrechnungsmodell und Hinweistext für Staffelpreise (fehlt bei Altbelegen → Standard)
  staffelKonditionen?: StaffelKonditionen;

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
  /**
   * Staffel- und Zusatzzeilen aus dem Angebot. Sie tragen keine Menge und
   * gehen NIE in Summen ein – deshalb ein eigenes Feld statt `positionen`.
   */
  abPositionen?: PlatzbauerAngebotPosition[];
  staffelKonditionen?: StaffelKonditionen;
  /** Bezug auf das bestätigte Angebot (Nummer und Datum). */
  angebotsbezug?: { nummer: string; datum?: string };
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

  // Proforma-Abzug (optional)
  proformaAbzugAktiviert?: boolean;
  proformaAbzugBetrag?: number;
  proformaAbzugNummer?: string;

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

export interface PlatzbauerProformaRechnungsDaten {
  // Projekt-Informationen
  projekt: PlatzbauerProjekt;

  // Proforma-Rechnungsnummer & Datum
  proformarechnungsnummer: string;
  proformarechnungsdatum: string;
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

/** Zeilenhöhe in mm für den 8-pt-Hinweistext. */
const HINWEIS_ZEILENHOEHE = 3.6;

/**
 * Zeichnet den Staffel-Hinweistext als Box mit dynamischer Höhe.
 * Absätze sind durch Leerzeilen getrennt; eine kurze erste Absatzzeile, die auf
 * „:" endet, wird fett gesetzt (Überschrift). Die frühere Box war fest 14 mm hoch
 * und zwei Zeilen lang — jeder längere Text lief aus dem Rahmen.
 *
 * Passt der Text nicht mehr auf die Seite, wird er auf mehrere Boxen verteilt
 * (eine je Seite), statt über den Fuß hinauszulaufen.
 */
const zeichneStaffelHinweisBox = async (
  doc: jsPDF,
  yPos: number,
  text: string,
  stammdaten: Stammdaten
): Promise<number> => {
  doc.setFontSize(8);
  const absaetze = text
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean);

  type Zeile = { text: string; fett: boolean; abstandDavor: number };
  const zeilen: Zeile[] = [];
  absaetze.forEach((absatz, absatzIdx) => {
    absatz.split('\n').forEach((roh, zeilenIdx) => {
      const getrimmt = roh.trim();
      const fett = zeilenIdx === 0 && getrimmt.endsWith(':') && getrimmt.length <= 80;
      doc.setFont('helvetica', fett ? 'bold' : 'normal');
      const umgebrochen: string[] = doc.splitTextToSize(getrimmt, 152);
      umgebrochen.forEach((zeile, i) => {
        zeilen.push({
          text: zeile,
          fett,
          abstandDavor: i === 0 && zeilenIdx === 0 && absatzIdx > 0 ? 2 : 0,
        });
      });
    });
  });

  const RAHMEN = 7; // Innenabstand oben + unten
  const hoeheVon = (teil: Zeile[]) => teil.reduce((s, z) => s + HINWEIS_ZEILENHOEHE + z.abstandDavor, 0) + RAHMEN;

  let rest = zeilen;
  while (rest.length > 0) {
    // Erst auf die aktuelle Seite, wenn mindestens vier Zeilen Platz haben,
    // sonst frische Seite. Dann so viele Zeilen wie auf die Seite passen.
    const mindestens = hoeheVon(rest.slice(0, Math.min(4, rest.length))) + 5;
    yPos = await ensureSpace(doc, yPos, mindestens, stammdaten);
    // Der Seitenfuß stellt die Schriftgröße auf 6 pt und setzt sie nicht
    // zurück – ohne das stünde der Text nach einem Umbruch verkleinert in
    // einer für 8 pt bemessenen Box.
    doc.setFontSize(8);
    yPos += 5;
    const verfuegbar = getMaxContentY(doc) - yPos;

    let anzahl = rest.length;
    while (anzahl > 1 && hoeheVon(rest.slice(0, anzahl)) > verfuegbar) anzahl--;
    const teil = rest.slice(0, anzahl);
    rest = rest.slice(anzahl);
    const hoehe = hoeheVon(teil);

    doc.setFillColor(254, 252, 232); // amber-50
    doc.setDrawColor(217, 119, 6); // amber-600
    doc.setLineWidth(0.3);
    doc.roundedRect(25, yPos - 2, 160, hoehe, 2, 2, 'FD');
    doc.setTextColor(120, 53, 15); // amber-900

    let textY = yPos + 3;
    for (const zeile of teil) {
      textY += zeile.abstandDavor;
      doc.setFont('helvetica', zeile.fett ? 'bold' : 'normal');
      doc.text(zeile.text, 29, textY);
      textY += HINWEIS_ZEILENHOEHE;
    }
    yPos += hoehe + 2;

    // Nächster Teil beginnt auf einer neuen Seite
    if (rest.length > 0) {
      yPos = await ensureSpace(doc, yPos, Number.POSITIVE_INFINITY, stammdaten);
      doc.setFontSize(8);
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return yPos;
};

/**
 * Der Staffelblock (Kopfbox, Einleitung, Staffeltabelle je Sorte, Hinweisbox).
 * Angebot und Auftragsbestätigung zeichnen ihn identisch – nur der
 * Einleitungssatz bestätigt statt anzubieten. Der Kunde soll beide Belege
 * nebeneinanderlegen können.
 */
const zeichneStaffelBlock = async (
  doc: jsPDF,
  startY: number,
  staffelpreisPositionen: PlatzbauerAngebotPosition[],
  staffelKonditionen: StaffelKonditionen,
  stammdaten: Stammdaten,
  belegart: StaffelBelegart = 'angebot'
): Promise<number> => {
  if (staffelpreisPositionen.length === 0) return startY;
  let yPos = startY;
  yPos = await ensureSpace(doc, yPos, 60, stammdaten);

  // Überschrift mit Box
  doc.setFillColor(251, 191, 36); // amber-400
  doc.rect(25, yPos - 2, 160, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120, 53, 15); // amber-900
  doc.text(staffelKopfzeile(staffelKonditionen), 27, yPos + 4);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  yPos += 12;

  // Einleitungstext
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(staffelEinleitung(staffelKonditionen, belegart), 25, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  for (let spIdx = 0; spIdx < staffelpreisPositionen.length; spIdx++) {
    const staffelPos = staffelpreisPositionen[spIdx];
    yPos = await ensureSpace(doc, yPos, 55, stammdaten);

    // Artikel-Box mit Hintergrund
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(217, 119, 6); // amber-600
    doc.setLineWidth(0.3);
    doc.rect(25, yPos - 2, 160, 10, 'FD');

    // Artikel-Header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 53, 15); // amber-900
    doc.text(`${staffelPos.artikelnummer} - ${staffelPos.bezeichnung}`, 28, yPos + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    yPos += 12;

    // Beschreibung (Lieferregion und Bemerkung)
    if (staffelPos.beschreibung) {
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const beschreibungLines = doc.splitTextToSize(staffelPos.beschreibung, 155);
      doc.text(beschreibungLines, 28, yPos);
      yPos += beschreibungLines.length * 4 + 2;
      doc.setTextColor(0, 0, 0);
    }

    if (staffelPos.staffelpreise && staffelPos.staffelpreise.staffeln) {
      const staffelTableData = staffelPos.staffelpreise.staffeln.map((staffel, idx) => {
        // „unter 300 t": Die Grenze selbst gehört schon zur nächsten Stufe (ab 300 t).
        // Vorher stand 300 t in zwei Zeilen und der Kunde konnte nicht wissen, welche gilt.
        const vonText = formatTonnen(staffel.vonMenge);
        const bisText = staffel.bisMenge ? `unter ${formatTonnen(staffel.bisMenge)}` : 'unbegrenzt';
        return [
          `${idx + 1}`,
          vonText,
          bisText,
          formatWaehrung(staffel.einzelpreis) + ' / t'
        ];
      });

      autoTable(doc, {
        startY: yPos,
        margin: { left: 30, right: 25, top: 45, bottom: 35 },
        head: [['Staffel', 'Ab Menge', 'Bis Menge', 'Preis pro Tonne']],
        body: staffelTableData,
        theme: 'grid',
        rowPageBreak: 'avoid',
        tableWidth: 150,
        headStyles: {
          fillColor: [217, 119, 6] as [number, number, number], // amber-600
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [217, 119, 6] as [number, number, number],
          lineWidth: 0.2
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 40, halign: 'center' },
          3: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: [254, 249, 195] as [number, number, number] // amber-50
        },
        didDrawPage: function(data) {
          if (data.pageNumber > 1) {
            addFollowPageHeader(doc, stammdaten);
            addDIN5008Footer(doc, stammdaten);
          }
        }
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }

    // Trennlinie zwischen Artikeln (außer beim letzten)
    if (spIdx < staffelpreisPositionen.length - 1) {
      yPos = await ensureSpace(doc, yPos, 15, stammdaten);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(25, yPos, 185, yPos);
      yPos += 8;
    }
  }

  // Staffelpreis-Hinweis: manuell gepflegter Text oder aus dem Abrechnungsmodell erzeugt
  const hinweistext =
    staffelKonditionen.hinweistext?.trim() ||
    erzeugeStaffelHinweistext(
      staffelKonditionen,
      staffelpreisPositionen.map((p) => ({
        artikelnummer: p.artikelnummer,
        bezeichnung: p.bezeichnung,
        staffeln: p.staffelpreise?.staffeln ?? [],
      }))
    );
  yPos = await zeichneStaffelHinweisBox(doc, yPos, hinweistext, stammdaten);
  return yPos;
};

/**
 * Die grüne Box, die bei reinen Staffelbelegen an die Stelle der Summe tritt.
 * Auf der Auftragsbestätigung steht zusätzlich, warum dort keine Summe steht.
 */
const zeichneStaffelKonditionsBox = async (
  doc: jsPDF,
  startY: number,
  staffelKonditionen: StaffelKonditionen,
  stammdaten: Stammdaten,
  belegart: StaffelBelegart = 'angebot'
): Promise<number> => {
  let summenY = startY;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const zeilenQuelle =
    belegart === 'auftragsbestaetigung'
      ? [...staffelKurzfassung(staffelKonditionen), STAFFEL_KEINE_SUMME]
      : staffelKurzfassung(staffelKonditionen);
  const kurzZeilen: string[] = zeilenQuelle.flatMap(
    (zeile) => doc.splitTextToSize(zeile, 150) as string[]
  );
  const boxHoehe = 9 + kurzZeilen.length * 4 + 3;
  summenY = await ensureSpace(doc, summenY, boxHoehe + 5, stammdaten);
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(34, 197, 94); // green-500
  doc.setLineWidth(0.3);
  doc.roundedRect(25, summenY, 160, boxHoehe, 2, 2, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61); // green-700
  doc.text(staffelKurzfassungTitel(belegart), 30, summenY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let kurzY = summenY + 12;
  for (const zeile of kurzZeilen) {
    doc.text(zeile, 30, kurzY);
    kurzY += 4;
  }
  doc.setTextColor(0, 0, 0);
  return summenY + boxHoehe + 7;
};

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

  // Prüfen ob erweiterte angebotPositionen vorhanden sind
  const hatErweitertePositionen = daten.angebotPositionen && daten.angebotPositionen.length > 0;

  // Positionen nach Typ trennen
  const normalPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => !p.positionsTyp || p.positionsTyp === 'normal')
    : [];
  const staffelpreisPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => p.positionsTyp === 'staffelpreis')
    : [];
  const bedarfsPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => p.positionsTyp === 'bedarf')
    : [];

  let tableData: string[][];
  let tableHeaders: string[];

  // === NORMALE POSITIONEN ===
  if (hatErweitertePositionen && (normalPositionen.length > 0 || (!staffelpreisPositionen.length && !bedarfsPositionen.length))) {
    // Alle normalen Positionen (inkl. alte Struktur falls keine erweiterten)
    const positionenZuZeigen = normalPositionen.length > 0 ? normalPositionen : daten.angebotPositionen!;

    tableHeaders = ['Pos.', 'Art.-Nr.', 'Bezeichnung / Beschreibung', 'Menge', 'Einh.', 'Preis/E', 'Gesamt'];
    tableData = positionenZuZeigen.map((pos, index) => {
      let beschreibungText = pos.bezeichnung || '';
      if (pos.beschreibung) {
        beschreibungText += `\n${pos.beschreibung}`;
      }
      if (pos.lieferadresse) {
        beschreibungText += `\n${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`;
      }

      return [
        (index + 1).toString(),
        pos.artikelnummer,
        beschreibungText,
        pos.menge.toFixed(1),
        pos.einheit || 't',
        formatWaehrung(pos.einzelpreis),
        formatWaehrung(pos.gesamtpreis)
      ];
    });

    autoTable(doc, {
      startY: yPos,
      margin: { left: 25, right: 20, top: 45, bottom: 30 },
      head: [tableHeaders],
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
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 58, valign: 'top' },
        3: { cellWidth: 15, halign: 'right' },
        4: { cellWidth: 12 },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 23, halign: 'right' }
      },
      didDrawPage: function(data) {
        if (data.pageNumber > 1) {
          addFollowPageHeader(doc, stammdaten);
          addDIN5008Footer(doc, stammdaten);
        }
      }
    });
    yPos = (doc as any).lastAutoTable.finalY + 5;
  } else if (!hatErweitertePositionen && daten.positionen.length > 0) {
    // Alte Struktur für Kompatibilität
    tableHeaders = ['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt'];
    tableData = daten.positionen.map((pos, index) => {
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
      head: [tableHeaders],
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
    yPos = (doc as any).lastAutoTable.finalY + 5;
  }

  // Konditionen: Altbelege ohne gespeichertes Modell bekommen den Saison-Standard
  const staffelKonditionen: StaffelKonditionen =
    daten.staffelKonditionen ?? standardStaffelKonditionen(daten.projekt.saisonjahr);

  // === STAFFELPREISE ===
  yPos = await zeichneStaffelBlock(doc, yPos, staffelpreisPositionen, staffelKonditionen, stammdaten);

  // === BEDARFSPOSITIONEN ===
  if (bedarfsPositionen.length > 0) {
    yPos = await ensureSpace(doc, yPos, 40, stammdaten);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 148, 136); // teal-600
    doc.text('Bedarfspositionen (Geschätzte Mengen)', 25, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 5;

    const bedarfsTableData = bedarfsPositionen.map((pos, index) => {
      let beschreibungText = pos.bezeichnung || '';
      if (pos.beschreibung) {
        beschreibungText += `\n${pos.beschreibung}`;
      }
      if (pos.bedarfsNotiz) {
        beschreibungText += `\n(${pos.bedarfsNotiz})`;
      }

      return [
        (index + 1).toString(),
        beschreibungText,
        `ca. ${(pos.geschaetzteMenge || pos.menge).toFixed(1)}`,
        pos.einheit || 't',
        formatWaehrung(pos.einzelpreis),
        `ca. ${formatWaehrung(pos.gesamtpreis)}`
      ];
    });

    autoTable(doc, {
      startY: yPos,
      margin: { left: 25, right: 20, top: 45, bottom: 30 },
      head: [['Pos.', 'Bezeichnung', 'Geschätzte Menge', 'Einh.', 'Preis/E', 'Geschätzter Betrag']],
      body: bedarfsTableData,
      theme: 'striped',
      rowPageBreak: 'avoid',
      headStyles: {
        fillColor: [13, 148, 136] as [number, number, number], // teal-600
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 55, valign: 'top' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 12 },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' }
      },
      didDrawPage: function(data) {
        if (data.pageNumber > 1) {
          addFollowPageHeader(doc, stammdaten);
          addDIN5008Footer(doc, stammdaten);
        }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 3;

    // Bedarfs-Hinweis
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Hinweis: Bedarfspositionen sind Schätzungen. Die tatsächliche Abrechnung erfolgt nach gelieferter Menge.', 25, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 5;
  }

  // === Summen ===
  // Korrektes yPos verwenden (nicht lastAutoTable das evtl. veraltet ist)
  let summenY = yPos + 5;
  summenY = await ensureSpace(doc, summenY, 45, stammdaten);

  // Summen aus den korrekten Positionen berechnen (nur normale und Bedarfspositionen)
  let normaleUndBedarfPositionen: Array<{ gesamtpreis: number }>;
  if (hatErweitertePositionen) {
    normaleUndBedarfPositionen = daten.angebotPositionen!.filter(p => !p.positionsTyp || p.positionsTyp === 'normal' || p.positionsTyp === 'bedarf');
  } else {
    normaleUndBedarfPositionen = daten.positionen;
  }
  const hatNurStaffelpreise = hatErweitertePositionen && normaleUndBedarfPositionen.length === 0 && staffelpreisPositionen.length > 0;
  const positionenFuerSummen = hatErweitertePositionen ? daten.angebotPositionen! : daten.positionen;

  const nettobetrag = normaleUndBedarfPositionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
  const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
  const nettoGesamt = nettobetrag + frachtUndVerpackung;
  const umsatzsteuer = nettoGesamt * 0.19;
  const bruttobetrag = nettoGesamt + umsatzsteuer;
  const anzahlPositionen = positionenFuerSummen.length;

  const summenX = 125;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  if (hatNurStaffelpreise) {
    // Bei reinen Staffelpreis-Angeboten: Info-Box statt Summe, Wortlaut passend zum Abrechnungsmodell
    summenY = await zeichneStaffelKonditionsBox(doc, summenY, staffelKonditionen, stammdaten);
  } else {
    // Summenblock mit Rahmen
    doc.setFillColor(249, 250, 251); // gray-50
    doc.setDrawColor(209, 213, 219); // gray-300
    doc.setLineWidth(0.3);
    doc.roundedRect(summenX - 5, summenY - 2, 65, 38, 2, 2, 'FD');

    summenY += 5;
    doc.text('Nettobetrag:', summenX, summenY);
    doc.text(formatWaehrung(nettobetrag), 182, summenY, { align: 'right' });

    if (frachtUndVerpackung > 0) {
      summenY += 6;
      doc.text('Fracht/Verpackung:', summenX, summenY);
      doc.text(formatWaehrung(frachtUndVerpackung), 182, summenY, { align: 'right' });
    }

    summenY += 6;
    doc.text('MwSt. (19%):', summenX, summenY);
    doc.text(formatWaehrung(umsatzsteuer), 182, summenY, { align: 'right' });

    // Trennlinie
    summenY += 3;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(summenX, summenY, 182, summenY);

    // Bruttobetrag
    summenY += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Angebotssumme:', summenX, summenY);
    doc.setTextColor(...primaryColor);
    doc.text(formatWaehrung(bruttobetrag), 182, summenY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    summenY += 8;
  }

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

  doc.text(`Anzahl Positionen: ${anzahlPositionen}`, 25, summenY);
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

  // Staffelzeilen stehen in einem eigenen Feld und tragen keine Menge; die
  // Positionstabelle und alle Summen bleiben den Vereinszeilen vorbehalten.
  const staffelPositionen = (daten.abPositionen ?? []).filter(
    (p) => p.positionsTyp === 'staffelpreis'
  );
  const hatVereine = daten.positionen.length > 0;
  const nurStaffel = !hatVereine && staffelPositionen.length > 0;
  // Altbelege ohne gespeichertes Modell bekommen den Saison-Standard.
  const staffelKonditionen: StaffelKonditionen =
    daten.staffelKonditionen ?? standardStaffelKonditionen(daten.projekt.saisonjahr);

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

  // Abnahmezeitraum und Stichtag – nicht zu verwechseln mit der Bindefrist
  // eines Angebots, die auf einer Bestätigung nichts verloren hat.
  if (staffelPositionen.length > 0) {
    for (const zeile of staffelInfoblockZeilen(staffelKonditionen)) {
      infoYPos += 10;
      doc.setTextColor(100, 100, 100);
      doc.text(zeile.label, infoX, infoYPos);
      doc.setTextColor(0, 0, 0);
      doc.text(zeile.wert, infoX, infoYPos + 4);
    }
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
  // Breite begrenzt: Der Informationsblock rechts (x = 130) reicht bei
  // Staffelbelegen bis in diese Höhe – ein langer Projektname liefe sonst in
  // „Abnahmezeitraum" hinein.
  yPos += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const projektZeilen = doc.splitTextToSize(`Projekt: ${daten.projekt.projektName}`, 100) as string[];
  doc.text(projektZeilen, 25, yPos);
  yPos += (projektZeilen.length - 1) * 5;
  doc.setTextColor(0, 0, 0);

  if (staffelPositionen.length > 0) {
    yPos += 5;
    doc.setTextColor(100, 100, 100);
    const betreffZeilen = doc.splitTextToSize(
      staffelBetreffzeile(staffelKonditionen, daten.projekt.saisonjahr),
      100
    ) as string[];
    doc.text(betreffZeilen, 25, yPos);
    yPos += (betreffZeilen.length - 1) * 5;
    if (daten.angebotsbezug?.nummer) {
      yPos += 5;
      const datumZusatz = daten.angebotsbezug.datum
        ? ` vom ${formatDatum(daten.angebotsbezug.datum)}`
        : '';
      const bezugZeilen = doc.splitTextToSize(
        `zu unserem Angebot Nr. ${daten.angebotsbezug.nummer}${datumZusatz}`,
        100
      ) as string[];
      doc.text(bezugZeilen, 25, yPos);
      yPos += (bezugZeilen.length - 1) * 5;
    }
    doc.setTextColor(0, 0, 0);
  }

  // === Anrede ===
  yPos += 10;
  doc.setFontSize(10);
  doc.text('Sehr geehrte Damen und Herren,', 25, yPos);

  // === Einleitungstext ===
  yPos += 8;
  if (staffelPositionen.length > 0) {
    const satz = staffelBestaetigungssatz(staffelKonditionen, hatVereine);
    const satzZeilen = doc.splitTextToSize(satz, 160) as string[];
    doc.text(satzZeilen, 25, yPos);
    yPos += (satzZeilen.length - 1) * 4;
  } else {
    doc.text('vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Lieferungen:', 25, yPos);
  }

  // === Positionen Tabelle (Vereine) ===
  yPos += 8;

  let summenY = yPos;
  if (hatVereine) {
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
    summenY = (doc as any).lastAutoTable.finalY || yPos + 40;
  }

  // Staffeln stehen als eigener Block unter den Lieferungen – dieselbe
  // Darstellung wie im Angebot, damit der Kunde beide vergleichen kann.
  if (staffelPositionen.length > 0) {
    summenY = await zeichneStaffelBlock(
      doc,
      summenY + 5,
      staffelPositionen,
      staffelKonditionen,
      stammdaten,
      'auftragsbestaetigung'
    );
  }

  // === Summen ===
  summenY = await ensureSpace(doc, summenY, 35, stammdaten);

  // Wird nur im Summenzweig belegt; eine Saisonvereinbarung hat keinen Betrag,
  // auf den sich ein Skontosatz beziehen könnte.
  let bruttobetrag = 0;
  if (nurStaffel) {
    // Eine Saisonvereinbarung hat keine Auftragssumme: An die Stelle des
    // Summenblocks tritt dieselbe Box wie im Angebot, ergänzt um den Satz,
    // warum hier nichts summiert wird.
    summenY = await zeichneStaffelKonditionsBox(
      doc,
      summenY,
      staffelKonditionen,
      stammdaten,
      'auftragsbestaetigung'
    );
  } else {
    const nettobetrag = daten.positionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);
    const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
    const nettoGesamt = nettobetrag + frachtUndVerpackung;
    const umsatzsteuer = nettoGesamt * 0.19;
    bruttobetrag = nettoGesamt + umsatzsteuer;

    const summenX = 125;
    summenY += 6;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

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

  }

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
    // Bei einer reinen Staffelvereinbarung ist der Abrufhinweis weiter unten die
  // Lieferzeitaussage – eine zweite Zeile daneben widerspräche ihr.
  if (nurStaffel) {
    summenY -= 5;
  } else {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
  }
    summenY += 4;
  }

  if (hatVereine) {
    doc.text(`Anzahl Vereine: ${daten.positionen.length}`, 25, summenY);
    summenY += 4;

    doc.text('Lieferung erfolgt direkt an die jeweiligen Vereine laut Adressliste.', 25, summenY);
  } else {
    // Ohne feste Lieferliste: Abrufregel statt Vereinsliste.
    for (const zeile of staffelAbrufhinweis(staffelKonditionen)) {
      doc.text(zeile, 25, summenY);
      summenY += 5;
    }
  }
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

  if (daten.skontoAktiviert && daten.skonto && !nurStaffel) {
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

  // Proforma-Abzug berechnen
  const proformaAbzug = daten.proformaAbzugAktiviert && daten.proformaAbzugBetrag ? daten.proformaAbzugBetrag : 0;
  const zahlbetrag = bruttobetrag - proformaAbzug;

  const summenX = 125;
  summenY += 6;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

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

  // Proforma-Abzug anzeigen falls vorhanden
  if (proformaAbzug > 0) {
    summenY += 6;
    doc.setFontSize(10);
    doc.text(`./. bereits gezahlt (${daten.proformaAbzugNummer || 'Proforma'}):`, summenX, summenY);
    doc.text(`-${formatWaehrung(proformaAbzug)}`, 180, summenY, { align: 'right' });

    // Trennlinie
    summenY += 2;
    doc.setLineWidth(0.5);
    doc.line(summenX, summenY, 180, summenY);

    // Zahlbetrag
    summenY += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Zu zahlender Betrag:', summenX, summenY);
    doc.text(formatWaehrung(zahlbetrag), 180, summenY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

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
  const bankdatenStartY = summenY + 8;
  summenY += 8;
  doc.setFontSize(9);
  doc.text(`Bitte überweisen Sie den Betrag auf folgendes Konto:`, 25, summenY);
  summenY += 5;
  doc.text(`Bank: ${stammdaten.bankname}`, 25, summenY);
  summenY += 4;
  doc.text(`IBAN: ${stammdaten.iban}`, 25, summenY);
  summenY += 4;
  doc.text(`BIC: ${stammdaten.bic}`, 25, summenY);

  // === GiroCode (EPC-QR-Code) ===
  try {
    const verwendungszweck = `Rechnung ${daten.rechnungsnummer}`;
    const zahlbetrag = bruttobetrag - proformaAbzug;
    const epcString = generiereEPCString(
      stammdaten.firmenname,
      stammdaten.iban,
      stammdaten.bic,
      zahlbetrag,
      verwendungszweck
    );

    const qrDataUrl = await QRCode.toDataURL(epcString, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256
    });

    const qrSize = 35;
    const qrX = 145;
    const qrY = bankdatenStartY - 5;

    // GiroCode Überschrift
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('GiroCode', qrX + qrSize / 2, qrY - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    // QR-Code Beschriftung
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Zum Bezahlen', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
    doc.text('im Online Banking', qrX + qrSize / 2, qrY + qrSize + 6, { align: 'center' });
    doc.text('scannen', qrX + qrSize / 2, qrY + qrSize + 9, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  } catch (error) {
    console.error('Fehler beim Generieren des GiroCode:', error);
  }

  // === Zahlungshinweis ===
  summenY += 6;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const hinweisText = 'Bitte verwenden Sie für die Zahlung die angegebene Rechnungsnummer als Verwendungszweck.';
  const hinweisLines = doc.splitTextToSize(hinweisText, 115);
  doc.text(hinweisLines, 25, summenY);
  summenY += (hinweisLines.length * 4);
  doc.setTextColor(0, 0, 0);

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

// ==================== PROFORMA-RECHNUNG ====================

export const generierePlatzbauerProformaRechnungPDF = async (
  daten: PlatzbauerProformaRechnungsDaten,
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
  doc.text('Proforma-Nr.:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(daten.proformarechnungsnummer, infoX, infoYPos + 4);
  doc.setFont('helvetica', 'normal');

  infoYPos += 12;
  doc.setTextColor(100, 100, 100);
  doc.text('Datum:', infoX, infoYPos);
  doc.setTextColor(0, 0, 0);
  doc.text(formatDatum(daten.proformarechnungsdatum), infoX, infoYPos + 4);

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
  doc.text(`Proforma-Rechnung Nr. ${daten.proformarechnungsnummer}`, 25, yPos);
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
  doc.text('wir erlauben uns, Ihnen folgende Lieferungen als Proforma-Rechnung zu übermitteln:', 25, yPos);

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

  const summenX = 125;
  summenY += 6;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

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
  doc.text('Proforma-Betrag:', summenX, summenY);
  doc.text(formatWaehrung(bruttobetrag), 180, summenY, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // === Hinweis Proforma ===
  summenY += 10;
  summenY = await ensureSpace(doc, summenY, 20, stammdaten);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Hinweis: Dies ist eine Proforma-Rechnung. Sie dient zur Vorabinformation und', 25, summenY);
  summenY += 4;
  doc.text('ist keine rechtsverbindliche Rechnung. Die finale Rechnung erfolgt nach Lieferung.', 25, summenY);
  doc.setTextColor(0, 0, 0);

  // === Zahlungsbedingungen ===
  summenY += 8;
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
  const proformaBankdatenStartY = summenY + 8;
  summenY += 8;
  doc.setFontSize(9);
  doc.text(`Bitte überweisen Sie den Betrag auf folgendes Konto:`, 25, summenY);
  summenY += 5;
  doc.text(`Bank: ${stammdaten.bankname}`, 25, summenY);
  summenY += 4;
  doc.text(`IBAN: ${stammdaten.iban}`, 25, summenY);
  summenY += 4;
  doc.text(`BIC: ${stammdaten.bic}`, 25, summenY);

  // === GiroCode (EPC-QR-Code) für Proforma ===
  try {
    const proformaVerwendungszweck = `Proforma ${daten.proformarechnungsnummer}`;
    const proformaEpcString = generiereEPCString(
      stammdaten.firmenname,
      stammdaten.iban,
      stammdaten.bic,
      bruttobetrag,
      proformaVerwendungszweck
    );

    const proformaQrDataUrl = await QRCode.toDataURL(proformaEpcString, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256
    });

    const proformaQrSize = 35;
    const proformaQrX = 145;
    const proformaQrY = proformaBankdatenStartY - 5;

    // GiroCode Überschrift
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('GiroCode', proformaQrX + proformaQrSize / 2, proformaQrY - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    doc.addImage(proformaQrDataUrl, 'PNG', proformaQrX, proformaQrY, proformaQrSize, proformaQrSize);

    // QR-Code Beschriftung
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Zum Bezahlen', proformaQrX + proformaQrSize / 2, proformaQrY + proformaQrSize + 3, { align: 'center' });
    doc.text('scannen', proformaQrX + proformaQrSize / 2, proformaQrY + proformaQrSize + 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  } catch (error) {
    console.error('Fehler beim Generieren des GiroCode:', error);
  }

  // === Zahlungshinweis ===
  summenY += 6;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const proformaHinweisText = `Bitte verwenden Sie "${daten.proformarechnungsnummer}" als Verwendungszweck.`;
  doc.text(proformaHinweisText, 25, summenY);
  summenY += 4;
  doc.setTextColor(0, 0, 0);

  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 4;
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
