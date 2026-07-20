import { ExternalLink } from 'lucide-react';

interface OpenInNewTabButtonProps {
  /** Interner Pfad, z.B. /projektabwicklung/123 */
  to: string;
  title?: string;
  /** Nur sichtbar, wenn das Eltern-Element (mit `group`-Klasse) gehovert wird. Auf Touch-Geräten immer sichtbar. */
  appearOnGroupHover?: boolean;
  className?: string;
  /** Icon-Größe (Tailwind), Default w-4 h-4 */
  iconClassName?: string;
}

/**
 * Kleiner Icon-Button, der einen internen Pfad in einem neuen Browser-Tab öffnet.
 * Als echter <a>-Link umgesetzt, damit auch Mittelklick/Cmd+Klick funktionieren.
 * stopPropagation verhindert, dass der Klick die umgebende Karte (onClick-Navigation) auslöst.
 */
const OpenInNewTabButton = ({
  to,
  title = 'In neuem Tab öffnen',
  appearOnGroupHover = true,
  className = '',
  iconClassName = 'w-4 h-4',
}: OpenInNewTabButtonProps) => {
  const hoverVisibility = appearOnGroupHover
    ? 'md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity'
    : '';

  return (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 ${hoverVisibility} ${className}`}
    >
      <ExternalLink className={iconClassName} />
    </a>
  );
};

export default OpenInNewTabButton;
