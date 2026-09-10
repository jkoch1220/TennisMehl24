/**
 * Standard-Angebotsartikel für Platzbauer (09/2026).
 *
 * Jeder Platzbauer bekommt dieselben Zusatzkonditionen angeboten: Fracht,
 * Verpackung, zusätzliche Schüttstellen, Hydrocourt. Bis jetzt musste der
 * Sachbearbeiter diese Positionen in jedem Angebot einzeln zusammenklicken —
 * mit dem Ergebnis, dass zwei Platzbauer der gleichen Saison unterschiedliche
 * Listen bekamen und Preise auseinanderliefen.
 *
 * Diese Liste ist die Vorlage. Gepflegt wird sie im Platzbauer-Tool
 * (Reiter „Standardartikel"), gespeichert als JSON im Stammdaten-Feld
 * `platzbauerStandardartikel`. Diese Datei liefert nur die Erstbelegung und
 * das Format.
 *
 * Darstellung im Angebot: als PREISLISTE ohne Menge und ohne Summe
 * (`positionsTyp: 'preisliste'`). Beim Abschluss einer Saisonvereinbarung weiß
 * niemand, wie viele Paletten oder Folien abgerufen werden — eine Menge 1 je
 * Zeile hätte nur eine Scheinsumme unter das Staffelangebot geschrieben.
 * Abgerechnet wird pro Lieferung zu genau diesen Sätzen.
 *
 * ACHTUNG: Jede Artikelnummer MUSS im Artikelstamm existieren. Erfundene
 * Nummern sind hier schon einmal teuer geworden (siehe `stuecklisten.ts`):
 * Positionen fielen kommentarlos aus dem Angebot. Der Standardartikel-Reiter
 * zeigt deshalb an, welche Nummern nicht aufgelöst werden konnten.
 */

/** Eine Zeile der Standard-Preisliste. */
import { FRACHTKOSTEN_STAFFEL } from '../utils/frachtkostenCalculations';

export interface PlatzbauerStandardartikel {
  artikelnummer: string;
  /** Nur Anzeige/Notnagel: Gedruckt wird die Bezeichnung aus dem Artikelstamm. */
  bezeichnung: string;
  /** Gruppenüberschrift in der Preisliste. */
  gruppe: string;
  /**
   * Fester Preis für Platzbauer. Leer = Preis aus dem Artikelstamm.
   * Ein Wert hier gewinnt — so bleiben Platzbauer-Konditionen unabhängig
   * von Preisänderungen im Endkundenstamm.
   */
  preis?: number | null;
  /** Erläuterung unter der Zeile (z. B. Abrechnungsregel). */
  hinweis?: string;
  /**
   * Eigene Mengenstaffel der Leistung (Frachtkostenpauschale). Wird als
   * eingerückte Zeilen gedruckt; `preis` bleibt dann der Grundpreis bzw. leer.
   */
  staffel?: Array<{ text: string; preis: number }>;
  /** Ausgeschaltete Zeilen bleiben in der Vorlage, kommen aber nicht ins Angebot. */
  aktiv: boolean;
}

/** Erstbelegung, solange in den Stammdaten nichts gepflegt ist. */
export const PLATZBAUER_STANDARDARTIKEL_DEFAULT: PlatzbauerStandardartikel[] = [
  // === Fracht & Verpackung ===
  {
    artikelnummer: 'TM-FP',
    bezeichnung: 'Frachtkostenpauschale',
    gruppe: 'Fracht & Verpackung',
    preis: null,
    hinweis: 'Je Anlieferung, nach Liefermenge gestaffelt:',
    // Aus `utils/frachtkostenCalculations.ts` — eine Quelle für Berechnung
    // und Beleg. Ändert sich die Staffel dort, ändert sie sich hier mit.
    staffel: FRACHTKOSTEN_STAFFEL.map((stufe) => ({ text: stufe.text, preis: stufe.preis })),
    aktiv: true,
  },
  {
    artikelnummer: 'TM-PE',
    bezeichnung: 'PE-Folie für Abdeckung',
    gruppe: 'Fracht & Verpackung',
    preis: null,
    hinweis: 'Je Lieferung mit losem Material.',
    aktiv: true,
  },
  {
    artikelnummer: 'TM-PAL',
    bezeichnung: 'Einwegpalette',
    gruppe: 'Fracht & Verpackung',
    preis: null,
    hinweis: 'Je Palette Sackware oder BigBag.',
    aktiv: true,
  },
  // === Abladung ===
  {
    artikelnummer: 'TM-STS',
    bezeichnung: 'Zusätzliche Schüttstelle',
    gruppe: 'Abladung',
    preis: null,
    hinweis: 'Die erste Schüttstelle ist im Preis enthalten; jede weitere wird berechnet.',
    aktiv: true,
  },
  // === Hydrocourt ===
  {
    artikelnummer: 'TM-HYC',
    bezeichnung: 'HYDROcourt©',
    gruppe: 'HYDROcourt©',
    preis: null,
    aktiv: true,
  },
  {
    artikelnummer: 'TM-HYC-V',
    bezeichnung: 'HYDROcourt© Versandpauschale',
    gruppe: 'HYDROcourt©',
    preis: null,
    hinweis: 'Je Sendung.',
    aktiv: true,
  },
];

/**
 * Liest die gepflegte Liste aus dem Stammdaten-JSON. Fehlt sie oder ist sie
 * unbrauchbar, gilt die Erstbelegung — ein kaputter String darf kein Angebot
 * ohne Konditionen erzeugen.
 */
