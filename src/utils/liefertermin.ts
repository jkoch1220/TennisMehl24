/**
 * Der Liefertermin eines Projekts — aus drei Feldern, die verschieden viel wert sind.
 *
 * Das Datenmodell führt den Termin an drei Stellen, weil er im Lauf der Abwicklung
 * immer verbindlicher wird:
 *
 * - `lieferKW` ist die grobe Zusage aus dem Angebot bzw. der Auftragsbestätigung:
 *   „spätestens in dieser Woche". Kein Tag, keine Uhrzeit.
 * - `geplantesDatum` setzt die Disposition, wenn sie den Auftrag einer Tour zuordnet.
 *   Intern verbindlich, dem Kunden aber noch nicht gesagt.
 * - `kommuniziertesDatum` ist der Tag, den der Kunde am Telefon genannt bekommen hat.
 *   Das ist eine Zusage, kein Planwert — und darf deshalb nie stillschweigend
 *   von einem Planwert überschrieben werden.
 *
 * Wer nur eines der drei liest, bekommt ein falsches Bild: Das Board zeigte bis
 * 08/2026 gar keinen Termin, obwohl 130 Projekte der Saison 2026 eine Lieferwoche
 * tragen. Diese Datei bündelt die Auflösung an einer Stelle, samt Herkunft — denn
 * ein geschätzter Termin darf auf dem Bildschirm nicht aussehen wie eine Zusage.
 */

import { Projekt } from '../types/projekt';
import {
  formatISODatum,
  getISOWoche,
  getISOWochenJahr,
  getMontagDerKW,
  parseISODatum,
} from './kalenderwoche';

/** Woher der angezeigte Termin stammt — bestimmt, wie verbindlich er ist. */
export type TerminQuelle = 'abgestimmt' | 'geplant' | 'geschaetzt';

export interface EffektiverTermin {
  /** ISO-Datum (YYYY-MM-DD). Bei einer reinen KW der Montag dieser Woche. */
  datum: string;
  kw: number;
  kwJahr: number;
  quelle: TerminQuelle;
  /**
   * `true`, wenn der Termin dem Kunden zugesagt wurde oder als fix gilt. Solche
   * Termine dürfen nicht per Wischgeste verschoben werden.
   */
  verbindlich: boolean;
}

const QUELLE_LABEL: Record<TerminQuelle, string> = {
  abgestimmt: 'abgestimmt',
  geplant: 'geplant',
  geschaetzt: 'geschätzt',
};

export const terminQuelleLabel = (quelle: TerminQuelle): string => QUELLE_LABEL[quelle];

const ausDatum = (
  datumStr: string,
  quelle: TerminQuelle,
  verbindlich: boolean
): EffektiverTermin | null => {
  const datum = parseISODatum(datumStr);
  if (Number.isNaN(datum.getTime())) return null;
  return {
    datum: datumStr.slice(0, 10),
    kw: getISOWoche(datum),
    kwJahr: getISOWochenJahr(datum),
    quelle,
    verbindlich,
  };
};

/**
 * Ermittelt den maßgeblichen Liefertermin eines Projekts.
 *
 * Reihenfolge nach Verbindlichkeit: was dem Kunden gesagt wurde, schlägt die
 * interne Planung, und die schlägt die grobe Wochenangabe.
 *
 * Gibt `null` zurück, wenn kein Termin hinterlegt ist. Das ist ein legitimer
 * Zustand, kein Fehler: Ein offenes Angebot braucht keinen Liefertermin, und
 * Shop-Bestellungen gehen „so schnell wie möglich" raus.
 */
export function lieferterminEffektiv(projekt: Projekt): EffektiverTermin | null {
  if (projekt.kommuniziertesDatum) {
    // Dem Kunden genannt — immer verbindlich, unabhängig von lieferdatumTyp.
    const termin = ausDatum(projekt.kommuniziertesDatum, 'abgestimmt', true);
    if (termin) return termin;
  }

  if (projekt.geplantesDatum) {
    const termin = ausDatum(projekt.geplantesDatum, 'geplant', projekt.lieferdatumTyp === 'fix');
    if (termin) return termin;
  }

  if (projekt.lieferKW) {
    // Ohne Jahr fällt die Angabe auf das Saisonjahr zurück: Eine KW ohne Jahr ist
    // in der Frühjahrssaison immer die des laufenden Jahres.
    const jahr = projekt.lieferKWJahr ?? projekt.saisonjahr;
    if (!jahr) return null;
    const montag = getMontagDerKW(projekt.lieferKW, jahr);
    if (Number.isNaN(montag.getTime())) return null;
    return {
      // Der Montag steht stellvertretend für die Woche — die KW ist die Aussage,
      // nicht der Tag. Deshalb `geschaetzt`.
      //
      // formatISODatum statt toISOString(): Letzteres rechnet nach UTC um und
      // macht in unserer Zeitzone aus Montag 00:00 den Sonntag 22:00 — jeder
      // KW-Termin wäre einen Tag zu früh und in der Wochenansicht in der
      // falschen Woche gelandet.
      datum: formatISODatum(montag),
      kw: projekt.lieferKW,
      kwJahr: jahr,
      quelle: 'geschaetzt',
      verbindlich: false,
    };
  }

  return null;
}

/**
 * Kurztext für die Karte: „Di 09.04." bei einem Tagestermin, „KW 15" bei einer
 * reinen Wochenangabe. Die Herkunft steht bewusst daneben und nicht darin —
 * sonst liest sich eine Schätzung wie eine Zusage.
 */
export function formatiereTermin(termin: EffektiverTermin): string {
  if (termin.quelle === 'geschaetzt') return `KW ${termin.kw}`;
  const datum = parseISODatum(termin.datum);
  const wochentag = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][datum.getDay()];
  const tag = String(datum.getDate()).padStart(2, '0');
  const monat = String(datum.getMonth() + 1).padStart(2, '0');
  return `${wochentag} ${tag}.${monat}.`;
}

/** Schlüssel für die Gruppierung nach Woche, z. B. „2027-15". Sortierbar. */
export function wochenSchluessel(termin: EffektiverTermin): string {
  return `${termin.kwJahr}-${String(termin.kw).padStart(2, '0')}`;
}

/**
 * Ist der Termin verstrichen, ohne dass geliefert wurde?
 *
 * Bewusst nur für Projekte, die noch nicht geliefert oder abgerechnet sind — ein
 * Projekt, das letzte Woche geliefert wurde, ist nicht „überfällig".
 */
export function istUeberfaellig(projekt: Projekt, heute = new Date()): boolean {
  const erledigt: Projekt['status'][] = ['geliefert', 'rechnung', 'bezahlt', 'verloren'];
  if (erledigt.includes(projekt.status)) return false;
  const termin = lieferterminEffektiv(projekt);
  if (!termin) return false;
  // Bei einer reinen KW erst ab dem Ende der Woche überfällig — sonst stünde
  // jedes Projekt schon montags als überfällig da, obwohl die Woche läuft.
  const stichtag = parseISODatum(termin.datum);
  if (termin.quelle === 'geschaetzt') stichtag.setDate(stichtag.getDate() + 5);
  const heuteMitternacht = new Date(heute);
  heuteMitternacht.setHours(0, 0, 0, 0);
  return stichtag < heuteMitternacht;
}
