/**
 * Storno-Migration: bestehende STORNO-2026-XXXX-Dokumente bekommen reguläre RE-Nummern aus der
 * Lücken-Liste der jeweiligen Saison.
 *
 * Ablauf pro Storno:
 *  1. Bestehendes Dokument laden (Metadaten + daten-JSON mit Original-Rechnungsdaten)
 *  2. Neue PDF mit der zugewiesenen RE-Nummer im Browser rendern
 *  3. Neue PDF als neue Datei in den Storage-Bucket hochladen (alte Datei bleibt erhalten — GoBD)
 *  4. Storno-Dokument aktualisieren: dokumentNummer, dateiId, stornoVonRechnungsnummer
 *
 * Die Migration wird ausschließlich aus dem Browser ausgeführt (PDF-Generierung benötigt jsPDF
 * + die existierenden Rendering-Helfer aus rechnungService.ts).
 */

import { ID, Query } from 'appwrite';
import {
  databases,
  storage,
  DATABASE_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
  BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
} from '../config/appwrite';
import { GespeichertesDokument, StornoRechnungsDaten } from '../types/projektabwicklung';
import { generiereStornoRechnungPDFFuerMigration } from './projektabwicklungDokumentService';

// ----------------------------------------------------------------------------
// Typen
// ----------------------------------------------------------------------------

export interface StornoMigrationEintrag {
  storno: GespeichertesDokument;
  alteNummer: string;          // z.B. "STORNO-2026-0001"
  neueNummer: string;          // z.B. "RE-2026-0042"
  originalRechnungsnummer: string;
  konflikt?: string;           // Wenn keine Lücke verfügbar oder Daten unvollständig
}

export interface StornoMigrationsPlan {
  saison: number;
  eintraege: StornoMigrationEintrag[];
  ungeloesteLuecken: string[]; // Lücken-Nummern ohne Storno-Match (z.B. RE-2026-0042)
  bereitsMigriert: number;     // Stornos die schon eine RE-Nummer haben (Idempotenz)
}

export interface MigrationsErgebnis {
  storno: GespeichertesDokument;
  alteNummer: string;
  neueNummer: string;
  status: 'erfolg' | 'fehler' | 'uebersprungen';
  fehler?: string;
}

export type FortschrittsCallback = (info: {
  index: number;
  gesamt: number;
  aktuell: StornoMigrationEintrag;
}) => void;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface ParsedNummer {
  prefix: string;
  saison: number;
  laufnummer: number;
}

const parseNummer = (nr: string): ParsedNummer | null => {
  const match = nr.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    saison: parseInt(match[2], 10),
    laufnummer: parseInt(match[3], 10),
  };
};

const formatiereREnummer = (saison: number, laufnummer: number): string =>
  `RE-${saison}-${String(laufnummer).padStart(4, '0')}`;

const ladeAlleRelevantenDokumente = async (): Promise<GespeichertesDokument[]> => {
  const alle: GespeichertesDokument[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
      [
        Query.equal('dokumentTyp', ['rechnung', 'stornorechnung']),
        Query.orderAsc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ]
    );
    for (const doc of response.documents) {
      alle.push(doc as unknown as GespeichertesDokument);
    }
    if (response.documents.length < limit) break;
    offset += limit;
    if (offset > 50000) break;
  }
  return alle;
};

// ----------------------------------------------------------------------------
// Plan berechnen (Dry-Run)
// ----------------------------------------------------------------------------

/**
 * Erstellt einen Migrations-Plan für eine bestimmte Saison.
 *
 * Algorithmus:
 *  1. Sammelt alle RE-Nummern (Rechnungen + bereits migrierte Stornos) → benutzte Lauf-Nummern
 *  2. Bestimmt die Lücken (1..max ohne benutzte)
 *  3. Sortiert alte Stornos (STORNO-Prefix) chronologisch nach $createdAt aufsteigend
 *  4. Weist jeder alten Storno die nächste verfügbare Lücke zu (älteste Storno → kleinste Lücke)
 */
