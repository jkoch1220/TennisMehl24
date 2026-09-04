/**
 * Rechenkern der Zeiterfassung — reine Funktionen, keine Appwrite-Aufrufe.
 *
 * Hier entsteht aus der rohen Stempelkette die Zahl, die am Monatsende zählt.
 * Deshalb liegt die Logik bewusst getrennt von UI und Service: sie ist ohne
 * Datenbank testbar (src/utils/__tests__/zeiterfassungBerechnung.test.ts), und
 * Server wie Client rechnen garantiert dasselbe Ergebnis.
 */

import {
  type Arbeitsabschnitt,
  type Pausenabschnitt,
  type TagesAuswertung,
  type ZeitEvent,
  type ZeitHinweis,
  type StempelStatus,
  HOECHSTARBEITSZEIT_MINUTEN,
  MAX_TAGESDAUER_MINUTEN,
  REGELARBEITSZEIT_MINUTEN,
  RUHEZEIT_MINUTEN,
  berechneGesetzlichePause,
  formatiereStunden,
  minutenZwischen,
} from '../types/zeiterfassung';

/**
 * Entfernt stornierte Events und die Storno-Marker selbst.
 *
 * Der Aufhebungsvermerk bleibt in der Datenbank stehen — er verschwindet nur aus
 * der Auswertung. Genau das ist der Unterschied zwischen einem Storno und einem
 * Löschvorgang: der Prüfer sieht beides, die Stundenzahl nur das Gültige.
 */
export function wirksameEvents(events: ZeitEvent[]): ZeitEvent[] {
  const aufgehoben = new Set(
    events.filter((e) => e.typ === 'storno' && e.bezugEventId).map((e) => e.bezugEventId as string)
  );
  return events
    .filter((e) => e.typ !== 'storno' && !aufgehoben.has(e.id))
    // Nach Zeitwert sortieren, nicht nach Zeichenkette: "…T08:00:00+02:00" und
    // "…T07:00:00.000Z" bezeichnen denselben Moment, sortieren als Text aber
    // falsch herum — und eine verdrehte Kette macht aus Arbeitszeit Unsinn.
    .sort((a, b) => new Date(a.zeitpunkt).getTime() - new Date(b.zeitpunkt).getTime());
}

/** Aktueller Stempelzustand aus der (bereits bereinigten) Event-Kette. */
export function ermittleStatus(events: ZeitEvent[]): StempelStatus {
  const sortiert = wirksameEvents(events);
  let status: StempelStatus = 'abwesend';
  for (const e of sortiert) {
    if (e.typ === 'kommen') status = 'arbeitet';
    else if (e.typ === 'pause_start' && status === 'arbeitet') status = 'pause';
    else if (e.typ === 'pause_ende' && status === 'pause') status = 'arbeitet';
    else if (e.typ === 'gehen') status = 'abwesend';
  }
  return status;
}

/**
 * Welche Stempel von einem Zustand aus fachlich erlaubt sind.
 *
 * Die UI zeigt nur diese Knöpfe an, und der Server prüft dieselbe Funktion —
 * sonst entstehen Ketten wie zweimal "kommen" ohne "gehen", die sich später
 * nur noch per Korrekturantrag reparieren lassen.
 */
export function erlaubteStempel(status: StempelStatus): ZeitEvent['typ'][] {
  switch (status) {
    case 'abwesend':
      return ['kommen'];
    case 'arbeitet':
      return ['pause_start', 'gehen'];
    case 'pause':
      return ['pause_ende', 'gehen'];
  }
}

/**
 * Wertet die Events EINES Tages für EINEN Mitarbeiter aus.
 *
 * `jetzt` wird hereingereicht statt intern gelesen: ein laufender Tag muss bis
 * zum aktuellen Zeitpunkt gerechnet werden, und Tests brauchen eine feste Uhr.
 */
