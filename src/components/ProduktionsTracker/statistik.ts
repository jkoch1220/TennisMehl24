/**
 * Auswertung der Produktionsbuchungen — reine Funktionen, kein Appwrite.
 *
 * Bewusst hier und nicht im Service: der Service redet mit der Datenbank, diese
 * Datei rechnet. Damit lässt sich jede Kennzahl gegen eine Handvoll Buchungen
 * prüfen, ohne eine Datenbank zu starten.
 *
 * Alle Funktionen erwarten den ZEITRAUM bereits gefiltert und stornierte
 * Buchungen bereits entfernt.
 */

import type { BereichsKennzahlen, ProduktionsBereich, ProduktionsBuchung } from '../../types/produktion';

// ---------------------------------------------------------------------------
// Datums-Helfer
// ---------------------------------------------------------------------------

/**
 * YYYY-MM-DD in LOKALER Zeit.
 *
 * `toISOString().split('T')[0]` — der alte Weg — liefert UTC. In deutscher
 * Sommerzeit heißt das: eine Buchung um 01:30 landet auf dem Vortag, und die
 * Kachel „Heute" steht auf 0, während gerade gebucht wurde.
 */
export const alsDatum = (d: Date): string => {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  const tag = String(d.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
};

export const heuteDatum = (): string => alsDatum(new Date());

/** YYYY-MM-DD → Date, auf Mitternacht lokaler Zeit. */
export const ausDatum = (datum: string): Date => {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  return new Date(jahr, (monat ?? 1) - 1, tag ?? 1);
};

export const verschiebeTage = (datum: string, tage: number): string => {
  const d = ausDatum(datum);
  d.setDate(d.getDate() + tage);
  return alsDatum(d);
};

/** ISO-8601-Kalenderwoche (Montag als erster Tag). */
export const kalenderwoche = (d: Date): number => {
  const kopie = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wochentag = kopie.getUTCDay() || 7;
  kopie.setUTCDate(kopie.getUTCDate() + 4 - wochentag);
  const jahresanfang = new Date(Date.UTC(kopie.getUTCFullYear(), 0, 1));
  return Math.ceil(((kopie.getTime() - jahresanfang.getTime()) / 86400000 + 1) / 7);
};

/** Montag der Woche, in der `datum` liegt. */
export const montagDerWoche = (datum: string): string => {
  const d = ausDatum(datum);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return alsDatum(d);
};

const runde = (wert: number, stellen = 3): number => {
  const faktor = 10 ** stellen;
  return Math.round(wert * faktor) / faktor;
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export const summe = (buchungen: ProduktionsBuchung[]): number =>
  runde(buchungen.reduce((s, b) => s + b.tonnen, 0));

/** datum → Tonnen, je Bereich. */
export const tagesSummen = (buchungen: ProduktionsBuchung[]): Map<string, number> => {
  const karte = new Map<string, number>();
  for (const b of buchungen) {
    karte.set(b.datum, runde((karte.get(b.datum) ?? 0) + b.tonnen));
  }
  return karte;
};

export interface TagesReihe {
  datum: string;
  label: string;
  rohmaterial: number;
  mahlen: number;
  abfuellung: number;
  /** Gleitender 7-Tage-Durchschnitt der Mahl-Menge — die Trendlinie. */
  trendMahlen: number;
}

/**
 * Lückenlose Tagesreihe: jeder Kalendertag im Zeitraum kommt vor, auch
 * produktionsfreie. Ein Balkendiagramm, das Wochenenden einfach überspringt,
 * täuscht eine gleichmäßige Auslastung vor.
 */
export const tagesReihe = (
  buchungen: ProduktionsBuchung[],
  vonDatum: string,
  bisDatum: string
): TagesReihe[] => {
  const jeBereich = new Map<ProduktionsBereich, Map<string, number>>();
  for (const bereich of ['rohmaterial', 'mahlen', 'abfuellung'] as ProduktionsBereich[]) {
    jeBereich.set(bereich, tagesSummen(buchungen.filter((b) => b.bereich === bereich)));
  }

  const reihe: TagesReihe[] = [];
  let datum = vonDatum;
  let sicherung = 0;
  while (datum <= bisDatum && sicherung++ < 1200) {
    const d = ausDatum(datum);
    reihe.push({
      datum,
      label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      rohmaterial: jeBereich.get('rohmaterial')?.get(datum) ?? 0,
      mahlen: jeBereich.get('mahlen')?.get(datum) ?? 0,
      abfuellung: jeBereich.get('abfuellung')?.get(datum) ?? 0,
      trendMahlen: 0,
    });
    datum = verschiebeTage(datum, 1);
  }

  // Gleitender Durchschnitt im zweiten Durchgang — er braucht die Reihe.
  for (let i = 0; i < reihe.length; i++) {
    const von = Math.max(0, i - 6);
    const fenster = reihe.slice(von, i + 1);
    reihe[i].trendMahlen = runde(fenster.reduce((s, t) => s + t.mahlen, 0) / fenster.length, 2);
  }

  return reihe;
};

export interface WochenReihe {
  schluessel: string;
  label: string;
  rohmaterial: number;
  mahlen: number;
  abfuellung: number;
}

export const wochenReihe = (buchungen: ProduktionsBuchung[], wochen: number): WochenReihe[] => {
  const heute = heuteDatum();
  const reihe: WochenReihe[] = [];

  for (let i = wochen - 1; i >= 0; i--) {
    const montag = montagDerWoche(verschiebeTage(heute, -i * 7));
    const sonntag = verschiebeTage(montag, 6);
    const imZeitraum = buchungen.filter((b) => b.datum >= montag && b.datum <= sonntag);
    reihe.push({
      schluessel: montag,
      label: `KW${kalenderwoche(ausDatum(montag))}`,
      rohmaterial: summe(imZeitraum.filter((b) => b.bereich === 'rohmaterial')),
      mahlen: summe(imZeitraum.filter((b) => b.bereich === 'mahlen')),
      abfuellung: summe(imZeitraum.filter((b) => b.bereich === 'abfuellung')),
    });
  }
  return reihe;
};

export const monatsReihe = (buchungen: ProduktionsBuchung[], monate: number): WochenReihe[] => {
  const heute = new Date();
  const reihe: WochenReihe[] = [];

  for (let i = monate - 1; i >= 0; i--) {
    const start = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
    const ende = new Date(heute.getFullYear(), heute.getMonth() - i + 1, 0);
    const von = alsDatum(start);
    const bis = alsDatum(ende);
    const imZeitraum = buchungen.filter((b) => b.datum >= von && b.datum <= bis);
    reihe.push({
      schluessel: von.slice(0, 7),
      label: start.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
      rohmaterial: summe(imZeitraum.filter((b) => b.bereich === 'rohmaterial')),
      mahlen: summe(imZeitraum.filter((b) => b.bereich === 'mahlen')),
      abfuellung: summe(imZeitraum.filter((b) => b.bereich === 'abfuellung')),
    });
  }
  return reihe;
};

// ---------------------------------------------------------------------------
// Kennzahlen je Bereich
// ---------------------------------------------------------------------------

export const kennzahlen = (
  alleBuchungen: ProduktionsBuchung[],
  bereich: ProduktionsBereich
): BereichsKennzahlen => {
  const buchungen = alleBuchungen.filter((b) => b.bereich === bereich);
  const tage = tagesSummen(buchungen);
  const heute = heuteDatum();

  const inZeitraum = (von: string, bis: string) =>
    summe(buchungen.filter((b) => b.datum >= von && b.datum <= bis));

  const montag = montagDerWoche(heute);
  const letzterMontag = verschiebeTage(montag, -7);
  const letzterSonntag = verschiebeTage(montag, -1);

  const jetzt = ausDatum(heute);
  const monatsAnfang = alsDatum(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
  const letzterMonatsAnfang = alsDatum(new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1));
  const letzterMonatsEnde = alsDatum(new Date(jetzt.getFullYear(), jetzt.getMonth(), 0));

  const letzten7 = inZeitraum(verschiebeTage(heute, -6), heute);
  const davor7 = inZeitraum(verschiebeTage(heute, -13), verschiebeTage(heute, -7));

  const sortiert = [...tage.entries()].sort((a, b) => b[1] - a[1]);
  const bester = sortiert[0];

  const produktiveTage = tage.size;

  return {
    heute: tage.get(heute) ?? 0,
    dieseWoche: inZeitraum(montag, heute),
    letzteWoche: inZeitraum(letzterMontag, letzterSonntag),
    dieserMonat: inZeitraum(monatsAnfang, heute),
    letzterMonat: inZeitraum(letzterMonatsAnfang, letzterMonatsEnde),
    gesamt: summe(buchungen),
    // Durchschnitt über PRODUKTIVE Tage, nicht über Kalendertage: an einer
    // Anlage, die vier Tage die Woche läuft, wäre der Kalenderschnitt eine
    // Zahl, die niemandem etwas sagt.
    durchschnittProTag: produktiveTage > 0 ? runde(summe(buchungen) / produktiveTage, 1) : 0,
    produktiveTage,
    besterTag: bester ? { datum: bester[0], tonnen: bester[1] } : { datum: '', tonnen: 0 },
    trend7Tage: davor7 > 0 ? runde(((letzten7 - davor7) / davor7) * 100, 1) : 0,
  };
};

// ---------------------------------------------------------------------------
// Verteilungen
// ---------------------------------------------------------------------------

export interface Anteil<T extends string> {
  schluessel: T;
  tonnen: number;
  anteil: number;
}

const verteilung = <T extends string>(
  buchungen: ProduktionsBuchung[],
  schluessel: (b: ProduktionsBuchung) => T | null
): Anteil<T>[] => {
  const karte = new Map<T, number>();
  for (const b of buchungen) {
    const s = schluessel(b);
    if (!s) continue;
    karte.set(s, runde((karte.get(s) ?? 0) + b.tonnen));
  }
  const gesamt = [...karte.values()].reduce((a, b) => a + b, 0);
  return [...karte.entries()]
    .map(([s, tonnen]) => ({
      schluessel: s,
      tonnen,
      anteil: gesamt > 0 ? runde((tonnen / gesamt) * 100, 1) : 0,
    }))
    .sort((a, b) => b.tonnen - a.tonnen);
};

export const koernungsVerteilung = (buchungen: ProduktionsBuchung[]) =>
  verteilung(buchungen, (b) => b.koernung ?? null);

export const gebindeVerteilung = (buchungen: ProduktionsBuchung[]) =>
  verteilung(
    buchungen.filter((b) => b.bereich === 'abfuellung'),
    (b) => b.gebinde ?? null
  );

export const lieferantenVerteilung = (buchungen: ProduktionsBuchung[]) =>
  verteilung(
    buchungen.filter((b) => b.bereich === 'rohmaterial'),
    (b) => b.lieferant ?? null
  );

// ---------------------------------------------------------------------------
// Wochentage & Prognose
// ---------------------------------------------------------------------------

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const wochentagsProfil = (buchungen: ProduktionsBuchung[]) => {
  const tage = tagesSummen(buchungen);
  const gesammelt = WOCHENTAGE.map((name) => ({ name, gesamt: 0, anzahl: 0 }));

  for (const [datum, tonnen] of tage) {
    // getDay(): 0 = Sonntag. Die Anzeige beginnt bei Montag.
    const index = (ausDatum(datum).getDay() + 6) % 7;
    gesammelt[index].gesamt += tonnen;
    gesammelt[index].anzahl += 1;
  }

  return gesammelt.map((t) => ({
    name: t.name,
    durchschnitt: t.anzahl > 0 ? runde(t.gesamt / t.anzahl, 1) : 0,
    anzahl: t.anzahl,
  }));
};

/**
 * Hochrechnung auf den Monat: bisheriger Schnitt je produktivem Tag, auf die
 * verbleibenden Werktage angewendet. Wochenenden zählen nicht mit — sonst
 * verspricht die Prognose Ende Januar Mengen, die nie produziert werden.
 */
export const monatsPrognose = (buchungen: ProduktionsBuchung[], bereich: ProduktionsBereich): number => {
  const heute = ausDatum(heuteDatum());
  const monatsAnfang = alsDatum(new Date(heute.getFullYear(), heute.getMonth(), 1));
  const monatsEnde = new Date(heute.getFullYear(), heute.getMonth() + 1, 0);

  const bisher = buchungen.filter(
    (b) => b.bereich === bereich && b.datum >= monatsAnfang && b.datum <= heuteDatum()
  );
  const tage = tagesSummen(bisher);
  if (tage.size === 0) return 0;

  const schnitt = summe(bisher) / tage.size;

  let verbleibendeWerktage = 0;
  for (let d = new Date(heute); d <= monatsEnde; d.setDate(d.getDate() + 1)) {
    if (d.getTime() === heute.getTime()) continue;
    const wochentag = d.getDay();
    if (wochentag !== 0 && wochentag !== 6) verbleibendeWerktage++;
  }

  return runde(summe(bisher) + schnitt * verbleibendeWerktage, 1);
};

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

export const formatTonnen = (wert: number, stellen = 1): string =>
  wert.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export const formatDatumKurz = (datum: string): string => {
  if (!datum) return '–';
  const heute = heuteDatum();
  if (datum === heute) return 'Heute';
  if (datum === verschiebeTage(heute, -1)) return 'Gestern';
  if (datum === verschiebeTage(heute, -2)) return 'Vorgestern';
  return ausDatum(datum).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
};

export const formatUhrzeit = (zeitpunkt: string): string => {
  if (!zeitpunkt) return '';
  return new Date(zeitpunkt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};
