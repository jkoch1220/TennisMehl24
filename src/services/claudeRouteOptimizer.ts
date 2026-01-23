// Claude AI Route Optimizer für intelligente Tourenplanung

import type {
  ClaudeOptimierungRequest,
  ClaudeOptimierungResponse,
  ProjektFuerOptimierung,
  FahrzeugFuerOptimierung,
  TourAdresse,
} from '../types/tour';

// System-Prompt für Claude - Logistik-Experte für Tennismehl-Lieferungen
const SYSTEM_PROMPT = `Du bist der Dispo-Chef für TennisMehl24, ein Unternehmen das Ziegelmehl (Tennisplatzsand) an Tennisvereine in Deutschland liefert.

DEINE AUFGABE:
Analysiere ALLE offenen Lieferungen und erstelle die OPTIMALEN Touren für die Auslieferung. Du entscheidest, welche Lieferungen zusammen gefahren werden und in welcher Reihenfolge.

FAHRZEUGE UND KAPAZITÄTEN:
- MOTORWAGEN (LKW ohne Hänger): Max. 18 Tonnen
- MIT HÄNGER (LKW + Anhänger): Max. 28 Tonnen (18t LKW + 10t Hänger)

KRITISCHE REGEL - BELIEFERUNGSART:
- "nur_motorwagen": Dieser Verein kann NUR mit dem Motorwagen (ohne Hänger) beliefert werden!
  → Enge Zufahrt, keine Wendemöglichkeit für Hänger
  → Diese Lieferung MUSS auf eine Motorwagen-Tour (max 18t gesamt)
- "mit_haenger": Kann mit Hänger beliefert werden → Kann auf eine 28t-Tour

KAPAZITÄTSBERECHNUNG PRO TOUR:
1. Wenn ALLE Stopps einer Tour "mit_haenger" erlauben → Max 28 Tonnen
2. Wenn MINDESTENS EIN Stopp "nur_motorwagen" hat → Max 18 Tonnen (kein Hänger möglich!)
3. Die Summe der Tonnen aller Stopps einer Tour darf das Maximum NIEMALS überschreiten!

BEISPIEL:
- Verein A: 5t, nur_motorwagen
- Verein B: 8t, mit_haenger
- Verein C: 12t, mit_haenger
→ A + B zusammen = 13t, aber wegen A nur Motorwagen = Max 18t ✓
→ A + C zusammen = 17t, aber wegen A nur Motorwagen = Max 18t ✓
→ B + C zusammen = 20t, beide mit_haenger = Max 28t ✓

PRIORISIERUNG:
1. KW-DEADLINES: Lieferungen mit "spaetestens_kw" die bald fällig sind haben VORRANG!
2. ZEITFENSTER: Respektiere Kundenzeitfenster (z.B. "08:00-12:00")
3. GEOGRAFIE: Kombiniere Lieferungen die geografisch nah beieinander liegen
4. AUSLASTUNG: Versuche Fahrzeuge gut auszulasten (>70%)

ARBEITSZEIT:
- Start: 07:00 Uhr ab Werk Marktheidenfeld
- Max. 9 Stunden pro Tour (inkl. Fahrt, Be-/Entladung, Pausen)
- Beladung am Werk: 30 Min
- Entladung pro Stopp: 15-30 Min je nach Tonnage
- Pause nach 4,5h: 45 Min

AUSGABEFORMAT - NUR VALIDES JSON:
{
  "touren": [
    {
      "fahrzeugTyp": "motorwagen" oder "mit_haenger",
      "stopReihenfolge": ["projekt_id_1", "projekt_id_2"],
      "begruendung": "Kurze Erklärung warum diese Kombination sinnvoll ist",
      "geschaetzteTonnen": 15.5,
      "kapazitaetMaximal": 18
    }
  ],
  "nichtFuerHeute": ["projekt_id_x"],
  "warnungen": ["Hinweis 1", "Hinweis 2"],
  "empfehlung": "Gesamtempfehlung für den Tag"
}

REGELN:
- Jede Lieferung darf nur in EINER Tour sein
- "abholung_ab_werk" → In "nichtFuerHeute" (Kunde holt selbst)
- Überschreite NIEMALS die Kapazitäten
- Plane sinnvolle Touren, nicht zu viele kleine
- Wenn Lieferungen für heute nicht passen → In "nichtFuerHeute" mit Begründung in warnungen`;

