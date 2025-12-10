import { ID, Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
  COLLECTIONS
} from '../config/appwrite';
import {
  GespeichertesDokument,
  DokumentAnzeige,
  AngebotsDaten,
  AuftragsbestaetigungsDaten,
  LieferscheinDaten,
  RechnungsDaten
} from '../types/bestellabwicklung';
import { Projekt } from '../types/projekt';
import { generiereAuftragsbestaetigungPDF, generiereLieferscheinPDF } from './dokumentService';
import { generiereRechnungPDF, berechneRechnungsSummen } from './rechnungService';
import jsPDF from 'jspdf';

// Helper: PDF zu Blob konvertieren
const pdfToBlob = (pdf: jsPDF): Blob => {
  return pdf.output('blob');
};

// Helper: URLs generieren
const getFileViewUrl = (dateiId: string): string => {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  return `${endpoint}/storage/buckets/${BESTELLABWICKLUNG_DATEIEN_BUCKET_ID}/files/${dateiId}/view?project=${projectId}`;
};

const getFileDownloadUrl = (dateiId: string): string => {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  return `${endpoint}/storage/buckets/${BESTELLABWICKLUNG_DATEIEN_BUCKET_ID}/files/${dateiId}/download?project=${projectId}`;
};

// === DOKUMENT LADEN ===
export const ladeProjektDokumente = async (projektId: string): Promise<GespeichertesDokument[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.orderDesc('$createdAt')
      ]
    );
    return response.documents as unknown as GespeichertesDokument[];
  } catch (error) {
    console.error('Fehler beim Laden der Projekt-Dokumente:', error);
    return [];
  }
};

export const ladeDokumentNachTyp = async (
  projektId: string,
  dokumentTyp: 'auftragsbestaetigung' | 'lieferschein' | 'rechnung'
): Promise<GespeichertesDokument | null> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.equal('dokumentTyp', dokumentTyp),
        Query.orderDesc('$createdAt'),
        Query.limit(1)
      ]
    );
    
    if (response.documents.length > 0) {
      return response.documents[0] as unknown as GespeichertesDokument;
    }
    return null;
  } catch (error) {
    console.error(`Fehler beim Laden des ${dokumentTyp}:`, error);
    return null;
  }
};

// === AUFTRAGSBESTÄTIGUNG ===
export const speichereAuftragsbestaetigung = async (
  projektId: string,
  daten: AuftragsbestaetigungsDaten
): Promise<GespeichertesDokument> => {
  try {
    // PDF generieren
    const pdf = await generiereAuftragsbestaetigungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = `Auftragsbestaetigung_${daten.auftragsbestaetigungsnummer}.pdf`;
    
    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Bruttobetrag berechnen
    const summen = berechneRechnungsSummen(daten.positionen);
    const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
    const bruttobetrag = (summen.nettobetrag + frachtUndVerpackung) * 1.19;
    
    // Dokument-Eintrag in DB erstellen
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'auftragsbestaetigung',
        dokumentNummer: daten.auftragsbestaetigungsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag,
        istFinal: false,
        daten: JSON.stringify(daten)
      }
    );
    
    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Speichern der Auftragsbestätigung:', error);
    throw error;
  }
};

export const aktualisiereAuftragsbestaetigung = async (
  dokumentId: string,
  alteDateiId: string,
  daten: AuftragsbestaetigungsDaten
): Promise<GespeichertesDokument> => {
  try {
    // Alte Datei löschen
    try {
      await storage.deleteFile(BESTELLABWICKLUNG_DATEIEN_BUCKET_ID, alteDateiId);
    } catch (e) {
      console.warn('Alte Datei konnte nicht gelöscht werden:', e);
    }
    
    // Neues PDF generieren
    const pdf = await generiereAuftragsbestaetigungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = `Auftragsbestaetigung_${daten.auftragsbestaetigungsnummer}.pdf`;
    
    // Neue Datei hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Bruttobetrag berechnen
    const summen = berechneRechnungsSummen(daten.positionen);
    const frachtUndVerpackung = (daten.frachtkosten || 0) + (daten.verpackungskosten || 0);
    const bruttobetrag = (summen.nettobetrag + frachtUndVerpackung) * 1.19;
    
    // Dokument-Eintrag aktualisieren
    const dokument = await databases.updateDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      dokumentId,
      {
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag,
        daten: JSON.stringify(daten)
      }
    );
    
    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Auftragsbestätigung:', error);
    throw error;
  }
};

