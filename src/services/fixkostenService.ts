import { databases, DATABASE_ID, FIXKOSTEN_COLLECTION_ID, FIXKOSTEN_DOCUMENT_ID } from '../config/appwrite';
import { FixkostenInput } from '../types';

export const fixkostenService = {
  // Lade Fixkosten-Daten
  async loadFixkosten(): Promise<FixkostenInput | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        FIXKOSTEN_COLLECTION_ID,
        FIXKOSTEN_DOCUMENT_ID
      );
      
      // Konvertiere das Dokument zurück zu FixkostenInput
      return {
        grundstueck: {
          pacht: document.grundstueck_pacht || 0,
          steuer: document.grundstueck_steuer || 0,
          pflege: document.grundstueck_pflege || 0,
          buerocontainer: document.grundstueck_buerocontainer || 0,
        },
        maschinen: {
          wartungRadlader: document.maschinen_wartungRadlader || 0,
          wartungStapler: document.maschinen_wartungStapler || 0,
          wartungMuehle: document.maschinen_wartungMuehle || 0,
          wartungSiebanlage: document.maschinen_wartungSiebanlage || 0,
          wartungAbsackanlage: document.maschinen_wartungAbsackanlage || 0,
          sonstigeWartung: document.maschinen_sonstigeWartung || 0,
          grundkostenMaschinen: document.maschinen_grundkostenMaschinen || 0,
        },
        ruecklagenErsatzkauf: document.ruecklagenErsatzkauf || 0,
        sonstiges: document.sonstiges || 0,
        verwaltung: {
          sigleKuhn: document.verwaltung_sigleKuhn || 0,
          brzSteuerberater: document.verwaltung_brzSteuerberater || 0,
          kostenVorndran: document.verwaltung_kostenVorndran || 0,
          telefonCloudServer: document.verwaltung_telefonCloudServer || 0,
          gewerbesteuer: document.verwaltung_gewerbesteuer || 0,
        },
      };
    } catch (error: any) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error.code === 404) {
        return null;
      }
      console.error('Fehler beim Laden der Fixkosten:', error);
      throw error;
    }
  },

  // Speichere Fixkosten-Daten
  async saveFixkosten(data: FixkostenInput): Promise<void> {
    try {
      // Versuche zuerst zu aktualisieren
      await databases.updateDocument(
        DATABASE_ID,
        FIXKOSTEN_COLLECTION_ID,
        FIXKOSTEN_DOCUMENT_ID,
        {
          grundstueck_pacht: data.grundstueck.pacht,
          grundstueck_steuer: data.grundstueck.steuer,
          grundstueck_pflege: data.grundstueck.pflege,
          grundstueck_buerocontainer: data.grundstueck.buerocontainer,
          maschinen_wartungRadlader: data.maschinen.wartungRadlader,
          maschinen_wartungStapler: data.maschinen.wartungStapler,
          maschinen_wartungMuehle: data.maschinen.wartungMuehle,
          maschinen_wartungSiebanlage: data.maschinen.wartungSiebanlage,
          maschinen_wartungAbsackanlage: data.maschinen.wartungAbsackanlage,
          maschinen_sonstigeWartung: data.maschinen.sonstigeWartung,
          maschinen_grundkostenMaschinen: data.maschinen.grundkostenMaschinen,
          ruecklagenErsatzkauf: data.ruecklagenErsatzkauf,
          sonstiges: data.sonstiges,
          verwaltung_sigleKuhn: data.verwaltung.sigleKuhn,
          verwaltung_brzSteuerberater: data.verwaltung.brzSteuerberater,
          verwaltung_kostenVorndran: data.verwaltung.kostenVorndran,
          verwaltung_telefonCloudServer: data.verwaltung.telefonCloudServer,
          verwaltung_gewerbesteuer: data.verwaltung.gewerbesteuer,
        }
      );
    } catch (error: any) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error.code === 404) {
        await databases.createDocument(
          DATABASE_ID,
          FIXKOSTEN_COLLECTION_ID,
          FIXKOSTEN_DOCUMENT_ID,
          {
            grundstueck_pacht: data.grundstueck.pacht,
            grundstueck_steuer: data.grundstueck.steuer,
            grundstueck_pflege: data.grundstueck.pflege,
            grundstueck_buerocontainer: data.grundstueck.buerocontainer,
            maschinen_wartungRadlader: data.maschinen.wartungRadlader,
            maschinen_wartungStapler: data.maschinen.wartungStapler,
            maschinen_wartungMuehle: data.maschinen.wartungMuehle,
            maschinen_wartungSiebanlage: data.maschinen.wartungSiebanlage,
            maschinen_wartungAbsackanlage: data.maschinen.wartungAbsackanlage,
            maschinen_sonstigeWartung: data.maschinen.sonstigeWartung,
            maschinen_grundkostenMaschinen: data.maschinen.grundkostenMaschinen,
            ruecklagenErsatzkauf: data.ruecklagenErsatzkauf,
            sonstiges: data.sonstiges,
            verwaltung_sigleKuhn: data.verwaltung.sigleKuhn,
            verwaltung_brzSteuerberater: data.verwaltung.brzSteuerberater,
            verwaltung_kostenVorndran: data.verwaltung.kostenVorndran,
            verwaltung_telefonCloudServer: data.verwaltung.telefonCloudServer,
            verwaltung_gewerbesteuer: data.verwaltung.gewerbesteuer,
          }
        );
      } else {
        console.error('Fehler beim Speichern der Fixkosten:', error);
        const errorMessage = error?.message || `Fehler beim Speichern: ${error?.code || 'Unbekannter Fehler'}`;
        throw new Error(errorMessage);
      }
    }
  },
};

