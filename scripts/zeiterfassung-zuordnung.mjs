/**
 * Verknüpft Portal-Konten mit Mitarbeiter-Datensätzen für die Zeiterfassung.
 *
 * Hintergrund: Das Portal hat vier voneinander unabhängige Personenstämme
 * (Appwrite-Konten, `schicht_mitarbeiter`, `fahrtkosten_personen`, `fahrer`) ohne
 * einen einzigen Fremdschlüssel dazwischen. Die Zeiterfassung braucht aber eine
 * eindeutige Antwort auf „wer stempelt hier?" — deshalb trägt
 * `schicht_mitarbeiter.userId` die Appwrite-User-ID als echtes Attribut.
 *
 * Ohne Zuordnung kann sich ein Benutzer nicht selbst stempeln (die Fassade
 * antwortet mit 403). Das ist Absicht: ein Stempel ohne eindeutigen Träger wäre
 * als Arbeitszeitnachweis wertlos.
 *
 * Nicht jeder braucht eine Zuordnung. Wer kein Portal-Konto hat — etwa eine
 * Aushilfe ohne Bildschirmarbeitsplatz — wird von der Zeitleitung miterfasst.
 *
 * Zweitens steuert das Skript, WER überhaupt der Erfassungspflicht unterliegt.
 * Gesellschafter-Geschäftsführer sind keine Arbeitnehmer: die Pflicht aus dem
 * BAG-Beschluss vom 13.09.2022 stützt sich auf § 3 Abs. 2 Nr. 1 ArbSchG, und das
 * Arbeitsschutzgesetz gilt für Beschäftigte. Wer befreit ist, bekommt keine
 * Stempelkarte und taucht nicht in der Team-Auswertung auf — sonst entstünden
 * dort laufend "Verstöße" gegen Grenzen, die für diese Person nicht gelten, und
 * die echten Warnungen bei den Angestellten gingen darin unter.
 *
 * Verwendung:
 *   node scripts/zeiterfassung-zuordnung.mjs                        Übersicht
 *   node scripts/zeiterfassung-zuordnung.mjs --set <maId> <userId>  verknüpfen
 *   node scripts/zeiterfassung-zuordnung.mjs --clear <maId>         Zuordnung lösen
 *   node scripts/zeiterfassung-zuordnung.mjs --befreien <maId>      keine Erfassungspflicht
 *   node scripts/zeiterfassung-zuordnung.mjs --pflichtig <maId>     Befreiung zurücknehmen
 *   ... zusätzlich --dry-run für eine Vorschau, --mock für die Sandbox
 */

import { Client, Databases, Users, Query } from 'node-appwrite';
import { readFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const MOCK = process.argv.includes('--mock');
const setIdx = process.argv.indexOf('--set');
const clearIdx = process.argv.indexOf('--clear');
const befreienIdx = process.argv.indexOf('--befreien');
const pflichtigIdx = process.argv.indexOf('--pflichtig');

// Muss zu MOCK_DATABASE_ID / PRODUKTIONS_DATABASE_ID aus src/config/appwriteEnv.ts passen.
const DB = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';
const COLL = 'schicht_mitarbeiter';

const env = {};
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error('❌ .env nicht lesbar. Skript im Projektverzeichnis ausführen.');
  process.exit(1);
}

const endpoint = env.VITE_APPWRITE_ENDPOINT || env.APPWRITE_ENDPOINT;
const projectId = env.VITE_APPWRITE_PROJECT_ID || env.APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ .env unvollständig: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY nötig.');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const users = new Users(client);

/** Name aus dem JSON-Blob lesen — die Collection hat außer istAktiv/userId keine echten Felder. */
const nameVon = (doc) => {
  try {
    const j = JSON.parse(doc.data || '{}');
    return `${j.vorname ?? ''} ${j.nachname ?? ''}`.trim() || doc.$id;
  } catch {
    return doc.$id;
  }
};

const ladeMitarbeiter = async () => {
  const res = await db.listDocuments(DB, COLL, [Query.limit(200)]);
  return res.documents;
};

async function uebersicht() {
  const [mitarbeiter, konten] = await Promise.all([ladeMitarbeiter(), users.list()]);
  const kontoVon = new Map(konten.users.map((u) => [u.$id, u]));

  console.log(`\n📋 Mitarbeiter in ${DB}:\n`);
  for (const m of mitarbeiter) {
    const konto = m.userId ? kontoVon.get(m.userId) : null;
    const zustand = !m.userId
      ? '— keine Zuordnung (wird von der Zeitleitung miterfasst)'
      : konto
        ? `→ ${konto.name || konto.email}  (${m.userId})`
        : `⚠️  verweist auf ein gelöschtes Konto (${m.userId})`;
    const befreit = m.keineErfassungspflicht === true;
    console.log(`  ${befreit ? '⊘' : m.istAktiv ? '●' : '○'} ${nameVon(m).padEnd(26)} ${m.$id}`);
    console.log(`     ${zustand}`);
    if (befreit) {
      console.log('     ⊘ keine Erfassungspflicht (Geschäftsführung) — kein Stempeln, nicht in der Auswertung');
    }
  }

  const zugeordnet = new Set(mitarbeiter.map((m) => m.userId).filter(Boolean));
  const offen = konten.users.filter((u) => !zugeordnet.has(u.$id));
  if (offen.length) {
    console.log('\n🔑 Portal-Konten ohne Mitarbeiter-Zuordnung:\n');
    for (const u of offen) {
      console.log(`  ${(u.name || '(ohne Namen)').padEnd(26)} ${u.$id}   ${u.email}`);
    }
  }

  console.log('\n● = aktiv   ○ = inaktiv   ⊘ = keine Erfassungspflicht');
  console.log('Verknüpfen:  node scripts/zeiterfassung-zuordnung.mjs --set <mitarbeiterId> <userId>\n');
}

