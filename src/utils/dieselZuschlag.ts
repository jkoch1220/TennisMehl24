/**
 * Dieselpreiszuschlag-Berechnung
 *
 * Berechnet den Dieselpreiszuschlag gemäß AGB §4:
 * - Zuschlag auf Schüttgut-Tonnen (TM-ZM-02, TM-ZM-03) sowie
 *   Palettenware/BigBag-Tonnen (TM-ZM-02St, TM-ZM-03St, TM-ZM-02BB, TM-ZM-03BB)
 * - Formel: Math.floor((tagesDieselPreis - basisPreis) / 0.05) * zuschlagProStufe €/t
 * - Zuschlag nur wenn tagesDieselPreis > basisPreis
 *
 * Ab dem Lieferjahr 2027 ist `zuschlagProStufe` nicht mehr konstant, sondern haengt von der
 * Entfernung Werk -> Abladestelle ab (siehe ENTFERNUNGS_STAFFEL_2027). Fachlicher Grund: der
 * Mehrverbrauch aus einem gestiegenen Dieselpreis faellt pro Tonne umso staerker ins Gewicht,
 * je weiter gefahren wird — ein Pauschalbetrag subventioniert die Fernlieferung zulasten der
 * Nahlieferung.
 *
 * WICHTIG — eine Quelle der Wahrheit: Der kundensichtbare Klauseltext auf Angebot/AB wird von
 * `getDieselKlauselText()` aus derselben Konfiguration erzeugt, aus der auch gerechnet wird.
 * Wer hier Werte aendert, aendert damit automatisch auch den Text auf dem Dokument. Zahlen
 * deshalb NICHT zusaetzlich irgendwo als Fliesstext hartkodieren.
 */

import { Position } from '../types/projektabwicklung';
import {
  istRabenDieselfloaterPosition,
  istRabenSpeditionArtikel,
} from './rabenDieselfloater';

// ==========================================
// KONFIGURATION - Zuschlagsstaffeln nach Jahr
// ==========================================

/**
 * Eine Entfernungsstufe der Zuschlagsstaffel.
 *
 * `bisKm` ist die Obergrenze EINSCHLIESSLICH (bis 50 km = 50,0 km zaehlt noch zur Stufe).
 * `bisKm: null` markiert die offene letzte Stufe ("darueber hinaus") und muss genau einmal,
 * als letzter Eintrag, vorkommen.
 */
export interface EntfernungsStufe {
  bisKm: number | null;      // Obergrenze einschliesslich, null = offen nach oben
  zuschlagProStufe: number;  // €/t je Dieselpreis-Stufe (stufenGroesse)
}

export interface DieselZuschlagConfig {
  basisPreis: number;        // €/L (aus AGB)
  zuschlagProStufe: number;  // €/t je Stufe — ohne Entfernungsstaffel bzw. wenn km unbekannt
  stufenGroesse: number;     // 0.05 €/L
  gueltigBis: string;        // Format: 'YYYY-12-31'
  /**
   * Ab 2027: entfernungsabhaengiger Betrag je Dieselpreis-Stufe. Fehlt das Feld, gilt
   * `zuschlagProStufe` pauschal (Rechtsstand bis einschliesslich 2026).
   */
  entfernungsStaffel?: EntfernungsStufe[];
}

/**
 * Entfernungsstaffel ab Lieferjahr 2027.
 *
 * Grundlage ist die Vorgabe der Geschaeftsfuehrung (Roni/Julian, 08/2026): 25-km-Schritte,
 * Startwert 0,45 €/t wie bisher, je Schritt +0,20 €/t. Die offene Stufe ist bewusst bei
 * 150 km gedeckelt — darueber laeuft die Ware praktisch immer per Spedition, die ihren
 * eigenen Floater berechnet (siehe rabenDieselfloater.ts).
 *
 * Die Werte stehen NUR hier. Klauseltext, PDF-Hinweis und Rechnungsposition leiten sich
 * daraus ab.
 */
