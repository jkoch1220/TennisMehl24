/**
 * frachtrechnerLogik.ts — Preislogik des Kunden-Frachtkostenrechners
 *
 * WARUM DIESE DATEI UNTER netlify/functions/lib/ LIEGT UND NICHT UNTER src/:
 * Sie importiert den Raben-Haustarif (src/constants/rabenPricing.ts). Läge sie
 * unter src/ und würde von der öffentlichen Seite importiert, bündelte Vite die
 * kompletten Einkaufskonditionen (1.805 PLZ-Preise + 60 Zonenpreise) in ein
 * Client-Bundle, das jeder Kunde per DevTools auslesen kann. Hier landet der
 * Tarif ausschließlich im Function-Bundle auf dem Server.
 *
 * Die öffentliche Seite src/pages/Frachtrechner.tsx bekommt NUR Ergebniszahlen —
 * niemals Basispreis, Zone, Gewichtsstufe oder den Namen der Spedition.
 *
 * Unterordner lib/ ist bewusst gewählt: Netlify macht nur Top-Level-Dateien in
 * netlify/functions/ zu aufrufbaren Endpunkten, Unterordner sind reine Module.
 */

import {
  berechneRabenFracht,
  berechneRabenDieselzuschlag,
} from '../../../src/constants/rabenPricing';

/** Eine Palette Sackware = 25 Säcke à 40 kg = 1.000 kg (src/constants/artikelPreise.ts) */
export const KG_PRO_PALETTE = 1000;

/** Raben fährt maximal 24 t je Sendung (RABEN_TARIF_AB_5T endet bei 24000). */
export const MAX_PALETTEN = 24;

/** Umsatzsteuersatz für Lieferungen innerhalb Deutschlands */
export const UST_SATZ = 0.19;

/**
 * Aufschlag auf den Speditions-Basispreis, mit dem aus dem Einkaufstarif ein
 * Verkaufspreis wird. Deckt Handling, Verladung, Avisierung und Frachtrisiko.
 *
 * ACHTUNG — offene kaufmännische Entscheidung (Julian, 09.09.2026):
 * Die Angebotserstellung rechnet Sackwarenfracht heute ANDERS, nämlich
 * `berechneSpeditionskosten(plz, 1000) * tonnage` (anfrageVerarbeitungService.ts:987
 * und :1159). Das ignoriert die Mengendegression von Raben und ergibt bei
 * 5 Paletten je nach Zone das 2,2- bis 2,5-fache des echten Frachtpreises.
 * Dieser Rechner nimmt bewusst die ECHTE Staffel plus diesen Aufschlag. Solange
 * die Angebotslogik nicht nachgezogen ist, weicht der Rechner nach unten ab.
 */
export const FRACHT_AUFSCHLAG_PROZENT_DEFAULT = 15;

/**
 * Dieselpreis-Stand für den ausgewiesenen Dieselzuschlag (ct/L).
 *
 * Bewusst KEIN Live-Abruf über Tankerkönig: Der Key läge sonst im öffentlichen
 * Bundle, jeder Seitenaufruf löste einen Drittabruf mit der Besucher-IP aus, und
 * src/utils/dieselPreisAPI.ts schreibt Abrufe in die Preishistorie zurück — eine
 * Kundenseite würde damit die interne Historie verfälschen. Der Wert wird
 * stattdessen gepflegt und mit Stand-Datum angezeigt.
 */
export const DIESEL_STAND_CENT_DEFAULT = 155;
export const DIESEL_STAND_DATUM_DEFAULT = '09.09.2026';

export interface FrachtrechnerPreisbasis {
  /** Verkaufspreis Sackware ab Werk in €/t (Artikelstamm TM-ZM-02St, Stand 155,00) */
  preisSackwareProTonne: number;
  /** Verkaufspreis Einwegpalette je Stück (Artikelstamm TM-PAL); 0 = nicht berechnen */
  preisPaletteProStueck: number;
  /** Aufschlag auf den Speditions-Basispreis in Prozent */
  frachtAufschlagProzent: number;
  /** Dieselpreis-Stand in ct/L für den Floater */
  dieselStandCent: number;
  /** Anzeigedatum des Dieselpreis-Standes */
  dieselStandDatum: string;
}

export interface FrachtrechnerEingabe {
  paletten: number;
  koernung: '0-2' | '0-3';
  zielPLZ: string;
}

/**
 * Ergebnis, das an den Kunden geht.
 *
 * Enthält BEWUSST NICHT: Speditions-Basispreis, Frachtzone, DE-Zone,
 * Gewichtsstufe, Aufschlagshöhe, Tarifart oder den Namen der Spedition.
 * Wer hier ein Feld ergänzt, gibt es an jeden Kunden mit gültigem Link weiter.
 */