export function werteTagAus(
  datum: string,
  mitarbeiterId: string,
  alleEvents: ZeitEvent[],
  jetzt: string = new Date().toISOString()
): TagesAuswertung {
  const events = wirksameEvents(
    alleEvents.filter((e) => e.mitarbeiterId === mitarbeiterId && e.datum === datum)
  );

  const abschnitte: Arbeitsabschnitt[] = [];
  const pausen: Pausenabschnitt[] = [];
  const hinweise: ZeitHinweis[] = [];
  let unvollstaendig = false;

  let offenesKommen: string | null = null;
  let offenePause: string | null = null;

  for (const e of events) {
    switch (e.typ) {
      case 'kommen':
        if (offenesKommen) {
          // Zweites "Kommen" ohne "Gehen": der frühere Zeitpunkt gilt weiter.
          // Ihn zu überschreiben würde dem Mitarbeiter die Zeit dazwischen
          // ersatzlos streichen — und zwar lautlos. Der Fehler wird gemeldet
          // und ist per Nachtrag zu klären, nicht durch stilles Kürzen.
          unvollstaendig = true;
          hinweise.push({
            schwere: 'warnung',
            text: `Zweiter Kommen-Stempel um ${uhr(e.zeitpunkt)} ohne vorheriges Gehen — es gilt weiterhin ${uhr(offenesKommen)}`,
          });
          break;
        }
        offenesKommen = e.zeitpunkt;
        break;

      case 'pause_start':
        if (!offenesKommen) {
          unvollstaendig = true;
          hinweise.push({ schwere: 'warnung', text: `Pausenbeginn um ${uhr(e.zeitpunkt)} ohne Kommen-Stempel` });
          break;
        }
        if (offenePause) {
          unvollstaendig = true;
          hinweise.push({ schwere: 'warnung', text: `Doppelter Pausenbeginn um ${uhr(e.zeitpunkt)}` });
          break;
        }
        offenePause = e.zeitpunkt;
        break;

      case 'pause_ende':
        if (!offenePause) {
          unvollstaendig = true;
          hinweise.push({ schwere: 'warnung', text: `Pausenende um ${uhr(e.zeitpunkt)} ohne Pausenbeginn` });
          break;
        }
        pausen.push({
          von: offenePause,
          bis: e.zeitpunkt,
          minuten: minutenZwischen(offenePause, e.zeitpunkt),
          laeuft: false,
        });
        offenePause = null;
        break;

      case 'gehen':
        if (offenePause) {
          // Feierabend aus der Pause heraus: die Pause endet mit dem Gehen.
          pausen.push({
            von: offenePause,
            bis: e.zeitpunkt,
            minuten: minutenZwischen(offenePause, e.zeitpunkt),
            laeuft: false,
          });
          offenePause = null;
        }
        if (!offenesKommen) {
          unvollstaendig = true;
          hinweise.push({ schwere: 'warnung', text: `Gehen um ${uhr(e.zeitpunkt)} ohne Kommen-Stempel` });
          break;
        }
        abschnitte.push({
          von: offenesKommen,
          bis: e.zeitpunkt,
          minuten: minutenZwischen(offenesKommen, e.zeitpunkt),
          laeuft: false,
        });
        offenesKommen = null;
        break;
    }
  }

  // Noch offene Ketten.
  //
  // Ob ein Abschnitt noch LÄUFT, entscheidet bewusst nicht das Kalenderdatum,
  // sondern wie lange der Stempel offen ist. Andernfalls fiele eine Schicht,
  // die über Mitternacht geht, im Moment des Datumswechsels schlagartig von
  // "3:59 h" auf "0:00 h — kein Gehen-Stempel", während der Mitarbeiter noch
  // an der Anlage steht. Erst wenn ein Stempel länger offen ist, als ein Tag
  // haben kann, ist er nachweislich vergessen worden.
  const offenSeitKommen = offenesKommen ? minutenZwischen(offenesKommen, jetzt) : 0;
  const laeuft = Boolean(offenesKommen) && offenSeitKommen <= MAX_TAGESDAUER_MINUTEN;

  if (offenesKommen) {
    if (laeuft) {
      abschnitte.push({
        von: offenesKommen,
        bis: null,
        minuten: offenSeitKommen,
        laeuft: true,
      });
    } else {
      unvollstaendig = true;
      hinweise.push({
        schwere: 'verstoss',
        text: `Kein Gehen-Stempel — der Tag ist seit ${uhr(offenesKommen)} offen und muss nachgetragen werden`,
      });
      // Bewusst mit 0 Minuten bewertet: eine geschätzte Dauer wäre erfunden.
      abschnitte.push({ von: offenesKommen, bis: null, minuten: 0, laeuft: false });
    }
  }

  if (offenePause) {
    if (laeuft) {
      pausen.push({
        von: offenePause,
        bis: null,
        minuten: minutenZwischen(offenePause, jetzt),
        laeuft: true,
      });
    } else {
      unvollstaendig = true;
      hinweise.push({ schwere: 'warnung', text: `Pause ab ${uhr(offenePause)} wurde nie beendet` });
    }
  }

  const bruttoMinuten = abschnitte.reduce((s, a) => s + a.minuten, 0);
  const pausenMinuten = pausen.reduce((s, p) => s + p.minuten, 0);
  const arbeitOhnePause = Math.max(0, bruttoMinuten - pausenMinuten);

  // § 4 ArbZG: fehlt die Mindestpause, wird sie abgezogen — sichtbar ausgewiesen.
  const pflichtPause = berechneGesetzlichePause(arbeitOhnePause);
  const gesetzlicherPausenabzug = Math.max(0, pflichtPause - pausenMinuten);
  const nettoMinuten = Math.max(0, arbeitOhnePause - gesetzlicherPausenabzug);

  if (gesetzlicherPausenabzug > 0) {
    hinweise.push({
      schwere: 'warnung',
      text: `${gesetzlicherPausenabzug} Min. Pause automatisch abgezogen (gestempelt: ${pausenMinuten} Min., erforderlich: ${pflichtPause} Min.)`,
      grundlage: '§ 4 ArbZG',
    });
  }

  if (nettoMinuten > HOECHSTARBEITSZEIT_MINUTEN) {
    hinweise.push({
      schwere: 'verstoss',
      text: `Höchstarbeitszeit überschritten: ${formatiereStunden(nettoMinuten)}`,
      grundlage: '§ 3 ArbZG',
    });
  } else if (nettoMinuten > REGELARBEITSZEIT_MINUTEN) {
    hinweise.push({
      schwere: 'info',
      text: `Über 8 Stunden (${formatiereStunden(nettoMinuten)}) — nur zulässig, wenn im Halbjahresschnitt ausgeglichen`,
      grundlage: '§ 3 ArbZG',
    });
  }

  // § 9 ArbZG: Sonntagsarbeit ist grundsätzlich verboten, mit Ausnahmen.
  const wochentag = new Date(`${datum}T12:00:00`).getDay();
  if (wochentag === 0 && bruttoMinuten > 0) {
    hinweise.push({ schwere: 'info', text: 'Sonntagsarbeit', grundlage: '§ 9 ArbZG' });
  }

  const ersterStempel = events.find((e) => e.typ === 'kommen');
  const letzterStempel = [...events].reverse().find((e) => e.typ === 'gehen');

  return {
    datum,
    mitarbeiterId,
    events,
    abschnitte,
    pausen,
    bruttoMinuten,
    pausenMinuten,
    gesetzlicherPausenabzug,
    nettoMinuten,
    beginn: ersterStempel ? ersterStempel.zeitpunkt : null,
    ende: letzterStempel ? letzterStempel.zeitpunkt : null,
    laeuft,
    unvollstaendig,
    hinweise,
  };
}

