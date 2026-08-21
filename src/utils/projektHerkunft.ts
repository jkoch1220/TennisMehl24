import { Projekt } from '../types/projekt';
import { istPlatzbauProjekt } from './platzbauerAnzeige';

/**
 * Woher ein Projekt stammt — Grundlage für die Farbmarkierung im Kanban.
 * `null` = normales, von Hand angelegtes Projekt.
 */
export type ProjektHerkunftKanal = 'platzbau' | 'shop' | 'anfrage';

/**
 * Stammt das Projekt aus einer Shop-Bestellung?
 *
 * Vor dem `herkunft`-Marker gab es kein Feld dafür, deshalb zusätzlich die
 * String-Muster, die `shopBestellungService.erstelleProjektAusBestellung` setzt
 * (kundeId `shop-…`, AB-Nummer `SHOP-…`, Projektname `Shop #…`). Gleiche Logik
 * wie in debitorService.
 */
export function istShopProjekt(projekt: Projekt): boolean {
  // Ist die Spalte gepflegt, ist sie die Wahrheit — auch ihr NEIN. Sonst würde
  // ein umbenanntes Projekt („Shop #171 → TC Musterstadt") stillschweigend den
  // Kanal wechseln, sobald die Muster wieder greifen.
  if (projekt.herkunft) return projekt.herkunft === 'shop';

  return (
    (typeof projekt.kundeId === 'string' && projekt.kundeId.startsWith('shop-')) ||
    (typeof projekt.auftragsbestaetigungsnummer === 'string' &&
      projekt.auftragsbestaetigungsnummer.startsWith('SHOP-')) ||
    (typeof projekt.projektName === 'string' && projekt.projektName.startsWith('Shop #'))
  );
}

/**
 * Bestellnummer aus einem Shop-Projekt, für Tooltips.
 * Quelle ist die AB-Nummer `SHOP-<nr>-U|-E` bzw. der Projektname `Shop #<nr>`.
 */
