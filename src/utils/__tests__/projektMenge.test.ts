import { describe, it, expect } from 'vitest';
import { formatProjektTonnen, projektTonnage, projektTonnen, tonnageQuelleLabel } from '../projektTonnage';
import { summierePositionsTonnen } from '../tonnage';
import type { Projekt } from '../../types/projekt';
import type { Position } from '../../types/projektabwicklung';

/**
 * Vorschlag 2 („Projekt erstellung Tonnen menge anhand von angebotenen tonnen"):
 * Die Menge am Projekt kam aus der E-Mail-Extraktion bzw. aus einer Eigenbau-Summe,
 * die nur `einheit === 't'` zählte. Angezeigt wurde sie roh — Massenangebot-Projekte
 * hatten gar keine. Jetzt zählt überall dieselbe Logik, und die Anzeige nimmt die
 * belastbarste verfügbare Quelle.
 */
const pos = (p: Partial<Position>): Position => ({
  id: p.id ?? 'p',
  bezeichnung: p.bezeichnung ?? 'Ziegelmehl',
  menge: p.menge ?? 0,
  einheit: p.einheit ?? 't',
  einzelpreis: p.einzelpreis ?? 100,
  gesamtpreis: (p.menge ?? 0) * (p.einzelpreis ?? 100),
  ...p,
});

/** So zählte der alte „Nur Projekt"-Pfad. */
const alteZaehlung = (positionen: Position[]): number =>
  positionen.reduce((s, p) => (p.einheit === 't' ? s + p.menge : s), 0);

const projekt = (teil: Partial<Projekt>): Projekt => ({ id: 'x', status: 'angebot', ...teil } as Projekt);

/** Am Projekt liegen die Belegdaten als JSON-String (types/projekt.ts:431-432). */
const alsBeleg = (positionen: Position[]): string => JSON.stringify({ positionen });

describe('Menge beim Anlegen eines Projekts', () => {
  it('zählt Beiladungssäcke mit, die die alte Summe verlor', () => {
    // 4 t lose + 10 Säcke à 40 kg = 4,4 t. Die alte Summe sah nur die 4 t.
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 4, einheit: 't' }),
      pos({ artikelnummer: 'TM-ZM-02S', menge: 10, einheit: 'Stk', einzelpreis: 8.5 }),
    ];
    expect(alteZaehlung(positionen)).toBe(4);
    expect(summierePositionsTonnen(positionen, 'auswertung')).toBeCloseTo(4.4, 5);
  });

  it('lässt Pauschalen und Zuschläge außen vor', () => {
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 12, einheit: 't' }),
      pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Stk', einzelpreis: 39.9 }),
      pos({ artikelnummer: 'TM-DZ', menge: 1, einheit: 'psch', einzelpreis: 21.6 }),
    ];
    expect(summierePositionsTonnen(positionen, 'auswertung')).toBe(12);
  });

  it('zählt BigBag mit — die E-Mail-Extraktion kennt dafür gar kein Feld', () => {
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 5, einheit: 't' }),
      pos({ artikelnummer: 'TM-ZM-BIG-02', menge: 2, einheit: 't' }),
    ];
    expect(summierePositionsTonnen(positionen, 'auswertung')).toBe(7);
  });

  it('summiert über mehrere Körnungen und Gebinde', () => {
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 8, einheit: 't' }),
      pos({ artikelnummer: 'TM-ZM-03', menge: 4.5, einheit: 't' }),
      pos({ artikelnummer: 'TM-ZM-02St', menge: 3, einheit: 't' }),
    ];
    expect(summierePositionsTonnen(positionen, 'auswertung')).toBe(15.5);
  });
});

describe('Angezeigte Menge folgt der belastbarsten Quelle', () => {
  it('nimmt die Angebotspositionen, wenn keine Menge am Projekt steht', () => {
    // Genau der Massenangebot-Fall: Projekt ohne angefragteMenge, aber mit Angebot.
    const p = projekt({
      angebotsDaten: alsBeleg([pos({ artikelnummer: 'TM-ZM-02', menge: 18, einheit: 't' })]),
    });
    expect(projektTonnen(p)).toBe(18);
  });

  it('zieht die Auftragsbestätigung dem Angebot vor', () => {
    const p = projekt({
      angefragteMenge: 10,
      angebotsDaten: alsBeleg([pos({ artikelnummer: 'TM-ZM-02', menge: 18, einheit: 't' })]),
      auftragsbestaetigungsDaten: alsBeleg([pos({ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' })]),
    });
    expect(projektTonnen(p)).toBe(20);
  });

  it('zieht das geprüfte Wiegegewicht allem vor', () => {
    const p = projekt({
      angefragteMenge: 10,
      auftragsbestaetigungsDaten: alsBeleg([pos({ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' })]),
      wiegeschein: { pruefStatus: 'bestaetigt', gepruefteMengeTonnen: 19.4 },
    } as Partial<Projekt>);
    expect(projektTonnen(p)).toBe(19.4);
  });

  it('fällt auf die angefragte Menge zurück, solange es keine Positionen gibt', () => {
    expect(projektTonnen(projekt({ angefragteMenge: 7 }))).toBe(7);
  });

  it('liefert 0, wenn keine Quelle etwas hergibt', () => {
    expect(projektTonnen(projekt({}))).toBe(0);
  });
});

describe('formatProjektTonnen', () => {
  it('rundet die Nachkommastellen der Sackware-Umrechnung weg', () => {
    // Ungerundet stand auf der Karte „12.640000000000001t".
    expect(formatProjektTonnen(12.640000000000001)).toBe('12,6');
  });

  it('schreibt deutsch mit Tausenderpunkt', () => {
    expect(formatProjektTonnen(1250)).toBe('1.250');
    expect(formatProjektTonnen(24.5)).toBe('24,5');
    expect(formatProjektTonnen(18)).toBe('18');
  });

  it('zeigt Kleinstmengen nicht als „0"', () => {
    // Aus dem Review: Der Block erscheint bei Menge > 0 — dann darf dort nicht
    // „0t" stehen. Ein einzelner Beiladungssack sind 0,04 t.
    expect(formatProjektTonnen(0.04)).toBe('0,04');
    expect(formatProjektTonnen(0.08)).toBe('0,08');
    expect(formatProjektTonnen(0)).toBe('0');
  });
});

describe('Herkunft der Zahl', () => {
  it('nennt „beauftragte Menge" ohne zu behaupten, sie stamme aus Positionen', () => {
    // Die Quelle 'beauftragt' deckt auch beauftragteTonnen und liefergewicht ab.
    expect(tonnageQuelleLabel('beauftragt')).toBe('beauftragte Menge');
    expect(tonnageQuelleLabel('gewogen')).toBe('gewogene Liefermenge');
    expect(tonnageQuelleLabel('angefragt')).toBe('angefragte Menge');
  });

  it('weist die Quelle korrekt aus', () => {
    const ausPositionen = projekt({
      angebotsDaten: alsBeleg([pos({ artikelnummer: 'TM-ZM-02', menge: 18, einheit: 't' })]),
    });
    expect(projektTonnage(ausPositionen)?.quelle).toBe('beauftragt');
    expect(projektTonnage(projekt({ angefragteMenge: 7 }))?.quelle).toBe('angefragt');
    expect(projektTonnage(projekt({}))).toBeNull();
  });
});
