/**
 * Legt Testvorgänge für die digitale Lieferbestätigung an — AUSSCHLIESSLICH in
 * der Sandbox (`tennismehl24_db_mock`).
 *
 * Zweck: Beide Abläufe am Rechner durchspielen, ohne einen echten Auftrag
 * anzufassen und ohne dass eine Mail bei einem Verein landet.
 *
 *   node scripts/test-lieferbestaetigung.mjs [--email deine@adresse.de] [--basis http://localhost:8888]
 *
 * Danach stehen zwei Links bereit:
 *   - ABHOLUNG:    Abholer unterschreibt digital, Lieferschein geht per Mail raus
 *   - AUSLIEFERUNG: Fahrer bestätigt mit Foto und Wiegeschein
 *
 * Die Links tragen `&mock=1`; die Netlify Function schaltet damit Datenbank und
 * Buckets auf die Sandbox um. E-Mails gehen dadurch an die Testadresse, nie an
 * einen Kunden.
 *
 * Aufräumen: node scripts/test-lieferbestaetigung.mjs --loeschen
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// .env laden, ohne Abhängigkeit auf dotenv (das Skript läuft auch aus fremden Verzeichnissen)
for (const zeile of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const treffer = zeile.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (treffer) process.env[treffer[1]] ??= treffer[2].replace(/^["']|["']$/g, '');
}

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
const KEY = process.env.APPWRITE_API_KEY;

/**
 * Harte Sperre: Dieses Skript schreibt Testdaten und darf die Produktion NIE
 * berühren. Die ID steht hier fest und kommt nicht aus einem Parameter.
 */
const SANDBOX_DB = 'tennismehl24_db_mock';
const DOKUMENTE_BUCKET = 'mock_bestellabwicklung_dateien';
const KENNUNG = 'TESTLAUF-LIEFERBESTAETIGUNG';

const argument = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard;
};

const EMAIL = argument('--email', 'jtatwcook@gmail.com');
const BASIS = argument('--basis', 'http://localhost:8888').replace(/\/+$/, '');
const NUR_LOESCHEN = process.argv.includes('--loeschen');

const kopf = () => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': PROJECT,
  'X-Appwrite-Key': KEY,
});

const token = () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

