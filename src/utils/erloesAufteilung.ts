/**
 * Erlösaufteilung Ware vs. Fracht (Stufe 5 Artikelverwaltung, 09/2026).
 *
 * Julians Regel (01.09.2026): Der im Artikelstamm hinterlegte Ab-Werk-Preis
 * ist die fixe Referenz (Schüttgut z. B. 98,70 €/t) — ALLES darüber ist
 * Frachtpreisaufschlag. Damit braucht es keine neuen Positionsfelder und
 * keine Änderung an Kundenbelegen: die Trennung ist reine Rechnung in der
 * Lese-Schicht und funktioniert rückwirkend für alle Bestandsbelege, egal ob
 * ein Kunde die Fracht in den Tonnenpreis eingerechnet bekam oder als
 * separate Position (TM-FK/TM-FP/…) auf dem Angebot hatte.
 *
 * Aufteilung je Position:
 * - Ware (istTonnageRelevant):  Warenerlös = menge × Ab-Werk-Preis,
 *   Frachtaufschlag = Gesamtpreis − Warenerlös (nie negativ — liegt der
 *   Positionspreis UNTER Werk, ist das ein Rabatt auf die Ware, keine
 *   „negative Fracht").
 * - Warengruppe 'fracht':       alles Frachterlös.
 * - Übrige (Zubehör/Dienstleistung/Universal): alles sonstiger Erlös.
 *
 * Referenzpreis: der Stammpreis des aufgelösten Artikels IN DER EINHEIT DER
 * POSITION. Bei der Sack/Paletten-Familie entscheidet der Positionspreis,
 * welches Gebinde gemeint ist (siehe GEBINDE-Logik in tonnage.ts) — eine
 * Palettenposition unter der Sack-Nummer wird gegen den Paletten-Werkspreis
 * gerechnet, nicht gegen 8,50 €/Sack.
 */
import { Artikel } from '../types/artikel';
import {
  ArtikelIndex,
  TonnagePosition,
  findeArtikelZurPosition,
  normalisiereArtikelnummer,
} from './tonnage';

export interface ErloesAufteilung {
  warenerloes: number;
  frachterloes: number;
  sonstigerErloes: number;
  /** Gesamtpreis von Ware-Positionen, deren Ab-Werk-Referenz fehlt — ehrlich getrennt statt still als Ware gezählt. */
  nichtAufteilbar: number;
}

export interface ErloesPosition extends TonnagePosition {
  gesamtpreis?: number;
  istUniversalArtikel?: boolean;
}

/**
 * Ab-Werk-Referenzpreis einer Position in ihrer Einheit, oder undefined.
 *
 * Für die Sack/Paletten-Familie in Stück wird das Gebinde über den
 * Positionspreis erkannt: ≥ 50 € kann kein 40-kg-Sack sein → Referenz ist
 * der Paletten-/BigBag-Stammpreis (€/t ≙ €/Stück bei 1000-kg-Nominalgewicht),
 * darunter der Sack-Stammpreis der passenden Körnung.
 */
export function abWerkReferenzpreis(
  position: ErloesPosition,
  index: ArtikelIndex
): number | undefined {
  const nummer = normalisiereArtikelnummer(position.artikelnummer);
  const einheit = (position.einheit || '').toLowerCase();
  const artikel = findeArtikelZurPosition(position, index);
  if (!artikel) return undefined;

  const istStueck = einheit !== 't' && einheit !== 'to' && einheit !== 'tonnen' && einheit !== 'tonne';
  const sackFamilie = /^TM-ZM-(0[23])ST?$/.exec(nummer);

  if (istStueck && sackFamilie && position.einzelpreis != null && position.einzelpreis > 0) {
    const koernung = sackFamilie[1];
    const zielNummer =
      Math.abs(position.einzelpreis) >= 50 ? `TM-ZM-${koernung}ST` : `TM-ZM-${koernung}S`;
    const zielArtikel = index.byNummer.get(zielNummer);
    if (zielArtikel?.einzelpreis != null) return zielArtikel.einzelpreis;
  }

  return artikel.einzelpreis ?? undefined;
}

function istWarengruppeFracht(artikel: Artikel | undefined, nummer: string): boolean {
  if (artikel?.warengruppe) return artikel.warengruppe === 'fracht';
  // Fallback für Positionen ohne Stamm-Treffer: bekannte Frachtnummern
  return ['TM-FK', 'TM-FP', 'TM-FKZ', 'TM-MM', 'TM-HYC-V', 'TM-UV-SPZ', 'TM-UV-VK'].includes(nummer);
}

function istWare(artikel: Artikel | undefined, nummer: string): boolean {
  if (artikel && artikel.istTonnageRelevant !== null && artikel.istTonnageRelevant !== undefined) {
    return artikel.istTonnageRelevant;
  }
  return nummer.startsWith('TM-ZM-');
}

/** Teilt die Erlöse einer Positionsliste nach der Werkspreis-Regel auf. */
export function berechneErloesAufteilung(
  positionen: ErloesPosition[] | undefined,
  index: ArtikelIndex
): ErloesAufteilung {
  const ergebnis: ErloesAufteilung = {
    warenerloes: 0,
    frachterloes: 0,
    sonstigerErloes: 0,
    nichtAufteilbar: 0,
  };

  for (const position of positionen || []) {
    if (position.istBedarfsposition) continue;

    const gesamt = position.gesamtpreis ?? (position.menge || 0) * (position.einzelpreis || 0);
    if (!gesamt) continue;

    const nummer = normalisiereArtikelnummer(position.artikelnummer);
    const artikel = findeArtikelZurPosition(position, index);

    if (istWarengruppeFracht(artikel, nummer)) {
      ergebnis.frachterloes += gesamt;
      continue;
    }

    if (!istWare(artikel, nummer)) {
      ergebnis.sonstigerErloes += gesamt;
      continue;
    }

    const referenz = abWerkReferenzpreis(position, index);
    if (referenz == null || referenz <= 0) {
      ergebnis.nichtAufteilbar += gesamt;
      continue;
    }

    const warenanteil = Math.min(gesamt, (position.menge || 0) * referenz);
    ergebnis.warenerloes += warenanteil;
    ergebnis.frachterloes += gesamt - warenanteil;
  }

  return ergebnis;
}
