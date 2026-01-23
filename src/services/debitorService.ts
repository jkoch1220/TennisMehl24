import { databases, DATABASE_ID, COLLECTIONS } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Projekt } from '../types/projekt';
import {
  DebitorMetadaten,
  NeueDebitorMetadaten,
  DebitorView,
  DebitorStatus,
  DebitorMahnstufe,
  DebitorZahlung,
  DebitorAktivitaet,
  DebitorenStatistik,
  DebitorFilter,
  STANDARD_ZAHLUNGSZIEL_TAGE,
} from '../types/debitor';
import { projektService } from './projektService';

// Interface für geparste Rechnungsdaten aus Projekt
interface RechnungsDaten {
  gesamtBrutto?: number;
  gesamtNetto?: number;
  positionen?: Array<{
    bezeichnung: string;
    menge: number;
    einzelpreis: number;
    gesamtpreis: number;
  }>;
  zahlungsziel?: string;
}

class DebitorService {
  private readonly collectionId = COLLECTIONS.DEBITOREN_METADATEN;

  // =====================================================
  // LADEN
  // =====================================================

  /**
   * Lädt alle Debitoren (Projekte mit Status 'rechnung' + deren Metadaten)
   */
  async loadAlleDebitoren(filter?: DebitorFilter): Promise<DebitorView[]> {
    try {
      // 1. Lade alle Projekte mit Status 'rechnung' (noch nicht bezahlt)
      const statusFilter = filter?.status?.includes('bezahlt')
        ? ['rechnung', 'bezahlt']
        : filter?.status?.length
        ? ['rechnung'] // Wir filtern später nach Debitor-Status
        : ['rechnung'];

      const queries: string[] = [
        Query.equal('status', statusFilter),
        Query.orderDesc('geaendertAm'),
        Query.limit(1000),
      ];

      if (filter?.saisonjahr) {
        queries.push(Query.equal('saisonjahr', filter.saisonjahr));
      }

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, queries);

      // Auch bezahlte Projekte laden falls gewünscht
      let projekte: Projekt[] = [];

      for (const doc of response.documents) {
        let projekt: Projekt;
        if (doc.data && typeof doc.data === 'string') {
          try {
            projekt = { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            projekt = doc as unknown as Projekt;
          }
        } else {
          projekt = doc as unknown as Projekt;
        }
        projekte.push(projekt);
      }

      // Falls auch bezahlte Projekte gewünscht
      if (filter?.status?.includes('bezahlt') || !filter?.status?.length) {
        const bezahltResponse = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, [
          Query.equal('status', ['bezahlt']),
          Query.orderDesc('geaendertAm'),
          Query.limit(500),
          ...(filter?.saisonjahr ? [Query.equal('saisonjahr', filter.saisonjahr)] : []),
        ]);

        for (const doc of bezahltResponse.documents) {
          let projekt: Projekt;
          if (doc.data && typeof doc.data === 'string') {
            try {
              projekt = { ...JSON.parse(doc.data), $id: doc.$id };
            } catch {
              projekt = doc as unknown as Projekt;
            }
          } else {
            projekt = doc as unknown as Projekt;
          }
          projekte.push(projekt);
        }
      }

      // 2. Lade alle Metadaten
      const metadatenResponse = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.limit(1000),
      ]);

      const metadatenMap = new Map<string, DebitorMetadaten>();
      for (const doc of metadatenResponse.documents) {
        const metadaten = this.parseMetadatenDocument(doc);
        if (metadaten) {
          metadatenMap.set(metadaten.projektId, metadaten);
        }
      }

      // 3. Kombiniere Projekte mit Metadaten zu DebitorViews
      const debitoren: DebitorView[] = [];

      for (const projekt of projekte) {
        // Nur Projekte mit Rechnung
        if (!projekt.rechnungsnummer && !projekt.rechnungsdatum) {
          continue;
        }

        const metadaten = metadatenMap.get(projekt.id) || null;
        const debitorView = this.createDebitorView(projekt, metadaten);

        // Filter anwenden
        if (this.matchesFilter(debitorView, filter)) {
          debitoren.push(debitorView);
        }
      }

      // Sortieren nach offensten/kritischsten zuerst
      debitoren.sort((a, b) => {
        // Bezahlte ans Ende
        if (a.status === 'bezahlt' && b.status !== 'bezahlt') return 1;
        if (b.status === 'bezahlt' && a.status !== 'bezahlt') return -1;
        // Nach Tagen überfällig (absteigend)
        return b.tageUeberfaellig - a.tageUeberfaellig;
      });

      return debitoren;
    } catch (error) {
      console.error('Fehler beim Laden der Debitoren:', error);
      throw error;
    }
  }

  /**
   * Lädt einen einzelnen Debitor für ein Projekt
   */
  async loadDebitorFuerProjekt(projektId: string): Promise<DebitorView | null> {
    try {
      const projekt = await projektService.getProjekt(projektId);
      if (!projekt || !projekt.rechnungsnummer) {
        return null;
      }

      const metadaten = await this.loadMetadatenFuerProjekt(projektId);
      return this.createDebitorView(projekt, metadaten);
    } catch (error) {
      console.error('Fehler beim Laden des Debitors:', error);
      throw error;
    }
  }

  /**
   * Lädt Metadaten für ein Projekt
   */
  async loadMetadatenFuerProjekt(projektId: string): Promise<DebitorMetadaten | null> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('projektId', projektId),
        Query.limit(1),
      ]);

      if (response.documents.length === 0) {
        return null;
      }

      return this.parseMetadatenDocument(response.documents[0]);
    } catch (error) {
      console.error('Fehler beim Laden der Metadaten:', error);
      return null;
    }
  }

  // =====================================================
  // METADATEN CRUD
  // =====================================================

  /**
   * Erstellt oder holt Metadaten für ein Projekt
   */
  async getOrCreateMetadaten(projektId: string): Promise<DebitorMetadaten> {
    try {
      // Prüfe ob Metadaten existieren
      const existing = await this.loadMetadatenFuerProjekt(projektId);
      if (existing) {
        return existing;
      }

      // Erstelle neue Metadaten
      const jetzt = new Date().toISOString();
      const neueMetadaten: NeueDebitorMetadaten = {
        projektId,
        status: 'offen',
        mahnstufe: 0,
        prioritaet: 'normal',
        zahlungen: [],
        aktivitaeten: [],
      };

      const dokument = {
        projektId,
        status: 'offen',
        mahnstufe: 0,
        prioritaet: 'normal',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify(neueMetadaten),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        ID.unique(),
        dokument
      );

      return this.parseMetadatenDocument(response)!;
    } catch (error) {
      console.error('Fehler beim Erstellen der Metadaten:', error);
      throw error;
    }
  }

  /**
   * Aktualisiert Metadaten
   */
  async updateMetadaten(
    projektId: string,
    updates: Partial<DebitorMetadaten>
  ): Promise<DebitorMetadaten> {
    try {
      // Hole oder erstelle Metadaten
      let metadaten = await this.getOrCreateMetadaten(projektId);

      // Aktualisiere
      const aktualisiert: DebitorMetadaten = {
        ...metadaten,
        ...updates,
        geaendertAm: new Date().toISOString(),
      };

      const dokument = {
        projektId: aktualisiert.projektId,
        status: aktualisiert.status,
        mahnstufe: aktualisiert.mahnstufe,
        prioritaet: aktualisiert.prioritaet,
        geaendertAm: aktualisiert.geaendertAm,
        data: JSON.stringify(aktualisiert),
      };

      await databases.updateDocument(DATABASE_ID, this.collectionId, metadaten.id, dokument);

      return aktualisiert;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Metadaten:', error);
      throw error;
    }
  }

  // =====================================================
  // ZAHLUNGEN
  // =====================================================

  /**
   * Fügt eine Zahlung hinzu
   */
  async addZahlung(
    projektId: string,
    zahlung: Omit<DebitorZahlung, 'id' | 'erstelltAm'>
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      const neueZahlung: DebitorZahlung = {
        ...zahlung,
        id: ID.unique(),
        erstelltAm: new Date().toISOString(),
      };

      const zahlungen = [...(metadaten.zahlungen || []), neueZahlung];

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'zahlung_eingegangen',
        titel: `Zahlung eingegangen: ${zahlung.betrag.toFixed(2)} €`,
        beschreibung: zahlung.notiz,
        betrag: zahlung.betrag,
        erstelltAm: new Date().toISOString(),
        erstelltVon: zahlung.erstelltVon,
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      // Berechne neuen Status
      const rechnungsbetrag = this.parseRechnungsbetrag(projekt);
      const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);
      let neuerStatus: DebitorStatus = metadaten.status;

      if (bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
        // Projekt-Status auch auf bezahlt setzen
        await projektService.updateProjekt(projektId, {
          bezahltAm: new Date().toISOString(),
          status: 'bezahlt',
        });
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      }

      const aktualisiert = await this.updateMetadaten(projektId, {
        zahlungen,
        aktivitaeten,
        status: neuerStatus,
      });

      return this.createDebitorView(projekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Zahlung:', error);
      throw error;
    }
  }

  /**
   * Löscht eine Zahlung
   */
  async deleteZahlung(projektId: string, zahlungId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      const zahlungen = (metadaten.zahlungen || []).filter((z) => z.id !== zahlungId);

      // Status neu berechnen
      const rechnungsbetrag = this.parseRechnungsbetrag(projekt);
      const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);
      let neuerStatus: DebitorStatus;

      if (bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      } else if (metadaten.mahnstufe > 0) {
        neuerStatus = 'gemahnt';
      } else {
        neuerStatus = this.berechneStatusAusRechnung(projekt, metadaten.zahlungszielTage);
      }

      const aktualisiert = await this.updateMetadaten(projektId, {
        zahlungen,
        status: neuerStatus,
      });

      return this.createDebitorView(projekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Löschen der Zahlung:', error);
      throw error;
    }
  }

  // =====================================================
  // MAHNWESEN
  // =====================================================

  /**
   * Erhöht die Mahnstufe
   */
  async erhoeheMahnstufe(projektId: string, notiz?: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      const neueMahnstufe = Math.min(4, metadaten.mahnstufe + 1) as DebitorMahnstufe;

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'mahnung_versendet',
        titel: `Mahnstufe ${neueMahnstufe} erreicht`,
        beschreibung: notiz,
        mahnstufe: neueMahnstufe,
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        mahnstufe: neueMahnstufe,
        letzteMahnungAm: new Date().toISOString(),
        aktivitaeten,
        status: 'gemahnt',
      });

      return this.createDebitorView(projekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Erhöhen der Mahnstufe:', error);
      throw error;
    }
  }

  /**
   * Markiert Mahnung als versendet
   */
  async markiereMahnungVersendet(
    projektId: string,
    mahnstufe: DebitorMahnstufe,
    notiz?: string
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'mahnung_versendet',
        titel: `Mahnung Stufe ${mahnstufe} versendet`,
        beschreibung: notiz,
        mahnstufe,
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        mahnstufe,
        letzteMahnungAm: new Date().toISOString(),
        aktivitaeten,
        status: 'gemahnt',
      });

      return this.createDebitorView(projekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Markieren der Mahnung:', error);
      throw error;
    }
  }

  // =====================================================
  // AKTIVITÄTEN
  // =====================================================

  /**
   * Fügt eine Aktivität hinzu
   */
  async addAktivitaet(
    projektId: string,
    aktivitaet: Omit<DebitorAktivitaet, 'id' | 'erstelltAm'>
  ): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      const neueAktivitaet: DebitorAktivitaet = {
        ...aktivitaet,
        id: ID.unique(),
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        aktivitaeten,
      });

      return this.createDebitorView(projekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Aktivität:', error);
      throw error;
    }
  }

  // =====================================================
  // STATUS
  // =====================================================

  /**
   * Berechnet und aktualisiert den Status
   */
  async berechneUndAktualisiereStatus(projektId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);
      const projekt = await projektService.getProjekt(projektId);

      const rechnungsbetrag = this.parseRechnungsbetrag(projekt);
      const bezahlt = (metadaten.zahlungen || []).reduce((sum, z) => sum + z.betrag, 0);

      let neuerStatus: DebitorStatus;

      if (bezahlt >= rechnungsbetrag) {
        neuerStatus = 'bezahlt';
      } else if (bezahlt > 0) {
        neuerStatus = 'teilbezahlt';
      } else if (metadaten.mahnstufe > 0) {
        neuerStatus = 'gemahnt';
      } else {
        neuerStatus = this.berechneStatusAusRechnung(projekt, metadaten.zahlungszielTage);
      }

      if (neuerStatus !== metadaten.status) {
        const aktualisiert = await this.updateMetadaten(projektId, {
          status: neuerStatus,
        });
        return this.createDebitorView(projekt, aktualisiert);
      }

      return this.createDebitorView(projekt, metadaten);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
      throw error;
    }
  }

  /**
   * Markiert als bezahlt
   */
  async markiereAlsBezahlt(projektId: string): Promise<DebitorView> {
    try {
      const metadaten = await this.getOrCreateMetadaten(projektId);

      // Projekt-Status auf bezahlt setzen
      await projektService.updateProjekt(projektId, {
        bezahltAm: new Date().toISOString(),
        status: 'bezahlt',
      });

      // Aktivität hinzufügen
      const neueAktivitaet: DebitorAktivitaet = {
        id: ID.unique(),
        typ: 'status_aenderung',
        titel: 'Als bezahlt markiert',
        erstelltAm: new Date().toISOString(),
      };

      const aktivitaeten = [...(metadaten.aktivitaeten || []), neueAktivitaet];

      const aktualisiert = await this.updateMetadaten(projektId, {
        status: 'bezahlt',
        aktivitaeten,
      });

      // Projekt neu laden nach Update
      const aktualisierteProjekt = await projektService.getProjekt(projektId);
      return this.createDebitorView(aktualisierteProjekt, aktualisiert);
    } catch (error) {
      console.error('Fehler beim Markieren als bezahlt:', error);
      throw error;
    }
  }

  // =====================================================
  // STATISTIK
  // =====================================================

  /**
   * Berechnet die Debitorenstatistik
   */
  async berechneStatistik(saisonjahr?: number): Promise<DebitorenStatistik> {
    try {
      const debitoren = await this.loadAlleDebitoren({ saisonjahr });

      const statistik: DebitorenStatistik = {
        gesamtForderungen: 0,
        gesamtOffen: 0,
        gesamtBezahlt: 0,
        anzahlOffen: 0,
        anzahlBezahlt: 0,
        ueberfaelligBetrag: 0,
        ueberfaelligAnzahl: 0,
        gemahntBetrag: 0,
        gemahntAnzahl: 0,
        nachMahnstufe: {
          0: { anzahl: 0, betrag: 0 },
          1: { anzahl: 0, betrag: 0 },
          2: { anzahl: 0, betrag: 0 },
          3: { anzahl: 0, betrag: 0 },
          4: { anzahl: 0, betrag: 0 },
        },
        nachSaisonjahr: {},
        kritischeDebitoren: [],
        naechsteFaelligkeiten: [],
      };

      const heute = new Date();
      const in7Tagen = new Date(heute);
      in7Tagen.setDate(in7Tagen.getDate() + 7);

      for (const debitor of debitoren) {
        statistik.gesamtForderungen += debitor.rechnungsbetrag;

        // Nach Saisonjahr
        if (!statistik.nachSaisonjahr[debitor.saisonjahr]) {
          statistik.nachSaisonjahr[debitor.saisonjahr] = { anzahl: 0, betrag: 0 };
        }
        statistik.nachSaisonjahr[debitor.saisonjahr].anzahl++;
        statistik.nachSaisonjahr[debitor.saisonjahr].betrag += debitor.offenerBetrag;

        // Nach Mahnstufe
        statistik.nachMahnstufe[debitor.mahnstufe].anzahl++;
        statistik.nachMahnstufe[debitor.mahnstufe].betrag += debitor.offenerBetrag;

        if (debitor.status === 'bezahlt') {
          statistik.gesamtBezahlt += debitor.rechnungsbetrag;
          statistik.anzahlBezahlt++;
        } else {
          statistik.gesamtOffen += debitor.offenerBetrag;
          statistik.anzahlOffen++;

          if (debitor.status === 'ueberfaellig' || debitor.tageUeberfaellig > 14) {
            statistik.ueberfaelligBetrag += debitor.offenerBetrag;
            statistik.ueberfaelligAnzahl++;
          }

          if (debitor.status === 'gemahnt' || debitor.mahnstufe > 0) {
            statistik.gemahntBetrag += debitor.offenerBetrag;
            statistik.gemahntAnzahl++;
          }

          // Kritische Debitoren (Top 10 nach offenem Betrag)
          statistik.kritischeDebitoren.push(debitor);

          // Nächste Fälligkeiten (in den nächsten 7 Tagen)
          const faelligkeit = new Date(debitor.faelligkeitsdatum);
          if (faelligkeit >= heute && faelligkeit <= in7Tagen) {
            statistik.naechsteFaelligkeiten.push(debitor);
          }
        }
      }

      // Sortiere kritische Debitoren nach offenem Betrag
      statistik.kritischeDebitoren.sort((a, b) => b.offenerBetrag - a.offenerBetrag);
      statistik.kritischeDebitoren = statistik.kritischeDebitoren.slice(0, 10);

      // Sortiere nächste Fälligkeiten nach Datum
      statistik.naechsteFaelligkeiten.sort(
        (a, b) => new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime()
      );

      return statistik;
    } catch (error) {
      console.error('Fehler beim Berechnen der Statistik:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER
  // =====================================================

  /**
   * Parst ein Metadaten-Dokument
   */
  private parseMetadatenDocument(doc: unknown): DebitorMetadaten | null {
    try {
      const d = doc as Record<string, unknown>;
      if (d.data && typeof d.data === 'string') {
        const parsed = JSON.parse(d.data);
        return {
          ...parsed,
          id: d.$id as string,
        };
      }
      return {
        id: d.$id as string,
        projektId: d.projektId as string,
        status: (d.status as DebitorStatus) || 'offen',
        mahnstufe: (d.mahnstufe as DebitorMahnstufe) || 0,
        prioritaet: (d.prioritaet as string) || 'normal',
        zahlungen: [],
        aktivitaeten: [],
        erstelltAm: d.erstelltAm as string,
        geaendertAm: d.geaendertAm as string,
      } as DebitorMetadaten;
    } catch {
      return null;
    }
  }

  /**
   * Erstellt ein DebitorView aus Projekt + Metadaten
   */
  private createDebitorView(projekt: Projekt, metadaten: DebitorMetadaten | null): DebitorView {
    const rechnungsbetrag = this.parseRechnungsbetrag(projekt);
    const zahlungen = metadaten?.zahlungen || [];
    const bezahlt = zahlungen.reduce((sum, z) => sum + z.betrag, 0);
    const zahlungszielTage = metadaten?.zahlungszielTage || STANDARD_ZAHLUNGSZIEL_TAGE;

    const faelligkeitsdatum = this.berechneFaelligkeitsdatum(
      projekt.rechnungsdatum || projekt.erstelltAm,
      zahlungszielTage
    );

    const tageUeberfaellig = this.berechneTageUeberfaellig(faelligkeitsdatum);

    // Status berechnen falls keine Metadaten vorhanden
    let status: DebitorStatus;
    if (metadaten) {
      status = metadaten.status;
    } else if (projekt.status === 'bezahlt') {
      status = 'bezahlt';
    } else {
      status = this.berechneStatusAusRechnung(projekt, zahlungszielTage);
    }

    return {
      projektId: projekt.id,
      kundeId: projekt.kundeId,
      kundennummer: projekt.kundennummer,
      kundenname: projekt.kundenname,
      kundenEmail: projekt.kundenEmail,
      ansprechpartner: projekt.ansprechpartner,
      rechnungsnummer: projekt.rechnungsnummer,
      rechnungsdatum: projekt.rechnungsdatum,
      rechnungsbetrag,
      saisonjahr: projekt.saisonjahr,

      metadatenId: metadaten?.id,
      status,
      mahnstufe: metadaten?.mahnstufe || 0,
      prioritaet: metadaten?.prioritaet || 'normal',
      zahlungen,
      aktivitaeten: metadaten?.aktivitaeten || [],
      notizen: metadaten?.notizen,
      gesperrt: metadaten?.gesperrt,
      sperrgrund: metadaten?.sperrgrund,
      letzteMahnungAm: metadaten?.letzteMahnungAm,

      offenerBetrag: Math.max(0, rechnungsbetrag - bezahlt),
      bezahlterBetrag: bezahlt,
      faelligkeitsdatum,
      tageUeberfaellig,
      prozentBezahlt: rechnungsbetrag > 0 ? (bezahlt / rechnungsbetrag) * 100 : 0,
      zahlungszielTage,
    };
  }

  /**
   * Parst den Rechnungsbetrag aus dem Projekt
   */
  private parseRechnungsbetrag(projekt: Projekt): number {
    if (projekt.rechnungsDaten) {
      try {
        const daten: RechnungsDaten = JSON.parse(projekt.rechnungsDaten);
        return daten.gesamtBrutto || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Berechnet das Fälligkeitsdatum
   */
  private berechneFaelligkeitsdatum(rechnungsdatum: string, zahlungszielTage: number): string {
    const datum = new Date(rechnungsdatum);
    datum.setDate(datum.getDate() + zahlungszielTage);
    return datum.toISOString().split('T')[0];
  }

  /**
   * Berechnet die Tage überfällig
   */
  private berechneTageUeberfaellig(faelligkeitsdatum: string): number {
    const heute = new Date();
    const faellig = new Date(faelligkeitsdatum);
    const diff = heute.getTime() - faellig.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Berechnet den Status aus Rechnungsdaten
   */
  private berechneStatusAusRechnung(
    projekt: Projekt,
    zahlungszielTage?: number
  ): DebitorStatus {
    if (projekt.status === 'bezahlt' || projekt.bezahltAm) {
      return 'bezahlt';
    }

    const rechnungsdatum = projekt.rechnungsdatum || projekt.erstelltAm;
    const faelligkeitsdatum = this.berechneFaelligkeitsdatum(
      rechnungsdatum,
      zahlungszielTage || STANDARD_ZAHLUNGSZIEL_TAGE
    );
    const tageUeberfaellig = this.berechneTageUeberfaellig(faelligkeitsdatum);

    if (tageUeberfaellig > 14) {
      return 'ueberfaellig';
    } else if (tageUeberfaellig > 0) {
      return 'faellig';
    }

    return 'offen';
  }

  /**
   * Prüft ob ein Debitor dem Filter entspricht
   */
  private matchesFilter(debitor: DebitorView, filter?: DebitorFilter): boolean {
    if (!filter) return true;

    if (filter.status?.length && !filter.status.includes(debitor.status)) {
      return false;
    }

    if (filter.mahnstufe?.length && !filter.mahnstufe.includes(debitor.mahnstufe)) {
      return false;
    }

    if (filter.prioritaet?.length && !filter.prioritaet.includes(debitor.prioritaet)) {
      return false;
    }

    if (filter.nurUeberfaellig && debitor.tageUeberfaellig <= 0) {
      return false;
    }

    if (filter.nurGesperrt && !debitor.gesperrt) {
      return false;
    }

    if (filter.betragMin !== undefined && debitor.offenerBetrag < filter.betragMin) {
      return false;
    }

    if (filter.betragMax !== undefined && debitor.offenerBetrag > filter.betragMax) {
      return false;
    }

    if (filter.suche) {
      const suchtext = filter.suche.toLowerCase();
      const matches =
        debitor.kundenname.toLowerCase().includes(suchtext) ||
        debitor.rechnungsnummer?.toLowerCase().includes(suchtext) ||
        debitor.kundennummer?.toLowerCase().includes(suchtext);
      if (!matches) return false;
    }

    return true;
  }
}

export const debitorService = new DebitorService();
