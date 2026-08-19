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
import { formatAdresszeile } from './pdfHelpers';
import { speichereAngebot } from './projektabwicklungDokumentService';
import { sendeEmailMitPdf, pdfZuBase64, wrapInEmailTemplate } from './emailSendService';
import { anfragenService } from './anfragenService';
import { AngebotsDaten, VertragsKlausel } from '../types/projektabwicklung';
import { getDieselKlauselText } from '../utils/dieselZuschlag';
import { STANDARD_LIEFERBEDINGUNGEN, STANDARD_ZAHLUNGSZIEL } from '../constants/vertragsklauseln';
import { NeuerSaisonKunde } from '../types/saisonplanung';
import { generiereStandardEmail } from '../utils/emailHelpers';
import {
  berechneAnzahlSaecke,
  berechneMindermengenpauschale,
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
    land?: string; // ISO-Ländercode (z.B. 'DE', 'AT', 'CH')
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
  /** Notizen aus dem Telefonat (Sales-Leitfaden) – landen als Projekt-Notiz. */
  telefonNotizen?: string;
  /** Im Dialog gewählte Vertragsklauseln (Zufahrt, Mengenanpassung, …). */
  vertragsklauseln?: VertragsKlausel[];
  /** AGB als Kleintext-Anhang ans Angebots-PDF hängen. */
  agbAnhaengen?: boolean;
  /** Lieferbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  lieferbedingungenAktiv?: boolean;
  /** Text der Lieferbedingungen (im Dialog editierbar). */
  lieferbedingungenText?: string;
  /** Zahlungsbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  zahlungsbedingungenAktiv?: boolean;
  /** Zahlungsziel, z.B. "14 Tage" oder "Vorkasse". */
  zahlungsziel?: string;
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
 * Hält den Bearbeitungsstand an der Anfrage selbst fest.
 *
 * Früher wurde hier eine zweite Anfrage mit Status 'verarbeitet' angelegt — das
 * Original blieb auf 'neu' liegen. Das Anfragen-Tool musste den Bearbeitungsstand
 * deshalb aus dem E-Mail-Protokoll erraten und lag falsch, sobald das Angebot an
 * eine andere Adresse ging als die des Anfragenden (Vereins- vs. Firmenadresse).
 * Nur wenn die Anfrage nicht aus der Datenbank stammt, wird noch angelegt.
 */
async function markiereAnfrageAlsVerarbeitet(
  anfrage: AnfrageVerarbeitungInput['anfrage'],
  daten: {
    status: 'verarbeitet' | 'angebot_erstellt';
    kundeId: string;
    projektId: string;
    angebotVersendetAm?: string;
  }
): Promise<void> {
  if (anfrage.id) {
    await anfragenService.updateAnfrage(anfrage.id, {
      status: daten.status,
      kundeId: daten.kundeId,
      projektId: daten.projektId,
      angebotId: daten.projektId,
      ...(daten.angebotVersendetAm ? { angebotVersendetAm: daten.angebotVersendetAm } : {}),
    });
    return;
  }

  await anfragenService.createAnfrage({
    emailBetreff: anfrage.emailBetreff,
    emailAbsender: anfrage.emailAbsender,
    emailDatum: anfrage.emailDatum,
    emailText: anfrage.emailText,
    emailHtml: anfrage.emailHtml,
    extrahierteDaten: anfrage.extrahierteDaten,
    status: daten.status,
    kundeId: daten.kundeId,
    projektId: daten.projektId,
    angebotVersendetAm: daten.angebotVersendetAm,
  });
}

/** Kontaktdaten, wie sie aus dem Anfragen-Dialog kommen */
export interface AnfrageKundenDaten {
  name: string;
  email: string;
  telefon?: string;
  strasse: string;
  plz: string;
  ort: string;
  land?: string;
  ansprechpartner?: string;
}

/**
 * Legt die Person aus der Anfrage als Ansprechpartner im Kundenstamm an —
 * mit Name, E-Mail und Telefonnummer.
 *
 * Bis 08/2026 landeten diese Daten nur im losen `dispoAnsprechpartner`-Objekt am
 * Kunden (Name + Telefon, ohne E-Mail). Die Kundenakte und die Call-Liste lesen aber
 * `ansprechpartner[].telefonnummern` aus der Ansprechpartner-Collection — dort stand
 * nichts. Wer nach einem Angebot nachtelefonieren wollte, musste die Nummer aus der
 * Original-E-Mail suchen.
 *
 * Angelegt wird, sobald ein Name vorliegt und mindestens ein Kontaktweg (E-Mail oder
 * Telefon) bekannt ist — ein Eintrag ganz ohne Kontaktdaten hätte keinen Nutzen.
 * Ohne eigenen Ansprechpartner-Namen greift der Kundenname, damit die E-Mail-Adresse
 * des Absenders trotzdem in der Akte auffindbar ist.
 *
 * `dispo` unterscheidet die beiden Fälle:
 * - Neukunde → `'setzen'`: Diese Person ist der einzige bekannte Kontakt und damit
 *   auch der für die Lieferabstimmung.
 * - Bestandskunde → `'nur_wenn_keiner'`: Ein gepflegter Dispo-Ansprechpartner
 *   (z.B. der Platzwart) darf seine Markierung nicht an den Absender der Anfrage
 *   verlieren — sonst ruft die Tourenplanung später den Falschen an.
 *
 * Schlägt das fehl, wird nur gewarnt: Ein nicht übernommener Kontakt darf nicht die
 * gesamte Anfragen-Verarbeitung (Angebot, E-Mail-Versand) kippen.
 */
export async function uebernehmeKontaktInKundenstamm(
  kundeId: string,
  kontakt: { name: string; email: string; telefon: string },
  dispo: 'setzen' | 'nur_wenn_keiner' | 'nicht_aendern'
): Promise<void> {
  if (!kundeId) return;

  const name = kontakt.name.trim();
  const email = kontakt.email.trim();
  const telefon = kontakt.telefon.trim();

  if (!name || (!telefon && !email)) return;

  try {
    await saisonplanungService.setzeDispoAnsprechpartner(
      kundeId,
      { name, telefon, email },
      {
        dispo,
        // Freitext-Rolle: macht in der Kundenakte sichtbar, woher der Kontakt stammt
        rolle: 'Ansprechpartner (aus Anfrage)',
        telefonTyp: 'Telefon',
      }
    );
  } catch (error) {
    console.warn('Kontakt konnte nicht in den Ansprechpartner-Stamm übernommen werden:', error);
  }
}

/**
 * Ermittelt die Kontaktdaten der Person, die die Anfrage geschickt hat.
 *
 * Wichtig, weil `kundenDaten` NICHT durchgehend die Person beschreibt: Sobald im
 * Dialog ein bestehender Kunde zugeordnet wird, überschreibt dieser `email` und
 * `telefon` mit den Stammdaten des KUNDEN (Vereinsadresse, Nummer des Platzwarts) —
 * `ansprechpartner` bleibt dabei der Absender. Wer das ungeprüft übernimmt, legt
 * einen Ansprechpartner an, der den Namen der einen und die Kontaktdaten einer
 * anderen Person trägt.
 *
 * Deshalb:
 * - Neuer Kunde → `kundenDaten` ist unverfälscht (und ggf. vom Bearbeiter korrigiert)
 * - Bestehender Kunde → die Originaldaten aus der Anfrage, sonst gar nichts.
 *   Lieber kein Kontakt als ein falsch zusammengesetzter.
 */
function ermittleAbsenderKontakt(
  kundenDaten: AnfrageKundenDaten,
  anfrage: VerarbeiteteAnfrage | undefined,
  kundeIstNeu: boolean
): { name: string; email: string; telefon: string } | null {
  if (kundeIstNeu) {
    return {
      name: kundenDaten.ansprechpartner?.trim() || kundenDaten.name?.trim() || '',
      email: kundenDaten.email || '',
      telefon: kundenDaten.telefon || '',
    };
  }

  const a = anfrage?.analysiert;
  if (!a) return null;

  const name = (a.ansprechpartner || '').trim();
  if (!name) return null; // ohne Personennamen liesse sich nur der Vereinsname eintragen

  return { name, email: a.email || '', telefon: a.telefon || '' };
}

/**
 * Legt den Kunden aus einer Anfrage an oder lädt den ausgewählten bestehenden.
 *
 * Fasst vier zuvor Wort für Wort identische Blöcke zusammen (je zwei in
 * `verarbeiteAnfrageVollstaendig` und `erstelleNurKundeUndProjekt`) — die
 * Kontakt-Übernahme hätte sonst an vier Stellen gepflegt werden müssen.
 */
export async function legeKundeAnOderLade(
  kundeNeu: boolean,
  existierenderKundeId: string | undefined,
  kundenDaten: AnfrageKundenDaten,
  anfrage?: VerarbeiteteAnfrage
): Promise<{ kundeId: string; kundennummer?: string; details: string }> {
  const telefon = (kundenDaten.telefon || '').trim();

  // Bestehender Kunde: Nummer nur ergänzen, nie überschreiben — im Stamm steht oft
  // die gepflegte Vereinsnummer, in der Anfrage die des aktuellen Absenders.
  if (!kundeNeu && existierenderKundeId) {
    const existierenderKunde = await saisonplanungService.loadKunde(existierenderKundeId);
    if (!existierenderKunde) {
      throw new Error('Existierender Kunde konnte nicht geladen werden');
    }

    if (telefon && !existierenderKunde.telefon?.trim()) {
      try {
        await saisonplanungService.updateKunde(existierenderKundeId, { telefon });
      } catch (error) {
        console.warn('Telefonnummer konnte nicht am Kunden ergänzt werden:', error);
      }
    }

    const kontakt = ermittleAbsenderKontakt(kundenDaten, anfrage, false);
    if (kontakt) {
      // Die Dispo-Markierung entscheidet, wen Lieferschein und Tourenplanung anrufen.
      // Sie darf der Absender einer Anfrage nur bekommen, wenn der Kunde noch gar
      // keinen Dispo-Kontakt hat — auch nicht im losen Feld `dispoAnsprechpartner`,
      // das bei migrierten Kunden und Altbestand die einzige Quelle ist und von
      // `nur_wenn_keiner` (das nur die Ansprechpartner-Collection kennt) nicht
      // gesehen würde.
      const hatGepflegtenDispoKontakt = !!existierenderKunde.dispoAnsprechpartner?.name?.trim();
      await uebernehmeKontaktInKundenstamm(
        existierenderKundeId,
        kontakt,
        hatGepflegtenDispoKontakt ? 'nicht_aendern' : 'nur_wenn_keiner'
      );
    }

    return {
      kundeId: existierenderKundeId,
      kundennummer: existierenderKunde.kundennummer,
      details: `Bestehender Kunde verwendet (${existierenderKunde.kundennummer || existierenderKundeId})`,
    };
  }

  const adresse = {
    strasse: kundenDaten.strasse,
    plz: kundenDaten.plz,
    ort: kundenDaten.ort,
    bundesland: '',
  };

  const neuerKundeInput: NeuerSaisonKunde = {
    typ: 'verein',
    name: kundenDaten.name,
    email: kundenDaten.email,
    // Hauptnummer am Kunden — wird u.a. in der Kundenliste und in Projekt-E-Mails gelesen
    telefon: telefon || undefined,
    aktiv: true,
    rechnungsadresse: { ...adresse },
    lieferadresse: { ...adresse },
    // DISPO-Ansprechpartner (immer mit Name, optional mit Telefon)
    dispoAnsprechpartner: {
      name: kundenDaten.ansprechpartner || kundenDaten.name,
      telefon,
    },
  };

  const neuerKunde = await saisonplanungService.createKunde(neuerKundeInput);

  const kontakt = ermittleAbsenderKontakt(kundenDaten, anfrage, true);
  if (kontakt) {
    await uebernehmeKontaktInKundenstamm(neuerKunde.id, kontakt, 'setzen');
  }

  return {
    kundeId: neuerKunde.id,
    kundennummer: neuerKunde.kundennummer,
    details: `Kunde "${neuerKunde.name}" angelegt (${neuerKunde.kundennummer})`,
  };
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
 * 8. Anfrage als verarbeitet markieren
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
    let kundeId: string;
    let kundennummer: string | undefined;

    try {
      const kundenErgebnis = await legeKundeAnOderLade(
        input.kundeNeu,
        input.existierenderKundeId,
        input.kundenDaten,
        input.anfrage
      );
      kundeId = kundenErgebnis.kundeId;
      kundennummer = kundenErgebnis.kundennummer;
      reportFortschritt('kunde_anlegen', true, kundenErgebnis.details);
    } catch (error) {
      reportFortschritt('kunde_anlegen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`Kunde konnte nicht angelegt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 2: Projekt erstellen
    // ============================================
    let projektId: string;

    try {
      const kundenPlzOrt = formatAdresszeile(input.kundenDaten.plz, input.kundenDaten.ort, input.kundenDaten.land);

      const projekt = await projektService.createProjekt({
        projektName: input.kundenDaten.name,
        kundeId: kundeId!,
        kundennummer,
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt,
        kundenEmail: input.kundenDaten.email,
        // Telefonnummer aus der Anfrage direkt am Projekt — die Projektansicht und die
        // Lieferschein-/Speditions-Mail lesen `kundenTelefon`. Ohne sie musste man zum
        // Nachtelefonieren erst in die Kundenakte oder die Original-Mail wechseln.
        kundenTelefon: input.kundenDaten.telefon?.trim() || undefined,
        saisonjahr: new Date().getFullYear(),
        herkunft: 'anfrage',
        status: 'angebot',
        angefragteMenge: input.anfrage.analysiert?.menge,
        preisProTonne: input.preisProTonne,
        ansprechpartner: input.kundenDaten.ansprechpartner,
        notizen: input.telefonNotizen?.trim() || undefined,
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
    // SCHRITT 3b: Angebotsnummer im Projekt speichern
    // ============================================
    const heute = new Date().toISOString().split('T')[0];

    try {
      await projektService.updateProjekt(projektId, {
        angebotsnummer,
        angebotsdatum: heute,
      });
    } catch (error) {
      // Nicht kritisch - wir können trotzdem versenden, aber loggen
      console.warn('Angebotsnummer konnte nicht im Projekt gespeichert werden:', error);
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
        kundenPlzOrt: formatAdresszeile(input.kundenDaten.plz, input.kundenDaten.ort, input.kundenDaten.land),
        // Ansprechpartner beim Kunden (z. Hd. Vorname Nachname)
        ansprechpartner: input.kundenDaten.ansprechpartner,
        angebotsnummer,
        angebotsdatum: heute,
        gueltigBis,
        positionen: input.positionen,
        zahlungsziel: input.zahlungsziel ?? STANDARD_ZAHLUNGSZIEL,
        zahlungsbedingungenAusblenden: input.zahlungsbedingungenAktiv === false,
        // KEINE frachtkosten - sind bereits im Preis/Tonne der Positionen enthalten!
        // Lieferbedingungen (Standard wie in Projektabwicklung)
        lieferbedingungenAktiviert: input.lieferbedingungenAktiv ?? true,
        lieferbedingungen: input.lieferbedingungenText ?? STANDARD_LIEFERBEDINGUNGEN,
        // Klauseln + AGB-Anhang aus dem Anfrage-Dialog
        vertragsklauseln: input.vertragsklauseln,
        agbAnhaengen: input.agbAnhaengen ?? true,
        // Dieselpreiszuschlag: Der Betrag wird als TM-DZ-Position einkalkuliert, also muss
        // der Hinweis auch auf dem Dokument stehen — sonst berechnen wir etwas, das wir
        // nicht erklären. Text richtet sich nach der Staffel der Angebotsgültigkeit.
        dieselpreiszuschlagAktiviert: true,
        dieselpreiszuschlagText: getDieselKlauselText(gueltigBis),
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
    // SCHRITT 8: Anfrage als verarbeitet markieren
    // ============================================
    try {
      await markiereAnfrageAlsVerarbeitet(input.anfrage, {
        status: 'verarbeitet',
        kundeId: kundeId!,
        projektId,
        angebotVersendetAm: new Date().toISOString(),
      });
      reportFortschritt('anfrage_speichern', true, 'Anfrage als verarbeitet markiert');
    } catch (error) {
      // Nicht kritisch
      reportFortschritt('anfrage_speichern', false, 'Markierung fehlgeschlagen (nicht kritisch)');
      console.warn('Anfrage konnte nicht als verarbeitet markiert werden:', error);
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
 * Input für "Nur Kunde und Projekt anlegen" (ohne E-Mail-Versand)
 */
export interface NurProjektAnlegenInput {
  anfrage?: VerarbeiteteAnfrage;
  kundeNeu: boolean;
  kundenDaten: {
    name: string;
    email: string;
    telefon?: string;
    strasse: string;
    plz: string;
    ort: string;
    land?: string;
    ansprechpartner?: string;
  };
  existierenderKundeId?: string;
  positionen: Position[];
  preisProTonne: number;
  /** Notizen aus dem Telefonat (Sales-Leitfaden) – landen als Projekt-Notiz. */
  telefonNotizen?: string;
  /** Im Dialog gewählte Vertragsklauseln (Zufahrt, Mengenanpassung, …). */
  vertragsklauseln?: VertragsKlausel[];
  /** AGB als Kleintext-Anhang ans Angebots-PDF hängen. */
  agbAnhaengen?: boolean;
  /** Lieferbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  lieferbedingungenAktiv?: boolean;
  /** Text der Lieferbedingungen (im Dialog editierbar). */
  lieferbedingungenText?: string;
  /** Zahlungsbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  zahlungsbedingungenAktiv?: boolean;
  /** Zahlungsziel, z.B. "14 Tage" oder "Vorkasse". */
  zahlungsziel?: string;
}

/**
 * Ergebnis von "Nur Kunde und Projekt anlegen"
 */
export interface NurProjektAnlegenErgebnis {
  success: boolean;
  kundeId?: string;
  kundennummer?: string;
  projektId?: string;
  error?: string;
  fortschritt: VerarbeitungsFortschritt[];
}

/**
 * Erstellt nur Kunde und Projekt - OHNE E-Mail-Versand
 *
 * Flow:
 * 1. Kunde anlegen (wenn neu) oder laden
 * 2. Projekt erstellen
 * 3. Positionen im Projekt speichern
 * 4. Anfrage in DB speichern (falls vorhanden)
 */
export async function erstelleNurKundeUndProjekt(
  input: NurProjektAnlegenInput,
  onFortschritt?: (fortschritt: VerarbeitungsFortschritt) => void
): Promise<NurProjektAnlegenErgebnis> {
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
    let kundeId: string;
    let kundennummer: string | undefined;

    try {
      const kundenErgebnis = await legeKundeAnOderLade(
        input.kundeNeu,
        input.existierenderKundeId,
        input.kundenDaten,
        input.anfrage
      );
      kundeId = kundenErgebnis.kundeId;
      kundennummer = kundenErgebnis.kundennummer;
      reportFortschritt('kunde_anlegen', true, kundenErgebnis.details);
    } catch (error) {
      reportFortschritt('kunde_anlegen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`Kunde konnte nicht angelegt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 2: Projekt erstellen
    // ============================================
    let projektId: string;

    try {
      const kundenPlzOrt = formatAdresszeile(input.kundenDaten.plz, input.kundenDaten.ort, input.kundenDaten.land);

      // Berechne Gesamtmenge aus Positionen
      const gesamtMenge = input.positionen.reduce((sum, pos) => {
        if (pos.einheit === 't') return sum + pos.menge;
        return sum;
      }, 0);

      const projekt = await projektService.createProjekt({
        projektName: input.kundenDaten.name,
        kundeId: kundeId!,
        kundennummer,
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt,
        kundenEmail: input.kundenDaten.email,
        // Telefonnummer aus der Anfrage direkt am Projekt — die Projektansicht und die
        // Lieferschein-/Speditions-Mail lesen `kundenTelefon`. Ohne sie musste man zum
        // Nachtelefonieren erst in die Kundenakte oder die Original-Mail wechseln.
        kundenTelefon: input.kundenDaten.telefon?.trim() || undefined,
        saisonjahr: new Date().getFullYear(),
        herkunft: 'anfrage',
        status: 'angebot', // Status "angebot" (nicht versendet)
        angefragteMenge: gesamtMenge,
        preisProTonne: input.preisProTonne,
        ansprechpartner: input.kundenDaten.ansprechpartner,
        notizen: input.telefonNotizen?.trim() || undefined,
      });

      projektId = projekt.id;
      reportFortschritt('projekt_erstellen', true, `Projekt erstellt (ID: ${projektId})`);
    } catch (error) {
      reportFortschritt('projekt_erstellen', false, `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      throw new Error(`Projekt konnte nicht erstellt werden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }

    // ============================================
    // SCHRITT 3: Positionen als Angebotsentwurf speichern
    // ============================================
    try {
      const stammdaten = await getStammdatenOderDefault();
      const heute = new Date().toISOString().split('T')[0];
      const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const angebotsDaten: AngebotsDaten = {
        kundenname: input.kundenDaten.name,
        kundenstrasse: input.kundenDaten.strasse,
        kundenPlzOrt: formatAdresszeile(input.kundenDaten.plz, input.kundenDaten.ort, input.kundenDaten.land),
        ansprechpartner: input.kundenDaten.ansprechpartner,
        angebotsnummer: 'ENTWURF', // Noch keine Nummer - wird erst bei Versand generiert
        angebotsdatum: heute,
        gueltigBis,
        positionen: input.positionen,
        zahlungsziel: input.zahlungsziel ?? STANDARD_ZAHLUNGSZIEL,
        zahlungsbedingungenAusblenden: input.zahlungsbedingungenAktiv === false,
        lieferbedingungenAktiviert: input.lieferbedingungenAktiv ?? true,
        lieferbedingungen: input.lieferbedingungenText ?? STANDARD_LIEFERBEDINGUNGEN,
        // Klauseln + AGB-Anhang aus dem Anfrage-Dialog
        vertragsklauseln: input.vertragsklauseln,
        agbAnhaengen: input.agbAnhaengen ?? true,
        // Dieselpreiszuschlag: Der Betrag wird als TM-DZ-Position einkalkuliert, also muss
        // der Hinweis auch auf dem Dokument stehen — sonst berechnen wir etwas, das wir
        // nicht erklären. Text richtet sich nach der Staffel der Angebotsgültigkeit.
        dieselpreiszuschlagAktiviert: true,
        dieselpreiszuschlagText: getDieselKlauselText(gueltigBis),
        firmenname: stammdaten.firmenname,
        firmenstrasse: stammdaten.firmenstrasse,
        firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
        firmenTelefon: stammdaten.firmenTelefon,
        firmenEmail: stammdaten.firmenEmail,
      };

      await speichereAngebot(projektId, angebotsDaten);
      reportFortschritt('angebot_speichern', true, 'Angebotsentwurf gespeichert');
    } catch (error) {
      // Nicht kritisch
      reportFortschritt('angebot_speichern', false, 'Speichern fehlgeschlagen (nicht kritisch)');
      console.warn('Angebotsentwurf konnte nicht gespeichert werden:', error);
    }

    // ============================================
    // SCHRITT 4: Anfrage als bearbeitet markieren (falls vorhanden)
    // ============================================
    if (input.anfrage) {
      try {
        await markiereAnfrageAlsVerarbeitet(input.anfrage, {
          // Projekt angelegt, Angebotsentwurf gespeichert, aber nicht versendet
          status: 'angebot_erstellt',
          kundeId: kundeId!,
          projektId,
        });
        reportFortschritt('anfrage_speichern', true, 'Anfrage als bearbeitet markiert');
      } catch (error) {
        reportFortschritt('anfrage_speichern', false, 'Markierung fehlgeschlagen (nicht kritisch)');
        console.warn('Anfrage konnte nicht als bearbeitet markiert werden:', error);
      }
    }

    // ============================================
    // FERTIG!
    // ============================================
    reportFortschritt('fertig', true, `Kunde und Projekt erfolgreich angelegt!`);

    return {
      success: true,
      kundeId: kundeId!,
      kundennummer,
      projektId,
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
  tonnenBigbag02?: number;
  tonnenLose03?: number;
  tonnenGesackt03?: number;
  tonnenBigbag03?: number;
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
 *    → TM-ZM-02 oder TM-ZM-03 (Werkspreis: 98.70€/t)
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
  // ARTIKEL AUS APPWRITE LADEN (Bezeichnung, Beschreibung, Preis)
  // ==========================================
  const [
    artikelLose02,
    artikelLose03,
    artikelGesackt02,
    artikelGesackt03,
    artikelBigbag02,
    artikelBigbag03,
    artikelBeiladung02,
    artikelBeiladung03,
    artikelPE,
    artikelFP, // Frachtkostenpauschale / Mindermengenpauschale
    artikelPalette // Palette für Speditionsware
  ] = await Promise.all([
    sucheArtikelNachNummer('TM-ZM-02'),
    sucheArtikelNachNummer('TM-ZM-03'),
    sucheArtikelNachNummer('TM-ZM-02St'),
    sucheArtikelNachNummer('TM-ZM-03St'),
    // BigBag: der Appwrite-Artikelstamm führt AUSSCHLIESSLICH TM-ZM-BIG-02/-03 (je 125,90 €/t).
    // Bis 07/2026 wurde hier TM-ZM-02BB/03BB gesucht — eine Nummer, die es dort nie gab.
    // Der Lookup lief deshalb immer ins Leere und jedes BigBag-Angebot wurde mit dem
    // Fallback 125,00 € statt 125,90 € kalkuliert.
    sucheArtikelNachNummer('TM-ZM-BIG-02'), // BigBag 0-2mm
    sucheArtikelNachNummer('TM-ZM-BIG-03'), // BigBag 0-3mm
    sucheArtikelNachNummer('TM-ZM-02S'),
    sucheArtikelNachNummer('TM-ZM-03S'),
    sucheArtikelNachNummer('TM-PE'),
    sucheArtikelNachNummer('TM-FP'),
    sucheArtikelNachNummer('TM-PAL'),
  ]);

  // ==========================================
  // PREISE AUS APPWRITE ARTIKEL-COLLECTION (einzelpreis = Verkaufspreis)
  // Fallback nur wenn Artikel nicht gefunden oder kein Preis hinterlegt
  // ==========================================
  // Fallbacks entsprechen dem Artikelstamm (Stand 07/2026) — sie greifen nur, wenn ein
  // Artikel dort fehlt. Preispflege gehört in den Artikelstamm, nicht in den Code.
  const preisLoseMaterial = artikelLose02?.einzelpreis ?? 98.70; // Stamm: 98,70 €/t
  const preisSackwareAbWerk = artikelGesackt02?.einzelpreis ?? 155.00; // Stamm: 155,00 €/t (NUR ABWERKSPREIS!)
  const preisBigbagAbWerk = artikelBigbag02?.einzelpreis ?? 125.90; // Stamm: 125,90 €/t (günstiger als Sackware!)
  const preisBeiladungProSack = artikelBeiladung02?.einzelpreis ?? 8.50; // Fallback 8.50€/Sack
  // PE-Folie und Palette: Daten direkt aus Stammdaten, KEIN Fallback

  // ==========================================
  // RABEN-FRACHTKOSTEN FÜR SACKWARE BERECHNEN
  // Bei Sackware per Spedition: Werkspreis + Frachtkosten = Endpreis!
  // ==========================================
  let frachtProTonneSackware = 0;
  if (input.plz) {
    const testGewichtKg = 1000; // 1 Tonne für Preisberechnung pro Tonne
    const frachtFuer1t = berechneSpeditionskosten(input.plz, testGewichtKg);
    if (frachtFuer1t !== null) {
      frachtProTonneSackware = frachtFuer1t; // €/t Frachtkosten
    }
  }

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
  // BIGBAG - Alternative zu Sackware (günstiger)
  // BigBags werden per Spedition geliefert
  // ==========================================
  let gesamtMengeBigbag = 0;

  // 0-2mm BigBag
  if (input.tonnenBigbag02 && input.tonnenBigbag02 > 0) {
    const info = getArtikelInfo(artikelBigbag02, 'Tennismehl 0/2 BigBag (1t)');
    const menge = input.tonnenBigbag02;
    // BigBag: Werkspreis + Frachtkosten
    const einzelpreis = preisBigbagAbWerk + frachtProTonneSackware;
    const preis = menge * einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: 'TM-ZM-BIG-02',
      bezeichnung: info.bezeichnung,
      beschreibung: info.beschreibung || 'BigBag ca. 1t - Lieferung per Spedition',
      menge,
      einheit: 't',
      einzelpreis,
      gesamtpreis: preis,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preis;
    gesamtMengeBigbag += menge;
  }

  // 0-3mm BigBag
  if (input.tonnenBigbag03 && input.tonnenBigbag03 > 0) {
    const info = getArtikelInfo(artikelBigbag03, 'Tennismehl 0/3 BigBag (1t)');
    const menge = input.tonnenBigbag03;
    // BigBag: Werkspreis + Frachtkosten
    const einzelpreis = preisBigbagAbWerk + frachtProTonneSackware;
    const preis = menge * einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: 'TM-ZM-BIG-03',
      bezeichnung: info.bezeichnung,
      beschreibung: info.beschreibung || 'BigBag ca. 1t - Lieferung per Spedition',
      menge,
      einheit: 't',
      einzelpreis,
      gesamtpreis: preis,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preis;
    gesamtMengeBigbag += menge;
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
      const einzelpreis = preisBeiladungProSack; // €/Sack aus Appwrite
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
      // SPEDITION: In Tonnen abrechnen
      // ENDPREIS = Werkspreis (145€/t) + Raben-Frachtkosten pro Tonne!
      const info = getArtikelInfo(artikelGesackt02, 'Tennismehl 0/2 gesackt');
      const menge = gesamtSackware02;
      const einzelpreis = preisSackwareAbWerk + frachtProTonneSackware; // Werkspreis + Fracht = ENDPREIS!
      const preis = menge * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-02St',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung,
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
      const einzelpreis = preisBeiladungProSack; // €/Sack aus Appwrite
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
      // SPEDITION: In Tonnen abrechnen
      // ENDPREIS = Werkspreis (145€/t) + Raben-Frachtkosten pro Tonne!
      const info = getArtikelInfo(artikelGesackt03, 'Tennismehl 0/3 gesackt');
      const menge = gesamtSackware03;
      const einzelpreis = preisSackwareAbWerk + frachtProTonneSackware; // Werkspreis + Fracht = ENDPREIS!
      const preis = menge * einzelpreis;

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-ZM-03St',
        bezeichnung: info.bezeichnung,
        beschreibung: info.beschreibung,
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
  // PALETTEN (Automatisch bei Sackware per Spedition!)
  // 1 Palette pro Tonne Sackware
  // ==========================================

  // Spedition ist eingeschaltet wenn:
  // - Sackware >= 1t ODER
  // - Sackware vorhanden UND kein loses Material (also eigene Speditionslieferung)
  const istSpedition = gesamtSackwareGesamt >= 1 || (gesamtSackwareGesamt > 0 && gesamtMengeLose === 0);

  if (istSpedition && gesamtSackwareGesamt > 0 && artikelPalette && artikelPalette.einzelpreis !== undefined) {
    const anzahlPaletten = Math.ceil(gesamtSackwareGesamt); // 1 Palette pro Tonne (aufgerundet)
    const preis = artikelPalette.einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: artikelPalette.artikelnummer,
      bezeichnung: artikelPalette.bezeichnung,
      beschreibung: artikelPalette.beschreibung,
      menge: anzahlPaletten,
      einheit: artikelPalette.einheit || 'Stk',
      einzelpreis: preis,
      gesamtpreis: anzahlPaletten * preis,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += anzahlPaletten * preis;
  }

  // ==========================================
  // PE-FOLIE (Pflicht bei losem Material!)
  // Preis aus Stammdaten (bereits oben geladen)
  // ==========================================

  if (gesamtMengeLose > 0 && artikelPE && artikelPE.einzelpreis !== undefined) {
    const preisPE = artikelPE.einzelpreis;

    positionen.push({
      id: `pos-${Date.now()}-${positionIndex++}`,
      artikelnummer: artikelPE.artikelnummer,
      bezeichnung: artikelPE.bezeichnung,
      beschreibung: artikelPE.beschreibung,
      menge: 1,
      einheit: artikelPE.einheit || 'Stk',
      einzelpreis: preisPE,
      gesamtpreis: preisPE,
      istBedarfsposition: false,
    });

    gesamtpreisOhneLieferung += preisPE;
  }

  // ==========================================
  // MINDERMENGENPAUSCHALE / FRACHTKOSTENPAUSCHALE (TM-FP)
  // Automatisch bei Schüttgut < 20 Tonnen!
  //
  // Staffelung:
  // - weniger als 5,4 to = 59,90 €
  // - von 5,4 to bis 7,4 to = 49,90 €
  // - von 7,5 bis 11,4 to = 39,90 €
  // - von 11,5 bis 15,4 to = 31,90 €
  // - von 15,5 bis 19,9 to = 24,90 €
  // - ab 20 to = keine Pauschale
  // ==========================================

  if (gesamtMengeLose > 0) {
    const mindermengenpauschale = berechneMindermengenpauschale(gesamtMengeLose);

    if (mindermengenpauschale !== null) {
      const infoFP = getArtikelInfo(artikelFP, 'Frachtkostenpauschale');

      positionen.push({
        id: `pos-${Date.now()}-${positionIndex++}`,
        artikelnummer: 'TM-FP',
        bezeichnung: infoFP.bezeichnung,
        beschreibung: infoFP.beschreibung || `Mindermengenzuschlag für Lieferungen unter 20 Tonnen`,
        menge: 1,
        einheit: 'Stk',
        einzelpreis: mindermengenpauschale,
        gesamtpreis: mindermengenpauschale,
        istBedarfsposition: false,
      });

      gesamtpreisOhneLieferung += mindermengenpauschale;
    }
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
    land?: string; // ISO-Ländercode (z.B. 'DE', 'AT', 'CH')
  };
  positionen: Position[];
  frachtkosten?: number;
  ansprechpartner?: string;
  /** Im Dialog gewählte Vertragsklauseln (Zufahrt, Mengenanpassung, …). */
  vertragsklauseln?: VertragsKlausel[];
  /** AGB als Kleintext-Anhang ans Angebots-PDF hängen. */
  agbAnhaengen?: boolean;
  /** Lieferbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  lieferbedingungenAktiv?: boolean;
  /** Text der Lieferbedingungen (im Dialog editierbar). */
  lieferbedingungenText?: string;
  /** Zahlungsbedingungen im Angebot ausweisen (im Dialog abwählbar). */
  zahlungsbedingungenAktiv?: boolean;
  /** Zahlungsziel, z.B. "14 Tage" oder "Vorkasse". */
  zahlungsziel?: string;
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
    kundenPlzOrt: formatAdresszeile(input.kundenDaten.plz, input.kundenDaten.ort, input.kundenDaten.land),
    angebotsnummer: vorschauNummer,
    angebotsdatum: heute,
    gueltigBis,
    positionen: input.positionen,
    zahlungsziel: input.zahlungsziel ?? STANDARD_ZAHLUNGSZIEL,
    zahlungsbedingungenAusblenden: input.zahlungsbedingungenAktiv === false,
    frachtkosten: input.frachtkosten,
    // z. Hd. Ansprechpartner
    ansprechpartner: input.ansprechpartner,
    // Lieferbedingungen
    lieferbedingungenAktiviert: input.lieferbedingungenAktiv ?? true,
    lieferbedingungen: input.lieferbedingungenText ?? STANDARD_LIEFERBEDINGUNGEN,
    // Klauseln + AGB-Anhang aus dem Anfrage-Dialog
    vertragsklauseln: input.vertragsklauseln,
    agbAnhaengen: input.agbAnhaengen ?? true,
    // Dieselpreiszuschlag: siehe oben — berechnen und erklären gehören zusammen
    dieselpreiszuschlagAktiviert: true,
    dieselpreiszuschlagText: getDieselKlauselText(gueltigBis),
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
