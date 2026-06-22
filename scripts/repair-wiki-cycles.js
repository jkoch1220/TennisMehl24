/* Repariert zyklische/selbst-referenzierende Wiki-Seiten: setzt parentId auf null. */
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
    const q = [
      JSON.stringify({ method: 'limit', values: [100] }),
      JSON.stringify({ method: 'offset', values: [offset] }),
    ].map((s) => `queries[]=${encodeURIComponent(s)}`).join('&');
    const res = await fetch(`${endpoint}/databases/${DB}/collections/${COL}/documents?${q}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    all.push(...data.documents);
    if (data.documents.length < 100) break;
    offset += 100;
  }
  return all;
}

async function clearParent(id) {
  const res = await fetch(`${endpoint}/databases/${DB}/collections/${COL}/documents/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ data: { parentId: null } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

const main = async () => {
  const pages = await loadAll();
  const byId = new Map(pages.map((p) => [p.$id, p]));

  // Betroffen: Selbst-Eltern ODER Eltern-Kette führt zurück zur Seite (Zyklus)
  const broken = [];
  for (const p of pages) {
    let cur = p.parentId;
    const seen = new Set([p.$id]);
    while (cur) {
      if (seen.has(cur)) { broken.push(p); break; }
      seen.add(cur);
      cur = byId.get(cur)?.parentId;
    }
  }

  if (broken.length === 0) {
    console.log('✅ Keine zyklischen Seiten gefunden – nichts zu reparieren.');
    return;
  }

  console.log(`Repariere ${broken.length} Seite(n):`);
  for (const p of broken) {
    await clearParent(p.$id);
    console.log(`  ✅ "${p.title}" (${p.$id}) → parentId = null`);
  }
  console.log('\n✨ Fertig. Die Seiten erscheinen nun als oberste Ebene und können neu einsortiert werden.');
};

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