export const ENTFERNUNGS_STAFFEL_2027: EntfernungsStufe[] = [
  { bisKm: 50, zuschlagProStufe: 0.45 },
  { bisKm: 75, zuschlagProStufe: 0.65 },
  { bisKm: 100, zuschlagProStufe: 0.85 },
  { bisKm: 125, zuschlagProStufe: 1.05 },
  { bisKm: 150, zuschlagProStufe: 1.25 },
  { bisKm: null, zuschlagProStufe: 1.45 },
];

/**
 * Zuschlagsstaffeln nach Angebotsgültigkeit/Jahr
 * Einfach erweiterbar für neue Jahre
 */
const DIESEL_STAFFELN: DieselZuschlagConfig[] = [
  {
    basisPreis: 1.699,        // €/L
    zuschlagProStufe: 0.45,   // €/t pro Stufe
    stufenGroesse: 0.05,      // €/L pro Stufe
    gueltigBis: '2025-12-31',
  },
  {
    basisPreis: 1.749,        // €/L
    zuschlagProStufe: 0.45,   // €/t pro Stufe
    stufenGroesse: 0.05,      // €/L pro Stufe
    gueltigBis: '2026-12-31',
  },
  {
    basisPreis: 1.749,        // €/L — vor Saisonstart 2027 pruefen
    zuschlagProStufe: 0.45,   // €/t — greift nur, wenn keine Entfernung ermittelbar ist
    stufenGroesse: 0.05,      // €/L pro Stufe
    gueltigBis: '2027-12-31',
    entfernungsStaffel: ENTFERNUNGS_STAFFEL_2027,
  },
  // Für 2028+ hier weitere Staffeln hinzufügen
];

// Fallback-Staffel wenn kein passendes Jahr gefunden wird (Leistungsdatum nach der letzten
// definierten Staffel). Erbt bewusst den Stand der juengsten Staffel inkl. Entfernungsstaffel,
// damit ein vergessener Jahreseintrag nicht still auf den alten Pauschalbetrag zurueckfaellt.
const FALLBACK_STAFFEL: DieselZuschlagConfig = {
  basisPreis: 1.749,
  zuschlagProStufe: 0.45,
  stufenGroesse: 0.05,
  gueltigBis: '9999-12-31',
  entfernungsStaffel: ENTFERNUNGS_STAFFEL_2027,
};

// ==========================================
// ZUSCHLAGSFÄHIGE ARTIKEL
// ==========================================

/**
 * Artikelnummern die für den Dieselzuschlag relevant sind
 * - Loses Schüttgut mit eigener Lieferung per LKW (TM-ZM-02, TM-ZM-03)
 * - Palettenware/Sackware per Spedition (TM-ZM-02St, TM-ZM-03St)
 * - BigBag per Spedition (TM-ZM-02BB, TM-ZM-03BB)
 * Alle Artikel werden in Tonnen abgerechnet, daher greift der €/t-Zuschlag einheitlich.
 *
 * ACHTUNG — bis 07/2026 stand hier das GENAUE GEGENTEIL: TM-ZM-02BB/03BB seien die
 * Stammnummern und TM-ZM-BIG-02/03 nur Legacy. Tatsaechlich fuehrt der Appwrite-
 * Artikelstamm ausschliesslich TM-ZM-BIG-02 und TM-ZM-BIG-03 (je 125,90 EUR/t);
 * TM-ZM-02BB/03BB hat es dort nie gegeben. Wer dem alten Kommentar folgt, loescht
 * die produktiv genutzte Nummer. Beide Schreibweisen bleiben deshalb gelistet:
 * BIG-* ist die gueltige, *BB steht in 22 archivierten Altpositionen.
 */
