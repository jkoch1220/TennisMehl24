import { databases, DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import {
  UniversalArtikel,
  UniversalArtikelInput,
  ExcelImportResult,
  ImportProgressCallback,
  VersandartTyp
} from '../types/universaArtikel';
import * as XLSX from 'xlsx';

/**
 * Service für die Verwaltung von Universal Sport Artikeln
 * Optimiert für den Import großer Artikelmengen (700+)
 */

// Batch-Größe für parallele Verarbeitung (konservativ für Appwrite Rate-Limits)
const BATCH_SIZE_DELETE = 5; // Kleinere Batches beim Löschen
const BATCH_SIZE_CREATE = 10; // Etwas größere Batches beim Erstellen
const BATCH_DELAY = 300; // 300ms Pause zwischen Batches für Rate-Limiting
const BATCH_DELAY_ON_ERROR = 2000; // 2 Sekunden Pause nach Rate-Limit-Fehler

// Collection automatisch erstellen falls nicht vorhanden
async function ensureCollectionExists(): Promise<boolean> {
  try {
    await databases.listDocuments(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, [Query.limit(1)]);
    return true;
  } catch (error: any) {
    if (error?.code === 404) {
      console.warn('Universal Artikel Collection existiert nicht. Bitte in Appwrite anlegen.');
      return false;
    }
    throw error;
  }
}

// Hilfsfunktion: Verzögerung
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Hilfsfunktion: Retry mit exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Bei Rate-Limit oder Server-Fehler: Warten und erneut versuchen
      if (error?.code === 429 || error?.code >= 500) {
        const waitTime = baseDelay * Math.pow(2, i); // 1s, 2s, 4s, 8s, 16s
        console.log(`Rate limit erreicht, warte ${waitTime}ms...`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Artikel erstellen mit Retry
export async function erstelleUniversalArtikel(artikelData: UniversalArtikelInput): Promise<UniversalArtikel> {
  const now = new Date().toISOString();

  const artikel = await retryWithBackoff(() =>
    databases.createDocument(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      ID.unique(),
      {
        ...artikelData,
        importDatum: now,
      }
    )
  );

  return artikel as unknown as UniversalArtikel;
}

// Alle Artikel abrufen (mit Sortierung und Paginierung)
export async function getAlleUniversalArtikel(
  sortBy: 'artikelnummer' | 'bezeichnung' | 'katalogPreisBrutto' = 'artikelnummer',
  limit: number = 100,
  offset: number = 0
): Promise<{ artikel: UniversalArtikel[]; total: number }> {
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
    artikel: response.documents as unknown as UniversalArtikel[],
    total: response.total,
  };
}

// Artikel nach ID abrufen
export async function getUniversalArtikelById(id: string): Promise<UniversalArtikel | null> {
  try {
    const artikel = await databases.getDocument(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      id
    );
    return artikel as unknown as UniversalArtikel;
  } catch (error) {
    console.error('Fehler beim Abrufen des Universal-Artikels:', error);
    return null;
  }
}

// Artikel nach Artikelnummer suchen
export async function sucheUniversalArtikelNachNummer(artikelnummer: string): Promise<UniversalArtikel | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.equal('artikelnummer', artikelnummer)]
    );

    if (response.documents.length > 0) {
      return response.documents[0] as unknown as UniversalArtikel;
    }
    return null;
  } catch (error) {
    console.error('Fehler beim Suchen des Universal-Artikels:', error);
    return null;
  }
}

// Artikel aktualisieren
export async function aktualisiereUniversalArtikel(id: string, artikelData: Partial<UniversalArtikelInput>): Promise<UniversalArtikel> {
  const artikel = await databases.updateDocument(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    id,
    artikelData
  );

  return artikel as unknown as UniversalArtikel;
}

// Artikel löschen
export async function loescheUniversalArtikel(id: string): Promise<void> {
  await databases.deleteDocument(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    id
  );
}