export async function berechneStornoMigrationsPlan(saison: number): Promise<StornoMigrationsPlan> {
  const alle = await ladeAlleRelevantenDokumente();

  const benutzteNummern = new Set<number>();
  const alteStornos: GespeichertesDokument[] = [];
  let bereitsMigriert = 0;

  for (const doc of alle) {
    const parsed = parseNummer(doc.dokumentNummer);
    if (!parsed || parsed.saison !== saison) continue;

    if (doc.dokumentTyp === 'rechnung' && parsed.prefix === 'RE') {
      benutzteNummern.add(parsed.laufnummer);
    } else if (doc.dokumentTyp === 'stornorechnung') {
      if (parsed.prefix === 'RE') {
        // Storno läuft schon im RE-Kreis — nichts zu tun, Nummer belegt aber den Kreis
        benutzteNummern.add(parsed.laufnummer);
        bereitsMigriert++;
      } else {
        // STORNO-Prefix → muss migriert werden
        alteStornos.push(doc);
      }
    }
  }

  const maxNummer = benutzteNummern.size > 0 ? Math.max(...benutzteNummern) : 0;
  const luecken: number[] = [];
  for (let n = 1; n <= maxNummer; n++) {
    if (!benutzteNummern.has(n)) luecken.push(n);
  }
  // Wenn weniger Lücken als Stornos: zusätzliche Nummern oberhalb von maxNummer reservieren,
  // damit jedes Storno eine eindeutige Nummer bekommt.
  while (luecken.length < alteStornos.length) {
    luecken.push(maxNummer + (luecken.length - (maxNummer > 0 ? maxNummer - luecken[luecken.length - 1] : 0)) + 1);
    // Sicherheits-Stop falls Logik kippt:
    if (luecken.length > 100000) break;
  }

  // Chronologisch sortieren (älteste zuerst — fließen in die kleinsten Lücken)
  alteStornos.sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));

  const eintraege: StornoMigrationEintrag[] = alteStornos.map((storno, idx) => {
    const lueckenNr = luecken[idx];
    const neueNummer = formatiereREnummer(saison, lueckenNr);
    const originalRechnungsnummer = ermittleOriginalRechnungsnummer(storno, alle);

    return {
      storno,
      alteNummer: storno.dokumentNummer,
      neueNummer,
      originalRechnungsnummer: originalRechnungsnummer ?? '???',
      konflikt: originalRechnungsnummer ? undefined : 'Original-Rechnungsnummer konnte nicht ermittelt werden',
    };
  });

  // Restliche unbelegte Lücken (überschüssige Lücken nach Storno-Zuordnung)
  const verbrauchteLuecken = new Set(eintraege.map((e) => parseNummer(e.neueNummer)?.laufnummer));
  const ungeloesteLuecken: string[] = [];
  for (const n of luecken) {
    if (!verbrauchteLuecken.has(n)) {
      ungeloesteLuecken.push(formatiereREnummer(saison, n));
    }
  }

  return {
    saison,
    eintraege,
    ungeloesteLuecken,
    bereitsMigriert,
  };
}

