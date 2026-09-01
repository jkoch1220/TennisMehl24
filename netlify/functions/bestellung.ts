/**
 * bestellung.ts — Bestellportal für Kunden
 *
 * Der Verein öffnet den Link aus der Angebots-E-Mail, sieht sein Angebot und
 * bestellt mit einem Klick. Kein Login, keine Registrierung.
 *
 *   GET  ?projektId=…&token=…   → Angebot, Adressen, Status
 *   POST { projektId, token, aktion: 'bestellen' | 'aktualisieren', … }
 *
 * SICHERHEIT — die drei Regeln, die hier alles tragen:
 *
 * 1. Der Client spricht NIE mit Appwrite. Jeder Zugriff läuft über diese
 *    Function mit dem Server-Key. Der Kunde bekommt ausschließlich das eine
 *    Projekt zu sehen, zu dem sein Token passt — nie eine Liste, nie einen
 *    anderen Kunden.
 * 2. Der Token ist ein eigenes Zufallsfeld, NICHT die Projekt-ID. IDs stehen in
 *    PDFs, Logs und internen Listen; ein Link, der allein darauf beruht, wäre
 *    durch Weitergabe eines Dokuments kompromittiert.
 * 3. Preise werden serverseitig neu gerechnet. Was der Client schickt, ist ein
 *    Wunsch, kein Faktum — sonst bestellte jemand 20 Tonnen zum Preis von zwei.
 *
 * Was der Kunde NICHT kann: stornieren (dafür ruft er an) und den Preis pro
 * Tonne ändern. Die Menge darf er um ±10 % anpassen — das entspricht der
 * Mengenklausel in den AGB; die Frachtpauschale wird dabei neu gestaffelt.
 */
