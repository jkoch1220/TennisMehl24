// Update 2: Neues Board "Testdurchlauf: Saison-Generalprobe (E2E)" + Ideen-Notizen
// (KI-AB-Automatisierung, System-E-Mail-Versand) auf bestehenden Claude-Boards.
// Ausführen:  node scripts/claude-geschaeftsprozesse-update-2.mjs
import { Client, Databases, ID } from 'node-appwrite';
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

const AB_BOARD = '6a67174a003c0af9e028';
const MAIN_BOARD = '6a67174f003914c8ec8d';

async function createNode(boardId, parentId, type, titel, sortOrder, extra = {}) {
  const id = randomUUID();
  await db.createDocument(DB, NODES, id, {
    boardId,
    parentId,
    type,
    titel,
    collapsed: false,
    sortOrder,
    beschreibung: extra.beschreibung ?? '',
    edgeLabel: extra.edgeLabel ?? '',
    werkzeuge: extra.werkzeuge ?? '',
    materialien: extra.materialien ?? '',
    linkedBoardId: '',
    verbindungen: [],
    ...(extra.posX !== undefined ? { posX: extra.posX, posY: extra.posY } : {}),
  });
  return id;
}
async function buildTree(boardId, parentId, nodes) {
  let s = 0;
  for (const n of nodes) {
    const id = await createNode(boardId, parentId, n.type ?? 'knoten', n.titel, s++, n);
    if (n.children?.length) await buildTree(boardId, id, n.children);
  }
}

