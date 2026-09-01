/**
 * Claude AI Service für intelligente Anfragen-Verarbeitung
 *
 * Nutzt Claude API um:
 * 1. E-Mail-Inhalte besser zu verstehen und zu parsen
 * 2. Optimale Angebote zu generieren
 * 3. Personalisierte Antwort-E-Mails zu erstellen
 *
 * SECURITY: Wenn Backend aktiviert ist, werden API-Calls über das Backend geroutet.
 * Der API-Key ist dann NICHT mehr im Browser sichtbar!
 */

import { useBackend, backendFetch } from '../config/backend';

// ============================================
// BACKEND-AWARE API HELPER
// ============================================

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
}

/**
 * Ruft Claude API über das Backend auf.
 *
 * SECURITY: Es gibt bewusst keinen Direkt-Aufruf aus dem Browser mehr. Ein solcher
 * Fallback bräuchte den API-Key im Client-Bundle — Vite inlined jede VITE_*-Variable
 * zur Build-Zeit, der Key wäre damit für jeden Portal-Besucher lesbar.
 */
async function callClaudeAPI(request: ClaudeRequest): Promise<ClaudeResponse> {
  if (!useBackend('claude')) {
    throw new Error(
      'Claude AI ist nicht verfügbar: Das Backend ist deaktiviert. ' +
      'Bitte VITE_USE_BACKEND=true und VITE_BACKEND_CLAUDE=true setzen — ' +
      'der API-Key liegt ausschließlich im Backend.'
    );
  }

  console.log('🔒 Claude API über Backend (sicher)...');
  try {
    return await backendFetch<ClaudeResponse>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        system: request.system,
        messages: request.messages,
        model: request.model,
        max_tokens: request.max_tokens,
      }),
    });
  } catch (error) {
    throw new Error(
      `Claude AI nicht erreichbar: Das Backend hat nicht geantwortet (${
        error instanceof Error ? error.message : 'unbekannter Fehler'
      }). Die Anfrage muss manuell bearbeitet werden.`
    );
  }
}

export interface AnfrageKontext {
  emailText: string;
  emailBetreff: string;
  absenderEmail: string;
  absenderName?: string;
  // Bereits extrahierte Daten (falls vorhanden)
  extrahiert?: {
    kundenname?: string;
    ansprechpartner?: string;
    strasse?: string;
    plz?: string;
    ort?: string;
    telefon?: string;
    menge?: number;
    artikel?: string;
    koernung?: string;
    lieferart?: string;
    anzahlPlaetze?: number;
    nachricht?: string;
  };
}

export interface ClaudeAnfrageAnalyse {
  // Extrahierte Kundendaten
  kunde: {
    name: string;
    ansprechpartner?: string;
    email: string;
    telefon?: string;
    adresse: {
      strasse: string;
      plz: string;
      ort: string;
    };
  };
  // Angebotsvorschlag
  angebot: {
    artikel: string;
    menge: number;
    einheit: string;
    koernung?: string;
    lieferart?: 'lose' | 'gesackt';
    empfohlenerPreis?: number;
    preisBegruendung?: string;
    frachtkosten?: number;
    hinweise?: string[];
  };
  // Generierte E-Mail
  email: {
    betreff: string;
    anrede: string;
    einleitung: string;
    hauptteil: string;
    abschluss: string;
    grussformel: string;
    volltext: string;
  };
  // Qualitätsindikatoren
  qualitaet: {
    datenVollstaendigkeit: number; // 0-100
    anfrageTyp: 'webformular' | 'freitext' | 'angebotswunsch' | 'preisanfrage' | 'sonstige';
    prioritaet: 'hoch' | 'mittel' | 'niedrig';
    hinweise: string[];
  };
}

