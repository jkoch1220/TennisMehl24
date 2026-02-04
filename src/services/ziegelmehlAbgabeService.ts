/**
 * Service for managing Ziegelmehl Abgabe (Brick Drop-off Submissions)
 */

import { databases, DATABASE_ID } from '../config/appwrite';
import { Query, ID } from 'appwrite';
import type {
  ZiegelmehlAbgabe,
  NeueZiegelmehlAbgabe,
  ZiegelmehlAbgabeUpdate,
  AbgabeStatus,
} from '../types/ziegelmehlAbgabe';

const COLLECTION_ID = 'ziegelmehl_abgaben';

/**
 * Parse Appwrite document to ZiegelmehlAbgabe type
 */
function parseDocument(doc: Record<string, unknown>): ZiegelmehlAbgabe {
  return {
    id: doc.$id as string,
    $id: doc.$id as string,
    name: doc.name as string,
    email: doc.email as string | undefined,
    telefon: doc.telefon as string,
    menge: doc.menge as number,
    abgabedatum: doc.abgabedatum as string,
    status: doc.status as AbgabeStatus,
    erstelltAm: doc.erstelltAm as string,
    notizen: doc.notizen as string | undefined,
    quelle: (doc.quelle as ZiegelmehlAbgabe['quelle']) || 'website',
  };
}

export const ziegelmehlAbgabeService = {
  /**
   * Load all submissions
   */
  async loadAlleAbgaben(): Promise<ZiegelmehlAbgabe[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.orderDesc('erstelltAm'),
        Query.limit(500),
      ]);

      return response.documents.map((doc) => parseDocument(doc as Record<string, unknown>));
    } catch (error) {
      console.error('Error loading submissions:', error);
      throw error;
    }
  },

  /**
   * Load submissions by status
   */
  async loadAbgabenNachStatus(status: AbgabeStatus): Promise<ZiegelmehlAbgabe[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('status', status),
        Query.orderDesc('erstelltAm'),
        Query.limit(200),
      ]);

      return response.documents.map((doc) => parseDocument(doc as Record<string, unknown>));
    } catch (error) {
      console.error('Error loading submissions by status:', error);
      throw error;
    }
  },

  /**
   * Load a single submission by ID
   */
  async loadAbgabe(id: string): Promise<ZiegelmehlAbgabe> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, id);
      return parseDocument(doc as Record<string, unknown>);
    } catch (error) {
      console.error('Error loading submission:', error);
      throw error;
    }
  },

  /**
   * Create a new submission (manual entry)
   */
  async createAbgabe(abgabe: NeueZiegelmehlAbgabe): Promise<ZiegelmehlAbgabe> {
    try {
      const doc = await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
        ...abgabe,
        status: 'neu',
        erstelltAm: new Date().toISOString(),
        quelle: abgabe.quelle || 'direkt',
      });

      return parseDocument(doc as Record<string, unknown>);
    } catch (error) {
      console.error('Error creating submission:', error);
      throw error;
    }
  },

  /**
   * Update a submission
   */
  async updateAbgabe(id: string, updates: ZiegelmehlAbgabeUpdate): Promise<ZiegelmehlAbgabe> {
    try {
      const doc = await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, updates);
      return parseDocument(doc as Record<string, unknown>);
    } catch (error) {
      console.error('Error updating submission:', error);
      throw error;
    }
  },

  /**
   * Delete a submission
   */
  async deleteAbgabe(id: string): Promise<void> {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id);
    } catch (error) {
      console.error('Error deleting submission:', error);
      throw error;
    }
  },

  /**
   * Update status of a submission
   */
  async updateStatus(id: string, status: AbgabeStatus, notizen?: string): Promise<ZiegelmehlAbgabe> {
    const updates: ZiegelmehlAbgabeUpdate = { status };
    if (notizen !== undefined) {
      updates.notizen = notizen;
    }
    return this.updateAbgabe(id, updates);
  },

  /**
   * Get statistics for submissions
   */
  async getStatistics(): Promise<{
    total: number;
    neu: number;
    bestaetigt: number;
    abgeholt: number;
    abgelehnt: number;
    gesamtMenge: number;
  }> {
    try {
      const abgaben = await this.loadAlleAbgaben();

      const stats = {
        total: abgaben.length,
        neu: abgaben.filter((a) => a.status === 'neu').length,
        bestaetigt: abgaben.filter((a) => a.status === 'bestaetigt').length,
        abgeholt: abgaben.filter((a) => a.status === 'abgeholt').length,
        abgelehnt: abgaben.filter((a) => a.status === 'abgelehnt').length,
        gesamtMenge: abgaben.reduce((sum, a) => sum + (a.menge || 0), 0),
      };

      return stats;
    } catch (error) {
      console.error('Error getting statistics:', error);
      throw error;
    }
  },
};