// --- Neues Board: Testdurchlauf / Generalprobe ---
const board = await db.createDocument(DB, BOARDS, ID.unique(), {
  name: 'Claude · Testdurchlauf: Saison-Generalprobe (E2E)',
  typ: 'prozess',
  beschreibung:
    'Kompletter End-zu-End-Test der Auftragskette VOR dem Massenversand im September: ' +
    'Testkunde → Massenangebot → Bestelleingang/AB → Dispo → Lieferschein mit QR-Scan → Rechnung → Debitor. ' +
    'Trick: Der Testkunde bekommt als E-Mail die eigene Testadresse (jtatwcook@gmail.com) — dadurch können auch ' +
    '„echte" Versände gefahrlos durchgespielt werden und alle Statuswechsel greifen wie in Produktion.',
});
console.log(`Board angelegt: ${board.name} (${board.$id})`);
const rootId = await createNode(board.$id, '', 'knoten', 'Start: Generalprobe', 0);
await buildTree(board.$id, rootId, [
  {
    titel: '1 · Testkunde anlegen',
    beschreibung:
      'Saisonplanung: Kunde „TEST · Generalprobe" anlegen — aktiv, Flag „Für automatisches Saison-Angebot", ' +
      'E-Mail = jtatwcook@gmail.com, echte PLZ (für Speditionskalkulation). ' +
      'Alle Versände gehen damit nur an uns selbst.',
    werkzeuge: 'Saisonplanung / Kundenstamm',
    children: [
      {
        titel: '2 · Dummy-Vorjahresprojekt anlegen',
        beschreibung:
          'Für den Testkunden ein Projekt in der VORSAISON mit gespeichertem Angebot (Schüttgut-Positionen) anlegen, ' +
          'damit das Massenangebot die Quelle „Vorjahr" verwendet. Seed-Skript vorgesehen (scripts/seed-testdurchlauf), ' +
          'alternativ manuell über die Projektverwaltung mit Saison-Auswahl Vorjahr.',
        children: [
          {
            titel: '3 · Massenangebot testen',
            beschreibung:
              'Dry-Run → Vorschau prüfen (Quelle „Vorjahr", Preisanpassung aus Stammdaten vorbelegt) → Batch NUR mit dem ' +
              'Testkunden scharf erzeugen → erst Test-Versand ([TEST]-Präfix), dann Echt-Versand an die Testadresse → ' +
              'Projekt steht in „Angebot versendet". Batch-Rollback einmal mitprüfen.',
            werkzeuge: 'Projektverwaltung → Massenangebot',
            children: [
              {
                type: 'entscheidung',
                titel: 'Angebot korrekt angekommen (PDF, Preise, Anrede)?',
                children: [
                  {
                    edgeLabel: 'Nein',
                    titel: 'Fehler notieren, fixen, wiederholen',
                    beschreibung: 'Befund als Task festhalten, Ursache beheben, Batch zurückrollen und Schritt 3 wiederholen.',
                  },
                  {
                    edgeLabel: 'Ja',
                    titel: '4 · Bestelleingang simulieren & AB',
                    beschreibung:
                      '„Anruf" des Kunden simulieren: Bestellung mit einer Preisänderung annehmen (Roni-Fall), ' +
                      'AB erstellen und versenden. PRÜFEN: Status bleibt beim Speichern in „Auftragsbestätigung" ' +
                      'und springt erst beim Versand auf „Lieferschein" (neues Verhalten).',
                    children: [
                      {
                        titel: '5 · Dispo & Lieferschein mit QR-Scan',
                        beschreibung:
                          'Spedition wählen, Tour planen, Lieferschein erstellen und drucken. ' +
                          'QR-Code mit dem Smartphone scannen: „Abgeladen ✓" + Foto, optional Unterschrift → ' +
                          'dispoStatus „geliefert", Projekt erscheint in „Bereit zur Rechnung". ' +
                          'Auch den Doppel-Scan testen (muss „bereits bestätigt" zeigen).',
                        werkzeuge: 'Dispo-Planung\nSmartphone (QR)',
                        children: [
                          {
                            titel: '6 · Rechnung & Debitoren',
                            beschreibung:
                              'ACHTUNG: Finale Rechnungen ziehen eine echte RE-Nummer im GoBD-Nummernkreis und sind nicht löschbar! ' +
                              'Im Produktivsystem für die Generalprobe die PROFORMA-Rechnung verwenden — oder den Rechnungs-Teil ' +
                              'in der Appwrite-Testumgebung durchspielen. Danach: Debitor entsteht, Zahlungseingang simulieren, ' +
                              'optional eine Zahlungserinnerung im Testmodus versenden.',
                            children: [
                              {
                                titel: '7 · Aufräumen & Befunde festhalten',
                                beschreibung:
                                  'Unversendete Test-Angebote per Batch-Rollback löschen, Testprojekte löschen/archivieren, ' +
                                  'Testkunden deaktivieren. Alle Befunde als Tasks im Geschäftsprozesse-Tool anlegen. ' +
                                  'REGEL: Die Generalprobe muss KOMPLETT grün sein, bevor im September der Massenversand läuft.',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
console.log('Testdurchlauf-Schritte angelegt');

// --- Notiz: KI-AB-Automatisierung (auf AB-Board) ---
await createNode(AB_BOARD, '', 'notiz',
  'IDEE (perspektivisch): AB halb-/vollautomatisch. Variante A: KI-Telefonagent auf der Webgate-Telefonanlage nimmt ' +
  'Angebots-Annahmen entgegen. Variante B: Angebots-Mails enthalten angebot@tennismehl.com — KI liest die Inbox, ' +
  'erkennt „Ich nehme an" + Angebotsnummer und legt die AB zur Freigabe vor. Empfehlung: mit Variante B starten ' +
  '(geringeres Risiko, Muster Anfragen-Tool existiert), Freigabe zunächst durch Roni.',
  0, { posX: 40, posY: 40 });
console.log('Notiz KI-AB-Idee angelegt');

// --- Notiz: System-E-Mail-Versand (auf Hauptboard) ---
await createNode(MAIN_BOARD, '', 'notiz',
  'ANFORDERUNG: Sämtlicher Dokumentversand (Angebote, ABs, Rechnungen) läuft über das System statt Outlook — ' +
  'spart massiv Zeit und protokolliert alles. Dabei zwingend mitdenken: KORREKTUR-VERSAND (neue AB-Version / ' +
  'korrigiertes Dokument) braucht eigene Kennzeichnung im Betreff/Anschreiben und Versionsvermerk im Verlauf.',
  1, { posX: 40, posY: 160 });
console.log('Notiz System-E-Mail-Versand angelegt');

console.log('\nFertig.');
