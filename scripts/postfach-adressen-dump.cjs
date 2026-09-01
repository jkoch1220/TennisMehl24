#!/usr/bin/env node
'use strict';
/**
 * postfach-adressen-dump.cjs — Absender- und Empfängeradressen aus ALLEN Ordnern
 * aller Postfächer, als Rohmaterial für die Kundenzuordnung.
 *
 * Zweck: Vereine ohne hinterlegte E-Mail haben trotzdem geschrieben — die
 * Adresse steht im Postfach. Dieses Skript sammelt nur Header (schnell, kein
 * Nachrichtentext) und schreibt sie als JSON. Die Zuordnung zu Kunden macht
 * `emails-zu-kunden-finden.ts`; getrennt, damit der teure IMAP-Lauf nur einmal
 * nötig ist.
 *
 * Anders als postfach-scan.cjs werden hier AUCH Gesendet- und Archiv-Ordner
 * gelesen: Wem wir geschrieben haben, ist genauso ein Beleg wie eingehende Post.
 *
 * Die Fallstricke sind dieselben wie dort und deshalb gleich gelöst: utf7 unter
 * Node 24, eine frische Verbindung je Ordner, Warten auf 'close' (10 Verbindungen
 * je IP), Retry mit steigender Wartezeit.
 *
 *   node scripts/postfach-adressen-dump.cjs --since=2018 [--out=<datei>] [--accounts=a@x]
 */

const fs = require('fs');
const path = require('path');

(function patchUtf7() {
  const utf7 = require('utf7');
  function encode(str) {
    str = String(str); let out = ''; let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const b = Buffer.alloc(buf.length * 2);
      buf.forEach((u, i) => b.writeUInt16BE(u, i * 2));
      out += '&' + b.toString('base64').replace(/=+$/, '').replace(/\//g, ',') + '-';
      buf = [];
    };
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c === 38) { flush(); out += '&-'; }
      else if (c >= 0x20 && c <= 0x7e) { flush(); out += str[i]; }
      else buf.push(c);
    }
    flush();
    return out;
  }
  function decode(str) {
    return String(str).replace(/&([^-]*)-/g, (_, b64) => {
      if (b64 === '') return '&';
      const b = Buffer.from(b64.replace(/,/g, '/'), 'base64');
      let s = '';
      for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i));
      return s;
    });
  }
  utf7.encode = encode; utf7.decode = decode;
  if (utf7.imap) { utf7.imap.encode = encode; utf7.imap.decode = decode; }
})();

const Imap = require('imap');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SEIT_JAHR = Number(args.since || 2018);
const OUT_FILE = args.out || path.join(__dirname, '..', 'postfach-adressen.json');
const ONLY = args.accounts ? String(args.accounts).toLowerCase().split(',') : null;

function leseEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    env[m[1].trim()] = v;
  }
  return env;
}

// Host NICHT raten: Er steht in der .env (EMAIL_IMAP_HOST). Ein falscher Host
// meldet sich mit „authentication failed" — das sieht nach falschem Passwort
// aus und schickt einen auf die falsche Fährte.
const ENV = leseEnv();
const IMAP_HOST = ENV.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net';
const IMAP_PORT = Number(ENV.EMAIL_IMAP_PORT || 993);
const CONN_TIMEOUT = 25000;
const OP_TIMEOUT = 180000;
const CLOSE_GRACE = 400;

// Nur echter Müll bleibt draußen — Gesendet und Archiv sind hier wertvoll.
const SKIP_NAME = /(^|[._/])(trash|papierkorb|geloescht|gelöscht|deleted|junk|spam|virus)/i;
const SKIP_ATTRIB = /\\(Trash|Junk)/i;

function loadAccounts() {
  const env = leseEnv();
  let list = JSON.parse(env.EMAIL_ACCOUNTS);
  list = Array.isArray(list) ? list : Object.values(list);
  return ONLY ? list.filter((a) => ONLY.includes(String(a.email).toLowerCase())) : list;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const promisify = (obj, fn) => (...a) => new Promise((res, rej) =>
  obj[fn](...a, (err, v) => (err ? rej(err) : res(v))));

function makeConnection(account) {
  return new Imap({
    user: account.email, password: account.password,
    host: IMAP_HOST, port: IMAP_PORT, tls: true,
    tlsOptions: { rejectUnauthorized: false, servername: IMAP_HOST },
    connTimeout: CONN_TIMEOUT, authTimeout: CONN_TIMEOUT, keepalive: false,
  });
}

function closeQuietly(imap) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(resolve, CLOSE_GRACE); } };
    try {
      if (imap.state === 'disconnected') return finish();
      imap.once('close', finish); imap.once('end', finish);
      imap.end(); setTimeout(finish, 3000);
    } catch { finish(); }
  });
}

