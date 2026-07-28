// Legt die von Claude ausgearbeiteten Geschäftsprozesse (Auftragsabwicklung) als
// Prozess-Boards im Geschäftsprozesse-Tool an. Einmalig ausführbar; erzeugt nur NEUE
// Boards/Nodes, verändert nichts Bestehendes.
//
// Ausführen:  node scripts/claude-geschaeftsprozesse-anlegen.mjs
import { Client, Databases, ID } from 'node-appwrite';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
if (!endpoint || !projectId || !apiKey) {
  console.error('Fehlende Env-Variablen (VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY)');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const BOARDS = 'mindmap_boards';
const NODES = 'mindmap_nodes';

async function createBoard(name, beschreibung) {
  const doc = await db.createDocument(DATABASE_ID, BOARDS, ID.unique(), {
    name,
    typ: 'prozess',
    beschreibung,
  });
  console.log(`Board angelegt: ${name} (${doc.$id})`);
  return doc.$id;
}

async function createNode(boardId, parentId, type, titel, sortOrder, extra = {}) {
  const id = randomUUID();
  await db.createDocument(DATABASE_ID, NODES, id, {
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
    linkedBoardId: extra.linkedBoardId ?? '',
    verbindungen: extra.verbindungen ?? [],
    ...(extra.posX !== undefined ? { posX: extra.posX, posY: extra.posY } : {}),
  });
  return id;
}

// Baut rekursiv einen Baum: node = { type?, titel, beschreibung?, edgeLabel?, werkzeuge?,
// materialien?, linkedBoardId?, key?, children? }
const nodeIdsByKey = {};
async function buildTree(boardId, parentId, nodes) {
  let sortOrder = 0;
  for (const n of nodes) {
    const id = await createNode(boardId, parentId, n.type ?? 'knoten', n.titel, sortOrder++, n);
    if (n.key) nodeIdsByKey[n.key] = id;
    if (n.children?.length) await buildTree(boardId, id, n.children);
  }
}

async function createProzessBoard({ name, beschreibung, rootTitel, tree, notizen }) {
  const boardId = await createBoard(name, beschreibung);
  const rootId = await createNode(boardId, '', 'knoten', rootTitel, 0);
  await buildTree(boardId, rootId, tree);
  if (notizen?.length) {
    let s = 0;
    for (const notiz of notizen) {
      await createNode(boardId, '', 'notiz', notiz.titel, s++, { posX: notiz.posX ?? 40, posY: notiz.posY ?? 40 });
    }
  }
  return boardId;
}

// ---------------------------------------------------------------------------
// Detail-Boards (werden vom Hauptboard per Unterprozess-Knoten verlinkt)
// ---------------------------------------------------------------------------

const boardIds = {};

boardIds.angebot = await createProzessBoard({
  name: 'Claude · 1 Saison-Massenangebot (September)',
  beschreibung:
    'Jährlicher automatisierter Angebotsversand für die Frühjahrsinstandsetzung an alle berechtigten Bestandskunden. ' +
    'Tool: Projektverwaltung → Ansicht „Massenangebot". Erzeugt pro Kunde ein Projekt mit Status „angebot", ' +
    'Versand setzt „angebot_versendet". Quelle je Kunde: Vorjahres-Angebot → Mosaik-Historie → PLZ-Kalkulation.',
  rootTitel: 'Start: Saison-Massenangebot',
  tree: [
    {
      titel: 'Neue Saison anlegen',
      beschreibung:
        'In der Projektverwaltung oben die neue Saison erstellen (wird Default, Board startet leer, alte Saison bleibt einsehbar). ' +
        'Dokumentnummern-Zähler starten automatisch neu. Zeitpunkt: Anfang September.',
      werkzeuge: 'Projektverwaltung (Saison-Auswahl im Header)',
      children: [
        {
          titel: 'Kundenstamm vorbereiten',
          beschreibung:
            'Saisonkunden prüfen: Flag „Für automatisches Saison-Angebot" (automatischesAngebot) + aktiv gesetzt? ' +
            'E-Mail-Adresse vorhanden? WICHTIG: Kunden ohne E-Mail vor dem Lauf pflegen – sonst wird das Angebot erzeugt, ' +
            'kann aber nie versendet werden und bleibt in der Spalte „Angebot" hängen. Dubletten vorher über das Duplikate-Tool bereinigen.',
          werkzeuge: 'Saisonplanung / Kundenstamm\nDuplikate-Tool',
          children: [
            {
              titel: 'Dry-Run: Vorschau prüfen',
              beschreibung:
                'Massen-Angebots-Tool im Testmodus/Dry-Run laufen lassen. Vorschau-Tabelle prüfen: Quelle (Vorjahr/Mosaik/PLZ), ' +
                'Menge, Preis/Tonne, Summe, Empfänger-E-Mail. Zeilen sind editierbar; Kunden mit Status „manuell prüfen" einzeln klären. ' +
                'Globale Preisanpassung (+X %) hier setzen.',
              werkzeuge: 'Projektverwaltung → Massenangebot (Vorschau)',
              children: [
                {
                  type: 'entscheidung',
                  titel: 'Vorschau plausibel?',
                  children: [
                    {
                      edgeLabel: 'Nein',
                      titel: 'Daten korrigieren',
                      beschreibung: 'Kundendaten, Preise oder Mengen anpassen (im Kundenstamm oder direkt in der Vorschau-Zeile), dann Dry-Run wiederholen.',
                    },
                    {
                      edgeLabel: 'Ja',
                      titel: 'Batch scharf erzeugen',
                      beschreibung:
                        'Nach Bestätigung mit konkreter Anzahl („180 Angebote erzeugen?") werden Projekte + Angebots-PDFs in Batches erzeugt. ' +
                        'Jeder Lauf bekommt eine erzeugungsBatchId → kompletter Batch ist rückgängig machbar, solange nichts versendet wurde. ' +
                        'Lauf-Protokoll: Collection angebots_laeufe.',
                      children: [
                        {
                          titel: 'Versand (bewusster 2. Schritt)',
                          beschreibung:
                            'Versand ist von der Erzeugung entkoppelt. Erst Test-Versand an die Testadresse ([TEST]-Präfix), dann Bulk-Versand. ' +
                            'Echter Versand setzt Projekt-Status auf „angebot_versendet". Danach hängen alle Angebote im Kanban in „Angebot versendet".',
                          werkzeuge: 'Massenangebot → Versand-Liste\nE-Mail mit PDF (Resend/SMTP)',
                          children: [
                            {
                              type: 'task',
                              titel: 'Nachfass-Liste anlegen (4–6 Wochen nach Versand)',
                              beschreibung:
                                'Kunden ohne Reaktion telefonisch nachfassen (Call-Liste der Saisonplanung nutzen). ' +
                                'Ziel: jedes versendete Angebot bekommt einen Ausgang – Auftrag oder Status „verloren" mit Grund.',
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
});

boardIds.ab = await createProzessBoard({
  name: 'Claude · 2 Bestelleingang & Auftragsbestätigung',
  beschreibung:
    'Kunde bestellt auf ein versendetes Angebot – per Telefon oder E-Mail, unverändert oder mit Änderungen. ' +
    'Ergebnis: versendete Auftragsbestätigung, Projekt wandert Richtung Disposition. ' +
    'ACHTUNG (Systemverhalten heute): Das Speichern der AB setzt den Projekt-Status bereits auf „lieferschein" – nicht erst der Versand.',
  rootTitel: 'Start: Bestelleingang',
  tree: [
    {
      titel: 'Bestellung geht ein (Telefon / E-Mail)',
      beschreibung:
        'Kunde bezieht sich auf das Saisonangebot. Bei E-Mail: Angebots-/Kundennummer heraussuchen. ' +
        'Bei Telefon: Bestellung direkt im Projekt notieren – nichts auf Zettel, alles ins Projekt.',
      children: [
        {
          titel: 'Projekt im Kanban finden',
          beschreibung:
            'Projektverwaltung → Spalte „Angebot versendet" → Suche nach Kundenname. ' +
            'Kein Projekt vorhanden (z. B. Neukunde/Nachbestellung)? → Prozess „Nachbestellungen unter dem Jahr" nutzen.',
          werkzeuge: 'Projektverwaltung (Kanban)',
          children: [
            {
              type: 'entscheidung',
              titel: 'Bestellung wie angeboten?',
              children: [
                {
                  edgeLabel: 'Ja',
                  titel: 'AB direkt aus Angebot erstellen',
                  beschreibung: 'Projektabwicklung → Tab „Auftragsbestätigung": Positionen werden aus dem Angebot übernommen.',
                  key: 'ab_erstellen',
                },
                {
                  edgeLabel: 'Nein',
                  titel: 'Positionen/Preise anpassen',
                  beschreibung:
                    'Änderungswünsche (Menge, Körnung, Zubehör, Liefertermin) direkt in den AB-Positionen umsetzen. ' +
                    'Bei größeren Änderungen ggf. vorher neues Angebot erzeugen und erneut bestätigen lassen.',
                  children: [
                    {
                      titel: 'AB mit geänderten Positionen erstellen',
                      beschreibung: 'Projektabwicklung → Tab „Auftragsbestätigung" mit den angepassten Positionen.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      titel: 'Liefertermin & Belieferungsart erfassen',
      beschreibung:
        'In der AB Pflichtangaben für die Dispo setzen: Lieferdatum bzw. Liefer-KW (lieferdatumTyp/lieferKW), Belieferungsart, ' +
        'Ansprechpartner vor Ort. Das ist der Übergabepunkt an die Disposition – ohne diese Felder kann nicht geplant werden.',
      werkzeuge: 'Projektabwicklung → AB-Tab',
      children: [
        {
          titel: 'AB speichern & per E-Mail versenden',
          beschreibung:
            'AB-PDF erzeugen, per E-Mail an den Kunden senden (EmailFormular). ' +
            'Systemverhalten: Speichern setzt Status auf „lieferschein" – erst nach dem VERSAND gilt der Auftrag als bestätigt. ' +
            'Regel: AB immer am selben Tag versenden, nie als Entwurf liegen lassen.',
          children: [
            {
              type: 'entscheidung',
              titel: 'Enthält Strecken-Artikel (Hydrocourt / Universal)?',
              children: [
                {
                  edgeLabel: 'Ja',
                  titel: 'Projekt splitten (Teilprojekt Strecke)',
                  beschreibung:
                    'Nach der AB die Hydrocourt-/Universal-Positionen per „Projekt splitten" in ein Teilprojekt auslagern ' +
                    '(eigene AB-Nummer). Weiter im Prozess „Streckengeschäft".',
                },
                {
                  edgeLabel: 'Nein',
                  titel: 'Weiter zur Disposition',
                  beschreibung: 'Projekt erscheint mit dispoStatus „offen" in der Dispo-Planung.',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

boardIds.dispo = await createProzessBoard({
  name: 'Claude · 3 Disposition, Lieferschein & Lieferung',
  beschreibung:
    'Vom bestätigten Auftrag zur ausgelieferten Ware. Tool: Dispo-Planung (/dispo-planung) mit Tabs Aufträge/Touren/Karte/Checkliste. ' +
    'Dispo-Status am Projekt: offen → geplant → beladen → unterwegs → geliefert.',
  rootTitel: 'Start: Disposition',
  tree: [
    {
      titel: 'Auftrag erscheint in der Dispo-Planung',
      beschreibung:
        'Alle Projekte mit versendeter AB und dispoStatus „offen" erscheinen im Tab „Aufträge". ' +
        'Lieferdaten (KW/Datum, Belieferungsart, Ansprechpartner) kommen aus der AB.',
      werkzeuge: 'Dispo-Planung → Aufträge',
      children: [
        {
          titel: 'Tour planen',
          beschreibung:
            'Aufträge zu Touren bündeln: Fahrer + Fahrzeug zuweisen, Reihenfolge festlegen (KI-Routenoptimierung verfügbar). ' +
            'Tour-Status: entwurf → geplant → freigegeben. Projekt erhält dispoStatus „geplant".',
          werkzeuge: 'Dispo-Planung → Touren\nKarten-Ansicht\nKI-Routenoptimierung',
          children: [
            {
              titel: 'Lieferschein erstellen',
              beschreibung:
                'Projektabwicklung → Tab „Lieferschein": Positionen ohne Preise, Ladeort, PE-Folien, Empfangsbestätigung. ' +
                'Regel: Lieferschein spätestens am Vortag der Tour erstellen.',
              werkzeuge: 'Projektabwicklung → Lieferschein-Tab',
              materialien: 'Lieferschein-PDF (2 Exemplare)',
              children: [
                {
                  titel: 'Lieferschein 2× drucken',
                  beschreibung: 'Ein Exemplar für den LKW-Fahrer (kommt unterschrieben zurück), ein Exemplar bleibt beim Kunden vor Ort.',
                  werkzeuge: 'Drucker Büro',
                  children: [
                    {
                      titel: 'Beladung & Auslieferung',
                      beschreibung:
                        'Fahrer nimmt beide Lieferscheine mit. dispoStatus fortschreiben: beladen → unterwegs → geliefert. ' +
                        'Checkliste in der Dispo-Planung nutzen.',
                      werkzeuge: 'Dispo-Planung → Checkliste',
                      children: [
                        {
                          titel: 'Liefernachweis zurück ins Büro',
                          beschreibung:
                            'Unterschriebenen Lieferschein vom Fahrer einsammeln und ablegen (GoBD). ' +
                            'dispoStatus „geliefert" setzen – DANACH ist das Projekt reif für die Rechnung. ' +
                            'Regel: keine Rechnung ohne Liefernachweis.',
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
});

boardIds.rechnung = await createProzessBoard({
  name: 'Claude · 4 Rechnung & Debitoren',
  beschreibung:
    'Von der gelieferten Ware zum bezahlten Auftrag. Beim Speichern der Rechnung entsteht automatisch der Debitor ' +
    '(Collection debitoren_metadaten, Status „offen") – ab dann läuft die Überwachung in der Debitorenverwaltung (/debitoren).',
  rootTitel: 'Start: Rechnung & Debitoren',
  tree: [
    {
      titel: 'Rechnung erstellen',
      beschreibung:
        'Projektabwicklung → Tab „Rechnung": Positionen aus AB/Lieferschein übernehmen, ggf. Dieselzuschlag/Fracht prüfen. ' +
        'Rechnung ist final (GoBD, fortlaufender RE-Nummernkreis, Storno nur über Storno-Rechnung). ' +
        'Speichern setzt Projekt-Status „rechnung" + dispoStatus „geliefert" und legt den Debitor automatisch an.',
      werkzeuge: 'Projektabwicklung → Rechnung-Tab',
      children: [
        {
          titel: 'Rechnung versenden',
          beschreibung:
            'E-Mail mit PDF an die Rechnungs-E-Mail des Kunden. Versand wird im E-Mail-Protokoll dokumentiert. ' +
            'Regel: Rechnung innerhalb von 3 Werktagen nach Lieferung raus.',
          children: [
            {
              titel: 'Zahlungseingang überwachen',
              key: 'zahlung_ueberwachen',
              beschreibung:
                'Debitorenverwaltung: Dashboard + Liste, Bank-Abgleich für Zahlungseingänge. ' +
                'Debitor-Status: offen → faellig → ueberfaellig → gemahnt / teilbezahlt / bezahlt.',
              werkzeuge: 'Debitorenverwaltung (/debitoren)\nBank-Abgleich',
              children: [
                {
                  type: 'entscheidung',
                  titel: 'Zahlung eingegangen?',
                  children: [
                    {
                      edgeLabel: 'Ja',
                      titel: 'Projekt auf „Bezahlt"',
                      beschreibung: 'Debitor auf „bezahlt", Projekt wandert in die Kanban-Spalte „Bezahlt". Auftrag abgeschlossen.',
                    },
                    {
                      edgeLabel: 'Nein',
                      titel: 'Mahnlauf',
                      beschreibung:
                        'Mahnwesen in der Debitorenverwaltung: Zahlungserinnerung → Mahnung 1–3 (Mahnstufen 0–4), ' +
                        'System gibt Mahn-Empfehlungen. Versand per E-Mail mit PDF, danach zurück in die Überwachung.',
                      werkzeuge: 'Debitorenverwaltung → Mahnungen',
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
});

boardIds.anfragen = await createProzessBoard({
  name: 'Claude · Eingang: Anfragen von der Webseite',
  beschreibung:
    'Neukunden-Anfragen von tennismehl.com landen halbautomatisch im Anfragen-Tool (/anfragen): ' +
    'E-Mail-Postfach wird synchronisiert, Claude extrahiert Menge/Körnung/Adresse. ' +
    'Anfrage-Status: neu → zugeordnet → angebot_erstellt → angebot_versendet → verarbeitet/erledigt.',
  rootTitel: 'Start: Web-Anfrage',
  tree: [
    {
      titel: 'Anfrage kommt automatisch rein',
      beschreibung: 'Webseite → E-Mail → automatischer Sync ins Anfragen-Tool, Status „neu". Extrahierte Daten (Menge, Körnung, Adresse) prüfen.',
      werkzeuge: 'Anfragen-Tool (/anfragen)',
      children: [
        {
          titel: 'Kunde zuordnen oder anlegen',
          beschreibung:
            'Bestandskunde suchen und zuordnen; Neukunde anlegen. Status „zugeordnet". ' +
            'Sorgfältig prüfen, um Dubletten zu vermeiden.',
          children: [
            {
              titel: 'Angebot halbautomatisch erstellen',
              beschreibung:
                'Über den Bearbeitungs-Dialog Angebot erzeugen: es entsteht ein Projekt in der Projektverwaltung (Status „angebot"), ' +
                'Anfrage erhält die Projekt-Referenz und Status „angebot_erstellt".',
              children: [
                {
                  titel: 'Angebot versenden & Anfrage abschließen',
                  beschreibung:
                    'Versand per E-Mail mit PDF → Projekt „angebot_versendet", Anfrage „verarbeitet/erledigt". ' +
                    'Ab hier läuft alles im Hauptprozess weiter (Bestelleingang → AB → Dispo → Rechnung).',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

boardIds.shop = await createProzessBoard({
  name: 'Claude · Eingang: Shop-Bestellungen (Gambio)',
  beschreibung:
    'Bestellungen aus dem Onlineshop (tennismehl24.com, Gambio) werden ins Shop-Bestellungs-Tool (/shop-bestellungen) synchronisiert. ' +
    'Da der Kunde bereits verbindlich bestellt hat, startet das Projekt direkt mit Status „auftragsbestaetigung".',
  rootTitel: 'Start: Shop-Bestellung',
  tree: [
    {
      titel: 'Bestellung wird synchronisiert',
      beschreibung: 'Gambio-API-Sync ins Shop-Bestellungs-Tool. Neue Bestellungen regelmäßig prüfen (aktuell kein Push – täglich reinschauen!).',
      werkzeuge: 'Shop-Bestellungs-Tool (/shop-bestellungen)',
      children: [
        {
          titel: 'Bestellung prüfen',
          beschreibung: 'Zahlstatus (PayPal/Vorkasse), Artikel und Lieferadresse prüfen. Universalprodukte = Streckengeschäft (nicht ab Werk).',
          children: [
            {
              titel: 'Projekt aus Bestellung erstellen',
              beschreibung:
                'Ein Klick erzeugt das Projekt direkt mit Status „auftragsbestaetigung" inkl. AB-Daten. ' +
                'BEKANNTE SCHWÄCHE: Shop-Kunden werden aktuell NICHT im CRM angelegt (synthetische Kunden-ID „shop-…") – ' +
                'Wiederbesteller haben keine Historie. Bis zum Fix: bei Stammkunden den Kunden manuell im CRM verknüpfen/anlegen.',
              children: [
                {
                  type: 'entscheidung',
                  titel: 'Streckenartikel enthalten?',
                  children: [
                    {
                      edgeLabel: 'Ja',
                      titel: 'Weiter im Prozess „Streckengeschäft"',
                      beschreibung: 'Bestellung an den Lieferanten (Universal Sport / Schwab) auslösen – siehe Prozess Streckengeschäft.',
                    },
                    {
                      edgeLabel: 'Nein',
                      titel: 'Weiter im Hauptprozess',
                      beschreibung: 'Eigene Ware ab Werk: Disposition → Lieferschein → Rechnung wie im Hauptprozess.',
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
});

boardIds.strecke = await createProzessBoard({
  name: 'Claude · Streckengeschäft: Hydrocourt & Universal',
  beschreibung:
    'Artikel, die nicht ab Werk geliefert werden: Hydrocourt (Lieferant Schwab) und Universal-Sortiment (Lieferant Universal Sport). ' +
    'Abwicklung über die Ansichten „Hydrocourt" und „Universal" in der Projektverwaltung. ' +
    'ACHTUNG: Diese Ansichten führen eigene Parallel-Status am Projekt (hydrocourtStatus / universalKanbanStatus) – ' +
    'unabhängig vom Haupt-Kanban-Status. Beide Dimensionen manuell synchron halten.',
  rootTitel: 'Start: Streckengeschäft',
  tree: [
    {
      titel: 'Strecken-Positionen identifizieren',
      beschreibung:
        'Nach der AB tauchen Aufträge mit Hydrocourt-Artikeln (TM-HYC) in der Hydrocourt-Ansicht und Universal-Artikel ' +
        'in der Universal-Ansicht auf. Gemischte Aufträge vorher per „Projekt splitten" in Teilprojekte trennen.',
      werkzeuge: 'Projektverwaltung → Ansicht Hydrocourt / Universal',
      children: [
        {
          titel: 'Bestellung an Lieferant senden',
          beschreibung:
            'Bestellung per E-Mail mit PDF direkt aus der Ansicht: Hydrocourt → Schwab, Universal → Universal Sport. ' +
            'Status: „bestellt" (Hydrocourt) bzw. „versendet" (Universal).',
          children: [
            {
              titel: 'Lieferung durch Lieferant überwachen',
              beschreibung:
                'Hydrocourt: bestellt → versendet. Universal: versendet → an_kunden. ' +
                'Bei Verzug beim Lieferanten nachfassen – der Kunde hat bei uns bestellt, wir bleiben verantwortlich.',
              children: [
                {
                  titel: 'Rechnungsstellung & Abschluss',
                  beschreibung:
                    'Status „rechnungsstellung" setzen, Rechnung im Hauptprozess erstellen (Prozess 4), danach Status „bezahlt". ' +
                    'Prüfen, dass Haupt-Status und Strecken-Status am Ende übereinstimmen.',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

boardIds.nachbestellung = await createProzessBoard({
  name: 'Claude · Eingang: Nachbestellungen unter dem Jahr',
  beschreibung:
    'Bestandskunden bestellen außerhalb der Saison-Angebotsrunde nach: Ziegelmehl (Schüttgut), Säcke/Paletten, Zubehör oder Hydrocourt. ' +
    'Produktregeln: Schüttgut = Hauptprodukt per LKW; Säcke künftig NUR als halbe/ganze Palette oder BigPack auf Palette; ' +
    'Universal-/Hydrocourt-Artikel = Streckengeschäft.',
  rootTitel: 'Start: Nachbestellung',
  tree: [
    {
      titel: 'Kunde meldet sich (Telefon / E-Mail)',
      beschreibung: 'Aufnehmen: Produkt (Schüttgut / Palettenware / Zubehör / Hydrocourt), Menge, Wunschtermin, Lieferadresse.',
      children: [
        {
          titel: 'Kunde im CRM finden',
          beschreibung:
            'Kundenstamm durchsuchen (Kundenliste / Saisonplanung). Kunde mehrfach vorhanden? → erst über das Duplikate-Tool mergen, ' +
            'dann weiterarbeiten. Neukunde sauber mit E-Mail + Rechnungsadresse anlegen.',
          werkzeuge: 'Kundenliste\nSaisonplanung\nDuplikate-Tool',
          children: [
            {
              type: 'entscheidung',
              titel: 'Braucht der Kunde erst ein Angebot?',
              children: [
                {
                  edgeLabel: 'Ja',
                  titel: 'Projekt mit Angebot erstellen',
                  beschreibung:
                    'Projekt in der Projektverwaltung anlegen (Status „angebot"), Angebot erstellen und versenden („angebot_versendet"). ' +
                    'Weiter wie im Hauptprozess ab Bestelleingang.',
                },
                {
                  edgeLabel: 'Nein, bestellt direkt',
                  titel: 'Projekt mit AB erstellen',
                  beschreibung:
                    'Projekt anlegen und direkt die Auftragsbestätigung erstellen und versenden. ' +
                    'Danach normal weiter: Disposition → Lieferschein → Rechnung.',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Hauptboard mit Verweisen auf alle Detail-Boards
// ---------------------------------------------------------------------------

await createProzessBoard({
  name: 'Claude · Gesamtprozess Auftragsabwicklung (Übersicht)',
  beschreibung:
    'Master-Prozess der Tennismehl GmbH: vom Angebot bis zum bezahlten Auftrag. ' +
    'Das zentrale Objekt ist das PROJEKT in der Projektverwaltung – jeder Auftrag ist genau ein Projekt und durchläuft die ' +
    'Kanban-Statuskette: Angebot → Angebot versendet → Auftragsbestätigung → Lieferschein → Rechnung → Bezahlt (Sonderfall: Verloren). ' +
    'Es gibt 4 Eingangskanäle (Saison-Massenangebot, Web-Anfragen, Onlineshop, Nachbestellungen) – alle münden in denselben Hauptprozess. ' +
    'Erstellt von Claude auf Basis einer vollständigen Code-Analyse des Portals (Juli 2026).',
  rootTitel: 'Start: Auftragsabwicklung Tennismehl',
  tree: [
    {
      type: 'prozess',
      titel: '1 · Saison-Massenangebot (September)',
      beschreibung: 'Haupteingangskanal: automatisierter Angebotsversand an alle Bestandskunden für die Frühjahrsinstandsetzung.',
      linkedBoardId: boardIds.angebot,
      children: [
        {
          type: 'prozess',
          titel: '2 · Bestelleingang & Auftragsbestätigung',
          beschreibung: 'Kunde bestellt (Telefon/E-Mail, mit oder ohne Änderungen) → AB erstellen und versenden.',
          linkedBoardId: boardIds.ab,
          children: [
            {
              type: 'prozess',
              titel: '3 · Disposition, Lieferschein & Lieferung',
              beschreibung: 'Tourenplanung, Lieferschein 2× drucken (Fahrer + Kunde), Auslieferung, Liefernachweis.',
              linkedBoardId: boardIds.dispo,
              children: [
                {
                  type: 'prozess',
                  titel: '4 · Rechnung & Debitoren',
                  beschreibung: 'Rechnung erstellen/versenden, Debitor entsteht automatisch, Zahlungsüberwachung + Mahnwesen bis „Bezahlt".',
                  linkedBoardId: boardIds.rechnung,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'prozess',
      titel: 'Eingangskanal: Web-Anfragen',
      beschreibung: 'Neukunden-Anfragen von der Webseite → Anfragen-Tool → Projekt mit Angebot → mündet in Schritt 2.',
      linkedBoardId: boardIds.anfragen,
    },
    {
      type: 'prozess',
      titel: 'Eingangskanal: Onlineshop (Gambio)',
      beschreibung: 'Shop-Bestellungen → Shop-Bestellungs-Tool → Projekt startet direkt bei Auftragsbestätigung (Schritt 3 bzw. Strecke).',
      linkedBoardId: boardIds.shop,
    },
    {
      type: 'prozess',
      titel: 'Eingangskanal: Nachbestellungen unter dem Jahr',
      beschreibung: 'Bestandskunden bestellen Ziegelmehl, Palettenware, Zubehör oder Hydrocourt nach → mündet in Schritt 2 oder direkt AB.',
      linkedBoardId: boardIds.nachbestellung,
    },
    {
      type: 'prozess',
      titel: 'Sonderprozess: Streckengeschäft (Hydrocourt & Universal)',
      beschreibung: 'Artikel ohne eigene Lagerhaltung: Bestellung an Lieferant (Schwab / Universal Sport), eigene Status-Spur bis Rechnung.',
      linkedBoardId: boardIds.strecke,
    },
  ],
  notizen: [
    {
      titel: 'Grundregel: Jeder Auftrag = genau 1 Projekt im Kanban. Kein Auftrag existiert außerhalb der Projektverwaltung.',
      posX: 40,
      posY: 40,
    },
  ],
});

console.log('\nFertig. Alle Boards angelegt:');
for (const [key, id] of Object.entries(boardIds)) console.log(`  ${key}: ${id}`);