// Alle Artikel löschen (optimiert für Appwrite Rate-Limits)
export async function loescheAlleUniversalArtikel(
  onProgress?: ImportProgressCallback
): Promise<number> {
  let geloescht = 0;
  let hasMore = true;
  let consecutiveErrors = 0;

  // Erst die Gesamtanzahl ermitteln
  const countResponse = await databases.listDocuments(
    DATABASE_ID,
    UNIVERSA_ARTIKEL_COLLECTION_ID,
    [Query.limit(1)]
  );
  const totalToDelete = countResponse.total;

  if (totalToDelete === 0) {
    return 0;
  }

  onProgress?.({
    phase: 'deleting',
    current: 0,
    total: totalToDelete,
    message: `Lösche ${totalToDelete} bestehende Artikel...`
  });

  // Cache leeren vor dem Löschen
  clearArtikelCache();

  while (hasMore) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.limit(50)] // Kleinere Batches holen
    );

    if (response.documents.length === 0) {
      hasMore = false;
      break;
    }

    // Sequenziell löschen in kleinen Gruppen
    const docs = response.documents;
    for (let i = 0; i < docs.length; i += BATCH_SIZE_DELETE) {
      const batch = docs.slice(i, i + BATCH_SIZE_DELETE);

      try {
        // Kleine Batches parallel, aber mit Retry
        await Promise.all(
          batch.map(doc =>
            retryWithBackoff(() =>
              databases.deleteDocument(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, doc.$id)
            )
          )
        );

        geloescht += batch.length;
        consecutiveErrors = 0; // Reset bei Erfolg

        onProgress?.({
          phase: 'deleting',
          current: geloescht,
          total: totalToDelete,
          message: `Lösche Artikel... ${geloescht}/${totalToDelete}`
        });

        // Pause zwischen Batches
        await delay(BATCH_DELAY);

      } catch (error: any) {
        consecutiveErrors++;
        console.error(`Fehler beim Löschen (Versuch ${consecutiveErrors}):`, error?.message);

        if (error?.code === 429) {
          // Rate Limit - längere Pause
          onProgress?.({
            phase: 'deleting',
            current: geloescht,
            total: totalToDelete,
            message: `Rate-Limit erreicht, warte... ${geloescht}/${totalToDelete}`
          });
          await delay(BATCH_DELAY_ON_ERROR * consecutiveErrors); // Immer längere Pausen
          i -= BATCH_SIZE_DELETE; // Batch wiederholen
        } else if (consecutiveErrors >= 5) {
          throw new Error(`Zu viele Fehler beim Löschen: ${error?.message}`);
        }
      }
    }
  }

  return geloescht;
}

// ============================================================================
// INTELLIGENTE ARTIKEL-SUCHE MIT RELEVANZ-RANKING
// ============================================================================

// Cache für alle Artikel (für schnelle Client-seitige Suche)
let artikelCache: UniversalArtikel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten Cache

// Cache leeren (z.B. nach Import)
export function clearArtikelCache(): void {
  artikelCache = null;
  cacheTimestamp = 0;
}

// Alle Artikel für Suche laden (mit Cache)
export async function getAlleArtikelFuerSuche(): Promise<UniversalArtikel[]> {
  const now = Date.now();

  // Cache noch gültig?
  if (artikelCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return artikelCache;
  }

  const collectionExists = await ensureCollectionExists();
  if (!collectionExists) {
    return [];
  }

  // Alle Artikel laden (in Batches)
  const alleArtikel: UniversalArtikel[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.limit(batchSize), Query.offset(offset)]
    );

    alleArtikel.push(...(response.documents as unknown as UniversalArtikel[]));
    offset += batchSize;
    hasMore = response.documents.length === batchSize;
  }

  // Cache aktualisieren
  artikelCache = alleArtikel;
  cacheTimestamp = now;

  return alleArtikel;
}

// Normalisiere Text für Suche (lowercase, behält mehr Zeichen)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .trim();
}

// Einfachere Normalisierung für Token-Matching
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöüß]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenisiere Suchtext in einzelne Wörter
function tokenize(text: string): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter(token => token.length >= 1); // Auch einzelne Zeichen für Artikelnummern
}

