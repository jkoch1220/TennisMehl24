/**
 * Was die Bestellseite dem Kunden zeigt — und was sie ihm NICHT zeigen darf.
 *
 * Vorschlag „Bestellformular: Angebot besser darstellen" (09/2026). Zwei
 * Regeln daraus sind sicherheits- bzw. steuerrelevant und deshalb hier
 * festgehalten (Spiegel der Logik in netlify/functions/bestellung.ts, die als
 * Netlify-Function nicht direkt importierbar ist):
 *
 *  1. Aus dem Angebots-JSON darf nur eine Whitelist von Positionsfeldern nach
 *     außen. Vorher reichte die Antwort das Objekt unverändert durch — mit
 *     `einkaufspreis`, im Portal-Typ ausdrücklich „nur intern".
 *  2. Der Mehrwertsteuersatz kommt aus dem Angebot. Die Seite schrieb bis dahin
 *     hartkodiert „zzgl. 19 % MwSt." — bei Reverse Charge schlicht falsch.
 */
import { describe, it, expect } from 'vitest';

interface Position {
  artikelnummer?: string;
  bezeichnung?: string;
  beschreibung?: string;
  menge?: number;
  einheit?: string;
  einzelpreis?: number;
  gesamtpreis?: number;
  istBedarfsposition?: boolean;
  [k: string]: unknown;
}

const oeffentlichePosition = (p: Position) => ({
  artikelnummer: p.artikelnummer,
  bezeichnung: p.bezeichnung,
  beschreibung: p.beschreibung,
  menge: p.menge,
  einheit: p.einheit,
  einzelpreis: p.einzelpreis,
  gesamtpreis: p.gesamtpreis,
  istBedarfsposition: p.istBedarfsposition,
});

const MWST_STANDARD = 19;
const summenBlock = (
  nettoSumme: number,
  angebot: { mehrwertsteuersatz?: number; ohneMehrwertsteuer?: boolean } | null
) => {
  const ohne = angebot?.ohneMehrwertsteuer === true;
  const satz = ohne ? 0 : angebot?.mehrwertsteuersatz ?? MWST_STANDARD;
  const netto = Math.round(nettoSumme * 100) / 100;
  const steuer = Math.round(netto * (satz / 100) * 100) / 100;
  return {
    netto,
    mehrwertsteuersatz: satz,
    ohneMehrwertsteuer: ohne,
    steuer,
    brutto: Math.round((netto + steuer) * 100) / 100,
  };
};

describe('oeffentlichePosition', () => {
  const ausDerDatenbank: Position = {
    artikelnummer: 'TM-ZM-02',
    bezeichnung: 'Ziegelmehl 0/2',
    beschreibung: 'Frei Baustelle',
    menge: 12,
    einheit: 't',
    einzelpreis: 98.7,
    gesamtpreis: 1184.4,
    // Alles ab hier ist intern und stand vorher im Browser des Kunden:
    einkaufspreis: 61.2,
    preisQuelle: 'kalkuliert',
    artikelId: '68b1f0c30003a1',
    id: 'pos-1',
    istUniversalArtikel: false,
  };

  it('lässt nur die Felder durch, die der Kunde sehen soll', () => {
    const oeffentlich = oeffentlichePosition(ausDerDatenbank);
    expect(Object.keys(oeffentlich).sort()).toEqual(
      ['artikelnummer', 'beschreibung', 'bezeichnung', 'einheit', 'einzelpreis', 'gesamtpreis', 'istBedarfsposition', 'menge'].sort()
    );
  });

  it('hält den Einkaufspreis und die Preisquelle zurück', () => {
    const serialisiert = JSON.stringify(oeffentlichePosition(ausDerDatenbank));
    expect(serialisiert).not.toContain('einkaufspreis');
    expect(serialisiert).not.toContain('61.2');
    expect(serialisiert).not.toContain('preisQuelle');
    expect(serialisiert).not.toContain('artikelId');
  });

  it('reicht ein neues internes Feld nicht automatisch weiter', () => {
    // Der eigentliche Zweck der Whitelist: Was morgen im Angebot dazukommt,
    // landet nicht ungefragt beim Empfänger.
    const mitNeuemFeld = { ...ausDerDatenbank, deckungsbeitrag: 412.5 };
    expect(JSON.stringify(oeffentlichePosition(mitNeuemFeld))).not.toContain('deckungsbeitrag');
  });

  it('behält die Preise, die der Kunde sehen muss', () => {
    const o = oeffentlichePosition(ausDerDatenbank);
    expect(o.einzelpreis).toBe(98.7);
    expect(o.gesamtpreis).toBe(1184.4);
    expect(o.beschreibung).toBe('Frei Baustelle');
  });
});

