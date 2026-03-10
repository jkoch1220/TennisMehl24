#!/usr/bin/env npx tsx
/**
 * Averbeck Email Scanner
 *
 * Scannt alle Email-Konten nach Emails von Averbeck (averbeckservice@t-online.de)
 * und extrahiert Vereinsdaten aus dem Email-Text sowie aus Excel-Anhängen.
 *
 * Ausführung: npx tsx scripts/averbeck-email-scanner.ts
 */

import Imap from 'imap';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

// ==================== KONFIGURATION ====================

const AVERBECK_EMAIL = 'averbeckservice@t-online.de';
const IMAP_HOST = 'web3.ipp-webspace.net';
const IMAP_PORT = 993;
const TIMEOUT_MS = 30000; // 30 Sekunden pro Konto
const OUTPUT_FILE = '/tmp/averbeck_vereine.json';

// Relevante Email-Konten zum Durchsuchen
const RELEVANT_ACCOUNTS = [
  'info@tennismehl.com',
  'anfrage@tennismehl.com',
  'bestellung@tennismehl24.com',
  'logistik@tennismehl.com',
  'jr@tennismehl.com',
  'egner@tennismehl.com',
  'sigle@tennismehl.com',
];

// ==================== INTERFACES ====================

interface EmailAccount {
  email: string;
  password: string;
  name: string;
}

interface ExtrahierterVerein {
  vereinsname: string;
  strasse: string;
  plz: string;
  ort: string;
  kontakt: string;
  telefon: string;
  menge: string;
  termin: string;
  quelle: string;
  emailDatum: string;
}

interface AverbeckEmail {
  uid: number;
  betreff: string;
  datum: string;
  textBody: string;
  htmlBody: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
  account: string;
  folder?: string; // In welchem Ordner gefunden
}

interface ScanErgebnis {
  durchsuchteKonten: number;
  kontenMitFehlern: string[];
  gefundeneEmails: number;
  extrahierteVereine: number;
  excelDateienVerarbeitet: number;
  vereine: ExtrahierterVerein[];
}

// ==================== .ENV PARSER ====================

function parseEnvFile(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    console.error('❌ .env Datei nicht gefunden!');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Entferne Anführungszeichen
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }

  return env;
}

function getEmailAccounts(env: Record<string, string>): EmailAccount[] {
  const accountsJson = env['EMAIL_ACCOUNTS'];

  if (!accountsJson) {
    console.error('❌ EMAIL_ACCOUNTS nicht in .env gefunden!');
    process.exit(1);
  }

  try {
    return JSON.parse(accountsJson);
  } catch (e) {
    console.error('❌ EMAIL_ACCOUNTS JSON Parse-Fehler:', e);
    process.exit(1);
  }
}

// ==================== IMAP FUNKTIONEN ====================

// Hole alle Ordner eines Kontos
function getAllFolders(account: EmailAccount): Promise<string[]> {
  return new Promise((resolve) => {
    const folders: string[] = [];

    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: TIMEOUT_MS,
      authTimeout: TIMEOUT_MS,
    });

    const timeoutHandle = setTimeout(() => {
      try { imap.end(); } catch (e) { /* ignore */ }
      resolve(folders);
    }, TIMEOUT_MS);

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        clearTimeout(timeoutHandle);
        imap.end();

        if (err) {
          resolve(folders);
          return;
        }

        // Rekursiv alle Ordner sammeln
        const processBoxes = (boxList: Imap.MailBoxes, prefix = '') => {
          for (const [name, box] of Object.entries(boxList)) {
            // Nur gültige String-Namen akzeptieren
            if (typeof name !== 'string' || !name) continue;

            const delimiter = box.delimiter || '.';
            const path = prefix ? `${prefix}${delimiter}${name}` : name;

            // Nur Strings in die Liste aufnehmen
            if (typeof path === 'string' && path.length > 0) {
              folders.push(path);
            }

            if (box.children) {
              processBoxes(box.children, path);
            }
          }
        };

        processBoxes(boxes);
        resolve(folders);
      });
    });

    imap.once('error', () => {
      clearTimeout(timeoutHandle);
      resolve(folders);
    });

    imap.connect();
  });
}

