/**
 * Netlify Function für Mosaik-Migrations-Matching.
 *
 * Ruft Claude direkt auf, weil das ursprüngliche VPS-Backend
 * (76.13.5.157:3000/api/ai/chat) das `model`-Feld ignoriert und ein
 * deprecated Modell hartcodiert hat → 404 von Anthropic, 500 zu uns.
 *
 * Eingabe (POST-Body):
 *   {
 *     "mosaik":         { kurzname, name, ort, plz, strasse, gruppe },
 *     "crm_kandidaten": [{ id, name, ort, plz, strasse }, ...]
 *   }
 *
 * Ausgabe (200 JSON):
 *   { "entscheidung": "match"|"kein_match",
 *     "kandidat_id":  "id_or_null",
 *     "konfidenz":    0.0..1.0,
 *     "begruendung":  "string" }
 *
 * API-Key kommt aus Netlify-Env. Akzeptiert `ANTHROPIC_API_KEY` oder
 * fällt auf `VITE_ANTHROPIC_API_KEY` zurück (Konsistenz mit Legacy).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 500;

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

interface MosaikIn {
  kurzname: string;
  name: string;
  ort: string;
  plz: string;
  strasse: string;
  gruppe: string;
}

interface CrmKandidatIn {
  id: string;
  name: string;
  ort: string;
  plz: string;
  strasse: string;
}

interface RequestBody {
  mosaik: MosaikIn;
  crm_kandidaten: CrmKandidatIn[];
}

function jsonResponse(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseAntwort(text: string): unknown {
  let kandidat = text.trim();
  const codeMatch = kandidat.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) kandidat = codeMatch[1].trim();
  const ersteOeffnend = kandidat.indexOf('{');
  const letzteSchliessend = kandidat.lastIndexOf('}');
  if (ersteOeffnend < 0 || letzteSchliessend < 0) {
    throw new Error(`Keine JSON-Antwort im Modell-Output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(kandidat.slice(ersteOeffnend, letzteSchliessend + 1));
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: 'ANTHROPIC_API_KEY (oder VITE_ANTHROPIC_API_KEY) ist in Netlify nicht gesetzt.',
    });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body || '{}') as RequestBody;
  } catch {
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' });
  }
  if (!body.mosaik || !Array.isArray(body.crm_kandidaten)) {
    return jsonResponse(400, {
      error: 'Body muss { mosaik, crm_kandidaten[] } enthalten.',
    });
  }

  const userPayload = {
    mosaik: body.mosaik,
    crm_kandidaten: body.crm_kandidaten.slice(0, 3),
  };

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: JSON.stringify(userPayload, null, 2) },
        ],
      }),
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: 'Netzwerkfehler zu Anthropic', meldung });
  }

  if (!claudeResponse.ok) {
    const text = await claudeResponse.text();
    return jsonResponse(claudeResponse.status === 429 ? 429 : 502, {
      error: 'Anthropic-API-Fehler',
      status: claudeResponse.status,
      body: text.slice(0, 500),
    });
  }

  let antwort: unknown;
  try {
    antwort = await claudeResponse.json();
  } catch {
    return jsonResponse(502, { error: 'Antwort konnte nicht als JSON gelesen werden' });
  }

  // Extrahiere Text aus Claude-Content
  const content = (antwort as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const text = content
    .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
    .join('')
    .trim();
  if (!text) {
    return jsonResponse(502, { error: 'Leere Claude-Antwort', raw: antwort });
  }

  let parsed: unknown;
  try {
    parsed = parseAntwort(text);
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: 'Antwort nicht parsbar', meldung, raw: text });
  }

  return jsonResponse(200, parsed);
};
