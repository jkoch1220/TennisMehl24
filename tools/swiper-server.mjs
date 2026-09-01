/**
 * Lokaler Server für den Swiper — damit keine CSV mehr hin- und hergeschoben
 * werden muss.
 *
 *   npm run swiper
 *
 * Er liest die Prüflisten direkt aus dem Portal-Ordner und schreibt jede
 * Entscheidung sofort in dieselbe Datei zurück. Kein Hochladen, kein
 * Herunterladen: was im Browser entschieden wird, steht eine Sekunde später
 * auf der Platte.
 *
 * Lauscht nur auf 127.0.0.1 und lässt ausschließlich Dateien zu, die auf
 * `duplikat-kandidaten-*.csv` oder `archiv-kandidaten-*.csv` passen und direkt
 * im Portal-Ordner liegen.
 */
import { createServer } from 'http';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(HIER, '..');
const PORT = Number(process.env.PORT) || 8770;
const ERLAUBT = /^(duplikat|archiv)-kandidaten-[\w.-]+\.csv$/;

const typen = { '.html': 'text/html; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };

/** Verhindert, dass über die Anfrage ein Pfad außerhalb des Portals adressiert wird. */
function sichererPfad(datei) {
  if (!datei || !ERLAUBT.test(datei)) return null;
  const voll = path.resolve(PORTAL, datei);
  return path.dirname(voll) === PORTAL ? voll : null;
}

// --- CSV ---
function zerlege(zeile) {
  const raus = []; let cur = '', inQ = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inQ) { if (c === '"') { if (zeile[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ';') { raus.push(cur); cur = ''; }
    else cur += c;
  }
  raus.push(cur);
  return raus;
}
const fuege = (f) => (/[";]/.test(f ?? '') ? '"' + String(f).replace(/"/g, '""') + '"' : (f ?? ''));

async function antwort(res, code, daten, typ = 'application/json') {
  const koerper = typ.startsWith('application/json') ? JSON.stringify(daten) : daten;
  res.writeHead(code, { 'Content-Type': typ, 'Cache-Control': 'no-store' });
  res.end(koerper);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    // --- Oberfläche ---
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/swiper.html')) {
      const html = await readFile(path.join(HIER, 'swiper.html'), 'utf8');
      return antwort(res, 200, html, typen['.html']);
    }

    // --- Welche Listen liegen bereit? ---
    if (req.method === 'GET' && url.pathname === '/api/listen') {
      const dateien = (await readdir(PORTAL)).filter((d) => ERLAUBT.test(d) && !d.includes('-ausgeschlossen'));
      const listen = [];
      for (const d of dateien) {
        const s = await stat(path.join(PORTAL, d));
        const text = await readFile(path.join(PORTAL, d), 'utf8');
        const zeilen = text.replace(/^﻿/, '').trim().split('\n');
        const kopf = zerlege(zeilen[0]);
        const art = kopf.includes('cluster') ? 'duplikate' : 'archiv';
        const spalte = art === 'duplikate' ? 'einstufung' : 'entscheidung';
        const i = kopf.indexOf(spalte);
        // Bei Duplikaten zählt der Cluster, nicht die Zeile.
        const schluessel = art === 'duplikate' ? kopf.indexOf('cluster') : -1;
        const gesehen = new Set(); let gesamt = 0, offen = 0;
        for (const z of zeilen.slice(1)) {
          if (!z.trim()) continue;
          const f = zerlege(z);
          const k = schluessel >= 0 ? f[schluessel] : String(gesamt);
          if (gesehen.has(k)) continue;
          gesehen.add(k);
          gesamt++;
          if (!f[i]) offen++;
        }
        listen.push({ datei: d, art, gesamt, offen, geaendert: s.mtime.toISOString() });
      }
      listen.sort((a, b) => b.geaendert.localeCompare(a.geaendert));
      return antwort(res, 200, { listen });
    }

    // --- Eine Liste ausliefern ---
    if (req.method === 'GET' && url.pathname === '/api/liste') {
      const voll = sichererPfad(url.searchParams.get('datei'));
      if (!voll || !existsSync(voll)) return antwort(res, 404, { fehler: 'Liste nicht gefunden' });
      return antwort(res, 200, await readFile(voll, 'utf8'), typen['.csv']);
    }

    // --- Entscheidungen zurückschreiben ---
    if (req.method === 'POST' && url.pathname === '/api/entscheidung') {
      const roh = await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
      const { datei, spalte, werte } = JSON.parse(roh || '{}');
      const voll = sichererPfad(datei);
      if (!voll || !existsSync(voll)) return antwort(res, 404, { fehler: 'Liste nicht gefunden' });
      if (!spalte || !werte || typeof werte !== 'object') return antwort(res, 400, { fehler: 'spalte und werte fehlen' });

      const text = await readFile(voll, 'utf8');
      const bom = text.startsWith('﻿');
      const zeilen = text.replace(/^﻿/, '').split('\n');
      const kopf = zerlege(zeilen[0]);
      const i = kopf.indexOf(spalte);
      if (i < 0) return antwort(res, 400, { fehler: `Spalte ${spalte} fehlt` });
      const iId = kopf.indexOf('kundeId');

      let geschrieben = 0;
      const neu = [zeilen[0]];
      for (const z of zeilen.slice(1)) {
        if (!z.trim()) continue;
        const f = zerlege(z);
        const id = iId >= 0 ? f[iId] : '';
        if (id && Object.prototype.hasOwnProperty.call(werte, id)) {
          f[i] = werte[id] ?? '';
          geschrieben++;
        }
        neu.push(f.map(fuege).join(';'));
      }
      await writeFile(voll, (bom ? '﻿' : '') + neu.join('\n') + '\n', 'utf8');
      return antwort(res, 200, { geschrieben });
    }

    antwort(res, 404, { fehler: 'nicht gefunden' });
  } catch (e) {
    antwort(res, 500, { fehler: String(e && e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Datenpflege-Swiper läuft.');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('');
  console.log(`  Listen aus: ${PORTAL}`);
  console.log('  Jede Entscheidung wird sofort in die CSV zurückgeschrieben.');
  console.log('  Beenden mit Strg+C.');
  console.log('');
});
