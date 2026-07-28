import { ID, Query, Models } from 'appwrite';
import { databases, DATABASE_ID, ADMIN_CHANGELOG_COLLECTION_ID } from '../config/appwrite';
import { AdminChangelogEntry, AdminChangelogDbEntry } from '../types/adminChangelog';

const COLLECTION_ID = ADMIN_CHANGELOG_COLLECTION_ID;

export const adminChangelogService = {
  /**
   * Erstellt einen neuen Changelog-Eintrag (nur für Julian)
   */
  async create(entry: AdminChangelogEntry, userId: string): Promise<AdminChangelogDbEntry> {
    try {
      const now = new Date().toISOString();
      const doc = await databases.createDocument(
        DATABASE_ID,
        COLLECTION_ID,
        ID.unique(),
        {
          ...entry,
          timestamp: now,
          createdBy: userId,
        }
      );
      return parseDoc(doc);
    } catch (error) {
      console.error('❌ Fehler beim Erstellen des Changelog-Eintrags:', error);
      throw error;
    }
  },

  /**
   * Holt alle Einträge (neueste zuerst)
   */
  async getAll(): Promise<AdminChangelogDbEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.orderDesc('timestamp'), Query.limit(1000)]
      );
      return response.documents.map(parseDoc);
    } catch (error) {
      console.error('❌ Fehler beim Abrufen der Changelog-Einträge:', error);
      return [];
    }
  },

  /**
   * Löscht einen Eintrag (nur für Julian)
   */
  async delete(entryId: string): Promise<void> {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, entryId);
    } catch (error) {
      console.error('❌ Fehler beim Löschen des Changelog-Eintrags:', error);
      throw error;
    }
  },

  /**
   * Fügt einen AUTO-Eintrag aus Git-Commit ein
   * (wird von CI/CD oder manuell nach Commit aufgerufen)
   */
  async addFromCommit(
    commitHash: string,
    commitMessage: string,
    userId: string
  ): Promise<AdminChangelogDbEntry> {
    const lines = commitMessage.split('\n');
    const title = lines[0].substring(0, 100);
    const description = lines.join('\n');

    return this.create(
      {
        type: 'auto',
        title,
        description,
        commitHash,
        category: inferCategory(title),
      },
      userId
    );
  },
};

function parseDoc(doc: Models.Document): AdminChangelogDbEntry {
  return {
    $id: doc.$id,
    timestamp: (doc as any).timestamp || doc.$createdAt,
    type: (doc as any).type || 'manual',
    title: (doc as any).title || '',
    description: (doc as any).description || '',
    category: (doc as any).category,
    commitHash: (doc as any).commitHash,
    createdBy: (doc as any).createdBy,
    $createdAt: doc.$createdAt,
    $updatedAt: doc.$updatedAt,
  };
}

function inferCategory(
  title: string
): AdminChangelogEntry['category'] {
  const lower = title.toLowerCase();
  if (lower.startsWith('fix')) return 'bugfix';
  if (lower.startsWith('feat')) return 'feature';
  if (lower.includes('infra') || lower.includes('docker') || lower.includes('deploy'))
    return 'infra';
  if (lower.includes('config') || lower.includes('env')) return 'config';
  return 'other';
}
