// PDF-Generierung für Tourenpläne (Fahrer-Dokument)

import jsPDF from 'jspdf';
import type { Tour, TourStop, Fahrer } from '../types/tour';
import type { Fahrzeug } from '../types/dispo';

// Konstanten
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Belieferungsart Labels
const BELIEFERUNGSART_LABELS: Record<string, string> = {
  nur_motorwagen: 'Nur Motorwagen',
  mit_haenger: 'Mit Hänger',
  abholung_ab_werk: 'Abholung ab Werk',
  palette_mit_ladekran: 'Palette mit Ladekran',
  bigbag: 'BigBag',
};

// Datum formatieren
function formatDatum(datum: string): string {
  const date = new Date(datum);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Uhrzeit formatieren
function formatUhrzeit(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const tourenPdfService = {
  /**
   * Generiert einen druckbaren Tourenplan für den Fahrer
   */
  async generiereTourenplan(
    tour: Tour,
    fahrzeug: Fahrzeug | undefined,
    fahrer: Fahrer | undefined
  ): Promise<jsPDF> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    let y = MARGIN_TOP;

    // === HEADER ===
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 30, 30); // Rot
    doc.text('TOURENPLAN', MARGIN_LEFT, y);

    // Datum rechts
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDatum(tour.datum), PAGE_WIDTH - MARGIN_RIGHT, y, { align: 'right' });

    y += 15;

    // === FAHRZEUG & FAHRER INFO ===
    doc.setFillColor(245, 245, 245);
    doc.rect(MARGIN_LEFT, y - 5, CONTENT_WIDTH, 25, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Fahrzeug:', MARGIN_LEFT + 5, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(fahrzeug?.kennzeichen || 'Nicht zugewiesen', MARGIN_LEFT + 35, y + 3);

    doc.setFont('helvetica', 'bold');
    doc.text('Fahrer:', MARGIN_LEFT + 80, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(fahrer?.name || fahrzeug?.fahrer || 'Nicht zugewiesen', MARGIN_LEFT + 100, y + 3);

    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('Start:', MARGIN_LEFT + 5, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(formatUhrzeit(tour.routeDetails.startZeit) + ' Uhr | Werk Marktheidenfeld', MARGIN_LEFT + 22, y + 3);

    doc.setFont('helvetica', 'bold');
    doc.text('Rückkehr:', MARGIN_LEFT + 100, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(tour.routeDetails.endeZeit ? `~${formatUhrzeit(tour.routeDetails.endeZeit)} Uhr` : 'ca. 16:00 Uhr', MARGIN_LEFT + 125, y + 3);

    y += 20;

    // === ZUSAMMENFASSUNG ===
    doc.setFillColor(230, 240, 250);
    doc.rect(MARGIN_LEFT, y - 5, CONTENT_WIDTH, 15, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('ZUSAMMENFASSUNG', MARGIN_LEFT + 5, y + 2);

    doc.setFont('helvetica', 'normal');
    const zusammenfassung = `${tour.stops.length} Stopps  |  ${tour.routeDetails.gesamtTonnen.toFixed(1)}t  |  ${tour.routeDetails.gesamtDistanzKm > 0 ? tour.routeDetails.gesamtDistanzKm.toFixed(0) + ' km' : 'Distanz n/a'}  |  ${tour.routeDetails.auslastungProzent}% Auslastung`;
    doc.text(zusammenfassung, MARGIN_LEFT + 60, y + 2);

    y += 20;

    // === STOPPS ===
    for (let i = 0; i < tour.stops.length; i++) {
      const stop = tour.stops[i];

      // Seitenumbruch prüfen
      const benoetigteHoehe = this.berechneStopHoehe(stop);
      if (y + benoetigteHoehe > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;

        // Header auf neuer Seite
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(128, 128, 128);
        doc.text(`TOURENPLAN - ${tour.name} - Fortsetzung`, MARGIN_LEFT, y);
        doc.setTextColor(0, 0, 0);
        y += 10;
      }

      // Stop rendern
      y = this.renderStop(doc, stop, y, i === tour.stops.length - 1);

      // Fahrt zum nächsten Stop (außer beim letzten)
      if (i < tour.stops.length - 1) {
        const nextStop = tour.stops[i + 1];
        if (nextStop.distanzVomVorherigenKm || nextStop.fahrzeitVomVorherigenMinuten) {
          doc.setFontSize(9);
          doc.setTextColor(128, 128, 128);
          const fahrInfo = [];
          if (nextStop.distanzVomVorherigenKm) {
            fahrInfo.push(`${nextStop.distanzVomVorherigenKm.toFixed(0)} km`);
          }
          if (nextStop.fahrzeitVomVorherigenMinuten) {
            fahrInfo.push(`~${nextStop.fahrzeitVomVorherigenMinuten} min`);
          }
          doc.text(`↓ ${fahrInfo.join(', ')}`, MARGIN_LEFT + 10, y);
          doc.setTextColor(0, 0, 0);
          y += 8;
        } else {
          y += 5;
        }
      }
    }

    // === FOOTER (letzte Seite) ===
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Seitenzahl
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Seite ${i} von ${totalPages}`,
        PAGE_WIDTH / 2,
        PAGE_HEIGHT - 10,
        { align: 'center' }
      );

      // Erstellt mit
      doc.text(
        `Erstellt: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} | TennisMehl24 Tourenplanung`,
        MARGIN_LEFT,
        PAGE_HEIGHT - 10
      );
    }

    return doc;
  },

  /**
   * Berechnet die benötigte Höhe für einen Stop
   */
  berechneStopHoehe(stop: TourStop): number {
    let hoehe = 45; // Basis

    if (stop.anfahrtshinweise) {
      hoehe += 10;
    }

    if (stop.wichtigeHinweise && stop.wichtigeHinweise.length > 0) {
      hoehe += stop.wichtigeHinweise.length * 6;
    }

    return hoehe;
  },

  /**
   * Rendert einen einzelnen Stop
   */
  renderStop(doc: jsPDF, stop: TourStop, startY: number, _isLast: boolean): number {
    let y = startY;

    // Stopp-Header mit Nummer
    doc.setFillColor(255, 240, 240);
    doc.rect(MARGIN_LEFT, y - 5, CONTENT_WIDTH, 12, 'F');

    // Nummer-Kreis
    doc.setFillColor(180, 30, 30);
    doc.circle(MARGIN_LEFT + 8, y + 1, 5, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(String(stop.position), MARGIN_LEFT + 8, y + 2.5, { align: 'center' });

    // Stopp-Titel
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`STOPP ${stop.position}`, MARGIN_LEFT + 18, y + 2);

    // Geplante Ankunft
    if (stop.ankunftGeplant) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(formatUhrzeit(stop.ankunftGeplant), PAGE_WIDTH - MARGIN_RIGHT - 5, y + 2, { align: 'right' });
    }

    y += 12;

    // Trennlinie
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);

    y += 6;

    // Kundenname
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(stop.kundenname, MARGIN_LEFT, y);

    y += 6;

    // Adresse
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${stop.adresse.strasse}, ${stop.adresse.plz} ${stop.adresse.ort}`, MARGIN_LEFT, y);

    y += 7;

    // Kontaktdaten
    if (stop.kontakt) {
      doc.setFont('helvetica', 'bold');
      doc.text('Ansprechpartner: ', MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stop.kontakt.name}, Tel. ${stop.kontakt.telefon}`, MARGIN_LEFT + 35, y);
      y += 6;
    }

    // Lieferdetails
    doc.setFont('helvetica', 'bold');
    doc.text('Lieferung: ', MARGIN_LEFT, y);
    doc.setFont('helvetica', 'normal');
    const lieferDetails = [];
    lieferDetails.push(`${stop.tonnen}t`);
    if (stop.paletten) {
      lieferDetails.push(`${stop.paletten} Paletten`);
    }
    lieferDetails.push(BELIEFERUNGSART_LABELS[stop.belieferungsart] || stop.belieferungsart);
    doc.text(lieferDetails.join(' | '), MARGIN_LEFT + 23, y);

    y += 6;

    // Zeitfenster
    if (stop.zeitfenster) {
      doc.setFont('helvetica', 'bold');
      doc.text('Zeitfenster: ', MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stop.zeitfenster.von} - ${stop.zeitfenster.bis} Uhr`, MARGIN_LEFT + 27, y);
      y += 6;
    }

    // Wichtige Hinweise (rot hervorgehoben)
    if (stop.wichtigeHinweise && stop.wichtigeHinweise.length > 0) {
      y += 2;
      doc.setTextColor(180, 30, 30);
      for (const hinweis of stop.wichtigeHinweise) {
        doc.setFont('helvetica', 'bold');
        doc.text('! ', MARGIN_LEFT, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(hinweis, CONTENT_WIDTH - 10);
        doc.text(lines, MARGIN_LEFT + 5, y);
        y += lines.length * 5;
      }
      doc.setTextColor(0, 0, 0);
    }

    // Anfahrtshinweise (grau)
    if (stop.anfahrtshinweise) {
      y += 2;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const lines = doc.splitTextToSize(`Anfahrt: ${stop.anfahrtshinweise}`, CONTENT_WIDTH);
      doc.text(lines, MARGIN_LEFT, y);
      y += lines.length * 4;
      doc.setTextColor(0, 0, 0);
    }

    y += 5;

    return y;
  },

  /**
   * Lädt den Tourenplan als PDF herunter
   */
  downloadTourenplan(
    tour: Tour,
    fahrzeug: Fahrzeug | undefined,
    fahrer: Fahrer | undefined
  ): void {
    this.generiereTourenplan(tour, fahrzeug, fahrer).then((doc) => {
      const dateiname = `Tourenplan_${tour.name.replace(/\s+/g, '_')}_${tour.datum}.pdf`;
      doc.save(dateiname);
    });
  },

  /**
   * Öffnet den Tourenplan in einem neuen Tab
   */
  oeffneTourenplan(
    tour: Tour,
    fahrzeug: Fahrzeug | undefined,
    fahrer: Fahrer | undefined
  ): void {
    this.generiereTourenplan(tour, fahrzeug, fahrer).then((doc) => {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    });
  },
};
