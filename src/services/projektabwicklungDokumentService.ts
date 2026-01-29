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
  DokumentVerlaufEintrag,
  DokumentTyp,
  AngebotsDaten,
  AuftragsbestaetigungsDaten,
  LieferscheinDaten,
  RechnungsDaten,
  StornoRechnungsDaten,
  ProformaRechnungsDaten,
  Position,
  LieferscheinPosition
} from '../types/projektabwicklung';
import { Projekt, DispoStatus, LieferdatumTyp, Belieferungsart, Wochentag } from '../types/projekt';
import { projektService } from './projektService';
import { generiereAngebotPDF, generiereAuftragsbestaetigungPDF, generiereLieferscheinPDF } from './dokumentService';
import { generiereRechnungPDF, generiereProformaRechnungPDF, berechneRechnungsSummen } from './rechnungService';
import { saisonplanungService } from './saisonplanungService';
import jsPDF from 'jspdf';

// Helper: PDF zu Blob konvertieren
const pdfToBlob = (pdf: jsPDF): Blob => {
  return pdf.output('blob');
};

// Helper: Sauberen Dateinamen generieren
// Format: "Typ Kundenname Jahr.pdf" z.B. "Angebot TC Musterstadt 2024.pdf"
const generiereLesbaresDatatum = (datumString: string): string => {
  try {
    const datum = new Date(datumString);
    return datum.getFullYear().toString();
  } catch {
    return new Date().getFullYear().toString();
  }
};

const sanitizeFilename = (text: string): string => {
  // Entferne/ersetze problematische Zeichen für Dateinamen
  return text
    .replace(/[<>:"/\\|?*]/g, '') // Verbotene Zeichen entfernen
    .replace(/\s+/g, ' ')         // Mehrfache Leerzeichen zu einem
    .trim();
};

const generiereLesDatname = (
  dokumentTyp: 'Angebot' | 'Auftragsbestaetigung' | 'Lieferschein' | 'Rechnung' | 'Stornorechnung' | 'Proformarechnung',
  kundenname: string,
  datum: string,
  _version?: number
): string => {
  const jahr = generiereLesbaresDatatum(datum);
  const saubererName = sanitizeFilename(kundenname);
  return `${dokumentTyp} ${saubererName} ${jahr}.pdf`;
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
  dokumentTyp: DokumentTyp
): Promise<GespeichertesDokument | null> => {
  try {
    // Lade alle Dokumente dieses Typs für das Projekt
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.equal('dokumentTyp', dokumentTyp),
        Query.orderDesc('$createdAt'),
        Query.limit(100) // Alle laden um die neueste Version zu finden
      ]
    );

    if (response.documents.length === 0) {
      return null;
    }

    // Finde das Dokument mit der höchsten Versionsnummer
    // Falls kein version-Feld existiert, nimm das zuerst geladene (neuestes nach $createdAt)
    const dokumente = response.documents as unknown as GespeichertesDokument[];
    const neuestesDokument = dokumente.reduce((neuestes, aktuell) => {
      const neuesteVersion = (neuestes as any).version || 0;
      const aktuelleVersion = (aktuell as any).version || 0;
      return aktuelleVersion > neuesteVersion ? aktuell : neuestes;
    }, dokumente[0]);

    console.log(`📄 Lade ${dokumentTyp}: Version ${(neuestesDokument as any).version || 1} von ${dokumente.length} Versionen`);
    return neuestesDokument;
  } catch (error) {
    console.error(`Fehler beim Laden des ${dokumentTyp}:`, error);
    return null;
  }
};

// Helper-Funktion zum Laden aller Dokumente nach Typ (für Versionierung)
const ladeDokumenteNachTyp = async (
  projektId: string,
  dokumentTyp: DokumentTyp
): Promise<GespeichertesDokument[]> => {
  try {
    console.log(`🔎 Query: projektId=${projektId}, dokumentTyp=${dokumentTyp}`);
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.equal('dokumentTyp', dokumentTyp),
        Query.orderDesc('$createdAt')
      ]
    );
    console.log(`✅ Query Ergebnis: ${response.documents.length} Dokumente gefunden`);
    return response.documents as unknown as GespeichertesDokument[];
  } catch (error) {
    console.error(`❌ Fehler beim Laden der Dokumente (Typ: ${dokumentTyp}):`, error);
    return [];
  }
};

// === ANGEBOT ===
export const speichereAngebot = async (
  projektId: string,
  daten: AngebotsDaten
): Promise<GespeichertesDokument> => {
  try {
    // Prüfen ob bereits Angebote existieren (für Versionierung)
    const bestehendeAngebote = await ladeDokumenteNachTyp(projektId, 'angebot');
    const neueVersion = bestehendeAngebote.length + 1;
    
    // PDF generieren
    const pdf = await generiereAngebotPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Angebot', daten.kundenname, daten.angebotsdatum, neueVersion);

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

    // Dokument-Eintrag in DB erstellen (ohne version - wird erst angelegt wenn Attribut existiert)
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'angebot',
        dokumentNummer: daten.angebotsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag,
        istFinal: false,
        daten: JSON.stringify(daten)
      }
    );
    
    // Setze Version manuell für Rückgabe (für UI)
    const result = dokument as unknown as GespeichertesDokument;
    result.version = neueVersion;

    return result;
  } catch (error) {
    console.error('Fehler beim Speichern des Angebots:', error);
    throw error;
  }
};

