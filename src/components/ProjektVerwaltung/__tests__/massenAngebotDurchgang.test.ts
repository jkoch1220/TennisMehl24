/**
 * Das Durchgehen von hunderten Vereinen darf nicht abreißen.
 *
 * Die beiden Fälle, an denen es vorher abriss: (1) Speichern schloss das
 * Fenster, (2) eine Bearbeitung ließ die Zeile aus dem aktiven Filter fallen
 * und das Fenster verschwand mitten in der Arbeit.
 */
import { describe, it, expect } from 'vitest';
import { bestimmeDurchgang } from '../massenAngebotUi';

const zeilen = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const reihe = ['a', 'b', 'c'];

describe('bestimmeDurchgang', () => {
  it('nennt Position und beide Nachbarn in der Mitte', () => {
    const d = bestimmeDurchgang(zeilen, reihe, 'b');
    expect(d.zeile?.id).toBe('b');
    expect([d.nummer, d.gesamt]).toEqual([2, 3]);
    expect([d.vorherId, d.naechsteId]).toEqual(['a', 'c']);
  });

  it('lässt die Ränder tot statt umzubrechen', () => {
    expect(bestimmeDurchgang(zeilen, reihe, 'a').vorherId).toBeUndefined();
    expect(bestimmeDurchgang(zeilen, reihe, 'c').naechsteId).toBeUndefined();
  });

  it('hält die Zeile offen, wenn sie aus dem Filter fällt', () => {
    // Der Fall aus dem Alltag: Filter „Ohne E-Mail", Adresse eingetragen,
    // gespeichert. Die Zeile gehört nicht mehr in die Filterliste — das
    // geöffnete Fenster muss trotzdem stehen bleiben.
    const nurNochAC = ['a', 'c'];
    const d = bestimmeDurchgang(zeilen, nurNochAC, 'b');
    expect(d.zeile?.id).toBe('b');
    // Ohne Platz in der Reihe gibt es keine Nachbarn und keine Positionsangabe.
    expect(d.nummer).toBe(0);
    expect([d.vorherId, d.naechsteId]).toEqual([undefined, undefined]);
  });

  it('meldet eine wirklich verschwundene Zeile als leer', () => {
    // Verschoben in eine andere Kampagne: Dann soll das Fenster schließen.
    expect(bestimmeDurchgang([{ id: 'a' }], reihe, 'b').zeile).toBeNull();
  });

  it('bleibt ohne geöffnete Zeile stumm', () => {
    const d = bestimmeDurchgang(zeilen, reihe, null);
    expect(d.zeile).toBeNull();
    expect(d.vorherId).toBeUndefined();
  });
});
