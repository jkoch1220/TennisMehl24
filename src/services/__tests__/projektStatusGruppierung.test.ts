// Tests für die Statusgruppierung der Projektverwaltung (Kanban).
//
// Hintergrund: Die Gruppierung stand dreimal als ausgeschriebenes Objektliteral im
// Code. Beim Einführen des Status 'geliefert' hätte jede vergessene Stelle dazu
// geführt, dass Projekte still aus dem Kanban verschwinden. Jetzt iteriert eine
// einzige Funktion über ALLE_PROJEKT_STATUS.

import { describe, it, expect } from 'vitest';
import { gruppiereProjekteNachStatus } from '../projektService';
import { ALLE_PROJEKT_STATUS, Projekt, ProjektStatus } from '../../types/projekt';

const projekt = (id: string, status: ProjektStatus): Projekt =>
  ({ id, $id: id, status, projektName: id, kundenname: 'Test' }) as unknown as Projekt;

describe('gruppiereProjekteNachStatus', () => {
  it('legt für jeden bekannten Status ein Fach an — auch wenn es leer bleibt', () => {
    const gruppen = gruppiereProjekteNachStatus([]);
    for (const status of ALLE_PROJEKT_STATUS) {
      expect(gruppen[status], `Fach für "${status}" fehlt`).toEqual([]);
    }
  });

  it('sortiert Projekte in das Fach ihres Status', () => {
    const gruppen = gruppiereProjekteNachStatus([
      projekt('a', 'angebot'),
      projekt('b', 'geliefert'),
      projekt('c', 'geliefert'),
      projekt('d', 'rechnung'),
    ]);
    expect(gruppen.angebot.map((p) => p.id)).toEqual(['a']);
    expect(gruppen.geliefert.map((p) => p.id)).toEqual(['b', 'c']);
    expect(gruppen.rechnung.map((p) => p.id)).toEqual(['d']);
  });

  // Altdatensätze aus der Zeit vor der Statusmigration dürfen nicht unsichtbar werden.
  it('legt Projekte mit unbekanntem Status zum Angebot statt sie zu verlieren', () => {
    const gruppen = gruppiereProjekteNachStatus([
      projekt('alt', 'in_bearbeitung' as ProjektStatus),
    ]);
    expect(gruppen.angebot.map((p) => p.id)).toEqual(['alt']);

    const gesamt = ALLE_PROJEKT_STATUS.reduce((summe, s) => summe + gruppen[s].length, 0);
    expect(gesamt).toBe(1);
  });

  it('verliert kein Projekt', () => {
    const projekte = ALLE_PROJEKT_STATUS.map((status, i) => projekt(`p${i}`, status));
    const gruppen = gruppiereProjekteNachStatus(projekte);
    const gesamt = ALLE_PROJEKT_STATUS.reduce((summe, s) => summe + gruppen[s].length, 0);
    expect(gesamt).toBe(projekte.length);
  });
});
