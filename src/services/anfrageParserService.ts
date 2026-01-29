/**
 * Anfrage Parser Service
 *
 * Parst eingehende E-Mail-Anfragen vom Webformular und extrahiert
 * strukturierte Daten sowie Angebots-Vorschläge.
 *
 * Das Webformular hat IMMER diese Struktur:
 *
 * Vorname *: Walter
 * Nachname *: Issing
 * Vereins-Name *: 1. Tennisclub Leinach
 * Straße *: Bergstraße 16
 * PLZ *: 97274
 * Ort *: Leinach
 * E-Mail *: issingwalter@gmx.de
 * Telefon: 01755442061
 * Angebot: Bitte senden Sie mir ein Angebot zu!
 * Anzahl Plätze: 3
 * Tonnen 0-2 lose: 8
 * Tonnen 0-2 gesackt:
 * Tonnen 0-3 lose:
 * Tonnen 0-3 gesackt:
 * Nachricht:
 * Datenschutzerklärung: ...
 */

import { ExtrahierteDaten } from '../types/anfragen';

// ============================================
// VALIDATOREN - Strikte Prüfung aller Werte
// ============================================

// Alle bekannten Feldnamen aus dem Webformular (um Verwechslung zu vermeiden)
const BEKANNTE_FELDNAMEN = [
  'vorname', 'nachname', 'vereins-name', 'vereinsname', 'verein', 'club', 'klub',
  'straße', 'strasse', 'adresse', 'plz', 'postleitzahl', 'ort', 'stadt', 'gemeinde',
  'e-mail', 'email', 'mail', 'telefon', 'tel', 'telefonnummer', 'handy', 'mobil',
  'angebot', 'anzahl plätze', 'anzahl plaetze', 'plätze', 'plaetze',
  'tonnen 0-2 lose', 'tonnen 0-2 gesackt', 'tonnen 0-3 lose', 'tonnen 0-3 gesackt',
  'nachricht', 'bemerkung', 'anmerkung', 'kommentar', 'hinweis', 'mitteilung',
  'datenschutzerklärung', 'datenschutzerklaerung'
];

/**
 * Prüft ob ein Wert wie ein Feldname aussieht (Vermeidet Feldnamen als Werte)
 */
const siehtAusWieFeldname = (value: string): boolean => {
  if (!value) return false;
  const lower = value.toLowerCase().trim();

  // Prüfe auf bekannte Feldnamen
  for (const feldname of BEKANNTE_FELDNAMEN) {
    if (lower.startsWith(feldname)) {
      return true;
    }
  }

  // Prüfe auf Muster wie "Feldname:" oder "Feldname *:"
  if (/^[a-zäöüß\-\s]+\s*\*?\s*:/i.test(lower)) {
    return true;
  }

  return false;
};

/**
 * Sanitize Strings gegen XSS/Injection
 */
const sanitizeString = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/[<>]/g, '') // Entferne HTML-Tags
    .replace(/javascript:/gi, '') // Entferne JS-Injection
    .replace(/on\w+=/gi, '') // Entferne Event-Handler
    .trim()
    .substring(0, 500); // Max Länge
};

/**
 * Validiert und sanitized eine E-Mail-Adresse
 */
