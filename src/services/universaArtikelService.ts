import { databases, DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { UniversaArtikel, UniversaArtikelInput, ExcelImportResult } from '../types/universaArtikel';
import * as XLSX from 'xlsx';

/**
 * Service für die Verwaltung von Universa-Artikeln
 */

// Collection automatisch erstellen falls nicht vorhanden
async function ensureCollectionExists(): Promise<boolean> {
  try {
    // Versuche einen Test-Query - wenn die Collection nicht existiert, wirft es einen Fehler
    await databases.listDocuments(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, [Query.limit(1)]);
    return true;
  } catch (error: any) {
    if (error?.code === 404) {
      console.warn('Universa Artikel Collection existiert nicht. Bitte in Appwrite anlegen.');
      return false;
    }
    // Andere Fehler durchreichen
    throw error;
  }
}

// Artikel erstellen
export async function erstelleUniversaArtikel(artikelData: UniversaArtikelInput): Promise<UniversaArtikel> {
  const now = new Date().toISOString();

  const artikel = await databases.createDocument(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    ID.unique(),
    {
      ...artikelData,
      importDatum: now,
    }
  );

  return artikel as unknown as UniversaArtikel;
}

// Alle Artikel abrufen (mit Sortierung und Paginierung)
export async function getAlleUniversaArtikel(
  sortBy: 'artikelnummer' | 'bezeichnung' | 'katalogPreisBrutto' = 'artikelnummer',
  limit: number = 100,
  offset: number = 0
): Promise<{ artikel: UniversaArtikel[]; total: number }> {
  const collectionExists = await ensureCollectionExists();
  if (!collectionExists) {
    return { artikel: [], total: 0 };
  }

  const queries = [
    Query.orderAsc(sortBy),
    Query.limit(limit),
    Query.offset(offset),
  ];

  const response = await databases.listDocuments(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    queries
  );

  return {
    artikel: response.documents as unknown as UniversaArtikel[],
    total: response.total,
  };
}

// Artikel nach ID abrufen
export async function getUniversaArtikelById(id: string): Promise<UniversaArtikel | null> {
  try {
    const artikel = await databases.getDocument(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      id
    );
    return artikel as unknown as UniversaArtikel;
  } catch (error) {
    console.error('Fehler beim Abrufen des Universa-Artikels:', error);
    return null;
  }
}

// Artikel nach Artikelnummer suchen
export async function sucheUniversaArtikelNachNummer(artikelnummer: string): Promise<UniversaArtikel | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.equal('artikelnummer', artikelnummer)]
    );

    if (response.documents.length > 0) {
      return response.documents[0] as unknown as UniversaArtikel;
    }
    return null;
  } catch (error) {
    console.error('Fehler beim Suchen des Universa-Artikels:', error);
    return null;
  }
}

// Artikel aktualisieren
export async function aktualisiereUniversaArtikel(id: string, artikelData: Partial<UniversaArtikelInput>): Promise<UniversaArtikel> {
  const artikel = await databases.updateDocument(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    id,
    artikelData
  );

  return artikel as unknown as UniversaArtikel;
}

// Artikel löschen
export async function loescheUniversaArtikel(id: string): Promise<void> {
  await databases.deleteDocument(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    id
  );
}

// Alle Artikel löschen (für neuen Import)
export async function loescheAlleUniversaArtikel(): Promise<number> {
  let geloescht = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.limit(100)]
    );

    if (response.documents.length === 0) {
      hasMore = false;
      break;
    }

    for (const doc of response.documents) {
      await databases.deleteDocument(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, doc.$id);
      geloescht++;
    }
  }

  return geloescht;
}