import { Handler, HandlerEvent } from '@netlify/functions';
import { randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Ziel-Datenbank.
 *
 * Der Bestell-Link trägt `&sandbox=1`, wenn er aus der Sandbox heraus erzeugt
 * wurde. Ohne diese Weiche läse die Function immer aus der Produktion — ein
 * Testlauf in der Sandbox würde also echte Aufträge anfassen.
 *
 * Der Parameter ist unbedenklich manipulierbar: Er wählt nur, WO gesucht wird.
 * Ohne passenden Token findet man in keiner der beiden Datenbanken etwas, und
 * ein Sandbox-Token existiert in der Produktion schlicht nicht.
 */
const PRODUKTIONS_DB = 'tennismehl24_db';
const SANDBOX_DB = 'tennismehl24_db_mock';
const datenbank = (sandbox: boolean): string => (sandbox ? SANDBOX_DB : PRODUKTIONS_DB);

const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const FOTOS_BUCKET_ID = 'bestellung-fotos';

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

/** Gültigkeit ab Angebotsversand. Danach greift die Verlängerung über die Rechnung. */
const GUELTIGKEIT_TAGE = 90;
/** Nach Rechnungsstellung bleibt die Seite so lange als Nachschlagewerk offen. */
const NACH_RECHNUNG_TAGE = 30;
/** Mengenspielraum laut Mengenklausel. */
const MENGEN_TOLERANZ = 0.10;

const MAX_TEXT = 500;
const MAX_NOTIZ = 2000;

/** Höchstens drei Fotos je Bestellung — mehr braucht keine Schüttstelle. */
const MAX_FOTOS = 3;
/**
 * 1,5 MB nach der Verkleinerung im Browser.
 *
 * Der Client rechnet Bilder auf 1600 px herunter; dabei bleiben typisch
 * 300–500 KB übrig. Die Grenze fängt ab, wer die Verkleinerung umgeht —
 * und hält die Anfrage unter dem 6-MB-Limit von Netlify.
 */
const MAX_FOTO_BYTES = 1_500_000;

/**
 * Frachtkostenpauschale TM-FP — Staffel aus der Preisliste.
 *
 * EXAKT dieselbe Grenzen-Semantik wie berechneFrachtkostenpauschale im Portal
 * (src/utils/frachtkostenCalculations.ts): die Obergrenzen sind einschließlich
 * („bis 19,9 t" → 24,90 €). Die frühere `<`-Variante bepreiste die exakten
 * Staffelgrenzen eine Stufe günstiger als die spätere Rechnung — bei genau
 * 19,9 t stand sogar 0,00 € in der Bestellbestätigung.
 */
const frachtpauschale = (tonnen: number): number => {
  if (tonnen <= 0) return 59.9;
  if (tonnen < 5.4) return 59.9;
  if (tonnen <= 7.4) return 49.9;
  if (tonnen <= 11.4) return 39.9;
  if (tonnen <= 15.4) return 31.9;
  if (tonnen <= 19.9) return 24.9;
  return 0;
};

/**
 * Pauschalen/Dienstleistungen, die in „t" fakturiert werden, aber keine Ware
 * sind. Kopie der zentralen Liste in src/utils/tonnage.ts — die Function ist
 * bewusst self-contained (wie schon die Frachtstaffel), beide müssen synchron
 * bleiben. Ohne den Ausschluss zählte z. B. eine Ladekran-Position als Tonne
 * und verschob die ±10-%-Grenzen und die Frachtstaffel.
 */
const NICHT_MATERIAL_ARTIKEL = new Set(['TM-PE', 'TM-FP', 'TM-HYC-V', 'TM-LKW-KR', 'TM-SK']);

/** Zählt diese Position als Ware in Tonnen? (gleiche Logik wie summiereTonnage im Portal) */
const istWarenTonnenPosition = (p: Position): boolean =>
  !p.istBedarfsposition &&
  /^(t|to)$/i.test(String(p.einheit ?? '')) &&
  !NICHT_MATERIAL_ARTIKEL.has(String(p.artikelnummer ?? '').trim().toUpperCase());

interface Position {
  id?: string;
  artikelnummer?: string;
  bezeichnung?: string;
  menge?: number;
  einheit?: string;
  einzelpreis?: number;
  gesamtpreis?: number;
  istBedarfsposition?: boolean;
}

interface Adresse { strasse?: string; plz?: string; ort?: string; land?: string }

interface ProjektDaten {
  kundenname?: string;
  kundennummer?: string;
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  angebotsnummer?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  lieferwoche?: string;
  bestellToken?: string;
  bestellTokenErstelltAm?: string;
  bestellungEingegangenAm?: string;
  bestellungDaten?: string;
  dispoAnsprechpartner?: { name?: string; telefon?: string; email?: string };
  lieferadresse?: Adresse;
  rechnungsadresse?: Adresse;
  dispoNotizen?: Array<{ id: string; text: string; erstelltAm: string; wichtig?: boolean }>;
  schuettstelleFotos?: SchuettstelleFoto[];
  /** An wen das Angebot ging — dorthin geht auch die Bestätigung. */
  bestellEmpfaenger?: string;
  [k: string]: unknown;
}

interface ProjektDokument { $id: string; status?: string; data?: string; [k: string]: unknown }

interface SchuettstelleFoto { fileId: string; hochgeladenAm: string; hinweis?: string }

/**
 * Erkennt das Bildformat an den ersten Bytes.
 *
 * Der vom Browser gemeldete Content-Type ist eine Behauptung, kein Beweis —
 * jede Datei kann sich als `image/jpeg` ausgeben. SVG wird bewusst nicht
 * unterstützt: SVG ist XML und kann Skripte enthalten.
 */
const erkenneBildtyp = (bytes: Buffer): { typ: 'image/jpeg' | 'image/png'; endung: 'jpg' | 'png' } | null => {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { typ: 'image/jpeg', endung: 'jpg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { typ: 'image/png', endung: 'png' };
  return null;
};

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': APPWRITE_PROJECT_ID,
  'X-Appwrite-Key': APPWRITE_API_KEY,
});

