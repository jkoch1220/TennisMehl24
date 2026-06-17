/**
 * Claude-gestütztes Matching für den Mosaik-Migrations-Graubereich.
 *
 * Primär: `/api/ai/chat` (VPS-Backend) — der Anthropic-Key liegt dort
 * server-seitig. Das Backend wurde am 2026-06-17 gefixt, sodass es das
 * `model`-Feld vom Client respektiert (vorher hartcodiert auf das
 * deprecated `claude-sonnet-4-20250514`).
 *
 * Fallback: `/.netlify/functions/ai-mosaik-match` — eigene Netlify-Function
 * für den Fall, dass das VPS-Backend wieder ausfällt. Braucht
 * `ANTHROPIC_API_KEY` in der Netlify-Env.
 *
 * Modell: claude-haiku-4-5-20251001 — Haiku 4.5 ist ~6× günstiger als
 * Sonnet 4.6 und für strukturierte Ja/Nein-Entscheidungen mit Begründung
 * ausreichend (~0,40 € statt ~1,20 € pro 300-Aufrufe-Lauf).
 */

import { useBackend, backendFetch } from '../config/backend';
import { MosaikKunde } from '../types/mosaik';
import { SaisonKunde } from '../types/saisonplanung';

export type KiEntscheidung = 'match' | 'kein_match';

export interface KiMatchAntwort {
  entscheidung: KiEntscheidung;
  kandidat_id: string | null;
  konfidenz: number;
  begruendung: string;
}

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;
const FALLBACK_ENDPOINT = '/.netlify/functions/ai-mosaik-match';
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `Du bist ein Datenmigrations-Assistent für eine deutsche Tennisplatz-Material-Firma.
Du bekommst genau einen Mosaik-Kunden (aus altem ERP) und bis zu drei CRM-Kandidaten (aus neuem System).
Entscheide, ob einer der Kandidaten exakt derselbe Kunde ist wie der Mosaik-Kunde.

Hinweise:
- "TC", "TSV", "TV", "SV", "FC", "e.V.", Jahreszahlen und Rechtsformen sind irrelevant für die Identität.
- Gleicher Vereins-/Firmenname an gleicher PLZ ist ein sicheres Match.
- Unterschiedliche PLZ-Region (erste Ziffer abweichend) UND unterschiedliche Namen = kein Match.
- Schreibvarianten (ß/ss, Bindestrich, Umlaute) sind ok.
- "Tennisclub Blau-Weiß München" und "TC BW München" sind dasselbe.
- "1.FC Nürnberg" und "FC 1. Nürnberg" sind dasselbe.
- Bei mehreren ähnlichen Kandidaten: nimm den mit der höchsten Konfidenz.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau diesem Format:
{"entscheidung":"match"|"kein_match","kandidat_id":string|null,"konfidenz":number_zwischen_0_und_1,"begruendung":string}

Keine Codeblöcke, kein Markdown, kein Text außerhalb des JSON.`;

interface ClaudeBackendResponse {
  // VPS-Backend wrappt die Anthropic-Antwort
  success?: boolean;
  response?: string;
  // Direkter Anthropic-Aufruf (Legacy) liefert content[]
  content?: Array<{ type: string; text?: string }>;
}

interface MosaikKurzform {
  kurzname: string;
  name: string;
  ort: string;
  plz: string;
  strasse: string;
  gruppe: string;
}

interface CrmKurzform {
  id: string;
  name: string;
  ort: string;
  plz: string;
  strasse: string;
}

function kurzMosaik(m: MosaikKunde): MosaikKurzform {
  return {
    kurzname: m.Kurzname,
    name: (m.Name2 || m.Name3 || m.Name1 || m.Kurzname).trim(),
    ort: m.Ort?.trim() ?? '',
    plz: m.PLZ?.trim() ?? '',
    strasse: m.Straße?.trim() ?? '',
    gruppe: m.Gruppe?.trim() ?? '',
  };
}

function kurzCrm(c: SaisonKunde): CrmKurzform {
  return {
    id: c.id,
    name: c.name,
    ort: c.rechnungsadresse?.ort?.trim() ?? '',
    plz: c.rechnungsadresse?.plz?.trim() ?? '',
    strasse: c.rechnungsadresse?.strasse?.trim() ?? '',
  };
}

