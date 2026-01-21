/**
 * Platzbauer-Projektabwicklung Dokument-Service
 *
 * Verwaltet alle Dokumente für Platzbauer-Projekte:
 * - Angebote (versioniert, nicht final)
 * - Auftragsbestätigungen (versioniert, nicht final)
 * - Rechnungen (final, unveränderbar)
 * - Lieferscheine (einzeln pro Verein)
 *
 * Alle Dokumente werden in Appwrite Storage gespeichert
 * und Metadaten in einer Collection verwaltet.
 */

import { ID, Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  PLATZBAUER_DOKUMENTE_COLLECTION_ID,
  PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
  PLATZBAUER_PROJEKTE_COLLECTION_ID,
  PLATZBAUER_DATEIEN_BUCKET_ID,
  APPWRITE_ENDPOINT,
  PROJECT_ID,
} from '../config/appwrite';
import {
  PlatzbauerProjekt,
  PlatzbauerPosition,
  GespeichertesPlatzbauerDokument,
  GespeicherterPlatzbauerLieferschein,
  PlatzbauerDokumentTyp,
  PlatzbauerDokumentAnzeige,
  PlatzbauerDokumentVerlaufEintrag,
  PlatzbauerAngebotFormularDaten,
  PlatzbauerABFormularDaten,
  PlatzbauerRechnungFormularDaten,
  PlatzbauerLieferscheinFormularDaten,
} from '../types/platzbauer';
import {
  generierePlatzbauerAngebotPDF,
  generierePlatzbauerAuftragsbestaetigungPDF,
  generierePlatzbauerRechnungPDF,
  generierePlatzbauerLieferscheinPDF,
  PlatzbauerAngebotsDaten,
  PlatzbauerAuftragsbestaetigungsDaten,
  PlatzbauerRechnungsDaten,
  PlatzbauerLieferscheinDaten,
} from './platzbauerdokumentService';
import { platzbauerverwaltungService } from './platzbauerverwaltungService';

// ==================== HELPER FUNKTIONEN ====================

/**
 * Konvertiert jsPDF zu Blob
 */
const pdfToBlob = (pdf: any): Blob => {
  const pdfOutput = pdf.output('blob');
  return new Blob([pdfOutput], { type: 'application/pdf' });
};

/**
 * Generiert eine URL zum Anzeigen einer Datei
 */
const getFileViewUrl = (dateiId: string): string => {
  return `${APPWRITE_ENDPOINT}/storage/buckets/${PLATZBAUER_DATEIEN_BUCKET_ID}/files/${dateiId}/view?project=${PROJECT_ID}`;
};

/**
 * Generiert eine URL zum Herunterladen einer Datei
 */
const getFileDownloadUrl = (dateiId: string): string => {
  return `${APPWRITE_ENDPOINT}/storage/buckets/${PLATZBAUER_DATEIEN_BUCKET_ID}/files/${dateiId}/download?project=${PROJECT_ID}`;
};

/**
 * Generiert eine Dokumentnummer
 */
const generiereDokumentNummer = (
  typ: PlatzbauerDokumentTyp | 'lieferschein',
  saisonjahr: number,
  laufendeNummer: number
): string => {
  const prefix = {
    angebot: 'PB-AG',
    auftragsbestaetigung: 'PB-AB',
    rechnung: 'PB-RE',
    lieferschein: 'PB-LS',
  }[typ];

  return `${prefix}-${saisonjahr}-${String(laufendeNummer).padStart(3, '0')}`;
};

/**
 * Zählt bestehende Dokumente eines Typs für die Nummernvergabe
 */
const zaehleBesteheneDokumente = async (
  typ: PlatzbauerDokumentTyp | 'lieferschein',
  saisonjahr: number
): Promise<number> => {
  try {
    const collectionId = typ === 'lieferschein'
      ? PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID
      : PLATZBAUER_DOKUMENTE_COLLECTION_ID;

    const prefix = {
      angebot: 'PB-AG',
      auftragsbestaetigung: 'PB-AB',
      rechnung: 'PB-RE',
      lieferschein: 'PB-LS',
    }[typ];

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      [
        Query.startsWith(typ === 'lieferschein' ? 'lieferscheinnummer' : 'dokumentNummer', `${prefix}-${saisonjahr}`),
        Query.limit(1000),
      ]
    );

    return response.total;
  } catch (error) {
    console.error('Fehler beim Zählen der Dokumente:', error);
    return 0;
  }
};

