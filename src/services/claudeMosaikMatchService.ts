/**
 * Claude-gestütztes Matching für den Mosaik-Migrations-Graubereich.
 *
 * Ruft die dedizierte Netlify Function `/.netlify/functions/ai-mosaik-match`
 * auf — dort liegt der Anthropic-API-Key, dort wird das aktuelle Modell
 * (Sonnet 4.6) verwendet. Das alte VPS-Backend (`/api/ai/chat`) wird hier
 * NICHT genutzt, weil es das `model`-Feld ignoriert und ein deprecated
 * Modell verwendet.
 */

import { MosaikKunde } from '../types/mosaik';
import { SaisonKunde } from '../types/saisonplanung';

export type KiEntscheidung = 'match' | 'kein_match';

export interface KiMatchAntwort {
  entscheidung: KiEntscheidung;
  kandidat_id: string | null;
  konfidenz: number;
  begruendung: string;
}

const ENDPOINT = '/.netlify/functions/ai-mosaik-match';
const TIMEOUT_MS = 30_000;

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

function validiereAntwort(parsed: unknown): KiMatchAntwort {
  const p = parsed as Partial<KiMatchAntwort> | null;
  if (!p || (p.entscheidung !== 'match' && p.entscheidung !== 'kein_match')) {
    throw new Error(`Ungültige Entscheidung: ${p?.entscheidung}`);
  }
  const konfidenz = Number(p.konfidenz);
  if (Number.isNaN(konfidenz) || konfidenz < 0 || konfidenz > 1) {
    throw new Error(`Ungültige Konfidenz: ${p.konfidenz}`);
  }
  return {
    entscheidung: p.entscheidung,
    kandidat_id:
      p.entscheidung === 'match' ? String(p.kandidat_id ?? '') || null : null,
    konfidenz,
    begruendung: String(p.begruendung ?? ''),
  };
}

export const claudeMosaikMatchService = {
  /**
   * Fragt Claude (via Netlify-Function), ob einer der CRM-Kandidaten
   * derselbe Kunde ist wie der Mosaik-Eintrag.
   *
   * Wirft bei Server-/Netzwerk-/Parse-Fehler — der Pipeline-Orchestrator
   * fängt das ab und schickt den Kandidaten in die Review-Queue.
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mosaik: kurzMosaik(mosaik),
          crm_kandidaten: crmKandidaten.slice(0, 3).map(kurzCrm),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const meldung = await response.text().catch(() => response.statusText);
      // 429 vom Backend (z.B. Anthropic-Rate-Limit) → wiederholbar machen
      const error = new Error(
        `KI-Function ${response.status}: ${meldung.slice(0, 200)}`
      );
      if (response.status === 429) {
        // Markiere mit '429' im Message, damit unser rateLimiter Backoff macht
        throw new Error(`429 ${error.message}`);
      }
      throw error;
    }

    const parsed = await response.json();
    return validiereAntwort(parsed);
  },
};