const antwort = (status: number, body: unknown) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const ladeProjekt = async (projektId: string, db: string): Promise<ProjektDokument | null> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    { headers: headers() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Projekt nicht ladbar (HTTP ${res.status})`);
  return (await res.json()) as ProjektDokument;
};

/**
 * Schreibt die Projekt-Nutzdaten zurück.
 *
 * Die Collection hat nur eine Handvoll echter Spalten (`status`, `saisonjahr`,
 * `kundeId` …); alles Übrige liegt als JSON-String im Attribut `data`. Wer das
 * geparste Objekt direkt durchreicht, bekommt „Unknown attribute: kundennummer"
 * — Appwrite deutet dann jeden Schlüssel als Spalte.
 *
 * `spalten` ist deshalb bewusst getrennt: nur was wirklich eine Spalte ist.
 */
const speichereProjekt = async (
  projektId: string,
  nutzdaten: ProjektDaten,
  db: string,
  spalten: Record<string, unknown> = {}
): Promise<void> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        data: { ...spalten, data: JSON.stringify(nutzdaten), geaendertAm: new Date().toISOString() },
      }),
    }
  );
  if (!res.ok) {
    const f = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(f.message || `Speichern fehlgeschlagen (HTTP ${res.status})`);
  }
};

/** Das gespeicherte Angebot — Grundlage für Positionen und Preise. */
const ladeAngebot = async (projektId: string, db: string): Promise<{ positionen: Position[] } | null> => {
  // Appwrite-REST erwartet `attribute` als eigenes Feld. Steckt der Name im
  // values-Array, kommt er leer an und die Abfrage scheitert mit
  // „Attribute not found in schema" — still, denn der Fehler landet im catch.
  const q = encodeURIComponent(JSON.stringify({ method: 'equal', attribute: 'projektId', values: [projektId] }));
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${DOKUMENTE_COLLECTION_ID}/documents?queries[]=${q}`,
    { headers: headers() }
  );
  if (!res.ok) return null;
  const { documents = [] } = (await res.json()) as { documents: Array<Record<string, unknown>> };
  const angebot = documents.filter((d) => d.dokumentTyp === 'angebot').pop();
  if (!angebot) return null;
  try {
    const daten = JSON.parse(String(angebot.daten ?? '{}')) as { positionen?: Position[] };
    return { positionen: daten.positionen ?? [] };
  } catch { return null; }
};

const parseDaten = (doc: ProjektDokument): ProjektDaten => {
  try { return doc.data ? (JSON.parse(doc.data) as ProjektDaten) : {}; } catch { return {}; }
};

const tokenGleich = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/**
 * Gültigkeit in zwei Stufen: 90 Tage ab Versand, und sobald eine Rechnung
 * existiert, noch 30 Tage ab Rechnungsdatum. So bleibt die Seite genau so
 * lange erreichbar, wie der Kunde etwas nachschlagen will — und nicht länger.
 */
const pruefeZugang = (
  daten: ProjektDaten,
  token: string
): { ok: true } | { ok: false; grund: string; abgelaufen?: boolean } => {
  if (!daten.bestellToken) return { ok: false, grund: 'Für dieses Angebot gibt es keine Bestellseite.' };
  if (!tokenGleich(daten.bestellToken, token)) return { ok: false, grund: 'Der Link ist ungültig.' };

  const jetzt = Date.now();
  const erstellt = daten.bestellTokenErstelltAm ? new Date(daten.bestellTokenErstelltAm).getTime() : NaN;
  const innerhalbGrundfrist =
    !Number.isNaN(erstellt) && jetzt <= erstellt + GUELTIGKEIT_TAGE * 864e5;
  if (innerhalbGrundfrist) return { ok: true };

  if (daten.rechnungsdatum) {
    const rechnung = new Date(daten.rechnungsdatum).getTime();
    if (!Number.isNaN(rechnung) && jetzt <= rechnung + NACH_RECHNUNG_TAGE * 864e5) return { ok: true };
  }
  return {
    ok: false,
    abgelaufen: true,
    grund: 'Dieser Link ist abgelaufen. Rufen Sie uns gerne an: 09391 9870-0.',
  };
};

const text = (wert: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof wert !== 'string') return undefined;
  const t = wert.trim();
  return t ? t.slice(0, max) : undefined;
};

const adresse = (wert: unknown): Adresse | undefined => {
  if (!wert || typeof wert !== 'object') return undefined;
  const a = wert as Record<string, unknown>;
  const gebaut: Adresse = {
    strasse: text(a.strasse, 200), plz: text(a.plz, 10),
    ort: text(a.ort, 100), land: text(a.land, 60),
  };
  return gebaut.strasse || gebaut.plz || gebaut.ort ? gebaut : undefined;
};

/**
 * Rechnet die Positionen auf eine neue Menge um.
 *
 * Der Preis pro Tonne bleibt, was er war — daran darf der Kunde nicht drehen.
 * Die Frachtpauschale wird neu gestaffelt, weil sie an der Tonnage hängt: Wer
 * von 5 auf 6 Tonnen geht, zahlt 49,90 € statt 59,90 €.
 */
