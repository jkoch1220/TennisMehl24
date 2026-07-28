// Update 1 der Claude-Prozess-Boards: Speditionsmodell (kein eigener LKW),
// Produktregeln Paletten/Säcke, AB als Verbindlichkeit, zentrale Preis-Konfiguration.
// Ausführen:  node scripts/claude-geschaeftsprozesse-update-1.mjs
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
const BOARDS = 'mindmap_boards';
const NODES = 'mindmap_nodes';

const B = {
  angebot: '6a671749003ac2e894b6',
  ab: '6a67174a003c0af9e028',
  dispo: '6a67174c00075087ee4f',
  nachbestellung: '6a67174f00128c582e87',
};

async function nodesOf(boardId) {
  const res = await db.listDocuments(DB, NODES, [Query.equal('boardId', boardId), Query.limit(100)]);
  return res.documents;
}
async function updateNode(nodes, titel, data) {
  const n = nodes.find((d) => d.titel === titel);
  if (!n) throw new Error(`Node nicht gefunden: ${titel}`);
  await db.updateDocument(DB, NODES, n.$id, data);
  console.log(`  Node aktualisiert: ${titel}`);
}

// --- Board 3: Disposition → Speditionsmodell ---
await db.updateDocument(DB, BOARDS, B.dispo, {
  beschreibung:
    'Vom bestätigten Auftrag zur ausgelieferten Ware. WICHTIG: Es gibt aktuell keinen eigenen LKW — der Transport läuft ' +
    'komplett über Speditionen: Durback und Michel Bau (Schüttgut/Kipper), Raben (Palettenware), Breidenbacher (Kranentladung). ' +
    'Tool: Dispo-Planung (/dispo-planung). Dispo-Status am Projekt: offen → geplant → beladen → unterwegs → geliefert.',
});
console.log('Board Dispo aktualisiert');
const dispoNodes = await nodesOf(B.dispo);
await updateNode(dispoNodes, 'Tour planen', {
  titel: 'Spedition beauftragen & Tour planen',
  beschreibung:
    'Versandweg je Auftrag wählen: Schüttgut → Durback oder Michel Bau (Kipper) · Palettenware → Raben · ' +
    'Kranentladung nötig → Breidenbacher. Liefertermin mit der Spedition abstimmen und bestätigen lassen, ' +
    'Aufträge sinnvoll bündeln. Projekt erhält dispoStatus „geplant".',
  werkzeuge: 'Dispo-Planung → Touren\nSpeditionen: Durback · Michel Bau · Raben · Breidenbacher',
});
await updateNode(dispoNodes, 'Lieferschein 2× drucken', {
  beschreibung:
    'Ein Exemplar für den Speditionsfahrer (kommt mit 1–2 Unterschriften zurück), ein Exemplar bleibt beim Kunden vor Ort.',
});
await updateNode(dispoNodes, 'Beladung & Auslieferung', {
  beschreibung:
    'Beladung im Werk (Kipper bzw. Paletten), der Speditionsfahrer nimmt beide Lieferscheine mit. ' +
    'dispoStatus fortschreiben: beladen → unterwegs → geliefert. Checkliste in der Dispo-Planung nutzen.',
});
await updateNode(dispoNodes, 'Liefernachweis zurück ins Büro', {
  beschreibung:
    'Unterschriebenen Lieferschein (1–2 Unterschriften) vom Speditionsfahrer zurückbekommen und ablegen (GoBD). ' +
    'dispoStatus „geliefert" setzen — DANACH ist das Projekt reif für die Rechnung. Regel: keine Rechnung ohne Liefernachweis. ' +
    'GEPLANT: Digitalisierung per QR-Code auf dem Lieferschein → mobile Unterschrift beim Abladen, ' +
    'damit die Rechnung direkt nach Zustellung ausgelöst werden kann (kein Warten auf den Papier-Rückläufer).',
});

