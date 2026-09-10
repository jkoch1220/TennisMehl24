/**
 * Gespeicherte Platzbauer-Angebote zurücklesen (Vorschlag „Auftragsbestätigung
 * für Staffelangebote + Rehydrierung“, 09/2026).
 *
 * Zwei Stellen brauchen denselben Rückleseweg:
 *  1. Die Auftragsbestätigung übernimmt die Staffeln aus dem Angebot, damit
 *     eine Saisonvereinbarung überhaupt bestätigt werden kann.
 *  2. Der Angebotstab stellt sich nach dem Erstellen wieder her – der Entwurf
 *     wird dabei gelöscht, und ohne diesen Weg stünde die Maske leer da.
 *
 * Deshalb liegt die Leselogik hier: rein, ohne React, ohne Appwrite, ohne
 * jsPDF – und damit im Node-Environment testbar (das Repo hat kein jsdom).
 *
 * Regeln, die hier nicht neu erfunden, sondern aus dem Bestand übernommen
 * werden: Was eine Staffelzeile ist (`positionsTyp === 'staffelpreis'`), was
 * „unbegrenzt“ heißt (`bisMenge` null/0) und wie der Hinweistext entsteht
 * (`staffelpreisText.ts`).
 */
import type {
  BedarfsStatus,
  PlatzbauerAngebotPosition,
  Preisstaffel,
  StaffelKonditionen,
} from '../types/platzbauer';
import { erzeugeStaffelHinweistext, standardStaffelKonditionen } from './staffelpreisText';

/** Eine Sorte in der Staffel-Preismatrix des Angebotstabs. */
export interface StaffelSorte {
  id: string;
  artikelnummer: string;
  artikelBezeichnung: string;
  einheit: string;
  staffeln: Preisstaffel[];
  lieferregion?: string;
  bemerkung?: string;
}

/** Woher eine übernommene Staffelvereinbarung stammt. */
export interface Angebotsbezug {
  nummer: string;
  datum?: string;
  /** Belegidentität – nur damit lässt sich ein Entwurf gegen ein neueres Angebot prüfen. */
  dokumentId?: string;
  version?: number;
}

/** Was ein gespeichertes Angebot an Staffeln enthält. */
export interface StaffelStand {
  hatStaffel: boolean;
  staffelPositionen: PlatzbauerAngebotPosition[];
  /**
   * Standard-Preisliste des Belegs. Sie wird wie die Staffel übernommen: Was
   * im Angebot als Kondition stand, muss auch die AB bestätigen.
   */
  preislistenPositionen: PlatzbauerAngebotPosition[];
  konditionen: StaffelKonditionen;
  angebotsdatum?: string;
  /** Version des Belegs – steht nur im JSON, nicht am Dokument. */
  version?: number;
}

/** Der vollständige Stand eines gespeicherten Angebots für die Rehydrierung. */
export interface AngebotsStand extends StaffelStand {
  hatInhalt: boolean;
  angebotsModus: 'standard' | 'staffelpreis';
  staffelSorten: StaffelSorte[];
  vereinsPositionen: Array<{
    vereinId: string;
    vereinsprojektId?: string;
    vereinsname: string;
    menge: number;
    einzelpreis: number;
    artikelnummer?: string;
    artikelBeschreibung?: string;
  }>;
  zusatzPositionen: PlatzbauerAngebotPosition[];
  bedarfsPositionen: Array<{
    id: string;
    bezeichnung: string;
    beschreibung?: string;
    geschaetzteMenge: number;
    einheit: string;
    einzelpreis: number;
    notiz?: string;
    status: BedarfsStatus;
  }>;
  formData: {
    angebotsnummer: string;
    zahlungsziel: string;
    lieferzeit: string;
    lieferbedingungen: string;
    bemerkung: string;
  };
}

const LIEFERREGION_PRAEFIX = 'Lieferregion: ';

type RohDaten = Record<string, unknown>;

/** Das `daten`-Feld eines Dokuments ist mal Objekt, mal JSON-String. */
const parseDaten = (daten: unknown): RohDaten | null => {
  if (!daten) return null;
  if (typeof daten === 'object') return daten as RohDaten;
  if (typeof daten !== 'string') return null;
  try {
    const geparst = JSON.parse(daten);
    return geparst && typeof geparst === 'object' ? geparst : null;
  } catch {
    return null;
  }
};

const istStaffelZeile = (p: PlatzbauerAngebotPosition): boolean =>
  p?.positionsTyp === 'staffelpreis' && Array.isArray(p?.staffelpreise?.staffeln);

/**
 * Lieferregion und Bemerkung wurden bis 09/2026 nur als Freitext gespeichert
 * („Lieferregion: Bayern\nNur ganze Lkw“). Für Altbelege werden sie hier wieder
 * getrennt; neue Belege tragen beide Felder zusätzlich strukturiert.
 */
