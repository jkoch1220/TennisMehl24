#!/usr/bin/env node
'use strict';
/**
 * postfach-scan.cjs — Bestandsaufnahme offener Mails über alle Postfächer aus EMAIL_ACCOUNTS.
 *
 * Erfasst pro Konto:
 *   - ungelesene Mails (UNSEEN) je Ordner, mit Betreff, Absender, Alter, Anhängen, Textauszug
 *   - gelesene, aber unbeantwortete Mails der letzten Tage (SEEN UNANSWERED) in der INBOX
 *
 * Schreibt einen JSON-Report und gibt eine Kurzübersicht auf stdout aus.
 * Öffnet Ordner ausschließlich readonly — es wird nichts als gelesen markiert.
 *
 * Aufruf:  node scripts/postfach-scan.cjs [--days=30] [--answer-days=10] [--max=50]
 *                                         [--preview=900] [--out=<datei>] [--accounts=a@x,b@y]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Fallstrick 1: das Paket utf7 bricht unter Node 24 ──────────────────────
// utf7 nutzt `new Buffer(len, 'ascii')`; jeder Ordnername mit Umlaut wirft dann
// ERR_INVALID_ARG_TYPE. Der Patch muss VOR require('imap') laufen, weil sich
// node-imap das Modul aus dem require-Cache zieht.
(function patchUtf7() {
  const utf7 = require('utf7');

  function encode(str) {
    str = String(str);
    let out = '';
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const b = Buffer.alloc(buf.length * 2);
      buf.forEach((u, i) => b.writeUInt16BE(u, i * 2));
      out += '&' + b.toString('base64').replace(/=+$/, '').replace(/\//g, ',') + '-';
      buf = [];
    };
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c === 0x26) { flush(); out += '&-'; }
      else if (c >= 0x20 && c <= 0x7e) { flush(); out += str[i]; }
      else buf.push(c);
    }
    flush();
    return out;
  }

  function decode(str) {
    str = String(str);
    let out = '';
    let i = 0;
    while (i < str.length) {
      const amp = str.indexOf('&', i);
      if (amp === -1) { out += str.slice(i); break; }
      out += str.slice(i, amp);
      const end = str.indexOf('-', amp + 1);
      if (end === -1) { out += str.slice(amp); break; }
      const chunk = str.slice(amp + 1, end);
      if (chunk === '') {
        out += '&';
      } else {
        const b64 = chunk.replace(/,/g, '/');
        const b = Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64');
        for (let k = 0; k + 1 < b.length; k += 2) out += String.fromCharCode(b.readUInt16BE(k));
      }
      i = end + 1;
    }
    return out;
  }

  utf7.imap.encode = encode;
  utf7.imap.decode = decode;
})();

const Imap = require('imap');
const { simpleParser } = require('mailparser');

// ─── Konfiguration ──────────────────────────────────────────────────────────

const IMAP_HOST = 'web3.ipp-webspace.net';
const IMAP_PORT = 993;
const CONN_TIMEOUT = 30000;
const OP_TIMEOUT = 120000;
const MAX_BODY_BYTES = 100 * 1024;   // je Mail nur den Anfang laden
const CLOSE_GRACE = 400;             // Fallstrick 3: Server gibt Verbindungen verzögert frei

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true']; })
);

const DAYS = parseInt(args.days || '30', 10);
const ANSWER_DAYS = parseInt(args['answer-days'] || '10', 10);
const MAX_PER_FOLDER = parseInt(args.max || '50', 10);
const PREVIEW_CHARS = parseInt(args.preview || '900', 10);
const ONLY_ACCOUNTS = args.accounts ? args.accounts.split(',').map((s) => s.trim().toLowerCase()) : null;

const REPORT_DIR = path.join(os.homedir(), 'Tennismehl-Postfach-Reports');
const stamp = new Date().toISOString().slice(0, 10);
const OUT_FILE = args.out || path.join(REPORT_DIR, `scan-${stamp}.json`);

// Ordner, die keine offenen Vorgänge enthalten
const SKIP_NAME = /(^|[._/])(sent|gesendet|gesendete|trash|papierkorb|geloescht|gelöscht|deleted|junk|spam|drafts|entw[üu]rfe|archiv|archive|templates|vorlagen|notes|virus|erledigt|abgeschlossen|done)/i;
const SKIP_ATTRIB = /\\(Trash|Junk|Sent|Drafts|All|Archive)/i;

// Automatenpost: wird nicht ausgeblendet, sondern markiert und gebündelt gezählt,
// damit die Tageszusammenfassung echte Vorgänge nicht im Tracking-Rauschen verliert.
// Bei Bedarf hier erweitern.
const NOISE_FROM = /(no[-_.]?reply|noreply|donotreply|mailer-daemon|newsletter|shipment-tracking|order-update|versandbestaetigung|bounce|@amazon\.|@instar\.|@gls-|@dhl\.|@dropbox\.|@paypal\.|marketing@|news@|team@sipgate|partner@sipgate)/i;
const NOISE_SUBJECT = /(versendet:|in zustellung|unterwegs zur zustellung|geliefert:|dein .{0,20}paket|keine ereignisse|speicherplatz voll|newsletter|jetzt abmelden|webinar|zustellbenachrichtigung|sendungsverfolgung)/i;

function classify(from, subject) {
  return (NOISE_FROM.test(from) || NOISE_SUBJECT.test(subject)) ? 'automatisch' : 'geschaeftlich';
}

// ─── .env lesen ─────────────────────────────────────────────────────────────

function loadAccounts() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`FEHLER: ${envPath} nicht gefunden.`);
    process.exit(1);
  }
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
  if (!env.EMAIL_ACCOUNTS) {
    console.error('FEHLER: EMAIL_ACCOUNTS fehlt in .env');
    process.exit(1);
  }
  let list;
  try { list = JSON.parse(env.EMAIL_ACCOUNTS); }
  catch (e) { console.error('FEHLER: EMAIL_ACCOUNTS ist kein gültiges JSON:', e.message); process.exit(1); }
  list = Array.isArray(list) ? list : Object.values(list);
  return ONLY_ACCOUNTS ? list.filter((a) => ONLY_ACCOUNTS.includes(String(a.email).toLowerCase())) : list;
}

// ─── Verbindungs-Handling ───────────────────────────────────────────────────

function makeConnection(account) {
  return new Imap({
    user: account.email,
    password: account.password,
    host: IMAP_HOST,
    port: IMAP_PORT,
    tls: true,
    tlsOptions: { rejectUnauthorized: false, servername: IMAP_HOST },
    connTimeout: CONN_TIMEOUT,
    authTimeout: CONN_TIMEOUT,
    keepalive: false,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fallstrick 2 + 3: eine frische Verbindung je Arbeitsschritt, und nach end()
 * auf 'close' warten, bevor die nächste aufgebaut wird (Limit: 10 gleichzeitige
 * Verbindungen pro IP). Bei Verbindungsfehlern Retry mit steigender Wartezeit.
 */
