/**
 * Legt den Storage-Bucket für den digitalen QR-Liefernachweis an:
 * - `liefernachweis-dateien` — Fotos (JPEG) und Unterschriften (PNG) der
 *   Fahrer-Bestätigungen. Das archivierte Liefernachweis-PDF selbst liegt im
 *   bestehenden Bucket `bestellabwicklung_dateien` (GoBD, wie alle Dokumente).
 *
 * Schreibzugriff erfolgt AUSSCHLIESSLICH serverseitig über die Netlify
 * Function (API-Key). Lesezugriff: eingeloggte Portal-Nutzer (read("users")),
 * damit Foto/Unterschrift im Portal angezeigt werden können.
 *
 * Es sind KEINE neuen Collection-Attribute nötig: die Liefernachweis-Felder
 * (liefernachweisToken, liefernachweisTokenErstelltAm, liefernachweisAm,
 * liefernachweis) liegen im data-JSON der Collection `projekte` (Muster
 * abVersendetAm), und `bestellabwicklung_dokumente.dokumentTyp` ist ein freies
 * String-Attribut (neuer Wert: 'liefernachweis').
 *
 * Idempotent: existiert der Bucket bereits, wird nichts geändert.
 *
 * Ausführen mit: node scripts/add-liefernachweis-bucket.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const BUCKET_ID = 'liefernachweis-dateien';
const BUCKET_NAME = 'Liefernachweis-Dateien (Fotos & Unterschriften)';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / _PROJECT_ID / APPWRITE_API_KEY)!');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function bucketExists() {
  const res = await fetch(`${endpoint}/storage/buckets/${BUCKET_ID}`, {
    method: 'GET',
    headers,
  });
  return res.ok;
}

async function createBucket() {
  console.log(`📝 Erstelle Storage-Bucket: ${BUCKET_ID}...`);

  const res = await fetch(`${endpoint}/storage/buckets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bucketId: BUCKET_ID,
      name: BUCKET_NAME,
      // Bucket-Level-Permissions: eingeloggte Nutzer dürfen lesen,
      // Schreiben nur über den Server-API-Key (Netlify Function).
      permissions: ['read("users")'],
      fileSecurity: false,
      enabled: true,
      maximumFileSize: MAX_FILE_SIZE,
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
      compression: 'none',
      encryption: true,
      antivirus: true,
    }),
  });

  if (res.ok) {
    console.log(`✅ Bucket erstellt: ${BUCKET_ID}`);
    return true;
  }

  const error = await res.json().catch(() => ({}));
  console.error(`❌ Fehler beim Erstellen von ${BUCKET_ID}:`, error.message || res.status);
  return false;
}

async function main() {
  console.log('🔧 Digitaler QR-Liefernachweis: Storage-Bucket\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Bucket:   ${BUCKET_ID}\n`);

  if (await bucketExists()) {
    console.log(`✅ Bucket "${BUCKET_ID}" existiert bereits – nichts zu tun.`);
    return;
  }

  const created = await createBucket();
  if (!created) {
    console.error('\n❌ Migration unvollständig.');
    process.exit(1);
  }

  console.log('\n✨ Fertig! Fahrer-Fotos und Unterschriften können jetzt abgelegt werden.');
  console.log('ℹ️  Nicht vergessen: APPWRITE_API_KEY muss auch als Netlify-Umgebungsvariable gesetzt sein.');
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
