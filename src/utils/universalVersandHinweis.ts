/**
 * Universal-Artikel Versandkosten-Hinweis
 *
 * Aggregiert Versand-Infos aller Universal-Artikel-Positionen im Dokument,
 * um den Benutzer daran zu erinnern, Versandkosten manuell einzupreisen.
 * Preise sind nicht hinterlegt — die Versandcodes dienen als Lookup-Referenz
 * im Universal-Versandkostenkatalog.
 */

import { Position } from '../types/projektabwicklung';

export type UniversalVersandart = 'gls' | 'spedition' | 'post' | 'anfrage' | 'unbekannt';

export interface UniversalVersandGruppe {
  anzahlPositionen: number;
  anzahlStueck: number;
  codes: string[];
  gesamtGewichtKg: number;
  hatSperrgut: boolean;
}

export interface UniversalVersandZusammenfassung {
  anzahlUniversalPositionen: number;
  gesamtStueck: number;
  gesamtGewichtKg: number;
  hatSperrgut: boolean;
  hatAnfrage: boolean;
  hatUnbekannt: boolean;
  byArt: Partial<Record<UniversalVersandart, UniversalVersandGruppe>>;
}

const ART_LABELS: Record<UniversalVersandart, string> = {
  gls: 'GLS',
  spedition: 'Spedition',
  post: 'Post',
  anfrage: 'Fracht auf Anfrage',
  unbekannt: 'Versandart unbekannt',
};

export function getUniversalVersandartLabel(art: UniversalVersandart): string {
  return ART_LABELS[art] ?? art;
}

export function getUniversalVersandZusammenfassung(
  positionen: Position[]
): UniversalVersandZusammenfassung | null {
  // istUniversalArtikel-Flag bevorzugt; Fallback auf Beschreibungs-Präfix (alte Dokumente)
  const universalPositionen = positionen.filter(
    (p) => p.istUniversalArtikel === true || p.beschreibung?.startsWith('Universal:')
  );
  if (universalPositionen.length === 0) return null;

  const byArt: Partial<Record<UniversalVersandart, UniversalVersandGruppe>> = {};
  let gesamtStueck = 0;
  let gesamtGewichtKg = 0;
  let hatSperrgut = false;

  for (const p of universalPositionen) {
    const info = p.universalVersandInfo;
    const art: UniversalVersandart = (info?.versandart as UniversalVersandart) || 'unbekannt';
    const menge = p.menge || 1;

    if (!byArt[art]) {
      byArt[art] = {
        anzahlPositionen: 0,
        anzahlStueck: 0,
        codes: [],
        gesamtGewichtKg: 0,
        hatSperrgut: false,
      };
    }
    const gruppe = byArt[art]!;
    gruppe.anzahlPositionen += 1;
    gruppe.anzahlStueck += menge;

    if (info?.versandcodeDE && !gruppe.codes.includes(info.versandcodeDE)) {
      gruppe.codes.push(info.versandcodeDE);
    }
    if (info?.gewichtKg) {
      gruppe.gesamtGewichtKg += info.gewichtKg * menge;
      gesamtGewichtKg += info.gewichtKg * menge;
    }
    if (info?.istSperrgut) {
      gruppe.hatSperrgut = true;
      hatSperrgut = true;
    }

    gesamtStueck += menge;
  }

  return {
    anzahlUniversalPositionen: universalPositionen.length,
    gesamtStueck,
    gesamtGewichtKg,
    hatSperrgut,
    hatAnfrage: !!byArt.anfrage,
    hatUnbekannt: !!byArt.unbekannt,
    byArt,
  };
}