export const zerlegeStaffelBeschreibung = (
  beschreibung?: string
): { lieferregion?: string; bemerkung?: string } => {
  if (!beschreibung) return {};
  const zeilen = beschreibung.split('\n');
  if (zeilen[0]?.startsWith(LIEFERREGION_PRAEFIX)) {
    const lieferregion = zeilen[0].slice(LIEFERREGION_PRAEFIX.length).trim() || undefined;
    const rest = zeilen.slice(1).join('\n').trim();
    return { lieferregion, bemerkung: rest || undefined };
  }
  const text = beschreibung.trim();
  return text ? { bemerkung: text } : {};
};

/** Staffelzeilen eines Dokuments zurück in die Sorten der Preismatrix. */
export const staffelSortenAusPositionen = (
  positionen: PlatzbauerAngebotPosition[]
): StaffelSorte[] =>
  positionen.map((p, index) => {
    const konfiguration = p.staffelpreise;
    // Strukturierte Felder schlagen die Freitext-Heuristik.
    const ausText = zerlegeStaffelBeschreibung(p.beschreibung);
    return {
      id: p.id || `staffel-dok-${index}`,
      artikelnummer: p.artikelnummer || konfiguration?.basisArtikel || '',
      artikelBezeichnung: p.bezeichnung || konfiguration?.basisBezeichnung || '',
      einheit: p.einheit || 't',
      staffeln: (konfiguration?.staffeln ?? []).map((s) => ({
        vonMenge: s.vonMenge,
        // 0 heißt portalweit „unbegrenzt" – als Wert würde die Maske „0"
        // zeigen, das PDF aber „unbegrenzt". Altbestände heilen hier.
        bisMenge: s.bisMenge ? s.bisMenge : null,
        einzelpreis: s.einzelpreis,
        // Regionspreise gehören zur Stufe. Bis 10.09.2026 fielen sie hier weg:
        // Nach dem Erstellen (Entwurf gelöscht) kam die Maske ohne Regionen
        // zurück, und eine komplette PLZ-Preismatrix war verloren.
        ...(s.regionPreise?.length ? { regionPreise: s.regionPreise.map((r) => ({ ...r })) } : {}),
      })),
      lieferregion: konfiguration?.lieferregion ?? ausText.lieferregion,
      bemerkung: konfiguration?.bemerkung ?? ausText.bemerkung,
    };
  });

/**
 * Die Staffeln eines gespeicherten Angebots (oder einer AB). Altbelege ohne
 * `staffelKonditionen` bekommen den Saison-Standard – dieselbe Regel, mit der
 * das PDF sie schon heute druckt.
 */
export const leseStaffelStand = (daten: unknown, saisonjahr: number): StaffelStand => {
  const geparst = parseDaten(daten);
  const positionen: PlatzbauerAngebotPosition[] = Array.isArray(geparst?.angebotPositionen)
    ? (geparst!.angebotPositionen as PlatzbauerAngebotPosition[])
    : Array.isArray(geparst?.abPositionen)
      ? (geparst!.abPositionen as PlatzbauerAngebotPosition[])
      : [];
  const staffelPositionen = positionen.filter(istStaffelZeile);
  const gespeicherteKonditionen = geparst?.staffelKonditionen as StaffelKonditionen | undefined;
  return {
    hatStaffel: staffelPositionen.length > 0,
    staffelPositionen,
    preislistenPositionen: positionen.filter((p) => p.positionsTyp === 'preisliste'),
    konditionen: { ...standardStaffelKonditionen(saisonjahr), ...(gespeicherteKonditionen || {}) },
    angebotsdatum: typeof geparst?.angebotsdatum === 'string' ? (geparst.angebotsdatum as string) : undefined,
    version: typeof geparst?.version === 'number' ? (geparst.version as number) : undefined,
  };
};

/**
 * Was die Auftragsbestätigung aus dem Angebot übernimmt.
 *
 * Der Hinweistext wird dabei eingefroren: Er ist der Vertragstext. Würde ihn
 * das PDF bei jedem Druck neu erzeugen, änderte eine spätere Textpflege
 * rückwirkend den Inhalt bereits versandter Bestätigungen.
 * `grenzenGekoppelt` fällt weg – das ist eine Pflegehilfe der Maske, kein
 * Vertragsinhalt.
 */
