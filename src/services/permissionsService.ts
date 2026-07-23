import { Query, ID } from 'appwrite';
import { databases, DATABASE_ID, USER_PERMISSIONS_COLLECTION_ID } from '../config/appwrite';
import { User, isAdmin } from './authService';
import { ToolConfig, ALL_TOOLS } from '../constants/tools';
import { PermissionAction, PermissionMap } from '../types/permissions';
import { resolveEffectivePermissions, parsePermissionMap } from './permissionResolution';
import { ensureRolesLoaded, getRolePermissionMaps, clearRolesCache } from './rolesService';
import { auditService } from './auditService';

// Tool-Berechtigungen für User
export interface UserPermissions {
  $id?: string;
  userId: string;
  allowedTools: string[] | null; // Legacy: null = alle erlaubt, leeres Array = keine Tools
  roleIds: string[];
  allowOverride: PermissionMap | null;
  denyOverride: PermissionMap | null;
  updatedBy?: string;
  updatedAt?: string;
}

// Cache für geladene Permissions (pro Session)
let permissionsCache: Record<string, UserPermissions> = {};

// Flag ob Permissions bereits geladen wurden
let cacheLoaded = false;

// Cache der aufgelösten effektiven Rechte pro User (invalidiert bei jedem Neuladen)
let effectiveCache: Record<string, PermissionMap> = {};

const DEFAULT_PERMISSIONS = (userId: string): UserPermissions => ({
  userId,
  allowedTools: null,
  roleIds: [],
  allowOverride: null,
  denyOverride: null,
});

const parsePermissionsDocument = (doc: Record<string, unknown>): UserPermissions => ({
  $id: doc.$id as string,
  userId: doc.userId as string,
  allowedTools: (doc.allowedTools as string[] | null) || null,
  roleIds: Array.isArray(doc.roleIds) ? (doc.roleIds as string[]) : [],
  allowOverride: parsePermissionMap(doc.allowOverride as string | null),
  denyOverride: parsePermissionMap(doc.denyOverride as string | null),
  updatedBy: doc.updatedBy as string | undefined,
  updatedAt: doc.updatedAt as string | undefined,
});

/**
 * Alle User-Permissions aus Appwrite laden (inkl. Rollen)
 */
export const loadAllPermissions = async (): Promise<Record<string, UserPermissions>> => {
  try {
    await ensureRolesLoaded();
    const response = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.limit(100)]
    );

    const permissions: Record<string, UserPermissions> = {};
    for (const doc of response.documents) {
      const parsed = parsePermissionsDocument(doc as unknown as Record<string, unknown>);
      permissions[parsed.userId] = parsed;
    }

    // Cache aktualisieren
    permissionsCache = permissions;
    effectiveCache = {};
    cacheLoaded = true;
    console.log('✅ Permissions aus Appwrite geladen:', Object.keys(permissions).length, 'Einträge');
    return permissions;
  } catch (error) {
    console.error('❌ Fehler beim Laden der Permissions:', (error as Error).message);
    // Bei Fehler leeren Cache zurückgeben
    return {};
  }
};

/**
 * Permissions für einen bestimmten User aus Appwrite laden (inkl. Rollen)
 */
export const loadUserPermissions = async (userId: string): Promise<UserPermissions> => {
  try {
    await ensureRolesLoaded();
    const response = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.equal('userId', userId), Query.limit(1)]
    );

    if (response.documents.length > 0) {
      const permissions = parsePermissionsDocument(
        response.documents[0] as unknown as Record<string, unknown>
      );
      // Cache aktualisieren
      permissionsCache[userId] = permissions;
      delete effectiveCache[userId];
      return permissions;
    }

    // Keine Permissions gefunden = Legacy-Standard (alle erlaubt)
    return DEFAULT_PERMISSIONS(userId);
  } catch (error) {
    console.error('❌ Fehler beim Laden der User-Permissions:', (error as Error).message);
    return DEFAULT_PERMISSIONS(userId);
  }
};

/**
 * Permissions aus Cache holen (synchron)
 * Für schnellen Zugriff nachdem einmal geladen wurde
 */
