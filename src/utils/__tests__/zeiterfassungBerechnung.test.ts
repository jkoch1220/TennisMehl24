import { describe, it, expect } from 'vitest';
import {
  wirksameEvents,
  ermittleStatus,
  erlaubteStempel,
  werteTagAus,
  werteZeitraumAus,
  summiere,
  datumsBereich,
  monatsGrenzen,
} from '../zeiterfassungBerechnung';
import {
  type ZeitEvent,
  type ZeitEventTyp,
  berechneGesetzlichePause,
  formatiereStunden,
  lokaleUhrzeit,
  lokalesDatum,
  minutenZwischen,
} from '../../types/zeiterfassung';

/**
 * Prüfstand für den Rechenkern der Zeiterfassung.
 *
 * `werteTagAus` liefert die Zahl, nach der am Monatsende bezahlt wird. Die Tests
 * hier bestätigen deshalb nicht nur den Normalfall, sondern pinnen bewusst auch
 * die Kanten fest: Schwellwerte des § 4 ArbZG, kaputte Stempelketten,
 * Mitternacht und die Zeitumstellung. Wo der Kern etwas tut, das man beim ersten
 * Lesen nicht erwartet, steht das als Kommentar am Test — dann fällt eine
 * spätere Änderung auf, statt still die Lohnsumme zu verschieben.
 */

/* ------------------------------------------------------------------ *
 * Helfer: lokale Berliner Wanduhrzeit -> UTC-ISO
 * ------------------------------------------------------------------ */

/** Wie viele Minuten geht Europe/Berlin der UTC zu diesem Zeitpunkt voraus? */
function berlinOffsetMinuten(zeitpunkt: Date): number {
  const teile = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(zeitpunkt);
  // 'sv-SE' liefert "2026-09-04 08:00:00" — als UTC gelesen ergibt die Differenz
  // zum echten Zeitpunkt genau den Offset.
  const alsWaereEsUtc = Date.parse(`${teile.replace(' ', 'T')}Z`);
  return Math.round((alsWaereEsUtc - zeitpunkt.getTime()) / 60000);
}

/**
 * '2026-09-04 08:00' (Berliner Wanduhr) -> '2026-09-04T06:00:00.000Z'.
 *
 * Zwei Durchläufe, weil der Offset selbst vom Ergebnis abhängt: an der
 * Umstellungsnacht liegt der erste Schätzwert eine Stunde daneben.
 */
function iso(lokal: string): string {
  const [datumsteil, zeitteil] = lokal.trim().replace('T', ' ').split(' ');
  const [jahr, monat, tag] = datumsteil.split('-').map(Number);
  const [stunde, minute] = zeitteil.split(':').map(Number);
  const naiv = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  let ms = naiv - berlinOffsetMinuten(new Date(naiv)) * 60000;
  ms = naiv - berlinOffsetMinuten(new Date(ms)) * 60000;
  return new Date(ms).toISOString();
}

const MA = 'm1';

/** Baut ein Event aus lokaler Uhrzeit. `datum` kommt aus dem Zeitpunkt, wie es der Server tut. */
function ev(typ: ZeitEventTyp, lokal: string, extra: Partial<ZeitEvent> = {}): ZeitEvent {
  const zeitpunkt = iso(lokal);
  return {
    id: `${typ}@${lokal}`,
    mitarbeiterId: MA,
    typ,
    zeitpunkt,
    datum: lokalesDatum(zeitpunkt),
    quelle: 'web',
    erfasstVonUserId: 'u1',
    erfasstVonName: 'Testerin',
    erfasstAm: zeitpunkt,
    ...extra,
  };
}

/** Freitag. Standard-Testtag; bewusst kein Sonntag, damit § 9 nicht dazwischenfunkt. */
const TAG = '2026-09-04';
const JETZT = iso('2026-09-04 18:00');

const tag = (datum: string, events: ZeitEvent[], jetzt: string = JETZT) =>
  werteTagAus(datum, MA, events, jetzt);

const texte = (a: { hinweise: { text: string }[] }) => a.hinweise.map((h) => h.text);

/* ------------------------------------------------------------------ *
 * Der Helfer selbst — sonst testen alle folgenden Tests eine Illusion
 * ------------------------------------------------------------------ */

describe('Testhelfer: Berliner Wanduhr -> UTC', () => {
  it('rechnet Sommer- und Winterzeit korrekt um', () => {
    expect(iso('2026-09-04 08:00')).toBe('2026-09-04T06:00:00.000Z'); // MESZ = UTC+2
    expect(iso('2026-01-15 08:00')).toBe('2026-01-15T07:00:00.000Z'); // MEZ  = UTC+1
  });

  it('kommt über die Umstellungsnacht hinweg auf denselben Zeitpunkt zurück', () => {
    expect(lokaleUhrzeit(iso('2026-10-25 06:00'))).toBe('06:00');
    expect(lokalesDatum(iso('2026-10-25 06:00'))).toBe('2026-10-25');
    // 00:30 MESZ liegt in UTC noch im Vortag — genau der Fall, für den es das
    // Feld `datum` gibt.
    expect(iso('2026-09-05 00:30')).toBe('2026-09-04T22:30:00.000Z');
    expect(lokalesDatum(iso('2026-09-05 00:30'))).toBe('2026-09-05');
  });
});

/* ------------------------------------------------------------------ *
 * Zeit-Helfer
 * ------------------------------------------------------------------ */

