/**
 * Kennzeichnet die ermittelten Selbstabholer im Kundenstamm.
 *
 * Grundlage ist `abholer-analyse.csv`: Kunden, die 2026 lose Ware zum
 * Werkspreis (98,70 €/t) und ohne Frachtposition bezogen haben. Gesetzt werden
 * zwei Felder:
 *
 *   belieferungsart = 'abholung_ab_werk'   → der Abholer-Lauf findet sie
 *   abwerkspreis    = true                 → Preisbildung ohne Frachtanteil
 *
 * Beides war bei praktisch keinem Kunden gepflegt; ohne diesen Lauf bliebe das
 * Massen-Angebot für Abholer dauerhaft leer.
 *
 *   npx tsx scripts/abholer-kennzeichnen.ts                 # Dry-Run, Sandbox
 *   npx tsx scripts/abholer-kennzeichnen.ts --apply
 *   npx tsx scripts/abholer-kennzeichnen.ts --apply --produktion
 */
import 'dotenv/config';
import * as fs from 'fs';

const ep=process.env.VITE_APPWRITE_ENDPOINT!, pid=process.env.VITE_APPWRITE_PROJECT_ID!, key=process.env.APPWRITE_API_KEY!;
const APPLY=process.argv.includes('--apply');
const PRODUKTION=process.argv.includes('--produktion');
const DB=PRODUKTION?'tennismehl24_db':'tennismehl24_db_mock';
const LISTE=process.argv.find(a=>a.startsWith('--liste='))?.split('=')[1] ?? 'abholer-analyse.csv';

/**
 * Von Hand ausgenommen: Der Beleg weist 0,00 €/t aus. Das ist kein Werkspreis,
 * sondern ein unvollständiger Beleg — den Kunden deshalb nicht als Abholer
 * führen, nur weil eine Zahl fehlt.
 */
const AUSGENOMMEN = new Set(['K10085']);

async function api<T=any>(m:string,p:string,b?:unknown){
  const r=await fetch(`${ep}${p}`,{method:m,headers:{'X-Appwrite-Project':pid,'X-Appwrite-Key':key,'Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});
  const t=await r.text(); return {ok:r.ok,daten:(t?JSON.parse(t):{}) as T&{message?:string}};
}
const obj=(r:unknown)=>{try{return typeof r==='string'?JSON.parse(r):{};}catch{return{};}};

(async()=>{
  console.log('═'.repeat(70));
  console.log(`  ABHOLER KENNZEICHNEN   ${PRODUKTION?'⚠️  PRODUKTION':'🧪 SANDBOX'}  (${DB})`);
  console.log(`  ${APPLY?'APPLY — es wird geschrieben':'DRY-RUN'}`);
  console.log('═'.repeat(70));

  const zeilen=fs.readFileSync(LISTE,'utf8').replace(/^﻿/,'').trim().split('\n');
  const kopf=zeilen[0].split(';'); const i=(n:string)=>kopf.indexOf(n);
  const kandidaten=zeilen.slice(1).map(z=>z.split(';'))
    .filter(f=>f[i('einstufung')]==='ABHOLER-VERDACHT')
    .map(f=>({knr:f[i('kundennummer')],name:f[i('name')],id:f[i('kundeId')],
              preis:f[i('preisProTonne')],menge:f[i('menge')]}));

  console.log(`\n${kandidaten.length} Kandidaten aus ${LISTE}\n`);
  let gesetzt=0, uebersprungen=0, fehler=0;

  for(const k of kandidaten){
    if(AUSGENOMMEN.has(k.knr)){
      console.log(`  ⊘ ${k.knr.padEnd(8)} ${k.name.slice(0,30).padEnd(30)} ausgenommen (Beleg ohne Preis)`);
      uebersprungen++; continue;
    }
    const res=await api(`GET`,`/tablesdb/${DB}/tables/saison_kunden/rows/${k.id}`);
    if(!res.ok){ console.log(`  ✗ ${k.knr.padEnd(8)} ${k.name.slice(0,30).padEnd(30)} nicht gefunden`); fehler++; continue; }
    const d=obj((res.daten as any).data);
    const schonGesetzt = d.belieferungsart==='abholung_ab_werk' && d.abwerkspreis===true;
    if(schonGesetzt){ console.log(`  = ${k.knr.padEnd(8)} ${k.name.slice(0,30).padEnd(30)} bereits gekennzeichnet`); uebersprungen++; continue; }

    console.log(`  ✓ ${k.knr.padEnd(8)} ${k.name.slice(0,30).padEnd(30)} ${String(k.menge).padStart(6)} t à ${k.preis} €/t`);
    if(!APPLY){ gesetzt++; continue; }

    d.belieferungsart='abholung_ab_werk';
    d.abwerkspreis=true;
    d.notizen=`${d.notizen?d.notizen+'\n':''}[Datenpflege] Als Selbstabholer gekennzeichnet: bezog 2026 lose Ware zum Werkspreis (${k.preis} €/t) ohne Frachtposition.`;
    const up=await api('PATCH',`/tablesdb/${DB}/tables/saison_kunden/rows/${k.id}`,{data:{data:JSON.stringify(d)}});
    if(up.ok) gesetzt++; else { console.error(`     ✗ ${up.daten.message}`); fehler++; }
    await new Promise(s=>setTimeout(s,320));
  }

  console.log(`\n${APPLY?'Gesetzt':'Würden gesetzt'}: ${gesetzt} · übersprungen: ${uebersprungen} · Fehler: ${fehler}`);
  if(!APPLY) console.log('Nichts geschrieben. Zum Ausführen: --apply');
})();
