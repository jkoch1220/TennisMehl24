/**
 * Telefon-Leitfaden für die Anfragenbearbeitung.
 *
 * Die Vorlage wird in den Stammdaten (`salesLeitfaden`, JSON) gepflegt und gilt
 * damit für alle Nutzer. Ohne gespeicherte Vorlage greift DEFAULT_LEITFADEN.
 */

import { Stammdaten } from '../types/stammdaten';

export interface LeitfadenFrage {
  id: string;
  frage: string;
  ziel: string;
}

export interface LeitfadenAbschnitt {
  id: string;
  titel: string;
  technik: string;
  fragen: LeitfadenFrage[];
}

export const DEFAULT_LEITFADEN: LeitfadenAbschnitt[] = [
  {
    id: 'einstieg',
    titel: 'Einstieg & Bedarf bestätigen',
    technik: 'Situationsfragen',
    fragen: [
      {
        id: 'einstieg-anlass',
        frage: 'Es geht also um die Frühjahrsinstandsetzung – passt das zeitlich, oder brauchen Sie das Material früher?',
        ziel: 'Anlass und Timing bestätigen',
      },
      {
        id: 'einstieg-menge',
        frage: 'Wie viele Plätze versorgen Sie aktuell, und ist die Menge in der Anfrage schon final?',
        ziel: 'Bedarf verifizieren',
      },
    ],
  },
  {
    id: 'historie',
    titel: 'Kundenhistorie klären',
    technik: 'Qualifizierung',
    fragen: [
      {
        id: 'historie-bestellung',
        frage: 'Hatten Sie schon einmal bei uns bestellt?',
        ziel: 'Bestandskunde erkennen – ggf. an letzte Bestellung anknüpfen, sonst Erstkunden-Vorteile nennen',
      },
      {
        id: 'historie-quelle',
        frage: 'Wie sind Sie eigentlich auf uns aufmerksam geworden?',
        ziel: 'Lead-Quelle für Marketing dokumentieren',
      },
    ],
  },
  {
    id: 'konkurrenz',
    titel: 'Konkurrenz aushebeln',
    technik: 'Wettbewerbsanalyse',
    fragen: [
      {
        id: 'konkurrenz-anbieter',
        frage: 'Wo haben Sie das Material letztes Jahr bezogen?',
        ziel: 'Konkurrenten identifizieren',
      },
      {
        id: 'konkurrenz-preis',
        frage: 'Zu welchem Preis pro Tonne haben Sie dort eingekauft?',
        ziel: 'Preisanker für die Argumentation gewinnen',
      },
      {
        id: 'konkurrenz-schmerz',
        frage: 'Waren Sie mit dem Anbieter zufrieden? Was hat gegebenenfalls gestört – Lieferzeit, Qualität, Erreichbarkeit, Preis?',
        ziel: 'Wechselgrund und Schmerzpunkt aufdecken',
      },
    ],
  },
  {
    id: 'wert',
    titel: 'Wert vor Preis',
    technik: 'Nutzenargumentation',
    fragen: [
      {
        id: 'wert-qualitaet',
        frage: 'Ist Ihnen beim Platzbelag eher der günstigste Preis wichtig, oder eine gleichbleibend hohe Qualität, die Ihnen Nacharbeiten erspart?',
        ziel: 'Qualität als Entscheidungskriterium verankern, bevor über Preis gesprochen wird',
      },
    ],
  },
  {
    id: 'zusatz',
    titel: 'Zusatzbedarf wecken',
    technik: 'Cross-Selling',
    fragen: [
      {
        id: 'zusatz-zubehoer',
        frage: 'Neben dem Tennismehl – wären auch ergänzende Produkte für die Platzpflege interessant?',
        ziel: 'Zusatzpositionen ins Angebot aufnehmen',
      },
      {
        id: 'zusatz-hydrocourt',
        frage: 'Falls Sie den Platz längerfristig aufwerten möchten: Wäre Hydrocourt für Sie eine Option, oder soll ich dazu etwas zuschicken?',
        ziel: 'Upsell auf höherwertige Produktlinie prüfen',
      },
    ],
  },
  {
    id: 'abschluss',
    titel: 'Abschluss & nächster Schritt',
    technik: 'Verbindlicher Abschluss',
    fragen: [
      {
        id: 'abschluss-zusammenfassung',
        frage: 'Bedarf kurz zusammenfassen und bestätigen lassen: „Dann schicke ich Ihnen jetzt ein Angebot über X Tonnen [lose/gesackt] zu."',
        ziel: 'Nie ohne konkreten nächsten Schritt auflegen',
      },
      {
        id: 'abschluss-wiedervorlage',
        frage: 'Passt es, wenn ich in 2-3 Tagen noch einmal anrufe, um das Angebot zu besprechen?',
        ziel: 'Festen Folgetermin vereinbaren statt „Sie melden sich"',
      },
    ],
  },
];

/**
 * Liest die Vorlage aus den Stammdaten. Defensiv, weil das Feld ein freier
 * JSON-String ist: fehlende ids werden ergänzt (sie dienen nur als React-Key und
 * als Merker für abgehakte Fragen), fehlende `fragen`-Arrays werden zu leeren
 * Arrays — sonst würde ein von Hand editierter Datensatz die Komponente beim
 * `fragen.map` zum Absturz bringen.
 */
export function parseLeitfaden(stammdaten?: Stammdaten | null): LeitfadenAbschnitt[] {
  if (!stammdaten?.salesLeitfaden) return DEFAULT_LEITFADEN;

  let geparst: unknown;
  try {
    geparst = JSON.parse(stammdaten.salesLeitfaden);
  } catch {
    console.warn('Sales-Leitfaden in den Stammdaten ist kein gültiges JSON – Standardvorlage wird verwendet.');
    return DEFAULT_LEITFADEN;
  }

  if (!Array.isArray(geparst) || geparst.length === 0) return DEFAULT_LEITFADEN;

  return geparst
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a, i) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `abschnitt-${i}`,
      titel: typeof a.titel === 'string' ? a.titel : '',
      technik: typeof a.technik === 'string' ? a.technik : '',
      fragen: (Array.isArray(a.fragen) ? a.fragen : [])
        .filter((f: unknown): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .map((f, j) => ({
          id: typeof f.id === 'string' && f.id ? f.id : `abschnitt-${i}-frage-${j}`,
          frage: typeof f.frage === 'string' ? f.frage : '',
          ziel: typeof f.ziel === 'string' ? f.ziel : '',
        })),
    }));
}