function searchAverbeckEmails(account: EmailAccount): Promise<AverbeckEmail[]> {
  return new Promise(async (resolve) => {
    const emails: AverbeckEmail[] = [];

    // Erst alle Ordner holen
    console.log(`     Lade Ordnerliste...`);
    const allFolders = await getAllFolders(account);

    if (allFolders.length === 0) {
      // Fallback auf Standard-Ordner
      allFolders.push('INBOX', 'Sent', 'Trash', 'Deleted', 'Papierkorb');
    }

    console.log(`     ${allFolders.length} Ordner gefunden: ${allFolders.slice(0, 5).join(', ')}${allFolders.length > 5 ? '...' : ''}`);

    let timeoutHandle: NodeJS.Timeout;

    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: TIMEOUT_MS,
      authTimeout: TIMEOUT_MS,
    });

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      try {
        imap.end();
      } catch (e) {
        // Ignore
      }
    };

    // Längerer Timeout da wir jetzt ALLE Ordner durchsuchen
    const extendedTimeout = TIMEOUT_MS * 4; // 2 Minuten pro Konto
    timeoutHandle = setTimeout(() => {
      console.log(`  ⏱️  Timeout für ${account.email}`);
      cleanup();
      resolve(emails);
    }, extendedTimeout);

    imap.once('ready', () => {
      let currentFolderIndex = 0;
      let pendingParses = 0;
      let foldersWithEmails: string[] = [];

      const processFolder = () => {
        if (currentFolderIndex >= allFolders.length) {
          // Warte auf alle ausstehenden Parses
          const checkComplete = () => {
            if (pendingParses === 0) {
              if (foldersWithEmails.length > 0) {
                console.log(`     📁 Gefunden in: ${foldersWithEmails.join(', ')}`);
              }
              cleanup();
              resolve(emails);
            } else {
              setTimeout(checkComplete, 100);
            }
          };
          checkComplete();
          return;
        }

        const folder = allFolders[currentFolderIndex];
        currentFolderIndex++;

        // Sicherstellen dass Ordnername ein gültiger String ist
        if (typeof folder !== 'string' || !folder || folder.length === 0) {
          setImmediate(processFolder);
          return;
        }

        // Wrapper um openBox mit Error-Handling
        const tryOpenBox = () => {
          try {
            imap.openBox(folder, true, (err) => {
              if (err) {
                setImmediate(processFolder);
                return;
              }

              // Suche nach Emails von Averbeck
              try {
                imap.search([['FROM', AVERBECK_EMAIL]], (searchErr, uids) => {
                  if (searchErr || !uids || uids.length === 0) {
                    setImmediate(processFolder);
                    return;
                  }

                  foldersWithEmails.push(`${folder}(${uids.length})`);

                  const f = imap.fetch(uids, {
                    bodies: '',
                    struct: true,
                  });

                  f.on('message', (msg) => {
                    let uid = 0;

                    msg.on('body', (stream) => {
                      const chunks: Buffer[] = [];
                      stream.on('data', (chunk) => chunks.push(chunk));
                      stream.once('end', () => {
                        pendingParses++;
                        const buffer = Buffer.concat(chunks);

                        simpleParser(buffer)
                          .then((mail: ParsedMail) => {
                            const attachments = (mail.attachments || []).map((att: Attachment) => ({
                              filename: att.filename || 'unbekannt',
                              contentType: att.contentType || 'application/octet-stream',
                              size: att.size || 0,
                              content: att.content,
                            }));

                            emails.push({
                              uid,
                              betreff: mail.subject || '(Kein Betreff)',
                              datum: mail.date?.toISOString() || new Date().toISOString(),
                              textBody: mail.text || '',
                              htmlBody: typeof mail.html === 'string' ? mail.html : '',
                              attachments,
                              account: account.email,
                              folder,
                            });
                          })
                          .catch((e) => {
                            console.error(`  ⚠️  Parse-Fehler in ${folder}:`, e.message);
                          })
                          .finally(() => {
                            pendingParses--;
                          });
                      });
                    });

                    msg.once('attributes', (attrs) => {
                      uid = attrs.uid;
                    });
                  });

                  f.once('error', () => {
                    setImmediate(processFolder);
                  });

                  f.once('end', () => {
                    setTimeout(() => processFolder(), 50);
                  });
                });
              } catch (searchError) {
                setImmediate(processFolder);
              }
            });
          } catch (openError) {
            // Überspringe problematische Ordner (z.B. ungültige Namen)
            setImmediate(processFolder);
          }
        };

        tryOpenBox();
      };

      processFolder();
    });

    imap.once('error', (err: Error) => {
      console.log(`  ❌ IMAP Fehler für ${account.email}: ${err.message}`);
      cleanup();
      resolve(emails);
    });

    imap.connect();
  });
}

