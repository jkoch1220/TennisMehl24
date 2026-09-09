/**
 * frachtrechnerLogik.test.ts — die Preislogik hinter dem Kunden-Frachtrechner.
 *
 * Der Rechner zeigt einem Kunden mit gültigem Link eine Zahl, die er für
 * verbindlich hält. Zwei Dinge dürfen deshalb nie unbemerkt kippen:
 *
 * 1. **Die Mengendegression.** Raben staffelt: fünf Paletten kosten deutlich
 *    weniger als das Fünffache einer einzelnen. Die Angebotserstellung
 *    (`anfrageVerarbeitungService.ts:987` und `:1159`) rechnet heute
 *    `berechneSpeditionskosten(plz, 1000) * tonnage` und verliert genau diese
 *    Eigenschaft. Der Test unten hält sie für den Rechner fest.
 * 2. **Die Verschwiegenheit der Antwort.** Basispreis, Zone, Gewichtsstufe,
 *    Aufschlagshöhe und Speditionsname sind Einkaufskonditionen. Wer ein Feld
 *    ins Ergebnis ergänzt, gibt es an jeden Kunden mit Link weiter — der
 *    Feldtest ganz unten schlägt dann fehl.
 *
 * Die Erwartungswerte sind aus dem echten Tarif ausgerechnet (Raben, "Tarif
 * Deutschland ab 16.01.2026", Ladestelle 97828 Marktheidenfeld) und bewusst als
 * Literale hinterlegt: eine Tarifänderung soll hier auffallen, nicht stillschweigend
 * mitwandern.
 */
import { describe, it, expect } from 'vitest';
import {
  berechneKundenFracht,
  istDeutschePLZ,
  MAX_PALETTEN,
  KG_PRO_PALETTE,
  UST_SATZ,
  FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  DIESEL_STAND_CENT_DEFAULT,
  DIESEL_STAND_DATUM_DEFAULT,
  type FrachtrechnerPreisbasis,
} from '../lib/frachtrechnerLogik';
import {
  RABEN_TARIF_BIS_5T,
  RABEN_TARIF_AB_5T,
  PLZ_ZU_FRACHTZONE,
  PLZ_ZU_DEZONE,
} from '../../../src/constants/rabenPricing';

/**
 * Preisbasis für alle Tests. Die Werte sind fixiert, damit die Erwartungswerte
 * nachrechenbar bleiben, wenn im Artikelstamm die Preise steigen.
 */
const BASIS: FrachtrechnerPreisbasis = {
  preisSackwareProTonne: 155,
  preisPaletteProStueck: 12.5,
  frachtAufschlagProzent: FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  dieselStandCent: DIESEL_STAND_CENT_DEFAULT,
  dieselStandDatum: DIESEL_STAND_DATUM_DEFAULT,
};

/** 97828 Marktheidenfeld — Ladestelle selbst, PLZ-Präfix 97 → Frachtzone 1 */
const PLZ_ZONE_1 = '97828';

const rechne = (
  paletten: number,
  zielPLZ = PLZ_ZONE_1,
  basis: Partial<FrachtrechnerPreisbasis> = {}
) => berechneKundenFracht({ paletten, koernung: '0-2', zielPLZ }, { ...BASIS, ...basis });

/** Wirft, wenn die Berechnung fehlschlug — spart in jedem Test das `!`. */
const ergebnisVon = (...args: Parameters<typeof rechne>) => {
  const antwort = rechne(...args);
  expect(antwort.ok, `unerwarteter Fehler: ${antwort.fehler} ${antwort.fehlertext ?? ''}`).toBe(true);
  return antwort.ergebnis!;
};

