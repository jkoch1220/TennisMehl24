/**
 * ULTIMATE FUZZY SEARCH ENGINE
 * Die beste Suche der Welt - keine Kompromisse.
 *
 * Features:
 * - Levenshtein-Distanz (Tippfehler-Toleranz)
 * - Wort-basierte Suche (AND-Verknüpfung)
 * - Präfix-Matching ("Grafen" → "Grafenrheinfeld")
 * - N-Gram-Ähnlichkeit für unscharfe Matches
 * - Scoring-System für Relevanz-Sortierung
 * - Umlaute-Normalisierung
 * - Case-insensitive
 */

// ============ LEVENSHTEIN DISTANCE ============
// Misst die minimale Anzahl von Einfügungen, Löschungen und Ersetzungen
// um einen String in einen anderen zu transformieren

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialisiere Matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fülle Matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Löschung
        matrix[i][j - 1] + 1,      // Einfügung
        matrix[i - 1][j - 1] + cost // Ersetzung
      );
    }
  }

  return matrix[a.length][b.length];
}

// ============ DAMERAU-LEVENSHTEIN DISTANCE ============
// Wie Levenshtein, aber erlaubt auch Transpositionen (vertauschte Buchstaben)
// z.B. "Grfaen" → "Grafen" hat Distanz 1 statt 2

function damerauLevenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  const d: number[][] = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));

  for (let i = 0; i <= lenA; i++) d[i][0] = i;
  for (let j = 0; j <= lenB; j++) d[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,          // Löschung
        d[i][j - 1] + 1,          // Einfügung
        d[i - 1][j - 1] + cost    // Ersetzung
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[lenA][lenB];
}

// ============ N-GRAM SIMILARITY ============
// Teilt Strings in N-Zeichen-Blöcke und vergleicht Überlappung
// Gut für Teilwort-Matching

function getNGrams(str: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  const padded = ' '.repeat(n - 1) + str + ' '.repeat(n - 1);
  for (let i = 0; i < padded.length - n + 1; i++) {
    ngrams.add(padded.substring(i, i + n));
  }
  return ngrams;
}

function ngramSimilarity(a: string, b: string, n: number = 2): number {
  const ngramsA = getNGrams(a, n);
  const ngramsB = getNGrams(b, n);

  let intersection = 0;
  ngramsA.forEach(gram => {
    if (ngramsB.has(gram)) intersection++;
  });

  const union = ngramsA.size + ngramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============ JARO-WINKLER SIMILARITY ============
// Besonders gut für Namen - gibt Bonus für gleiche Präfixe

function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Finde Matches
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Zähle Transpositionen
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) / 3
  );
}

function jaroWinklerSimilarity(a: string, b: string, prefixScale: number = 0.1): number {
  const jaroSim = jaroSimilarity(a, b);

  // Gemeinsames Präfix (max 4 Zeichen)
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(a.length, b.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaroSim + prefix * prefixScale * (1 - jaroSim);
}

// ============ TEXT NORMALISIERUNG ============

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Umlaute normalisieren
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Sonderzeichen entfernen
    .replace(/[^\w\s]/g, ' ')
    // Mehrfache Leerzeichen
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrahiere Wörter aus einem Text
function extractWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(w => w.length > 0);
}

// ============ PRÄFIX MATCHING ============

function isPrefixMatch(searchWord: string, targetWord: string): boolean {
  return targetWord.startsWith(searchWord);
}

function containsWord(searchWord: string, targetWord: string): boolean {
  return targetWord.includes(searchWord);
}

// ============ WORT ÄHNLICHKEIT ============

interface WordMatchResult {
  matched: boolean;
  score: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy' | 'none';
}