// ==================== VEREINS-EXTRAKTION ====================

// Muster für Vereinsnamen
const VEREINS_PRAEFIXE = [
  'TC', 'TV', 'TuS', 'TSV', 'SV', 'FC', 'SC', 'VfB', 'VfL', 'VfR', 'SSV', 'SpVgg',
  'TSG', 'TG', 'MTV', 'DJK', 'BSC', 'FSV', 'ASV', 'ESV', 'PSV', 'Tennisclub',
  'Tennisverein', 'Tennis-Club', 'Tennis Club', 'Tennisabteilung'
];

const PLZ_REGEX = /(\d{5})\s+([A-Za-zäöüÄÖÜß\s\-\.]+)/;
const TELEFON_REGEX = /(?:Tel|Telefon|Mobil|Handy|Fon|Fax)?[:\.\s]*(\+?[\d\s\/\-\(\)]+[\d])/gi;
const MENGE_REGEX = /(\d+(?:[,\.]\d+)?)\s*(?:to\.?|t\.?|Tonnen?)/gi;
const KW_REGEX = /(?:KW|Kalenderwoche)\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi;
const LIEFERTERMIN_REGEX = /(?:Liefertermin|Lieferung|Termin)[:\s]*([^\n]+)/gi;

function normalisiereVereinsname(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/e\.\s*v\.?/gi, 'e.v.')
    .replace(/[^\wäöüß\s\.]/gi, '')
    .trim();
}