describe('berechneKundenFracht — gültige Berechnung', () => {
  it('rechnet 1 Palette nach 97828 exakt nach dem Tarif durch', () => {
    const e = ergebnisVon(1);

    // Material: 1 Palette = 1.000 kg = 1 t × 155,00 €/t
    expect(e.tonnen).toBe(1);
    expect(e.materialProTonne).toBe(155);
    expect(e.materialSumme).toBe(155);

    // Einwegpalette: 1 × 12,50 €
    expect(e.palettenSumme).toBe(12.5);

    // Fracht: Zone 1, 1 Palette = 71,44 € Basispreis × 1,15 Aufschlag = 82,156 → 82,16 €
    expect(RABEN_TARIF_BIS_5T[0].preiseNachZone[1]).toBe(71.44);
    expect(e.frachtSumme).toBe(82.16);

    // Dieselfloater bei 155,0 ct/L: Stufe "> 30 %" → 7,5 % auf die VERKAUFSfracht
    expect(e.dieselzuschlagProzent).toBe(7.5);
    expect(e.dieselzuschlagSumme).toBe(6.16);
    expect(e.dieselStandDatum).toBe('09.09.2026');

    // 155,00 + 12,50 + 82,16 + 6,16 = 255,82 netto
    expect(e.nettoSumme).toBe(255.82);
    expect(e.ustSatzProzent).toBe(19);
    expect(e.ustSumme).toBe(48.61);
    expect(e.bruttoSumme).toBe(304.43);
  });

  it('leitet die Bezeichnung aus der Körnung ab', () => {
    expect(ergebnisVon(1).bezeichnung).toBe('Tennismehl 0/2 mm gesackt, 25 × 40 kg je Palette');

    const grob = berechneKundenFracht({ paletten: 1, koernung: '0-3', zielPLZ: PLZ_ZONE_1 }, BASIS);
    expect(grob.ergebnis?.koernung).toBe('0-3');
    expect(grob.ergebnis?.bezeichnung).toBe('Tennismehl 0/3 mm gesackt, 25 × 40 kg je Palette');
  });

  it('rechnet 1.000 kg je Palette — auch an der Obergrenze', () => {
    expect(ergebnisVon(MAX_PALETTEN).tonnen).toBe((MAX_PALETTEN * KG_PRO_PALETTE) / 1000);
    expect(ergebnisVon(MAX_PALETTEN).paletten).toBe(24);
  });

  it('rechnet den Dieselzuschlag auf die Verkaufsfracht, nicht auf den Einkauf', () => {
    // Sonst bliebe uns der Floater-Anteil auf unserem Aufschlag als Verlust.
    const e = ergebnisVon(7);
    expect(e.dieselzuschlagSumme).toBe(
      Math.round(e.frachtSumme * (e.dieselzuschlagProzent / 100) * 100) / 100
    );
  });

  it('lässt den Dieselzuschlag bei niedrigem Dieselstand ganz weg', () => {
    // ≤ 120,75 ct/L ist die Nullstufe des Raben-Floaters.
    const e = ergebnisVon(1, PLZ_ZONE_1, { dieselStandCent: 118 });
    expect(e.dieselzuschlagProzent).toBe(0);
    expect(e.dieselzuschlagSumme).toBe(0);
    expect(e.nettoSumme).toBe(Math.round((155 + 12.5 + e.frachtSumme) * 100) / 100);
  });

  it('wirkt der Frachtaufschlag multiplikativ auf den Basispreis', () => {
    const ohne = ergebnisVon(1, PLZ_ZONE_1, { frachtAufschlagProzent: 0 });
    const mit = ergebnisVon(1, PLZ_ZONE_1, { frachtAufschlagProzent: 30 });
    expect(ohne.frachtSumme).toBe(71.44);
    expect(mit.frachtSumme).toBe(Math.round(71.44 * 1.3 * 100) / 100);
  });

  it('akzeptiert eine PLZ mit umgebenden Leerzeichen', () => {
    const e = berechneKundenFracht({ paletten: 1, koernung: '0-2', zielPLZ: '  97828 ' }, BASIS);
    expect(e.ok).toBe(true);
    expect(e.ergebnis?.frachtSumme).toBe(82.16);
  });
});

