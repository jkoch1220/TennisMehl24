import { ID, Query, Models } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  PLATZBAUER_PROJEKTE_COLLECTION_ID,
  PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
} from '../config/appwrite';
import {
  PlatzbauerProjekt,
  ProjektZuordnung,
  PlatzbauermitVereinen,
  PlatzbauerPosition,
  PBVFilter,
  PBVStatistik,
  PBVKanbanDaten,
  PBVKanbanSpalte,
} from '../types/platzbauer';
import { ProjektStatus, Projekt } from '../types/projekt';
import { SaisonKunde, SaisonKundeMitDaten } from '../types/saisonplanung';
import { saisonplanungService } from './saisonplanungService';
import { projektService } from './projektService';

// Helper: Parse Document mit data-Feld
// Kombiniert direkte Dokument-Felder mit data-JSON für Abwärtskompatibilität
function parseDocument<T>(doc: Models.Document, fallback: T): T {
  const anyDoc = doc as unknown as Record<string, unknown>;

  // Basis: direkte Dokument-Felder (für bestehende Dokumente)
  const direkteFelder: Record<string, unknown> = {
    id: doc.$id,
    $id: doc.$id,
  };

  // Kopiere alle bekannten direkten Felder
  const bekannteFelder = [
    'platzbauerId', 'platzbauerName', 'projektName', 'saisonjahr',
    'status', 'typ', 'hauptprojektId', 'nachtragNummer',
    'erstelltAm', 'geaendertAm',
    // Zuordnungen
    'vereinsProjektId', 'platzbauerprojektId', 'position',
  ];

  for (const feld of bekannteFelder) {
    if (feld in anyDoc && anyDoc[feld] !== undefined && anyDoc[feld] !== null) {
      direkteFelder[feld] = anyDoc[feld];
    }
  }

  // Dann: data-JSON parsen und mergen (überschreibt direkte Felder wenn vorhanden)
  let parsedData: Record<string, unknown> = {};
  if (anyDoc?.data && typeof anyDoc.data === 'string') {
    try {
      parsedData = JSON.parse(anyDoc.data as string);
    } catch (error) {
      console.warn('⚠️ Konnte data-Feld nicht parsen:', error);
    }
  }

  // Kombiniere: fallback < direkte Felder < data-JSON
  return {
    ...fallback,
    ...direkteFelder,
    ...parsedData,
    id: doc.$id,
    $id: doc.$id,
  } as T;
}

// Helper: To Payload für Appwrite
function toPayload<T>(
  obj: T,
  allowedKeys: string[] = []
): Record<string, unknown> {
  const payload: Record<string, unknown> = { data: JSON.stringify(obj) };
  const anyObj = obj as Record<string, unknown>;
  for (const key of allowedKeys) {
    if (key in anyObj) payload[key] = anyObj[key];
  }
  return payload;
}