// Berechne Relevanz-Score für einen Artikel
function calculateScore(artikel: UniversalArtikel, suchTokens: string[]): number {
  if (suchTokens.length === 0) return 0;

  const bezeichnung = normalizeText(artikel.bezeichnung || '');
  const artikelnummer = normalizeText(artikel.artikelnummer || '');
  const verpackungseinheit = normalizeText(artikel.verpackungseinheit || '');
  const seite = String(artikel.seiteKatalog || '');
  const preisGH = String(artikel.grosshaendlerPreisNetto || '');
  const preisNetto = String(artikel.katalogPreisNetto || '');
  const preisBrutto = String(artikel.katalogPreisBrutto || '');

  // Alle Felder kombiniert für Token-Matching
  const allFields = `${bezeichnung} ${artikelnummer} ${verpackungseinheit} ${seite} ${preisGH} ${preisNetto} ${preisBrutto}`;
  const allFieldsNormalized = normalizeForMatch(allFields);

  let totalScore = 0;
  let matchedTokens = 0;

  for (const token of suchTokens) {
    let tokenScore = 0;

    // 1. Exakte Übereinstimmung in Artikelnummer (höchster Score)
    if (artikelnummer === token) {
      tokenScore = 150;
    }
    // 2. Artikelnummer enthält Token
    else if (artikelnummer.includes(token)) {
      tokenScore = 120;
    }
    // 3. Exakte Wort-Übereinstimmung in Bezeichnung
    else if (bezeichnung.split(/\s+/).some(word => word === token)) {
      tokenScore = 100;
    }
    // 4. Wort beginnt mit Token in Bezeichnung
    else if (bezeichnung.split(/\s+/).some(word => word.startsWith(token))) {
      tokenScore = 80;
    }
    // 5. Token ist irgendwo in Bezeichnung enthalten
    else if (bezeichnung.includes(token)) {
      tokenScore = 60;
    }
    // 6. Token ist in Verpackungseinheit
    else if (verpackungseinheit.includes(token)) {
      tokenScore = 40;
    }
    // 7. Token ist irgendwo in den Feldern enthalten
    else if (allFieldsNormalized.includes(token)) {
      tokenScore = 20;
    }

    if (tokenScore > 0) {
      totalScore += tokenScore;
      matchedTokens++;
    }
  }

  // Mindestens ein Token muss matchen
  if (matchedTokens === 0) {
    return 0;
  }

  // Bonus basierend auf wie viele Tokens gematched haben
  const matchRatio = matchedTokens / suchTokens.length;
  totalScore = totalScore * matchRatio;

  // Extra Bonus wenn ALLE Tokens matchen
  if (matchedTokens === suchTokens.length) {
    totalScore += 100;
  }

  // Bonus für kürzere Bezeichnungen (exaktere Treffer)
  const lengthBonus = Math.max(0, 30 - bezeichnung.length / 3);

  // Bonus wenn alle Suchbegriffe nah beieinander sind
  const consecutiveBonus = matchedTokens === suchTokens.length && checkConsecutiveMatch(bezeichnung, suchTokens) ? 50 : 0;

  return totalScore + lengthBonus + consecutiveBonus;
}

// Prüft ob alle Tokens in der richtigen Reihenfolge vorkommen
function checkConsecutiveMatch(text: string, tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  let lastIndex = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, lastIndex + 1);
    if (index === -1) return false;
    lastIndex = index;
  }
  return true;
}

// HAUPT-SUCHFUNKTION: Intelligente Suche mit Relevanz-Ranking
export async function sucheUniversalArtikel(suchtext: string): Promise<UniversalArtikel[]> {
  // Leere Suche = Standard-Liste
  if (!suchtext.trim()) {
    const result = await getAlleUniversalArtikel('bezeichnung', 50);
    return result.artikel;
  }

  // Suchtext normalisieren
  const normalizedSearch = normalizeText(suchtext);

  // Tokenisiere Suchtext
  const suchTokens = tokenize(suchtext);

  if (suchTokens.length === 0 && normalizedSearch.length === 0) {
    const result = await getAlleUniversalArtikel('bezeichnung', 50);
    return result.artikel;
  }

  // Alle Artikel laden (aus Cache oder DB)
  const alleArtikel = await getAlleArtikelFuerSuche();

  // Score für jeden Artikel berechnen
  const artikelMitScore = alleArtikel
    .map(artikel => {
      // Berechne Token-basierenden Score
      let score = suchTokens.length > 0 ? calculateScore(artikel, suchTokens) : 0;

      // Zusätzliche direkte String-Suche (für Sonderzeichen, Artikelnummern etc.)
      const artikelStr = `${artikel.artikelnummer} ${artikel.bezeichnung} ${artikel.verpackungseinheit}`.toLowerCase();

      // Bonus wenn der gesamte Suchtext (nicht tokenisiert) enthalten ist
      if (artikelStr.includes(normalizedSearch)) {
        score += 200;
      }

      // Bonus wenn Artikelnummer exakt matched
      if (artikel.artikelnummer.toLowerCase() === normalizedSearch) {
        score += 500;
      }

      // Bonus wenn Artikelnummer mit Suchtext beginnt
      if (artikel.artikelnummer.toLowerCase().startsWith(normalizedSearch)) {
        score += 300;
      }

      return { artikel, score };
    })
    .filter(item => item.score > 0) // Nur Treffer
    .sort((a, b) => b.score - a.score); // Nach Score sortieren (höchster zuerst)

  // Top 100 Ergebnisse zurückgeben (mehr Ergebnisse)
  return artikelMitScore.slice(0, 100).map(item => item.artikel);
}