function extrahiereVereineAusText(text: string, quelle: string, emailDatum: string): ExtrahierterVerein[] {
  const vereine: ExtrahierterVerein[] = [];
  const zeilen = text.split('\n').map(z => z.trim()).filter(z => z.length > 0);

  let currentVerein: Partial<ExtrahierterVerein> | null = null;

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];

    // Prüfe auf Vereinsname
    const istVereinsname = VEREINS_PRAEFIXE.some(prefix =>
      zeile.toLowerCase().startsWith(prefix.toLowerCase()) ||
      zeile.toLowerCase().includes('tennisclub') ||
      zeile.toLowerCase().includes('tennisverein') ||
      zeile.toLowerCase().includes('tennis-club')
    ) || zeile.match(/e\.\s*v\.?$/i);

    if (istVereinsname && !zeile.match(/^\d+/)) {
      // Speichere vorherigen Verein wenn vorhanden
      if (currentVerein && currentVerein.vereinsname) {
        vereine.push({
          vereinsname: currentVerein.vereinsname || '',
          strasse: currentVerein.strasse || '',
          plz: currentVerein.plz || '',
          ort: currentVerein.ort || '',
          kontakt: currentVerein.kontakt || '',
          telefon: currentVerein.telefon || '',
          menge: currentVerein.menge || '',
          termin: currentVerein.termin || '',
          quelle,
          emailDatum,
        });
      }

      // Starte neuen Verein
      currentVerein = {
        vereinsname: zeile.replace(/[,;]$/, '').trim(),
        quelle,
        emailDatum,
      };
      continue;
    }

    if (!currentVerein) continue;

    // Prüfe auf PLZ + Ort
    const plzMatch = zeile.match(PLZ_REGEX);
    if (plzMatch && !currentVerein.plz) {
      currentVerein.plz = plzMatch[1];
      currentVerein.ort = plzMatch[2].trim();

      // Wenn keine Straße, könnte die vorherige Zeile die Straße sein
      if (!currentVerein.strasse && i > 0) {
        const vorherige = zeilen[i - 1];
        // Straße enthält typischerweise eine Hausnummer oder Straßenbezeichnung
        if (vorherige.match(/\d/) || vorherige.match(/(str|straße|weg|platz|allee|ring)/i)) {
          currentVerein.strasse = vorherige;
        }
      }
      continue;
    }

    // Prüfe auf Straße (enthält Hausnummer)
    if (!currentVerein.strasse && (zeile.match(/\d/) || zeile.match(/(str|straße|weg|platz|allee|ring|am\s+)/i))) {
      // Aber nicht wenn es PLZ oder Menge ist
      if (!zeile.match(/^\d{5}/) && !zeile.match(/\d+\s*(to|t\.|tonnen)/i)) {
        currentVerein.strasse = zeile;
        continue;
      }
    }

    // Prüfe auf Ansprechpartner (Herr/Frau)
    if (zeile.match(/^(Herr|Frau|Hr\.|Fr\.)\s+/i) && !currentVerein.kontakt) {
      currentVerein.kontakt = zeile;
      continue;
    }

    // Prüfe auf Telefonnummer
    const telefonMatch = zeile.match(/(?:Tel|Telefon|Mobil|Handy|Fon)?[:\.\s]*([\+\d][\d\s\/\-\(\)]{6,})/i);
    if (telefonMatch && !currentVerein.telefon) {
      currentVerein.telefon = telefonMatch[1].trim();
      continue;
    }

    // Prüfe auf Menge
    const mengeMatch = zeile.match(/(\d+(?:[,\.]\d+)?)\s*(?:to\.?|t\.?|Tonnen?)/i);
    if (mengeMatch && !currentVerein.menge) {
      currentVerein.menge = mengeMatch[1].replace(',', '.') + ' t';

      // Wenn nach Menge noch Text kommt, könnte das der Termin sein
      const rest = zeile.substring(zeile.indexOf(mengeMatch[0]) + mengeMatch[0].length).trim();
      if (rest.length > 0) {
        // Prüfe auf KW oder andere Terminangaben
        const kwMatch = rest.match(/(?:KW|Kalenderwoche)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
        if (kwMatch) {
          currentVerein.termin = kwMatch[2]
            ? `KW ${kwMatch[1]} - ${kwMatch[2]}`
            : `KW ${kwMatch[1]}`;
        }
      }
      continue;
    }

    // Prüfe auf Liefertermin
    const terminMatch = zeile.match(/(?:Liefertermin|Lieferung|Termin)[:\s]*(.+)/i);
    if (terminMatch && !currentVerein.termin) {
      currentVerein.termin = terminMatch[1].trim();
      continue;
    }

    // KW-Angabe direkt
    const kwDirektMatch = zeile.match(/(\d+)\.\s*[-–]\s*(\d+)\.\s*KW/i);
    if (kwDirektMatch && !currentVerein.termin) {
      currentVerein.termin = `KW ${kwDirektMatch[1]} - ${kwDirektMatch[2]}`;
      continue;
    }

    const kwEinzeln = zeile.match(/^(?:KW|Kalenderwoche)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
    if (kwEinzeln && !currentVerein.termin) {
      currentVerein.termin = kwEinzeln[2]
        ? `KW ${kwEinzeln[1]} - ${kwEinzeln[2]}`
        : `KW ${kwEinzeln[1]}`;
      continue;
    }
  }

  // Letzten Verein speichern
  if (currentVerein && currentVerein.vereinsname) {
    vereine.push({
      vereinsname: currentVerein.vereinsname || '',
      strasse: currentVerein.strasse || '',
      plz: currentVerein.plz || '',
      ort: currentVerein.ort || '',
      kontakt: currentVerein.kontakt || '',
      telefon: currentVerein.telefon || '',
      menge: currentVerein.menge || '',
      termin: currentVerein.termin || '',
      quelle,
      emailDatum,
    });
  }

  return vereine;
}

