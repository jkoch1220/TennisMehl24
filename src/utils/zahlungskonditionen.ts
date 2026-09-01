/**
 * Zahlungskonditionen: Kürzel aus Mosaik in verwertbare Zahlen übersetzen.
 *
 * Im Altsystem stand die Kondition als Kürzel im Feld `Zahlungsart` — bei 1277
 * von 2187 Kunden gepflegt, in 25 Schreibweisen für im Grunde fünf Muster:
 *
 *   NETTO14 / NETTO30 / NETTO7      Zahlbar netto in n Tagen
 *   TAGE10 / TAGE20 / WERKTAGE10    dasselbe, andere Schreibweise
 *   SKTO209 / SKTO210 / SKTO314     Skonto: erste Ziffer Prozent, letzte zwei
 *                                   Ziffern die Skontofrist in Tagen
 *   SOFORT / Sofort / BAR           sofort zahlbar (0 Tage)
 *   VORKASSE2 / Vorkasse            Ware geht erst nach Zahlungseingang raus
 *
 * Zwei Dinge sind hier bewusst festgelegt und sollten bekannt sein:
 *
 * 1. NETTOZIEL BEI SKONTO-KONDITIONEN. „SKTO209" nennt nur die Skontofrist
 *    (9 Tage bei 2 %), nicht das Nettoziel. Mosaik führte das Nettoziel nicht
 *    getrennt. Wir setzen dafür STANDARD_NETTOZIEL_TAGE (14) an — das ist der
 *    Hausstandard und deckt sich mit der häufigsten Kondition NETTO14. Wer es
 *    anders braucht, überschreibt das Zahlungsziel am Kunden von Hand.
 *
 * 2. VORKASSE IST KEIN ZAHLUNGSZIEL. Sie bekommt `tage: 0` und zusätzlich
 *    `vorkasse: true`, damit die Fälligkeitsrechnung nicht so tut, als sei eine
 *    Frist verstrichen — bei Vorkasse gibt es keine offene Forderung, solange
 *    nicht geliefert wurde.
 *
 * Die Zahl im Kürzel „VORKASSE2" ist eine Mosaik-interne Variante ohne
 * fachliche Bedeutung für uns; sie wird ignoriert.
 */

/** Hausstandard, wenn nichts anderes bekannt ist. Deckt sich mit NETTO14. */
export const STANDARD_NETTOZIEL_TAGE = 14;

export interface Zahlungskondition {
  /** Nettoziel in Tagen ab Rechnungsdatum. */
  tage: number;
  /** Skontosatz in Prozent, falls vereinbart. */
  skontoProzent?: number;
  /** Frist in Tagen, innerhalb derer der Skonto gilt. */
  skontoTage?: number;
  /** Ware erst nach Zahlungseingang — es entsteht keine offene Forderung. */
  vorkasse?: boolean;
  /** Menschenlesbare Fassung, so wie sie auf Angebot/AB gedruckt wird. */
  text: string;
  /** Das ursprüngliche Mosaik-Kürzel, für Nachvollziehbarkeit. */
  quelle: string;
}

/**
 * Übersetzt ein Mosaik-Kürzel in eine Kondition.
 * Gibt null zurück, wenn das Kürzel leer oder nicht deutbar ist — dann gilt
 * beim Aufrufer der Hausstandard. Bewusst kein stiller Fallback auf 14 Tage:
 * „nicht gepflegt" und „ausdrücklich 14 Tage" sollen unterscheidbar bleiben.
 */
