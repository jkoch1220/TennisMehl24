/**
 * Positionen aus einer Stückliste bauen.
 *
 * Wird an zwei Stellen gebraucht, die vorher eigenen Code hatten:
 *   - Quick-Add im Angebot („Stückliste"-Knopf)
 *   - automatische Vorbelegung beim Öffnen eines Angebots, abhängig vom
 *     Bezugsweg des Projekts
 *
 * Die Vorbelegung war bis 08/2026 eine hartkodierte Liste aus drei
 * Artikelnummern und griff nur bei Bezugsweg `direkt`. Für
 * `direkt_instandsetzung` passierte nichts, obwohl es dafür längst eine
 * gepflegte Stückliste gab (Vorschlag [15]).
 */
import { Artikel } from '../types/artikel';
import { Position } from '../types/projektabwicklung';
import { Stueckliste } from '../constants/stuecklisten';
import { berechneFrachtkostenpauschale } from './frachtkostenCalculations';
import { summiereTonnage } from './angebotsTonnage';

export const FRACHTKOSTENPAUSCHALE_ARTIKELNUMMER = 'TM-FP';

export interface StuecklistenKontext {
  /** Menge für Positionen mit `mengeAusProjekt: 'angefragteMenge'`. */
  angefragteMenge?: number;
  /** Bereits im Dokument stehende Positionen — zählen für die Fracht mit. */
  bestehendePositionen?: Position[];
  /**
   * Artikelnummern, die nicht noch einmal eingefügt werden sollen.
   *
   * Nötig, weil der Hauptartikel (z.B. TM-ZM-02) vorher schon mit dem
   * ausgehandelten Kundenpreis gesetzt wird. Ohne diese Sperre stand er
   * zweimal im Angebot — einmal mit Kundenpreis, einmal mit Listenpreis.
   */
  bereitsVorhanden?: Set<string>;
}

export interface StuecklistenErgebnis {
  positionen: Position[];
  /**
   * Artikelnummern der Stückliste, die im Artikelstamm fehlen.
   *
   * Muss der Aufrufer sichtbar machen. Genau hier lag der Fehler von 07/2026:
   * Stücklisten nannten Nummern, die es nie gab, und die Positionen fehlten
   * still im Angebot — gemeldet nur in einem Toast, der nach drei Sekunden weg war.
   */
  nichtGefunden: string[];
}

const normalisiere = (nummer: string): string => nummer.trim().toUpperCase();

export function baueStuecklistenPositionen(
  stueckliste: Stueckliste,
  artikel: Artikel[],
  kontext: StuecklistenKontext = {}
): StuecklistenErgebnis {
  const { angefragteMenge, bestehendePositionen = [], bereitsVorhanden } = kontext;

  const positionen: Position[] = [];
  const nichtGefunden: string[] = [];

  for (const eintrag of stueckliste.positionen) {
    const gesucht = normalisiere(eintrag.artikelnummer);

    if (bereitsVorhanden?.has(gesucht)) continue;

    const stammArtikel = artikel.find((a) => normalisiere(a.artikelnummer || '') === gesucht);
    if (!stammArtikel) {
      nichtGefunden.push(eintrag.artikelnummer);
      continue;
    }

    // `??` statt `||`: eine ausdrückliche 0 (Bedarfsposition) muss 0 bleiben.
    let menge = eintrag.menge ?? 1;
    if (eintrag.mengeAusProjekt === 'angefragteMenge' && angefragteMenge) {
      menge = angefragteMenge;
    }

    let preis = stammArtikel.einzelpreis ?? 0;
    if (gesucht === FRACHTKOSTENPAUSCHALE_ARTIKELNUMMER) {
      // Fracht richtet sich nach der Gesamttonnage — vorhandene Positionen und
      // die gerade gebauten zusammen, ohne Pauschalen und Bedarfspositionen.
      preis = berechneFrachtkostenpauschale(summiereTonnage(bestehendePositionen, positionen));
    }

    positionen.push({
      id: `${Date.now()}-${eintrag.artikelnummer}`,
      artikelnummer: stammArtikel.artikelnummer,
      bezeichnung: stammArtikel.bezeichnung,
      beschreibung: stammArtikel.beschreibung || '',
      menge,
      einheit: stammArtikel.einheit,
      einzelpreis: preis,
      einkaufspreis: stammArtikel.einkaufspreis,
      streichpreis: stammArtikel.streichpreis,
      gesamtpreis: menge * preis,
      istBedarfsposition: eintrag.istBedarfsposition,
    });
  }

  return { positionen, nichtGefunden };
}

/**
 * Welche Stückliste gehört zu welchem Bezugsweg?
 *
 * `direkt` bekam bisher dieselben drei Artikel hartkodiert, die auch in
 * „Ziegelmehl Schüttgut" stehen — die Umstellung ändert daran nichts außer der
 * Fundstelle. `direkt_instandsetzung` ist neu.
 */
export const stuecklisteFuerBezugsweg = (bezugsweg?: string): string | undefined => {
  if (bezugsweg === 'direkt') return 'ziegelmehl-schuettgut';
  if (bezugsweg === 'direkt_instandsetzung') return 'fruehjahrs-instandsetzung';
  return undefined;
};
