/**
 * seed-testdurchlauf.ts — Testdaten für die End-zu-End-Generalprobe der Auftragskette
 *
 * ACHTUNG: Dieses Skript ist für das PRODUKTIVSYSTEM gedacht. Es legt ausschließlich
 * klar gekennzeichnete TESTDATEN an ("TEST · Generalprobe (Claude)") und fasst keine
 * echten Kunden-, Projekt- oder Nummernkreis-Daten an.
 *
 * Zweck: Vor dem September-Massenversand soll das Massen-Angebots-Tool für einen
 * Testkunden ein Angebot aus der Quelle "Vorjahr" erzeugen können. Dafür braucht es:
 *   1. einen Testkunden in `saison_kunden` (aktiv, automatischesAngebot=true)
 *   2. ein abgeschlossenes Vorjahres-Projekt in `projekte` (saisonjahr = Zielsaison - 1)
 *   3. ein gespeichertes Vorjahres-Angebot in `bestellabwicklung_dokumente`
 *      (inkl. PDF im Bucket `bestellabwicklung_dateien` — dateiId ist im Schema Pflicht)
 *
 * Der "Vorjahr"-Pfad des Massen-Angebots-Tools (massenAngebotService.sammleKandidaten)
 * findet den Kunden über saisonplanungService.loadAlleKunden (aktiv && automatischesAngebot),
 * das Projekt über Query(kundeId, saisonjahr-1) auf `projekte` und das Angebot über
 * Query(projektId, dokumentTyp='angebot') auf `bestellabwicklung_dokumente`; die
 * Positionen werden aus dem JSON-Feld `daten` (AngebotsDaten) geklont.
 *
 * Modi:
 *   npx tsx scripts/seed-testdurchlauf.ts                      → Dry-Run (Default, schreibt NICHTS)
 *   npx tsx scripts/seed-testdurchlauf.ts --scharf             → legt die Testdaten wirklich an
 *   npx tsx scripts/seed-testdurchlauf.ts --aufraeumen         → Vorschau: was würde gelöscht
 *   npx tsx scripts/seed-testdurchlauf.ts --aufraeumen --scharf→ löscht alle Testdaten wieder
 *   Optional: --saison=2027 (Zielsaison überschreiben; Default: stammdaten.aktuelleSaison)
 *
 * NICHT committen. Nur Julian führt den Scharf-Modus aus.
 */

import { Client, Databases, Storage, ID, Query, type Models } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { jsPDF } from 'jspdf';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { SaisonKunde } from '../src/types/saisonplanung';
import type { Projekt } from '../src/types/projekt';
import type { AngebotsDaten, Position } from '../src/types/projektabwicklung';
import { getKlauselVorlagen, initialisiereDokumentKlauseln } from '../src/constants/vertragsklauseln';