const ZUSCHLAGSFAEHIGE_ARTIKEL = [
  'TM-ZM-02',
  'TM-ZM-03',
  'TM-ZM-02St',
  'TM-ZM-03St',
  // Gueltige BigBag-Nummern (Artikelstamm)
  'TM-ZM-BIG-02',
  'TM-ZM-BIG-03',
  // Altdaten aus Angeboten vor 07/2026 — nicht entfernen, sonst verlieren diese
  // Positionen rueckwirkend ihren Dieselzuschlag.
  'TM-ZM-02BB',
  'TM-ZM-03BB',
];

/**
 * Artikelnummer für die Diesel-Zuschlagsposition
 */
export const DIESEL_ZUSCHLAG_ARTIKELNUMMER = 'TM-DZ';

// ==========================================
// INTERFACES
// ==========================================

export interface DieselZuschlagErgebnis {
  zuschlagProTonne: number;   // Berechneter Zuschlag €/t (3 Dezimalstellen)
  tagesDieselPreis: number;   // Abgerufener/eingegebener Dieselpreis €/L
  basisPreis: number;         // Verwendeter Basispreis €/L
  stufen: number;             // Anzahl Zuschlagsstufen
  gesamtTonnen: number;       // Summe zuschlagsfähiger Tonnen
  gesamtZuschlag: number;     // zuschlagProTonne * gesamtTonnen (2 Dezimalstellen)
  hatZuschlag: boolean;       // true wenn Zuschlag > 0
  config: DieselZuschlagConfig;
  // === Entfernungsstaffel (ab 2027) ===
  /** Zugrunde gelegte Entfernung Werk -> Abladestelle in km, undefined wenn unbekannt */
  entfernungKm?: number;
  /** Tatsaechlich angewandter Betrag €/t je Dieselpreis-Stufe */
  zuschlagProStufe: number;
  /** true, wenn die Staffel greift, aber keine Entfernung vorlag (unterste Stufe angewandt) */
  entfernungUnbekannt: boolean;
  /** Klartext der angewandten Stufe, z.B. "51–75 km" — leer, wenn keine Staffel gilt */
  staffelBezeichnung: string;
}

export type DieselPreisStatus =
  | 'geladen'           // Aktueller Preis von API geladen
  | 'cache'             // Preis aus Cache
  | 'fallback'          // Fallback-Preis verwendet (API nicht erreichbar)
  | 'manuell'           // Manuell eingegebener Preis
  | 'historisch'        // Historisches Datum (>2 Tage) - manuell eingeben
  | 'zukunft';          // Zukünftiges Datum - aktueller Preis als Schätzung

// ==========================================
// KERNFUNKTIONEN
// ==========================================

/**
 * Bestimmt anhand des Leistungsdatums welcher Basispreis gilt
 *
 * @param leistungsdatum - ISO-Datumsstring (YYYY-MM-DD)
 * @returns Die passende Zuschlagskonfiguration
 */
export function getBasisPreisConfig(leistungsdatum: string): DieselZuschlagConfig {
  if (!leistungsdatum) {
    return FALLBACK_STAFFEL;
  }

  // Finde die passende Staffel basierend auf dem Leistungsdatum
  for (const staffel of DIESEL_STAFFELN) {
    if (leistungsdatum <= staffel.gueltigBis) {
      return staffel;
    }
  }

  // Fallback wenn Datum nach allen definierten Staffeln liegt
  return FALLBACK_STAFFEL;
}

// ==========================================
// ENTFERNUNGSSTAFFEL
// ==========================================

/**
 * Sucht die Entfernungsstufe, die für eine Entfernung gilt.
 *
 * @param config - Zuschlagskonfiguration
 * @param entfernungKm - Entfernung Werk -> Abladestelle (einfache Strecke), undefined = unbekannt
 * @returns Die passende Stufe, oder null wenn die Config keine Entfernungsstaffel hat
 */