const rechneUm = (positionen: Position[], neueTonnage: number): { positionen: Position[]; summe: number } => {
  const alteTonnage = positionen
    .filter(istWarenTonnenPosition)
    .reduce((s, p) => s + Number(p.menge ?? 0), 0);

  // Unveränderte Menge → Angebot unangetastet lassen. Sonst würde die
  // TM-FP-Position hier neu gestaffelt und könnte vom verbindlich
  // angebotenen Preis abweichen (Altangebote wurden teils mit anderer
  // Tonnage-Zählung bepreist; manuell verhandelte Pauschalen gäbe es auch).
  if (Math.abs(neueTonnage - alteTonnage) < 0.001) {
    const summe = positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
    return { positionen, summe: Math.round(summe * 100) / 100 };
  }

  const faktor = alteTonnage > 0 ? neueTonnage / alteTonnage : 1;

  const neu = positionen.map((p) => {
    if (p.istBedarfsposition) return p;
    const nr = String(p.artikelnummer ?? '').toUpperCase();
    if (nr === 'TM-FP') {
      const preis = frachtpauschale(neueTonnage);
      return { ...p, menge: 1, einzelpreis: preis, gesamtpreis: preis };
    }
    // Nur Ware skaliert mit der Menge — Pauschalen in „t" bleiben stehen.
    if (istWarenTonnenPosition(p)) {
      const menge = Math.round(Number(p.menge ?? 0) * faktor * 100) / 100;
      const ep = Number(p.einzelpreis ?? 0);
      return { ...p, menge, gesamtpreis: Math.round(menge * ep * 100) / 100 };
    }
    return p;
  });
  const summe = neu.filter((p) => !p.istBedarfsposition).reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
  return { positionen: neu, summe: Math.round(summe * 100) / 100 };
};

// Einfaches Rate-Limit pro IP. Best effort — Netlify-Instanzen sind kurzlebig,
// aber es bremst das naive Durchprobieren von Tokens spürbar.
const versuche = new Map<string, { anzahl: number; bis: number }>();
const zuVieleVersuche = (ip: string): boolean => {
  const jetzt = Date.now();
  const e = versuche.get(ip);
  if (!e || jetzt > e.bis) { versuche.set(ip, { anzahl: 1, bis: jetzt + 60_000 }); return false; }
  e.anzahl++;
  return e.anzahl > 30;
};

/** Empfänger der internen Meldung — geht auch aus der Sandbox echt raus. */
const INTERN_EMPFAENGER = 'bestellung@tennismehl24.com';
const ABSENDER = 'info@tennismehl.com';
/** In der Sandbox landet die Kundenmail hier statt beim Verein. */
const TEST_EMPFAENGER = 'jtatwcook@gmail.com';

const euro = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Verschickt eine Mail über die vorhandene email-send-Function.
 *
 * Bewusst über den bestehenden Endpunkt statt mit eigenem SMTP-Code: Dort
 * liegen die Zugangsdaten, dort wird ins „Gesendet"-Postfach kopiert, und
 * dieselbe Mail zweimal unterschiedlich zu verschicken wäre eine Fehlerquelle.
 */
/**
 * Basis-URL der laufenden Instanz.
 *
 * Netlify setzt `URL` selbst. Lokal fehlt sie — dort greift der Dev-Server auf
 * Port 8888, auf dem auch `email-send` liegt. Ohne diesen Rückfall bliebe der
 * Mailversand beim lokalen Testen stumm, und man hielte ihn für kaputt.
 */
const basisUrl = (): string =>
  process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';

/** Öffentliche Adresse für Links IN den Mails — nie localhost beim Kunden. */
const oeffentlicheUrl = (): string =>
  process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.VITE_PORTAL_PUBLIC_URL || '';

/**
 * Zentrale E-Mail-Signatur aus den Stammdaten — dieselbe Quelle wie das Portal
 * (emailTemplates.standardSignatur). Die Function läuft ohne Login, deshalb
 * bleibt die neutrale Team-Grußzeile. Ein Ladefehler kostet nur die Signatur,
 * nie die Bestellung.
 */