function matchWord(searchWord: string, targetWord: string, fuzzyThreshold: number = 0.7): WordMatchResult {
  // Exakter Match
  if (searchWord === targetWord) {
    return { matched: true, score: 1.0, matchType: 'exact' };
  }

  // Präfix-Match (höchste Priorität nach exakt)
  if (isPrefixMatch(searchWord, targetWord)) {
    const prefixRatio = searchWord.length / targetWord.length;
    return { matched: true, score: 0.9 + prefixRatio * 0.09, matchType: 'prefix' };
  }

  // Contains-Match
  if (containsWord(searchWord, targetWord)) {
    const containsRatio = searchWord.length / targetWord.length;
    return { matched: true, score: 0.8 + containsRatio * 0.1, matchType: 'contains' };
  }

  // Fuzzy-Match (Jaro-Winkler für kurze Wörter, N-Gram für längere)
  let fuzzyScore: number;

  if (searchWord.length <= 5 && targetWord.length <= 8) {
    // Jaro-Winkler für kurze Wörter
    fuzzyScore = jaroWinklerSimilarity(searchWord, targetWord);
  } else {
    // Kombiniere mehrere Metriken für längere Wörter
    const jw = jaroWinklerSimilarity(searchWord, targetWord);
    const ngram = ngramSimilarity(searchWord, targetWord, 2);

    // Levenshtein-basierte Ähnlichkeit
    const maxLen = Math.max(searchWord.length, targetWord.length);
    const levDist = damerauLevenshteinDistance(searchWord, targetWord);
    const levSim = 1 - levDist / maxLen;

    // Gewichteter Durchschnitt
    fuzzyScore = jw * 0.4 + ngram * 0.3 + levSim * 0.3;
  }

  if (fuzzyScore >= fuzzyThreshold) {
    return { matched: true, score: fuzzyScore * 0.75, matchType: 'fuzzy' };
  }

  return { matched: false, score: 0, matchType: 'none' };
}

// ============ HAUPT-SUCHFUNKTION ============

export interface FuzzySearchResult<T> {
  item: T;
  score: number;
  matchDetails: {
    matchedFields: string[];
    matchTypes: string[];
  };
}

export interface FuzzySearchOptions {
  /** Minimaler Score für einen Match (0-1) */
  minScore?: number;
  /** Fuzzy-Threshold für Wort-Matching (0-1) */
  fuzzyThreshold?: number;
  /** Maximale Anzahl Ergebnisse */
  maxResults?: number;
  /** Alle Suchwörter müssen matchen (AND) vs mindestens eines (OR) */
  matchAll?: boolean;
}

/**
 * Durchsucht eine Liste von Items nach einem Suchtext
 *
 * @param items - Die zu durchsuchenden Items
 * @param searchText - Der Suchtext
 * @param getSearchableFields - Funktion die die durchsuchbaren Felder eines Items zurückgibt
 * @param options - Suchoptionen
 */
