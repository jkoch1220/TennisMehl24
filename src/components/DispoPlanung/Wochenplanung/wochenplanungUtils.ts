/**
 * Reine Funktionen der Wochenplanung: Gruppierung, Mengenbilanz, Kapazität.
 *
 * Bewusst frei von React und Appwrite, damit sie testbar bleiben — das ist die im
 * Repo etablierte Konvention (siehe src/services/__tests__).
 */

import type { Tour, TourStop, Fahrer } from '../../../types/tour';
import type { Projekt } from '../../../types/projekt';
import { parseMaterialAufschluesselung } from '../../../utils/dispoMaterialParser';
import { formatISODatum } from '../../../utils/kalenderwoche';

/** Kennung der Rasterzeile für Touren ohne Fahrer. */
export const OHNE_FAHRER = '__ohne_fahrer__';

/** Kennung der Rasterspalte für Touren ohne Datum (Backlog). */
export const OHNE_DATUM = '';

export interface AuftragImPool {
  projekt: Projekt;
  projektId: string;
  /** Gesamtmenge aus der Material-Aufschlüsselung der Positionen. */
  gesamtMenge: number;
  /** Bereits auf Touren verplante Menge. */
  gebuchteTonnen: number;
  /** Noch nicht verplante Restmenge. */
  offeneTonnen: number;
  istVollstaendigGebucht: boolean;
  /** Anzahl der Touren, auf denen der Auftrag liegt. */
  anzahlBuchungen: number;
}

export interface PlatzbauerGruppe {
  id: string;
  name: string;
  auftraege: AuftragImPool[];
  summeOffen: number;
  summeGesamt: number;
}

export interface Mengenbilanz {
  /** Auf Touren verplante Menge der Woche. */
  geplant: number;
  /** Offene Restmenge der Aufträge dieser Woche. */
  ungeplant: number;
  /** Menge auf Touren mit Status abgeschlossen bzw. Stops mit Liefermarkierung. */
  ausgeliefert: number;
  gesamt: number;
  /**
   * Offene Menge der Aufträge ohne Wochenzuordnung. Bewusst NICHT in `gesamt`
   * enthalten — sie gehört zu keiner Woche und würde sonst in jeder auftauchen.
   */
  ohneWoche: number;
  jeTag: Record<string, number>;
  jeFahrer: Record<string, number>;
  jePlatzbauer: Record<string, number>;
}

/**
 * Hat ein Auftrag überhaupt einen Wochenbezug?
 *
 * Im Bestand trägt ein großer Teil der offenen Aufträge weder `lieferKW` noch
 * `geplantesDatum`. Sie dürfen nicht unsichtbar werden, sondern gehören in eine
 * eigene Pool-Gruppe — die abgelöste Excel führte dafür den Abschnitt „Ohne KW".
 */
export function hatWochenbezug(projekt: Projekt): boolean {
  return (
    (projekt.lieferKW !== undefined && projekt.lieferKW !== null) ||
    Boolean(projekt.geplantesDatum)
  );
}

export interface Auslastung {
  geladen: number;
  kapazitaet: number;
  prozent: number;
  istUeberladen: boolean;
  freieKapazitaet: number;
}

/** Summiert die Tonnage aller Stops einer Tour. */
export const tourTonnage = (tour: Tour): number =>
  tour.stops.reduce((summe, stop) => summe + (stop.tonnen || 0), 0);

/**
 * Auslastung einer Tour.
 *
 * Über der Kapazität wird gewarnt, nicht blockiert: die abgelöste Excel weist real
 * Touren bis 26 t aus, während die hinterlegte Standardkapazität bei 24 t liegt.
 */
export function berechneAuslastung(tour: Tour): Auslastung {
  const geladen = tourTonnage(tour);
  const kapazitaet = tour.kapazitaet?.gesamtTonnen || 0;
  return {
    geladen,
    kapazitaet,
    prozent: kapazitaet > 0 ? (geladen / kapazitaet) * 100 : 0,
    istUeberladen: kapazitaet > 0 && geladen > kapazitaet,
    freieKapazitaet: Math.max(0, kapazitaet - geladen),
  };
}

/**
 * Schlüssel einer Rasterzelle. Bewusst zusammengesetzt aus Datum und Fahrer —
 * dasselbe Muster wie in der Schichtplanung.
 */
export const zellenSchluessel = (datum: string, fahrerId: string): string =>
  `${datum}|${fahrerId}`;

/** Zerlegt einen Zellenschlüssel wieder in seine Bestandteile. */
export function parseZellenSchluessel(schluessel: string): { datum: string; fahrerId: string } {
  const trenner = schluessel.indexOf('|');
  if (trenner === -1) return { datum: schluessel, fahrerId: OHNE_FAHRER };
  return {
    datum: schluessel.slice(0, trenner),
    fahrerId: schluessel.slice(trenner + 1),
  };
}

