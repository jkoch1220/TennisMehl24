/**
 * Claude AI Service
 *
 * Kommunikation mit der Anthropic Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

// Types
interface TourAdresse {
  strasse: string;
  plz: string;
  ort: string;
}

interface ProjektFuerOptimierung {
  id: string;
  kundenname: string;
  adresse: TourAdresse;
  tonnen: number;
  paletten?: number;
  belieferungsart: string;
  lieferKW?: number;
  lieferdatumTyp?: string;
  zeitfenster?: { von: string; bis: string };
  wichtigeHinweise?: string[];
}

interface FahrzeugFuerOptimierung {
  id: string;
  kennzeichen: string;
  typ: string;
  kapazitaetTonnen: number;
  fahrerName?: string;
}

interface ClaudeOptimierungRequest {
  projekte: ProjektFuerOptimierung[];
  fahrzeuge: FahrzeugFuerOptimierung[];
  startAdresse: TourAdresse;
  startZeit: string;
  einschraenkungen: {
    maxArbeitszeitMinuten: number;
    pausenregelMinuten: number;
    respektiereZeitfenster: boolean;
    respektiereKWDeadlines: boolean;
    aktuelleKW?: number;
  };
}

interface OptimierteRoute {
  fahrzeugTyp: string;
  fahrzeugId?: string;
  stopReihenfolge: string[];
  begruendung: string;
  geschaetzteTonnen: number;
  kapazitaetMaximal: number;
  geschaetzteDistanzKm?: number;
}

interface ClaudeOptimierungResponse {
  touren: OptimierteRoute[];
  warnungen: string[];
  nichtFuerHeute: string[];
  empfehlung?: string;
}

// Anthropic Client
const anthropic = config.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  : null;

// System-Prompt für Routenoptimierung
const ROUTE_OPTIMIZATION_SYSTEM_PROMPT = `Du bist der Dispo-Chef für TennisMehl24, ein Unternehmen das Ziegelmehl (Tennisplatzsand) an Tennisvereine in Deutschland liefert.

DEINE AUFGABE:
Analysiere ALLE offenen Lieferungen und erstelle die OPTIMALEN Touren für die Auslieferung.

FAHRZEUGE UND KAPAZITÄTEN:
- MOTORWAGEN (LKW ohne Hänger): Max. 18 Tonnen
- MIT HÄNGER (LKW + Anhänger): Max. 28 Tonnen (18t LKW + 10t Hänger)

KRITISCHE REGEL - BELIEFERUNGSART:
- "nur_motorwagen": NUR mit dem Motorwagen (ohne Hänger) beliefern!
- "mit_haenger": Kann mit Hänger beliefert werden

PRIORISIERUNG:
1. KW-DEADLINES: Lieferungen mit "spaetestens_kw" haben VORRANG
2. ZEITFENSTER: Respektiere Kundenzeitfenster
3. GEOGRAFIE: Kombiniere geografisch nahe Lieferungen
4. AUSLASTUNG: Versuche Fahrzeuge gut auszulasten (>70%)

AUSGABEFORMAT - NUR VALIDES JSON:
{
  "touren": [
    {
      "fahrzeugTyp": "motorwagen" oder "mit_haenger",
      "stopReihenfolge": ["projekt_id_1", "projekt_id_2"],
      "begruendung": "Kurze Erklärung",
      "geschaetzteTonnen": 15.5,
      "kapazitaetMaximal": 18
    }
  ],
  "nichtFuerHeute": ["projekt_id_x"],
  "warnungen": ["Hinweis 1"],
  "empfehlung": "Gesamtempfehlung"
}`;

// Aktuelle Kalenderwoche berechnen
function getAktuelleKW(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil(diff / oneWeek + 1);
}

// Formatiere Projekte für den Prompt
function formatiereProjekte(projekte: ProjektFuerOptimierung[]): string {
  return projekte
    .map((p, i) => {
      const zeitfenster = p.zeitfenster
        ? `Zeitfenster: ${p.zeitfenster.von} - ${p.zeitfenster.bis}`
        : 'Zeitfenster: flexibel';

      return `${i + 1}. ${p.kundenname} (ID: ${p.id})
   Adresse: ${p.adresse.strasse}, ${p.adresse.plz} ${p.adresse.ort}
   Menge: ${p.tonnen}t
   Belieferungsart: ${p.belieferungsart}
   ${zeitfenster}`;
    })
    .join('\n\n');
}

// Parse Claude's JSON Response
function parseClaudeResponse(text: string): ClaudeOptimierungResponse {
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.slice(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.slice(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.slice(0, -3);
  }
  cleanText = cleanText.trim();

  const parsed = JSON.parse(cleanText);

  return {
    touren: parsed.touren || [],
    warnungen: parsed.warnungen || [],
    nichtFuerHeute: parsed.nichtFuerHeute || [],
    empfehlung: parsed.empfehlung,
  };
}

export const claudeService = {
  /**
   * Optimiert Liefertouren mit Claude AI
   */
  async optimizeRoute(
    request: ClaudeOptimierungRequest
  ): Promise<ClaudeOptimierungResponse> {
    if (!anthropic) {
      throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
    }

    logger.info('Claude: Starte Routenoptimierung...');

    // Filtere Abholungen raus
    const lieferProjekte = request.projekte.filter(
      (p) => p.belieferungsart !== 'abholung_ab_werk'
    );
    const abholProjekte = request.projekte.filter(
      (p) => p.belieferungsart === 'abholung_ab_werk'
    );

    if (lieferProjekte.length === 0) {
      return {
        touren: [],
        warnungen: ['Keine Lieferungen vorhanden (nur Abholungen)'],
        nichtFuerHeute: abholProjekte.map((p) => p.id),
        empfehlung: 'Alle Projekte sind Abholungen ab Werk.',
      };
    }

    const aktuelleKW = request.einschraenkungen.aktuelleKW || getAktuelleKW();

    const userPrompt = `TOURENPLANUNG
Aktuelle KW: ${aktuelleKW}

LIEFERUNGEN (${lieferProjekte.length}):
${formatiereProjekte(lieferProjekte)}

FAHRZEUGE (${request.fahrzeuge.length}):
${request.fahrzeuge.map((f) => `- ${f.kennzeichen} (${f.typ}, ${f.kapazitaetTonnen}t)`).join('\n')}

Erstelle optimale Touren.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: ROUTE_OPTIMIZATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Keine Textantwort von Claude');
    }

    const result = parseClaudeResponse(textContent.text);

    // Füge Abholprojekte hinzu
    if (abholProjekte.length > 0) {
      result.nichtFuerHeute.push(...abholProjekte.map((p) => p.id));
      result.warnungen.push(
        `${abholProjekte.length} Projekt(e) sind Abholungen ab Werk.`
      );
    }

    logger.info(`Claude: ${result.touren.length} Touren erstellt`);

    return result;
  },

  /**
   * Parst E-Mail-Anfragen mit Claude AI
   */
  async parseInquiry(
    emailContent: string,
    emailSubject?: string
  ): Promise<Record<string, unknown>> {
    if (!anthropic) {
      throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
    }

    const systemPrompt = `Du bist ein Assistent der E-Mail-Anfragen für Ziegelmehl (Tennisplatzsand) analysiert.
Extrahiere folgende Informationen als JSON:
- kundenname: Name des Vereins/Kunden
- ansprechpartner: Kontaktperson
- email: E-Mail-Adresse
- telefon: Telefonnummer
- adresse: { strasse, plz, ort }
- menge: Gewünschte Menge in Tonnen
- lieferwunsch: Gewünschter Liefertermin
- bemerkungen: Zusätzliche Hinweise

Antworte NUR mit validem JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Betreff: ${emailSubject || 'Anfrage'}\n\n${emailContent}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Keine Textantwort von Claude');
    }

    let cleanText = textContent.text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }

    return JSON.parse(cleanText.trim());
  },

  /**
   * Prüft ob Claude API verfügbar ist
   */
  isAvailable(): boolean {
    return !!anthropic;
  },
};

export default claudeService;
