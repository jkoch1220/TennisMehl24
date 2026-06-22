/**
 * Benachrichtigungen (persistenter Notification-Service)
 *
 * Eine Benachrichtigung existiert als DB-Datensatz, sobald ein relevantes
 * Ereignis (neue Shop-Bestellung, neue Anfrage, …) passiert – unabhängig davon,
 * ob ein Mitarbeiter gerade online ist. Quelle der Wahrheit ist die Datenbank,
 * nicht der Browser.
 */

/**
 * Quelle/Art einer Benachrichtigung.
 * Als Union-Typ angelegt, damit später weitere Quellen (Mahnungen,
 * Zahlungseingänge, …) mit minimalem Aufwand ergänzt werden können.
 */
export type NotificationTyp =
  | 'shop_bestellung'
  | 'anfrage'
  | 'mahnung'
  | 'zahlung';

export type NotificationPrioritaet = 'normal' | 'hoch';

/**
 * Datensatz in der Appwrite-Collection `notifications`.
 */
export interface Benachrichtigung {
  $id: string;
  /** Art der Benachrichtigung (steuert Icon & Gruppierung) */
  typ: NotificationTyp;
  /** Kurze Überschrift, z.B. „Neue Shop-Bestellung #1234" */
  titel: string;
  /** Kurzbeschreibung, z.B. „TC Musterstadt · 312,50 €" */
  nachricht: string;
  /** Quell-Collection, z.B. 'shop_bestellungen' / 'anfragen' */
  refTyp: string;
  /** Dokument-ID der Quelle (zum Verlinken/Springen) */
  refId: string;
  /** Ziel-Route, z.B. '/shop-bestellungen' oder '/anfragen' */
  link: string;
  /** Priorität (optional) */
  prioritaet?: NotificationPrioritaet;
  /** User-IDs, die die Meldung gesehen haben → steuert den Glocken-Zähler */
  gelesenVon: string[];
  /** User-IDs, die die Meldung abgehakt haben → entfernt sie aus der offenen Liste */
  erledigtVon: string[];
  /** Erstellzeitpunkt (ISO) */
  erstelltAm: string;
  // Appwrite-Metadaten (optional, vom SDK gesetzt)
  $createdAt?: string;
  $updatedAt?: string;
}

/**
 * Eingabe für die zentrale Hilfsfunktion `erstelleNotification`.
 * `gelesenVon`/`erledigtVon` starten immer leer, `erstelltAm` wird gesetzt.
 */
export interface NeueNotification {
  typ: NotificationTyp;
  titel: string;
  nachricht: string;
  refTyp: string;
  refId: string;
  link: string;
  prioritaet?: NotificationPrioritaet;
}