const validateEmail = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim().toLowerCase();

  // Strenge E-Mail-Regex
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!emailRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige E-Mail abgelehnt: "${value}"`);
    return undefined;
  }

  // Prüfe auf Feldname
  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ E-Mail sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert und sanitized eine Telefonnummer
 */
const validateTelefon = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  // Prüfe auf Feldname
  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ Telefon sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  // Telefon darf nur Zahlen, +, -, Leerzeichen, Klammern, / enthalten
  const telefonRegex = /^[\d\s\-+()\/]{5,20}$/;
  if (!telefonRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige Telefonnummer abgelehnt: "${value}"`);
    return undefined;
  }

  // Muss mindestens 5 Ziffern enthalten
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 5) {
    console.log(`⚠️ Telefonnummer hat zu wenig Ziffern: "${value}"`);
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert eine deutsche PLZ (5 Ziffern)
 */
const validatePLZ = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  // PLZ muss genau 5 Ziffern sein
  const plzRegex = /^\d{5}$/;
  if (!plzRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige PLZ abgelehnt: "${value}"`);
    return undefined;
  }

  // Deutsche PLZ: 01000-99999
  const plzNum = parseInt(trimmed, 10);
  if (plzNum < 1000 || plzNum > 99999) {
    console.log(`⚠️ PLZ außerhalb gültigem Bereich: "${value}"`);
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert einen Namen (Vorname, Nachname, Vereinsname, Ort, Straße)
 */
const validateName = (value: string | undefined, maxLength: number = 100): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  // Prüfe auf Feldname
  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ Name sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  // Zu kurz oder nur Sonderzeichen
  if (trimmed.length < 2 || /^[-_*\s]+$/.test(trimmed)) {
    return undefined;
  }

  // Darf nicht mit Doppelpunkt enden (abgeschnittener Feldname)
  if (trimmed.endsWith(':')) {
    console.log(`⚠️ Name endet mit Doppelpunkt (Feldname?): "${value}"`);
    return undefined;
  }

  return sanitizeString(trimmed).substring(0, maxLength);
};

/**
 * Validiert eine Nachricht/Freitext
 */
const validateNachricht = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  // Ignoriere Standard-Platzhalter
  if (trimmed.length < 3 || /^[-_*\s]+$/.test(trimmed)) {
    return undefined;
  }

  return sanitizeString(trimmed).substring(0, 2000);
};

// Strukturierter Output von der Analyse
export interface AnfrageAnalyseErgebnis {
  // Extrahierte Kontaktdaten
  kontakt: {
    vorname?: string;
    nachname?: string;
    vereinsname?: string;
    strasse?: string;
    plz?: string;
    ort?: string;
    email?: string;
    telefon?: string;
  };

  // Extrahierte Bestellinformationen
  bestellung: {
    anzahlPlaetze?: number;
    // Einzelne Tonnen-Felder für präzise Kalkulation
    tonnenLose02?: number;
    tonnenGesackt02?: number;
    tonnenLose03?: number;
    tonnenGesackt03?: number;
    mengeGesamt?: number; // in Tonnen (Summe aller Felder)
    artikel?: string;
    koernung?: string; // z.B. "0-2" oder "0-3"
    lieferart?: 'lose' | 'gesackt';
    wunschtermin?: string;
  };

  // Angebots-Vorschlag
  angebotsvorschlag: {
    empfohlenePositionen: Array<{
      artikelbezeichnung: string;
      menge: number;
      einheit: string;
      geschaetzterPreis?: number;
    }>;
    geschaetzteGesamtmenge: number;
    besonderheiten?: string[];
  };

  // Zusammenfassung
  zusammenfassung: string;
  konfidenz: number; // 0-1 wie sicher ist die Extraktion
}

/**
 * Konvertiert HTML zu Plain Text
 */
const htmlToPlainText = (html: string): string => {
  if (!html) return '';

  let text = html;

  // Ersetze <br>, <br/>, <br /> durch Zeilenumbrüche
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Ersetze </p>, </div>, </tr> durch Zeilenumbrüche
  text = text.replace(/<\/(p|div|tr|li)>/gi, '\n');

  // Ersetze &nbsp; durch Leerzeichen
  text = text.replace(/&nbsp;/gi, ' ');

  // Ersetze andere HTML-Entities
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&auml;/gi, 'ä');
  text = text.replace(/&ouml;/gi, 'ö');
  text = text.replace(/&uuml;/gi, 'ü');
  text = text.replace(/&Auml;/gi, 'Ä');
  text = text.replace(/&Ouml;/gi, 'Ö');
  text = text.replace(/&Uuml;/gi, 'Ü');
  text = text.replace(/&szlig;/gi, 'ß');

  // Entferne alle verbleibenden HTML-Tags
  text = text.replace(/<[^>]+>/g, '');

  // Normalisiere Zeilenumbrüche (Windows CRLF -> LF)
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');

  // Entferne mehrfache Leerzeilen
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trimme jede Zeile
  text = text.split('\n').map(line => line.trim()).join('\n');

  return text.trim();
};

/**
 * Extrahiert einen Wert für ein bestimmtes Feld aus dem Text
 * WICHTIG: Robuste Extraktion die leere Felder und Feldnamen-Verwechslung verhindert
 */
const extractField = (text: string, fieldNames: string[]): string | undefined => {
  for (const fieldName of fieldNames) {
    // Escape special regex characters in fieldName
    const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // WICHTIG: Verwende nicht-gierige Regex und stoppe vor dem nächsten Feldnamen!
    // Muster: "Feldname *: Wert" bis zum Zeilenende ODER bis zum nächsten "Feldname:"
    const pattern = new RegExp(
      `${escapedFieldName}\\s*\\*?\\s*:\\s*([^\\n]*?)(?=\\s*(?:${BEKANNTE_FELDNAMEN.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*\\*?\\s*:|\\n|$)`,
      'im'
    );

    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();

      // Ignoriere leere Werte und Platzhalter
      if (!value || value === '-' || value === 'null' || value === 'undefined') {
        continue;
      }

      // KRITISCH: Prüfe ob der extrahierte Wert selbst wie ein Feldname aussieht
      if (siehtAusWieFeldname(value)) {
        console.log(`⚠️ Feld "${fieldName}" enthält Feldname als Wert: "${value}" - ABGELEHNT`);
        continue;
      }

      return value;
    }
  }
  return undefined;
};

/**
 * Extrahiert eine Zahl für ein bestimmtes Feld
 */
const extractNumber = (text: string, fieldNames: string[]): number | undefined => {
  const value = extractField(text, fieldNames);
  if (!value) return undefined;

  // WICHTIG: Nur akzeptieren wenn der Wert PRIMÄR eine Zahl ist!
  // Nicht "Tonnen 0-3 lose" → "03" → 3 extrahieren!
  // Der Wert muss mit einer Zahl beginnen (optional mit Leerzeichen davor)
  const trimmed = value.trim();

  // Prüfe ob der Wert eine reine Zahl ist (mit optionalem Dezimaltrenner)
  // Erlaubt: "8", "8.5", "8,5", "12", "0.5"
  // Nicht erlaubt: "Tonnen 0-3 lose", "abc", ""
  const numberMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:t(?:onnen?)?)?$/i);
  if (!numberMatch) {
    return undefined;
  }

  const cleaned = numberMatch[1].replace(',', '.');
  const num = parseFloat(cleaned);

  return isNaN(num) || num <= 0 ? undefined : num;
};

// Parse eine E-Mail-Anfrage von der Webseite
export const parseWebformularAnfrage = (emailText: string): AnfrageAnalyseErgebnis => {
  // Konvertiere HTML zu Plain Text falls nötig
  const text = htmlToPlainText(emailText);

  // Debug: Log den geparsten Text (kann später entfernt werden)
  console.log('=== PARSER DEBUG ===');
  console.log('Original length:', emailText.length);
  console.log('Cleaned text:', text.substring(0, 500));
  console.log('====================');

  // Extrahiere alle Felder mit den bekannten Feldnamen
  // WICHTIG: Alle Werte werden durch strenge Validatoren geprüft!
  const vornameRaw = extractField(text, ['Vorname']);
  const nachnameRaw = extractField(text, ['Nachname']);
  const vereinsnameRaw = extractField(text, ['Vereins-Name', 'Vereinsname', 'Verein', 'Club', 'Klub']);
  const strasseRaw = extractField(text, ['Straße', 'Strasse', 'Adresse']);
  const plzRaw = extractField(text, ['PLZ', 'Postleitzahl']);
  const ortRaw = extractField(text, ['Ort', 'Stadt', 'Gemeinde']);
  const emailRaw = extractField(text, ['E-Mail', 'Email', 'E-mail', 'Mail']);
  const telefonRaw = extractField(text, ['Telefon', 'Tel', 'Telefonnummer', 'Handy', 'Mobil']);
  const nachrichtRaw = extractField(text, ['Nachricht', 'Bemerkung', 'Anmerkung', 'Kommentar', 'Hinweis']);

  // VALIDIERUNG: Alle Felder durch strenge Validatoren prüfen
  const vorname = validateName(vornameRaw, 50);
  const nachname = validateName(nachnameRaw, 50);
  const vereinsname = validateName(vereinsnameRaw, 200);
  const strasse = validateName(strasseRaw, 200);
  const plz = validatePLZ(plzRaw);
  const ort = validateName(ortRaw, 100);
  const email = validateEmail(emailRaw);
  const telefon = validateTelefon(telefonRaw);
  const nachricht = validateNachricht(nachrichtRaw);

  // Debug: Zeige abgelehnte Werte
  if (vornameRaw && !vorname) console.log(`❌ Vorname abgelehnt: "${vornameRaw}"`);
  if (nachnameRaw && !nachname) console.log(`❌ Nachname abgelehnt: "${nachnameRaw}"`);
  if (emailRaw && !email) console.log(`❌ E-Mail abgelehnt: "${emailRaw}"`);
  if (telefonRaw && !telefon) console.log(`❌ Telefon abgelehnt: "${telefonRaw}"`);
  if (plzRaw && !plz) console.log(`❌ PLZ abgelehnt: "${plzRaw}"`);

  // Extrahiere Mengenangaben
  const anzahlPlaetze = extractNumber(text, ['Anzahl Plätze', 'Anzahl Plaetze', 'Plätze', 'Plaetze']);
  const tonnenLose02 = extractNumber(text, ['Tonnen 0-2 lose', 'Tonnen 0-2mm lose', '0-2 lose']);
  const tonnenGesackt02 = extractNumber(text, ['Tonnen 0-2 gesackt', 'Tonnen 0-2mm gesackt', '0-2 gesackt']);
  const tonnenLose03 = extractNumber(text, ['Tonnen 0-3 lose', 'Tonnen 0-3mm lose', '0-3 lose']);
  const tonnenGesackt03 = extractNumber(text, ['Tonnen 0-3 gesackt', 'Tonnen 0-3mm gesackt', '0-3 gesackt']);

  // Kontaktdaten zusammenstellen
  const kontakt = {
    vorname,
    nachname,
    vereinsname,
    strasse,
    plz,
    ort,
    email,
    telefon,
  };

  // Ermittle Hauptprodukt und Lieferart
  let artikel = 'Tennismehl';
  let koernung = '0-3';
  let lieferart: 'lose' | 'gesackt' = 'lose';
  let mengeGesamt = 0;

  // Berechne Gesamtmenge und bestimme Hauptprodukt
  const mengen = [
    { menge: tonnenLose02 || 0, koernung: '0-2', lieferart: 'lose' as const },
    { menge: tonnenGesackt02 || 0, koernung: '0-2', lieferart: 'gesackt' as const },
    { menge: tonnenLose03 || 0, koernung: '0-3', lieferart: 'lose' as const },
    { menge: tonnenGesackt03 || 0, koernung: '0-3', lieferart: 'gesackt' as const },
  ];

  // Finde die Hauptposition (größte Menge)
  const hauptPosition = mengen.reduce((max, curr) => curr.menge > max.menge ? curr : max, mengen[0]);

  if (hauptPosition.menge > 0) {
    koernung = hauptPosition.koernung;
    lieferart = hauptPosition.lieferart;
    artikel = `Tennismehl ${koernung}mm${lieferart === 'gesackt' ? ' gesackt' : ''}`;
  }

  // Berechne Gesamtmenge
  mengeGesamt = mengen.reduce((sum, m) => sum + m.menge, 0);

  // Falls keine explizite Menge aber Anzahl Plätze angegeben, schätze Menge
  if (mengeGesamt === 0 && anzahlPlaetze && anzahlPlaetze > 0) {
    // Ca. 2-3 Tonnen pro Platz als Richtwert
    mengeGesamt = anzahlPlaetze * 2.5;
  }

  // Versuche Menge aus der Nachricht zu extrahieren falls immer noch 0
  if (mengeGesamt === 0 && nachricht) {
    const mengeMatch = nachricht.match(/(\d+[,.]?\d*)\s*(?:t(?:onnen?)?|to)/i);
    if (mengeMatch) {
      mengeGesamt = parseFloat(mengeMatch[1].replace(',', '.'));
    }
  }

  const bestellung = {
    anzahlPlaetze,
    // Einzelne Tonnen-Felder
    tonnenLose02,
    tonnenGesackt02,
    tonnenLose03,
    tonnenGesackt03,
    mengeGesamt: mengeGesamt > 0 ? mengeGesamt : undefined,
    artikel,
    koernung,
    lieferart,
    wunschtermin: undefined,
  };

  // Erstelle Angebots-Vorschlag mit allen Positionen
  const positionen: AnfrageAnalyseErgebnis['angebotsvorschlag']['empfohlenePositionen'] = [];

  if (tonnenLose02 && tonnenLose02 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-2mm lose',
      menge: tonnenLose02,
      einheit: 't',
    });
  }
  if (tonnenGesackt02 && tonnenGesackt02 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-2mm gesackt (25kg Säcke)',
      menge: tonnenGesackt02,
      einheit: 't',
    });
  }
  if (tonnenLose03 && tonnenLose03 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-3mm lose',
      menge: tonnenLose03,
      einheit: 't',
    });
  }
  if (tonnenGesackt03 && tonnenGesackt03 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-3mm gesackt (25kg Säcke)',
      menge: tonnenGesackt03,
      einheit: 't',
    });
  }

  // Falls keine Mengen explizit angegeben aber geschätzte Menge vorhanden
  if (positionen.length === 0 && mengeGesamt > 0) {
    positionen.push({
      artikelbezeichnung: artikel,
      menge: mengeGesamt,
      einheit: 't',
    });
  }

  // Füge Fracht hinzu wenn Positionen vorhanden und PLZ bekannt
  if (positionen.length > 0 && plz) {
    positionen.push({
      artikelbezeichnung: 'Fracht/Lieferung',
      menge: 1,
      einheit: 'pauschal',
    });
  }

  const angebotsvorschlag = {
    empfohlenePositionen: positionen,
    geschaetzteGesamtmenge: mengeGesamt || (anzahlPlaetze ? anzahlPlaetze * 2.5 : 0),
    besonderheiten: nachricht ? [nachricht] : undefined,
  };

  // Erstelle Zusammenfassung
  const kundenname = vereinsname || `${vorname || ''} ${nachname || ''}`.trim() || 'Unbekannt';
  const zusammenfassung = `Anfrage von ${kundenname}` +
    (plz && ort ? ` aus ${plz} ${ort}` : '') +
    (bestellung.mengeGesamt ? ` für ${bestellung.mengeGesamt}t ${bestellung.artikel}` : '') +
    (bestellung.anzahlPlaetze ? ` (${bestellung.anzahlPlaetze} Plätze)` : '');

  // Berechne Konfidenz basierend auf vorhandenen Daten
  let konfidenz = 0;
  if (vereinsname || nachname) konfidenz += 0.2;
  if (plz && ort) konfidenz += 0.2;
  if (email) konfidenz += 0.2;
  if (bestellung.mengeGesamt && bestellung.mengeGesamt > 0) konfidenz += 0.2;
  if (positionen.length > 0) konfidenz += 0.2;

  console.log('=== PARSER RESULT ===');
  console.log('Kontakt:', kontakt);
  console.log('Bestellung:', bestellung);
  console.log('Konfidenz:', konfidenz);
  console.log('=====================');

  return {
    kontakt,
    bestellung,
    angebotsvorschlag,
    zusammenfassung,
    konfidenz,
  };
};

// Konvertiere Analyse-Ergebnis zu ExtrahierteDaten Format
export const analyseZuExtrahierteDaten = (analyse: AnfrageAnalyseErgebnis): ExtrahierteDaten => {
  // Ansprechpartner = "Vorname Nachname" (für z. Hd. im Angebot)
  const ansprechpartner = `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() || undefined;

  return {
    kundenname: analyse.kontakt.vereinsname ||
      `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() || undefined,
    vereinsname: analyse.kontakt.vereinsname,
    vorname: analyse.kontakt.vorname,
    nachname: analyse.kontakt.nachname,
    ansprechpartner, // "Vorname Nachname" für z. Hd. im Angebot!
    email: analyse.kontakt.email,
    telefon: analyse.kontakt.telefon,
    strasse: analyse.kontakt.strasse,
    plz: analyse.kontakt.plz,
    ort: analyse.kontakt.ort,
    adresse: {
      strasse: analyse.kontakt.strasse,
      plz: analyse.kontakt.plz,
      ort: analyse.kontakt.ort,
    },
    menge: analyse.bestellung.mengeGesamt,
    artikel: analyse.bestellung.artikel,
    lieferdatum: analyse.bestellung.wunschtermin,
    anfrageinhalt: analyse.zusammenfassung,
    konfidenz: analyse.konfidenz,
  };
};

// Generiere E-Mail-Text für Angebot (synchron - für initiale Generierung)
// Die Signatur wird beim Senden automatisch angehängt!
export const generiereAngebotsEmail = (
  _kundenname: string,
  ansprechpartner?: string,
  _angebotsnummer?: string,
): string => {
  const anrede = ansprechpartner
    ? `Guten Tag ${ansprechpartner}`
    : 'Guten Tag';

  // Kurzer, freundlicher E-Mail-Text (OHNE Signatur!)
  return `${anrede},

vielen Dank für Ihre Anfrage!

Im Anhang finden Sie unser Angebot wie gewünscht.

Bei Fragen melden Sie sich gerne – wir helfen Ihnen weiter.`;
};

// Generiere E-Mail-Text mit Signatur aus Stammdaten (async)
// WICHTIG: Kurzer, freundlicher Text - Signatur wird automatisch angehängt!
export const generiereAngebotsEmailMitSignatur = async (
  kundenname: string,
  ansprechpartner?: string,
): Promise<{ text: string; betreff: string }> => {
  // Erstelle personalisierte Anrede
  // "Guten Tag Vorname Nachname," oder "Guten Tag," wenn kein Name
  const anrede = ansprechpartner
    ? `Guten Tag ${ansprechpartner}`
    : 'Guten Tag';

  // Kurzer, freundlicher E-Mail-Text (OHNE Signatur - wird beim Senden angehängt!)
  const emailText = `${anrede},

vielen Dank für Ihre Anfrage!

Im Anhang finden Sie unser Angebot wie gewünscht.

Bei Fragen melden Sie sich gerne – wir helfen Ihnen weiter.`;

  // Betreff: "Angebot Tennismehl [Vereinsname] [Jahr]"
  const saisonJahr = new Date().getFullYear();

  return {
    text: emailText,
    betreff: `Angebot Tennismehl ${kundenname} ${saisonJahr}`,
  };
};

// Berechne empfohlenen Preis basierend auf PLZ und Menge
export const berechneEmpfohlenenPreis = (
  plz: string,
  menge: number,
  koernung: string = '0-3',
  lieferart: 'lose' | 'gesackt' = 'lose',
): number | null => {
  // Basis-Preise (können später aus Stammdaten geladen werden)
  let basisPreis = 98; // €/t für 0-3mm lose

  if (koernung === '0-2') {
    basisPreis += 5; // 0-2mm ist teurer
  }

  if (lieferart === 'gesackt') {
    basisPreis += 45; // Sackware Aufpreis
  }

  // Fracht-Zuschlag basierend auf PLZ (vereinfacht)
  const plzPrefix = parseInt(plz.substring(0, 2), 10);
  let frachtZuschlag = 0;

  // Entfernungszonen (vereinfacht - basierend auf PLZ-Bereich)
  if (plzPrefix >= 90 && plzPrefix <= 96) {
    // Nahbereich (Bayern Nord)
    frachtZuschlag = 15;
  } else if (plzPrefix >= 80 && plzPrefix <= 89) {
    // Bayern Süd
    frachtZuschlag = 25;
  } else if (plzPrefix >= 70 && plzPrefix <= 79) {
    // Baden-Württemberg
    frachtZuschlag = 35;
  } else if (plzPrefix >= 60 && plzPrefix <= 69) {
    // Hessen
    frachtZuschlag = 40;
  } else {
    // Rest Deutschland
    frachtZuschlag = 50;
  }

  // Mengenrabatt
  let rabatt = 0;
  if (menge >= 10) {
    rabatt = 5;
  } else if (menge >= 5) {
    rabatt = 2;
  }

  return Math.round((basisPreis + frachtZuschlag - rabatt) * 100) / 100;
};

export default {
  parseWebformularAnfrage,
  analyseZuExtrahierteDaten,
  generiereAngebotsEmail,
  berechneEmpfohlenenPreis,
};
