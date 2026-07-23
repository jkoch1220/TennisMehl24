import { describe, it, expect } from 'vitest';
import { resolveEffectivePermissions, parsePermissionMap } from '../permissionResolution';
import { PermissionMap, PERMISSION_ACTIONS } from '../../types/permissions';

const TOOLS = ['dashboard', 'projekt-verwaltung', 'debitoren', 'wiki', 'privat-kreditoren'];

const resolve = (input: Partial<Parameters<typeof resolveEffectivePermissions>[0]>) =>
  resolveEffectivePermissions({
    rolePermissions: [],
    allToolIds: TOOLS,
    ...input,
  });

describe('resolveEffectivePermissions', () => {
  // ---------------------------------------------------------------- Legacy
  describe('Legacy-Fallback (keine Rollen)', () => {
    it('allowedTools = null → alle Tools mit allen Aktionen (heutiges Verhalten)', () => {
      const eff = resolve({ legacyAllowedTools: null });
      expect(Object.keys(eff).sort()).toEqual([...TOOLS].sort());
      expect(eff['debitoren'].actions).toEqual([...PERMISSION_ACTIONS]);
    });

    it('allowedTools = [] → keine Tools', () => {
      const eff = resolve({ legacyAllowedTools: [] });
      expect(Object.keys(eff)).toHaveLength(0);
    });

    it('allowedTools = [ids] → genau diese Tools, alle Aktionen', () => {
      const eff = resolve({ legacyAllowedTools: ['wiki', 'dashboard'] });
      expect(Object.keys(eff).sort()).toEqual(['dashboard', 'wiki']);
      expect(eff['wiki'].actions).toContain('delete');
    });

    it('Rollen zugewiesen → Legacy-Feld wird komplett ignoriert', () => {
      const rolle: PermissionMap = { wiki: { enabled: true, actions: ['view'] } };
      const eff = resolve({ rolePermissions: [rolle], legacyAllowedTools: null });
      expect(Object.keys(eff)).toEqual(['wiki']);
      expect(eff['wiki'].actions).toEqual(['view']);
    });
  });

  // ---------------------------------------------------------------- Rollen
  describe('Rollen-Vereinigung (D2)', () => {
    it('Aktionen addieren sich über mehrere Rollen', () => {
      const a: PermissionMap = { wiki: { enabled: true, actions: ['view'] } };
      const b: PermissionMap = { wiki: { enabled: true, actions: ['edit', 'create'] } };
      const eff = resolve({ rolePermissions: [a, b] });
      expect(eff['wiki'].actions.sort()).toEqual(['create', 'edit', 'view']);
    });

    it('Tools addieren sich über mehrere Rollen', () => {
      const a: PermissionMap = { wiki: { enabled: true, actions: ['view'] } };
      const b: PermissionMap = { dashboard: { enabled: true, actions: ['view'] } };
      const eff = resolve({ rolePermissions: [a, b] });
      expect(Object.keys(eff).sort()).toEqual(['dashboard', 'wiki']);
    });

    it('enabled:false in einer Rolle gewährt nichts', () => {
      const a: PermissionMap = { debitoren: { enabled: false, actions: ['view'] } };
      const eff = resolve({ rolePermissions: [a] });
      expect(eff['debitoren']).toBeUndefined();
    });

    it('unbekannte Aktionen werden verworfen (defensiv)', () => {
      const a = { wiki: { enabled: true, actions: ['view', 'hack'] } } as unknown as PermissionMap;
      const eff = resolve({ rolePermissions: [a] });
      expect(eff['wiki'].actions).toEqual(['view']);
    });
  });

  // ---------------------------------------------------------------- hiddenFields
  describe('hiddenFields = Schnittmenge (Rechte addieren sich)', () => {
    it('beide Rollen verstecken dasselbe Feld → bleibt versteckt', () => {
      const a: PermissionMap = { 'projekt-verwaltung': { enabled: true, actions: ['view'], hiddenFields: ['db1', 'einkaufspreis'] } };
      const b: PermissionMap = { 'projekt-verwaltung': { enabled: true, actions: ['view'], hiddenFields: ['db1'] } };
      const eff = resolve({ rolePermissions: [a, b] });
      expect(eff['projekt-verwaltung'].hiddenFields).toEqual(['db1']);
    });

    it('eine Rolle ohne hiddenFields → nichts versteckt (großzügigste Rolle gewinnt)', () => {
      const a: PermissionMap = { 'projekt-verwaltung': { enabled: true, actions: ['view'], hiddenFields: ['db1'] } };
      const b: PermissionMap = { 'projekt-verwaltung': { enabled: true, actions: ['view'] } };
      const eff = resolve({ rolePermissions: [a, b] });
      expect(eff['projekt-verwaltung'].hiddenFields).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------- Overrides
  describe('allowOverride ∪ / denyOverride −', () => {
    const basisRolle: PermissionMap = {
      wiki: { enabled: true, actions: ['view', 'edit'] },
      'projekt-verwaltung': { enabled: true, actions: ['view'], hiddenFields: ['db1'] },
    };

    it('allowOverride ergänzt Tools und Aktionen', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        allowOverride: {
          debitoren: { enabled: true, actions: ['view'] },
          wiki: { enabled: true, actions: ['delete'] },
        },
      });
      expect(eff['debitoren'].actions).toEqual(['view']);
      expect(eff['wiki'].actions.sort()).toEqual(['delete', 'edit', 'view']);
    });

    it('denyOverride entzieht einzelne Aktionen', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        denyOverride: { wiki: { enabled: true, actions: ['edit'] } },
      });
      expect(eff['wiki'].actions).toEqual(['view']);
    });

    it('denyOverride mit enabled:false entfernt das Tool komplett', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        denyOverride: { wiki: { enabled: false, actions: [] } },
      });
      expect(eff['wiki']).toBeUndefined();
    });

    it('deny schlägt allow (gleiche Aktion in beiden Overrides)', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        allowOverride: { wiki: { enabled: true, actions: ['delete'] } },
        denyOverride: { wiki: { enabled: true, actions: ['delete'] } },
      });
      expect(eff['wiki'].actions).not.toContain('delete');
    });

    it('werden alle Aktionen entzogen, verschwindet das Tool', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        denyOverride: { wiki: { enabled: true, actions: ['view', 'edit'] } },
      });
      expect(eff['wiki']).toBeUndefined();
    });

    it('denyOverride versteckt Felder zusätzlich', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        denyOverride: { 'projekt-verwaltung': { enabled: true, actions: [], hiddenFields: ['einkaufspreis'] } },
      });
      expect(eff['projekt-verwaltung'].hiddenFields?.sort()).toEqual(['db1', 'einkaufspreis']);
    });

    it('deny auf nicht gewährtes Tool ist wirkungslos (kein Crash)', () => {
      const eff = resolve({
        rolePermissions: [basisRolle],
        denyOverride: { 'privat-kreditoren': { enabled: false, actions: [] } },
      });
      expect(eff['privat-kreditoren']).toBeUndefined();
      expect(eff['wiki']).toBeDefined();
    });

    it('allowOverride wirkt auch auf Legacy-Basis (User ohne Rollen)', () => {
      const eff = resolve({
        legacyAllowedTools: ['dashboard'],
        allowOverride: { wiki: { enabled: true, actions: ['view'] } },
      });
      expect(Object.keys(eff).sort()).toEqual(['dashboard', 'wiki']);
    });
  });
});

describe('parsePermissionMap', () => {
  it('parst gültiges JSON', () => {
    expect(parsePermissionMap('{"wiki":{"enabled":true,"actions":["view"]}}')).toEqual({
      wiki: { enabled: true, actions: ['view'] },
    });
  });

  it('null/undefined/leer → null', () => {
    expect(parsePermissionMap(null)).toBeNull();
    expect(parsePermissionMap(undefined)).toBeNull();
    expect(parsePermissionMap('')).toBeNull();
  });

  it('kaputtes JSON oder Nicht-Objekt → null (kein Crash)', () => {
    expect(parsePermissionMap('{kaputt')).toBeNull();
    expect(parsePermissionMap('[1,2]')).toBeNull();
    expect(parsePermissionMap('"string"')).toBeNull();
  });
});
