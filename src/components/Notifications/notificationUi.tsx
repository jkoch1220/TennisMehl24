/**
 * Geteilte UI-Helfer für Benachrichtigungen (Glocke + Startseite).
 */
import { ShoppingCart, Mail, AlertTriangle, Euro, Bell } from 'lucide-react';
import type { NotificationTyp } from '../../types/notification';

/** Icon-Komponente passend zum Benachrichtigungstyp. */
export function getTypIcon(typ: NotificationTyp, className = 'w-5 h-5') {
  switch (typ) {
    case 'shop_bestellung':
      return <ShoppingCart className={className} />;
    case 'anfrage':
      return <Mail className={className} />;
    case 'mahnung':
      return <AlertTriangle className={className} />;
    case 'zahlung':
      return <Euro className={className} />;
    default:
      return <Bell className={className} />;
  }
}

/** Farb-Klassen (Hintergrund + Text) für das Typ-Icon. */
export function getTypFarbe(typ: NotificationTyp): string {
  switch (typ) {
    case 'shop_bestellung':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'anfrage':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'mahnung':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'zahlung':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

/** Lesbares Label für einen Typ (z.B. für Filter). */
export function getTypLabel(typ: NotificationTyp): string {
  switch (typ) {
    case 'shop_bestellung':
      return 'Shop-Bestellung';
    case 'anfrage':
      return 'Anfrage';
    case 'mahnung':
      return 'Mahnung';
    case 'zahlung':
      return 'Zahlung';
    default:
      return 'Benachrichtigung';
  }
}

/** Relative Zeitangabe („Gerade eben", „vor 5 Min", …). */
export function formatRelativeTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min`;
  if (diffHours < 24) return `vor ${diffHours} Std`;
  if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