function parseAntwortText(text: string): KiMatchAntwort {
  let kandidat = text.trim();
  const codeMatch = kandidat.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) kandidat = codeMatch[1].trim();
  const oeff = kandidat.indexOf('{');
  const schliess = kandidat.lastIndexOf('}');
  if (oeff < 0 || schliess < 0) {
    throw new Error(`Keine JSON-Antwort: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(kandidat.slice(oeff, schliess + 1)) as Partial<KiMatchAntwort>;
  if (parsed.entscheidung !== 'match' && parsed.entscheidung !== 'kein_match') {
    throw new Error(`Ungültige Entscheidung: ${parsed.entscheidung}`);
  }
  const konfidenz = Number(parsed.konfidenz);
  if (Number.isNaN(konfidenz) || konfidenz < 0 || konfidenz > 1) {
    throw new Error(`Ungültige Konfidenz: ${parsed.konfidenz}`);
  }
  return {
    entscheidung: parsed.entscheidung,
    kandidat_id:
      parsed.entscheidung === 'match' ? String(parsed.kandidat_id ?? '') || null : null,
    konfidenz,
    begruendung: String(parsed.begruendung ?? ''),
  };
}

function buildPayload(mosaik: MosaikKunde, crmKandidaten: SaisonKunde[]) {
  return {
    mosaik: kurzMosaik(mosaik),
    crm_kandidaten: crmKandidaten.slice(0, 3).map(kurzCrm),
  };
}

async function ueberVpsBackend(
  mosaik: MosaikKunde,
  crmKandidaten: SaisonKunde[]
): Promise<KiMatchAntwort> {
  const userPayload = buildPayload(mosaik, crmKandidaten);
  const response = await backendFetch<ClaudeBackendResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: JSON.stringify(userPayload, null, 2) },
      ],
    }),
  });
  // VPS-Backend wrappt in { success, response }; Fallback auf direkten Content
  const text = response.response
    ?? response.content?.map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('')
    ?? '';
  if (!text) throw new Error('Leere KI-Antwort vom VPS-Backend');
  return parseAntwortText(text);
}

async function ueberNetlifyFunction(
  mosaik: MosaikKunde,
  crmKandidaten: SaisonKunde[]
): Promise<KiMatchAntwort> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(FALLBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(mosaik, crmKandidaten)),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!response.ok) {
    const meldung = await response.text().catch(() => response.statusText);
    const err = new Error(`KI-Function ${response.status}: ${meldung.slice(0, 200)}`);
    if (response.status === 429) throw new Error(`429 ${err.message}`);
    throw err;
  }
  const parsed = (await response.json()) as Partial<KiMatchAntwort>;
  if (parsed.entscheidung !== 'match' && parsed.entscheidung !== 'kein_match') {
    throw new Error(`Function-Antwort ohne Entscheidung: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  return parsed as KiMatchAntwort;
}

export const claudeMosaikMatchService = {
  /**
   * Fragt Claude, ob einer der CRM-Kandidaten derselbe Kunde ist wie der
   * Mosaik-Eintrag. Erst VPS-Backend, bei Ausfall Fallback auf Netlify-Function.
   */
  async entscheide(
    mosaik: MosaikKunde,
    crmKandidaten: SaisonKunde[]
  ): Promise<KiMatchAntwort> {
    if (crmKandidaten.length === 0) {
      return {
        entscheidung: 'kein_match',
        kandidat_id: null,
        konfidenz: 1,
        begruendung: 'Keine CRM-Kandidaten zum Vergleich übergeben.',
      };
    }

    if (useBackend('claude')) {
      try {
        return await ueberVpsBackend(mosaik, crmKandidaten);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Bei 5xx/Netzwerkfehler vom VPS-Backend automatisch auf Netlify-Function
        // ausweichen — robuster Endzustand, falls eine Seite ausfällt.
        if (/^5\d{2}/.test(msg) || /network|fetch|timeout/i.test(msg)) {
          console.warn('[KI-Match] VPS-Backend ausgefallen, nutze Netlify-Function:', msg);
          return await ueberNetlifyFunction(mosaik, crmKandidaten);
        }
        throw e;
      }
    }
    return await ueberNetlifyFunction(mosaik, crmKandidaten);
  },
};
