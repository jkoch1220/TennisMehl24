import { ID, Query } from 'appwrite';
import { databases, DATABASE_ID, PRODUKTION_BUCHUNGEN_COLLECTION_ID } from '../config/appwrite';
import type {
  BuchungsEingabe,
  Gebinde,
  Materialbilanz,
  ProduktionsBereich,
  ProduktionsBuchung,
} from '../types/produktion';
import { gebindeInTonnen } from '../types/produktion';
import { dashboardService } from './dashboardService';
import type { LagerBestand } from '../types/dashboard';
import type { User } from './authService';

/**
 * Produktions-Erfassung — Service
 * ============================================================================
 *
 * Eine Buchung = ein Dokument in `produktion_buchungen`. Der Vorgänger legte
 * ALLE Einträge als ein JSON-Feld in einem einzigen Dokument ab; das lief auf
 * eine stille Größengrenze zu (siehe Kommentar in types/produktion.ts).
 *
 * Zwei Regeln, die dieser Service durchsetzt:
 *
 * 1. NICHTS WIRD GELÖSCHT. Eine Buchung, die den Lagerbestand bewegt hat,
 *    wird storniert — sie bleibt im Verlauf sichtbar, zählt aber nirgends mehr
 *    mit. So bleibt nachvollziehbar, warum ein Bestand einmal anders stand.
 *
 * 2. LAGERBUCHUNGEN LAUFEN SERIELL. Der Lagerbestand liegt als ein einziges
 *    JSON-Dokument in Appwrite; jede Änderung ist ein Lesen-Ändern-Schreiben.
 *    Zwei gleichzeitige Buchungen würden einander überschreiben. Die
 *    Warteschlange unten reiht alle Lagerbewegungen dieses Browsers
 *    hintereinander. Gegen zwei Browser gleichzeitig hilft sie nicht — dafür
 *    gibt es den Bestandsabgleich in der Leitungsansicht, der den
 *    rechnerischen Bestand aus den Buchungen gegen den gespeicherten stellt.
 */

// ---------------------------------------------------------------------------
// Lagerbestand-Warteschlange
// ---------------------------------------------------------------------------

/** Kette laufender Lagerbewegungen — jede wartet auf die vorige. */
let lagerKette: Promise<unknown> = Promise.resolve();

const inWarteschlange = <T,>(aufgabe: () => Promise<T>): Promise<T> => {
  const naechste = lagerKette.then(aufgabe, aufgabe);
  // Fehler dürfen die Kette nicht abreißen lassen.
  lagerKette = naechste.catch(() => undefined);
  return naechste;
};

/** Auf welche Lagerpositionen ein Bereich wirkt (in Tonnen, Vorzeichen inklusive). */
type LagerDelta = Partial<Pick<LagerBestand, 'ziegelschutt' | 'ziegelmehlSchuettware' | 'ziegelmehlSackware'>>;

/**
 * Materialfluss → Lagerbewegung.
 *
 * Rohmaterial füllt die Schutthalde. Mahlen macht daraus loses Ziegelmehl.
 * Abfüllen nimmt loses Mehl weg und legt Gebindeware hin.
 *
 * Der VERBRAUCH von Ziegelschutt beim Mahlen wird bewusst NICHT gebucht: er
 * wird nicht erfasst, und eine automatische 1:1-Abbuchung wäre eine geratene
 * Zahl im Bestand. Die Leitungsansicht zeigt ihn stattdessen als rechnerischen
 * Wert samt Ausbeute an und bietet die Abbuchung als bewussten Klick an.
 */
const lagerDelta = (buchung: ProduktionsBuchung): LagerDelta => {
  const t = buchung.tonnen;
  switch (buchung.bereich) {
    case 'rohmaterial':
      return { ziegelschutt: t };
    case 'mahlen':
      return { ziegelmehlSchuettware: t };
    case 'abfuellung':
      return { ziegelmehlSchuettware: -t, ziegelmehlSackware: t };
    default:
      return {};
  }
};

