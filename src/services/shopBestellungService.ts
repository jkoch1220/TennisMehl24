/**
 * Shop Bestellungen Service
 * API-Layer für Gambio Online-Shop Bestellungen
 * Inklusive Integration mit Universal-Artikeln und Projekt-Erstellung
 */

import { BACKEND_CONFIG, backendFetch } from '../config/backend';
import { databases, DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID } from '../config/appwrite';
import { Query, ID } from 'appwrite';
import { UniversalArtikel } from '../types/universaArtikel';
import { Projekt, NeuesProjekt } from '../types/projekt';
import { Position, AuftragsbestaetigungsDaten } from '../types/projektabwicklung';
import { projektService } from './projektService';

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
  statusHistorie?: string; // JSON Array
  aktivitaetsLog?: string; // JSON Array
  erstelltAm: string;
  aktualisiertAm: string;
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
      const response = await databases.listDocuments(
        DATABASE_ID,
        UNIVERSA_ARTIKEL_COLLECTION_ID,
        [Query.limit(5000)]
      );
      return response.documents as unknown as UniversalArtikel[];
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

    // Konvertiere Shop-Positionen zu Projekt-Positionen
    const projektPositionen: Position[] = zuVerwendendePositionen.map(pos => {
      const universalArtikel = universalArtikelMap?.get(pos.artikelnummer);

      return {
        id: ID.unique(),
        artikelnummer: pos.artikelnummer,
        bezeichnung: pos.artikel,
        beschreibung: typ === 'universal' ? `Universal: ${pos.artikel}` : pos.artikel,
        menge: pos.anzahl,
        einheit: 'Stk',
        einzelpreis: pos.einzelpreis,
        einkaufspreis: universalArtikel?.grosshaendlerPreisNetto,
        gesamtpreis: pos.gesamtpreis,
        istUniversalArtikel: typ === 'universal',
      };
    });

    // Erstelle AB-Daten (partielle Daten, wird beim Öffnen der Projektabwicklung vervollständigt)
    const abDaten: Partial<AuftragsbestaetigungsDaten> = {
      auftragsbestaetigungsnummer: `SHOP-${bestellung.bestellnummer}`,
      auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
      positionen: projektPositionen,
      zahlungsziel: bestellung.zahlungsmethode,
      kundenname: lieferadresse.firma || lieferadresse.name,
      kundenstrasse: lieferadresse.strasse,
      kundenPlzOrt: `${lieferadresse.plz} ${lieferadresse.ort}`,
      bemerkung: bestellung.anmerkungen || '',
    };

    // Erstelle Projekt
    const neuesProjekt: NeuesProjekt = {
      projektName: `Shop #${bestellung.bestellnummer}`,
      kundeId: `shop-${bestellung.bestellnummer}`, // Pseudo-ID für Shop-Kunden
      kundennummer: bestellung.kundennummer || '',
      kundenname: lieferadresse.firma || lieferadresse.name,
      kundenstrasse: lieferadresse.strasse,
      kundenPlzOrt: `${lieferadresse.plz} ${lieferadresse.ort}`,
      kundenEmail: '', // Aus Shop nicht direkt verfügbar
      lieferadresse: {
        strasse: lieferadresse.strasse,
        plz: lieferadresse.plz,
        ort: lieferadresse.ort,
        land: lieferadresse.land || 'DE',
      },
      saisonjahr: new Date().getFullYear(),
      status: 'auftragsbestaetigung', // Direkt auf AB, da Kunde bereits bestellt hat
      auftragsbestaetigungsnummer: `SHOP-${bestellung.bestellnummer}`,
      auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
      auftragsbestaetigungsDaten: JSON.stringify(abDaten),
      notizen: `Aus Shop-Bestellung #${bestellung.bestellnummer} erstellt.\n` +
               `Bestelldatum: ${formatBestelldatum(bestellung.bestelldatum)}\n` +
               `Zahlungsmethode: ${bestellung.zahlungsmethode}\n` +
               (bestellung.anmerkungen ? `Kundenanmerkung: ${bestellung.anmerkungen}` : ''),
    };

    // Projekt erstellen (ohne Platzbauer-Zuordnung)
    const projekt = await projektService.createProjekt(neuesProjekt, {
      skipPlatzbauerProjektZuordnung: true,
    });

    return projekt;
  }
}

// Singleton Export
export const shopBestellungService = new ShopBestellungService();