export function getShopBestellnummer(projekt: Projekt): string | undefined {
  if (projekt.shopBestellnummer) return projekt.shopBestellnummer;

  const ausAbNummer = projekt.auftragsbestaetigungsnummer?.match(/^SHOP-(.+?)(?:-[UE])?$/);
  if (ausAbNummer) return ausAbNummer[1];

  const ausName = projekt.projektName?.match(/^Shop #(\S+)/);
  if (ausName) return ausName[1];

  const ausKundeId = projekt.kundeId?.match(/^shop-(.+?)-(?:universal|eigen)$/);
  return ausKundeId ? ausKundeId[1] : undefined;
}

/**
 * Stammt das Projekt aus einer Anfrage (Anfragenportal)?
 *
 * `anfrageProjektIds` kommt aus `anfragenService.loadProjektIdsAusAnfragen()` und
 * deckt den Altbestand ab: Projekte von vor dem `herkunft`-Marker sind nur über
 * die Verknüpfung auf der Anfrage erkennbar.
 */
export function istAnfrageProjekt(projekt: Projekt, anfrageProjektIds?: Set<string>): boolean {
  if (projekt.herkunft) return projekt.herkunft === 'anfrage';
  if (!anfrageProjektIds || anfrageProjektIds.size === 0) return false;

  const appwriteId = (projekt as { $id?: string }).$id;
  return anfrageProjektIds.has(projekt.id) || (!!appwriteId && anfrageProjektIds.has(appwriteId));
}

/**
 * Kanal eines Projekts. Ein Projekt kann formal mehrere Indizien tragen
 * (z.B. Shop-Projekt, das später einem Platzbauer zugeordnet wurde) — die
 * Reihenfolge legt fest, welche Markierung im Board gewinnt.
 */
export function getProjektHerkunft(
  projekt: Projekt,
  anfrageProjektIds?: Set<string>
): ProjektHerkunftKanal | null {
  // Platzbau steht VOR der Spalte, und zwar bewusst: Die Zuordnung zu einem
  // Platzbauer passiert nachträglich, nicht beim Anlegen. Ein Projekt, das als
  // „direkt" begann und später einem Platzbauer zugeschlagen wurde, trüge sonst
  // dauerhaft den falschen Kanal. `istPlatzbauProjekt` liest echte Felder
  // (`istPlatzbauerprojekt`, `platzbauerId`) — das ist keine Rateei, die die
  // Spalte ersetzen müsste.
  if (istPlatzbauProjekt(projekt)) return 'platzbau';

  // Für alles Weitere beendet die gepflegte Spalte die Frage. 'direkt' ist dabei
  // eine Antwort und keine Lücke: von Hand angelegt, kein Kanal.
  if (projekt.herkunft) {
    return projekt.herkunft === 'direkt' || projekt.herkunft === 'platzbau'
      ? null
      : projekt.herkunft;
  }
  if (istShopProjekt(projekt)) return 'shop';
  if (istAnfrageProjekt(projekt, anfrageProjektIds)) return 'anfrage';
  return null;
}

// ==================== BESTELLTYP (Hydrocourt / Universal) ====================

/**
 * Positionen aus den bereits geladenen JSON-Daten des Projekts (bevorzugt
 * Rechnung, sonst Auftragsbestätigung). Kein zusätzlicher DB-Zugriff.
 */
function extrahierePositionen(
  projekt: Projekt
): Array<{ artikelnummer?: string; istUniversalArtikel?: boolean; beschreibung?: string }> {
  const quellen = [projekt.rechnungsDaten, projekt.auftragsbestaetigungsDaten];
  for (const quelle of quellen) {
    if (!quelle) continue;
    try {
      const parsed = JSON.parse(quelle);
      if (Array.isArray(parsed?.positionen) && parsed.positionen.length > 0) {
        return parsed.positionen;
      }
    } catch {
      // defekte JSON-Daten ignorieren
    }
  }
  return [];
}

/** Hydrocourt: Position mit Artikelnummer TM-HYC, Teilprojekt-Typ oder gesetzter Status */
export function istHydrocourtProjekt(projekt: Projekt): boolean {
  const hatPosition = extrahierePositionen(projekt).some(p => p?.artikelnummer === 'TM-HYC');
  return (
    hatPosition ||
    projekt.teilprojektTyp === 'hydrocourt' ||
    !!projekt.hydrocourtStatus ||
    !!projekt.hydrocourtBestelltAm
  );
}

/** Universal: Position mit istUniversalArtikel / 'Universal:'-Präfix, Teilprojekt-Typ oder Status */
export function istUniversalProjekt(projekt: Projekt): boolean {
  const hatPosition = extrahierePositionen(projekt).some(
    p =>
      p?.istUniversalArtikel === true ||
      (typeof p?.beschreibung === 'string' && p.beschreibung.startsWith('Universal:'))
  );
  return (
    hatPosition ||
    projekt.teilprojektTyp === 'universal' ||
    !!projekt.universalKanbanStatus ||
    !!projekt.universalBestelltAm
  );
}

// ==================== FILTER-KATEGORIEN ====================

/** Kategorien des Herkunfts-/Typ-Filters im Kanban */
export type ProjektFilterKategorie = ProjektHerkunftKanal | 'hydrocourt' | 'universal';

/**
 * Alle Kategorien, die auf ein Projekt zutreffen. Anders als getProjektHerkunft
 * (die genau einen Kanal für die Kartenfarbe liefert) mehrfach belegbar: ein
 * Shop-Projekt kann gleichzeitig Universal-Positionen enthalten.
 */
export function getProjektKategorien(
  projekt: Projekt,
  anfrageProjektIds?: Set<string>
): Set<ProjektFilterKategorie> {
  const kategorien = new Set<ProjektFilterKategorie>();
  if (istPlatzbauProjekt(projekt)) kategorien.add('platzbau');
  if (istShopProjekt(projekt)) kategorien.add('shop');
  if (istAnfrageProjekt(projekt, anfrageProjektIds)) kategorien.add('anfrage');
  if (istHydrocourtProjekt(projekt)) kategorien.add('hydrocourt');
  if (istUniversalProjekt(projekt)) kategorien.add('universal');
  return kategorien;
}
