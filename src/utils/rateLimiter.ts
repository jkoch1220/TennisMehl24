/**
 * Rate-Limit-aware Batch-Runner.
 *
 * Verwendet für Operationen gegen Appwrite Cloud (~240 schreibende Requests
 * pro Minute pro IP). Wir bleiben großzügig unter dem Limit:
 *   - max. 5 parallel
 *   - max. 1 Batch pro 250 ms (= ~1 200 Ops/min Theoretisch, real ~1 000)
 *   - 429-Antworten triggern Exponential Backoff (1 s, 2 s, 4 s, max 3 Retries)
 *
 * Die Funktion ist generisch — sie reicht nur den Wert/Index durch und ist
 * unabhängig von Appwrite.
 */

export interface RunBatchedOptions<T, R> {
  /** Eingaben in der Reihenfolge, in der sie abgearbeitet werden sollen */
  items: T[];
  /** Operation pro Item — soll bei 429/503 throw'en, der Runner kümmert sich um Retry */
  operation: (item: T, index: number) => Promise<R>;
  /** Wie viele parallele Aufrufe pro Welle (default 5) */
  concurrency?: number;
  /** Pause zwischen den Wellen in Millisekunden (default 250) */
  paceMs?: number;
  /** Max. Retries pro Item (default 3) */
  maxRetries?: number;
  /** Callback nach jedem fertigen Item — für UI-Progress */
  onProgress?: (verarbeitet: number, gesamt: number, letzteFehler: number) => void;
}

export interface BatchErgebnis<R> {
  index: number;
  ok: boolean;
  ergebnis?: R;
  fehler?: string;
  versuche: number;
}

/**
 * Heuristik: ist das ein wiederholbarer Fehler (Rate-Limit, kurzfristige
 * Server-Indisposition)? Wenn ja → Retry. Wenn nein (z.B. 400, 409 unique)
 * → sofort als fehlgeschlagen markieren.
 */
function istWiederholbar(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  // Appwrite-SDK wirft Error mit Status im Text, z.B.
  // "general_rate_limit_exceeded ... 429"
  if (msg.includes('429') || /rate.?limit/i.test(msg)) return true;
  if (msg.includes('503') || msg.includes('502') || msg.includes('504')) return true;
  if (/timeout/i.test(msg) || /ETIMEDOUT/.test(msg) || /ECONNRESET/.test(msg)) return true;
  return false;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBatched<T, R>(
  options: RunBatchedOptions<T, R>
): Promise<BatchErgebnis<R>[]> {
  const {
    items,
    operation,
    concurrency = 5,
    paceMs = 250,
    maxRetries = 3,
    onProgress,
  } = options;

  const ergebnisse: BatchErgebnis<R>[] = new Array(items.length);
  let fertig = 0;
  let fehlerGesamt = 0;

  async function bearbeiteEines(item: T, index: number): Promise<void> {
    let versuche = 0;
    let letzterFehler: unknown = null;
    while (versuche <= maxRetries) {
      try {
        const r = await operation(item, index);
        ergebnisse[index] = { index, ok: true, ergebnis: r, versuche: versuche + 1 };
        return;
      } catch (e) {
        letzterFehler = e;
        versuche++;
        if (!istWiederholbar(e) || versuche > maxRetries) break;
        // 1 s, 2 s, 4 s + leichter Jitter
        const backoff = Math.pow(2, versuche - 1) * 1000 + Math.random() * 200;
        await pause(backoff);
      }
    }
    const msg = letzterFehler instanceof Error ? letzterFehler.message : String(letzterFehler);
    ergebnisse[index] = { index, ok: false, fehler: msg, versuche };
    fehlerGesamt++;
  }

  for (let start = 0; start < items.length; start += concurrency) {
    const slice = items.slice(start, start + concurrency);
    const aufgaben = slice.map((item, j) => bearbeiteEines(item, start + j));
    await Promise.all(aufgaben);
    fertig += slice.length;
    onProgress?.(fertig, items.length, fehlerGesamt);
    if (start + concurrency < items.length) await pause(paceMs);
  }

  return ergebnisse;
}