async function withConnection(account, label, fn, attempt = 1) {
  const imap = makeConnection(account);
  let settled = false;

  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Timeout (${label})`));
      }, OP_TIMEOUT);

      const done = (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        err ? reject(err) : resolve(value);
      };

      imap.once('ready', () => { Promise.resolve(fn(imap)).then((v) => done(null, v), done); });
      imap.once('error', done);
      imap.connect();
    });
    return result;
  } catch (err) {
    const msg = String(err && err.message || err);
    const overloaded = /connection|timeout|ECONN|EPIPE|socket|Maximum/i.test(msg);
    if (overloaded && attempt < 3) {
      await closeQuietly(imap);
      await sleep(attempt * 2500);
      return withConnection(account, label, fn, attempt + 1);
    }
    throw err;
  } finally {
    await closeQuietly(imap);
  }
}

function closeQuietly(imap) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(resolve, CLOSE_GRACE); } };
    try {
      if (imap.state === 'disconnected') return finish();
      imap.once('close', finish);
      imap.once('end', finish);
      imap.end();
      setTimeout(finish, 3000);
    } catch (e) { finish(); }
  });
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

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

function isRelevantFolder(f) {
  if (/\\Noselect/i.test(f.attribs)) return false;
  if (SKIP_ATTRIB.test(f.attribs)) return false;
  if (f.path.toUpperCase() === 'INBOX') return true;
  return !SKIP_NAME.test(f.path);
}

function imapDate(daysBack) {
  const d = new Date(Date.now() - daysBack * 86400000);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()}-${mon}-${d.getFullYear()}`;
}

