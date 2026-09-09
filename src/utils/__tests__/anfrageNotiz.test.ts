import { describe, it, expect } from 'vitest';
import { WICHTIG_MARKER, hatNotiz, istWichtig, notizText, setzeWichtig } from '../anfrageNotiz';

/**
 * Vorschlag „Anfragen: Kundennotiz ist Schrott, wenn nichts drinsteht" (09/2026).
 *
 * Belegter Auslöser: Von 99 gefüllten `notizen`-Feldern trugen 98 den Satz
 * „Status nachgetragen aus E-Mail-Protokoll" aus einem Bereinigungslauf. Der
 * Dialog zeigte deshalb bei fast jeder Anfrage einen Kasten „Wichtige
 * Kundennotiz" ohne echten Inhalt.
 */
describe('notizText', () => {
  it('gibt echte Notizen unverändert zurück', () => {
    expect(notizText('Platz ist nur vormittags erreichbar.')).toBe('Platz ist nur vormittags erreichbar.');
  });

  it('blendet den technischen Vermerk aus dem Bereinigungslauf aus', () => {
    expect(notizText('Status nachgetragen aus E-Mail-Protokoll')).toBe('');
    expect(notizText('Status nachgetragen aus E-Mail-Protokoll.')).toBe('');
  });

  it('behält den echten Teil, wenn beides drinsteht', () => {
    expect(notizText('Status nachgetragen aus E-Mail-Protokoll\nBitte vormittags liefern.'))
      .toBe('Bitte vormittags liefern.');
  });

  it('zeigt den Wichtig-Marker nicht als Notiztext', () => {
    expect(notizText(WICHTIG_MARKER)).toBe('');
    expect(notizText('⭐ WICHTIG')).toBe('');
    expect(notizText('⭐ WICHTIG\nRuft am Montag zurück.')).toBe('Ruft am Montag zurück.');
  });

  it('behandelt leere und weißraum-artige Werte als leer', () => {
    expect(notizText('')).toBe('');
    expect(notizText('   ')).toBe('');
    expect(notizText('\n\n')).toBe('');
    expect(notizText(undefined)).toBe('');
    expect(notizText(null)).toBe('');
  });
});

describe('hatNotiz', () => {
  it('entscheidet, ob der Kasten überhaupt erscheint', () => {
    expect(hatNotiz('Bitte hinten anliefern.')).toBe(true);
    expect(hatNotiz('Status nachgetragen aus E-Mail-Protokoll')).toBe(false);
    expect(hatNotiz(WICHTIG_MARKER)).toBe(false);
    expect(hatNotiz('  ')).toBe(false);
  });
});

describe('istWichtig', () => {
  it('erkennt die Markierung unabhängig vom übrigen Text', () => {
    expect(istWichtig('⭐ WICHTIG')).toBe(true);
    expect(istWichtig('⭐ WICHTIG\nRuft zurück.')).toBe(true);
    expect(istWichtig('Ruft zurück.')).toBe(false);
    expect(istWichtig(undefined)).toBe(false);
  });
});

describe('setzeWichtig', () => {
  it('verliert die vorhandene Notiz nicht mehr', () => {
    // Vorher schrieb „Als wichtig markieren" schlicht '⭐ WICHTIG' ins Feld —
    // eine echte Kundennotiz war damit weg.
    expect(setzeWichtig('Ruft am Montag zurück.', true)).toBe('⭐ WICHTIG\nRuft am Montag zurück.');
  });

  it('nimmt die Markierung zurück, ohne die Notiz zu löschen', () => {
    expect(setzeWichtig('⭐ WICHTIG\nRuft am Montag zurück.', false)).toBe('Ruft am Montag zurück.');
  });

  it('markiert auch ohne vorhandene Notiz', () => {
    expect(setzeWichtig(undefined, true)).toBe('⭐ WICHTIG');
    expect(setzeWichtig('', true)).toBe('⭐ WICHTIG');
  });

  it('leert das Feld, wenn nur der Marker drinstand', () => {
    expect(setzeWichtig('⭐ WICHTIG', false)).toBe('');
  });

  it('setzt die Markierung nicht doppelt', () => {
    const einmal = setzeWichtig('Hinweis.', true);
    expect(setzeWichtig(einmal, true)).toBe(einmal);
  });

  it('räumt technische Vermerke beim Markieren gleich mit weg', () => {
    expect(setzeWichtig('Status nachgetragen aus E-Mail-Protokoll', true)).toBe('⭐ WICHTIG');
  });
});