export const aktualisiereAngebot = async (
  dokumentId: string,
  _alteDateiId: string, // Bewusst ungenutzt: Alte Datei bleibt im Archiv (GoBD)
  daten: AngebotsDaten,
  alteVersion: number
): Promise<GespeichertesDokument> => {
  try {
    // WICHTIG: Alte Datei wird NICHT gelöscht - sie bleibt im Archiv
    // Stattdessen erstellen wir eine neue Version
    
    const neueVersion = alteVersion + 1;

    // Neues PDF generieren
    const pdf = await generiereAngebotPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Angebot', daten.kundenname, daten.angebotsdatum, neueVersion);

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
    
    // Lade projektId vom alten Dokument
    const altesDokument = await databases.getDocument(DATABASE_ID, BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, dokumentId);
    
    // NEUES Dokument erstellen (ohne version-Attribut für Kompatibilität)
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId: altesDokument.projektId,
        dokumentTyp: 'angebot',
        dokumentNummer: daten.angebotsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag,
        istFinal: false,
        daten: JSON.stringify(daten)
      }
    );
    
    // Setze Version manuell für Rückgabe (für UI)
    const result = dokument as unknown as GespeichertesDokument;
    result.version = neueVersion;
    
    return result;
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Angebots:', error);
    throw error;
  }
};

// === AUFTRAGSBESTÄTIGUNG ===
export const speichereAuftragsbestaetigung = async (
  projektId: string,
  daten: AuftragsbestaetigungsDaten,
  optionen?: { ohneStatusAenderung?: boolean }
): Promise<GespeichertesDokument> => {
  try {
    // Prüfen ob bereits ABs existieren (für Versionierung)
    const bestehendeABs = await ladeDokumenteNachTyp(projektId, 'auftragsbestaetigung');
    const neueVersion = bestehendeABs.length + 1;

    // PDF generieren
    const pdf = await generiereAuftragsbestaetigungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Auftragsbestaetigung', daten.kundenname, daten.auftragsbestaetigungsdatum);

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

    // Dokument-Eintrag in DB erstellen (mit Versionierung)
    console.log(`📝 Erstelle AB-Version ${neueVersion} für Projekt ${projektId}...`);
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
        daten: JSON.stringify(daten),
        version: neueVersion // Versionierung hinzufügen
      }
    );
    console.log(`✅ AB-Version ${neueVersion} erstellt:`, dokument.$id, `projektId: ${projektId}`);

    // STATUS-WECHSEL: Projekt auf "lieferschein" setzen (nur wenn nicht explizit deaktiviert)
    // und dispoStatus auf "offen" damit es in der Dispo erscheint
    if (!optionen?.ohneStatusAenderung) {
      try {
        // Lieferzeitfenster nur setzen wenn beide Werte vorhanden
        const lieferzeitfenster = (daten.lieferzeitVon && daten.lieferzeitBis)
          ? { von: daten.lieferzeitVon, bis: daten.lieferzeitBis }
          : undefined;

        await projektService.updateProjekt(projektId, {
          status: 'lieferschein',
          dispoStatus: 'offen' as DispoStatus,
          auftragsbestaetigungsnummer: daten.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
          // Lieferdatum aus AB übernehmen wenn vorhanden
          geplantesDatum: daten.lieferdatum || undefined,
          // Lieferdatum-Typ (fix, spätestens oder spätestens KW)
          lieferdatumTyp: (daten.lieferdatumTyp as LieferdatumTyp) || 'fix',
          // KW-Felder für spätestens-KW-Modus
          lieferKW: daten.lieferKW || undefined,
          lieferKWJahr: daten.lieferKWJahr || undefined,
          // Bevorzugter Wochentag
          bevorzugterTag: daten.bevorzugterTag || undefined,
          // Lieferzeitfenster aus AB übernehmen wenn vorhanden
          lieferzeitfenster: lieferzeitfenster,
          // Belieferungsart aus AB übernehmen
          belieferungsart: (daten.belieferungsart as Belieferungsart) || undefined,
          // Menge aus Positionen berechnen (nur Tonnen-Einheiten)
          liefergewicht: daten.positionen?.reduce((sum, p) => {
            const einheit = p.einheit?.toLowerCase() || '';
            if (einheit === 't' || einheit === 'to' || einheit === 'tonnen') {
              return sum + (p.menge || 0);
            }
            return sum;
          }, 0) || undefined,
          // DISPO-Ansprechpartner aus AB übernehmen
          dispoAnsprechpartner: daten.dispoAnsprechpartner?.name ? daten.dispoAnsprechpartner : undefined,
        });
        console.log('✅ Projekt-Status auf "lieferschein" gesetzt, erscheint nun in Dispo');
        if (daten.lieferdatum) {
          console.log(`✅ Lieferdatum ${daten.lieferdatum} (${daten.lieferdatumTyp || 'fix'}) für Dispo übernommen`);
        }
        if (lieferzeitfenster) {
          console.log(`✅ Lieferzeitfenster ${lieferzeitfenster.von}-${lieferzeitfenster.bis} für Dispo übernommen`);
        }
        if (daten.belieferungsart) {
          console.log(`✅ Belieferungsart ${daten.belieferungsart} für Dispo übernommen`);
        }
        if (daten.dispoAnsprechpartner?.name) {
          console.log(`✅ DISPO-Ansprechpartner ${daten.dispoAnsprechpartner.name} für Dispo übernommen`);
        }
      } catch (statusError) {
        console.error('⚠️ Fehler beim Status-Wechsel (AB wurde trotzdem gespeichert):', statusError);
      }
    } else {
      console.log('ℹ️ Status-Änderung übersprungen (ohneStatusAenderung=true)');
      // Nur Metadaten aktualisieren, aber Status beibehalten
      try {
        await projektService.updateProjekt(projektId, {
          auftragsbestaetigungsnummer: daten.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
        });
      } catch (updateError) {
        console.error('⚠️ Fehler beim Aktualisieren der Metadaten:', updateError);
      }
    }

    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Speichern der Auftragsbestätigung:', error);
    throw error;
  }
};