// Formatiere Projekte für den Prompt
function formatiereProjekte(projekte: ProjektFuerOptimierung[]): string {
  return projekte.map((p, i) => {
    const zeitfenster = p.zeitfenster
      ? `Zeitfenster: ${p.zeitfenster.von} - ${p.zeitfenster.bis}`
      : 'Zeitfenster: flexibel';

    const kwInfo = p.lieferKW
      ? `KW ${p.lieferKW}${p.lieferdatumTyp === 'spaetestens_kw' ? ' (spätestens!)' : ''}`
      : '';

    const hinweise = p.wichtigeHinweise?.length
      ? `WICHTIG: ${p.wichtigeHinweise.join(', ')}`
      : '';

    return `${i + 1}. ${p.kundenname} (ID: ${p.id})
   Adresse: ${p.adresse.strasse}, ${p.adresse.plz} ${p.adresse.ort}
   Menge: ${p.tonnen}t${p.paletten ? `, ${p.paletten} Paletten` : ''}
   Belieferungsart: ${p.belieferungsart}
   ${zeitfenster}
   ${kwInfo}
   ${hinweise}`.trim();
  }).join('\n\n');
}

// Formatiere Fahrzeuge für den Prompt
function formatiereFahrzeuge(fahrzeuge: FahrzeugFuerOptimierung[]): string {
  return fahrzeuge.map((f, i) => {
    const fahrer = f.fahrerName ? `Fahrer: ${f.fahrerName}` : 'Fahrer: nicht zugewiesen';
    return `${i + 1}. ${f.kennzeichen} (ID: ${f.id})
   Typ: ${f.typ}
   Kapazität: ${f.kapazitaetTonnen}t
   ${fahrer}`;
  }).join('\n\n');
}

// Formatiere Adresse
function formatiereAdresse(adresse: TourAdresse): string {
  return `${adresse.strasse}, ${adresse.plz} ${adresse.ort}`;
}

// Erstelle den User-Prompt
function erstelleUserPrompt(request: ClaudeOptimierungRequest): string {
  const datumObj = new Date(request.startZeit);
  const datumFormatiert = datumObj.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const uhrzeitFormatiert = datumObj.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `TOURENPLANUNG FÜR: ${datumFormatiert}
Geplanter Start: ${uhrzeitFormatiert} Uhr
Aktuelle Kalenderwoche: KW ${request.einschraenkungen.aktuelleKW}

STARTPUNKT (Werk):
${formatiereAdresse(request.startAdresse)}

LIEFERUNGEN (${request.projekte.length} Stück):
${formatiereProjekte(request.projekte)}

VERFÜGBARE FAHRZEUGE (${request.fahrzeuge.length} Stück):
${formatiereFahrzeuge(request.fahrzeuge)}

EINSCHRÄNKUNGEN:
- Maximale Arbeitszeit: ${request.einschraenkungen.maxArbeitszeitMinuten / 60} Stunden
- Pflichtpause nach: 4,5 Stunden (${request.einschraenkungen.pausenregelMinuten} Minuten)
- Zeitfenster beachten: ${request.einschraenkungen.respektiereZeitfenster ? 'JA (strikt)' : 'NEIN (flexibel)'}
- KW-Deadlines beachten: ${request.einschraenkungen.respektiereKWDeadlines ? 'JA (priorisieren)' : 'NEIN'}

Bitte erstelle optimale Touren für die oben genannten Lieferungen.`;
}