// ===== Env & Client (Muster: scripts/claude-geschaeftsprozesse-anlegen.mjs) =====

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, '..', '.env') });

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
if (!endpoint || !projectId || !apiKey) {
  console.error('Fehlende Env-Variablen (VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY)');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const storage = new Storage(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN = 'saison_kunden';
const PROJEKTE = 'projekte';
const DOKUMENTE = 'bestellabwicklung_dokumente';
const DATEIEN_BUCKET = 'bestellabwicklung_dateien';
const STAMMDATEN = 'stammdaten';
const STAMMDATEN_DOC = 'stammdaten_data';

// ===== Test-Kennzeichnung =====

const TESTKUNDE_NAME = 'TEST · Generalprobe (Claude)';
const TEST_KUNDENNUMMER = 'TEST-K-99999';
const TEST_MARKER =
  'Vom Seed-Skript scripts/seed-testdurchlauf.ts angelegt — NUR TESTDATEN für die ' +
  'Generalprobe der Auftragskette. Darf jederzeit gelöscht werden (--aufraeumen).';
const ERSTELLT_VON = 'seed-testdurchlauf';

// Bewusst NICHT über den echten Nummernkreis (stammdaten.angebotZaehler) —
// der GoBD-relevante Zähler bleibt unangetastet.
const testAngebotsnummer = (vorjahr: number): string => `TEST-ANG-${vorjahr}-0001`;

// Kopie der Standard-Lieferbedingungen aus massenAngebotService.ts (dort modul-lokal).
const STANDARD_LIEFERBEDINGUNGEN =
  'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und ' +
  'Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und ' +
  '4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\n' +
  'Mindestabnahmemenge für loses Material sind 3 Tonnen.';

// ===== CLI =====

const argv = process.argv.slice(2);
const scharf = argv.includes('--scharf');
const aufraeumen = argv.includes('--aufraeumen');
const dryRun = !scharf;
const saisonArg = argv.find((a) => a.startsWith('--saison='));
const saisonOverride = saisonArg ? Number.parseInt(saisonArg.split('=')[1], 10) : undefined;
if (saisonArg && (!saisonOverride || Number.isNaN(saisonOverride))) {
  console.error(`Ungültiger Wert für --saison: "${saisonArg}"`);
  process.exit(1);
}

// ===== Helpers =====

type RohDokument = Models.Document & Record<string, unknown>;

function parseDataFeld<T>(doc: RohDokument): T | null {
  const raw = doc.data;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function ladeAlleDokumente(collectionId: string, queries: string[] = []): Promise<RohDokument[]> {
  const LIMIT = 200;
  const alle: RohDokument[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q = [...queries, Query.limit(LIMIT)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DATABASE_ID, collectionId, q);
    alle.push(...(res.documents as RohDokument[]));
    if (res.documents.length < LIMIT) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
}

function ueberschrift(text: string): void {
  console.log(`\n${'='.repeat(78)}\n${text}\n${'='.repeat(78)}`);
}

function zeigeFelder(label: string, obj: unknown): void {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(obj, null, 2));
}

// ===== Saison ermitteln (Logik aus nummerierungService.getAktuelleSaison nachgebaut) =====

function berechneAktuelleSaison(saisonStartMonat: number): number {
  const heute = new Date();
  const monat = heute.getMonth() + 1;
  const jahr = heute.getFullYear();
  return monat >= saisonStartMonat ? jahr + 1 : jahr;
}

interface StammdatenAuszug {
  aktuelleSaison?: number;
  saisonStartMonat?: number;
  firmenname?: string;
  firmenstrasse?: string;
  firmenPlz?: string;
  firmenOrt?: string;
  firmenTelefon?: string;
  firmenEmail?: string;
}

async function ladeStammdaten(): Promise<StammdatenAuszug> {
  try {
    const doc = (await db.getDocument(DATABASE_ID, STAMMDATEN, STAMMDATEN_DOC)) as RohDokument;
    const nummer = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
    const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    return {
      aktuelleSaison: nummer(doc.aktuelleSaison),
      saisonStartMonat: nummer(doc.saisonStartMonat),
      firmenname: text(doc.firmenname),
      firmenstrasse: text(doc.firmenstrasse),
      firmenPlz: text(doc.firmenPlz),
      firmenOrt: text(doc.firmenOrt),
      firmenTelefon: text(doc.firmenTelefon),
      firmenEmail: text(doc.firmenEmail),
    };
  } catch (error) {
    console.warn('Stammdaten konnten nicht geladen werden, verwende Defaults:', error);
    return {};
  }
}

// ===== Testdaten-Definitionen =====

const TEST_ADRESSE = {
  strasse: 'Raiffeisenweg 1',
  plz: '97232',
  ort: 'Giebelstadt',
  bundesland: 'Bayern',
  land: 'DE',
};

function baueTestkunde(id: string): SaisonKunde {
  const jetzt = new Date().toISOString();
  return {
    id,
    typ: 'verein',
    name: TESTKUNDE_NAME,
    kundennummer: TEST_KUNDENNUMMER,
    rechnungsadresse: { ...TEST_ADRESSE },
    lieferadresse: { ...TEST_ADRESSE },
    // Backwards-Compatibility-Feld wie in saisonplanungService.createKunde
    adresse: { ...TEST_ADRESSE },
    email: 'jtatwcook@gmail.com',
    notizen: TEST_MARKER,
    aktiv: true,
    // Opt-in ins Massen-Angebot (Opt-out-Semantik: true = einbezogen)
    automatischesAngebot: true,
    zahlungsziel: 14,
    beziehtUeberUnsPlatzbauer: false,
    abwerkspreis: false,
    // BEWUSST keine tonnenLetztesJahr/zuletztGezahlterPreis: sonst würde bei einem
    // Fehler im Vorjahres-Pfad still der Mosaik-Fallback greifen und den Test verfälschen.
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  };
}

function baueVorjahresPositionen(): Position[] {
  // Artikel real aus der artikel-Collection (TM-ZM-02, "Tennismehl 0/2 Schüttgut", Einheit t).
  // 10 t zu 129,50 €/t = plausibler Vorjahres-Endpreis (Werk + Aufschlag + Spedition).
  const menge = 10;
  const einzelpreis = 129.5;
  return [
    {
      id: `pos-seed-${Date.now()}-1`,
      artikelnummer: 'TM-ZM-02',
      bezeichnung: 'Tennismehl 0/2 Schüttgut',
      beschreibung: 'gemäß DIN 18035',
      menge,
      einheit: 't',
      einzelpreis,
      gesamtpreis: Math.round(menge * einzelpreis * 100) / 100,
    },
  ];
}

function baueVorjahresProjekt(projektId: string, kunde: SaisonKunde, vorjahr: number): Projekt {
  const jetzt = new Date().toISOString();
  return {
    id: projektId,
    projektName: kunde.name,
    kundeId: kunde.id,
    kundennummer: kunde.kundennummer,
    kundenname: kunde.name,
    kundenstrasse: TEST_ADRESSE.strasse,
    kundenPlzOrt: `${TEST_ADRESSE.plz} ${TEST_ADRESSE.ort}`,
    kundenEmail: kunde.email,
    lieferadresse: {
      strasse: TEST_ADRESSE.strasse,
      plz: TEST_ADRESSE.plz,
      ort: TEST_ADRESSE.ort,
      land: TEST_ADRESSE.land,
    },
    saisonjahr: vorjahr,
    // Abgeschlossene Vorsaison — 'bezahlt' hält das Projekt aus allen offenen Workflows raus.
    status: 'bezahlt',
    angebotsnummer: testAngebotsnummer(vorjahr),
    angebotsdatum: `${vorjahr}-03-01`,
    preisProTonne: 129.5,
    notizen: TEST_MARKER,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
    erstelltVon: ERSTELLT_VON,
  };
}

function baueAngebotsDaten(kunde: SaisonKunde, vorjahr: number, stammdaten: StammdatenAuszug): AngebotsDaten {
  const positionen = baueVorjahresPositionen();
  return {
    // Firmendaten (Absender) — wie massenAngebotService.baueAngebotsDaten aus Stammdaten
    firmenname: stammdaten.firmenname ?? 'Tennismehl GmbH',
    firmenstrasse: stammdaten.firmenstrasse ?? 'Raiffeisenweg 1',
    firmenPlzOrt: `${stammdaten.firmenPlz ?? '97232'} ${stammdaten.firmenOrt ?? 'Giebelstadt'}`,
    firmenTelefon: stammdaten.firmenTelefon ?? '09391 98700',
    firmenEmail: stammdaten.firmenEmail ?? 'info@tennismehl.com',
    // Kunde (Empfänger)
    kundennummer: kunde.kundennummer,
    kundenname: kunde.name,
    kundenstrasse: TEST_ADRESSE.strasse,
    kundenPlzOrt: `${TEST_ADRESSE.plz} ${TEST_ADRESSE.ort}`,
    // Angebots-Metadaten (klar als Test gekennzeichnet, KEIN echter Nummernkreis)
    angebotsnummer: testAngebotsnummer(vorjahr),
    angebotsdatum: `${vorjahr}-03-01`,
    gueltigBis: `${vorjahr}-03-31`,
    positionen,
    zahlungsziel: '14 Tage',
    lieferbedingungenAktiviert: true,
    lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
    lieferadresseAbweichend: false,
    // Klauseln wie im Massen-Angebots-Tool (Standard-Vorlagen, da Stammdaten-Overrides
    // in der Node-Umgebung nicht als Stammdaten-Objekt vorliegen)
    vertragsklauseln: initialisiereDokumentKlauseln(getKlauselVorlagen(null)),
    agbAnhaengen: true,
    bemerkung: TEST_MARKER,
  };
}

function berechneBrutto(positionen: Position[]): number {
  const netto = positionen
    .filter((p) => !p.istBedarfsposition)
    .reduce((sum, p) => sum + (p.gesamtpreis ?? 0), 0);
  return Math.round(netto * 1.19 * 100) / 100;
}

// Minimales, echtes PDF (Muster: jsPDF wie im Bestand) — das Schema von
// bestellabwicklung_dokumente verlangt eine dateiId (required), daher ist der
// Datei-Eintrag im Bucket zwingend.
function erzeugeTestPdf(daten: AngebotsDaten): Buffer {
  const pdf = new jsPDF();
  pdf.setFontSize(16);
  pdf.text('TESTDOKUMENT - Generalprobe Auftragskette', 20, 20);
  pdf.setFontSize(11);
  const zeilen = [
    `Angebot ${daten.angebotsnummer} vom ${daten.angebotsdatum}`,
    `Kunde: ${daten.kundenname} (${daten.kundennummer ?? '-'})`,
    `${daten.kundenstrasse}, ${daten.kundenPlzOrt}`,
    '',
    'Positionen:',
    ...daten.positionen.map(
      (p) => `  ${p.artikelnummer ?? ''} ${p.bezeichnung}: ${p.menge} ${p.einheit} x ${p.einzelpreis.toFixed(2)} EUR = ${p.gesamtpreis.toFixed(2)} EUR`
    ),
    '',
    `Nettosumme: ${daten.positionen.reduce((s, p) => s + p.gesamtpreis, 0).toFixed(2)} EUR`,
    '',
    'Dieses Dokument wurde vom Seed-Skript seed-testdurchlauf.ts erzeugt.',
    'Es dient ausschliesslich dem Testdurchlauf und ist KEIN echtes Angebot.',
  ];
  let y = 32;
  for (const zeile of zeilen) {
    pdf.text(zeile, 20, y);
    y += 7;
  }
  return Buffer.from(pdf.output('arraybuffer'));
}

// ===== Suche nach existierenden Testdaten (Idempotenz) =====

interface GefundenerTestkunde {
  docId: string;
  kunde: SaisonKunde;
}

async function findeTestkunden(): Promise<GefundenerTestkunde[]> {
  // saison_kunden hat nur das JSON-Feld `data` → kein Query auf den Namen möglich,
  // daher alle laden und clientseitig filtern (wie saisonplanungService.loadAlleKunden).
  const docs = await ladeAlleDokumente(SAISON_KUNDEN);
  const treffer: GefundenerTestkunde[] = [];
  for (const doc of docs) {
    const kunde = parseDataFeld<SaisonKunde>(doc);
    if (kunde && kunde.name === TESTKUNDE_NAME) {
      treffer.push({ docId: doc.$id, kunde: { ...kunde, id: kunde.id || doc.$id } });
    }
  }
  return treffer;
}

async function findeProjektFuerKunde(kundeId: string, saisonjahr: number): Promise<RohDokument | null> {
  // Exakt der Lookup des Massen-Angebots-Tools (projektService.getProjektFuerKunde):
  // Query auf die Top-Level-Spalten kundeId + saisonjahr.
  const res = await db.listDocuments(DATABASE_ID, PROJEKTE, [
    Query.equal('kundeId', kundeId),
    Query.equal('saisonjahr', saisonjahr),
    Query.limit(1),
  ]);
  return res.documents.length > 0 ? (res.documents[0] as RohDokument) : null;
}

async function findeAngebotsdokument(projektId: string): Promise<RohDokument | null> {
  // Exakt der Lookup von ladeDokumentNachTyp(projektId, 'angebot').
  const res = await db.listDocuments(DATABASE_ID, DOKUMENTE, [
    Query.equal('projektId', projektId),
    Query.equal('dokumentTyp', 'angebot'),
    Query.orderDesc('$createdAt'),
    Query.limit(1),
  ]);
  return res.documents.length > 0 ? (res.documents[0] as RohDokument) : null;
}

// ===== Seed-Ablauf =====

async function seed(): Promise<void> {
  const stammdaten = await ladeStammdaten();
  const zielsaison = saisonOverride ?? stammdaten.aktuelleSaison ?? berechneAktuelleSaison(stammdaten.saisonStartMonat ?? 11);
  const vorjahr = zielsaison - 1;

  console.log(`\nZielsaison (Massen-Angebots-Lauf): ${zielsaison}${saisonOverride ? ' (per --saison überschrieben)' : ' (aus stammdaten.aktuelleSaison)'}`);
  console.log(`Vorjahres-Saison (Seed-Daten):     ${vorjahr}`);
  if (!saisonOverride) {
    console.log(
      'HINWEIS: Läuft der Massenversand später für eine andere Saison (z.B. nach Saison-Umstellung\n' +
      'in den Stammdaten), das Skript mit --saison=<jahr> erneut ausführen.'
    );
  }

  // --- Schritt 1: Testkunde ---
  ueberschrift('Schritt 1/3: Testkunde in saison_kunden');
  const vorhandene = await findeTestkunden();
  let kunde: SaisonKunde;
  let kundeExistiert = false;
  if (vorhandene.length > 0) {
    kundeExistiert = true;
    kunde = vorhandene[0].kunde;
    console.log(`Testkunde existiert bereits — wird wiederverwendet (Dokument-ID: ${vorhandene[0].docId}).`);
    if (vorhandene.length > 1) {
      console.warn(`WARNUNG: ${vorhandene.length} Testkunden mit dem Namen gefunden. --aufraeumen räumt alle auf.`);
    }
    zeigeFelder('Vorhandener Testkunde', kunde);
  } else {
    kunde = baueTestkunde(ID.unique());
    console.log(dryRun ? 'Würde folgenden Kunden anlegen (Collection saison_kunden, Feld data als JSON):' : 'Lege Kunden an…');
    zeigeFelder('Neuer Testkunde (SaisonKunde)', kunde);
    if (!dryRun) {
      await db.createDocument(DATABASE_ID, SAISON_KUNDEN, kunde.id, { data: JSON.stringify(kunde) });
      console.log(`ANGELEGT: saison_kunden/${kunde.id}`);
    }
  }

  // --- Schritt 2: Vorjahres-Projekt ---
  ueberschrift(`Schritt 2/3: Vorjahres-Projekt (saisonjahr=${vorjahr}) in projekte`);
  const existierendesProjekt = kundeExistiert ? await findeProjektFuerKunde(kunde.id, vorjahr) : null;
  let projektId: string;
  if (existierendesProjekt) {
    projektId = existierendesProjekt.$id;
    console.log(`Vorjahres-Projekt existiert bereits — wird wiederverwendet (ID: ${projektId}).`);
  } else {
    projektId = ID.unique();
    const projekt = baueVorjahresProjekt(projektId, kunde, vorjahr);
    const payload = {
      projektName: projekt.projektName,
      kundeId: projekt.kundeId,
      kundenname: projekt.kundenname,
      saisonjahr: projekt.saisonjahr,
      status: projekt.status,
      erstelltAm: projekt.erstelltAm,
      geaendertAm: projekt.geaendertAm,
      erstelltVon: ERSTELLT_VON,
      data: JSON.stringify(projekt),
    };
    console.log(dryRun ? 'Würde folgendes Projekt anlegen (Top-Level-Spalten + data-JSON):' : 'Lege Projekt an…');
    zeigeFelder('Vorjahres-Projekt (Projekt, landet in data)', projekt);
    if (!dryRun) {
      await db.createDocument(DATABASE_ID, PROJEKTE, projektId, payload);
      console.log(`ANGELEGT: projekte/${projektId}`);
    } else {
      console.log(`(Dry-Run: Projekt-ID würde neu generiert, Platzhalter: ${projektId})`);
    }
  }

  // --- Schritt 3: Vorjahres-Angebot (Dokument + PDF) ---
  ueberschrift('Schritt 3/3: Gespeichertes Vorjahres-Angebot in bestellabwicklung_dokumente');
  const existierendesAngebot = existierendesProjekt ? await findeAngebotsdokument(projektId) : null;
  if (existierendesAngebot) {
    console.log(
      `Angebots-Dokument existiert bereits — wird wiederverwendet (ID: ${existierendesAngebot.$id}, ` +
      `Nummer: ${String(existierendesAngebot.dokumentNummer)}).`
    );
  } else {
    const angebotsDaten = baueAngebotsDaten(kunde, vorjahr, stammdaten);
    let datenJson = JSON.stringify(angebotsDaten);
    if (datenJson.length > 9500) {
      // Schema-Limit des daten-Felds: 10000 Zeichen — zur Sicherheit Klauseln weglassen.
      console.warn(`WARNUNG: AngebotsDaten-JSON ist ${datenJson.length} Zeichen lang — kürze (Klauseln raus).`);
      datenJson = JSON.stringify({ ...angebotsDaten, vertragsklauseln: undefined });
    }
    const dateiname = `Angebot ${TESTKUNDE_NAME} ${vorjahr}.pdf`;
    const dokumentPayload = {
      projektId,
      dokumentTyp: 'angebot',
      dokumentNummer: angebotsDaten.angebotsnummer,
      dateiId: '(wird beim Upload vergeben)',
      dateiname,
      bruttobetrag: berechneBrutto(angebotsDaten.positionen),
      istFinal: false,
      daten: datenJson,
      erstelltVon: ERSTELLT_VON,
      bearbeitetVonName: 'Seed-Skript (Claude)',
    };
    console.log(
      dryRun
        ? 'Würde ein Test-PDF in den Bucket bestellabwicklung_dateien hochladen und folgenden\nDokument-Eintrag anlegen (daten hier zur Lesbarkeit als Objekt statt JSON-String):'
        : 'Erzeuge PDF, lade hoch und lege Dokument-Eintrag an…'
    );
    zeigeFelder('Dokument-Eintrag (bestellabwicklung_dokumente)', {
      ...dokumentPayload,
      daten: JSON.parse(datenJson) as AngebotsDaten,
    });
    if (!dryRun) {
      const pdfBuffer = erzeugeTestPdf(angebotsDaten);
      const datei = await storage.createFile(DATEIEN_BUCKET, ID.unique(), InputFile.fromBuffer(pdfBuffer, dateiname));
      console.log(`PDF hochgeladen: ${DATEIEN_BUCKET}/${datei.$id} (${pdfBuffer.length} Bytes)`);
      const dok = await db.createDocument(DATABASE_ID, DOKUMENTE, ID.unique(), {
        ...dokumentPayload,
        dateiId: datei.$id,
      });
      console.log(`ANGELEGT: bestellabwicklung_dokumente/${dok.$id}`);
    }
  }

  // --- Abschluss ---
  ueberschrift(dryRun ? 'DRY-RUN abgeschlossen — es wurde NICHTS geschrieben' : 'Seed abgeschlossen');
  console.log(
    `\nNächste Schritte für die Generalprobe:\n` +
    `  1. Massen-Angebots-Tool öffnen (Zielsaison ${zielsaison}).\n` +
    `  2. Der Kandidat "${TESTKUNDE_NAME}" muss mit Quelle "Vorjahr" erscheinen\n` +
    `     (10 t TM-ZM-02 à 129,50 €/t aus dem Test-Vorjahresangebot ${testAngebotsnummer(vorjahr)}).\n` +
    `  3. Angebot erzeugen/versenden — E-Mail geht an jtatwcook@gmail.com.\n` +
    `  4. Danach ALLES aufräumen:  npx tsx scripts/seed-testdurchlauf.ts --aufraeumen --scharf\n` +
    (dryRun ? `\nZum tatsächlichen Anlegen:  npx tsx scripts/seed-testdurchlauf.ts --scharf\n` : '')
  );
}

// ===== Aufräumen =====

async function raeumeAuf(): Promise<void> {
  ueberschrift(`Aufräumen: alle Testdaten von "${TESTKUNDE_NAME}"${dryRun ? ' (VORSCHAU)' : ''}`);
  const testkunden = await findeTestkunden();
  if (testkunden.length === 0) {
    console.log('Kein Testkunde gefunden — nichts zu tun.');
    return;
  }

  let geloeschteDokumente = 0;
  let geloeschteDateien = 0;
  let geloeschteProjekte = 0;

  for (const { docId, kunde } of testkunden) {
    console.log(`\nTestkunde: ${kunde.name} (saison_kunden/${docId})`);

    // Alle Projekte des Testkunden über ALLE Saisons (Vorjahres-Seed + vom
    // Massen-Tool erzeugtes Zielsaison-Projekt).
    const projekte = await ladeAlleDokumente(PROJEKTE, [Query.equal('kundeId', kunde.id)]);
    for (const projekt of projekte) {
      // Sicherheitsgurt: nur Projekte anfassen, die eindeutig zum Testkunden gehören.
      if (projekt.kundenname !== TESTKUNDE_NAME) {
        console.warn(`  ÜBERSPRINGE projekte/${projekt.$id} — kundenname "${String(projekt.kundenname)}" passt nicht.`);
        continue;
      }
      console.log(`  Projekt: projekte/${projekt.$id} (saisonjahr=${String(projekt.saisonjahr)}, status=${String(projekt.status)})`);

      // Zugehörige Dokumente inkl. PDF-Dateien
      const dokumente = await ladeAlleDokumente(DOKUMENTE, [Query.equal('projektId', projekt.$id)]);
      for (const dok of dokumente) {
        const dateiId = typeof dok.dateiId === 'string' ? dok.dateiId : '';
        console.log(
          `    ${dryRun ? 'Würde löschen' : 'Lösche'}: bestellabwicklung_dokumente/${dok.$id} ` +
          `(${String(dok.dokumentTyp)} ${String(dok.dokumentNummer)}, Datei ${dateiId || '-'})`
        );
        if (!dryRun) {
          if (dateiId) {
            try {
              await storage.deleteFile(DATEIEN_BUCKET, dateiId);
              geloeschteDateien++;
            } catch {
              console.warn(`    PDF-Datei ${dateiId} nicht löschbar (evtl. bereits entfernt).`);
            }
          }
          await db.deleteDocument(DATABASE_ID, DOKUMENTE, dok.$id);
          geloeschteDokumente++;
        }
      }

      console.log(`    ${dryRun ? 'Würde löschen' : 'Lösche'}: projekte/${projekt.$id}`);
      if (!dryRun) {
        await db.deleteDocument(DATABASE_ID, PROJEKTE, projekt.$id);
        geloeschteProjekte++;
      }
    }

    console.log(`  ${dryRun ? 'Würde löschen' : 'Lösche'}: saison_kunden/${docId}`);
    if (!dryRun) {
      await db.deleteDocument(DATABASE_ID, SAISON_KUNDEN, docId);
    }
  }

  if (dryRun) {
    console.log(
      `\nVORSCHAU beendet — es wurde NICHTS gelöscht.\n` +
      `Zum tatsächlichen Löschen:  npx tsx scripts/seed-testdurchlauf.ts --aufraeumen --scharf`
    );
  } else {
    console.log(
      `\nAufräumen abgeschlossen: ${testkunden.length} Kunde(n), ${geloeschteProjekte} Projekt(e), ` +
      `${geloeschteDokumente} Dokument(e), ${geloeschteDateien} PDF-Datei(en) gelöscht.`
    );
    console.log(
      'HINWEIS: Wurde im Test ein Angebot mit ECHTER Angebotsnummer (ANG-…) erzeugt, bleibt im\n' +
      'Nummernkreis eine Lücke — das ist für den Testdurchlauf einkalkuliert.'
    );
  }
}

// ===== Main =====

async function main(): Promise<void> {
  console.log('='.repeat(78));
  console.log('SEED-SKRIPT GENERALPROBE AUFTRAGSKETTE — arbeitet gegen das PRODUKTIVSYSTEM!');
  console.log('Es werden ausschließlich klar gekennzeichnete Testdaten angelegt/gelöscht.');
  console.log(`Modus: ${aufraeumen ? 'AUFRÄUMEN' : 'SEED'} | ${dryRun ? 'DRY-RUN (Default, schreibt nichts)' : 'SCHARF'}`);
  console.log(`Appwrite: ${endpoint} / Projekt ${projectId} / DB ${DATABASE_ID}`);
  console.log('='.repeat(78));

  if (aufraeumen) {
    await raeumeAuf();
  } else {
    await seed();
  }
}

main().catch((error) => {
  console.error('\nFEHLER:', error);
  process.exit(1);
});