describe('minutenZwischen', () => {
  it('rechnet aus den UTC-Zeitstempeln, nicht aus der Wanduhr', () => {
    expect(minutenZwischen(iso('2026-09-04 08:00'), iso('2026-09-04 16:30'))).toBe(510);
  });

  it('liefert in der Nacht der Rückstellung 9 Stunden statt 8', () => {
    // 25.10.2026: die Uhr geht von 03:00 auf 02:00 zurück. 22:00 bis 06:00 sind
    // real 9 Stunden — und exakt die sind zu bezahlen.
    expect(minutenZwischen(iso('2026-10-24 22:00'), iso('2026-10-25 06:00'))).toBe(540);
  });

  it('liefert in der Nacht der Vorstellung 7 Stunden statt 8', () => {
    expect(minutenZwischen(iso('2026-03-28 22:00'), iso('2026-03-29 06:00'))).toBe(420);
  });

  it('kappt eine negative Differenz auf 0, statt Minusstunden zu erzeugen', () => {
    expect(minutenZwischen(iso('2026-09-04 16:00'), iso('2026-09-04 08:00'))).toBe(0);
  });
});

describe('formatiereStunden', () => {
  it('schreibt Minuten als Stundensumme', () => {
    expect(formatiereStunden(480)).toBe('8:00 h');
    expect(formatiereStunden(350)).toBe('5:50 h');
    expect(formatiereStunden(0)).toBe('0:00 h');
    expect(formatiereStunden(-90)).toBe('−1:30 h'); // Minuszeichen U+2212, nicht Bindestrich
  });
});

describe('berechneGesetzlichePause — § 4 ArbZG', () => {
  it('kennt die Schwellen als „mehr als", nicht „ab"', () => {
    expect(berechneGesetzlichePause(0)).toBe(0);
    expect(berechneGesetzlichePause(6 * 60)).toBe(0); // genau 6:00 -> keine Pflicht
    expect(berechneGesetzlichePause(6 * 60 + 1)).toBe(30);
    expect(berechneGesetzlichePause(9 * 60)).toBe(30); // genau 9:00 -> noch 30
    expect(berechneGesetzlichePause(9 * 60 + 1)).toBe(45);
    expect(berechneGesetzlichePause(12 * 60)).toBe(45);
  });
});

/* ------------------------------------------------------------------ *
 * Status und erlaubte Übergänge
 * ------------------------------------------------------------------ */

describe('erlaubteStempel', () => {
  it('bietet je Zustand genau die fachlich möglichen Stempel an', () => {
    expect(erlaubteStempel('abwesend')).toEqual(['kommen']);
    expect(erlaubteStempel('arbeitet')).toEqual(['pause_start', 'gehen']);
    expect(erlaubteStempel('pause')).toEqual(['pause_ende', 'gehen']);
  });

  it('erlaubt aus der Pause heraus Feierabend — ohne Umweg über Pausenende', () => {
    expect(erlaubteStempel('pause')).toContain('gehen');
  });
});

describe('ermittleStatus', () => {
  it('startet abwesend', () => {
    expect(ermittleStatus([])).toBe('abwesend');
  });

  it('führt durch die drei Zustände', () => {
    const k = ev('kommen', `${TAG} 08:00`);
    const ps = ev('pause_start', `${TAG} 12:00`);
    const pe = ev('pause_ende', `${TAG} 12:30`);
    const g = ev('gehen', `${TAG} 16:30`);
    expect(ermittleStatus([k])).toBe('arbeitet');
    expect(ermittleStatus([k, ps])).toBe('pause');
    expect(ermittleStatus([k, ps, pe])).toBe('arbeitet');
    expect(ermittleStatus([k, ps, pe, g])).toBe('abwesend');
    expect(ermittleStatus([k, ps, g])).toBe('abwesend'); // Feierabend aus der Pause
  });

  it('sortiert selbst und verlässt sich nicht auf die Reihenfolge im Array', () => {
    const k = ev('kommen', `${TAG} 08:00`);
    const g = ev('gehen', `${TAG} 16:30`);
    expect(ermittleStatus([g, k])).toBe('abwesend');
  });

  it('berücksichtigt Stornos — ein storniertes Gehen lässt den Mitarbeiter arbeiten', () => {
    const k = ev('kommen', `${TAG} 08:00`, { id: 'k1' });
    const g = ev('gehen', `${TAG} 16:30`, { id: 'g1' });
    const s = ev('storno', `${TAG} 17:00`, { id: 's1', bezugEventId: 'g1' });
    expect(ermittleStatus([k, g])).toBe('abwesend');
    expect(ermittleStatus([k, g, s])).toBe('arbeitet');
  });
});

/* ------------------------------------------------------------------ *
 * wirksameEvents / Storno
 * ------------------------------------------------------------------ */

describe('wirksameEvents', () => {
  it('entfernt das stornierte Event UND den Storno-Marker selbst', () => {
    const k = ev('kommen', `${TAG} 08:00`, { id: 'k1' });
    const g1 = ev('gehen', `${TAG} 12:00`, { id: 'g1' });
    const s = ev('storno', `${TAG} 12:05`, { id: 's1', bezugEventId: 'g1', begruendung: 'Fehlstempel' });
    const g2 = ev('gehen', `${TAG} 16:30`, { id: 'g2' });
    expect(wirksameEvents([k, g1, s, g2]).map((e) => e.id)).toEqual(['k1', 'g2']);
  });

  it('sortiert nach Zeitpunkt', () => {
    const k = ev('kommen', `${TAG} 08:00`, { id: 'k1' });
    const g = ev('gehen', `${TAG} 16:30`, { id: 'g1' });
    expect(wirksameEvents([g, k]).map((e) => e.id)).toEqual(['k1', 'g1']);
  });

  it('ignoriert einen Storno ohne bezugEventId, statt alles zu löschen', () => {
    const k = ev('kommen', `${TAG} 08:00`, { id: 'k1' });
    const s = ev('storno', `${TAG} 09:00`, { id: 's1' });
    expect(wirksameEvents([k, s]).map((e) => e.id)).toEqual(['k1']);
  });
});

