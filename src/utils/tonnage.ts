/**
 * DIE eine Tonnage-Wahrheit (Stufe 2 Artikelverwaltung, 08/2026).
 *
 * Vorher existierten mindestens sieben verstreute Zähllogiken — von
 * `einheit === 't'` über Blocklisten bis zu `einheit.includes('t')`, das auch
 * „Stk", „Std" und „Pkt" als Tonnen zählte. Jede Ansicht kam so auf andere
 * Zahlen. Ab jetzt beantwortet dieses Modul die Frage „wie viele Tonnen Ware
 * stecken in diesen Positionen?" — und zwar für genau zwei, bewusst getrennte
 * Zwecke:
 *
 * 'fracht'      Grundlage der Frachtkostenstaffel (5,4/7,4/11,4/15,4/19,9 t).
 *               Zählt ausschließlich Ware in Tonnen-Einheiten — exakt die
 *               Semantik, die `angebotsTonnage.ts` seit 08/2026 etabliert hat.
 *               Beiladungssäcke (Stk) zählen hier NICHT: sie haben nie Fracht
 *               ausgelöst, und jede Änderung daran wäre eine Preisänderung,
 *               die Julian entscheiden muss.
 *
 * 'auswertung'  Saison-/Dashboard-Tonnage: alle verkaufte Ware, auch Sackware
 *               in Stück (über gewichtProStueckKg → Tonnen) und kg-Positionen.
 *               Pauschalen und Dienstleistungen zählen nie — auch wenn sie in
 *               „t" fakturiert sind (TM-HYC-V, TM-LKW-KR).
 *
 * Ob eine Position Ware ist, entscheidet der Artikelstamm
 * (`istTonnageRelevant`), wenn ein ArtikelIndex übergeben wird. Ohne Index —
 * oder für Positionen, deren Artikel im Stamm (noch) nicht existiert — greift
 * der Code-Fallback: TENNISMEHL_ARTIKEL, die NICHT_MATERIAL-Blockliste und
 * die Einheiten-Heuristik. Fallback und Stammfelder liefern für den Bestand
 * vom 08/2026 identische Ergebnisse (per Test abgesichert).
 */
import { Artikel } from '../types/artikel';
import { TENNISMEHL_ARTIKEL } from '../constants/artikelPreise';

/**
 * Positionen, die zwar in Tonnen fakturiert werden, aber keine Ware sind:
 * Pauschalen, Zuschläge, Dienstleistungen.
 *
 * Nur exakte Artikelnummern, bewusst keine Textsuche: „Tennismehl 0/2 Schüttgut
 * inkl. Frachtkosten" enthält das Wort Frachtkosten und ist trotzdem 8 t Ware.
 *
 * Neue Zuschlags-Artikel werden NICHT mehr hier eingetragen, sondern in der
 * Artikelverwaltung mit istTonnageRelevant=false angelegt — diese Liste ist
 * nur noch Fallback für Positionen ohne Stamm-Treffer.
 */
export const NICHT_MATERIAL_ARTIKEL = new Set([
  'TM-PE',      // PE-Folie
  'TM-FP',      // Frachtkostenpauschale
  'TM-HYC-V',   // Hydrocourt Versand Standard Pauschal
  'TM-LKW-KR',  // Entladung Sackware mit LKW-Ladekran (Dienstleistung)
  'TM-SK',      // Zuschlag Sonderkommissionierung
]);

/**
 * Altnummern aus versandten Belegen → heutige Stammnummern.
 *
 * GoBD: die Belege selbst bleiben unangetastet — gemappt wird ausschließlich
 * beim Lesen. TM-ZM-02BB/03BB stammen aus der BigBag-Fehlverkabelung von
 * 07/2026; die Nummern existierten nie im Artikelstamm.
 */
export const ARTIKELNUMMER_ALIASSE: Record<string, string> = {
  'TM-ZM-02BB': 'TM-ZM-BIG-02',
  'TM-ZM-03BB': 'TM-ZM-BIG-03',
  // Gambio-Shop-Artikelnummern → Stammartikel (Shop-Bestellungen tragen die
  // Shop-Nummern in den Positionen). 99992/99993 sind Paletten (shop_produkte
  // führt gewichtKg 1000, 1 Shop-Stück = 1 Palette), 99991 ist Hydrocourt.
  '99991': 'TM-HYC',
  '99992': 'TM-ZM-02ST',
  '99993': 'TM-ZM-03ST',
  'TS-001': 'TM-ZM-02',
};

