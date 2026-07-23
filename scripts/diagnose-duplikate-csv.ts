/**
 * READ-ONLY: erstellt einen ausführlichen CSV-Diagnosebericht für den Steuerberater.
 *
 * Output: zwei CSV-Dateien im Projektverzeichnis:
 *   1. duplikate-rechnungen-{saison}.csv  — Alle Rechnungs-Nummern die mehrfach vergeben sind
 *   2. alle-rechnungen-{saison}.csv       — Vollständige Liste aller Rechnungen + Stornos
 *      mit Duplikat-Markierung (`duplikat_version`, `duplikat_status`)
 *
 * Ausführen: npx tsx scripts/diagnose-duplikate-csv.ts 2026
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);
const databases = new Databases(client);

const SAISON = Number(process.argv[2] ?? 2026);
const DB = 'tennismehl24_db';
const COL_DOKUMENTE = 'bestellabwicklung_dokumente';
const COL_PROJEKTE = 'projekte';

interface Doc {
  $id: string;
  $createdAt: string;
  $updatedAt?: string;
  dokumentTyp: string;
  dokumentNummer: string;
  projektId: string;
  dateiId: string;
  dateiname: string;
  bruttobetrag?: number;
  rechnungsStatus?: string;
  stornoVonRechnungId?: string;
  stornoVonRechnungsnummer?: string;
  stornoGrund?: string;
  istFinal?: boolean;
  daten?: string;
}

interface ProjektInfo {
  kundenname?: string;
  kundennummer?: string;
}

function parseNr(s: string) {
  const m = s.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  return m ? { prefix: m[1], saison: parseInt(m[2], 10), lauf: parseInt(m[3], 10) } : null;
}

function quoteCsv(wert: unknown): string {
  if (wert === null || wert === undefined) return '';
  const s = String(wert);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 19).replace('T', ' ');
}

function formatBetrag(n?: number): string {
  if (typeof n !== 'number') return '';
  return n.toFixed(2).replace('.', ',');
}

async function ladeAlleDokumente(): Promise<Doc[]> {
  const alle: Doc[] = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DB, COL_DOKUMENTE, [
      Query.equal('dokumentTyp', ['rechnung', 'stornorechnung']),
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const d of res.documents) alle.push(d as unknown as Doc);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 100000) break;
  }
  return alle;
}

async function ladeProjektInfo(projektIds: string[]): Promise<Map<string, ProjektInfo>> {
  const map = new Map<string, ProjektInfo>();
  // In Chunks zu 100 abfragen
  for (let i = 0; i < projektIds.length; i += 100) {
    const chunk = projektIds.slice(i, i + 100);
    const res = await databases.listDocuments(DB, COL_PROJEKTE, [
      Query.equal('$id', chunk),
      Query.limit(100),
    ]);
    for (const p of res.documents) {
      const doc = p as Record<string, unknown>;
      const info: ProjektInfo = {
        kundenname: typeof doc.kundenname === 'string' ? doc.kundenname : undefined,
      };
      // kundennummer steckt im data-JSON
      if (typeof doc.data === 'string') {
        try {
          const parsed = JSON.parse(doc.data);
          if (typeof parsed.kundennummer === 'string') {
            info.kundennummer = parsed.kundennummer;
          }
          if (!info.kundenname && typeof parsed.kundenname === 'string') {
            info.kundenname = parsed.kundenname;
          }
        } catch {
          /* ignore */
        }
      }
      map.set(doc.$id as string, info);
    }
  }
  return map;
}

