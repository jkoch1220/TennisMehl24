import { ID, Query, Models } from 'appwrite';
import { databases, DATABASE_ID, AUDIT_LOG_COLLECTION_ID } from '../config/appwrite';
import { User } from './authService';

/**
 * Zentrales Audit-Log (D3): wer hat was wann geändert.
 *
 * Zusätzlich liefert dieser Service den "Bearbeiter-Stempel" für die
 * bearbeitetVon-Felder an den High-Value-Collections.
 *
 * Die Collection ist serverseitig create-only für eingeloggte User —
 * Einträge können aus dem Client heraus weder geändert noch gelöscht werden.
 * Lesen darf nur das Admin-Label (Audit-Log-Tool, D13).
 *
 * log() ist bewusst fire-and-forget: Ein Audit-Ausfall darf nie einen
 * Geschäftsvorgang blockieren (Fehler landen als Warnung in der Console).
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'password_change'
  | 'permission_change'
  | 'role_change'
  | 'user_create';

export interface AuditEntry {
  action: AuditAction;
  entityType: string; // 'angebot' | 'projekt' | 'debitor' | 'stammdaten' | 'role' | 'user' | 'chat' | ...
  entityId?: string;
  /** Menschenlesbar, z.B. "Angebot AB-2026-123 bearbeitet" */
  summary: string;
  /** Nur kritische Felder: { feld: { alt, neu } } */
  changes?: Record<string, { alt: unknown; neu: unknown }>;
}

/** Gespeicherter Audit-Eintrag (Lesen nur mit Admin-Label möglich, D13). */
export interface AuditLogEintrag {
  $id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary: string;
  changes: Record<string, { alt: unknown; neu: unknown }> | null;
}

export interface AuditLogFilter {
  userId?: string;
  action?: string;
  entityType?: string;
  /** ISO-Datum (inklusive), z.B. '2026-07-01' */
  von?: string;
  /** ISO-Datum (inklusive) */
  bis?: string;
  /** Volltext in summary (Appwrite-Fulltext-Index erforderlich) */
  suche?: string;
}

const PAGE_SIZE = 50;

const parseAuditDocument = (doc: Models.Document): AuditLogEintrag => {
  const raw = doc as Models.Document & Record<string, unknown>;
  let changes: AuditLogEintrag['changes'] = null;
  if (typeof raw.changes === 'string' && raw.changes.length > 0) {
    try {
      changes = JSON.parse(raw.changes);
    } catch {
      changes = null;
    }
  }
  return {
    $id: doc.$id,
    timestamp: (raw.timestamp as string) ?? doc.$createdAt,
    userId: (raw.userId as string) ?? '',
    userName: (raw.userName as string) ?? '',
    action: (raw.action as AuditAction) ?? 'update',
    entityType: (raw.entityType as string) ?? '',
    entityId: (raw.entityId as string) ?? '',
    summary: (raw.summary as string) ?? '',
    changes,
  };
};

/**
 * Lädt Audit-Einträge (neueste zuerst) mit Filtern und Cursor-Pagination.
 * Lesen ist serverseitig auf das Admin-Label beschränkt.
 */
export const loadAuditEintraege = async (
  filter: AuditLogFilter = {},
  cursor?: string
): Promise<{ eintraege: AuditLogEintrag[]; hatMehr: boolean }> => {
  const queries = [Query.orderDesc('timestamp'), Query.limit(PAGE_SIZE + 1)];
  if (filter.userId) queries.push(Query.equal('userId', filter.userId));
  if (filter.action) queries.push(Query.equal('action', filter.action));
  if (filter.entityType) queries.push(Query.equal('entityType', filter.entityType));
  if (filter.von) queries.push(Query.greaterThanEqual('timestamp', filter.von));
  if (filter.bis) queries.push(Query.lessThanEqual('timestamp', `${filter.bis}T23:59:59.999Z`));
  if (filter.suche) queries.push(Query.search('summary', filter.suche));
  if (cursor) queries.push(Query.cursorAfter(cursor));

  const response = await databases.listDocuments(DATABASE_ID, AUDIT_LOG_COLLECTION_ID, queries);
  const eintraege = response.documents.slice(0, PAGE_SIZE).map(parseAuditDocument);
  return { eintraege, hatMehr: response.documents.length > PAGE_SIZE };
};

// Vom AuthContext registrierter aktueller User — erlaubt Audit-Aufrufe aus
// Fachservices, ohne den User durch jede Call-Site zu schleifen.
let aktuellerUser: User | null = null;

export const setAuditUser = (user: User | null): void => {
  aktuellerUser = user;
};

/** Felder für "zuletzt bearbeitet von" an High-Value-Collections. */
export const bearbeiterStempel = (): {
  bearbeitetVon: string;
  bearbeitetVonName: string;
  bearbeitetAm: string;
} => ({
  bearbeitetVon: aktuellerUser?.$id ?? '',
  bearbeitetVonName: aktuellerUser?.name ?? '',
  bearbeitetAm: new Date().toISOString(),
});

/** Wie bearbeiterStempel, zusätzlich mit erstelltVon (für Neuanlagen; wie roles: User-ID). */
export const erstellerStempel = (): Record<string, string> => ({
  erstelltVon: aktuellerUser?.$id ?? '',
  ...bearbeiterStempel(),
});

export const auditService = {
  /** Audit-Eintrag mit dem vom AuthContext registrierten User (Fachservices). */
  logAktion(entry: AuditEntry): void {
    auditService.log(aktuellerUser, entry);
  },

  log(user: User | null, entry: AuditEntry): void {
    if (!user) return;
    databases
      .createDocument(DATABASE_ID, AUDIT_LOG_COLLECTION_ID, ID.unique(), {
        timestamp: new Date().toISOString(),
        userId: user.$id,
        userName: user.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? '',
        summary: entry.summary,
        changes: entry.changes ? JSON.stringify(entry.changes) : '',
      })
      .catch((error) => {
        console.warn('⚠️ Audit-Log-Eintrag fehlgeschlagen:', (error as Error).message, entry.summary);
      });
  },
};
