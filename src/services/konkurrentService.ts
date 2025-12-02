import { databases, DATABASE_ID, KONKURRENTEN_COLLECTION_ID } from '../config/appwrite';
import { 
  Konkurrent, 
  NeuerKonkurrent,
  LieferkostenBerechnung,
  LieferkostenModell,
  PLZLieferkostenZone
} from '../types/konkurrent';
import { ID } from 'appwrite';
import { geocodePLZ, geocodeAdresse } from '../utils/geocoding';

export const konkurrentService = {
  // ========== KONKURRENTEN VERWALTUNG ==========
  
  // Lade alle Konkurrenten
  async loadAlleKonkurrenten(): Promise<Konkurrent[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseKonkurrentDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Konkurrenten:', error);
      return [];
    }
  },

  // Lade einen einzelnen Konkurrenten
  async loadKonkurrent(id: string): Promise<Konkurrent | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        id
      );
      
      return this.parseKonkurrentDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Konkurrenten:', error);
      return null;
    }
  },

  // Erstelle neuen Konkurrenten
  async createKonkurrent(konkurrent: NeuerKonkurrent): Promise<Konkurrent> {
    const jetzt = new Date().toISOString();
    
    // Geocode Adresse falls noch nicht vorhanden
    let koordinaten = konkurrent.adresse.koordinaten;
    if (!koordinaten && konkurrent.adresse.plz) {
      if (konkurrent.adresse.strasse && konkurrent.adresse.ort) {
        koordinaten = await geocodeAdresse(
          konkurrent.adresse.strasse,
          konkurrent.adresse.plz,
          konkurrent.adresse.ort
        );
      } else {
        koordinaten = await geocodePLZ(konkurrent.adresse.plz);
      }
    }

    const neuerKonkurrent: Konkurrent = {
      ...konkurrent,
      id: ID.unique(),
      adresse: {
        ...konkurrent.adresse,
        koordinaten,
      },
      erstelltAm: konkurrent.erstelltAm || jetzt,
      geaendertAm: konkurrent.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        neuerKonkurrent.id,
        {
          data: JSON.stringify(neuerKonkurrent),
        }
      );
      
      return this.parseKonkurrentDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Konkurrenten:', error);
      throw error;
    }
  },

  // Aktualisiere Konkurrenten
  async updateKonkurrent(id: string, konkurrent: Partial<Konkurrent>): Promise<Konkurrent> {
    try {
      const aktuell = await this.loadKonkurrent(id);
      if (!aktuell) {
        throw new Error(`Konkurrent ${id} nicht gefunden`);
      }

      // Geocode Adresse falls geändert
      let koordinaten = konkurrent.adresse?.koordinaten || aktuell.adresse.koordinaten;
      if (konkurrent.adresse && !koordinaten) {
        if (konkurrent.adresse.strasse && konkurrent.adresse.plz && konkurrent.adresse.ort) {
          koordinaten = await geocodeAdresse(
            konkurrent.adresse.strasse,
            konkurrent.adresse.plz,
            konkurrent.adresse.ort
          );
        } else if (konkurrent.adresse.plz) {
          koordinaten = await geocodePLZ(konkurrent.adresse.plz);
        }
      }

      const aktualisiert: Konkurrent = {
        ...aktuell,
        ...konkurrent,
        id,
        adresse: {
          ...aktuell.adresse,
          ...konkurrent.adresse,
          koordinaten: koordinaten || aktuell.adresse.koordinaten,
        },
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseKonkurrentDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Konkurrenten:', error);
      throw error;
    }
  },

  // Lösche Konkurrenten
  async deleteKonkurrent(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Konkurrenten:', error);
      throw error;
    }
  },

  // ========== LIEFERKOSTEN BERECHNUNG ==========

  // Berechne Lieferkosten für eine PLZ für einen Konkurrenten
  async berechneLieferkosten(
    konkurrentId: string,
    plz: string
  ): Promise<LieferkostenBerechnung | null> {
    const konkurrent = await this.loadKonkurrent(konkurrentId);
    if (!konkurrent) {
      return null;
    }

    const modell = konkurrent.lieferkostenModell;
    let kostenProTonne = 0;
    let berechnungsgrundlage = '';

    switch (modell.typ) {
      case 'fest':
        kostenProTonne = modell.festerPreisProTonne || 0;
        berechnungsgrundlage = `Fester Preis: ${kostenProTonne.toFixed(2)} €/t`;
        break;

      case 'pro_km':
        // Berechne Distanz zwischen Konkurrent und PLZ
        const distanz = await this.berechneDistanz(
          konkurrent.adresse.koordinaten,
          plz
        );
        if (distanz && modell.preisProKm) {
          kostenProTonne = distanz * modell.preisProKm;
          berechnungsgrundlage = `${distanz.toFixed(1)} km × ${modell.preisProKm.toFixed(2)} €/km = ${kostenProTonne.toFixed(2)} €/t`;
        }
        break;

      case 'pro_tonne_km':
        const distanz2 = await this.berechneDistanz(
          konkurrent.adresse.koordinaten,
          plz
        );
        if (distanz2 && modell.preisProTonneKm) {
          kostenProTonne = distanz2 * modell.preisProTonneKm;
          berechnungsgrundlage = `${distanz2.toFixed(1)} km × ${modell.preisProTonneKm.toFixed(2)} €/(t×km) = ${kostenProTonne.toFixed(2)} €/t`;
        }
        break;

      case 'zonen':
        kostenProTonne = this.findeZonenPreis(modell.zonen || [], plz);
        berechnungsgrundlage = kostenProTonne > 0
          ? `Zonenpreis für PLZ ${plz}: ${kostenProTonne.toFixed(2)} €/t`
          : `Keine Zone für PLZ ${plz} gefunden`;
        break;
    }

    return {
      plz,
      kostenProTonne,
      konkurrentId: konkurrent.id,
      konkurrentName: konkurrent.name,
      berechnungsgrundlage,
    };
  },

  // Berechne Lieferkosten für alle Konkurrenten für eine PLZ
  async berechneLieferkostenAlleKonkurrenten(
    plz: string
  ): Promise<LieferkostenBerechnung[]> {
    const konkurrenten = await this.loadAlleKonkurrenten();
    const berechnungen: LieferkostenBerechnung[] = [];

    for (const konkurrent of konkurrenten) {
      // Nur Konkurrenten die Tennis-Sand herstellen
      if (konkurrent.produkte.includes('tennissand')) {
        const berechnung = await this.berechneLieferkosten(konkurrent.id, plz);
        if (berechnung) {
          berechnungen.push(berechnung);
        }
      }
    }

    return berechnungen.sort((a, b) => a.kostenProTonne - b.kostenProTonne);
  },

  // Berechne Distanz zwischen Koordinaten und PLZ
  async berechneDistanz(
    koordinaten?: [number, number],
    plz?: string
  ): Promise<number | null> {
    if (!koordinaten || !plz) {
      return null;
    }

    // Geocode PLZ
    const plzKoordinaten = await geocodePLZ(plz);
    if (!plzKoordinaten) {
      return null;
    }

    // Berechne Distanz mit Haversine-Formel
    return this.haversineDistanz(koordinaten, plzKoordinaten);
  },

  // Haversine-Formel für Distanzberechnung
  haversineDistanz(
    [lon1, lat1]: [number, number],
    [lon2, lat2]: [number, number]
  ): number {
    const R = 6371; // Erdradius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  },

  // Finde Preis für PLZ in Zonen
  findeZonenPreis(zonen: PLZLieferkostenZone[], plz: string): number {
    for (const zone of zonen) {
      if (this.plzPasstZuZone(plz, zone.plzBereich)) {
        return zone.kostenProTonne;
      }
    }
    return 0;
  },

  // Prüfe ob PLZ zu Zone passt
  plzPasstZuZone(plz: string, plzBereich: string): boolean {
    // Format: "80xxx" oder "80000-80999"
    if (plzBereich.includes('-')) {
      const [von, bis] = plzBereich.split('-').map(p => parseInt(p));
      const plzNum = parseInt(plz);
      return plzNum >= von && plzNum <= bis;
    } else if (plzBereich.endsWith('xxx')) {
      const prefix = plzBereich.replace('xxx', '');
      return plz.startsWith(prefix);
    } else {
      return plz === plzBereich;
    }
  },

  // ========== HELPER FUNCTIONS ==========

  // Parse Konkurrenten-Dokument aus Appwrite
  parseKonkurrentDocument(doc: any): Konkurrent {
    try {
      const data = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
      return {
        ...data,
        id: doc.$id,
      };
    } catch (error) {
      console.error('Fehler beim Parsen des Konkurrenten-Dokuments:', error);
      throw error;
    }
  },
};