export function getEntfernungsStufe(
  config: DieselZuschlagConfig,
  entfernungKm?: number
): EntfernungsStufe | null {
  const staffel = config.entfernungsStaffel;
  if (!staffel || staffel.length === 0) return null;

  // Ohne belastbare Entfernung gilt die unterste Stufe. Bewusst konservativ: der Kunde hat
  // im Angebot eine nach Entfernung gestaffelte Klausel akzeptiert — im Zweifel darf daraus
  // kein hoeherer als der guenstigste Satz werden. Der Aufrufer sieht `entfernungUnbekannt`
  // und kann in der UI zur Eingabe auffordern.
  if (entfernungKm === undefined || entfernungKm === null || !Number.isFinite(entfernungKm) || entfernungKm < 0) {
    return staffel[0];
  }

  for (const stufe of staffel) {
    if (stufe.bisKm === null || entfernungKm <= stufe.bisKm) {
      return stufe;
    }
  }

  // Kein offener Abschluss definiert -> letzte Stufe
  return staffel[staffel.length - 1];
}

/**
 * Ermittelt den anzuwendenden Betrag €/t je Dieselpreis-Stufe.
 * Ohne Entfernungsstaffel ist das schlicht `config.zuschlagProStufe`.
 */
export function getZuschlagProStufe(
  config: DieselZuschlagConfig,
  entfernungKm?: number
): number {
  const stufe = getEntfernungsStufe(config, entfernungKm);
  return stufe ? stufe.zuschlagProStufe : config.zuschlagProStufe;
}

/**
 * Beschriftung einer Entfernungsstufe für Anzeige und Dokumente.
 *
 * Bewusst "über 50 bis 75 km" statt "50–75 km": die Grenze selbst gehört zur unteren Stufe
 * (bisKm ist einschliesslich). Eine Schreibweise "50–75" liesse bei exakt 50,0 km offen,
 * welcher Satz gilt — auf einem Preisblatt ist das ein Streitpunkt, den niemand braucht.
 */
export function formatEntfernungsStufe(
  stufe: EntfernungsStufe,
  vorherigeObergrenze: number | null
): string {
  const von = vorherigeObergrenze === null ? 0 : vorherigeObergrenze;
  if (stufe.bisKm === null) {
    return `über ${formatKm(von)} km`;
  }
  if (von === 0) {
    return `bis ${formatKm(stufe.bisKm)} km`;
  }
  return `über ${formatKm(von)} bis ${formatKm(stufe.bisKm)} km`;
}

/** Ganzzahlige km ohne Nachkommastelle, sonst mit einer. */
function formatKm(km: number): string {
  return Number.isInteger(km) ? String(km) : km.toFixed(1).replace('.', ',');
}

/**
 * Anzahl der vollen Dieselpreis-Stufen über dem Basispreis.
 *
 * Rechnet in Zehntelcent (ganze Zahlen) statt in Euro-Gleitkommazahlen. Direkt formuliert
 * — `Math.floor((dieselPreis - basisPreis) / stufenGroesse)` — verschluckt der Ausdruck bei
 * exakt getroffener Grenze eine ganze Stufe: 1,899 − 1,749 ergibt in IEEE-754
 * 0,1499999999999999, geteilt durch 0,05 also 2,9999… und abgerundet 2 statt 3. Genau die
 * Preise mit drei Nachkommastellen, die von der Tankstellen-API kommen, treffen diese Grenzen
 * regelmäßig. Ab 2027 wird der Fehler mit dem Entfernungssatz multipliziert.
 */
export function berechneStufen(dieselPreis: number, config: DieselZuschlagConfig): number {
  if (dieselPreis <= config.basisPreis) return 0;

  const differenzZehntelCent = Math.round((dieselPreis - config.basisPreis) * 1000);
  const stufenGroesseZehntelCent = Math.round(config.stufenGroesse * 1000);
  if (stufenGroesseZehntelCent <= 0) return 0;

  return Math.floor(differenzZehntelCent / stufenGroesseZehntelCent);
}