const anlegen = async (daten) => {
  const res = await fetch(
    `${ENDPOINT}/databases/${SANDBOX_DB}/collections/projekte/documents`,
    {
      method: 'POST',
      headers: kopf(),
      body: JSON.stringify({ documentId: 'unique()', data: daten }),
    }
  );
  if (!res.ok) throw new Error(`Anlegen fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
};

const alteTestvorgaenge = async () => {
  const q = [
    { method: 'equal', attribute: 'projektName', values: [KENNUNG] },
    { method: 'limit', values: [50] },
  ].map((o) => `queries[]=${encodeURIComponent(JSON.stringify(o))}`).join('&');
  const res = await fetch(
    `${ENDPOINT}/databases/${SANDBOX_DB}/collections/projekte/documents?${q}`,
    { headers: kopf() }
  );
  if (!res.ok) return [];
  return (await res.json()).documents ?? [];
};

const loeschen = async (id) => {
  // Zuerst die archivierten Dokumente des Vorgangs, sonst bleiben Karteileichen
  // samt PDF im Bucket zurück.
  const q = [
    { method: 'equal', attribute: 'projektId', values: [id] },
    { method: 'limit', values: [25] },
  ].map((o) => `queries[]=${encodeURIComponent(JSON.stringify(o))}`).join('&');
  const res = await fetch(
    `${ENDPOINT}/databases/${SANDBOX_DB}/collections/bestellabwicklung_dokumente/documents?${q}`,
    { headers: kopf() }
  );
  if (res.ok) {
    for (const dok of (await res.json()).documents ?? []) {
      if (dok.dateiId) {
        await fetch(`${ENDPOINT}/storage/buckets/${DOKUMENTE_BUCKET}/files/${dok.dateiId}`, {
          method: 'DELETE',
          headers: kopf(),
        });
      }
      await fetch(
        `${ENDPOINT}/databases/${SANDBOX_DB}/collections/bestellabwicklung_dokumente/documents/${dok.$id}`,
        { method: 'DELETE', headers: kopf() }
      );
    }
  }
  await fetch(`${ENDPOINT}/databases/${SANDBOX_DB}/collections/projekte/documents/${id}`, {
    method: 'DELETE',
    headers: kopf(),
  });
};

/**
 * Legt einen schlichten Lieferschein als archiviertes Dokument ab.
 *
 * Zweck: Bei einer Abholung stellt die Function den archivierten Lieferschein
 * der Empfangsbestätigung voran — ohne ihn liefe der Test nur den Notfallpfad
 * ab („Empfangsbestätigung geht allein raus"). Das Blatt ist bewusst schlicht
 * und als Sandbox-Beleg markiert; das echte Layout entsteht im Portal.
 */
const legeTestLieferscheinAn = async (projektId, daten) => {
  const pdf = await PDFDocument.create();
  const seite = pdf.addPage();
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  let y = seite.getHeight() - 70;
  const zeile = (text, font = normal, size = 11, farbe = rgb(0, 0, 0)) => {
    seite.drawText(text, { x: 56, y, size, font, color: farbe });
    y -= size + 7;
  };
  zeile(`Lieferschein ${daten.lieferscheinnummer}`, fett, 18);
  zeile('SANDBOX-TESTBELEG - kein echter Lieferschein', normal, 10, rgb(0.7, 0.3, 0));
  y -= 10;
  zeile(daten.kundenname, fett);
  zeile(`${daten.lieferadresse.strasse}, ${daten.lieferadresse.plz} ${daten.lieferadresse.ort}`);
  y -= 10;
  zeile('Positionen:', fett);
  for (const pos of JSON.parse(daten.lieferscheinDaten).positionen) {
    zeile(`${pos.artikel} - ${pos.menge} ${pos.einheit}`);
  }
  y -= 20;
  zeile('Diese Seite steht im Test fuer den echten Lieferschein aus dem Portal.', normal, 9, rgb(0.4, 0.4, 0.4));
  zeile('Die Empfangsbestaetigung des Abholers folgt auf der naechsten Seite.', normal, 9, rgb(0.4, 0.4, 0.4));

  const bytes = await pdf.save();
  const dateiname = `Lieferschein ${daten.lieferscheinnummer} (Sandbox).pdf`;

  const form = new FormData();
  form.append('fileId', 'unique()');
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), dateiname);
  const up = await fetch(`${ENDPOINT}/storage/buckets/${DOKUMENTE_BUCKET}/files`, {
    method: 'POST',
    headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: form,
  });
  if (!up.ok) throw new Error(`Lieferschein-Upload fehlgeschlagen: ${await up.text()}`);
  const datei = await up.json();

  const eintrag = await fetch(
    `${ENDPOINT}/databases/${SANDBOX_DB}/collections/bestellabwicklung_dokumente/documents`,
    {
      method: 'POST',
      headers: kopf(),
      body: JSON.stringify({
        documentId: 'unique()',
        data: {
          projektId,
          dokumentTyp: 'lieferschein',
          dokumentNummer: daten.lieferscheinnummer,
          dateiId: datei.$id,
          dateiname,
          istFinal: false,
          daten: daten.lieferscheinDaten,
        },
      }),
    }
  );
  if (!eintrag.ok) throw new Error(`Lieferschein-Eintrag fehlgeschlagen: ${await eintrag.text()}`);
};

/** Gemeinsame Grunddaten beider Testfälle */
const basisDaten = (belieferungsart, lieferscheinnummer) => {
  const positionen = [
    { artikel: 'Tennissand 0/2 rot, lose', artikelnummer: 'TM-TS-02', menge: 12, einheit: 't' },
    { artikel: 'Abdeckfolie PE 8x50m', artikelnummer: 'TM-PE', menge: 2, einheit: 'Stk' },
  ];
  return {
    projektName: KENNUNG,
    kundenname: 'TC Testverein e.V. (Sandbox)',
    kundennummer: '99999',
    kundenstrasse: 'Am Sportplatz 3',
    kundenPlzOrt: '97232 Giebelstadt',
    kundenEmail: EMAIL,
    saisonjahr: new Date().getFullYear(),
    status: 'lieferschein',
    dispoStatus: 'geplant',
    belieferungsart,
    lieferscheinnummer,
    lieferdatum: new Date().toISOString().slice(0, 10),
    beauftragteTonnen: 12,
    lieferadresse: { strasse: 'Am Sportplatz 3', plz: '97232', ort: 'Giebelstadt' },
    lieferscheinDaten: JSON.stringify({ lieferscheinnummer, belieferungsart, positionen }),
    liefernachweisToken: token(),
    liefernachweisTokenErstelltAm: new Date().toISOString(),
    erstelltAm: new Date().toISOString(),
    geaendertAm: new Date().toISOString(),
  };
};

const main = async () => {
  if (!ENDPOINT || !PROJECT || !KEY) {
    console.error('❌ VITE_APPWRITE_ENDPOINT / _PROJECT_ID / APPWRITE_API_KEY fehlen in .env');
    process.exit(1);
  }

  const alt = await alteTestvorgaenge();
  if (alt.length) {
    for (const d of alt) await loeschen(d.$id);
    console.log(`🧹 ${alt.length} alte Testvorgang/-vorgänge entfernt.`);
  }
  if (NUR_LOESCHEN) {
    console.log('Fertig — nichts Neues angelegt.');
    return;
  }

  const faelle = [
    { art: 'ABHOLUNG AB WERK', belieferungsart: 'abholung_ab_werk', nummer: 'LS-TEST-ABHOLUNG' },
    { art: 'AUSLIEFERUNG (Fahrer)', belieferungsart: 'mit_haenger', nummer: 'LS-TEST-LIEFERUNG' },
  ];

  console.log(`\n📦 Testvorgänge in der Sandbox (${SANDBOX_DB})\n`);
  for (const fall of faelle) {
    const daten = basisDaten(fall.belieferungsart, fall.nummer);
    // `status` ist zusätzlich echte Spalte und wird beim Lesen bevorzugt.
    const doc = await anlegen({
      // Pflichtspalten der Collection (kundeId, kundenname, saisonjahr, status,
      // erstelltAm, geaendertAm, projektName); alles Weitere liest die Function
      // aus `data`.
      kundeId: 'sandbox-testkunde',
      kundenname: daten.kundenname,
      projektName: daten.projektName,
      saisonjahr: daten.saisonjahr,
      status: daten.status,
      erstelltAm: daten.erstelltAm,
      geaendertAm: daten.geaendertAm,
      data: JSON.stringify(daten),
    });
    // Nur bei der Abholung: Ohne archivierten Lieferschein liefe der Test am
    // Normalfall vorbei (die Function stellt ihn der Empfangsbestätigung voran).
    if (fall.belieferungsart === 'abholung_ab_werk') {
      await legeTestLieferscheinAn(doc.$id, daten);
    }

    const url = `${BASIS}/liefernachweis/${doc.$id}?token=${daten.liefernachweisToken}&mock=1`;
    console.log(`── ${fall.art}`);
    console.log(`   ${url}\n`);
  }

  console.log('E-Mails gehen an die Testadresse, nicht an Kunden.');
  console.log(`Aufräumen: node scripts/test-lieferbestaetigung.mjs --loeschen\n`);
};

main().catch((fehler) => {
  console.error('❌', fehler.message);
  process.exit(1);
});
