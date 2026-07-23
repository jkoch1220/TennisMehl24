import { ID, Query } from 'appwrite';
import { databases, DATABASE_ID, ROLES_COLLECTION_ID } from '../config/appwrite';
import { PermissionMap, Role } from '../types/permissions';
import { parsePermissionMap } from './permissionResolution';
import { User, isAdmin } from './authService';

// Session-Cache (Rollen ändern sich selten; refresh über loadAllRoles)
let rolesCache: Record<string, Role> = {};
let rolesLoaded = false;

const parseRoleDocument = (doc: Record<string, unknown>): Role => ({
  $id: doc.$id as string,
  name: (doc.name as string) ?? '',
  description: (doc.description as string) ?? '',
  isSystem: doc.isSystem === true,
  color: doc.color as string | undefined,
  icon: doc.icon as string | undefined,
  permissions: parsePermissionMap(doc.permissions as string) ?? {},
  erstelltVon: doc.erstelltVon as string | undefined,
  bearbeitetVon: doc.bearbeitetVon as string | undefined,
  bearbeitetVonName: doc.bearbeitetVonName as string | undefined,
  bearbeitetAm: doc.bearbeitetAm as string | undefined,
});

/** Alle Rollen laden (für alle eingeloggten User lesbar) und Cache füllen. */
export const loadAllRoles = async (): Promise<Role[]> => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, ROLES_COLLECTION_ID, [
      Query.limit(100),
      Query.orderAsc('name'),
    ]);
    rolesCache = {};
    for (const doc of response.documents) {
      const role = parseRoleDocument(doc as unknown as Record<string, unknown>);
      rolesCache[role.$id] = role;
    }
    rolesLoaded = true;
    console.log('✅ Rollen geladen:', Object.keys(rolesCache).length);
    return Object.values(rolesCache);
  } catch (error) {
    console.error('❌ Fehler beim Laden der Rollen:', error);
    return Object.values(rolesCache);
  }
};

/** Rollen laden, falls noch nicht geschehen (idempotent pro Session). */
export const ensureRolesLoaded = async (): Promise<void> => {
  if (!rolesLoaded) {
    await loadAllRoles();
  }
};

export const isRolesCacheLoaded = (): boolean => rolesLoaded;

export const getRoleFromCache = (roleId: string): Role | undefined => rolesCache[roleId];

export const getAllRolesFromCache = (): Role[] => Object.values(rolesCache);

export const clearRolesCache = (): void => {
  rolesCache = {};
  rolesLoaded = false;
};

/** Permission-Maps für eine Liste von Rollen-IDs (unbekannte IDs werden übersprungen). */
export const getRolePermissionMaps = (roleIds: string[]): PermissionMap[] =>
  roleIds
    .map((id) => rolesCache[id]?.permissions)
    .filter((p): p is PermissionMap => p !== undefined);

// ---------------------------------------------------------------------------
// CRUD (Schreibzugriffe sind serverseitig auf Label `admin` beschränkt;
// die Client-Prüfung hier ist nur die erste Schicht)
// ---------------------------------------------------------------------------

export interface RoleInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  permissions: PermissionMap;
}

const roleWriteData = (currentUser: User, input: RoleInput) => ({
  name: input.name,
  description: input.description ?? '',
  color: input.color ?? '',
  icon: input.icon ?? '',
  permissions: JSON.stringify(input.permissions),
  bearbeitetVon: currentUser.$id,
  bearbeitetVonName: currentUser.name,
  bearbeitetAm: new Date().toISOString(),
});

export const createRole = async (currentUser: User | null, input: RoleInput): Promise<Role | null> => {
  if (!currentUser || !isAdmin(currentUser)) {
    console.error('❌ Nur Admins dürfen Rollen anlegen');
    return null;
  }
  try {
    const doc = await databases.createDocument(DATABASE_ID, ROLES_COLLECTION_ID, ID.unique(), {
      ...roleWriteData(currentUser, input),
      isSystem: false,
      erstelltVon: currentUser.$id,
    });
    const role = parseRoleDocument(doc as unknown as Record<string, unknown>);
    rolesCache[role.$id] = role;
    return role;
  } catch (error) {
    console.error('❌ Fehler beim Anlegen der Rolle:', error);
    return null;
  }
};

export const updateRole = async (
  currentUser: User | null,
  roleId: string,
  input: RoleInput
): Promise<Role | null> => {
  if (!currentUser || !isAdmin(currentUser)) {
    console.error('❌ Nur Admins dürfen Rollen ändern');
    return null;
  }
  const existing = rolesCache[roleId];
  const data = roleWriteData(currentUser, input);
  if (existing?.isSystem) {
    // System-Rollen: Name ist geschützt (D7/§5.A)
    data.name = existing.name;
  }
  try {
    const doc = await databases.updateDocument(DATABASE_ID, ROLES_COLLECTION_ID, roleId, data);
    const role = parseRoleDocument(doc as unknown as Record<string, unknown>);
    rolesCache[role.$id] = role;
    return role;
  } catch (error) {
    console.error('❌ Fehler beim Ändern der Rolle:', error);
    return null;
  }
};

export const deleteRole = async (currentUser: User | null, roleId: string): Promise<boolean> => {
  if (!currentUser || !isAdmin(currentUser)) {
    console.error('❌ Nur Admins dürfen Rollen löschen');
    return false;
  }
  if (rolesCache[roleId]?.isSystem) {
    console.error('❌ System-Rollen können nicht gelöscht werden');
    return false;
  }
  try {
    await databases.deleteDocument(DATABASE_ID, ROLES_COLLECTION_ID, roleId);
    delete rolesCache[roleId];
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Löschen der Rolle:', error);
    return false;
  }
};
