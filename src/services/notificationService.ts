/**
 * Notification Service (Frontend)
 *
 * Zentraler API-Layer für persistente Benachrichtigungen. Quelle der Wahrheit
 * ist die Appwrite-Collection `notifications`. Das Frontend liest beim Laden alle
 * offenen Benachrichtigungen und abonniert zusätzlich Realtime.
 *
 * Doppelschutz: Pro Quell-Datensatz (`refTyp` + `refId`) darf nur EINE
 * Benachrichtigung entstehen. Zusätzlich zur Unique-Index-Absicherung in der
 * Datenbank prüft `erstelleNotification` vor dem Anlegen.
 */

import { Query, ID } from 'appwrite';
import { databases, DATABASE_ID, NOTIFICATIONS_COLLECTION_ID } from '../config/appwrite';
import type { Benachrichtigung, NeueNotification } from '../types/notification';

/** Maximale Anzahl offener Benachrichtigungen, die geladen werden. */
export const MAX_OFFENE_NOTIFICATIONS = 100;

/**
 * Wandelt ein rohes Appwrite-Dokument in eine typisierte Benachrichtigung um.
 * Stellt sicher, dass die Array-Felder immer Arrays sind.
 */
function mapDocument(doc: Record<string, unknown>): Benachrichtigung {
  return {
    $id: doc.$id as string,
    typ: doc.typ as Benachrichtigung['typ'],
    titel: (doc.titel as string) ?? '',
    nachricht: (doc.nachricht as string) ?? '',
    refTyp: (doc.refTyp as string) ?? '',
    refId: (doc.refId as string) ?? '',
    link: (doc.link as string) ?? '/',
    prioritaet: doc.prioritaet as Benachrichtigung['prioritaet'],
    gelesenVon: Array.isArray(doc.gelesenVon) ? (doc.gelesenVon as string[]) : [],
    erledigtVon: Array.isArray(doc.erledigtVon) ? (doc.erledigtVon as string[]) : [],
    erstelltAm: (doc.erstelltAm as string) ?? (doc.$createdAt as string) ?? '',
    $createdAt: doc.$createdAt as string | undefined,
    $updatedAt: doc.$updatedAt as string | undefined,
  };
}

class NotificationService {
  /**
   * Prüft, ob für einen Quell-Datensatz bereits eine Benachrichtigung existiert.
   * Basis des Doppelschutzes.
   */
  async existiertNotification(refTyp: string, refId: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, [
        Query.equal('refTyp', refTyp),
        Query.equal('refId', refId),
        Query.limit(1),
      ]);
      return response.total > 0;
    } catch (error) {
      console.error('Fehler beim Prüfen auf vorhandene Notification:', error);
      // Im Zweifel als nicht vorhanden behandeln; Unique-Index verhindert Duplikate hart.
      return false;
    }
  }

  /**
   * Zentrale Hilfsfunktion zum Anlegen einer Benachrichtigung.
   * Idempotent über `refTyp` + `refId` (Doppelschutz). Gibt die angelegte
   * Benachrichtigung zurück – oder `null`, wenn bereits eine existiert.
   *
   * So können später weitere Quellen (Mahnungen, Zahlungseingänge, …) mit
   * minimalem Aufwand Benachrichtigungen erzeugen.
   */
  async erstelleNotification(input: NeueNotification): Promise<Benachrichtigung | null> {
    // Vor-Prüfung (Doppelschutz)
    if (await this.existiertNotification(input.refTyp, input.refId)) {
      return null;
    }

    try {
      const doc = await databases.createDocument(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, ID.unique(), {
        typ: input.typ,
        titel: input.titel.substring(0, 500),
        nachricht: input.nachricht.substring(0, 2000),
        refTyp: input.refTyp,
        refId: input.refId,
        link: input.link,
        prioritaet: input.prioritaet ?? 'normal',
        gelesenVon: [],
        erledigtVon: [],
        erstelltAm: new Date().toISOString(),
      });
      return mapDocument(doc as unknown as Record<string, unknown>);
    } catch (error: unknown) {
      // 409 = Unique-Index-Verletzung -> Notification existiert bereits (Race-Condition)
      const code = (error as { code?: number })?.code;
      if (code === 409) {
        return null;
      }
      console.error('Fehler beim Anlegen der Notification:', error);
      throw error;
    }
  }

  /**
   * Lädt die offenen Benachrichtigungen für einen User (neueste oben).
   * Offen = der User hat sie noch NICHT abgehakt (`erledigtVon` enthält ihn nicht).
   *
   * Die Liste wird begrenzt geladen (Performance); die Filterung auf „offen"
   * erfolgt clientseitig, da Appwrite kein „Array enthält NICHT"-Query bietet.
   */
  async ladeOffeneNotifications(userId: string, limit = MAX_OFFENE_NOTIFICATIONS): Promise<Benachrichtigung[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, [
        Query.orderDesc('erstelltAm'),
        Query.limit(limit),
      ]);

      return response.documents
        .map((doc) => mapDocument(doc as unknown as Record<string, unknown>))
        .filter((n) => !n.erledigtVon.includes(userId));
    } catch (error) {
      console.error('Fehler beim Laden der Benachrichtigungen:', error);
      return [];
    }
  }

  /**
   * Setzt das `gelesenVon`-Array (komplette Liste – Berechnung erfolgt im Context).
   */
  async setGelesen(id: string, gelesenVon: string[]): Promise<void> {
    await databases.updateDocument(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, id, { gelesenVon });
  }

  /**
   * Setzt das `erledigtVon`-Array (komplette Liste – Berechnung erfolgt im Context).
   */
  async setErledigt(id: string, erledigtVon: string[]): Promise<void> {
    await databases.updateDocument(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, id, { erledigtVon });
  }
}

export const notificationService = new NotificationService();
export { mapDocument };
