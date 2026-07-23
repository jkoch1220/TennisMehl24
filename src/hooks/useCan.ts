import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { can, isFieldHidden } from '../services/permissionsService';
import { PermissionAction } from '../types/permissions';

/**
 * Hook für Rechte-Prüfungen in Komponenten.
 *
 *   const { can, isFieldHidden } = useCan();
 *   if (can('projekt-verwaltung', 'edit')) { ... }
 *   {!isFieldHidden('projekt-verwaltung', 'db1') && <Db1Anzeige />}
 *
 * Solange Permissions noch laden, liefern beide Helfer restriktive Werte
 * (nichts erlaubt, alles verborgen) — fail-closed.
 */
export const useCan = () => {
  const { user, permissionsLoading } = useAuth();

  const canDo = useCallback(
    (toolId: string, action: PermissionAction): boolean => {
      if (permissionsLoading) return false;
      return can(user, toolId, action);
    },
    [user, permissionsLoading]
  );

  const fieldHidden = useCallback(
    (toolId: string, fieldKey: string): boolean => {
      if (permissionsLoading) return true;
      return isFieldHidden(user, toolId, fieldKey);
    },
    [user, permissionsLoading]
  );

  return useMemo(
    () => ({ can: canDo, isFieldHidden: fieldHidden, permissionsLoading }),
    [canDo, fieldHidden, permissionsLoading]
  );
};