// Schnelle Suche für Autocomplete (nur Top 10)
export async function sucheUniversalArtikelSchnell(suchtext: string): Promise<UniversalArtikel[]> {
  const ergebnisse = await sucheUniversalArtikel(suchtext);
  return ergebnisse.slice(0, 10);
}

// ============================================================================
// VERSANDCODE-PARSER (für Universal Sport Versandlogik)
// ============================================================================

/**
 * Parst einen Universal Sport Versandcode und ermittelt die Versandart.
 *
 * Format der Versandcodes:
 * - Einzeln: "31", "21", "41"
 * - Kombiniert: "31+33", "2x31+1x33"
 * - Spezial: "F.a.A." (Fracht auf Anfrage), "Post"
 *
 * Erste Ziffer bestimmt Versandart/Zone:
 * - 1x = Post/Sonderversand
 * - 2x = Spedition (große/schwere Artikel)
 * - 3x = GLS Deutschland
 * - 4x = GLS Österreich
 * - 5x = GLS Benelux
 */
export function parseVersandcode(code: string | undefined | null): {
  versandart: VersandartTyp;
  einzelcodes: string[];
  anzahlPakete: number;
} {
  if (!code || code.trim() === '') {
    return { versandart: 'unbekannt', einzelcodes: [], anzahlPakete: 0 };
  }

  const normalized = code.trim().toLowerCase();

  // Fracht auf Anfrage
  if (normalized.includes('f. a. a.') || normalized.includes('f.a.a.') || normalized.includes('fracht auf anfrage')) {
    return { versandart: 'anfrage', einzelcodes: [], anzahlPakete: 0 };
  }

  // Post
  if (normalized === 'post') {
    return { versandart: 'post', einzelcodes: ['post'], anzahlPakete: 1 };
  }

  // Parse kombinierte Codes mit Multiplikatoren: "2x31+1x33", "31+33"
  // Matches: "2x31", "31", etc.
  const codePattern = /(?:(\d+)x)?(\d+)/g;
  const matches = [...code.matchAll(codePattern)];

  if (matches.length === 0) {
    return { versandart: 'unbekannt', einzelcodes: [], anzahlPakete: 0 };
  }

  const einzelcodes: string[] = [];
  let anzahlPakete = 0;

  for (const match of matches) {
    const multiplier = match[1] ? parseInt(match[1]) : 1;
    const codeNumber = match[2];

    // Nur gültige Codes (2-stellig beginnend mit 1-5)
    if (codeNumber && /^[1-5]\d$/.test(codeNumber)) {
      einzelcodes.push(codeNumber);
      anzahlPakete += multiplier;
    }
  }

  if (einzelcodes.length === 0) {
    return { versandart: 'unbekannt', einzelcodes: [], anzahlPakete: 0 };
  }

  // Erste Ziffer des ersten Codes bestimmt Versandart
  const ersteZiffer = einzelcodes[0].charAt(0);

  let versandart: VersandartTyp;
  switch (ersteZiffer) {
    case '1': versandart = 'post'; break;
    case '2': versandart = 'spedition'; break;
    case '3':
    case '4':
    case '5': versandart = 'gls'; break;
    default: versandart = 'unbekannt';
  }

  return { versandart, einzelcodes, anzahlPakete };
}

/**
 * Ermittelt ob ein Artikel Sperrgut ist basierend auf Versandcode oder Gewicht.
 * Sperrgut-Codes haben typischerweise die zweite Ziffer >= 3
 */
