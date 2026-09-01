import { describe, it, expect } from 'vitest';
import {
  berechnePositionsTonnen,
  summierePositionsTonnen,
  istTonnageRelevantePosition,
  erstelleArtikelIndex,
  normalisiereArtikelnummer,
  NICHT_MATERIAL_ARTIKEL,
} from '../tonnage';
import { istTonnagePosition, summiereTonnage } from '../angebotsTonnage';
import { TENNISMEHL_ARTIKEL } from '../../constants/artikelPreise';
import { KLASSIFIZIERUNG } from '../../../scripts/befuelle-artikel-stammfelder';
import { Artikel } from '../../types/artikel';

/** Artikelstamm-Attrappe aus der Befüll-Klassifizierung + Code-Einheiten. */
const stammArtikel: Artikel[] = Object.entries(KLASSIFIZIERUNG).map(([nummer, klasse], i) => ({
  $id: `art_${i}`,
  artikelnummer: nummer,
  bezeichnung: nummer,
  einheit:
    TENNISMEHL_ARTIKEL[nummer]?.einheit ??
    (nummer === 'TM-HYC-V' || nummer === 'TM-LKW-KR' ? 't' : 'Stk'),
  istTonnageRelevant: klasse.istTonnageRelevant,
  gewichtProStueckKg: klasse.gewichtProStueckKg ?? null,
  warengruppe: klasse.warengruppe,
  aktiv: true,
}));
const index = erstelleArtikelIndex(stammArtikel);

describe('normalisiereArtikelnummer', () => {
  it('löst die BB-Altnummern aus der BigBag-Fehlverkabelung auf', () => {
    expect(normalisiereArtikelnummer('TM-ZM-02BB')).toBe('TM-ZM-BIG-02');
    expect(normalisiereArtikelnummer('tm-zm-03bb')).toBe('TM-ZM-BIG-03');
    expect(normalisiereArtikelnummer(' TM-ZM-02St ')).toBe('TM-ZM-02ST');
  });
});

describe('Zweck fracht (preisrelevante Staffel-Semantik)', () => {
  it('zählt Ware in t, aber keine Pauschalen in t und keine Bedarfspositionen', () => {
    const positionen = [
      { artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10 },
      { artikelnummer: 'TM-HYC-V', einheit: 't', menge: 1 },
      { artikelnummer: 'TM-ZM-02', einheit: 't', menge: 5, istBedarfsposition: true },
      { artikelnummer: 'TM-PE', einheit: 'Stk', menge: 2 },
    ];
    expect(summierePositionsTonnen(positionen, 'fracht')).toBe(10);
    expect(summierePositionsTonnen(positionen, 'fracht', index)).toBe(10);
  });

  it('zählt Beiladungssäcke (Stk) NICHT — sie haben nie Fracht ausgelöst', () => {
    const sack = { artikelnummer: 'TM-ZM-02S', einheit: 'Stk', menge: 25 };
    expect(berechnePositionsTonnen(sack, 'fracht')).toBe(0);
    expect(berechnePositionsTonnen(sack, 'fracht', index)).toBe(0);
  });

  it('verhält sich ohne Index exakt wie die alte istTonnagePosition-Blockliste', () => {
    for (const nummer of NICHT_MATERIAL_ARTIKEL) {
      const pos = { artikelnummer: nummer, einheit: 't', menge: 3 };
      expect(istTonnageRelevantePosition(pos, 'fracht'), nummer).toBe(false);
    }
    expect(istTonnagePosition({ artikelnummer: 'TM-ZM-03', einheit: 'to', menge: 8 })).toBe(true);
    expect(summiereTonnage([{ artikelnummer: 'TM-ZM-03', einheit: 'to', menge: 8 }])).toBe(8);
  });

  it('liefert mit und ohne Artikel-Index dieselben Ergebnisse für den gesamten Bestand', () => {
    for (const artikel of stammArtikel) {
      const pos = { artikelnummer: artikel.artikelnummer, einheit: artikel.einheit, menge: 7 };
      expect(
        berechnePositionsTonnen(pos, 'fracht', index),
        `${artikel.artikelnummer} (${artikel.einheit})`
      ).toBe(berechnePositionsTonnen(pos, 'fracht'));
    }
  });
});

