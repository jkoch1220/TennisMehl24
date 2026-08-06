/**
 * Buchungslogik der Dispo — die einzige Stelle, an der Aufträge auf Touren gebucht,
 * umgebucht und wieder entfernt werden.
 *
 * Bis zur Einführung der Wochenplanung lag diese Logik direkt in DispoPlanung.tsx.
 * Sie wurde herausgezogen, damit Aufträge-Tab und Wochenraster nachweislich denselben
 * Pfad benutzen — im Repo existierte bereits eine zweite, abweichende Implementierung
 * (`handleBuchen`), die nur deshalb keinen Schaden angerichtet hat, weil ihr Dialog
 * ein Stub war.
 *
 * Modell: Eine Buchung ist ein Eintrag im `stops`-Array der Tour. Es gibt keine
 * Buchungs-Collection. Ein Auftrag kann auf mehreren Touren liegen (Teilmengen);
 * die Zusammengehörigkeit entsteht ausschließlich über `stop.projektId`.
 *
 * Invariante: pro Tour höchstens ein Stop je Projekt. Der gesamte Lesepfad
 * (`find`/`findIndex` auf `projektId`) setzt das voraus.
 */

import { tourenService } from './tourenService';
import { projektService } from './projektService';
import type {
  Tour,
  TourStop,
  StopMarkierung,
  TourFahrzeugTyp,
  TourKapazitaet,
} from '../types/tour';
import type { Projekt, DispoStatus } from '../types/projekt';

export interface BuchungsErgebnis {
  /** Die vollständige, aktualisierte Tourenliste — direkt in den State setzbar. */
  touren: Tour[];
  /**
   * false, wenn der dispoStatus des Projekts nicht persistiert werden konnte.
   *
   * Ursache ist der 9.500-Zeichen-Deckel auf dem `data`-Blob in projektService:
   * überschreitet ein Projekt ihn, verwirft `updateProjekt` die Blob-Änderung still.
   * Die Buchung selbst (am Tour-Dokument) ist davon nicht betroffen.
   */
  statusGeschrieben: boolean;
}

/** Liest die Appwrite-Dokument-ID eines Projekts. */
export const projektIdVon = (projekt: Projekt): string =>
  (projekt as unknown as { $id?: string }).$id || projekt.id;

/**
 * Erkennt, ob ein Fehler daher rührt, dass ein Dokument serverseitig nicht mehr
 * existiert.
 *
 * Tritt im Alltag auf, wenn zwei Personen gleichzeitig disponieren und eine davon
 * eine Tour löscht: die andere hält sie noch im Zustand und läuft beim nächsten
 * Schreibversuch in einen 404. Der Aufrufer soll dann neu laden statt die
 * technische Meldung durchzureichen.
 */
export const istNichtGefunden = (fehler: unknown): boolean => {
  if (!fehler || typeof fehler !== 'object') return false;
  const f = fehler as { code?: number; type?: string; message?: string };
  return (
    f.code === 404 ||
    f.type === 'document_not_found' ||
    /could not be found|nicht gefunden/i.test(f.message ?? '')
  );
};

/**
 * Schreibt den dispoStatus und meldet zurück, ob er tatsächlich angekommen ist.
 */
const setzeDispoStatus = async (projektId: string, status: DispoStatus): Promise<boolean> => {
  const aktualisiert = await projektService.updateProjekt(projektId, { dispoStatus: status });
  // updateProjekt schluckt zu große data-Blobs ohne Fehler. Der Rückgabewert ist die
  // einzige Möglichkeit, den stillen Verwurf von außen zu erkennen.
  return aktualisiert?.dispoStatus === status;
};