describe('werteTagAus — Storno', () => {
  it('heilt einen Fehlstempel: der stornierte Gehen-Stempel zählt nicht mehr', () => {
    const events = [
      ev('kommen', `${TAG} 08:00`, { id: 'k1' }),
      ev('gehen', `${TAG} 12:00`, { id: 'g1' }),
      ev('gehen', `${TAG} 16:30`, { id: 'g2' }),
      ev('storno', `${TAG} 16:35`, { id: 's1', bezugEventId: 'g1', begruendung: 'versehentlich' }),
    ];
    const a = tag(TAG, events);
    expect(a.abschnitte).toHaveLength(1);
    expect(a.bruttoMinuten).toBe(510);
    expect(a.unvollstaendig).toBe(false);
    expect(a.events.map((e) => e.id)).toEqual(['k1', 'g2']);
    expect(a.events.some((e) => e.typ === 'storno')).toBe(false);
  });

  it('KANTE: ein Storno mit fremdem `datum` bleibt wirkungslos', () => {
    // werteTagAus filtert zuerst auf den Tag und wendet erst danach die Stornos
    // an. Trägt die API dem Storno-Event das Erfassungsdatum statt des Datums
    // des Originals ein, verpufft die Korrektur lautlos.
    const events = [
      ev('kommen', `${TAG} 08:00`, { id: 'k1' }),
      ev('gehen', `${TAG} 12:00`, { id: 'g1' }),
      ev('gehen', `${TAG} 16:30`, { id: 'g2' }),
      ev('storno', '2026-09-05 09:00', { id: 's1', bezugEventId: 'g1' }),
    ];
    const a = tag(TAG, events);
    expect(a.bruttoMinuten).toBe(240); // 08:00–12:00, der Rest fällt hinten runter
    expect(a.unvollstaendig).toBe(true);
    expect(texte(a).some((t) => t.includes('ohne Kommen-Stempel'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Der Normalfall und die Schwellen des § 4 ArbZG
 * ------------------------------------------------------------------ */

describe('werteTagAus — Normalfall', () => {
  it('08:00–16:30 mit 30 Min. Pause ergibt glatte 8:00 h ohne jeden Hinweis', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('pause_ende', `${TAG} 12:30`),
      ev('gehen', `${TAG} 16:30`),
    ]);
    expect(a.bruttoMinuten).toBe(510);
    expect(a.pausenMinuten).toBe(30);
    expect(a.gesetzlicherPausenabzug).toBe(0);
    expect(a.nettoMinuten).toBe(480);
    expect(formatiereStunden(a.nettoMinuten)).toBe('8:00 h');
    expect(a.laeuft).toBe(false);
    expect(a.unvollstaendig).toBe(false);
    expect(a.hinweise).toEqual([]);
    expect(lokaleUhrzeit(a.beginn!)).toBe('08:00');
    expect(lokaleUhrzeit(a.ende!)).toBe('16:30');
  });

  it('ignoriert Events anderer Mitarbeiter und anderer Tage', () => {
    const fremd = ev('kommen', `${TAG} 06:00`, { id: 'f1', mitarbeiterId: 'm2' });
    const vortag = ev('kommen', '2026-09-03 06:00', { id: 'v1' });
    const a = tag(TAG, [fremd, vortag, ev('kommen', `${TAG} 08:00`), ev('gehen', `${TAG} 12:00`)]);
    expect(a.events).toHaveLength(2);
    expect(a.bruttoMinuten).toBe(240);
  });

  it('rechnet einen geteilten Tag (zwei Abschnitte) zusammen', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('gehen', `${TAG} 12:00`),
      ev('kommen', `${TAG} 13:00`),
      ev('gehen', `${TAG} 17:00`),
    ]);
    expect(a.abschnitte).toHaveLength(2);
    expect(a.bruttoMinuten).toBe(480);
    expect(a.pausenMinuten).toBe(0);
    // Die Mittagslücke zählt NICHT als gestempelte Pause — deshalb greift
    // trotzdem der gesetzliche Abzug von 30 Minuten.
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(450);
    expect(lokaleUhrzeit(a.beginn!)).toBe('08:00');
    expect(lokaleUhrzeit(a.ende!)).toBe('17:00');
  });
});

describe('werteTagAus — § 4 ArbZG, gesetzlicher Pausenabzug', () => {
  it('6:20 Anwesenheit ohne Pause: 30 Min. Abzug, netto 5:50', () => {
    const a = tag(TAG, [ev('kommen', `${TAG} 08:00`), ev('gehen', `${TAG} 14:20`)]);
    expect(a.bruttoMinuten).toBe(380);
    expect(a.pausenMinuten).toBe(0);
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(350);
    expect(formatiereStunden(a.nettoMinuten)).toBe('5:50 h');
    const h = a.hinweise.find((x) => x.grundlage === '§ 4 ArbZG')!;
    expect(h.schwere).toBe('warnung');
    expect(h.text).toBe('30 Min. Pause automatisch abgezogen (gestempelt: 0 Min., erforderlich: 30 Min.)');
  });

  it('genau 6:00 Anwesenheit ohne Pause: KEIN Abzug — die Schwelle ist „mehr als"', () => {
    const a = tag(TAG, [ev('kommen', `${TAG} 08:00`), ev('gehen', `${TAG} 14:00`)]);
    expect(a.bruttoMinuten).toBe(360);
    expect(a.gesetzlicherPausenabzug).toBe(0);
    expect(a.nettoMinuten).toBe(360);
    expect(a.hinweise).toEqual([]);
  });

  it('KANTE: eine Minute über der Schwelle kostet die vollen 30 Minuten', () => {
    // 6:01 anwesend -> 5:31 bezahlt, also 30 Minuten weniger als bei 6:00.
    // Das ist die Rechtslage, aber die Sprungstelle sollte bewusst bleiben.
    const a = tag(TAG, [ev('kommen', `${TAG} 08:00`), ev('gehen', `${TAG} 14:01`)]);
    expect(a.bruttoMinuten).toBe(361);
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(331);
  });

  it('über 9 Stunden ohne Pause: 45 Min. Abzug', () => {
    const a = tag(TAG, [ev('kommen', `${TAG} 06:00`), ev('gehen', `${TAG} 15:30`)]);
    expect(a.bruttoMinuten).toBe(570);
    expect(a.gesetzlicherPausenabzug).toBe(45);
    expect(a.nettoMinuten).toBe(525);
    expect(a.hinweise.some((h) => h.grundlage === '§ 4 ArbZG')).toBe(true);
    // 8:45 h netto liegt über der Regelarbeitszeit -> zusätzlicher Info-Hinweis
    const info = a.hinweise.find((h) => h.grundlage === '§ 3 ArbZG')!;
    expect(info.schwere).toBe('info');
    expect(info.text).toContain('8:45 h');
  });

  it('teilweise gestempelte Pause: nur die Differenz wird abgezogen', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('pause_ende', `${TAG} 12:15`),
      ev('gehen', `${TAG} 16:30`),
    ]);
    expect(a.bruttoMinuten).toBe(510);
    expect(a.pausenMinuten).toBe(15);
    expect(a.gesetzlicherPausenabzug).toBe(15); // 30 gefordert − 15 gestempelt
    expect(a.nettoMinuten).toBe(480);
  });

  it('zieht bei überlanger Pause nichts zusätzlich ab', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('pause_ende', `${TAG} 13:00`),
      ev('gehen', `${TAG} 16:30`),
    ]);
    expect(a.pausenMinuten).toBe(60);
    expect(a.gesetzlicherPausenabzug).toBe(0);
    expect(a.nettoMinuten).toBe(450);
  });

  it('KANTE: die 9-Stunden-Schwelle ist nicht monoton — eine Minute mehr Pause bringt 15 Minuten mehr Lohn', () => {
    // Beide Tage: 08:00–17:30, also 9:30 h Anwesenheit.
    const basis = (pauseEnde: string) => [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('pause_ende', `${TAG} ${pauseEnde}`),
      ev('gehen', `${TAG} 17:30`),
    ];

    // 29 Min. Pause -> Arbeitszeit 9:01 h, also > 9 h -> 45 Min. Pflichtpause.
    const knapp = tag(TAG, basis('12:29'));
    expect(knapp.pausenMinuten).toBe(29);
    expect(knapp.gesetzlicherPausenabzug).toBe(16);
    expect(knapp.nettoMinuten).toBe(525);

    // 30 Min. Pause -> Arbeitszeit exakt 9:00 h -> nur 30 Min. Pflichtpause.
    const glatt = tag(TAG, basis('12:30'));
    expect(glatt.pausenMinuten).toBe(30);
    expect(glatt.gesetzlicherPausenabzug).toBe(0);
    expect(glatt.nettoMinuten).toBe(540);

    // Eine Minute länger Pause = 15 Minuten mehr bezahlte Zeit.
    expect(glatt.nettoMinuten - knapp.nettoMinuten).toBe(15);
  });
});

