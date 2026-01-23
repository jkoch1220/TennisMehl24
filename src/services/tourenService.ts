// Touren-Service für KI-gestützte Tourenplanung

import { ID, Query } from 'appwrite';
import { databases, DATABASE_ID, TOUREN_COLLECTION_ID } from '../config/appwrite';
import type {
  Tour,
  NeueTour,
  TourStop,
  TourRouteDetails,
  TourOptimierung,
  TourStatus,
  TourenFilter,
  TourenStatistik,
  TourConstraint,
} from '../types/tour';

// Appwrite Dokument zu Tour konvertieren
const dokumentZuTour = (doc: Record<string, unknown>): Tour => {
  return {
    id: doc.$id as string,
    datum: doc.datum as string,
    name: doc.name as string,
    fahrzeugId: doc.fahrzeugId as string,
    fahrerId: doc.fahrerId as string | undefined,
    stops: JSON.parse((doc.stops as string) || '[]') as TourStop[],
    routeDetails: JSON.parse((doc.routeDetails as string) || '{}') as TourRouteDetails,
    optimierung: JSON.parse((doc.optimierung as string) || '{}') as TourOptimierung,
    encodedPolyline: doc.encodedPolyline as string | undefined,
    status: (doc.status as TourStatus) || 'entwurf',
    erstelltAm: doc.$createdAt as string,
    geaendertAm: doc.$updatedAt as string,
    erstelltVon: doc.erstelltVon as string | undefined,
  };
};

// Leere RouteDetails für neue Touren
const leereRouteDetails: TourRouteDetails = {
  gesamtDistanzKm: 0,
  gesamtFahrzeitMinuten: 0,
  gesamtZeitMinuten: 0,
  startZeit: '',
  endeZeit: '',
  geschaetzteDieselkosten: 0,
  geschaetzteVerschleisskosten: 0,
  gesamtTonnen: 0,
  auslastungProzent: 0,
};

// Leere Optimierung für manuelle Touren
const leereOptimierung: TourOptimierung = {
  methode: 'manuell',
  optimiertAm: new Date().toISOString(),
  einschraenkungen: [],
};

