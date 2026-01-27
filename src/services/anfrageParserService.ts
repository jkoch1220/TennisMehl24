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
 */
const extractField = (text: string, fieldNames: string[]): string | undefined => {
  for (const fieldName of fieldNames) {
    // Versuche verschiedene Muster:
    // "Feldname *: Wert"
    // "Feldname*: Wert"
    // "Feldname: Wert"
    // "Feldname * : Wert"
    const patterns = [
      new RegExp(`${fieldName}\\s*\\*?\\s*:\\s*(.+?)(?:\\n|$)`, 'im'),
      new RegExp(`${fieldName}\\s*:\\s*(.+?)(?:\\n|$)`, 'im'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        // Ignoriere leere Werte und Platzhalter
        if (value && value !== '-' && value !== 'null' && value !== 'undefined') {
          return value;
        }
      }
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

  // Parse Zahl (mit Komma oder Punkt als Dezimaltrenner)
  const cleaned = value.replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);

  return isNaN(num) ? undefined : num;
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
  const vorname = extractField(text, ['Vorname']);
  const nachname = extractField(text, ['Nachname']);
  const vereinsname = extractField(text, ['Vereins-Name', 'Vereinsname', 'Verein', 'Club', 'Klub']);
  const strasse = extractField(text, ['Straße', 'Strasse', 'Adresse']);
  const plz = extractField(text, ['PLZ', 'Postleitzahl']);
  const ort = extractField(text, ['Ort', 'Stadt', 'Gemeinde']);
  const email = extractField(text, ['E-Mail', 'Email', 'E-mail', 'Mail']);
  const telefon = extractField(text, ['Telefon', 'Tel', 'Telefonnummer', 'Handy', 'Mobil']);
  const nachricht = extractField(text, ['Nachricht', 'Bemerkung', 'Anmerkung', 'Kommentar', 'Hinweis']);

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
  return {
    kundenname: analyse.kontakt.vereinsname ||
      `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() || undefined,
    email: analyse.kontakt.email,
    telefon: analyse.kontakt.telefon,
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