export const getUserPermissionsFromCache = (userId: string): UserPermissions => {
  return permissionsCache[userId] || DEFAULT_PERMISSIONS(userId);
};

/**
 * Cache zurücksetzen
 */
export const clearPermissionsCache = (): void => {
  permissionsCache = {};
  effectiveCache = {};
  cacheLoaded = false;
  clearRolesCache();
};

/**
 * Effektive Rechte eines Users (synchron aus Cache, memoisiert).
 * Formel: (Vereinigung Rollen) ∪ allowOverride − denyOverride;
 * ohne Rollen greift das Legacy-Feld allowedTools.
 */
export const getEffectivePermissions = (userId: string): PermissionMap => {
  if (effectiveCache[userId]) return effectiveCache[userId];

  const perms = getUserPermissionsFromCache(userId);
  // Fail-closed: Hat der User Rollen, konnten sie aber nicht geladen/aufgelöst
  // werden, darf er NICHT in den Legacy-Fallback "alles erlaubt" rutschen —
  // eine leere Rollen-Map erzwingt den Rollen-Pfad (→ nur Overrides gelten).
  const roleMaps = getRolePermissionMaps(perms.roleIds);
  const rolePermissions = perms.roleIds.length > 0 && roleMaps.length === 0 ? [{}] : roleMaps;
  const effective = resolveEffectivePermissions({
    rolePermissions,
    allowOverride: perms.allowOverride,
    denyOverride: perms.denyOverride,
    legacyAllowedTools: perms.allowedTools,
    allToolIds: ALL_TOOLS.map((t) => t.id),
  });
  effectiveCache[userId] = effective;
  return effective;
};

/**
 * Zentrale Rechte-Prüfung: darf der User die Aktion in diesem Tool ausführen?
 * Admin (Label) umgeht alle Prüfungen (D8).
 */
export const can = (user: User | null, toolId: string, action: PermissionAction): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const entry = getEffectivePermissions(user.$id)[toolId];
  return !!entry && entry.enabled && entry.actions.includes(action);
};

/**
 * Ist ein sensibles Feld für den User in diesem Tool verborgen?
 * Sicherheits-Default: kein Zugriff aufs Tool → Feld verborgen.
 */
export const isFieldHidden = (user: User | null, toolId: string, fieldKey: string): boolean => {
  if (!user) return true;
  if (isAdmin(user)) return false;

  const entry = getEffectivePermissions(user.$id)[toolId];
  if (!entry || !entry.enabled) return true;
  return entry.hiddenFields?.includes(fieldKey) ?? false;
};

/**
 * Prüfen ob Cache geladen ist
 */
export const isPermissionsCacheLoaded = (): boolean => cacheLoaded;

/**
 * Berechtigungen für einen User setzen (nur Admin darf das)
 */
export const setUserPermissions = async (
  currentUser: User | null,
  targetUserId: string,
  allowedTools: string[] | null
): Promise<boolean> => {
  if (!currentUser || !isAdmin(currentUser)) {
    console.error('❌ Nur Admins dürfen User-Berechtigungen ändern');
    return false;
  }

  try {
    // Prüfen ob bereits ein Dokument existiert
    const existing = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.equal('userId', targetUserId), Query.limit(1)]
    );

    const data = {
      userId: targetUserId,
      allowedTools: allowedTools,
      updatedBy: currentUser.$id,
      updatedAt: new Date().toISOString(),
    };

    if (existing.documents.length > 0) {
      // Update existierendes Dokument
      await databases.updateDocument(
        DATABASE_ID,
        USER_PERMISSIONS_COLLECTION_ID,
        existing.documents[0].$id,
        data
      );
      console.log('✅ Permissions aktualisiert für User:', targetUserId);
    } else {
      // Neues Dokument erstellen
      await databases.createDocument(
        DATABASE_ID,
        USER_PERMISSIONS_COLLECTION_ID,
        ID.unique(),
        data
      );
      console.log('✅ Permissions erstellt für User:', targetUserId);
    }

    // Cache aktualisieren (neue Rollen-Felder aus dem bisherigen Cache erhalten)
    permissionsCache[targetUserId] = {
      ...getUserPermissionsFromCache(targetUserId),
      ...data,
      $id: existing.documents[0]?.$id,
    };
    delete effectiveCache[targetUserId];

    return true;
  } catch (error) {
    console.error('❌ Fehler beim Speichern der Permissions:', (error as Error).message);
    return false;
  }
};

