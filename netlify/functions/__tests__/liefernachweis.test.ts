/**
 * Die Regeln, an denen der Abholungs-Ablauf hängt.
 *
 * Alle drei entscheiden über etwas, das man erst beim Kunden merkt: ob der
 * Abholer überhaupt in den richtigen Ablauf kommt, ob der unterschriebene
 * Lieferschein ankommt, und ob eine Freitexteingabe vom Handy ungeprüft
 * weiterwandert.
 */
import { describe, it, expect } from 'vitest';
import {
  istAbholungAbWerk,
  kurzfeld,
  normalisiereEmpfaenger,
  empfaengerVorschlag,
} from '../liefernachweis';

describe('istAbholungAbWerk', () => {
  it('erkennt die Abholung an der Belieferungsart des Projekts', () => {
    expect(istAbholungAbWerk({ belieferungsart: 'abholung_ab_werk' })).toBe(true);
    expect(istAbholungAbWerk({ belieferungsart: 'mit_haenger' })).toBe(false);
  });

  it('fällt auf den Lieferschein zurück, wenn am Projekt nichts steht', () => {
    expect(
      istAbholungAbWerk({
        lieferscheinDaten: JSON.stringify({ belieferungsart: 'abholung_ab_werk' }),
      })
    ).toBe(true);
  });

  it('die Belieferungsart am Projekt schlägt den Lieferschein', () => {
    // Sonst bliebe eine im Projekt korrigierte Belieferungsart wirkungslos,
    // solange der alte Lieferschein-Datensatz danebensteht.
    expect(
      istAbholungAbWerk({
        belieferungsart: 'mit_haenger',
        lieferscheinDaten: JSON.stringify({ belieferungsart: 'abholung_ab_werk' }),
      })
    ).toBe(false);
  });

  it('ohne Angaben und bei kaputtem JSON keine Abholung', () => {
    expect(istAbholungAbWerk({})).toBe(false);
    expect(istAbholungAbWerk({ lieferscheinDaten: '{kaputt' })).toBe(false);
  });
});

describe('normalisiereEmpfaenger', () => {
  it('leer bleibt leer — kein Versand ist erlaubt', () => {
    expect(normalisiereEmpfaenger('')).toBe('');
    expect(normalisiereEmpfaenger('   ')).toBe('');
    expect(normalisiereEmpfaenger(undefined)).toBe('');
  });

  it('vereinheitlicht Semikolon und Leerzeichen auf Komma', () => {
    expect(normalisiereEmpfaenger('a@x.de; b@y.de')).toBe('a@x.de, b@y.de');
    expect(normalisiereEmpfaenger('a@x.de b@y.de')).toBe('a@x.de, b@y.de');
  });

  it('weist ungültige Adressen ab, statt sie still zu verschlucken', () => {
    expect(normalisiereEmpfaenger('kein-at-zeichen')).toBeNull();
    expect(normalisiereEmpfaenger('a@x')).toBeNull();
    expect(normalisiereEmpfaenger('a@x.de, kaputt')).toBeNull();
  });

  it('begrenzt die Anzahl der Empfänger', () => {
    expect(normalisiereEmpfaenger('a@x.de, b@x.de, c@x.de')).toBe('a@x.de, b@x.de, c@x.de');
    expect(normalisiereEmpfaenger('a@x.de, b@x.de, c@x.de, d@x.de')).toBeNull();
  });
});

describe('empfaengerVorschlag', () => {
  it('nimmt die Kunden-E-Mail, sonst den Angebots-Empfänger', () => {
    expect(empfaengerVorschlag({ kundenEmail: 'verein@x.de' })).toBe('verein@x.de');
    expect(empfaengerVorschlag({ bestellEmpfaenger: 'vorstand@x.de' })).toBe('vorstand@x.de');
  });

  it('schlägt nichts vor, wenn die hinterlegte Adresse unbrauchbar ist', () => {
    // Ein vorbelegtes „info@" ohne Punkt wäre eine Adresse, die der Abholer
    // im Werk bestätigt und die dann nirgends ankommt.
    expect(empfaengerVorschlag({ kundenEmail: 'kaputt' })).toBe('');
    expect(empfaengerVorschlag({})).toBe('');
  });
});

describe('kurzfeld', () => {
  it('trimmt, normalisiert Leerraum und kappt überlange Eingaben', () => {
    expect(kurzfeld('  Max   Muster  ')).toBe('Max Muster');
    expect(kurzfeld('x'.repeat(200))?.length).toBe(120);
  });

  it('leere und nicht-textliche Eingaben ergeben nichts', () => {
    expect(kurzfeld('   ')).toBeUndefined();
    expect(kurzfeld(42)).toBeUndefined();
    expect(kurzfeld(undefined)).toBeUndefined();
  });
});
