import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { AngebotsDaten, AuftragsbestaetigungsDaten, LieferscheinDaten, Position, VertragsKlausel } from '../types/projektabwicklung';
import { Stammdaten } from '../types/stammdaten';
import { getStammdatenOderDefault } from './stammdatenService';
import { berechneDokumentSummen } from './rechnungService';
import { getAgbAbschnitte } from '../constants/vertragsklauseln';
import {
  addDIN5008Header,
  addDIN5008Footer,
  addAbsenderzeile,
  addFollowPageHeader,
  ensureSpace,
  getMaxContentY,
  formatWaehrung,
  formatDatum,
  getTextHeight,
  getLiefersaisonText,
  formatStrasseHausnummer,
  addWrappedText,
  addHighlighterEffect,
  addHandwrittenNote
} from './pdfHelpers';

const primaryColor: [number, number, number] = [220, 38, 38]; // red-600

const runde = (betrag: number): number => Math.round(betrag * 100) / 100;

/**
 * Summen für Angebot und Auftragsbestätigung — rechnet exakt wie die Rechnung.
 *
 * Bis 08/2026 stand hier ein hartkodiertes `* 0.19`: Angebote konnten weder
 * steuerfrei (Reverse Charge) noch mit abweichendem Satz erstellt werden, und
 * Positionen mit `ohneMwSt` (bereits Brutto, z.B. Versandkosten aus dem
 * Universal-Katalog) wurden doppelt besteuert. Ein Angebot wies dadurch einen
 * anderen Betrag aus als die spätere Rechnung über dieselben Positionen.
 *
 * Basis ist jetzt `berechneDokumentSummen` aus dem rechnungService — dieselbe
 * Funktion, die auch die Rechnung verwendet. Fracht/Verpackung kommen als
 * regelbesteuerter Netto-Betrag obendrauf; der Gesamtrabatt reduziert Netto und
 * Steuer proportional, ebenfalls wie im rechnungService.
 */
export const berechneAngebotsSummen = (
  positionen: Position[],
  optionen: {
    frachtkosten?: number;
    verpackungskosten?: number;
    gesamtrabattProzent?: number;
    ohneMehrwertsteuer?: boolean;
    mehrwertsteuersatz?: number;
  } = {}
) => {
  const berechnung = berechneDokumentSummen(
    positionen,
    optionen.ohneMehrwertsteuer,
    optionen.mehrwertsteuersatz
  );

  const frachtUndVerpackung = runde((optionen.frachtkosten || 0) + (optionen.verpackungskosten || 0));
  const umsatzsteuersatz = berechnung.umsatzsteuersatz;

  const nettoVorRabatt = runde(berechnung.nettobetrag + frachtUndVerpackung);
  const gesamtrabattProzent = optionen.gesamtrabattProzent || 0;
  const rabattFaktor = gesamtrabattProzent > 0 ? gesamtrabattProzent / 100 : 0;
  const gesamtrabattBetrag = runde(nettoVorRabatt * rabattFaktor);
  const nettoGesamt = runde(nettoVorRabatt - gesamtrabattBetrag);

  // Steuer auf Positionen (kennt Brutto-Positionen bereits) + Steuer auf Fracht
  const steuerVorRabatt = berechnung.umsatzsteuer + frachtUndVerpackung * (umsatzsteuersatz / 100);
  const umsatzsteuer = runde(steuerVorRabatt * (1 - rabattFaktor));
  const bruttobetrag = runde(nettoGesamt + umsatzsteuer);

  return {
    nettoPositionen: berechnung.nettobetrag,
    frachtUndVerpackung,
    nettoVorRabatt,
    gesamtrabattProzent,
    gesamtrabattBetrag,
    nettoGesamt,
    umsatzsteuer,
    umsatzsteuersatz,
    bruttobetrag,
  };
};

// === BLOCKÜBERSCHRIFTEN (Lieferbedingungen, Zahlungsbedingungen, Klauseln, ...) ===
/**
 * Einheitlicher Stil für alle Textblock-Überschriften unter der Positionstabelle:
 * fett, dezentes Grau. Setzt danach direkt den Stil für den Fließtext (9pt, schwarz).
 */
