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
import { PlatzbauerPosition, PlatzbauerProjekt, PlatzbauerAngebotPosition, Preisstaffel, StaffelKonditionen } from '../types/platzbauer';
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
  sortiereStaffeln,
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

// Akzentfarbe der Preisvereinbarung. Bewusst dieselbe Familie wie der Beleg –
// die frühere Amber-Fläche machte den Staffelteil zu einem Fremdkörper.
const STAFFEL_FARBE: [number, number, number] = [180, 83, 9]; // amber-700
// Bedarfspositionen: eigene, aber gedeckte Kennfarbe.
const BEDARF_FARBE: [number, number, number] = [15, 118, 110]; // teal-700
// Standard-Preisliste: neutral-blau, damit sie sich von Preisvereinbarung
// (amber) und Positionen (orange) unterscheidet, ohne zu schreien.
const PREISLISTE_FARBE: [number, number, number] = [51, 65, 85]; // slate-700

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
    // Eine fette Absatzüberschrift darf nicht die letzte Zeile eines Teils sein
    // – sonst steht „Abrechnung:" allein am Seitenfuß und der zugehörige
    // Absatz beginnt erst auf der nächsten Seite.
    if (anzahl < rest.length && anzahl > 1 && rest[anzahl - 1]?.fett) anzahl--;
    const teil = rest.slice(0, anzahl);
    rest = rest.slice(anzahl);
    const hoehe = hoeheVon(teil);

    // Ruhiger Kasten mit farbiger Kante links: Der frühere amber-Rahmen um die
    // ganze Box konkurrierte optisch mit der Preistabelle darüber.
    doc.setFillColor(249, 250, 251); // gray-50
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.setLineWidth(0.2);
    doc.rect(25, yPos - 2, 160, hoehe, 'FD');
    doc.setFillColor(...STAFFEL_FARBE);
    doc.rect(25, yPos - 2, 1.2, hoehe, 'F');
    doc.setTextColor(55, 65, 81); // gray-700

    let textY = yPos + 3;
    for (const zeile of teil) {
      textY += zeile.abstandDavor;
      doc.setFont('helvetica', zeile.fett ? 'bold' : 'normal');
      doc.text(zeile.text, 30, textY);
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

/** Spaltenmaß der Vereinsliste auf Rechnung, Proforma und AB. */
const VEREINS_SPALTEN: Record<number, any> = {
  0: { cellWidth: 11, halign: 'center', textColor: [107, 114, 128] as [number, number, number] },
  1: { cellWidth: 71, valign: 'top' },
  2: { cellWidth: 18, halign: 'right' },
  3: { cellWidth: 12 },
  4: { cellWidth: 22, halign: 'right' },
  5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
};

/**
 * Eine Vereinszeile für Rechnung, Proforma und AB — inklusive Preisherkunft.
 *
 * Die Herkunft („Staffel Stufe 2 (ab 150 t)" oder „Direktpreis lt.
 * Vereinbarung") steht unter Name und Lieferort. Ohne sie ließ sich auf einer
 * Sammelrechnung nicht erkennen, warum zwei Vereine unterschiedliche Preise
 * tragen; ermittelt wird sie beim Erzeugen des Belegs
 * (`utils/preisHerkunft.ts`), nicht beim Drucken — der gedruckte Beleg soll
 * sich später nicht ändern, wenn jemand die Staffel pflegt.
 */
const vereinsZeilen = (positionen: PlatzbauerPosition[]): string[][] =>
  positionen.map((pos, index) => {
    let adresseText = pos.vereinsname;
    if (pos.lieferadresse) {
      adresseText += `\n${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`;
    }
    if (pos.preisHerkunft) {
      adresseText += `\n${pos.preisHerkunft}`;
    }

    return [
      (index + 1).toString(),
      adresseText,
      pos.menge.toFixed(1),
      't',
      formatWaehrung(pos.einzelpreis),
      formatWaehrung(pos.gesamtpreis),
    ];
  });

/**
 * Einheitlicher Tabellenstil für alle Blöcke eines Platzbauer-Belegs:
 * weißer Kopf mit farbiger Unterlinie, feine Zeilentrenner, sehr helle
 * Wechselzeilen. Vorher trug jeder Block eigene Farbflächen (orange, amber,
 * teal) – drei Tabellen auf einem Blatt sahen aus wie drei Dokumente.
 */
const belegTabellenStil = (
  doc: jsPDF,
  stammdaten: Stammdaten,
  farbe: [number, number, number],
  spalten: Record<number, any>
) => ({
  margin: { left: 25, right: 25, top: 45, bottom: 35 },
  theme: 'plain' as const,
  rowPageBreak: 'avoid' as const,
  tableWidth: 160,
  headStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [55, 65, 81] as [number, number, number], // gray-700
    fontSize: 8.5,
    fontStyle: 'bold' as const,
    lineColor: farbe,
    lineWidth: { bottom: 0.5 } as any,
    cellPadding: { top: 1, bottom: 2.5, left: 2, right: 2 },
  },
  styles: {
    fontSize: 9.5,
    cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 },
    lineColor: [229, 231, 235] as [number, number, number], // gray-200
    lineWidth: { bottom: 0.15 } as any,
    textColor: [17, 24, 39] as [number, number, number],
  },
  alternateRowStyles: { fillColor: [250, 250, 249] as [number, number, number] },
  columnStyles: spalten,
  // Kopfzellen übernehmen die Ausrichtung ihrer Spalte. autoTable vererbt
  // halign aus columnStyles nicht in den Kopf – „Preis netto" stand deshalb
  // linksbündig über rechtsbündigen Beträgen.
  didParseCell: function (data: any) {
    if (data.section === 'head') {
      const spalte = spalten[data.column.index];
      if (spalte?.halign) data.cell.styles.halign = spalte.halign;
    }
  },
  didDrawPage: function (data: any) {
    if (data.pageNumber > 1) {
      addFollowPageHeader(doc, stammdaten);
      addDIN5008Footer(doc, stammdaten);
    }
  },
});