async function main() {
  console.log(`🔍 Diagnose Saison ${SAISON} — read-only\n`);

  console.log('📥 Lade alle Rechnungs-/Storno-Dokumente …');
  const alle = await ladeAlleDokumente();
  const inSaison = alle.filter((d) => {
    const p = parseNr(d.dokumentNummer);
    return p?.saison === SAISON;
  });
  console.log(`   → ${inSaison.length} Dokumente in Saison ${SAISON}\n`);

  console.log('📥 Lade Projekt-Daten für Kundennamen …');
  const eindeutigeProjektIds = Array.from(new Set(inSaison.map((d) => d.projektId)));
  const projektMap = await ladeProjektInfo(eindeutigeProjektIds);
  console.log(`   → ${projektMap.size} Projekte geladen\n`);

  // Gruppieren nach dokumentNummer für Duplikat-Erkennung
  const gruppen = new Map<string, Doc[]>();
  for (const d of inSaison) {
    const liste = gruppen.get(d.dokumentNummer) ?? [];
    liste.push(d);
    gruppen.set(d.dokumentNummer, liste);
  }
  // Innerhalb jeder Gruppe nach createdAt sortieren (älteste zuerst = "Version 1")
  for (const liste of gruppen.values()) {
    liste.sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));
  }

  const duplikatGruppen = Array.from(gruppen.entries()).filter(([, l]) => l.length > 1);

  // ============================================================
  // CSV 1: Nur Duplikate
  // ============================================================
  const csvDuplikate: string[] = [];
  csvDuplikate.push(
    [
      'rechnungsnummer',
      'anzahl_versionen',
      'version',
      'createdAt',
      'aktualisiertAm',
      'dokumentTyp',
      'rechnungsStatus',
      'bruttobetrag_eur',
      'kundenname',
      'kundennummer',
      'projektId',
      'docId',
      'dateiId',
      'dateiname',
      'storno_zu',
      'stornoGrund',
    ]
      .map(quoteCsv)
      .join(';')
  );

  for (const [nummer, liste] of duplikatGruppen) {
    liste.forEach((d, idx) => {
      const projInfo = projektMap.get(d.projektId);
      csvDuplikate.push(
        [
          nummer,
          liste.length,
          idx + 1,
          formatDate(d.$createdAt),
          formatDate(d.$updatedAt),
          d.dokumentTyp,
          d.rechnungsStatus ?? '(kein Status)',
          formatBetrag(d.bruttobetrag),
          projInfo?.kundenname ?? '',
          projInfo?.kundennummer ?? '',
          d.projektId,
          d.$id,
          d.dateiId,
          d.dateiname,
          d.stornoVonRechnungsnummer ?? '',
          d.stornoGrund ?? '',
        ]
          .map(quoteCsv)
          .join(';')
      );
    });
  }

  const pfadDuplikate = join(process.cwd(), `duplikate-rechnungen-${SAISON}.csv`);
  writeFileSync(pfadDuplikate, '﻿' + csvDuplikate.join('\r\n'), 'utf8');
  console.log(`✅ Duplikat-CSV geschrieben: ${pfadDuplikate}`);
  console.log(`   ${duplikatGruppen.length} betroffene Rechnungsnummern`);
  const totalDuplikatEintraege = duplikatGruppen.reduce((s, [, l]) => s + l.length, 0);
  console.log(`   ${totalDuplikatEintraege} Einträge gesamt\n`);

  // ============================================================
  // CSV 2: Vollständige Übersicht aller Rechnungen mit Duplikat-Markierung
  // ============================================================
  const csvAlle: string[] = [];
  csvAlle.push(
    [
      'rechnungsnummer',
      'dokumentTyp',
      'createdAt',
      'aktualisiertAm',
      'rechnungsStatus',
      'bruttobetrag_eur',
      'kundenname',
      'kundennummer',
      'projektId',
      'docId',
      'duplikat',
      'duplikat_version',
      'duplikat_gesamt',
      'storno_zu',
      'stornoGrund',
    ]
      .map(quoteCsv)
      .join(';')
  );

  // Sortiere alle Einträge nach Nummer + createdAt
  const alleSortiert = [...inSaison].sort((a, b) => {
    const cmp = a.dokumentNummer.localeCompare(b.dokumentNummer);
    if (cmp !== 0) return cmp;
    return (a.$createdAt || '').localeCompare(b.$createdAt || '');
  });

  for (const d of alleSortiert) {
    const gruppe = gruppen.get(d.dokumentNummer) ?? [];
    const istDuplikat = gruppe.length > 1;
    const version = gruppe.findIndex((x) => x.$id === d.$id) + 1;
    const projInfo = projektMap.get(d.projektId);

    csvAlle.push(
      [
        d.dokumentNummer,
        d.dokumentTyp,
        formatDate(d.$createdAt),
        formatDate(d.$updatedAt),
        d.rechnungsStatus ?? '(kein Status)',
        formatBetrag(d.bruttobetrag),
        projInfo?.kundenname ?? '',
        projInfo?.kundennummer ?? '',
        d.projektId,
        d.$id,
        istDuplikat ? 'JA' : 'nein',
        istDuplikat ? version : '',
        istDuplikat ? gruppe.length : '',
        d.stornoVonRechnungsnummer ?? '',
        d.stornoGrund ?? '',
      ]
        .map(quoteCsv)
        .join(';')
    );
  }

  const pfadAlle = join(process.cwd(), `alle-rechnungen-${SAISON}.csv`);
  writeFileSync(pfadAlle, '﻿' + csvAlle.join('\r\n'), 'utf8');
  console.log(`✅ Vollständige Liste geschrieben: ${pfadAlle}`);
  console.log(`   ${inSaison.length} Einträge`);

  // ============================================================
  // Zusammenfassung
  // ============================================================
  console.log('\n📊 Zusammenfassung:');
  const rechnungen = inSaison.filter((d) => d.dokumentTyp === 'rechnung');
  const stornos = inSaison.filter((d) => d.dokumentTyp === 'stornorechnung');
  const stornierteRechnungen = rechnungen.filter((d) => d.rechnungsStatus === 'storniert');
  const aktiveRechnungen = rechnungen.filter((d) => d.rechnungsStatus !== 'storniert');

  console.log(`   Rechnungs-Dokumente:                  ${rechnungen.length}`);
  console.log(`     davon storniert:                    ${stornierteRechnungen.length}`);
  console.log(`     davon aktiv:                        ${aktiveRechnungen.length}`);
  console.log(`   Storno-Dokumente:                     ${stornos.length}`);
  console.log(`   Eindeutige Nummern in Saison:         ${gruppen.size}`);
  console.log(`   Davon mehrfach vergeben (Duplikate):  ${duplikatGruppen.length}`);

  const summeBruttoAktiv = aktiveRechnungen.reduce((s, d) => s + (d.bruttobetrag ?? 0), 0);
  console.log(`   Summe Brutto (aktive Rechnungen):     ${summeBruttoAktiv.toFixed(2)} €`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