// Parse Claude's JSON Response
function parseClaudeResponse(text: string): ClaudeOptimierungResponse {
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

    // Validiere die Struktur
    if (!Array.isArray(parsed.touren)) {
      throw new Error('Ungültiges Format: touren muss ein Array sein');
    }

    return {
      touren: parsed.touren.map((t: any) => ({
        fahrzeugTyp: t.fahrzeugTyp || 'motorwagen',
        fahrzeugId: t.fahrzeugId,
        stopReihenfolge: Array.isArray(t.stopReihenfolge) ? t.stopReihenfolge : [],
        begruendung: t.begruendung || '',
        geschaetzteTonnen: t.geschaetzteTonnen || 0,
        kapazitaetMaximal: t.kapazitaetMaximal || (t.fahrzeugTyp === 'mit_haenger' ? 28 : 18),
        geschaetzteDistanzKm: t.geschaetzteDistanzKm,
      })),
      warnungen: Array.isArray(parsed.warnungen) ? parsed.warnungen : [],
      nichtFuerHeute: Array.isArray(parsed.nichtFuerHeute) ? parsed.nichtFuerHeute : [],
      empfehlung: parsed.empfehlung,
    };
  } catch (error) {
    console.error('Fehler beim Parsen der Claude-Antwort:', error);
    console.error('Rohtext:', text);
    throw new Error(`Claude-Antwort konnte nicht geparst werden: ${error}`);
  }
}

// Aktuelle Kalenderwoche berechnen
function getAktuelleKW(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000; // ms pro Woche
  return Math.ceil((diff / oneWeek) + 1);
}

export const claudeRouteOptimizer = {
  /**
   * Optimiert Touren mit Claude AI
   */
  async optimiereTouren(request: ClaudeOptimierungRequest): Promise<ClaudeOptimierungResponse> {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('VITE_ANTHROPIC_API_KEY ist nicht konfiguriert');
    }

    // Filtere Abholungen raus - die kommen nicht in Touren
    const lieferProjekte = request.projekte.filter(p => p.belieferungsart !== 'abholung_ab_werk');
    const abholProjekte = request.projekte.filter(p => p.belieferungsart === 'abholung_ab_werk');

    if (lieferProjekte.length === 0) {
      return {
        touren: [],
        warnungen: ['Keine Lieferungen vorhanden (nur Abholungen)'],
        nichtFuerHeute: abholProjekte.map(p => p.id),
        empfehlung: 'Alle Projekte sind Abholungen ab Werk und benötigen keine Tourenplanung.',
      };
    }

    // Ergänze aktuelle KW falls nicht gesetzt
    const einschraenkungen = {
      ...request.einschraenkungen,
      aktuelleKW: request.einschraenkungen.aktuelleKW || getAktuelleKW(),
    };

    const userPrompt = erstelleUserPrompt({
      ...request,
      projekte: lieferProjekte,
      einschraenkungen,
    });

    console.log('🤖 Sende Anfrage an Claude API...');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Claude API Fehler:', errorData);
        throw new Error(`Claude API Fehler: ${response.status} - ${errorData.error?.message || 'Unbekannter Fehler'}`);
      }

      const data = await response.json();
      console.log('✅ Claude API Antwort erhalten');

      // Extrahiere den Text aus der Antwort
      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');
      if (!textContent?.text) {
        throw new Error('Keine Textantwort von Claude erhalten');
      }

      // Parse die JSON-Antwort
      const result = parseClaudeResponse(textContent.text);

      // Füge Abholprojekte zu nichtFuerHeute hinzu
      if (abholProjekte.length > 0) {
        result.nichtFuerHeute.push(...abholProjekte.map(p => p.id));
        result.warnungen.push(
          `${abholProjekte.length} Projekt(e) sind Abholungen ab Werk und wurden nicht in Touren aufgenommen.`
        );
      }

      return result;
    } catch (error) {
      console.error('Fehler bei Claude API Anfrage:', error);
      throw error;
    }
  },

  /**
   * Prüft ob Claude API verfügbar ist
   */
  isAvailable(): boolean {
    return !!import.meta.env.VITE_ANTHROPIC_API_KEY;
  },

  /**
   * Gibt die aktuelle Kalenderwoche zurück
   */
  getAktuelleKW,
};