describe('Mengendegression', () => {
  /**
   * Der eigentliche Grund für diesen Rechner. Raben staffelt nach Sendungsgröße;
   * wer die Palette einzeln hochrechnet, verlangt in Zone 1 das 2,5-fache.
   */
  it('kosten 5 Paletten weniger als 5 × 1 Palette', () => {
    const einzeln = ergebnisVon(1).frachtSumme;
    const fuenf = ergebnisVon(5).frachtSumme;

    expect(fuenf).toBe(164.69); // 143,21 € × 1,15
    expect(fuenf).toBeLessThan(einzeln * 5); // 164,69 < 410,80
    // Die Abweichung ist keine Nachkommastelle, sondern der halbe Frachtpreis.
    expect(fuenf).toBeLessThan(einzeln * 5 * 0.5);
  });

  it('sinkt der Frachtpreis je Palette mit jeder weiteren Palette (bis 5 t)', () => {
    const jePalette = [1, 2, 3, 4, 5].map((p) => ergebnisVon(p).frachtSumme / p);
    for (let i = 1; i < jePalette.length; i++) {
      expect(jePalette[i]).toBeLessThan(jePalette[i - 1]);
    }
  });

  it('bleibt die Degression über alle Frachtzonen erhalten', () => {
    // Ein Tarifpflegefehler in einer einzelnen Zone fiele sonst niemandem auf.
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      const plz = `${prefix}123`;
      expect(ergebnisVon(5, plz).frachtSumme, `Zone hinter PLZ ${plz}`).toBeLessThan(
        ergebnisVon(1, plz).frachtSumme * 5
      );
    }
  });
});

describe('Grenze zwischen Zonentarif (bis 5 t) und PLZ-Tarif (ab 6 t)', () => {
  const zone = PLZ_ZU_FRACHTZONE['97'];
  const deZone = PLZ_ZU_DEZONE['97'];

  it('nutzen 5 Paletten den Zonentarif', () => {
    const basispreis = RABEN_TARIF_BIS_5T.find((t) => t.paletten === 5)!.preiseNachZone[zone];
    expect(ergebnisVon(5).frachtSumme).toBe(Math.round(basispreis * 1.15 * 100) / 100);
  });

  it('nutzen 6 Paletten den PLZ-Tarif mit der Gewichtsstufe 6.000 kg', () => {
    const basispreis = RABEN_TARIF_AB_5T[deZone][6000];
    expect(ergebnisVon(6).frachtSumme).toBe(Math.round(basispreis * 1.15 * 100) / 100);
  });

  it('liefern beide Seiten der Grenze ein vollständiges Ergebnis', () => {
    for (const paletten of [5, 6]) {
      const e = ergebnisVon(paletten);
      expect(e.paletten).toBe(paletten);
      expect(e.frachtSumme).toBeGreaterThan(0);
      expect(e.bruttoSumme).toBeGreaterThan(e.nettoSumme);
    }
  });

  it('liefert jede Palettenzahl von 1 bis 24 in jeder bekannten Zone einen Preis', () => {
    // Deckt die Gewichtsstufen 6.000–24.000 kg vollständig ab: eine Lücke in
    // RABEN_TARIF_AB_5T ergäbe sonst live ein „kein Tarif vorhanden".
    for (const prefix of Object.keys(PLZ_ZU_DEZONE)) {
      for (let p = 1; p <= MAX_PALETTEN; p++) {
        expect(rechne(p, `${prefix}123`).ok, `${p} Paletten nach ${prefix}123`).toBe(true);
      }
    }
  });
});

