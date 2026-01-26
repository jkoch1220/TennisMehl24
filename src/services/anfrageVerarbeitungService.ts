/**
 * Zentraler Service für die vollständige Verarbeitung von E-Mail-Anfragen
 *
 * Ein-Klick-Flow: Kunde anlegen → Projekt erstellen → Angebot generieren → E-Mail versenden
 */

import { VerarbeiteteAnfrage } from '../types/anfragen';
import { Position } from '../types/projektabwicklung';
import { saisonplanungService } from './saisonplanungService';
import { projektService } from './projektService';
import { generiereNaechsteDokumentnummer } from './nummerierungService';
import { getStammdatenOderDefault } from './stammdatenService';
import { generiereAngebotPDF } from './dokumentService';
import { speichereAngebot } from './projektabwicklungDokumentService';
import { sendeEmailMitPdf, pdfZuBase64, wrapInEmailTemplate } from './emailSendService';
import { anfragenService } from './anfragenService';
import { AngebotsDaten } from '../types/projektabwicklung';
import { NeuerSaisonKunde } from '../types/saisonplanung';
import { generiereStandardEmail } from '../utils/emailHelpers';

export type VerarbeitungsSchritt =
  | 'kunde_anlegen'
  | 'projekt_erstellen'
  | 'angebot_generieren'
  | 'angebot_speichern'
  | 'email_versenden'
  | 'status_aktualisieren'
  | 'anfrage_speichern'
  | 'fertig';

export interface VerarbeitungsFortschritt {
  schritt: VerarbeitungsSchritt;
  erfolgreich: boolean;
  details?: string;
}

export interface AnfrageVerarbeitungInput {
  anfrage: VerarbeiteteAnfrage;
  kundeNeu: boolean;
  kundenDaten: {
    name: string;
    email: string;
    telefon?: string;
    strasse: string;
    plz: string;
    ort: string;
    ansprechpartner?: string;
  };
  existierenderKundeId?: string;
  positionen: Position[];
  preisProTonne: number;
  frachtkosten?: number;
  emailVorschlag: {
    betreff: string;
    text: string;
  };
  absenderEmail: string;
  freibleibend?: boolean;
}

export interface AnfrageVerarbeitungErgebnis {
  success: boolean;
  kundeId?: string;
  kundennummer?: string;
  projektId?: string;
  angebotsnummer?: string;
  error?: string;
  fortschritt: VerarbeitungsFortschritt[];
}

/**
 * Verarbeitet eine Anfrage vollständig in einem Durchgang:
 * 1. Kunde anlegen (wenn neu)
 * 2. Projekt erstellen
 * 3. Angebotsnummer generieren
 * 4. Angebots-PDF generieren
 * 5. Angebot speichern
 * 6. E-Mail mit PDF versenden
 * 7. Projektstatus aktualisieren
 * 8. Anfrage in DB speichern
 */
