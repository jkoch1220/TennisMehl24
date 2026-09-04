/**
 * zeiterfassung.ts — Netlify Function für den Arbeitszeitnachweis (ArbZG/MiLoG)
 *
 * Das Portal stempelt ausschließlich über diese Function. Sie ist die einzige
 * Stelle, an der die Collection `zeit_events` überhaupt erreichbar ist.
 *
 * DIE VIER REGELN, DIE HIER ALLES TRAGEN:
 *
 * 1. Der Zeitstempel kommt vom Server, nie aus dem Request. `zeitpunkt` ist
 *    `new Date().toISOString()` dieser Function — was der Browser über die Uhr
 *    seines Rechners denkt, ist für den Nachweis ohne Belang. Ein Nachtrag ist
 *    die einzige Ausnahme, und der ist der Leitung vorbehalten, verlangt eine
 *    Begründung und darf nicht in die Zukunft zeigen.
 *
 * 2. Die Collection hat KEINE Client-Rechte (Permissions: leeres Array,
 *    documentSecurity aus). Arbeitszeiten sind sensible Personendaten; mit
 *    `read(users)` läse jeder eingeloggte Kollege die Stempel aller anderen.
 *    Jeder Zugriff läuft deshalb über den Server-API-Key, der nur hier lebt.
 *
 * 3. Events werden nie geändert und nie gelöscht. Die Kette ist append-only:
 *    eine Korrektur ist ein neues Event vom Typ `storno`, das per
 *    `bezugEventId` auf das aufgehobene zeigt. Ein überschreibbarer Datensatz
 *    beweist gegenüber Zoll oder Arbeitsschutzbehörde nichts.
 *
 * 4. Ein normaler Nutzer sieht ausschließlich seine eigenen Zeiten. Die
 *    Zuordnung Konto→Mitarbeiter kommt serverseitig aus `schicht_mitarbeiter`;
 *    ein mitgeschicktes `mitarbeiterId` wird für ihn ignoriert bzw. abgelehnt.
 *    "Leitung" (Label `admin` oder `zeitleitung` am Appwrite-Account) darf
 *    fremde Zeiten sehen, fremd stempeln, nachtragen und stornieren.
 *
 * Identifiziert wird der Aufrufer über sein Appwrite-Session-JWT im Header
 * `x-appwrite-jwt` — zwei getrennte Clients: einer mit setJWT() NUR für
 * Account.get(), einer mit setKey() für alle Datenbankzugriffe.
 */

import { Handler, HandlerEvent } from '@netlify/functions';
import { Client, Account, Databases, ID, Query, Models } from 'node-appwrite';

/* ------------------------------------------------------------------ *
 * Konfiguration
 * ------------------------------------------------------------------ */

/**
 * Ziel-Datenbank.
 *
 * Läuft das Portal im Sandbox-Modus, schickt der Service `sandbox: true` mit.
 * Ohne diese Weiche schriebe ein Testlauf echte Arbeitszeiten in die Produktion.
 *
 * Der Parameter ist unbedenklich manipulierbar: er wählt nur, WO gearbeitet
 * wird. Beide Datenbanken verlangen dieselbe Authentifizierung — dasselbe
 * gültige Session-JWT, dieselbe Leitungs-Label-Prüfung, dieselbe
 * Mitarbeiterzuordnung. Wer in der Sandbox nichts darf, darf dort auch mit
 * `sandbox: true` nichts.
 */
const PRODUKTIONS_DB = 'tennismehl24_db';
const SANDBOX_DB = 'tennismehl24_db_mock';
const datenbank = (sandbox: boolean): string => (sandbox ? SANDBOX_DB : PRODUKTIONS_DB);

const ZEIT_EVENTS_COLLECTION_ID = 'zeit_events';
const SCHICHT_MITARBEITER_COLLECTION_ID = 'schicht_mitarbeiter';

/** Zeitzone des Betriebs — in Sync mit BETRIEBS_ZEITZONE in src/types/zeiterfassung.ts. */
const BETRIEBS_ZEITZONE = 'Europe/Berlin';

/** Labels, die zur Leitung berechtigen. */
const LEITUNGS_LABELS = ['admin', 'zeitleitung'];

/** Freitextgrenzen — identisch zu den Attributlängen in Appwrite. */
const MAX_TEXT = 500;

/** Seitengröße und Deckel für die Zeitraum-Abfrage. */
const PAGE_SIZE = 100;
const MAX_EVENTS = 20000;

/** Ein Jahr plus Schalttag. Alles darüber ist ein Report-Job, kein Portal-Aufruf. */
const MAX_ZEITRAUM_TAGE = 366;

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ *
 * Typen (gespiegelt aus src/types/zeiterfassung.ts)
 * ------------------------------------------------------------------ */

type ZeitEventTyp = 'kommen' | 'pause_start' | 'pause_ende' | 'gehen' | 'storno';
type ZeitQuelle = 'web' | 'kiosk' | 'nachtrag';
type StempelStatus = 'abwesend' | 'arbeitet' | 'pause';

