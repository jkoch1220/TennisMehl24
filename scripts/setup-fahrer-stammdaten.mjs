/**
 * Legt das Feld `istFremdfahrer` an der Collection `fahrer` an und befüllt den
 * Fahrerstamm mit den Fahrern aus der abgelösten Excel-Dispoplanung.
 *
 * Hintergrund: Die Collection `fahrer` war leer, obwohl der fahrerService
 * vollständig implementiert ist. Die Wochenplanung braucht die Fahrer als
 * Rasterachse.
 *
 * Idempotent: bestehende Felder und bereits angelegte Fahrer (Abgleich über den
 * Namen) werden übersprungen, nichts wird überschrieben.
 *
 * Aufruf:  node scripts/setup-fahrer-stammdaten.mjs [--dry-run]
 */

import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = 'tennismehl24_db';
const collectionId = 'fahrer';

if (!endpoint || !projectId || !apiKey) {
  console.error(
    '❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein'
  );
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const basis = `${endpoint}/databases/${databaseId}/collections/${collectionId}`;

/**
 * Fahrer aus der Excel-Dispoplanung 2026, sortiert nach Einsatzhäufigkeit.
 * Fremdfahrer sind Subunternehmer, die gleichberechtigt in der Planung stehen.
 */
const FAHRER = [
  { name: 'Marco', istFremdfahrer: false, notizen: 'Excel 2026: 47 Touren' },
  { name: 'Olaf', istFremdfahrer: false, notizen: 'Excel 2026: 40 Touren' },
  { name: 'Jochen', istFremdfahrer: false, notizen: 'Excel 2026: 11 Touren' },
  { name: 'Andy', istFremdfahrer: false, notizen: 'Excel 2026: 7 Touren' },
  { name: 'Heiko', istFremdfahrer: false, notizen: 'Excel 2026: 5 Touren' },
  { name: 'Heiko 2', istFremdfahrer: false, notizen: 'Excel 2026: 2 Touren' },
  { name: 'Felix', istFremdfahrer: false, notizen: 'Excel 2026: 2 Touren (dort auch "Fleix")' },
  { name: 'Michelbau', istFremdfahrer: true, notizen: 'Subunternehmer. Excel 2026: 8 Touren' },
  {
    name: 'Bäuschlein',
    istFremdfahrer: true,
    notizen: 'Subunternehmer. Excel 2026: 7 Touren, dort auch "4 Achs Beuschlein"',
  },
  { name: 'Haaf', istFremdfahrer: true, notizen: 'Subunternehmer. Excel 2026: 2 Touren' },
  { name: 'Tadäus', istFremdfahrer: true, notizen: 'Subunternehmer. Excel 2026: 1 Tour' },
];

const STANDARD_VERFUEGBARKEIT = {
  montag: true,
  dienstag: true,
  mittwoch: true,
  donnerstag: true,
  freitag: true,
  samstag: false,
};

async function anfrage(pfad, optionen = {}) {
  const antwort = await fetch(`${basis}${pfad}`, { headers, ...optionen });
  const daten = await antwort.json().catch(() => ({}));
  return { ok: antwort.ok, daten };
}

async function legeBooleanFeldAn(key, defaultValue) {
  const { ok, daten } = await anfrage('/attributes', { method: 'GET' });
  if (!ok) {
    console.error(`   ❌ Attribute nicht lesbar: ${daten.message}`);
    return false;
  }
  if (daten.attributes?.some((a) => a.key === key)) {
    console.log(`   ⏭️  Feld "${key}" existiert bereits`);
    return true;
  }
  if (DRY_RUN) {
    console.log(`   [dry-run] würde Feld "${key}" (boolean, default ${defaultValue}) anlegen`);
    return true;
  }
  const res = await anfrage('/attributes/boolean', {
    method: 'POST',
    body: JSON.stringify({ key, required: false, default: defaultValue }),
  });
  if (res.ok) {
    console.log(`   ✅ Feld "${key}" angelegt`);
    // Appwrite legt Attribute asynchron an; kurz warten, bevor geschrieben wird.
    await new Promise((r) => setTimeout(r, 2000));
    return true;
  }
  if (res.daten.message?.includes('already exists')) {
    console.log(`   ⏭️  Feld "${key}" existiert bereits`);
    return true;
  }
  console.error(`   ❌ ${res.daten.message}`);
  return false;
}

async function ladeVorhandeneFahrer() {
  const query = encodeURIComponent(JSON.stringify({ method: 'limit', values: [200] }));
  const { ok, daten } = await anfrage(`/documents?queries[0]=${query}`, {
    method: 'GET',
  });
  if (!ok) {
    console.error(`   ❌ Fahrer nicht lesbar: ${daten.message}`);
    return null;
  }
  return daten.documents ?? [];
}

async function main() {
  console.log(`\n🚚 Fahrer-Stammdaten einrichten${DRY_RUN ? '  [DRY-RUN, keine Änderungen]' : ''}`);
  console.log(`   Datenbank: ${databaseId} / ${collectionId}\n`);

  console.log('1) Schema');
  if (!(await legeBooleanFeldAn('istFremdfahrer', false))) process.exit(1);

  console.log('\n2) Fahrerstamm');
  const vorhandene = await ladeVorhandeneFahrer();
  if (vorhandene === null) process.exit(1);

  const bekannteNamen = new Set(vorhandene.map((d) => String(d.name).trim().toLowerCase()));
  console.log(`   Vorhandene Fahrer: ${vorhandene.length}`);

  let angelegt = 0;
  let uebersprungen = 0;

  for (const fahrer of FAHRER) {
    if (bekannteNamen.has(fahrer.name.trim().toLowerCase())) {
      console.log(`   ⏭️  ${fahrer.name} — existiert bereits`);
      uebersprungen++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `   [dry-run] würde anlegen: ${fahrer.name}${fahrer.istFremdfahrer ? ' (Fremdfahrer)' : ''}`
      );
      angelegt++;
      continue;
    }

    const res = await anfrage('/documents', {
      method: 'POST',
      body: JSON.stringify({
        documentId: 'unique()',
        data: {
          name: fahrer.name,
          telefon: null,
          email: null,
          fuehrerscheinklassen: JSON.stringify(['CE']),
          verfuegbarkeit: JSON.stringify(STANDARD_VERFUEGBARKEIT),
          bevorzugtesFahrzeugId: null,
          maxArbeitszeitMinuten: 540,
          pausenregelMinuten: 45,
          notizen: fahrer.notizen,
          aktiv: true,
          istFremdfahrer: fahrer.istFremdfahrer,
        },
      }),
    });

    if (res.ok) {
      console.log(`   ✅ ${fahrer.name}${fahrer.istFremdfahrer ? ' (Fremdfahrer)' : ''}`);
      angelegt++;
    } else {
      console.error(`   ❌ ${fahrer.name}: ${res.daten.message}`);
    }
  }

  console.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}Fertig: ${angelegt} angelegt, ${uebersprungen} übersprungen.`
  );
  if (DRY_RUN) console.log('Zum Ausführen ohne --dry-run erneut starten.\n');
}

main().catch((error) => {
  console.error('❌ Unerwarteter Fehler:', error);
  process.exit(1);
});