/**
 * Ein Abschnittskopf im ruhigen Stil: kleine graue Kennzeichnung, kräftiger
 * Titel, feine Linie in der Belegfarbe. Ersetzt die früheren vollflächigen
 * Farbbalken – die machten den Beleg bunt, ohne die Gliederung zu zeigen.
 */
const zeichneAbschnittskopf = (
  doc: jsPDF,
  yPos: number,
  kennzeichnung: string,
  titel: string,
  farbe: [number, number, number]
): number => {
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...farbe);
  doc.text(kennzeichnung.toUpperCase(), 25, yPos);

  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39); // gray-900
  doc.text(titel, 25, yPos + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  doc.setDrawColor(...farbe);
  doc.setLineWidth(0.6);
  doc.line(25, yPos + 8.5, 185, yPos + 8.5);
  doc.setLineWidth(0.2);

  return yPos + 14;
};

/** Beschriftung einer Stufe: „unter 150 t" / „ab 150 t – unter 300 t" / „ab 300 t". */
const staffelStufenLabel = (staffel: Preisstaffel, istErste: boolean): string => {
  const bis = staffel.bisMenge && staffel.bisMenge > staffel.vonMenge ? staffel.bisMenge : null;
  if (!bis) return `ab ${formatTonnen(staffel.vonMenge)}`;
  if (istErste || staffel.vonMenge <= 0) return `unter ${formatTonnen(bis)}`;
  return `ab ${formatTonnen(staffel.vonMenge)} – unter ${formatTonnen(bis)}`;
};

/** Schlüssel der Stufenleiter ohne Preise – gleiche Grenzen ergeben eine Matrix. */
const grenzenSchluessel = (staffeln: Preisstaffel[]): string =>
  [...staffeln]
    .sort((a, b) => a.vonMenge - b.vonMenge)
    .map((s) => `${s.vonMenge}-${s.bisMenge && s.bisMenge > s.vonMenge ? s.bisMenge : '∞'}`)
    .join('|');