// === LIEFERSCHEIN ===
export const speichereLieferschein = async (
  projektId: string,
  daten: LieferscheinDaten
): Promise<GespeichertesDokument> => {
  try {
    // PDF generieren
    const pdf = await generiereLieferscheinPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = `Lieferschein_${daten.lieferscheinnummer}.pdf`;
    
    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Dokument-Eintrag in DB erstellen
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'lieferschein',
        dokumentNummer: daten.lieferscheinnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        istFinal: false,
        daten: JSON.stringify(daten)
      }
    );
    
    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Speichern des Lieferscheins:', error);
    throw error;
  }
};

export const aktualisereLieferschein = async (
  dokumentId: string,
  alteDateiId: string,
  daten: LieferscheinDaten
): Promise<GespeichertesDokument> => {
  try {
    // Alte Datei löschen
    try {
      await storage.deleteFile(BESTELLABWICKLUNG_DATEIEN_BUCKET_ID, alteDateiId);
    } catch (e) {
      console.warn('Alte Datei konnte nicht gelöscht werden:', e);
    }
    
    // Neues PDF generieren
    const pdf = await generiereLieferscheinPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = `Lieferschein_${daten.lieferscheinnummer}.pdf`;
    
    // Neue Datei hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Dokument-Eintrag aktualisieren
    const dokument = await databases.updateDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      dokumentId,
      {
        dateiId: uploadedFile.$id,
        dateiname,
        daten: JSON.stringify(daten)
      }
    );
    
    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Lieferscheins:', error);
    throw error;
  }
};

// === RECHNUNG (FINAL - NICHT ÄNDERBAR!) ===
export const speichereRechnung = async (
  projektId: string,
  daten: RechnungsDaten
): Promise<GespeichertesDokument> => {
  try {
    // Prüfen ob bereits eine Rechnung existiert
    const bestehendeRechnung = await ladeDokumentNachTyp(projektId, 'rechnung');
    if (bestehendeRechnung) {
      throw new Error('Für dieses Projekt existiert bereits eine Rechnung. Rechnungen können nicht überschrieben werden.');
    }
    
    // PDF generieren
    const pdf = await generiereRechnungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = `Rechnung_${daten.rechnungsnummer}.pdf`;
    
    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Bruttobetrag berechnen
    const summen = berechneRechnungsSummen(daten.positionen);
    
    // Dokument-Eintrag in DB erstellen (FINAL!)
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'rechnung',
        dokumentNummer: daten.rechnungsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag: summen.bruttobetrag,
        istFinal: true, // WICHTIG: Rechnungen sind immer final!
        daten: JSON.stringify(daten) // Für Archivierung
      }
    );
    
    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Speichern der Rechnung:', error);
    throw error;
  }
};

// === HELPER FUNKTIONEN ===
export const dokumentZuAnzeige = (dokument: GespeichertesDokument): DokumentAnzeige => {
  return {
    id: dokument.$id!,
    typ: dokument.dokumentTyp,
    nummer: dokument.dokumentNummer,
    dateiname: dokument.dateiname,
    erstelltAm: new Date(dokument.$createdAt || ''),
    bruttobetrag: dokument.bruttobetrag,
    istFinal: dokument.istFinal,
    downloadUrl: getFileDownloadUrl(dokument.dateiId),
    viewUrl: getFileViewUrl(dokument.dateiId)
  };
};

// Gespeicherte Daten aus einem Dokument laden (für Bearbeitung)
export const ladeDokumentDaten = <T>(dokument: GespeichertesDokument): T | null => {
  if (!dokument.daten) return null;
  try {
    return JSON.parse(dokument.daten) as T;
  } catch {
    return null;
  }
};

// Download URL direkt abrufen
export { getFileDownloadUrl, getFileViewUrl };

