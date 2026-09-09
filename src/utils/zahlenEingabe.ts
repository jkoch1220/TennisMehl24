/**
 * Eingabelogik für Zahlenfelder (Vorschlag „Komma in Staffelpreisangeboten", 09/2026,
 * ausgeweitet auf alle Zahlenfelder des Portals).
 *
 * Warum kein `<input type="number">` mehr:
 *  - Ob „50,5" angenommen wird, entscheidet die Browser-Sprache, nicht das Portal.
 *    Bei englischer Oberfläche ist das Feld nach dem Komma leer und der Wert 0.
 *  - Ein leeres Feld liefert "" → `parseFloat("") || 0` → 0 → das Feld zeigt
 *    wieder „0". Man kann es nicht leer lassen, und vor jede Eingabe schiebt
 *    sich eine Null („05").
 *  - Jeder Tastendruck wurde sofort geparst und zurückgeschrieben; Zwischen-
 *    stände wie „0," gingen dabei verloren.
 *
 * Deshalb: Textfeld mit `inputMode="decimal"`, eigener Anzeige-String, der
 * beim Tippen unangetastet bleibt, Punkt UND Komma als Dezimaltrenner, und
 * erst beim Verlassen des Feldes Rundung, Begrenzung und deutsche Anzeige.
 *
 * Alles hier ist reine Logik ohne React, damit es ohne Browser testbar ist.
 */

export interface ZahlenRegeln {
  /** Negative Zahlen erlaubt? Standard: nur wenn `min` fehlt oder < 0 ist. */
  negativ?: boolean;
  /** Höchstzahl Nachkommastellen; 0 = ganze Zahl; undefined = frei. */
  dezimalstellen?: number;
  min?: number;
  max?: number;
}

/** Wandelt eine Prop, die Zahl oder String sein darf (`step="0.01"`), in eine Zahl. */
export const zahlAusProp = (wert: number | string | undefined | null): number | undefined => {
  if (wert === undefined || wert === null || wert === '' || wert === 'any') return undefined;
  const zahl = typeof wert === 'number' ? wert : Number(String(wert).replace(',', '.'));
  return Number.isFinite(zahl) ? zahl : undefined;
};

/**
 * Bereinigt Rohtext aus dem Feld zu dem, was angezeigt werden darf.
 * Gibt den bereinigten Text zurück – nie null, damit eine Eingabe nie „hängt".
 *
 * Regeln:
 *  - erlaubt: Ziffern, ein Dezimaltrenner (Komma oder Punkt), optional führendes Minus
 *  - Fremdzeichen (Buchstaben, Leerzeichen, Einheiten aus der Zwischenablage) fallen weg
 *  - „1.234,56" aus der Zwischenablage: der letzte Trenner ist das Komma, der Rest Tausender
 *  - „1.234.567": mehrfach derselbe Trenner = Tausenderpunkte, werden entfernt
 *  - bei `dezimalstellen` werden überzählige Nachkommastellen abgeschnitten
 *  - führende Nullen bleiben beim Tippen stehen (werden beim Verlassen entfernt),
 *    damit „0," und „0,5" erreichbar sind
 */