/**
 * Berechnet den Zuschlag pro Tonne basierend auf aktuellem Dieselpreis
 *
 * @param dieselPreis - Aktueller Dieselpreis in €/L
 * @param config - Zuschlagskonfiguration
 * @param entfernungKm - Entfernung Werk -> Abladestelle (nur relevant ab Staffel 2027)
 * @returns Zuschlag in €/t (3 Dezimalstellen)
 */
export function berechneZuschlagProTonne(
  dieselPreis: number,
  config: DieselZuschlagConfig,
  entfernungKm?: number
): number {
  // Kein Zuschlag wenn Dieselpreis unter oder gleich Basispreis
  if (dieselPreis <= config.basisPreis) {
    return 0;
  }

  // Betrag je Stufe — ab 2027 entfernungsabhaengig
  const zuschlag = berechneStufen(dieselPreis, config) * getZuschlagProStufe(config, entfernungKm);

  // Auf 3 Dezimalstellen runden (cent-genau bei Multiplikation)
  return Math.round(zuschlag * 1000) / 1000;
}

/**
 * Prüft ob eine Position für den Dieselzuschlag relevant ist
 *
 * @param position - Die zu prüfende Position
 * @returns true wenn die Position zuschlagsfähig ist
 */
export function istZuschlagsfaehig(position: Position): boolean {
  // Nur wenn Artikelnummer in der Liste der zuschlagsfähigen Artikel
  if (!position.artikelnummer) return false;

  // Nur Tonnen-Positionen (loses Schüttgut)
  if (position.einheit !== 't') return false;

  // Vergleich ohne Rücksicht auf Groß-/Kleinschreibung: die Nummer wird an mehreren
  // Stellen von Hand eingetippt, und ein „St" vs. „ST" darf keinen Zuschlag kosten.
  const nr = position.artikelnummer.trim().toUpperCase();
  return ZUSCHLAGSFAEHIGE_ARTIKEL.some((a) => a.toUpperCase() === nr);
}

/**
 * Prüft ob eine Position die Dieselzuschlag-Position ist
 */
export function istDieselZuschlagPosition(position: Position): boolean {
  return position.artikelnummer === DIESEL_ZUSCHLAG_ARTIKELNUMMER;
}

/**
 * Berechnet den Gesamtzuschlag für alle Positionen
 *
 * @param positionen - Alle Rechnungspositionen
 * @param dieselPreis - Aktueller Dieselpreis in €/L
 * @param leistungsdatum - Leistungsdatum für Staffelbestimmung
 * @param entfernungKm - Entfernung Werk -> Abladestelle in km (einfache Strecke).
 *                       Ab Staffel 2027 preisrelevant; davor ohne Wirkung.
 * @returns Detailliertes Ergebnis der Zuschlagsberechnung
 */