/** Baut einen neuen Stop aus den Projektdaten. */
const erstelleStop = (projekt: Projekt, tonnen: number, position: number): TourStop => ({
  projektId: projektIdVon(projekt),
  position,
  ankunftGeplant: '',
  abfahrtGeplant: '',
  kundenname: projekt.kundenname,
  kundennummer: projekt.kundennummer,
  adresse: {
    strasse: projekt.lieferadresse?.strasse || projekt.kundenstrasse || '',
    plz: projekt.lieferadresse?.plz || projekt.kundenPlzOrt?.split(' ')[0] || '',
    ort:
      projekt.lieferadresse?.ort || projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
  },
  tonnen,
  belieferungsart: projekt.belieferungsart || 'mit_haenger',
});

/** Nummeriert Stops lückenlos ab 1 durch. */
const nummeriere = (stops: TourStop[]): TourStop[] =>
  stops.map((s, i) => ({ ...s, position: i + 1 }));

/**
 * Holt eine Tour aus der übergebenen Liste oder lädt sie nach.
 * Der Service hält bewusst keinen eigenen Zustand.
 */
const holeTour = async (touren: Tour[], tourId: string): Promise<Tour> => {
  const bekannt = touren.find((t) => t.id === tourId);
  if (bekannt) return bekannt;
  const geladen = await tourenService.loadTour(tourId);
  if (!geladen) throw new Error('Tour nicht gefunden');
  return geladen;
};

/** Ersetzt eine Tour in der Liste, hängt sie an, falls sie fehlt. */
const ersetze = (touren: Tour[], tourId: string, stops: TourStop[], geladen?: Tour): Tour[] => {
  const vorhanden = touren.some((t) => t.id === tourId);
  if (vorhanden) {
    return touren.map((t) => (t.id === tourId ? { ...t, stops } : t));
  }
  return geladen ? [...touren, { ...geladen, stops }] : touren;
};