export const uebernehmeStaffelnFuerAB = (
  stand: StaffelStand
): {
  staffelPositionen: PlatzbauerAngebotPosition[];
  preislistenPositionen: PlatzbauerAngebotPosition[];
  konditionen: StaffelKonditionen;
} => {
  // grenzenGekoppelt ist eine Pflegehilfe der Maske, kein Vertragsinhalt.
  const konditionen: StaffelKonditionen = { ...stand.konditionen };
  delete konditionen.grenzenGekoppelt;
  const artikel = stand.staffelPositionen.map((p) => ({
    artikelnummer: p.artikelnummer,
    bezeichnung: p.bezeichnung,
    staffeln: p.staffelpreise?.staffeln ?? [],
  }));
  return {
    staffelPositionen: stand.staffelPositionen,
    preislistenPositionen: stand.preislistenPositionen,
    konditionen: {
      ...konditionen,
      hinweistext: konditionen.hinweistext?.trim()
        ? konditionen.hinweistext
        : erzeugeStaffelHinweistext(stand.konditionen, artikel),
    },
  };
};

/** Kennzahlen einer AB – Staffelzeilen zählen NIE mit, sie tragen keine Menge. */
export const berechneABKennzahlen = (
  vereinsPositionen: Array<{ menge?: number; gesamtpreis?: number }>,
  staffelPositionen: PlatzbauerAngebotPosition[]
): {
  nurStaffel: boolean;
  hatVereine: boolean;
  gesamtMenge: number;
  nettobetrag: number;
  anzahlVereine: number;
} => {
  const hatVereine = vereinsPositionen.length > 0;
  return {
    hatVereine,
    nurStaffel: !hatVereine && staffelPositionen.length > 0,
    gesamtMenge: vereinsPositionen.reduce((s, p) => s + (p.menge || 0), 0),
    nettobetrag: vereinsPositionen.reduce((s, p) => s + (p.gesamtpreis || 0), 0),
    anzahlVereine: vereinsPositionen.length,
  };
};

/**
 * Was die AB ins Projekt zurückschreibt. Eine reine Staffel-AB schreibt weder
 * Menge noch Betrag noch Vereinszahl: Sie würde sonst die aus den Vereins-
 * zuordnungen berechneten Projektzahlen mit 0 überschreiben und damit Dashboard
 * und Kopf-Badge leeren.
 */
export const abProjektDatenUpdates = (
  kennzahlen: ReturnType<typeof berechneABKennzahlen>
): { gesamtMenge?: number; gesamtBrutto?: number; anzahlVereine?: number } =>
  kennzahlen.nurStaffel
    ? {}
    : {
        gesamtMenge: kennzahlen.gesamtMenge,
        gesamtBrutto: kennzahlen.nettobetrag * 1.19,
        anzahlVereine: kennzahlen.anzahlVereine,
      };

/**
 * Projektstatus nach dem Erstellen einer AB. Eine Saisonvereinbarung ohne
 * Vereinslieferungen darf nicht in die Lieferphase springen – der
 * Lieferschein-Tab wäre leer, weil er Vereinspositionen braucht.
 */
export const abStatusNachErstellen = (
  kennzahlen: ReturnType<typeof berechneABKennzahlen>
): 'auftragsbestaetigung' | 'lieferschein' =>
  kennzahlen.nurStaffel ? 'auftragsbestaetigung' : 'lieferschein';

