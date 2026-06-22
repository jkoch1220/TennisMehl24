/**
 * Reconciliation-Sicherheitsnetz für Benachrichtigungen (Scheduled Function)
 *
 * Garant dafür, dass NIE eine neue Shop-Bestellung oder Anfrage übersehen wird –
 * auch wenn niemand online war oder ein Sync-Pfad keine Notification erzeugt hat.
 *
 * Läuft alle 5 Minuten:
 *  - Lädt aus `anfragen` und `shop_bestellungen` die Datensätze mit status:'neu'
 *  - Legt für jeden ohne zugehörige Notification (refTyp+refId) eine an
 *  - Idempotent (Doppelschutz über refTyp+refId, zusätzlich Unique-Index in der DB)
 *
 * Manuelles Auslösen zum Testen: GET/POST auf /.netlify/functions/notifications-generate
 */

import { schedule } from '@netlify/functions';
import type { HandlerEvent } from '@netlify/functions';
import { Client, Databases, ID, Query, Models } from 'node-appwrite';

const DATABASE_ID = 'tennismehl24_db';
const NOTIFICATIONS_COLLECTION_ID = 'notifications';
const ANFRAGEN_COLLECTION_ID = 'anfragen';
const SHOP_BESTELLUNGEN_COLLECTION_ID = 'shop_bestellungen';

// Begrenzung: nur Datensätze der letzten X Tage berücksichtigen
const MAX_TAGE = 30;
const PAGE_SIZE = 100;
const MAX_DATENSAETZE = 500; // Sicherheitslimit pro Quelle

interface NotificationInput {
  typ: string;
  titel: string;
  nachricht: string;
  refTyp: string;
  refId: string;
  link: string;
  prioritaet?: string;
}

const createAppwriteClient = (): Databases => {
  const client = new Client();
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_PROJECT_ID || 'tennismehl24')
    .setKey(process.env.APPWRITE_API_KEY || '');
  return new Databases(client);
};

/**
 * Prüft, ob für einen Quell-Datensatz bereits eine Notification existiert.
 */
const notificationExistiert = async (
  databases: Databases,
  refTyp: string,
  refId: string
): Promise<boolean> => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, [
      Query.equal('refTyp', refTyp),
      Query.equal('refId', refId),
      Query.limit(1),
    ]);
    return response.total > 0;
  } catch (error) {
    console.error('Fehler beim Doppelschutz-Check:', error);
    return false;
  }
};

/**
 * Legt eine Notification an (idempotent). Gibt true zurück, wenn neu erstellt.
 */
const erstelleNotification = async (
  databases: Databases,
  input: NotificationInput
): Promise<boolean> => {
  if (await notificationExistiert(databases, input.refTyp, input.refId)) {
    return false;
  }
  try {
    await databases.createDocument(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, ID.unique(), {
      typ: input.typ,
      titel: input.titel.substring(0, 500),
      nachricht: input.nachricht.substring(0, 2000),
      refTyp: input.refTyp,
      refId: input.refId,
      link: input.link,
      prioritaet: input.prioritaet || 'normal',
      gelesenVon: [],
      erledigtVon: [],
      erstelltAm: new Date().toISOString(),
    });
    return true;
  } catch (error: unknown) {
    // 409 = Unique-Index-Verletzung -> existiert bereits (Race-Condition)
    const code = (error as { code?: number })?.code;
    if (code === 409) return false;
    console.error('Fehler beim Anlegen der Notification:', error);
    return false;
  }
};

/**
 * Lädt alle Dokumente mit status:'neu' einer Collection (paginiert, begrenzt).
 */
const ladeNeueDatensaetze = async (
  databases: Databases,
  collectionId: string
): Promise<Models.Document[]> => {
  const alle: Models.Document[] = [];
  let offset = 0;

  while (offset < MAX_DATENSAETZE) {
    const response = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal('status', 'neu'),
      Query.orderDesc('erstelltAm'),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ]);
    alle.push(...response.documents);
    if (response.documents.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return alle;
};

/** Liegt der Datensatz innerhalb des Zeitfensters (letzte MAX_TAGE Tage)? */
const istAktuell = (datum: string | undefined): boolean => {
  if (!datum) return true; // Im Zweifel berücksichtigen
  const zeit = new Date(datum).getTime();
  if (isNaN(zeit)) return true;
  const grenze = Date.now() - MAX_TAGE * 24 * 60 * 60 * 1000;
  return zeit >= grenze;
};

const formatEuro = (wert: number): string =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/**
 * Baut die Notification-Eingabe für eine Anfrage.
 */
const anfrageZuNotification = (doc: Models.Document): NotificationInput => {
  let kundenname = '';
  let ort = '';
  try {
    const daten = JSON.parse((doc as Record<string, unknown>).extrahierteDaten as string || '{}');
    kundenname = daten.kundenname || daten.vereinsname || daten.ansprechpartner || '';
    ort = daten.ort || '';
  } catch {
    // Parsing-Fehler ignorieren
  }
  const betreff = (doc as Record<string, unknown>).emailBetreff as string || 'Neue Anfrage';
  const nachricht = kundenname
    ? `${kundenname}${ort ? ` · ${ort}` : ''}`
    : betreff.substring(0, 120);

  return {
    typ: 'anfrage',
    titel: 'Neue Anfrage',
    nachricht,
    refTyp: ANFRAGEN_COLLECTION_ID,
    refId: doc.$id,
    link: '/anfragen',
  };
};