const ladeSignatur = async (db: string): Promise<string> => {
  try {
    const res = await fetch(
      `${APPWRITE_ENDPOINT}/databases/${db}/collections/stammdaten/documents/stammdaten_data`,
      { headers: headers() }
    );
    if (!res.ok) return '';
    const doc = (await res.json()) as { emailTemplates?: string };
    const templates = JSON.parse(doc.emailTemplates ?? '{}') as { standardSignatur?: string };
    const signatur = typeof templates.standardSignatur === 'string' ? templates.standardSignatur : '';
    return signatur.replace(/\{absender\}/g, 'Ihr Team der Tennismehl GmbH');
  } catch {
    return '';
  }
};

const sendeMail = async (
  an: string,
  betreff: string,
  html: string
): Promise<void> => {
  const basis = basisUrl();
  try {
    const res = await fetch(`${basis}/.netlify/functions/email-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: an, from: ABSENDER, subject: betreff, htmlBody: html }),
    });
    if (!res.ok) console.error(`Mail an ${an} fehlgeschlagen (HTTP ${res.status})`);
  } catch (fehler) {
    // Eine gescheiterte Benachrichtigung darf die Bestellung nicht kippen —
    // der Auftrag ist gespeichert, das ist der Teil, der zählt.
    console.error('Mailversand fehlgeschlagen:', fehler);
  }
};

/**
 * Zwei Mails nach der Bestellung — mit unterschiedlicher Sandbox-Regel:
 *
 * - Die BESTÄTIGUNG an den Kunden geht in der Sandbox an die Testadresse.
 *   Ein Testlauf darf keinen Verein erreichen.
 * - Die INTERNE Meldung geht immer an bestellung@tennismehl24.com, auch aus
 *   der Sandbox. Sie ist an uns selbst gerichtet; dort ist nichts zu schützen,
 *   und beim Testen will man sehen, dass sie ankommt.
 */
const versendeBestellmails = async (
  daten: ProjektDaten,
  projektId: string,
  token: string,
  sandbox: boolean,
  tonnage: number,
  summe: number
): Promise<void> => {
  const nummer = daten.angebotsnummer ?? '—';
  const kunde = daten.kundenname ?? 'Kunde';
  const basis = oeffentlicheUrl();
  const link = `${basis}/bestellung/${projektId}?token=${token}${sandbox ? '&sandbox=1' : ''}`;
  const liefer = daten.lieferadresse;
  const lieferZeile = liefer?.strasse
    ? `${liefer.strasse}, ${liefer.plz ?? ''} ${liefer.ort ?? ''}`
    : 'wie Rechnungsanschrift';

  // --- an den Kunden ---
  const kundenEmpfaenger = sandbox
    ? TEST_EMPFAENGER
    : (daten.bestellEmpfaenger as string | undefined) || '';
  if (kundenEmpfaenger) {
    const signatur = await ladeSignatur(datenbank(sandbox));
    await sendeMail(
      kundenEmpfaenger,
      `${sandbox ? '[SANDBOX] ' : ''}Ihre Bestellung ${nummer} — vielen Dank`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;">
  <p>Sehr geehrte Damen und Herren,</p>
  <p>vielen Dank für Ihre Bestellung. Wir haben sie erhalten und melden uns zur Terminabstimmung.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="margin:16px 0;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Angebot</td><td><strong>${nummer}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Menge</td><td>${tonnage} t</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Summe netto</td><td>${euro(summe)} €</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Lieferung an</td><td>${lieferZeile}</td></tr>
  </table>
  <p>Über den folgenden Link können Sie jederzeit Ihre Angaben ergänzen — Wunschtermin,
     Ansprechpartner vor Ort und Fotos der Schüttstelle:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr><td bgcolor="#16a34a" style="border-radius:12px;">
      <a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;
         font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#fff;
         text-decoration:none;border-radius:12px;">Bestellung ansehen</a>
    </td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px;">
    Fragen? Rufen Sie uns an: 09391 9870-0
  </p>
  ${signatur ? `<div style="margin-top:24px;">${signatur}</div>` : ''}
</div>`
    );
  }

  // --- an uns ---
  await sendeMail(
    INTERN_EMPFAENGER,
    `${sandbox ? '[SANDBOX] ' : ''}Neue Bestellung: ${kunde} — ${nummer}`,
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;">
  <p><strong>${kunde}</strong> hat über das Bestellportal bestellt.</p>
  ${sandbox ? '<p style="color:#b45309;"><strong>Achtung: Testlauf aus der Sandbox.</strong> Kein echter Auftrag.</p>' : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="margin:16px 0;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Angebot</td><td><strong>${nummer}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Menge</td><td>${tonnage} t</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Summe netto</td><td>${euro(summe)} €</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Lieferung an</td><td>${lieferZeile}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Wunschwoche</td><td>${daten.lieferwoche ?? '—'}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Kontakt vor Ort</td><td>${daten.dispoAnsprechpartner?.name ?? '—'}${daten.dispoAnsprechpartner?.telefon ? ` · ${daten.dispoAnsprechpartner.telefon}` : ''}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Fotos</td><td>${(daten.schuettstelleFotos ?? []).length}</td></tr>
  </table>
  <p style="background:#fef3c7;padding:12px;border-radius:8px;">
    <strong>Die Auftragsbestätigung wurde NICHT automatisch verschickt.</strong><br>
    Bitte in der Projektakte prüfen und von dort auslösen.
  </p>
</div>`
  );
};

/** Legt ein geprüftes Bild im privaten Bucket ab. Dateiname kommt vom Server. */
const speichereFoto = async (bytes: Buffer, endung: string, typ: string): Promise<string> => {
  const fileId = randomUUID().replace(/-/g, '').slice(0, 32);
  const grenze = `----tm${randomUUID().replace(/-/g, '')}`;
  const kopf = Buffer.from(
    `--${grenze}\r\nContent-Disposition: form-data; name="fileId"\r\n\r\n${fileId}\r\n` +
    `--${grenze}\r\nContent-Disposition: form-data; name="file"; filename="${fileId}.${endung}"\r\n` +
    `Content-Type: ${typ}\r\n\r\n`,
    'utf8'
  );
  const fuss = Buffer.from(`\r\n--${grenze}--\r\n`, 'utf8');
  const res = await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files`, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': APPWRITE_API_KEY,
      'Content-Type': `multipart/form-data; boundary=${grenze}`,
    },
    body: Buffer.concat([kopf, bytes, fuss]),
  });
  if (!res.ok) {
    const f = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(f.message || `Upload fehlgeschlagen (HTTP ${res.status})`);
  }
  return fileId;
};