/** Trimmt, normalisiert auf Großschreibung und löst Altnummern-Aliasse auf. */
export function normalisiereArtikelnummer(roh: string | undefined | null): string {
  const nummer = (roh || '').trim().toUpperCase();
  return ARTIKELNUMMER_ALIASSE[nummer] ?? nummer;
}

/**
 * Nachschlage-Index über den Artikelstamm. Einmal pro Ladung bauen
 * (`erstelleArtikelIndex(await getAlleArtikel())`) und an die
 * Tonnage-Funktionen durchreichen.
 */
export interface ArtikelIndex {
  byId: Map<string, Artikel>;
  /** Schlüssel: normalisierte Artikelnummer (Großschreibung, Aliasse aufgelöst). */
  byNummer: Map<string, Artikel>;
}

export function erstelleArtikelIndex(artikel: Artikel[]): ArtikelIndex {
  const byId = new Map<string, Artikel>();
  const byNummer = new Map<string, Artikel>();
  for (const a of artikel) {
    if (a.$id) byId.set(a.$id, a);
    const nummer = normalisiereArtikelnummer(a.artikelnummer);
    // Kein Eintrag unter '' — sonst matcht jede Freitext-Position ohne
    // Artikelnummer auf diesen einen Artikel und erbt dessen Klassifizierung.
    if (nummer) byNummer.set(nummer, a);
  }
  return { byId, byNummer };
}

/**
 * Minimale Positions-Sicht, die die Tonnage-Rechnung braucht. `artikelId`
 * existiert erst ab Stufe 4 an neuen Positionen — alte Positionen werden über
 * die Artikelnummer aufgelöst.
 */
export interface TonnagePosition {
  artikelId?: string;
  artikelnummer?: string;
  einheit?: string;
  menge?: number;
  /** Für die Gebinde-Erkennung bei Stk-Altpositionen (siehe GEBINDE_PREISGRENZE). */
  einzelpreis?: number;
  istBedarfsposition?: boolean;
}

/**
 * Sack oder Palette? Die Artikelnummern S/St wurden historisch gemischt
 * verwendet: unter TM-ZM-02S stehen echte 40-kg-Säcke (à 5,90–8,50 €) UND
 * ganze Paletten (à 145–365 €, Bezeichnung „25x40kg"); unter TM-ZM-02ST
 * auch einzelne Säcke à 8,50 €. Der Preis trennt die Fälle eindeutig —
 * zwischen 8,50 € (Sack) und 145 € (Palette) liegt nichts.
 */
const GEBINDE_PREISGRENZE_EURO = 50;
const GEBINDE_FAMILIE = /^TM-ZM-(0[23]ST?|BIG-0[23])$/;

export type TonnageZweck = 'fracht' | 'auswertung';

/**
 * 'fracht' akzeptiert exakt die Einheiten der alten Staffel-Logik (t/to) —
 * jede Erweiterung würde die Frachtpauschale bestehender Belege verschieben.
 * 'auswertung' ist großzügiger und nimmt auch ausgeschriebene Varianten mit.
 */
const TONNEN_EINHEITEN_FRACHT = new Set(['t', 'to']);
const TONNEN_EINHEITEN_AUSWERTUNG = new Set(['t', 'to', 'tonnen', 'tonne']);

const tonnenEinheiten = (zweck: TonnageZweck): Set<string> =>
  zweck === 'fracht' ? TONNEN_EINHEITEN_FRACHT : TONNEN_EINHEITEN_AUSWERTUNG;

/** Löst den Stammartikel einer Position auf (artikelId vor Artikelnummer). */
export function findeArtikelZurPosition(
  position: TonnagePosition,
  index?: ArtikelIndex
): Artikel | undefined {
  if (!index) return undefined;
  if (position.artikelId) {
    const treffer = index.byId.get(position.artikelId);
    if (treffer) return treffer;
  }
  const nummer = normalisiereArtikelnummer(position.artikelnummer);
  return nummer ? index.byNummer.get(nummer) : undefined;
}