/**
 * Ordnet Touren den Rasterzellen zu.
 *
 * Touren ohne Fahrer landen in der Sammelzeile, Touren ohne Datum im Backlog.
 */
export function gruppiereTourenNachZelle(touren: Tour[]): Map<string, Tour[]> {
  const zellen = new Map<string, Tour[]>();
  for (const tour of touren) {
    const fahrerId = tour.fahrerId || (tour.fahrerName ? `name:${tour.fahrerName}` : OHNE_FAHRER);
    const schluessel = zellenSchluessel(tour.datum || OHNE_DATUM, fahrerId);
    const vorhanden = zellen.get(schluessel);
    if (vorhanden) {
      vorhanden.push(tour);
    } else {
      zellen.set(schluessel, [tour]);
    }
  }
  // Innerhalb einer Zelle nach Namen sortieren — stabile Anzeige ohne Zusatzfeld.
  for (const liste of zellen.values()) {
    liste.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
  return zellen;
}

/**
 * Ordnet Touren ihrem Tag zu — die Gliederung der Wochenliste.
 *
 * Innerhalb eines Tages bleibt die Anlagereihenfolge erhalten: die Disponentin legt
 * Touren in der Reihenfolge an, in der sie sie plant, und erwartet sie dort wieder.
 */
export function gruppiereTourenNachTag(touren: Tour[]): Map<string, Tour[]> {
  const tage = new Map<string, Tour[]>();
  const sortiert = [...touren].sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));
  for (const tour of sortiert) {
    const datum = tour.datum || OHNE_DATUM;
    const vorhanden = tage.get(datum);
    if (vorhanden) vorhanden.push(tour);
    else tage.set(datum, [tour]);
  }
  return tage;
}

/**
 * Ermittelt zu einem Auftrag die Buchungslage über alle Touren.
 *
 * Die Restmenge ist eine reine Ableitung; es gibt kein gespeichertes Feld dafür.
 */
export function ermittleBuchungslage(projekt: Projekt, touren: Tour[]): AuftragImPool {
  const projektId = (projekt as unknown as { $id?: string }).$id || projekt.id;
  const gesamtMenge = parseMaterialAufschluesselung(projekt).gesamtTonnen;

  let gebuchteTonnen = 0;
  let anzahlBuchungen = 0;
  for (const tour of touren) {
    for (const stop of tour.stops) {
      if (stop.projektId === projektId) {
        gebuchteTonnen += stop.tonnen || 0;
        anzahlBuchungen++;
      }
    }
  }

  const offeneTonnen = Math.max(0, gesamtMenge - gebuchteTonnen);
  return {
    projekt,
    projektId,
    gesamtMenge,
    gebuchteTonnen,
    offeneTonnen,
    // Ein Auftrag ohne erfasste Menge gilt als verplant, sobald er auf einer Tour liegt —
    // sonst bliebe er dauerhaft im Pool stehen.
    istVollstaendigGebucht: gesamtMenge > 0 ? offeneTonnen <= 0 : anzahlBuchungen > 0,
    anzahlBuchungen,
  };
}

/**
 * Gruppiert die Pool-Aufträge nach Platzbauer — die Gliederung der Excel-Vorlage.
 *
 * Aufträge ohne Platzbauer werden unter „Eigene Kunden" zusammengefasst.
 */
export function gruppiereNachPlatzbauer(
  auftraege: AuftragImPool[],
  platzbauerNamen: Map<string, string>
): PlatzbauerGruppe[] {
  const gruppen = new Map<string, PlatzbauerGruppe>();

  for (const auftrag of auftraege) {
    const id = auftrag.projekt.platzbauerId || '__eigene__';
    const name =
      id === '__eigene__' ? 'Eigene Kunden' : platzbauerNamen.get(id) || 'Unbekannter Platzbauer';

    let gruppe = gruppen.get(id);
    if (!gruppe) {
      gruppe = { id, name, auftraege: [], summeOffen: 0, summeGesamt: 0 };
      gruppen.set(id, gruppe);
    }
    gruppe.auftraege.push(auftrag);
    gruppe.summeOffen += auftrag.offeneTonnen;
    gruppe.summeGesamt += auftrag.gesamtMenge;
  }

  return [...gruppen.values()]
    .map((g) => ({
      ...g,
      auftraege: [...g.auftraege].sort((a, b) =>
        (a.projekt.kundenname || '').localeCompare(b.projekt.kundenname || '', 'de')
      ),
    }))
    .sort((a, b) => {
      // „Eigene Kunden" ans Ende, sonst nach Menge absteigend.
      if (a.id === '__eigene__') return 1;
      if (b.id === '__eigene__') return -1;
      return b.summeOffen - a.summeOffen;
    });
}

/** Gilt ein Stop als ausgeliefert? */
const istAusgeliefert = (tour: Tour, stop: TourStop): boolean =>
  tour.status === 'abgeschlossen' ||
  stop.markierung === 'ausgeliefert' ||
  stop.markierung === 'abgerechnet';