export function istSperrgutArtikel(
  versandcodeDE: string | undefined | null,
  gewichtKg: number | undefined | null
): boolean {
  // Gewicht > 31.5kg ist immer Sperrgut (GLS Limit)
  if (gewichtKg && gewichtKg > 31.5) {
    return true;
  }

  const { einzelcodes, versandart } = parseVersandcode(versandcodeDE);

  // Spedition ist immer Sperrgut
  if (versandart === 'spedition') {
    return true;
  }

  // GLS: Zweite Ziffer >= 3 ist Sperrgut
  for (const code of einzelcodes) {
    const zweiteZiffer = parseInt(code.charAt(1));
    if (zweiteZiffer >= 3) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// EXCEL PARSER: ARTIKELLISTE 2026 (Versand- und Zolldaten, KEINE Preise)
// ============================================================================

/**
 * Parst die Universal Sport Artikelliste 2026 Excel-Datei.
 * Diese Liste enthält Versand-, Zoll- und Maßdaten, aber KEINE Preise.
 *
 * Erwartete Spalten (A-P):
 * A: Artikelnummer
 * B: Bezeichnung
 * C: Einheit (= verpackungseinheit)
 * D: ZTN (Zolltarifnummer)
 * E: UL (Ursprungsland ISO)
 * F: UR (Ursprungsregion)
 * G: Gewicht (kg)
 * H: Länge (cm)
 * I: Breite (cm)
 * J: Höhe (cm)
 * K: EAN
 * L: Seite Katalog
 * M: Versand DE
 * N: Versand AT
 * O: Versand Benelux
 * P: Notizen
 */
export function parseArtikellisteExcel(arrayBuffer: ArrayBuffer): {
  artikel: Partial<UniversalArtikelInput>[];
  fehler: string[];
} {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const artikel: Partial<UniversalArtikelInput>[] = [];
  const fehler: string[] = [];

  // Header-Zeile finden (enthält "Artikelnummer" oder "Art.-Nr")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (row && row[0]) {
      // Normalisiere: entferne Leerzeichen, Bindestriche, Zeilenumbrüche
      const firstCell = String(row[0]).toLowerCase().replace(/[\s\-\n\r]/g, '');
      // Unterstützt: "artikelnummer", "Artikel- nummer", "Art.-Nr.", "Artikel-nummer"
      if (firstCell.includes('artikelnummer') || firstCell.includes('art.nr') || firstCell.includes('artnr')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    fehler.push('Header-Zeile mit "Artikelnummer" nicht gefunden');
    return { artikel, fehler };
  }

  // Datenzeilen ab der Zeile nach dem Header
  const dataRows = data.slice(headerRowIndex + 1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];

    // Leere Zeilen überspringen
    if (!row || !row[0] || String(row[0]).trim() === '') {
      continue;
    }

    const artikelnummer = String(row[0] || '').trim();
    const bezeichnung = String(row[1] || '').trim();
    const verpackungseinheit = String(row[2] || '').trim();
    const zolltarifnummer = String(row[3] || '').trim() || undefined;
    const ursprungsland = String(row[4] || '').trim().toUpperCase() || undefined;
    const ursprungsregion = String(row[5] || '').trim() || undefined;

    // Gewicht und Maße parsen (können leer sein)
    const gewichtKg = row[6] ? parseFloat(String(row[6]).replace(',', '.')) : undefined;
    const laengeCm = row[7] ? parseFloat(String(row[7]).replace(',', '.')) : undefined;
    const breiteCm = row[8] ? parseFloat(String(row[8]).replace(',', '.')) : undefined;
    const hoeheCm = row[9] ? parseFloat(String(row[9]).replace(',', '.')) : undefined;

    const ean = String(row[10] || '').trim() || undefined;
    const seiteKatalog = row[11] ? parseInt(String(row[11])) : undefined;

    // Versandcodes
    const versandcodeDE = String(row[12] || '').trim() || undefined;
    const versandcodeAT = String(row[13] || '').trim() || undefined;
    const versandcodeBenelux = String(row[14] || '').trim() || undefined;

    // Notizen könnten in Spalte P sein (index 15)
    const notizen = row[15] ? String(row[15]).trim() : undefined;

    // Validierung
    if (!artikelnummer) {
      if (fehler.length < 10) {
        fehler.push(`Zeile ${i + headerRowIndex + 2}: Artikelnummer fehlt`);
      }
      continue;
    }

    // Versandart aus DE-Code ableiten
    const { versandart: versandartDE } = parseVersandcode(versandcodeDE);

    // Sperrgut ermitteln
    const istSperrgut = istSperrgutArtikel(versandcodeDE, gewichtKg);

    artikel.push({
      artikelnummer,
      bezeichnung: bezeichnung || artikelnummer, // Fallback auf Artikelnummer
      verpackungseinheit: verpackungseinheit || 'Stück',
      zolltarifnummer,
      ursprungsland,
      ursprungsregion,
      gewichtKg: isNaN(gewichtKg!) ? undefined : gewichtKg,
      laengeCm: isNaN(laengeCm!) ? undefined : laengeCm,
      breiteCm: isNaN(breiteCm!) ? undefined : breiteCm,
      hoeheCm: isNaN(hoeheCm!) ? undefined : hoeheCm,
      ean,
      seiteKatalog: isNaN(seiteKatalog!) ? undefined : seiteKatalog,
      versandcodeDE,
      versandcodeAT,
      versandcodeBenelux,
      versandartDE,
      istSperrgut,
      // Preise werden NICHT aus dieser Liste importiert
      grosshaendlerPreisNetto: 0,
      katalogPreisNetto: 0,
      katalogPreisBrutto: 0,
      aenderungen: notizen,
    });
  }

  return { artikel, fehler };
}

// ============================================================================
// EXCEL PARSER: PREISLISTE (bestehende Logik)
// ============================================================================

// Excel-Datei parsen und Artikel-Daten extrahieren (ohne Import)
function parseExcelToArtikel(arrayBuffer: ArrayBuffer): { artikel: UniversalArtikelInput[]; fehler: string[] } {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const artikel: UniversalArtikelInput[] = [];
  const fehler: string[] = [];

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
    fehler.push('Header-Zeile mit "Art.-Nr." nicht gefunden');
    return { artikel, fehler };
  }

  // Datenzeilen ab der Zeile nach dem Header
  const dataRows = data.slice(headerRowIndex + 1);

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
      if (fehler.length < 10) {
        fehler.push(`Zeile ${i + headerRowIndex + 2}: Artikelnummer oder Bezeichnung fehlt`);
      }
      continue;
    }

    artikel.push({
      artikelnummer,
      bezeichnung,
      verpackungseinheit,
      grosshaendlerPreisNetto,
      katalogPreisNetto,
      katalogPreisBrutto,
      seiteKatalog,
      aenderungen,
    });
  }

  return { artikel, fehler };
}

