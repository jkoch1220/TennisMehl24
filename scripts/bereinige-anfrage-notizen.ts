/**
 * Entfernt technische Vermerke aus dem Notizfeld der Anfragen.
 *
 *   npx tsx scripts/bereinige-anfrage-notizen.ts                 # Probelauf (Standard)
 *   npx tsx scripts/bereinige-anfrage-notizen.ts --scharf        # schreibt wirklich
 *   npx tsx scripts/bereinige-anfrage-notizen.ts --scharf --mock # in der Sandbox
 *
 * Hintergrund (Vorschlag „Kundennotiz ist Schrott, wenn nichts drinsteht", 09/2026):
 * Ein einmaliger Bereinigungslauf (scripts/bereinige-anfragen-altbestand.ts) hat
 * seinerzeit „Status nachgetragen aus E-Mail-Protokoll" in `notizen` geschrieben.
 * Stand 04.09.2026 trugen 98 von 99 gefüllten Notizfeldern genau diesen Satz. Im
 * Anfragen-Dialog erschien dadurch bei fast jeder Anfrage ein auffälliger Kasten
 * „Wichtige Kundennotiz" — ohne eine einzige Information für den Bearbeiter.
 *
 * Der Vermerk hat seinen Zweck erfüllt (der Status IST nachgetragen) und steht
 * jetzt nur noch im Weg. Das Portal blendet ihn ohnehin aus (utils/anfrageNotiz.ts);
 * dieses Skript räumt zusätzlich die Daten auf, damit die Felder auch in Exporten
 * und in der Appwrite-Konsole sauber sind.
 *
 * Sicherheiten: Probelauf ist Standard. Vor dem scharfen Lauf wird eine Sicherung
 * geschrieben. Entfernt werden ausschließlich exakt passende Zeilen — steht neben
 * dem Vermerk eine echte Notiz, bleibt sie erhalten.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const SCHARF = args.includes('--scharf');
const MOCK = args.includes('--mock');
const DB = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';

const env: Record<string, string> = {};
for (const zeile of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = zeile.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const KEY = env.APPWRITE_API_KEY;
if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('❌ Appwrite-Zugangsdaten fehlen in .env');
  process.exit(1);
}
const kopf = { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY, 'Content-Type': 'application/json' };

/** Muss mit TECHNISCHE_VERMERKE in src/utils/anfrageNotiz.ts übereinstimmen. */
const TECHNISCHE_VERMERKE = [/^Status nachgetragen aus E-Mail-Protokoll\.?$/i];

const bereinige = (notizen: string): string =>
  notizen
    .split('\n')
    .filter((z) => z.trim() !== '' && !TECHNISCHE_VERMERKE.some((r) => r.test(z.trim())))
    .join('\n')
    .trim();

const mitWiederholung = async (fn: () => Promise<Response>): Promise<Response> => {
  for (let versuch = 0; ; versuch++) {
    const r = await fn();
    if (r.status !== 429 || versuch >= 8) return r;
    await new Promise((w) => setTimeout(w, 3000 * (versuch + 1)));
  }
};

const ladeAlle = async () => {
  const alle: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [JSON.stringify({ method: 'limit', values: [100] })];
    if (cursor) queries.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));
    const q = queries.map((x) => `queries[]=${encodeURIComponent(x)}`).join('&');
    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/anfragen/documents?${q}`, { headers: kopf })
    );
    if (!r.ok) throw new Error(`Laden fehlgeschlagen: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const res = (await r.json()) as { documents: Array<Record<string, unknown>> };
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = String(res.documents[res.documents.length - 1].$id);
  }
  return alle;
};

const main = async () => {
  console.log(`Datenbank: ${DB}${SCHARF ? '  — SCHARFER LAUF' : '  (Probelauf)'}`);
  const dokumente = await ladeAlle();

  const betroffen = dokumente
    .map((d) => ({ id: String(d.$id), alt: String(d.notizen ?? '') }))
    .filter((d) => d.alt.trim() !== '')
    .map((d) => ({ ...d, neu: bereinige(d.alt) }))
    .filter((d) => d.neu !== d.alt.trim());

  console.log(`Anfragen gesamt: ${dokumente.length}`);
  console.log(`Zu bereinigen:   ${betroffen.length}`);
  const behalten = betroffen.filter((d) => d.neu !== '');
  console.log(`Davon behalten eine echte Notiz: ${behalten.length}`);

  if (betroffen.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }

  for (const d of betroffen.slice(0, 5)) {
    console.log(`  ${d.id}: ${JSON.stringify(d.alt).slice(0, 70)} → ${JSON.stringify(d.neu).slice(0, 50)}`);
  }
  if (betroffen.length > 5) console.log(`  … und ${betroffen.length - 5} weitere`);

  if (!SCHARF) {
    console.log('\nProbelauf — nichts geschrieben. Mit --scharf ausführen.');
    return;
  }

  // Das Verzeichnis fehlt im frischen Arbeitsbaum (`backups/` ist nicht
  // eingecheckt) — ohne mkdir bricht der scharfe Lauf hier ab, nachdem der
  // Nutzer ihn bewusst gestartet hat.
  const ordner = path.resolve(process.cwd(), 'backups');
  mkdirSync(ordner, { recursive: true });
  const sicherung = path.join(ordner, `anfrage-notizen-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(sicherung, JSON.stringify(betroffen, null, 2));
  console.log(`\nSicherung: ${sicherung}`);

  let geschrieben = 0;
  let fehler = 0;
  for (const d of betroffen) {
    // Appwrite-REST erwartet die Felder in einem `data`-Wrapper.
    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/anfragen/documents/${d.id}`, {
        method: 'PATCH',
        headers: kopf,
        body: JSON.stringify({ data: { notizen: d.neu } }),
      })
    );
    if (r.ok) {
      geschrieben++;
    } else {
      fehler++;
      console.error(`  ❌ ${d.id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
  }
  console.log(`\nGeschrieben: ${geschrieben}, Fehler: ${fehler}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