const addBlockUeberschrift = (doc: jsPDF, titel: string, y: number): void => {
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(105, 105, 105);
  doc.text(titel, 25, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
};

// === VERTRAGSKLAUSELN (z.B. erschwerte Zufahrt, Mengenanpassung) ===
/**
 * Rendert die aktivierten Vertragsklauseln als Textblöcke (gleicher Stil wie
 * der Dieselpreiszuschlag-Hinweis). Gibt die neue Y-Position zurück.
 */
const addVertragsklauseln = async (
  doc: jsPDF,
  klauseln: VertragsKlausel[] | undefined,
  summenY: number,
  stammdaten: Stammdaten
): Promise<number> => {
  if (!klauseln?.length) return summenY;

  for (const klausel of klauseln) {
    if (!klausel.aktiviert || !klausel.text?.trim()) continue;

    summenY += 6;
    const klauselLines = doc.splitTextToSize(klausel.text, 160);
    const klauselHeight = getTextHeight(klauselLines) + 5;

    summenY = await ensureSpace(doc, summenY, klauselHeight, stammdaten);

    addBlockUeberschrift(doc, klausel.titel, summenY);
    summenY += 5;
    doc.text(klauselLines, 25, summenY);
    summenY += getTextHeight(klauselLines);
  }

  return summenY;
};

// === AGB-ANHANG (Kleintext auf der letzten Seite) ===
/**
 * Hängt die AGB als zweispaltigen Kleintext-Anhang an das Dokument an.
 * Beginnt auf einer neuen Seite OHNE Logo/Briefkopf, damit die volle Höhe zur
 * Verfügung steht. Die Schriftgröße wird adaptiv gewählt, sodass die AGB nach
 * Möglichkeit exakt auf eine Seite passen; nur wenn selbst die kompakteste
 * Stufe nicht reicht, wird eine Folgeseite begonnen. Der Footer kommt von der
 * abschließenden Footer-Schleife des jeweiligen Generators.
 */
const addAgbAnhang = async (doc: jsPDF, stammdaten: Stammdaten): Promise<void> => {
  const abschnitte = getAgbAbschnitte(stammdaten);
  if (!abschnitte.length) return;

  const spaltenX = [25, 110]; // 2 Spalten à 80mm, 5mm Spaltenabstand
  const spaltenBreite = 80;
  const maxY = getMaxContentY(doc);
  const kopfHoehe = 14; // Titel + Untertitel + Trennlinie
  const startYErsteSeite = 20 + kopfHoehe;

  // Größenstufen von komfortabel bis kompakt — die erste, die auf eine Seite passt, gewinnt
  interface AgbLayout {
    titelPt: number;
    textPt: number;
    zeilenHoehe: number;
    absatzAbstand: number;
    abschnittAbstand: number;
  }
  const stufen: AgbLayout[] = [
    { titelPt: 6.5, textPt: 6, zeilenHoehe: 2.5, absatzAbstand: 1, abschnittAbstand: 1.5 },
    { titelPt: 6.25, textPt: 5.75, zeilenHoehe: 2.35, absatzAbstand: 0.9, abschnittAbstand: 1.2 },
    { titelPt: 6, textPt: 5.5, zeilenHoehe: 2.2, absatzAbstand: 0.8, abschnittAbstand: 1 },
  ];

  // Gesamthöhe des Textflusses (ohne Spaltenumbruch-Verschnitt) für eine Stufe
  const messeGesamtHoehe = (layout: AgbLayout): number => {
    let hoehe = 0;
    for (const abschnitt of abschnitte) {
      doc.setFontSize(layout.titelPt);
      doc.setFont('helvetica', 'bold');
      hoehe += doc.splitTextToSize(abschnitt.titel, spaltenBreite).length * layout.zeilenHoehe + 0.5;
      doc.setFontSize(layout.textPt);
      doc.setFont('helvetica', 'normal');
      for (const absatz of abschnitt.absaetze) {
        hoehe += doc.splitTextToSize(absatz, spaltenBreite).length * layout.zeilenHoehe + layout.absatzAbstand;
      }
      hoehe += layout.abschnittAbstand;
    }
    return hoehe;
  };

  // 10mm Puffer je Seite für Verschnitt durch Titel-Zusammenhalt beim Spaltenwechsel
  const kapazitaetEineSeite = (maxY - startYErsteSeite) * 2 - 10;
  const layout =
    stufen.find((stufe) => messeGesamtHoehe(stufe) <= kapazitaetEineSeite) ?? stufen[stufen.length - 1];

  // === Seite beginnen: bewusst ohne Logo/Briefkopf ===
  doc.addPage();
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Allgemeine Geschäftsbedingungen', 25, 22);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`${stammdaten.firmenname} – Bestandteil dieses Dokuments`, 25, 26.5);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(25, 30, 190, 30);
  doc.setTextColor(0, 0, 0);

  let spalte = 0;
  let startY = startYErsteSeite;
  let y = startY;

  const naechsteSpalte = () => {
    if (spalte === 0) {
      spalte = 1;
      y = startY;
    } else {
      // Fallback: Folgeseite (ebenfalls ohne Logo), falls eine Seite doch nicht reicht
      doc.addPage();
      spalte = 0;
      startY = 20;
      y = startY;
    }
  };

  for (const abschnitt of abschnitte) {
    // Abschnittstitel nicht allein am Spaltenende stehen lassen
    if (y + layout.zeilenHoehe * 4 > maxY) {
      naechsteSpalte();
    }

    doc.setFontSize(layout.titelPt);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(105, 105, 105);
    const titelLines: string[] = doc.splitTextToSize(abschnitt.titel, spaltenBreite);
    for (const line of titelLines) {
      if (y + layout.zeilenHoehe > maxY) naechsteSpalte();
      doc.setFontSize(layout.titelPt);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(105, 105, 105);
      doc.text(line, spaltenX[spalte], y);
      y += layout.zeilenHoehe;
    }
    y += 0.5;

    doc.setFontSize(layout.textPt);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    for (const absatz of abschnitt.absaetze) {
      const absatzLines: string[] = doc.splitTextToSize(absatz, spaltenBreite);
      for (const line of absatzLines) {
        if (y + layout.zeilenHoehe > maxY) naechsteSpalte();
        doc.setFontSize(layout.textPt);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(line, spaltenX[spalte], y);
        y += layout.zeilenHoehe;
      }
      y += layout.absatzAbstand;
    }
    y += layout.abschnittAbstand;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
};

// === LEERES BRIEFPAPIER ===
/**
 * Generiert ein leeres Briefpapier-PDF mit Header (Logo) und Footer (Firmendaten)
 * Ohne Tabelle, ohne Kundendaten - nur das Layout für Dienstleister/Lieferanten
 */
export const generiereBriefpapierPDF = async (stammdaten?: Stammdaten): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header mit Logo
  await addDIN5008Header(doc, stammdaten);

  // Absenderzeile für Fensterkuvert
  addAbsenderzeile(doc, stammdaten);

  // Werksadresse im Adressfeld (links oben)
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  // Prüfe ob Werksdaten vorhanden sind, sonst Firmendaten
  const name = stammdaten.werkName || stammdaten.firmenname;
  const strasse = stammdaten.werkStrasse || stammdaten.firmenstrasse;
  const plz = stammdaten.werkPlz || stammdaten.firmenPlz;
  const ort = stammdaten.werkOrt || stammdaten.firmenOrt;

  doc.setFont('helvetica', 'bold');
  doc.text(name, 25, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(formatStrasseHausnummer(strasse), 25, yPos);
  yPos += 5;
  doc.text(`${plz} ${ort}`, 25, yPos);

  // DIN 5008 Footer mit Firmendaten
  addDIN5008Footer(doc, stammdaten);

  return doc;
};

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
  // Maximale Breite für Adressfeld: 80mm (bis zum Infoblock bei 130mm minus etwas Abstand)
  const adressfeldBreite = 80;
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  // Kundenname kann auch lang sein - umbrechen
  yPos = addWrappedText(doc, daten.kundenname, 25, yPos, adressfeldBreite, 5);
  doc.setFont('helvetica', 'normal');
  yPos += 1; // Kleiner Abstand nach Name
  // Straße umbrechen wenn zu lang
  yPos = addWrappedText(doc, formatStrasseHausnummer(daten.kundenstrasse), 25, yPos, adressfeldBreite, 5);
  // PLZ/Ort
  doc.text(daten.kundenPlzOrt, 25, yPos);
  yPos += 5;

  // Ansprechpartner
  if (daten.ansprechpartner) {
    yPos += 1;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.ansprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === Lieferadresse (falls abweichend) - LINKS unter Kundenadresse ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    // Erste Hälfte des Abstands nach Kundenadresse/Ansprechpartner
    yPos += 9;

    // Dezente Trennlinie PERFEKT MITTIG zwischen Kundenadresse und Lieferadresse
    // Kürzer und dezenter: von 30mm bis 75mm (statt 25-100mm)
    doc.setDrawColor(220, 220, 220);  // Heller (dezenter)
    doc.setLineWidth(0.15);  // Dünner (dezenter)
    doc.line(30, yPos, 75, yPos);  // Kürzer und mittig positioniert

    // Zweite Hälfte des Abstands
    yPos += 9;

    // Überschrift "Lieferadresse:"
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Lieferadresse:', 25, yPos);
    yPos += 6;

    // Lieferadresse-Daten
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    // Name umbrechen wenn zu lang
    yPos = addWrappedText(doc, daten.lieferadresseName, 25, yPos, adressfeldBreite, 5);
    doc.setFont('helvetica', 'normal');
    yPos += 1;

    if (daten.lieferadresseStrasse) {
      // Straße umbrechen wenn zu lang
      yPos = addWrappedText(doc, formatStrasseHausnummer(daten.lieferadresseStrasse), 25, yPos, adressfeldBreite, 5);
    }

    if (daten.lieferadressePlzOrt) {
      doc.text(daten.lieferadressePlzOrt, 25, yPos);
      yPos += 5;
    }
  }

  // === DIN 5008: BETREFF ===
  // Dynamische Positionierung: Mindestens 10mm Abstand nach Lieferadresse, sonst Standard-Position
  const betrefYPos = daten.lieferadresseAbweichend && daten.lieferadresseName
    ? Math.max(yPos + 10, 95)  // Mindestens 10mm nach Lieferadresse, aber nie unter 95
    : 95;  // Standard-Position wenn keine Lieferadresse
  yPos = betrefYPos;
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
  doc.text('vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen freibleibend folgendes Angebot:', 25, yPos);

  // === Positionen aufteilen in reguläre und Bedarfspositionen ===
  const regulaerePositionen = daten.positionen.filter(pos => !pos.istBedarfsposition);
  const bedarfsPositionen = daten.positionen.filter(pos => pos.istBedarfsposition);

  // === Positionen Tabelle (nur reguläre Positionen) ===
  yPos += 8;

  const tableData = regulaerePositionen.map(pos => {
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
    margin: { 
      left: 25, 
      right: 20, 
      top: 45,  // WICHTIG: Genug Platz für Logo (Y=12, Höhe=22) + "Fortsetzung" (Y=38) + Abstand
      bottom: 30 
    }, // DIN 5008: links 25mm, rechts 20mm
    head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid', // WICHTIG: Verhindert, dass eine Positionszeile über Seitenumbrüche geteilt wird
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
        const position = regulaerePositionen[data.row.index];
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
  
  // === Bedarfspositionen-Tabelle (falls vorhanden) ===
  let summenY = (doc as any).lastAutoTable.finalY || yPos + 40;

  if (bedarfsPositionen.length > 0) {
    summenY += 8;
    summenY = await ensureSpace(doc, summenY, 45, stammdaten);

    // Überschrift für Bedarfspositionen
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(237, 137, 54); // orange-500
    doc.text('Optionale Bedarfspositionen', 25, summenY);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    summenY += 3;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Diese Positionen sind nicht in der Angebotssumme enthalten.', 25, summenY);
    doc.setTextColor(0, 0, 0);

    summenY += 4;

    const bedarfsTableData = bedarfsPositionen.map(pos => {
      let bezeichnungMitBeschreibung = pos.bezeichnung;
      if (pos.beschreibung && pos.beschreibung.trim()) {
        bezeichnungMitBeschreibung += '\n' + pos.beschreibung;
      }
      let einzelpreisText = formatWaehrung(pos.einzelpreis);
      if (pos.streichpreis && pos.streichpreis > pos.einzelpreis) {
        if (pos.streichpreisGrund) {
          einzelpreisText = pos.streichpreisGrund + '\n' + formatWaehrung(pos.streichpreis) + '\n' + formatWaehrung(pos.einzelpreis);
        } else {
          einzelpreisText = formatWaehrung(pos.streichpreis) + '\n' + formatWaehrung(pos.einzelpreis);
        }
      }
      return [
        pos.artikelnummer || '-',
        bezeichnungMitBeschreibung,
        pos.menge.toString(),
        pos.einheit,
        einzelpreisText,
        formatWaehrung(pos.gesamtpreis)
      ];
    });

    autoTable(doc, {
      startY: summenY,
      margin: { left: 25, right: 20, top: 45, bottom: 30 },
      head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
      body: bedarfsTableData,
      theme: 'striped',
      rowPageBreak: 'avoid',
      headStyles: {
        fillColor: [237, 137, 54], // orange-500 für Bedarfspositionen
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 16, halign: 'left' },
        1: { cellWidth: 68, valign: 'top' },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 16 },
        4: { cellWidth: 22, halign: 'right', valign: 'top' },
        5: { cellWidth: 22, halign: 'right', valign: 'top' }
      },
      didDrawPage: function(data) {
        if (data.pageNumber > 1) {
          addFollowPageHeader(doc, stammdaten);
          addDIN5008Footer(doc, stammdaten);
        }
      }
    });

    // Bedarfspositionen-Summe (optional anzeigen) - gleiche Steuerlogik wie die Hauptsumme
    const bedarfsSummen = berechneAngebotsSummen(bedarfsPositionen, {
      ohneMehrwertsteuer: daten.ohneMehrwertsteuer,
      mehrwertsteuersatz: daten.mehrwertsteuersatz,
    });

    summenY = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(9);
    doc.setTextColor(237, 137, 54);
    const bedarfsSummenText = daten.ohneMehrwertsteuer
      ? `Summe Bedarfspositionen: ${formatWaehrung(bedarfsSummen.nettoGesamt)} netto (steuerfrei)`
      : `Summe Bedarfspositionen: ${formatWaehrung(bedarfsSummen.nettoGesamt)} netto / ${formatWaehrung(bedarfsSummen.bruttobetrag)} brutto`;
    doc.text(bedarfsSummenText, 25, summenY);
    doc.setTextColor(0, 0, 0);

    summenY = (doc as any).lastAutoTable.finalY || summenY;
  }

  // === Summen (nur reguläre Positionen) ===

  // Berechnung immer durchführen (für Skonto etc.) - NUR reguläre Positionen
  const summen = berechneAngebotsSummen(regulaerePositionen, {
    frachtkosten: daten.frachtkosten,
    verpackungskosten: daten.verpackungskosten,
    gesamtrabattProzent: daten.gesamtrabattProzent,
    ohneMehrwertsteuer: daten.ohneMehrwertsteuer,
    mehrwertsteuersatz: daten.mehrwertsteuersatz,
  });
  const { frachtUndVerpackung, gesamtrabattProzent, gesamtrabattBetrag, nettoGesamt, umsatzsteuer, bruttobetrag } = summen;
  const nettobetrag = summen.nettoPositionen;

  // Summen nur anzeigen wenn nicht ausgeblendet
  if (!daten.endpreisAusblenden) {
    // Prüfe ob genug Platz für Summen-Block (ca. 35mm, bei Reverse Charge zzgl. Hinweisbox)
    summenY = await ensureSpace(doc, summenY, daten.ohneMehrwertsteuer ? 55 : 35, stammdaten);

    const summenX = 125;
    summenY += 6;

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

    if (gesamtrabattProzent > 0) {
      summenY += 6;
      const rabattLabel = daten.gesamtrabattBezeichnung?.trim()
        ? `${daten.gesamtrabattBezeichnung} (${gesamtrabattProzent}%):`
        : `Rabatt (${gesamtrabattProzent}%):`;
      doc.setTextColor(0, 100, 0);
      doc.text(rabattLabel, summenX, summenY);
      doc.text(`- ${formatWaehrung(gesamtrabattBetrag)}`, 180, summenY, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      summenY += 6;
      doc.text('Zwischensumme netto:', summenX, summenY);
      doc.text(formatWaehrung(nettoGesamt), 180, summenY, { align: 'right' });
    }

    summenY += 6;
    if (daten.ohneMehrwertsteuer) {
      // Steuerfreies Angebot (Reverse Charge / Ausland)
      doc.setTextColor(100, 100, 100);
      doc.text('MwSt.:', summenX, summenY);
      doc.text('steuerfrei', 180, summenY, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    } else {
      doc.text(`MwSt. (${summen.umsatzsteuersatz}%):`, summenX, summenY);
      doc.text(formatWaehrung(umsatzsteuer), 180, summenY, { align: 'right' });
    }

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

    // === Hinweis Reverse Charge / steuerfreie Lieferung (wie auf der Rechnung) ===
    if (daten.ohneMehrwertsteuer) {
      summenY += 10;
      doc.setFillColor(254, 243, 199); // amber-100
      doc.setDrawColor(245, 158, 11); // amber-500
      doc.setLineWidth(0.5);
      const hinweisHoehe = daten.kundenUstIdNr ? 16 : 12;
      doc.roundedRect(25, summenY - 4, 160, hinweisHoehe, 2, 2, 'FD');

      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14); // amber-800
      doc.setFont('helvetica', 'bold');
      doc.text('Steuerfreie innergemeinschaftliche Lieferung', 30, summenY + 1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Reverse Charge - Steuerschuldnerschaft des Leistungsempfängers gem. § 13b UStG', 30, summenY + 5);
      if (daten.kundenUstIdNr) {
        doc.text(`USt-IdNr. des Leistungsempfängers: ${daten.kundenUstIdNr}`, 30, summenY + 9);
      }
      doc.setTextColor(0, 0, 0);
      summenY += hinweisHoehe;
    }
  } else if (daten.endpreisAlternativText) {
    // Alternativtext anzeigen (z.B. "gemäß Menge")
    summenY += 6;
    const summenX = 125;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Angebotssumme:', summenX, summenY);
    doc.text(daten.endpreisAlternativText, 180, summenY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  // === Universal-Artikel Rabattstaffelung ===
  const universalPositionen = regulaerePositionen.filter(
    pos => pos.istUniversalArtikel === true || pos.beschreibung?.startsWith('Universal:')
  );
  if (daten.rabattstaffelungAnzeigen && universalPositionen.length > 0) {
    const universalNetto = universalPositionen.reduce((sum, pos) => sum + pos.gesamtpreis, 0);

    let rabattProzent = 0;
    let rabattStufeIdx = -1;
    if (universalNetto >= 3000) { rabattProzent = 16; rabattStufeIdx = 3; }
    else if (universalNetto >= 2700) { rabattProzent = 14; rabattStufeIdx = 2; }
    else if (universalNetto >= 2300) { rabattProzent = 12; rabattStufeIdx = 1; }
    else if (universalNetto >= 1900) { rabattProzent = 10; rabattStufeIdx = 0; }

    let naechsteStufe: { schwelle: number; prozent: number; fehlend: number } | null = null;
    if (universalNetto < 1900) naechsteStufe = { schwelle: 1900, prozent: 10, fehlend: 1900 - universalNetto };
    else if (universalNetto < 2300) naechsteStufe = { schwelle: 2300, prozent: 12, fehlend: 2300 - universalNetto };
    else if (universalNetto < 2700) naechsteStufe = { schwelle: 2700, prozent: 14, fehlend: 2700 - universalNetto };
    else if (universalNetto < 3000) naechsteStufe = { schwelle: 3000, prozent: 16, fehlend: 3000 - universalNetto };

    summenY += 8;
    const blockHoehe = 42 + (naechsteStufe ? 5 : 0) + (rabattProzent > 0 ? 5 : 0);
    summenY = await ensureSpace(doc, summenY, blockHoehe, stammdaten);

    const boxX = 25;
    const boxBreite = 160;
    const boxStartY = summenY;

    // Box-Hintergrund (amber/orange-50)
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(252, 211, 77);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, boxStartY, boxBreite, blockHoehe, 2, 2, 'FD');

    let contentY = boxStartY + 6;

    // Überschrift
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('Rabattstaffelung bei Auftragserteilung', boxX + 4, contentY);

    // Aktueller Nettowert rechts
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Universal-Artikel netto: ${formatWaehrung(universalNetto)}`, boxX + boxBreite - 4, contentY, { align: 'right' });
    contentY += 6;

    // Staffeltabelle (4 Spalten)
    const stufen = [
      { prozent: '10%', bereich: '1.900 - 2.299 €' },
      { prozent: '12%', bereich: '2.300 - 2.699 €' },
      { prozent: '14%', bereich: '2.700 - 2.999 €' },
      { prozent: '16%', bereich: 'ab 3.000 €' },
    ];
    const spaltenBreite = (boxBreite - 8) / 4;
    doc.setFontSize(8);
    stufen.forEach((stufe, idx) => {
      const x = boxX + 4 + idx * spaltenBreite;
      const ist_aktiv = idx === rabattStufeIdx;
      if (ist_aktiv) {
        doc.setFillColor(187, 247, 208); // green-200
        doc.setDrawColor(34, 197, 94); // green-500
      } else {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(229, 231, 235);
      }
      doc.setLineWidth(ist_aktiv ? 0.5 : 0.2);
      doc.roundedRect(x, contentY, spaltenBreite - 2, 12, 1, 1, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(ist_aktiv ? 21 : 17, ist_aktiv ? 128 : 24, ist_aktiv ? 61 : 39);
      doc.text(stufe.prozent, x + (spaltenBreite - 2) / 2, contentY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(75, 85, 99);
      doc.text(stufe.bereich, x + (spaltenBreite - 2) / 2, contentY + 9.5, { align: 'center' });
    });
    contentY += 15;

    // Status-Zeile
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    if (rabattProzent > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(21, 128, 61); // green-700
      doc.text(
        `Ihr Rabatt: ${rabattProzent}% – Ersparnis ${formatWaehrung(universalNetto * rabattProzent / 100)}`,
        boxX + 4,
        contentY
      );
      doc.setFont('helvetica', 'normal');
      contentY += 5;
    }
    if (naechsteStufe) {
      doc.setTextColor(180, 83, 9); // amber-700
      doc.text(
        `Noch ${formatWaehrung(naechsteStufe.fehlend)} bis zur nächsten Stufe (${naechsteStufe.prozent}% ab ${naechsteStufe.schwelle.toLocaleString('de-DE')} €)`,
        boxX + 4,
        contentY
      );
      contentY += 5;
    }
    doc.setTextColor(0, 0, 0);

    summenY = boxStartY + blockHoehe;
  }

  // === Liefersaison-Hinweis (nur wenn aktiviert) ===
  if (daten.liefersaisonAnzeigen) {
    summenY += 8;
    summenY = await ensureSpace(doc, summenY, 8, stammdaten);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    const liefersaisonText = getLiefersaisonText(stammdaten);
    doc.text(liefersaisonText, 25, summenY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
  }

  // === Lieferbedingungen ===
  summenY += 6;

  // Berechne die GESAMTE Höhe des Lieferbedingungen-Blocks BEVOR wir rendern
  let lieferbedingungenBlockHeight = 5; // Überschrift
  if (daten.lieferzeit) lieferbedingungenBlockHeight += 4;
  if (daten.lieferdatum) lieferbedingungenBlockHeight += 4;

  let lieferbedingungenLines: string[] = [];
  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    lieferbedingungenBlockHeight += 2 + getTextHeight(lieferbedingungenLines);
  }

  // Prüfe Platz für den GESAMTEN Block (Überschrift + Inhalt zusammen)
  summenY = await ensureSpace(doc, summenY, lieferbedingungenBlockHeight, stammdaten);

  // Jetzt rendern - alles bleibt zusammen
  addBlockUeberschrift(doc, 'Lieferbedingungen', summenY);

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
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += getTextHeight(lieferbedingungenLines);
  }
  
  // === Zahlungsbedingungen ===
  summenY += 5;

  // Zahlungsbedingungen nur anzeigen wenn nicht ausgeblendet
  if (!daten.zahlungsbedingungenAusblenden) {
    // Berechne die GESAMTE Höhe des Zahlungsbedingungen-Blocks BEVOR wir rendern
    let zahlungsbedingungenBlockHeight = 5; // Überschrift
    zahlungsbedingungenBlockHeight += 4; // Zahlungsziel
    if (daten.skonto) zahlungsbedingungenBlockHeight += 4;
    if (daten.zahlungsart) zahlungsbedingungenBlockHeight += 4;

    // Prüfe Platz für den GESAMTEN Block (Überschrift + Inhalt zusammen)
    summenY = await ensureSpace(doc, summenY, zahlungsbedingungenBlockHeight, stammdaten);

    // Jetzt rendern - alles bleibt zusammen
    addBlockUeberschrift(doc, 'Zahlungsbedingungen', summenY);

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
  }

  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 6;

    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 5;

    // Prüfe Platz für Bemerkung
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);

    addBlockUeberschrift(doc, 'Bemerkung', summenY);
    summenY += 5;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }

  // === Dieselpreiszuschlag ===
  if (daten.dieselpreiszuschlagAktiviert && daten.dieselpreiszuschlagText) {
    summenY += 6;

    const dieselLines = doc.splitTextToSize(daten.dieselpreiszuschlagText, 160);
    const dieselHeight = getTextHeight(dieselLines) + 5;

    // Prüfe Platz für Dieselpreiszuschlag
    summenY = await ensureSpace(doc, summenY, dieselHeight, stammdaten);

    addBlockUeberschrift(doc, 'Dieselpreiszuschlag', summenY);
    summenY += 5;
    doc.text(dieselLines, 25, summenY);
    summenY += (dieselLines.length * 4);
  }

  // === Vertragsklauseln (erschwerte Zufahrt, Mengenanpassung, ...) ===
  summenY = await addVertragsklauseln(doc, daten.vertragsklauseln, summenY, stammdaten);

  // === Freibleibend-Hinweis ===
  summenY += 8;
  summenY = await ensureSpace(doc, summenY, 6, stammdaten);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('Dieses Angebot ist freibleibend. Zwischenverkauf vorbehalten.', 25, summenY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  // === Grußformel ===
  summenY += 8;

  // Prüfe Platz für Grußformel (ca. 12mm)
  summenY = await ensureSpace(doc, summenY, 12, stammdaten);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Wir freuen uns auf Ihre Rückmeldung und verbleiben', 25, summenY);
  summenY += 4;
  doc.text('mit freundlichen Grüßen', 25, summenY);
  summenY += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');

  // === AGB-Anhang (Kleintext, letzte Seite(n)) ===
  if (daten.agbAnhaengen) {
    await addAgbAnhang(doc, stammdaten);
  }

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
  // Maximale Breite für Adressfeld: 80mm (bis zum Infoblock bei 130mm minus etwas Abstand)
  const adressfeldBreiteAB = 80;
  let yPos = 50;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  // Kundenname kann auch lang sein - umbrechen
  yPos = addWrappedText(doc, daten.kundenname, 25, yPos, adressfeldBreiteAB, 5);
  doc.setFont('helvetica', 'normal');
  yPos += 1; // Kleiner Abstand nach Name
  // Straße umbrechen wenn zu lang
  yPos = addWrappedText(doc, formatStrasseHausnummer(daten.kundenstrasse), 25, yPos, adressfeldBreiteAB, 5);
  // PLZ/Ort
  doc.text(daten.kundenPlzOrt, 25, yPos);
  yPos += 5;

  // Ansprechpartner
  if (daten.ansprechpartner) {
    yPos += 1;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`z. Hd. ${daten.ansprechpartner}`, 25, yPos);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
  }

  // === Lieferadresse (falls abweichend) - LINKS unter Kundenadresse ===
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    // Erste Hälfte des Abstands nach Kundenadresse/Ansprechpartner
    yPos += 9;

    // Dezente Trennlinie PERFEKT MITTIG zwischen Kundenadresse und Lieferadresse
    // Kürzer und dezenter: von 30mm bis 75mm (statt 25-100mm)
    doc.setDrawColor(220, 220, 220);  // Heller (dezenter)
    doc.setLineWidth(0.15);  // Dünner (dezenter)
    doc.line(30, yPos, 75, yPos);  // Kürzer und mittig positioniert

    // Zweite Hälfte des Abstands
    yPos += 9;

    // Überschrift "Lieferadresse:"
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Lieferadresse:', 25, yPos);
    yPos += 6;

    // Lieferadresse-Daten
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    // Name umbrechen wenn zu lang
    yPos = addWrappedText(doc, daten.lieferadresseName, 25, yPos, adressfeldBreiteAB, 5);
    doc.setFont('helvetica', 'normal');
    yPos += 1;

    if (daten.lieferadresseStrasse) {
      // Straße umbrechen wenn zu lang
      yPos = addWrappedText(doc, formatStrasseHausnummer(daten.lieferadresseStrasse), 25, yPos, adressfeldBreiteAB, 5);
    }

    if (daten.lieferadressePlzOrt) {
      doc.text(daten.lieferadressePlzOrt, 25, yPos);
      yPos += 5;
    }
  }

  // === DIN 5008: BETREFF ===
  // Dynamische Positionierung: Mindestens 10mm Abstand nach Lieferadresse, sonst Standard-Position
  const betrefYPos = daten.lieferadresseAbweichend && daten.lieferadresseName
    ? Math.max(yPos + 10, 95)  // Mindestens 10mm nach Lieferadresse, aber nie unter 95
    : 95;  // Standard-Position wenn keine Lieferadresse
  yPos = betrefYPos;
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
    margin: { 
      left: 25, 
      right: 20, 
      top: 45,  // WICHTIG: Genug Platz für Logo (Y=12, Höhe=22) + "Fortsetzung" (Y=38) + Abstand
      bottom: 30 
    }, // DIN 5008: links 25mm, rechts 20mm
    head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einh.', 'Stückpr.', 'Gesamt']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid', // WICHTIG: Verhindert, dass eine Positionszeile über Seitenumbrüche geteilt wird
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

  // Prüfe ob genug Platz für Summen-Block (bei Reverse Charge zzgl. Hinweisbox)
  summenY = await ensureSpace(doc, summenY, daten.ohneMehrwertsteuer ? 55 : 35, stammdaten);
  const summen = berechneAngebotsSummen(daten.positionen, {
    frachtkosten: daten.frachtkosten,
    verpackungskosten: daten.verpackungskosten,
    gesamtrabattProzent: daten.gesamtrabattProzent,
    ohneMehrwertsteuer: daten.ohneMehrwertsteuer,
    mehrwertsteuersatz: daten.mehrwertsteuersatz,
  });
  const { frachtUndVerpackung, gesamtrabattProzent, gesamtrabattBetrag, nettoGesamt, umsatzsteuer, bruttobetrag } = summen;
  const nettobetrag = summen.nettoPositionen;

  const summenX = 125;
  summenY += 6;

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

  if (gesamtrabattProzent > 0) {
    summenY += 6;
    const rabattLabel = daten.gesamtrabattBezeichnung?.trim()
      ? `${daten.gesamtrabattBezeichnung} (${gesamtrabattProzent}%):`
      : `Rabatt (${gesamtrabattProzent}%):`;
    doc.setTextColor(0, 100, 0);
    doc.text(rabattLabel, summenX, summenY);
    doc.text(`- ${formatWaehrung(gesamtrabattBetrag)}`, 180, summenY, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    summenY += 6;
    doc.text('Zwischensumme netto:', summenX, summenY);
    doc.text(formatWaehrung(nettoGesamt), 180, summenY, { align: 'right' });
  }

  summenY += 6;
  if (daten.ohneMehrwertsteuer) {
    // Steuerfreie Auftragsbestätigung (Reverse Charge / Ausland)
    doc.setTextColor(100, 100, 100);
    doc.text('MwSt.:', summenX, summenY);
    doc.text('steuerfrei', 180, summenY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  } else {
    doc.text(`MwSt. (${summen.umsatzsteuersatz}%):`, summenX, summenY);
    doc.text(formatWaehrung(umsatzsteuer), 180, summenY, { align: 'right' });
  }

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

  // === Hinweis Reverse Charge / steuerfreie Lieferung (wie auf der Rechnung) ===
  if (daten.ohneMehrwertsteuer) {
    summenY += 10;
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.5);
    const hinweisHoehe = daten.kundenUstIdNr ? 16 : 12;
    doc.roundedRect(25, summenY - 4, 160, hinweisHoehe, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.setFont('helvetica', 'bold');
    doc.text('Steuerfreie innergemeinschaftliche Lieferung', 30, summenY + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Reverse Charge - Steuerschuldnerschaft des Leistungsempfängers gem. § 13b UStG', 30, summenY + 5);
    if (daten.kundenUstIdNr) {
      doc.text(`USt-IdNr. des Leistungsempfängers: ${daten.kundenUstIdNr}`, 30, summenY + 9);
    }
    doc.setTextColor(0, 0, 0);
    summenY += hinweisHoehe;
  }


  // === Liefersaison-Hinweis (undefined = anzeigen, für bestehende Dokumente) ===
  if (daten.liefersaisonAnzeigen !== false) {
    summenY += 8;
    summenY = await ensureSpace(doc, summenY, 8, stammdaten);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    const liefersaisonText = getLiefersaisonText(stammdaten);
    doc.text(liefersaisonText, 25, summenY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
  }

  // === Lieferbedingungen ===
  summenY += 6;

  // Liefertermin-Informationen Labels
  const wochentagLabels: Record<string, string> = {
    'montag': 'Montag',
    'dienstag': 'Dienstag',
    'mittwoch': 'Mittwoch',
    'donnerstag': 'Donnerstag',
    'freitag': 'Freitag',
    'samstag': 'Samstag'
  };
  const belieferungsartLabels: Record<string, string> = {
    'nur_motorwagen': 'Mit Motorwagen',
    'mit_haenger': 'Motorwagen mit Hänger',
    'abholung_ab_werk': 'Abholung ab Werk',
    'palette_mit_ladekran': 'Palette mit Ladekran',
    'bigbag': 'BigBag'
  };

  // Berechne die GESAMTE Höhe des Lieferbedingungen-Blocks BEVOR wir rendern
  let lieferbedingungenBlockHeight = 5; // Überschrift
  if (daten.lieferzeit) lieferbedingungenBlockHeight += 4;
  if (daten.lieferKW) {
    lieferbedingungenBlockHeight += 4; // KW-Text
    if (daten.bevorzugterTag) lieferbedingungenBlockHeight += 4;
    if (daten.belieferungsart) lieferbedingungenBlockHeight += 4;
  } else if (daten.belieferungsart || daten.bevorzugterTag) {
    if (daten.bevorzugterTag) lieferbedingungenBlockHeight += 4;
    if (daten.belieferungsart) lieferbedingungenBlockHeight += 4;
  }

  let lieferbedingungenLines: string[] = [];
  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    lieferbedingungenLines = doc.splitTextToSize(daten.lieferbedingungen, 160);
    lieferbedingungenBlockHeight += 2 + getTextHeight(lieferbedingungenLines);
  }

  // Prüfe Platz für den GESAMTEN Block (Überschrift + Inhalt zusammen)
  summenY = await ensureSpace(doc, summenY, lieferbedingungenBlockHeight, stammdaten);

  // Jetzt rendern - alles bleibt zusammen
  addBlockUeberschrift(doc, 'Lieferbedingungen', summenY);

  summenY += 5;
  if (daten.lieferzeit) {
    doc.text(`Lieferzeit: ${daten.lieferzeit}`, 25, summenY);
    summenY += 4;
  }

  if (daten.lieferKW) {
    // KW-basierter Liefertermin
    const jahr = daten.lieferKWJahr || new Date().getFullYear();
    const kwText = daten.lieferdatumTyp === 'kw'
      ? `Lieferung in KW ${daten.lieferKW}/${jahr}`
      : `Lieferung bevorzugt bis KW ${daten.lieferKW}/${jahr}`;
    doc.text(kwText, 25, summenY);
    summenY += 4;

    // Bevorzugter Wochentag als separate Zeile
    if (daten.bevorzugterTag) {
      doc.text(`Bevorzugter Tag: ${wochentagLabels[daten.bevorzugterTag] || daten.bevorzugterTag}`, 25, summenY);
      summenY += 4;
    }

    // Belieferungsart als separate Zeile
    if (daten.belieferungsart) {
      const belieferungsartLabel = belieferungsartLabels[daten.belieferungsart] || daten.belieferungsart;
      doc.text(`Belieferungsart: ${belieferungsartLabel}`, 25, summenY);
      summenY += 4;
    }
  } else if (daten.belieferungsart || daten.bevorzugterTag) {
    // Nur Belieferungsart/bevorzugter Tag ohne KW
    if (daten.bevorzugterTag) {
      doc.text(`Bevorzugter Tag: ${wochentagLabels[daten.bevorzugterTag] || daten.bevorzugterTag}`, 25, summenY);
      summenY += 4;
    }
    if (daten.belieferungsart) {
      const belieferungsartLabel = belieferungsartLabels[daten.belieferungsart] || daten.belieferungsart;
      doc.text(`Belieferungsart: ${belieferungsartLabel}`, 25, summenY);
      summenY += 4;
    }
  }

  if (daten.lieferbedingungenAktiviert && daten.lieferbedingungen) {
    summenY += 2;
    doc.text(lieferbedingungenLines, 25, summenY);
    summenY += getTextHeight(lieferbedingungenLines);
  }
  
  // === Zahlungsbedingungen ===
  // Nur anzeigen wenn nicht ausgeblendet
  if (!daten.zahlungsbedingungenAusblenden) {
    summenY += 5;

    // Berechne die GESAMTE Höhe des Zahlungsbedingungen-Blocks BEVOR wir rendern
    let zahlungsbedingungenBlockHeight = 5; // Überschrift
    zahlungsbedingungenBlockHeight += 4; // Zahlungsziel
    if (daten.skontoAktiviert && daten.skonto) zahlungsbedingungenBlockHeight += 4;
    if (daten.zahlungsart) zahlungsbedingungenBlockHeight += 4;

    // Prüfe Platz für den GESAMTEN Block (Überschrift + Inhalt zusammen)
    summenY = await ensureSpace(doc, summenY, zahlungsbedingungenBlockHeight, stammdaten);

    // Jetzt rendern - alles bleibt zusammen
    addBlockUeberschrift(doc, 'Zahlungsbedingungen', summenY);

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
  }

  // === Bemerkung ===
  if (daten.bemerkung) {
    summenY += 6;

    const bemerkungLines = doc.splitTextToSize(daten.bemerkung, 160);
    const bemerkungHeight = getTextHeight(bemerkungLines) + 5;

    // Prüfe Platz für Bemerkung
    summenY = await ensureSpace(doc, summenY, bemerkungHeight, stammdaten);

    addBlockUeberschrift(doc, 'Bemerkung', summenY);
    summenY += 5;
    doc.text(bemerkungLines, 25, summenY);
    summenY += (bemerkungLines.length * 4);
  }

  // === Dieselpreiszuschlag ===
  if (daten.dieselpreiszuschlagAktiviert && daten.dieselpreiszuschlagText) {
    summenY += 6;

    const dieselLines = doc.splitTextToSize(daten.dieselpreiszuschlagText, 160);
    const dieselHeight = getTextHeight(dieselLines) + 5;

    // Prüfe Platz für Dieselpreiszuschlag
    summenY = await ensureSpace(doc, summenY, dieselHeight, stammdaten);

    addBlockUeberschrift(doc, 'Dieselpreiszuschlag', summenY);
    summenY += 5;
    doc.text(dieselLines, 25, summenY);
    summenY += (dieselLines.length * 4);
  }

  // === Vertragsklauseln (erschwerte Zufahrt, Mengenanpassung, ...) ===
  summenY = await addVertragsklauseln(doc, daten.vertragsklauseln, summenY, stammdaten);

  // === Grußformel ===
  summenY += 8;

  // Prüfe Platz für Grußformel
  summenY = await ensureSpace(doc, summenY, 15, stammdaten);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Wir danken für Ihr Vertrauen und freuen uns auf eine erfolgreiche Zusammenarbeit.', 25, summenY);
  summenY += 5;
  doc.text('Mit freundlichen Grüßen', 25, summenY);
  summenY += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(stammdaten.firmenname, 25, summenY);
  doc.setFont('helvetica', 'normal');

  // === AGB-Anhang (Kleintext, letzte Seite(n)) ===
  if (daten.agbAnhaengen) {
    await addAgbAnhang(doc, stammdaten);
  }

  // Footer auf allen Seiten
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addDIN5008Footer(doc, stammdaten);
  }

  return doc;
};

// === DIGITALER LIEFERNACHWEIS: QR-Code auf dem Lieferschein ===
// Der Speditionsfahrer scannt den Code beim Abladen mit dem eigenen Smartphone
// (keine App, kein Login) und bestätigt die Lieferung mit Foto.
export interface LiefernachweisQrOptionen {
  /** Öffentlicher Bestätigungs-Link: <origin>/liefernachweis/<projektId>?token=<token> */
  url: string;
  /** true = QR-Link im Testmodus (löst keinen Statuswechsel aus) */
  testModus?: boolean;
}

// === LIEFERSCHEIN ===
// einfach: true = Ohne Einleitung, ohne Abdeckung/PE Folien, ohne Empfangsbestätigung (z.B. für Universal Sport)
// liefernachweis: QR-Code für die digitale Lieferbestätigung durch den Fahrer (optional)
export const generiereLieferscheinPDF = async (daten: LieferscheinDaten, stammdaten?: Stammdaten, einfach?: boolean, liefernachweis?: LiefernachweisQrOptionen): Promise<jsPDF> => {
  // Lade Stammdaten falls nicht übergeben
  if (!stammdaten) {
    stammdaten = await getStammdatenOderDefault();
  }

  const doc = new jsPDF();

  // DIN 5008 Header
  await addDIN5008Header(doc, stammdaten);

  // === HANDSCHRIFTLICHE NOTIZ: Motor/Hänger/Zug (oben rechts, wie vom Disponenten notiert) ===
  if (!einfach) {
    // Priorität: ladeort (neu) > belieferungsart (legacy)
    let notizText: string | undefined;

    if (daten.ladeort) {
      // Neues Ladeort-Feld
      const ladeortLabels: Record<string, string> = {
        'motor': 'Motor',
        'haenger': 'Hänger',
        'zug': 'Zug'
      };
      notizText = ladeortLabels[daten.ladeort];
    } else if (daten.belieferungsart) {
      // Fallback auf Belieferungsart
      const belieferungsNotizen: Record<string, string> = {
        'nur_motorwagen': 'Motor',
        'mit_haenger': 'Hänger',
        'abholung_ab_werk': 'Abholung',
        'palette_mit_ladekran': 'Kran',
        'bigbag': 'BigBag'
      };
      notizText = belieferungsNotizen[daten.belieferungsart];
    }

    if (notizText) {
      // Position: oben rechts, unter dem Logo aber über dem Infoblock
      // Größer und prominenter mit Kreis umrandet
      addHandwrittenNote(doc, notizText, 160, 40, {
        fontSize: 24, // Größer!
        color: [20, 50, 100], // Dunkelblau (Kugelschreiber)
        circled: true,
        style: 'casual'
      });
    }
  }
  
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

  // === DIN 5008: EMPFÄNGERADRESSE (LIEFERADRESSE!) ===
  // WICHTIG: Bei Lieferscheinen ist die LIEFERADRESSE die Hauptadresse im Adressfeld!
  // Maximale Breite für Adressfeld: 80mm (bis zum Infoblock bei 130mm minus etwas Abstand)
  const adressfeldBreiteLS = 80;
  let yPos = 50;

  // Bestimme die zu verwendende Adresse: Lieferadresse hat Vorrang!
  const hauptadresseName = (daten.lieferadresseAbweichend && daten.lieferadresseName)
    ? daten.lieferadresseName
    : daten.kundenname;
  const hauptadresseStrasse = (daten.lieferadresseAbweichend && daten.lieferadresseStrasse)
    ? daten.lieferadresseStrasse
    : daten.kundenstrasse;
  const hauptadressePlzOrt = (daten.lieferadresseAbweichend && daten.lieferadressePlzOrt)
    ? daten.lieferadressePlzOrt
    : daten.kundenPlzOrt;

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  // Name umbrechen wenn zu lang
  yPos = addWrappedText(doc, hauptadresseName, 25, yPos, adressfeldBreiteLS, 5);
  doc.setFont('helvetica', 'normal');
  yPos += 1; // Kleiner Abstand nach Name
  // Straße umbrechen wenn zu lang
  yPos = addWrappedText(doc, formatStrasseHausnummer(hauptadresseStrasse), 25, yPos, adressfeldBreiteLS, 5);
  // PLZ/Ort
  doc.text(hauptadressePlzOrt, 25, yPos);
  yPos += 5;

  // Ansprechpartner wird jetzt unten bei "Abdeckung & PE Folien" als DISPO-Ansprechpartner gedruckt

  // === Rechnungsadresse (nur anzeigen wenn abweichend von Lieferadresse) ===
  // Bei Lieferscheinen: Die Lieferadresse ist im Adressfeld,
  // die Rechnungsadresse wird nur als Info darunter angezeigt wenn sie abweicht
  if (daten.lieferadresseAbweichend && daten.lieferadresseName) {
    // Erste Hälfte des Abstands
    yPos += 9;

    // Dezente Trennlinie
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.line(30, yPos, 75, yPos);

    // Zweite Hälfte des Abstands
    yPos += 9;

    // Überschrift "Rechnungsadresse:"
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Rechnungsadresse:', 25, yPos);
    yPos += 6;

    // Rechnungsadresse-Daten (die ursprünglichen Kundendaten)
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    yPos = addWrappedText(doc, daten.kundenname, 25, yPos, adressfeldBreiteLS, 5);
    doc.setFont('helvetica', 'normal');
    yPos += 1;

    if (daten.kundenstrasse) {
      yPos = addWrappedText(doc, formatStrasseHausnummer(daten.kundenstrasse), 25, yPos, adressfeldBreiteLS, 5);
    }

    if (daten.kundenPlzOrt) {
      doc.text(daten.kundenPlzOrt, 25, yPos);
      yPos += 5;
    }
  }

  // === DIN 5008: BETREFF ===
  // Dynamische Positionierung: Mindestens 10mm Abstand nach Lieferadresse, sonst Standard-Position
  const betrefYPos = daten.lieferadresseAbweichend && daten.lieferadresseName
    ? Math.max(yPos + 10, 95)  // Mindestens 10mm nach Lieferadresse, aber nie unter 95
    : 95;  // Standard-Position wenn keine Lieferadresse
  yPos = betrefYPos;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Lieferschein Nr. ${daten.lieferscheinnummer}`, 25, yPos);
  doc.setFont('helvetica', 'normal');
  
  // === Anrede & Einleitungstext (nur bei Standard-Lieferschein) ===
  if (!einfach) {
    yPos += 10;
    doc.setFontSize(10);
    doc.text('Sehr geehrte Damen und Herren,', 25, yPos);
    yPos += 8;
    doc.text('wir liefern Ihnen wie folgt:', 25, yPos);
  }

  // === Positionen Tabelle (OHNE PREISE!) ===
  yPos += 6;
  
  const tableData = daten.positionen.map(pos => {
    // Bezeichnung mit Beschreibung (falls vorhanden)
    let artikelMitBeschreibung = pos.artikel;
    if (pos.beschreibung && pos.beschreibung.trim()) {
      artikelMitBeschreibung += '\n' + pos.beschreibung;
    }
    
    const row = [
      pos.artikelnummer || '-',  // Artikel-Nr. als erste Spalte
      artikelMitBeschreibung,
      pos.menge.toString(),
      pos.einheit
    ];
    
    return row;
  });
  
  autoTable(doc, {
    startY: yPos,
    margin: { 
      left: 25, 
      right: 20, 
      top: 45,  // WICHTIG: Genug Platz für Logo (Y=12, Höhe=22) + "Fortsetzung" (Y=38) + Abstand
      bottom: 30 
    }, // DIN 5008: links 25mm, rechts 20mm
    head: [['Art.Nr.', 'Artikel', 'Menge', 'Einh.']],
    body: tableData,
    theme: 'striped',
    rowPageBreak: 'avoid', // WICHTIG: Verhindert, dass eine Positionszeile über Seitenumbrüche geteilt wird
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
    bodyStyles: {
      fontStyle: 'bold' // Positionszeilen fett drucken
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'left' },    // Art.Nr.
      1: { cellWidth: 90, valign: 'top' },     // Artikel (mit Beschreibung)
      2: { cellWidth: 20, halign: 'right' },   // Menge
      3: { cellWidth: 30 }                     // Einh.
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

  // === Abdeckung & PE Folien (nur bei Standard-Lieferschein und wenn aktiviert) ===
  // Default: true (für Rückwärtskompatibilität: undefined = true)
  const zeigeAbdeckungBereich = daten.zeigeAbdeckungBereich !== false;

  if (!einfach && zeigeAbdeckungBereich) {
    signY += 15;
    signY = await ensureSpace(doc, signY, 35, stammdaten);

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    // Überschrift
    doc.setFont('helvetica', 'bold');
    doc.text('Abdeckung & PE Folien', 25, signY);
    doc.setFont('helvetica', 'normal');
    signY += 8;

    // Abdeckung Checkboxen (leer zum Ausfüllen vor Ort)
    doc.text('Abgedeckt durch:', 25, signY);
    let abdeckX = 60;

    // Checkbox Kunde (leer)
    doc.rect(abdeckX, signY - 3.5, 4, 4);
    doc.text('Kunde', abdeckX + 6, signY);

    // Checkbox LKW (leer)
    abdeckX += 30;
    doc.rect(abdeckX, signY - 3.5, 4, 4);
    doc.text('LKW', abdeckX + 6, signY);

    signY += 8;

    // PE Folien (Linie zum Ausfüllen)
    doc.text('PE Folien:', 25, signY);
    doc.line(50, signY + 1.5, 100, signY + 1.5); // Linie etwas tiefer für bessere Optik

    signY += 10;
  }

  // === DISPO-Ansprechpartner (IMMER anzeigen bei Standard-Lieferschein) ===
  // Mit Textmarker-Effekt hervorgehoben (wie mit echtem Marker markiert)
  if (!einfach && daten.dispoAnsprechpartner?.name) {
    signY += 5;
    signY = await ensureSpace(doc, signY, 20, stammdaten);

    // Überschrift
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Ansprechpartner bitte 30 min vorher anrufen:', 25, signY);
    doc.setFont('helvetica', 'normal');
    signY += 6;

    // Ansprechpartner-Text mit Name und Telefon
    const ansprechpartnerText = daten.dispoAnsprechpartner.telefon
      ? `${daten.dispoAnsprechpartner.name}, Tel. ${daten.dispoAnsprechpartner.telefon}`
      : daten.dispoAnsprechpartner.name;

    // Textmarker-Effekt (gelb/orange) hinter dem Text
    doc.setFontSize(11);
    const textWidth = doc.getTextWidth(ansprechpartnerText);
    const textHeight = 11 * 0.352778 * 1.5; // Schriftgröße in mm + Padding

    // Gelber Textmarker-Effekt (wie mit Stabilo markiert)
    addHighlighterEffect(
      doc,
      24, // x - etwas links vom Text für natürlichen Look
      signY,
      textWidth + 4, // Breite + Padding
      textHeight,
      [255, 235, 59], // Gelb
      0.45 // Halbtransparent
    );

    // Text darüber zeichnen (fett für bessere Lesbarkeit)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(ansprechpartnerText, 25, signY);
    doc.setFont('helvetica', 'normal');
  }

  // === Empfangsbestätigung (nur bei Standard-Lieferschein und wenn aktiviert) ===
  if (!einfach) {
    // === Empfangsbestätigung (nur wenn aktiviert) ===
    // Default: true (für Rückwärtskompatibilität: undefined = true)
    const zeigeEmpfangsbestaetigung = daten.unterschriftenFuerEmpfangsbestaetigung !== false;

    if (zeigeEmpfangsbestaetigung) {
      signY += 12;

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
    }
  }

  // === DIGITALER LIEFERNACHWEIS: QR-Code für den Fahrer ===
  if (!einfach && liefernachweis?.url) {
    const qrGroesse = 30; // mm
    const boxHoehe = qrGroesse + 10;
    signY += 12;
    signY = await ensureSpace(doc, signY, boxHoehe + 5, stammdaten);

    try {
      const qrDataUrl = await QRCode.toDataURL(liefernachweis.url, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: 'M',
      });

      // Rahmen um den gesamten Block (gut sichtbar für den Fahrer)
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.4);
      doc.roundedRect(25, signY, 160, boxHoehe, 2, 2);

      // QR-Code links im Rahmen
      doc.addImage(qrDataUrl, 'PNG', 30, signY + 5, qrGroesse, qrGroesse);

      // Hinweistext rechts neben dem QR-Code
      const textX = 30 + qrGroesse + 8;
      let textY = signY + 12;
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(
        liefernachweis.testModus
          ? '[TEST] Digitale Lieferbestätigung'
          : 'Digitale Lieferbestätigung',
        textX,
        textY
      );
      doc.setFont('helvetica', 'normal');
      textY += 7;
      doc.setFontSize(10);
      doc.text('Beim Abladen scannen und Lieferung bestätigen.', textX, textY);
      textY += 5;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Mit dem Smartphone – keine App, keine Anmeldung nötig.', textX, textY);
      textY += 4;
      doc.text('1 Foto der abgeladenen Ware genügt (unter 20 Sekunden).', textX, textY);
      doc.setTextColor(0, 0, 0);

      signY += boxHoehe;
    } catch (qrFehler) {
      // QR-Fehler darf die Lieferschein-Erzeugung nie blockieren (Papier-Fallback)
      console.warn('QR-Code für Liefernachweis konnte nicht erzeugt werden:', qrFehler);
    }
  }

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
  
  // Footer auf allen Seiten
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addDIN5008Footer(doc, stammdaten);
  }

  return doc;
};
