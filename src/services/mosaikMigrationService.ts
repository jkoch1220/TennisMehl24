/**
 * Mosaik-Migration: Staging-Service
 *
 * Verwaltet die `migration_kandidaten` Collection. Pro Mosaik-Kunde existiert
 * genau ein Dokument (eindeutig über `mosaikKurzname`). Re-Import überschreibt
 * `rohdaten`, behält aber Status/Match-Entscheidungen.
 */

import { ID, Query, Models } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  MIGRATION_KANDIDATEN_COLLECTION_ID,
} from '../config/appwrite';
import { loadAllDocuments } from '../utils/appwritePagination';
import { plzZuBundesland } from '../utils/plzBundesland';
import {
  MigrationKandidat,
  MigrationStatus,
  MosaikKandidatData,
  MosaikImportBundle,
} from '../types/mosaik';

const TOP_LEVEL_KEYS = [
  'mosaikKurzname',
  'status',
  'gruppe',
  'bundesland',
  'matchKundeId',
  'matchScore',
  'mosaikInaktiv',
  'bearbeitetAm',
  'bearbeitetVon',
] as const;

function toPayload(k: Partial<MigrationKandidat>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of TOP_LEVEL_KEYS) {
    if (k[key] !== undefined && k[key] !== null) payload[key] = k[key];
  }
  if (k.data !== undefined) payload.data = JSON.stringify(k.data);
  return payload;
}

function parseDoc(doc: Models.Document): MigrationKandidat {
  const anyDoc = doc as unknown as Record<string, unknown>;
  let data: MosaikKandidatData;
  try {
    data = JSON.parse(String(anyDoc.data ?? '{}')) as MosaikKandidatData;
  } catch {
    data = {
      rohdaten: {} as MosaikKandidatData['rohdaten'],
      ansprechpartner: [],
      subAdressen: [],
    };
  }
  return {
    id: doc.$id,
    mosaikKurzname: String(anyDoc.mosaikKurzname ?? ''),
    status: (anyDoc.status as MigrationStatus) ?? 'neu',
    gruppe: anyDoc.gruppe ? String(anyDoc.gruppe) : undefined,
    bundesland: anyDoc.bundesland ? String(anyDoc.bundesland) : undefined,
    matchKundeId: anyDoc.matchKundeId ? String(anyDoc.matchKundeId) : undefined,
    matchScore: typeof anyDoc.matchScore === 'number' ? anyDoc.matchScore : undefined,
    mosaikInaktiv: typeof anyDoc.mosaikInaktiv === 'boolean' ? anyDoc.mosaikInaktiv : undefined,
    bearbeitetAm: anyDoc.bearbeitetAm ? String(anyDoc.bearbeitetAm) : undefined,
    bearbeitetVon: anyDoc.bearbeitetVon ? String(anyDoc.bearbeitetVon) : undefined,
    data,
    $createdAt: doc.$createdAt,
    $updatedAt: doc.$updatedAt,
  };
}

export interface ImportFortschritt {
  gesamt: number;
  verarbeitet: number;
  angelegt: number;
  aktualisiert: number;
  uebersprungen: number;
  fehler: number;
}

