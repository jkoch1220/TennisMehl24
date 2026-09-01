import { describe, it, expect } from 'vitest';
import { schichtplanungService } from '../schichtplanungService';
import {
  Mitarbeiter,
  SchichtZuweisung,
  NeueSchichtZuweisung,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
} from '../../types/schichtplanung';

/**
 * Vorschlag [12]: „Doppelt und Dreifachschichten müssen möglich sein."
 *
 * Die Prüfung sperrte vorher nach dem NAMEN der Schicht: zweimal
 * „Frühschicht" am selben Tag war ein Fehler, auch wenn die Zeiten sich gar
 * nicht überschnitten. Umgekehrt lief eine echte Überschneidung zweier
 * verschieden benannter Schichten ungeprüft durch.
 *
 * Maßgeblich ist jetzt die Uhrzeit.
 */
const MITARBEITER: Mitarbeiter[] = [
  {
    id: 'm1',
    vorname: 'Ronald',
    nachname: 'Beispiel',
    farbe: '#000',
    istAktiv: true,
    maxStundenProWoche: 40,
    erstelltAm: '2026-01-01T00:00:00.000Z',
    geaendertAm: '2026-01-01T00:00:00.000Z',
  },
];

const zuweisung = (
  startZeit: string,
  endZeit: string,
  schichtTyp: SchichtZuweisung['schichtTyp'] = 'fruehschicht',
  extra: Partial<SchichtZuweisung> = {}
): SchichtZuweisung => ({
  id: `z-${startZeit}`,
  mitarbeiterId: 'm1',
  datum: '2026-09-01',
  schichtTyp,
  startZeit,
  endZeit,
  status: 'geplant',
  erstelltAm: '2026-01-01T00:00:00.000Z',
  geaendertAm: '2026-01-01T00:00:00.000Z',
  ...extra,
} as SchichtZuweisung);

const neue = (
  startZeit: string,
  endZeit: string,
  schichtTyp: SchichtZuweisung['schichtTyp'] = 'fruehschicht'
): NeueSchichtZuweisung => ({
  mitarbeiterId: 'm1',
  datum: '2026-09-01',
  schichtTyp,
  startZeit,
  endZeit,
  status: 'geplant',
} as NeueSchichtZuweisung);

const pruefe = (bestehend: SchichtZuweisung[], neuZ: NeueSchichtZuweisung) =>
  schichtplanungService.pruefeKonflikte(neuZ, bestehend, MITARBEITER, DEFAULT_SCHICHT_EINSTELLUNGEN);

const fehler = (k: ReturnType<typeof pruefe>) => k.filter((x) => x.schwere === 'fehler');
const warnungen = (k: ReturnType<typeof pruefe>) => k.filter((x) => x.schwere === 'warnung');

describe('pruefeKonflikte — Doppel- und Dreifachschichten', () => {
  it('erlaubt zwei Schichten desselben Typs, wenn die Zeiten sich nicht überschneiden', () => {
    // Geteilte Frühschicht: 06–10 und danach 11–15. Vorher ein harter Fehler,
    // nur weil beide „Frühschicht" heißen.
    const k = pruefe([zuweisung('06:00', '10:00')], neue('11:00', '15:00'));
    expect(fehler(k)).toHaveLength(0);
  });

  it('meldet eine echte Überschneidung als Fehler', () => {
    const k = pruefe([zuweisung('06:00', '14:00')], neue('12:00', '20:00', 'spaetschicht'));
    expect(fehler(k)).toHaveLength(1);
    expect(fehler(k)[0].nachricht).toContain('arbeitet zu dieser Zeit bereits');
  });

  it('lässt aneinander anschließende Schichten zu — 06–14 und 14–22', () => {
    // Grenzfall: Ende und Anfang fallen zusammen, das ist keine Überschneidung.
    const k = pruefe([zuweisung('06:00', '14:00')], neue('14:00', '22:00', 'spaetschicht'));
    expect(fehler(k)).toHaveLength(0);
    expect(warnungen(k).some((w) => w.nachricht.includes('2-fach Schicht'))).toBe(true);
  });

  it('erlaubt eine Dreifachschicht und weist darauf hin', () => {
    const k = pruefe(
      [zuweisung('06:00', '10:00'), zuweisung('11:00', '15:00', 'spaetschicht')],
      neue('16:00', '20:00', 'nachtschicht')
    );
    expect(fehler(k)).toHaveLength(0);
    expect(warnungen(k).some((w) => w.nachricht.includes('3-fach Schicht'))).toBe(true);
  });

  it('behandelt die Nachtschicht über Mitternacht richtig', () => {
    // 22–06 endet am Folgetag. Ohne den Mitternachtsumbruch wäre das Fenster
    // negativ und jede Prüfung liefe ins Leere.
    const k = pruefe([zuweisung('22:00', '06:00', 'nachtschicht')], neue('23:00', '02:00', 'nachtschicht'));
    expect(fehler(k)).toHaveLength(1);
  });

  it('ignoriert Kranke und Urlauber', () => {
    const k = pruefe(
      [zuweisung('06:00', '14:00', 'fruehschicht', { status: 'krank' })],
      neue('06:00', '14:00')
    );
    expect(fehler(k)).toHaveLength(0);
  });

  it('meldet nichts bei einer einzelnen Schicht', () => {
    const k = pruefe([], neue('06:00', '14:00'));
    expect(fehler(k)).toHaveLength(0);
    expect(warnungen(k).some((w) => w.nachricht.includes('fach Schicht'))).toBe(false);
  });

  it('lässt einen anderen Mitarbeiter dieselbe Schicht besetzen', () => {
    // Mehrfachbesetzung einer Schicht war schon vorher erlaubt — das muss so bleiben.
    const fremd = { ...zuweisung('06:00', '14:00'), mitarbeiterId: 'm2' };
    const k = pruefe([fremd], neue('06:00', '14:00'));
    expect(fehler(k)).toHaveLength(0);
  });
});