// ==================== ANGEBOT ====================

/**
 * Speichert ein neues Angebot oder erstellt eine neue Version
 */
export const speicherePlatzbauerAngebot = async (
  projekt: PlatzbauerProjekt,
  daten: PlatzbauerAngebotFormularDaten
): Promise<GespeichertesPlatzbauerDokument> => {
  // Dokumentnummer generieren falls nicht vorhanden
  if (!daten.angebotsnummer) {
    const anzahl = await zaehleBesteheneDokumente('angebot', projekt.saisonjahr);
    daten.angebotsnummer = generiereDokumentNummer('angebot', projekt.saisonjahr, anzahl + 1);
  }

  // Version ermitteln
  const bestehendeAngebote = await ladeDokumenteNachTyp(projekt.id, 'angebot');
  const version = bestehendeAngebote.length + 1;

  // PDF-Daten vorbereiten
  const pdfDaten: PlatzbauerAngebotsDaten = {
    projekt,
    angebotsnummer: daten.angebotsnummer,
    angebotsdatum: daten.angebotsdatum,
    gueltigBis: daten.gueltigBis,
    platzbauerId: daten.platzbauerId,
    platzbauername: daten.platzbauername,
    platzbauerstrasse: daten.platzbauerstrasse,
    platzbauerPlzOrt: daten.platzbauerPlzOrt,
    platzbauerAnsprechpartner: daten.platzbauerAnsprechpartner,
    positionen: daten.positionen,
    zahlungsziel: daten.zahlungsziel,
    zahlungsart: daten.zahlungsart,
    skontoAktiviert: daten.skontoAktiviert,
    skonto: daten.skonto,
    lieferzeit: daten.lieferzeit,
    frachtkosten: daten.frachtkosten,
    verpackungskosten: daten.verpackungskosten,
    lieferbedingungenAktiviert: daten.lieferbedingungenAktiviert,
    lieferbedingungen: daten.lieferbedingungen,
    bemerkung: daten.bemerkung,
    ihreAnsprechpartner: daten.ihreAnsprechpartner,
  };

  // PDF generieren
  const pdf = await generierePlatzbauerAngebotPDF(pdfDaten);
  const blob = pdfToBlob(pdf);

  // Dateiname
  const dateiname = `Angebot ${projekt.projektName} v${version}.pdf`;

  // In Storage hochladen
  const file = new File([blob], dateiname, { type: 'application/pdf' });
  const uploadedFile = await storage.createFile(
    PLATZBAUER_DATEIEN_BUCKET_ID,
    ID.unique(),
    file
  );

  // Summen berechnen
  const nettobetrag = daten.positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const bruttobetrag = nettobetrag * 1.19;
  const gesamtMenge = daten.positionen.reduce((sum, p) => sum + p.menge, 0);

  // Metadaten in DB speichern
  const dokument = await databases.createDocument(
    DATABASE_ID,
    PLATZBAUER_DOKUMENTE_COLLECTION_ID,
    ID.unique(),
    {
      platzbauerprojektId: projekt.id,
      dokumentTyp: 'angebot',
      dokumentNummer: daten.angebotsnummer,
      dateiId: uploadedFile.$id,
      dateiname,
      bruttobetrag,
      nettobetrag,
      gesamtMenge,
      anzahlPositionen: daten.positionen.length,
      istFinal: false,
      daten: JSON.stringify(daten),
      version,
    }
  );

  // Projekt aktualisieren
  await databases.updateDocument(
    DATABASE_ID,
    PLATZBAUER_PROJEKTE_COLLECTION_ID,
    projekt.id,
    {
      angebotId: dokument.$id,
      angebotsnummer: daten.angebotsnummer,
      angebotsdatum: daten.angebotsdatum,
      gesamtMenge,
      gesamtBrutto: bruttobetrag,
      anzahlVereine: daten.positionen.length,
      geaendertAm: new Date().toISOString(),
    }
  );

  return {
    $id: dokument.$id,
    id: dokument.$id,
    platzbauerprojektId: projekt.id,
    dokumentTyp: 'angebot',
    dokumentNummer: daten.angebotsnummer,
    dateiId: uploadedFile.$id,
    dateiname,
    bruttobetrag,
    nettobetrag,
    gesamtMenge,
    anzahlPositionen: daten.positionen.length,
    istFinal: false,
    daten: JSON.stringify(daten),
    version,
    $createdAt: dokument.$createdAt,
    $updatedAt: dokument.$updatedAt,
  };
};

