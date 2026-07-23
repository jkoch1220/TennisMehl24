/**
 * Typen für das rollenbasierte Berechtigungssystem.
 *
 * Permission-Shape (gespeichert als JSON-String in roles.permissions,
 * user_permissions.allowOverride und user_permissions.denyOverride):
 *   { "<toolId>": { "enabled": true, "actions": ["view", ...], "hiddenFields": ["db1", ...] } }
 *
 * toolId = id aus ALL_TOOLS (src/constants/tools.ts) — kein hartkodiertes Enum.
 */

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface ToolPermission {
  enabled: boolean;
  actions: PermissionAction[];
  /** Nur für sensible Daten (D9). undefined/leer = nichts versteckt. */
  hiddenFields?: string[];
}

/** toolId → Berechtigung */
export type PermissionMap = Record<string, ToolPermission>;

export interface Role {
  $id: string;
  name: string;
  description?: string;
  /** true = nicht löschbar, Name geschützt (z.B. Admin) */
  isSystem: boolean;
  color?: string;
  icon?: string;
  permissions: PermissionMap;
  erstelltVon?: string;
  bearbeitetVon?: string;
  bearbeitetVonName?: string;
  bearbeitetAm?: string;
}

/** Eingabe für die reine Auflösungsfunktion (keine Appwrite-Abhängigkeit). */
export interface ResolutionInput {
  /** permissions-Maps aller dem User zugewiesenen Rollen */
  rolePermissions: PermissionMap[];
  /** Zusätzlich erlaubte Rechte (User-Ausnahme) */
  allowOverride?: PermissionMap | null;
  /** Explizit entzogene Rechte (User-Ausnahme, gewinnt immer) */
  denyOverride?: PermissionMap | null;
  /**
   * Legacy-Feld user_permissions.allowedTools — greift NUR, wenn keine Rollen
   * zugewiesen sind: null/undefined = alle Tools (heutiges Verhalten),
   * [] = keine, [ids] = genau diese Tools mit allen Aktionen.
   */
  legacyAllowedTools?: string[] | null;
  /** Kanonische Tool-Liste zum Materialisieren von "alle Tools" */
  allToolIds: string[];
}