export function berechneGesamtZuschlag(
  positionen: Position[],
  dieselPreis: number,
  leistungsdatum: string,
  entfernungKm?: number
): DieselZuschlagErgebnis {
  // Konfiguration basierend auf Leistungsdatum
  const config = getBasisPreisConfig(leistungsdatum);

  // Zuschlag pro Tonne berechnen
  const zuschlagProTonne = berechneZuschlagProTonne(dieselPreis, config, entfernungKm);

  // Stufen berechnen (dieselbe Quelle wie berechneZuschlagProTonne — nicht neu herleiten)
  const stufen = berechneStufen(dieselPreis, config);

  // Palettenware/BigBag werden vom Raben-Dieselfloater (TM-DZ-R) abgedeckt, sobald
  // eine solche Position im Dokument existiert. Doppelberechnung vermeiden.
  const hatRabenFloater = positionen.some(istRabenDieselfloaterPosition);

  // Summe der zuschlagsfähigen Tonnen (ohne bestehende TM-DZ Position!)
  const gesamtTonnen = positionen
    .filter(p => !istDieselZuschlagPosition(p)) // Bestehende Zuschlagsposition ignorieren
    .filter(p => !(hatRabenFloater && istRabenSpeditionArtikel(p)))
    .filter(istZuschlagsfaehig)
    .reduce((sum, p) => sum + (p.menge || 0), 0);

  // Gesamtzuschlag berechnen (auf 2 Dezimalstellen runden)
  const gesamtZuschlag = Math.round(zuschlagProTonne * gesamtTonnen * 100) / 100;

  // Angewandte Entfernungsstufe fuer Anzeige und Belegtext festhalten
  const staffel = config.entfernungsStaffel;
  const angewandteStufe = getEntfernungsStufe(config, entfernungKm);
  const kmBekannt = entfernungKm !== undefined && entfernungKm !== null && Number.isFinite(entfernungKm) && entfernungKm >= 0;
  let staffelBezeichnung = '';
  if (staffel && angewandteStufe) {
    const index = staffel.indexOf(angewandteStufe);
    const vorherige = index > 0 ? staffel[index - 1].bisKm : null;
    staffelBezeichnung = formatEntfernungsStufe(angewandteStufe, vorherige);
  }

  return {
    zuschlagProTonne,
    tagesDieselPreis: dieselPreis,
    basisPreis: config.basisPreis,
    stufen,
    gesamtTonnen,
    gesamtZuschlag,
    hatZuschlag: gesamtZuschlag > 0,
    config,
    entfernungKm: kmBekannt ? entfernungKm : undefined,
    zuschlagProStufe: getZuschlagProStufe(config, entfernungKm),
    entfernungUnbekannt: Boolean(staffel) && !kmBekannt,
    staffelBezeichnung,
  };
}

/**
 * Erstellt eine Dieselzuschlag-Position für die Rechnung
 *
 * @param ergebnis - Das Berechnungsergebnis
 * @returns Position-Objekt für die Rechnung
 */
export function erstelleDieselZuschlagPosition(
  ergebnis: DieselZuschlagErgebnis
): Position {
  // Entfernungsstaffel im Belegtext nachvollziehbar machen: der Kunde muss den Betrag aus der
  // Klausel nachrechnen koennen, ohne nachzufragen. Nur ausweisen, wenn eine Staffel gilt.
  const staffelDetail = ergebnis.config.entfernungsStaffel
    ? ergebnis.entfernungKm !== undefined
      ? `, Entfernung: ${formatKm(Math.round(ergebnis.entfernungKm))} km → ${ergebnis.staffelBezeichnung}: ${ergebnis.zuschlagProStufe.toFixed(2).replace('.', ',')} €/t je Stufe`
      : `, Entfernung nicht hinterlegt → Grundstaffel ${ergebnis.staffelBezeichnung}: ${ergebnis.zuschlagProStufe.toFixed(2).replace('.', ',')} €/t je Stufe`
    : '';

  // Beschreibung mit Berechnungsdetails
  const beschreibung = ergebnis.hatZuschlag
    ? `${ergebnis.gesamtTonnen.toFixed(2)} t × ${ergebnis.zuschlagProTonne.toFixed(2)} €/t (Basis: ${ergebnis.basisPreis.toFixed(3)} €/L, Aktuell: ${ergebnis.tagesDieselPreis.toFixed(3)} €/L, ${ergebnis.stufen} Stufe(n)${staffelDetail})`
    : `Kein Zuschlag - Dieselpreis (${ergebnis.tagesDieselPreis.toFixed(3)} €/L) unter Basis (${ergebnis.basisPreis.toFixed(3)} €/L)`;

  return {
    id: 'diesel-zuschlag',
    artikelnummer: DIESEL_ZUSCHLAG_ARTIKELNUMMER,
    bezeichnung: 'Dieselpreiszuschlag',
    beschreibung,
    menge: 1,
    einheit: 'psch',
    einzelpreis: ergebnis.gesamtZuschlag, // Gesamtbetrag als Pauschale
    gesamtpreis: ergebnis.gesamtZuschlag,
    istBedarfsposition: false,
    ohneMwSt: false,
  };
}

