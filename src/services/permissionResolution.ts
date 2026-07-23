/**
 * Reine, testbare Auflösung der effektiven Berechtigungen (das Herzstück).
 *
 *   effektiveRechte = ( Vereinigung aller Rollen-Permissions ) ∪ allowOverride − denyOverride
 *
 * Admin-Bypass passiert bewusst NICHT hier, sondern in can()/isFieldHidden()
 * (permissionsService) — diese Funktion ist frei von User-/Appwrite-Abhängigkeiten.
 *
 * Semantik:
 *  - Rechte addieren sich (D2): actions = Vereinigung.
 *  - hiddenFields sind ein RECHTE-ENTZUG: gewährt irgendeine Rolle das Tool ohne
 *    das Feld zu verstecken, ist es sichtbar → Schnittmenge über alle Grants.
 *  - denyOverride gewinnt immer: entzieht Aktionen, versteckt Felder zusätzlich,
 *    enabled:false entfernt das Tool komplett.
 *  - Legacy allowedTools greift nur ohne Rollen (Rückwärtskompatibilität, D2).
 */
import {
  PERMISSION_ACTIONS,
  PermissionAction,
  PermissionMap,
  ResolutionInput,
  ToolPermission,
} from '../types/permissions';

const sanitizeActions = (actions: unknown): PermissionAction[] => {
  if (!Array.isArray(actions)) return [];
  return PERMISSION_ACTIONS.filter((a) => actions.includes(a));
};

/** Grant in die Ziel-Map einmischen (Vereinigung; hiddenFields = Schnittmenge). */
const mergeGrant = (target: PermissionMap, toolId: string, grant: ToolPermission): void => {
  if (grant.enabled === false) return; // deaktivierter Eintrag gewährt nichts

  const actions = sanitizeActions(grant.actions);
  const hiddenFields = Array.isArray(grant.hiddenFields) ? [...grant.hiddenFields] : undefined;
  const existing = target[toolId];

  if (!existing) {
    target[toolId] = { enabled: true, actions, hiddenFields };
    return;
  }

  existing.actions = [...new Set([...existing.actions, ...actions])];
  // Schnittmenge: nur Felder, die JEDER Grant versteckt, bleiben versteckt
  existing.hiddenFields =
    existing.hiddenFields && hiddenFields
      ? existing.hiddenFields.filter((f) => hiddenFields.includes(f))
      : undefined;
  if (existing.hiddenFields && existing.hiddenFields.length === 0) {
    existing.hiddenFields = undefined;
  }
};

/** denyOverride anwenden (entzieht Rechte, versteckt Felder zusätzlich). */
const applyDeny = (target: PermissionMap, toolId: string, deny: ToolPermission): void => {
  const entry = target[toolId];
  if (!entry) return;

  if (deny.enabled === false) {
    delete target[toolId];
    return;
  }

  const denyActions = sanitizeActions(deny.actions);
  if (denyActions.length > 0) {
    entry.actions = entry.actions.filter((a) => !denyActions.includes(a));
  }
  if (Array.isArray(deny.hiddenFields) && deny.hiddenFields.length > 0) {
    entry.hiddenFields = [...new Set([...(entry.hiddenFields ?? []), ...deny.hiddenFields])];
  }
  if (entry.actions.length === 0) {
    delete target[toolId];
  }
};

const fullAccessMap = (toolIds: string[]): PermissionMap =>
  Object.fromEntries(
    toolIds.map((id) => [id, { enabled: true, actions: [...PERMISSION_ACTIONS] }])
  );

export function resolveEffectivePermissions(input: ResolutionInput): PermissionMap {
  const { rolePermissions, allowOverride, denyOverride, legacyAllowedTools, allToolIds } = input;
  const effective: PermissionMap = {};

  if (rolePermissions.length > 0) {
    for (const roleMap of rolePermissions) {
      if (!roleMap) continue;
      for (const [toolId, grant] of Object.entries(roleMap)) {
        mergeGrant(effective, toolId, grant);
      }
    }
  } else if (legacyAllowedTools === null || legacyAllowedTools === undefined) {
    // Legacy-Standard: kein Eintrag = alle Tools erlaubt (heutiges Verhalten)
    Object.assign(effective, fullAccessMap(allToolIds));
  } else {
    // Legacy-Whitelist: genau diese Tools, alle Aktionen
    Object.assign(effective, fullAccessMap(legacyAllowedTools));
  }

  if (allowOverride) {
    for (const [toolId, grant] of Object.entries(allowOverride)) {
      mergeGrant(effective, toolId, grant);
    }
  }

  if (denyOverride) {
    for (const [toolId, deny] of Object.entries(denyOverride)) {
      applyDeny(effective, toolId, deny);
    }
  }

  return effective;
}

/** JSON-String einer Permission-Map defensiv parsen (kaputt/leer → null). */
export function parsePermissionMap(json: string | null | undefined): PermissionMap | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PermissionMap;
    }
    return null;
  } catch {
    console.error('❌ Ungültige Permission-Map (JSON-Parse fehlgeschlagen)');
    return null;
  }
}