describe('PLZ-Prüfung', () => {
  it.each(['123', '', '   ', '1010', '978281', '9782a', 'ABCDE'])(
    'weist "%s" als ungültige PLZ ab',
    (plz) => {
      const antwort = berechneKundenFracht({ paletten: 1, koernung: '0-2', zielPLZ: plz }, BASIS);
      expect(antwort.ok).toBe(false);
      expect(antwort.fehler).toBe('PLZ_UNGUELTIG');
      expect(antwort.ergebnis).toBeUndefined();
      expect(antwort.fehlertext).toBeTruthy();
    }
  );

  it('lehnt die vierstellige Wiener 1010 ab, statt sie als Berlin zu berechnen', () => {
    // berechneRabenFracht nimmt kommentarlos substring(0,2) — "10" wäre DE10.
    expect(rechne(1, '1010').fehler).toBe('PLZ_UNGUELTIG');
    expect(istDeutschePLZ('1010')).toBe(false);
    expect(istDeutschePLZ('97828')).toBe(true);
    expect(istDeutschePLZ(' 97828 ')).toBe(true);
  });

  it.each([1, 5, 6, 24])(
    'meldet die fünfstellige, aber tariflich unbekannte 05123 bei %i Paletten als PLZ_UNBEKANNT',
    (paletten) => {
      // Präfix "05" fehlt in beiden Tariftabellen (ebenso 00, 11, 43, 62) —
      // die PLZ ist formal gültig, ein Preis liegt uns aber nicht vor.
      expect(PLZ_ZU_FRACHTZONE['05']).toBeUndefined();
      expect(PLZ_ZU_DEZONE['05']).toBeUndefined();

      const antwort = rechne(paletten, '05123');
      expect(antwort.ok).toBe(false);
      expect(antwort.fehler).toBe('PLZ_UNBEKANNT');
      expect(antwort.fehlertext).toContain('rufen Sie uns an');
    }
  );
});

describe('Palettenzahl', () => {
  it.each([0, -1, -5, 25, 100, NaN, Infinity])('weist %p als Palettenzahl ab', (paletten) => {
    const antwort = rechne(paletten);
    expect(antwort.ok).toBe(false);
    expect(antwort.fehler).toBe('PALETTEN_UNGUELTIG');
    expect(antwort.ergebnis).toBeUndefined();
    expect(antwort.fehlertext).toContain(String(MAX_PALETTEN));
  });

  it('schneidet Nachkommastellen ab, statt die Eingabe abzulehnen', () => {
    // Eine halbe Palette gibt es nicht; 1,5 wird zu 1 und muss gültig bleiben.
    expect(ergebnisVon(1.5).paletten).toBe(1);
    expect(ergebnisVon(1.5).frachtSumme).toBe(ergebnisVon(1).frachtSumme);
    expect(ergebnisVon(24.9).paletten).toBe(24);
  });

  it('lehnt 0,5 ab, weil das getrunkt 0 Paletten wären', () => {
    expect(rechne(0.5).fehler).toBe('PALETTEN_UNGUELTIG');
  });

  it('lässt genau 1 bis MAX_PALETTEN zu', () => {
    expect(rechne(1).ok).toBe(true);
    expect(rechne(MAX_PALETTEN).ok).toBe(true);
    expect(rechne(MAX_PALETTEN + 1).ok).toBe(false);
  });
});