/** Ist diese Position Ware, die in die Tonnage zählt (unabhängig von der Einheit)? */
function istWare(position: TonnagePosition, index?: ArtikelIndex): boolean {
  if (position.istBedarfsposition) return false;

  const artikel = findeArtikelZurPosition(position, index);
  if (artikel && artikel.istTonnageRelevant !== null && artikel.istTonnageRelevant !== undefined) {
    return artikel.istTonnageRelevant;
  }

  // Code-Fallback für Positionen ohne Stamm-Treffer
  const nummer = normalisiereArtikelnummer(position.artikelnummer);
  if (NICHT_MATERIAL_ARTIKEL.has(nummer)) return false;
  if (nummer.startsWith('TM-ZM-')) return true;

  // Unbekannter Artikel: die Einheit entscheidet (historische Heuristik).
  // Bewusst die Auswertungs-Menge — für 'fracht' filtert danach ohnehin
  // die strengere Einheiten-Prüfung in istTonnageRelevantePosition.
  return TONNEN_EINHEITEN_AUSWERTUNG.has((position.einheit || '').toLowerCase());
}

/** Gewicht pro Stück in kg — aus dem Stamm, sonst aus der Code-Konstante. */
function gewichtProStueckKg(position: TonnagePosition, index?: ArtikelIndex): number | undefined {
  // Gebinde-Familie mit bekanntem Preis: der Preis entscheidet Sack vs.
  // Palette/BigBag — die Artikelnummer allein ist bei Altpositionen nicht
  // verlässlich (siehe GEBINDE_PREISGRENZE_EURO).
  const nummer = normalisiereArtikelnummer(position.artikelnummer);
  if (GEBINDE_FAMILIE.test(nummer) && position.einzelpreis != null && position.einzelpreis > 0) {
    return Math.abs(position.einzelpreis) >= GEBINDE_PREISGRENZE_EURO ? 1000 : 40;
  }

  const artikel = findeArtikelZurPosition(position, index);
  if (artikel?.gewichtProStueckKg) return artikel.gewichtProStueckKg;
  const def = TENNISMEHL_ARTIKEL[nummer]
    ?? Object.values(TENNISMEHL_ARTIKEL).find(
      (d) => d.artikelnummer.toUpperCase() === nummer
    );
  return def?.gewichtProStueckKg;
}

/** Zählt diese Position für den gegebenen Zweck in die Tonnage? */
export function istTonnageRelevantePosition(
  position: TonnagePosition,
  zweck: TonnageZweck,
  index?: ArtikelIndex
): boolean {
  if (!istWare(position, index)) return false;

  const einheit = (position.einheit || '').toLowerCase();
  if (tonnenEinheiten(zweck).has(einheit)) return true;

  if (zweck === 'auswertung') {
    if (einheit === 'kg') return true;
    // Stück-Ware (Beiladungssäcke, künftige Gebinde) nur mit bekanntem Gewicht
    return gewichtProStueckKg(position, index) !== undefined;
  }

  return false;
}

/** Tonnen dieser Position für den gegebenen Zweck (0, wenn sie nicht zählt). */
export function berechnePositionsTonnen(
  position: TonnagePosition,
  zweck: TonnageZweck,
  index?: ArtikelIndex
): number {
  if (!istTonnageRelevantePosition(position, zweck, index)) return 0;

  const menge = position.menge || 0;
  const einheit = (position.einheit || '').toLowerCase();

  if (tonnenEinheiten(zweck).has(einheit)) return menge;
  if (einheit === 'kg') return menge / 1000;

  const gewicht = gewichtProStueckKg(position, index);
  return gewicht ? (menge * gewicht) / 1000 : 0;
}

/** Summe über beliebig viele Positionslisten. */
export function summierePositionsTonnen(
  positionen: TonnagePosition[] | undefined,
  zweck: TonnageZweck,
  index?: ArtikelIndex
): number {
  return (positionen || []).reduce(
    (summe, position) => summe + berechnePositionsTonnen(position, zweck, index),
    0
  );
}
