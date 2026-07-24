import { UserPen } from 'lucide-react';

/**
 * Dezenter "Zuletzt bearbeitet von X am …"-Hinweis für Detail-Ansichten.
 * Rendert nichts, solange keine Bearbeiter-Daten vorliegen (Altbestand).
 */
interface BearbeitetVonHinweisProps {
  bearbeitetVonName?: string | null;
  bearbeitetAm?: string | null;
  className?: string;
}

const BearbeitetVonHinweis = ({ bearbeitetVonName, bearbeitetAm, className = '' }: BearbeitetVonHinweisProps) => {
  if (!bearbeitetVonName && !bearbeitetAm) return null;

  const zeitpunkt = bearbeitetAm
    ? new Date(bearbeitetAm).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <p className={`flex items-center gap-1.5 text-xs text-gray-400 dark:text-dark-textMuted ${className}`}>
      <UserPen className="w-3.5 h-3.5" />
      Zuletzt bearbeitet{bearbeitetVonName ? ` von ${bearbeitetVonName}` : ''}
      {zeitpunkt ? ` am ${zeitpunkt}` : ''}
    </p>
  );
};

export default BearbeitetVonHinweis;
