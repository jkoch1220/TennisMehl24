import { ReactNode } from 'react';
import { useCan } from '../../hooks/useCan';
import { PermissionAction } from '../../types/permissions';

interface CanProps {
  toolId: string;
  /** Standard: 'view' */
  action?: PermissionAction;
  /** Wird gerendert, wenn das Recht fehlt (Standard: nichts) */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Guard-Komponente: rendert children nur, wenn der eingeloggte User die
 * Aktion im Tool ausführen darf. Kein CSS-Verstecken — ohne Recht wird
 * der Inhalt gar nicht erst gerendert.
 *
 *   <Can toolId="debitoren" action="delete">
 *     <LöschenButton />
 *   </Can>
 */
const Can = ({ toolId, action = 'view', fallback = null, children }: CanProps) => {
  const { can } = useCan();
  return <>{can(toolId, action) ? children : fallback}</>;
};

export default Can;