/** Delta auf den Lagerbestand anwenden. `richtung: -1` macht eine Buchung rückgängig. */
const bucheLager = async (delta: LagerDelta, richtung: 1 | -1): Promise<void> => {
  const eintraege = Object.entries(delta) as [keyof LagerDelta, number][];
  if (eintraege.length === 0) return;

  await inWarteschlange(async () => {
    const bestand = await dashboardService.getLagerBestand();
    for (const [feld, wert] of eintraege) {
      const alt = bestand[feld] ?? 0;
      // Kein negativer Bestand: eine Abfüllung, die mehr wegnimmt als
      // rechnerisch da ist, soll die Anzeige nicht ins Minus drehen.
      bestand[feld] = Math.max(0, Math.round((alt + wert * richtung) * 1000) / 1000);
    }
    await dashboardService.updateLagerBestand(bestand);
  });
};

// ---------------------------------------------------------------------------
// Dokument ↔ Objekt
// ---------------------------------------------------------------------------

const parseBuchung = (doc: Record<string, unknown>): ProduktionsBuchung => ({
  $id: doc.$id as string,
  bereich: (doc.bereich as ProduktionsBereich) ?? 'mahlen',
  datum: (doc.datum as string) ?? '',
  zeitpunkt: (doc.zeitpunkt as string) ?? (doc.$createdAt as string) ?? '',
  tonnen: typeof doc.tonnen === 'number' ? doc.tonnen : 0,
  koernung: (doc.koernung as ProduktionsBuchung['koernung']) ?? null,
  lieferant: (doc.lieferant as string) ?? null,
  kennzeichen: (doc.kennzeichen as string) ?? null,
  wiegeschein: (doc.wiegeschein as string) ?? null,
  gebinde: (doc.gebinde as Gebinde) ?? null,
  gebindeAnzahl: typeof doc.gebindeAnzahl === 'number' ? doc.gebindeAnzahl : null,
  notiz: (doc.notiz as string) ?? null,
  erfasstVonId: (doc.erfasstVonId as string) ?? null,
  erfasstVonName: (doc.erfasstVonName as string) ?? null,
  quelle: (doc.quelle as ProduktionsBuchung['quelle']) ?? null,
  storniert: doc.storniert === true,
  storniertVonName: (doc.storniertVonName as string) ?? null,
  storniertAm: (doc.storniertAm as string) ?? null,
  storniertGrund: (doc.storniertGrund as string) ?? null,
  clientId: (doc.clientId as string) ?? null,
  // Altbestand kennt das Feld nicht — dort gilt der Lagerbestand als gebucht.
  lagerGebucht: doc.lagerGebucht !== false,
  ersetztBuchungId: (doc.ersetztBuchungId as string) ?? null,
  dublettenBestaetigt: doc.dublettenBestaetigt === true,
  erstelltAm: (doc.$createdAt as string) ?? undefined,
});

/** Leere Strings als null speichern — sonst stehen später '' und null nebeneinander. */
const leerZuNull = (wert: string | null | undefined): string | null => {
  const getrimmt = (wert ?? '').trim();
  return getrimmt.length > 0 ? getrimmt : null;
};

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

const SEITEN_GROESSE = 100;

export interface BuchungsFilter {
  /** YYYY-MM-DD, inklusive */
  von?: string;
  /** YYYY-MM-DD, inklusive */
  bis?: string;
  bereich?: ProduktionsBereich;
  /** Standard: false — stornierte Buchungen bleiben außen vor. */
  mitStornierten?: boolean;
  /** Obergrenze für sehr weite Zeiträume. Standard 2000. */
  maximal?: number;
}

/**
 * Buchungen laden. Blättert selbstständig über Appwrites 100er-Seiten und
 * sortiert absteigend nach Datum und Zeitpunkt (neueste zuerst).
 */
