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
import { getStammdatenOderDefault, getArtikelPreis } from './stammdatenService';
import { generiereAngebotPDF } from './dokumentService';
import { speichereAngebot } from './projektabwicklungDokumentService';
import { sendeEmailMitPdf, pdfZuBase64, wrapInEmailTemplate } from './emailSendService';
import { anfragenService } from './anfragenService';
import { AngebotsDaten } from '../types/projektabwicklung';
import { NeuerSaisonKunde } from '../types/saisonplanung';
import { generiereStandardEmail } from '../utils/emailHelpers';
import {
  berechneAnzahlSaecke,
} from '../constants/artikelPreise';
import { berechneSpeditionskosten } from '../constants/pricing';
import { sucheArtikelNachNummer } from './artikelService';
import { Artikel } from '../types/artikel';

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
          // DISPO-Ansprechpartner (immer mit Name, optional mit Telefon)
          dispoAnsprechpartner: {
            name: input.kundenDaten.ansprechpartner || input.kundenDaten.name,
            telefon: input.kundenDaten.telefon || '',
          },
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
          // DISPO-Ansprechpartner (immer mit Name, optional mit Telefon)
          dispoAnsprechpartner: {
            name: input.kundenDaten.ansprechpartner || input.kundenDaten.name,
            telefon: input.kundenDaten.telefon || '',
          },
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

      // Standard-Lieferbedingungen
      const standardLieferbedingungen = 'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.';

      const angebotsDaten: AngebotsDaten = {
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt: `${input.kundenDaten.plz} ${input.kundenDaten.ort}`,
        // Ansprechpartner beim Kunden (z. Hd. Vorname Nachname)
        ansprechpartner: input.kundenDaten.ansprechpartner,
        angebotsnummer,
        angebotsdatum: heute,
        gueltigBis,
        positionen: input.positionen,
        zahlungsziel: '14 Tage',
        // KEINE frachtkosten - sind bereits im Preis/Tonne der Positionen enthalten!
        // Lieferbedingungen (Standard wie in Projektabwicklung)
        lieferbedingungenAktiviert: true,
        lieferbedingungen: standardLieferbedingungen,
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
 * Input für die erweiterte Positions-Erstellung
 */
export interface ErstellePositionenInput {
  // Einzelne Tonnen-Felder
  tonnenLose02?: number;
  tonnenGesackt02?: number;
  tonnenLose03?: number;
  tonnenGesackt03?: number;
  // Fallback für alte Aufrufe
  menge?: number;
  koernung?: string;
  lieferart?: string;
  // PLZ für Frachtberechnung
  plz?: string;
  // OPTIONAL: Endpreis pro Tonne (inkl. Lieferkosten aufgeschlagen)
  // Wenn gesetzt, wird dieser Preis statt dem Werkspreis verwendet!
  preisProTonneInklLieferung?: number;
}

/**
 * Ergebnis der Positions-Erstellung
 */
export interface ErstellePositionenErgebnis {
  positionen: Position[];
  gesamtpreisOhneLieferung: number;
  gesamtMengeLose: number;
  gesamtMengeGesackt: number;
  gesamtMenge: number;
  hatBeiladung: boolean;
  empfohleneSpeditionskosten?: number;
}

/**
 * Erstellt Angebots-Positionen mit korrekten Artikeln und Preisen
 *
 * REGELN (BULLET-PROOF!):
 *
 * 1. LOSES MATERIAL:
 *    → TM-ZM-02 oder TM-ZM-03 (Werkspreis: 95.75€/t)
 *    → PE-Folie ist Pflicht!
 *
 * 2. SACKWARE ALS BEILADUNG (< 1t UND loses Material vorhanden):
 *    → TM-ZM-02S oder TM-ZM-03S
 *    → Einheit: STÜCK (einzelne 40kg Säcke)
 *    → Preis: 8.50€/Sack aus Stammdaten
 *    → Keine extra Frachtkosten (fährt mit dem LKW mit)
 *
 * 3. SACKWARE PER SPEDITION (≥1t ODER ohne Schüttgut):
 *    → TM-ZM-02St oder TM-ZM-03St
 *    → Einheit: TONNEN
 *    → Preis: 145€/t aus Stammdaten (ohne Fracht!)
 *    → Frachtkosten separat nach Raben-Tarif
 *
 * 4. KOMBINIERTE KLEINE MENGEN:
 *    → 0.5t 02 + 0.5t 03 = 1t total → eine Sendung
 *    → Gesamtmenge Sackware entscheidet über Beiladung vs. Spedition
 */
export async function erstelleAnfragePositionen(
  input: ErstellePositionenInput
): Promise<ErstellePositionenErgebnis> {
  const positionen: Position[] = [];
  let gesamtpreisOhneLieferung = 0;
  let gesamtMengeLose = 0;
  let gesamtMengeGesackt = 0;
  let hatBeiladung = false;
  let positionIndex = 1;

  // ==========================================
  // ARTIKEL AUS APPWRITE LADEN
  // ==========================================
  const [
    artikelLose02,
    artikelLose03,
    artikelGesackt02,
    artikelGesackt03,
    artikelBeiladung02,
    artikelBeiladung03,
    artikelPE
  ] = await Promise.all([
    sucheArtikelNachNummer('TM-ZM-02'),
    sucheArtikelNachNummer('TM-ZM-03'),
    sucheArtikelNachNummer('TM-ZM-02St'),
    sucheArtikelNachNummer('TM-ZM-03St'),
    sucheArtikelNachNummer('TM-ZM-02S'),
    sucheArtikelNachNummer('TM-ZM-03S'),
    sucheArtikelNachNummer('TM-PE'),
  ]);

  // ==========================================
  // PREISE AUS STAMMDATEN LADEN (Fallback wenn Artikel keinen Preis hat)
  // ==========================================
  const [preisLoseMaterial, preisSackwareProTonne, preisBeiladungProSack, preisPEFolie] = await Promise.all([
    getArtikelPreis('TM-ZM-02'),      // Loses Material €/t (95.75)
    getArtikelPreis('TM-ZM-02St'),    // Sackware per Spedition €/t (145.00)
    getArtikelPreis('TM-ZM-02S'),     // Beiladung €/Sack (8.50)
    getArtikelPreis('TM-PE'),         // PE-Folie €/Stk
  ]);

  // Hilfsfunktion: Bezeichnung und Beschreibung aus Artikel holen
  const getArtikelInfo = (artikel: Artikel | null, fallbackBezeichnung: string) => ({
    bezeichnung: artikel?.bezeichnung || fallbackBezeichnung,
    beschreibung: artikel?.beschreibung || undefined,
  });

  // ==========================================
  // LOSES MATERIAL
  // ==========================================

  // Verwende Endpreis (inkl. Lieferkosten) falls angegeben, sonst Werkspreis aus Stammdaten
  const preisProTonneLose = input.preisProTonneInklLieferung || preisLoseMaterial;

  // 0-2mm lose
  if (input.tonnenLose02 && input.tonnenLose02 > 0) {
    const info = getArtikelInfo(artikelLose02, 'Tennismehl 0/2 Schüttgut');
    const menge = input.tonnenLose02;
    const einzelpreis = preisProTonneLose;
    const preis = menge * einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: 'TM-ZM-02',
      bezeichnung: info.bezeichnung,
      beschreibung: info.beschreibung,
      menge,
      einheit: 't',
      einzelpreis,
      gesamtpreis: preis,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preis;
    gesamtMengeLose += menge;
  }

  // 0-3mm lose
  if (input.tonnenLose03 && input.tonnenLose03 > 0) {
    const info = getArtikelInfo(artikelLose03, 'Tennismehl 0/3 Schüttgut');
    const menge = input.tonnenLose03;
    const einzelpreis = preisProTonneLose;
    const preis = menge * einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: 'TM-ZM-03',
      bezeichnung: info.bezeichnung,
      beschreibung: info.beschreibung,
      menge,
      einheit: 't',
      einzelpreis,
      gesamtpreis: preis,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preis;
    gesamtMengeLose += menge;
  }

  // ==========================================
  // SACKWARE - WICHTIGE ENTSCHEIDUNGSLOGIK
  // ==========================================

  const gesamtSackware02 = input.tonnenGesackt02 || 0;
  const gesamtSackware03 = input.tonnenGesackt03 || 0;
  // WICHTIG: Gesamtmenge KOMBINIERT für Beiladung-Entscheidung!
  const gesamtSackwareGesamt = gesamtSackware02 + gesamtSackware03;

  // Beiladung-Check: < 1t Sackware GESAMT UND loses Material vorhanden
  const sollBeiladungSein = gesamtSackwareGesamt > 0 && gesamtSackwareGesamt < 1 && gesamtMengeLose > 0;

  // 0-2mm gesackt
  if (gesamtSackware02 > 0) {
    if (sollBeiladungSein) {
      // BEILADUNG: Einzelne Säcke auf den LKW
      const info = getArtikelInfo(artikelBeiladung02, 'Tennismehl 0/2 gesackt (40kg Säcke)');
      const anzahlSaecke = berechneAnzahlSaecke(gesamtSackware02);
      const einzelpreis = preisBeiladungProSack; // €/Sack aus Stammdaten
      const preis = anzahlSaecke * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-02S',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung || 'Beiladung - wird mit Schüttgut auf LKW transportiert',
        menge: anzahlSaecke,
        einheit: 'Stk',
        einzelpreis,
        gesamtpreis: preis,
        istBedarfsposition: false,
      });

      gesamtpreisOhneLieferung += preis;
      hatBeiladung = true;
    } else {
      // SPEDITION: In Tonnen abrechnen (Preis 145€/t + Frachtkosten nach Raben-Tarif)
      const info = getArtikelInfo(artikelGesackt02, 'Tennismehl 0/2 gesackt');
      const menge = gesamtSackware02;
      const einzelpreis = preisSackwareProTonne; // €/t aus Stammdaten (145€)
      const preis = menge * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-02St',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung, // Beschreibung aus Appwrite, KEINE hardcoded Texte!
        menge,
        einheit: 't',
        einzelpreis,
        gesamtpreis: preis,
        istBedarfsposition: false,
      });

      gesamtpreisOhneLieferung += preis;
    }
    gesamtMengeGesackt += gesamtSackware02;
  }

  // 0-3mm gesackt
  if (gesamtSackware03 > 0) {
    if (sollBeiladungSein) {
      // BEILADUNG: Einzelne Säcke auf den LKW
      const info = getArtikelInfo(artikelBeiladung03, 'Tennismehl 0/3 gesackt (40kg Säcke)');
      const anzahlSaecke = berechneAnzahlSaecke(gesamtSackware03);
      const einzelpreis = preisBeiladungProSack; // €/Sack aus Stammdaten
      const preis = anzahlSaecke * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-03S',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung || 'Beiladung - wird mit Schüttgut auf LKW transportiert',
        menge: anzahlSaecke,
        einheit: 'Stk',
        einzelpreis,
        gesamtpreis: preis,
        istBedarfsposition: false,
      });

      gesamtpreisOhneLieferung += preis;
      hatBeiladung = true;
    } else {
      // SPEDITION: In Tonnen abrechnen (Preis 145€/t + Frachtkosten nach Raben-Tarif)
      const info = getArtikelInfo(artikelGesackt03, 'Tennismehl 0/3 gesackt');
      const menge = gesamtSackware03;
      const einzelpreis = preisSackwareProTonne; // €/t aus Stammdaten (145€)
      const preis = menge * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-03St',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung, // Beschreibung aus Appwrite, KEINE hardcoded Texte!
        menge,
        einheit: 't',
        einzelpreis,
        gesamtpreis: preis,
        istBedarfsposition: false,
      });

      gesamtpreisOhneLieferung += preis;
    }
    gesamtMengeGesackt += gesamtSackware03;
  }

  // ==========================================
  // PE-FOLIE (Pflicht bei losem Material!)
  // Preis aus Stammdaten (bereits oben geladen)
  // ==========================================

  if (gesamtMengeLose > 0) {
    const info = getArtikelInfo(artikelPE, 'PE-Folie');

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: 'TM-PE',
      bezeichnung: info.bezeichnung,
      beschreibung: info.beschreibung,
      menge: 1,
      einheit: 'Stk',
      einzelpreis: preisPEFolie,
      gesamtpreis: preisPEFolie,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preisPEFolie;
  }

  // ==========================================
  // SPEDITIONSKOSTEN (nur für separate Sackware-Lieferung)
  // ==========================================

  let empfohleneSpeditionskosten: number | undefined;

  // Nur berechnen wenn:
  // 1. PLZ vorhanden
  // 2. Sackware NICHT als Beiladung (also eigene Lieferung per Spedition)
  if (input.plz && gesamtMengeGesackt > 0 && !hatBeiladung) {
    const gewichtKg = gesamtMengeGesackt * 1000;
    const speditionskosten = berechneSpeditionskosten(input.plz, gewichtKg);
    if (speditionskosten !== null) {
      empfohleneSpeditionskosten = speditionskosten;
    }
  }

  return {
    positionen,
    gesamtpreisOhneLieferung,
    gesamtMengeLose,
    gesamtMengeGesackt,
    gesamtMenge: gesamtMengeLose + gesamtMengeGesackt,
    hatBeiladung,
    empfohleneSpeditionskosten,
  };
}

