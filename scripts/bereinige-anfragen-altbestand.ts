/**
 * Einmalige Bereinigung der Collection `anfragen`.
 *
 * Zwei Altlasten werden korrigiert:
 *
 * 1. DUBLETTEN — Bis zur Umstellung auf eine feste Dokument-ID (aus Konto + IMAP-UID
 *    + Datum) konnten zwei parallel laufende `email-sync`-Durchgänge dieselbe E-Mail
 *    doppelt anlegen: Der Notification-Cron stößt den Sync alle 5 Minuten an, der
 *    Button im Portal zusätzlich. Beide prüften gleichzeitig auf Duplikate und
 *    bekamen beide "gibt es noch nicht". Die jüngere Kopie wird auf 'geloescht'
 *    gesetzt — sie bleibt für die Duplikat-Erkennung in der Datenbank, verschwindet
 *    aber aus der Liste. Der ältere Eintrag behält seine Historie.
 *
 * 2. STATUS — Solange die Verarbeitungs-Attribute in der Collection fehlten, lehnte
 *    Appwrite jedes Update an einer Anfrage ab ("Unknown attribute"). Bearbeitete
 *    Anfragen blieben deshalb für immer auf 'neu'. Wo das E-Mail-Protokoll ein
 *    Angebot an den Anfragenden belegt, wird der Status nachgezogen.
 *
 * Vorschau:   npx tsx scripts/bereinige-anfragen-altbestand.ts --dry-run
 * Ausführen:  npx tsx scripts/bereinige-anfragen-altbestand.ts
 *
 * Voraussetzung: scripts/setup-anfragen-verarbeitungsfelder.ts wurde ausgeführt.
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY)');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const ANFRAGEN = 'anfragen';
const PROTOKOLL = 'email_protokoll';

interface Doc {
  $id: string;
  $createdAt: string;
  status: string;
  emailAbsender: string;
  emailDatum: string;
  emailText?: string;
  emailUid?: number;
  emailKonto?: string;
  extrahierteDaten?: string;
  projektId?: string;
  angebotId?: string;
  notizen?: string;
}

async function ladeAlle<T>(collectionId: string, queries: string[] = []): Promise<T[]> {
  const alle: T[] = [];
  let offset = 0;
  for (;;) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(offset),
    ]);
    alle.push(...(res.documents as unknown as T[]));
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return alle;
}

/** Adresse des Anfragenden — aus den extrahierten Daten, sonst der Absender. */
const anfrageAdresse = (doc: Doc): string => {
  try {
    const daten = JSON.parse(doc.extrahierteDaten || '{}');
    if (daten.email) return String(daten.email).toLowerCase();
  } catch {
    // Parsing-Fehler ignorieren
  }
  return (doc.emailAbsender || '').toLowerCase();
};

const kundenname = (doc: Doc): string => {
  try {
    const daten = JSON.parse(doc.extrahierteDaten || '{}');
    return daten.kundenname || daten.vereinsname || '(ohne Namen)';
  } catch {
    return '(ohne Namen)';
  }
};

