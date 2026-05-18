/**
 * Bulk-Download für Rechnungen, Stornos und Proforma-Rechnungen.
 *
 * Lädt PDFs aus dem Appwrite-Storage-Bucket parallel (Concurrency-Limit), packt sie mit jszip
 * und gibt einen Blob für den Browser-Download zurück. Zusätzlich CSV-Export der Metadaten.
 *
 * Ablauf:
 *  1. listeDokumente(filter): listet alle Metadaten-Dokumente passend zu den Filtern (paginiert)
 *  2. ladeUndPackePDFs: lädt jede PDF und fügt sie zur ZIP hinzu (mit Concurrency-Limit)
 *  3. erzeugeZipBlob: ZIP finalisieren
 *  4. erzeugeCsv: CSV-String aus den Metadaten
 */

import JSZip from 'jszip';
import { Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
} from '../config/appwrite';
import { GespeichertesDokument, DokumentTyp, RechnungsDaten } from '../types/projektabwicklung';

// ----------------------------------------------------------------------------
// Typen
// ----------------------------------------------------------------------------

export type DownloadDokumentTyp = Extract<DokumentTyp, 'rechnung' | 'stornorechnung' | 'proformarechnung'>;
export type DownloadStatusFilter = 'aktiv' | 'storniert';

export interface BulkDownloadFilter {
  saisonjahr: number;
  dokumentTypen: DownloadDokumentTyp[];     // mind. ein Typ
  statusFilter: DownloadStatusFilter[];     // mind. ein Status
}

export interface BulkDownloadFortschritt {
  index: number;              // 0-basiert: gerade verarbeitet
  gesamt: number;
  aktuellerName?: string;
}

export interface BulkDownloadErgebnis {
  zipBlob: Blob;
  zipDateiname: string;
  csvBlob: Blob;
  csvDateiname: string;
  gesamt: number;
  fehlgeschlagen: Array<{ dokumentNummer: string; fehler: string }>;
}

export interface AbbruchSignal {
  abgebrochen: boolean;
}

// ----------------------------------------------------------------------------
// Konstanten
// ----------------------------------------------------------------------------

const CONCURRENCY = 5;       // gleichzeitige PDF-Downloads
const PAGE_LIMIT = 100;      // Appwrite-Limit pro listDocuments-Aufruf

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Hauptfunktion: führt Download + ZIP + CSV durch.
 */
export async function fuehreBulkDownloadAus(
  filter: BulkDownloadFilter,
  fortschritt?: (info: BulkDownloadFortschritt) => void,
  abbruch?: AbbruchSignal
): Promise<BulkDownloadErgebnis> {
  const dokumente = await listeDokumente(filter);
  const gesamt = dokumente.length;
  fortschritt?.({ index: 0, gesamt });

  if (gesamt === 0) {
    throw new Error('Keine Dokumente passen zu den gewählten Filtern.');
  }

  // Duplikate erkennen: gruppieren nach dokumentNummer.
  // Pro Gruppe Versions-Index ermitteln (älteste = 1). Wird in Dateinamen und CSV verwendet.
  const versionsInfo = berechneVersionsInfo(dokumente);

  const zip = new JSZip();
  const ordnerName = ordnernameFuerSaison(filter);
  const ordner = zip.folder(ordnerName);
  if (!ordner) {
    throw new Error('ZIP-Ordner konnte nicht erstellt werden.');
  }

  let verarbeitet = 0;
  const fehlgeschlagen: BulkDownloadErgebnis['fehlgeschlagen'] = [];

  const bearbeite = async (dok: GespeichertesDokument): Promise<void> => {
    if (abbruch?.abgebrochen) return;
    const info = versionsInfo.get(dok.$id!);
    const dateiname = erzeugeDateiname(dok, info);
    fortschritt?.({ index: verarbeitet, gesamt, aktuellerName: dateiname });

    try {
      const blob = await ladePdfBlob(dok.dateiId);
      ordner.file(dateiname, blob);
    } catch (error) {
      const meldung = error instanceof Error ? error.message : String(error);
      console.error(`Bulk-Download: Fehler bei ${dok.dokumentNummer}`, error);
      fehlgeschlagen.push({ dokumentNummer: dok.dokumentNummer, fehler: meldung });
    } finally {
      verarbeitet++;
      fortschritt?.({ index: verarbeitet, gesamt, aktuellerName: dateiname });
    }
  };

  await asyncPool(CONCURRENCY, dokumente, bearbeite);

  if (abbruch?.abgebrochen) {
    throw new Error('Download abgebrochen');
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const csvString = erzeugeCsv(dokumente, versionsInfo);
  const csvBlob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8' });

  return {
    zipBlob,
    zipDateiname: `Rechnungen_${filter.saisonjahr}.zip`,
    csvBlob,
    csvDateiname: `Rechnungsliste_${filter.saisonjahr}.csv`,
    gesamt,
    fehlgeschlagen,
  };
}

/**
 * Nur das Listing — für die Vorab-Anzeige "X Dokumente werden geladen".
 */
export async function zaehleDokumente(filter: BulkDownloadFilter): Promise<number> {
  const dokumente = await listeDokumente(filter);
  return dokumente.length;
}

/**
 * Triggert einen Browser-Download für einen Blob (typgleicher Helfer).
 */
export function loestBrowserDownloadAus(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Blob nach kurzer Verzögerung freigeben (manche Browser brauchen das DOM-Element noch)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----------------------------------------------------------------------------
// Interne Helfer
// ----------------------------------------------------------------------------

async function listeDokumente(filter: BulkDownloadFilter): Promise<GespeichertesDokument[]> {
  if (filter.dokumentTypen.length === 0) return [];
  if (filter.statusFilter.length === 0) return [];

  const alle: GespeichertesDokument[] = [];
  let offset = 0;
  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('dokumentTyp', filter.dokumentTypen),
        Query.orderAsc('dokumentNummer'),
        Query.limit(PAGE_LIMIT),
        Query.offset(offset),
      ]
    );
    for (const doc of response.documents) {
      alle.push(doc as unknown as GespeichertesDokument);
    }
    if (response.documents.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
    if (offset > 100000) break; // safety
  }

  // Filterung clientseitig: Saisonjahr (aus Nummer parsen) + rechnungsStatus
  return alle.filter((d) => {
    const parsed = parseNummer(d.dokumentNummer);
    if (!parsed || parsed.saison !== filter.saisonjahr) return false;

    const status = d.rechnungsStatus === 'storniert' ? 'storniert' : 'aktiv';
    return filter.statusFilter.includes(status as DownloadStatusFilter);
  });
}