// === ENTWURFS-SPEICHERUNG (Auto-Save im Projekt) ===

type EntwurfTyp = 'angebotsDaten' | 'auftragsbestaetigungsDaten' | 'lieferscheinDaten' | 'rechnungsDaten';

// Entwurfsdaten in Projekt speichern
export const speichereEntwurf = async (
  projektId: string,
  typ: EntwurfTyp,
  daten: AngebotsDaten | AuftragsbestaetigungsDaten | LieferscheinDaten | RechnungsDaten
): Promise<void> => {
  try {
    // Erst aktuelles Projekt laden, um die data zu bekommen
    const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJEKTE, projektId);
    
    let projektData: Record<string, unknown> = {};
    if (response.data && typeof response.data === 'string') {
      try {
        projektData = JSON.parse(response.data);
      } catch {
        projektData = {};
      }
    }
    
    // Entwurfsdaten hinzufügen/aktualisieren
    projektData[typ] = JSON.stringify(daten);
    projektData.geaendertAm = new Date().toISOString();
    
    // Projekt aktualisieren
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.PROJEKTE,
      projektId,
      {
        geaendertAm: new Date().toISOString(),
        data: JSON.stringify(projektData)
      }
    );
    
    console.log(`✅ Entwurf ${typ} gespeichert für Projekt ${projektId}`);
  } catch (error) {
    console.error(`Fehler beim Speichern des Entwurfs ${typ}:`, error);
    // Bei Fehler nicht werfen - Auto-Save sollte nicht die UX stören
  }
};

// Entwurfsdaten aus Projekt laden
export const ladeEntwurf = async <T>(
  projektId: string,
  typ: EntwurfTyp
): Promise<T | null> => {
  try {
    const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJEKTE, projektId);
    
    let projektData: Record<string, unknown> = {};
    if (response.data && typeof response.data === 'string') {
      try {
        projektData = JSON.parse(response.data);
      } catch {
        return null;
      }
    }
    
    const entwurfJson = projektData[typ];
    if (entwurfJson && typeof entwurfJson === 'string') {
      try {
        return JSON.parse(entwurfJson) as T;
      } catch {
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Fehler beim Laden des Entwurfs ${typ}:`, error);
    return null;
  }
};

// Projekt mit allen Entwurfsdaten laden
export const ladeProjektMitEntwuerfen = async (projektId: string): Promise<{
  projekt: Projekt | null;
  angebotsDaten: AngebotsDaten | null;
  auftragsbestaetigungsDaten: AuftragsbestaetigungsDaten | null;
  lieferscheinDaten: LieferscheinDaten | null;
  rechnungsDaten: RechnungsDaten | null;
}> => {
  try {
    const response = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJEKTE, projektId);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let projektData: any = response;
    
    if (response.data && typeof response.data === 'string') {
      try {
        projektData = { ...JSON.parse(response.data), $id: response.$id };
      } catch {
        // Fallback zum response
      }
    }
    
    // Entwurfsdaten parsen
    const parseEntwurf = <T>(jsonStr: string | undefined): T | null => {
      if (!jsonStr) return null;
      try {
        return JSON.parse(jsonStr) as T;
      } catch {
        return null;
      }
    };
    
    return {
      projekt: projektData as Projekt,
      angebotsDaten: parseEntwurf<AngebotsDaten>(projektData.angebotsDaten),
      auftragsbestaetigungsDaten: parseEntwurf<AuftragsbestaetigungsDaten>(projektData.auftragsbestaetigungsDaten),
      lieferscheinDaten: parseEntwurf<LieferscheinDaten>(projektData.lieferscheinDaten),
      rechnungsDaten: parseEntwurf<RechnungsDaten>(projektData.rechnungsDaten),
    };
  } catch (error) {
    console.error('Fehler beim Laden des Projekts mit Entwürfen:', error);
    return {
      projekt: null,
      angebotsDaten: null,
      auftragsbestaetigungsDaten: null,
      lieferscheinDaten: null,
      rechnungsDaten: null,
    };
  }
};

// Debounce-Funktion für Auto-Save
export const erstelleDebounce = <T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};