// System-Prompt für Claude - Vertriebsexperte für Tennismehl
const SYSTEM_PROMPT = `Du bist der Vertriebsleiter von TennisMehl24, einem führenden Anbieter von Ziegelmehl (Tennisplatzsand) für Tennisvereine in Deutschland.

DEINE AUFGABE:
Analysiere eingehende Kundenanfragen und erstelle professionelle, personalisierte Angebots-E-Mails.

UNTERNEHMENSINFORMATIONEN:
- Firma: TENNISMEHL GmbH
- Produkt: Ziegelmehl (auch Tennismehl genannt) für Tennisplätze
- Körnung: 0/2 mm (Standard) oder 0/3 mm
- Lieferart: Lose (Kipperfahrzeug) oder gesackt (25kg Säcke auf Paletten)
- Liefergebiet: Ganz Deutschland
- Kontakt: info@tennismehl.com, Tel: 09391 9870-0

PREISRICHTLINIEN (ca. pro Tonne ohne Fracht):
- Standardpreis: 75-90 EUR/t je nach Entfernung
- Mengenrabatt ab 15t: ca. 5% Rabatt
- Mengenrabatt ab 25t: ca. 10% Rabatt
- Gesackte Ware: +15-20 EUR/t Aufpreis
- Fracht: variiert stark nach Entfernung (50-250 EUR pauschal)

TYPISCHE MENGEN PRO TENNISPLATZ:
- 1 Platz: ca. 2-3 Tonnen
- 2 Plätze: ca. 4-6 Tonnen
- 3-4 Plätze: ca. 8-12 Tonnen
- 5+ Plätze: 15+ Tonnen

WICHTIGE REGELN FÜR E-MAILS:
1. Immer höflich und professionell
2. Persönliche Anrede wenn Name bekannt (Sehr geehrter Herr/Frau XY)
3. Auf spezifische Wünsche eingehen (Liefertermin, Menge, etc.)
4. Bei unklaren Angaben: Nachfragen einbauen
5. Immer mit konkretem nächsten Schritt enden
6. Keine Emojis verwenden
7. Freibleibend-Hinweis im Angebot

AUSGABEFORMAT - NUR VALIDES JSON:
{
  "kunde": {
    "name": "Vereinsname oder Kundenname",
    "ansprechpartner": "Vor- und Nachname falls erkennbar",
    "email": "E-Mail-Adresse",
    "telefon": "Telefonnummer falls vorhanden",
    "adresse": {
      "strasse": "Straße und Hausnummer",
      "plz": "PLZ",
      "ort": "Ort"
    }
  },
  "angebot": {
    "artikel": "Tennismehl 0/2 mm",
    "menge": 10,
    "einheit": "t",
    "koernung": "0/2",
    "lieferart": "lose",
    "empfohlenerPreis": 85,
    "preisBegruendung": "Standardpreis für mittlere Entfernung",
    "frachtkosten": 150,
    "hinweise": ["Hinweis 1", "Hinweis 2"]
  },
  "email": {
    "betreff": "Ihr Angebot für Tennismehl - [Vereinsname]",
    "anrede": "Sehr geehrter Herr Müller",
    "einleitung": "vielen Dank für Ihre Anfrage...",
    "hauptteil": "Gerne unterbreiten wir Ihnen...",
    "abschluss": "Bei Fragen stehen wir...",
    "grussformel": "Mit freundlichen Grüßen",
    "volltext": "Der komplette E-Mail-Text OHNE Grußformel und OHNE Signatur — beide hängt das Portal beim Versand automatisch an; der Text endet mit dem Abschluss-Satz"
  },
  "qualitaet": {
    "datenVollstaendigkeit": 85,
    "anfrageTyp": "webformular",
    "prioritaet": "mittel",
    "hinweise": ["Telefonnummer fehlt", "Liefertermin nicht angegeben"]
  }
}`;

