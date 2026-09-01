import { describe, it, expect } from 'vitest';
import { bereiteArtikelNeuanlage, bereiteArtikelUpdate } from '../artikelService';
import { TENNISMEHL_ARTIKEL } from '../../constants/artikelPreise';
import { NICHT_MATERIAL_ARTIKEL } from '../../utils/dispoMaterialParser';
import { KLASSIFIZIERUNG } from '../../../scripts/befuelle-artikel-stammfelder';

describe('bereiteArtikelNeuanlage', () => {
  it('trimmt die Artikelnummer, setzt aktiv und hält erlaubteEinheit synchron', () => {
    const daten = bereiteArtikelNeuanlage({
      artikelnummer: '  TM-NEU-01 ',
      bezeichnung: 'Testartikel',
      einheit: 'Stk',
    });

    expect(daten.artikelnummer).toBe('TM-NEU-01');
    expect(daten.aktiv).toBe(true);
    expect(daten.erlaubteEinheit).toBe('Stk');
  });
});

describe('bereiteArtikelUpdate', () => {
  it('verwirft die Artikelnummer — Umbenennen ist verboten', () => {
    const daten = bereiteArtikelUpdate({
      artikelnummer: 'TM-UMBENANNT',
      bezeichnung: 'Neue Bezeichnung',
    });

    expect(daten).not.toHaveProperty('artikelnummer');
    expect(daten.bezeichnung).toBe('Neue Bezeichnung');
  });

  it('zieht erlaubteEinheit mit, wenn die Einheit geändert wird', () => {
    const daten = bereiteArtikelUpdate({ einheit: 'Pal' });
    expect(daten.erlaubteEinheit).toBe('Pal');
  });

  it('lässt erlaubteEinheit unangetastet, wenn die Einheit nicht Teil des Updates ist', () => {
    const daten = bereiteArtikelUpdate({ einzelpreis: 99.9 });
    expect(daten).not.toHaveProperty('erlaubteEinheit');
  });
});

describe('Befüll-Klassifizierung (scripts/befuelle-artikel-stammfelder.ts)', () => {
  it('klassifiziert jeden TENNISMEHL_ARTIKEL als tonnage-relevante Ware mit passender Körnung', () => {
    for (const def of Object.values(TENNISMEHL_ARTIKEL)) {
      // TM-PE/TM-FP/TM-PAL stehen zwar in TENNISMEHL_ARTIKEL, sind aber keine Ware
      const istWare = def.artikelnummer.startsWith('TM-ZM-');
      const klasse = KLASSIFIZIERUNG[def.artikelnummer];
      expect(klasse, `Klassifizierung fehlt für ${def.artikelnummer}`).toBeDefined();

      if (istWare) {
        expect(klasse.warengruppe, def.artikelnummer).toBe('tennismehl');
        expect(klasse.istTonnageRelevant, def.artikelnummer).toBe(true);
        expect(klasse.koernung, def.artikelnummer).toBe(def.koernung);
      } else {
        expect(klasse.istTonnageRelevant, def.artikelnummer).toBe(false);
      }
    }
  });

  it('setzt istTonnageRelevant=false für jeden Artikel der NICHT_MATERIAL-Blockliste', () => {
    for (const nummer of NICHT_MATERIAL_ARTIKEL) {
      const klasse = KLASSIFIZIERUNG[nummer];
      // TM-SK steht in der Blockliste, existiert aber nicht im Artikelstamm
      if (!klasse) continue;
      expect(klasse.istTonnageRelevant, nummer).toBe(false);
    }
  });

  it('gibt jedem tonnage-relevanten Stück-Artikel (Beiladung) ein Gewicht pro Stück', () => {
    for (const [nummer, klasse] of Object.entries(KLASSIFIZIERUNG)) {
      if (klasse.istTonnageRelevant && klasse.lieferart === 'beiladung') {
        expect(klasse.gewichtProStueckKg, nummer).toBe(40);
      }
    }
  });

  it('markiert ausschließlich TM-ZM-Artikel als tonnage-relevant', () => {
    for (const [nummer, klasse] of Object.entries(KLASSIFIZIERUNG)) {
      if (klasse.istTonnageRelevant) {
        expect(nummer.startsWith('TM-ZM-'), `${nummer} ist als Ware markiert`).toBe(true);
      }
    }
  });
});
