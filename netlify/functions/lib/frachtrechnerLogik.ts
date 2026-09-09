/**
 * frachtrechnerLogik.ts — Preislogik des öffentlichen Frachtkostenrechners
 *
 * WARUM DIESE DATEI UNTER netlify/functions/lib/ LIEGT UND NICHT UNTER src/:
 * Sie importiert den Raben-Haustarif (src/constants/rabenPricing.ts). Läge sie
 * unter src/ und würde von der öffentlichen Seite importiert, bündelte Vite die
 * kompletten Einkaufskonditionen (1.805 PLZ-Preise + 60 Zonenpreise) in ein
 * Client-Bundle, das jeder auslesen kann. Hier landet der Tarif ausschließlich
 * im Function-Bundle auf dem Server.
 *
 * Die öffentliche Seite src/pages/Frachtrechner.tsx bekommt NUR Ergebniszahlen —
 * niemals Basispreis, Zone, Gewichtsstufe, Aufschlagshöhe oder den Namen der
 * Spedition.
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
 * Er ist auf einer ÖFFENTLICHEN Seite doppelt wichtig: Ohne ihn wäre die
 * angezeigte Zahl der nackte Einkaufspreis, und jeder Wettbewerber könnte
 * unsere Speditionskonditionen abfragen.
 *
 * ACHTUNG — offene kaufmännische Entscheidung (Julian, 09.09.2026):
 * Die Angebotserstellung rechnet Sackwarenfracht anders, nämlich
 * `berechneSpeditionskosten(plz, 1000) * tonnage` (anfrageVerarbeitungService.ts:987
 * und :1159). Das ignoriert die Mengendegression von Raben und ergibt bei
 * 5 Paletten je nach Zone das 2,2- bis 2,5-fache des echten Frachtpreises.
 * Dieser Rechner nimmt bewusst die ECHTE Staffel plus diesen Aufschlag.
 */
export const FRACHT_AUFSCHLAG_PROZENT_DEFAULT = 15;

/**
 * Rückfallwert für den Dieselpreis in ct/L, wenn kein tagesaktueller Wert
 * ermittelt werden kann.
 *
 * Orientiert sich am realen Marktniveau: Eine Live-Abfrage bei Tankerkönig im
 * Umkreis Marktheidenfeld ergab am 09.09.2026 einen Mittelwert von 231,5 ct/L
 * über 19 offene Tankstellen (Spanne 224,9 bis 244,9). Der Wert ist bewusst
 * etwas darunter angesetzt — ein Rückfallwert soll im Zweifel nicht zu hoch
 * greifen.
 */
export const DIESEL_FALLBACK_CENT = 230;

/**
 * Plausibilitätsfenster für den Dieselpreis in ct/L.
 *
 * Das Fenster ist bewusst WEIT: Es soll ausschließlich echte Datenfehler
 * abfangen — vor allem den Einheitenfehler, bei dem ein Preis in ct statt in
 * EUR in der Collection landet und die Umrechnung ihn ein zweites Mal mit 100
 * multipliziert (aus 2,31 EUR/L würden 23.150 ct/L).
 *
 * Es darf NICHT versuchen, den Markt zu beurteilen. Ein erster Entwurf setzte
 * die Obergrenze auf 220 ct, weil deutscher Diesel „real bei 165 ct" liege —
 * das war ein veralteter Erfahrungswert. Tatsächlich lag der Preis am
 * 09.09.2026 bei rund 232 ct/L, sodass genau die korrekten Werte verworfen und
 * durch einen zu niedrigen Ersatz getauscht worden wären. Der Kunde hätte
 * dadurch einen zu günstigen Dieselzuschlag gesehen.
 */
export const DIESEL_MIN_CENT = 80;
export const DIESEL_MAX_CENT = 500;

export interface FrachtrechnerPreisbasis {
  /** Aufschlag auf den Speditions-Basispreis in Prozent */
  frachtAufschlagProzent: number;
  /** Dieselpreis in ct/L für den Floater */
  dieselCent: number;
  /** Anzeigetext für die Herkunft des Dieselpreises, z.B. "Stand 09.09.2026" */
  dieselStand: string;
}

export interface FrachtrechnerEingabe {
  paletten: number;
  zielPLZ: string;
}

