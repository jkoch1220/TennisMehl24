/**
 * ============================================================================
 * MOCK-DATENBANK-MODUS (Sandbox) — zentrale Wahrheitsquelle
 * ============================================================================
 *
 * Ein Admin kann das Portal zur Laufzeit auf eine vollständige Kopie der
 * Produktionsdaten umschalten (`tennismehl24_db_mock`). Dort darf alles kaputt
 * gespielt werden: es gehen keine E-Mails an echte Empfänger und kein
 * Schreibzugriff berührt die Produktionsdaten.
 *
 * ALLE Module fragen den Modus ausschließlich über dieses Modul ab. Es gibt
 * bewusst kein zweites `import.meta.env`-Flag irgendwo in der Codebasis —
 * verstreute Env-Zugriffe haben hier schon zu Dev/Build-Abweichungen geführt.
 *
 * ---------------------------------------------------------------------------
 * SICHERHEITSREGELN, die in diesem Modul verankert sind:
 *
 * 1. localStorage, nicht Appwrite.
 *    Der Schalter gilt PRO BROWSER. Läge er in einer geteilten Collection
 *    (z.B. stammdaten), würde ein Admin unbemerkt alle Kollegen in die Sandbox
 *    versetzen — die würden dann in guter Absicht auf Mock-Daten arbeiten und
 *    ihre echte Arbeit verlieren.
 *
 * 2. Ablauf nach 12 Stunden.
 *    Persistiert wird `{ aktiv, aktiviertAm, ablaufAm }`, nicht nur ein Boolean.
 *    Ein vergessener Schalter ist sonst genau die Falle, gegen die dieses
 *    Feature gebaut wurde: man arbeitet Tage später weiter und wundert sich,
 *    warum der Kunde die Rechnung nie bekommen hat.
 *
 * 3. Der Audit-Eintrag geht in die PRODUKTIONS-Datenbank.
 *    Sonst verschwindet die Spur beim nächsten `npm run mock:reset`. Dafür hält
 *    dieses Modul einen eigenen, NICHT proxierten Appwrite-Client (siehe unten).
 *
 * 4. Admin-Prüfung sitzt in der Umschaltfunktion, nicht nur im UI.
 *    Ausgegraute Buttons sind Komfort, keine Sicherheit.
 * ---------------------------------------------------------------------------
 */

import { Client, Databases, ID } from 'appwrite';
import {
  APPWRITE_ENDPOINT,
  PROJECT_ID,
  PRODUKTIONS_DATABASE_ID,
  MOCK_DATABASE_ID,
  MOCK_BUCKET_PRAEFIX,
} from './appwriteEnv';

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'tm_mock_modus_v1';

/** Maximale Laufzeit einer Sandbox-Sitzung. Danach schaltet sie sich selbst ab. */
export const MOCK_LAUFZEIT_STUNDEN = 12;

export interface MockModusZustand {
  aktiv: boolean;
  /** ISO-Zeitstempel der Aktivierung */
  aktiviertAm: string;
  /** ISO-Zeitstempel, ab dem der Modus automatisch verfällt */
  ablaufAm: string;
  /** Name des Admins, der eingeschaltet hat — nur für die Anzeige im Balken */
  aktiviertVon: string;
}

const AUS: MockModusZustand = { aktiv: false, aktiviertAm: '', ablaufAm: '', aktiviertVon: '' };

/**
 * In-Memory-Spiegel des Zustands.
 *
 * `istMockModusAktiv()` läuft bei JEDEM Datenbankzugriff durch den Proxy. Ein
 * localStorage-Zugriff pro Query wäre spürbar. Der Spiegel wird beim Modulstart
 * einmal gefüllt und danach nur noch bei echten Änderungen aktualisiert
 * (Umschalten in diesem Tab, `storage`-Event aus einem anderen Tab, Ablauf).
 */
let zustand: MockModusZustand = ladeAusStorage();

