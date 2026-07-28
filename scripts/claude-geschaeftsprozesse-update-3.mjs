// Update 3: QR-Liefernachweis ist implementiert — Dispo-Board um den Schritt
// "QR-Bestätigung beim Abladen" (Standard) mit Papier-Fallback ergänzen.
// Ausführen:  node scripts/claude-geschaeftsprozesse-update-3.mjs
import { Client, Databases, Query } from 'node-appwrite';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();
const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = 'tennismehl24_db';
const NODES = 'mindmap_nodes';
const DISPO_BOARD = '6a67174c00075087ee4f';

const res = await db.listDocuments(DB, NODES, [Query.equal('boardId', DISPO_BOARD), Query.limit(100)]);
const nodes = res.documents;
const byTitle = (t) => nodes.find((n) => n.titel === t);

const beladung = byTitle('Beladung & Auslieferung');
const papier = byTitle('Liefernachweis zurück ins Büro');
if (!beladung || !papier) throw new Error('Erwartete Nodes nicht gefunden');

// Lieferschein-Schritt: QR-Hinweis ergänzen
const lsNode = byTitle('Lieferschein erstellen');
await db.updateDocument(DB, NODES, lsNode.$id, {
  beschreibung:
    'Projektabwicklung → Tab „Lieferschein": Positionen ohne Preise, Ladeort, PE-Folien, Empfangsbestätigung. ' +
    'Der Lieferschein enthält automatisch einen QR-CODE für die digitale Lieferbestätigung ' +
    '(„Beim Abladen scannen und Lieferung bestätigen"). Regel: Lieferschein spätestens am Vortag der Tour erstellen.',
});
console.log('Node "Lieferschein erstellen" aktualisiert');

// Neuer Standard-Weg: QR-Bestätigung beim Abladen
const qrId = randomUUID();
await db.createDocument(DB, NODES, qrId, {
  boardId: DISPO_BOARD,
  parentId: beladung.$id,
  type: 'knoten',
  titel: 'QR-Bestätigung beim Abladen (Standard)',
  collapsed: false,
  sortOrder: 0,
  edgeLabel: 'digital',
  beschreibung:
    'Der Speditionsfahrer scannt den QR-Code auf dem Lieferschein mit dem eigenen Smartphone — keine App, kein Login: ' +
    'Auftrag kompakt prüfen → großer Button „Abgeladen ✓" → 1 Pflichtfoto der abgeladenen Ware → optional Unterschrift + Name ' +
    '(bei Schüttgut ist oft niemand vor Ort). Dauer unter 20 Sekunden. ' +
    'Automatisch danach: Liefernachweis-PDF (Foto, ggf. Unterschrift, Zeitstempel, Positionen ohne Preise) wird GoBD-konform ' +
    'archiviert, das Projekt springt auf dispoStatus „geliefert". Doppel-Scan zeigt nur „bereits bestätigt". ' +
    'Der QR-Link ist 30 Tage gültig und nicht erratbar.',
  werkzeuge: 'Smartphone des Fahrers (QR-Scan)',
  edgeLabel: 'digital',
  verbindungen: [],
});
await db.createDocument(DB, NODES, randomUUID(), {
  boardId: DISPO_BOARD,
  parentId: qrId,
  type: 'knoten',
  titel: 'Projekt erscheint in „Bereit zur Rechnung"',
  collapsed: false,
  sortOrder: 0,
  beschreibung:
    'Neuer Tab „Bereit zur Rechnung" in der Dispo-Planung: alle gelieferten Projekte ohne Rechnung, mit Liefernachweis-Datum ' +
    'und Link zum archivierten Nachweis-PDF. „Rechnung erstellen" öffnet direkt den Rechnung-Tab der Projektabwicklung — ' +
    'die Rechnung bleibt bewusst ein manueller Klick (Kontrolle vor Versand).',
  verbindungen: [],
});
console.log('QR-Schritt + „Bereit zur Rechnung" angelegt');

// Papier-Weg wird Fallback (zweiter Zweig unter Beladung)
await db.updateDocument(DB, NODES, papier.$id, {
  titel: 'Papier-Fallback: Lieferschein zurück ins Büro',
  sortOrder: 1,
  edgeLabel: 'Papier',
  beschreibung:
    'Falls der Fahrer den QR nicht nutzt: unterschriebenen Lieferschein (1–2 Unterschriften) wie bisher zurückbekommen ' +
    'und ablegen (GoBD), dispoStatus „geliefert" manuell setzen. Der Papier-Prozess bleibt vollständig erhalten. ' +
    'Regel unverändert: keine Rechnung ohne Liefernachweis.',
});
console.log('Papier-Fallback aktualisiert');

console.log('\nFertig.');