/**
 * Ergebnis, das an den Kunden geht.
 *
 * Enthält BEWUSST NICHT: Speditions-Basispreis, Frachtzone, DE-Zone,
 * Gewichtsstufe, Aufschlagshöhe, Tarifart oder den Namen der Spedition.
 * Wer hier ein Feld ergänzt, gibt es an jeden weiter, der die Seite öffnet.
 */
export interface FrachtrechnerErgebnis {
  paletten: number;
  gewichtKg: number;
  zielPLZ: string;
  /** Fracht inklusive Aufschlag, ohne Dieselzuschlag */
  frachtSumme: number;
  /** Dieselzuschlag auf die Fracht, zum angegebenen Stand */
  dieselzuschlagProzent: number;
  dieselzuschlagSumme: number;
  dieselStand: string;
  nettoSumme: number;
  ustSatzProzent: number;
  ustSumme: number;
  bruttoSumme: number;
  /** Fracht je Palette — hilft dem Kunden, die Mengenstaffel zu sehen */
  nettoJePalette: number;
}

/** Rundet kaufmännisch auf 2 Nachkommastellen (vermeidet 0,1+0,2-Artefakte). */
const runde = (wert: number): number => Math.round((wert + Number.EPSILON) * 100) / 100;

export type FrachtrechnerFehler = 'PLZ_UNGUELTIG' | 'PLZ_UNBEKANNT' | 'PALETTEN_UNGUELTIG';

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

/**
 * Hält einen Dieselpreis im plausiblen Bereich.
 * Gibt den Fallback zurück, wenn der Wert fehlt oder außerhalb liegt.
 *
 * `plausibel: false` heißt „der gelieferte Wert war unbrauchbar" — der
 * Aufrufer weist dann keinen Datumsstand aus, sondern kennzeichnet die Zahl
 * als Richtwert.
 */
export function pruefeDieselCent(wert: number | null | undefined): {
  cent: number;
  plausibel: boolean;
} {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    return { cent: DIESEL_FALLBACK_CENT, plausibel: false };
  }
  if (wert < DIESEL_MIN_CENT || wert > DIESEL_MAX_CENT) {
    return { cent: DIESEL_FALLBACK_CENT, plausibel: false };
  }
  return { cent: wert, plausibel: true };
}

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
      fehlertext:
        'Bitte eine fünfstellige deutsche Postleitzahl eingeben. Für Lieferungen ins Ausland rufen Sie uns bitte an.',
    };
  }

  const gewichtKg = paletten * KG_PRO_PALETTE;
  const rohFracht = berechneRabenFracht(paletten, gewichtKg, plz, basis.dieselCent);
  if (!rohFracht) {
    return {
      ok: false,
      fehler: 'PLZ_UNBEKANNT',
      fehlertext:
        'Für diese Postleitzahl liegt uns kein Tarif vor. Bitte rufen Sie uns an — wir rechnen die Lieferung für Sie durch.',
    };
  }

  // Verkaufsfracht = Einkaufs-Basispreis + Aufschlag. Der Dieselfloater wird auf
  // die Verkaufsfracht gerechnet, nicht auf den Einkaufspreis: Raben stellt den
  // Floater auf seinen Basispreis, wir reichen ihn auf unseren Preis weiter.
  const aufschlagFaktor = 1 + basis.frachtAufschlagProzent / 100;
  const frachtSumme = runde(rohFracht.basispreis * aufschlagFaktor);

  const dieselzuschlagProzent = berechneRabenDieselzuschlag(basis.dieselCent);
  const dieselzuschlagSumme = runde(frachtSumme * (dieselzuschlagProzent / 100));

  const nettoSumme = runde(frachtSumme + dieselzuschlagSumme);
  const ustSumme = runde(nettoSumme * UST_SATZ);
  const bruttoSumme = runde(nettoSumme + ustSumme);

  return {
    ok: true,
    ergebnis: {
      paletten,
      gewichtKg,
      zielPLZ: plz,
      frachtSumme,
      dieselzuschlagProzent,
      dieselzuschlagSumme,
      dieselStand: basis.dieselStand,
      nettoSumme,
      ustSatzProzent: UST_SATZ * 100,
      ustSumme,
      bruttoSumme,
      nettoJePalette: runde(nettoSumme / paletten),
    },
  };
}