export interface FrachtrechnerErgebnis {
  paletten: number;
  tonnen: number;
  koernung: '0-2' | '0-3';
  bezeichnung: string;
  /** Material: Menge × €/t */
  materialProTonne: number;
  materialSumme: number;
  /** Einwegpaletten (entfällt, wenn der Preis 0 ist) */
  palettenPreisProStueck: number;
  palettenSumme: number;
  /** Fracht inklusive Aufschlag — ohne Dieselzuschlag */
  frachtSumme: number;
  /** Dieselzuschlag auf die Fracht, zum angegebenen Stand */
  dieselzuschlagProzent: number;
  dieselzuschlagSumme: number;
  dieselStandDatum: string;
  nettoSumme: number;
  ustSatzProzent: number;
  ustSumme: number;
  bruttoSumme: number;
}

/** Rundet kaufmännisch auf 2 Nachkommastellen (vermeidet 0,1+0,2-Artefakte). */
const runde = (wert: number): number => Math.round((wert + Number.EPSILON) * 100) / 100;

export type FrachtrechnerFehler =
  | 'PLZ_UNGUELTIG'
  | 'PLZ_UNBEKANNT'
  | 'PALETTEN_UNGUELTIG'
  | 'KEIN_TARIF';

export interface FrachtrechnerAntwort {
  ok: boolean;
  ergebnis?: FrachtrechnerErgebnis;
  fehler?: FrachtrechnerFehler;
  fehlertext?: string;
}

/**
 * Prüft eine deutsche PLZ.
 *
 * Streng auf 5 Ziffern: berechneRabenFracht nimmt kommentarlos substring(0,2),
 * eine Wiener "1010" ergäbe damit einen Berlin-Preis. Der Tarif gilt aber nur
 * für Deutschland ("Tarif Deutschland ab 16.01.2026").
 */
export const istDeutschePLZ = (plz: string): boolean => /^[0-9]{5}$/.test(plz.trim());

export function berechneKundenFracht(
  eingabe: FrachtrechnerEingabe,
  basis: FrachtrechnerPreisbasis
): FrachtrechnerAntwort {
  const paletten = Math.trunc(eingabe.paletten);
  if (!Number.isFinite(paletten) || paletten < 1 || paletten > MAX_PALETTEN) {
    return {
      ok: false,
      fehler: 'PALETTEN_UNGUELTIG',
      fehlertext: `Bitte 1 bis ${MAX_PALETTEN} Paletten angeben. Für größere Mengen beraten wir Sie gerne persönlich.`,
    };
  }

  const plz = eingabe.zielPLZ.trim();
  if (!istDeutschePLZ(plz)) {
    return {
      ok: false,
      fehler: 'PLZ_UNGUELTIG',
      fehlertext: 'Bitte eine fünfstellige deutsche Postleitzahl eingeben. Für Lieferungen ins Ausland rufen Sie uns bitte an.',
    };
  }

  const gewichtKg = paletten * KG_PRO_PALETTE;
  const rohFracht = berechneRabenFracht(paletten, gewichtKg, plz, basis.dieselStandCent);
  if (!rohFracht) {
    return {
      ok: false,
      fehler: 'PLZ_UNBEKANNT',
      fehlertext: 'Für diese Postleitzahl liegt uns kein Tarif vor. Bitte rufen Sie uns an — wir rechnen die Lieferung für Sie durch.',
    };
  }

  // Verkaufsfracht = Einkaufs-Basispreis + Aufschlag. Der Dieselfloater wird auf
  // die Verkaufsfracht gerechnet, nicht auf den Einkaufspreis: Raben stellt den
  // Floater auf seinen Basispreis, wir reichen ihn auf unseren Preis weiter.
  const aufschlagFaktor = 1 + basis.frachtAufschlagProzent / 100;
  const frachtSumme = runde(rohFracht.basispreis * aufschlagFaktor);

  const dieselzuschlagProzent = berechneRabenDieselzuschlag(basis.dieselStandCent);
  const dieselzuschlagSumme = runde(frachtSumme * (dieselzuschlagProzent / 100));

  const tonnen = gewichtKg / 1000;
  const materialSumme = runde(tonnen * basis.preisSackwareProTonne);
  const palettenSumme = runde(paletten * basis.preisPaletteProStueck);

  const nettoSumme = runde(materialSumme + palettenSumme + frachtSumme + dieselzuschlagSumme);
  const ustSumme = runde(nettoSumme * UST_SATZ);
  const bruttoSumme = runde(nettoSumme + ustSumme);

  return {
    ok: true,
    ergebnis: {
      paletten,
      tonnen,
      koernung: eingabe.koernung,
      bezeichnung: `Tennismehl ${eingabe.koernung === '0-2' ? '0/2' : '0/3'} mm gesackt, 25 × 40 kg je Palette`,
      materialProTonne: basis.preisSackwareProTonne,
      materialSumme,
      palettenPreisProStueck: basis.preisPaletteProStueck,
      palettenSumme,
      frachtSumme,
      dieselzuschlagProzent,
      dieselzuschlagSumme,
      dieselStandDatum: basis.dieselStandDatum,
      nettoSumme,
      ustSatzProzent: UST_SATZ * 100,
      ustSumme,
      bruttoSumme,
    },
  };
}