// Artikel suchen (Volltextsuche in Bezeichnung)
export async function sucheUniversaArtikel(suchtext: string): Promise<UniversaArtikel[]> {
  if (!suchtext.trim()) {
    const result = await getAlleUniversaArtikel('bezeichnung', 50);
    return result.artikel;
  }

  const collectionExists = await ensureCollectionExists();
  if (!collectionExists) {
    return [];
  }

  try {
    // Suche in Bezeichnung
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [
        Query.search('bezeichnung', suchtext),
        Query.limit(50),
      ]
    );

    return response.documents as unknown as UniversaArtikel[];
  } catch (error) {
    console.error('Fehler beim Suchen von Universa-Artikeln:', error);
    // Fallback: Suche mit contains
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        UNIVERSA_ARTIKEL_COLLECTION_ID,
        [
          Query.contains('bezeichnung', suchtext),
          Query.limit(50),
        ]
      );
      return response.documents as unknown as UniversaArtikel[];
    } catch {
      return [];
    }
  }
}

// Excel-Datei parsen und importieren
export async function importiereExcel(file: File, ersetzeAlle: boolean = true): Promise<ExcelImportResult> {
  const result: ExcelImportResult = {
    erfolg: 0,
    fehler: 0,
    fehlermeldungen: [],
  };

  try {
    // Datei als ArrayBuffer lesen
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Erstes Sheet verwenden
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Zu JSON konvertieren (mit Header-Zeile)
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // Header-Zeile finden (enthält "Art.-Nr.")
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (row && row[0] && String(row[0]).includes('Art.-Nr')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      result.fehlermeldungen.push('Header-Zeile mit "Art.-Nr." nicht gefunden');
      return result;
    }

    // Datenzeilen ab der Zeile nach dem Header
    const dataRows = data.slice(headerRowIndex + 1);

    // Bei ersetzeAlle: Alle bestehenden Artikel löschen
    if (ersetzeAlle) {
      try {
        const geloescht = await loescheAlleUniversaArtikel();
        console.log(`${geloescht} bestehende Universa-Artikel gelöscht`);
      } catch (error) {
        console.warn('Fehler beim Löschen bestehender Artikel:', error);
      }
    }

    // Artikel importieren
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Leere Zeilen überspringen
      if (!row || !row[0] || String(row[0]).trim() === '') {
        continue;
      }

      const artikelnummer = String(row[0] || '').trim();
      const bezeichnung = String(row[1] || '').trim();
      const verpackungseinheit = String(row[2] || '').trim();
      const grosshaendlerPreisNetto = parseFloat(String(row[3] || '0').replace(',', '.')) || 0;
      const katalogPreisNetto = parseFloat(String(row[4] || '0').replace(',', '.')) || 0;
      const katalogPreisBrutto = parseFloat(String(row[5] || '0').replace(',', '.')) || 0;
      const seiteKatalog = row[6] ? parseInt(String(row[6])) : undefined;
      const aenderungen = row[7] ? String(row[7]).trim() : undefined;

      // Validierung
      if (!artikelnummer || !bezeichnung) {
        result.fehler++;
        if (result.fehlermeldungen.length < 10) {
          result.fehlermeldungen.push(`Zeile ${i + headerRowIndex + 2}: Artikelnummer oder Bezeichnung fehlt`);
        }
        continue;
      }

      try {
        await erstelleUniversaArtikel({
          artikelnummer,
          bezeichnung,
          verpackungseinheit,
          grosshaendlerPreisNetto,
          katalogPreisNetto,
          katalogPreisBrutto,
          seiteKatalog,
          aenderungen,
        });
        result.erfolg++;
      } catch (error: any) {
        result.fehler++;
        if (result.fehlermeldungen.length < 10) {
          result.fehlermeldungen.push(`Zeile ${i + headerRowIndex + 2} (${artikelnummer}): ${error?.message || 'Unbekannter Fehler'}`);
        }
      }
    }

    return result;
  } catch (error: any) {
    result.fehlermeldungen.push(`Fehler beim Lesen der Excel-Datei: ${error?.message || 'Unbekannter Fehler'}`);
    return result;
  }
}

// Anzahl der Universa-Artikel abrufen
export async function getUniversaArtikelAnzahl(): Promise<number> {
  const collectionExists = await ensureCollectionExists();
  if (!collectionExists) {
    return 0;
  }

  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.limit(1)]
    );
    return response.total;
  } catch {
    return 0;
  }
}