function ladeAusStorage(): MockModusZustand {
  try {
    const roh = localStorage.getItem(STORAGE_KEY);
    if (!roh) return AUS;
    const geparst = JSON.parse(roh) as Partial<MockModusZustand>;
    if (geparst.aktiv !== true) return AUS;
    // Ein Zustand ohne Ablaufdatum stammt aus einer kaputten/manipulierten
    // Speicherung — sicherheitshalber als "aus" behandeln.
    if (typeof geparst.ablaufAm !== 'string' || geparst.ablaufAm === '') return AUS;
    return {
      aktiv: true,
      aktiviertAm: geparst.aktiviertAm ?? '',
      ablaufAm: geparst.ablaufAm,
      aktiviertVon: geparst.aktiviertVon ?? '',
    };
  } catch {
    // localStorage nicht verfügbar oder JSON kaputt → Produktionsbetrieb.
    // Das ist konsistent: UI und Datenschicht lesen dieselbe Funktion, es kann
    // also nicht passieren, dass der Balken "Sandbox" zeigt und trotzdem nach
    // Produktion geschrieben wird.
    return AUS;
  }
}

function schreibeInStorage(neu: MockModusZustand): void {
  try {
    if (neu.aktiv) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(neu));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error('❌ Mock-Modus konnte nicht gespeichert werden:', error);
  }
}

// ---------------------------------------------------------------------------
// Abfrage
// ---------------------------------------------------------------------------

/**
 * Ist die Sandbox aktiv? Prüft bei jedem Aufruf den Ablauf mit.
 *
 * Bewusst synchron und ohne I/O — diese Funktion sitzt im heißesten Pfad der
 * Anwendung (jeder Appwrite-Call, jedes Render des Warnbalkens).
 */
export const istMockModusAktiv = (): boolean => {
  if (!zustand.aktiv) return false;
  if (Date.now() >= new Date(zustand.ablaufAm).getTime()) {
    // Abgelaufen: aufräumen und Abonnenten informieren, damit das UI den
    // Balken entfernt und der Nutzer merkt, dass er wieder auf Echtdaten ist.
    console.warn('⏰ Mock-Modus abgelaufen — zurück auf Echtdaten.');
    zustand = AUS;
    schreibeInStorage(AUS);
    benachrichtige();
    return false;
  }
  return true;
};

/** Vollständiger Zustand für die Anzeige (Restlaufzeit, wer eingeschaltet hat). */
export const getMockModusZustand = (): MockModusZustand => {
  istMockModusAktiv(); // erzwingt die Ablaufprüfung
  return { ...zustand };
};

/** Verbleibende Millisekunden bis zum automatischen Ablauf (0 wenn inaktiv). */
export const getRestlaufzeitMs = (): number => {
  if (!istMockModusAktiv()) return 0;
  return Math.max(0, new Date(zustand.ablaufAm).getTime() - Date.now());
};

/**
 * Die Datenbank-ID für ALLE Appwrite-Zugriffe.
 * Der Proxy in `appwrite.ts` ruft das bei jedem Call auf.
 */
export const getDatabaseId = (): string =>
  istMockModusAktiv() ? MOCK_DATABASE_ID : PRODUKTIONS_DATABASE_ID;

/**
 * Bucket-Mapping für den Mock-Modus.
 *
 * Storage ist in Appwrite projektweit und hängt NICHT an einer Datenbank. Ohne
 * dieses Mapping würden PDFs aus der Sandbox in den Produktions-Buckets landen —
 * ein echtes Schreib-Leck, das die zweite Datenbank allein nicht verhindert.
 *
 * Die Mock-Buckets legt `npm run mock:setup` an.
 */
export const getBucketId = (basisBucketId: string): string => {
  if (!istMockModusAktiv()) return basisBucketId;
  if (basisBucketId.startsWith(MOCK_BUCKET_PRAEFIX)) return basisBucketId; // schon gemappt
  return `${MOCK_BUCKET_PRAEFIX}${basisBucketId}`;
};

/**
 * Trennt einen localStorage-Schlüssel zwischen Sandbox und Echtbetrieb.
 *
 * Nötig, weil die Kopie die Dokument-IDs erhält: ein Entwurf, der in der
 * Sandbox unter `…_<projektId>_angebot` abgelegt wurde, hätte sonst exakt
 * denselben Schlüssel wie der echte Entwurf desselben Projekts. Nach dem
 * Zurückschalten würde er als echter Entwurf geladen — und Sandbox-Preise
 * könnten in eine echte Rechnung wandern.
 *
 * Nur für Schlüssel nötig, die fachliche Daten halten. Für Ansichtszustände
 * (Zoom, zuletzt geöffnet) ist die Trennung überflüssig.
 */
export const mockLocalStorageKey = (schluessel: string): string =>
  istMockModusAktiv() ? `mock__${schluessel}` : schluessel;