function cleanText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/^[>|].*$/gm, '')          // zitierte Vorgänger-Mails raus
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function collectAttachments(struct, acc = []) {
  for (const part of struct || []) {
    if (Array.isArray(part)) { collectAttachments(part, acc); continue; }
    const disp = part.disposition;
    const isAttachment = disp && /attachment|inline/i.test(disp.type || '') && disp.params && disp.params.filename;
    if (isAttachment) {
      acc.push({ filename: disp.params.filename, type: `${part.type}/${part.subtype}`.toLowerCase(), size: part.size || 0 });
    } else if (part.params && part.params.name) {
      acc.push({ filename: part.params.name, type: `${part.type}/${part.subtype}`.toLowerCase(), size: part.size || 0 });
    }
  }
  return acc;
}

const promisify = (imap, method) => (...a) =>
  new Promise((res, rej) => imap[method](...a, (err, val) => (err ? rej(err) : res(val))));

// ─── Kernlogik ──────────────────────────────────────────────────────────────

/** Ordnerliste + ungelesene Zähler über STATUS — ohne openBox, ohne fetch. */
async function surveyFolders(account) {
  return withConnection(account, 'survey', async (imap) => {
    const boxes = await promisify(imap, 'getBoxes')();
    const folders = flattenBoxes(boxes).filter(isRelevantFolder);
    const result = [];
    for (const f of folders) {
      try {
        const st = await promisify(imap, 'status')(f.path);
        result.push({ path: f.path, unseen: (st.messages && st.messages.unseen) || 0, total: (st.messages && st.messages.total) || 0 });
      } catch (e) {
        result.push({ path: f.path, unseen: 0, total: 0, error: String(e.message || e) });
      }
    }
    return result;
  });
}

/** Details zu den Mails eines Ordners. criteria = IMAP-Suchkriterien. */
async function fetchMails(account, folder, criteria, limit) {
  return withConnection(account, `fetch ${folder}`, async (imap) => {
    await promisify(imap, 'openBox')(folder, true);   // readonly — markiert nichts als gelesen
    const uids = await promisify(imap, 'search')(criteria);
    if (!uids || !uids.length) return { total: 0, mails: [] };

    const selected = uids.slice(-limit);              // neueste zuerst betrachten
    const mails = [];

    await new Promise((resolve, reject) => {
      const f = imap.fetch(selected, { bodies: '', struct: true, markSeen: false });
      let pending = 0;
      let streamsDone = false;
      const maybeFinish = () => { if (streamsDone && pending === 0) resolve(); };

      f.on('message', (msg, seqno) => {
        const chunks = [];
        let size = 0;
        let attrs = null;

        msg.on('attributes', (a) => { attrs = a; });
        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            if (size < MAX_BODY_BYTES) { chunks.push(chunk); size += chunk.length; }
          });
        });
        msg.once('end', () => {
          pending++;
          const raw = Buffer.concat(chunks);
          simpleParser(raw)
            .then((mail) => {
              const date = mail.date || (attrs && attrs.date) || null;
              const body = cleanText(mail.text || (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : ''));
              const fromText = (mail.from && mail.from.text) || '(unbekannt)';
              const subjectText = mail.subject || '(kein Betreff)';
              mails.push({
                folder,
                kind: classify(fromText, subjectText),
                uid: attrs ? attrs.uid : seqno,
                date: date ? new Date(date).toISOString() : null,
                ageDays: date ? Math.round((Date.now() - new Date(date).getTime()) / 86400000) : null,
                from: fromText,
                to: (mail.to && mail.to.text) || '',
                cc: (mail.cc && mail.cc.text) || '',
                subject: subjectText,
                flags: (attrs && attrs.flags) || [],
                answered: !!(attrs && attrs.flags && attrs.flags.includes('\\Answered')),
                attachments: collectAttachments(attrs && attrs.struct),
                preview: body.slice(0, PREVIEW_CHARS),
                truncated: body.length > PREVIEW_CHARS,
              });
            })
            .catch(() => { /* einzelne unparsbare Mail überspringen */ })
            .finally(() => { pending--; maybeFinish(); });
        });
      });

      f.once('error', reject);
      f.once('end', () => { streamsDone = true; maybeFinish(); });
    });

    mails.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { total: uids.length, mails };
  });
}