export const dispoBuchungService = {
  /**
   * Bucht einen Auftrag auf eine Tour, ändert die Menge einer bestehenden Buchung
   * oder bucht von einer Tour auf eine andere um.
   *
   * Semantik — sie stammt aus dem abgelösten Code und ist bewusst erhalten:
   *  - `vonTourId === zuTourId`: die Menge wird **gesetzt**.
   *  - `vonTourId` leer: die Menge wird zu einer bestehenden Buchung **addiert**.
   *  - `vonTourId` gesetzt und verschieden: umbuchen.
   */
  async buche(params: {
    projekt: Projekt;
    touren: Tour[];
    zuTourId: string;
    tonnen: number;
    vonTourId?: string;
    markierung?: StopMarkierung;
  }): Promise<BuchungsErgebnis> {
    const { projekt, zuTourId, tonnen, vonTourId, markierung } = params;
    const projektId = projektIdVon(projekt);
    let touren = [...params.touren];

    if (vonTourId && vonTourId === zuTourId) {
      // Menge einer bestehenden Buchung setzen.
      const tour = await holeTour(touren, zuTourId);
      const stops = tour.stops.map((s) =>
        s.projektId === projektId ? { ...s, tonnen, ...(markierung ? { markierung } : {}) } : s
      );
      await tourenService.updateTour(zuTourId, { stops });
      touren = ersetze(touren, zuTourId, stops, tour);
    } else if (vonTourId) {
      // Umbuchen. Zuerst das Ziel schreiben, dann die Quelle: es gibt keine Transaktion
      // über zwei Dokumente, und eine sichtbare Dublette ist besser als eine verlorene Menge.
      const [vonTour, zuTour] = await Promise.all([
        holeTour(touren, vonTourId),
        holeTour(touren, zuTourId),
      ]);

      const vorhanden = zuTour.stops.find((s) => s.projektId === projektId);
      const zielStops = vorhanden
        ? zuTour.stops.map((s) =>
            s.projektId === projektId
              ? { ...s, tonnen: s.tonnen + tonnen, ...(markierung ? { markierung } : {}) }
              : s
          )
        : nummeriere([
            ...zuTour.stops,
            {
              ...erstelleStop(projekt, tonnen, zuTour.stops.length + 1),
              ...(markierung ? { markierung } : {}),
            },
          ]);
      await tourenService.updateTour(zuTourId, { stops: zielStops });

      const quellStops = nummeriere(vonTour.stops.filter((s) => s.projektId !== projektId));
      await tourenService.updateTour(vonTourId, { stops: quellStops });

      touren = ersetze(touren, zuTourId, zielStops, zuTour);
      touren = ersetze(touren, vonTourId, quellStops, vonTour);
    } else {
      // Neue Buchung; bestehende Menge wird addiert.
      const zuTour = await holeTour(touren, zuTourId);
      const vorhanden = zuTour.stops.find((s) => s.projektId === projektId);
      const stops = vorhanden
        ? zuTour.stops.map((s) =>
            s.projektId === projektId
              ? { ...s, tonnen: s.tonnen + tonnen, ...(markierung ? { markierung } : {}) }
              : s
          )
        : nummeriere([
            ...zuTour.stops,
            {
              ...erstelleStop(projekt, tonnen, zuTour.stops.length + 1),
              ...(markierung ? { markierung } : {}),
            },
          ]);
      await tourenService.updateTour(zuTourId, { stops });
      touren = ersetze(touren, zuTourId, stops, zuTour);
    }

    const statusGeschrieben = await setzeDispoStatus(projektId, 'geplant');
    return { touren, statusGeschrieben };
  },

  /**
   * Entfernt eine Buchung. Der dispoStatus fällt nur dann auf 'offen' zurück,
   * wenn der Auftrag danach auf keiner Tour mehr liegt.
   */
  async entferneBuchung(params: {
    projektId: string;
    tourId: string;
    touren: Tour[];
  }): Promise<BuchungsErgebnis> {
    const { projektId, tourId } = params;
    const tour = await holeTour(params.touren, tourId);

    const stops = nummeriere(tour.stops.filter((s) => s.projektId !== projektId));
    await tourenService.updateTour(tourId, { stops });
    const touren = ersetze(params.touren, tourId, stops, tour);

    const nochGebucht = touren.some(
      (t) => t.id !== tourId && t.stops.some((s) => s.projektId === projektId)
    );

    const statusGeschrieben = nochGebucht ? true : await setzeDispoStatus(projektId, 'offen');
    return { touren, statusGeschrieben };
  },

  /**
   * Setzt oder entfernt die Statusfarbe eines Stopps.
   *
   * Sie liegt am Stop und damit im `stops`-Feld der Tour (100.000 Zeichen), nicht im
   * `data`-Blob des Projekts (10.000 Zeichen, bei einigen Projekten nahezu voll).
   */
  async setzeMarkierung(params: {
    tourId: string;
    projektId: string;
    markierung: StopMarkierung | null;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, projektId, markierung } = params;
    const tour = await holeTour(params.touren, tourId);

    const stops = tour.stops.map((s) => {
      if (s.projektId !== projektId) return s;
      if (markierung === null) {
        const { markierung: _entfernt, ...ohne } = s;
        void _entfernt;
        return ohne as TourStop;
      }
      return { ...s, markierung };
    });

    await tourenService.updateTour(tourId, { stops });
    return ersetze(params.touren, tourId, stops, tour);
  },

  /**
   * Ändert Menge und/oder Notiz eines Stopps — das Inline-Bearbeiten in der Zeile.
   */
  async aktualisiereStop(params: {
    tourId: string;
    projektId: string;
    tonnen?: number;
    notiz?: string;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, projektId, tonnen, notiz } = params;
    const tour = await holeTour(params.touren, tourId);

    const stops = tour.stops.map((s) =>
      s.projektId === projektId
        ? {
            ...s,
            ...(tonnen !== undefined ? { tonnen } : {}),
            ...(notiz !== undefined ? { notiz: notiz || undefined } : {}),
          }
        : s
    );

    await tourenService.updateTour(tourId, { stops });
    return ersetze(params.touren, tourId, stops, tour);
  },

  /**
   * Ändert die Kopfdaten einer Tour: Fahrername (Freitext), LKW-Typ, Kilometer, Notiz.
   *
   * Der Fahrer ist bewusst Freitext und nicht an die Stammdaten gebunden — in der
   * Praxis stehen dort auch Subunternehmer und Platzhalter wie „holt ab".
   */
  async aktualisiereTour(params: {
    tourId: string;
    fahrerName?: string;
    fahrerId?: string;
    lkwTyp?: TourFahrzeugTyp;
    kapazitaet?: TourKapazitaet;
    kilometer?: number;
    notiz?: string;
    name?: string;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, fahrerName, fahrerId, lkwTyp, kapazitaet, kilometer, notiz, name } = params;
    const tour = await holeTour(params.touren, tourId);

    const routeDetails =
      kilometer !== undefined
        ? { ...tour.routeDetails, gesamtDistanzKm: kilometer }
        : undefined;

    await tourenService.updateTour(tourId, {
      ...(fahrerName !== undefined ? { fahrerName } : {}),
      ...(fahrerId !== undefined ? { fahrerId } : {}),
      ...(lkwTyp !== undefined ? { lkwTyp } : {}),
      ...(kapazitaet !== undefined ? { kapazitaet } : {}),
      ...(routeDetails !== undefined ? { routeDetails } : {}),
      ...(notiz !== undefined ? { notiz } : {}),
      ...(name !== undefined ? { name } : {}),
    });

    return params.touren.map((t) =>
      t.id !== tourId
        ? t
        : {
            ...t,
            ...(fahrerName !== undefined ? { fahrerName } : {}),
            ...(fahrerId !== undefined ? { fahrerId } : {}),
            ...(lkwTyp !== undefined ? { lkwTyp } : {}),
            ...(kapazitaet !== undefined ? { kapazitaet } : {}),
            ...(routeDetails !== undefined ? { routeDetails } : {}),
            ...(notiz !== undefined ? { notiz } : {}),
            ...(name !== undefined ? { name } : {}),
          }
    );
  },

  /**
   * Löscht eine Tour; die Aufträge fallen damit in den Pool zurück.
   *
   * Idempotent: ist die Tour bereits weg, gilt das Ziel als erreicht.
   */
  async loescheTour(params: { tourId: string; touren: Tour[] }): Promise<Tour[]> {
    const tour = params.touren.find((t) => t.id === params.tourId);
    try {
      await tourenService.deleteTour(params.tourId);
    } catch (fehler) {
      if (!istNichtGefunden(fehler)) throw fehler;
    }

    // Aufträge, die nur auf dieser Tour lagen, wieder auf 'offen' setzen.
    for (const stop of tour?.stops ?? []) {
      const anderswoGebucht = params.touren.some(
        (t) => t.id !== params.tourId && t.stops.some((s) => s.projektId === stop.projektId)
      );
      if (!anderswoGebucht) {
        await setzeDispoStatus(stop.projektId, 'offen').catch(() => false);
      }
    }

    return params.touren.filter((t) => t.id !== params.tourId);
  },

  /**
   * Färbt alle Stopps einer Tour in einem Zug.
   *
   * Ein Schreibvorgang pro Tour statt einer je Stopp — das hält das Färben einer
   * durchgeplanten Woche flüssig.
   */
  async setzeMarkierungFuerTour(params: {
    tourId: string;
    markierung: StopMarkierung | null;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, markierung } = params;
    const tour = await holeTour(params.touren, tourId);

    const stops = tour.stops.map((s) => {
      if (markierung === null) {
        const { markierung: _weg, ...ohne } = s;
        void _weg;
        return ohne as TourStop;
      }
      return { ...s, markierung };
    });

    await tourenService.updateTour(tourId, { stops });
    return ersetze(params.touren, tourId, stops, tour);
  },

  /**
   * Färbt alle Stopps aller Touren eines Tages.
   *
   * Die Touren werden nacheinander geschrieben; bei einem Fehler mittendrin bleibt
   * der bis dahin erreichte Stand bestehen und wird zurückgegeben.
   */
  async setzeMarkierungFuerTag(params: {
    datum: string;
    markierung: StopMarkierung | null;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { datum, markierung } = params;
    const betroffen = params.touren.filter((t) => (t.datum || '') === datum && t.stops.length > 0);

    let aktuell = params.touren;
    let verschwunden = 0;
    for (const tour of betroffen) {
      try {
        aktuell = await this.setzeMarkierungFuerTour({
          tourId: tour.id,
          markierung,
          touren: aktuell,
        });
      } catch (fehler) {
        // Eine zwischenzeitlich gelöschte Tour darf das Färben des restlichen
        // Tages nicht abbrechen.
        if (!istNichtGefunden(fehler)) throw fehler;
        aktuell = aktuell.filter((t) => t.id !== tour.id);
        verschwunden++;
      }
    }

    if (verschwunden > 0 && verschwunden === betroffen.length) {
      // Gar nichts hat funktioniert — der Aufrufer soll neu laden.
      throw Object.assign(new Error('Keine der Touren existiert noch.'), { code: 404 });
    }
    return aktuell;
  },

  /**
   * Verschiebt eine ganze Tour auf einen anderen Tag und/oder Fahrer.
   *
   * `datum: ''` legt die Tour zurück in den Backlog.
   */
  async verschiebeTour(params: {
    tourId: string;
    datum: string;
    fahrerId?: string;
    fahrerName?: string;
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, datum, fahrerId, fahrerName } = params;
    const tour = await holeTour(params.touren, tourId);

    // Trägt die Tour noch den Namen ihres bisherigen Fahrers, wandert er mit —
    // sonst hieße nach dem Verschieben eine Tour „Marco“, die bei Olaf steht.
    // Ein selbst vergebener Name bleibt unangetastet.
    const alterName = tour.fahrerName ?? '';
    const nameFolgtFahrer =
      alterName !== '' && (tour.name === alterName || tour.name.startsWith(`${alterName} `));
    const neuerName =
      nameFolgtFahrer && fahrerName
        ? tour.name.replace(alterName, fahrerName)
        : tour.name;

    await tourenService.updateTour(tourId, {
      datum,
      fahrerId: fahrerId ?? '',
      fahrerName: fahrerName ?? '',
      ...(neuerName !== tour.name ? { name: neuerName } : {}),
    });

    return params.touren.map((t) =>
      t.id === tourId
        ? {
            ...t,
            datum,
            name: neuerName,
            fahrerId: fahrerId ?? undefined,
            fahrerName: fahrerName ?? undefined,
          }
        : t
    );
  },

  /**
   * Ordnet die Stops einer Tour neu — für das Sortieren per Drag-and-Drop.
   */
  async sortiereStops(params: {
    tourId: string;
    projektIdReihenfolge: string[];
    touren: Tour[];
  }): Promise<Tour[]> {
    const { tourId, projektIdReihenfolge } = params;
    const tour = await holeTour(params.touren, tourId);

    const nachId = new Map(tour.stops.map((s) => [s.projektId, s]));
    const sortiert = projektIdReihenfolge
      .map((id) => nachId.get(id))
      .filter((s): s is TourStop => s !== undefined);
    // Stops, die nicht in der Reihenfolge vorkamen, hinten anhängen statt verlieren.
    for (const stop of tour.stops) {
      if (!projektIdReihenfolge.includes(stop.projektId)) sortiert.push(stop);
    }

    const stops = nummeriere(sortiert);
    await tourenService.updateTour(tourId, { stops });
    return ersetze(params.touren, tourId, stops, tour);
  },
};