describe('Zweck auswertung (Saison-Tonnage)', () => {
  it('rechnet Beiladungssäcke über gewichtProStueckKg in Tonnen um', () => {
    const sack = { artikelnummer: 'TM-ZM-02S', einheit: 'Stk', menge: 25 };
    expect(berechnePositionsTonnen(sack, 'auswertung', index)).toBe(1); // 25 × 40 kg
    // auch ohne Index über die TENNISMEHL_ARTIKEL-Definition
    expect(berechnePositionsTonnen(sack, 'auswertung')).toBe(1);
  });

  it('rechnet kg-Positionen um und ignoriert Stück-Zubehör', () => {
    expect(berechnePositionsTonnen({ artikelnummer: 'TM-ZM-02', einheit: 'kg', menge: 500 }, 'auswertung', index)).toBe(0.5);
    expect(berechnePositionsTonnen({ artikelnummer: 'TM-PAL', einheit: 'Stk', menge: 4 }, 'auswertung', index)).toBe(0);
  });

  it('Regression Dashboard-Bug: „Stk"/„Std"/„Pkt" zählen nicht als Tonnen', () => {
    const positionen = [
      { artikelnummer: 'TM-PE', bezeichnung: 'PE-Folie', einheit: 'Stk', menge: 2 },
      { artikelnummer: 'ZM-FA', bezeichnung: 'Facharbeiter', einheit: 'Std', menge: 8 },
      { artikelnummer: 'TM-FP', bezeichnung: 'Frachtkostenpauschale', einheit: 'Pkt', menge: 1 },
    ];
    expect(summierePositionsTonnen(positionen, 'auswertung', index)).toBe(0);
  });

  it('erkennt das Gebinde von Stk-Altpositionen am Preis (Sack vs. Palette)', () => {
    // Palettenposition unter der Sack-Nummer (à 364,25 €) = 1000 kg/Stück …
    expect(
      berechnePositionsTonnen({ artikelnummer: 'TM-ZM-03S', einheit: 'Stk', menge: 3, einzelpreis: 364.25 }, 'auswertung', index)
    ).toBe(3);
    // … echte Säcke (à 8,50 €) bleiben 40 kg — auch unter der Paletten-Nummer.
    expect(
      berechnePositionsTonnen({ artikelnummer: 'TM-ZM-02St', einheit: 'Stk', menge: 50, einzelpreis: 8.5 }, 'auswertung', index)
    ).toBe(2);
  });

  it('zählt Shop-Positionen über die Gambio-Aliasse (99992 = Palette 0/2)', () => {
    const shopIndex = erstelleArtikelIndex([
      { $id: 's1', artikelnummer: 'TM-ZM-02St', bezeichnung: 'Palette', einheit: 't', istTonnageRelevant: true, gewichtProStueckKg: 1000, warengruppe: 'tennismehl', aktiv: true },
    ]);
    expect(
      berechnePositionsTonnen({ artikelnummer: '99992', einheit: 'Stk', menge: 9, einzelpreis: 351.18 }, 'auswertung', shopIndex)
    ).toBe(9);
  });

  it('löst Altnummern über die Alias-Tabelle auf', () => {
    const alt = { artikelnummer: 'TM-ZM-02BB', einheit: 't', menge: 2 };
    expect(berechnePositionsTonnen(alt, 'auswertung', index)).toBe(2);
    expect(berechnePositionsTonnen(alt, 'fracht', index)).toBe(2);
  });

  it('Zweck fracht bleibt bei exakt t/to — „Tonnen" zählt nur in der Auswertung', () => {
    // Eine Alt-Position in Einheit „Tonnen" darf die Frachtpauschale nicht
    // nachträglich verschieben (Review-Befund Stufe 2).
    const alt = { artikelnummer: '', bezeichnung: 'Ziegelmehl Sonderposten', einheit: 'Tonnen', menge: 8 };
    expect(berechnePositionsTonnen(alt, 'fracht')).toBe(0);
    expect(berechnePositionsTonnen(alt, 'auswertung')).toBe(8);
  });

  it('Freitext-Positionen ohne Artikelnummer matchen nie auf einen Stammartikel', () => {
    // Ein Artikel mit leerer Nummer im Index darf Freitext-Ware nicht
    // überstimmen (Review-Befund Stufe 2).
    const kaputterIndex = erstelleArtikelIndex([
      { $id: 'leer', artikelnummer: '', bezeichnung: 'Defekt', einheit: 't', istTonnageRelevant: false, aktiv: true },
    ]);
    const freitext = { artikelnummer: '', einheit: 't', menge: 9 };
    expect(berechnePositionsTonnen(freitext, 'fracht', kaputterIndex)).toBe(9);
  });

  it('Stammfeld schlägt Heuristik: istTonnageRelevant=false gewinnt gegen Einheit t', () => {
    const sonderIndex = erstelleArtikelIndex([
      { $id: 'x1', artikelnummer: 'XX-NEU-ZUSCHLAG', bezeichnung: 'Neuer Zuschlag', einheit: 't', istTonnageRelevant: false, aktiv: true },
    ]);
    const pos = { artikelnummer: 'XX-NEU-ZUSCHLAG', einheit: 't', menge: 3 };
    // Ohne Stammtreffer würde die Einheiten-Heuristik zählen …
    expect(berechnePositionsTonnen(pos, 'auswertung')).toBe(3);
    // … mit Stammfeld nicht mehr — genau dafür gibt es istTonnageRelevant.
    expect(berechnePositionsTonnen(pos, 'auswertung', sonderIndex)).toBe(0);
  });
});