// ==================== AUFTRAGSBESTÄTIGUNG ====================

/**
 * Speichert eine neue Auftragsbestätigung
 */
export const speicherePlatzbauerAuftragsbestaetigung = async (
  projekt: PlatzbauerProjekt,
  daten: PlatzbauerABFormularDaten
): Promise<GespeichertesPlatzbauerDokument> => {
  // Dokumentnummer generieren falls nicht vorhanden
  if (!daten.auftragsbestaetigungsnummer) {
    const anzahl = await zaehleBesteheneDokumente('auftragsbestaetigung', projekt.saisonjahr);
    daten.auftragsbestaetigungsnummer = generiereDokumentNummer('auftragsbestaetigung', projekt.saisonjahr, anzahl + 1);
  }

  // Version ermitteln
  const bestehendeABs = await ladeDokumenteNachTyp(projekt.id, 'auftragsbestaetigung');
  const version = bestehendeABs.length + 1;

  // PDF-Daten vorbereiten
  const pdfDaten: PlatzbauerAuftragsbestaetigungsDaten = {
    projekt,
    auftragsbestaetigungsnummer: daten.auftragsbestaetigungsnummer,
    auftragsbestaetigungsdatum: daten.auftragsbestaetigungsdatum,
    platzbauerId: daten.platzbauerId,
    platzbauername: daten.platzbauername,
    platzbauerstrasse: daten.platzbauerstrasse,
    platzbauerPlzOrt: daten.platzbauerPlzOrt,
    platzbauerAnsprechpartner: daten.platzbauerAnsprechpartner,
    positionen: daten.positionen,
    zahlungsziel: daten.zahlungsziel,
    zahlungsart: daten.zahlungsart,
    skontoAktiviert: daten.skontoAktiviert,
    skonto: daten.skonto,
    lieferzeit: daten.lieferzeit,
    frachtkosten: daten.frachtkosten,
    verpackungskosten: daten.verpackungskosten,
    lieferbedingungenAktiviert: daten.lieferbedingungenAktiviert,
    lieferbedingungen: daten.lieferbedingungen,
    bemerkung: daten.bemerkung,
    ihreAnsprechpartner: daten.ihreAnsprechpartner,
  };

  // PDF generieren
  const pdf = await generierePlatzbauerAuftragsbestaetigungPDF(pdfDaten);
  const blob = pdfToBlob(pdf);

  // Dateiname
  const dateiname = `Auftragsbestaetigung ${projekt.projektName} v${version}.pdf`;

  // In Storage hochladen
  const file = new File([blob], dateiname, { type: 'application/pdf' });
  const uploadedFile = await storage.createFile(
    PLATZBAUER_DATEIEN_BUCKET_ID,
    ID.unique(),
    file
  );

  // Summen berechnen
  const nettobetrag = daten.positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const bruttobetrag = nettobetrag * 1.19;
  const gesamtMenge = daten.positionen.reduce((sum, p) => sum + p.menge, 0);

  // Metadaten in DB speichern
  const dokument = await databases.createDocument(
    DATABASE_ID,
    PLATZBAUER_DOKUMENTE_COLLECTION_ID,
    ID.unique(),
    {
      platzbauerprojektId: projekt.id,
      dokumentTyp: 'auftragsbestaetigung',
      dokumentNummer: daten.auftragsbestaetigungsnummer,
      dateiId: uploadedFile.$id,
      dateiname,
      bruttobetrag,
      nettobetrag,
      gesamtMenge,
      anzahlPositionen: daten.positionen.length,
      istFinal: false,
      daten: JSON.stringify(daten),
      version,
    }
  );

  // Projekt aktualisieren - Status auf "lieferschein"
  await databases.updateDocument(
    DATABASE_ID,
    PLATZBAUER_PROJEKTE_COLLECTION_ID,
    projekt.id,
    {
      status: 'lieferschein',
      auftragsbestaetigungId: dokument.$id,
      auftragsbestaetigungsnummer: daten.auftragsbestaetigungsnummer,
      auftragsbestaetigungsdatum: daten.auftragsbestaetigungsdatum,
      gesamtMenge,
      gesamtBrutto: bruttobetrag,
      anzahlVereine: daten.positionen.length,
      geaendertAm: new Date().toISOString(),
    }
  );

  return {
    $id: dokument.$id,
    id: dokument.$id,
    platzbauerprojektId: projekt.id,
    dokumentTyp: 'auftragsbestaetigung',
    dokumentNummer: daten.auftragsbestaetigungsnummer,
    dateiId: uploadedFile.$id,
    dateiname,
    bruttobetrag,
    nettobetrag,
    gesamtMenge,
    anzahlPositionen: daten.positionen.length,
    istFinal: false,
    daten: JSON.stringify(daten),
    version,
    $createdAt: dokument.$createdAt,
    $updatedAt: dokument.$updatedAt,
  };
};