/**
 * Realtime-Kanal für eine Collection — ersetzt die früher hartkodierten
 * Template-Strings `databases.${DATABASE_ID}.collections.X.documents`.
 *
 * Ohne diese Funktion würde die Sandbox weiterhin Live-Events aus der
 * PRODUKTIONS-Datenbank empfangen und anzeigen.
 */
export const realtimeKanal = (collectionId: string, dokumentId?: string): string => {
  const basis = `databases.${getDatabaseId()}.collections.${collectionId}.documents`;
  return dokumentId ? `${basis}.${dokumentId}` : basis;
};

// ---------------------------------------------------------------------------
// Abonnenten (UI)
// ---------------------------------------------------------------------------

type Abonnent = (aktiv: boolean) => void;
const abonnenten = new Set<Abonnent>();

function benachrichtige(): void {
  const aktiv = zustand.aktiv;
  abonnenten.forEach((cb) => {
    try {
      cb(aktiv);
    } catch (error) {
      console.warn('⚠️ Mock-Modus-Abonnent hat geworfen:', error);
    }
  });
}

/** Für UI-Komponenten. Gibt die Abmelde-Funktion zurück. */
export const onMockModusChange = (cb: Abonnent): (() => void) => {
  abonnenten.add(cb);
  return () => abonnenten.delete(cb);
};

// Ein zweiter Tab desselben Browsers teilt sich den localStorage. Ohne diesen
// Listener würde ein Tab weiterlaufen, während der andere schon umgeschaltet hat.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const vorher = zustand.aktiv;
    zustand = ladeAusStorage();
    if (zustand.aktiv !== vorher) {
      // Harter Reload: alle bereits geladenen Daten im Speicher stammen aus der
      // jeweils anderen Datenbank und wären ab jetzt falsch.
      window.location.reload();
    }
  });
}

// ---------------------------------------------------------------------------
// Admin-Kontext (vom AuthContext registriert — gleiches Muster wie auditService)
// ---------------------------------------------------------------------------

interface MockModusUser {
  $id: string;
  name: string;
  istAdmin: boolean;
}

let aktuellerUser: MockModusUser | null = null;

/** Wird vom AuthContext bei jedem Login/Logout aufgerufen. */
export const setMockModusUser = (user: MockModusUser | null): void => {
  const warEingeloggt = aktuellerUser !== null;
  aktuellerUser = user;

  // Regel: Der Modus überlebt den Logout nicht. Wer sich abmeldet, hinterlässt
  // keine scharfe Sandbox für den nächsten Nutzer an diesem Rechner.
  //
  // Entscheidend ist der ÜBERGANG eingeloggt → abgemeldet, nicht ein blosses
  // `user === null`. Beim Seitenstart ist der User immer erst null, bis der
  // Session-Check durch ist — und das Einschalten der Sandbox lädt die Seite
  // absichtlich neu. Ohne diese Unterscheidung würde sich der Modus bei jedem
  // Einschalten sofort selbst wieder abschalten.
  if (warEingeloggt && user === null && zustand.aktiv) {
    console.warn('🔒 Logout — Mock-Modus wird deaktiviert.');
    zustand = AUS;
    schreibeInStorage(AUS);
    benachrichtige();
  }
};

/** Darf der aktuelle Nutzer den Modus umschalten? */
export const darfMockModusSchalten = (): boolean => aktuellerUser?.istAdmin === true;

// ---------------------------------------------------------------------------
// Audit-Log — schreibt IMMER in die Produktions-Datenbank
// ---------------------------------------------------------------------------

/**
 * Eigener, NICHT proxierter Client.
 *
 * `databases` aus `config/appwrite.ts` läuft durch den Mock-Proxy und würde den
 * Audit-Eintrag beim Einschalten in die Mock-DB schreiben — wo er beim nächsten
 * Reset verschwindet. Die Spur, wer wann eine Sandbox aufgemacht hat, muss aber
 * erhalten bleiben.
 *
 * Die Appwrite-Session steckt im Cookie bzw. im localStorage-Fallback und gilt
 * clientweit, dieser Client ist also derselbe angemeldete Nutzer.
 *
 * ⚠️ Dieser Client ist ausschließlich für den Audit-Eintrag da. Er darf nirgends
 * sonst importiert werden — er ist per Definition ein Loch in der Isolation.
 */
let produktivClient: Databases | null = null;

function getProduktivDatabases(): Databases {
  if (!produktivClient) {
    const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(PROJECT_ID);
    produktivClient = new Databases(client);
  }
  return produktivClient;
}

