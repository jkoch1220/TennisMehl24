import { ID, Query, Models } from 'appwrite';
import {
  DATABASE_ID,
  CHAT_NACHRICHTEN_COLLECTION_ID,
  databases,
} from '../config/appwrite';
import { ChatNachricht, NeueChatNachricht } from '../types/chatNachricht';
import { loadAllDocuments } from '../utils/appwritePagination';
import { auditService } from './auditService';

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
      const documents = await loadAllDocuments(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, {
        queries: [Query.equal('projektId', projektId), Query.orderAsc('$createdAt')],
      });
      return documents.map((doc) => parseNachrichtDocument(doc));
    } catch (error: unknown) {
      if ((error as { code?: number })?.code === 404) {
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
    auditService.logAktion({
      action: 'create',
      entityType: 'chat',
      entityId: entry.id,
      summary: `Chat-Nachricht in Projekt ${entry.projektId} gesendet`,
    });
    return parseNachrichtDocument(doc);
  },

  /**
   * Löscht eine Chat-Nachricht
   */
  async remove(id: string): Promise<void> {
    // Für den Audit-Eintrag vor dem Löschen den Kontext holen (best effort)
    let projektId = '';
    try {
      const doc = await databases.getDocument(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, id);
      projektId = parseNachrichtDocument(doc).projektId;
    } catch {
      // Kontext nicht verfügbar — Löschung trotzdem protokollieren
    }
    await databases.deleteDocument(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, id);
    auditService.logAktion({
      action: 'delete',
      entityType: 'chat',
      entityId: id,
      summary: projektId
        ? `Chat-Nachricht in Projekt ${projektId} gelöscht`
        : 'Chat-Nachricht gelöscht',
    });
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error('Fehler beim Laden der Mentions:', error);
      return [];
    }
  },
};