export const aktualisiereAuftragsbestaetigung = async (
  dokumentId: string,
  _alteDateiId: string, // Wird nicht mehr gelöscht - alte Versionen bleiben erhalten!
  daten: AuftragsbestaetigungsDaten
): Promise<GespeichertesDokument> => {
  try {
    // WICHTIG: Alte Datei wird NICHT gelöscht - alle Versionen werden aufbewahrt (GoBD)!
    // Stattdessen wird das alte Dokument beibehalten und ein NEUES erstellt

    // Projekt-ID aus dem alten Dokument holen
    const altesDokument = await databases.getDocument(DATABASE_ID, BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, dokumentId);
    const projektId = (altesDokument as any).projektId;

    // Prüfen wie viele ABs bereits existieren (für Versionierung)
    const bestehendeABs = await ladeDokumenteNachTyp(projektId, 'auftragsbestaetigung');
    const neueVersion = bestehendeABs.length + 1;

    // Neues PDF generieren
    const pdf = await generiereAuftragsbestaetigungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Auftragsbestaetigung', daten.kundenname, daten.auftragsbestaetigungsdatum);

    // Neue Datei hochladen (alte bleibt erhalten!)
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

    // NEUES Dokument erstellen (nicht überschreiben!) - mit Versionsnummer
    console.log(`📝 Erstelle neue AB-Version ${neueVersion} für Projekt ${projektId}...`);
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
        daten: JSON.stringify(daten),
        version: neueVersion // Versionierung hinzufügen
      }
    );
    console.log(`✅ AB-Version ${neueVersion} erstellt:`, dokument.$id);

    // Projekt mit neuem Lieferdatum/Zeitfenster aktualisieren
    try {
      if (projektId) {
        const lieferzeitfenster = (daten.lieferzeitVon && daten.lieferzeitBis)
          ? { von: daten.lieferzeitVon, bis: daten.lieferzeitBis }
          : undefined;

        await projektService.updateProjekt(projektId, {
          geplantesDatum: daten.lieferdatum || undefined,
          lieferdatumTyp: (daten.lieferdatumTyp as LieferdatumTyp) || 'fix',
          lieferKW: daten.lieferKW || undefined,
          lieferKWJahr: daten.lieferKWJahr || undefined,
          bevorzugterTag: daten.bevorzugterTag || undefined,
          lieferzeitfenster: lieferzeitfenster,
          belieferungsart: (daten.belieferungsart as Belieferungsart) || undefined,
          liefergewicht: daten.positionen?.reduce((sum, p) => {
            const einheit = p.einheit?.toLowerCase() || '';
            if (einheit === 't' || einheit === 'to' || einheit === 'tonnen') {
              return sum + (p.menge || 0);
            }
            return sum;
          }, 0) || undefined,
        });
        console.log('✅ Projekt Lieferdaten bei AB-Aktualisierung synchronisiert');
      }
    } catch (syncError) {
      console.error('⚠️ Fehler beim Synchronisieren der Lieferdaten (AB wurde trotzdem gespeichert):', syncError);
    }

    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Erstellen der neuen AB-Version:', error);
    throw error;
  }
};