export const mosaikMigrationService = {
  // -------- CRUD --------

  async loadAlle(): Promise<MigrationKandidat[]> {
    const docs = await loadAllDocuments(
      DATABASE_ID,
      MIGRATION_KANDIDATEN_COLLECTION_ID,
      { queries: [Query.orderAsc('mosaikKurzname')], maxItems: 10000 }
    );
    return docs.map(parseDoc);
  },

  async loadByKurzname(kurzname: string): Promise<MigrationKandidat | null> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MIGRATION_KANDIDATEN_COLLECTION_ID,
      [Query.equal('mosaikKurzname', kurzname), Query.limit(1)]
    );
    if (response.documents.length === 0) return null;
    return parseDoc(response.documents[0]);
  },

  async loadById(id: string): Promise<MigrationKandidat | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        MIGRATION_KANDIDATEN_COLLECTION_ID,
        id
      );
      return parseDoc(doc);
    } catch {
      return null;
    }
  },

  async update(id: string, patch: Partial<MigrationKandidat>): Promise<MigrationKandidat> {
    const doc = await databases.updateDocument(
      DATABASE_ID,
      MIGRATION_KANDIDATEN_COLLECTION_ID,
      id,
      toPayload(patch)
    );
    return parseDoc(doc);
  },

  async setStatus(
    id: string,
    status: MigrationStatus,
    bearbeitetVon?: string
  ): Promise<MigrationKandidat> {
    return this.update(id, {
      status,
      bearbeitetAm: new Date().toISOString(),
      bearbeitetVon,
    });
  },

  // -------- IMPORT --------

  /**
   * Lädt ein Bündel JSON-Dateien (kunden, ansprechpartner, sub_adressen,
   * adressreferenzen, bestellhistorie, zahlungsverhalten) in die Staging-Collection.
   *
   * Pro Mosaik-Kunde ein Dokument; existiert eines bereits, werden rohdaten
   * überschrieben und Status/Match-Entscheidung beibehalten.
   *
   * onProgress wird nach jedem Datensatz aufgerufen — die UI kann damit einen
   * Live-Fortschrittsbalken zeigen.
   */
  async importBundle(
    bundle: MosaikImportBundle,
    onProgress?: (fortschritt: ImportFortschritt) => void
  ): Promise<ImportFortschritt> {
    // 1. Lade bestehende Kandidaten EINMAL — vermeidet 2.000 Einzelqueries
    const bestehende = await this.loadAlle();
    const bestehendeMap = new Map(bestehende.map((k) => [k.mosaikKurzname, k]));

    // 2. SubAdressen per Kurzname indizieren
    const subAdressenMap = new Map(
      bundle.subAdressen.map((s) => [s.Kurzname, s])
    );

    // 3. Adressreferenzen nach Haupt-Kurzname gruppieren
    const refsByKunde = new Map<string, MosaikImportBundle['adressreferenzen']>();
    for (const ref of bundle.adressreferenzen) {
      const list = refsByKunde.get(ref.Kurzname) ?? [];
      list.push(ref);
      refsByKunde.set(ref.Kurzname, list);
    }

    const fortschritt: ImportFortschritt = {
      gesamt: bundle.kunden.length,
      verarbeitet: 0,
      angelegt: 0,
      aktualisiert: 0,
      uebersprungen: 0,
      fehler: 0,
    };

    for (const kunde of bundle.kunden) {
      const kurzname = kunde.Kurzname;
      if (!kurzname) {
        fortschritt.uebersprungen++;
        fortschritt.verarbeitet++;
        onProgress?.({ ...fortschritt });
        continue;
      }

      try {
        const ansprechpartner = bundle.ansprechpartner[kurzname] ?? [];
        const refs = refsByKunde.get(kurzname) ?? [];
        const subAdressen = refs
          .map((ref) => {
            const adresse = subAdressenMap.get(ref.Referenz);
            return adresse ? { referenz: ref, adresse } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const data: MosaikKandidatData = {
          rohdaten: kunde,
          ansprechpartner,
          subAdressen,
          bestellhistorie: bundle.bestellhistorie[kurzname],
          zahlungsverhalten: bundle.zahlungsverhalten[kurzname],
        };

        const inaktiv = Boolean(kunde.Löschdatum) || Boolean(kunde.Ausgeblendet);
        const bundesland = plzZuBundesland(kunde.PLZ);
        const gruppe = kunde.Gruppe ?? undefined;

        const bestehend = bestehendeMap.get(kurzname);
        if (bestehend) {
          // Behalte Status & Match-Entscheidung, aktualisiere nur Rohdaten + abgeleitete Felder
          await this.update(bestehend.id, {
            data: {
              ...data,
              feldDiff: bestehend.data.feldDiff,
              matchBegruendung: bestehend.data.matchBegruendung,
              notiz: bestehend.data.notiz,
            },
            gruppe,
            bundesland,
            mosaikInaktiv: inaktiv,
          });
          fortschritt.aktualisiert++;
        } else {
          await databases.createDocument(
            DATABASE_ID,
            MIGRATION_KANDIDATEN_COLLECTION_ID,
            ID.unique(),
            toPayload({
              mosaikKurzname: kurzname,
              status: 'neu',
              gruppe,
              bundesland,
              mosaikInaktiv: inaktiv,
              data,
            })
          );
          fortschritt.angelegt++;
        }
      } catch (error) {
        console.error(`Fehler bei Kandidat ${kurzname}:`, error);
        fortschritt.fehler++;
      }

      fortschritt.verarbeitet++;
      onProgress?.({ ...fortschritt });
    }

    return fortschritt;
  },
};
