/**
 * Shop Bestellungen Service
 * API-Layer für Gambio Online-Shop Bestellungen
 * Inklusive Integration mit Universal-Artikeln und Projekt-Erstellung
 */

import { BACKEND_CONFIG, backendFetch } from '../config/backend';
import { blockiereImMockModus } from '../config/mockModus';
import { databases, DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, COLLECTIONS } from '../config/appwrite';
import { Query, ID } from 'appwrite';
import { UniversalArtikel } from '../types/universaArtikel';
import { Projekt, NeuesProjekt } from '../types/projekt';
import { Position, AuftragsbestaetigungsDaten } from '../types/projektabwicklung';
import { projektService } from './projektService';
import { getAlleArtikel } from './artikelService';
import { erstelleArtikelIndex, findeArtikelZurPosition } from '../utils/tonnage';
import { loadAllDocuments } from '../utils/appwritePagination';

/**
 * Zu dieser Bestellung gibt es für diese Warenart bereits ein Projekt.
 *
 * Eigene Klasse statt `Error`, damit die Oberfläche auf das vorhandene Projekt
 * verweisen kann, statt nur eine Meldung anzuzeigen — „gibt es schon" ist ohne
 * den Weg dorthin eine halbe Auskunft.
 */
export class ProjektBereitsVorhandenError extends Error {
  constructor(
    public readonly bestellnummer: string,
    public readonly typ: 'universal' | 'eigen',
    public readonly projektId: string
  ) {
    super(
      `Für Bestellung #${bestellnummer} existiert bereits ein ${
        typ === 'universal' ? 'Universal' : 'Eigen'
      }-Projekt.`
    );
    this.name = 'ProjektBereitsVorhandenError';
  }
}

/**
 * Ein Appwrite-Projektdokument in ein `Projekt` überführen.
 *
 * Nötig, weil nur zwölf Felder echte Spalten sind — alles Übrige, darunter
 * `auftragsbestaetigungsnummer`, liegt im `data`-JSON. Ein blosses
 * `doc as unknown as Projekt` liefert dort `undefined`, und genau darauf stützte
 * sich die Unterscheidung Universal-/Eigen-Projekt.
 */
function parseProjektAusDokument(doc: Record<string, unknown>): Projekt {
  let base: Record<string, unknown> = {};
  if (typeof doc.data === 'string') {
    try {
      base = JSON.parse(doc.data);
    } catch {
      base = {};
    }
  }
  // Top-Level gewinnt, wo gesetzt — die Spalten sind nach Teil-Updates aktueller
  // als die JSON-Kopie.
  for (const [k, v] of Object.entries(doc)) {
    if (k === 'data') continue;
    if (v !== undefined && v !== null && v !== '') base[k] = v;
  }
  base.$id = doc.$id;
  return base as unknown as Projekt;
}

// ============================================
// INTERFACES
// ============================================

export interface ShopAdresse {
  firma?: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

export interface ShopPosition {
  anzahl: number;
  artikel: string;
  artikelnummer: string;
  einzelpreis: number;
  gesamtpreis: number;
}

export interface ShopBestellung {
  $id: string;
  bestellnummer: string;
  /**
   * JSON-Array der Projekt-IDs, die aus dieser Bestellung entstanden sind
   * (Schema v44). Eine Bestellung kann in zwei Projekte zerfallen: Eigen- und
   * Universalware werden getrennt abgewickelt.
   */
  projektIds?: string;
  bestelldatum: string;
  kundennummer: string;
  rechnungsadresse: string; // JSON
  lieferadresse: string; // JSON
  telefon?: string;
  zahlungsmethode: string;
  positionen: string; // JSON
  warenwert: number;
  versandkosten: number;
  mwst: number;
  summeNetto: number;
  summeBrutto: number;
  anmerkungen?: string;
  status: ShopBestellungStatus;
  bearbeitetVon?: string;
  bearbeitetAm?: string;
  versendetAm?: string;
  trackingNummer?: string;
  kundeBeenachrichtigt?: boolean;
  notizen?: string;
  // Gambio API Integration
  gambioOrderId?: number;
  gambioStatusId?: number;
  // Kunden-Kontakt & Historie
  kundenEmail?: string;
  kundeEmail?: string; // Legacy-Feldname (wird vom Backend-Sync teilweise so geschrieben)
  statusHistorie?: string; // JSON Array
  aktivitaetsLog?: string; // JSON Array
  erstelltAm: string;
  aktualisiertAm: string;