// === LIEFERSCHEIN ===
export const speichereLieferschein = async (
  projektId: string,
  daten: LieferscheinDaten
): Promise<GespeichertesDokument> => {
  try {
    // Prüfen ob bereits Lieferscheine existieren (für Versionierung)
    const bestehendeLieferscheine = await ladeDokumenteNachTyp(projektId, 'lieferschein');
    const neueVersion = bestehendeLieferscheine.length + 1;

    // PDF generieren
    const pdf = await generiereLieferscheinPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Lieferschein', daten.kundenname, daten.lieferdatum, neueVersion);

    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );

    // Dokument-Eintrag in DB erstellen (ohne version - wird erst angelegt wenn Attribut existiert)
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

    // Setze Version manuell für Rückgabe (für UI)
    const result = dokument as unknown as GespeichertesDokument;
    result.version = neueVersion;

    // Lieferdaten im Projekt aktualisieren (falls vorhanden)
    try {
      const updateDaten: Partial<Projekt> = {
        lieferscheinnummer: daten.lieferscheinnummer,
      };

      // Lieferdaten nur überschreiben wenn im Lieferschein gesetzt
      if (daten.lieferKW) {
        updateDaten.lieferKW = daten.lieferKW;
      }
      if (daten.lieferKWJahr) {
        updateDaten.lieferKWJahr = daten.lieferKWJahr;
      }
      if (daten.lieferdatumTyp) {
        updateDaten.lieferdatumTyp = daten.lieferdatumTyp as LieferdatumTyp;
      }
      if (daten.bevorzugterTag) {
        updateDaten.bevorzugterTag = daten.bevorzugterTag as Wochentag;
      }
      if (daten.belieferungsart) {
        updateDaten.belieferungsart = daten.belieferungsart as Belieferungsart;
      }
      if (daten.dispoAnsprechpartner?.name || daten.dispoAnsprechpartner?.telefon) {
        updateDaten.dispoAnsprechpartner = daten.dispoAnsprechpartner;
      }

      await projektService.updateProjekt(projektId, updateDaten);
      console.log('✅ Projekt mit Lieferschein-Daten aktualisiert');
    } catch (error) {
      console.warn('Konnte Projekt nicht mit Lieferschein-Daten aktualisieren:', error);
    }

    return result;
  } catch (error) {
    console.error('Fehler beim Speichern des Lieferscheins:', error);
    throw error;
  }
};

export const aktualisereLieferschein = async (
  dokumentId: string,
  _alteDateiId: string, // Bewusst ungenutzt: Alte Datei bleibt im Archiv (GoBD)
  daten: LieferscheinDaten,
  alteVersion: number
): Promise<GespeichertesDokument> => {
  try {
    // WICHTIG: Alte Datei wird NICHT gelöscht - sie bleibt im Archiv (GoBD-konform)
    // Stattdessen erstellen wir eine neue Version

    const neueVersion = alteVersion + 1;

    // Neues PDF generieren
    const pdf = await generiereLieferscheinPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Lieferschein', daten.kundenname, daten.lieferdatum, neueVersion);

    // Neue Datei hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Lade projektId vom alten Dokument
    const altesDokument = await databases.getDocument(DATABASE_ID, BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, dokumentId);
    
    // NEUES Dokument erstellen (ohne version-Attribut für Kompatibilität)
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId: altesDokument.projektId,
        dokumentTyp: 'lieferschein',
        dokumentNummer: daten.lieferscheinnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        istFinal: false,
        daten: JSON.stringify(daten)
      }
    );
    
    // Setze Version manuell für Rückgabe (für UI)
    const result = dokument as unknown as GespeichertesDokument;
    result.version = neueVersion;
    
    return result;
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
    const dateiname = generiereLesDatname('Rechnung', daten.kundenname, daten.rechnungsdatum);

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

    // === PREIS IN KUNDENSTAMMDATEN AKTUALISIEREN (Last Year Price) ===
    // Nach erfolgreicher Rechnungsstellung den Preis im Kunden hinterlegen
    if (daten.kundennummer) {
      try {
        // Finde Positionen mit Tonnen-Einheit (t, to, Tonnen)
        const tonnenPositionen = daten.positionen.filter(pos => {
          const einheit = pos.einheit?.toLowerCase() || '';
          return einheit === 't' || einheit === 'to' || einheit === 'tonnen' || einheit === 'tonne';
        });

        if (tonnenPositionen.length > 0) {
          // Gesamtmenge in Tonnen
          const gesamtMenge = tonnenPositionen.reduce((sum, pos) => sum + (pos.menge || 0), 0);

          // Durchschnittspreis pro Tonne berechnen (gewichteter Durchschnitt)
          const gesamtWert = tonnenPositionen.reduce((sum, pos) => sum + (pos.gesamtpreis || 0), 0);
          const preisProTonne = gesamtMenge > 0 ? gesamtWert / gesamtMenge : 0;

          // Saisonjahr aus Rechnungsdatum ermitteln
          const rechnungsDatum = new Date(daten.rechnungsdatum);
          const saisonjahr = rechnungsDatum.getFullYear();

          // Kundenpreis aktualisieren (async, aber nicht await - soll Rechnungserstellung nicht blockieren)
          saisonplanungService.aktualisiereKundenPreisNachRechnung(
            daten.kundennummer,
            Math.round(preisProTonne * 100) / 100, // Auf 2 Dezimalstellen runden
            gesamtMenge,
            saisonjahr
          ).catch(error => {
            console.error('Fehler beim Aktualisieren des Kundenpreises (non-blocking):', error);
          });
        }
      } catch (priceUpdateError) {
        // Preis-Update soll Rechnungserstellung nicht blockieren
        console.error('Fehler beim Verarbeiten des Kundenpreises:', priceUpdateError);
      }
    }

    return dokument as unknown as GespeichertesDokument;
  } catch (error) {
    console.error('Fehler beim Speichern der Rechnung:', error);
    throw error;
  }
};

