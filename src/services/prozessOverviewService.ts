/**
 * Kennzahlen für die Prozess-Übersicht (Startseite der Projekt-Verwaltung).
 *
 * Der Service zählt nur — es werden bewusst keine vollständigen Dokumentlisten
 * geladen: Appwrite liefert `total` bereits bei `Query.limit(1)` mit. Einzige
 * Ausnahme sind die Debitoren, deren offener Betrag erst aus Projekt + Zahlungs-
 * Metadaten entsteht (`debitorService.berechneStatistik`).
 *
 * Jede Quelle ist einzeln abgesichert: fällt eine aus (Collection fehlt, keine
 * Leseberechtigung, Backend weg), bleibt ihr Wert `null` und die zugehörige
 * Karte zeigt „—". Die Übersicht als Ganzes bleibt benutzbar.
 */

import { Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  ANFRAGEN_COLLECTION_ID,
  SHOP_BESTELLUNGEN_COLLECTION_ID,
  PLATZBAUER_PROJEKTE_COLLECTION_ID,
} from '../config/appwrite';
import { ALLE_PROJEKT_STATUS } from '../types/projekt';
import { debitorService } from './debitorService';

/**
 * Alle Kennzahlen der Übersicht. `null` heißt immer „konnte nicht ermittelt
 * werden" — nicht „null Stück".
 */
export interface ProzessKennzahlen {
  /** Anfragen mit Status `neu` — noch niemand dran */
  anfragenNeu: number | null;
  /** Anfragen in Arbeit (zugeordnet / Angebot erstellt), noch nicht abgeschlossen */
  anfragenInArbeit: number | null;
  /** Shop-Bestellungen mit Status `neu` */
  shopNeu: number | null;
  /** Shop-Bestellungen in Bearbeitung */
  shopInArbeit: number | null;
  /** Platzbauer-Saisonprojekte, die noch laufen (nicht bezahlt/verloren) */
  platzbauerOffen: number | null;
  /** Alle Platzbauer-Projekte der Saison */
  platzbauerGesamt: number | null;
  /** Offene Forderungen (Anzahl) */
  debitorenOffenAnzahl: number | null;
  /** Offene Forderungen (Summe in €) */
  debitorenOffenBetrag: number | null;
  /** Davon überfällig (Anzahl) */
  debitorenUeberfaellig: number | null;
}

export const LEERE_KENNZAHLEN: ProzessKennzahlen = {
  anfragenNeu: null,
  anfragenInArbeit: null,
  shopNeu: null,
  shopInArbeit: null,
  platzbauerOffen: null,
  platzbauerGesamt: null,
  debitorenOffenAnzahl: null,
  debitorenOffenBetrag: null,
  debitorenUeberfaellig: null,
};

/**
 * Laufende Projekt-Status: alles außer abgeschlossen (`bezahlt`) und `verloren`.
 * Abgeleitet aus ALLE_PROJEKT_STATUS, damit ein neu eingeführter Status hier
 * automatisch mitzählt statt still zu fehlen.
 */
const LAUFENDE_PROJEKT_STATUS = ALLE_PROJEKT_STATUS.filter(
  (status) => status !== 'bezahlt' && status !== 'verloren'
);

/** Zählt Dokumente einer Collection, ohne sie zu laden (Appwrite liefert `total`). */
const zaehle = async (collectionId: string, queries: string[] = []): Promise<number> => {
  const response = await databases.listDocuments(DATABASE_ID, collectionId, [
    ...queries,
    Query.limit(1),
  ]);
  return response.total;
};

/** Ergebnis eines allSettled-Laufs auswerten; Fehler werden geloggt, nicht geworfen. */
const wert = <T>(ergebnis: PromiseSettledResult<T>, kontext: string): T | null => {
  if (ergebnis.status === 'fulfilled') return ergebnis.value;
  console.error(`Prozess-Übersicht: ${kontext} konnte nicht geladen werden`, ergebnis.reason);
  return null;
};

export const prozessOverviewService = {
  /**
   * Lädt alle Kennzahlen der Übersicht parallel.
   * Projekt-Zahlen (Kanban, Hydrocourt, Universal …) kommen NICHT von hier —
   * die Projekt-Verwaltung hat ihre Projekte bereits geladen und reicht sie
   * direkt an die Übersicht durch.
   */
  async ladeKennzahlen(saisonjahr: number): Promise<ProzessKennzahlen> {
    const [
      anfragenNeu,
      anfragenInArbeit,
      shopNeu,
      shopInArbeit,
      platzbauerGesamt,
      platzbauerOffen,
      debitoren,
    ] = await Promise.allSettled([
      zaehle(ANFRAGEN_COLLECTION_ID, [Query.equal('status', 'neu')]),
      zaehle(ANFRAGEN_COLLECTION_ID, [
        Query.equal('status', ['zugeordnet', 'angebot_erstellt', 'angebot_versendet']),
      ]),
      zaehle(SHOP_BESTELLUNGEN_COLLECTION_ID, [Query.equal('status', 'neu')]),
      zaehle(SHOP_BESTELLUNGEN_COLLECTION_ID, [Query.equal('status', 'in_bearbeitung')]),
      zaehle(PLATZBAUER_PROJEKTE_COLLECTION_ID, [Query.equal('saisonjahr', saisonjahr)]),
      zaehle(PLATZBAUER_PROJEKTE_COLLECTION_ID, [
        Query.equal('saisonjahr', saisonjahr),
        Query.equal('status', LAUFENDE_PROJEKT_STATUS),
      ]),
      debitorService.berechneStatistik(saisonjahr),
    ]);

    const debitorenStatistik = wert(debitoren, 'Debitoren-Statistik');

    return {
      anfragenNeu: wert(anfragenNeu, 'Anfragen (neu)'),
      anfragenInArbeit: wert(anfragenInArbeit, 'Anfragen (in Arbeit)'),
      shopNeu: wert(shopNeu, 'Shop-Bestellungen (neu)'),
      shopInArbeit: wert(shopInArbeit, 'Shop-Bestellungen (in Bearbeitung)'),
      platzbauerOffen: wert(platzbauerOffen, 'Platzbauer-Projekte (offen)'),
      platzbauerGesamt: wert(platzbauerGesamt, 'Platzbauer-Projekte (gesamt)'),
      debitorenOffenAnzahl: debitorenStatistik?.anzahlOffen ?? null,
      debitorenOffenBetrag: debitorenStatistik?.gesamtOffen ?? null,
      debitorenUeberfaellig: debitorenStatistik?.ueberfaelligAnzahl ?? null,
    };
  },
};