export const leseStandardartikel = (json?: string | null): PlatzbauerStandardartikel[] => {
  if (!json?.trim()) return PLATZBAUER_STANDARDARTIKEL_DEFAULT;
  try {
    const roh = JSON.parse(json);
    if (!Array.isArray(roh)) return PLATZBAUER_STANDARDARTIKEL_DEFAULT;
    const liste = roh
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        artikelnummer: String(e.artikelnummer ?? '').trim(),
        bezeichnung: String(e.bezeichnung ?? '').trim(),
        gruppe: String(e.gruppe ?? 'Weitere Konditionen').trim() || 'Weitere Konditionen',
        preis:
          e.preis === null || e.preis === undefined || e.preis === ''
            ? null
            : Number(e.preis),
        hinweis: e.hinweis ? String(e.hinweis) : undefined,
        staffel: Array.isArray(e.staffel)
          ? (e.staffel as Array<Record<string, unknown>>)
              .map((stufe) => ({
                text: String(stufe.text ?? '').trim(),
                preis: Number(stufe.preis),
              }))
              .filter((stufe) => stufe.text.length > 0 && Number.isFinite(stufe.preis))
          : undefined,
        aktiv: e.aktiv !== false,
      }))
      .filter((e) => e.artikelnummer.length > 0)
      .map((e) => ({ ...e, preis: Number.isFinite(e.preis as number) ? e.preis : null }))
      // Vorlagen, die vor der Staffel gespeichert wurden, bekommen sie hier
      // nachgereicht — sonst trüge eine einmal gespeicherte Liste die
      // Frachtstaffel nie, und ihre Änderung im Code bliebe wirkungslos.
      .map((e) =>
        e.artikelnummer === 'TM-FP' && !e.staffel?.length
          ? { ...e, staffel: FRACHTKOSTEN_STAFFEL.map((s) => ({ text: s.text, preis: s.preis })) }
          : e
      );
    return liste.length > 0 ? liste : PLATZBAUER_STANDARDARTIKEL_DEFAULT;
  } catch {
    return PLATZBAUER_STANDARDARTIKEL_DEFAULT;
  }
};

/** Reihenfolge der Gruppen, wie sie zuerst vorkommen — ohne Duplikate. */
export const gruppenReihenfolge = (liste: PlatzbauerStandardartikel[]): string[] => {
  const gesehen: string[] = [];
  for (const eintrag of liste) {
    if (!gesehen.includes(eintrag.gruppe)) gesehen.push(eintrag.gruppe);
  }
  return gesehen;
};

/** Was aus dem Artikelstamm gebraucht wird, um eine Preislistenzeile zu bauen. */
export interface StammartikelFuerPreisliste {
  artikelnummer: string;
  bezeichnung: string;
  einheit?: string;
  einzelpreis?: number | null;
}

/** Eine fertige Preislistenzeile für ein Platzbauer-Angebot. */
export interface PreislistenZeile {
  id: string;
  artikelnummer: string;
  bezeichnung: string;
  einheit: string;
  menge: 0;
  einzelpreis: number;
  gesamtpreis: 0;
  positionsTyp: 'preisliste';
  preislisteGruppe: string;
  preislisteHinweis?: string;
  preislisteStaffel?: Array<{ text: string; preis: number }>;
}

/**
 * Baut die Preisliste eines Angebots aus der Vorlage und dem Artikelstamm.
 *
 * Bezeichnung und Einheit kommen IMMER aus dem Stamm — die Vorlage trägt sie
 * nur als Notnagel, damit eine umbenannte Leistung nicht in alten Vorlagen
 * weiterlebt. Der Preis kommt aus der Vorlage, wenn dort einer steht.
 *
 * Zeilen, deren Artikel im Stamm fehlt, werden übersprungen und über
 * `fehlend` zurückgemeldet: Sie stillschweigend wegzulassen hat schon einmal
 * dazu geführt, dass Angebote ohne ihr Hauptprodukt rausgingen.
 */
export const baueStandardPreisliste = (
  vorlage: PlatzbauerStandardartikel[],
  stammartikel: StammartikelFuerPreisliste[]
): { zeilen: PreislistenZeile[]; fehlend: string[] } => {
  const stamm = new Map(stammartikel.filter((a) => a.artikelnummer).map((a) => [a.artikelnummer, a]));
  const zeilen: PreislistenZeile[] = [];
  const fehlend: string[] = [];

  for (const eintrag of vorlage) {
    if (!eintrag.aktiv || !eintrag.artikelnummer) continue;
    const artikel = stamm.get(eintrag.artikelnummer);
    if (!artikel) {
      fehlend.push(eintrag.artikelnummer);
      continue;
    }
    const preis =
      eintrag.preis !== null && eintrag.preis !== undefined && Number.isFinite(eintrag.preis)
        ? (eintrag.preis as number)
        : (artikel.einzelpreis ?? 0);
    zeilen.push({
      id: `preisliste-${eintrag.artikelnummer}`,
      artikelnummer: eintrag.artikelnummer,
      bezeichnung: artikel.bezeichnung || eintrag.bezeichnung,
      einheit: artikel.einheit || 'Stk',
      menge: 0,
      einzelpreis: preis,
      gesamtpreis: 0,
      positionsTyp: 'preisliste',
      preislisteGruppe: eintrag.gruppe,
      preislisteHinweis: eintrag.hinweis?.trim() || undefined,
      preislisteStaffel: eintrag.staffel?.length ? eintrag.staffel : undefined,
    });
  }

  return { zeilen, fehlend };
};
