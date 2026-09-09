/**
 * Kennzeichnet Abholer anhand ihrer Belege.
 *
 * `belieferungsart` ist ein gepflegtes Feld und bei den meisten Kunden leer.
 * Die Belege dagegen sind abgerechnet — sie lügen nicht. Zwei Signale:
 *
 *   1. Verladepauschale „bei Abholung ab Werk" (TM-VP) im Beleg.
 *   2. Werkspreis bezahlt UND keine Frachtposition. Die Fracht steckt bei uns
 *      IM Tonnenpreis; wer nur den Werkspreis zahlt, hat selbst geladen.
 *      Werkspreise: Schüttgut 98,70 €/t · Sackware auf Palette 155 €/t ·
 *      Einzelsack 8,50 €/Stk · BigBag 125,90 €/t.
 *
 * Warum nachtragen und nicht nur zur Laufzeit auswerten: Sonst muss jede
 * Auswertung dieselbe Herleitung neu machen, und die Dispo sieht am Kunden
 * weiterhin nichts. Ein Beleg-Befund gehört in den Stamm — nächste Saison steht
 * der Kunde dann von allein richtig.
 *
 * NICHT angefasst wird, wer eine ausdrückliche LIEFER-Belieferungsart trägt
 * (z. B. `nur_motorwagen`): Das ist ein Widerspruch, den ein Mensch klären muss.
 *
 *   npx tsx scripts/abholer-erkennen.ts               # Dry-Run, Sandbox
 *   npx tsx scripts/abholer-erkennen.ts --apply
 *   npx tsx scripts/abholer-erkennen.ts --apply --produktion
 */
import 'dotenv/config';
import { Client, Databases, Query } from 'node-appwrite';

const APPLY = process.argv.includes('--apply');
const DB = process.argv.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const VERLADEPAUSCHALE = 'TM-VP';
// TM-DZ (Dieselpreiszuschlag) und TM-F (Frachtkosten) stehen in Belegen, aber
// NICHT im Artikelstamm — deshalb zusätzlich die Bezeichnungsprüfung.
const FRACHT_ARTIKEL = new Set([
  'TM-FP', 'TM-FK', 'TM-F', 'TM-FKZ', 'TM-DZ', 'TM-UV-VK', 'TM-UV-SPZ', 'TM-HYC-V',
]);
const FRACHT_BEZEICHNUNG = /(fracht|diesel|spedition|versandkost|transportkost|zustellung|anlieferung)/i;
const istFracht = (p: Record<string, unknown>) =>
  FRACHT_ARTIKEL.has(nr(p)) || FRACHT_BEZEICHNUNG.test(String(p.bezeichnung ?? ''));
const WERKSPREISE: Record<string, number> = {
  'TM-ZM-02': 98.7, 'TM-ZM-03': 98.7, 'TM-ZM-02ST': 155, 'TM-ZM-03ST': 155,
  'TM-ZM-02S': 8.5, 'TM-ZM-03S': 8.5, 'TM-ZM-BIG-02': 125.9, 'TM-ZM-BIG-03': 125.9,
};
const nr = (p: Record<string, unknown>) => String(p.artikelnummer ?? '').toUpperCase();

/** Werkspreis bei allen Warenpositionen und nirgends eine Frachtzeile. */
const werkspreisOhneFracht = (positionen: Array<Record<string, unknown>>): boolean => {
  const echte = positionen.filter((p) => !p.istBedarfsposition);
  if (echte.some(istFracht)) return false;
  const waren = echte.filter((p) => WERKSPREISE[nr(p)] !== undefined);
  if (waren.length === 0) return false;
  return waren.every((p) => {
    const gezahlt = Number(p.einzelpreis ?? 0);
    return gezahlt > 0 && gezahlt <= WERKSPREISE[nr(p)] * 1.02;
  });
};

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

const alle = async (coll: string, queries: string[] = []) => {
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const r = await db.listDocuments(DB, coll, [...queries, Query.limit(100), Query.offset(offset)]);
    out.push(...(r.documents as Array<Record<string, unknown>>));
    if (r.documents.length < 100) break;
    offset += 100;
  }
  return out;
};
const flach = (d: Record<string, unknown>) => {
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(String(d.data ?? '{}')); } catch { /* Rohdokument genügt */ }
  return { ...j, ...d };
};