const AUDIT_LOG_ID = 'audit_log';

function schreibeAudit(aktion: 'aktiviert' | 'deaktiviert', grund: string): void {
  if (!aktuellerUser) return;
  getProduktivDatabases()
    .createDocument(PRODUKTIONS_DATABASE_ID, AUDIT_LOG_ID, ID.unique(), {
      timestamp: new Date().toISOString(),
      userId: aktuellerUser.$id,
      userName: aktuellerUser.name,
      action: aktion === 'aktiviert' ? 'mock_modus_an' : 'mock_modus_aus',
      entityType: 'mock_modus',
      entityId: MOCK_DATABASE_ID,
      summary:
        aktion === 'aktiviert'
          ? `Mock-Datenbank-Modus eingeschaltet (Ablauf nach ${MOCK_LAUFZEIT_STUNDEN} h)`
          : `Mock-Datenbank-Modus ausgeschaltet (${grund})`,
      changes: '',
    })
    .catch((error: unknown) => {
      console.warn('⚠️ Audit-Eintrag für Mock-Modus fehlgeschlagen:', (error as Error).message);
    });
}

// ---------------------------------------------------------------------------
// Umschalten
// ---------------------------------------------------------------------------

/**
 * Sandbox einschalten.
 *
 * Lädt die Seite anschließend neu: sämtliche bereits geladenen Daten im
 * Speicher stammen aus der Produktions-Datenbank und wären ab jetzt falsch.
 *
 * @throws wenn der aktuelle Nutzer kein Admin ist
 */
export const aktiviereMockModus = (): void => {
  if (!darfMockModusSchalten()) {
    throw new Error('Nur Admins dürfen den Mock-Datenbank-Modus umschalten.');
  }
  const jetzt = Date.now();
  zustand = {
    aktiv: true,
    aktiviertAm: new Date(jetzt).toISOString(),
    ablaufAm: new Date(jetzt + MOCK_LAUFZEIT_STUNDEN * 60 * 60 * 1000).toISOString(),
    aktiviertVon: aktuellerUser?.name ?? '',
  };
  schreibeInStorage(zustand);
  schreibeAudit('aktiviert', '');
  benachrichtige();
  window.location.reload();
};

/**
 * Zurück auf Echtdaten.
 *
 * Die Mock-Daten bleiben in `tennismehl24_db_mock` erhalten und sind beim
 * nächsten Einschalten wieder da. Zum Zurücksetzen: `npm run mock:reset`.
 */
export const deaktiviereMockModus = (): void => {
  if (!darfMockModusSchalten()) {
    throw new Error('Nur Admins dürfen den Mock-Datenbank-Modus umschalten.');
  }
  schreibeAudit('deaktiviert', 'manuell');
  zustand = AUS;
  schreibeInStorage(AUS);
  benachrichtige();
  window.location.reload();
};

// ---------------------------------------------------------------------------
// Fail-closed-Helfer für Pfade, die sich NICHT auf die Sandbox umbiegen lassen
// ---------------------------------------------------------------------------

/**
 * Blockiert eine Aktion, die im Mock-Modus nicht sicher isolierbar ist.
 *
 * Aufrufen in jedem Pfad, der an der Sandbox vorbei nach außen oder in die
 * Produktions-Datenbank wirken würde (Netlify Functions mit hartkodierter DB-ID,
 * schreibende VPS-Backend-Aufrufe, Appwrite-eigener Mailversand).
 *
 * Ein blockiertes Feature ist ein akzeptables Ergebnis. Ein durchgerutschter
 * Schreibzugriff auf Produktivdaten ist es nicht.
 *
 * @throws MockModusBlockiertError wenn die Sandbox aktiv ist
 */
export const blockiereImMockModus = (was: string): void => {
  if (!istMockModusAktiv()) return;
  throw new MockModusBlockiertError(was);
};

export class MockModusBlockiertError extends Error {
  constructor(was: string) {
    super(
      `🧪 Im Mock-Datenbank-Modus gesperrt: ${was}. ` +
        'Dieser Vorgang würde an der Sandbox vorbei auf Produktivdaten oder nach außen wirken. ' +
        'Zum Ausführen zuerst zurück auf Echtdaten schalten.'
    );
    this.name = 'MockModusBlockiertError';
  }
}

export { PRODUKTIONS_DATABASE_ID, MOCK_DATABASE_ID, MOCK_BUCKET_PRAEFIX };