async function withConnection(account, label, fn, attempt = 1) {
  const imap = makeConnection(account);
  let settled = false;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error(`Timeout (${label})`)); } }, OP_TIMEOUT);
      const done = (err, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        err ? reject(err) : resolve(value);
      };
      imap.once('ready', () => { Promise.resolve(fn(imap)).then((v) => done(null, v), done); });
      imap.once('error', done);
      imap.connect();
    });
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/connection|timeout|ECONN|EPIPE|socket|Maximum/i.test(msg) && attempt < 3) {
      await closeQuietly(imap); await sleep(attempt * 2500);
      return withConnection(account, label, fn, attempt + 1);
    }
    throw err;
  } finally { await closeQuietly(imap); }
}

function flattenBoxes(boxes, prefix = '', out = []) {
  for (const [name, box] of Object.entries(boxes || {})) {
    if (typeof name !== 'string' || !name) continue;
    const delim = box.delimiter || '.';
    const full = prefix ? `${prefix}${delim}${name}` : name;
    out.push({ path: full, attribs: (box.attribs || []).join(' ') });
    if (box.children) flattenBoxes(box.children, full, out);
  }
  return out;
}

/** "Vorstand TC Muster" <a@b.de>, x@y.de  →  [{name, adresse}] */
function parseAdressen(kopfzeile) {
  const out = [];
  for (const teil of String(kopfzeile || '').split(/,(?![^<]*>)/)) {
    const m = teil.match(/<([^>]+)>/);
    const adresse = (m ? m[1] : teil).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(adresse)) continue;
    let name = m ? teil.slice(0, m.index).trim() : '';
    name = name.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    out.push({ name, adresse });
  }
  return out;
}

async function dumpeOrdner(account, ordner, seit) {
  return withConnection(account, `${account.email}/${ordner}`, async (imap) => {
    const box = await promisify(imap, 'openBox')(ordner, true); // readonly
    if (!box.messages.total) return [];
    const uids = await promisify(imap, 'search')([['SINCE', seit]]);
    if (!uids.length) return [];

    const eintraege = [];
    await new Promise((resolve, reject) => {
      const f = imap.fetch(uids, { bodies: 'HEADER.FIELDS (FROM TO CC SUBJECT DATE)', struct: false });
      f.on('message', (msg) => {
        let roh = '';
        msg.on('body', (stream) => { stream.on('data', (c) => { roh += c.toString('utf8'); }); });
        msg.once('end', () => {
          const feld = (name) => {
            const m = roh.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n[A-Za-z-]+:|$)`, 'im'));
            return m ? m[1].replace(/\r?\n\s+/g, ' ').trim() : '';
          };
          eintraege.push({
            von: parseAdressen(feld('From')),
            an: [...parseAdressen(feld('To')), ...parseAdressen(feld('Cc'))],
            betreff: feld('Subject').slice(0, 200),
            datum: feld('Date').slice(0, 40),
          });
        });
      });
      f.once('error', reject);
      f.once('end', resolve);
    });
    return eintraege;
  });
}

(async function main() {
  const konten = loadAccounts();
  const seit = `1-Jan-${SEIT_JAHR}`;
  console.log(`Adressen-Dump · ${konten.length} Konten · seit ${seit}\n`);

  const alle = [];
  for (const account of konten) {
    let ordner = [];
    try {
      const boxes = await withConnection(account, `${account.email} Ordner`, (imap) => promisify(imap, 'getBoxes')());
      ordner = flattenBoxes(boxes).filter((f) =>
        !/\\Noselect/i.test(f.attribs) && !SKIP_ATTRIB.test(f.attribs) &&
        (f.path.toUpperCase() === 'INBOX' || !SKIP_NAME.test(f.path)));
    } catch (e) {
      console.log(`  ${account.email}: Ordner nicht lesbar — ${e.message}`);
      continue;
    }
    let summe = 0;
    for (const f of ordner) {
      try {
        const e = await dumpeOrdner(account, f.path, seit);
        e.forEach((x) => alle.push({ ...x, konto: account.email, ordner: f.path }));
        summe += e.length;
      } catch (e) {
        console.log(`     ${f.path}: ${String(e.message).slice(0, 70)}`);
      }
      await sleep(250);
    }
    console.log(`  ${account.email}: ${summe} Nachrichten aus ${ordner.length} Ordnern`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(alle, null, 1));
  console.log(`\n${alle.length} Kopfzeilen → ${OUT_FILE}`);
})();