// Excel-Datei importieren (optimiert für große Mengen mit Fortschrittsanzeige)
export async function importiereExcel(
  file: File,
  ersetzeAlle: boolean = true,
  onProgress?: ImportProgressCallback
): Promise<ExcelImportResult> {
  const result: ExcelImportResult = {
    erfolg: 0,
    fehler: 0,
    fehlermeldungen: [],
  };

  try {
    // Phase 1: Excel parsen
    onProgress?.({
      phase: 'parsing',
      current: 0,
      total: 100,
      message: 'Lese Excel-Datei...'
    });

    const arrayBuffer = await file.arrayBuffer();
    const { artikel: artikelListe, fehler: parseFehler } = parseExcelToArtikel(arrayBuffer);

    if (parseFehler.length > 0 && artikelListe.length === 0) {
      result.fehlermeldungen = parseFehler;
      return result;
    }

    result.fehlermeldungen.push(...parseFehler);
    result.fehler = parseFehler.length;

    onProgress?.({
      phase: 'parsing',
      current: 100,
      total: 100,
      message: `${artikelListe.length} Artikel in Excel gefunden`
    });

    // Phase 2: Bestehende Artikel löschen
    if (ersetzeAlle) {
      await loescheAlleUniversalArtikel(onProgress);
    }

    // Phase 3: Artikel importieren in Batches
    const totalArtikel = artikelListe.length;
    let importiert = 0;

    onProgress?.({
      phase: 'importing',
      current: 0,
      total: totalArtikel,
      message: `Importiere ${totalArtikel} Artikel...`
    });

    // Artikel in Batches verarbeiten
    for (let i = 0; i < artikelListe.length; i += BATCH_SIZE_CREATE) {
      const batch = artikelListe.slice(i, i + BATCH_SIZE_CREATE);

      // Parallel importieren mit Promise.allSettled für Fehlertoleranz
      const results = await Promise.allSettled(
        batch.map(artikel => erstelleUniversalArtikel(artikel))
      );

      // Ergebnisse auswerten
      for (let j = 0; j < results.length; j++) {
        const settledResult = results[j];
        if (settledResult.status === 'fulfilled') {
          result.erfolg++;
        } else {
          result.fehler++;
          if (result.fehlermeldungen.length < 20) {
            const artikelNr = batch[j]?.artikelnummer || 'Unbekannt';
            const errorMessage = settledResult.reason?.message || 'Unbekannter Fehler';
            result.fehlermeldungen.push(`${artikelNr}: ${errorMessage}`);
          }
        }
        importiert++;
      }

      // Fortschritt melden
      onProgress?.({
        phase: 'importing',
        current: importiert,
        total: totalArtikel,
        message: `Importiere Artikel... ${importiert}/${totalArtikel}`
      });

      // Pause zwischen Batches um Rate-Limits zu vermeiden
      if (i + BATCH_SIZE_CREATE < artikelListe.length) {
        await delay(BATCH_DELAY);
      }
    }

    // Cache leeren damit die neue Suche die importierten Artikel findet
    clearArtikelCache();

    // Fertig
    onProgress?.({
      phase: 'done',
      current: totalArtikel,
      total: totalArtikel,
      message: `Import abgeschlossen: ${result.erfolg} erfolgreich, ${result.fehler} fehlgeschlagen`
    });

    return result;
  } catch (error: any) {
    result.fehlermeldungen.push(`Fehler beim Import: ${error?.message || 'Unbekannter Fehler'}`);
    return result;
  }
}

