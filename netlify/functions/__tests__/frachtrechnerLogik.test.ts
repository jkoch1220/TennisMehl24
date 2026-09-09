/**
 * frachtrechnerLogik.test.ts — die Preislogik hinter dem ÖFFENTLICHEN Frachtrechner.
 *
 * Seit dem Umbau ist /frachtrechner ein Werkzeug ohne Login, ohne Token und ohne
 * Kunde: es rechnet ausschließlich Frachtpreise. Kein Material, keine
 * Einwegpaletten, keine Körnung. Drei Dinge dürfen deshalb nie unbemerkt kippen:
 *
 * 1. **Die Mengendegression.** Raben staffelt nach Sendungsgröße: fünf Paletten
 *    kosten deutlich weniger als das Fünffache einer einzelnen. Die
 *    Angebotserstellung (`anfrageVerarbeitungService.ts:987` und `:1159`) rechnet
 *    `berechneSpeditionskosten(plz, 1000) * tonnage` und verliert genau diese
 *    Eigenschaft. Der Test unten hält sie für den Rechner fest.
 * 2. **Das Dieselfenster.** Die Appwrite-Historie führte am 09.09.2026 Werte bis
 *    248 ct/L. Eine Live-Abfrage bei Tankerkönig am 09.09.2026 bestätigte dieses
 *    Niveau (231,5 ct/L im Mittel) — die Werte sind also ECHT, nicht kaputt.
 *    Das Plausibilitätsfenster ist deshalb weit gefasst: Es fängt nur noch
 *    Einheitenfehler ab (EUR-Wert, der ein zweites Mal mit 100 multipliziert
 *    wird), nicht ein vermeintlich „zu hohes" Marktniveau.
 * 3. **Die Verschwiegenheit der Antwort.** Basispreis, Zone, Gewichtsstufe,
 *    Aufschlagshöhe und Speditionsname sind Einkaufskonditionen. Wer ein Feld ins
 *    Ergebnis ergänzt, gibt es an jeden weiter, der die Seite öffnet — der
 *    Feldtest ganz unten schlägt dann fehl.
 *
 * Die Erwartungswerte stammen aus dem echten Tarif (Raben, "Tarif Deutschland ab
 * 16.01.2026", Ladestelle 97828 Marktheidenfeld). Die Leitfälle sind bewusst als
 * Literale hinterlegt: eine Tarifänderung soll hier auffallen, nicht stillschweigend
 * mitwandern.
 */
import { describe, it, expect } from 'vitest';
import {
  berechneKundenFracht,
  pruefeDieselCent,
  istDeutschePLZ,
  MAX_PALETTEN,
  KG_PRO_PALETTE,
  UST_SATZ,
  FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  DIESEL_FALLBACK_CENT,
  DIESEL_MIN_CENT,
  DIESEL_MAX_CENT,
  type FrachtrechnerPreisbasis,
} from '../lib/frachtrechnerLogik';
import {
  RABEN_TARIF_BIS_5T,
  RABEN_TARIF_AB_5T,
  PLZ_ZU_FRACHTZONE,
  PLZ_ZU_DEZONE,
} from '../../../src/constants/rabenPricing';

/**
 * Preisbasis für alle Tests. Fixiert, damit die Erwartungswerte nachrechenbar
 * bleiben, wenn sich der tagesaktuelle Dieselpreis bewegt.
 */
const BASIS: FrachtrechnerPreisbasis = {
  frachtAufschlagProzent: FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  dieselCent: DIESEL_FALLBACK_CENT,
  dieselStand: '09.09.2026',
};

/** 97828 Marktheidenfeld — Ladestelle selbst, PLZ-Präfix 97 → Frachtzone 1 / DE97 */
const PLZ_ZONE_1 = '97828';

/** Kaufmännische Cent-Rundung, identisch zur Logik (vermeidet 0,1+0,2-Artefakte). */
const aufCent = (wert: number): number => Math.round((wert + Number.EPSILON) * 100) / 100;