/**
 * Bestimmt den Status des Dieselpreises basierend auf dem Datum
 *
 * @param leistungsdatum - ISO-Datumsstring
 * @returns Status des Dieselpreises
 */
export function getDieselPreisStatus(leistungsdatum: string): 'aktuell' | 'historisch' | 'zukunft' {
  if (!leistungsdatum) return 'aktuell';

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  const leistung = new Date(leistungsdatum);
  leistung.setHours(0, 0, 0, 0);

  const diffTage = Math.floor((leistung.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));

  if (diffTage < -2) {
    return 'historisch'; // Mehr als 2 Tage in der Vergangenheit
  } else if (diffTage > 0) {
    return 'zukunft'; // In der Zukunft
  }

  return 'aktuell'; // Heute oder gestern
}

// ==========================================
// KUNDENSICHTBARE TEXTE
// ==========================================

/**
 * Erzeugt die Staffeltabelle als Fliesstext, z.B.
 * "bis 50 km: 0,45 €/t; 51–75 km: 0,65 €/t; …; über 150 km: 1,45 €/t"
 */
export function formatEntfernungsStaffel(staffel: EntfernungsStufe[]): string {
  return staffel
    .map((stufe, i) => {
      const vorherige = i > 0 ? staffel[i - 1].bisKm : null;
      const betrag = stufe.zuschlagProStufe.toFixed(2).replace('.', ',');
      return `${formatEntfernungsStufe(stufe, vorherige)}: ${betrag} € je Tonne`;
    })
    .join('; ');
}

/**
 * Der Dieselpreiszuschlag-Hinweis für Angebot und Auftragsbestätigung.
 *
 * Wird aus der geltenden Zuschlagskonfiguration erzeugt, damit der Text auf dem Dokument
 * nicht von der tatsaechlichen Berechnung abweichen kann. Das Datum bestimmt, welche
 * Staffel gilt — massgeblich ist dasselbe Datum wie bei der Berechnung (Leistungsdatum
 * bzw. bei Angeboten das Ende der Angebotsgueltigkeit).
 *
 * @param datum - ISO-Datum (YYYY-MM-DD)
 */
export function getDieselKlauselText(datum: string): string {
  const config = getBasisPreisConfig(datum);
  const basis = config.basisPreis.toFixed(3).replace('.', ',');
  const stufe = config.stufenGroesse.toFixed(2).replace('.', ',');

  if (!config.entfernungsStaffel) {
    const betrag = config.zuschlagProStufe.toFixed(2).replace('.', ',');
    return (
      `Die angebotenen Preise beinhalten einen Dieselpreis von bis zu ${basis} €/Liter. ` +
      `Bei Steigerungen je ${stufe} € über unserem kalkulierten Basis-Dieselpreis erhöht sich ` +
      `der Preis des gelieferten Ziegelmehls um ${betrag} € je Tonne.`
    );
  }

  return (
    `Die angebotenen Preise beinhalten einen Dieselpreis von bis zu ${basis} €/Liter. ` +
    `Bei Steigerungen je ${stufe} € über unserem kalkulierten Basis-Dieselpreis erhöht sich ` +
    `der Preis des gelieferten Ziegelmehls gestaffelt nach der Entfernung zwischen unserem ` +
    `Versandwerk und der Abladestelle (einfache Strecke): ${formatEntfernungsStaffel(config.entfernungsStaffel)}. ` +
    `Maßgeblich ist die Entfernung zur vereinbarten Abladestelle.`
  );
}

/**
 * Historische, fest verdrahtete Klauseltexte aus der Zeit vor dem Text-Generator.
 * Nur fuer die Erkennung "unveraendert" gedacht — nicht mehr ausgeben.
 */
