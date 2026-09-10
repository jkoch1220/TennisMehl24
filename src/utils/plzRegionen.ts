/**
 * PLZ-Gebiete in Staffelpreisen (09/2026).
 *
 * Ein Platzbauer bekommt je Mengenstufe unterschiedliche Preise, je nachdem
 * wohin geliefert wird — die Fracht macht den Unterschied. Gepflegt wird das
 * als PLZ-Präfixliste („47;42"), weil niemand einzelne Postleitzahlen pflegen
 * will und sich Liefergebiete an den ersten Stellen orientieren.
 *
 * Regeln, die hier festgehalten sind:
 *  - Trenner ist das Semikolon; Komma, Leerzeichen und Zeilenumbruch werden
 *    ebenfalls akzeptiert, weil beim Tippen alles davon vorkommt.
 *  - Verglichen wird als Präfix: „97" trifft 97070 und 97199.
 *  - Das LÄNGSTE passende Präfix gewinnt. Wer neben „97" noch „972" pflegt,
 *    meint für 97218 den Preis von „972" — sonst hinge das Ergebnis von der
 *    Reihenfolge der Zeilen ab.
 *  - Nichts gefunden heißt: der Stufenpreis ohne Region gilt. Eine Lieferung
 *    darf nie ohne Preis dastehen, nur weil ein Gebiet nicht gepflegt wurde.
 */
import type { Preisstaffel, RegionPreis } from '../types/platzbauer';
import { formatTonnen } from './staffelpreisText';

/** Zerlegt die Eingabe „47; 42 , 90" in ['47','42','90']. */
export const zerlegePlzGebiete = (eingabe?: string | null): string[] => {
  if (!eingabe) return [];
  return eingabe
    .split(/[;,\s]+/)
    .map((teil) => teil.trim())
    .filter((teil) => /^\d{1,5}$/.test(teil));
};

/** Anzeigeform einer Gebietsliste: „47; 42". */
export const formatierePlzGebiete = (eingabe?: string | null): string =>
  zerlegePlzGebiete(eingabe).join('; ');

/** Normalisiert eine PLZ auf Ziffern; alles andere (Ausland, leer) ergibt ''. */
export const normalisierePlz = (plz?: string | null): string =>
  (plz || '').replace(/\D/g, '');

/**
 * Welcher Regionpreis gilt für diese PLZ? Das längste passende Präfix gewinnt;
 * ohne Treffer `null`.
 */
export const findeRegionPreis = (
  regionPreise: RegionPreis[] | undefined | null,
  plz?: string | null
): RegionPreis | null => {
  const ziffern = normalisierePlz(plz);
  if (!ziffern || !regionPreise?.length) return null;

  let treffer: RegionPreis | null = null;
  let laenge = -1;
  for (const region of regionPreise) {
    for (const praefix of zerlegePlzGebiete(region.plzGebiete)) {
      if (ziffern.startsWith(praefix) && praefix.length > laenge) {
        treffer = region;
        laenge = praefix.length;
      }
    }
  }
  return treffer;
};

/** Woraus sich ein ermittelter Preis ergibt — für Anzeige und Beleg. */
export interface StaffelPreisTreffer {
  einzelpreis: number;
  staffel: Preisstaffel;
  /** 1-basierte Nummer der Mengenstufe. */
  stufe: number;
  region: RegionPreis | null;
  /** Klartext, z. B. „Stufe 3 (ab 400 t), PLZ 97 → 150,00 €/t". */
  herkunft: string;
}

const euro = (betrag: number): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag);

/**
 * Der Preis für eine Lieferung: erst die Mengenstufe über die bisherige
 * Gesamtabnahme des Platzbauers, dann innerhalb dieser Stufe die Region über
 * die PLZ des Vereins.
 *
 * `gesamtmenge` ist bewusst die Menge des PLATZBAUERS, nicht die dieser einen
 * Lieferung: Die Staffel misst die Gesamtabnahme, sonst käme jeder Verein
 * einzeln in die unterste Stufe.
 */
export const ermittleStaffelPreis = (
  staffeln: Preisstaffel[] | undefined | null,
  gesamtmenge: number,
  plz?: string | null
): StaffelPreisTreffer | null => {
  if (!staffeln?.length) return null;
  const sortiert = [...staffeln].sort((a, b) => a.vonMenge - b.vonMenge);

  // „ab 400 t" schließt 400 t ein (von ≤ Menge < bis) – dieselbe Grenzregel
  // wie im Hinweistext und in staffelpreisText.findeStaffel.
  const index = (() => {
    const gefunden = sortiert.findIndex(
      (s) =>
        gesamtmenge >= s.vonMenge &&
        (!s.bisMenge || s.bisMenge <= s.vonMenge || gesamtmenge < s.bisMenge)
    );
    if (gefunden >= 0) return gefunden;
    return gesamtmenge < sortiert[0].vonMenge ? 0 : sortiert.length - 1;
  })();

  const staffel = sortiert[index];
  const region = findeRegionPreis(staffel.regionPreise, plz);
  const einzelpreis = region ? region.einzelpreis : staffel.einzelpreis;

  const grenze = staffel.bisMenge
    ? `${formatTonnen(staffel.vonMenge)} – unter ${formatTonnen(staffel.bisMenge)}`
    : `ab ${formatTonnen(staffel.vonMenge)}`;
  const regionText = region
    ? `, ${region.bezeichnung?.trim() || `PLZ ${formatierePlzGebiete(region.plzGebiete)}`}`
    : staffel.regionPreise?.length
      ? ', keine Region hinterlegt'
      : '';

  return {
    einzelpreis,
    staffel,
    stufe: index + 1,
    region,
    herkunft: `Stufe ${index + 1} (${grenze})${regionText} → ${euro(einzelpreis)}/t`,
  };
};
