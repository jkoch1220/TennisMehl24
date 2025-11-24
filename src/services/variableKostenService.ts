import { databases, DATABASE_ID, VARIABLE_KOSTEN_COLLECTION_ID, VARIABLE_KOSTEN_DOCUMENT_ID } from '../config/appwrite';
import { VariableKostenInput, VerkaufspreisEingabe } from '../types';

export const variableKostenService = {
  // Lade Variable Kosten-Daten
  async loadVariableKosten(): Promise<VariableKostenInput | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        VARIABLE_KOSTEN_COLLECTION_ID,
        VARIABLE_KOSTEN_DOCUMENT_ID
      );
      
      // Konvertiere das Dokument zurück zu VariableKostenInput
      return {
        lohnkosten: {
          stundenlohn: document.lohnkosten_stundenlohn || 0,
          tonnenProArbeitsstunde: document.lohnkosten_tonnenProArbeitsstunde || 0,
        },
        einkauf: {
          dieselKostenProTonne: document.einkauf_dieselKostenProTonne || 0,
          ziegelbruchKostenProTonne: document.einkauf_ziegelbruchKostenProTonne || 0,
          stromKostenProTonne: document.einkauf_stromKostenProTonne || 0,
          entsorgungContainerKostenProTonne: document.einkauf_entsorgungContainerKostenProTonne || 0,
          gasflaschenKostenProTonne: document.einkauf_gasflaschenKostenProTonne || 0,
        },
        verschleissteile: {
          preisProHammer: document.verschleissteile_preisProHammer || 0,
          verbrauchHaemmerProTonne: document.verschleissteile_verbrauchHaemmerProTonne || 0,
          siebkoerbeKostenProTonne: document.verschleissteile_siebkoerbeKostenProTonne || 0,
          verschleissblecheKostenProTonne: document.verschleissteile_verschleissblecheKostenProTonne || 0,
          wellenlagerKostenProTonne: document.verschleissteile_wellenlagerKostenProTonne || 0,
        },
        sackware: {
          palettenKostenProPalette: document.sackware_palettenKostenProPalette || 0,
          saeckeKostenProPalette: document.sackware_saeckeKostenProPalette || 0,
          schrumpfhaubenKostenProPalette: document.sackware_schrumpfhaubenKostenProPalette || 0,
          palettenProTonne: document.sackware_palettenProTonne || 0,
        },
        verkaufspreise: [
          {
            tonnen: document.verkaufspreis1_tonnen || 0,
            preisProTonne: document.verkaufspreis1_preisProTonne || 0,
          },
          {
            tonnen: document.verkaufspreis2_tonnen || 0,
            preisProTonne: document.verkaufspreis2_preisProTonne || 0,
          },
          {
            tonnen: document.verkaufspreis3_tonnen || 0,
            preisProTonne: document.verkaufspreis3_preisProTonne || 0,
          },
        ] as [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe],
        geplanterUmsatz: document.geplanterUmsatz || 0,
      };
    } catch (error: any) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error.code === 404) {
        return null;
      }
      console.error('Fehler beim Laden der Variable Kosten:', error);
      throw error;
    }
  },

  // Speichere Variable Kosten-Daten
  async saveVariableKosten(data: VariableKostenInput): Promise<void> {
    try {
      // Versuche zuerst zu aktualisieren
      await databases.updateDocument(
        DATABASE_ID,
        VARIABLE_KOSTEN_COLLECTION_ID,
        VARIABLE_KOSTEN_DOCUMENT_ID,
        {
          lohnkosten_stundenlohn: data.lohnkosten.stundenlohn,
          lohnkosten_tonnenProArbeitsstunde: data.lohnkosten.tonnenProArbeitsstunde,
          einkauf_dieselKostenProTonne: data.einkauf.dieselKostenProTonne,
          einkauf_ziegelbruchKostenProTonne: data.einkauf.ziegelbruchKostenProTonne,
          einkauf_stromKostenProTonne: data.einkauf.stromKostenProTonne,
          einkauf_entsorgungContainerKostenProTonne: data.einkauf.entsorgungContainerKostenProTonne,
          einkauf_gasflaschenKostenProTonne: data.einkauf.gasflaschenKostenProTonne,
          verschleissteile_preisProHammer: data.verschleissteile.preisProHammer,
          verschleissteile_verbrauchHaemmerProTonne: data.verschleissteile.verbrauchHaemmerProTonne,
          verschleissteile_siebkoerbeKostenProTonne: data.verschleissteile.siebkoerbeKostenProTonne,
          verschleissteile_verschleissblecheKostenProTonne: data.verschleissteile.verschleissblecheKostenProTonne,
          verschleissteile_wellenlagerKostenProTonne: data.verschleissteile.wellenlagerKostenProTonne,
          sackware_palettenKostenProPalette: data.sackware.palettenKostenProPalette,
          sackware_saeckeKostenProPalette: data.sackware.saeckeKostenProPalette,
          sackware_schrumpfhaubenKostenProPalette: data.sackware.schrumpfhaubenKostenProPalette,
          sackware_palettenProTonne: data.sackware.palettenProTonne,
          verkaufspreis1_tonnen: data.verkaufspreise[0].tonnen,
          verkaufspreis1_preisProTonne: data.verkaufspreise[0].preisProTonne,
          verkaufspreis2_tonnen: data.verkaufspreise[1].tonnen,
          verkaufspreis2_preisProTonne: data.verkaufspreise[1].preisProTonne,
          verkaufspreis3_tonnen: data.verkaufspreise[2].tonnen,
          verkaufspreis3_preisProTonne: data.verkaufspreise[2].preisProTonne,
          geplanterUmsatz: data.geplanterUmsatz,
        }
      );
    } catch (error: any) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error.code === 404) {
        await databases.createDocument(
          DATABASE_ID,
          VARIABLE_KOSTEN_COLLECTION_ID,
          VARIABLE_KOSTEN_DOCUMENT_ID,
          {
            lohnkosten_stundenlohn: data.lohnkosten.stundenlohn,
            lohnkosten_tonnenProArbeitsstunde: data.lohnkosten.tonnenProArbeitsstunde,
            einkauf_dieselKostenProTonne: data.einkauf.dieselKostenProTonne,
            einkauf_ziegelbruchKostenProTonne: data.einkauf.ziegelbruchKostenProTonne,
            einkauf_stromKostenProTonne: data.einkauf.stromKostenProTonne,
            einkauf_entsorgungContainerKostenProTonne: data.einkauf.entsorgungContainerKostenProTonne,
            einkauf_gasflaschenKostenProTonne: data.einkauf.gasflaschenKostenProTonne,
            verschleissteile_preisProHammer: data.verschleissteile.preisProHammer,
            verschleissteile_verbrauchHaemmerProTonne: data.verschleissteile.verbrauchHaemmerProTonne,
            verschleissteile_siebkoerbeKostenProTonne: data.verschleissteile.siebkoerbeKostenProTonne,
            verschleissteile_verschleissblecheKostenProTonne: data.verschleissteile.verschleissblecheKostenProTonne,
            verschleissteile_wellenlagerKostenProTonne: data.verschleissteile.wellenlagerKostenProTonne,
            sackware_palettenKostenProPalette: data.sackware.palettenKostenProPalette,
            sackware_saeckeKostenProPalette: data.sackware.saeckeKostenProPalette,
            sackware_schrumpfhaubenKostenProPalette: data.sackware.schrumpfhaubenKostenProPalette,
            sackware_palettenProTonne: data.sackware.palettenProTonne,
            verkaufspreis1_tonnen: data.verkaufspreise[0].tonnen,
            verkaufspreis1_preisProTonne: data.verkaufspreise[0].preisProTonne,
            verkaufspreis2_tonnen: data.verkaufspreise[1].tonnen,
            verkaufspreis2_preisProTonne: data.verkaufspreise[1].preisProTonne,
            verkaufspreis3_tonnen: data.verkaufspreise[2].tonnen,
            verkaufspreis3_preisProTonne: data.verkaufspreise[2].preisProTonne,
            geplanterUmsatz: data.geplanterUmsatz,
          }
        );
      } else {
        console.error('Fehler beim Speichern der Variable Kosten:', error);
        throw error;
      }
    }
  },
};

