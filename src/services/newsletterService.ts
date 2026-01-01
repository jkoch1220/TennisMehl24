import { databases, DATABASE_ID, NEWSLETTER_COLLECTION_ID } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import {
  NewsletterSubscriber,
  NewsletterSubscriberInput,
  NewsletterBulkImportResult,
  NewsletterStats,
  NewsletterSource
} from '../types/newsletter';

// Generiere einen sicheren Random-Token für Abmeldelinks
const generateUnsubscribeToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// REST API für öffentliche Operationen (ohne Auth)
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = import.meta.env.VITE_APPWRITE_API_KEY;

export const newsletterService = {
  // ========== CRUD OPERATIONS ==========

  // Alle Subscribers laden
  async loadAllSubscribers(): Promise<NewsletterSubscriber[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        NEWSLETTER_COLLECTION_ID,
        [Query.limit(5000), Query.orderDesc('subscribedAt')]
      );

      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Newsletter-Subscribers:', error);
      return [];
    }
  },

  // Aktive Subscribers laden
  async loadActiveSubscribers(): Promise<NewsletterSubscriber[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        NEWSLETTER_COLLECTION_ID,
        [
          Query.equal('status', 'active'),
          Query.limit(5000),
          Query.orderDesc('subscribedAt')
        ]
      );

      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der aktiven Subscribers:', error);
      return [];
    }
  },

  // Einzelnen Subscriber laden
  async loadSubscriber(id: string): Promise<NewsletterSubscriber | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        NEWSLETTER_COLLECTION_ID,
        id
      );
      return this.parseDocument(doc);
    } catch (error) {
      console.error('Fehler beim Laden des Subscribers:', error);
      return null;
    }
  },

  // Subscriber per Email finden
  async findByEmail(email: string): Promise<NewsletterSubscriber | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        NEWSLETTER_COLLECTION_ID,
        [Query.equal('email', email.toLowerCase().trim())]
      );

      if (response.documents.length > 0) {
        return this.parseDocument(response.documents[0]);
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Suchen per Email:', error);
      return null;
    }
  },

  // Subscriber per Token finden (für Abmeldelinks - ÖFFENTLICH)
  async findByToken(token: string): Promise<NewsletterSubscriber | null> {
    if (!apiKey) {
      console.error('API Key nicht verfügbar für Token-Suche');
      return null;
    }

    try {
      const response = await fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${NEWSLETTER_COLLECTION_ID}/documents?queries[]=${encodeURIComponent(JSON.stringify(Query.equal('unsubscribeToken', token)))}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey,
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.documents && data.documents.length > 0) {
        return this.parseDocument(data.documents[0]);
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Suchen per Token:', error);
      return null;
    }
  },

  // Neuen Subscriber erstellen
  async createSubscriber(input: NewsletterSubscriberInput): Promise<NewsletterSubscriber> {
    const jetzt = new Date().toISOString();
    const id = ID.unique();
    const email = input.email.toLowerCase().trim();

    // Prüfen ob Email bereits existiert
    const existing = await this.findByEmail(email);
    if (existing) {
      // Falls abgemeldet, reaktivieren
      if (existing.status === 'unsubscribed') {
        return await this.resubscribe(existing.id);
      }
      throw new Error('Email bereits registriert');
    }

    const subscriber: Omit<NewsletterSubscriber, 'id'> = {
      email,
      name: input.name,
      status: 'active',
      unsubscribeToken: generateUnsubscribeToken(),
      source: input.source || 'manual',
      tags: input.tags,
      notes: input.notes,
      subscribedAt: jetzt,
      emailsSentCount: 0,
    };

    const doc = await databases.createDocument(
      DATABASE_ID,
      NEWSLETTER_COLLECTION_ID,
      id,
      subscriber
    );

    return this.parseDocument(doc);
  },

  // Subscriber aktualisieren
  async updateSubscriber(id: string, updates: Partial<NewsletterSubscriberInput>): Promise<NewsletterSubscriber> {
    const updateData: Record<string, unknown> = {};

    if (updates.email) updateData.email = updates.email.toLowerCase().trim();
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.notes !== undefined) updateData.notes = updates.notes;

    const doc = await databases.updateDocument(
      DATABASE_ID,
      NEWSLETTER_COLLECTION_ID,
      id,
      updateData
    );

    return this.parseDocument(doc);
  },

  // Subscriber löschen
  async deleteSubscriber(id: string): Promise<void> {
    await databases.deleteDocument(
      DATABASE_ID,
      NEWSLETTER_COLLECTION_ID,
      id
    );
  },

  // ========== ABMELDE-FUNKTIONEN ==========

  // Abmelden per Token (ÖFFENTLICH - ohne Login)
  async unsubscribeByToken(token: string): Promise<{ success: boolean; email?: string; error?: string }> {
    if (!apiKey) {
      return { success: false, error: 'Konfigurationsfehler' };
    }

    try {
      // Subscriber finden
      const subscriber = await this.findByToken(token);
      if (!subscriber) {
        return { success: false, error: 'Ungültiger Abmeldelink' };
      }

      if (subscriber.status === 'unsubscribed') {
        return { success: true, email: subscriber.email }; // Bereits abgemeldet
      }

      // Status auf "unsubscribed" setzen via API Key
      const response = await fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${NEWSLETTER_COLLECTION_ID}/documents/${subscriber.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey,
          },
          body: JSON.stringify({
            status: 'unsubscribed',
            unsubscribedAt: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { success: true, email: subscriber.email };
    } catch (error) {
      console.error('Fehler beim Abmelden:', error);
      return { success: false, error: 'Technischer Fehler' };
    }
  },

  // Reaktivieren (wieder anmelden)
  async resubscribe(id: string): Promise<NewsletterSubscriber> {
    const doc = await databases.updateDocument(
      DATABASE_ID,
      NEWSLETTER_COLLECTION_ID,
      id,
      {
        status: 'active',
        unsubscribedAt: null,
        subscribedAt: new Date().toISOString(), // Neues Datum
      }
    );

    return this.parseDocument(doc);
  },

  // ========== BULK IMPORT ==========

  // Emails aus Liste importieren
  async bulkImport(
    emails: string[],
    source: NewsletterSource = 'excel-import',
    tags?: string
  ): Promise<NewsletterBulkImportResult> {
    const result: NewsletterBulkImportResult = {
      imported: 0,
      duplicates: 0,
      invalid: 0,
      errors: [],
    };

    // Email-Regex für Validierung
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    for (const email of emails) {
      const cleanEmail = email.toLowerCase().trim();

      // Validierung
      if (!emailRegex.test(cleanEmail)) {
        result.invalid++;
        continue;
      }

      try {
        // Prüfen ob bereits vorhanden
        const existing = await this.findByEmail(cleanEmail);
        if (existing) {
          result.duplicates++;
          continue;
        }

        // Neuen Subscriber erstellen
        await this.createSubscriber({
          email: cleanEmail,
          source,
          tags,
        });
        result.imported++;

        // Kleine Pause um Rate-Limiting zu vermeiden
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        result.errors.push(`${cleanEmail}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      }
    }

    return result;
  },

  // ========== STATISTIKEN ==========

  async getStats(): Promise<NewsletterStats> {
    const all = await this.loadAllSubscribers();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const active = all.filter(s => s.status === 'active');
    const unsubscribed = all.filter(s => s.status === 'unsubscribed');
    const recentUnsubscribes = unsubscribed.filter(s =>
      s.unsubscribedAt && new Date(s.unsubscribedAt) > thirtyDaysAgo
    );

    return {
      totalSubscribers: all.length,
      activeSubscribers: active.length,
      unsubscribedSubscribers: unsubscribed.length,
      recentUnsubscribes: recentUnsubscribes.length,
    };
  },

  // ========== HELPER ==========

  // Abmeldelink generieren
  generateUnsubscribeLink(token: string): string {
    // Basis-URL aus der aktuellen Location oder aus Environment
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://tennismehl24.de';
    return `${baseUrl}/abmelden/${token}`;
  },

  // Dokument parsen
  parseDocument(doc: Record<string, unknown>): NewsletterSubscriber {
    return {
      id: doc.$id as string,
      email: doc.email as string,
      name: doc.name as string | undefined,
      status: doc.status as 'active' | 'unsubscribed',
      unsubscribeToken: doc.unsubscribeToken as string,
      source: doc.source as NewsletterSource | undefined,
      tags: doc.tags as string | undefined,
      notes: doc.notes as string | undefined,
      subscribedAt: doc.subscribedAt as string,
      unsubscribedAt: doc.unsubscribedAt as string | undefined,
      lastEmailSentAt: doc.lastEmailSentAt as string | undefined,
      emailsSentCount: (doc.emailsSentCount as number) || 0,
    };
  },
};