describe('summenBlock', () => {
  it('rechnet mit 19 %, wenn das Angebot nichts anderes sagt', () => {
    expect(summenBlock(1273.3, null)).toEqual({
      netto: 1273.3, mehrwertsteuersatz: 19, ohneMehrwertsteuer: false, steuer: 241.93, brutto: 1515.23,
    });
  });

  it('nimmt einen abweichenden Satz aus dem Angebot', () => {
    const s = summenBlock(100, { mehrwertsteuersatz: 7 });
    expect(s.steuer).toBe(7);
    expect(s.brutto).toBe(107);
  });

  it('weist bei Reverse Charge keine Steuer aus', () => {
    // Vorher stand auf der Seite trotzdem „zzgl. 19 % MwSt."
    const s = summenBlock(1273.3, { ohneMehrwertsteuer: true, mehrwertsteuersatz: 19 });
    expect(s.ohneMehrwertsteuer).toBe(true);
    expect(s.steuer).toBe(0);
    expect(s.brutto).toBe(1273.3);
  });

  it('rundet auf Cent statt auf Gleitkommareste', () => {
    const s = summenBlock(0.1 + 0.2, null);
    expect(s.netto).toBe(0.3);
    expect(s.steuer).toBe(0.06);
    expect(s.brutto).toBe(0.36);
  });
});

describe('Vertragsklauseln auf der Kundenseite', () => {
  // Das Flag heißt `aktiviert` (types/projektabwicklung.ts:95), NICHT `aktiv`.
  // Ein Filter auf `k.aktiv !== false` war immer wahr und lieferte abgewählte
  // Klauseln an den Kunden aus — er hätte gegen Bedingungen bestellt, die auf
  // seinem Angebots-PDF nicht stehen (dokumentService.ts:116 überspringt sie).
  interface Klausel { titel?: string; text?: string; aktiviert?: boolean }
  const sichtbareKlauseln = (klauseln: Klausel[]) =>
    klauseln
      .filter((k) => k?.aktiviert === true && !!k?.text?.trim())
      .map((k) => ({ titel: k.titel ?? '', text: (k.text ?? '').trim() }));

  it('zeigt nur aktivierte Klauseln — genau wie das PDF', () => {
    const sichtbar = sichtbareKlauseln([
      { titel: 'Erschwerte Zufahrt / Standzeit', text: 'Ab 20 Minuten 108,00 € netto je Stunde.', aktiviert: true },
      { titel: 'Mengenanpassung', text: 'Bis zu 10 % Abweichung.', aktiviert: false },
    ]);
    expect(sichtbar.map((k) => k.titel)).toEqual(['Erschwerte Zufahrt / Standzeit']);
  });

  it('zeigt nichts, wenn das Flag fehlt — Nichtanzeigen ist die sichere Richtung', () => {
    expect(sichtbareKlauseln([{ titel: 'Unklar', text: 'Irgendetwas.' }])).toEqual([]);
  });

  it('lässt frisch angelegte Vorlagen ohne Text weg', () => {
    // Neue Vorlagen entstehen mit Titel „Neue Klausel" und leerem Text.
    expect(sichtbareKlauseln([{ titel: 'Neue Klausel', text: '', aktiviert: true }])).toEqual([]);
    expect(sichtbareKlauseln([{ titel: 'Neue Klausel', text: '   ', aktiviert: true }])).toEqual([]);
  });
});

describe('Positionen in der Bestell-Antwort', () => {
  it('laufen ebenfalls durch die Whitelist', () => {
    // Die Antwort auf „Verbindlich bestellen" reichte die Angebotsobjekte
    // direkt durch — das Leck wäre nur beim Laden geschlossen gewesen.
    const ausRechneUm: Position[] = [
      { artikelnummer: 'TM-ZM-02', bezeichnung: 'Ziegelmehl', menge: 13.2, einheit: 't', einzelpreis: 98.7, gesamtpreis: 1302.84, einkaufspreis: 61.2 },
      { artikelnummer: 'TM-SK', bezeichnung: 'Optionales', menge: 1, einheit: 'psch', gesamtpreis: 180, istBedarfsposition: true },
    ];
    const antwort = ausRechneUm.filter((p) => !p.istBedarfsposition).map(oeffentlichePosition);
    expect(antwort).toHaveLength(1);
    expect(JSON.stringify(antwort)).not.toContain('einkaufspreis');
    expect(antwort[0].gesamtpreis).toBe(1302.84);
  });
});

describe('Mengenspielraum', () => {
  const TOLERANZ = 0.1;
  const grenzen = (angebotsTonnage: number) => ({
    min: Math.round(angebotsTonnage * (1 - TOLERANZ) * 100) / 100,
    max: Math.round(angebotsTonnage * (1 + TOLERANZ) * 100) / 100,
  });

  it('misst immer am ursprünglichen Angebot, nicht an der letzten Änderung', () => {
    // Sonst wandert die Grenze mit jeder Anpassung mit: 12 → 13,2 → 14,52 …
    // und aus ±10 % wird über die Zeit ein beliebiger Wert.
    const ausAngebot = grenzen(12);
    expect(ausAngebot).toEqual({ min: 10.8, max: 13.2 });
    expect(grenzen(13.2)).not.toEqual(ausAngebot);
  });
});