export const getBuchungen = async (filter: BuchungsFilter = {}): Promise<ProduktionsBuchung[]> => {
  const maximal = filter.maximal ?? 2000;
  const basisQueries: string[] = [
    ...(filter.von ? [Query.greaterThanEqual('datum', filter.von)] : []),
    ...(filter.bis ? [Query.lessThanEqual('datum', filter.bis)] : []),
    ...(filter.bereich ? [Query.equal('bereich', filter.bereich)] : []),
    ...(filter.mitStornierten ? [] : [Query.equal('storniert', false)]),
    Query.orderDesc('datum'),
    Query.orderDesc('$createdAt'),
  ];

  const alle: ProduktionsBuchung[] = [];
  let cursor: string | null = null;

  while (alle.length < maximal) {
    // Typ explizit: ohne Annotation leitet TypeScript den Typ von `queries`
    // aus sich selbst ab (die Schleife referenziert `cursor`, das aus der
    // vorigen Runde stammt) und meldet TS7022.
    const queries: string[] = [
      ...basisQueries,
      Query.limit(Math.min(SEITEN_GROESSE, maximal - alle.length)),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ];

    const antwort: { documents: Array<{ $id: string }> } = await databases.listDocuments(
      DATABASE_ID,
      PRODUKTION_BUCHUNGEN_COLLECTION_ID,
      queries
    );

    if (antwort.documents.length === 0) break;
    for (const doc of antwort.documents) {
      alle.push(parseBuchung(doc as unknown as Record<string, unknown>));
    }
    if (antwort.documents.length < SEITEN_GROESSE) break;
    cursor = antwort.documents[antwort.documents.length - 1].$id;
  }

  return alle;
};

/** Gibt es zu dieser Wiegescheinnummer schon eine (nicht stornierte) Buchung? */
export const findeWiegeschein = async (nummer: string): Promise<ProduktionsBuchung | null> => {
  const getrimmt = nummer.trim();
  if (getrimmt.length === 0) return null;
  try {
    const antwort = await databases.listDocuments(
      DATABASE_ID,
      PRODUKTION_BUCHUNGEN_COLLECTION_ID,
      [Query.equal('wiegeschein', getrimmt), Query.equal('storniert', false), Query.limit(1)]
    );
    const doc = antwort.documents[0];
    return doc ? parseBuchung(doc as unknown as Record<string, unknown>) : null;
  } catch (fehler) {
    // Eine fehlgeschlagene Dublettenprüfung darf die Erfassung nicht blockieren.
    console.warn('Wiegeschein-Prüfung fehlgeschlagen:', fehler);
    return null;
  }
};