export const bereinigeZahlText = (roh: string, regeln: ZahlenRegeln = {}): string => {
  const negativErlaubt = regeln.negativ ?? (regeln.min === undefined || regeln.min < 0);
  let text = roh.replace(/\s/g, '');

  const negativ = negativErlaubt && text.startsWith('-');
  text = text.replace(/[^\d.,]/g, '');

  const punkte = (text.match(/\./g) || []).length;
  const kommas = (text.match(/,/g) || []).length;

  if (punkte > 0 && kommas > 0) {
    // Beide Trenner: der letzte ist der Dezimaltrenner, alle anderen Tausender
    const letzterPunkt = text.lastIndexOf('.');
    const letztesKomma = text.lastIndexOf(',');
    const dezimalPos = Math.max(letzterPunkt, letztesKomma);
    text = text.slice(0, dezimalPos).replace(/[.,]/g, '') + ',' + text.slice(dezimalPos + 1).replace(/[.,]/g, '');
  } else if (punkte > 1 || kommas > 1) {
    // Mehrfach derselbe Trenner. Alle zu entfernen ist nur richtig, wenn der
    // Text wirklich eine Tausendergruppierung ist („1.234.567"). Sonst macht
    // ein zweiter Tastendruck aufs Komma aus „1,5," die Zahl 15 – ein stiller
    // Sprung um eine Zehnerpotenz mitten im Tippen. Deshalb: nur bei echter
    // Dreiergruppierung entfernen, sonst den ERSTEN Trenner als Dezimaltrenner
    // behalten und die weiteren verwerfen. Ein verworfenes Zeichen ist
    // harmlos, ein zehnfacher Preis nicht.
    const trenner = punkte > 1 ? '\\.' : ',';
    const istTausendergruppe = new RegExp(`^\\d{1,3}(${trenner}\\d{3})+$`).test(text);
    if (istTausendergruppe) {
      text = text.replace(/[.,]/g, '');
    } else {
      const erster = text.search(/[.,]/);
      text = text.slice(0, erster) + ',' + text.slice(erster + 1).replace(/[.,]/g, '');
    }
  } else {
    text = text.replace('.', ',');
  }

  if (regeln.dezimalstellen === 0) {
    // Ganzzahlfeld: der Trenner bleibt beim Tippen stehen und wird erst beim
    // Verlassen aufgelöst (siehe schliesseEingabeAb). Ihn sofort samt allem
    // dahinter zu verwerfen kostete Ziffern: Wer „1.234" Paletten über den
    // Numpad-Punkt tippte, konnte nach dem Punkt nichts mehr eingeben – im
    // Feld stand 1. Ihn nur zu entfernen wäre die andere Falle: aus „7,9"
    // würde 79.
    const ersterTrenner = text.indexOf(',');
    if (ersterTrenner !== -1) {
      text = text.slice(0, ersterTrenner + 1) + text.slice(ersterTrenner + 1).replace(/,/g, '');
    }
  } else if (regeln.dezimalstellen !== undefined && text.includes(',')) {
    const [ganz, nach = ''] = text.split(',');
    text = `${ganz},${nach.slice(0, regeln.dezimalstellen)}`;
  }

  return negativ ? `-${text}` : text;
};

/**
 * Bereinigt Text aus der Zwischenablage. Einfügen ist nicht Tippen und braucht
 * zwei andere Regeln:
 *
 *  1. Beim Tippen ist ein einzelner Punkt der Numpad-Punkt, also ein Dezimal-
 *     trenner. Eingefügtes „1.234" kommt dagegen meist aus Excel oder einer
 *     E-Mail und meint 1234. Eindeutig ist das aber nur, wenn das Feld gar
 *     keine drei Nachkommastellen führen kann – deshalb greift die Tausender-
 *     lesart nur bei `dezimalstellen <= 2` (Geldfelder). Ein Mengenfeld ohne
 *     feste Stellen behält die Dezimallesart, sonst würden aus 1,234 t
 *     plötzlich 1234 t.
 *  2. Überzählige Nachkommastellen werden gerundet statt abgeschnitten:
 *     eingefügte 0,105 ergeben in einem Cent-Feld 0,11, nicht 0,10.
 */
export const bereinigeEingefuegtenText = (roh: string, regeln: ZahlenRegeln = {}): string => {
  const kompakt = roh.replace(/\s/g, '');
  const nurTausenderpunkt =
    regeln.dezimalstellen !== undefined &&
    regeln.dezimalstellen <= 2 &&
    /^-?\d{1,3}\.\d{3}$/.test(kompakt);

  const text = bereinigeZahlText(
    nurTausenderpunkt ? kompakt.replace('.', '') : kompakt,
    // Stellen erst nach dem Runden begrenzen, sonst schneidet die Tipp-Regel
    // die Ziffer weg, die über die Rundung entscheidet.
    { ...regeln, dezimalstellen: undefined }
  );

  const wert = parseZahlText(text);
  if (wert === null || regeln.dezimalstellen === undefined) return text;
  return formatZahlAnzeige(rundeAuf(wert, regeln.dezimalstellen), regeln.dezimalstellen);
};

/** Liest den Anzeigetext als Zahl. Leer, „-", „," → null. */
export const parseZahlText = (text: string): number | null => {
  const t = text.trim();
  if (t === '' || t === '-' || t === ',' || t === '-,' || t === '.' ) return null;
  const zahl = Number(t.replace(',', '.'));
  return Number.isFinite(zahl) ? zahl : null;
};