async function ladePdfBlob(dateiId: string): Promise<Blob> {
  // Appwrite SDK liefert getFileDownload als URL — wir holen den Blob via fetch.
  const url = storage.getFileDownload(BESTELLABWICKLUNG_DATEIEN_BUCKET_ID, dateiId);
  // Appwrite getFileDownload returnt ein URL-Objekt (oder string je nach SDK-Version)
  const response = await fetch(url.toString(), { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return await response.blob();
}

// Versions-Info pro Dokument-Id: wenn eine Rechnungsnummer mehrfach vergeben wurde, wird hier
// die Version (1=älteste) und die Gesamtanzahl der Versionen gespeichert. Sonst undefined.
interface VersionsInfo {
  version: number;
  gesamt: number;
}

function berechneVersionsInfo(dokumente: GespeichertesDokument[]): Map<string, VersionsInfo> {
  const map = new Map<string, VersionsInfo>();
  const proNummer = new Map<string, GespeichertesDokument[]>();
  for (const dok of dokumente) {
    const liste = proNummer.get(dok.dokumentNummer) ?? [];
    liste.push(dok);
    proNummer.set(dok.dokumentNummer, liste);
  }
  for (const [, liste] of proNummer) {
    if (liste.length < 2) continue; // Kein Duplikat
    liste.sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));
    liste.forEach((dok, idx) => {
      map.set(dok.$id!, { version: idx + 1, gesamt: liste.length });
    });
  }
  return map;
}

function erzeugeDateiname(dok: GespeichertesDokument, versionsInfo?: VersionsInfo): string {
  let kunde = 'Unbekannt';
  if (dok.daten) {
    try {
      const parsed = JSON.parse(dok.daten) as Partial<RechnungsDaten>;
      kunde = (parsed.kundenname || 'Unbekannt').replace(/[<>:"/\\|?*]/g, '_').trim();
    } catch {
      /* ignore */
    }
  }
  const stornoSuffix = dok.dokumentTyp === 'stornorechnung' ? '_STORNO' : '';
  // Bei Duplikaten Versions-Suffix anhängen + Status-Marker für Klarheit beim Steuerberater
  const versionsSuffix = versionsInfo
    ? `_v${versionsInfo.version}-von-${versionsInfo.gesamt}${dok.rechnungsStatus === 'storniert' ? '_storniert' : '_aktuell'}`
    : '';
  return `${dok.dokumentNummer}_${kunde}${stornoSuffix}${versionsSuffix}.pdf`;
}

function ordnernameFuerSaison(filter: BulkDownloadFilter): string {
  if (filter.dokumentTypen.length === 1) {
    const map: Record<DownloadDokumentTyp, string> = {
      rechnung: 'Rechnungen',
      stornorechnung: 'Stornorechnungen',
      proformarechnung: 'Proforma_Rechnungen',
    };
    return `${map[filter.dokumentTypen[0]]}_${filter.saisonjahr}`;
  }
  return `Rechnungen_${filter.saisonjahr}`;
}

function parseNummer(nr: string): { prefix: string; saison: number; laufnummer: number } | null {
  const match = nr.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], saison: parseInt(match[2], 10), laufnummer: parseInt(match[3], 10) };
}

