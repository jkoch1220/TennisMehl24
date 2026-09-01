import { describe, it, expect } from 'vitest';
import {
  baueStuecklistenPositionen,
  stuecklisteFuerBezugsweg,
} from '../stuecklistenPositionen';
import { STUECKLISTEN } from '../../constants/stuecklisten';
import { Artikel } from '../../types/artikel';
import { Position } from '../../types/projektabwicklung';

/**
 * Artikelstamm 1:1 aus der Appwrite-Collection `artikel` gelesen (Stand 08/2026,
 * Produktion und Sandbox identisch) — Einheiten und Preise sind die echten.
 * Beachten: TM-ZM-02St (Sackware) trägt die Einheit 't', nicht 'Stk', und
 * TM-FP/ZM-FI-A/ZM-FI haben im Stamm gar keinen Preis. Absichtlich vollständig, damit ein Test, der `nichtGefunden`
 * prüft, wirklich das Fehlen eines Artikels misst und nicht Lücken im Fixture.
 */
const ARTIKELSTAMM: Artikel[] = [
  { artikelnummer: 'TM-ZM-02', bezeichnung: 'Tennismehl 0/2 Schüttgut', einheit: 't', einzelpreis: 98.7 },
  { artikelnummer: 'TM-PE', bezeichnung: 'PE-Folie zum Abdecken und Unterlegen', einheit: 'Stk', einzelpreis: 18.2 },
  { artikelnummer: 'TM-FP', bezeichnung: 'Frachtkostenpauschale', einheit: 'Pkt' },
  { artikelnummer: 'TM-PAL', bezeichnung: 'Einwegpalette', einheit: 'Stk', einzelpreis: 12.5 },
  { artikelnummer: 'TM-ZM-BIG-02', bezeichnung: 'Tennismehl 0/2 im BigBag', einheit: 't', einzelpreis: 125.9 },
  { artikelnummer: 'TM-ZM-02St', bezeichnung: 'Tennismehl 0/2 Sackware 25x 40kg', einheit: 't', einzelpreis: 155 },
  { artikelnummer: 'ZM-FI-A', bezeichnung: 'An- und Abfahrt der Geräte und Kolonne', einheit: 'Pkt' },
  { artikelnummer: 'ZM-FI', bezeichnung: 'Instandsetzung des Tennisplatzes', einheit: 'Stk' },
  { artikelnummer: 'ZM-FA', bezeichnung: 'Facharbeiter für evtl. anfallende Zusatzarbeiten', einheit: 'Std', einzelpreis: 58.95 },
  { artikelnummer: 'TM-HYC', bezeichnung: 'HYDROcourt© 25 Ltr', einheit: 'Stk', einzelpreis: 220 },
  { artikelnummer: 'TM-HYC-V', bezeichnung: 'Hydrocourt Versand Standard Pauschal', einheit: 't', einzelpreis: 13.5 },
];

const hole = (id: string) => {
  const sl = STUECKLISTEN.find((s) => s.id === id);
  if (!sl) throw new Error(`Stückliste ${id} fehlt`);
  return sl;
};