// ==================== EXCEL-VERARBEITUNG ====================

async function extrahiereVereineAusExcel(
  attachment: { filename: string; content: Buffer },
  quelle: string,
  emailDatum: string
): Promise<ExtrahierterVerein[]> {
  const vereine: ExtrahierterVerein[] = [];

  // Speichere temporär
  const tmpPath = `/tmp/${Date.now()}_${attachment.filename}`;
  fs.writeFileSync(tmpPath, attachment.content);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(tmpPath);

    workbook.eachSheet((worksheet) => {
      // Finde Header-Zeile
      let headerRow = -1;
      const headerMap: Record<string, number> = {};

      worksheet.eachRow((row, rowNumber) => {
        if (headerRow === -1) {
          // Suche nach Header-Zeile
          const values = row.values as (string | number | undefined)[];
          const valuesStr = values.map(v => String(v || '').toLowerCase());

          // Typische Header-Begriffe
          const headerKeywords = ['verein', 'name', 'straße', 'strasse', 'plz', 'ort', 'menge', 'tonnen', 'termin', 'lieferung', 'ansprechpartner', 'telefon', 'kontakt'];

          const foundHeaders = headerKeywords.filter(keyword =>
            valuesStr.some(v => v.includes(keyword))
          );

          if (foundHeaders.length >= 2) {
            headerRow = rowNumber;

            // Mappe Spalten
            valuesStr.forEach((val, colIndex) => {
              if (val.includes('verein') || val.includes('name') && !val.includes('ansprech')) {
                headerMap['vereinsname'] = colIndex;
              }
              if (val.includes('straße') || val.includes('strasse')) {
                headerMap['strasse'] = colIndex;
              }
              if (val.includes('plz') || val.includes('postleitzahl')) {
                headerMap['plz'] = colIndex;
              }
              if (val.includes('ort') || val.includes('stadt')) {
                headerMap['ort'] = colIndex;
              }
              if (val.includes('menge') || val.includes('tonnen') || val.includes('to')) {
                headerMap['menge'] = colIndex;
              }
              if (val.includes('termin') || val.includes('lieferung') || val.includes('kw')) {
                headerMap['termin'] = colIndex;
              }
              if (val.includes('ansprech') || val.includes('kontakt')) {
                headerMap['kontakt'] = colIndex;
              }
              if (val.includes('telefon') || val.includes('mobil') || val.includes('tel')) {
                headerMap['telefon'] = colIndex;
              }
            });
          }
        } else {
          // Datenzeile
          const values = row.values as (string | number | undefined)[];

          const getValue = (key: string): string => {
            const colIndex = headerMap[key];
            if (colIndex === undefined) return '';
            const val = values[colIndex];
            return val !== undefined && val !== null ? String(val).trim() : '';
          };

          const vereinsname = getValue('vereinsname');

          // Nur wenn es einen Vereinsnamen gibt
          if (vereinsname && vereinsname.length > 3) {
            vereine.push({
              vereinsname,
              strasse: getValue('strasse'),
              plz: getValue('plz'),
              ort: getValue('ort'),
              kontakt: getValue('kontakt'),
              telefon: getValue('telefon'),
              menge: getValue('menge') ? `${getValue('menge')} t` : '',
              termin: getValue('termin'),
              quelle: `${quelle} (Excel: ${attachment.filename})`,
              emailDatum,
            });
          }
        }
      });
    });
  } catch (e) {
    console.log(`  ⚠️  Excel-Fehler bei ${attachment.filename}: ${(e as Error).message}`);
  } finally {
    // Aufräumen
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      // Ignore
    }
  }

  return vereine;
}