/**
 * Mengenbilanz einer Woche.
 *
 * @param touren Touren der Woche (ohne Backlog)
 * @param pool   Aufträge der Woche mit ihrer Buchungslage
 * @param tage   ISO-Daten der Rasterspalten
 * @param fahrerNamen Auflösung fahrerId -> Anzeigename
 * @param platzbauerNamen Auflösung platzbauerId -> Anzeigename
 */
export function berechneMengenbilanz(
  touren: Tour[],
  pool: AuftragImPool[],
  tage: Date[],
  fahrerNamen: Map<string, string>,
  platzbauerNamen: Map<string, string>,
  poolOhneWoche: AuftragImPool[] = []
): Mengenbilanz {
  const jeTag: Record<string, number> = {};
  for (const tag of tage) jeTag[formatISODatum(tag)] = 0;
  const jeFahrer: Record<string, number> = {};
  const jePlatzbauer: Record<string, number> = {};

  // Projekt-Zuordnung für die Platzbauer-Aufteilung der verplanten Mengen.
  const platzbauerJeProjekt = new Map<string, string>();
  for (const auftrag of pool) {
    platzbauerJeProjekt.set(
      auftrag.projektId,
      auftrag.projekt.platzbauerId || '__eigene__'
    );
  }

  let geplant = 0;
  let ausgeliefert = 0;

  for (const tour of touren) {
    const tonnage = tourTonnage(tour);
    geplant += tonnage;

    if (tour.datum && jeTag[tour.datum] !== undefined) {
      jeTag[tour.datum] += tonnage;
    }

    const fahrer = tour.fahrerId
      ? fahrerNamen.get(tour.fahrerId) || tour.fahrerName || 'Unbekannt'
      : tour.fahrerName || 'Ohne Fahrer';
    jeFahrer[fahrer] = (jeFahrer[fahrer] || 0) + tonnage;

    for (const stop of tour.stops) {
      if (istAusgeliefert(tour, stop)) ausgeliefert += stop.tonnen || 0;

      const pbId = platzbauerJeProjekt.get(stop.projektId) ?? '__eigene__';
      const pbName =
        pbId === '__eigene__' ? 'Eigene Kunden' : platzbauerNamen.get(pbId) || 'Unbekannt';
      jePlatzbauer[pbName] = (jePlatzbauer[pbName] || 0) + (stop.tonnen || 0);
    }
  }

  const ungeplant = pool.reduce((summe, a) => summe + a.offeneTonnen, 0);
  const ohneWoche = poolOhneWoche.reduce((summe, a) => summe + a.offeneTonnen, 0);

  return {
    geplant,
    ungeplant,
    ausgeliefert,
    gesamt: geplant + ungeplant,
    ohneWoche,
    jeTag,
    jeFahrer,
    jePlatzbauer,
  };
}

/**
 * Fahrer, die als Rasterzeile erscheinen: alle aktiven, plus jeder Fahrer, der in
 * dieser Woche bereits eine Tour hat — auch wenn er inzwischen inaktiv ist.
 * So verschwindet keine geplante Tour aus dem Blick.
 */
export function ermittleRasterFahrer(
  alleFahrer: Fahrer[],
  tourenDerWoche: Tour[]
): Fahrer[] {
  const verplant = new Set(tourenDerWoche.map((t) => t.fahrerId).filter(Boolean) as string[]);
  return alleFahrer
    .filter((f) => f.aktiv || verplant.has(f.id))
    .sort((a, b) => {
      // Eigene Fahrer zuerst, dann Fremdfahrer; innerhalb alphabetisch.
      const aFremd = a.istFremdfahrer ? 1 : 0;
      const bFremd = b.istFremdfahrer ? 1 : 0;
      if (aFremd !== bFremd) return aFremd - bFremd;
      return a.name.localeCompare(b.name, 'de');
    });
}

/**
 * Touren, deren Fahrer in keiner Rasterzeile vorkommt (etwa Freitextnamen aus der
 * KI-Planung). Sie werden in der Sammelzeile „Ohne Fahrer" gezeigt, damit sie nicht
 * unsichtbar werden.
 */
export function tourenOhneRasterZeile(touren: Tour[], rasterFahrer: Fahrer[]): Tour[] {
  const bekannt = new Set(rasterFahrer.map((f) => f.id));
  return touren.filter((t) => !t.fahrerId || !bekannt.has(t.fahrerId));
}

/** Formatiert Tonnen kompakt in deutscher Schreibweise: ganze Zahlen ohne Nachkomma. */
export function formatTonnen(wert: number): string {
  if (!Number.isFinite(wert)) return '0 t';
  const gerundet = Math.round(wert * 10) / 10;
  const text = gerundet % 1 === 0 ? gerundet.toFixed(0) : gerundet.toFixed(1).replace('.', ',');
  return `${text} t`;
}