// ==================== RECHNUNG ====================

/**
 * Speichert eine Rechnung (FINAL - nicht änderbar!)
 */
export const speicherePlatzbauerRechnung = async (
  projekt: PlatzbauerProjekt,
  daten: PlatzbauerRechnungFormularDaten
): Promise<GespeichertesPlatzbauerDokument> => {
  // Prüfen ob bereits eine Rechnung existiert
  const bestehendeRechnungen = await ladeDokumenteNachTyp(projekt.id, 'rechnung');
  if (bestehendeRechnungen.length > 0) {
    throw new Error('Für dieses Platzbauer-Projekt existiert bereits eine Rechnung.');
  }

  // Dokumentnummer generieren
  if (!daten.rechnungsnummer) {
    const anzahl = await zaehleBesteheneDokumente('rechnung', projekt.saisonjahr);
    daten.rechnungsnummer = generiereDokumentNummer('rechnung', projekt.saisonjahr, anzahl + 1);
  }

  // PDF-Daten vorbereiten
  const pdfDaten: PlatzbauerRechnungsDaten = {
    projekt,
    rechnungsnummer: daten.rechnungsnummer,
    rechnungsdatum: daten.rechnungsdatum,
    leistungsdatum: daten.leistungsdatum,
    platzbauerId: daten.platzbauerId,
    platzbauername: daten.platzbauername,
    platzbauerstrasse: daten.platzbauerstrasse,
    platzbauerPlzOrt: daten.platzbauerPlzOrt,
    platzbauerAnsprechpartner: daten.platzbauerAnsprechpartner,
    positionen: daten.positionen,
    zahlungsziel: daten.zahlungsziel,
    skontoAktiviert: daten.skontoAktiviert,
    skonto: daten.skonto,
    bemerkung: daten.bemerkung,
    ihreAnsprechpartner: daten.ihreAnsprechpartner,
  };

  // PDF generieren
  const pdf = await generierePlatzbauerRechnungPDF(pdfDaten);
  const blob = pdfToBlob(pdf);

  // Dateiname
  const dateiname = `Rechnung ${projekt.projektName}.pdf`;

  // In Storage hochladen
  const file = new File([blob], dateiname, { type: 'application/pdf' });
  const uploadedFile = await storage.createFile(
    PLATZBAUER_DATEIEN_BUCKET_ID,
    ID.unique(),
    file
  );

  // Summen berechnen
  const nettobetrag = daten.positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const bruttobetrag = nettobetrag * 1.19;
  const gesamtMenge = daten.positionen.reduce((sum, p) => sum + p.menge, 0);

  // Metadaten in DB speichern
  const dokument = await databases.createDocument(
    DATABASE_ID,
    PLATZBAUER_DOKUMENTE_COLLECTION_ID,
    ID.unique(),
    {
      platzbauerprojektId: projekt.id,
      dokumentTyp: 'rechnung',
      dokumentNummer: daten.rechnungsnummer,
      dateiId: uploadedFile.$id,
      dateiname,
      bruttobetrag,
      nettobetrag,
      gesamtMenge,
      anzahlPositionen: daten.positionen.length,
      istFinal: true, // FINAL!
      daten: JSON.stringify(daten),
      version: 1,
    }
  );

  // Projekt aktualisieren - Status auf "rechnung"
  await databases.updateDocument(
    DATABASE_ID,
    PLATZBAUER_PROJEKTE_COLLECTION_ID,
    projekt.id,
    {
      status: 'rechnung',
      rechnungId: dokument.$id,
      rechnungsnummer: daten.rechnungsnummer,
      rechnungsdatum: daten.rechnungsdatum,
      gesamtMenge,
      gesamtBrutto: bruttobetrag,
      anzahlVereine: daten.positionen.length,
      geaendertAm: new Date().toISOString(),
    }
  );

  return {
    $id: dokument.$id,
    id: dokument.$id,
    platzbauerprojektId: projekt.id,
    dokumentTyp: 'rechnung',
    dokumentNummer: daten.rechnungsnummer,
    dateiId: uploadedFile.$id,
    dateiname,
    bruttobetrag,
    nettobetrag,
    gesamtMenge,
    anzahlPositionen: daten.positionen.length,
    istFinal: true,
    daten: JSON.stringify(daten),
    version: 1,
    $createdAt: dokument.$createdAt,
    $updatedAt: dokument.$updatedAt,
  };
};