// Parse Claude's JSON Response
function parseClaudeResponse(text: string): ClaudeAnfrageAnalyse {
  // Entferne eventuelle Markdown-Code-Blöcke
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

  try {
    const parsed = JSON.parse(cleanText);

    return {
      kunde: {
        name: parsed.kunde?.name || 'Unbekannt',
        ansprechpartner: parsed.kunde?.ansprechpartner,
        email: parsed.kunde?.email || '',
        telefon: parsed.kunde?.telefon,
        adresse: {
          strasse: parsed.kunde?.adresse?.strasse || '',
          plz: parsed.kunde?.adresse?.plz || '',
          ort: parsed.kunde?.adresse?.ort || '',
        },
      },
      angebot: {
        artikel: parsed.angebot?.artikel || 'Tennismehl 0/2 mm',
        menge: parsed.angebot?.menge || 0,
        einheit: parsed.angebot?.einheit || 't',
        koernung: parsed.angebot?.koernung,
        lieferart: parsed.angebot?.lieferart,
        empfohlenerPreis: parsed.angebot?.empfohlenerPreis,
        preisBegruendung: parsed.angebot?.preisBegruendung,
        frachtkosten: parsed.angebot?.frachtkosten,
        hinweise: parsed.angebot?.hinweise || [],
      },
      email: {
        betreff: parsed.email?.betreff || '',
        anrede: parsed.email?.anrede || 'Sehr geehrte Damen und Herren',
        einleitung: parsed.email?.einleitung || '',
        hauptteil: parsed.email?.hauptteil || '',
        abschluss: parsed.email?.abschluss || '',
        grussformel: parsed.email?.grussformel || 'Mit freundlichen Grüßen',
        volltext: parsed.email?.volltext || '',
      },
      qualitaet: {
        datenVollstaendigkeit: parsed.qualitaet?.datenVollstaendigkeit || 0,
        anfrageTyp: parsed.qualitaet?.anfrageTyp || 'sonstige',
        prioritaet: parsed.qualitaet?.prioritaet || 'mittel',
        hinweise: parsed.qualitaet?.hinweise || [],
      },
    };
  } catch (error) {
    console.error('Fehler beim Parsen der Claude-Antwort:', error);
    console.error('Rohtext:', text);
    throw new Error(`Claude-Antwort konnte nicht geparst werden: ${error}`);
  }
}

// Erstelle den User-Prompt
function erstelleUserPrompt(kontext: AnfrageKontext): string {
  let prompt = `KUNDENANFRAGE ANALYSIEREN

E-MAIL BETREFF: ${kontext.emailBetreff}
ABSENDER: ${kontext.absenderName || 'Unbekannt'} <${kontext.absenderEmail}>

E-MAIL TEXT:
---
${kontext.emailText}
---
`;

  if (kontext.extrahiert) {
    prompt += `
BEREITS EXTRAHIERTE DATEN (zur Referenz):
- Kundenname: ${kontext.extrahiert.kundenname || 'nicht erkannt'}
- Ansprechpartner: ${kontext.extrahiert.ansprechpartner || 'nicht erkannt'}
- Adresse: ${kontext.extrahiert.strasse || '?'}, ${kontext.extrahiert.plz || '?'} ${kontext.extrahiert.ort || '?'}
- Telefon: ${kontext.extrahiert.telefon || 'nicht angegeben'}
- Menge: ${kontext.extrahiert.menge || 'nicht angegeben'} Tonnen
- Artikel: ${kontext.extrahiert.artikel || 'nicht spezifiziert'}
- Körnung: ${kontext.extrahiert.koernung || 'nicht spezifiziert'}
- Lieferart: ${kontext.extrahiert.lieferart || 'nicht spezifiziert'}
- Anzahl Plätze: ${kontext.extrahiert.anzahlPlaetze || 'nicht angegeben'}
`;
  }

  prompt += `
AUFGABE:
1. Extrahiere alle Kundendaten präzise aus dem E-Mail-Text
2. Schlage einen passenden Preis vor basierend auf Menge und geschätzter Entfernung (PLZ)
3. Erstelle eine professionelle, personalisierte Antwort-E-Mail
4. Bewerte die Qualität und Vollständigkeit der Anfrage

Bitte antworte NUR mit dem JSON-Objekt im spezifizierten Format.`;

  return prompt;
}

// Interface für robustes Daten-Parsing
export interface RobustExtrahierteDaten {
  vorname?: string;
  nachname?: string;
  vereinsname?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  email?: string;
  telefon?: string;
  tonnenLose02?: number;
  tonnenGesackt02?: number;
  tonnenLose03?: number;
  tonnenGesackt03?: number;
  anzahlPlaetze?: number;
  nachricht?: string;
  // Qualitätsindikatoren
  konfidenz: number;
  warnungen: string[];
}

