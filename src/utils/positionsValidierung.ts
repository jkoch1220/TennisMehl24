/**
 * Zentrale Positions-Validierung beim Speichern eines Belegs
 * (Stufe 4 Artikelverwaltung, 08/2026).
 *
 * Prüft jede Position gegen den Artikelstamm und liefert WARNUNGEN — sie
 * blockieren nicht hart (Altbelege und Sonderfälle müssen speicherbar
 * bleiben), aber der Benutzer bekommt sie vor dem Speichern sichtbar
 * vorgelegt und muss sie bestätigen. Nie stille Korrektur, nie stiller
 * Fallback.
 *
 * Freitext-Positionen (istFreitextPosition) sind von der Stamm-Prüfung
 * ausgenommen: Sie sind BEWUSST ohne Stammartikel angelegt und fallen dafür
 * sichtbar aus der Artikel-Auswertung.
 */
import { Position } from '../types/projektabwicklung';
import { Artikel } from '../types/artikel';
import { ArtikelIndex, findeArtikelZurPosition, normalisiereArtikelnummer } from './tonnage';

export type PositionsWarnungTyp =
  | 'artikel-unbekannt'
  | 'einheit-abweichend'
  | 'festpreis-abweichend'
  | 'artikel-archiviert';

export interface PositionsWarnung {
  typ: PositionsWarnungTyp;
  positionsIndex: number;
  artikelnummer: string;
  meldung: string;
}

/** Prüft eine Positionsliste gegen den Artikelstamm. */
export function validierePositionen(
  positionen: Position[],
  index: ArtikelIndex
): PositionsWarnung[] {
  const warnungen: PositionsWarnung[] = [];

  positionen.forEach((position, i) => {
    if (position.istFreitextPosition || position.istBedarfsposition) return;
    if (position.istUniversalArtikel) return; // Universal-Katalog hat eigenen Stamm

    const nummer = normalisiereArtikelnummer(position.artikelnummer);
    if (!nummer) {
      warnungen.push({
        typ: 'artikel-unbekannt',
        positionsIndex: i,
        artikelnummer: '',
        meldung: `Position ${i + 1} („${position.bezeichnung}"): keine Artikelnummer — bitte Artikel aus dem Stamm wählen oder als Freitext-Position kennzeichnen.`,
      });
      return;
    }

    const artikel = findeArtikelZurPosition(position, index);
    if (!artikel) {
      warnungen.push({
        typ: 'artikel-unbekannt',
        positionsIndex: i,
        artikelnummer: nummer,
        meldung: `Position ${i + 1}: Artikelnummer „${position.artikelnummer}" existiert nicht im Artikelstamm — die Position fällt aus der Artikel-Auswertung.`,
      });
      return;
    }

    if (artikel.aktiv === false) {
      warnungen.push({
        typ: 'artikel-archiviert',
        positionsIndex: i,
        artikelnummer: nummer,
        meldung: `Position ${i + 1}: Artikel „${artikel.artikelnummer}" ist archiviert und sollte in neuen Belegen nicht mehr verwendet werden.`,
      });
    }

    const erlaubteEinheit = artikel.erlaubteEinheit || artikel.einheit;
    if (erlaubteEinheit && position.einheit && position.einheit !== erlaubteEinheit) {
      warnungen.push({
        typ: 'einheit-abweichend',
        positionsIndex: i,
        artikelnummer: nummer,
        meldung: `Position ${i + 1}: Einheit „${position.einheit}" weicht vom Stamm ab (erlaubt: „${erlaubteEinheit}") — falsche Einheiten verfälschen die Tonnage.`,
      });
    }

    warnungen.push(...pruefeFestpreis(position, artikel, i));
  });

  return warnungen;
}

/**
 * Fixpreis-Artikel (preisTyp 'fest') dürfen nur mit dokumentiertem Grund vom
 * Stammpreis abweichen — analog zum streichpreisGrund-Muster.
 */
function pruefeFestpreis(position: Position, artikel: Artikel, i: number): PositionsWarnung[] {
  if (artikel.preisTyp !== 'fest') return [];
  if (artikel.einzelpreis === undefined || artikel.einzelpreis === null) return [];
  if (Math.abs(position.einzelpreis - artikel.einzelpreis) < 0.005) return [];
  if (position.streichpreisGrund?.trim()) return [];

  return [
    {
      typ: 'festpreis-abweichend',
      positionsIndex: i,
      artikelnummer: normalisiereArtikelnummer(position.artikelnummer),
      meldung: `Position ${i + 1}: „${artikel.artikelnummer}" ist ein Fixpreis-Artikel (${artikel.einzelpreis.toFixed(2)} €), steht hier aber mit ${position.einzelpreis.toFixed(2)} € ohne begründeten Rabatt (streichpreisGrund).`,
    },
  ];
}

/** Formatiert Warnungen für den Bestätigungs-Dialog vor dem Speichern. */
export function formatiereWarnungen(warnungen: PositionsWarnung[]): string {
  return warnungen.map((w) => `• ${w.meldung}`).join('\n');
}