export const parseMosaikZahlungsart = (rohwert: string | null | undefined): Zahlungskondition | null => {
  if (!rohwert) return null;

  const quelle = rohwert.trim();
  if (!quelle) return null;

  // Vergleich case-insensitiv und ohne Leerzeichen: die Daten enthalten
  // "SKTO209", "skto209", "30 Tage" und "Vorkasse2" nebeneinander.
  const norm = quelle.toUpperCase().replace(/\s+/g, '');

  // Vorkasse zuerst — sie ist kein Zahlungsziel, sondern hebt es auf.
  if (norm.startsWith('VORKASSE')) {
    return { tage: 0, vorkasse: true, text: 'Vorkasse', quelle };
  }

  // Sofort/bar. SOFORTVOB ist „sofort nach VOB" und bleibt hier 0 Tage.
  if (norm.startsWith('SOFORT') || norm === 'BAR') {
    return { tage: 0, text: 'Sofort ohne Abzug', quelle };
  }

  // Skonto: SKTO<prozent><tage>, z.B. SKTO209 = 2 % bei 9 Tagen.
  // Die Skontofrist ist immer zweistellig, der Prozentsatz einstellig.
  const skonto = norm.match(/^SKTO(\d)(\d{2})$/);
  if (skonto) {
    const skontoProzent = Number(skonto[1]);
    const skontoTage = Number(skonto[2]);
    return {
      tage: STANDARD_NETTOZIEL_TAGE,
      skontoProzent,
      skontoTage,
      text: `${skontoTage} Tage ${skontoProzent} % Skonto, ${STANDARD_NETTOZIEL_TAGE} Tage netto`,
      quelle,
    };
  }

  // SKONTO2 ohne Frist — Prozentsatz bekannt, Frist nicht. Frist offen lassen,
  // damit niemand eine Skontofrist erfindet, die so nie vereinbart war.
  const skontoOhneFrist = norm.match(/^SKONTO(\d)$/);
  if (skontoOhneFrist) {
    return {
      tage: STANDARD_NETTOZIEL_TAGE,
      skontoProzent: Number(skontoOhneFrist[1]),
      text: `${STANDARD_NETTOZIEL_TAGE} Tage netto, ${skontoOhneFrist[1]} % Skonto`,
      quelle,
    };
  }

  // NETTO14, TAGE10, WERKTAGE10, "30 Tage" — überall steckt die Tageszahl drin.
  // WERKTAGE wird wie Kalendertage behandelt: die Fälligkeitsrechnung im Portal
  // kennt keine Werktage, und bei 10 Tagen liegt der Unterschied im Rahmen.
  const mitTagen = norm.match(/^(?:NETTO|WERKTAGE|TAGE)?(\d{1,3})(?:TAGE)?$/);
  if (mitTagen) {
    const tage = Number(mitTagen[1]);
    // Plausibilitätsgrenze: alles über 180 Tagen ist im Altbestand ein
    // Zahlendreher oder eine Kundennummer im falschen Feld, kein Zahlungsziel.
    if (tage > 180) return null;
    return { tage, text: `${tage} Tage netto`, quelle };
  }

  return null;
};

/**
 * Zahlungsziel in die Schreibweise bringen, die Angebot, AB und Rechnung im
 * Feld `zahlungsziel` führen — „14 Tage", „Sofort", „Vorkasse".
 *
 * Das Format ist nicht frei wählbar: `parseZahlungszielTage`
 * (projektabwicklungDokumentService.ts:110) liest daraus später die Tage für
 * die Fälligkeit zurück, indem es die ERSTE Zahl im String nimmt. Ein Text wie
 * „9 Tage 2 % Skonto, 14 Tage netto" ergäbe darum ein Zahlungsziel von 9 statt
 * 14 Tagen. Skontoangaben gehören deshalb nicht in dieses Feld.
 *
 * Gibt undefined zurück, wenn nichts hinterlegt ist — der Aufrufer entscheidet
 * dann, ob er seinen Standard behält.
 */
export const formatiereZahlungsziel = (tage?: number | null): string | undefined => {
  if (tage === undefined || tage === null || Number.isNaN(tage)) return undefined;
  // 0 Tage wird „Sofort", nicht „Vorkasse": beide ergeben beim Zurücklesen 0,
  // aber Vorkasse hieße Zahlung VOR Lieferung — eine Geschäftsentscheidung, die
  // aus einer bloßen Tageszahl nicht ableitbar ist.
  if (tage <= 0) return 'Sofort';
  return `${tage} Tage`;
};

/**
 * Auswahlmöglichkeiten für die Zahlungsziel-Felder.
 *
 * 10 und 20 Tage stehen mit drin, weil der Mosaik-Bestand sie führt (77 bzw.
 * 9 Kunden). Ohne sie zeigt das <select> bei diesen Kunden nichts an, weil der
 * vorbelegte Wert zu keiner Option passt.
 */
export const ZAHLUNGSZIEL_OPTIONEN = [
  'Vorkasse',
  'Sofort',
  '7 Tage',
  '10 Tage',
  '14 Tage',
  '20 Tage',
  '30 Tage',
  '60 Tage',
] as const;

/**
 * Optionsliste inklusive des aktuell gesetzten Werts.
 *
 * Sicherheitsnetz gegen stillen Datenverlust: Stünde am Kunden ein Ziel, das in
 * der Liste fehlt (etwa „45 Tage" von Hand gepflegt), zeigte das <select> ein
 * leeres Feld — und beim nächsten Speichern wäre der Wert weg, ohne dass es
 * jemandem auffällt.
 */
export const zahlungszielOptionen = (aktuell?: string): string[] => {
  const optionen: string[] = [...ZAHLUNGSZIEL_OPTIONEN];
  if (aktuell && !optionen.includes(aktuell)) optionen.unshift(aktuell);
  return optionen;
};