/**
 * Erstellt Standard-Positionen basierend auf den Anfrage-Daten
 * (Legacy-Funktion für Kompatibilität)
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
    // Bestimme korrekte Artikelnummer basierend auf Körnung und Lieferart
    let artikelnummer = 'TM-ZM-02';
    let bezeichnung = artikel || 'Tennismehl 0/2 mm';

    if (koernung === '0-3') {
      artikelnummer = lieferart === 'gesackt' ? 'TM-ZM-03St' : 'TM-ZM-03';
      bezeichnung = artikel || (lieferart === 'gesackt'
        ? 'Tennismehl 0/3 mm gesackt (25kg Säcke)'
        : 'Tennismehl 0/3 mm lose');
    } else {
      artikelnummer = lieferart === 'gesackt' ? 'TM-ZM-02St' : 'TM-ZM-02';
      bezeichnung = artikel || (lieferart === 'gesackt'
        ? 'Tennismehl 0/2 mm gesackt (25kg Säcke)'
        : 'Tennismehl 0/2 mm lose');
    }

    positionen.push({
      id: `pos-${Date.now()}-1`,
      artikelnummer,
      bezeichnung,
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
  ansprechpartner?: string;
}

export async function generiereAngebotsVorschauPDF(
  input: AngebotsVorschauInput
): Promise<string> {
  const stammdaten = await getStammdatenOderDefault();
  const heute = new Date().toISOString().split('T')[0];
  const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Vorschau-Angebotsnummer
  const vorschauNummer = `VORSCHAU-${Date.now()}`;

  // Standard-Lieferbedingungen (wie in Projektabwicklung)
  const standardLieferbedingungen = 'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.';

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
    // z. Hd. Ansprechpartner
    ansprechpartner: input.ansprechpartner,
    // Lieferbedingungen
    lieferbedingungenAktiviert: true,
    lieferbedingungen: standardLieferbedingungen,
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