function ermittleOriginalRechnungsnummer(
  storno: GespeichertesDokument,
  alle: GespeichertesDokument[]
): string | null {
  // 1. Direkter Bezug über stornoVonRechnungId
  if (storno.stornoVonRechnungId) {
    const original = alle.find((d) => d.$id === storno.stornoVonRechnungId);
    if (original) return original.dokumentNummer;
  }
  // 2. Fallback: aus daten-JSON parsen
  if (storno.daten) {
    try {
      const parsed = JSON.parse(storno.daten) as Partial<StornoRechnungsDaten>;
      if (parsed.originalRechnungsnummer) return parsed.originalRechnungsnummer;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Plan ausführen
// ----------------------------------------------------------------------------

/**
 * Führt einen vorab berechneten Migrationsplan aus.
 *
 * Pro Eintrag:
 *  1. Storno-Daten aus dem `daten`-JSON laden
 *  2. PDF mit der neuen Nummer rendern (via generiereStornoRechnungPDFFuerMigration)
 *  3. Neue PDF in den Storage-Bucket hochladen
 *  4. Dokument aktualisieren (dokumentNummer, dateiId, dateiname, stornoVonRechnungsnummer)
 *
 * Die alte PDF im Bucket bleibt erhalten (GoBD: keine Daten löschen).
 */
export async function fuehreStornoMigrationAus(
  plan: StornoMigrationsPlan,
  fortschritt?: FortschrittsCallback
): Promise<MigrationsErgebnis[]> {
  const ergebnisse: MigrationsErgebnis[] = [];

  for (let i = 0; i < plan.eintraege.length; i++) {
    const eintrag = plan.eintraege[i];
    fortschritt?.({ index: i, gesamt: plan.eintraege.length, aktuell: eintrag });

    if (eintrag.konflikt) {
      ergebnisse.push({
        storno: eintrag.storno,
        alteNummer: eintrag.alteNummer,
        neueNummer: eintrag.neueNummer,
        status: 'uebersprungen',
        fehler: eintrag.konflikt,
      });
      continue;
    }

    try {
      await migriereEinzelnesStorno(eintrag);
      ergebnisse.push({
        storno: eintrag.storno,
        alteNummer: eintrag.alteNummer,
        neueNummer: eintrag.neueNummer,
        status: 'erfolg',
      });
    } catch (error) {
      const meldung = error instanceof Error ? error.message : String(error);
      console.error(`Migration für ${eintrag.alteNummer} fehlgeschlagen:`, error);
      ergebnisse.push({
        storno: eintrag.storno,
        alteNummer: eintrag.alteNummer,
        neueNummer: eintrag.neueNummer,
        status: 'fehler',
        fehler: meldung,
      });
    }
  }

  fortschritt?.({
    index: plan.eintraege.length,
    gesamt: plan.eintraege.length,
    aktuell: plan.eintraege[plan.eintraege.length - 1] ?? ({} as StornoMigrationEintrag),
  });

  return ergebnisse;
}

async function migriereEinzelnesStorno(eintrag: StornoMigrationEintrag): Promise<void> {
  const { storno, neueNummer, originalRechnungsnummer } = eintrag;

  if (!storno.daten) {
    throw new Error('Storno-Dokument enthält kein archiviertes daten-JSON — PDF kann nicht neu generiert werden');
  }

  const stornoDaten = JSON.parse(storno.daten) as StornoRechnungsDaten;

  // stornoRechnungsnummer in den daten überschreiben — das ist die Nummer die im PDF-Header
  // erscheint. originalRechnungsnummer kann aus den Daten kommen oder vom Plan überschrieben werden.
  const aktualisierteDaten: StornoRechnungsDaten = {
    ...stornoDaten,
    stornoRechnungsnummer: neueNummer,
    originalRechnungsnummer: originalRechnungsnummer,
  };

  // PDF rendern
  const pdf = await generiereStornoRechnungPDFFuerMigration(aktualisierteDaten);
  const blob = pdf.output('blob');

  // Dateiname mit neuer Nummer — Original-Dateinamenkonvention beibehalten
  const sanitizedKunde = (aktualisierteDaten.kundenname || 'Unbekannt').replace(/[<>:"/\\|?*]/g, '_');
  const neuerDateiname = `Stornorechnung_${neueNummer}_${sanitizedKunde}.pdf`;

  const file = new File([blob], neuerDateiname, { type: 'application/pdf' });
  const upload = await storage.createFile(
    BESTELLABWICKLUNG_DATEIEN_BUCKET_ID,
    ID.unique(),
    file
  );

  // Dokument aktualisieren — die alte dateiId wird nicht gelöscht, alte PDF bleibt im Bucket.
  await databases.updateDocument(
    DATABASE_ID,
    BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
    storno.$id!,
    {
      dokumentNummer: neueNummer,
      dateiId: upload.$id,
      dateiname: neuerDateiname,
      stornoVonRechnungsnummer: originalRechnungsnummer,
      // daten-JSON mit den korrigierten Feldern aktualisieren (damit künftige Aufrufe konsistent sind)
      daten: JSON.stringify(aktualisierteDaten),
    }
  );
}

// ----------------------------------------------------------------------------
// Saisons ermitteln
// ----------------------------------------------------------------------------

export async function ermittleSaisonsMitStornos(): Promise<number[]> {
  const alle = await ladeAlleRelevantenDokumente();
  const saisons = new Set<number>();
  for (const doc of alle) {
    if (doc.dokumentTyp !== 'stornorechnung') continue;
    const parsed = parseNummer(doc.dokumentNummer);
    if (parsed) saisons.add(parsed.saison);
  }
  return Array.from(saisons).sort();
}