(async () => {
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} · ${DB}\n`);

  // Belege nach der Verladepauschale durchsuchen. Die Positionen stecken im
  // Feld `daten`; einen Kundenbezug trägt das Dokument NICHT — der Weg führt
  // über `projektId` zum Projekt und von dort zum Kunden.
  const projekte = (await alle('projekte')).map(flach);
  const projektZuKunde = new Map(projekte.map((p) => [String(p.$id), String(p.kundeId ?? '')]));

  const dokumente = (await alle('bestellabwicklung_dokumente')).map(flach);
  const mitPauschale = new Map<string, { name: string; belege: string[] }>();

  const positionenVon = (d: Record<string, unknown>): Array<Record<string, unknown>> => {
    try {
      const daten = JSON.parse(String(d.daten ?? '{}'));
      return (daten.positionen ?? []) as Array<Record<string, unknown>>;
    } catch { return []; }
  };

  /*
   * ERSTER Durchgang: Wer hat je Fracht bezahlt?
   *
   * Das muss vollständig feststehen, bevor Abholer-Belege gesammelt werden —
   * sonst hängt es von der Reihenfolge der Dokumente ab, ob ein Kunde als
   * „verworfen" gemeldet wird oder stillschweigend fehlt. TC Neuss-Weckhoven
   * verschwand so aus beiden Listen: Sein Frachtbeleg kam zuerst.
   */
  const hatFracht = new Set<string>();
  for (const d of dokumente) {
    const kundeId = projektZuKunde.get(String(d.projektId ?? '')) ?? '';
    if (!kundeId) continue;
    if (positionenVon(d).filter((p) => !p.istBedarfsposition).some(istFracht)) hatFracht.add(kundeId);
  }

  // ZWEITER Durchgang: Abholer-Belege sammeln.
  for (const d of dokumente) {
    let positionen: Array<Record<string, unknown>> = [];
    try {
      const daten = JSON.parse(String((d as Record<string, unknown>).daten ?? '{}'));
      positionen = (daten.positionen ?? []) as Array<Record<string, unknown>>;
    } catch { continue; }
    const kundeId = projektZuKunde.get(String(d.projektId ?? '')) ?? '';
    if (!kundeId) continue;

    /*
     * Fracht wird über ALLE Belege eines Kunden gesammelt, nicht je Beleg
     * entschieden. TC Tauberbischofsheim hat zweimal bezogen: 7 t geliefert
     * (Frachtpauschale + Dieselzuschlag) und 2 t abgeholt (Verladepauschale).
     * Beleg für Beleg betrachtet galt er als Abholer und hätte ein Angebot
     * ohne Frachtkosten bekommen. Ein einziger Lieferbeleg schlägt deshalb
     * jedes Abholer-Signal — der Abholer meldet sich von selbst, das falsche
     * Lieferangebot fällt niemandem auf.
     */
    const grund = positionen.some((p) => nr(p) === VERLADEPAUSCHALE)
      ? 'Verladepauschale'
      : werkspreisOhneFracht(positionen)
        ? 'Werkspreis ohne Fracht'
        : '';
    if (!grund) continue;
    const eintrag = mitPauschale.get(kundeId) ?? { name: '', belege: [] };
    eintrag.belege.push(`${d.dokumentTyp ?? '?'} ${d.dokumentNummer ?? ''} (${grund})`.trim());
    mitPauschale.set(kundeId, eintrag);
  }

  // Wer je Fracht bezahlt hat, fliegt wieder heraus — vollständig, weil der
  // Frachtbefund aus dem ersten Durchgang stammt.
  const mitFrachtRaus: string[] = [];
  for (const kundeId of [...mitPauschale.keys()]) {
    if (!hatFracht.has(kundeId)) continue;
    mitFrachtRaus.push(kundeId);
    mitPauschale.delete(kundeId);
  }

  const kunden = (await alle('saison_kunden')).map(flach);
  const kundenMap = new Map(kunden.map((k) => [String(k.$id), k]));
  /*
   * Rücknahme: Wer fälschlich als Abholer gekennzeichnet wurde, muss zurück.
   * Ein früherer Lauf entschied Beleg für Beleg und setzte das Merkmal schon
   * bei einer einzelnen Verladepauschale — auch bei Kunden, die daneben
   * Frachtkosten bezahlt haben. Angefasst wird nur, was diese Erkennung selbst
   * gesetzt hat (erkennbar an der Datenpflege-Notiz); von Hand gepflegte
   * Einträge bleiben unberührt.
   */
  let zurueckgenommen = 0;
  if (mitFrachtRaus.length > 0) {
    console.log(`${mitFrachtRaus.length} Kunden trotz Abholer-Beleg verworfen — sie haben auch Fracht bezahlt:`);
    for (const id of mitFrachtRaus) {
      const k = kundenMap.get(id);
      const name = String(k?.name ?? id);
      const istAbholer = k?.belieferungsart === 'abholung_ab_werk';
      const vonUns = /\[Datenpflege\] Abholer erkannt/.test(String(k?.notizen ?? ''));
      if (!istAbholer) { console.log(`   ${name}`); continue; }
      if (!vonUns) { console.log(`   ${name}  — als Abholer geführt, aber von Hand gepflegt: NICHT angefasst`); continue; }

      console.log(`   ${name}  — Kennzeichnung wird ZURÜCKGENOMMEN`);
      zurueckgenommen++;
      if (!APPLY) continue;
      const daten = JSON.parse(String(k?.data ?? '{}'));
      delete daten.belieferungsart;
      daten.abwerkspreis = false;
      daten.notizen = [String(daten.notizen ?? '').replace(/\s*·?\s*\[Datenpflege\] Abholer erkannt[^·]*/g, '').trim(),
        '[Datenpflege] Abholer-Kennzeichnung zurückgenommen: Kunde hat auch Fracht bezahlt']
        .filter(Boolean).join(' · ');
      await db.updateDocument(DB, 'saison_kunden', id, { data: JSON.stringify(daten) });
      await new Promise((r) => setTimeout(r, 120));
    }
    console.log('');
  }
  console.log(`${mitPauschale.size} Kunden mit Abholer-Beleg (Verladepauschale oder Werkspreis ohne Fracht)\n`);

  let gesetzt = 0, schonRichtig = 0;
  const widersprueche: string[] = [];
  for (const [kundeId, info] of mitPauschale) {
    const k = kundenMap.get(kundeId);
    if (!k) continue;
    const name = String(k.name ?? kundeId);
    const art = k.belieferungsart ? String(k.belieferungsart) : '';

    if (art === 'abholung_ab_werk') { schonRichtig++; continue; }
    if (art) {
      widersprueche.push(`${name}: belieferungsart=${art}, aber Abholer-Beleg: ${info.belege.slice(0, 2).join(', ')}`);
      continue;
    }

    console.log(`   ${name} ← ${info.belege.slice(0, 3).join(', ')}`);
    gesetzt++;
    if (!APPLY) continue;
    const daten = JSON.parse(String(k.data ?? '{}'));
    await db.updateDocument(DB, 'saison_kunden', kundeId, {
      data: JSON.stringify({
        ...daten,
        belieferungsart: 'abholung_ab_werk',
        abwerkspreis: true,
        notizen: [String(daten.notizen ?? ''), `[Datenpflege] Abholer erkannt am Beleg: ${info.belege[0]}`]
          .filter(Boolean).join(' · '),
      }),
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n${schonRichtig} bereits als Abholer gekennzeichnet · ${gesetzt} ${APPLY ? 'gesetzt' : 'zu setzen'}`
    + (zurueckgenommen > 0 ? ` · ${zurueckgenommen} ${APPLY ? 'zurückgenommen' : 'zurückzunehmen'}` : ''));
  if (widersprueche.length > 0) {
    console.log(`\n${widersprueche.length} WIDERSPRUCH — bitte von Hand klären (nicht angefasst):`);
    widersprueche.forEach((w) => console.log(`   ${w}`));
  }
  if (!APPLY) console.log('\nNichts geschrieben. Zum Ausführen: --apply');
})();
