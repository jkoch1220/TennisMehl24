import { ID, Query, Models } from 'appwrite';
import {
  DATABASE_ID,
  KUNDEN_AKTIVITAETEN_COLLECTION_ID,
  KUNDEN_DATEIEN_BUCKET_ID,
  databases,
  storage,
} from '../config/appwrite';
import { KundenAktivitaet, KundenAktivitaetsTyp, NeueKundenAktivitaet } from '../types/kundenAktivitaet';

function parseAktivitaetDocument(doc: Models.Document): KundenAktivitaet {
  const anyDoc = doc as any;
  if (anyDoc?.data && typeof anyDoc.data === 'string') {
    try {
      const parsed = JSON.parse(anyDoc.data) as KundenAktivitaet;
      return {
        ...parsed,
        id: parsed.id || doc.$id,
        erstelltAm: parsed.erstelltAm || doc.$createdAt,
      };
    } catch (error) {
      console.warn('⚠️ Konnte Kunden-Aktivität nicht parsen, fallback auf Felder.', error);
    }
  }

  const raw = doc as Models.Document & Partial<KundenAktivitaet>;

  return {
    id: doc.$id,
    kundeId: raw.kundeId || '',
    typ: (raw.typ as KundenAktivitaetsTyp) || 'notiz',
    titel: raw.titel || '',
    beschreibung: raw.beschreibung,
    dateiId: raw.dateiId,
    dateiName: raw.dateiName,
    dateiTyp: raw.dateiTyp,
    dateiGroesse: raw.dateiGroesse,
    erstelltAm: raw.erstelltAm || doc.$createdAt,
    erstelltVon: raw.erstelltVon,
  };
}

function toPayload(entry: KundenAktivitaet) {
  return {
    kundeId: entry.kundeId,
    typ: entry.typ,
    titel: entry.titel,
    beschreibung: entry.beschreibung || '',
    dateiId: entry.dateiId || '',
    dateiName: entry.dateiName || '',
    dateiTyp: entry.dateiTyp || '',
    dateiGroesse: entry.dateiGroesse ?? null,
    erstelltAm: entry.erstelltAm,
    erstelltVon: entry.erstelltVon || '',
    data: JSON.stringify(entry),
  };
}

export const kundenAktivitaetService = {
  async list(kundeId: string): Promise<KundenAktivitaet[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, KUNDEN_AKTIVITAETEN_COLLECTION_ID, [
        Query.equal('kundeId', kundeId),
        Query.orderDesc('$createdAt'),
        Query.limit(500),
      ]);
      return response.documents.map((doc) => parseAktivitaetDocument(doc));
    } catch (error: any) {
      if (error?.code === 404) {
        console.warn('⚠️ Collection kunden_aktivitaeten fehlt. Bitte Appwrite Setup ausführen.');
        return [];
      }
      console.error('Fehler beim Laden der Kunden-Aktivitäten:', error);
      return [];
    }
  },

  async create(aktivitaet: NeueKundenAktivitaet): Promise<KundenAktivitaet> {
    const jetzt = new Date().toISOString();
    const entry: KundenAktivitaet = {
      ...aktivitaet,
      id: ID.unique(),
      erstelltAm: aktivitaet.erstelltAm || jetzt,
    };

    const doc = await databases.createDocument(
      DATABASE_ID,
      KUNDEN_AKTIVITAETEN_COLLECTION_ID,
      entry.id,
      toPayload(entry)
    );
    return parseAktivitaetDocument(doc);
  },

  async remove(id: string): Promise<void> {
    // Hole Dokument, um ggf. Datei zu löschen
    try {
      const doc = await databases.getDocument(DATABASE_ID, KUNDEN_AKTIVITAETEN_COLLECTION_ID, id);
      const aktivitaet = parseAktivitaetDocument(doc);
      if (aktivitaet.dateiId) {
        try {
          await storage.deleteFile(KUNDEN_DATEIEN_BUCKET_ID, aktivitaet.dateiId);
        } catch (error) {
          console.warn('Konnte Datei nicht löschen:', error);
        }
      }
    } catch (error) {
      console.warn('Konnte Aktivität vor Löschung nicht lesen:', error);
    }

    await databases.deleteDocument(DATABASE_ID, KUNDEN_AKTIVITAETEN_COLLECTION_ID, id);
  },

  async uploadDatei(kundeId: string, file: File, beschreibung?: string): Promise<KundenAktivitaet> {
    const uploaded = await storage.createFile(KUNDEN_DATEIEN_BUCKET_ID, ID.unique(), file);
    return this.create({
      kundeId,
      typ: 'datei',
      titel: `Datei: ${file.name}`,
      beschreibung,
      dateiId: uploaded.$id,
      dateiName: file.name,
      dateiTyp: file.type,
      dateiGroesse: file.size,
    });
  },

  getDateiUrl(dateiId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
    return `${endpoint}/storage/buckets/${KUNDEN_DATEIEN_BUCKET_ID}/files/${dateiId}/view?project=${projectId}`;
  },

  getDownloadUrl(dateiId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
    return `${endpoint}/storage/buckets/${KUNDEN_DATEIEN_BUCKET_ID}/files/${dateiId}/download?project=${projectId}`;
  },
};