// === PROFORMA-RECHNUNG (NICHT FINAL - MEHRFACH ERSTELLBAR) ===
// Proforma-Rechnungen sind Vorabrechnungen für Vorkasse oder Zollzwecke.
// Sie sind NICHT steuerlich relevant und können mehrfach erstellt werden.
export const speichereProformaRechnung = async (
  projektId: string,
  daten: ProformaRechnungsDaten
): Promise<GespeichertesDokument> => {
  try {
    // Prüfen ob bereits Proforma-Rechnungen existieren (für Versionierung)
    const bestehendeProformas = await ladeDokumenteNachTyp(projektId, 'proformarechnung');
    const neueVersion = bestehendeProformas.length + 1;

    // PDF generieren
    const pdf = await generiereProformaRechnungPDF(daten);
    const blob = pdfToBlob(pdf);
    const dateiname = generiereLesDatname('Proformarechnung', daten.kundenname, daten.rechnungsdatum, neueVersion);

    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );

    // Bruttobetrag berechnen
    const summen = berechneRechnungsSummen(daten.positionen);

    // Dokument-Eintrag in DB erstellen (NICHT FINAL - kann mehrfach erstellt werden)
    const dokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'proformarechnung',
        dokumentNummer: daten.proformaRechnungsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag: summen.bruttobetrag,
        istFinal: false, // Proforma-Rechnungen sind NICHT final
        daten: JSON.stringify(daten)
      }
    );

    // Setze Version manuell für Rückgabe (für UI)
    const result = dokument as unknown as GespeichertesDokument;
    result.version = neueVersion;

    console.log(`✅ Proforma-Rechnung ${daten.proformaRechnungsnummer} gespeichert (Version ${neueVersion})`);

    return result;
  } catch (error) {
    console.error('Fehler beim Speichern der Proforma-Rechnung:', error);
    throw error;
  }
};

// Lade alle Proforma-Rechnungen für ein Projekt (für Verlaufsanzeige)
export const ladeProformaRechnungen = async (projektId: string): Promise<GespeichertesDokument[]> => {
  return ladeDokumenteNachTyp(projektId, 'proformarechnung');
};