/** Die vier Stempel, die ein Mensch drückt — `storno` entsteht nur systemseitig. */
const STEMPEL_TYPEN: ZeitEventTyp[] = ['kommen', 'pause_start', 'pause_ende', 'gehen'];

interface ZeitEvent {
  id: string;
  mitarbeiterId: string;
  typ: ZeitEventTyp;
  zeitpunkt: string;
  datum: string;
  quelle: ZeitQuelle;
  erfasstVonUserId: string;
  erfasstVonName: string;
  erfasstAm: string;
  bezugEventId?: string;
  begruendung?: string;
  notiz?: string;
}

interface ZeitMitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  name: string;
  position?: string;
  farbe: string;
  istAktiv: boolean;
  maxStundenProWoche: number;
  userId?: string;
}

/* ------------------------------------------------------------------ *
 * Appwrite-Dokumentformen
 * ------------------------------------------------------------------ */

interface ZeitEventDoc extends Models.Document {
  mitarbeiterId: string;
  typ: string;
  zeitpunkt: string;
  datum: string;
  quelle: string;
  erfasstVonUserId: string;
  erfasstVonName: string;
  erfasstAm: string;
  bezugEventId?: string | null;
  begruendung?: string | null;
  notiz?: string | null;
}

/**
 * `schicht_mitarbeiter` legt alle Fachdaten als JSON-Blob in `data` ab.
 * Echte Attribute sind nur `istAktiv` und (neu) `userId` — deshalb ist die
 * Zuordnung zum Portal-Konto auch ein echtes Attribut und kein JSON-Feld:
 * ein Blob ist nicht filterbar.
 */
interface MitarbeiterDoc extends Models.Document {
  istAktiv?: boolean;
  userId?: string | null;
  data?: string | null;
}

/* ------------------------------------------------------------------ *
 * HTTP-Helfer
 * ------------------------------------------------------------------ */

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-appwrite-jwt',
  },
  body: JSON.stringify(body),
});

const getConfig = () => {
  // Bewusst OHNE VITE_-Fallback: Vite inlined jede VITE_*-Variable zur Bauzeit
  // ins Client-Bundle. Ein Server-Key darf dort nie landen — genau so ist hier
  // schon einmal ein Schlüssel öffentlich geworden (siehe netlify.toml).
  const apiKey = process.env.APPWRITE_API_KEY;
  const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
  if (!apiKey || !endpoint || !projectId) return null;
  return { apiKey, endpoint, projectId };
};

/** Freitext trimmen und auf die Attributlänge kappen. */
const kuerze = (text: unknown, maxLaenge: number): string | undefined => {
  if (typeof text !== 'string') return undefined;
  const getrimmt = text.trim();
  if (!getrimmt) return undefined;
  return getrimmt.slice(0, maxLaenge);
};

/* ------------------------------------------------------------------ *
 * Zeit-Helfer
 * ------------------------------------------------------------------ */

/**
 * Lokales Datum (YYYY-MM-DD) in der Betriebszeitzone.
 *
 * Bewusst über Intl statt `toISOString().split('T')[0]`: Letzteres liefert das
 * UTC-Datum und schöbe jeden Stempel zwischen Mitternacht und 02:00 MESZ auf
 * den Vortag — der Feierabend um 00:30 landete im falschen Monat.
 * Das schwedische Locale liefert als einziges ISO-Reihenfolge.
 */
const lokalesDatum = (iso: string | Date): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: BETRIEBS_ZEITZONE }).format(
    typeof iso === 'string' ? new Date(iso) : iso
  );