export const tourenService = {
  // Touren für ein Datum laden
  async loadTourenFuerDatum(datum: string): Promise<Tour[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        TOUREN_COLLECTION_ID,
        [Query.equal('datum', datum), Query.orderAsc('name'), Query.limit(50)]
      );
      return response.documents.map(dokumentZuTour);
    } catch (error) {
      console.error('Fehler beim Laden der Touren:', error);
      return [];
    }
  },

  // Touren mit Filter laden
  async loadTouren(filter: TourenFilter): Promise<Tour[]> {
    try {
      const queries: string[] = [Query.limit(100)];

      if (filter.datum) {
        queries.push(Query.equal('datum', filter.datum));
      }
      if (filter.status && filter.status.length > 0) {
        queries.push(Query.equal('status', filter.status));
      }
      if (filter.fahrzeugId) {
        queries.push(Query.equal('fahrzeugId', filter.fahrzeugId));
      }
      if (filter.fahrerId) {
        queries.push(Query.equal('fahrerId', filter.fahrerId));
      }

      queries.push(Query.orderDesc('datum'));

      const response = await databases.listDocuments(
        DATABASE_ID,
        TOUREN_COLLECTION_ID,
        queries
      );
      return response.documents.map(dokumentZuTour);
    } catch (error) {
      console.error('Fehler beim Laden der Touren:', error);
      return [];
    }
  },

  // Einzelne Tour laden
  async getTour(id: string): Promise<Tour | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, TOUREN_COLLECTION_ID, id);
      return dokumentZuTour(doc);
    } catch (error) {
      console.error('Fehler beim Laden der Tour:', error);
      return null;
    }
  },

  // Neue Tour erstellen
  async createTour(tour: NeueTour): Promise<Tour> {
    const doc = await databases.createDocument(
      DATABASE_ID,
      TOUREN_COLLECTION_ID,
      ID.unique(),
      {
        datum: tour.datum,
        name: tour.name,
        fahrzeugId: tour.fahrzeugId,
        fahrerId: tour.fahrerId || null,
        stops: JSON.stringify(tour.stops || []),
        routeDetails: JSON.stringify(tour.routeDetails || leereRouteDetails),
        optimierung: JSON.stringify(tour.optimierung || leereOptimierung),
        encodedPolyline: tour.encodedPolyline || null,
        status: tour.status || 'entwurf',
        erstelltVon: tour.erstelltVon || null,
      }
    );
    return dokumentZuTour(doc);
  },

  // Tour aktualisieren
  async updateTour(id: string, updates: Partial<NeueTour>): Promise<Tour> {
    const data: Record<string, unknown> = {};

    if (updates.datum !== undefined) data.datum = updates.datum;
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.fahrzeugId !== undefined) data.fahrzeugId = updates.fahrzeugId;
    if (updates.fahrerId !== undefined) data.fahrerId = updates.fahrerId || null;
    if (updates.stops !== undefined) data.stops = JSON.stringify(updates.stops);
    if (updates.routeDetails !== undefined) {
      data.routeDetails = JSON.stringify(updates.routeDetails);
    }
    if (updates.optimierung !== undefined) {
      data.optimierung = JSON.stringify(updates.optimierung);
    }
    if (updates.encodedPolyline !== undefined) {
      data.encodedPolyline = updates.encodedPolyline || null;
    }
    if (updates.status !== undefined) data.status = updates.status;

    const doc = await databases.updateDocument(
      DATABASE_ID,
      TOUREN_COLLECTION_ID,
      id,
      data
    );
    return dokumentZuTour(doc);
  },

  // Tour löschen
  async deleteTour(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, TOUREN_COLLECTION_ID, id);
  },

  // Tour-Status ändern
  async updateTourStatus(id: string, status: TourStatus): Promise<Tour> {
    return this.updateTour(id, { status });
  },

  // Stops einer Tour aktualisieren
  async updateTourStops(id: string, stops: TourStop[]): Promise<Tour> {
    return this.updateTour(id, { stops });
  },

  // Stop-Position ändern (Drag & Drop)
  async verschiebeStop(
    tourId: string,
    stopProjektId: string,
    neuePosition: number
  ): Promise<Tour> {
    const tour = await this.getTour(tourId);
    if (!tour) throw new Error('Tour nicht gefunden');

    const stops = [...tour.stops];
    const stopIndex = stops.findIndex(s => s.projektId === stopProjektId);
    if (stopIndex === -1) throw new Error('Stop nicht gefunden');

    // Stop entfernen und an neuer Position einfügen
    const [stop] = stops.splice(stopIndex, 1);
    stops.splice(neuePosition - 1, 0, stop);

    // Positionen neu nummerieren
    stops.forEach((s, i) => {
      s.position = i + 1;
    });

    return this.updateTour(tourId, { stops });
  },

  // Stop von einer Tour zu einer anderen verschieben
  async verschiebeStopZuTour(
    quellTourId: string,
    zielTourId: string,
    stopProjektId: string,
    neuePosition: number
  ): Promise<{ quellTour: Tour; zielTour: Tour }> {
    const quellTour = await this.getTour(quellTourId);
    const zielTour = await this.getTour(zielTourId);

    if (!quellTour || !zielTour) {
      throw new Error('Tour(en) nicht gefunden');
    }

    // Stop aus Quell-Tour entfernen
    const stopIndex = quellTour.stops.findIndex(s => s.projektId === stopProjektId);
    if (stopIndex === -1) throw new Error('Stop nicht gefunden');

    const [stop] = quellTour.stops.splice(stopIndex, 1);

    // Positionen in Quell-Tour neu nummerieren
    quellTour.stops.forEach((s, i) => {
      s.position = i + 1;
    });

    // Stop in Ziel-Tour einfügen
    stop.position = neuePosition;
    zielTour.stops.splice(neuePosition - 1, 0, stop);

    // Positionen in Ziel-Tour neu nummerieren
    zielTour.stops.forEach((s, i) => {
      s.position = i + 1;
    });

    // Beide Touren speichern
    const updatedQuell = await this.updateTour(quellTourId, { stops: quellTour.stops });
    const updatedZiel = await this.updateTour(zielTourId, { stops: zielTour.stops });

    return { quellTour: updatedQuell, zielTour: updatedZiel };
  },

  // Statistiken für ein Datum berechnen
  berechneStatistik(touren: Tour[]): TourenStatistik {
    let anzahlStops = 0;
    let gesamtTonnen = 0;
    let gesamtDistanzKm = 0;
    let auslastungsSumme = 0;
    let offeneWarnungen = 0;

    touren.forEach(tour => {
      anzahlStops += tour.stops.length;
      gesamtTonnen += tour.routeDetails.gesamtTonnen;
      gesamtDistanzKm += tour.routeDetails.gesamtDistanzKm;
      auslastungsSumme += tour.routeDetails.auslastungProzent;
      offeneWarnungen += tour.optimierung.einschraenkungen.filter(e => !e.erfuellt).length;
    });

    return {
      anzahlTouren: touren.length,
      anzahlStops,
      gesamtTonnen,
      gesamtDistanzKm,
      durchschnittlicheAuslastung: touren.length > 0 ? auslastungsSumme / touren.length : 0,
      offeneWarnungen,
    };
  },

  // Constraint prüfen und erstellen
  erstelleConstraint(
    typ: TourConstraint['typ'],
    beschreibung: string,
    erfuellt: boolean,
    projektId?: string
  ): TourConstraint {
    return { typ, beschreibung, erfuellt, projektId };
  },

  // Helfer: Leere RouteDetails
  getLeereRouteDetails(): TourRouteDetails {
    return { ...leereRouteDetails };
  },

  // Helfer: Leere Optimierung
  getLeereOptimierung(): TourOptimierung {
    return {
      ...leereOptimierung,
      optimiertAm: new Date().toISOString(),
    };
  },
};
