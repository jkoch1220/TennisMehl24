/**
 * Reconciliation-Sicherheitsnetz für Benachrichtigungen (Scheduled Function)
 *
 * Garant dafür, dass NIE eine neue Shop-Bestellung, Anfrage oder frisch fällig
 * gewordene Rechnung übersehen wird – auch wenn niemand online war oder ein
 * Sync-Pfad keine Notification erzeugt hat.
 *
 * Läuft alle 5 Minuten:
 *  - Lädt aus `anfragen` und `shop_bestellungen` die Datensätze mit status:'neu'
 *  - Meldet Rechnungen, deren Zahlungsziel gerade überschritten wurde
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
const PROJEKTE_COLLECTION_ID = 'projekte';
const DEBITOREN_METADATEN_COLLECTION_ID = 'debitoren_metadaten';
const BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

// Begrenzung: nur Datensätze der letzten X Tage berücksichtigen
const MAX_TAGE = 30;

// Zusätzliches Fenster für Anfragen, gemessen am DATUM DER E-MAIL.
// Der Postfach-Sync zieht regelmäßig auch ältere Nachrichten nach; deren
// `erstelltAm` (Eingang im Portal) ist dann von heute, obwohl die Anfrage
// Monate alt ist. Ohne diese Prüfung meldet die Reconciliation solche
// Nachzügler als „Neue Anfrage".
const ANFRAGE_MAX_EMAIL_ALTER_TAGE = 30;

// Anfrage-Status, die den Vorgang als abgearbeitet ausweisen. Deckungsgleich mit
// `ERLEDIGT_STATUS` in ProjektVerwaltung/AnfragenVerarbeitung.tsx — plus
// `geloescht`, denn eine weggeräumte Anfrage will erst recht niemand gemeldet
// bekommen.
const ANFRAGE_ERLEDIGT_STATUS = [
  'angebot_erstellt',
  'angebot_versendet',
  'verarbeitet',
  'erledigt',
  'abgelehnt',
  'geloescht',
];
const PAGE_SIZE = 100;
const MAX_DATENSAETZE = 500; // Sicherheitslimit pro Quelle

// --- Fälligkeits-Fenster für Rechnungs-Benachrichtigungen ---
// Gemeldet wird nur der frische Übergang „Zahlungsziel überschritten".
// Die Obergrenze entspricht der Systemgrenze aus types/debitor.ts:
//   1–14 Tage über Ziel = Status 'faellig', ab 15 Tagen = 'ueberfaellig'.
// Ab da ist der Fall im Mahnwesen aufgehoben und gehört nicht mehr auf die
// Startseite. Das Fenster verhindert außerdem, dass beim ersten Lauf sämtliche
// Altfälle auf einen Schlag als Benachrichtigung hochkommen.
const FAELLIG_MIN_TAGE = 1;
const FAELLIG_MAX_TAGE = 14;
const STANDARD_ZAHLUNGSZIEL_TAGE = 14;

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
    // Anfragen werden ausschließlich im Tool der Projektverwaltung abgearbeitet.
    // `view=anfragen` öffnet dort die Verarbeitung, `anfrageId` springt direkt
    // auf den gemeldeten Vorgang.
    link: `/projekt-verwaltung?view=anfragen&anfrageId=${doc.$id}`,
  };
};

/**
 * Ist die E-Mail hinter der Anfrage frisch genug für eine Meldung?
 * Fehlt das Datum, wird im Zweifel gemeldet.
 */