// ==================== DEDUPLIZIERUNG ====================

function dedupliziereVereine(vereine: ExtrahierterVerein[]): ExtrahierterVerein[] {
  const seen = new Map<string, ExtrahierterVerein>();

  for (const verein of vereine) {
    const key = normalisiereVereinsname(verein.vereinsname);

    if (!seen.has(key)) {
      seen.set(key, verein);
    } else {
      // Merge: Behalte vorhandene Werte, ergänze fehlende
      const existing = seen.get(key)!;
      seen.set(key, {
        vereinsname: existing.vereinsname || verein.vereinsname,
        strasse: existing.strasse || verein.strasse,
        plz: existing.plz || verein.plz,
        ort: existing.ort || verein.ort,
        kontakt: existing.kontakt || verein.kontakt,
        telefon: existing.telefon || verein.telefon,
        menge: existing.menge || verein.menge,
        termin: existing.termin || verein.termin,
        quelle: existing.quelle, // Behalte erste Quelle
        emailDatum: existing.emailDatum,
      });
    }
  }

  return Array.from(seen.values());
}

// ==================== AUSGABE ====================

function formatiereDatum(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString.substring(0, 10);
  }
}

function kuerzeTabellenText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text.padEnd(maxLen);
  return text.substring(0, maxLen - 2) + '..';
}

function druckeTabelleAusVereine(vereine: ExtrahierterVerein[]): void {
  console.log('\n' + '='.repeat(180));
  console.log('EXTRAHIERTE VEREINE');
  console.log('='.repeat(180));

  // Header
  const header = [
    '#'.padEnd(4),
    'Vereinsname'.padEnd(35),
    'Straße'.padEnd(25),
    'PLZ'.padEnd(6),
    'Ort'.padEnd(20),
    'Kontakt'.padEnd(20),
    'Telefon'.padEnd(18),
    'Menge'.padEnd(8),
    'Termin'.padEnd(15),
    'Quelle'.padEnd(40),
  ].join(' | ');

  console.log(header);
  console.log('-'.repeat(180));

  // Zeilen
  vereine.forEach((v, index) => {
    const row = [
      String(index + 1).padEnd(4),
      kuerzeTabellenText(v.vereinsname, 35),
      kuerzeTabellenText(v.strasse, 25),
      kuerzeTabellenText(v.plz, 6),
      kuerzeTabellenText(v.ort, 20),
      kuerzeTabellenText(v.kontakt, 20),
      kuerzeTabellenText(v.telefon, 18),
      kuerzeTabellenText(v.menge, 8),
      kuerzeTabellenText(v.termin, 15),
      kuerzeTabellenText(`${v.quelle} (${formatiereDatum(v.emailDatum)})`, 40),
    ].join(' | ');

    console.log(row);
  });

  console.log('='.repeat(180));
}

