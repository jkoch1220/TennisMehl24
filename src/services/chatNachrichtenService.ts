import { ID, Query, Models } from 'appwrite';
import {
  DATABASE_ID,
  CHAT_NACHRICHTEN_COLLECTION_ID,
  databases,
} from '../config/appwrite';
import { ChatNachricht, NeueChatNachricht } from '../types/chatNachricht';

function parseNachrichtDocument(doc: Models.Document): ChatNachricht {
  const anyDoc = doc as any;
  if (anyDoc?.data && typeof anyDoc.data === 'string') {
    try {
      const parsed = JSON.parse(anyDoc.data) as ChatNachricht;
      return {
        ...parsed,
        id: parsed.id || doc.$id,
        erstelltAm: parsed.erstelltAm || doc.$createdAt,
      };
    } catch (error) {
      console.warn('⚠️ Konnte Chat-Nachricht nicht parsen, fallback auf Felder.', error);
    }
  }

  const raw = doc as Models.Document & Partial<ChatNachricht>;

  return {
    id: doc.$id,
    projektId: raw.projektId || '',
    text: raw.text || '',
    mentions: raw.mentions || [],
    erstelltAm: raw.erstelltAm || doc.$createdAt,
    erstelltVon: raw.erstelltVon || '',
    erstelltVonName: raw.erstelltVonName || '',
  };
}

function toPayload(entry: ChatNachricht) {
  return {
    projektId: entry.projektId,
    text: entry.text,
    mentions: entry.mentions,
    erstelltAm: entry.erstelltAm,
    erstelltVon: entry.erstelltVon,
    erstelltVonName: entry.erstelltVonName,
    data: JSON.stringify(entry),
  };
}

export const chatNachrichtenService = {
  /**
   * Lädt alle Chat-Nachrichten für ein Projekt
   */
  async list(projektId: string): Promise<ChatNachricht[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, [
        Query.equal('projektId', projektId),
        Query.orderAsc('$createdAt'),
        Query.limit(500),
      ]);
      return response.documents.map((doc) => parseNachrichtDocument(doc));
    } catch (error: any) {
      if (error?.code === 404) {
        console.warn('⚠️ Collection chat_nachrichten fehlt. Bitte Appwrite Setup ausführen.');
        return [];
      }
      console.error('Fehler beim Laden der Chat-Nachrichten:', error);
      return [];
    }
  },

  /**
   * Erstellt eine neue Chat-Nachricht
   */
  async create(nachricht: NeueChatNachricht): Promise<ChatNachricht> {
    const jetzt = new Date().toISOString();
    const entry: ChatNachricht = {
      ...nachricht,
      id: ID.unique(),
      mentions: nachricht.mentions || [],
      erstelltAm: jetzt,
    };

    const doc = await databases.createDocument(
      DATABASE_ID,
      CHAT_NACHRICHTEN_COLLECTION_ID,
      entry.id,
      toPayload(entry)
    );
    return parseNachrichtDocument(doc);
  },

  /**
   * Löscht eine Chat-Nachricht
   */
  async remove(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, id);
  },

  /**
   * Lädt alle Nachrichten eines Users (für globalen Feed)
   */
  async listByUser(userId: string): Promise<ChatNachricht[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, [
        Query.equal('erstelltVon', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]);
      return response.documents.map((doc) => parseNachrichtDocument(doc));
    } catch (error: any) {
      console.error('Fehler beim Laden der User-Nachrichten:', error);
      return [];
    }
  },

  /**
   * Lädt alle Nachrichten wo ein User erwähnt wurde
   */
  async listMentions(userId: string): Promise<ChatNachricht[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, [
        Query.contains('mentions', [userId]),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]);
      return response.documents.map((doc) => parseNachrichtDocument(doc));
    } catch (error: any) {
      console.error('Fehler beim Laden der Mentions:', error);
      return [];
    }
  },
};