// ============================================================================
// ARTIKELLISTE IMPORT (Merge mit bestehenden Artikeln)
// ============================================================================

/**
 * Importiert die Artikelliste 2026 (Versand-/Zoll-Daten).
 * Diese Funktion MERGED mit bestehenden Artikeln - Preise bleiben erhalten!
 *
 * Strategie:
 * - Bestehende Artikel werden AKTUALISIERT (Versand/Zoll-Daten ergänzt)
 * - Neue Artikel werden ERSTELLT (ohne Preise, müssen später via Preisliste kommen)
 * - Preise werden NIE überschrieben
 */
export async function importiereArtikellisteExcel(
  file: File,
  onProgress?: ImportProgressCallback
): Promise<ExcelImportResult> {
  const result: ExcelImportResult = {
    erfolg: 0,
    fehler: 0,
    aktualisiert: 0,
    fehlermeldungen: [],
  };

  try {
    // Phase 1: Excel parsen
    onProgress?.({
      phase: 'parsing',
      current: 0,
      total: 100,
      message: 'Lese Artikelliste Excel...'
    });

    const arrayBuffer = await file.arrayBuffer();
    const { artikel: artikelListe, fehler: parseFehler } = parseArtikellisteExcel(arrayBuffer);

    if (parseFehler.length > 0 && artikelListe.length === 0) {
      result.fehlermeldungen = parseFehler;
      return result;
    }

    result.fehlermeldungen.push(...parseFehler);
    result.fehler = parseFehler.length;

    onProgress?.({
      phase: 'parsing',
      current: 100,
      total: 100,
      message: `${artikelListe.length} Artikel in Artikelliste gefunden`
    });

    // Phase 2: Bestehende Artikel aus Cache laden
    onProgress?.({
      phase: 'importing',
      current: 0,
      total: artikelListe.length,
      message: 'Lade bestehende Artikel zum Abgleich...'
    });

    // Cache neu laden für aktuellen Stand
    clearArtikelCache();
    const bestehendeArtikel = await getAlleArtikelFuerSuche();

    // Index für schnellen Lookup
    const artikelIndex = new Map<string, UniversalArtikel>();
    for (const art of bestehendeArtikel) {
      artikelIndex.set(art.artikelnummer, art);
    }

    // Phase 3: Artikel verarbeiten
    const totalArtikel = artikelListe.length;
    let verarbeitet = 0;

    for (let i = 0; i < artikelListe.length; i += BATCH_SIZE_CREATE) {
      const batch = artikelListe.slice(i, i + BATCH_SIZE_CREATE);

      const batchPromises = batch.map(async (artikelDaten) => {
        const bestehend = artikelIndex.get(artikelDaten.artikelnummer!);

        if (bestehend && bestehend.$id) {
          // UPDATE: Nur Versand/Zoll-Felder aktualisieren, Preise NICHT überschreiben
          try {
            await retryWithBackoff(() =>
              databases.updateDocument(
                DATABASE_ID,
                UNIVERSA_ARTIKEL_COLLECTION_ID,
                bestehend.$id!,
                {
                  // Bezeichnung und Einheit aktualisieren falls vorhanden
                  ...(artikelDaten.bezeichnung && { bezeichnung: artikelDaten.bezeichnung }),
                  ...(artikelDaten.verpackungseinheit && { verpackungseinheit: artikelDaten.verpackungseinheit }),
                  // Neue Felder aus Artikelliste
                  zolltarifnummer: artikelDaten.zolltarifnummer ?? null,
                  ursprungsland: artikelDaten.ursprungsland ?? null,
                  ursprungsregion: artikelDaten.ursprungsregion ?? null,
                  gewichtKg: artikelDaten.gewichtKg ?? null,
                  laengeCm: artikelDaten.laengeCm ?? null,
                  breiteCm: artikelDaten.breiteCm ?? null,
                  hoeheCm: artikelDaten.hoeheCm ?? null,
                  ean: artikelDaten.ean ?? null,
                  seiteKatalog: artikelDaten.seiteKatalog ?? bestehend.seiteKatalog ?? null,
                  versandcodeDE: artikelDaten.versandcodeDE ?? null,
                  versandcodeAT: artikelDaten.versandcodeAT ?? null,
                  versandcodeBenelux: artikelDaten.versandcodeBenelux ?? null,
                  versandartDE: artikelDaten.versandartDE ?? null,
                  istSperrgut: artikelDaten.istSperrgut ?? null,
                  // PREISE NICHT ÜBERSCHREIBEN!
                }
              )
            );
            return 'updated';
          } catch (err) {
            console.error(`Fehler beim Update von ${artikelDaten.artikelnummer}:`, err);
            return 'error';
          }
        } else {
          // CREATE: Neuer Artikel (ohne Preise - müssen via Preisliste kommen)
          try {
            await retryWithBackoff(() =>
              databases.createDocument(
                DATABASE_ID,
                UNIVERSA_ARTIKEL_COLLECTION_ID,
                ID.unique(),
                {
                  artikelnummer: artikelDaten.artikelnummer,
                  bezeichnung: artikelDaten.bezeichnung || artikelDaten.artikelnummer,
                  verpackungseinheit: artikelDaten.verpackungseinheit || 'Stück',
                  // Preise auf 0 - müssen separat importiert werden
                  grosshaendlerPreisNetto: 0,
                  katalogPreisNetto: 0,
                  katalogPreisBrutto: 0,
                  // Neue Felder
                  zolltarifnummer: artikelDaten.zolltarifnummer ?? null,
                  ursprungsland: artikelDaten.ursprungsland ?? null,
                  ursprungsregion: artikelDaten.ursprungsregion ?? null,
                  gewichtKg: artikelDaten.gewichtKg ?? null,
                  laengeCm: artikelDaten.laengeCm ?? null,
                  breiteCm: artikelDaten.breiteCm ?? null,
                  hoeheCm: artikelDaten.hoeheCm ?? null,
                  ean: artikelDaten.ean ?? null,
                  seiteKatalog: artikelDaten.seiteKatalog ?? null,
                  versandcodeDE: artikelDaten.versandcodeDE ?? null,
                  versandcodeAT: artikelDaten.versandcodeAT ?? null,
                  versandcodeBenelux: artikelDaten.versandcodeBenelux ?? null,
                  versandartDE: artikelDaten.versandartDE ?? null,
                  istSperrgut: artikelDaten.istSperrgut ?? null,
                  importDatum: new Date().toISOString(),
                }
              )
            );
            return 'created';
          } catch (err) {
            console.error(`Fehler beim Erstellen von ${artikelDaten.artikelnummer}:`, err);
            return 'error';
          }
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const res of batchResults) {
        if (res === 'created') result.erfolg++;
        else if (res === 'updated') result.aktualisiert!++;
        else result.fehler++;
        verarbeitet++;
      }

      onProgress?.({
        phase: 'importing',
        current: verarbeitet,
        total: totalArtikel,
        message: `Verarbeite Artikel... ${verarbeitet}/${totalArtikel} (${result.aktualisiert} aktualisiert, ${result.erfolg} neu)`
      });

      // Pause zwischen Batches
      if (i + BATCH_SIZE_CREATE < artikelListe.length) {
        await delay(BATCH_DELAY);
      }
    }

    // Cache leeren
    clearArtikelCache();

    onProgress?.({
      phase: 'done',
      current: totalArtikel,
      total: totalArtikel,
      message: `Import abgeschlossen: ${result.aktualisiert} aktualisiert, ${result.erfolg} neu erstellt, ${result.fehler} Fehler`
    });

    return result;
  } catch (error: any) {
    result.fehlermeldungen.push(`Fehler beim Import: ${error?.message || 'Unbekannter Fehler'}`);
    return result;
  }
}

// ============================================================================
// HILFSFUNKTIONEN
// ============================================================================

// Anzahl der Universal-Artikel abrufen
export async function getUniversalArtikelAnzahl(): Promise<number> {
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

// Backwards compatibility exports (deprecated, use the new names)
export const erstelleUniversaArtikel = erstelleUniversalArtikel;
export const getAlleUniversaArtikel = getAlleUniversalArtikel;
export const getUniversaArtikelById = getUniversalArtikelById;
export const sucheUniversaArtikelNachNummer = sucheUniversalArtikelNachNummer;
export const aktualisiereUniversaArtikel = aktualisiereUniversalArtikel;
export const loescheUniversaArtikel = loescheUniversalArtikel;
export const loescheAlleUniversaArtikel = loescheAlleUniversalArtikel;
export const sucheUniversaArtikel = sucheUniversalArtikel;
export const getUniversaArtikelAnzahl = getUniversalArtikelAnzahl;