// ==================== LIEFERSCHEIN ====================

/**
 * Speichert einen Lieferschein für einen einzelnen Verein
 */
export const speicherePlatzbauerLieferschein = async (
  projekt: PlatzbauerProjekt,
  vereinPosition: PlatzbauerPosition,
  daten: PlatzbauerLieferscheinFormularDaten
): Promise<GespeicherterPlatzbauerLieferschein> => {
  // Prüfen ob bereits ein Lieferschein für diesen Verein existiert
  const bestehend = await ladeLieferscheinFuerVerein(projekt.id, vereinPosition.vereinId);
  if (bestehend) {
    throw new Error(`Für ${vereinPosition.vereinsname} existiert bereits ein Lieferschein.`);
  }

  // Dokumentnummer generieren
  if (!daten.lieferscheinnummer) {
    const anzahl = await zaehleBesteheneDokumente('lieferschein', projekt.saisonjahr);
    daten.lieferscheinnummer = generiereDokumentNummer('lieferschein', projekt.saisonjahr, anzahl + 1);
  }

  // PDF-Daten vorbereiten
  const pdfDaten: PlatzbauerLieferscheinDaten = {
    projekt,
    lieferscheinnummer: daten.lieferscheinnummer,
    lieferdatum: daten.lieferdatum,
    vereinId: daten.vereinId,
    vereinsname: daten.vereinsname,
    vereinsstrasse: daten.vereinsstrasse,
    vereinsPlzOrt: daten.vereinsPlzOrt,
    vereinsAnsprechpartner: daten.vereinsAnsprechpartner,
    lieferadresseAbweichend: daten.lieferadresseAbweichend,
    lieferadresseName: daten.lieferadresseName,
    lieferadresseStrasse: daten.lieferadresseStrasse,
    lieferadressePlzOrt: daten.lieferadressePlzOrt,
    menge: daten.menge,
    einheit: daten.einheit,
    platzbauername: daten.platzbauername,
    bemerkung: daten.bemerkung,
    unterschriftenFuerEmpfangsbestaetigung: daten.unterschriftenFuerEmpfangsbestaetigung ?? true,
    ihreAnsprechpartner: daten.ihreAnsprechpartner,
  };

  // PDF generieren
  const pdf = await generierePlatzbauerLieferscheinPDF(pdfDaten);
  const blob = pdfToBlob(pdf);

  // Dateiname
  const dateiname = `Lieferschein ${vereinPosition.vereinsname}.pdf`;

  // In Storage hochladen
  const file = new File([blob], dateiname, { type: 'application/pdf' });
  const uploadedFile = await storage.createFile(
    PLATZBAUER_DATEIEN_BUCKET_ID,
    ID.unique(),
    file
  );

  // Metadaten in DB speichern
  const dokument = await databases.createDocument(
    DATABASE_ID,
    PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
    ID.unique(),
    {
      platzbauerprojektId: projekt.id,
      vereinId: vereinPosition.vereinId,
      vereinsprojektId: vereinPosition.vereinsprojektId,
      vereinsname: vereinPosition.vereinsname,
      lieferscheinnummer: daten.lieferscheinnummer,
      lieferdatum: daten.lieferdatum,
      dateiId: uploadedFile.$id,
      dateiname,
      menge: daten.menge,
      daten: JSON.stringify(daten),
    }
  );

  return {
    $id: dokument.$id,
    id: dokument.$id,
    platzbauerprojektId: projekt.id,
    vereinId: vereinPosition.vereinId,
    vereinsprojektId: vereinPosition.vereinsprojektId,
    vereinsname: vereinPosition.vereinsname,
    lieferscheinnummer: daten.lieferscheinnummer,
    lieferdatum: daten.lieferdatum,
    dateiId: uploadedFile.$id,
    dateiname,
    menge: daten.menge,
    daten: JSON.stringify(daten),
    $createdAt: dokument.$createdAt,
    $updatedAt: dokument.$updatedAt,
  };
};