async function setzeZuordnung(mitarbeiterId, userId) {
  const alle = await ladeMitarbeiter();
  const ziel = alle.find((m) => m.$id === mitarbeiterId);
  if (!ziel) {
    console.error(`❌ Kein Mitarbeiter mit der ID ${mitarbeiterId} in ${DB}.`);
    process.exit(1);
  }

  if (userId) {
    try {
      await users.get(userId);
    } catch {
      console.error(`❌ Kein Portal-Konto mit der ID ${userId}.`);
      process.exit(1);
    }
    // Ein Konto darf nur auf EINEN Mitarbeiter zeigen — sonst wäre nicht
    // entscheidbar, wessen Stempel gebucht wird.
    const belegt = alle.find((m) => m.userId === userId && m.$id !== mitarbeiterId);
    if (belegt) {
      console.error(`❌ Dieses Konto ist bereits „${nameVon(belegt)}" zugeordnet. Dort zuerst lösen.`);
      process.exit(1);
    }
  }

  const vorher = ziel.userId || '(keine)';
  if (DRY_RUN) {
    console.log(`🔍 DRY-RUN — ${nameVon(ziel)}: ${vorher} → ${userId || '(keine)'}`);
    return;
  }

  await db.updateDocument(DB, COLL, mitarbeiterId, { userId: userId || null });
  console.log(`✅ ${nameVon(ziel)}: ${vorher} → ${userId || '(keine)'}`);
  if (userId) {
    console.log('   Die Person kann sich ab dem nächsten Laden des Portals selbst stempeln.');
  }
}

async function setzeBefreiung(mitarbeiterId, befreit) {
  const alle = await ladeMitarbeiter();
  const ziel = alle.find((m) => m.$id === mitarbeiterId);
  if (!ziel) {
    console.error(`❌ Kein Mitarbeiter mit der ID ${mitarbeiterId} in ${DB}.`);
    process.exit(1);
  }

  if ((ziel.keineErfassungspflicht === true) === befreit) {
    console.log(`✓ ${nameVon(ziel)} ist bereits ${befreit ? 'befreit' : 'erfassungspflichtig'} — nichts zu tun.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`🔍 DRY-RUN — ${nameVon(ziel)} würde ${befreit ? 'von der Erfassung befreit' : 'wieder erfassungspflichtig'}.`);
    return;
  }

  await db.updateDocument(DB, COLL, mitarbeiterId, { keineErfassungspflicht: befreit });
  if (befreit) {
    console.log(`✅ ${nameVon(ziel)}: keine Erfassungspflicht mehr.`);
    console.log('   Bereits erfasste Stempel bleiben erhalten und werden weiterhin angezeigt.');
  } else {
    console.log(`✅ ${nameVon(ziel)}: wieder erfassungspflichtig.`);
  }
}

console.log(`${DRY_RUN ? '🔍 DRY-RUN — es wird nichts geschrieben' : '✏️  SCHREIBMODUS'}  ·  Datenbank: ${DB}`);

if (setIdx > -1) {
  const [, maId, userId] = process.argv.slice(setIdx, setIdx + 3);
  if (!maId || !userId) {
    console.error('❌ Aufruf: --set <mitarbeiterId> <userId>');
    process.exit(1);
  }
  await setzeZuordnung(maId, userId);
} else if (befreienIdx > -1) {
  const maId = process.argv[befreienIdx + 1];
  if (!maId) {
    console.error('❌ Aufruf: --befreien <mitarbeiterId>');
    process.exit(1);
  }
  await setzeBefreiung(maId, true);
} else if (pflichtigIdx > -1) {
  const maId = process.argv[pflichtigIdx + 1];
  if (!maId) {
    console.error('❌ Aufruf: --pflichtig <mitarbeiterId>');
    process.exit(1);
  }
  await setzeBefreiung(maId, false);
} else if (clearIdx > -1) {
  const maId = process.argv[clearIdx + 1];
  if (!maId) {
    console.error('❌ Aufruf: --clear <mitarbeiterId>');
    process.exit(1);
  }
  await setzeZuordnung(maId, '');
} else {
  await uebersicht();
}