// ==================== HAUPTPROGRAMM ====================

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           AVERBECK EMAIL SCANNER                               ║');
  console.log('║           Suche nach: averbeckservice@t-online.de              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Lade Konfiguration
  const env = parseEnvFile();
  const allAccounts = getEmailAccounts(env);

  // Filtere auf relevante Konten
  const accounts = allAccounts.filter(acc =>
    RELEVANT_ACCOUNTS.includes(acc.email)
  );

  console.log(`📧 Durchsuche ${accounts.length} Email-Konten...\n`);

  const ergebnis: ScanErgebnis = {
    durchsuchteKonten: accounts.length,
    kontenMitFehlern: [],
    gefundeneEmails: 0,
    extrahierteVereine: 0,
    excelDateienVerarbeitet: 0,
    vereine: [],
  };

  const alleEmails: AverbeckEmail[] = [];

  // Durchsuche alle Konten parallel
  const results = await Promise.all(
    accounts.map(async (account) => {
      console.log(`🔍 Durchsuche: ${account.email}...`);
      try {
        const emails = await searchAverbeckEmails(account);
        console.log(`   ✅ ${emails.length} Averbeck-Emails gefunden`);
        return { account: account.email, emails, error: null };
      } catch (error) {
        const msg = (error as Error).message;
        console.log(`   ❌ Fehler: ${msg}`);
        return { account: account.email, emails: [], error: msg };
      }
    })
  );

  // Sammle Ergebnisse
  for (const result of results) {
    if (result.error) {
      ergebnis.kontenMitFehlern.push(result.account);
    }
    alleEmails.push(...result.emails);
  }

  // Dedupliziere Emails (nach Betreff + Datum)
  const emailSet = new Map<string, AverbeckEmail>();
  for (const email of alleEmails) {
    const key = `${email.betreff}|${email.datum.substring(0, 10)}`;
    if (!emailSet.has(key)) {
      emailSet.set(key, email);
    }
  }
  const uniqueEmails = Array.from(emailSet.values());
  ergebnis.gefundeneEmails = uniqueEmails.length;

  console.log(`\n📨 Insgesamt ${uniqueEmails.length} eindeutige Averbeck-Emails gefunden\n`);

  // Extrahiere Vereine aus allen Emails
  const alleVereine: ExtrahierterVerein[] = [];

  for (const email of uniqueEmails) {
    // Quelle mit Ordner-Info (besonders wichtig für Papierkorb)
    const folderInfo = email.folder ? ` [${email.folder}]` : '';
    const quelle = `${email.betreff}${folderInfo}`;

    // Aus Text extrahieren
    const textVereine = extrahiereVereineAusText(email.textBody, quelle, email.datum);
    alleVereine.push(...textVereine);

    // Excel-Anhänge verarbeiten
    for (const attachment of email.attachments) {
      const filename = attachment.filename.toLowerCase();
      if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
        console.log(`📊 Verarbeite Excel: ${attachment.filename} aus ${email.folder || 'INBOX'}`);
        ergebnis.excelDateienVerarbeitet++;

        const excelVereine = await extrahiereVereineAusExcel(attachment, quelle, email.datum);
        alleVereine.push(...excelVereine);
        console.log(`   ✅ ${excelVereine.length} Vereine extrahiert`);
      }
    }
  }

  // Dedupliziere Vereine
  const eindeutigeVereine = dedupliziereVereine(alleVereine);
  ergebnis.vereine = eindeutigeVereine;
  ergebnis.extrahierteVereine = eindeutigeVereine.length;

  // Ausgabe
  if (eindeutigeVereine.length > 0) {
    druckeTabelleAusVereine(eindeutigeVereine);
  } else {
    console.log('\n⚠️  Keine Vereine in den Emails gefunden.\n');
  }

  // Speichere JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ergebnis, null, 2));
  console.log(`\n💾 Ergebnis gespeichert in: ${OUTPUT_FILE}`);

  // Zusammenfassung
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      ZUSAMMENFASSUNG                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  📧 Durchsuchte Konten:        ${String(ergebnis.durchsuchteKonten).padStart(4)}                          ║`);
  console.log(`║  ✅ Erfolgreiche Konten:       ${String(ergebnis.durchsuchteKonten - ergebnis.kontenMitFehlern.length).padStart(4)}                          ║`);
  console.log(`║  ❌ Konten mit Fehlern:        ${String(ergebnis.kontenMitFehlern.length).padStart(4)}                          ║`);
  console.log(`║  📨 Gefundene Averbeck-Emails: ${String(ergebnis.gefundeneEmails).padStart(4)}                          ║`);
  console.log(`║  📊 Excel-Dateien verarbeitet: ${String(ergebnis.excelDateienVerarbeitet).padStart(4)}                          ║`);
  console.log(`║  🏟️  Extrahierte Vereine:       ${String(ergebnis.extrahierteVereine).padStart(4)}                          ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (ergebnis.kontenMitFehlern.length > 0) {
    console.log('⚠️  Konten mit Verbindungsfehlern:');
    ergebnis.kontenMitFehlern.forEach(k => console.log(`   - ${k}`));
    console.log('');
  }
}

// Start
main().catch((error) => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
});
