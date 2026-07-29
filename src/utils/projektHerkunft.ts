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
  return (
    projekt.herkunft === 'shop' ||
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
  if (projekt.herkunft === 'anfrage') return true;
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
  if (istPlatzbauProjekt(projekt)) return 'platzbau';
  if (istShopProjekt(projekt)) return 'shop';
  if (istAnfrageProjekt(projekt, anfrageProjektIds)) return 'anfrage';
  return null;
}