// Kanban-Status-Definitionen
const KANBAN_STATUS: Array<{ id: ProjektStatus; label: string; color: string; bgColor: string }> = [
  { id: 'angebot', label: 'Angebot', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  { id: 'angebot_versendet', label: 'Angebot versendet', color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200' },
  { id: 'auftragsbestaetigung', label: 'Auftragsbestätigung', color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  { id: 'lieferschein', label: 'Lieferschein', color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  { id: 'rechnung', label: 'Rechnung', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  { id: 'bezahlt', label: 'Bezahlt', color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  { id: 'verloren', label: 'Verloren', color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-200' },
];

class PlatzbauerverwaltungService {
  // ==================== PLATZBAUER LADEN ====================

  /**
   * Alle Platzbauer laden (SaisonKunden mit typ='platzbauer')
   */
  async loadAllePlatzbauer(): Promise<SaisonKunde[]> {
    const alleKunden = await saisonplanungService.loadAlleKunden();
    return alleKunden.filter(k => k.typ === 'platzbauer' && k.aktiv);
  }

  /**
   * Einzelnen Platzbauer laden
   */
  async loadPlatzbauer(platzbauerId: string): Promise<SaisonKunde | null> {
    const kunde = await saisonplanungService.loadKunde(platzbauerId);
    if (kunde && kunde.typ === 'platzbauer') {
      return kunde;
    }
    return null;
  }

  /**
   * Alle Platzbauer mit zugeordneten Vereinen und Projekten laden
   */
  async loadAllePlatzbauermitVereinen(saisonjahr: number): Promise<PlatzbauermitVereinen[]> {
    // Lade alle Kunden und Platzbauer-Projekte parallel
    const [alleKunden, alleProjekte] = await Promise.all([
      saisonplanungService.loadAlleKunden(),
      this.loadPlatzbauerprojekte(saisonjahr),
    ]);

    const platzbauer = alleKunden.filter(k => k.typ === 'platzbauer' && k.aktiv);
    const vereine = alleKunden.filter(k => k.typ === 'verein' && k.aktiv);

    // Gruppiere Vereine nach Platzbauer
    const vereineNachPlatzbauer = new Map<string, SaisonKunde[]>();
    for (const verein of vereine) {
      if (verein.standardPlatzbauerId) {
        const liste = vereineNachPlatzbauer.get(verein.standardPlatzbauerId) || [];
        liste.push(verein);
        vereineNachPlatzbauer.set(verein.standardPlatzbauerId, liste);
      }
    }

    // Gruppiere Projekte nach Platzbauer
    const projekteNachPlatzbauer = new Map<string, PlatzbauerProjekt[]>();
    for (const projekt of alleProjekte) {
      const liste = projekteNachPlatzbauer.get(projekt.platzbauerId) || [];
      liste.push(projekt);
      projekteNachPlatzbauer.set(projekt.platzbauerId, liste);
    }

    // Baue das Ergebnis
    return platzbauer.map(pb => {
      const pbVereine = vereineNachPlatzbauer.get(pb.id) || [];
      const pbProjekte = projekteNachPlatzbauer.get(pb.id) || [];

      return {
        platzbauer: pb,
        vereine: pbVereine.map(v => ({ kunde: v } as SaisonKundeMitDaten)),
        projekte: pbProjekte,
        statistik: {
          anzahlVereine: pbVereine.length,
          gesamtMenge: pbProjekte.reduce((sum, p) => sum + (p.gesamtMenge || 0), 0),
          offeneProjekte: pbProjekte.filter(p => !['bezahlt', 'verloren'].includes(p.status)).length,
          abgeschlosseneProjekte: pbProjekte.filter(p => p.status === 'bezahlt').length,
        },
      };
    });
  }

  /**
   * Vereine für einen Platzbauer laden
   */
  async loadVereineFuerPlatzbauer(platzbauerId: string): Promise<SaisonKundeMitDaten[]> {
    const alleKunden = await saisonplanungService.loadAlleKunden();
    const vereine = alleKunden.filter(
      k => k.typ === 'verein' && k.aktiv && k.standardPlatzbauerId === platzbauerId
    );
    return vereine.map(v => ({ kunde: v } as SaisonKundeMitDaten));
  }

  // ==================== PLATZBAUER-PROJEKTE ====================

  /**
   * Alle Platzbauer-Projekte für ein Jahr laden
   */
  async loadPlatzbauerprojekte(saisonjahr: number, filter?: PBVFilter): Promise<PlatzbauerProjekt[]> {
    try {
      const queries: string[] = [
        Query.equal('saisonjahr', saisonjahr),
        Query.orderDesc('$createdAt'),
        Query.limit(1000),
      ];

      if (filter?.status && filter.status.length > 0) {
        queries.push(Query.equal('status', filter.status));
      }

      if (filter?.platzbauerId) {
        queries.push(Query.equal('platzbauerId', filter.platzbauerId));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        PLATZBAUER_PROJEKTE_COLLECTION_ID,
        queries
      );

      let projekte = response.documents.map(doc =>
        parseDocument<PlatzbauerProjekt>(doc, {
          id: doc.$id,
          platzbauerId: '',
          platzbauerName: '',
          projektName: '',
          saisonjahr,
          status: 'angebot',
          typ: 'saisonprojekt',
          erstelltAm: doc.$createdAt,
          geaendertAm: doc.$updatedAt || doc.$createdAt,
        })
      );

      // Textsuche (clientseitig)
      if (filter?.suche) {
        const suche = filter.suche.toLowerCase();
        projekte = projekte.filter(p =>
          p.platzbauerName.toLowerCase().includes(suche) ||
          p.projektName.toLowerCase().includes(suche)
        );
      }

      return projekte;
    } catch (error) {
      console.error('Fehler beim Laden der Platzbauer-Projekte:', error);
      return [];
    }
  }

  /**
   * Projekte eines Platzbauers laden
   */
  async loadProjekteFuerPlatzbauer(platzbauerId: string, saisonjahr: number): Promise<PlatzbauerProjekt[]> {
    return this.loadPlatzbauerprojekte(saisonjahr, { platzbauerId });
  }

  /**
   * Einzelnes Platzbauer-Projekt laden
   */
  async getPlatzbauerprojekt(projektId: string): Promise<PlatzbauerProjekt | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        PLATZBAUER_PROJEKTE_COLLECTION_ID,
        projektId
      );
      return parseDocument<PlatzbauerProjekt>(doc, {
        id: doc.$id,
        platzbauerId: '',
        platzbauerName: '',
        projektName: '',
        saisonjahr: new Date().getFullYear(),
        status: 'angebot',
        typ: 'saisonprojekt',
        erstelltAm: doc.$createdAt,
        geaendertAm: doc.$updatedAt || doc.$createdAt,
      });
    } catch (error) {
      console.error('Fehler beim Laden des Platzbauer-Projekts:', error);
      return null;
    }
  }

  /**
   * Neues Platzbauer-Projekt erstellen (Saisonprojekt oder Nachtrag)
   */
  async createPlatzbauerprojekt(
    platzbauerId: string,
    saisonjahr: number,
    optionen?: { istNachtrag?: boolean; hauptprojektId?: string; status?: ProjektStatus }
  ): Promise<PlatzbauerProjekt> {
    // Lade Platzbauer-Daten
    const platzbauer = await this.loadPlatzbauer(platzbauerId);
    if (!platzbauer) {
      throw new Error('Platzbauer nicht gefunden');
    }

    const dokumentId = ID.unique();
    const jetzt = new Date().toISOString();

    let projektName = `${platzbauer.name} ${saisonjahr}`;
    let typ: 'saisonprojekt' | 'nachtrag' = 'saisonprojekt';
    let nachtragNummer: number | undefined;

    if (optionen?.istNachtrag) {
      // Ermittle die nächste Nachtrag-Nummer
      const bestehendeNachtraege = await this.loadProjekteFuerPlatzbauer(platzbauerId, saisonjahr);
      const nachtraege = bestehendeNachtraege.filter(p => p.typ === 'nachtrag');
      nachtragNummer = nachtraege.length + 1;
      projektName = `${platzbauer.name} ${saisonjahr} - Nachtrag ${nachtragNummer}`;
      typ = 'nachtrag';
    }

    const neuesProjekt: PlatzbauerProjekt = {
      id: dokumentId,
      platzbauerId,
      platzbauerName: platzbauer.name,
      projektName,
      saisonjahr,
      status: optionen?.status || 'angebot',
      typ,
      hauptprojektId: optionen?.hauptprojektId,
      nachtragNummer,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    const payload = toPayload(neuesProjekt, [
      'platzbauerId',
      'platzbauerName',
      'saisonjahr',
      'status',
      'typ',
      'hauptprojektId',
      'erstelltAm',
      'geaendertAm',
    ]);

    // data-Feld ist required - leeres JSON-Objekt als Startwert
    (payload as any).data = JSON.stringify({});

    await databases.createDocument(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      dokumentId,
      payload
    );

    return neuesProjekt;
  }

  /**
   * Nachtrag-Projekt erstellen
   */
  async createNachtrag(hauptprojektId: string): Promise<PlatzbauerProjekt> {
    const hauptprojekt = await this.getPlatzbauerprojekt(hauptprojektId);
    if (!hauptprojekt) {
      throw new Error('Hauptprojekt nicht gefunden');
    }

    return this.createPlatzbauerprojekt(hauptprojekt.platzbauerId, hauptprojekt.saisonjahr, {
      istNachtrag: true,
      hauptprojektId,
    });
  }

  /**
   * Platzbauer-Projekt aktualisieren
   */
  async updatePlatzbauerprojekt(
    projektId: string,
    updates: Partial<PlatzbauerProjekt>
  ): Promise<PlatzbauerProjekt> {
    const bestehendes = await this.getPlatzbauerprojekt(projektId);
    if (!bestehendes) {
      throw new Error('Projekt nicht gefunden');
    }

    const aktualisiertes: PlatzbauerProjekt = {
      ...bestehendes,
      ...updates,
      geaendertAm: new Date().toISOString(),
    };

    const payload = toPayload(aktualisiertes, [
      'platzbauerId',
      'platzbauerName',
      'saisonjahr',
      'status',
      'typ',
      'hauptprojektId',
      'erstelltAm',
      'geaendertAm',
    ]);

    await databases.updateDocument(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      projektId,
      payload
    );

    return aktualisiertes;
  }

  /**
   * Projekt-Status ändern (für Kanban Drag-and-Drop)
   */
  async updateProjektStatus(projektId: string, neuerStatus: ProjektStatus): Promise<PlatzbauerProjekt> {
    return this.updatePlatzbauerprojekt(projektId, { status: neuerStatus });
  }

  /**
   * Platzbauer-Projekt löschen
   */
  async deletePlatzbauerprojekt(projektId: string): Promise<void> {
    // Lösche zuerst alle Zuordnungen
    const zuordnungen = await this.loadZuordnungen(projektId);
    for (const zuordnung of zuordnungen) {
      await this.entferneZuordnung(zuordnung.id);
    }

    // Dann das Projekt selbst
    await databases.deleteDocument(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      projektId
    );
  }

  // ==================== ZUORDNUNGEN ====================

  /**
   * Vereinsprojekt einem Platzbauerprojekt zuordnen
   */
  async ordneVereinsprojektZu(
    vereinsProjektId: string,
    platzbauerprojektId: string
  ): Promise<ProjektZuordnung> {
    // Prüfe ob Zuordnung bereits existiert
    const bestehende = await this.loadZuordnungen(platzbauerprojektId);
    const existiert = bestehende.find(z => z.vereinsProjektId === vereinsProjektId);
    if (existiert) {
      return existiert;
    }

    const dokumentId = ID.unique();
    const jetzt = new Date().toISOString();

    // Bestimme Position (nächste freie)
    const position = bestehende.length + 1;

    const neueZuordnung: ProjektZuordnung = {
      id: dokumentId,
      vereinsProjektId,
      platzbauerprojektId,
      position,
      erstelltAm: jetzt,
    };

    const payload = toPayload(neueZuordnung, [
      'vereinsProjektId',
      'platzbauerprojektId',
      'position',
      'erstelltAm',
    ]);

    await databases.createDocument(
      DATABASE_ID,
      PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
      dokumentId,
      payload
    );

    // Aktualisiere das Vereinsprojekt
    await projektService.updateProjekt(vereinsProjektId, {
      istPlatzbauerprojekt: true,
      zugeordnetesPlatzbauerprojektId: platzbauerprojektId,
    });

    // Aktualisiere die aggregierten Daten im Platzbauerprojekt
    await this.aktualisiereAggregierteDaten(platzbauerprojektId);

    return neueZuordnung;
  }

  /**
   * Zuordnung entfernen
   */
  async entferneZuordnung(zuordnungId: string): Promise<void> {
    // Lade Zuordnung um das Vereinsprojekt zu aktualisieren
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
        zuordnungId
      );
      const zuordnung = parseDocument<ProjektZuordnung>(doc, {
        id: doc.$id,
        vereinsProjektId: '',
        platzbauerprojektId: '',
        position: 0,
        erstelltAm: '',
      });

      // Aktualisiere das Vereinsprojekt
      if (zuordnung.vereinsProjektId) {
        await projektService.updateProjekt(zuordnung.vereinsProjektId, {
          istPlatzbauerprojekt: false,
          zugeordnetesPlatzbauerprojektId: undefined,
        });
      }

      // Lösche die Zuordnung
      await databases.deleteDocument(
        DATABASE_ID,
        PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
        zuordnungId
      );

      // Aktualisiere aggregierte Daten
      if (zuordnung.platzbauerprojektId) {
        await this.aktualisiereAggregierteDaten(zuordnung.platzbauerprojektId);
      }
    } catch (error) {
      console.error('Fehler beim Entfernen der Zuordnung:', error);
      throw error;
    }
  }

  /**
   * Zuordnungen für ein Platzbauerprojekt laden
   */
  async loadZuordnungen(platzbauerprojektId: string): Promise<ProjektZuordnung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
        [
          Query.equal('platzbauerprojektId', platzbauerprojektId),
          Query.orderAsc('position'),
          Query.limit(500),
        ]
      );

      return response.documents.map(doc =>
        parseDocument<ProjektZuordnung>(doc, {
          id: doc.$id,
          vereinsProjektId: '',
          platzbauerprojektId: '',
          position: 0,
          erstelltAm: doc.$createdAt,
        })
      );
    } catch (error) {
      console.error('Fehler beim Laden der Zuordnungen:', error);
      return [];
    }
  }

  /**
   * Positionen aus Vereinsprojekten aggregieren (für Dokumente)
   */
  async aggregierePositionen(platzbauerprojektId: string): Promise<PlatzbauerPosition[]> {
    const zuordnungen = await this.loadZuordnungen(platzbauerprojektId);
    const positionen: PlatzbauerPosition[] = [];

    for (const zuordnung of zuordnungen) {
      try {
        const vereinsprojekt = await projektService.getProjekt(zuordnung.vereinsProjektId);
        if (!vereinsprojekt) continue;

        // Lade Kundendaten für Lieferadresse
        let lieferadresse: PlatzbauerPosition['lieferadresse'];
        if (vereinsprojekt.lieferadresse) {
          lieferadresse = vereinsprojekt.lieferadresse;
        } else if (vereinsprojekt.kundeId) {
          const kunde = await saisonplanungService.loadKunde(vereinsprojekt.kundeId);
          if (kunde?.lieferadresse) {
            lieferadresse = {
              strasse: kunde.lieferadresse.strasse,
              plz: kunde.lieferadresse.plz,
              ort: kunde.lieferadresse.ort,
            };
          }
        }

        positionen.push({
          vereinId: vereinsprojekt.kundeId,
          vereinsname: vereinsprojekt.kundenname,
          vereinsprojektId: vereinsprojekt.id,
          menge: vereinsprojekt.angefragteMenge || 0,
          einzelpreis: vereinsprojekt.preisProTonne || 0,
          gesamtpreis: (vereinsprojekt.angefragteMenge || 0) * (vereinsprojekt.preisProTonne || 0),
          lieferadresse,
          projektStatus: vereinsprojekt.status,
          lieferscheinErstellt: !!vereinsprojekt.lieferscheinId,
          lieferscheinId: vereinsprojekt.lieferscheinId,
        });
      } catch (error) {
        console.error(`Fehler beim Laden des Vereinsprojekts ${zuordnung.vereinsProjektId}:`, error);
      }
    }

    return positionen;
  }

  /**
   * Aggregierte Daten im Platzbauerprojekt aktualisieren
   */
  private async aktualisiereAggregierteDaten(platzbauerprojektId: string): Promise<void> {
    const positionen = await this.aggregierePositionen(platzbauerprojektId);

    const gesamtMenge = positionen.reduce((sum, p) => sum + p.menge, 0);
    const gesamtBrutto = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
    const anzahlVereine = positionen.length;

    await this.updatePlatzbauerprojekt(platzbauerprojektId, {
      gesamtMenge,
      gesamtBrutto,
      anzahlVereine,
    });
  }

  // ==================== AUTOMATISIERUNGEN ====================

  /**
   * Saisonprojekte für alle aktiven Platzbauer erstellen (bei Saisonstart)
   */
  async erstelleSaisonprojekteFuerAllePlatzbauer(saisonjahr: number): Promise<PlatzbauerProjekt[]> {
    const platzbauer = await this.loadAllePlatzbauer();
    const erstellteProjekte: PlatzbauerProjekt[] = [];

    for (const pb of platzbauer) {
      // Prüfe ob bereits ein Saisonprojekt existiert
      const bestehende = await this.loadProjekteFuerPlatzbauer(pb.id, saisonjahr);
      const hatSaisonprojekt = bestehende.some(p => p.typ === 'saisonprojekt');

      if (!hatSaisonprojekt) {
        const neuesProjekt = await this.createPlatzbauerprojekt(pb.id, saisonjahr);
        erstellteProjekte.push(neuesProjekt);
      }
    }

    return erstellteProjekte;
  }

  /**
   * Automatische Zuordnung prüfen wenn Vereinsprojekt erstellt wird
   */
  async pruefeUndOrdneZu(vereinsProjekt: Projekt): Promise<ProjektZuordnung | null> {
    // Prüfe ob das Projekt einem Platzbauer zugeordnet werden soll
    if (vereinsProjekt.bezugsweg !== 'ueber_platzbauer' || !vereinsProjekt.platzbauerId) {
      return null;
    }

    // Finde das passende Platzbauer-Saisonprojekt
    const platzbauerprojekte = await this.loadProjekteFuerPlatzbauer(
      vereinsProjekt.platzbauerId,
      vereinsProjekt.saisonjahr
    );

    // Bevorzuge das Haupt-Saisonprojekt
    let zielProjekt = platzbauerprojekte.find(p => p.typ === 'saisonprojekt');

    // Falls kein Saisonprojekt existiert, erstelle eines
    if (!zielProjekt) {
      zielProjekt = await this.createPlatzbauerprojekt(
        vereinsProjekt.platzbauerId,
        vereinsProjekt.saisonjahr
      );
    }

    // Ordne zu
    return this.ordneVereinsprojektZu(vereinsProjekt.id, zielProjekt.id);
  }

  // ==================== KANBAN ====================

  /**
   * Kanban-Board Daten laden
   */
  async loadKanbanDaten(saisonjahr: number, filter?: PBVFilter): Promise<PBVKanbanDaten> {
    const projekte = await this.loadPlatzbauerprojekte(saisonjahr, filter);

    // Gruppiere nach Status
    const spalten: PBVKanbanSpalte[] = KANBAN_STATUS.map(status => ({
      ...status,
      projekte: projekte.filter(p => p.status === status.id),
    }));

    // Statistik
    const statistik = {
      gesamt: projekte.length,
      nachTyp: {
        saisonprojekt: projekte.filter(p => p.typ === 'saisonprojekt').length,
        nachtrag: projekte.filter(p => p.typ === 'nachtrag').length,
      },
    };

    return { spalten, statistik };
  }

  // ==================== STATISTIK ====================

  /**
   * Dashboard-Statistik berechnen
   */
  async berechneStatistik(saisonjahr: number): Promise<PBVStatistik> {
    const [platzbauer, projekte] = await Promise.all([
      this.loadAllePlatzbauermitVereinen(saisonjahr),
      this.loadPlatzbauerprojekte(saisonjahr),
    ]);

    // Zähle Projekte nach Status
    const projekteNachStatus: Record<ProjektStatus, number> = {
      angebot: 0,
      angebot_versendet: 0,
      auftragsbestaetigung: 0,
      lieferschein: 0,
      rechnung: 0,
      bezahlt: 0,
      verloren: 0,
    };

    for (const projekt of projekte) {
      projekteNachStatus[projekt.status]++;
    }

    // Berechne Summen
    const gesamtMenge = projekte.reduce((sum, p) => sum + (p.gesamtMenge || 0), 0);
    const gesamtUmsatz = projekte.reduce((sum, p) => sum + (p.gesamtBrutto || 0), 0);

    // Zähle Lieferscheine
    let lieferscheineGesamt = 0;
    let lieferscheineOffen = 0;

    for (const projekt of projekte) {
      const positionen = await this.aggregierePositionen(projekt.id);
      lieferscheineGesamt += positionen.length;
      lieferscheineOffen += positionen.filter(p => !p.lieferscheinErstellt).length;
    }

    return {
      gesamtPlatzbauer: platzbauer.length,
      aktivePlatzbauer: platzbauer.filter(pb => pb.projekte.length > 0).length,
      gesamtVereine: platzbauer.reduce((sum, pb) => sum + pb.vereine.length, 0),
      projekteNachStatus,
      gesamtMenge,
      gesamtUmsatz,
      lieferscheineGesamt,
      lieferscheineOffen,
    };
  }

  // ==================== HILFSMETHODEN ====================

  /**
   * Saisonprojekt für Platzbauer finden oder erstellen
   */
  async getOderErstelleSaisonprojekt(platzbauerId: string, saisonjahr: number): Promise<PlatzbauerProjekt> {
    const projekte = await this.loadProjekteFuerPlatzbauer(platzbauerId, saisonjahr);
    const saisonprojekt = projekte.find(p => p.typ === 'saisonprojekt');

    if (saisonprojekt) {
      return saisonprojekt;
    }

    return this.createPlatzbauerprojekt(platzbauerId, saisonjahr);
  }
}

export const platzbauerverwaltungService = new PlatzbauerverwaltungService();