// === STORNORECHNUNG (FINAL - UNVERÄNDERBAR!) ===
// WICHTIG: Stornorechnungen sind gesetzlich vorgeschrieben und dürfen NIEMALS geändert werden!
export const speichereStornoRechnung = async (
  projektId: string,
  originalRechnung: GespeichertesDokument,
  stornoRechnungsnummer: string,
  stornoGrund: string
): Promise<{
  stornoRechnung: GespeichertesDokument;
  aktualisierteOriginalRechnung: GespeichertesDokument;
}> => {
  try {
    // Prüfen ob Originalrechnung bereits storniert
    if (originalRechnung.rechnungsStatus === 'storniert') {
      throw new Error('Diese Rechnung wurde bereits storniert.');
    }
    
    // Originaldaten laden
    const originalDaten = ladeDokumentDaten<RechnungsDaten>(originalRechnung);
    if (!originalDaten) {
      throw new Error('Originaldaten der Rechnung konnten nicht geladen werden.');
    }
    
    // Storno-Daten erstellen (Beträge negativ!)
    const stornoPositionen = originalDaten.positionen.map(pos => ({
      ...pos,
      einzelpreis: -Math.abs(pos.einzelpreis),
      gesamtpreis: -Math.abs(pos.gesamtpreis),
      streichpreis: pos.streichpreis ? -Math.abs(pos.streichpreis) : undefined
    }));
    
    const stornoDaten: StornoRechnungsDaten = {
      ...originalDaten,
      stornoRechnungsnummer,
      stornoDatum: new Date().toISOString().split('T')[0],
      originalRechnungsnummer: originalDaten.rechnungsnummer,
      originalRechnungsdatum: originalDaten.rechnungsdatum,
      originalRechnungId: originalRechnung.$id!,
      stornoGrund,
      positionen: stornoPositionen,
      bemerkung: `STORNORECHNUNG zu Rechnung ${originalDaten.rechnungsnummer} vom ${new Date(originalDaten.rechnungsdatum).toLocaleDateString('de-DE')}\n\nStornogrund: ${stornoGrund}${originalDaten.bemerkung ? `\n\nOriginal-Bemerkung: ${originalDaten.bemerkung}` : ''}`
    };
    
    // Storno-PDF generieren (mit spezieller Kennzeichnung)
    const stornoPDF = await generiereStornoRechnungPDF(stornoDaten);
    const blob = pdfToBlob(stornoPDF);
    const dateiname = generiereLesDatname('Stornorechnung', originalDaten.kundenname, stornoDaten.stornoDatum);

    // Datei in Storage hochladen
    const file = new File([blob], dateiname, { type: 'application/pdf' });
    const uploadedFile = await storage.createFile(
      BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
      ID.unique(),
      file
    );
    
    // Bruttobetrag berechnen (negativ!)
    const summen = berechneRechnungsSummen(stornoPositionen);
    
    // Storno-Dokument erstellen
    const stornoDokument = await databases.createDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      ID.unique(),
      {
        projektId,
        dokumentTyp: 'stornorechnung',
        dokumentNummer: stornoRechnungsnummer,
        dateiId: uploadedFile.$id,
        dateiname,
        bruttobetrag: summen.bruttobetrag, // Negativ!
        istFinal: true, // UNVERÄNDERBAR!
        stornoVonRechnungId: originalRechnung.$id,
        rechnungsStatus: 'aktiv',
        stornoGrund,
        daten: JSON.stringify(stornoDaten)
      }
    );
    
    // Original-Rechnung als storniert markieren
    const aktualisiertesOriginal = await databases.updateDocument(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      originalRechnung.$id!,
      {
        rechnungsStatus: 'storniert',
        stornoRechnungId: stornoDokument.$id,
        stornoGrund
      }
    );
    
    return {
      stornoRechnung: stornoDokument as unknown as GespeichertesDokument,
      aktualisierteOriginalRechnung: aktualisiertesOriginal as unknown as GespeichertesDokument
    };
  } catch (error) {
    console.error('Fehler beim Erstellen der Stornorechnung:', error);
    throw error;
  }
};

// Storno-Rechnung PDF generieren
const generiereStornoRechnungPDF = async (daten: StornoRechnungsDaten): Promise<jsPDF> => {
  // Wir verwenden das normale Rechnungs-PDF, aber mit Storno-Kennzeichnung
  // Die Positionen haben bereits negative Beträge
  const rechnungsDaten: RechnungsDaten = {
    ...daten,
    rechnungsnummer: daten.stornoRechnungsnummer,
    rechnungsdatum: daten.stornoDatum
  };
  
  const pdf = await generiereRechnungPDF(rechnungsDaten);
  
  // Storno-Wasserzeichen hinzufügen
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(60);
    pdf.setTextColor(255, 0, 0);
    pdf.setFont('helvetica', 'bold');
    
    // Schräg über die Seite
    pdf.saveGraphicsState();
    pdf.text('STORNORECHNUNG', 105, 150, {
      align: 'center',
      angle: 45
    });
    pdf.restoreGraphicsState();
    pdf.setTextColor(0, 0, 0);
  }
  
  return pdf;
};

// Prüfen ob eine neue Rechnung nach Storno erstellt werden kann
export const kannNeueRechnungErstellen = async (projektId: string): Promise<{
  erlaubt: boolean;
  grund?: string;
  letzteRechnung?: GespeichertesDokument;
  stornoRechnung?: GespeichertesDokument;
}> => {
  try {
    const rechnungen = await ladeDokumenteNachTyp(projektId, 'rechnung');
    const stornos = await ladeDokumenteNachTyp(projektId, 'stornorechnung');
    
    if (rechnungen.length === 0) {
      return { erlaubt: true }; // Noch keine Rechnung - erlaubt
    }
    
    const letzteRechnung = rechnungen[0]; // Neueste Rechnung
    
    // Wenn letzte Rechnung aktiv ist, keine neue erlaubt
    if (letzteRechnung.rechnungsStatus !== 'storniert') {
      return {
        erlaubt: false,
        grund: 'Die bestehende Rechnung muss erst storniert werden, bevor eine neue erstellt werden kann.',
        letzteRechnung
      };
    }
    
    // Rechnung wurde storniert - neue erlaubt
    const zugehoerigesStorno = stornos.find(s => s.stornoVonRechnungId === letzteRechnung.$id);
    return {
      erlaubt: true,
      letzteRechnung,
      stornoRechnung: zugehoerigesStorno
    };
  } catch (error) {
    console.error('Fehler beim Prüfen der Rechnungserstellung:', error);
    return { erlaubt: false, grund: 'Fehler bei der Prüfung' };
  }
};