// --- Board 1: Massenangebot → Preis-Konfiguration + Schüttgut/Paletten ---
await db.updateDocument(DB, BOARDS, B.angebot, {
  beschreibung:
    'Jährlicher automatisierter Angebotsversand für die Frühjahrsinstandsetzung an alle berechtigten Bestandskunden. ' +
    'Tool: Projektverwaltung → Ansicht „Massenangebot". Quelle je Kunde: Vorjahres-Angebot → Mosaik-Historie → PLZ-Kalkulation. ' +
    'PREISE: Die globale Preisanpassung (Default +4 %) kommt aus der zentralen Preis-Konfiguration in den Stammdaten und ist ' +
    'jederzeit — auch unterjährig — änderbar. ' +
    'VERSANDWEGE: Angebotsrunden getrennt fahren — Runde 1 Schüttgut (Hauptprodukt), danach Palettenware. ' +
    'Kunden, die beides beziehen, erhalten EIN kombiniertes Angebot (Positionsblöcke Schüttgut + Paletten); ' +
    'nach der AB wird pro Versandweg ein Teilprojekt für die Dispo gesplittet.',
});
console.log('Board Massenangebot aktualisiert');
const angebotNodes = await nodesOf(B.angebot);
await updateNode(angebotNodes, 'Dry-Run: Vorschau prüfen', {
  beschreibung:
    'Massen-Angebots-Tool im Testmodus/Dry-Run laufen lassen. Vorschau-Tabelle prüfen: Quelle (Vorjahr/Mosaik/PLZ), ' +
    'Menge, Preis/Tonne, Summe, Empfänger-E-Mail. Zeilen sind editierbar; Kunden mit Status „manuell prüfen" einzeln klären. ' +
    'Die globale Preisanpassung ist aus der Preis-Konfiguration (Stammdaten) vorbelegt — dort pflegen, hier nur im Ausnahmefall überschreiben. ' +
    'PALETTENREGEL: Alte Sack-Positionen aus Vorjahren auf halbe/ganze Paletten aufrunden (halbe Palette mit Anbruch-Aufschlag), ' +
    'mit Anmerkung im Angebot. Säcke werden nicht mehr aufs Schüttgut gelegt.',
  werkzeuge: 'Projektverwaltung → Massenangebot (Vorschau)\nStammdaten → Preis-Konfiguration',
});

// --- Board 2: AB → Verbindlichkeit + Preisbefugnis Roni ---
await db.updateDocument(DB, BOARDS, B.ab, {
  beschreibung:
    'Kunde bestellt auf ein versendetes Angebot – per Telefon oder E-Mail, unverändert oder mit Änderungen. ' +
    'Die versendete AUFTRAGSBESTÄTIGUNG IST die Verbindlichkeit — bei Änderungen ist kein erneuter Angebotsdurchlauf nötig. ' +
    'Der Innendienst (Roni) ist berechtigt, Preisanpassungen direkt am Telefon mit dem Kunden zu vereinbaren. ' +
    'Systemverhalten NEU: Der Projekt-Status springt erst beim VERSAND der AB weiter (nicht mehr beim Speichern).',
});
console.log('Board Bestelleingang/AB aktualisiert');
const abNodes = await nodesOf(B.ab);
await updateNode(abNodes, 'Positionen/Preise anpassen', {
  beschreibung:
    'Änderungswünsche (Menge, Körnung, Zubehör, Liefertermin, Preis) direkt in den AB-Positionen umsetzen. ' +
    'Roni darf Preisanpassungen eigenständig am Telefon vereinbaren. ' +
    'Die versendete AB ist die Verbindlichkeit — ein neues Angebot ist nur nötig, wenn der Kunde es ausdrücklich vorab schriftlich will.',
});
await updateNode(abNodes, 'AB speichern & per E-Mail versenden', {
  beschreibung:
    'AB-PDF erzeugen und per E-Mail an den Kunden senden (EmailFormular). Erst der VERSAND schaltet den Status weiter — ' +
    'ein gespeicherter Entwurf bleibt in der Spalte „Auftragsbestätigung". ' +
    'Telefonisch/postalisch bestätigte Aufträge: Karte manuell per Drag weiterziehen. Regel: AB immer am selben Tag versenden.',
});

// --- Board Nachbestellungen → Produktregeln ---
await db.updateDocument(DB, BOARDS, B.nachbestellung, {
  beschreibung:
    'Bestandskunden bestellen außerhalb der Saison-Angebotsrunde nach: Ziegelmehl (Schüttgut), Palettenware, Zubehör oder Hydrocourt. ' +
    'PRODUKTREGELN: Schüttgut = Hauptprodukt per Kipper-Spedition (Durback/Michel Bau). ' +
    'Säcke gibt es NUR noch als halbe Palette (mit Anbruch-Aufschlag) oder ganze Palette/BigPack — Lieferung über Raben. ' +
    'Säcke werden NICHT mehr zum Schüttgut in den Kipper gelegt. ' +
    'Einzelne Säcke nur noch bei Selbstabholung ab Werk. Universal-/Hydrocourt-Artikel = Streckengeschäft.',
});
console.log('Board Nachbestellungen aktualisiert');

// --- Notiz auf Dispo-Board: Speditionen ---
await db.createDocument(DB, NODES, randomUUID(), {
  boardId: B.dispo,
  parentId: '',
  type: 'notiz',
  titel:
    'Speditionen: Durback & Michel Bau (Schüttgut) · Raben (Paletten) · Breidenbacher (Kran). ' +
    'Geplant: als Stammdaten pflegen statt nur im Kopf/Code.',
  collapsed: false,
  sortOrder: 0,
  posX: 40,
  posY: 40,
});
console.log('Notiz Speditionen angelegt');

console.log('\nFertig — alle Updates durchgeführt.');
