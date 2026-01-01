import { databases, storage, DATABASE_ID, KONKURRENTEN_COLLECTION_ID, KONKURRENTEN_DATEIEN_BUCKET_ID } from '../config/appwrite';
import {
  Konkurrent,
  NeuerKonkurrent,
  LieferkostenBerechnung,
  PLZLieferkostenZone,
  KonkurrentFilter,
  MarktStatistiken,
  KonkurrentBild,
  KonkurrentDokument,
  KonkurrentBewertung
} from '../types/konkurrent';
import { ID, Query } from 'appwrite';
import { geocodePLZ, geocodeAdresse } from '../utils/geocoding';

export const konkurrentService = {
  // ========== KONKURRENTEN VERWALTUNG ==========

  // Lade alle Konkurrenten
  async loadAlleKonkurrenten(): Promise<Konkurrent[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        [
          Query.limit(5000)
        ]
      );

      return response.documents.map(doc => this.parseKonkurrentDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Konkurrenten:', error);
      return [];
    }
  },

  // Lade Konkurrenten mit Filter
  async loadKonkurrentenMitFilter(filter: KonkurrentFilter): Promise<Konkurrent[]> {
    try {
      const alleKonkurrenten = await this.loadAlleKonkurrenten();
      return this.filterKonkurrenten(alleKonkurrenten, filter);
    } catch (error) {
      console.error('Fehler beim Filtern der Konkurrenten:', error);
      return [];
    }
  },

  // Filter-Funktion
  filterKonkurrenten(konkurrenten: Konkurrent[], filter: KonkurrentFilter): Konkurrent[] {
    return konkurrenten.filter(k => {
      // Suchbegriff
      if (filter.suchbegriff) {
        const suchLower = filter.suchbegriff.toLowerCase();
        const matchName = k.name.toLowerCase().includes(suchLower);
        const matchOrt = k.adresse.ort?.toLowerCase().includes(suchLower);
        const matchPLZ = k.adresse.plz?.includes(filter.suchbegriff);
        const matchNotizen = k.notizen?.toLowerCase().includes(suchLower);
        const matchTags = k.tags?.some(t => t.toLowerCase().includes(suchLower));
        if (!matchName && !matchOrt && !matchPLZ && !matchNotizen && !matchTags) {
          return false;
        }
      }

      // Produkte
      if (filter.produkte && filter.produkte.length > 0) {
        if (!filter.produkte.some(p => k.produkte.includes(p))) {
          return false;
        }
      }

      // Bundesländer
      if (filter.bundeslaender && filter.bundeslaender.length > 0) {
        if (!k.adresse.bundesland || !filter.bundeslaender.includes(k.adresse.bundesland)) {
          return false;
        }
      }

      // Produktionsmenge
      if (filter.produktionsmengeMin !== undefined && (k.produktionsmenge || 0) < filter.produktionsmengeMin) {
        return false;
      }
      if (filter.produktionsmengeMax !== undefined && (k.produktionsmenge || 0) > filter.produktionsmengeMax) {
        return false;
      }

      // Bewertung
      if (filter.bewertungMin !== undefined) {
        const durchschnitt = this.berechneDurchschnittsBewertung(k.bewertung);
        if (durchschnitt < filter.bewertungMin) {
          return false;
        }
      }

      // Status
      if (filter.status && filter.status.length > 0) {
        if (!k.status || !filter.status.includes(k.status)) {
          return false;
        }
      }

      // Bedrohungsstufe
      if (filter.bedrohungsstufe && filter.bedrohungsstufe.length > 0) {
        if (!k.bedrohungsstufe || !filter.bedrohungsstufe.includes(k.bedrohungsstufe)) {
          return false;
        }
      }

      // Tags
      if (filter.tags && filter.tags.length > 0) {
        if (!k.tags || !filter.tags.some(t => k.tags!.includes(t))) {
          return false;
        }
      }

      // Unternehmensgröße
      if (filter.unternehmensgroesse && filter.unternehmensgroesse.length > 0) {
        if (!k.unternehmensgroesse || !filter.unternehmensgroesse.includes(k.unternehmensgroesse)) {
          return false;
        }
      }

      return true;
    });
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
    let koordinaten: [number, number] | undefined = konkurrent.adresse.koordinaten;
    if (!koordinaten && konkurrent.adresse.plz) {
      if (konkurrent.adresse.strasse && konkurrent.adresse.ort) {
        const coords = await geocodeAdresse(
          konkurrent.adresse.strasse,
          konkurrent.adresse.plz,
          konkurrent.adresse.ort
        );
        koordinaten = coords || undefined;
      } else {
        const coords = await geocodePLZ(konkurrent.adresse.plz);
        koordinaten = coords || undefined;
      }
    }

    // Berechne Gesamtnote falls Bewertung vorhanden
    let bewertung = konkurrent.bewertung;
    if (bewertung) {
      bewertung = {
        ...bewertung,
        gesamtnote: this.berechneDurchschnittsBewertung(bewertung)
      };
    }

    const neuerKonkurrent: Konkurrent = {
      ...konkurrent,
      id: ID.unique(),
      adresse: {
        ...konkurrent.adresse,
        koordinaten,
      },
      bewertung,
      status: konkurrent.status || 'aktiv',
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
      let koordinaten: [number, number] | undefined = konkurrent.adresse?.koordinaten || aktuell.adresse.koordinaten;
      if (konkurrent.adresse && !koordinaten) {
        if (konkurrent.adresse.strasse && konkurrent.adresse.plz && konkurrent.adresse.ort) {
          const coords = await geocodeAdresse(
            konkurrent.adresse.strasse,
            konkurrent.adresse.plz,
            konkurrent.adresse.ort
          );
          koordinaten = coords || undefined;
        } else if (konkurrent.adresse.plz) {
          const coords = await geocodePLZ(konkurrent.adresse.plz);
          koordinaten = coords || undefined;
        }
      }

      // Berechne Gesamtnote falls Bewertung vorhanden
      let bewertung = konkurrent.bewertung || aktuell.bewertung;
      if (bewertung) {
        bewertung = {
          ...bewertung,
          gesamtnote: this.berechneDurchschnittsBewertung(bewertung)
        };
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
        bewertung,
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
      // Lösche zuerst alle zugehörigen Dateien
      const konkurrent = await this.loadKonkurrent(id);
      if (konkurrent) {
        // Lösche Bilder
        for (const bild of konkurrent.bilder || []) {
          try {
            await this.deleteBild(id, bild.id);
          } catch (e) {
            console.warn('Konnte Bild nicht löschen:', bild.id);
          }
        }
        // Lösche Dokumente
        for (const dok of konkurrent.dokumente || []) {
          try {
            await this.deleteDokument(id, dok.id);
          } catch (e) {
            console.warn('Konnte Dokument nicht löschen:', dok.id);
          }
        }
      }

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

  // ========== BILD-UPLOAD ==========

  // Bild hochladen
  async uploadBild(
    konkurrentId: string,
    file: File,
    typ: KonkurrentBild['typ'] = 'sonstiges',
    titel?: string,
    beschreibung?: string
  ): Promise<KonkurrentBild> {
    try {
      // Upload zur Storage
      const fileId = ID.unique();
      await storage.createFile(
        KONKURRENTEN_DATEIEN_BUCKET_ID,
        fileId,
        file
      );

      // URL generieren
      const fileUrl = storage.getFileView(KONKURRENTEN_DATEIEN_BUCKET_ID, fileId);
      const previewUrl = storage.getFilePreview(KONKURRENTEN_DATEIEN_BUCKET_ID, fileId, 200, 200);

      const neuesBild: KonkurrentBild = {
        id: fileId,
        url: fileUrl.toString(),
        thumbnail: previewUrl.toString(),
        titel: titel || file.name,
        beschreibung,
        typ,
        hochgeladenAm: new Date().toISOString()
      };

      // Konkurrent aktualisieren
      const konkurrent = await this.loadKonkurrent(konkurrentId);
      if (konkurrent) {
        const bilder = [...(konkurrent.bilder || []), neuesBild];
        await this.updateKonkurrent(konkurrentId, { bilder });
      }

      return neuesBild;
    } catch (error) {
      console.error('Fehler beim Hochladen des Bildes:', error);
      throw error;
    }
  },

  // Bild löschen
  async deleteBild(konkurrentId: string, bildId: string): Promise<void> {
    try {
      // Aus Storage löschen
      await storage.deleteFile(KONKURRENTEN_DATEIEN_BUCKET_ID, bildId);

      // Konkurrent aktualisieren
      const konkurrent = await this.loadKonkurrent(konkurrentId);
      if (konkurrent) {
        const bilder = (konkurrent.bilder || []).filter(b => b.id !== bildId);
        await this.updateKonkurrent(konkurrentId, { bilder });
      }
    } catch (error) {
      console.error('Fehler beim Löschen des Bildes:', error);
      throw error;
    }
  },

  // ========== DOKUMENT-UPLOAD ==========

  // Dokument hochladen
  async uploadDokument(
    konkurrentId: string,
    file: File,
    typ: KonkurrentDokument['typ'] = 'sonstiges'
  ): Promise<KonkurrentDokument> {
    try {
      const fileId = ID.unique();
      await storage.createFile(
        KONKURRENTEN_DATEIEN_BUCKET_ID,
        fileId,
        file
      );

      const fileUrl = storage.getFileView(KONKURRENTEN_DATEIEN_BUCKET_ID, fileId);

      const neuesDokument: KonkurrentDokument = {
        id: fileId,
        url: fileUrl.toString(),
        name: file.name,
        typ,
        groesse: file.size,
        hochgeladenAm: new Date().toISOString()
      };

      // Konkurrent aktualisieren
      const konkurrent = await this.loadKonkurrent(konkurrentId);
      if (konkurrent) {
        const dokumente = [...(konkurrent.dokumente || []), neuesDokument];
        await this.updateKonkurrent(konkurrentId, { dokumente });
      }

      return neuesDokument;
    } catch (error) {
      console.error('Fehler beim Hochladen des Dokuments:', error);
      throw error;
    }
  },

  // Dokument löschen
  async deleteDokument(konkurrentId: string, dokumentId: string): Promise<void> {
    try {
      await storage.deleteFile(KONKURRENTEN_DATEIEN_BUCKET_ID, dokumentId);

      const konkurrent = await this.loadKonkurrent(konkurrentId);
      if (konkurrent) {
        const dokumente = (konkurrent.dokumente || []).filter(d => d.id !== dokumentId);
        await this.updateKonkurrent(konkurrentId, { dokumente });
      }
    } catch (error) {
      console.error('Fehler beim Löschen des Dokuments:', error);
      throw error;
    }
  },

  // ========== STATISTIKEN ==========

  // Berechne Markt-Statistiken
  berechneMarktStatistiken(konkurrenten: Konkurrent[]): MarktStatistiken {
    const aktive = konkurrenten.filter(k => k.status !== 'aufgeloest' && k.status !== 'inaktiv');

    // Produktionsmengen
    const produktionsmengen = aktive.map(k => k.produktionsmenge || 0);
    const gesamtProduktion = produktionsmengen.reduce((sum, p) => sum + p, 0);
    const durchschnittlicheProduktion = aktive.length > 0 ? gesamtProduktion / aktive.length : 0;

    // Produktions-Verteilung
    const produktionsVerteilung = {
      klein: aktive.filter(k => (k.produktionsmenge || 0) < 2000).length,
      mittel: aktive.filter(k => (k.produktionsmenge || 0) >= 2000 && (k.produktionsmenge || 0) < 5000).length,
      gross: aktive.filter(k => (k.produktionsmenge || 0) >= 5000).length
    };

    // Produkte-Verteilung
    const produkteVerteilung = {
      nurTennisSand: aktive.filter(k => k.produkte.includes('tennissand') && !k.produkte.includes('tennismehl')).length,
      nurTennisMehl: aktive.filter(k => !k.produkte.includes('tennissand') && k.produkte.includes('tennismehl')).length,
      beides: aktive.filter(k => k.produkte.includes('tennissand') && k.produkte.includes('tennismehl')).length
    };

    // Regional-Verteilung
    const regionalVerteilung: { [bundesland: string]: number } = {};
    for (const k of aktive) {
      const bl = k.adresse.bundesland || 'Unbekannt';
      regionalVerteilung[bl] = (regionalVerteilung[bl] || 0) + 1;
    }

    // Bedrohungs-Verteilung
    const bedrohungsVerteilung = {
      niedrig: aktive.filter(k => k.bedrohungsstufe === 'niedrig').length,
      mittel: aktive.filter(k => k.bedrohungsstufe === 'mittel').length,
      hoch: aktive.filter(k => k.bedrohungsstufe === 'hoch').length,
      kritisch: aktive.filter(k => k.bedrohungsstufe === 'kritisch').length
    };

    // Top-Konkurrenten (nach Produktionsmenge)
    const topKonkurrenten = [...aktive]
      .sort((a, b) => (b.produktionsmenge || 0) - (a.produktionsmenge || 0))
      .slice(0, 5);

    return {
      anzahlKonkurrenten: aktive.length,
      gesamtProduktion,
      durchschnittlicheProduktion,
      produktionsVerteilung,
      produkteVerteilung,
      regionalVerteilung,
      bedrohungsVerteilung,
      topKonkurrenten
    };
  },

  // Alle einzigartigen Tags laden
  getAlleTags(konkurrenten: Konkurrent[]): string[] {
    const tagsSet = new Set<string>();
    for (const k of konkurrenten) {
      for (const tag of k.tags || []) {
        tagsSet.add(tag);
      }
    }
    return Array.from(tagsSet).sort();
  },

  // Alle Bundesländer laden
  getAlleBundeslaender(konkurrenten: Konkurrent[]): string[] {
    const blSet = new Set<string>();
    for (const k of konkurrenten) {
      if (k.adresse.bundesland) {
        blSet.add(k.adresse.bundesland);
      }
    }
    return Array.from(blSet).sort();
  },

  // ========== BEWERTUNGEN ==========

  // Berechne Durchschnittsbewertung
  berechneDurchschnittsBewertung(bewertung?: KonkurrentBewertung): number {
    if (!bewertung) return 0;
    const werte = [
      bewertung.qualitaet,
      bewertung.preisLeistung,
      bewertung.lieferzeit,
      bewertung.service,
      bewertung.zuverlaessigkeit
    ].filter(v => v !== undefined && v > 0);

    if (werte.length === 0) return 0;
    return werte.reduce((sum, v) => sum + v, 0) / werte.length;
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

    const plzKoordinaten = await geocodePLZ(plz);
    if (!plzKoordinaten) {
      return null;
    }

    return this.haversineDistanz(koordinaten, plzKoordinaten);
  },

  // Haversine-Formel für Distanzberechnung
  haversineDistanz(
    [lon1, lat1]: [number, number],
    [lon2, lat2]: [number, number]
  ): number {
    const R = 6371;
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

  // Berechne Marker-Größe basierend auf Produktionsmenge
  getMarkerGroesse(produktionsmenge?: number): 'klein' | 'mittel' | 'gross' | 'enterprise' {
    if (!produktionsmenge || produktionsmenge < 2000) return 'klein';
    if (produktionsmenge < 5000) return 'mittel';
    if (produktionsmenge < 10000) return 'gross';
    return 'enterprise';
  },

  // Bedrohungsstufe Farbe
  getBedrohungsfarbe(stufe?: string): string {
    switch (stufe) {
      case 'niedrig': return '#22c55e';
      case 'mittel': return '#eab308';
      case 'hoch': return '#f97316';
      case 'kritisch': return '#ef4444';
      default: return '#9ca3af';
    }
  },

  // Status Label
  getStatusLabel(status?: string): string {
    switch (status) {
      case 'aktiv': return 'Aktiv';
      case 'inaktiv': return 'Inaktiv';
      case 'beobachten': return 'Beobachten';
      case 'aufgeloest': return 'Aufgelöst';
      default: return 'Unbekannt';
    }
  },

  // Unternehmensgrößen-Label
  getUnternehmensgroesseLabel(groesse?: string): string {
    switch (groesse) {
      case 'klein': return 'Klein (<10 MA)';
      case 'mittel': return 'Mittel (10-50 MA)';
      case 'gross': return 'Groß (50-250 MA)';
      case 'enterprise': return 'Enterprise (>250 MA)';
      default: return 'Unbekannt';
    }
  }
};