const loescheFoto = async (fileId: string): Promise<void> => {
  await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY },
  }).catch(() => { /* verwaiste Datei ist harmlos, ein Abbruch hier nicht */ });
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    return antwort(500, { error: 'Serverkonfiguration unvollständig.' });
  }
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unbekannt';
  if (zuVieleVersuche(ip)) return antwort(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });

  try {
    // ---------- Lesen ----------
    if (event.httpMethod === 'GET') {
      const projektId = event.queryStringParameters?.projektId || '';
      const token = event.queryStringParameters?.token || '';
      const db = datenbank(event.queryStringParameters?.sandbox === '1');
      if (!projektId || !token) return antwort(400, { error: 'Link unvollständig.' });

      const doc = await ladeProjekt(projektId, db);
      if (!doc) return antwort(404, { error: 'Angebot nicht gefunden.' });
      const daten = parseDaten(doc);
      const zugang = pruefeZugang(daten, token);
      if (!zugang.ok) return antwort(zugang.abgelaufen ? 410 : 403, { error: zugang.grund });

      // Bildauslieferung: Der Bucket ist privat, also reicht die Function die
      // Bytes durch — erst nachdem der Token geprüft ist. Ein direkter
      // Bucket-Link wäre ein Zugang ohne jede Prüfung.
      const fotoId = event.queryStringParameters?.foto;
      if (fotoId) {
        const erlaubt = (daten.schuettstelleFotos ?? []).some((f) => f.fileId === fotoId);
        if (!erlaubt) return antwort(404, { error: 'Bild nicht gefunden.' });
        const res = await fetch(
          `${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files/${encodeURIComponent(fotoId)}/download`,
          { headers: { 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY } }
        );
        if (!res.ok) return antwort(404, { error: 'Bild nicht gefunden.' });
        const bytes = Buffer.from(await res.arrayBuffer());
        const typ = erkenneBildtyp(bytes)?.typ ?? 'application/octet-stream';
        return {
          statusCode: 200,
          headers: {
            'Content-Type': typ,
            'Cache-Control': 'private, max-age=3600',
            'Content-Disposition': 'inline',
          },
          body: bytes.toString('base64'),
          isBase64Encoded: true,
        };
      }

      const angebot = await ladeAngebot(projektId, db);
      const positionen = (angebot?.positionen ?? []).filter((p) => !p.istBedarfsposition);
      const summe = positionen.reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
      const tonnage = positionen
        .filter(istWarenTonnenPosition)
        .reduce((s, p) => s + Number(p.menge ?? 0), 0);

      return antwort(200, {
        kundenname: daten.kundenname,
        angebotsnummer: daten.angebotsnummer,
        status: doc.status,
        bestelltAm: daten.bestellungEingegangenAm ?? null,
        rechnungsnummer: daten.rechnungsnummer ?? null,
        rechnungsdatum: daten.rechnungsdatum ?? null,
        lieferwoche: daten.lieferwoche ?? null,
        positionen,
        summe: Math.round(summe * 100) / 100,
        tonnage,
        mengeMin: Math.round(tonnage * (1 - MENGEN_TOLERANZ) * 100) / 100,
        mengeMax: Math.round(tonnage * (1 + MENGEN_TOLERANZ) * 100) / 100,
        rechnungsadresse: daten.rechnungsadresse ?? { strasse: daten.kundenstrasse, ort: daten.kundenPlzOrt },
        lieferadresse: daten.lieferadresse ?? null,
        dispoAnsprechpartner: daten.dispoAnsprechpartner ?? null,
        fotos: (daten.schuettstelleFotos ?? []).map((f) => ({ fileId: f.fileId, hinweis: f.hinweis })),
        maxFotos: MAX_FOTOS,
      });
    }

    // ---------- Schreiben ----------
    if (event.httpMethod === 'POST') {
      const req = JSON.parse(event.body || '{}') as Record<string, unknown>;
      const projektId = text(req.projektId, 60) ?? '';
      const token = text(req.token, 120) ?? '';
      const aktion = text(req.aktion, 30) ?? '';
      const sandbox = req.sandbox === true || req.sandbox === '1';
      const db = datenbank(sandbox);
      if (!projektId || !token) return antwort(400, { error: 'Link unvollständig.' });

      const doc = await ladeProjekt(projektId, db);
      if (!doc) return antwort(404, { error: 'Angebot nicht gefunden.' });
      const daten = parseDaten(doc);
      const zugang = pruefeZugang(daten, token);
      if (!zugang.ok) return antwort(zugang.abgelaufen ? 410 : 403, { error: zugang.grund });

      const neu: ProjektDaten = { ...daten };
      const jetzt = new Date().toISOString();

      // Adressen und Dispo-Kontakt darf der Kunde jederzeit pflegen.
      const rechnungsadresse = adresse(req.rechnungsadresse);
      const lieferadresse = adresse(req.lieferadresse);
      if (rechnungsadresse) neu.rechnungsadresse = rechnungsadresse;
      if (lieferadresse) neu.lieferadresse = lieferadresse;
      if (req.dispoAnsprechpartner && typeof req.dispoAnsprechpartner === 'object') {
        const d = req.dispoAnsprechpartner as Record<string, unknown>;
        neu.dispoAnsprechpartner = {
          name: text(d.name, 120), telefon: text(d.telefon, 60), email: text(d.email, 200),
        };
      }
      const wunschwoche = text(req.lieferwoche, 20);
      if (wunschwoche) neu.lieferwoche = wunschwoche;

      const hinweis = text(req.hinweis, MAX_NOTIZ);
      if (hinweis) {
        neu.dispoNotizen = [
          ...(daten.dispoNotizen ?? []),
          { id: randomUUID(), text: `[Kundenportal] ${hinweis}`, erstelltAm: jetzt, wichtig: true },
        ];
      }

      if (aktion === 'foto-hochladen') {
        const vorhandene = daten.schuettstelleFotos ?? [];
        if (vorhandene.length >= MAX_FOTOS) {
          return antwort(400, { error: `Mehr als ${MAX_FOTOS} Bilder sind nicht möglich.` });
        }
        const roh = typeof req.datei === 'string' ? req.datei : '';
        const base64 = roh.includes(',') ? roh.split(',')[1] : roh;
        if (!base64) return antwort(400, { error: 'Kein Bild empfangen.' });

        let bytes: Buffer;
        try { bytes = Buffer.from(base64, 'base64'); }
        catch { return antwort(400, { error: 'Das Bild konnte nicht gelesen werden.' }); }
        if (bytes.length > MAX_FOTO_BYTES) {
          return antwort(413, { error: 'Das Bild ist zu groß. Bitte versuchen Sie es erneut.' });
        }
        const bildtyp = erkenneBildtyp(bytes);
        if (!bildtyp) return antwort(400, { error: 'Nur JPG- und PNG-Bilder sind möglich.' });

        const fileId = await speichereFoto(bytes, bildtyp.endung, bildtyp.typ);
        const neuesFoto: SchuettstelleFoto = {
          fileId, hochgeladenAm: jetzt, hinweis: text(req.hinweis, 200),
        };
        neu.schuettstelleFotos = [...vorhandene, neuesFoto];
        await speichereProjekt(projektId, neu, db);
        return antwort(200, { fileId, anzahl: neu.schuettstelleFotos.length });
      }

      if (aktion === 'foto-loeschen') {
        const fileId = text(req.fileId, 64) ?? '';
        const vorhandene = daten.schuettstelleFotos ?? [];
        if (!vorhandene.some((f) => f.fileId === fileId)) {
          return antwort(404, { error: 'Bild nicht gefunden.' });
        }
        await loescheFoto(fileId);
        neu.schuettstelleFotos = vorhandene.filter((f) => f.fileId !== fileId);
        await speichereProjekt(projektId, neu, db);
        return antwort(200, { anzahl: neu.schuettstelleFotos.length });
      }

      if (aktion === 'bestellen') {
        if (daten.bestellungEingegangenAm) {
          // Zweiter Besteller aus demselben Verteiler — kein Fehler, aber auch
          // keine zweite Bestellung. Die erste zählt.
          return antwort(200, { bereitsBestellt: true, bestelltAm: daten.bestellungEingegangenAm });
        }
        const angebot = await ladeAngebot(projektId, db);
        if (!angebot) return antwort(409, { error: 'Zu diesem Angebot fehlt das Dokument. Bitte rufen Sie uns an.' });

        // Menge: Wunsch des Kunden, aber nur innerhalb der Toleranz.
        const alteTonnage = angebot.positionen
          .filter(istWarenTonnenPosition)
          .reduce((s, p) => s + Number(p.menge ?? 0), 0);
        const gewuenscht = Number(req.menge);
        let tonnage = alteTonnage;
        if (Number.isFinite(gewuenscht) && gewuenscht > 0) {
          // Auf 2 Nachkommastellen gerundet — exakt die Grenzen, die die
          // Bestellseite anzeigt. Ungerundet lehnte der Server Eingaben ab,
          // die die Seite selbst als zulässig auswies (z. B. 7,43 bei 6,75 t).
          const min = Math.round(alteTonnage * (1 - MENGEN_TOLERANZ) * 100) / 100;
          const max = Math.round(alteTonnage * (1 + MENGEN_TOLERANZ) * 100) / 100;
          if (gewuenscht < min || gewuenscht > max) {
            return antwort(400, {
              error: `Die Menge lässt sich hier um ±10 % anpassen (${min.toFixed(2)} – ${max.toFixed(2)} t). ` +
                'Für größere Änderungen rufen Sie uns bitte an: 09391 9870-0.',
            });
          }
          tonnage = gewuenscht;
        }
        const { positionen, summe } = rechneUm(angebot.positionen, tonnage);

        neu.bestellungEingegangenAm = jetzt;
        neu.bestellungDaten = JSON.stringify({ tonnage, summe, positionen, bestelltAm: jetzt });
        // `status` UND `bestellungEingegangenAm` sind echte Spalten — sie müssen
        // dorthin, sonst findet die Projektliste die Bestellung nicht.
        await speichereProjekt(projektId, neu, db, {
          status: 'auftragsbestaetigung',
          bestellungEingegangenAm: jetzt,
        });
        await versendeBestellmails(
          { ...neu, angebotsnummer: daten.angebotsnummer }, projektId, token, sandbox, tonnage, summe
        );
        return antwort(200, { bestelltAm: jetzt, tonnage, summe, positionen });
      }

      await speichereProjekt(projektId, neu, db);
      return antwort(200, { gespeichert: true });
    }

    return antwort(405, { error: 'Methode nicht erlaubt.' });
  } catch (fehler) {
    console.error('bestellung:', fehler);
    return antwort(500, { error: 'Es ist ein Fehler aufgetreten. Bitte rufen Sie uns an: 09391 9870-0.' });
  }
};