/**
 * Der Staffelblock (Kopf, Einleitung, Preistabelle, Hinweisbox).
 * Angebot und Auftragsbestätigung zeichnen ihn identisch – nur der
 * Einleitungssatz bestätigt statt anzubieten. Der Kunde soll beide Belege
 * nebeneinanderlegen können.
 *
 * Darstellung (09/2026 überarbeitet): Tragen alle Sorten dieselben Mengen-
 * grenzen – der Normalfall, seit `staffelGrenzen.ts` das Raster spiegelt –,
 * steht EINE Matrix auf dem Blatt: Zeilen sind die Mengenstufen, Spalten die
 * Sorten. Vorher bekam jede Sorte eine eigene vierspaltige Tabelle mit
 * identischen Mengenspalten; bei drei Sorten stand dieselbe Stufenleiter
 * dreimal untereinander. Nur wenn sich die Grenzen tatsächlich unterscheiden,
 * wird je Sorte eine eigene Tabelle gezeichnet.
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

  yPos = zeichneAbschnittskopf(
    doc,
    yPos,
    'Preisvereinbarung',
    staffelKopfzeile(staffelKonditionen),
    STAFFEL_FARBE
  );

  // Einleitungstext (kann umbrechen – vorher lief er einzeilig aus dem Satzspiegel)
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99); // gray-600
  const einleitungZeilen: string[] = doc.splitTextToSize(
    staffelEinleitung(staffelKonditionen, belegart),
    160
  );
  doc.text(einleitungZeilen, 25, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += einleitungZeilen.length * 4 + 3;

  const mitStaffeln = staffelpreisPositionen.filter(
    (p) => (p.staffelpreise?.staffeln?.length ?? 0) > 0
  );

  const schluessel = new Set(mitStaffeln.map((p) => grenzenSchluessel(p.staffelpreise!.staffeln)));
  const alsMatrix = mitStaffeln.length > 1 && schluessel.size === 1;

  if (alsMatrix) {
    yPos = await ensureSpace(doc, yPos, 40, stammdaten);
    const staffelnRaster = sortiereStaffeln(mitStaffeln[0].staffelpreise!.staffeln);

    // Ersparnis gegenüber der ersten Stufe – nur zeigen, wenn sie für alle
    // Sorten gleich ist. Sonst stünde eine Zahl da, die für die Hälfte der
    // Spalten falsch wäre.
    const ersparnisJeStufe = staffelnRaster.map((_, idx) => {
      const werte = mitStaffeln.map((p) => {
        const sortiert = sortiereStaffeln(p.staffelpreise!.staffeln);
        return Math.round((sortiert[0].einzelpreis - sortiert[idx].einzelpreis) * 100) / 100;
      });
      return werte.every((w) => Math.abs(w - werte[0]) < 0.005) ? werte[0] : null;
    });
    const mitErsparnis =
      ersparnisJeStufe.every((e) => e !== null) && ersparnisJeStufe.some((e) => (e as number) > 0);

    const kopf = ['Abnahmemenge', ...mitStaffeln.map((p) => `${p.bezeichnung}\n${p.artikelnummer}`)];
    if (mitErsparnis) kopf.push('Ihr Vorteil');

    const body = staffelnRaster.map((staffel, idx) => {
      const zeile = [
        staffelStufenLabel(staffel, idx === 0),
        ...mitStaffeln.map((p) => {
          const sortiert = sortiereStaffeln(p.staffelpreise!.staffeln);
          return `${formatWaehrung(sortiert[idx]?.einzelpreis ?? 0)} / t`;
        }),
      ];
      if (mitErsparnis) {
        const e = ersparnisJeStufe[idx] as number;
        zeile.push(e > 0 ? `\u2013 ${formatWaehrung(e)} / t` : '\u2013');
      }
      return zeile;
    });

    const preisSpalten = mitStaffeln.length + (mitErsparnis ? 1 : 0);
    const mengenBreite = 52;
    const restBreite = (160 - mengenBreite) / preisSpalten;
    const spalten: Record<number, any> = {
      0: { cellWidth: mengenBreite, fontStyle: 'bold' },
    };
    for (let i = 1; i <= preisSpalten; i++) {
      spalten[i] = { cellWidth: restBreite, halign: 'right' };
    }
    if (mitErsparnis) {
      spalten[preisSpalten] = {
        cellWidth: restBreite,
        halign: 'right',
        textColor: [21, 128, 61] as [number, number, number],
      };
    }

    autoTable(doc, {
      startY: yPos,
      head: [kopf],
      body,
      ...belegTabellenStil(doc, stammdaten, STAFFEL_FARBE, spalten),
    } as any);
    yPos = (doc as any).lastAutoTable.finalY + 4;

    // Fußnoten je Sorte (Lieferregion, Bemerkung) – in der Matrix ist dafür
    // kein Platz, sie gehören aber zum Preis.
    const fussnoten = mitStaffeln
      .filter((p) => p.beschreibung?.trim())
      .map((p) => `${p.artikelnummer}: ${p.beschreibung!.replace(/\s*\n\s*/g, ' · ')}`);
    if (fussnoten.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128); // gray-500
      for (const note of fussnoten) {
        const zeilen: string[] = doc.splitTextToSize(note, 160);
        yPos = await ensureSpace(doc, yPos, zeilen.length * 3.5 + 2, stammdaten);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(zeilen, 25, yPos);
        yPos += zeilen.length * 3.5;
      }
      doc.setTextColor(0, 0, 0);
      yPos += 2;
    }
  } else {
    for (let spIdx = 0; spIdx < mitStaffeln.length; spIdx++) {
      const staffelPos = mitStaffeln[spIdx];
      yPos = await ensureSpace(doc, yPos, 45, stammdaten);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text(`${staffelPos.bezeichnung}`, 25, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128);
      doc.text(staffelPos.artikelnummer, 185, yPos, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      yPos += 4;

      if (staffelPos.beschreibung) {
        doc.setFontSize(8.5);
        doc.setTextColor(107, 114, 128);
        const beschreibungLines: string[] = doc.splitTextToSize(staffelPos.beschreibung, 160);
        doc.text(beschreibungLines, 25, yPos);
        yPos += beschreibungLines.length * 3.6 + 1;
        doc.setTextColor(0, 0, 0);
      }
      yPos += 1;

      const sortiert = sortiereStaffeln(staffelPos.staffelpreise!.staffeln);
      const basispreis = sortiert[0].einzelpreis;
      const zeigeVorteil = sortiert.some((s) => basispreis - s.einzelpreis > 0.005);

      const body = sortiert.map((staffel, idx) => {
        const zeile = [
          staffelStufenLabel(staffel, idx === 0),
          `${formatWaehrung(staffel.einzelpreis)} / t`,
        ];
        if (zeigeVorteil) {
          const e = Math.round((basispreis - staffel.einzelpreis) * 100) / 100;
          zeile.push(e > 0 ? `\u2013 ${formatWaehrung(e)} / t` : '\u2013');
        }
        return zeile;
      });

      const kopf = ['Abnahmemenge', 'Preis je Tonne'];
      if (zeigeVorteil) kopf.push('Ihr Vorteil');

      const spalten: Record<number, any> = zeigeVorteil
        ? {
            0: { cellWidth: 70, fontStyle: 'bold' },
            1: { cellWidth: 45, halign: 'right' },
            2: {
              cellWidth: 45,
              halign: 'right',
              textColor: [21, 128, 61] as [number, number, number],
            },
          }
        : {
            0: { cellWidth: 100, fontStyle: 'bold' },
            1: { cellWidth: 60, halign: 'right' },
          };

      autoTable(doc, {
        startY: yPos,
        head: [kopf],
        body,
        ...belegTabellenStil(doc, stammdaten, STAFFEL_FARBE, spalten),
      } as any);
      yPos = (doc as any).lastAutoTable.finalY + 6;
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
  // Gleiche Bauform wie die Hinweisbox: heller Kasten, farbige Kante links.
  // Die frühere grün umrandete Box war auf einem sonst ruhigen Blatt der
  // einzige bunte Rahmen.
  doc.setFillColor(249, 250, 251); // gray-50
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setLineWidth(0.2);
  doc.rect(25, summenY, 160, boxHoehe, 'FD');
  doc.setFillColor(21, 128, 61); // green-700
  doc.rect(25, summenY, 1.2, boxHoehe, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61); // green-700
  doc.text(staffelKurzfassungTitel(belegart), 30, summenY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(55, 65, 81); // gray-700
  let kurzY = summenY + 12;
  for (const zeile of kurzZeilen) {
    doc.text(zeile, 30, kurzY);
    kurzY += 4;
  }
  doc.setTextColor(0, 0, 0);
  return summenY + boxHoehe + 4;
};

/**
 * Die Standard-Preisliste: Zusatzleistungen mit Preis je Einheit, ohne Menge
 * und ohne Summe. Sie steht auf jedem Platzbauer-Beleg gleich — gepflegt wird
 * sie im Platzbauer-Tool (`constants/platzbauerStandardartikel.ts`).
 *
 * Bewusst KEINE Mengenspalte: Beim Abschluss der Saisonvereinbarung steht
 * nicht fest, wie viele Paletten, Folien oder Schüttstellen abgerufen werden.
 * Eine Menge 1 je Zeile hätte nur eine Scheinsumme erzeugt.
 */
const zeichnePreislistenBlock = async (
  doc: jsPDF,
  startY: number,
  positionen: PlatzbauerAngebotPosition[],
  stammdaten: Stammdaten
): Promise<number> => {
  if (positionen.length === 0) return startY;
  let yPos = await ensureSpace(doc, startY + 4, 45, stammdaten);

  yPos = zeichneAbschnittskopf(
    doc,
    yPos,
    'Für alle Abrufe gültig',
    'Zusatzleistungen – Preise je Einheit',
    PREISLISTE_FARBE
  );

  // Gruppen in der Reihenfolge ihres ersten Vorkommens; Zeilen ohne Gruppe
  // laufen unter einer neutralen Überschrift mit.
  const gruppen: string[] = [];
  for (const pos of positionen) {
    const g = pos.preislisteGruppe?.trim() || 'Weitere Konditionen';
    if (!gruppen.includes(g)) gruppen.push(g);
  }

  const body: any[] = [];
  for (const gruppe of gruppen) {
    if (gruppen.length > 1) {
      body.push([
        {
          content: gruppe,
          colSpan: 3,
          styles: {
            fontStyle: 'bold',
            fontSize: 8.5,
            textColor: PREISLISTE_FARBE,
            fillColor: [255, 255, 255] as [number, number, number],
            cellPadding: { top: 3, bottom: 1.5, left: 0, right: 2 },
          },
        },
      ]);
    }
    for (const pos of positionen.filter(
      (p) => (p.preislisteGruppe?.trim() || 'Weitere Konditionen') === gruppe
    )) {
      body.push([pos.bezeichnung, pos.einheit || 'Stk', formatWaehrung(pos.einzelpreis)]);
      // Die Abrechnungsregel bekommt eine eigene, kleine graue Zeile. In der
      // Bezeichnungszelle könnte autoTable sie nicht abgesetzt formatieren –
      // sie stünde gleich groß und gleich schwarz neben dem Leistungsnamen.
      const hinweis = pos.preislisteHinweis?.trim();
      if (hinweis) {
        body.push([
          {
            content: hinweis,
            colSpan: 3,
            styles: {
              fontSize: 8,
              textColor: [107, 114, 128] as [number, number, number],
              cellPadding: { top: 0, bottom: 2.2, left: 0, right: 2 },
            },
          },
        ]);
      }
    }
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Leistung', 'Einheit', 'Preis netto']],
    body,
    ...belegTabellenStil(doc, stammdaten, PREISLISTE_FARBE, {
      0: { cellWidth: 110, valign: 'top' },
      1: { cellWidth: 22 },
      2: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    }),
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
  } as any);

  yPos = (doc as any).lastAutoTable.finalY + 3;

  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const fussnote: string[] = doc.splitTextToSize(
    'Alle Preise netto zzgl. gesetzlicher Umsatzsteuer. Die Zusatzleistungen werden nur berechnet, ' +
      'wenn sie tatsächlich abgerufen werden, und gelten für alle Lieferungen dieser Vereinbarung.',
    160
  );
  yPos = await ensureSpace(doc, yPos, fussnote.length * 3.5 + 3, stammdaten);
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(fussnote, 25, yPos);
  doc.setTextColor(0, 0, 0);
  return yPos + fussnote.length * 3.5 + 2;
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
  const preislistenPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => p.positionsTyp === 'preisliste')
    : [];
  const staffelpreisPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => p.positionsTyp === 'staffelpreis')
    : [];
  const bedarfsPositionen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(p => p.positionsTyp === 'bedarf')
    : [];

  // Konditionen: Altbelege ohne gespeichertes Modell bekommen den Saison-Standard
  const staffelKonditionen: StaffelKonditionen =
    daten.staffelKonditionen ?? standardStaffelKonditionen(daten.projekt.saisonjahr);

  // === STAFFELPREISE ===
  yPos = await zeichneStaffelBlock(doc, yPos, staffelpreisPositionen, staffelKonditionen, stammdaten);

  // === STANDARD-PREISLISTE ===
  yPos = await zeichnePreislistenBlock(doc, yPos, preislistenPositionen, stammdaten);

  // === POSITIONEN ===
  // Reihenfolge (09/2026): erst die Preisvereinbarung, dann die für alle Abrufe
  // gültigen Zusatzkonditionen, dann die konkreten Positionen.
  // Der Platzbauer schließt über die Staffel ab; die Zusatzpositionen sind
  // Beiwerk und standen vorher vor der eigentlichen Vereinbarung.
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

    // Platz für Kopf + Tabellenkopf + erste Zeile: Eine Überschrift allein am
    // Seitenfuß wäre schlimmer als ein früher Umbruch.
    yPos = await ensureSpace(doc, yPos, 55, stammdaten);
    yPos = zeichneAbschnittskopf(
      doc,
      yPos,
      staffelpreisPositionen.length > 0 ? 'Zusätzlich zur Staffel' : 'Angebot',
      staffelpreisPositionen.length > 0 ? 'Standard- und Zusatzpositionen' : 'Positionen',
      primaryColor
    );

    autoTable(doc, {
      startY: yPos,
      head: [tableHeaders],
      body: tableData,
      ...belegTabellenStil(doc, stammdaten, primaryColor, {
        0: { cellWidth: 11, halign: 'center', textColor: [107, 114, 128] as [number, number, number] },
        1: { cellWidth: 24, textColor: [107, 114, 128] as [number, number, number] },
        2: { cellWidth: 55, valign: 'top' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 11 },
        5: { cellWidth: 21, halign: 'right' },
        6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      }),
    } as any);
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

    yPos = await ensureSpace(doc, yPos, 55, stammdaten);
    yPos = zeichneAbschnittskopf(doc, yPos, 'Angebot', 'Positionen', primaryColor);

    autoTable(doc, {
      startY: yPos,
      head: [tableHeaders],
      body: tableData,
      ...belegTabellenStil(doc, stammdaten, primaryColor, {
        0: { cellWidth: 11, halign: 'center', textColor: [107, 114, 128] as [number, number, number] },
        1: { cellWidth: 71, valign: 'top' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 12 },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      }),
    } as any);
    yPos = (doc as any).lastAutoTable.finalY + 5;
  }

  // === BEDARFSPOSITIONEN ===
  if (bedarfsPositionen.length > 0) {
    yPos = await ensureSpace(doc, yPos, 40, stammdaten);

    yPos = zeichneAbschnittskopf(doc, yPos, 'Auf Abruf', 'Bedarfspositionen', BEDARF_FARBE);

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
      head: [['Pos.', 'Bezeichnung', 'Geschätzte Menge', 'Einh.', 'Preis/E', 'Geschätzter Betrag']],
      body: bedarfsTableData,
      ...belegTabellenStil(doc, stammdaten, BEDARF_FARBE, {
        0: { cellWidth: 11, halign: 'center', textColor: [107, 114, 128] as [number, number, number] },
        1: { cellWidth: 54, valign: 'top' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 11 },
        4: { cellWidth: 21, halign: 'right' },
        5: { cellWidth: 35, halign: 'right' },
      }),
    } as any);

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
    // Preislistenzeilen tragen keine Menge und dürfen nie in eine Summe fallen.
    normaleUndBedarfPositionen = daten.angebotPositionen!.filter(p => !p.positionsTyp || p.positionsTyp === 'normal' || p.positionsTyp === 'bedarf');
  } else {
    normaleUndBedarfPositionen = daten.positionen;
  }
  const hatNurStaffelpreise = hatErweitertePositionen && normaleUndBedarfPositionen.length === 0 && staffelpreisPositionen.length > 0;
  // „Anzahl Positionen" meint die abzurechnenden Zeilen – die Preisliste ist
  // eine Kondition, keine Position, und wird nicht mitgezählt.
  const positionenFuerSummen = hatErweitertePositionen
    ? daten.angebotPositionen!.filter(
        p => p.positionsTyp !== 'preisliste' && p.positionsTyp !== 'staffelpreis'
      )
    : daten.positionen;

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
    // Höhe folgt den tatsächlichen Zeilen: Der frühere feste Kasten (38 mm)
    // ließ ohne Fracht-/Verpackungszeile ein Drittel Leerraum stehen.
    const summenZeilen = frachtUndVerpackung > 0 ? 3 : 2;
    doc.setFillColor(249, 250, 251); // gray-50
    doc.setDrawColor(209, 213, 219); // gray-300
    doc.setLineWidth(0.3);
    doc.roundedRect(summenX - 5, summenY - 2, 65, summenZeilen * 6 + 16, 2, 2, 'FD');

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
  summenY += 6;
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

  // Bei einer reinen Staffelvereinbarung gibt es keine abzurechnenden
  // Positionen – „Anzahl Positionen: 2" hätte dort die Staffelzeilen gezählt.
  if (anzahlPositionen > 0) {
    doc.text(`Anzahl Positionen: ${anzahlPositionen}`, 25, summenY);
    summenY += 4;
  }

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
  // Der Seitenfuß hinterlässt eine graue Textfarbe; ohne das Zurücksetzen
  // stünde die Grußformel hellgrau unter schwarzen Bedingungen.
  doc.setTextColor(0, 0, 0);
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
  // Die Standard-Preisliste steht auch auf der AB: Sie ist Teil dessen, was
  // bestätigt wird, und der Kunde soll beide Belege nebeneinanderlegen können.
  const preislistenPositionen = (daten.abPositionen ?? []).filter(
    (p) => p.positionsTyp === 'preisliste'
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
  // Lange Firmierungen umbrechen: Ungebrochen lief der Name über den Blattrand
  // und aus dem DIN-Adressfenster hinaus.
  const nameZeilen = doc.splitTextToSize(daten.platzbauername, 80) as string[];
  doc.text(nameZeilen, 25, yPos);
  yPos += (nameZeilen.length - 1) * (doc.getLineHeight() / doc.internal.scaleFactor);
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
  const zeilenHoehe = doc.getLineHeight() / doc.internal.scaleFactor;
  const projektZeilen = doc.splitTextToSize(`Projekt: ${daten.projekt.projektName}`, 100) as string[];
  doc.text(projektZeilen, 25, yPos);
  yPos += (projektZeilen.length - 1) * zeilenHoehe;
  doc.setTextColor(0, 0, 0);

  if (staffelPositionen.length > 0) {
    yPos += 5;
    doc.setTextColor(100, 100, 100);
    const betreffZeilen = doc.splitTextToSize(
      staffelBetreffzeile(staffelKonditionen, daten.projekt.saisonjahr),
      100
    ) as string[];
    doc.text(betreffZeilen, 25, yPos);
    yPos += (betreffZeilen.length - 1) * zeilenHoehe;
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
      yPos += (bezugZeilen.length - 1) * zeilenHoehe;
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
    yPos += (satzZeilen.length - 1) * (doc.getLineHeight() / doc.internal.scaleFactor);
  } else {
    doc.text('vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Lieferungen:', 25, yPos);
  }

  // === Positionen Tabelle (Vereine) ===
  yPos += 8;

  let summenY = yPos;
  if (hatVereine) {
    autoTable(doc, {
      startY: yPos,
      head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
      body: vereinsZeilen(daten.positionen),
      ...belegTabellenStil(doc, stammdaten, primaryColor, VEREINS_SPALTEN),
    } as any);
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

  summenY = await zeichnePreislistenBlock(doc, summenY, preislistenPositionen, stammdaten);

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
    doc.text(
      staffelPositionen.length > 0 ? 'Lieferungen:' : 'Auftragssumme:',
      summenX,
      summenY
    );
    doc.text(formatWaehrung(bruttobetrag), 180, summenY, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // Auf einem Mischbeleg wäre „Auftragssumme" irreführend: Die Abrufe aus
    // der Staffelvereinbarung stecken nicht darin.
    if (staffelPositionen.length > 0) {
      summenY += 6;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const abgrenzung = doc.splitTextToSize(
        'Abrufe aus der Staffelvereinbarung sind hierin nicht enthalten; sie werden je Lieferung nach dem tatsächlichen Gewicht laut Wiegeschein abgerechnet.',
        160
      ) as string[];
      doc.text(abgrenzung, 25, summenY);
      summenY += (abgrenzung.length - 1) * 3.6;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
    }

  }

  // === Lieferbedingungen ===
  // Der Block ist je nach Belegart unterschiedlich hoch (Lieferzeit,
  // Vereinsliste, Abrufregel). Wird zu wenig reserviert, rutschen die letzten
  // Zeilen unter die Fußzeile – deshalb wird die Höhe gezählt, nicht geschätzt.
  const abrufZeilen = staffelPositionen.length > 0 ? staffelAbrufhinweis(staffelKonditionen) : [];
  const lieferBlockHoehe =
    5 + // Überschrift
    (daten.lieferzeit && !nurStaffel ? 4 : 0) +
    (hatVereine ? 8 : 0) + // Anzahl Vereine + Adresslistensatz
    (abrufZeilen.length > 0 ? (hatVereine ? 5 : 0) + abrufZeilen.length * 5 : 0) +
    (daten.lieferbedingungenAktiviert && daten.lieferbedingungen ? 6 : 0) +
    4;
  summenY += 10;
  summenY = await ensureSpace(doc, summenY, lieferBlockHoehe, stammdaten);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Lieferbedingungen:', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  summenY += 5;
  // Auf einer reinen Staffelvereinbarung ist der Abrufhinweis weiter unten die
  // Lieferzeitaussage – eine zweite Zeile daneben widerspräche ihr. Auf einem
  // Mischbeleg bekommt sie ihren Bezug, weil die Abrufregel darunter steht.
  if (daten.lieferzeit && !nurStaffel) {
    doc.text(
      staffelPositionen.length > 0
        ? `Lieferzeit der bestätigten Lieferungen: ${daten.lieferzeit}`
        : `Lieferzeit: ${daten.lieferzeit}`,
      25,
      summenY
    );
    summenY += 4;
  }

  if (hatVereine) {
    doc.text(`Anzahl Vereine: ${daten.positionen.length}`, 25, summenY);
    summenY += 4;

    doc.text('Lieferung erfolgt direkt an die jeweiligen Vereine laut Adressliste.', 25, summenY);
  }

  // Die Abrufregel gilt für jede Staffelvereinbarung – auf dem Mischbeleg
  // neben den bestätigten Lieferungen, sonst an deren Stelle.
  if (staffelPositionen.length > 0) {
    if (hatVereine) {
      summenY += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('Für Abrufe aus der Staffelvereinbarung:', 25, summenY);
      doc.setFont('helvetica', 'normal');
      summenY += 5;
    }
    for (const zeile of abrufZeilen) {
      doc.text(zeile, 25, summenY);
      summenY += 5;
    }
    summenY -= 5;
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

  const tableData = vereinsZeilen(daten.positionen);

  autoTable(doc, {
    startY: yPos,
    head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
    body: tableData,
    ...belegTabellenStil(doc, stammdaten, primaryColor, VEREINS_SPALTEN),
  } as any);

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

  const tableData = vereinsZeilen(daten.positionen);

  autoTable(doc, {
    startY: yPos,
    head: [['Pos.', 'Verein / Lieferort', 'Menge', 'Einh.', 'Preis/t', 'Gesamt']],
    body: tableData,
    ...belegTabellenStil(doc, stammdaten, primaryColor, VEREINS_SPALTEN),
  } as any);

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
    head: [['Pos.', 'Artikel', 'Menge', 'Einheit']],
    body: tableData,
    ...belegTabellenStil(doc, stammdaten, primaryColor, {
      0: { cellWidth: 15, halign: 'center', textColor: [107, 114, 128] as [number, number, number] },
      1: { cellWidth: 95, valign: 'top' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25 },
    }),
  } as any);

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