describe('werteTagAus — § 3 und § 9 ArbZG', () => {
  it('meldet die Überschreitung der Höchstarbeitszeit als Verstoß', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 05:00`),
      ev('pause_start', `${TAG} 11:00`),
      ev('pause_ende', `${TAG} 11:45`),
      ev('gehen', `${TAG} 16:00`),
    ]);
    expect(a.nettoMinuten).toBe(615); // 10:15 h
    const h = a.hinweise.find((x) => x.grundlage === '§ 3 ArbZG')!;
    expect(h.schwere).toBe('verstoss');
    expect(h.text).toContain('10:15 h');
  });

  it('markiert Sonntagsarbeit', () => {
    const sonntag = '2026-09-06';
    const a = tag(sonntag, [ev('kommen', `${sonntag} 09:00`), ev('gehen', `${sonntag} 13:00`)], iso('2026-09-07 08:00'));
    expect(a.hinweise.some((h) => h.grundlage === '§ 9 ArbZG' && h.text === 'Sonntagsarbeit')).toBe(true);
  });

  it('meldet keine Sonntagsarbeit an einem leeren Sonntag', () => {
    const a = tag('2026-09-06', [], iso('2026-09-07 08:00'));
    expect(a.hinweise).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Kaputte Ketten
 * ------------------------------------------------------------------ */

describe('werteTagAus — unvollständige Ketten', () => {
  it('Feierabend aus der Pause heraus: das Gehen beendet auch die Pause', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('gehen', `${TAG} 12:30`),
    ]);
    expect(a.unvollstaendig).toBe(false);
    expect(a.pausen).toHaveLength(1);
    expect(a.pausen[0].laeuft).toBe(false);
    expect(lokaleUhrzeit(a.pausen[0].bis!)).toBe('12:30');
    expect(a.bruttoMinuten).toBe(270);
    expect(a.pausenMinuten).toBe(30);
    expect(a.nettoMinuten).toBe(240);
    expect(a.hinweise).toEqual([]);
  });

  it('vergessener Gehen-Stempel an einem vergangenen Tag: Verstoß, und die Zeit wird NICHT geschätzt', () => {
    const vergangen = '2026-09-01';
    const a = tag(vergangen, [ev('kommen', `${vergangen} 08:00`)], JETZT);
    expect(a.unvollstaendig).toBe(true);
    expect(a.laeuft).toBe(false);
    expect(a.bruttoMinuten).toBe(0);
    expect(a.nettoMinuten).toBe(0);
    expect(a.abschnitte).toHaveLength(1);
    expect(a.abschnitte[0].minuten).toBe(0);
    expect(a.abschnitte[0].bis).toBeNull();
    expect(a.abschnitte[0].laeuft).toBe(false);
    const h = a.hinweise.find((x) => x.text.includes('Kein Gehen-Stempel'))!;
    expect(h.schwere).toBe('verstoss');
    expect(h.text).toContain('08:00');
    expect(a.ende).toBeNull();
    expect(lokaleUhrzeit(a.beginn!)).toBe('08:00');
  });

  it('nie beendete Pause an einem vergangenen Tag wird gemeldet', () => {
    const vergangen = '2026-09-01';
    const a = tag(
      vergangen,
      [
        ev('kommen', `${vergangen} 08:00`),
        ev('pause_start', `${vergangen} 12:00`),
        ev('gehen', `${vergangen} 16:30`),
      ],
      JETZT
    );
    // Das Gehen schließt die Pause — hier bleibt also nichts offen.
    expect(a.pausenMinuten).toBe(270);
    expect(a.unvollstaendig).toBe(false);
  });

  it('doppeltes Kommen: Warnung — der FRÜHERE Zeitpunkt bleibt gültig', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('kommen', `${TAG} 09:00`),
      ev('gehen', `${TAG} 17:00`),
    ]);
    expect(a.unvollstaendig).toBe(true);
    expect(texte(a).some((t) => t.startsWith('Zweiter Kommen-Stempel um 09:00'))).toBe(true);
    // Der zweite Stempel darf den ersten NICHT überschreiben — das würde dem
    // Mitarbeiter die Stunde dazwischen lautlos streichen. Es gilt 08:00, der
    // Fehler wird gemeldet und ist per Nachtrag zu klären.
    expect(a.abschnitte).toHaveLength(1);
    expect(lokaleUhrzeit(a.abschnitte[0].von)).toBe('08:00');
    expect(a.bruttoMinuten).toBe(540);
  });

  it('Gehen ohne Kommen: Warnung, keine Minuten', () => {
    const a = tag(TAG, [ev('gehen', `${TAG} 16:00`)]);
    expect(a.unvollstaendig).toBe(true);
    expect(a.bruttoMinuten).toBe(0);
    expect(a.nettoMinuten).toBe(0);
    expect(a.abschnitte).toEqual([]);
    expect(texte(a).some((t) => t.startsWith('Gehen um 16:00 ohne Kommen-Stempel'))).toBe(true);
  });

  it('Pausenende ohne Pausenbeginn: Warnung, und die Pause zählt gar nicht', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_ende', `${TAG} 12:30`),
      ev('gehen', `${TAG} 16:00`),
    ]);
    expect(a.unvollstaendig).toBe(true);
    expect(a.pausen).toEqual([]);
    expect(a.pausenMinuten).toBe(0);
    expect(texte(a).some((t) => t.startsWith('Pausenende um 12:30 ohne Pausenbeginn'))).toBe(true);
    // Ohne gestempelte Pause greift der gesetzliche Abzug.
    expect(a.bruttoMinuten).toBe(480);
    expect(a.nettoMinuten).toBe(450);
  });

  it('doppelter Pausenbeginn: der zweite wird verworfen, der erste zählt weiter', () => {
    const a = tag(TAG, [
      ev('kommen', `${TAG} 08:00`),
      ev('pause_start', `${TAG} 12:00`),
      ev('pause_start', `${TAG} 12:10`),
      ev('pause_ende', `${TAG} 12:30`),
      ev('gehen', `${TAG} 16:30`),
    ]);
    expect(a.unvollstaendig).toBe(true);
    expect(texte(a).some((t) => t.startsWith('Doppelter Pausenbeginn um 12:10'))).toBe(true);
    expect(a.pausen).toHaveLength(1);
    expect(a.pausenMinuten).toBe(30);
    expect(a.nettoMinuten).toBe(480);
  });

  it('Pausenbeginn ohne Kommen: Warnung, und die Pause wird nicht eröffnet', () => {
    const a = tag(TAG, [
      ev('pause_start', `${TAG} 12:00`),
      ev('kommen', `${TAG} 13:00`),
      ev('gehen', `${TAG} 17:00`),
    ]);
    expect(a.unvollstaendig).toBe(true);
    expect(texte(a).some((t) => t.startsWith('Pausenbeginn um 12:00 ohne Kommen-Stempel'))).toBe(true);
    expect(a.pausen).toEqual([]);
    expect(a.bruttoMinuten).toBe(240);
  });

  it('leerer Tag ist weder unvollständig noch laufend', () => {
    const a = tag(TAG, []);
    expect(a.bruttoMinuten).toBe(0);
    expect(a.unvollstaendig).toBe(false);
    expect(a.laeuft).toBe(false);
    expect(a.beginn).toBeNull();
    expect(a.ende).toBeNull();
    expect(a.hinweise).toEqual([]);
  });

  it('gemischte ISO-Schreibweisen ändern die Reihenfolge nicht', () => {
    // Sortiert würde nach Zeitwert, nicht nach Zeichenkette. Sonst stünde hier
    // das Gehen (07:00Z) vor dem Kommen (08:00+02:00 = 06:00Z), obwohl es real
    // eine Stunde später liegt — und aus 60 Minuten Arbeit würde eine kaputte
    // Kette. Die Function normalisiert zwar auf „…Z", aber der Rechenkern darf
    // sich darauf nicht verlassen.
    const k = ev('kommen', `${TAG} 08:00`, { id: 'k1', zeitpunkt: '2026-09-04T08:00:00+02:00' });
    const g = ev('gehen', `${TAG} 09:00`, { id: 'g1', zeitpunkt: '2026-09-04T07:00:00.000Z' });
    expect(wirksameEvents([g, k]).map((e) => e.id)).toEqual(['k1', 'g1']);
    const a = tag(TAG, [k, g], iso('2026-09-05 08:00'));
    expect(a.bruttoMinuten).toBe(60);
    expect(a.unvollstaendig).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Laufender Tag
 * ------------------------------------------------------------------ */

describe('werteTagAus — laufender Tag', () => {
  it('rechnet bis „jetzt", solange der Tag heute ist', () => {
    const a = tag(TAG, [ev('kommen', `${TAG} 08:00`)], iso(`${TAG} 12:00`));
    expect(a.laeuft).toBe(true);
    expect(a.unvollstaendig).toBe(false);
    expect(a.bruttoMinuten).toBe(240);
    expect(a.nettoMinuten).toBe(240);
    expect(a.abschnitte[0].bis).toBeNull();
    expect(a.abschnitte[0].laeuft).toBe(true);
    expect(a.ende).toBeNull();
  });

  it('zählt eine laufende Pause mit', () => {
    const a = tag(
      TAG,
      [ev('kommen', `${TAG} 08:00`), ev('pause_start', `${TAG} 12:00`)],
      iso(`${TAG} 12:20`)
    );
    expect(a.laeuft).toBe(true);
    expect(a.bruttoMinuten).toBe(260);
    expect(a.pausen[0].laeuft).toBe(true);
    expect(a.pausenMinuten).toBe(20);
    expect(a.nettoMinuten).toBe(240);
  });

  it('zieht die gesetzliche Pause schon während des laufenden Tages ab', () => {
    const a = tag(TAG, [ev('kommen', `${TAG} 08:00`)], iso(`${TAG} 14:01`));
    expect(a.bruttoMinuten).toBe(361);
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(331);
  });

  it('läuft über Mitternacht weiter, statt auf 0 Minuten zurückzufallen', () => {
    const events = [ev('kommen', `${TAG} 20:00`)];
    const vorMitternacht = tag(TAG, events, iso(`${TAG} 23:59`));
    expect(vorMitternacht.laeuft).toBe(true);
    expect(vorMitternacht.bruttoMinuten).toBe(239);

    // Eine Minute später steht der Mitarbeiter noch an der Anlage. Ob ein
    // Abschnitt läuft, darf deshalb nicht am Kalenderdatum hängen, sondern
    // daran, wie lange der Stempel offen ist.
    const nachMitternacht = tag(TAG, events, iso('2026-09-05 00:00'));
    expect(nachMitternacht.laeuft).toBe(true);
    expect(nachMitternacht.bruttoMinuten).toBe(240);
    expect(nachMitternacht.unvollstaendig).toBe(false);
    expect(nachMitternacht.hinweise.some((h) => h.schwere === 'verstoss')).toBe(false);
  });

  it('gilt nach mehr als 24 Stunden als vergessener Stempel, nicht als laufend', () => {
    const events = [ev('kommen', `${TAG} 20:00`)];
    const zweiTageSpaeter = tag(TAG, events, iso('2026-09-06 08:00'));
    expect(zweiTageSpaeter.laeuft).toBe(false);
    expect(zweiTageSpaeter.bruttoMinuten).toBe(0);
    expect(zweiTageSpaeter.unvollstaendig).toBe(true);
    expect(zweiTageSpaeter.hinweise.some((h) => h.schwere === 'verstoss')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Nachtschicht und Zeitumstellung
 * ------------------------------------------------------------------ */

describe('werteTagAus — Nachtschicht über Mitternacht', () => {
  const von = '2026-09-10'; // Donnerstag
  const bis = '2026-09-11';
  const spaeter = iso('2026-09-12 08:00');
  // Wie die API es laut Vertrag ablegt: `datum` = lokales Datum des Zeitpunkts.
  const nacht = [ev('kommen', `${von} 22:00`), ev('gehen', `${bis} 06:00`)];

  it('BEFUND: die Schicht zerfällt in zwei Tage und ergibt null bezahlte Minuten', () => {
    expect(nacht[0].datum).toBe(von);
    expect(nacht[1].datum).toBe(bis);

    const tag1 = tag(von, nacht, spaeter);
    expect(tag1.bruttoMinuten).toBe(0);
    expect(tag1.nettoMinuten).toBe(0);
    expect(tag1.unvollstaendig).toBe(true);
    expect(tag1.hinweise.some((h) => h.schwere === 'verstoss' && h.text.includes('Kein Gehen-Stempel'))).toBe(true);

    const tag2 = tag(bis, nacht, spaeter);
    expect(tag2.bruttoMinuten).toBe(0);
    expect(tag2.unvollstaendig).toBe(true);
    expect(texte(tag2).some((t) => t.includes('ohne Kommen-Stempel'))).toBe(true);

    // 8 Stunden Nachtarbeit, 0 Minuten Lohn, zwei Fehlermeldungen.
    const s = summiere([tag1, tag2]);
    expect(s.nettoMinuten).toBe(0);
    expect(s.arbeitstage).toBe(0);
    expect(s.unvollstaendigeTage).toBe(2);
  });

  it('rechnet richtig, sobald beide Stempel demselben Schichttag zugeordnet sind', () => {
    const gleicherTag = [
      ev('kommen', `${von} 22:00`),
      ev('gehen', `${bis} 06:00`, { datum: von }),
    ];
    const a = tag(von, gleicherTag, spaeter);
    expect(a.bruttoMinuten).toBe(480);
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(450);
    expect(a.unvollstaendig).toBe(false);
  });
});

describe('werteTagAus — Zeitumstellung', () => {
  it('Rückstellung 25.10.2026: 22:00–06:00 sind 9 Stunden, nicht 8', () => {
    // Beide Stempel auf den Schichttag gebucht, damit die Tagesgrenze den Fall
    // nicht vorher zerlegt.
    const events = [
      ev('kommen', '2026-10-24 22:00'),
      ev('gehen', '2026-10-25 06:00', { datum: '2026-10-24' }),
    ];
    const a = tag('2026-10-24', events, iso('2026-10-26 08:00'));
    expect(a.bruttoMinuten).toBe(540);
    expect(a.bruttoMinuten).not.toBe(480);
    expect(formatiereStunden(a.bruttoMinuten)).toBe('9:00 h');
    // Arbeitszeit exakt 9:00 h -> noch 30 Min. Pflichtpause, nicht 45.
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(510);
  });

  it('Vorstellung 29.03.2026: 22:00–06:00 sind nur 7 Stunden', () => {
    const events = [
      ev('kommen', '2026-03-28 22:00'),
      ev('gehen', '2026-03-29 06:00', { datum: '2026-03-28' }),
    ];
    const a = tag('2026-03-28', events, iso('2026-03-30 08:00'));
    expect(a.bruttoMinuten).toBe(420);
    expect(a.bruttoMinuten).not.toBe(480);
    expect(a.gesetzlicherPausenabzug).toBe(30);
    expect(a.nettoMinuten).toBe(390);
  });

  it('ein Tagdienst am Umstellungstag selbst bleibt unauffällig', () => {
    // 08:00–16:30 am 25.10. — die Umstellung liegt vor Arbeitsbeginn.
    const t = '2026-10-25';
    const a = tag(
      t,
      [
        ev('kommen', `${t} 08:00`),
        ev('pause_start', `${t} 12:00`),
        ev('pause_ende', `${t} 12:30`),
        ev('gehen', `${t} 16:30`),
      ],
      iso('2026-10-26 08:00')
    );
    expect(a.bruttoMinuten).toBe(510);
    expect(a.nettoMinuten).toBe(480);
    // 25.10.2026 ist ein Sonntag — der einzige Hinweis, den es geben darf.
    expect(a.hinweise.map((h) => h.grundlage)).toEqual(['§ 9 ArbZG']);
  });
});

/* ------------------------------------------------------------------ *
 * Zeitraum, Ruhezeit, Summen
 * ------------------------------------------------------------------ */

describe('werteZeitraumAus — § 5 ArbZG Ruhezeit', () => {
  const schicht = (datum: string, von: string, bis: string) => [
    ev('kommen', `${datum} ${von}`),
    ev('gehen', `${datum} ${bis}`),
  ];

  it('meldet einen Verstoß, wenn zwischen 22:00 und 06:00 nur 8 Stunden liegen', () => {
    const events = [...schicht('2026-09-07', '13:00', '22:00'), ...schicht('2026-09-08', '06:00', '14:00')];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-08', MA, events, iso('2026-09-09 08:00'));
    expect(tage).toHaveLength(2);
    expect(tage[0].hinweise.some((h) => h.grundlage === '§ 5 ArbZG')).toBe(false);
    const h = tage[1].hinweise.find((x) => x.grundlage === '§ 5 ArbZG')!;
    expect(h.schwere).toBe('verstoss');
    expect(h.text).toContain('8:00 h');
  });

  it('meldet nichts bei genau 11 Stunden Ruhezeit', () => {
    const events = [...schicht('2026-09-07', '13:00', '22:00'), ...schicht('2026-09-08', '09:00', '17:00')];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-08', MA, events, iso('2026-09-09 08:00'));
    expect(tage[1].hinweise.some((h) => h.grundlage === '§ 5 ArbZG')).toBe(false);
  });

  it('KANTE: 10:59 h Ruhe werden gemeldet, 11:00 h nicht — die Grenze ist scharf', () => {
    const events = [...schicht('2026-09-07', '13:00', '22:00'), ...schicht('2026-09-08', '08:59', '17:00')];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-08', MA, events, iso('2026-09-09 08:00'));
    expect(tage[1].hinweise.some((h) => h.grundlage === '§ 5 ArbZG')).toBe(true);
  });

  it('meldet die Ruhezeit als "nicht prüfbar", wenn am Vortag der Gehen-Stempel fehlt', () => {
    // `ende` ist null, der Vergleich kann nicht rechnen. Zu schweigen wäre hier
    // das Schlechteste: es ist genau der Tag, an dem es spät wurde.
    const events = [ev('kommen', '2026-09-07 13:00'), ...schicht('2026-09-08', '06:00', '14:00')];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-08', MA, events, iso('2026-09-09 08:00'));
    expect(tage[0].unvollstaendig).toBe(true);
    const ruheHinweis = tage[1].hinweise.find((h) => h.grundlage === '§ 5 ArbZG');
    expect(ruheHinweis).toBeDefined();
    expect(ruheHinweis?.schwere).toBe('warnung');
    expect(ruheHinweis?.text).toContain('nicht prüfbar');
  });

  it('prüft nur unmittelbar benachbarte Tage — ein leerer Tag dazwischen unterbricht', () => {
    const events = [...schicht('2026-09-07', '13:00', '22:00'), ...schicht('2026-09-09', '06:00', '14:00')];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-09', MA, events, iso('2026-09-10 08:00'));
    expect(tage).toHaveLength(3);
    expect(tage[2].hinweise.some((h) => h.grundlage === '§ 5 ArbZG')).toBe(false);
  });
});

describe('summiere', () => {
  it('zählt Netto, Verstöße und unvollständige Tage über die Woche', () => {
    const events = [
      // Mo: 8:00 h netto
      ev('kommen', '2026-09-07 08:00'),
      ev('pause_start', '2026-09-07 12:00'),
      ev('pause_ende', '2026-09-07 12:30'),
      ev('gehen', '2026-09-07 16:30'),
      // Di: 6:20 h ohne Pause -> 5:50 h netto
      ev('kommen', '2026-09-08 08:00'),
      ev('gehen', '2026-09-08 14:20'),
      // Mi: Gehen vergessen
      ev('kommen', '2026-09-09 08:00'),
    ];
    const tage = werteZeitraumAus('2026-09-07', '2026-09-11', MA, events, iso('2026-09-12 08:00'));
    const s = summiere(tage);
    expect(tage).toHaveLength(5);
    expect(s.nettoMinuten).toBe(830); // 480 + 350 + 0
    expect(s.bruttoMinuten).toBe(890); // 510 + 380 + 0
    expect(s.pausenMinuten).toBe(30);
    expect(s.gesetzlicherPausenabzug).toBe(30);
    expect(s.arbeitstage).toBe(2); // der Mittwoch zählt mangels Minuten NICHT mit
    expect(s.unvollstaendigeTage).toBe(1);
    expect(s.verstoesse).toBe(1);
  });

  it('liefert für eine leere Liste lauter Nullen', () => {
    const s = summiere([]);
    expect(s).toEqual({
      nettoMinuten: 0,
      bruttoMinuten: 0,
      pausenMinuten: 0,
      gesetzlicherPausenabzug: 0,
      arbeitstage: 0,
      unvollstaendigeTage: 0,
      verstoesse: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Datumsarithmetik
 * ------------------------------------------------------------------ */

describe('datumsBereich', () => {
  it('läuft über den Monatswechsel', () => {
    expect(datumsBereich('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('kennt den 29. Februar im Schaltjahr', () => {
    expect(datumsBereich('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('überspringt den 29. Februar im Nicht-Schaltjahr', () => {
    expect(datumsBereich('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });

  it('läuft über den Jahreswechsel', () => {
    expect(datumsBereich('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('verliert an den Umstellungstagen keinen Tag und erfindet keinen', () => {
    expect(datumsBereich('2026-03-28', '2026-03-30')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(datumsBereich('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('liefert einen einzelnen Tag und bei umgekehrter Reihenfolge nichts', () => {
    expect(datumsBereich('2026-09-04', '2026-09-04')).toEqual(['2026-09-04']);
    expect(datumsBereich('2026-09-04', '2026-09-01')).toEqual([]);
  });

  it('deckt ein volles Jahr ab', () => {
    expect(datumsBereich('2026-01-01', '2026-12-31')).toHaveLength(365);
    expect(datumsBereich('2024-01-01', '2024-12-31')).toHaveLength(366);
  });
});

describe('monatsGrenzen', () => {
  it('trifft die Monatslängen inklusive Schaltjahr', () => {
    expect(monatsGrenzen('2026-02')).toEqual({ von: '2026-02-01', bis: '2026-02-28' });
    expect(monatsGrenzen('2024-02')).toEqual({ von: '2024-02-01', bis: '2024-02-29' });
    expect(monatsGrenzen('2026-09')).toEqual({ von: '2026-09-01', bis: '2026-09-30' });
    expect(monatsGrenzen('2026-12')).toEqual({ von: '2026-12-01', bis: '2026-12-31' });
  });

  it('passt mit datumsBereich zusammen', () => {
    const { von, bis } = monatsGrenzen('2026-10');
    expect(datumsBereich(von, bis)).toHaveLength(31);
  });
});