/** Der vollständige Stand eines gespeicherten Angebots für die Rehydrierung. */
export const leseAngebotsStand = (daten: unknown, saisonjahr: number): AngebotsStand => {
  const geparst = parseDaten(daten);
  const stand = leseStaffelStand(daten, saisonjahr);
  const alle: PlatzbauerAngebotPosition[] = Array.isArray(geparst?.angebotPositionen)
    ? (geparst!.angebotPositionen as PlatzbauerAngebotPosition[])
    : [];
  // Die schmale `positionen`-Liste trägt keine Artikeldaten; die stehen in den
  // erweiterten Positionen. Beide zusammenführen, sonst fällt die Sorte des
  // Vereins beim Zurücklesen auf den Standardartikel zurück.
  const artikelJeVerein = new Map(
    alle.filter((p) => p.vereinId).map((p) => [p.vereinId as string, p])
  );
  const vereinsPositionen = Array.isArray(geparst?.positionen)
    ? (geparst!.positionen as Array<Record<string, unknown>>).map((p) => {
        const erweitert = artikelJeVerein.get((p.vereinId as string) || '');
        return {
          vereinId: (p.vereinId as string) || '',
          vereinsprojektId: p.vereinsprojektId as string | undefined,
          vereinsname: (p.vereinsname as string) || '',
          menge: (p.menge as number) || 0,
          einzelpreis: (p.einzelpreis as number) || 0,
          artikelnummer: (p.artikelnummer as string | undefined) ?? erweitert?.artikelnummer,
          // `bezeichnung` trägt bei Vereinszeilen den VEREINSNAMEN (so schreibt
          // es handleAngebotErstellen); die Sorte steckt allein in der
          // Artikelnummer. Die Bezeichnung holt der Tab aus dem Artikelstamm.
          artikelBeschreibung: erweitert?.beschreibung,
        };
      })
    : [];
  const zusatzPositionen = alle.filter(
    (p) => (!p.positionsTyp || p.positionsTyp === 'normal') && !p.vereinId
  );
  const bedarfsPositionen = alle
    .filter((p) => p.positionsTyp === 'bedarf')
    .map((p, index) => ({
      id: p.id || `bedarf-dok-${index}`,
      bezeichnung: p.bezeichnung || 'Geschätzter Bedarf',
      beschreibung: p.beschreibung,
      geschaetzteMenge: p.geschaetzteMenge ?? p.menge ?? 0,
      einheit: p.einheit || 't',
      einzelpreis: p.einzelpreis || 0,
      notiz: p.bedarfsNotiz,
      status: (p.bedarfsStatus || 'geschaetzt') as BedarfsStatus,
    }));

  return {
    ...stand,
    hatInhalt:
      stand.hatStaffel ||
      vereinsPositionen.length > 0 ||
      zusatzPositionen.length > 0 ||
      stand.preislistenPositionen.length > 0 ||
      bedarfsPositionen.length > 0,
    // Staffelzeilen entstehen ausschließlich im Staffelmodus – ein eigenes Feld
    // dafür gibt es im Dokument nicht.
    angebotsModus: stand.hatStaffel ? 'staffelpreis' : 'standard',
    staffelSorten: staffelSortenAusPositionen(stand.staffelPositionen),
    vereinsPositionen,
    zusatzPositionen,
    bedarfsPositionen,
    formData: {
      angebotsnummer: typeof geparst?.angebotsnummer === 'string' ? (geparst.angebotsnummer as string) : '',
      zahlungsziel: typeof geparst?.zahlungsziel === 'string' ? (geparst.zahlungsziel as string) : '',
      lieferzeit: typeof geparst?.lieferzeit === 'string' ? (geparst.lieferzeit as string) : '',
      lieferbedingungen:
        typeof geparst?.lieferbedingungen === 'string' ? (geparst.lieferbedingungen as string) : '',
      bemerkung: typeof geparst?.bemerkung === 'string' ? (geparst.bemerkung as string) : '',
    },
  };
};

/**
 * Stammt ein übernommener Stand noch vom aktuellen Angebot? Verglichen wird die
 * Belegidentität, nicht der Inhalt: Ein neu erstelltes Angebot kann dieselben
 * Preise tragen und ist trotzdem ein anderer Beleg.
 */
export const bezugIstAktuell = (
  bezug: Angebotsbezug | null | undefined,
  aktuell: Angebotsbezug | null | undefined
): boolean => {
  if (!bezug || !aktuell) return true; // nichts zu vergleichen
  if (bezug.dokumentId && aktuell.dokumentId) return bezug.dokumentId === aktuell.dokumentId;
  if (bezug.nummer && aktuell.nummer) return bezug.nummer === aktuell.nummer;
  return true;
};

/**
 * Führt die aktuell zugeordneten Vereine mit dem Stand aus dem Dokument
 * zusammen: Menge, Preis und Auswahl kommen aus dem Angebot, Adresse und
 * Artikelbezeichnung bleiben die frisch geladenen. Vereine, die im Angebot
 * standen und heute nicht mehr zugeordnet sind, werden gemeldet statt still
 * verschluckt.
 */
export const mischeVereinPositionen = <
  T extends {
    vereinId: string;
    menge: number;
    einzelpreis: number;
    ausgewaehlt: boolean;
    vereinsprojektId?: string;
    artikelnummer?: string;
    artikelBeschreibung?: string;
  },
>(
  aktuelle: T[],
  ausDokument: AngebotsStand['vereinsPositionen']
): { positionen: T[]; nichtZugeordnet: string[] } => {
  if (ausDokument.length === 0) return { positionen: aktuelle, nichtZugeordnet: [] };
  const nachId = new Map(ausDokument.map((p) => [p.vereinId, p]));
  const positionen = aktuelle.map((v) => {
    const gespeichert = nachId.get(v.vereinId);
    if (!gespeichert) return v;
    nachId.delete(v.vereinId);
    return {
      ...v,
      menge: gespeichert.menge,
      einzelpreis: gespeichert.einzelpreis,
      vereinsprojektId: gespeichert.vereinsprojektId ?? v.vereinsprojektId,
      // Die im Angebot gewählte Sorte behalten, sonst fällt sie auf den
      // Standardartikel des Platzbauers zurück.
      artikelnummer: gespeichert.artikelnummer ?? v.artikelnummer,
      artikelBeschreibung: gespeichert.artikelBeschreibung ?? v.artikelBeschreibung,
      ausgewaehlt: true,
    };
  });
  return {
    positionen,
    nichtZugeordnet: Array.from(nachId.values()).map((p) => p.vereinsname || p.vereinId),
  };
};