describe('baueStuecklistenPositionen', () => {
  it('findet jede Artikelnummer aller gepflegten Stücklisten im Stamm', () => {
    // Das ist die Absicherung gegen den Fehler von 07/2026, bei dem Stücklisten
    // Nummern nannten, die es im Artikelstamm nie gegeben hat.
    for (const stueckliste of STUECKLISTEN) {
      const { nichtGefunden } = baueStuecklistenPositionen(stueckliste, ARTIKELSTAMM);
      expect(nichtGefunden, `Stückliste "${stueckliste.name}"`).toEqual([]);
    }
  });

  it('meldet fehlende Artikel, statt sie still zu verschlucken', () => {
    const ohneFolie = ARTIKELSTAMM.filter((a) => a.artikelnummer !== 'TM-PE');
    const { positionen, nichtGefunden } = baueStuecklistenPositionen(
      hole('ziegelmehl-schuettgut'),
      ohneFolie
    );
    expect(nichtGefunden).toEqual(['TM-PE']);
    expect(positionen).toHaveLength(2);
  });

  it('behält beim Facharbeiter die Menge 0 und die Bedarfsposition', () => {
    const { positionen } = baueStuecklistenPositionen(hole('fruehjahrs-instandsetzung'), ARTIKELSTAMM);
    const facharbeiter = positionen.find((p) => p.artikelnummer === 'ZM-FA');
    expect(facharbeiter).toBeDefined();
    expect(facharbeiter!.menge).toBe(0);
    expect(facharbeiter!.gesamtpreis).toBe(0);
    expect(facharbeiter!.istBedarfsposition).toBe(true);
  });

  it('übernimmt die angefragte Menge für den Hauptartikel', () => {
    const { positionen } = baueStuecklistenPositionen(hole('ziegelmehl-schuettgut'), ARTIKELSTAMM, {
      angefragteMenge: 8,
    });
    expect(positionen.find((p) => p.artikelnummer === 'TM-ZM-02')!.menge).toBe(8);
  });

  it('fügt einen bereits vorhandenen Artikel nicht doppelt ein', () => {
    // Vorher stand TM-ZM-02 bei Direkt-Kunden zweimal im Angebot: einmal mit dem
    // ausgehandelten Kundenpreis, einmal mit dem Listenpreis aus dem Stamm.
    const hauptartikel: Position[] = [{
      id: '1', artikelnummer: 'TM-ZM-02', bezeichnung: 'Tennismehl 0/2 Schüttgut',
      menge: 8, einheit: 't', einzelpreis: 102.6, gesamtpreis: 820.8,
    }];
    const { positionen } = baueStuecklistenPositionen(hole('ziegelmehl-schuettgut'), ARTIKELSTAMM, {
      angefragteMenge: 8,
      bestehendePositionen: hauptartikel,
      bereitsVorhanden: new Set(['TM-ZM-02']),
    });
    expect(positionen.map((p) => p.artikelnummer)).toEqual(['TM-PE', 'TM-FP']);
  });

  it('rechnet die Fracht auf Basis der bestehenden Tonnage', () => {
    const hauptartikel: Position[] = [{
      id: '1', artikelnummer: 'TM-ZM-02', bezeichnung: 'Tennismehl', menge: 8,
      einheit: 't', einzelpreis: 98.7, gesamtpreis: 789.6,
    }];
    const { positionen } = baueStuecklistenPositionen(hole('ziegelmehl-schuettgut'), ARTIKELSTAMM, {
      bestehendePositionen: hauptartikel,
      bereitsVorhanden: new Set(['TM-ZM-02']),
    });
    // 8 t liegen über der ersten Staffelgrenze — die Pauschale darf nicht 0 sein.
    expect(positionen.find((p) => p.artikelnummer === 'TM-FP')!.einzelpreis).toBeGreaterThan(0);
  });

  it('markiert Hydrocourt-Positionen als Bedarf', () => {
    const { positionen } = baueStuecklistenPositionen(hole('hydrocourt'), ARTIKELSTAMM);
    expect(positionen).toHaveLength(2);
    expect(positionen.every((p) => p.istBedarfsposition)).toBe(true);
  });
});

describe('stuecklisteFuerBezugsweg', () => {
  it('ordnet die Bezugswege zu', () => {
    expect(stuecklisteFuerBezugsweg('direkt')).toBe('ziegelmehl-schuettgut');
    expect(stuecklisteFuerBezugsweg('direkt_instandsetzung')).toBe('fruehjahrs-instandsetzung');
  });

  it('belegt andere Bezugswege nicht vor', () => {
    expect(stuecklisteFuerBezugsweg('ueber_platzbauer')).toBeUndefined();
    expect(stuecklisteFuerBezugsweg(undefined)).toBeUndefined();
  });

  it('verweist nur auf Stücklisten, die es gibt', () => {
    for (const weg of ['direkt', 'direkt_instandsetzung']) {
      const id = stuecklisteFuerBezugsweg(weg)!;
      expect(STUECKLISTEN.some((s) => s.id === id), `Stückliste ${id}`).toBe(true);
    }
  });
});