  /**
   * Zahlungsstatus, wie ihn der Gambio-Sync schreibt (Appwrite-Attribut `zahlungsStatus`).
   *
   * Das ist die einzige Zahlungsinformation, die tatsächlich in der Datenbank landet.
   * Sie ist verlässlich: Der Sync liest die Zahlungsereignisse aus der Gambio-Status-
   * historie („Capture Completed" / „Zahlung abgeschlossen" der Zahlungsmodule) — das
   * ist eine Bestätigung des Zahlungsdienstleisters, keine Ableitung aus der Zahlart.
   * 'offen' steht bei Rechnungskauf und Vorkasse ohne Zahlungseingang, 'erstattet' bei
   * zurückgezahlten Bestellungen (Rückabwicklung/Widerruf).
   *
   * `undefined` bei Altbestellungen, die vor Einführung des Feldes synchronisiert wurden.
   */
  zahlungsStatus?: 'bezahlt' | 'offen' | 'erstattet' | string;
  /** ISO-Datum des Zahlungseingangs, sofern der Shop es liefert */
  bezahltAm?: string;
  /** Zahlungsreferenz aus dem Mollie-Checkout (nur beim neuen Shop belegt) */
  molliePaymentId?: string;

  /**
   * @deprecated Existiert NICHT als Appwrite-Attribut und ist daher immer `undefined`.
   * Das Backend leitet den Wert zwar in `gambio-api.ts` ab, schreibt ihn aber nur als
   * `zahlungsStatus` weg. Wer hier abfragt, bekommt bei JEDER Bestellung `false` —
   * genau deshalb landete früher „(noch offen)" in den Projektnotizen bezahlter
   * Shop-Bestellungen. `istVorabBezahlt()` verwenden.
   */
  bezahlt?: boolean;
  /** @deprecated Existiert nicht als Appwrite-Attribut, immer `undefined`. */
  zahlungsart?: 'paypal' | 'rechnungskauf' | 'vorkasse' | 'sonstige';
}

/**
 * Ist die Bestellung bereits bezahlt beim Portal angekommen?
 *
 * Maßgeblich ist `zahlungsStatus` aus dem Sync. Für Altbestellungen ohne das Feld
 * greift ersatzweise die Zahlungsmethode: Rechnung und Vorkasse sind offen, alles
 * über den Hub abgewickelte (PayPal, Kreditkarte, Lastschrift, Sofort, Klarna …)
 * ist bezahlt. Im Zweifel `false` — lieber einmal zu viel nachsehen als eine
 * offene Forderung als beglichen zu führen.
 */
export function istVorabBezahlt(
  bestellung: Partial<Pick<ShopBestellung, 'zahlungsStatus' | 'zahlungsmethode'>>
): boolean {
  if (bestellung.zahlungsStatus === 'bezahlt') return true;
  if (bestellung.zahlungsStatus === 'offen') return false;
  // 'erstattet': Geld ist zurückgezahlt. Ohne diesen Zweig fiele der Wert auf den
  // Zahlart-Fallback durch und eine erstattete PayPal-Bestellung stünde als bezahlt da.
  if (bestellung.zahlungsStatus === 'erstattet') return false;

  // Fallback für Altbestellungen ohne zahlungsStatus
  const methode = (bestellung.zahlungsmethode || '').toLowerCase();
  if (!methode) return false;
  if (methode.includes('rechnung') || methode.includes('vorkasse') || methode.includes('überweisung')) {
    return false;
  }
  return ['paypal', 'kredit', 'debit', 'lastschrift', 'sofort', 'klarna', 'apple', 'google', 'hub'].some(
    (kennung) => methode.includes(kennung)
  );
}

// Gambio Status-Historie Eintrag
export interface GambioStatusHistorie {
  id: number;
  orderId: number;
  statusId: number;
  dateAdded: string;
  comment: string;
  customerNotified: boolean;
}

// Interner Aktivitäts-Log Eintrag
export interface AktivitaetsEintrag {
  id: string;
  datum: string;
  aktion: 'status_aenderung' | 'notiz_hinzugefuegt' | 'tracking_gesetzt' | 'kunde_benachrichtigt' | 'sync';
  benutzer?: string;
  details: string;
  gambioKommentar?: string;
  kundeInformiert?: boolean;
  gambioSync?: boolean;
}

export type ShopBestellungStatus =
  | 'neu'
  | 'in_bearbeitung'
  | 'versendet'
  | 'abgeschlossen'
  | 'storniert';

export interface ShopBestellungFilter {
  status?: ShopBestellungStatus;
  datumVon?: string;
  datumBis?: string;
}

export interface ShopSyncResult {
  success: boolean;
  neue: number;
  duplikate: number;
  fehler: number;
  parseFehler: number;
}

export interface ShopStats {
  neu: number;
  in_bearbeitung: number;
  versendet: number;
  abgeschlossen: number;
  storniert: number;
  gesamt: number;
  diesesMonat: number;
}

export interface StatusUpdate {
  status: ShopBestellungStatus;
  trackingNummer?: string;
  notizen?: string;
  bearbeitetVon?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parst JSON-Adresse aus Bestellung
 */
export function parseAdresse(json: string): ShopAdresse {
  try {
    return JSON.parse(json);
  } catch {
    return {
      name: 'Unbekannt',
      strasse: '',
      plz: '',
      ort: '',
      land: 'DE',
    };
  }
}

/**
 * Parst JSON-Positionen aus Bestellung
 */
export function parsePositionen(json: string): ShopPosition[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Formatiert Bestelldatum für Anzeige
 */
export function formatBestelldatum(datum: string): string {
  // Datum kann ISO oder DD.MM.YYYY sein
  if (datum.includes('T')) {
    return new Date(datum).toLocaleDateString('de-DE');
  }
  return datum;
}

/**
 * Parst JSON-Status-Historie aus Bestellung
 */
export function parseStatusHistorie(json?: string): GambioStatusHistorie[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Parst JSON-Aktivitätslog aus Bestellung
 */
export function parseAktivitaetsLog(json?: string): AktivitaetsEintrag[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Gibt Status-Label und Farbe zurück
 */
export function getStatusInfo(status: ShopBestellungStatus): { label: string; color: string; bgColor: string } {
  const statusMap: Record<ShopBestellungStatus, { label: string; color: string; bgColor: string }> = {
    neu: { label: 'Neu', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    in_bearbeitung: { label: 'In Bearbeitung', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    versendet: { label: 'Versendet', color: 'text-purple-700', bgColor: 'bg-purple-100' },
    abgeschlossen: { label: 'Abgeschlossen', color: 'text-green-700', bgColor: 'bg-green-100' },
    storniert: { label: 'Storniert', color: 'text-red-700', bgColor: 'bg-red-100' },
  };
  return statusMap[status] || statusMap.neu;
}

// ============================================
// SERVICE CLASS
// ============================================

class ShopBestellungService {
  private baseUrl = '/api/shop';

  /**
   * Prüft ob Backend verfügbar ist
   */
  isBackendAvailable(): boolean {
    return BACKEND_CONFIG.enabled;
  }

  /**
   * Synchronisiert Bestellungen aus dem IMAP-Postfach
   */
  async syncEmails(): Promise<ShopSyncResult> {
    blockiereImMockModus('Shop-Bestellungen synchronisieren (Backend schreibt in die Produktionsdatenbank)');
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const response = await backendFetch<ShopSyncResult>(`${this.baseUrl}/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    return response;
  }

  /**
   * Lädt alle Bestellungen (mit optionalem Filter)
   */
  async ladeBestellungen(filter?: ShopBestellungFilter): Promise<ShopBestellung[]> {
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.datumVon) params.set('datumVon', filter.datumVon);
    if (filter?.datumBis) params.set('datumBis', filter.datumBis);

    const queryString = params.toString();
    const url = queryString
      ? `${this.baseUrl}/orders?${queryString}`
      : `${this.baseUrl}/orders`;

    const response = await backendFetch<{ success: boolean; orders: ShopBestellung[] }>(url);

    return response.orders;
  }

  /**
   * Lädt eine einzelne Bestellung
   */
  async ladeBestellung(id: string): Promise<ShopBestellung> {
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const response = await backendFetch<{ success: boolean; order: ShopBestellung }>(
      `${this.baseUrl}/orders/${id}`
    );

    return response.order;
  }

  /**
   * Aktualisiert den Status einer Bestellung
   */
  async updateStatus(id: string, update: StatusUpdate): Promise<ShopBestellung> {
    blockiereImMockModus('Shop-Bestellstatus ändern (wirkt auf die echte Bestellung)');
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const response = await backendFetch<{ success: boolean; order: ShopBestellung }>(
      `${this.baseUrl}/orders/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(update),
      }
    );

    return response.order;
  }

  /**
   * Sendet Versandbenachrichtigung an Kunden
   */
  async sendeVersandbenachrichtigung(id: string): Promise<{ success: boolean; message: string }> {
    // Diese Mail verschickt das VPS-Backend — sie läuft NICHT durch
    // emailSendService und wird deshalb auch nicht auf die Testadresse umgeleitet.
    blockiereImMockModus('Versandbenachrichtigung senden (Backend mailt direkt an den echten Kunden)');
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    return backendFetch<{ success: boolean; message: string }>(
      `${this.baseUrl}/orders/${id}/notify`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Aktualisiert eine einzelne Bestellung von Gambio
   */
  async refreshFromGambio(id: string): Promise<ShopBestellung> {
    blockiereImMockModus('Bestellung aus Gambio aktualisieren (Backend schreibt in die Produktionsdatenbank)');
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const response = await backendFetch<{ success: boolean; order: ShopBestellung }>(
      `${this.baseUrl}/orders/${id}/refresh`,
      {
        method: 'POST',
      }
    );

    return response.order;
  }

  /**
   * Lädt Statistiken für Dashboard
   */
  async ladeStatistiken(): Promise<ShopStats> {
    if (!this.isBackendAvailable()) {
      throw new Error('Backend nicht verfügbar. Bitte VITE_USE_BACKEND=true setzen.');
    }

    const response = await backendFetch<{ success: boolean; stats: ShopStats }>(
      `${this.baseUrl}/stats`
    );

    return response.stats;
  }

  // ============================================
  // UNIVERSAL-ARTIKEL INTEGRATION
  // ============================================

  /**
   * Lädt alle Universal-Artikel aus den Stammdaten
   */
  private async ladeUniversalArtikel(): Promise<UniversalArtikel[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID);
      return documents as unknown as UniversalArtikel[];
    } catch (error) {
      console.error('Fehler beim Laden der Universal-Artikel:', error);
      return [];
    }
  }

  /**
   * Prüft welche Positionen Universal-Artikel sind
   * Gibt Map zurück: artikelnummer -> UniversalArtikel (oder null wenn eigen)
   */
  async pruefeUniversalArtikel(positionen: ShopPosition[]): Promise<Map<string, UniversalArtikel | null>> {
    const universalArtikel = await this.ladeUniversalArtikel();
    const result = new Map<string, UniversalArtikel | null>();

    for (const pos of positionen) {
      // Suche nach Artikelnummer (exakt oder als Substring)
      const found = universalArtikel.find(ua =>
        ua.artikelnummer === pos.artikelnummer ||
        pos.artikelnummer.includes(ua.artikelnummer) ||
        ua.artikelnummer.includes(pos.artikelnummer)
      );
      result.set(pos.artikelnummer, found || null);
    }

    return result;
  }

  /**
   * Analysiert eine Shop-Bestellung und klassifiziert die Positionen
   */
  async analysiereBestellung(bestellung: ShopBestellung): Promise<{
    universalPositionen: ShopPosition[];
    eigenePositionen: ShopPosition[];
    universalArtikelMap: Map<string, UniversalArtikel | null>;
  }> {
    const positionen = parsePositionen(bestellung.positionen);
    const universalArtikelMap = await this.pruefeUniversalArtikel(positionen);

    const universalPositionen: ShopPosition[] = [];
    const eigenePositionen: ShopPosition[] = [];

    for (const pos of positionen) {
      if (universalArtikelMap.get(pos.artikelnummer)) {
        universalPositionen.push(pos);
      } else {
        eigenePositionen.push(pos);
      }
    }

    return { universalPositionen, eigenePositionen, universalArtikelMap };
  }

  // ============================================
  // PROJEKT-VERKNÜPFUNG
  // ============================================

  /**
   * Prüft, ob für eine Shop-Bestellung bereits Projekte existieren.
   *
   * Suchte bis 08/2026 über `Query.equal('auftragsbestaetigungsnummer', …)` — ein
   * Feld, das es als Appwrite-SPALTE nie gab; es liegt nur im `data`-JSON. Appwrite
   * quittierte das mit „Invalid query: Attribute not found in schema", der Catch
   * lieferte `{ universal: null, eigen: null }`, und die Oberfläche schloss daraus:
   * „noch kein Projekt vorhanden". Zu einer Bestellung liessen sich deshalb
   * beliebig viele Projekte anlegen. Bestellung #173 trägt real zwei.
   *
   * `shopBestellnummer` ist seit Schema v44 eine echte Spalte und damit abfragbar.
   */
  async getExistierendeProjekte(bestellnummer: string): Promise<{ universal: Projekt | null; eigen: Projekt | null }> {
    try {
      let dokumente: unknown[];
      try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, [
          Query.equal('shopBestellnummer', String(bestellnummer)),
          Query.limit(10),
        ]);
        dokumente = response.documents;
      } catch (spaltenFehler) {
        // Umgebung ohne die Spalte (Sandbox vor der Migration): über den
        // Projektnamen suchen. Langsamer, aber besser als still nichts finden —
        // genau daran krankte die alte Fassung.
        console.warn(
          'shopBestellnummer nicht abfragbar, weiche auf die Namenssuche aus:',
          spaltenFehler
        );
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, [
          Query.startsWith('projektName', `Shop #${bestellnummer}`),
          Query.limit(10),
        ]);
        dokumente = response.documents;
      }

      let universal: Projekt | null = null;
      let eigen: Projekt | null = null;

      for (const doc of dokumente) {
        const projekt = parseProjektAusDokument(doc as Record<string, unknown>);
        const abNr = projekt.auftragsbestaetigungsnummer || '';

        if (abNr.endsWith('-U')) {
          universal = projekt;
        } else if (abNr.endsWith('-E')) {
          eigen = projekt;
        } else {
          // Alte Projekte ohne Suffix: Prüfe anhand der Positionen
          try {
            const abDaten = JSON.parse(projekt.auftragsbestaetigungsDaten || '{}');
            const positionen = abDaten.positionen || [];
            const hatUniversal = positionen.some((p: Position) =>
              p.istUniversalArtikel || p.beschreibung?.startsWith('Universal:')
            );
            if (hatUniversal) {
              universal = projekt;
            } else {
              eigen = projekt;
            }
          } catch {
            // Bei Parse-Fehler als eigen behandeln
            eigen = projekt;
          }
        }
      }

      return { universal, eigen };
    } catch (error) {
      console.error('Fehler beim Suchen existierender Projekte:', error);
      return { universal: null, eigen: null };
    }
  }

  // ============================================
  // PROJEKT-ERSTELLUNG
  // ============================================

  /**
   * Erstellt ein Projekt aus einer Shop-Bestellung
   * @param bestellung Die Shop-Bestellung
   * @param typ 'universal' für Universal-Artikel, 'eigen' für eigene Produkte
   * @param positionen Optional: Nur bestimmte Positionen (sonst alle passenden)
   */
  async erstelleProjektAusBestellung(
    bestellung: ShopBestellung,
    typ: 'universal' | 'eigen',
    positionen?: ShopPosition[]
  ): Promise<Projekt> {
    const lieferadresse = parseAdresse(bestellung.lieferadresse);

    // Analysiere Positionen wenn nicht übergeben
    let zuVerwendendePositionen: ShopPosition[];
    let universalArtikelMap: Map<string, UniversalArtikel | null> | undefined;

    if (positionen) {
      zuVerwendendePositionen = positionen;
      if (typ === 'universal') {
        universalArtikelMap = await this.pruefeUniversalArtikel(positionen);
      }
    } else {
      const analyse = await this.analysiereBestellung(bestellung);
      zuVerwendendePositionen = typ === 'universal'
        ? analyse.universalPositionen
        : analyse.eigenePositionen;
      universalArtikelMap = analyse.universalArtikelMap;
    }

    if (zuVerwendendePositionen.length === 0) {
      throw new Error(`Keine ${typ === 'universal' ? 'Universal-Artikel' : 'eigenen Produkte'} in dieser Bestellung`);
    }

    // Sperre gegen Doppelanlage — im SERVICE und nicht nur in der Oberflaeche.
    // Die Oberflaeche prueft beim Laden; zwischen Laden und Klick kann jemand
    // anderes dasselbe getan haben, und ein zweiter Tab weiss davon ohnehin
    // nichts. Zwei Projekte zur selben Bestellung bedeuten am Ende zwei
    // Auftragsbestaetigungen und zwei Rechnungen an denselben Kunden.
    const bereitsVorhanden = await this.getExistierendeProjekte(bestellung.bestellnummer);
    const schonDa = typ === 'universal' ? bereitsVorhanden.universal : bereitsVorhanden.eigen;
    if (schonDa) {
      throw new ProjektBereitsVorhandenError(
        bestellung.bestellnummer,
        typ,
        schonDa.$id || schonDa.id
      );
    }

    // Artikelstamm für die Zuordnung eigener Artikel (Einheit, artikelId).
    // Schlägt das Laden fehl, greift unten der bisherige Stk-Fallback.
    let artikelIndex: ReturnType<typeof erstelleArtikelIndex> | undefined;
    if (typ !== 'universal') {
      try {
        artikelIndex = erstelleArtikelIndex(await getAlleArtikel());
      } catch (e) {
        console.warn('Artikelstamm für Shop-Import nicht ladbar:', e);
      }
    }

    // Konvertiere Shop-Positionen zu Projekt-Positionen
    const projektPositionen: Position[] = zuVerwendendePositionen.map(pos => {
      const universalArtikel = universalArtikelMap?.get(pos.artikelnummer);

      // WICHTIG: Shop-Preise sind BRUTTO (Gambio führt Endkundenpreise)!
      // Für Universal-Artikel: hinterlegter Netto-Katalogpreis aus Stammdaten.
      // Für eigene Artikel seit Stufe 4 (08/2026): tatsächlich gezahlter
      // Shop-Preis, auf Netto umgerechnet — vorher blieb der Brutto-Wert
      // stehen und wurde überall als Netto weiterverarbeitet (AB/Rechnung
      // schlugen die MwSt erneut auf).
      let einzelpreis = pos.einzelpreis;
      if (typ === 'universal' && universalArtikel) {
        einzelpreis = universalArtikel.katalogPreisNetto;
      } else {
        einzelpreis = pos.einzelpreis / 1.19;
      }

      // Eigene Artikel: Einheit aus dem Stamm statt pauschal 'Stk' — sonst
      // fällt Shop-Tennismehl aus jeder Tonnage-Rechnung. Bei Stamm-Einheit
      // 't' entspricht 1 Shop-Stück nominal 1 t (BigBag ≈ 1000 kg, Palette
      // 25 × 40 kg); Sackware (TM-ZM-02S, 'Stk') rechnet die Tonnage über
      // gewichtProStueckKg um.
      const stammArtikel = typ !== 'universal'
        ? findeArtikelZurPosition({ artikelnummer: pos.artikelnummer }, artikelIndex)
        : undefined;
      const einheit = stammArtikel?.erlaubteEinheit || stammArtikel?.einheit || 'Stk';

      return {
        id: ID.unique(),
        artikelId: stammArtikel?.$id,
        preisQuelle: 'shop' as const,
        artikelnummer: pos.artikelnummer,
        bezeichnung: pos.artikel,
        beschreibung: typ === 'universal' ? `Universal: ${pos.artikel}` : pos.artikel,
        menge: pos.anzahl,
        einheit,
        einzelpreis: Math.round(einzelpreis * 100) / 100,
        einkaufspreis: universalArtikel?.grosshaendlerPreisNetto ?? stammArtikel?.einkaufspreis ?? undefined,
        gesamtpreis: Math.round(einzelpreis * pos.anzahl * 100) / 100,
        istUniversalArtikel: typ === 'universal',
      };
    });

    // Suffix für Unterscheidung: -U für Universal, -E für Eigen
    const typSuffix = typ === 'universal' ? '-U' : '-E';
    const typLabel = typ === 'universal' ? 'Universal' : 'Eigen';
    const abNummer = `SHOP-${bestellung.bestellnummer}${typSuffix}`;

    // Erstelle AB-Daten (partielle Daten, wird beim Öffnen der Projektabwicklung vervollständigt)
    const abDaten: Partial<AuftragsbestaetigungsDaten> = {
      auftragsbestaetigungsnummer: abNummer,
      auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
      positionen: projektPositionen,
      zahlungsziel: bestellung.zahlungsmethode,
      kundenname: lieferadresse.firma || lieferadresse.name,
      kundenstrasse: lieferadresse.strasse,
      kundenPlzOrt: `${lieferadresse.plz} ${lieferadresse.ort}`,
      bemerkung: bestellung.anmerkungen || '',
    };

    // Zahlungsstatus aus dem Sync — NICHT aus `bestellung.bezahlt`, das es in Appwrite
    // nicht gibt und das deshalb jede Bestellung als offen auswies.
    const vorabBezahlt = istVorabBezahlt(bestellung);
    const zahlungsInfo = vorabBezahlt
      ? `Bereits bezahlt via ${bestellung.zahlungsmethode}`
      : `${bestellung.zahlungsmethode} (noch offen)`;

    // Erstelle Projekt
    const neuesProjekt: NeuesProjekt = {
      projektName: `Shop #${bestellung.bestellnummer} (${typLabel})`,
      kundeId: `shop-${bestellung.bestellnummer}-${typ}`, // Unique pro Typ
      kundennummer: bestellung.kundennummer || '',
      kundenname: lieferadresse.firma || lieferadresse.name,
      kundenstrasse: lieferadresse.strasse,
      kundenPlzOrt: `${lieferadresse.plz} ${lieferadresse.ort}`,
      kundenEmail: bestellung.kundenEmail || bestellung.kundeEmail || '', // Kunden-Email aus Shop-Bestellung (Backend-Feld: kundenEmail oder kundeEmail)
      kundenTelefon: bestellung.telefon || '', // Telefon aus Shop-Bestellung
      lieferadresse: {
        strasse: lieferadresse.strasse,
        plz: lieferadresse.plz,
        ort: lieferadresse.ort,
        land: lieferadresse.land || 'DE',
      },
      saisonjahr: new Date().getFullYear(),
      herkunft: 'shop',
      // Als eigenes Feld, nicht nur eingebettet in AB-Nummer und Projektname:
      // beide sind frei editierbar, die Zuordnung zur Bestellung darf das nicht sein.
      shopBestellnummer: String(bestellung.bestellnummer),
      status: 'auftragsbestaetigung', // Direkt auf AB, da Kunde bereits bestellt hat
      // Zahlung strukturiert mitführen, damit nach der Auslieferung ohne Blick nach
      // Gambio erkennbar ist, dass keine Forderung mehr offen ist.
      vorabBezahlt,
      vorabBezahltMethode: bestellung.zahlungsmethode,
      vorabBezahltAm: vorabBezahlt ? bestellung.bezahltAm || bestellung.bestelldatum : undefined,
      vorabBezahltReferenz: vorabBezahlt
        ? bestellung.molliePaymentId || `Shop #${bestellung.bestellnummer}`
        : undefined,
      auftragsbestaetigungsnummer: abNummer,
      auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
      auftragsbestaetigungsDaten: JSON.stringify(abDaten),
      notizen: `Aus Shop-Bestellung #${bestellung.bestellnummer} erstellt.\n` +
               `Bestelldatum: ${formatBestelldatum(bestellung.bestelldatum)}\n` +
               `Zahlungsmethode: ${zahlungsInfo}\n` +
               (bestellung.telefon ? `Telefon: ${bestellung.telefon}\n` : '') +
               (bestellung.anmerkungen ? `Kundenanmerkung: ${bestellung.anmerkungen}` : ''),
    };

    // Projekt erstellen (ohne Platzbauer-Zuordnung)
    const projekt = await projektService.createProjekt(neuesProjekt, {
      skipPlatzbauerProjektZuordnung: true,
    });

    // Rueckverweis an der Bestellung. Ohne ihn war von der Shop-Seite aus nicht
    // erkennbar, dass ueberhaupt schon ein Projekt existiert — die Verknuepfung
    // gab es nur in eine Richtung.
    await this.verknuepfeProjektMitBestellung(bestellung, projekt);

    return projekt;
  }

  /**
   * Traegt die Projekt-ID in `shop_bestellungen.projektIds` nach.
   *
   * Ein Array, weil eine Bestellung in zwei Projekte zerfallen kann (Eigen- und
   * Universalware). Scheitert das Nachtragen, ist das Projekt trotzdem in der
   * Welt — deshalb nur eine Warnung: Ein Fehler hier duerfte nicht dazu fuehren,
   * dass der Aufrufer die Erstellung fuer gescheitert haelt und sie wiederholt.
   */
  private async verknuepfeProjektMitBestellung(
    bestellung: ShopBestellung,
    projekt: Projekt
  ): Promise<void> {
    const projektId = projekt.$id || projekt.id;
    const bestellungId = bestellung.$id;
    if (!projektId || !bestellungId) return;

    try {
      let bisher: string[] = [];
      const roh = (bestellung as { projektIds?: string }).projektIds;
      if (roh) {
        try {
          const geparst = JSON.parse(roh);
          if (Array.isArray(geparst)) bisher = geparst.filter((x) => typeof x === 'string');
        } catch {
          /* defekter Wert wird ueberschrieben */
        }
      }
      if (bisher.includes(projektId)) return;

      await databases.updateDocument(DATABASE_ID, COLLECTIONS.SHOP_BESTELLUNGEN, bestellungId, {
        projektIds: JSON.stringify([...bisher, projektId]),
      });
    } catch (error) {
      console.warn(
        `Projekt ${projektId} konnte nicht an Bestellung ${bestellung.bestellnummer} vermerkt werden:`,
        error
      );
    }
  }
}

// Singleton Export
export const shopBestellungService = new ShopBestellungService();