async function main() {
  console.log(`\n🧹 Bereinigung ${DATABASE_ID}/${ANFRAGEN}${dryRun ? '  (DRY-RUN — es wird nichts geschrieben)' : ''}\n`);

  const anfragen = await ladeAlle<Doc>(ANFRAGEN);
  console.log(`${anfragen.length} Anfragen geladen (${anfragen.filter(a => a.status !== 'geloescht').length} aktiv)\n`);

  // ============================================
  // 1. Dubletten
  // ============================================
  console.log('── Dubletten ──');
  const gruppen = new Map<string, Doc[]>();
  for (const doc of anfragen) {
    // Identität einer E-Mail: Absender + Zeitpunkt + Textanfang. Die IMAP-UID
    // allein reicht nicht — sie ist nur innerhalb eines Postfachs eindeutig und
    // fehlt bei Altdatensätzen.
    const key = `${doc.emailAbsender}|${doc.emailDatum}|${(doc.emailText || '').substring(0, 200)}`;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key)!.push(doc);
  }

  // Frisch markierte Dubletten darf der Status-Teil unten nicht mehr anfassen —
  // er liest denselben, noch ungeänderten Snapshot aus `anfragen`.
  const markiert = new Set<string>();
  // Bearbeitungsstand eines Eintrags — je höher, desto mehr geht beim Löschen verloren.
  const historie = (doc: Doc): number =>
    (doc.status !== 'neu' ? 8 : 0) +
    (doc.projektId ? 4 : 0) +
    (doc.angebotId ? 2 : 0) +
    (doc.notizen ? 1 : 0);

  let dublettenMarkiert = 0;
  let uebersprungen = 0;
  for (const gruppe of gruppen.values()) {
    if (gruppe.length < 2) continue;

    // Nur aktive Einträge kommen infrage. Wurde eine Kopie bereits im Portal
    // gelöscht, darf sie die verbliebene aktive nicht mit in den Papierkorb ziehen —
    // sonst verschwindet der Vorgang komplett aus der Liste (ein Undelete gibt es
    // in der Oberfläche nicht).
    const aktive = gruppe.filter(d => d.status !== 'geloescht');
    if (aktive.length < 2) continue;

    // Der Eintrag mit dem meisten Bearbeitungsstand bleibt; erst bei Gleichstand
    // entscheidet das Alter.
    const sortiert = [...aktive].sort(
      (a, b) =>
        historie(b) - historie(a) ||
        new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    );
    const [behalten, ...ueberzaehlig] = sortiert;

    for (const doc of ueberzaehlig) {
      // Eine Kopie mit eigener Historie wird nicht still weggeworfen, sondern gemeldet.
      if (historie(doc) > 0) {
        console.log(
          `  ⚠️  übersprungen (eigene Historie): ${kundenname(doc)} — ${doc.$id}, ` +
            `Original ${behalten.$id} — bitte manuell zusammenführen`
        );
        uebersprungen++;
        continue;
      }
      console.log(
        `  ${dryRun ? 'würde markieren' : 'markiere'}: ${kundenname(doc)} — ` +
          `${doc.$id} (vom ${doc.$createdAt.substring(0, 10)}), Original bleibt ${behalten.$id}`
      );
      if (!dryRun) {
        await databases.updateDocument(DATABASE_ID, ANFRAGEN, doc.$id, { status: 'geloescht' });
      }
      markiert.add(doc.$id);
      dublettenMarkiert++;
    }
  }
  console.log(
    `  ${dublettenMarkiert} Dublette(n) ${dryRun ? 'zu markieren' : 'markiert'}` +
      (uebersprungen > 0 ? `, ${uebersprungen} übersprungen (Historie)` : '') +
      '\n'
  );

  // ============================================
  // 2. Status nachziehen
  // ============================================
  console.log('── Status aus dem E-Mail-Protokoll ──');
  const protokoll = await ladeAlle<{
    dokumentTyp: string;
    empfaenger?: string;
    gesendetAm?: string;
    projektId?: string;
    dokumentNummer?: string;
  }>(PROTOKOLL);

  // Adresse -> Angebote, die an sie gingen
  const angeboteJeAdresse = new Map<string, { gesendetAm: string; projektId?: string; nummer?: string }[]>();
  for (const p of protokoll) {
    if (p.dokumentTyp !== 'angebot' || !p.empfaenger || !p.gesendetAm) continue;
    // Im Test-Modus steht die echte Adresse als "(Original: …)" im Empfängerfeld.
    const treffer = p.empfaenger.match(/Original:\s*([^\s)]+)/);
    const adresse = (treffer ? treffer[1] : p.empfaenger).toLowerCase();
    const bisher = angeboteJeAdresse.get(adresse) || [];
    bisher.push({ gesendetAm: p.gesendetAm, projektId: p.projektId, nummer: p.dokumentNummer });
    angeboteJeAdresse.set(adresse, bisher);
  }
  console.log(`  ${protokoll.length} Protokolleinträge, ${angeboteJeAdresse.size} Adressen mit Angebot`);

  let statusGesetzt = 0;
  let ohneBeleg = 0;

  for (const doc of anfragen) {
    if (doc.status !== 'neu' || markiert.has(doc.$id)) continue;

    const angebote = angeboteJeAdresse.get(anfrageAdresse(doc)) || [];
    const anfrageMs = new Date(doc.emailDatum).getTime();
    // Nur Angebote zählen, die NACH dem Eingang der Anfrage rausgingen.
    const passend = angebote
      .filter(a => new Date(a.gesendetAm).getTime() > anfrageMs)
      .sort((a, b) => new Date(a.gesendetAm).getTime() - new Date(b.gesendetAm).getTime())[0];

    if (!passend) {
      ohneBeleg++;
      continue;
    }

    console.log(
      `  ${dryRun ? 'würde setzen' : 'setze'}: ${kundenname(doc)} → angebot_versendet ` +
        `(${passend.nummer || 'ohne Nummer'} vom ${passend.gesendetAm.substring(0, 10)})`
    );

    if (!dryRun) {
      await databases.updateDocument(DATABASE_ID, ANFRAGEN, doc.$id, {
        status: 'angebot_versendet',
        angebotVersendetAm: passend.gesendetAm,
        aktualisiertAm: new Date().toISOString(),
        ...(passend.projektId && !doc.projektId
          ? { projektId: passend.projektId, angebotId: passend.projektId }
          : {}),
        notizen: 'Status nachgetragen aus E-Mail-Protokoll',
      });
    }
    statusGesetzt++;
  }

  console.log(`  ${statusGesetzt} Anfrage(n) ${dryRun ? 'zu setzen' : 'gesetzt'}`);
  console.log(`  ${ohneBeleg} bleiben offen — kein Angebot an die Anfrage-Adresse belegt\n`);

  console.log(
    dryRun
      ? '👉 Vorschau beendet. Zum Ausführen ohne --dry-run starten.\n'
      : '✅ Bereinigung abgeschlossen.\n'
  );
}

main().catch((error) => {
  console.error('❌ Fehler:', error instanceof Error ? error.message : error);
  process.exit(1);
});