const ALTE_STANDARD_KLAUSELTEXTE = [
  'Die angebotenen Preise beinhalten einen Dieselpreis von bis zu 1,749 €. ' +
    'Bei Steigerungen je 0,05 € über unserem kalkulierten Basis-Dieselpreis erhöht sich der Preis ' +
    'des gelieferten Ziegelmehls um 0,45 € je Tonne.',
  'Die angebotenen Preise beinhalten einen Dieselpreis von bis zu 1,699 €. ' +
    'Bei Steigerungen je 0,05 € über unserem kalkulierten Basis-Dieselpreis erhöht sich der Preis ' +
    'des gelieferten Ziegelmehls um 0,45 € je Tonne.',
];

/**
 * Prüft, ob ein Klauseltext noch einer unveränderten Vorlage entspricht.
 *
 * Zweck: Verschiebt der Innendienst die Angebotsgültigkeit ins Folgejahr, soll der Hinweis
 * automatisch auf die dann geltende Staffel wechseln — aber niemals einen von Hand
 * formulierten Text überschreiben. Nur wenn diese Funktion true liefert, darf nachgezogen
 * werden.
 */
export function istStandardDieselKlauselText(text: string | undefined | null): boolean {
  if (!text || text.trim().length === 0) return true;
  const normalisiert = text.replace(/\s+/g, ' ').trim();

  if (ALTE_STANDARD_KLAUSELTEXTE.some((t) => t.replace(/\s+/g, ' ').trim() === normalisiert)) {
    return true;
  }

  // Gegen die generierten Texte aller definierten Staffeln pruefen
  return [...DIESEL_STAFFELN, FALLBACK_STAFFEL].some((config) => {
    const referenz = getDieselKlauselText(
      config.gueltigBis === '9999-12-31' ? '9999-01-01' : config.gueltigBis
    );
    return referenz.replace(/\s+/g, ' ').trim() === normalisiert;
  });
}

/**
 * Formatiert den Dieselpreis für die Anzeige
 */
export function formatDieselPreis(preis: number): string {
  return preis.toFixed(3).replace('.', ',') + ' €/L';
}

/**
 * Formatiert den Zuschlag pro Tonne für die Anzeige
 */
export function formatZuschlagProTonne(zuschlag: number): string {
  return zuschlag.toFixed(2).replace('.', ',') + ' €/t';
}

/**
 * Formatiert den Gesamtzuschlag für die Anzeige
 */
export function formatGesamtZuschlag(zuschlag: number): string {
  return zuschlag.toFixed(2).replace('.', ',') + ' €';
}

/**
 * Steht die Zuschlagsposition schon genau so im Beleg?
 *
 * Das ist der Ersatz für den früheren Schleifenschutz, der über Refs prüfte, ob
 * sich Dieselpreis, Leistungsdatum oder Entfernung geändert hatten. Der Ansatz
 * verglich den AUSLÖSER statt des ERGEBNISSES — eine reine Mengenänderung fiel
 * dadurch hindurch. Der Betrag im Hinweisbanner stimmte, die Positionszeile
 * blieb auf dem alten Stand, und genau die ging an den Kunden (Vorschlag [37]).
 *
 * Der Wertevergleich kann nicht endlos schleifen: `berechneGesamtZuschlag`
 * filtert die Zuschlagsposition selbst aus der Tonnage heraus. Das Ergebnis
 * hängt also nicht von der Position ab, die es erzeugt — nach einem Durchlauf
 * steht der Wert fest und der Vergleich greift.
 *
 * Ein Cent Toleranz, weil der Betrag durch Rundung auf zwei Stellen läuft und
 * ein Fließkomma-Vergleich auf Gleichheit sonst ständig „ungleich" meldet.
 */
export function zuschlagPositionIstAktuell(
  vorhanden: Position | undefined,
  soll: Position
): boolean {
  if (!vorhanden) return false;
  return (
    Math.abs((vorhanden.gesamtpreis ?? 0) - (soll.gesamtpreis ?? 0)) < 0.005 &&
    Math.abs((vorhanden.einzelpreis ?? 0) - (soll.einzelpreis ?? 0)) < 0.005 &&
    vorhanden.beschreibung === soll.beschreibung
  );
}