const rechne = (
  paletten: number,
  zielPLZ = PLZ_ZONE_1,
  basis: Partial<FrachtrechnerPreisbasis> = {}
) => berechneKundenFracht({ paletten, zielPLZ }, { ...BASIS, ...basis });

/** Wirft, wenn die Berechnung fehlschlug — spart in jedem Test das `!`. */
const ergebnisVon = (...args: Parameters<typeof rechne>) => {
  const antwort = rechne(...args);
  expect(antwort.ok, `unerwarteter Fehler: ${antwort.fehler} ${antwort.fehlertext ?? ''}`).toBe(
    true
  );
  return antwort.ergebnis!;
};

describe('berechneKundenFracht — gültige Berechnung', () => {
  it('rechnet 1 Palette nach 97828 exakt nach dem Tarif durch', () => {
    const e = ergebnisVon(1);

    expect(e.paletten).toBe(1);
    expect(e.gewichtKg).toBe(KG_PRO_PALETTE);
    expect(e.zielPLZ).toBe(PLZ_ZONE_1);

    // Fracht: Zone 1, 1 Palette = 71,44 € Basispreis × 1,15 Aufschlag = 82,156 → 82,16 €
    expect(RABEN_TARIF_BIS_5T[0].preiseNachZone[1]).toBe(71.44);
    expect(e.frachtSumme).toBe(82.16);

    // Dieselfloater bei 230,0 ct/L: Stufe „> 95 %" → 23,75 % auf die VERKAUFSfracht
    expect(e.dieselzuschlagProzent).toBe(23.75);
    expect(e.dieselzuschlagSumme).toBe(19.51);
    expect(e.dieselStand).toBe('09.09.2026');

    // 82,16 + 19,51 = 101,67 netto
    expect(e.nettoSumme).toBe(101.67);
    expect(e.ustSatzProzent).toBe(19);
    expect(e.ustSumme).toBe(19.32); // 19 % von 101,67 = 19,3173
    expect(e.bruttoSumme).toBe(120.99);
    expect(e.nettoJePalette).toBe(101.67);
  });

  it('rechnet 1.000 kg je Palette — auch an der Obergrenze', () => {
    const e = ergebnisVon(MAX_PALETTEN);
    expect(e.paletten).toBe(24);
    expect(e.gewichtKg).toBe(MAX_PALETTEN * KG_PRO_PALETTE);
  });

  it('rechnet den Dieselzuschlag auf die Verkaufsfracht, nicht auf den Einkauf', () => {
    // Sonst bliebe uns der Floater-Anteil auf unserem Aufschlag als Verlust.
    const e = ergebnisVon(7);
    expect(e.dieselzuschlagSumme).toBe(aufCent(e.frachtSumme * (e.dieselzuschlagProzent / 100)));
  });

  it('lässt den Dieselzuschlag bei niedrigem Dieselstand ganz weg', () => {
    // ≤ 120,75 ct/L ist die Nullstufe des Raben-Floaters — und liegt noch im
    // Plausibilitätsfenster, wird also nicht durch den Fallback ersetzt.
    const e = ergebnisVon(1, PLZ_ZONE_1, { dieselCent: 118 });
    expect(e.dieselzuschlagProzent).toBe(0);
    expect(e.dieselzuschlagSumme).toBe(0);
    expect(e.nettoSumme).toBe(e.frachtSumme);
  });

  it('wirkt der Frachtaufschlag multiplikativ auf den Basispreis', () => {
    const ohne = ergebnisVon(1, PLZ_ZONE_1, { frachtAufschlagProzent: 0 });
    const mit = ergebnisVon(1, PLZ_ZONE_1, { frachtAufschlagProzent: 30 });
    expect(ohne.frachtSumme).toBe(71.44);
    expect(mit.frachtSumme).toBe(aufCent(71.44 * 1.3));
  });

  it('akzeptiert eine PLZ mit umgebenden Leerzeichen und gibt sie getrimmt zurück', () => {
    const antwort = berechneKundenFracht({ paletten: 1, zielPLZ: '  97828 ' }, BASIS);
    expect(antwort.ok).toBe(true);
    expect(antwort.ergebnis?.zielPLZ).toBe('97828');
    expect(antwort.ergebnis?.frachtSumme).toBe(82.16);
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

  it('bleibt die Degression über alle Frachtzonen erhalten', () => {
    // Ein Tarifpflegefehler in einer einzelnen Zone fiele sonst niemandem auf.
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      const plz = `${prefix}123`;
      expect(ergebnisVon(5, plz).frachtSumme, `Zone hinter PLZ ${plz}`).toBeLessThan(
        ergebnisVon(1, plz).frachtSumme * 5
      );
    }
  });

  it('sinkt der Frachtpreis je Palette mit jeder weiteren Palette (Zonentarif 1–5)', () => {
    const jePalette = [1, 2, 3, 4, 5].map((p) => ergebnisVon(p).frachtSumme / p);
    for (let i = 1; i < jePalette.length; i++) {
      expect(jePalette[i]).toBeLessThan(jePalette[i - 1]);
    }
  });

  it('sinkt der Frachtpreis je Palette auch im PLZ-Tarif (6–24) in jeder Zone', () => {
    for (const prefix of Object.keys(PLZ_ZU_DEZONE)) {
      const plz = `${prefix}123`;
      let vorher = Infinity;
      for (let p = 6; p <= MAX_PALETTEN; p++) {
        const jePalette = ergebnisVon(p, plz).frachtSumme / p;
        expect(jePalette, `${p} Paletten nach ${plz}`).toBeLessThan(vorher);
        vorher = jePalette;
      }
    }
  });
});

describe('nettoJePalette', () => {
  it('ist die auf Cent gerundete Nettosumme je Palette', () => {
    for (const paletten of [1, 3, 5, 6, 13, 24]) {
      const e = ergebnisVon(paletten, '10115');
      expect(e.nettoJePalette, `${paletten} Paletten`).toBe(aufCent(e.nettoSumme / paletten));
    }
  });

  it('sinkt innerhalb einer Tarifart mit steigender Palettenzahl', () => {
    // ACHTUNG: „innerhalb einer Tarifart". Über die 5-t-Grenze hinweg steigt der
    // Wert — 5 Paletten liegen bei 40,76 €/Pal., 6 Paletten bei 68,55 €/Pal.
    // Der Sprung ist echt (Zonentarif → PLZ-Tarif) und im Test unten festgehalten.
    const zonentarif = [1, 2, 3, 4, 5].map((p) => ergebnisVon(p).nettoJePalette);
    for (let i = 1; i < zonentarif.length; i++) {
      expect(zonentarif[i]).toBeLessThan(zonentarif[i - 1]);
    }

    const plzTarif = [6, 9, 12, 18, 24].map((p) => ergebnisVon(p).nettoJePalette);
    for (let i = 1; i < plzTarif.length; i++) {
      expect(plzTarif[i]).toBeLessThan(plzTarif[i - 1]);
    }
  });

  it('macht den Preissprung an der 5-t-Grenze sichtbar, statt ihn zu glätten', () => {
    // Die sechste Palette kostet mehr als die fünf davor zusammen. Wer das für
    // einen Rundungsfehler hält, muss hier vorbei.
    expect(ergebnisVon(5).nettoJePalette).toBe(40.76);
    expect(ergebnisVon(6).nettoJePalette).toBe(68.55);
    // 203,80 € für 5 Paletten, 411,28 € für 6 — die sechste kostet mehr Fracht
    // als die fünf davor zusammen.
    expect(ergebnisVon(5).nettoSumme).toBe(203.8);
    expect(ergebnisVon(6).nettoSumme).toBe(411.28);
  });
});

describe('Grenze zwischen Zonentarif (bis 5 t) und PLZ-Tarif (ab 6 t)', () => {
  const zone = PLZ_ZU_FRACHTZONE['97'];
  const deZone = PLZ_ZU_DEZONE['97'];

  it('nutzen 5 Paletten den Zonentarif', () => {
    const basispreis = RABEN_TARIF_BIS_5T.find((t) => t.paletten === 5)!.preiseNachZone[zone];
    expect(ergebnisVon(5).frachtSumme).toBe(aufCent(basispreis * 1.15));
  });

  it('nutzen 6 Paletten den PLZ-Tarif mit der Gewichtsstufe 6.000 kg', () => {
    const basispreis = RABEN_TARIF_AB_5T[deZone][6000];
    expect(ergebnisVon(6).frachtSumme).toBe(aufCent(basispreis * 1.15));
  });

  it('liefern beide Seiten der Grenze ein vollständiges Ergebnis, und 6 kostet mehr als 5', () => {
    const fuenf = ergebnisVon(5);
    const sechs = ergebnisVon(6);

    for (const e of [fuenf, sechs]) {
      expect(e.frachtSumme).toBeGreaterThan(0);
      expect(e.nettoSumme).toBeGreaterThan(0);
      expect(e.bruttoSumme).toBeGreaterThan(e.nettoSumme);
    }
    expect(fuenf.paletten).toBe(5);
    expect(sechs.paletten).toBe(6);
    expect(sechs.frachtSumme).toBeGreaterThan(fuenf.frachtSumme);
    expect(sechs.nettoSumme).toBeGreaterThan(fuenf.nettoSumme);
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
  it.each(['123', '', '   ', '1010', '9040a', '978281', '9782a', 'ABCDE'])(
    'weist "%s" als ungültige PLZ ab',
    (plz) => {
      const antwort = berechneKundenFracht({ paletten: 1, zielPLZ: plz }, BASIS);
      expect(antwort.ok).toBe(false);
      expect(antwort.fehler).toBe('PLZ_UNGUELTIG');
      expect(antwort.ergebnis).toBeUndefined();
      expect(antwort.fehlertext).toBeTruthy();
    }
  );

  it('lehnt die vierstellige Wiener 1010 ab, statt sie als Berlin zu berechnen', () => {
    // berechneRabenFracht nimmt kommentarlos substring(0,2) — „10" wäre DE10.
    expect(rechne(1, '1010').fehler).toBe('PLZ_UNGUELTIG');
    expect(istDeutschePLZ('1010')).toBe(false);
    expect(istDeutschePLZ('97828')).toBe(true);
    expect(istDeutschePLZ(' 97828 ')).toBe(true);
    expect(istDeutschePLZ('9040a')).toBe(false);
  });

  it.each([1, 5, 6, 24])(
    'meldet die fünfstellige, aber tariflich unbekannte 05123 bei %i Paletten als PLZ_UNBEKANNT',
    (paletten) => {
      // Präfix „05" fehlt in beiden Tariftabellen (ebenso 00, 11, 43, 62) —
      // die PLZ ist formal gültig, ein Preis liegt uns aber nicht vor.
      expect(PLZ_ZU_FRACHTZONE['05']).toBeUndefined();
      expect(PLZ_ZU_DEZONE['05']).toBeUndefined();

      const antwort = rechne(paletten, '05123');
      expect(antwort.ok).toBe(false);
      expect(antwort.fehler).toBe('PLZ_UNBEKANNT');
      expect(antwort.ergebnis).toBeUndefined();
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

  it('prüft die Palettenzahl vor der PLZ', () => {
    // Wer 0 Paletten und eine kaputte PLZ schickt, soll zuerst die Menge
    // korrigieren — sonst wandert der Nutzer im Kreis.
    expect(rechne(0, 'ABCDE').fehler).toBe('PALETTEN_UNGUELTIG');
  });
});

describe('pruefeDieselCent — Plausibilitätsfenster', () => {
  it('lässt einen realistischen Dieselpreis durch', () => {
    expect(pruefeDieselCent(230)).toEqual({ cent: 230, plausibel: true });
    expect(pruefeDieselCent(DIESEL_FALLBACK_CENT).plausibel).toBe(true);
  });

  it('lässt 248 ct/L durch — das Marktniveau 2026, kein Datenfehler', () => {
    // Frühere Fassung verwarf diesen Wert als „Ausreißer". Die Live-Abfrage bei
    // Tankerkönig (231,5 ct/L am 09.09.2026) zeigt: er ist echt. Ihn zu ersetzen
    // hätte dem Kunden einen zu niedrigen Dieselzuschlag ausgewiesen.
    const gepruef = pruefeDieselCent(248);
    expect(gepruef.plausibel).toBe(true);
    expect(gepruef.cent).toBe(248);
  });

  it.each([79.99, 0, -5, 500.01, 23150, 1e6])(
    'ersetzt den unplausiblen Wert %p durch den Richtwert',
    (wert) => {
      expect(pruefeDieselCent(wert)).toEqual({ cent: DIESEL_FALLBACK_CENT, plausibel: false });
    }
  );

  it.each([null, undefined, NaN, Infinity, -Infinity])(
    'fällt bei %p auf den Richtwert zurück',
    (wert) => {
      expect(pruefeDieselCent(wert as number | null | undefined)).toEqual({
        cent: DIESEL_FALLBACK_CENT,
        plausibel: false,
      });
    }
  );

  it('schließt die Grenzen 80 und 500 ein', () => {
    expect(pruefeDieselCent(DIESEL_MIN_CENT)).toEqual({ cent: DIESEL_MIN_CENT, plausibel: true });
    expect(pruefeDieselCent(DIESEL_MAX_CENT)).toEqual({ cent: DIESEL_MAX_CENT, plausibel: true });
    expect(DIESEL_MIN_CENT).toBe(80);
    expect(DIESEL_MAX_CENT).toBe(500);
    expect(pruefeDieselCent(DIESEL_MIN_CENT - 0.01).plausibel).toBe(false);
    expect(pruefeDieselCent(DIESEL_MAX_CENT + 0.01).plausibel).toBe(false);
  });
});

describe('Dieselzuschlag wirkt auf die Summe', () => {
  it('ergibt ein höherer Dieselstand einen höheren Zuschlag bei gleicher Fracht', () => {
    const niedrig = ergebnisVon(6, PLZ_ZONE_1, { dieselCent: 130 });
    const hoch = ergebnisVon(6, PLZ_ZONE_1, { dieselCent: 200 });

    // Die Fracht selbst hängt nicht am Diesel — sonst wäre der Vergleich wertlos.
    expect(hoch.frachtSumme).toBe(niedrig.frachtSumme);
    expect(hoch.dieselzuschlagProzent).toBeGreaterThan(niedrig.dieselzuschlagProzent);
    expect(hoch.dieselzuschlagSumme).toBeGreaterThan(niedrig.dieselzuschlagSumme);
    expect(hoch.nettoSumme).toBeGreaterThan(niedrig.nettoSumme);
    expect(hoch.bruttoSumme).toBeGreaterThan(niedrig.bruttoSumme);
  });

  it('steigt der Zuschlag über das ganze Plausibilitätsfenster monoton', () => {
    let vorher = -1;
    for (let cent = DIESEL_MIN_CENT; cent <= DIESEL_MAX_CENT; cent += 5) {
      const prozent = ergebnisVon(3, PLZ_ZONE_1, { dieselCent: cent }).dieselzuschlagProzent;
      expect(prozent, `${cent} ct/L`).toBeGreaterThanOrEqual(vorher);
      vorher = prozent;
    }
  });

  it('reicht den Anzeigetext des Dieselstands unverändert durch', () => {
    expect(ergebnisVon(2, PLZ_ZONE_1, { dieselStand: 'Richtwert' }).dieselStand).toBe('Richtwert');
  });
});

describe('Rundung und Summenkonsistenz', () => {
  /**
   * `Number.isInteger(wert * 100)` wäre der naheliegende Test — und er wäre
   * falsch: 303,65 × 100 ergibt in IEEE-754 30364.999999999996. Geprüft wird
   * deshalb, ob ein Betrag seiner eigenen Cent-Rundung entspricht.
   */
  const aufCentGerundet = (wert: number): boolean => Math.round(wert * 100) / 100 === wert;

  const MENGEN = [1, 3, 5, 6, 13, 17, 19, 24];

  it('hat jeder Geldbetrag höchstens zwei Nachkommastellen — in jeder Zone, für jede Menge', () => {
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      for (const paletten of MENGEN) {
        const e = ergebnisVon(paletten, `${prefix}123`);
        const betraege = {
          frachtSumme: e.frachtSumme,
          dieselzuschlagSumme: e.dieselzuschlagSumme,
          nettoSumme: e.nettoSumme,
          ustSumme: e.ustSumme,
          bruttoSumme: e.bruttoSumme,
          nettoJePalette: e.nettoJePalette,
        };
        for (const [feld, betrag] of Object.entries(betraege)) {
          expect(
            aufCentGerundet(betrag),
            `${feld} bei ${paletten} Pal. nach ${prefix}123 = ${betrag}`
          ).toBe(true);
        }
      }
    }
  });

  it('ergibt netto exakt Fracht + Dieselzuschlag und brutto netto + USt', () => {
    const cent = (w: number) => Math.round(w * 100);
    for (const prefix of Object.keys(PLZ_ZU_FRACHTZONE)) {
      for (const paletten of [1, 5, 6, 24]) {
        const e = ergebnisVon(paletten, `${prefix}123`);
        expect(
          cent(e.frachtSumme) + cent(e.dieselzuschlagSumme),
          `Netto bei ${paletten} Pal. nach ${prefix}123`
        ).toBe(cent(e.nettoSumme));
        expect(
          cent(e.nettoSumme) + cent(e.ustSumme),
          `Brutto bei ${paletten} Pal. nach ${prefix}123`
        ).toBe(cent(e.bruttoSumme));
      }
    }
  });

  it('rechnet die Umsatzsteuer mit 19 % auf den Nettobetrag', () => {
    const e = ergebnisVon(9, '10115');
    expect(e.ustSatzProzent).toBe(UST_SATZ * 100);
    expect(e.ustSumme).toBe(aufCent(e.nettoSumme * UST_SATZ));
  });
});

describe('Verschwiegenheit der Antwort', () => {
  /**
   * Diese Zahlen sind Einkaufskonditionen. Sie gehören in keine Antwort, die
   * über einen öffentlichen Link ohne Login abrufbar ist.
   */
  const ERLAUBTE_FELDER = [
    'paletten',
    'gewichtKg',
    'zielPLZ',
    'frachtSumme',
    'dieselzuschlagProzent',
    'dieselzuschlagSumme',
    'dieselStand',
    'nettoSumme',
    'ustSatzProzent',
    'ustSumme',
    'bruttoSumme',
    'nettoJePalette',
  ];

  it('enthält das Ergebnis exakt die freigegebenen Felder', () => {
    expect(Object.keys(ergebnisVon(6)).sort()).toEqual([...ERLAUBTE_FELDER].sort());
  });

  it('nennt das Ergebnis weder Basispreis noch Zone, Gewichtsstufe, Aufschlag oder Spedition', () => {
    const serialisiert = JSON.stringify(rechne(6)).toLowerCase();
    for (const verraeter of [
      'raben',
      'basispreis',
      'zone',
      'gewichtsstufe',
      'aufschlag',
      'tarif',
      'preisprokg',
      'preispropalette',
    ]) {
      expect(serialisiert, `„${verraeter}" steht in der öffentlichen Antwort`).not.toContain(
        verraeter
      );
    }
  });

  it('gibt auch der Fehlerfall keinen Tarif preis', () => {
    for (const antwort of [rechne(1, '05123'), rechne(0), rechne(1, '1010')]) {
      const serialisiert = JSON.stringify(antwort).toLowerCase();
      expect(serialisiert).not.toContain('raben');
      expect(serialisiert).not.toContain('zone');
      expect(serialisiert).not.toContain('basispreis');
    }
  });
});