/** Deutsche Anzeige ohne Tausenderpunkte: 50.5 → „50,5", 1234 → „1234". */
export const formatZahlAnzeige = (
  wert: number | null | undefined,
  dezimalstellen?: number
): string => {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return '';
  const gerundet = dezimalstellen === undefined ? wert : rundeAuf(wert, dezimalstellen);
  return gerundet.toLocaleString('de-DE', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: dezimalstellen ?? 10,
  });
};

export const rundeAuf = (wert: number, dezimalstellen: number): number => {
  const faktor = 10 ** Math.max(0, Math.min(10, dezimalstellen));
  // Betrag runden, Vorzeichen danach wieder anlegen. `Math.round` rundet bei
  // .5 immer Richtung +unendlich, und das EPSILON schob den Wert zusätzlich
  // nach oben: -1,005 wurde so zu -1 statt zu -1,01 – bei einer Gutschrift
  // verschwand ein Cent. Positiv und negativ müssen gleich runden.
  const gerundet = Math.round((Math.abs(wert) + Number.EPSILON) * faktor) / faktor;
  return wert < 0 && gerundet !== 0 ? -gerundet : gerundet;
};

const begrenze = (wert: number, regeln: ZahlenRegeln): number => {
  let w = wert;
  if (regeln.min !== undefined && w < regeln.min) w = regeln.min;
  if (regeln.max !== undefined && w > regeln.max) w = regeln.max;
  return w;
};

/**
 * Beim Verlassen des Feldes: parsen, runden, begrenzen, Anzeige kanonisch machen.
 * Leeres Feld bleibt leer (Wert null) – was das für das Formular heißt (0 oder
 * null), entscheidet die Komponente.
 */
export const schliesseEingabeAb = (
  text: string,
  regeln: ZahlenRegeln = {}
): { wert: number | null; anzeige: string } => {
  // Ganzzahlfeld mit stehengebliebenem Trenner: „1.234" meint 1234 Paletten
  // (Tausendertrennung, genau drei Ziffern dahinter), „7,9" dagegen eine
  // Kommazahl, die auf 8 gerundet wird. Ein Dezimaltrenner hat in einem Feld
  // ohne Nachkommastellen keine andere sinnvolle Lesart.
  const alsTausender =
    regeln.dezimalstellen === 0 && /^-?\d{1,3}[.,]\d{3}$/.test(text.trim());
  const roh = parseZahlText(alsTausender ? text.trim().replace(/[.,]/, '') : text);
  if (roh === null) return { wert: null, anzeige: '' };
  let wert = regeln.dezimalstellen === undefined ? roh : rundeAuf(roh, regeln.dezimalstellen);
  wert = begrenze(wert, regeln);
  if (Object.is(wert, -0)) wert = 0;
  return { wert, anzeige: formatZahlAnzeige(wert, regeln.dezimalstellen) };
};

/**
 * Pfeiltaste hoch/runter: ein Schritt weiter, ohne Gleitkomma-Müll (0,1 + 0,2).
 * Auf leerem Feld startet der Schritt bei 0 (bzw. bei `min`, wenn 0 darunter liegt).
 */
export const schrittWert = (
  aktuell: number | null,
  richtung: 1 | -1,
  schritt: number,
  regeln: ZahlenRegeln = {}
): number => {
  const basis = aktuell ?? Math.max(0, regeln.min ?? 0);
  const roh = basis + richtung * schritt;
  const stellen = regeln.dezimalstellen ?? Math.max(nachkommastellen(schritt), nachkommastellen(basis));
  return begrenze(rundeAuf(roh, stellen), regeln);
};

const nachkommastellen = (zahl: number): number => {
  const s = String(zahl);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const idx = s.indexOf('.');
  return idx === -1 ? 0 : s.length - idx - 1;
};

/** Sind zwei Feldwerte fachlich gleich? (null/undefined/NaN gelten als „leer".) */
export const gleicherWert = (a: number | null | undefined, b: number | null | undefined): boolean => {
  const la = a === null || a === undefined || Number.isNaN(a);
  const lb = b === null || b === undefined || Number.isNaN(b);
  if (la || lb) return la && lb;
  return a === b;
};