/**
 * Wertet einen Zeitraum aus und ergänzt die Ruhezeit-Prüfung, die nur über
 * Tagesgrenzen hinweg möglich ist.
 *
 * `von`/`bis` sind lokale ISO-Daten (YYYY-MM-DD), beide einschließlich.
 */
export function werteZeitraumAus(
  von: string,
  bis: string,
  mitarbeiterId: string,
  events: ZeitEvent[],
  jetzt: string = new Date().toISOString()
): TagesAuswertung[] {
  const tage: TagesAuswertung[] = [];
  for (const datum of datumsBereich(von, bis)) {
    tage.push(werteTagAus(datum, mitarbeiterId, events, jetzt));
  }

  // § 5 ArbZG: 11 Stunden Ruhe zwischen Feierabend und nächstem Arbeitsbeginn.
  for (let i = 1; i < tage.length; i++) {
    const vortag = tage[i - 1];
    const heute = tage[i];
    if (!heute.beginn) continue;

    if (!vortag.ende) {
      // Der Vortag hat keinen Feierabend-Stempel. Genau das ist der Tag, an dem
      // es spät wurde — hier zu schweigen hieße, den Verdachtsfall auszublenden.
      if (vortag.unvollstaendig) {
        heute.hinweise.push({
          schwere: 'warnung',
          text: 'Ruhezeit nicht prüfbar — am Vortag fehlt der Gehen-Stempel',
          grundlage: '§ 5 ArbZG',
        });
      }
      continue;
    }

    const ruhe = minutenZwischen(vortag.ende, heute.beginn);
    if (ruhe < RUHEZEIT_MINUTEN) {
      heute.hinweise.push({
        schwere: 'verstoss',
        text: `Nur ${formatiereStunden(ruhe)} Ruhezeit seit dem Vortag (erforderlich: 11:00 h)`,
        grundlage: '§ 5 ArbZG',
      });
    }
  }

  return tage;
}

/** Summen über eine Tagesliste — die Zeile unter der Monatstabelle. */
export function summiere(tage: TagesAuswertung[]) {
  return {
    nettoMinuten: tage.reduce((s, t) => s + t.nettoMinuten, 0),
    bruttoMinuten: tage.reduce((s, t) => s + t.bruttoMinuten, 0),
    pausenMinuten: tage.reduce((s, t) => s + t.pausenMinuten, 0),
    gesetzlicherPausenabzug: tage.reduce((s, t) => s + t.gesetzlicherPausenabzug, 0),
    arbeitstage: tage.filter((t) => t.bruttoMinuten > 0).length,
    unvollstaendigeTage: tage.filter((t) => t.unvollstaendig).length,
    verstoesse: tage.reduce((s, t) => s + t.hinweise.filter((h) => h.schwere === 'verstoss').length, 0),
  };
}

/** Alle lokalen Daten von `von` bis `bis` einschließlich. */
export function datumsBereich(von: string, bis: string): string[] {
  const ergebnis: string[] = [];
  const [vj, vm, vt] = von.split('-').map(Number);
  const [bj, bm, bt] = bis.split('-').map(Number);
  const cursor = new Date(vj, vm - 1, vt);
  const ende = new Date(bj, bm - 1, bt);
  // Lokale Mitternacht, deshalb kein toISOString: das läge in UTC am Vortag.
  while (cursor <= ende) {
    ergebnis.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return ergebnis;
}

/** Erster und letzter Tag eines Monats (YYYY-MM) als lokale ISO-Daten. */
export function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [jahr, m] = monat.split('-').map(Number);
  const letzterTag = new Date(jahr, m, 0).getDate();
  return { von: `${monat}-01`, bis: `${monat}-${String(letzterTag).padStart(2, '0')}` };
}

function uhr(zeitpunkt: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(zeitpunkt));
}