/**
 * Baut die Notification-Eingabe für eine Shop-Bestellung.
 */
const shopBestellungZuNotification = (doc: Models.Document): NotificationInput => {
  const d = doc as Record<string, unknown>;
  const bestellnummer = (d.bestellnummer as string) || doc.$id;
  let empfaenger = '';
  try {
    const adresse = JSON.parse((d.lieferadresse as string) || '{}');
    empfaenger = adresse.firma || adresse.name || '';
  } catch {
    // Parsing-Fehler ignorieren
  }
  const summe = typeof d.summeBrutto === 'number' ? formatEuro(d.summeBrutto) : '';
  const teile = [empfaenger, summe].filter(Boolean);

  return {
    typ: 'shop_bestellung',
    titel: `Neue Shop-Bestellung #${bestellnummer}`,
    nachricht: teile.length ? teile.join(' · ') : 'Neue Online-Bestellung',
    refTyp: SHOP_BESTELLUNGEN_COLLECTION_ID,
    refId: doc.$id,
    link: '/shop-bestellungen',
  };
};

/**
 * Stößt email-sync an, damit neue Anfragen automatisch aus dem Postfach in die
 * `anfragen`-Collection gezogen werden (email-sync legt dabei bereits die
 * Notification am Ursprung an). So funktioniert die Kette auch, wenn niemand
 * online ist und manuell synct. Fehler werden nur geloggt.
 */
const triggerEmailSync = async (): Promise<void> => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) {
    console.warn('⚠️ Keine Site-URL (process.env.URL) – email-sync nicht automatisch ausgelöst');
    return;
  }
  try {
    const res = await fetch(`${base}/.netlify/functions/email-sync`);
    const data = await res.json().catch(() => ({}));
    console.log(
      `📧 email-sync ausgelöst: ${data.neueSpeicherungen ?? '?'} neu, ${data.duplikate ?? '?'} Duplikate`
    );
  } catch (error) {
    console.warn('⚠️ email-sync konnte nicht ausgelöst werden:', (error as Error).message);
  }
};

const reconcile = async (): Promise<{ anfragen: number; shop: number; geprueft: number }> => {
  // Zuerst neue E-Mails ziehen (legt Notifications bereits am Ursprung an),
  // danach als Sicherheitsnetz abgleichen.
  await triggerEmailSync();

  const databases = createAppwriteClient();
  let erstelltAnfragen = 0;
  let erstelltShop = 0;
  let geprueft = 0;

  // --- Anfragen ---
  try {
    const anfragen = await ladeNeueDatensaetze(databases, ANFRAGEN_COLLECTION_ID);
    for (const doc of anfragen) {
      const erstelltAm = (doc as Record<string, unknown>).erstelltAm as string | undefined;
      if (!istAktuell(erstelltAm)) continue;
      geprueft++;
      if (await erstelleNotification(databases, anfrageZuNotification(doc))) {
        erstelltAnfragen++;
      }
    }
  } catch (error) {
    console.error('Fehler bei Reconciliation Anfragen:', error);
  }

  // --- Shop-Bestellungen ---
  try {
    const bestellungen = await ladeNeueDatensaetze(databases, SHOP_BESTELLUNGEN_COLLECTION_ID);
    for (const doc of bestellungen) {
      const d = doc as Record<string, unknown>;
      const datum = (d.erstelltAm as string) || (d.bestelldatum as string) || undefined;
      if (!istAktuell(datum)) continue;
      geprueft++;
      if (await erstelleNotification(databases, shopBestellungZuNotification(doc))) {
        erstelltShop++;
      }
    }
  } catch (error) {
    console.error('Fehler bei Reconciliation Shop-Bestellungen:', error);
  }

  console.log(
    `🔔 Notifications-Reconciliation: ${geprueft} geprüft, ` +
      `${erstelltAnfragen} Anfrage-Notifications, ${erstelltShop} Shop-Notifications erstellt`
  );

  return { anfragen: erstelltAnfragen, shop: erstelltShop, geprueft };
};

// Scheduled Function: alle 5 Minuten.
// Der schedule()-Wrapper macht die Funktion auch manuell aufrufbar (zum Testen).
export const handler = schedule('*/5 * * * *', async (_event: HandlerEvent) => {
  if (!process.env.APPWRITE_API_KEY) {
    console.warn('⚠️ APPWRITE_API_KEY nicht gesetzt – Reconciliation übersprungen');
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'APPWRITE_API_KEY fehlt' }),
    };
  }

  try {
    const result = await reconcile();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    console.error('Reconciliation fehlgeschlagen:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Reconciliation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
});