// Prompt für robustes Daten-Parsing
const ROBUST_PARSING_PROMPT = `Du bist ein präziser Datenextraktions-Assistent. Deine Aufgabe ist es, strukturierte Kontakt- und Bestelldaten aus E-Mail-Formularen zu extrahieren.

WICHTIGE REGELN:
1. Extrahiere NUR tatsächlich vorhandene Daten - NIEMALS erfinden oder raten!
2. Validiere alle Werte streng:
   - E-Mail: Muss gültiges Format haben (name@domain.tld)
   - Telefon: Nur Ziffern, +, -, Leerzeichen, Klammern (min. 5 Ziffern)
   - PLZ: Genau 5 Ziffern (deutsche PLZ)
   - Mengen: Nur positive Zahlen
3. Wenn ein Feld leer oder nicht vorhanden ist, setze es auf null
4. Wenn ein Wert verdächtig aussieht (z.B. enthält ":" oder sieht aus wie ein Feldname), setze es auf null und füge eine Warnung hinzu

AUSGABEFORMAT - NUR VALIDES JSON:
{
  "vorname": "string oder null",
  "nachname": "string oder null",
  "vereinsname": "string oder null (Name des Tennisvereins/Clubs)",
  "strasse": "string oder null",
  "plz": "5-stellige Zahl als string oder null",
  "ort": "string oder null",
  "email": "gültige E-Mail oder null",
  "telefon": "Telefonnummer oder null",
  "tonnenLose02": "Zahl oder null (Tonnen 0-2mm lose)",
  "tonnenGesackt02": "Zahl oder null (Tonnen 0-2mm gesackt)",
  "tonnenLose03": "Zahl oder null (Tonnen 0-3mm lose)",
  "tonnenGesackt03": "Zahl oder null (Tonnen 0-3mm gesackt)",
  "anzahlPlaetze": "Zahl oder null (Anzahl Tennisplätze)",
  "nachricht": "Freitext-Nachricht des Kunden oder null",
  "konfidenz": "0-100 (wie sicher bist du bei der Extraktion)",
  "warnungen": ["Liste von Warnungen bei verdächtigen Werten"]
}`;

