/**
 * Claude-gestütztes Matching für den Mosaik-Migrations-Graubereich.
 *
 * Strikt nur für unklare Fälle (Score 0.55–0.85 nach Fuzzy). Aufruf läuft
 * ausschließlich über das Backend (`POST /api/ai/chat`) — der API-Key bleibt
 * server-seitig.
 *
 * Modell: claude-haiku-4-5-20251001 (schnell, günstig, ausreichend für
 * strukturierte Ja/Nein-Entscheidungen mit Begründung).
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

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
}

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

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

/**
 * Sehr defensive JSON-Extraktion — falls Claude doch Codeblöcke um die
 * Antwort wirft, ziehen wir das größte JSON-Objekt heraus.
 */
function parseAntwort(text: string): KiMatchAntwort {
  let kandidat = text.trim();
  // Codeblock entfernen
  const codeMatch = kandidat.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) kandidat = codeMatch[1].trim();
  // Erste { bis letztes } extrahieren
  const ersteOeffnend = kandidat.indexOf('{');
  const letzteSchliessend = kandidat.lastIndexOf('}');
  if (ersteOeffnend < 0 || letzteSchliessend < 0) {
    throw new Error(`Keine JSON-Antwort gefunden in: ${text.slice(0, 200)}`);
  }
  const json = kandidat.slice(ersteOeffnend, letzteSchliessend + 1);
  const parsed = JSON.parse(json) as Partial<KiMatchAntwort>;
  if (
    parsed.entscheidung !== 'match' &&
    parsed.entscheidung !== 'kein_match'
  ) {
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

export const claudeMosaikMatchService = {
  /**
   * Fragt Claude, ob einer der CRM-Kandidaten derselbe Kunde ist wie der
   * Mosaik-Eintrag. Strikt JSON, kein freier Text.
   */
  async entscheide(
    mosaik: MosaikKunde,
    crmKandidaten: SaisonKunde[]
  ): Promise<KiMatchAntwort> {
    if (!useBackend('claude')) {
      throw new Error(
        'Claude-Backend nicht aktiviert (VITE_BACKEND_CLAUDE=true) — KI-Matching nicht erlaubt'
      );
    }
    if (crmKandidaten.length === 0) {
      return {
        entscheidung: 'kein_match',
        kandidat_id: null,
        konfidenz: 1,
        begruendung: 'Keine CRM-Kandidaten zum Vergleich übergeben.',
      };
    }

    const userPayload = {
      mosaik: kurzMosaik(mosaik),
      crm_kandidaten: crmKandidaten.slice(0, 3).map(kurzCrm),
    };

    const response = await backendFetch<ClaudeResponse>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(userPayload, null, 2),
          },
        ],
        model: MODEL,
        max_tokens: MAX_TOKENS,
      }),
    });

    const text = response.content
      .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
      .join('')
      .trim();
    if (!text) throw new Error('Leere Claude-Antwort');
    return parseAntwort(text);
  },
};