// ==================== LADEN ====================

/**
 * Lädt alle Dokumente eines Typs für ein Projekt
 */
export const ladeDokumenteNachTyp = async (
  projektId: string,
  dokumentTyp: PlatzbauerDokumentTyp
): Promise<GespeichertesPlatzbauerDokument[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PLATZBAUER_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('platzbauerprojektId', projektId),
        Query.equal('dokumentTyp', dokumentTyp),
        Query.orderDesc('$createdAt'),
      ]
    );

    return response.documents as unknown as GespeichertesPlatzbauerDokument[];
  } catch (error) {
    console.error('Fehler beim Laden der Dokumente:', error);
    return [];
  }
};

/**
 * Lädt das aktuellste Dokument eines Typs
 */
export const ladeAktuellesDokument = async (
  projektId: string,
  dokumentTyp: PlatzbauerDokumentTyp
): Promise<GespeichertesPlatzbauerDokument | null> => {
  const dokumente = await ladeDokumenteNachTyp(projektId, dokumentTyp);
  return dokumente.length > 0 ? dokumente[0] : null;
};

/**
 * Lädt alle Lieferscheine für ein Projekt
 */
export const ladeLieferscheineFuerProjekt = async (
  projektId: string
): Promise<GespeicherterPlatzbauerLieferschein[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
      [
        Query.equal('platzbauerprojektId', projektId),
        Query.orderDesc('$createdAt'),
      ]
    );

    return response.documents as unknown as GespeicherterPlatzbauerLieferschein[];
  } catch (error) {
    console.error('Fehler beim Laden der Lieferscheine:', error);
    return [];
  }
};

/**
 * Lädt einen Lieferschein für einen bestimmten Verein
 */
export const ladeLieferscheinFuerVerein = async (
  projektId: string,
  vereinId: string
): Promise<GespeicherterPlatzbauerLieferschein | null> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
      [
        Query.equal('platzbauerprojektId', projektId),
        Query.equal('vereinId', vereinId),
        Query.limit(1),
      ]
    );

    if (response.documents.length === 0) return null;

    return response.documents[0] as unknown as GespeicherterPlatzbauerLieferschein;
  } catch (error) {
    console.error('Fehler beim Laden des Lieferscheins:', error);
    return null;
  }
};

// ==================== UI-FORMATIERUNG ====================

/**
 * Formatiert Dokumente für die UI-Anzeige
 */