export const claudeAnfrageService = {
  /**
   * ROBUST PARSING: Extrahiert Daten aus E-Mail-Formular mit Claude AI
   * Verwendet strikte Validierung und gibt Warnungen bei verdächtigen Werten
   */
  async parseFormularRobust(emailText: string): Promise<RobustExtrahierteDaten> {
    const userPrompt = `Extrahiere alle Daten aus diesem Webformular-E-Mail:

---
${emailText}
---

Beachte: Felder können leer sein. Wenn nach einem Feldnamen nur ein anderer Feldname folgt (z.B. "Telefon: Angebot:"), ist das Feld LEER - setze es auf null!`;

    try {
      console.log('🤖 Robustes Parsing mit Claude API...');

      const data = await callClaudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: ROBUST_PARSING_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');

      if (!textContent?.text) {
        return {
          konfidenz: 0,
          warnungen: ['Keine Antwort von Claude erhalten'],
        };
      }

      // Parse JSON
      let cleanText = textContent.text.trim();
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

      console.log('✅ Claude Parsing erfolgreich:', parsed);

      return {
        vorname: parsed.vorname || undefined,
        nachname: parsed.nachname || undefined,
        vereinsname: parsed.vereinsname || undefined,
        strasse: parsed.strasse || undefined,
        plz: parsed.plz || undefined,
        ort: parsed.ort || undefined,
        email: parsed.email || undefined,
        telefon: parsed.telefon || undefined,
        tonnenLose02: typeof parsed.tonnenLose02 === 'number' ? parsed.tonnenLose02 : undefined,
        tonnenGesackt02: typeof parsed.tonnenGesackt02 === 'number' ? parsed.tonnenGesackt02 : undefined,
        tonnenLose03: typeof parsed.tonnenLose03 === 'number' ? parsed.tonnenLose03 : undefined,
        tonnenGesackt03: typeof parsed.tonnenGesackt03 === 'number' ? parsed.tonnenGesackt03 : undefined,
        anzahlPlaetze: typeof parsed.anzahlPlaetze === 'number' ? parsed.anzahlPlaetze : undefined,
        nachricht: parsed.nachricht || undefined,
        konfidenz: parsed.konfidenz || 50,
        warnungen: parsed.warnungen || [],
      };
    } catch (error) {
      console.error('Fehler beim robusten Parsing:', error);
      return {
        konfidenz: 0,
        warnungen: [`Parsing-Fehler: ${error}`],
      };
    }
  },

  /**
   * Analysiert eine Kundenanfrage mit Claude AI
   */
  async analysiereAnfrage(kontext: AnfrageKontext): Promise<ClaudeAnfrageAnalyse> {
    const userPrompt = erstelleUserPrompt(kontext);

    console.log('🤖 Sende Anfrage-Analyse an Claude API...');

    try {
      const data = await callClaudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      console.log('✅ Claude API Analyse erhalten');

      // Extrahiere den Text aus der Antwort
      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');
      if (!textContent?.text) {
        throw new Error('Keine Textantwort von Claude erhalten');
      }

      // Parse die JSON-Antwort
      return parseClaudeResponse(textContent.text);
    } catch (error) {
      console.error('Fehler bei Claude API Anfrage:', error);
      throw error;
    }
  },

  /**
   * Prüft ob Claude API verfügbar ist (nur über Backend — kein Browser-Key)
   */
  isAvailable(): boolean {
    return useBackend('claude');
  },

  /**
   * Generiert nur eine personalisierte E-Mail (ohne vollständige Analyse)
   */
  async generiereEmail(
    kundenname: string,
    ansprechpartner: string | undefined,
    menge: number,
    artikel: string,
    zusatzinfo?: string
  ): Promise<{ betreff: string; text: string }> {
    // Standard-E-Mail als Fallback
    const fallbackEmail = () => {
      const anrede = ansprechpartner
        ? `Sehr geehrte/r ${ansprechpartner}`
        : 'Sehr geehrte Damen und Herren';

      return {
        betreff: `Ihr Angebot für Tennismehl - ${kundenname}`,
        text: `${anrede},

vielen Dank für Ihre Anfrage.

Anbei erhalten Sie unser Angebot über ${menge} Tonnen ${artikel}. Bei Fragen stehen wir Ihnen gerne zur Verfügung.`,
      };
    };

    // Mit Claude API
    const prompt = `Erstelle eine kurze, professionelle Angebots-E-Mail:
- Kunde: ${kundenname}
- Ansprechpartner: ${ansprechpartner || 'nicht bekannt'}
- Menge: ${menge} Tonnen
- Artikel: ${artikel}
${zusatzinfo ? `- Zusatzinfo: ${zusatzinfo}` : ''}

Der Text endet mit dem Abschluss-Satz — OHNE Grußformel und OHNE Signatur, beide hängt das Portal automatisch an.

Antworte NUR mit JSON: {"betreff": "...", "text": "..."}`;

    try {
      const data = await callClaudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'Du bist ein professioneller Vertriebsmitarbeiter. Antworte NUR mit JSON.',
        messages: [{ role: 'user', content: prompt }],
      });
      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');

      if (textContent?.text) {
        let cleanText = textContent.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        const parsed = JSON.parse(cleanText);
        return { betreff: parsed.betreff, text: parsed.text };
      }

      throw new Error('Keine gültige Antwort');
    } catch (error) {
      console.warn('Claude E-Mail-Generierung fehlgeschlagen, verwende Fallback:', error);
      return fallbackEmail();
    }
  },

  /**
   * Analysiert das Nachricht-Feld einer Anfrage und extrahiert wichtige Informationen
   * wie Lieferwünsche, Sonderwünsche, Dringlichkeit etc.
   */
  async analysiereNachricht(nachricht: string): Promise<{
    zusammenfassung: string;
    lieferwunsch?: string;
    sonderwuensche?: string[];
    dringlichkeit: 'normal' | 'dringend' | 'flexibel';
    notizen: string;
  }> {
    if (!nachricht || nachricht.trim().length < 5) {
      return {
        zusammenfassung: '',
        dringlichkeit: 'normal',
        notizen: '',
      };
    }

    try {
      const prompt = `Analysiere diese Kundennachricht aus einer Tennismehl-Anfrage und extrahiere wichtige Informationen.

NACHRICHT:
"${nachricht}"

Antworte NUR mit diesem JSON-Format:
{
  "zusammenfassung": "Kurze Zusammenfassung was der Kunde will (1 Satz)",
  "lieferwunsch": "Gewünschter Liefertermin/Zeitraum falls erwähnt, sonst null",
  "sonderwuensche": ["Liste von Sonderwünschen falls vorhanden"],
  "dringlichkeit": "normal" oder "dringend" oder "flexibel",
  "notizen": "Wichtige Infos für die interne Bearbeitung (z.B. 'Lieferung 2./3. Märzwoche gewünscht')"
}`;

      const data = await callClaudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: 'Du bist ein Assistent der Kundennachrichten analysiert. Antworte NUR mit JSON.',
        messages: [{ role: 'user', content: prompt }],
      });
      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');

      if (textContent?.text) {
        let cleanText = textContent.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        const parsed = JSON.parse(cleanText);
        return {
          zusammenfassung: parsed.zusammenfassung || '',
          lieferwunsch: parsed.lieferwunsch || undefined,
          sonderwuensche: parsed.sonderwuensche || [],
          dringlichkeit: parsed.dringlichkeit || 'normal',
          notizen: parsed.notizen || '',
        };
      }

      return this.analysiereNachrichtLokal(nachricht);
    } catch (error) {
      console.warn('Fehler bei Claude-Analyse, verwende Fallback:', error);
      return this.analysiereNachrichtLokal(nachricht);
    }
  },

  /**
   * Lokale Analyse ohne Claude API (Fallback)
   */
  analysiereNachrichtLokal(nachricht: string): {
    zusammenfassung: string;
    lieferwunsch?: string;
    sonderwuensche?: string[];
    dringlichkeit: 'normal' | 'dringend' | 'flexibel';
    notizen: string;
  } {
    const text = nachricht.toLowerCase();
    let notizen = '';
    let lieferwunsch: string | undefined;
    let dringlichkeit: 'normal' | 'dringend' | 'flexibel' = 'normal';
    const sonderwuensche: string[] = [];

    // Liefertermin erkennen
    const lieferMatch = nachricht.match(
      /(lieferung|anlieferung|geliefert|liefern).{0,50}?((\d{1,2}\.?\s*)?(\d{1,2}\.?\s*)?(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|kw\s*\d+|\d+\.\s*woche|märzwoche|aprilwoche))/i
    );
    if (lieferMatch) {
      lieferwunsch = lieferMatch[0];
      notizen += `Lieferwunsch: ${lieferMatch[0]}\n`;
    }

    // KW oder Woche erkennen
    const kwMatch = nachricht.match(/(kw\s*\d+|\d+\.?\s*woche|\d+\/\d+\s*woche)/i);
    if (kwMatch && !lieferwunsch) {
      lieferwunsch = kwMatch[0];
      notizen += `Lieferzeitraum: ${kwMatch[0]}\n`;
    }

    // Monat + Woche erkennen (z.B. "2/3 Märzwoche")
    const monatWocheMatch = nachricht.match(/(\d+\/\d+|\d+\.\s*-\s*\d+\.)\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)woche/i);
    if (monatWocheMatch) {
      lieferwunsch = monatWocheMatch[0];
      notizen += `Lieferzeitraum: ${monatWocheMatch[0]}\n`;
    }

    // Dringlichkeit erkennen
    if (text.includes('dringend') || text.includes('schnell') || text.includes('eilig') || text.includes('asap')) {
      dringlichkeit = 'dringend';
      notizen += 'DRINGEND!\n';
    } else if (text.includes('flexibel') || text.includes('egal wann') || text.includes('keine eile')) {
      dringlichkeit = 'flexibel';
    }

    // Sonderwünsche erkennen
    if (text.includes('samstag') || text.includes('wochenende')) {
      sonderwuensche.push('Samstagslieferung gewünscht');
    }
    if (text.includes('vormittag') || text.includes('morgens')) {
      sonderwuensche.push('Vormittagslieferung bevorzugt');
    }
    if (text.includes('nachmittag')) {
      sonderwuensche.push('Nachmittagslieferung bevorzugt');
    }
    if (text.includes('anruf') || text.includes('telefonisch')) {
      sonderwuensche.push('Telefonische Terminabsprache gewünscht');
    }

    return {
      zusammenfassung: nachricht.length > 100 ? nachricht.substring(0, 100) + '...' : nachricht,
      lieferwunsch,
      sonderwuensche: sonderwuensche.length > 0 ? sonderwuensche : undefined,
      dringlichkeit,
      notizen: notizen.trim() || nachricht,
    };
  },
};
