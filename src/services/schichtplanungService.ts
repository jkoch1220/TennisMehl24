import { ID, Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  SCHICHT_MITARBEITER_COLLECTION_ID,
  SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
} from '../config/appwrite';
import {
  Mitarbeiter,
  NeuerMitarbeiter,
  SchichtZuweisung,
  NeueSchichtZuweisung,
  SchichtTyp,
  WochenStatistik,
  Konflikt,
  MITARBEITER_FARBEN,
  getSchichtConfig,
  getMontag,
  formatDatum,
  getWochentage,
  berechneFairnessScore,
  SchichtEinstellungen,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
  getStandardZeiten,
  berechneStunden,
} from '../types/schichtplanung';

export const schichtplanungService = {
  // ==================== MITARBEITER ====================

  async ladeAlleMitarbeiter(): Promise<Mitarbeiter[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SCHICHT_MITARBEITER_COLLECTION_ID,
        [Query.limit(1000)]
      );
      return response.documents.map((doc) => this.parseMitarbeiterDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter:', error);
      return [];
    }
  },

  async ladeAktiveMitarbeiter(): Promise<Mitarbeiter[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        SCHICHT_MITARBEITER_COLLECTION_ID,
        [Query.equal('istAktiv', true), Query.limit(1000)]
      );
      return response.documents
        .map((doc) => this.parseMitarbeiterDocument(doc))
        .sort((a, b) => a.nachname.localeCompare(b.nachname));
    } catch (error) {
      console.error('Fehler beim Laden der aktiven Mitarbeiter:', error);
      return [];
    }
  },

  async ladeMitarbeiter(id: string): Promise<Mitarbeiter | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SCHICHT_MITARBEITER_COLLECTION_ID,
        id
      );
      return this.parseMitarbeiterDocument(doc);
    } catch {
      return null;
    }
  },

  async erstelleMitarbeiter(mitarbeiter: NeuerMitarbeiter): Promise<Mitarbeiter> {
    const id = ID.unique();
    const jetzt = new Date().toISOString();

    // Automatisch eine Farbe zuweisen, falls keine angegeben
    const alleMitarbeiter = await this.ladeAlleMitarbeiter();
    const verwendeteFarben = new Set(alleMitarbeiter.map((m) => m.farbe));
    const verfuegbareFarbe =
      MITARBEITER_FARBEN.find((f) => !verwendeteFarben.has(f)) || MITARBEITER_FARBEN[0];

    const neuerMitarbeiter: Mitarbeiter = {
      ...mitarbeiter,
      id,
      farbe: mitarbeiter.farbe || verfuegbareFarbe,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    await databases.createDocument(
      DATABASE_ID,
      SCHICHT_MITARBEITER_COLLECTION_ID,
      id,
      {
        istAktiv: neuerMitarbeiter.istAktiv,
        data: JSON.stringify(neuerMitarbeiter),
      }
    );

    return neuerMitarbeiter;
  },

  async aktualisiereMitarbeiter(
    id: string,
    daten: Partial<Mitarbeiter>
  ): Promise<Mitarbeiter> {
    const aktuell = await this.ladeMitarbeiter(id);
    if (!aktuell) {
      throw new Error(`Mitarbeiter ${id} nicht gefunden`);
    }

    const aktualisiert: Mitarbeiter = {
      ...aktuell,
      ...daten,
      id,
      geaendertAm: new Date().toISOString(),
    };

    await databases.updateDocument(
      DATABASE_ID,
      SCHICHT_MITARBEITER_COLLECTION_ID,
      id,
      {
        istAktiv: aktualisiert.istAktiv,
        data: JSON.stringify(aktualisiert),
      }
    );

    return aktualisiert;
  },

  async deaktiviereMitarbeiter(id: string): Promise<void> {
    await this.aktualisiereMitarbeiter(id, { istAktiv: false });
  },

  async loescheMitarbeiter(id: string): Promise<void> {
    // Alle Zuweisungen des Mitarbeiters ebenfalls löschen
    const zuweisungen = await this.ladeZuweisungenFuerMitarbeiter(id);
    for (const zuweisung of zuweisungen) {
      await this.loescheZuweisung(zuweisung.id);
    }
    await databases.deleteDocument(DATABASE_ID, SCHICHT_MITARBEITER_COLLECTION_ID, id);
  },

  // ==================== SCHICHT-ZUWEISUNGEN ====================

  async ladeZuweisungenFuerWoche(montagDatum: string): Promise<SchichtZuweisung[]> {
    try {
      const montag = new Date(montagDatum);
      const wochentage = getWochentage(montag);
      const datumListe = wochentage.map((d) => formatDatum(d));

      // Query für alle Tage der Woche
      const response = await databases.listDocuments(
        DATABASE_ID,
        SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
        [
          Query.greaterThanEqual('datum', datumListe[0]),
          Query.lessThanEqual('datum', datumListe[6]),
          Query.limit(1000),
        ]
      );

      return response.documents.map((doc) => this.parseZuweisungDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Zuweisungen für Woche:', error);
      return [];
    }
  },

  async ladeZuweisungenFuerMitarbeiter(
    mitarbeiterId: string,
    startDatum?: string,
    endDatum?: string
  ): Promise<SchichtZuweisung[]> {
    try {
      const queries = [
        Query.equal('mitarbeiterId', mitarbeiterId),
        Query.limit(1000),
      ];

      if (startDatum) {
        queries.push(Query.greaterThanEqual('datum', startDatum));
      }
      if (endDatum) {
        queries.push(Query.lessThanEqual('datum', endDatum));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
        queries
      );

      return response.documents.map((doc) => this.parseZuweisungDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Zuweisungen für Mitarbeiter:', error);
      return [];
    }
  },

  async ladeZuweisung(id: string): Promise<SchichtZuweisung | null> {
    try {
      const doc = await databases.getDocument(
        DATABASE_ID,
        SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
        id
      );
      return this.parseZuweisungDocument(doc);
    } catch {
      return null;
    }
  },

  async erstelleZuweisung(zuweisung: NeueSchichtZuweisung): Promise<SchichtZuweisung> {
    const id = ID.unique();
    const jetzt = new Date().toISOString();

    // Standard-Zeiten setzen wenn nicht angegeben
    const standardZeiten = getStandardZeiten(zuweisung.schichtTyp);
    const startZeit = zuweisung.startZeit || standardZeiten.startZeit;
    const endZeit = zuweisung.endZeit || standardZeiten.endZeit;

    const neueZuweisung: SchichtZuweisung = {
      ...zuweisung,
      id,
      startZeit,
      endZeit,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    await databases.createDocument(
      DATABASE_ID,
      SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
      id,
      {
        datum: neueZuweisung.datum,
        mitarbeiterId: neueZuweisung.mitarbeiterId,
        schichtTyp: neueZuweisung.schichtTyp,
        data: JSON.stringify(neueZuweisung),
      }
    );

    return neueZuweisung;
  },

  async aktualisiereZuweisung(
    id: string,
    daten: Partial<SchichtZuweisung>
  ): Promise<SchichtZuweisung> {
    const aktuell = await this.ladeZuweisung(id);
    if (!aktuell) {
      throw new Error(`Zuweisung ${id} nicht gefunden`);
    }

    const aktualisiert: SchichtZuweisung = {
      ...aktuell,
      ...daten,
      id,
      geaendertAm: new Date().toISOString(),
    };

    await databases.updateDocument(
      DATABASE_ID,
      SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
      id,
      {
        datum: aktualisiert.datum,
        mitarbeiterId: aktualisiert.mitarbeiterId,
        schichtTyp: aktualisiert.schichtTyp,
        data: JSON.stringify(aktualisiert),
      }
    );

    return aktualisiert;
  },

  async loescheZuweisung(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, SCHICHT_ZUWEISUNGEN_COLLECTION_ID, id);
  },

  async verschiebeZuweisung(
    id: string,
    neuesDatum: string,
    neuerSchichtTyp: SchichtTyp,
    neueStartZeit?: string,
    neueEndZeit?: string
  ): Promise<SchichtZuweisung> {
    const updates: Partial<SchichtZuweisung> = {
      datum: neuesDatum,
      schichtTyp: neuerSchichtTyp,
    };

    if (neueStartZeit) updates.startZeit = neueStartZeit;
    if (neueEndZeit) updates.endZeit = neueEndZeit;

    return this.aktualisiereZuweisung(id, updates);
  },

  // Aktualisiere Schichtzeiten (für Resize)
  async aktualisiereSchichtZeiten(
    id: string,
    startZeit: string,
    endZeit: string
  ): Promise<SchichtZuweisung> {
    return this.aktualisiereZuweisung(id, { startZeit, endZeit });
  },

  // ==================== BATCH OPERATIONEN ====================

  async kopiereWoche(
    vonMontagDatum: string,
    nachMontagDatum: string
  ): Promise<SchichtZuweisung[]> {
    const quellZuweisungen = await this.ladeZuweisungenFuerWoche(vonMontagDatum);
    const neueZuweisungen: SchichtZuweisung[] = [];

    const vonMontag = new Date(vonMontagDatum);
    const nachMontag = new Date(nachMontagDatum);
    const diffTage = Math.round(
      (nachMontag.getTime() - vonMontag.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (const quelle of quellZuweisungen) {
      // Nur geplante oder bestätigte Zuweisungen kopieren
      if (quelle.status !== 'geplant' && quelle.status !== 'bestaetigt') continue;

      const quellDatum = new Date(quelle.datum);
      const neuesDatum = new Date(quellDatum);
      neuesDatum.setDate(neuesDatum.getDate() + diffTage);

      const neueZuweisung = await this.erstelleZuweisung({
        mitarbeiterId: quelle.mitarbeiterId,
        schichtTyp: quelle.schichtTyp,
        datum: formatDatum(neuesDatum),
        startZeit: quelle.startZeit,
        endZeit: quelle.endZeit,
        status: 'geplant',
        notizen: quelle.notizen,
      });

      neueZuweisungen.push(neueZuweisung);
    }

    return neueZuweisungen;
  },

  async schnellZuweisung(
    mitarbeiterIds: string[],
    schichtTyp: SchichtTyp,
    datumListe: string[]
  ): Promise<SchichtZuweisung[]> {
    const neueZuweisungen: SchichtZuweisung[] = [];

    for (const mitarbeiterId of mitarbeiterIds) {
      for (const datum of datumListe) {
        const neueZuweisung = await this.erstelleZuweisung({
          mitarbeiterId,
          schichtTyp,
          datum,
          status: 'geplant',
        });
        neueZuweisungen.push(neueZuweisung);
      }
    }

    return neueZuweisungen;
  },

  // ==================== STATISTIKEN ====================

  berechneWochenStatistiken(
    zuweisungen: SchichtZuweisung[],
    mitarbeiter: Mitarbeiter[],
    einstellungen: SchichtEinstellungen = DEFAULT_SCHICHT_EINSTELLUNGEN
  ): WochenStatistik {
    const schichtConfig = getSchichtConfig(einstellungen);
    const stundenProMitarbeiter: Record<string, number> = {};
    const schichtenProMitarbeiter: Record<string, number> = {};

    // Initialisiere mit 0 für alle aktiven Mitarbeiter
    for (const ma of mitarbeiter) {
      stundenProMitarbeiter[ma.id] = 0;
      schichtenProMitarbeiter[ma.id] = 0;
    }

    // Zähle Stunden und Schichten pro Mitarbeiter
    for (const z of zuweisungen) {
      // Krank und Urlaub zählen nicht als Arbeitsstunden
      if (z.status === 'krank' || z.status === 'urlaub') continue;

      // Berechne Stunden basierend auf startZeit/endZeit wenn vorhanden, sonst Standard
      const dauer = z.startZeit && z.endZeit
        ? berechneStunden(z.startZeit, z.endZeit)
        : schichtConfig[z.schichtTyp].dauer;

      stundenProMitarbeiter[z.mitarbeiterId] =
        (stundenProMitarbeiter[z.mitarbeiterId] || 0) + dauer;
      schichtenProMitarbeiter[z.mitarbeiterId] =
        (schichtenProMitarbeiter[z.mitarbeiterId] || 0) + 1;
    }

    // Gesamtstunden
    const gesamtStunden = Object.values(stundenProMitarbeiter).reduce((a, b) => a + b, 0);

    // Unterbesetzte Schichten finden
    const unterbesetzteSchichten: WochenStatistik['unterbesetzteSchichten'] = [];

    // Gruppiere Zuweisungen nach Datum und Schichttyp
    const zuweisungenProSchicht: Record<string, SchichtZuweisung[]> = {};
    for (const z of zuweisungen) {
      const key = `${z.datum}-${z.schichtTyp}`;
      if (!zuweisungenProSchicht[key]) {
        zuweisungenProSchicht[key] = [];
      }
      // Krank und Urlaub zählen nicht zur Besetzung
      if (z.status !== 'krank' && z.status !== 'urlaub') {
        zuweisungenProSchicht[key].push(z);
      }
    }

    // Prüfe alle geplanten Schichten auf Unterbesetzung
    const alleDaten = [...new Set(zuweisungen.map((z) => z.datum))];
    const alleSchichtTypen: SchichtTyp[] = ['fruehschicht', 'spaetschicht', 'nachtschicht'];

    for (const datum of alleDaten) {
      for (const schichtTyp of alleSchichtTypen) {
        const key = `${datum}-${schichtTyp}`;
        const anzahl = zuweisungenProSchicht[key]?.length || 0;
        const minBesetzung = schichtConfig[schichtTyp].minBesetzung;

        if (anzahl < minBesetzung) {
          unterbesetzteSchichten.push({
            datum,
            schichtTyp,
            aktuell: anzahl,
            minimum: minBesetzung,
          });
        }
      }
    }

    // Fairness-Score berechnen
    const aktiveMitarbeiterStunden = Object.entries(stundenProMitarbeiter)
      .filter(([id]) => mitarbeiter.find((m) => m.id === id)?.istAktiv)
      .reduce((acc, [id, stunden]) => ({ ...acc, [id]: stunden }), {});

    const fairnessScore = berechneFairnessScore(aktiveMitarbeiterStunden);

    return {
      gesamtStunden,
      stundenProMitarbeiter,
      schichtenProMitarbeiter,
      unterbesetzteSchichten,
      fairnessScore,
    };
  },

  // ==================== KONFLIKT-PRÜFUNG ====================

  pruefeKonflikte(
    neueZuweisung: NeueSchichtZuweisung,
    bestehendeZuweisungen: SchichtZuweisung[],
    mitarbeiter: Mitarbeiter[],
    einstellungen: SchichtEinstellungen = DEFAULT_SCHICHT_EINSTELLUNGEN
  ): Konflikt[] {
    const konflikte: Konflikt[] = [];
    const ma = mitarbeiter.find((m) => m.id === neueZuweisung.mitarbeiterId);
    const schichtConfig = getSchichtConfig(einstellungen);

    // 1. Echte Doppelbelegung (gleiche Schicht am selben Tag) - nur das ist ein Fehler
    const gleicheSchicht = bestehendeZuweisungen.filter(
      (z) =>
        z.datum === neueZuweisung.datum &&
        z.mitarbeiterId === neueZuweisung.mitarbeiterId &&
        z.schichtTyp === neueZuweisung.schichtTyp &&
        z.status !== 'krank' &&
        z.status !== 'urlaub'
    );

    if (gleicheSchicht.length > 0) {
      konflikte.push({
        typ: 'doppelbelegung',
        schwere: 'fehler',
        nachricht: `${ma?.vorname} ${ma?.nachname} ist bereits für diese Schicht eingeplant`,
        mitarbeiterId: neueZuweisung.mitarbeiterId,
        datum: neueZuweisung.datum,
        schichtTyp: neueZuweisung.schichtTyp,
      });
    }

    // 1b. Mehrfachschichten am selben Tag - nur Warnung (Doppel-/Dreifachschicht)
    const andereSchichtenAmTag = bestehendeZuweisungen.filter(
      (z) =>
        z.datum === neueZuweisung.datum &&
        z.mitarbeiterId === neueZuweisung.mitarbeiterId &&
        z.schichtTyp !== neueZuweisung.schichtTyp &&
        z.status !== 'krank' &&
        z.status !== 'urlaub'
    );

    if (andereSchichtenAmTag.length > 0) {
      const schichtNamen = andereSchichtenAmTag.map(z => schichtConfig[z.schichtTyp].name).join(', ');
      const anzahlSchichten = andereSchichtenAmTag.length + 1;
      konflikte.push({
        typ: 'doppelbelegung',
        schwere: 'warnung',
        nachricht: `${anzahlSchichten}-fach Schicht: ${ma?.vorname} ${ma?.nachname} arbeitet bereits ${schichtNamen}`,
        mitarbeiterId: neueZuweisung.mitarbeiterId,
        datum: neueZuweisung.datum,
        schichtTyp: neueZuweisung.schichtTyp,
      });
    }

    // 2. Ruhezeit-Prüfung (Nachtschicht -> Frühschicht)
    if (neueZuweisung.schichtTyp === 'fruehschicht') {
      const vortag = new Date(neueZuweisung.datum);
      vortag.setDate(vortag.getDate() - 1);
      const vortagStr = formatDatum(vortag);

      const nachtschichtVortag = bestehendeZuweisungen.find(
        (z) =>
          z.datum === vortagStr &&
          z.mitarbeiterId === neueZuweisung.mitarbeiterId &&
          z.schichtTyp === 'nachtschicht' &&
          z.status !== 'krank' &&
          z.status !== 'urlaub'
      );

      if (nachtschichtVortag) {
        konflikte.push({
          typ: 'ruhezeit',
          schwere: 'warnung',
          nachricht: `Ruhezeit-Warnung: ${ma?.vorname} ${ma?.nachname} hatte Nachtschicht am Vortag (< 11h Pause)`,
          mitarbeiterId: neueZuweisung.mitarbeiterId,
          datum: neueZuweisung.datum,
          schichtTyp: neueZuweisung.schichtTyp,
        });
      }
    }

    // 3. Überstunden-Prüfung
    if (ma) {
      const montag = getMontag(new Date(neueZuweisung.datum));
      const wochentage = getWochentage(montag);
      const wochenZuweisungen = bestehendeZuweisungen.filter((z) => {
        const zDatum = new Date(z.datum);
        return (
          z.mitarbeiterId === neueZuweisung.mitarbeiterId &&
          zDatum >= wochentage[0] &&
          zDatum <= wochentage[6] &&
          z.status !== 'krank' &&
          z.status !== 'urlaub'
        );
      });

      const aktuelleStunden = wochenZuweisungen.reduce(
        (sum, z) => {
          const dauer = z.startZeit && z.endZeit
            ? berechneStunden(z.startZeit, z.endZeit)
            : schichtConfig[z.schichtTyp].dauer;
          return sum + dauer;
        },
        0
      );

      // Berechne Stunden der neuen Zuweisung
      const neueZuweisungDauer = neueZuweisung.startZeit && neueZuweisung.endZeit
        ? berechneStunden(neueZuweisung.startZeit, neueZuweisung.endZeit)
        : schichtConfig[neueZuweisung.schichtTyp].dauer;
      const neueStunden = aktuelleStunden + neueZuweisungDauer;

      if (neueStunden > ma.maxStundenProWoche) {
        konflikte.push({
          typ: 'ueberstunden',
          schwere: 'warnung',
          nachricht: `Überstunden-Warnung: ${ma.vorname} ${ma.nachname} würde ${neueStunden}h haben (max. ${ma.maxStundenProWoche}h)`,
          mitarbeiterId: neueZuweisung.mitarbeiterId,
          datum: neueZuweisung.datum,
          schichtTyp: neueZuweisung.schichtTyp,
        });
      }
    }

    return konflikte;
  },

  // ==================== HELPERS ====================

  parseMitarbeiterDocument(doc: Record<string, unknown>): Mitarbeiter {
    if (doc.data && typeof doc.data === 'string') {
      try {
        return JSON.parse(doc.data);
      } catch {
        console.error('Fehler beim Parsen des Mitarbeiter-Dokuments:', doc);
      }
    }
    return doc as unknown as Mitarbeiter;
  },

  parseZuweisungDocument(doc: Record<string, unknown>): SchichtZuweisung {
    if (doc.data && typeof doc.data === 'string') {
      try {
        return JSON.parse(doc.data);
      } catch {
        console.error('Fehler beim Parsen des Zuweisung-Dokuments:', doc);
      }
    }
    return doc as unknown as SchichtZuweisung;
  },
};