/**
 * Rollen-Zuweisung + Overrides für einen User speichern (nur Admin).
 * Das Legacy-Feld allowedTools bleibt unangetastet (D2).
 */
export const setUserAccess = async (
  currentUser: User | null,
  targetUserId: string,
  targetUserName: string,
  access: {
    roleIds: string[];
    allowOverride: PermissionMap | null;
    denyOverride: PermissionMap | null;
  }
): Promise<boolean> => {
  if (!currentUser || !isAdmin(currentUser)) {
    console.error('❌ Nur Admins dürfen Rollen-Zuweisungen ändern');
    return false;
  }

  try {
    const existing = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.equal('userId', targetUserId), Query.limit(1)]
    );

    const data = {
      userId: targetUserId,
      roleIds: access.roleIds,
      allowOverride:
        access.allowOverride && Object.keys(access.allowOverride).length > 0
          ? JSON.stringify(access.allowOverride)
          : null,
      denyOverride:
        access.denyOverride && Object.keys(access.denyOverride).length > 0
          ? JSON.stringify(access.denyOverride)
          : null,
      updatedBy: currentUser.$id,
      updatedAt: new Date().toISOString(),
    };

    let docId: string;
    if (existing.documents.length > 0) {
      docId = existing.documents[0].$id;
      await databases.updateDocument(DATABASE_ID, USER_PERMISSIONS_COLLECTION_ID, docId, data);
    } else {
      const created = await databases.createDocument(
        DATABASE_ID,
        USER_PERMISSIONS_COLLECTION_ID,
        ID.unique(),
        data
      );
      docId = created.$id;
    }

    permissionsCache[targetUserId] = {
      ...getUserPermissionsFromCache(targetUserId),
      $id: docId,
      userId: targetUserId,
      roleIds: access.roleIds,
      allowOverride: access.allowOverride,
      denyOverride: access.denyOverride,
      updatedBy: currentUser.$id,
      updatedAt: data.updatedAt,
    };
    delete effectiveCache[targetUserId];

    auditService.log(currentUser, {
      action: 'permission_change',
      entityType: 'user',
      entityId: targetUserId,
      summary: `Rechte von ${targetUserName} geändert (${access.roleIds.length} Rolle(n)${
        data.allowOverride ? ', mit Zusatz-Rechten' : ''
      }${data.denyOverride ? ', mit entzogenen Rechten' : ''})`,
    });

    console.log('✅ Rollen-Zuweisung gespeichert für User:', targetUserId);
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Speichern der Rollen-Zuweisung:', (error as Error).message);
    return false;
  }
};

/**
 * Berechtigungen für einen User abrufen (async)
 */
export const getUserPermissions = async (userId: string): Promise<UserPermissions> => {
  // Wenn Cache geladen, aus Cache nehmen
  if (cacheLoaded && permissionsCache[userId]) {
    return permissionsCache[userId];
  }
  // Ansonsten aus Appwrite laden
  return loadUserPermissions(userId);
};

/**
 * Prüfen ob User ein bestimmtes Tool sehen darf (synchron mit Cache).
 * Intern = can(user, toolId, 'view').
 */
export const canAccessTool = (user: User | null, toolId: string): boolean =>
  can(user, toolId, 'view');

/**
 * Alle erlaubten Tools für einen User filtern (synchron mit Cache)
 */
export const filterAllowedTools = (user: User | null, allTools: ToolConfig[]): ToolConfig[] => {
  if (!user) return [];

  // Admin sieht alles
  if (isAdmin(user)) return allTools;

  return allTools.filter((tool) => can(user, tool.id, 'view'));
};