// === DOKUMENTEN-VERLAUF LADEN ===

// Alle Dokumente eines Typs für Dateiverlauf laden
export const ladeDokumentVerlauf = async (
  projektId: string,
  dokumentTyp: DokumentTyp
): Promise<DokumentVerlaufEintrag[]> => {
  try {
    console.log(`🔍 Lade Dokumentverlauf für Projekt ${projektId}, Typ: ${dokumentTyp}`);
    const dokumente = await ladeDokumenteNachTyp(projektId, dokumentTyp);
    console.log(`📄 Gefundene Dokumente: ${dokumente.length}`, dokumente);
    
    // Bei Rechnungen auch Stornos laden
    let stornos: GespeichertesDokument[] = [];
    if (dokumentTyp === 'rechnung') {
      stornos = await ladeDokumenteNachTyp(projektId, 'stornorechnung');
    }
    
    // Alle Dokumente zusammenführen (Rechnungen + Stornos)
    const alleDokumente = [...dokumente, ...stornos];
    
    // Nach Datum sortieren
    alleDokumente.sort((a, b) => 
      new Date(b.$createdAt || '').getTime() - new Date(a.$createdAt || '').getTime()
    );
    
    return alleDokumente.map((dok, index) => ({
      id: dok.$id!,
      typ: dok.dokumentTyp,
      nummer: dok.dokumentNummer,
      dateiname: dok.dateiname,
      erstelltAm: new Date(dok.$createdAt || ''),
      bruttobetrag: dok.bruttobetrag,
      istFinal: dok.istFinal,
      downloadUrl: getFileDownloadUrl(dok.dateiId),
      viewUrl: getFileViewUrl(dok.dateiId),
      version: dok.version,
      rechnungsStatus: dok.rechnungsStatus,
      stornoVonRechnungId: dok.stornoVonRechnungId,
      stornoGrund: dok.stornoGrund,
      // Neuestes Dokument ist "aktuell"
      istAktuell: index === 0 || (dok.dokumentTyp === 'stornorechnung' && index <= stornos.length),
      istStorniert: dok.rechnungsStatus === 'storniert'
    }));
  } catch (error) {
    console.error(`Fehler beim Laden des ${dokumentTyp}-Verlaufs:`, error);
    return [];
  }
};

