/**
 * Anfrage Parser Service
 *
 * Verwendet die Claude API um eingehende E-Mail-Anfragen zu analysieren
 * und strukturierte Daten sowie Angebots-Vorschläge zu extrahieren.
 */

import { ExtrahierteDaten } from '../types/anfragen';

// Strukturierter Output von der Claude API Analyse
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
    mengeGesamt?: number; // in Tonnen
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

// Parse eine E-Mail-Anfrage von der Webseite
export const parseWebformularAnfrage = (emailText: string): AnfrageAnalyseErgebnis => {
  // Standard-Struktur eines Webformular-Emails:
  // Vorname *: ...
  // Nachname *: ...
  // Vereins-Name *: ...
  // etc.

  const zeilen = emailText.split('\n');
  const daten: Record<string, string> = {};

  // Extrahiere Schlüssel-Wert-Paare
  for (const zeile of zeilen) {
    const match = zeile.match(/^([^:*]+)\s*\*?:\s*(.*)$/);
    if (match) {
      const schluessel = match[1].trim().toLowerCase();
      const wert = match[2].trim();
      if (wert) {
        daten[schluessel] = wert;
      }
    }
  }

  // Extrahiere Kontaktdaten
  const kontakt = {
    vorname: daten['vorname'] || undefined,
    nachname: daten['nachname'] || undefined,
    vereinsname: daten['vereins-name'] || daten['vereinsname'] || undefined,
    strasse: daten['straße'] || daten['strasse'] || undefined,
    plz: daten['plz'] || undefined,
    ort: daten['ort'] || undefined,
    email: daten['e-mail'] || daten['email'] || undefined,
    telefon: daten['telefon'] || undefined,
  };

  // Extrahiere Bestellinformationen
  const anzahlPlaetze = parseInt(daten['anzahl plätze'] || daten['anzahl plaetze'] || '0', 10);
  const tonnenLose02 = parseFloat(daten['tonnen 0-2 lose'] || '0');
  const tonnenGesackt02 = parseFloat(daten['tonnen 0-2 gesackt'] || '0');
  const tonnenLose03 = parseFloat(daten['tonnen 0-3 lose'] || '0');
  const tonnenGesackt03 = parseFloat(daten['tonnen 0-3 gesackt'] || '0');

  // Ermittle Hauptprodukt und Lieferart
  let artikel = 'Tennismehl';
  let koernung = '0-3';
  let lieferart: 'lose' | 'gesackt' = 'lose';
  let mengeGesamt = 0;

  if (tonnenLose02 > 0) {
    artikel = 'Tennismehl 0-2mm';
    koernung = '0-2';
    lieferart = 'lose';
    mengeGesamt = tonnenLose02;
  } else if (tonnenGesackt02 > 0) {
    artikel = 'Tennismehl 0-2mm gesackt';
    koernung = '0-2';
    lieferart = 'gesackt';
    mengeGesamt = tonnenGesackt02;
  } else if (tonnenLose03 > 0) {
    artikel = 'Tennismehl 0-3mm';
    koernung = '0-3';
    lieferart = 'lose';
    mengeGesamt = tonnenLose03;
  } else if (tonnenGesackt03 > 0) {
    artikel = 'Tennismehl 0-3mm gesackt';
    koernung = '0-3';
    lieferart = 'gesackt';
    mengeGesamt = tonnenGesackt03;
  }

  // Versuche Menge aus der Nachricht zu extrahieren falls nicht angegeben
  const nachricht = daten['nachricht'] || '';
  if (mengeGesamt === 0 && nachricht) {
    // Suche nach Mengenangaben wie "4,5 t" oder "4.5 Tonnen"
    const mengeMatch = nachricht.match(/(\d+[,.]?\d*)\s*(?:t(?:onnen?)?|to)/i);
    if (mengeMatch) {
      mengeGesamt = parseFloat(mengeMatch[1].replace(',', '.'));
    }

    // Versuche Körnung aus der Nachricht zu extrahieren
    const koernungMatch = nachricht.match(/0-(\d)\s*mm/i);
    if (koernungMatch) {
      koernung = `0-${koernungMatch[1]}`;
      artikel = `Tennismehl ${koernung}mm${lieferart === 'gesackt' ? ' gesackt' : ''}`;
    }
  }

  const bestellung = {
    anzahlPlaetze: anzahlPlaetze || undefined,
    mengeGesamt: mengeGesamt || undefined,
    artikel,
    koernung,
    lieferart,
    wunschtermin: undefined,
  };

  // Erstelle Angebots-Vorschlag
  const positionen: AnfrageAnalyseErgebnis['angebotsvorschlag']['empfohlenePositionen'] = [];

  if (tonnenLose02 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-2mm lose',
      menge: tonnenLose02,
      einheit: 't',
    });
  }
  if (tonnenGesackt02 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-2mm gesackt (25kg Säcke)',
      menge: tonnenGesackt02,
      einheit: 't',
    });
  }
  if (tonnenLose03 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-3mm lose',
      menge: tonnenLose03,
      einheit: 't',
    });
  }
  if (tonnenGesackt03 > 0) {
    positionen.push({
      artikelbezeichnung: 'Tennismehl 0-3mm gesackt (25kg Säcke)',
      menge: tonnenGesackt03,
      einheit: 't',
    });
  }

  // Falls keine Mengen explizit angegeben, füge geschätzte Position hinzu
  if (positionen.length === 0 && mengeGesamt > 0) {
    positionen.push({
      artikelbezeichnung: artikel,
      menge: mengeGesamt,
      einheit: 't',
    });
  }

  // Füge Fracht hinzu wenn Positionen vorhanden
  if (positionen.length > 0 && kontakt.plz) {
    positionen.push({
      artikelbezeichnung: 'Fracht/Lieferung',
      menge: 1,
      einheit: 'pauschal',
    });
  }

  const angebotsvorschlag = {
    empfohlenePositionen: positionen,
    geschaetzteGesamtmenge: mengeGesamt || (anzahlPlaetze ? anzahlPlaetze * 2.25 : 0),
    besonderheiten: nachricht ? [nachricht] : undefined,
  };

  // Erstelle Zusammenfassung
  const kundenname = kontakt.vereinsname || `${kontakt.vorname || ''} ${kontakt.nachname || ''}`.trim();
  const zusammenfassung = `Anfrage von ${kundenname} aus ${kontakt.plz} ${kontakt.ort}` +
    (bestellung.mengeGesamt ? ` für ${bestellung.mengeGesamt}t ${bestellung.artikel}` : '') +
    (bestellung.anzahlPlaetze ? ` (${bestellung.anzahlPlaetze} Plätze)` : '');

  // Berechne Konfidenz basierend auf vorhandenen Daten
  let konfidenz = 0;
  if (kontakt.vereinsname || kontakt.nachname) konfidenz += 0.2;
  if (kontakt.plz && kontakt.ort) konfidenz += 0.2;
  if (kontakt.email) konfidenz += 0.2;
  if (bestellung.mengeGesamt) konfidenz += 0.2;
  if (positionen.length > 0) konfidenz += 0.2;

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

// Generiere E-Mail-Text für Angebot
export const generiereAngebotsEmail = (
  _kundenname: string, // Für zukünftige Personalisierung
  ansprechpartner?: string,
  angebotsnummer?: string,
): string => {
  const anrede = ansprechpartner
    ? `Sehr geehrte/r ${ansprechpartner}`
    : 'Sehr geehrte Damen und Herren';

  return `${anrede},

vielen Dank für Ihre Anfrage.

Anbei erhalten Sie unser Angebot${angebotsnummer ? ` Nr. ${angebotsnummer}` : ''} gemäß Ihrer Anfrage.

Wir würden uns freuen, Sie als Kunden begrüßen zu dürfen. Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

Ihr TennisMehl-Team

---
Koch Dienste
Tel: +49 9631 798878-0
E-Mail: info@tennismehl.com
www.tennismehl.com`;
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
  // In der Realität würde hier die echte Frachtberechnung greifen
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
