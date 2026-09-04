/**
 * Mehrere E-Mail-Adressen in EINEM Feld — Trennen, Prüfen, Normalisieren.
 *
 * Kunden nennen ihre Rechnungsempfänger selten einzeln: Aus Outlook kopiert
 * kommt „dietmar@gmx.de; michael@web.de", aus dem Vereinsbrief kommt eine
 * Adresse pro Zeile, manchmal steht der Name davor („Max Muster <max@x.de>").
 * Ein `<input type="email">` lehnt jedes Semikolon ab („Nach dem @ darf kein
 * ; verwendet werden") und blockiert damit den ganzen Speichervorgang.
 *
 * Deshalb laufen alle Adressfelder, die mehr als eine Adresse fassen dürfen,
 * über diese Helfer und über `EmailAdressenInput` (Text-Eingabe statt
 * Browser-Validierung):
 *   - `trenneEmailAdressen` zerlegt jede gängige Schreibweise in Einzeladressen
 *   - `pruefeEmailAdressen` meldet, welche davon keine Adresse sind
 *   - `normalisiereEmailAdressen` liefert die kanonische Speicherform
 *     „a@x.de, b@y.de" — kommagetrennt, weil das die Form ist, die nodemailer,
 *     der IMAP-„Gesendet"-Header und `mailto:` gleichermaßen verstehen.
 *     Semikolons wären im RFC-5322-To-Header nicht zulässig.
 */

/** Trennzeichen zwischen zwei Adressen: Semikolon, Komma, Zeilenumbruch */
const TRENNER = /[;,\r\n]+/;

/**
 * Eine einzelne Adresse. Bewusst großzügig (Umlaut-Domains, Plus-Adressen),
 * aber ohne Leerzeichen, Trennzeichen oder spitze Klammern — genau die Zeichen,
 * die auf eine nicht getrennte Liste hindeuten.
 */
const EINZELADRESSE = /^[^\s@,;<>()[\]"]+@[^\s@,;<>()[\]"]+\.[^\s@,;<>()[\]".]{2,}$/;

/** Prüft EINE Adresse (ohne Trennlogik). */
export const istGueltigeEmailAdresse = (adresse: string): boolean =>
  EINZELADRESSE.test(adresse.trim());

/**
 * Zerlegt ein Feld in Einzeladressen. Verstanden werden:
 *   „a@x.de; b@y.de"   (Outlook)          „a@x.de, b@y.de"   (Komma)
 *   „a@x.de b@y.de"    (Leerzeichen)      eine Adresse pro Zeile
 *   „Max Muster <max@x.de>"               (Anzeigename wird verworfen)
 *
 * Doppelte Adressen fallen weg (ohne Rücksicht auf Groß-/Kleinschreibung,
 * die erste Schreibweise bleibt). Ungültige Einträge bleiben in der Liste,
 * damit `pruefeEmailAdressen` sie benennen kann.
 */
export const trenneEmailAdressen = (roh: string | null | undefined): string[] => {
  if (!roh) return [];
  const ergebnis: string[] = [];
  const gesehen = new Set<string>();
  const uebernehme = (kandidat: string) => {
    const adresse = kandidat.trim();
    if (!adresse) return;
    const schluessel = adresse.toLowerCase();
    if (gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    ergebnis.push(adresse);
  };

  for (const teil of roh.split(TRENNER)) {
    const inKlammern = teil.match(/<([^<>]*)>/);
    if (inKlammern) {
      uebernehme(inKlammern[1]);
      continue;
    }
    // Ohne Klammern: Leerzeichen trennen ebenfalls — „a@x.de b@y.de" ist
    // häufiger als ein Anzeigename ohne Klammern.
    for (const token of teil.trim().split(/\s+/)) uebernehme(token);
  }
  return ergebnis;
};

export interface EmailAdressenPruefung {
  /** Alle erkannten Einträge (gültige und ungültige) */
  adressen: string[];
  /** Die Einträge daraus, die keine E-Mail-Adresse sind */
  ungueltig: string[];
}

export const pruefeEmailAdressen = (roh: string | null | undefined): EmailAdressenPruefung => {
  const adressen = trenneEmailAdressen(roh);
  return { adressen, ungueltig: adressen.filter((a) => !istGueltigeEmailAdresse(a)) };
};

/** Mindestens eine Adresse, und alle Einträge gültig. */
export const sindGueltigeEmailAdressen = (roh: string | null | undefined): boolean => {
  const { adressen, ungueltig } = pruefeEmailAdressen(roh);
  return adressen.length > 0 && ungueltig.length === 0;
};

/**
 * Kanonische Schreibweise: „a@x.de, b@y.de". Leeres Feld → leerer String.
 * Ungültige Einträge werden NICHT verworfen — das Feld soll zeigen, was der
 * Benutzer eingegeben hat, die Prüfung meldet den Fehler.
 */
export const normalisiereEmailAdressen = (roh: string | null | undefined): string =>
  trenneEmailAdressen(roh).join(', ');

/**
 * Deutsche Fehlermeldung für ein Feld — oder `null`, wenn alles in Ordnung ist.
 * Ein leeres Feld ist in Ordnung (Pflicht prüft der Aufrufer).
 *
 * @param feldname  Bezeichnung im Fehlertext, z.B. „Rechnungs-E-Mail"
 * @param mehrere   false → mehr als eine Adresse ist selbst ein Fehler
 */
export const emailAdressenFehler = (
  roh: string | null | undefined,
  feldname = 'E-Mail',
  mehrere = true
): string | null => {
  const { adressen, ungueltig } = pruefeEmailAdressen(roh);
  if (adressen.length === 0) return null;
  if (ungueltig.length > 0) {
    return ungueltig.length === 1
      ? `${feldname}: „${ungueltig[0]}" ist keine gültige E-Mail-Adresse.`
      : `${feldname}: ${ungueltig.map((u) => `„${u}"`).join(', ')} sind keine gültigen E-Mail-Adressen.`;
  }
  if (!mehrere && adressen.length > 1) {
    return `${feldname}: Hier ist nur eine Adresse möglich (${adressen.length} eingetragen).`;
  }
  return null;
};
