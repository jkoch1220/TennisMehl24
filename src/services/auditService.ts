import { ID } from 'appwrite';
import { databases, DATABASE_ID, AUDIT_LOG_COLLECTION_ID } from '../config/appwrite';
import { User } from './authService';

/**
 * Zentrales Audit-Log (D3): wer hat was wann geändert.
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

export const auditService = {
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
