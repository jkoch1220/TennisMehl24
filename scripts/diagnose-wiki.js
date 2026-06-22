/* Diagnose: lädt alle wiki_pages und sucht nach Ursachen für den /wiki-Freeze. */
import dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;
const DB = 'tennismehl24_db';
const COL = 'wiki_pages';

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function loadAll() {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${endpoint}/databases/${DB}/collections/${COL}/documents?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}&queries[]=${encodeURIComponent(JSON.stringify({ method: 'offset', values: [offset] }))}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error('Fehler:', res.status, await res.text());
      break;
    }
    const data = await res.json();
    all.push(...data.documents);
    if (data.documents.length < 100) break;
    offset += 100;
  }
  return all;
}

function detectCycles(pages) {
  const byId = new Map(pages.map((p) => [p.$id, p]));
  const problems = [];
  for (const p of pages) {
    let cur = p.parentId;
    const seen = new Set([p.$id]);
    let steps = 0;
    while (cur) {
      if (seen.has(cur)) {
        problems.push({ id: p.$id, title: p.title, type: cur === p.$id ? 'self-parent' : 'cycle', chain: [...seen, cur] });
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.parentId;
      if (++steps > 1000) {
        problems.push({ id: p.$id, title: p.title, type: 'runaway', chain: [...seen] });
        break;
      }
    }
  }
  return problems;
}

const main = async () => {
  console.log('Lade wiki_pages…');
  const pages = await loadAll();
  console.log(`Seiten gesamt: ${pages.length}\n`);

  // 1) Zyklen / Selbst-Eltern / fehlende Parents
  const cycles = detectCycles(pages);
  console.log(`== Zyklen / Selbst-Eltern: ${cycles.length} ==`);
  cycles.forEach((c) => console.log(`  [${c.type}] "${c.title}" (${c.id})  Kette: ${c.chain.join(' → ')}`));

  const byId = new Set(pages.map((p) => p.$id));
  const danglingParent = pages.filter((p) => p.parentId && !byId.has(p.parentId));
  console.log(`\n== parentId zeigt auf nicht-existente Seite: ${danglingParent.length} ==`);
  danglingParent.forEach((p) => console.log(`  "${p.title}" (${p.id}) → ${p.parentId}`));

  const selfParent = pages.filter((p) => p.parentId === p.$id);
  console.log(`\n== Selbst-Eltern (parentId === $id): ${selfParent.length} ==`);
  selfParent.forEach((p) => console.log(`  "${p.title}" (${p.id})`));

  // 2) Inhaltsgrößen (riesige base64-Bilder?)
  const sized = pages
    .map((p) => ({ title: p.title, id: p.$id, len: (p.content || '').length, b64: ((p.content || '').match(/data:image\//g) || []).length }))
    .sort((a, b) => b.len - a.len);
  console.log('\n== Größte Inhalte (Top 8) ==');
  sized.slice(0, 8).forEach((s) => console.log(`  ${s.len.toString().padStart(8)} Zeichen, ${s.b64} base64-Bilder  "${s.title}"`));

  // 3) Defekte Felder
  const noId = pages.filter((p) => !p.$id);
  console.log(`\n== Seiten ohne $id: ${noId.length} ==`);
};

main().catch((e) => { console.error(e); process.exit(1); });