export async function verarbeiteAnfrageVollstaendig(
  input: AnfrageVerarbeitungInput,
  onFortschritt?: (fortschritt: VerarbeitungsFortschritt) => void
): Promise<AnfrageVerarbeitungErgebnis> {
  const fortschritt: VerarbeitungsFortschritt[] = [];

  const reportFortschritt = (schritt: VerarbeitungsSchritt, erfolgreich: boolean, details?: string) => {
    const f: VerarbeitungsFortschritt = { schritt, erfolgreich, details };
    fortschritt.push(f);
    if (onFortschritt) {
      onFortschritt(f);
    }
  };

  try {
    // ============================================
    // SCHRITT 1: Kunde anlegen oder laden
    // ============================================
    let kundeId = input.existierenderKundeId;
    let kundennummer: string | undefined;

    if (input.kundeNeu && input.kundenDaten) {
      try {
        const neuerKundeInput: NeuerSaisonKunde = {
          typ: 'verein',
          name: input.kundenDaten.name,
          email: input.kundenDaten.email,
          aktiv: true,
          rechnungsadresse: {
            strasse: input.kundenDaten.strasse,
            plz: input.kundenDaten.plz,
            ort: input.kundenDaten.ort,
            bundesland: ''
          },
          lieferadresse: {
            strasse: input.kundenDaten.strasse,
            plz: input.kundenDaten.plz,
            ort: input.kundenDaten.ort,
            bundesland: ''
          },
          // DISPO-Ansprechpartner mit Telefon
          dispoAnsprechpartner: input.kundenDaten.telefon ? {
            name: input.kundenDaten.ansprechpartner || input.kundenDaten.name,
            telefon: input.kundenDaten.telefon,
          } : undefined,
        };

        const neuerKunde = await saisonplanungService.createKunde(neuerKundeInput);
        kundeId = neuerKunde.id;
        kundennummer = neuerKunde.kundennummer;
        reportFortschritt('kunde_anlegen', true, `Kunde "${neuerKunde.name}" angelegt (${kundennummer})`);
      } catch (error) {
        reportFortschritt('kunde_anlegen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
        throw new Error(`Kunde konnte nicht angelegt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      }
    } else if (kundeId) {
      try {
        const existierenderKunde = await saisonplanungService.loadKunde(kundeId);
        if (existierenderKunde) {
          kundennummer = existierenderKunde.kundennummer;
          reportFortschritt('kunde_anlegen', true, `Bestehender Kunde verwendet (${kundennummer || kundeId})`);
        }
      } catch (error) {
        reportFortschritt('kunde_anlegen', false, 'Kunde konnte nicht geladen werden');
        throw new Error('Existierender Kunde konnte nicht geladen werden');
      }
    } else {
      // Kein Kunde - erstelle mit den Anfrage-Daten
      try {
        const neuerKundeInput: NeuerSaisonKunde = {
          typ: 'verein',
          name: input.kundenDaten.name,
          email: input.kundenDaten.email,
          aktiv: true,
          rechnungsadresse: {
            strasse: input.kundenDaten.strasse,
            plz: input.kundenDaten.plz,
            ort: input.kundenDaten.ort,
            bundesland: ''
          },
          lieferadresse: {
            strasse: input.kundenDaten.strasse,
            plz: input.kundenDaten.plz,
            ort: input.kundenDaten.ort,
            bundesland: ''
          },
          // DISPO-Ansprechpartner mit Telefon
          dispoAnsprechpartner: input.kundenDaten.telefon ? {
            name: input.kundenDaten.ansprechpartner || input.kundenDaten.name,
            telefon: input.kundenDaten.telefon,
          } : undefined,
        };

        const neuerKunde = await saisonplanungService.createKunde(neuerKundeInput);
        kundeId = neuerKunde.id;
        kundennummer = neuerKunde.kundennummer;
        reportFortschritt('kunde_anlegen', true, `Kunde "${neuerKunde.name}" angelegt (${kundennummer})`);
      } catch (error) {
        reportFortschritt('kunde_anlegen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
        throw new Error(`Kunde konnte nicht angelegt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      }
    }

    // ============================================
    // SCHRITT 2: Projekt erstellen
    // ============================================
    let projektId: string;

    try {
      const kundenPlzOrt = `${input.kundenDaten.plz} ${input.kundenDaten.ort}`;

      const projekt = await projektService.createProjekt({
        projektName: input.kundenDaten.name,
        kundeId: kundeId!,
        kundennummer,
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt,
        kundenEmail: input.kundenDaten.email,
        saisonjahr: new Date().getFullYear(),
        status: 'angebot',
        angefragteMenge: input.anfrage.analysiert?.menge,
        preisProTonne: input.preisProTonne,
        ansprechpartner: input.kundenDaten.ansprechpartner,
      });

      projektId = projekt.id;
      reportFortschritt('projekt_erstellen', true, `Projekt erstellt (ID: ${projektId})`);
    } catch (error) {
      reportFortschritt('projekt_erstellen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`Projekt konnte nicht erstellt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 3: Angebotsnummer generieren
    // ============================================
    let angebotsnummer: string;

    try {
      angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
      reportFortschritt('angebot_generieren', true, `Angebotsnummer: ${angebotsnummer}`);
    } catch (error) {
      reportFortschritt('angebot_generieren', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`Angebotsnummer konnte nicht generiert werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 4: AngebotsDaten zusammenstellen & PDF generieren
    // ============================================
    let pdfBase64: string;
    let pdfDateiname: string;

    try {
      const stammdaten = await getStammdatenOderDefault();
      const heute = new Date().toISOString().split('T')[0];
      const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const angebotsDaten: AngebotsDaten = {
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt: `${input.kundenDaten.plz} ${input.kundenDaten.ort}`,
        angebotsnummer,
        angebotsdatum: heute,
        gueltigBis,
        positionen: input.positionen,
        zahlungsziel: '14 Tage',
        frachtkosten: input.frachtkosten,
        // Stammdaten für Header/Footer
        firmenname: stammdaten.firmenname,
        firmenstrasse: stammdaten.firmenstrasse,
        firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
        firmenTelefon: stammdaten.firmenTelefon,
        firmenEmail: stammdaten.firmenEmail,
      };

      // PDF generieren
      const pdf = await generiereAngebotPDF(angebotsDaten, stammdaten);
      pdfBase64 = pdfZuBase64(pdf);
      pdfDateiname = `Angebot_${angebotsnummer.replace(/\//g, '-')}_${input.kundenDaten.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      // ============================================
      // SCHRITT 5: Angebot in Appwrite speichern
      // ============================================
      try {
        await speichereAngebot(projektId, angebotsDaten);
        reportFortschritt('angebot_speichern', true, 'Angebot gespeichert');
      } catch (error) {
        // Nicht kritisch - wir können trotzdem versenden
        reportFortschritt('angebot_speichern', false, 'Speichern fehlgeschlagen (nicht kritisch)');
        console.warn('Angebot konnte nicht gespeichert werden:', error);
      }
    } catch (error) {
      reportFortschritt('angebot_generieren', false, `PDF-Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`PDF konnte nicht generiert werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 6: E-Mail mit PDF versenden
    // ============================================
    try {
      // Lade E-Mail-Template mit Signatur
      let signaturHtml = '';
      try {
        const emailTemplate = await generiereStandardEmail('angebot', angebotsnummer, input.kundenDaten.name);
        signaturHtml = emailTemplate.signatur || '';
      } catch (templateError) {
        console.warn('Konnte Signatur nicht laden:', templateError);
      }

      // Erstelle HTML-Body mit Signatur
      const htmlBody = wrapInEmailTemplate(input.emailVorschlag.text, signaturHtml);

      const emailResult = await sendeEmailMitPdf({
        empfaenger: input.kundenDaten.email,
        absender: input.absenderEmail,
        betreff: input.emailVorschlag.betreff,
        htmlBody,
        pdfBase64,
        pdfDateiname,
        projektId,
        dokumentTyp: 'angebot',
        dokumentNummer: angebotsnummer,
      });

      if (!emailResult.success) {
        reportFortschritt('email_versenden', false, `Fehler: ${emailResult.error}`);
        throw new Error(`E-Mail-Versand fehlgeschlagen: ${emailResult.error}`);
      }

      reportFortschritt('email_versenden', true, `E-Mail an ${input.kundenDaten.email} gesendet`);
    } catch (error) {
      reportFortschritt('email_versenden', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`E-Mail konnte nicht versendet werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 7: Projektstatus aktualisieren
    // ============================================
    try {
      await projektService.updateProjektStatus(projektId, 'angebot_versendet');
      reportFortschritt('status_aktualisieren', true, 'Status auf "angebot_versendet" gesetzt');
    } catch (error) {
      // Nicht kritisch
      reportFortschritt('status_aktualisieren', false, 'Status-Update fehlgeschlagen (nicht kritisch)');
      console.warn('Projektstatus konnte nicht aktualisiert werden:', error);
    }

    // ============================================
    // SCHRITT 8: Anfrage in DB speichern (für Nachverfolgung)
    // ============================================
    try {
      await anfragenService.createAnfrage({
        emailBetreff: input.anfrage.emailBetreff,
        emailAbsender: input.anfrage.emailAbsender,
        emailDatum: input.anfrage.emailDatum,
        emailText: input.anfrage.emailText,
        emailHtml: input.anfrage.emailHtml,
        extrahierteDaten: input.anfrage.extrahierteDaten,
        status: 'verarbeitet',
        kundeId: kundeId!,
        projektId,
        angebotVersendetAm: new Date().toISOString(),
      });
      reportFortschritt('anfrage_speichern', true, 'Anfrage protokolliert');
    } catch (error) {
      // Nicht kritisch
      reportFortschritt('anfrage_speichern', false, 'Protokollierung fehlgeschlagen (nicht kritisch)');
      console.warn('Anfrage konnte nicht in DB gespeichert werden:', error);
    }

    // ============================================
    // FERTIG!
    // ============================================
    reportFortschritt('fertig', true, `Angebot ${angebotsnummer} erfolgreich versendet!`);

    return {
      success: true,
      kundeId: kundeId!,
      kundennummer,
      projektId,
      angebotsnummer,
      fortschritt,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      fortschritt,
    };
  }
}

/**
 * Erstellt Standard-Positionen basierend auf den Anfrage-Daten
 */
export function erstelleStandardPositionen(
  menge: number | undefined,
  preisProTonne: number,
  artikel?: string,
  koernung?: string,
  lieferart?: string
): Position[] {
  const positionen: Position[] = [];

  if (menge && menge > 0) {
    // Hauptposition: Tennismehl
    const artikelbezeichnung = artikel || 'Tennismehl 0/2 mm (Ziegelmehl)';
    const beschreibung = [
      koernung ? `Körnung: ${koernung}` : null,
      lieferart ? `Lieferart: ${lieferart}` : null,
    ].filter(Boolean).join(', ');

    positionen.push({
      id: `pos-${Date.now()}-1`,
      artikelnummer: 'TM-02',
      bezeichnung: artikelbezeichnung,
      beschreibung: beschreibung || undefined,
      menge,
      einheit: 't',
      einzelpreis: preisProTonne,
      gesamtpreis: menge * preisProTonne,
      istBedarfsposition: false,
    });
  }

  return positionen;
}

/**
 * Generiert einen Standard-E-Mail-Text für das Angebot
 */
export function generiereStandardEmailText(
  _kundenname: string,
  ansprechpartner?: string
): string {
  const anrede = ansprechpartner
    ? `Sehr geehrte/r ${ansprechpartner}`
    : 'Sehr geehrte Damen und Herren';

  return `${anrede},

vielen Dank für Ihre Anfrage.

Anbei erhalten Sie unser Angebot für Tennismehl. Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

TENNISMEHL GmbH
Tel: 09391 9870-0
E-Mail: info@tennismehl.com`;
}

/**
 * Generiert eine PDF-Vorschau des Angebots ohne es zu versenden.
 * Öffnet das PDF in einem neuen Browser-Tab.
 */
export interface AngebotsVorschauInput {
  kundenDaten: {
    name: string;
    strasse: string;
    plz: string;
    ort: string;
  };
  positionen: Position[];
  frachtkosten?: number;
}

export async function generiereAngebotsVorschauPDF(
  input: AngebotsVorschauInput
): Promise<string> {
  const stammdaten = await getStammdatenOderDefault();
  const heute = new Date().toISOString().split('T')[0];
  const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Vorschau-Angebotsnummer
  const vorschauNummer = `VORSCHAU-${Date.now()}`;

  const angebotsDaten: AngebotsDaten = {
    kundenname: input.kundenDaten.name,
    kundenstrasse: input.kundenDaten.strasse,
    kundenPlzOrt: `${input.kundenDaten.plz} ${input.kundenDaten.ort}`,
    angebotsnummer: vorschauNummer,
    angebotsdatum: heute,
    gueltigBis,
    positionen: input.positionen,
    zahlungsziel: '14 Tage',
    frachtkosten: input.frachtkosten,
    // Stammdaten für Header/Footer
    firmenname: stammdaten.firmenname,
    firmenstrasse: stammdaten.firmenstrasse,
    firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
    firmenTelefon: stammdaten.firmenTelefon,
    firmenEmail: stammdaten.firmenEmail,
  };

  // PDF generieren
  const pdf = await generiereAngebotPDF(angebotsDaten, stammdaten);

  // Als Blob URL zurückgeben
  const blobUrl = pdf.output('bloburl');
  return typeof blobUrl === 'string' ? blobUrl : blobUrl.toString();
}