async function scanAccount(account) {
  const res = {
    email: account.email,
    name: account.name || '',
    ok: true,
    unreadTotal: 0,
    unreadInWindow: 0,
    folders: [],
    mails: [],
    unanswered: [],
    errors: [],
  };

  let folders;
  try {
    folders = await surveyFolders(account);
  } catch (e) {
    res.ok = false;
    res.errors.push(`Ordnerübersicht fehlgeschlagen: ${String(e.message || e)}`);
    return res;
  }

  res.folders = folders.map((f) => ({ path: f.path, unseen: f.unseen, total: f.total }));
  res.unreadTotal = folders.reduce((s, f) => s + f.unseen, 0);

  for (const f of folders.filter((x) => x.unseen > 0)) {
    try {
      const { total, mails } = await fetchMails(account, f.path, ['UNSEEN', ['SINCE', imapDate(DAYS)]], MAX_PER_FOLDER);
      res.unreadInWindow += total;
      res.mails.push(...mails);
    } catch (e) {
      res.errors.push(`Ordner "${f.path}": ${String(e.message || e)}`);
    }
  }

  // Gelesen, aber nie beantwortet — das sind die stillen Liegenbleiber.
  try {
    const { mails } = await fetchMails(
      account, 'INBOX',
      ['SEEN', 'UNANSWERED', ['SINCE', imapDate(ANSWER_DAYS)]],
      Math.min(MAX_PER_FOLDER, 30)
    );
    res.unanswered = mails;
  } catch (e) {
    res.errors.push(`Unbeantwortet-Prüfung INBOX: ${String(e.message || e)}`);
  }

  res.mails.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.relevant = {
    unread: res.mails.filter((m) => m.kind === 'geschaeftlich').length,
    unanswered: res.unanswered.filter((m) => m.kind === 'geschaeftlich').length,
    noiseUnread: res.mails.filter((m) => m.kind === 'automatisch').length,
  };
  return res;
}

// ─── Ausführung ─────────────────────────────────────────────────────────────

(async function main() {
  const accounts = loadAccounts();
  const started = Date.now();

  console.log(`Postfach-Scan — ${accounts.length} Konten, ungelesen seit ${DAYS} Tagen, unbeantwortet seit ${ANSWER_DAYS} Tagen`);
  console.log('');

  const report = {
    scannedAt: new Date().toISOString(),
    host: IMAP_HOST,
    windowDays: DAYS,
    answerWindowDays: ANSWER_DAYS,
    accounts: [],
  };

  for (const account of accounts) {
    process.stdout.write(`  ${account.email} … `);
    const r = await scanAccount(account);
    report.accounts.push(r);
    if (!r.ok) console.log(`FEHLER (${r.errors[0]})`);
    else console.log(`${r.unreadTotal} ungelesen gesamt | im Fenster: ${r.relevant.unread} relevant + ${r.relevant.noiseUnread} automatisch | ${r.relevant.unanswered} unbeantwortet${r.errors.length ? ` | ${r.errors.length} Ordnerfehler` : ''}`);
  }

  report.summary = {
    unreadTotal: report.accounts.reduce((s, a) => s + a.unreadTotal, 0),
    unreadLoaded: report.accounts.reduce((s, a) => s + a.mails.length, 0),
    unansweredLoaded: report.accounts.reduce((s, a) => s + a.unanswered.length, 0),
    relevantUnread: report.accounts.reduce((s, a) => s + ((a.relevant && a.relevant.unread) || 0), 0),
    relevantUnanswered: report.accounts.reduce((s, a) => s + ((a.relevant && a.relevant.unanswered) || 0), 0),
    noiseUnread: report.accounts.reduce((s, a) => s + ((a.relevant && a.relevant.noiseUnread) || 0), 0),
    accountsWithErrors: report.accounts.filter((a) => a.errors.length || !a.ok).map((a) => a.email),
    durationSeconds: Math.round((Date.now() - started) / 1000),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf-8');

  console.log('');
  console.log(`Gesamt: ${report.summary.relevantUnread} relevante ungelesene + ${report.summary.relevantUnanswered} unbeantwortete Vorgänge`);
  console.log(`        (${report.summary.noiseUnread} Automatenpost im Fenster, ${report.summary.unreadTotal} ungelesen insgesamt inkl. Altbestand, ${report.summary.durationSeconds}s)`);
  console.log(`Report: ${OUT_FILE}`);
})().catch((e) => {
  console.error('Abbruch:', e && e.stack || e);
  process.exit(1);
});