// Aktuellstes Dokument eines Typs laden
export const ladeAktuellesDokument = async (
  projektId: string,
  dokumentTyp: DokumentTyp
): Promise<GespeichertesDokument | null> => {
  try {
    const dokumente = await ladeDokumenteNachTyp(projektId, dokumentTyp);
    return dokumente.length > 0 ? dokumente[0] : null;
  } catch (error) {
    console.error(`Fehler beim Laden des aktuellen ${dokumentTyp}:`, error);
    return null;
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
    viewUrl: getFileViewUrl(dokument.dateiId),
    version: dokument.version,
    rechnungsStatus: dokument.rechnungsStatus,
    stornoGrund: dokument.stornoGrund
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

// === AUTOMATISCHE STÜCKLISTEN-ÜBERNAHME ===

/**
 * Lädt die Positionen vom vorherigen Dokument im Workflow
 * Angebot → Auftragsbestätigung → Lieferschein → Rechnung
 */
export const ladePositionenVonVorherigem = async (
  projektId: string,
  zielDokumentTyp: 'auftragsbestaetigung' | 'lieferschein' | 'rechnung'
): Promise<Position[] | LieferscheinPosition[] | null> => {
  try {
    // Bestimme das Quell-Dokument basierend auf dem Ziel
    let quellDokumentTyp: 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | null = null;
    
    if (zielDokumentTyp === 'auftragsbestaetigung') {
      quellDokumentTyp = 'angebot';
    } else if (zielDokumentTyp === 'lieferschein') {
      quellDokumentTyp = 'auftragsbestaetigung';
    } else if (zielDokumentTyp === 'rechnung') {
      // Für Rechnung nehmen wir die Positionen aus der Auftragsbestätigung (mit Preisen!)
      quellDokumentTyp = 'auftragsbestaetigung';
    }
    
    if (!quellDokumentTyp) return null;
    
    // Versuche finalisiertes Dokument zu laden
    let quellDokument = await ladeDokumentNachTyp(projektId, quellDokumentTyp);
    
    // Falls kein finalisiertes Dokument existiert, versuche Entwurf zu laden
    if (!quellDokument) {
      const entwurfTyp = `${quellDokumentTyp}sDaten` as EntwurfTyp;
      const entwurf = await ladeEntwurf<AngebotsDaten | AuftragsbestaetigungsDaten | LieferscheinDaten>(
        projektId, 
        entwurfTyp
      );
      
      if (entwurf && 'positionen' in entwurf) {
        return konvertierePositionen(entwurf.positionen, zielDokumentTyp);
      }
      return null;
    }
    
    // Lade Dokument-Daten
    const quellDaten = ladeDokumentDaten<AngebotsDaten | AuftragsbestaetigungsDaten | LieferscheinDaten>(quellDokument);
    
    if (!quellDaten || !('positionen' in quellDaten)) {
      return null;
    }
    
    // Konvertiere Positionen basierend auf dem Ziel-Dokumenttyp
    return konvertierePositionen(quellDaten.positionen, zielDokumentTyp);
    
  } catch (error) {
    console.error('Fehler beim Laden der Positionen vom vorherigen Dokument:', error);
    return null;
  }
};

/**
 * Konvertiert Positionen zwischen verschiedenen Dokumenttypen
 */
function konvertierePositionen(
  quellPositionen: Position[] | LieferscheinPosition[],
  zielDokumentTyp: 'auftragsbestaetigung' | 'lieferschein' | 'rechnung'
): Position[] | LieferscheinPosition[] {
  
  // Prüfe ob Quelle schon LieferscheinPosition ist
  const istLieferscheinPosition = (pos: any): pos is LieferscheinPosition => {
    return 'artikel' in pos && !('bezeichnung' in pos);
  };
  
  if (zielDokumentTyp === 'lieferschein') {
    // Konvertiere zu LieferscheinPosition (ohne Preise)
    return (quellPositionen as Position[]).map((pos: Position) => ({
      id: pos.id,
      artikelnummer: pos.artikelnummer,
      artikel: pos.bezeichnung,
      beschreibung: pos.beschreibung,
      menge: pos.menge,
      einheit: pos.einheit,
      seriennummer: undefined,
      chargennummer: undefined,
    }));
  } else {
    // Konvertiere zu Position (mit Preisen)
    // Falls Quelle LieferscheinPosition ist, nur Artikel-Daten übernehmen
    if (quellPositionen.length > 0 && istLieferscheinPosition(quellPositionen[0])) {
      return (quellPositionen as LieferscheinPosition[]).map((pos: LieferscheinPosition) => ({
        id: pos.id,
        artikelnummer: pos.artikelnummer,
        bezeichnung: pos.artikel,
        beschreibung: pos.beschreibung || '',
        menge: pos.menge,
        einheit: pos.einheit,
        einzelpreis: 0,
        gesamtpreis: 0,
      }));
    }
    
    // Quelle ist bereits Position, einfach kopieren
    return (quellPositionen as Position[]).map((pos: Position) => ({
      id: pos.id,
      artikelnummer: pos.artikelnummer,
      bezeichnung: pos.bezeichnung,
      beschreibung: pos.beschreibung,
      menge: pos.menge,
      einheit: pos.einheit,
      einzelpreis: pos.einzelpreis,
      streichpreis: pos.streichpreis,
      gesamtpreis: pos.gesamtpreis,
    }));
  }
}

/**
 * Lädt die Lieferdaten (KW, bevorzugter Tag, Belieferungsart, DISPO-Ansprechpartner)
 * von der Auftragsbestätigung, falls vorhanden.
 */
export interface LieferdatenAusAB {
  lieferKW?: number;
  lieferKWJahr?: number;
  bevorzugterTag?: Wochentag;
  belieferungsart?: Belieferungsart;
  lieferdatumTyp?: LieferdatumTyp;
  dispoAnsprechpartner?: { name: string; telefon: string };
}

export const ladeLieferdatenVonAuftragsbestaetigung = async (
  projektId: string
): Promise<LieferdatenAusAB | null> => {
  try {
    // Versuche finalisiertes AB-Dokument zu laden
    let abDokument = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');

    // Falls kein finalisiertes Dokument existiert, versuche Entwurf zu laden
    if (!abDokument) {
      const entwurf = await ladeEntwurf<AuftragsbestaetigungsDaten>(
        projektId,
        'auftragsbestaetigungsDaten'
      );

      if (entwurf) {
        return {
          lieferKW: entwurf.lieferKW,
          lieferKWJahr: entwurf.lieferKWJahr,
          bevorzugterTag: entwurf.bevorzugterTag,
          belieferungsart: entwurf.belieferungsart,
          lieferdatumTyp: entwurf.lieferdatumTyp,
          dispoAnsprechpartner: entwurf.dispoAnsprechpartner,
        };
      }
      return null;
    }

    // Lade Dokument-Daten
    const abDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(abDokument);

    if (!abDaten) {
      return null;
    }

    return {
      lieferKW: abDaten.lieferKW,
      lieferKWJahr: abDaten.lieferKWJahr,
      bevorzugterTag: abDaten.bevorzugterTag,
      belieferungsart: abDaten.belieferungsart,
      lieferdatumTyp: abDaten.lieferdatumTyp,
      dispoAnsprechpartner: abDaten.dispoAnsprechpartner,
    };

  } catch (error) {
    console.error('Fehler beim Laden der Lieferdaten von der AB:', error);
    return null;
  }
};