describe('Rundung und Summenkonsistenz', () => {
  /**
   * `Number.isInteger(wert * 100)` wäre der naheliegende Test — und er wäre
   * falsch: 303,65 × 100 ergibt in IEEE-754 30364.999999999996. Über den
   * gesamten Tarif stolpern so 1.353 von 25.080 korrekt gerundeten Beträgen.
   * Geprüft wird deshalb, ob ein Betrag seiner eigenen Cent-Rundung entspricht.
   */
  const aufCentGerundet = (wert: number): boolean => Math.round(wert * 100) / 100 === wert;

  const geldfelder = (paletten: number, plz: string) => {
    const e = ergebnisVon(paletten, plz);
    return {
      e,
      betraege: {
        materialSumme: e.materialSumme,
        palettenSumme: e.palettenSumme,
        frachtSumme: e.frachtSumme,
        dieselzuschlagSumme: e.dieselzuschlagSumme,
        nettoSumme: e.nettoSumme,
        ustSumme: e.ustSumme,
        bruttoSumme: e.bruttoSumme,
      },
    };
  };

  it('hat jeder Geldbetrag höchstens zwei Nachkommastellen — in jeder Zone, für jede Menge', () => {
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      for (const paletten of [1, 3, 5, 6, 13, 17, 19, 24]) {
        const { betraege } = geldfelder(paletten, `${prefix}123`);
        for (const [feld, betrag] of Object.entries(betraege)) {
          expect(aufCentGerundet(betrag), `${feld} bei ${paletten} Pal. nach ${prefix}123 = ${betrag}`).toBe(true);
        }
      }
    }
  });

  it('ergibt netto exakt Material + Paletten + Fracht + Dieselzuschlag', () => {
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      for (const paletten of [1, 5, 6, 24]) {
        const { e } = geldfelder(paletten, `${prefix}123`);
        const cent = (w: number) => Math.round(w * 100);
        expect(
          cent(e.materialSumme) + cent(e.palettenSumme) + cent(e.frachtSumme) + cent(e.dieselzuschlagSumme),
          `Netto bei ${paletten} Pal. nach ${prefix}123`
        ).toBe(cent(e.nettoSumme));
        expect(cent(e.nettoSumme) + cent(e.ustSumme)).toBe(cent(e.bruttoSumme));
      }
    }
  });

  it('rechnet die Umsatzsteuer mit 19 % auf den Nettobetrag', () => {
    const e = ergebnisVon(9, '10115');
    expect(e.ustSatzProzent).toBe(UST_SATZ * 100);
    expect(e.ustSumme).toBe(Math.round(e.nettoSumme * UST_SATZ * 100) / 100);
  });
});

describe('Palettenpreis 0', () => {
  it('ergibt eine Palettensumme von 0 — die Seite blendet die Zeile dann aus', () => {
    const e = ergebnisVon(7, PLZ_ZONE_1, { preisPaletteProStueck: 0 });
    expect(e.palettenPreisProStueck).toBe(0);
    expect(e.palettenSumme).toBe(0);
    expect(e.nettoSumme).toBe(
      Math.round((e.materialSumme + e.frachtSumme + e.dieselzuschlagSumme) * 100) / 100
    );
  });

  it('unterscheidet sich die Nettosumme genau um den Palettenanteil', () => {
    const mit = ergebnisVon(4);
    const ohne = ergebnisVon(4, PLZ_ZONE_1, { preisPaletteProStueck: 0 });
    expect(Math.round((mit.nettoSumme - ohne.nettoSumme) * 100) / 100).toBe(4 * 12.5);
  });
});

describe('Verschwiegenheit der Antwort', () => {
  /**
   * Diese Zahlen sind Einkaufskonditionen. Sie gehören in keine Antwort, die
   * über einen öffentlichen Link abrufbar ist.
   */
  const ERLAUBTE_FELDER = [
    'paletten',
    'tonnen',
    'koernung',
    'bezeichnung',
    'materialProTonne',
    'materialSumme',
    'palettenPreisProStueck',
    'palettenSumme',
    'frachtSumme',
    'dieselzuschlagProzent',
    'dieselzuschlagSumme',
    'dieselStandDatum',
    'nettoSumme',
    'ustSatzProzent',
    'ustSumme',
    'bruttoSumme',
  ];

  it('enthält das Ergebnis exakt die freigegebenen Felder', () => {
    expect(Object.keys(ergebnisVon(6)).sort()).toEqual([...ERLAUBTE_FELDER].sort());
  });

  it('nennt das Ergebnis weder Basispreis noch Zone, Gewichtsstufe, Aufschlag oder Spedition', () => {
    const serialisiert = JSON.stringify(rechne(6)).toLowerCase();
    for (const verraeter of ['raben', 'basispreis', 'zone', 'gewichtsstufe', 'aufschlag', 'tarif', 'preisprokg']) {
      expect(serialisiert, `„${verraeter}" steht in der Kundenantwort`).not.toContain(verraeter);
    }
  });

  it('gibt auch der Fehlerfall keinen Tarif preis', () => {
    const serialisiert = JSON.stringify(rechne(1, '05123')).toLowerCase();
    expect(serialisiert).not.toContain('raben');
    expect(serialisiert).not.toContain('zone');
  });
});
