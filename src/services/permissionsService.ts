import { Query, ID } from 'appwrite';
import { databases, DATABASE_ID, USER_PERMISSIONS_COLLECTION_ID } from '../config/appwrite';
import { User, isAdmin } from './authService';
import { ToolConfig } from '../constants/tools';

// Tool-Berechtigungen für User
export interface UserPermissions {
  $id?: string;
  userId: string;
  allowedTools: string[] | null; // null = alle erlaubt, leeres Array = keine Tools
  updatedBy?: string;
  updatedAt?: string;
}

// Cache für geladene Permissions (pro Session)
let permissionsCache: Record<string, UserPermissions> = {};

// Flag ob Permissions bereits geladen wurden
let cacheLoaded = false;

/**
 * Alle User-Permissions aus Appwrite laden
 */
export const loadAllPermissions = async (): Promise<Record<string, UserPermissions>> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.limit(100)]
    );

    const permissions: Record<string, UserPermissions> = {};
    for (const doc of response.documents) {
      permissions[doc.userId] = {
        $id: doc.$id,
        userId: doc.userId,
        allowedTools: doc.allowedTools || null,
        updatedBy: doc.updatedBy,
        updatedAt: doc.updatedAt,
      };
    }

    // Cache aktualisieren
    permissionsCache = permissions;
    cacheLoaded = true;
    console.log('✅ Permissions aus Appwrite geladen:', Object.keys(permissions).length, 'Einträge');
    return permissions;
  } catch (error: any) {
    console.error('❌ Fehler beim Laden der Permissions:', error.message);
    // Bei Fehler leeren Cache zurückgeben
    return {};
  }
};

/**
 * Permissions für einen bestimmten User aus Appwrite laden
 */
export const loadUserPermissions = async (userId: string): Promise<UserPermissions> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      USER_PERMISSIONS_COLLECTION_ID,
      [Query.equal('userId', userId), Query.limit(1)]
    );

    if (response.documents.length > 0) {
      const doc = response.documents[0];
      const permissions: UserPermissions = {
        $id: doc.$id,
        userId: doc.userId,
        allowedTools: doc.allowedTools || null,
        updatedBy: doc.updatedBy,
        updatedAt: doc.updatedAt,
      };
      // Cache aktualisieren
      permissionsCache[userId] = permissions;
      return permissions;
    }

    // Keine Permissions gefunden = alle erlaubt
    return { userId, allowedTools: null };
  } catch (error: any) {
    console.error('❌ Fehler beim Laden der User-Permissions:', error.message);
    return { userId, allowedTools: null };
  }
};

/**
 * Permissions aus Cache holen (synchron)
 * Für schnellen Zugriff nachdem einmal geladen wurde
 */
export const getUserPermissionsFromCache = (userId: string): UserPermissions => {
  return permissionsCache[userId] || { userId, allowedTools: null };
};

/**
 * Cache zurücksetzen
 */
export const clearPermissionsCache = (): void => {
  permissionsCache = {};
  cacheLoaded = false;
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

    // Cache aktualisieren
    permissionsCache[targetUserId] = {
      ...data,
      $id: existing.documents[0]?.$id,
    };

    return true;
  } catch (error: any) {
    console.error('❌ Fehler beim Speichern der Permissions:', error.message);
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
 * Prüfen ob User ein bestimmtes Tool sehen darf (synchron mit Cache)
 */
export const canAccessTool = (user: User | null, toolId: string): boolean => {
  if (!user) return false;

  // Admin darf alles sehen
  if (isAdmin(user)) return true;

  // User-spezifische Berechtigungen aus Cache
  const permissions = getUserPermissionsFromCache(user.$id);

  // null = alle Tools erlaubt (noch keine Einschränkungen gesetzt)
  if (permissions.allowedTools === null) return true;

  // Leeres Array = keine Tools erlaubt
  if (permissions.allowedTools.length === 0) return false;

  // Ansonsten nur die erlaubten Tools
  return permissions.allowedTools.includes(toolId);
};

/**
 * Alle erlaubten Tools für einen User filtern (synchron mit Cache)
 */
export const filterAllowedTools = (user: User | null, allTools: ToolConfig[]): ToolConfig[] => {
  if (!user) return [];

  // Admin sieht alles
  if (isAdmin(user)) return allTools;

  // User-spezifische Berechtigungen aus Cache
  const permissions = getUserPermissionsFromCache(user.$id);

  console.log('🔍 Filter Tools für User:', user.name, 'ID:', user.$id, 'Permissions:', permissions);

  // null = alle Tools erlaubt (noch keine Einschränkungen gesetzt)
  if (permissions.allowedTools === null) {
    console.log('  → Alle Tools erlaubt (keine Einschränkungen in Appwrite)');
    return allTools;
  }

  // Leeres Array = keine Tools erlaubt
  if (permissions.allowedTools.length === 0) {
    console.log('  → Keine Tools erlaubt');
    return [];
  }

  // Nur erlaubte Tools zurückgeben
  const filtered = allTools.filter(tool => permissions.allowedTools!.includes(tool.id));
  console.log('  → Erlaubte Tools:', filtered.map(t => t.name).join(', '));
  return filtered;
};