export const formatiereDokumenteFuerUI = (
  dokumente: GespeichertesPlatzbauerDokument[]
): PlatzbauerDokumentAnzeige[] => {
  return dokumente.map(dok => ({
    id: dok.$id || dok.id || '',
    typ: dok.dokumentTyp,
    nummer: dok.dokumentNummer,
    dateiname: dok.dateiname,
    erstelltAm: dok.$createdAt ? new Date(dok.$createdAt) : new Date(),
    bruttobetrag: dok.bruttobetrag,
    gesamtMenge: dok.gesamtMenge,
    istFinal: dok.istFinal,
    downloadUrl: getFileDownloadUrl(dok.dateiId),
    viewUrl: getFileViewUrl(dok.dateiId),
    version: dok.version,
  }));
};

/**
 * Lädt den Dokumentverlauf für die UI
 */
export const ladeDokumentVerlauf = async (
  projektId: string,
  dokumentTyp: PlatzbauerDokumentTyp
): Promise<PlatzbauerDokumentVerlaufEintrag[]> => {
  const dokumente = await ladeDokumenteNachTyp(projektId, dokumentTyp);
  const formatted = formatiereDokumenteFuerUI(dokumente);

  return formatted.map((dok, index) => ({
    ...dok,
    istAktuell: index === 0,
  }));
};

// ==================== ENTWÜRFE ====================

/**
 * Speichert einen Entwurf im Projekt
 */
export const speichereEntwurf = async (
  projektId: string,
  typ: 'angebot' | 'auftragsbestaetigung' | 'rechnung',
  daten: any
): Promise<void> => {
  const feldName = {
    angebot: 'angebotsDaten',
    auftragsbestaetigung: 'auftragsbestaetigungsDaten',
    rechnung: 'rechnungsDaten',
  }[typ];

  await databases.updateDocument(
    DATABASE_ID,
    PLATZBAUER_PROJEKTE_COLLECTION_ID,
    projektId,
    {
      [feldName]: JSON.stringify(daten),
      geaendertAm: new Date().toISOString(),
    }
  );
};

/**
 * Lädt einen Entwurf aus dem Projekt
 */
export const ladeEntwurf = async <T>(
  projektId: string,
  typ: 'angebot' | 'auftragsbestaetigung' | 'rechnung'
): Promise<T | null> => {
  try {
    const projekt = await platzbauerverwaltungService.getPlatzbauerprojekt(projektId);
    if (!projekt) return null;

    const feldName = {
      angebot: 'angebotsDaten',
      auftragsbestaetigung: 'auftragsbestaetigungsDaten',
      rechnung: 'rechnungsDaten',
    }[typ];

    const daten = projekt[feldName as keyof PlatzbauerProjekt];
    if (!daten || typeof daten !== 'string') return null;

    return JSON.parse(daten) as T;
  } catch (error) {
    console.error('Fehler beim Laden des Entwurfs:', error);
    return null;
  }
};

// ==================== STATUS-MANAGEMENT ====================

/**
 * Markiert ein Projekt als bezahlt
 */
export const markiereAlsBezahlt = async (projektId: string): Promise<void> => {
  await databases.updateDocument(
    DATABASE_ID,
    PLATZBAUER_PROJEKTE_COLLECTION_ID,
    projektId,
    {
      status: 'bezahlt',
      bezahltAm: new Date().toISOString(),
      geaendertAm: new Date().toISOString(),
    }
  );
};

// ==================== EXPORT ====================

export const platzbauerprojektabwicklungDokumentService = {
  // Speichern
  speicherePlatzbauerAngebot,
  speicherePlatzbauerAuftragsbestaetigung,
  speicherePlatzbauerRechnung,
  speicherePlatzbauerLieferschein,

  // Laden
  ladeDokumenteNachTyp,
  ladeAktuellesDokument,
  ladeLieferscheineFuerProjekt,
  ladeLieferscheinFuerVerein,
  ladeDokumentVerlauf,

  // Entwürfe
  speichereEntwurf,
  ladeEntwurf,

  // Status
  markiereAlsBezahlt,

  // UI
  formatiereDokumenteFuerUI,

  // URLs
  getFileViewUrl,
  getFileDownloadUrl,
};

export default platzbauerprojektabwicklungDokumentService;