function erzeugeCsv(
  dokumente: GespeichertesDokument[],
  versionsInfo: Map<string, VersionsInfo>
): string {
  const header = [
    'Rechnungsnummer',
    'Datum',
    'Kundennummer',
    'Kundenname',
    'Dokumenttyp',
    'Status',
    'Nettobetrag',
    'Mehrwertsteuer',
    'Bruttobetrag',
    'Stornogrund',
    'Storno_zu',
    'Duplikat',
    'Version',
    'Versionen_gesamt',
  ];

  const zeilen: string[] = [header.map(quoteCsv).join(';')];

  // Sortiere Einträge nach Rechnungsnummer und CreatedAt — damit Duplikate gruppiert auftauchen
  const sortiert = [...dokumente].sort((a, b) => {
    const cmp = a.dokumentNummer.localeCompare(b.dokumentNummer);
    if (cmp !== 0) return cmp;
    return (a.$createdAt || '').localeCompare(b.$createdAt || '');
  });

  for (const dok of sortiert) {
    const parsed = parseDaten(dok);
    const status = dok.rechnungsStatus === 'storniert' ? 'storniert' : 'aktiv';
    const datum = parsed?.rechnungsdatum || (dok.$createdAt ? dok.$createdAt.split('T')[0] : '');
    const brutto = typeof dok.bruttobetrag === 'number' ? dok.bruttobetrag : 0;
    const mwstSatz = (parsed?.mehrwertsteuersatz ?? 19) / 100;
    const netto = brutto / (1 + mwstSatz);
    const mwst = brutto - netto;
    const info = versionsInfo.get(dok.$id!);

    zeilen.push(
      [
        dok.dokumentNummer,
        datum,
        parsed?.kundennummer ?? '',
        parsed?.kundenname ?? '',
        dok.dokumentTyp,
        status,
        netto.toFixed(2).replace('.', ','),
        mwst.toFixed(2).replace('.', ','),
        brutto.toFixed(2).replace('.', ','),
        dok.stornoGrund ?? '',
        dok.stornoVonRechnungsnummer ?? '',
        info ? 'JA' : 'nein',
        info ? info.version : '',
        info ? info.gesamt : '',
      ]
        .map(quoteCsv)
        .join(';')
    );
  }

  return zeilen.join('\r\n');
}

function parseDaten(dok: GespeichertesDokument): Partial<RechnungsDaten> | null {
  if (!dok.daten) return null;
  try {
    return JSON.parse(dok.daten) as Partial<RechnungsDaten>;
  } catch {
    return null;
  }
}

function quoteCsv(wert: string | number): string {
  const s = String(wert);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Simpler Concurrency-Pool: führt `fn` für jedes Item aus, hält maximal `limit` Promises gleichzeitig
 * in der Luft. Verzichtet auf p-limit als externe Dependency.
 */
async function asyncPool<T>(
  limit: number,
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue: Promise<void>[] = [];
  const inFlight: Set<Promise<void>> = new Set();

  for (const item of items) {
    const p = fn(item).finally(() => inFlight.delete(p));
    queue.push(p);
    inFlight.add(p);
    if (inFlight.size >= limit) {
      await Promise.race(inFlight);
    }
  }
  await Promise.all(queue);
}

// ----------------------------------------------------------------------------
// Saisons ermitteln (für UI-Dropdown)
// ----------------------------------------------------------------------------

export async function ermittleSaisonsMitDokumenten(): Promise<number[]> {
  const saisons = new Set<number>();
  let offset = 0;
  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('dokumentTyp', ['rechnung', 'stornorechnung', 'proformarechnung']),
        Query.limit(PAGE_LIMIT),
        Query.offset(offset),
        Query.select(['dokumentNummer']),
      ]
    );
    for (const doc of response.documents) {
      const parsed = parseNummer((doc as { dokumentNummer?: string }).dokumentNummer ?? '');
      if (parsed) saisons.add(parsed.saison);
    }
    if (response.documents.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
    if (offset > 100000) break;
  }
  return Array.from(saisons).sort();
}