/** Lokale Uhrzeit (HH:MM) — nur für Fehlertexte. */
const lokaleUhrzeit = (iso: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: BETRIEBS_ZEITZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** Tage zwischen zwei lokalen ISO-Daten, beide einschließlich. */
const tageImZeitraum = (von: string, bis: string): number => {
  const [vj, vm, vt] = von.split('-').map(Number);
  const [bj, bm, bt] = bis.split('-').map(Number);
  const a = Date.UTC(vj, vm - 1, vt);
  const b = Date.UTC(bj, bm - 1, bt);
  return Math.floor((b - a) / 86400000) + 1;
};

const istGueltigesDatum = (wert: unknown): wert is string => {
  if (typeof wert !== 'string' || !DATUM_REGEX.test(wert)) return false;
  const d = new Date(`${wert}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && lokalesDatum(d) === wert;
};

/* ------------------------------------------------------------------ *
 * Zustandslogik — REFERENZ: src/utils/zeiterfassungBerechnung.ts
 * ------------------------------------------------------------------ *
 *
 * wirksameEvents / ermittleStatus / erlaubteStempel sind hier bewusst
 * NACHGEBILDET statt importiert: `netlify/functions` liegt außerhalb des
 * tsconfig-`include`, und ein Import quer aus `src/` wäre im Repo ein
 * Sonderfall, den sonst keine Function macht.
 *
 * Der Preis dafür ist eine Doppelung, die bewusst synchron gehalten werden
 * muss: ändert sich dort die Übergangslogik, muss sie hier mitgeführt werden.
 * Sonst zeigt die UI Knöpfe an, die der Server verweigert (oder umgekehrt).
 */

/**
 * Entfernt stornierte Events und die Storno-Marker selbst.
 * Der Aufhebungsvermerk bleibt in der Datenbank — er verschwindet nur aus der
 * Auswertung. Genau das unterscheidet ein Storno von einer Löschung.
 */
const wirksameEvents = (events: ZeitEvent[]): ZeitEvent[] => {
  const aufgehoben = new Set(
    events
      .filter((e) => e.typ === 'storno' && e.bezugEventId)
      .map((e) => e.bezugEventId as string)
  );
  return events
    .filter((e) => e.typ !== 'storno' && !aufgehoben.has(e.id))
    // Nach Zeitwert, nicht nach Zeichenkette — siehe zeiterfassungBerechnung.ts.
    .sort((a, b) => new Date(a.zeitpunkt).getTime() - new Date(b.zeitpunkt).getTime());
};

/** Aktueller Stempelzustand aus der Event-Kette. */
const ermittleStatus = (events: ZeitEvent[]): StempelStatus => {
  let status: StempelStatus = 'abwesend';
  for (const e of wirksameEvents(events)) {
    if (e.typ === 'kommen') status = 'arbeitet';
    else if (e.typ === 'pause_start' && status === 'arbeitet') status = 'pause';
    else if (e.typ === 'pause_ende' && status === 'pause') status = 'arbeitet';
    else if (e.typ === 'gehen') status = 'abwesend';
  }
  return status;
};

/** Welche Stempel von einem Zustand aus fachlich erlaubt sind. */
const erlaubteStempel = (status: StempelStatus): ZeitEventTyp[] => {
  switch (status) {
    case 'abwesend':
      return ['kommen'];
    case 'arbeitet':
      return ['pause_start', 'gehen'];
    case 'pause':
      return ['pause_ende', 'gehen'];
  }
};

const STEMPEL_BEZEICHNUNG: Record<ZeitEventTyp, string> = {
  kommen: 'Kommen',
  pause_start: 'Pausenbeginn',
  pause_ende: 'Pausenende',
  gehen: 'Gehen',
  storno: 'Storno',
};

const STATUS_BEZEICHNUNG: Record<StempelStatus, string> = {
  abwesend: 'nicht eingestempelt',
  arbeitet: 'eingestempelt',
  pause: 'in der Pause',
};

/* ------------------------------------------------------------------ *
 * Rate-Limit (Best Effort, In-Memory pro Function-Instanz)
 * ------------------------------------------------------------------ */

const RATE_FENSTER_MS = 5 * 60 * 1000;
const RATE_MAX_GESAMT = 200;
const RATE_MAX_SCHREIBEND = 40;
const rateMap = new Map<string, { gesamt: number; schreibend: number; reset: number }>();

const pruefeRateLimit = (userId: string, istSchreibend: boolean): boolean => {
  const jetzt = Date.now();
  let eintrag = rateMap.get(userId);
  if (!eintrag || jetzt > eintrag.reset) {
    eintrag = { gesamt: 0, schreibend: 0, reset: jetzt + RATE_FENSTER_MS };
    rateMap.set(userId, eintrag);
  }
  eintrag.gesamt += 1;
  if (istSchreibend) eintrag.schreibend += 1;
  if (rateMap.size > 5000) rateMap.clear();
  return (
    eintrag.gesamt <= RATE_MAX_GESAMT && (!istSchreibend || eintrag.schreibend <= RATE_MAX_SCHREIBEND)
  );
};

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

const mapEvent = (doc: ZeitEventDoc): ZeitEvent => ({
  id: doc.$id,
  mitarbeiterId: doc.mitarbeiterId,
  typ: doc.typ as ZeitEventTyp,
  zeitpunkt: doc.zeitpunkt,
  datum: doc.datum,
  quelle: doc.quelle as ZeitQuelle,
  erfasstVonUserId: doc.erfasstVonUserId,
  erfasstVonName: doc.erfasstVonName,
  erfasstAm: doc.erfasstAm,
  ...(doc.bezugEventId ? { bezugEventId: doc.bezugEventId } : {}),
  ...(doc.begruendung ? { begruendung: doc.begruendung } : {}),
  ...(doc.notiz ? { notiz: doc.notiz } : {}),
});

/**
 * Baut einen ZeitMitarbeiter aus dem `schicht_mitarbeiter`-Dokument.
 *
 * Name, Farbe und Position stecken im JSON-Blob `data`. Der wird defensiv
 * gelesen: ein kaputter Blob darf nicht das ganze Zeiterfassungs-Tool
 * lahmlegen — dann fehlt eben der Anzeigename, die Stempel bleiben zuordenbar.
 */
const mapMitarbeiter = (doc: MitarbeiterDoc): ZeitMitarbeiter => {
  let daten: Record<string, unknown> = {};
  try {
    if (typeof doc.data === 'string' && doc.data) {
      const geparst = JSON.parse(doc.data);
      if (geparst && typeof geparst === 'object') daten = geparst as Record<string, unknown>;
    }
  } catch {
    // Bewusst ohne Klartext-Ausgabe: hier stünden Personendaten im Log.
    console.error('zeiterfassung: data-Blob eines Mitarbeiters nicht lesbar', doc.$id);
  }

  const text = (feld: string): string => (typeof daten[feld] === 'string' ? (daten[feld] as string) : '');
  const vorname = text('vorname');
  const nachname = text('nachname');
  const position = text('position');
  const maxStunden = typeof daten.maxStundenProWoche === 'number' ? daten.maxStundenProWoche : 40;

  return {
    id: doc.$id,
    vorname,
    nachname,
    name: `${vorname} ${nachname}`.trim() || doc.$id,
    ...(position ? { position } : {}),
    farbe: text('farbe') || '#64748b',
    istAktiv: doc.istAktiv !== false,
    maxStundenProWoche: maxStunden,
    ...(doc.userId ? { userId: doc.userId } : {}),
  };
};

/* ------------------------------------------------------------------ *
 * Datenzugriff
 * ------------------------------------------------------------------ */

/** Alle Events eines Mitarbeiters an einem lokalen Datum (Index idx_ma_datum). */
const ladeTagesEvents = async (
  databases: Databases,
  dbId: string,
  mitarbeiterId: string,
  datum: string
): Promise<ZeitEvent[]> => {
  const res = await databases.listDocuments<ZeitEventDoc>(dbId, ZEIT_EVENTS_COLLECTION_ID, [
    Query.equal('mitarbeiterId', mitarbeiterId),
    Query.equal('datum', datum),
    Query.limit(PAGE_SIZE),
  ]);
  return res.documents.map(mapEvent);
};

/** Lokales Datum des Vortags zu einem lokalen Datum (YYYY-MM-DD). */
const vortagVon = (datum: string): string => {
  const [j, m, t] = datum.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Ermittelt den SCHICHTTAG, zu dem ein Stempel gehört — und die Kette dieses Tages.
 *
 * Der Unterschied zum Kalendertag ist der ganze Punkt: Wer um 22:00 kommt und um
 * 00:30 geht, erzeugt sonst zwei halbe Vorgänge an zwei Daten. Die Auswertung
 * filtert nach `datum` und fände an beiden Tagen nur einen einzelnen Stempel —
 * Ergebnis wären null bezahlte Minuten und zwei Fehlermeldungen pro Schicht.
 *
 * Regel: Läuft am Vortag noch eine offene Kette (jemand ist eingestempelt oder in
 * Pause) und ist sie jünger als 24 Stunden, gehört der neue Stempel zu diesem
 * Vortag. Sonst beginnt mit dem heutigen Kalendertag eine neue Schicht.
 *
 * Die 24-Stunden-Grenze verhindert, dass ein vergessener Feierabend von letzter
 * Woche noch Stempel an sich zieht — der Fall ist ein Nachtrag, kein Weiterlaufen.
 */
const ermittleSchichttag = async (
  databases: Databases,
  dbId: string,
  mitarbeiterId: string,
  jetztIso: string
): Promise<{ datum: string; events: ZeitEvent[]; status: StempelStatus }> => {
  const heute = lokalesDatum(jetztIso);
  const heutigeEvents = await ladeTagesEvents(databases, dbId, mitarbeiterId, heute);
  const heutigerStatus = ermittleStatus(heutigeEvents);

  // Heute schon eine laufende Kette → eindeutig, kein Blick zurück nötig.
  if (heutigerStatus !== 'abwesend') {
    return { datum: heute, events: heutigeEvents, status: heutigerStatus };
  }

  const vortag = vortagVon(heute);
  const vortagsEvents = await ladeTagesEvents(databases, dbId, mitarbeiterId, vortag);
  const vortagsStatus = ermittleStatus(vortagsEvents);

  if (vortagsStatus !== 'abwesend') {
    const wirksam = wirksameEvents(vortagsEvents);
    const letzter = wirksam[wirksam.length - 1];
    const offenSeitMinuten = letzter
      ? (new Date(jetztIso).getTime() - new Date(letzter.zeitpunkt).getTime()) / 60000
      : Infinity;
    if (offenSeitMinuten <= 24 * 60) {
      return { datum: vortag, events: vortagsEvents, status: vortagsStatus };
    }
  }

  // Heute ist niemand eingestempelt und der Vortag ist abgeschlossen (oder zu alt):
  // ein neuer Stempel eröffnet den heutigen Schichttag.
  return { datum: heute, events: heutigeEvents, status: heutigerStatus };
};

/**
 * Events eines Zeitraums, cursor-paginiert.
 *
 * Immer mit Datumsgrenzen und Limit — ein "alles laden" wächst mit jedem
 * Arbeitstag und läuft irgendwann in den Function-Timeout.
 */
const ladeZeitraumEvents = async (
  databases: Databases,
  dbId: string,
  von: string,
  bis: string,
  mitarbeiterId?: string
): Promise<ZeitEvent[]> => {
  const alle: ZeitEvent[] = [];
  let cursor: string | null = null;

  while (alle.length < MAX_EVENTS) {
    const queries = [
      Query.greaterThanEqual('datum', von),
      Query.lessThanEqual('datum', bis),
      Query.orderAsc('$id'),
      Query.limit(PAGE_SIZE),
    ];
    if (mitarbeiterId) queries.unshift(Query.equal('mitarbeiterId', mitarbeiterId));
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments<ZeitEventDoc>(
      dbId,
      ZEIT_EVENTS_COLLECTION_ID,
      queries
    );
    alle.push(...res.documents.map(mapEvent));
    if (res.documents.length < PAGE_SIZE) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }

  return alle;
};

/** Alle aktiven Mitarbeiter aus `schicht_mitarbeiter`. */
const ladeAktiveMitarbeiter = async (
  databases: Databases,
  dbId: string
): Promise<ZeitMitarbeiter[]> => {
  const alle: ZeitMitarbeiter[] = [];
  let cursor: string | null = null;

  for (;;) {
    const queries = [
      Query.equal('istAktiv', true),
      Query.orderAsc('$id'),
      Query.limit(PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments<MitarbeiterDoc>(
      dbId,
      SCHICHT_MITARBEITER_COLLECTION_ID,
      queries
    );
    alle.push(...res.documents.map(mapMitarbeiter));
    if (res.documents.length < PAGE_SIZE) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }

  return alle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
};

/** Der Mitarbeiter, dem das aufrufende Portal-Konto zugeordnet ist (oder null). */
const findeEigenenMitarbeiter = async (
  databases: Databases,
  dbId: string,
  userId: string
): Promise<ZeitMitarbeiter | null> => {
  const res = await databases.listDocuments<MitarbeiterDoc>(
    dbId,
    SCHICHT_MITARBEITER_COLLECTION_ID,
    [Query.equal('userId', userId), Query.limit(1)]
  );
  if (res.documents.length === 0) return null;
  return mapMitarbeiter(res.documents[0]);
};

const ladeMitarbeiter = async (
  databases: Databases,
  dbId: string,
  mitarbeiterId: string
): Promise<ZeitMitarbeiter | null> => {
  try {
    const doc = await databases.getDocument<MitarbeiterDoc>(
      dbId,
      SCHICHT_MITARBEITER_COLLECTION_ID,
      mitarbeiterId
    );
    return mapMitarbeiter(doc);
  } catch {
    return null;
  }
};

/**
 * Legt ein Event an.
 *
 * Die Dokument-Permissions sind bewusst leer: bei documentSecurity=false gilt
 * ohnehin nur die Collection-Regel (ebenfalls leer), und ein versehentlich
 * gesetztes read(users) würde die Zeiten aller Kollegen freigeben.
 */
const schreibeEvent = async (
  databases: Databases,
  dbId: string,
  daten: Omit<ZeitEvent, 'id'>
): Promise<ZeitEvent> => {
  const doc = await databases.createDocument<ZeitEventDoc>(
    dbId,
    ZEIT_EVENTS_COLLECTION_ID,
    ID.unique(),
    {
      mitarbeiterId: daten.mitarbeiterId,
      typ: daten.typ,
      zeitpunkt: daten.zeitpunkt,
      datum: daten.datum,
      quelle: daten.quelle,
      erfasstVonUserId: daten.erfasstVonUserId,
      erfasstVonName: daten.erfasstVonName,
      erfasstAm: daten.erfasstAm,
      ...(daten.bezugEventId ? { bezugEventId: daten.bezugEventId } : {}),
      ...(daten.begruendung ? { begruendung: daten.begruendung } : {}),
      ...(daten.notiz ? { notiz: daten.notiz } : {}),
    },
    []
  );
  return mapEvent(doc);
};

/* ------------------------------------------------------------------ *
 * Request-Body
 * ------------------------------------------------------------------ */

interface RequestBody {
  action?: string;
  sandbox?: boolean;
  typ?: string;
  mitarbeiterId?: string;
  notiz?: string;
  von?: string;
  bis?: string;
  zeitpunkt?: string;
  begruendung?: string;
  eventId?: string;
  userId?: string;
}

/** Aktionen, die schreiben — für das schärfere Rate-Limit. */
const SCHREIBENDE_AKTIONEN = new Set(['stempeln', 'nachtragen', 'stornieren', 'zuordnen']);

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Methode nicht erlaubt' });

  const config = getConfig();
  if (!config) {
    console.error('zeiterfassung: Appwrite-Konfiguration fehlt (API_KEY / ENDPOINT / PROJECT_ID)');
    return jsonResponse(500, { error: 'Konfigurationsfehler' });
  }
  const { apiKey, endpoint, projectId } = config;

  let body: RequestBody = {};
  try {
    body = JSON.parse(event.body || '{}') as RequestBody;
  } catch {
    return jsonResponse(400, { error: 'Ungültiger Request-Body' });
  }

  // --- Aufrufer identifizieren: dieser Client kann NUR das, was der Nutzer darf.
  const jwt = event.headers['x-appwrite-jwt'];
  if (!jwt) return jsonResponse(401, { error: 'Nicht angemeldet (kein JWT)' });

  let me: Models.User<Models.Preferences>;
  try {
    const jwtClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    me = await new Account(jwtClient).get();
  } catch {
    return jsonResponse(401, { error: 'Nicht angemeldet (Sitzung ungültig oder abgelaufen)' });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!pruefeRateLimit(me.$id, SCHREIBENDE_AKTIONEN.has(action))) {
    return jsonResponse(429, { error: 'Zu viele Anfragen. Bitte einen Moment warten.' });
  }

  const labels = Array.isArray(me.labels) ? me.labels : [];
  const istAdmin = labels.includes('admin');
  const istLeitung = LEITUNGS_LABELS.some((l) => labels.includes(l));

  // --- Ab hier ausschließlich mit dem Server-Key: die Collection hat keine
  //     Client-Rechte, ein JWT-Client käme an kein einziges Dokument heran.
  const dbId = datenbank(body.sandbox === true);
  const keyClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(keyClient);

  try {
    switch (action) {
      /* ------------------------------------------------------ status */
      case 'status': {
        const jetzt = new Date().toISOString();
        const mitarbeiter = await findeEigenenMitarbeiter(databases, dbId, me.$id);
        // Schichttag statt Kalendertag: wer nachts über 00:00 hinaus arbeitet,
        // soll seine laufende Zeit weitersehen und nicht auf null zurückfallen.
        const schicht = mitarbeiter
          ? await ermittleSchichttag(databases, dbId, mitarbeiter.id, jetzt)
          : { datum: lokalesDatum(jetzt), events: [], status: 'abwesend' as StempelStatus };
        return jsonResponse(200, {
          mitarbeiter,
          istLeitung,
          status: schicht.status,
          heute: schicht.events,
          datum: schicht.datum,
          serverZeit: jetzt,
        });
      }

      /* ---------------------------------------------------- stempeln */
      case 'stempeln': {
        const typ = body.typ as ZeitEventTyp;
        if (!STEMPEL_TYPEN.includes(typ)) {
          return jsonResponse(400, { error: 'Unbekannte Stempelart' });
        }

        // Fremderfassung ist der Leitung vorbehalten.
        let ziel: ZeitMitarbeiter | null;
        if (body.mitarbeiterId) {
          if (!istLeitung) {
            return jsonResponse(403, {
              error: 'Für andere Mitarbeiter darf nur die Zeitleitung stempeln',
            });
          }
          ziel = await ladeMitarbeiter(databases, dbId, body.mitarbeiterId);
          if (!ziel) return jsonResponse(404, { error: 'Mitarbeiter nicht gefunden' });
        } else {
          ziel = await findeEigenenMitarbeiter(databases, dbId, me.$id);
          if (!ziel) {
            return jsonResponse(403, {
              error:
                'Ihrem Konto ist kein Mitarbeiter zugeordnet. Die Zeitleitung muss die Zuordnung einmalig herstellen.',
            });
          }
        }

        // Der fachliche Zeitpunkt ist IMMER die Serverzeit — nie ein Wert aus dem Body.
        const jetzt = new Date().toISOString();

        // Der Stempel wird dem SCHICHTTAG zugeordnet, nicht dem Kalendertag:
        // ein Feierabend um 00:30 gehört zur Schicht, die um 22:00 begonnen hat.
        // Sonst zerfiele jede Nachtschicht in zwei unvollständige Halbtage.
        const { datum, events: tagesEvents, status } = await ermittleSchichttag(
          databases,
          dbId,
          ziel.id,
          jetzt
        );
        if (!erlaubteStempel(status).includes(typ)) {
          return jsonResponse(409, {
            error: `„${STEMPEL_BEZEICHNUNG[typ]}" ist nicht möglich — der Stand um ${lokaleUhrzeit(jetzt)} ist „${STATUS_BEZEICHNUNG[status]}". Möglich wäre: ${erlaubteStempel(status)
              .map((t) => STEMPEL_BEZEICHNUNG[t])
              .join(' oder ')}.`,
          });
        }

        const notiz = kuerze(body.notiz, MAX_TEXT);
        const neu = await schreibeEvent(databases, dbId, {
          mitarbeiterId: ziel.id,
          typ,
          zeitpunkt: jetzt,
          datum,
          quelle: 'web',
          erfasstVonUserId: me.$id,
          erfasstVonName: me.name || me.$id,
          erfasstAm: jetzt,
          ...(notiz ? { notiz } : {}),
        });

        return jsonResponse(200, {
          event: neu,
          status: ermittleStatus([...tagesEvents, neu]),
        });
      }

      /* ---------------------------------------------------- zeitraum */
      case 'zeitraum': {
        const { von, bis } = body;
        if (!istGueltigesDatum(von) || !istGueltigesDatum(bis)) {
          return jsonResponse(400, { error: 'Ungültiger Zeitraum (Format YYYY-MM-DD)' });
        }
        if (von > bis) {
          return jsonResponse(400, { error: 'Das Startdatum liegt nach dem Enddatum' });
        }
        if (tageImZeitraum(von, bis) > MAX_ZEITRAUM_TAGE) {
          return jsonResponse(400, {
            error: `Der Zeitraum darf höchstens ${MAX_ZEITRAUM_TAGE} Tage umfassen`,
          });
        }

        if (!istLeitung) {
          // Ein normaler Nutzer sieht ausschließlich seine eigenen Zeiten;
          // ein mitgeschicktes mitarbeiterId wird nicht beachtet.
          const eigener = await findeEigenenMitarbeiter(databases, dbId, me.$id);
          if (!eigener) return jsonResponse(200, { events: [], mitarbeiter: [] });
          const events = await ladeZeitraumEvents(databases, dbId, von, bis, eigener.id);
          return jsonResponse(200, { events, mitarbeiter: [eigener] });
        }

        const filter = body.mitarbeiterId || undefined;
        const events = await ladeZeitraumEvents(databases, dbId, von, bis, filter);
        const alle = await ladeAktiveMitarbeiter(databases, dbId);
        const mitarbeiter = filter ? alle.filter((m) => m.id === filter) : alle;
        return jsonResponse(200, { events, mitarbeiter });
      }

      /* -------------------------------------------------- nachtragen */
      case 'nachtragen': {
        if (!istLeitung) {
          return jsonResponse(403, { error: 'Nachträge darf nur die Zeitleitung erfassen' });
        }

        const typ = body.typ as ZeitEventTyp;
        if (!STEMPEL_TYPEN.includes(typ)) {
          return jsonResponse(400, { error: 'Unbekannte Stempelart' });
        }
        if (!body.mitarbeiterId) {
          return jsonResponse(400, { error: 'Mitarbeiter fehlt' });
        }

        // Ohne Begründung ist ein Nachtrag als Nachweis wertlos.
        const begruendung = kuerze(body.begruendung, MAX_TEXT);
        if (!begruendung) {
          return jsonResponse(400, { error: 'Eine Begründung ist für den Nachtrag Pflicht' });
        }

        const zeitpunktRoh = typeof body.zeitpunkt === 'string' ? body.zeitpunkt : '';
        const zeitpunktDatum = new Date(zeitpunktRoh);
        if (!zeitpunktRoh || Number.isNaN(zeitpunktDatum.getTime())) {
          return jsonResponse(400, { error: 'Ungültiger Zeitpunkt' });
        }

        const jetzt = new Date().toISOString();
        if (zeitpunktDatum.getTime() > Date.now()) {
          return jsonResponse(400, { error: 'Ein Nachtrag darf nicht in der Zukunft liegen' });
        }

        const ziel = await ladeMitarbeiter(databases, dbId, body.mitarbeiterId);
        if (!ziel) return jsonResponse(404, { error: 'Mitarbeiter nicht gefunden' });

        const nachtragNotiz = kuerze(body.notiz, MAX_TEXT);

        // Normalisiert auf UTC-ISO. Wichtig, weil die Kette nach `zeitpunkt`
        // sortiert wird: ein Wert mit Offset-Schreibweise ("+02:00") sortiert
        // gegen einen Z-Wert falsch und würde die Reihenfolge verdrehen.
        const nachtragIso = zeitpunktDatum.toISOString();

        // Auch ein Nachtrag gehört zum Schichttag, nicht zum Kalendertag: wird
        // ein vergessener Feierabend um 06:00 nachgetragen, muss er an die
        // Schicht andocken, die am Vorabend begonnen hat.
        const { datum: nachtragDatum } = await ermittleSchichttag(
          databases,
          dbId,
          ziel.id,
          nachtragIso
        );

        const neu = await schreibeEvent(databases, dbId, {
          mitarbeiterId: ziel.id,
          typ,
          zeitpunkt: nachtragIso,
          datum: nachtragDatum,
          quelle: 'nachtrag',
          erfasstVonUserId: me.$id,
          erfasstVonName: me.name || me.$id,
          erfasstAm: jetzt,
          begruendung,
          ...(nachtragNotiz ? { notiz: nachtragNotiz } : {}),
        });

        return jsonResponse(200, { event: neu });
      }

      /* -------------------------------------------------- stornieren */
      case 'stornieren': {
        if (!istLeitung) {
          return jsonResponse(403, { error: 'Stornieren darf nur die Zeitleitung' });
        }
        if (!body.eventId) return jsonResponse(400, { error: 'eventId fehlt' });

        const begruendung = kuerze(body.begruendung, MAX_TEXT);
        if (!begruendung) {
          return jsonResponse(400, { error: 'Eine Begründung ist für das Storno Pflicht' });
        }

        let original: ZeitEventDoc;
        try {
          original = await databases.getDocument<ZeitEventDoc>(
            dbId,
            ZEIT_EVENTS_COLLECTION_ID,
            body.eventId
          );
        } catch {
          return jsonResponse(404, { error: 'Stempel nicht gefunden' });
        }

        if (original.typ === 'storno') {
          return jsonResponse(400, { error: 'Ein Storno kann nicht storniert werden' });
        }

        const vorhandene = await databases.listDocuments<ZeitEventDoc>(
          dbId,
          ZEIT_EVENTS_COLLECTION_ID,
          [
            Query.equal('mitarbeiterId', original.mitarbeiterId),
            Query.equal('datum', original.datum),
            Query.equal('typ', 'storno'),
            Query.limit(PAGE_SIZE),
          ]
        );
        if (vorhandene.documents.some((d) => d.bezugEventId === original.$id)) {
          return jsonResponse(409, { error: 'Dieser Stempel ist bereits storniert' });
        }

        // Das Original bleibt unangetastet — die Aufhebung ist ein neues Event.
        const jetzt = new Date().toISOString();
        const storno = await schreibeEvent(databases, dbId, {
          mitarbeiterId: original.mitarbeiterId,
          typ: 'storno',
          zeitpunkt: jetzt,
          datum: original.datum,
          quelle: 'nachtrag',
          erfasstVonUserId: me.$id,
          erfasstVonName: me.name || me.$id,
          erfasstAm: jetzt,
          bezugEventId: original.$id,
          begruendung,
        });

        return jsonResponse(200, { event: storno });
      }

      /* ------------------------------------------------- mitarbeiter */
      case 'mitarbeiter': {
        if (!istLeitung) {
          return jsonResponse(403, { error: 'Nicht berechtigt' });
        }
        const mitarbeiter = await ladeAktiveMitarbeiter(databases, dbId);
        return jsonResponse(200, { mitarbeiter });
      }

      /* ----------------------------------------------------- zuordnen */
      case 'zuordnen': {
        // Bewusst enger als „Leitung": wer Konten mit Personalakten verknüpft,
        // entscheidet, wessen Zeiten wer sieht. Das ist Admin-Sache.
        if (!istAdmin) {
          return jsonResponse(403, { error: 'Zuordnungen darf nur ein Administrator ändern' });
        }
        if (!body.mitarbeiterId) return jsonResponse(400, { error: 'mitarbeiterId fehlt' });
        if (typeof body.userId !== 'string') {
          return jsonResponse(400, { error: 'userId fehlt' });
        }

        const ziel = await ladeMitarbeiter(databases, dbId, body.mitarbeiterId);
        if (!ziel) return jsonResponse(404, { error: 'Mitarbeiter nicht gefunden' });

        const neueUserId = body.userId.trim();
        if (neueUserId) {
          // Ein Konto darf nur zu einem Mitarbeiter gehören — sonst wäre nicht
          // mehr entscheidbar, wessen Zeiten beim Stempeln entstehen.
          const belegt = await databases.listDocuments<MitarbeiterDoc>(
            dbId,
            SCHICHT_MITARBEITER_COLLECTION_ID,
            [Query.equal('userId', neueUserId), Query.limit(2)]
          );
          if (belegt.documents.some((d) => d.$id !== body.mitarbeiterId)) {
            return jsonResponse(409, {
              error: 'Dieses Portal-Konto ist bereits einem anderen Mitarbeiter zugeordnet',
            });
          }
        }

        // Nur `userId` schreiben: der `data`-Blob und `istAktiv` bleiben
        // unberührt, damit die Schichtplanung nichts verliert.
        await databases.updateDocument<MitarbeiterDoc>(
          dbId,
          SCHICHT_MITARBEITER_COLLECTION_ID,
          body.mitarbeiterId,
          { userId: neueUserId || null }
        );

        return jsonResponse(200, { ok: true });
      }

      default:
        return jsonResponse(400, { error: 'Unbekannte Aktion' });
    }
  } catch (error) {
    // Keine Namen, keine Zeiten, keine IDs von Personen ins Log.
    const e = error as { code?: number; message?: string };
    console.error('zeiterfassung: Aktion fehlgeschlagen', action, e.code ?? '', e.message ?? '');
    if (e.code === 404) return jsonResponse(404, { error: 'Datensatz nicht gefunden' });
    if (e.code === 409) return jsonResponse(409, { error: 'Konflikt beim Speichern' });
    return jsonResponse(500, { error: 'Aktion fehlgeschlagen' });
  }
};