const emailIstFrisch = (emailDatum: string | undefined): boolean => {
  if (!emailDatum) return true;
  const zeit = new Date(emailDatum).getTime();
  if (isNaN(zeit)) return true;
  return zeit >= Date.now() - ANFRAGE_MAX_EMAIL_ALTER_TAGE * 24 * 60 * 60 * 1000;
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

// =====================================================
// FRISCH FÄLLIGE RECHNUNGEN
// =====================================================

/**
 * Liest den JSON-Blob eines Projekt-/Metadaten-Dokuments. Beide Collections
 * speichern ihre Nutzdaten in einem `data`-String; denormalisierte Top-Level-
 * Spalten haben Vorrang (gleiche Regel wie parseProjektDocument im Frontend).
 */
const parseDatenDokument = (doc: Models.Document): Record<string, unknown> => {
  const roh = doc as unknown as Record<string, unknown>;
  let basis: Record<string, unknown> = {};
  if (typeof roh.data === 'string') {
    try {
      basis = JSON.parse(roh.data) as Record<string, unknown>;
    } catch {
      basis = {};
    }
  }
  for (const [key, wert] of Object.entries(roh)) {
    if (key === 'data') continue;
    if (wert !== undefined && wert !== null && wert !== '') {
      basis[key] = wert;
    }
  }
  basis.$id = doc.$id;
  return basis;
};

/**
 * Zahlungsziel-Text zu Tagen ("14 Tage", "30 Tage netto", "Vorkasse").
 * Bewusst identisch zu parseZahlungszielTage im debitorService gehalten —
 * beide müssen dieselbe Fälligkeit ergeben, sonst meldet die Startseite etwas
 * anderes als die Debitorenliste anzeigt.
 */
const parseZahlungszielTage = (zahlungsziel: unknown): number | null => {
  if (typeof zahlungsziel !== 'string' || !zahlungsziel) return null;
  const lower = zahlungsziel.toLowerCase().trim();
  if (lower.includes('vorkasse') || lower.includes('vorauskasse') || lower === 'sofort') {
    return 0;
  }
  const treffer = zahlungsziel.match(/(\d+)/);
  if (treffer) {
    const tage = parseInt(treffer[1], 10);
    if (!isNaN(tage) && tage >= 0 && tage <= 365) return tage;
  }
  return null;
};

/** Tage zwischen Fälligkeitsdatum und heute (0, wenn noch nicht fällig). */
const tageSeitFaelligkeit = (faelligkeitsdatum: Date): number => {
  const diff = Date.now() - faelligkeitsdatum.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

/**
 * Lädt alle Projekte mit Status 'rechnung' (= Rechnung gestellt, nicht bezahlt).
 * 'bezahlt' wird gar nicht erst geladen.
 */
const ladeOffeneRechnungsProjekte = async (databases: Databases): Promise<Models.Document[]> => {
  const alle: Models.Document[] = [];
  let offset = 0;

  while (offset < MAX_DATENSAETZE) {
    const response = await databases.listDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, [
      Query.equal('status', 'rechnung'),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ]);
    alle.push(...response.documents);
    if (response.documents.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return alle;
};

/**
 * Lädt alle ausgelieferten Projekte (Status 'geliefert') — die Kandidaten für
 * eine offene Wiegeschein-Prüfung. Projekte, die schon in der Rechnungsstellung
 * sind, werden bewusst nicht mehr gemeldet: Dort ist der Zug abgefahren, die
 * Menge wurde beim Fakturieren ohnehin angefasst.
 */
const ladeGelieferteProjekte = async (databases: Databases): Promise<Models.Document[]> => {
  const alle: Models.Document[] = [];
  let offset = 0;

  while (offset < MAX_DATENSAETZE) {
    const response = await databases.listDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, [
      Query.equal('status', 'geliefert'),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ]);
    alle.push(...response.documents);
    if (response.documents.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return alle;
};

/**
 * Meldet eine Lieferung, deren Wiegeschein noch niemand geprüft hat.
 *
 * Der Wiegeschein trägt die Menge, nach der abgerechnet wird — bleibt er
 * ungeprüft liegen, wird entweder verspätet oder nach der falschen Zahl
 * fakturiert. Über refTyp 'wiegeschein_pruefung' + refId (Projekt-ID) entsteht
 * pro Lieferung genau EINE Meldung, sie wiederholt sich also nicht alle 5 Minuten.
 */
const wiegescheinZuNotification = (
  projekt: Record<string, unknown>
): NotificationInput | null => {
  const projektId = projekt.$id as string;
  const wiegeschein = projekt.wiegeschein as Record<string, unknown> | undefined;
  if (!wiegeschein?.fotoDateiId) return null;
  if (wiegeschein.pruefStatus !== 'offen') return null;

  const kundenname = (projekt.kundenname as string) || 'Unbekannter Kunde';
  const lieferscheinnummer = projekt.lieferscheinnummer as string | undefined;

  // Der gelesene Wert darf in der Meldung auftauchen, aber niemals ohne den
  // Zusatz, dass er ungeprüft ist — sonst wird er beim Überfliegen zur Zahl.
  const ocr = wiegeschein.ocr as Record<string, unknown> | undefined;
  const gelesen =
    ocr?.gelesen === true && typeof ocr.mengeTonnen === 'number'
      ? `${(ocr.mengeTonnen as number).toLocaleString('de-DE')} t gelesen (ungeprüft)`
      : 'keine Menge automatisch gelesen';

  const teile = [
    kundenname,
    lieferscheinnummer ? `Lieferschein ${lieferscheinnummer}` : '',
    gelesen,
  ].filter(Boolean);

  return {
    typ: 'wiegeschein_pruefung',
    titel: 'Wiegeschein prüfen',
    nachricht: teile.join(' · '),
    refTyp: 'wiegeschein_pruefung',
    refId: projektId,
    link: '/projekt-verwaltung?view=wiegescheine',
    prioritaet: 'normal',
  };
};

/**
 * Lädt die Debitoren-Metadaten der übergebenen Projekte (Status + Zahlungsziel-
 * Override). Ohne diese würde eine bereits gemahnte, teilbezahlte oder als
 * storniert/reklamiert geschlossene Forderung erneut als „fällig" gemeldet.
 */
const ladeDebitorMetadaten = async (
  databases: Databases,
  projektIds: string[]
): Promise<Map<string, Record<string, unknown>>> => {
  const map = new Map<string, Record<string, unknown>>();
  if (projektIds.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < projektIds.length; i += CHUNK) {
    const chunk = projektIds.slice(i, i + CHUNK);
    try {
      const response = await databases.listDocuments(DATABASE_ID, DEBITOREN_METADATEN_COLLECTION_ID, [
        Query.equal('projektId', chunk),
        Query.limit(PAGE_SIZE),
      ]);
      for (const doc of response.documents) {
        const daten = parseDatenDokument(doc);
        const projektId = daten.projektId as string | undefined;
        if (projektId) map.set(projektId, daten);
      }
    } catch (error) {
      console.warn('Debitoren-Metadaten konnten nicht geladen werden:', (error as Error).message);
    }
  }
  return map;
};

/**
 * Neuestes NICHT storniertes Rechnungsdokument je Projekt.
 * Dessen $createdAt ist der verlässlichste Rechnungsstellungs-Zeitpunkt — ein
 * händisch rückdatiertes projekt.rechnungsdatum würde die Rechnung sonst sofort
 * als überfällig melden. Gleiche Priorisierung wie im debitorService.
 */
const ladeRechnungsDokumente = async (
  databases: Databases,
  projektIds: string[]
): Promise<Map<string, Record<string, unknown>>> => {
  const map = new Map<string, Record<string, unknown>>();
  if (projektIds.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < projektIds.length; i += CHUNK) {
    const chunk = projektIds.slice(i, i + CHUNK);
    let offset = 0;
    try {
      while (offset <= 2000) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
          [
            Query.equal('projektId', chunk),
            Query.equal('dokumentTyp', 'rechnung'),
            Query.orderDesc('$createdAt'),
            Query.limit(PAGE_SIZE),
            Query.offset(offset),
          ]
        );
        for (const doc of response.documents) {
          const d = doc as unknown as Record<string, unknown>;
          const projektId = d.projektId as string | undefined;
          if (!projektId) continue;
          if (d.rechnungsStatus === 'storniert') continue;
          // Liste ist nach $createdAt DESC sortiert -> erster Treffer ist der aktuellste
          if (!map.has(projektId)) map.set(projektId, d);
        }
        if (response.documents.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch (error) {
      console.warn('Rechnungsdokumente konnten nicht geladen werden:', (error as Error).message);
    }
  }
  return map;
};

/**
 * Entscheidet, ob ein Projekt eine „Rechnung frisch fällig"-Benachrichtigung
 * bekommt, und baut sie. Gibt null zurück, wenn nichts zu melden ist.
 *
 * Exportiert, damit die Grenzfälle ohne Datenbank prüfbar bleiben:
 * `npx tsx scripts/test-rechnung-faellig.ts`
 */
export const rechnungZuNotification = (
  projekt: Record<string, unknown>,
  metadaten: Record<string, unknown> | undefined,
  rechnungsDokument: Record<string, unknown> | undefined
): NotificationInput | null => {
  const projektId = projekt.$id as string;

  // Bereits bezahlt -> nichts zu melden
  if (projekt.bezahltAm) return null;

  // Status aus den Debitoren-Metadaten, der eine Meldung erübrigt:
  // bezahlt/teilbezahlt (Geld ist geflossen), gemahnt (läuft schon im Mahnwesen),
  // storniert/reklamiert (Forderung geschlossen).
  const metaStatus = metadaten?.status as string | undefined;
  if (
    metaStatus === 'bezahlt' ||
    metaStatus === 'teilbezahlt' ||
    metaStatus === 'gemahnt' ||
    metaStatus === 'storniert' ||
    metaStatus === 'reklamiert'
  ) {
    return null;
  }

  // Bereits gemahnt (Mahnstufe gesetzt) -> Fall ist bekannt
  const mahnstufe = metadaten?.mahnstufe;
  if (typeof mahnstufe === 'number' && mahnstufe > 0) return null;

  // Es muss überhaupt eine Rechnung geben
  const rechnungsnummer =
    (rechnungsDokument?.dokumentNummer as string | undefined) ||
    (projekt.rechnungsnummer as string | undefined);
  if (!rechnungsnummer && !projekt.rechnungsdatum && !rechnungsDokument) return null;

  // --- Rechnungsstellungs-Datum (gleiche Priorität wie im debitorService) ---
  let rechnungsdatum: string | undefined;
  if (typeof rechnungsDokument?.$createdAt === 'string') {
    rechnungsdatum = (rechnungsDokument.$createdAt as string).split('T')[0];
  } else if (typeof projekt.rechnungsdatum === 'string') {
    rechnungsdatum = projekt.rechnungsdatum;
  }
  if (!rechnungsdatum) return null; // Ohne Datum keine belastbare Fälligkeit

  // --- Zahlungsziel ---
  let zahlungszielTage = STANDARD_ZAHLUNGSZIEL_TAGE;
  const metaZiel = metadaten?.zahlungszielTage;
  if (typeof metaZiel === 'number') {
    zahlungszielTage = metaZiel;
  } else {
    const rechnungsDaten = projekt.rechnungsDaten;
    let geparst: Record<string, unknown> | null = null;
    if (typeof rechnungsDaten === 'string') {
      try {
        geparst = JSON.parse(rechnungsDaten) as Record<string, unknown>;
      } catch {
        geparst = null;
      }
    } else if (rechnungsDaten && typeof rechnungsDaten === 'object') {
      geparst = rechnungsDaten as Record<string, unknown>;
    }
    if (typeof geparst?.zahlungszielTage === 'number') {
      zahlungszielTage = geparst.zahlungszielTage;
    } else {
      const ausText = parseZahlungszielTage(geparst?.zahlungsziel);
      if (ausText !== null) zahlungszielTage = ausText;
    }
  }

  const faelligkeit = new Date(rechnungsdatum);
  if (isNaN(faelligkeit.getTime())) return null;
  faelligkeit.setDate(faelligkeit.getDate() + zahlungszielTage);

  const tageUeberfaellig = tageSeitFaelligkeit(faelligkeit);

  // Kern der Anforderung: nur der frische Übergang, keine Altfälle
  if (tageUeberfaellig < FAELLIG_MIN_TAGE || tageUeberfaellig > FAELLIG_MAX_TAGE) {
    return null;
  }

  // --- Anzeigetext ---
  const kundenname = (projekt.kundenname as string) || 'Unbekannter Kunde';
  const betrag =
    typeof rechnungsDokument?.bruttobetrag === 'number'
      ? (rechnungsDokument.bruttobetrag as number)
      : typeof projekt.rechnungsbetrag === 'number'
        ? (projekt.rechnungsbetrag as number)
        : null;

  const teile = [
    kundenname,
    betrag !== null ? formatEuro(betrag) : '',
    tageUeberfaellig === 1 ? 'seit 1 Tag überfällig' : `seit ${tageUeberfaellig} Tagen überfällig`,
  ].filter(Boolean);

  return {
    typ: 'rechnung_faellig',
    titel: rechnungsnummer ? `Rechnung ${rechnungsnummer} überfällig` : 'Rechnung überfällig',
    nachricht: teile.join(' · '),
    // Eigener refTyp: pro Projekt entsteht genau EINE Fälligkeits-Meldung
    // (Unique-Index refTyp+refId), sie wiederholt sich also nicht täglich.
    refTyp: 'rechnung_faellig',
    refId: projektId,
    link: '/debitoren',
    prioritaet: 'hoch',
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

/**
 * Räumt Anfrage-Meldungen ab, deren Anfrage abgearbeitet ist.
 *
 * Eine Benachrichtigung ist ein Arbeitssignal, kein Archiv — die Historie steht
 * in der Anfrage selbst. Bleibt die Meldung stehen, nachdem der Vorgang im
 * Anfragen-Tool erledigt wurde, meldet die Glocke dauerhaft Altlasten als „neu".
 * Deshalb wird sie hier gelöscht, sobald der Status der Anfrage das hergibt oder
 * die Anfrage gar nicht mehr existiert.
 *
 * Neu entstehen kann sie dadurch nicht: die Reconciliation legt nur für
 * Anfragen mit `status: 'neu'` eine Meldung an.
 */
const raeumeErledigteAnfrageNotifications = async (databases: Databases): Promise<number> => {
  let geloescht = 0;
  try {
    // 1. Alle Anfrage-Meldungen einsammeln (paginiert, begrenzt)
    const meldungen: Models.Document[] = [];
    let offset = 0;
    while (offset < MAX_DATENSAETZE) {
      const response = await databases.listDocuments(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, [
        Query.equal('refTyp', ANFRAGEN_COLLECTION_ID),
        Query.orderDesc('erstelltAm'),
        Query.limit(PAGE_SIZE),
        Query.offset(offset),
      ]);
      meldungen.push(...response.documents);
      if (response.documents.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    if (meldungen.length === 0) return 0;

    // 2. Status der referenzierten Anfragen holen (in 100er-Blöcken)
    const refIds = [
      ...new Set(
        meldungen
          .map((m) => (m as Record<string, unknown>).refId as string)
          .filter(Boolean)
      ),
    ];
    const status = new Map<string, string>();
    for (let i = 0; i < refIds.length; i += PAGE_SIZE) {
      const block = refIds.slice(i, i + PAGE_SIZE);
      const response = await databases.listDocuments(DATABASE_ID, ANFRAGEN_COLLECTION_ID, [
        Query.equal('$id', block),
        Query.limit(block.length),
      ]);
      response.documents.forEach((doc) => {
        status.set(doc.$id, ((doc as Record<string, unknown>).status as string) || 'neu');
      });
    }

    // 3. Abgearbeitetes (und Verwaistes) löschen
    for (const meldung of meldungen) {
      const refId = (meldung as Record<string, unknown>).refId as string;
      if (!refId) continue;
      const s = status.get(refId);
      // s === undefined -> Anfrage existiert nicht mehr (hart gelöscht)
      if (s !== undefined && !ANFRAGE_ERLEDIGT_STATUS.includes(s)) continue;
      try {
        await databases.deleteDocument(DATABASE_ID, NOTIFICATIONS_COLLECTION_ID, meldung.$id);
        geloescht++;
      } catch (error) {
        console.warn(`Konnte Anfrage-Meldung ${meldung.$id} nicht entfernen:`, error);
      }
    }
  } catch (error) {
    console.error('Fehler beim Aufräumen erledigter Anfrage-Meldungen:', error);
  }
  return geloescht;
};

const reconcile = async (): Promise<{
  anfragen: number;
  anfragenAufgeraeumt: number;
  shop: number;
  rechnungen: number;
  wiegescheine: number;
  geprueft: number;
}> => {
  // Zuerst neue E-Mails ziehen (legt Notifications bereits am Ursprung an),
  // danach als Sicherheitsnetz abgleichen.
  await triggerEmailSync();

  const databases = createAppwriteClient();
  let erstelltAnfragen = 0;
  let erstelltShop = 0;
  let erstelltRechnungen = 0;
  let erstelltWiegescheine = 0;
  let anfragenAufgeraeumt = 0;
  let geprueft = 0;

  // --- Anfragen ---
  try {
    const anfragen = await ladeNeueDatensaetze(databases, ANFRAGEN_COLLECTION_ID);
    for (const doc of anfragen) {
      const d = doc as Record<string, unknown>;
      const erstelltAm = d.erstelltAm as string | undefined;
      if (!istAktuell(erstelltAm)) continue;
      // Nachgezogene Alt-Mails sind keine neuen Anfragen (siehe
      // ANFRAGE_MAX_EMAIL_ALTER_TAGE) — sie stehen weiter in der Liste,
      // erzeugen aber keine Meldung mehr.
      if (!emailIstFrisch(d.emailDatum as string | undefined)) continue;
      geprueft++;
      if (await erstelleNotification(databases, anfrageZuNotification(doc))) {
        erstelltAnfragen++;
      }
    }
  } catch (error) {
    console.error('Fehler bei Reconciliation Anfragen:', error);
  }

  // --- Abgearbeitete Anfragen aus der Glocke nehmen ---
  anfragenAufgeraeumt = await raeumeErledigteAnfrageNotifications(databases);

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

  // --- Frisch fällige Rechnungen ---
  try {
    const projekte = await ladeOffeneRechnungsProjekte(databases);
    const projektIds = projekte.map((p) => p.$id);
    const [metadatenMap, dokumenteMap] = await Promise.all([
      ladeDebitorMetadaten(databases, projektIds),
      ladeRechnungsDokumente(databases, projektIds),
    ]);

    for (const doc of projekte) {
      const projekt = parseDatenDokument(doc);
      geprueft++;
      const input = rechnungZuNotification(
        projekt,
        metadatenMap.get(doc.$id),
        dokumenteMap.get(doc.$id)
      );
      if (input && (await erstelleNotification(databases, input))) {
        erstelltRechnungen++;
      }
    }
  } catch (error) {
    console.error('Fehler bei Reconciliation fällige Rechnungen:', error);
  }

  // --- Offene Wiegeschein-Prüfungen ---
  try {
    const geliefert = await ladeGelieferteProjekte(databases);
    for (const doc of geliefert) {
      const projekt = parseDatenDokument(doc);
      geprueft++;
      const input = wiegescheinZuNotification(projekt);
      if (input && (await erstelleNotification(databases, input))) {
        erstelltWiegescheine++;
      }
    }
  } catch (error) {
    console.error('Fehler bei Reconciliation Wiegeschein-Prüfungen:', error);
  }

  console.log(
    `🔔 Notifications-Reconciliation: ${geprueft} geprüft, ` +
      `${erstelltAnfragen} Anfrage-Notifications, ${erstelltShop} Shop-Notifications, ` +
      `${erstelltRechnungen} Rechnungs-Notifications, ` +
      `${erstelltWiegescheine} Wiegeschein-Notifications erstellt, ` +
      `${anfragenAufgeraeumt} erledigte Anfrage-Meldungen entfernt`
  );

  return {
    anfragen: erstelltAnfragen,
    anfragenAufgeraeumt,
    shop: erstelltShop,
    rechnungen: erstelltRechnungen,
    wiegescheine: erstelltWiegescheine,
    geprueft,
  };
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