/** Bisher gebuchte Lieferanten — füttert die Vorschlagsliste im Rohmaterial-Feld. */
export const getLieferanten = async (): Promise<string[]> => {
  try {
    const antwort = await databases.listDocuments(
      DATABASE_ID,
      PRODUKTION_BUCHUNGEN_COLLECTION_ID,
      [Query.equal('bereich', 'rohmaterial'), Query.orderDesc('$createdAt'), Query.limit(200)]
    );
    const namen = antwort.documents
      .map((d) => (d as unknown as Record<string, unknown>).lieferant)
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim());
    return [...new Set(namen)];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Tonnage einer Eingabe bestimmen — bei Gebinden aus der Stückzahl. */
export const berechneTonnen = (eingabe: BuchungsEingabe): number => {
  if (eingabe.bereich === 'abfuellung') {
    if (!eingabe.gebinde || !eingabe.gebindeAnzahl) return 0;
    return gebindeInTonnen(eingabe.gebinde, eingabe.gebindeAnzahl);
  }
  return Math.round((eingabe.tonnen ?? 0) * 1000) / 1000;
};

/** Ergebnis einer Buchung — inklusive der Frage, ob der Lagerabgleich griff. */
export interface BuchungsErgebnis {
  buchung: ProduktionsBuchung;
  /** true = Buchung steht, Lagerbestand wurde NICHT fortgeschrieben. */
  lagerFehler: boolean;
  /** true = diese clientId lag schon in der Datenbank (Nachsendung, kein Fehler). */
  warSchonDa: boolean;
}

/** YYYY-MM-DD in lokaler Zeit — UTC verschiebt nachts den Produktionstag. */
const heuteLokal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const neueClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Ältere WebViews an der Anlage kennen randomUUID nicht.
  return `tm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const addBuchung = async (
  eingabe: BuchungsEingabe,
  user: User | null
): Promise<BuchungsErgebnis> => {
  const tonnen = berechneTonnen(eingabe);
  if (!(tonnen > 0)) {
    throw new Error('Die Buchung hat keine Menge — bitte Tonnen bzw. Stückzahl eintragen.');
  }

  const jetzt = new Date();
  const heute = heuteLokal();
  // Nacherfassung bekommt 12:00 des Produktionstags, damit die Sortierung nach
  // Zeitpunkt nicht davon abhängt, wann jemand die Zahl nachgetragen hat.
  const zeitpunkt =
    eingabe.datum === heute ? jetzt.toISOString() : `${eingabe.datum}T12:00:00.000Z`;

  const clientId = eingabe.clientId ?? neueClientId();

  const daten = {
    bereich: eingabe.bereich,
    datum: eingabe.datum,
    zeitpunkt,
    tonnen,
    koernung: eingabe.bereich === 'rohmaterial' ? null : eingabe.koernung ?? null,
    lieferant: eingabe.bereich === 'rohmaterial' ? leerZuNull(eingabe.lieferant) : null,
    kennzeichen: eingabe.bereich === 'rohmaterial' ? leerZuNull(eingabe.kennzeichen) : null,
    wiegeschein: eingabe.bereich === 'rohmaterial' ? leerZuNull(eingabe.wiegeschein) : null,
    gebinde: eingabe.bereich === 'abfuellung' ? eingabe.gebinde ?? null : null,
    gebindeAnzahl: eingabe.bereich === 'abfuellung' ? eingabe.gebindeAnzahl ?? null : null,
    notiz: leerZuNull(eingabe.notiz),
    erfasstVonId: user?.$id ?? null,
    erfasstVonName: user?.name ?? null,
    quelle: eingabe.quelle ?? 'portal',
    storniert: false,
    clientId,
    lagerGebucht: true,
    ersetztBuchungId: eingabe.ersetztBuchungId ?? null,
    dublettenBestaetigt: eingabe.dublettenBestaetigt ?? false,
  };

  let doc: Record<string, unknown>;
  try {
    doc = (await databases.createDocument(
      DATABASE_ID,
      PRODUKTION_BUCHUNGEN_COLLECTION_ID,
      ID.unique(),
      daten
    )) as unknown as Record<string, unknown>;
  } catch (fehler) {
    // 409 auf dem Unique-Index über clientId heißt: diese Buchung liegt bereits
    // in der Datenbank. Das passiert genau dann, wenn eine gepufferte Buchung
    // nachgesendet wird, die beim Verbindungsabbruch schon angekommen war.
    // Ein zweites Schreiben wäre die Doppelbuchung, die zu verhindern ist.
    if ((fehler as { code?: number }).code === 409) {
      const vorhanden = await findeNachClientId(clientId);
      if (vorhanden) {
        return { buchung: vorhanden, lagerFehler: !vorhanden.lagerGebucht, warSchonDa: true };
      }
    }
    throw fehler;
  }

  const buchung = parseBuchung(doc);

  let lagerFehler = false;
  try {
    await bucheLager(lagerDelta(buchung), 1);
  } catch (fehler) {
    // Die Buchung selbst steht schon — ein fehlgeschlagener Lagerabgleich darf
    // sie nicht verwerfen. Er wird aber am Dokument vermerkt, statt still in
    // der Konsole zu verschwinden: der Bestandsabgleich in der Leitungsansicht
    // zeigt die Abweichung dann mit Ursache.
    console.error('Lagerbestand konnte nicht fortgeschrieben werden:', fehler);
    lagerFehler = true;
    buchung.lagerGebucht = false;
    try {
      await databases.updateDocument(
        DATABASE_ID,
        PRODUKTION_BUCHUNGEN_COLLECTION_ID,
        buchung.$id,
        { lagerGebucht: false }
      );
    } catch {
      /* auch das Vermerken kann scheitern — dann bleibt es beim Konsolenfehler */
    }
  }

  return { buchung, lagerFehler, warSchonDa: false };
};

const findeNachClientId = async (clientId: string): Promise<ProduktionsBuchung | null> => {
  try {
    const antwort = await databases.listDocuments(
      DATABASE_ID,
      PRODUKTION_BUCHUNGEN_COLLECTION_ID,
      [Query.equal('clientId', clientId), Query.limit(1)]
    );
    const doc = antwort.documents[0];
    return doc ? parseBuchung(doc as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const storniereBuchung = async (
  buchung: ProduktionsBuchung,
  grund: string,
  user: User | null
): Promise<ProduktionsBuchung> => {
  if (buchung.storniert) return buchung;

  const doc = await databases.updateDocument(
    DATABASE_ID,
    PRODUKTION_BUCHUNGEN_COLLECTION_ID,
    buchung.$id,
    {
      storniert: true,
      storniertVonName: user?.name ?? null,
      storniertAm: new Date().toISOString(),
      storniertGrund: leerZuNull(grund),
    }
  );

  const storniert = parseBuchung(doc as unknown as Record<string, unknown>);

  try {
    await bucheLager(lagerDelta(buchung), -1);
  } catch (fehler) {
    console.error('Lagerbestand konnte nach Storno nicht korrigiert werden:', fehler);
  }

  return storniert;
};

/**
 * Endgültig löschen — nur für Admins gedacht (z.B. Testbuchungen). Der
 * Lagerbestand wird nur korrigiert, wenn die Buchung noch nicht storniert war;
 * sonst wäre sie doppelt zurückgenommen.
 */
export const loescheBuchung = async (buchung: ProduktionsBuchung): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, PRODUKTION_BUCHUNGEN_COLLECTION_ID, buchung.$id);
  if (!buchung.storniert) {
    try {
      await bucheLager(lagerDelta(buchung), -1);
    } catch (fehler) {
      console.error('Lagerbestand konnte nach Löschung nicht korrigiert werden:', fehler);
    }
  }
};

/**
 * Rechnerischen Ziegelschutt-Verbrauch abbuchen. Bewusst ein eigener,
 * ausdrücklicher Vorgang der Produktionsleitung — der Verbrauch wird nicht
 * erfasst, also darf er auch nicht stillschweigend gebucht werden.
 */
export const bucheSchuttVerbrauchAb = async (tonnen: number): Promise<void> => {
  if (!(tonnen > 0)) return;
  await bucheLager({ ziegelschutt: tonnen }, -1);
};

// ---------------------------------------------------------------------------
// Auswertung (reine Funktionen — ohne Appwrite, damit testbar)
// ---------------------------------------------------------------------------

export const summeTonnen = (buchungen: ProduktionsBuchung[]): number =>
  Math.round(buchungen.reduce((summe, b) => summe + b.tonnen, 0) * 1000) / 1000;

export const berechneMaterialbilanz = (buchungen: ProduktionsBuchung[]): Materialbilanz => {
  const je = (bereich: ProduktionsBereich) =>
    summeTonnen(buchungen.filter((b) => b.bereich === bereich));

  const rohmaterialTonnen = je('rohmaterial');
  const gemahlenTonnen = je('mahlen');
  const abgefuelltTonnen = je('abfuellung');

  return {
    rohmaterialTonnen,
    gemahlenTonnen,
    abgefuelltTonnen,
    ausbeute: rohmaterialTonnen > 0 ? gemahlenTonnen / rohmaterialTonnen : null,
    abfuellQuote: gemahlenTonnen > 0 ? abgefuelltTonnen / gemahlenTonnen : null,
  };
};

/**
 * Summe aller Lagerbewegungen, die aus Buchungen entstanden sind.
 *
 * ACHTUNG — das ist KEIN Bestand. Auf `lager_bestand` bucht heute nirgends ein
 * Verkaufs- oder Lieferabgang; geschrieben wird nur von Hand im Dashboard und
 * von diesem Service. Was hier herauskommt, ist die kumulierte Produktion seit
 * Erfassungsbeginn — sie wächst monoton und liegt zwangsläufig über dem
 * tatsächlichen Bestand.
 *
 * Verwendbar ist die Zahl deshalb ausschließlich als Gegenprobe: weicht sie
 * anders ab als erwartet, ist entweder von Hand korrigiert worden oder eine
 * Lagerbuchung ist fehlgeschlagen (dann steht `lagerGebucht: false` an der
 * Buchung). Sie darf niemals in den Lagerbestand zurückgeschrieben werden.
 */
export const kumuliertAusBuchungen = (buchungen: ProduktionsBuchung[]) => {
  let ziegelschutt = 0;
  let schuettware = 0;
  let sackware = 0;

  for (const b of buchungen) {
    if (b.storniert) continue;
    const delta = lagerDelta(b);
    ziegelschutt += delta.ziegelschutt ?? 0;
    schuettware += delta.ziegelmehlSchuettware ?? 0;
    sackware += delta.ziegelmehlSackware ?? 0;
  }

  const runden = (w: number) => Math.round(w * 1000) / 1000;
  return {
    ziegelschutt: runden(ziegelschutt),
    ziegelmehlSchuettware: runden(schuettware),
    ziegelmehlSackware: runden(sackware),
  };
};

/**
 * Plausibilitätsprüfung VOR dem Speichern. Blockiert nichts — sie liefert
 * Hinweise, die der Erfasser sieht und bewusst übergehen kann. Harte Sperren
 * an einer Erfassungsmaske werden umgangen, nicht befolgt.
 */
export interface Plausibilitaetshinweis {
  stufe: 'warnung' | 'hinweis';
  text: string;
}

export interface PruefKontext {
  /** Buchungen, die für denselben Tag bereits stehen. */
  bisherigeAmTag: ProduktionsBuchung[];
  /** Die letzten Buchungen desselben Erfassers — für die Wiederholungsprüfung. */
  eigeneLetzte: ProduktionsBuchung[];
  /**
   * Darf der Erfasser Betriebszahlen sehen?
   *
   * Das ist keine Kosmetik: die Warnung „Tagessumme läge damit bei 640 t"
   * nennt genau die Zahl, die einem Mitarbeiter ohne `auswertung`-Recht
   * verborgen bleiben soll. Ohne diesen Schalter leckt die Rechteschranke an
   * ihrer eigenen Warnung.
   */
  zeigeZahlen: boolean;
  /** Vorrat an losem Mehl der letzten Tage — nur für die Abfüll-Warnung. */
  losesMehlVorrat?: number;
}

/**
 * Plausibilitätsprüfung VOR dem Speichern.
 *
 * Blockiert bewusst NICHTS außer dem, was ohne Angabe gar keine verwertbare
 * Buchung ergibt (Menge, Körnung, Gebinde — das prüft die Oberfläche). Alles
 * andere sind Hinweise, die der Erfasser sieht und bewusst übergehen kann:
 * harte Sperren an einer Erfassungsmaske werden umgangen, nicht befolgt — der
 * Wert wird kleingerechnet oder eine Fantasienummer getippt, und am Ende fehlt
 * die Lieferung ganz.
 */
export const pruefePlausibilitaet = (
  eingabe: BuchungsEingabe,
  tonnen: number,
  kontext: PruefKontext
): Plausibilitaetshinweis[] => {
  const hinweise: Plausibilitaetshinweis[] = [];
  const heute = heuteLokal();
  const { bisherigeAmTag, eigeneLetzte, zeigeZahlen } = kontext;
  const zahl = (t: number) => t.toLocaleString('de-DE', { maximumFractionDigits: 2 });

  if (eingabe.datum > heute) {
    hinweise.push({ stufe: 'warnung', text: 'Das Datum liegt in der Zukunft.' });
  }

  const tageZurueck = Math.round(
    (new Date(heute).getTime() - new Date(eingabe.datum).getTime()) / 86400000
  );
  if (tageZurueck > 14) {
    hinweise.push({
      stufe: 'hinweis',
      text: `Nacherfassung für einen Tag vor ${tageZurueck} Tagen.`,
    });
  }

  // Die eigene Eingabe ist keine fremde Betriebszahl — sie darf jeder sehen.
  if (tonnen > 200) {
    hinweise.push({ stufe: 'warnung', text: `${zahl(tonnen)} t in einer Buchung — bitte prüfen.` });
  }

  const tagesSummeBereich =
    summeTonnen(bisherigeAmTag.filter((b) => b.bereich === eingabe.bereich)) + tonnen;
  if (tagesSummeBereich > 500) {
    hinweise.push({
      stufe: 'warnung',
      text: zeigeZahlen
        ? `Tagessumme läge damit bei ${zahl(tagesSummeBereich)} t.`
        : 'Ungewöhnlich viel für einen Tag.',
    });
  }

  /**
   * Die wichtigste Prüfung der Liste. Der häufigste Fehler an der Anlage ist
   * nicht die falsche Zahl, sondern die zweite Buchung aus Unsicherheit, ob die
   * erste angekommen ist.
   */
  const vorZehnMinuten = Date.now() - 10 * 60 * 1000;
  const wiederholung = eigeneLetzte.find(
    (b) =>
      !b.storniert &&
      b.bereich === eingabe.bereich &&
      Math.abs(b.tonnen - tonnen) < 0.001 &&
      new Date(b.zeitpunkt).getTime() > vorZehnMinuten
  );
  if (wiederholung) {
    const minuten = Math.max(
      1,
      Math.round((Date.now() - new Date(wiederholung.zeitpunkt).getTime()) / 60000)
    );
    hinweise.push({
      stufe: 'warnung',
      text: `Vor ${minuten} Minuten wurde schon ${zahl(tonnen)} t in diesem Bereich gebucht. Nochmal?`,
    });
  }

  if (eingabe.bereich === 'rohmaterial') {
    // Ein Sattelzug trägt rund 24-26 t Nutzlast; alles deutlich darüber oder
    // darunter ist entweder ein Zahlendreher oder eine Sonderfahrt.
    if (tonnen > 40) {
      hinweise.push({ stufe: 'warnung', text: 'Mehr als ein Sattelzug trägt — zwei Lieferungen?' });
    } else if (tonnen < 5 || tonnen > 35) {
      hinweise.push({
        stufe: 'warnung',
        text: 'Ungewöhnlich für eine LKW-Lieferung (üblich 20-28 t).',
      });
    }
    if (!eingabe.lieferant) {
      hinweise.push({ stufe: 'hinweis', text: 'Ohne Lieferant — Herkunft bleibt unbekannt.' });
    }
  }

  if (eingabe.bereich === 'abfuellung' && kontext.losesMehlVorrat !== undefined) {
    const rest = kontext.losesMehlVorrat - tonnen;
    if (rest < 0) {
      hinweise.push({
        stufe: 'warnung',
        text: zeigeZahlen
          ? `Loses Mehl läge damit bei ${zahl(rest)} t.`
          : 'Mehr abgefüllt als zuletzt gemahlen wurde — bitte prüfen.',
      });
    }
  }

  return hinweise;
};