export function fuzzySearch<T>(
  items: T[],
  searchText: string,
  getSearchableFields: (item: T) => { field: string; value: string; weight?: number }[],
  options: FuzzySearchOptions = {}
): FuzzySearchResult<T>[] {
  const {
    minScore = 0.3,
    fuzzyThreshold = 0.65,
    maxResults = 100,
    matchAll = true,
  } = options;

  // Leerer Suchtext → alle Items zurückgeben
  if (!searchText.trim()) {
    return items.map(item => ({
      item,
      score: 1,
      matchDetails: { matchedFields: [], matchTypes: [] },
    }));
  }

  const searchWords = extractWords(searchText);

  if (searchWords.length === 0) {
    return items.map(item => ({
      item,
      score: 1,
      matchDetails: { matchedFields: [], matchTypes: [] },
    }));
  }

  const results: FuzzySearchResult<T>[] = [];

  for (const item of items) {
    const fields = getSearchableFields(item);
    let totalScore = 0;
    const matchedFields: string[] = [];
    const matchTypes: string[] = [];
    const wordMatches = new Map<string, number>(); // Bester Score pro Suchwort

    for (const { field, value, weight = 1 } of fields) {
      if (!value) continue;

      const targetWords = extractWords(value);

      for (const searchWord of searchWords) {
        let bestMatchForWord = wordMatches.get(searchWord) || 0;

        for (const targetWord of targetWords) {
          const result = matchWord(searchWord, targetWord, fuzzyThreshold);

          if (result.matched) {
            const weightedScore = result.score * weight;

            if (weightedScore > bestMatchForWord) {
              bestMatchForWord = weightedScore;
              wordMatches.set(searchWord, bestMatchForWord);

              if (!matchedFields.includes(field)) {
                matchedFields.push(field);
              }
              if (!matchTypes.includes(result.matchType)) {
                matchTypes.push(result.matchType);
              }
            }
          }
        }

        // Prüfe auch ob der gesamte Suchtext als Substring im Feld vorkommt
        const normalizedValue = normalizeText(value);
        const normalizedSearch = normalizeText(searchText);
        if (normalizedValue.includes(normalizedSearch)) {
          const substringScore = 0.95 * weight;
          if (substringScore > (wordMatches.get(searchWord) || 0)) {
            wordMatches.set(searchWord, substringScore);
            if (!matchedFields.includes(field)) {
              matchedFields.push(field);
            }
            if (!matchTypes.includes('substring')) {
              matchTypes.push('substring');
            }
          }
        }
      }
    }

    // Berechne Gesamtscore
    if (matchAll) {
      // Alle Wörter müssen matchen
      if (wordMatches.size < searchWords.length) {
        continue; // Nicht alle Suchwörter gefunden
      }
      // Score ist der Durchschnitt aller Wort-Scores
      wordMatches.forEach(score => {
        totalScore += score;
      });
      totalScore /= searchWords.length;
    } else {
      // Mindestens ein Wort muss matchen
      if (wordMatches.size === 0) {
        continue;
      }
      // Score ist der Durchschnitt der gefundenen Wörter, gewichtet nach Abdeckung
      let sumScores = 0;
      wordMatches.forEach(score => {
        sumScores += score;
      });
      const coverage = wordMatches.size / searchWords.length;
      totalScore = (sumScores / wordMatches.size) * (0.5 + 0.5 * coverage);
    }

    // Bonus für mehr gematchte Felder
    const fieldBonus = Math.min(matchedFields.length * 0.02, 0.1);
    totalScore = Math.min(totalScore + fieldBonus, 1);

    if (totalScore >= minScore) {
      results.push({
        item,
        score: totalScore,
        matchDetails: { matchedFields, matchTypes },
      });
    }
  }

  // Sortiere nach Score (absteigend)
  results.sort((a, b) => b.score - a.score);

  // Begrenze Ergebnisse
  return results.slice(0, maxResults);
}

// ============ CONVENIENCE FUNKTIONEN ============

/**
 * Einfache String-Ähnlichkeit (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  // Kombiniere mehrere Metriken
  const jw = jaroWinklerSimilarity(normA, normB);
  const ngram = ngramSimilarity(normA, normB, 2);

  const maxLen = Math.max(normA.length, normB.length);
  const levDist = levenshteinDistance(normA, normB);
  const levSim = 1 - levDist / maxLen;

  return jw * 0.4 + ngram * 0.3 + levSim * 0.3;
}

/**
 * Prüft ob ein Suchtext in einem Zieltext "gefunden" wird (fuzzy)
 */
export function fuzzyMatch(searchText: string, targetText: string, threshold: number = 0.5): boolean {
  const searchWords = extractWords(searchText);
  const targetWords = extractWords(targetText);

  if (searchWords.length === 0) return true;

  let matchedWords = 0;
  for (const searchWord of searchWords) {
    for (const targetWord of targetWords) {
      const result = matchWord(searchWord, targetWord, threshold);
      if (result.matched) {
        matchedWords++;
        break;
      }
    }
  }

  return matchedWords === searchWords.length;
}

/**
 * Highlightet Matches in einem Text (für UI)
 */
export function highlightMatches(text: string, searchText: string): string {
  if (!searchText.trim()) return text;

  const searchWords = extractWords(searchText);
  let result = text;

  for (const searchWord of searchWords) {
    // Case-insensitive Ersetzung
    const regex = new RegExp(`(${escapeRegExp(searchWord)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default fuzzySearch;
