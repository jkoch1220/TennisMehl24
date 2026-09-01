import { Adresse } from './dispo';

// Kunden-Typ
export type KundenTyp = 'verein' | 'platzbauer';

// Belieferungsart
export type Belieferungsart = 
  | 'nur_motorwagen' 
  | 'mit_haenger' 
  | 'abholung_ab_werk' 
  | 'palette_mit_ladekran' 
  | 'bigbag';

// Gesprächsstatus für Call-Liste
export type GespraechsStatus = 'offen' | 'in_bearbeitung' | 'erledigt';

// Anruf-Status für das neue Call-Listen-Tool (Drag & Drop Tabs)
export type AnrufStatus = 'anrufen' | 'nicht_erreicht' | 'erreicht' | 'rueckruf';

// Bestellabsicht
export type Bestellabsicht = 'bestellt' | 'bestellt_nicht' | 'unklar';

// Bezugsweg
export type Bezugsweg = 'direkt' | 'direkt_instandsetzung' | 'ueber_platzbauer';

// Aktivitäts-Typen
export type AktivitaetsTyp =
  | 'telefonat'
  | 'email'
  | 'kommentar'
  | 'mengen_aenderung'
  | 'preis_aenderung'
  | 'status_aenderung'
  | 'beziehung_aenderung';

// Telefonnummer
export interface Telefonnummer {
  nummer: string;
  typ?: string; // z.B. "Mobil", "Festnetz", "Büro"
  beschreibung?: string;
}

// Ansprechpartner
export interface Ansprechpartner {
  id: string;
  kundeId: string;
  name: string;
  rolle?: string; // z.B. "Platzwart", "Vorstand", "Dispo"
  email?: string;
  telefonnummern: Telefonnummer[];
  bevorzugterKontaktweg?: 'telefon' | 'email';
  notizen?: string;
  aktiv: boolean;
  /**
   * Ansprechpartner für die Disposition (Terminabstimmung der Anlieferung).
   * Wird in Lieferschein, Tourenplanung und AB-Vorbefüllung bevorzugt herangezogen.
   * Pro Kunde ist genau einer so markiert — `setzeDispoAnsprechpartner` im
   * saisonplanungService hält das konsistent.
   */
  istDispoAnsprechpartner?: boolean;
  // Erweiterte Stammdaten (z.T. aus Mosaik-Migration übernommen)
  anrede?: string;           // "Herr", "Frau", "Divers"
  namenszusatz?: string;     // "Dr.", "Prof.", "von"
  abteilung?: string;        // z.B. "Vorstand", "Buchhaltung", "Platzwart-Team"
  geburtsdatum?: string;     // ISO Date String
  privatAdresse?: Adresse;   // DSGVO-sensibel — nur wenn ausdrücklich gegeben
  /** Quell-Schlüssel aus Mosaik (gesetzt bei migrierten Kontakten) */
  mosaikKurzname?: string;
  erstelltAm: string;
  geaendertAm: string;
}

export type NeuerAnsprechpartner = Omit<Ansprechpartner, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Saison-Datensatz
export interface SaisonDaten {
  id: string;
  kundeId: string;
  saisonjahr: number; // z.B. 2025
  referenzmenge?: number; // Automatisch = tatsächliche Menge Vorjahr
  angefragteMenge?: number; // Frühjahr Call
  tatsaechlicheMenge?: number; // Saisonabschluss
  preisProTonne?: number; // €/Tonne für diese Saison
  bezugsweg?: Bezugsweg;
  platzbauerId?: string; // Falls bezugsweg = 'ueber_platzbauer'
  bestellabsicht?: Bestellabsicht;
  lieferfensterFrueh?: string; // ISO Date String - frühestes Lieferdatum
  lieferfensterSpaet?: string; // ISO Date String - spätestes Lieferdatum
  gespraechsstatus: GespraechsStatus;
  gespraechsnotizen?: string;
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string; // Wer hat Gespräch geführt
  // Neue Felder für Call-Listen-Tool
  anrufStatus?: AnrufStatus; // Aktueller Status im Call-Listen-Tool
  letztAngerufen?: string; // ISO Date String - wann zuletzt angerufen/erreicht
  rueckrufDatum?: string; // ISO Date String - geplanter Rückruftermin
  rueckrufNotiz?: string; // Notiz für Rückruf
  // Frühjahresinstandsetzung
  fruehjahresinstandsetzungUeberUns?: boolean; // Macht Verein FIS über uns?
  anzahlPlaetze?: number; // Anzahl Tennis-Plätze
  fruehjahresinstandsetzungPlatzbauerId?: string; // Welcher Platzbauer macht die FIS?
}

export type NeueSaisonDaten = Omit<SaisonDaten, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

export interface PreisHistorienEintrag {
  saisonjahr: number;
  preisProTonne: number;
  geaendertAm: string;
}

/** Ein Jahr Bestellhistorie aus dem Altsystem Mosaik (2001–2025).
 *
 *  Reines Archiv: Mosaik ist abgelöst, hier wird nichts mehr fortgeschrieben.
 *  Laufende Vorgänge stehen als Projekte im Portal. Der Wert liegt darin, dass
 *  man beim Kunden sieht, was vor der Portal-Zeit lief — gerade nach einem
 *  Duplikat-Merge, wo mehrere Mosaik-Konten in einem Kunden zusammenfließen.
 *
 *  ACHTUNG bei `vorgangsarten`: der Mosaik-Export liest die Vorgangsart ab 2007
 *  falsch und liefert überall „Sonstiges Kunde". Verlässlich sind nur `anzahl`
 *  und `summeEuro`. */
export interface BestellhistorieJahr {
  jahr: number;
  anzahl: number;
  summeEuro: number;
  /** Mosaik-Kurzname, aus dem dieses Jahr stammt — nach einem Merge können
   *  mehrere Konten beitragen. */
  quellen?: string[];
}

/** Zusätzliche Lieferadressen — z.B. Vereine mit mehreren Anlagen.
 *  Kommt häufig aus Mosaik sub_adressen + adressreferenzen. */
export interface ZusaetzlicheLieferadresse extends Adresse {
  bezeichnung?: string;     // z.B. "Hauptanlage", "Außenplatz", "Halle"
  hinweis?: string;         // Freitext, z.B. "über Hofeinfahrt"
  /** Quell-Schlüssel aus Mosaik (sub_adressen.Kurzname) */
  mosaikKurzname?: string;
}

/** Aggregierte Zahlungsstatistik aus dem Altsystem (Mosaik zahlungsverhalten).
 *  Reines Reporting-Feld — keine Buchungsschnittstelle. */
export interface KundenZahlungsstatistik {
  anzahlBuchungen?: number;
  maxMahnstufe?: number;
  letzteBuchung?: string; // ISO Date String
}

// Zusatzbemerkung für Kunden (für Dispo relevant, wird über Jahre hinweg gespeichert)
export interface KundenZusatzbemerkung {
  id: string;
  titel: string; // z.B. "Anfahrtshinweis", "Lieferzeit", "Besonderheit"
  text: string;
  kategorie: 'anfahrt' | 'lieferung' | 'fahrer' | 'dokumente' | 'sonstiges';
  wichtig: boolean; // Wird dem Fahrer prominent angezeigt
  gueltigAb?: string; // Optional: Ab wann gilt diese Bemerkung
  gueltigBis?: string; // Optional: Bis wann gilt diese Bemerkung
  erstelltAm: string;
  erstelltVon?: string;
  // Optional: Anhang (z.B. Anfahrtskarte als PDF)
  anhangFileId?: string;
  anhangDateiname?: string;
}

// Beziehung Verein ↔ Platzbauer
export interface VereinPlatzbauerBeziehung {
  id: string;
  vereinId: string; // Kunde mit Typ 'verein'
  platzbauerId: string; // Kunde mit Typ 'platzbauer'
  status: 'aktiv' | 'inaktiv';
  notiz?: string; // z.B. "hauptsächlich", "Backup"
  erstelltAm: string;
  geaendertAm: string;
}

export type NeueVereinPlatzbauerBeziehung = Omit<VereinPlatzbauerBeziehung, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Aktivität
export interface SaisonAktivitaet {
  id: string;
  kundeId: string;
  saisonDatenId?: string; // Optional: verlinkter Saison-Datensatz
  typ: AktivitaetsTyp;
  titel: string;
  beschreibung?: string;
  erstelltAm: string;
  erstelltVon?: string;
}

export type NeueSaisonAktivitaet = Omit<SaisonAktivitaet, 'id' | 'erstelltAm'> & {
  id?: string;
};

// Kundenliste-Kunde (erweitert)
export interface SaisonKunde {
  id: string;
  typ: KundenTyp;
  name: string;
  kundennummer?: string;
  // NEUE STRUKTUR: Rechnungs- und Lieferadresse sind jetzt die primären Felder
  rechnungsadresse: Adresse; // Rechnungsadresse (Pflichtfeld)
  lieferadresse: Adresse; // Lieferadresse/Standort (Pflichtfeld)
  /** @deprecated Wird durch rechnungsadresse/lieferadresse ersetzt. Nur für Backwards-Compatibility. */
  adresse?: Adresse; // Altes Feld, wird nach Migration entfernt
  email?: string;
  /** Abweichende E-Mail für Rechnungen (z.B. an Geschäftsführer/Buchhaltung) */
  rechnungsEmail?: string;
  /**
   * Empfänger für Massen-Angebote — mehrere Adressen möglich.
   *
   * Vereine haben oft keinen einzelnen Zuständigen: Platzwart, Kassierer und
   * 1. Vorstand sollen das Frühjahrsangebot gemeinsam bekommen. `email` und
   * `rechnungsEmail` fassen jeweils nur eine Adresse und bleiben unverändert
   * für Rechnungen und allgemeine Post zuständig.
   *
   * Ist die Liste leer oder nicht gesetzt, greift weiterhin
   * `rechnungsEmail || email` (siehe ermittleEmpfaenger in massenAngebotService).
   */
  angebotsEmails?: string[];
  notizen?: string;
  aktiv: boolean;
  /**
   * Archiv statt Löschen.
   *
   * Karteileichen aus dem Mosaik-Import, Testdatensätze und Privatkunden, die
   * kein Angebot bekommen sollen, verschwinden aus allen Listen — ihre Historie
   * bleibt aber erhalten und auffindbar. Löschen wäre die Alternative und wäre
   * falsch: An diesen Datensätzen hängen Projekte, Rechnungen und Belege.
   *
   * `loadAlleKunden()` blendet archivierte Kunden standardmäßig aus; wer sie
   * braucht, ruft `loadAlleKunden({ mitArchivierten: true })`.
   */
  archiviert?: boolean;
  /** Warum archiviert wurde — steht im Archiv-Filter als Erklärung. */
  archivGrund?: string;
  /** ISO-Zeitstempel der Archivierung. */
  archiviertAm?: string;
  // Zuletzt gezahlter Preis (aus letzter Saison)
  zuletztGezahlterPreis?: number;
  tonnenLetztesJahr?: number; // Tonnen abgenommen im letzten Jahr
  preisHistorie?: PreisHistorienEintrag[];
  /** Bestellhistorie aus Mosaik, ein Eintrag je Jahr. Siehe BestellhistorieJahr. */
  bestellhistorie?: BestellhistorieJahr[];
  standardBezugsweg?: Bezugsweg;
  standardPlatzbauerId?: string;
  // Falls Verein: bezieht über Platzbauer, die von uns gestellt werden
  beziehtUeberUnsPlatzbauer?: boolean;
  abwerkspreis?: boolean; // Kunde bekommt Abwerkspreis (Ja/Nein)
  /** Opt-in fürs Massen-Angebot („Massenangebots-tauglich"): NUR true = einbezogen
   *  (zusammen mit aktiv). undefined/false = ausgeschlossen. */
  automatischesAngebot?: boolean;
  zahlungsziel?: number; // Zahlungsziel in Tagen (z.B. 14, 30)
  /**
   * Skonto-Vereinbarung. Kommt überwiegend aus dem Mosaik-Altbestand, wo sie
   * als Kürzel im Feld `Zahlungsart` stand (etwa „SKTO209" = 2 % bei 9 Tagen).
   * Wird nicht automatisch auf Belege gedruckt — Skonto einzuräumen ist eine
   * Entscheidung, keine Ableitung aus Stammdaten.
   */
  skonto?: {
    prozent: number;
    tage?: number;
  };
  /**
   * Ware geht erst nach Zahlungseingang raus. Bewusst getrennt vom
   * Zahlungsziel: bei Vorkasse entsteht keine offene Forderung, die fällig
   * werden könnte.
   */
  vorkasse?: boolean;
  /** Woher das Zahlungsziel stammt, z.B. „Mosaik: NETTO14". Nur zur Herkunft. */
  zahlungszielQuelle?: string;
  schuettstellenAnzahl?: number; // Anzahl der Schüttstellen
  belieferungsart?: Belieferungsart; // Art der Belieferung

  // === DISPO-RELEVANTE FELDER ===
  // Zusatzbemerkungen für Dispo (werden über Jahre hinweg gespeichert)
  zusatzbemerkungen?: KundenZusatzbemerkung[];

  // Standard-Lieferzeitfenster (falls bekannt)
  standardLieferzeitfenster?: {
    von: string; // z.B. "08:00"
    bis: string; // z.B. "16:00"
  };

  // Anfahrtshinweise für Fahrer
  anfahrtshinweise?: string;

  // GPS-Koordinaten für Lieferadresse (für Routenplanung)
  koordinaten?: [number, number]; // [longitude, latitude]

  // DISPO-Ansprechpartner (z.B. Platzwart für Lieferungen)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };

  // Gewünschte Lieferwoche (Kalenderwoche)
  wunschLieferwoche?: number;

  // === NUR FÜR PLATZBAUER (typ='platzbauer') ===
  // Saisonpreise für Instandsetzungs-Dienste pro Saison
  // Format: { [saisonjahr]: { [dienstName]: preisProPlatz } }
  saisonpreise?: {
    [saisonjahr: number]: {
      [dienst: string]: number; // Preis pro Platz in EUR
    };
  };

  /** Quell-Schlüssel aus Mosaik-Altsystem (gesetzt bei migrierten Kunden, sonst leer) */
  mosaikKurzname?: string;

  // === ERWEITERTE STAMMDATEN (z.T. aus Mosaik-Migration übernommen) ===
  /** Kundenart als Freitext (Tennisclub, Tennisplatzbau, GALA, Privatkunde,
   *  Industrie, Baustoffhandel, …). Feinere Klassifikation neben `typ`. */
  gruppe?: string;
  /** Industrie-/Branchen-Bezeichnung (oft leer in Mosaik). */
  branche?: string;
  /** Akquise-Quelle / Lead-Source */
  herkunft?: string;
  /** Such-Kürzel — wurde in Mosaik manuell vergeben, kann hier weiter genutzt werden. */
  matchcode?: string;
  /** Hauptnummer am Kunden (zusätzlich zu Ansprechpartner-Nummern). */
  telefon?: string;
  mobiltelefon?: string;
  /** Postfach-Adresse abweichend von Rechnungsadresse */
  postfach?: string;
  postfachort?: string;
  /** ISO-Ländercode (DE = Default; AT, CH, …) */
  laendercode?: string;

  // === RISIKO / ZAHLUNGSVERHALTEN ===
  /** Aktuelle Mahnstufe (1–5). Aus Mosaik übernommen, kann hier gepflegt werden. */
  mahncode?: number;
  /** Aggregierte Statistik aus dem Altsystem — als Risiko-Indikator beim Anlegen
   *  neuer Aufträge sichtbar machen. */
  zahlungsstatistik?: KundenZahlungsstatistik;

  // === MEHRERE LIEFERADRESSEN ===
  /** Zusätzliche Lieferadressen NEBEN der Standard-`lieferadresse`.
   *  Beispiel: Verein hat Hauptanlage + Außenplatz. Kommt aus Mosaik sub_adressen. */
  lieferadressen?: ZusaetzlicheLieferadresse[];

  erstelltAm: string;
  geaendertAm: string;
}

export type NeuerSaisonKunde = Omit<SaisonKunde, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Erweiterte Kunden-Darstellung mit aktueller Saison
export interface SaisonKundeMitDaten {
  kunde: SaisonKunde;
  ansprechpartner: Ansprechpartner[];
  aktuelleSaison?: SaisonDaten;
  saisonHistorie: SaisonDaten[];
  aktivitaeten: SaisonAktivitaet[];
  beziehungenAlsVerein?: VereinPlatzbauerBeziehung[]; // Falls Typ = 'verein'
  beziehungenAlsPlatzbauer?: VereinPlatzbauerBeziehung[]; // Falls Typ = 'platzbauer'
}

// Filter-Optionen für Call-Liste
export interface CallListeFilter {
  /**
   * Archiv-Ansicht: zeigt AUSSCHLIESSLICH archivierte Kunden.
   *
   * Ohne dieses Flag sind archivierte Kunden aus jeder Liste verschwunden —
   * das ist der Zweck des Archivs. Sie müssen aber wiederfindbar bleiben:
   * Wer „privat" sucht und nichts findet, obwohl er den Datensatz vor einem
   * Jahr selbst angelegt hat, hält das für Datenverlust.
   */
  nurArchivierte?: boolean;
  typ?: KundenTyp[];
  bundesland?: string[];
  status?: GespraechsStatus[];
  bezugsweg?: Bezugsweg[];
  platzbauerId?: string;
  suche?: string;
  anrufStatus?: AnrufStatus[];
}

// Anruf-Log Eintrag für Tracking
export interface AnrufLogEintrag {
  zeitpunkt: string; // ISO Date String
  status: AnrufStatus;
  notiz?: string;
}

// Ergebnis eines erfolgreichen Anrufs
export interface AnrufErgebnis {
  erreicht: boolean;
  angefragteMenge?: number;
  preisProTonne?: number;
  bestellabsicht?: Bestellabsicht;
  bezugsweg?: Bezugsweg;
  platzbauerId?: string;
  lieferfensterFrueh?: string;
  lieferfensterSpaet?: string;
  notizen?: string;
  rueckrufDatum?: string;
  rueckrufNotiz?: string;
  // Frühjahresinstandsetzung
  fruehjahresinstandsetzungUeberUns?: boolean;
  anzahlPlaetze?: number;
  fruehjahresinstandsetzungPlatzbauerId?: string;
}

// Statistik
export interface SaisonplanungStatistik {
  gesamtKunden: number;
  offeneKunden: number;
  erledigteKunden: number;
  gesamtAngefragteMenge: number;
  gesamtTatsaechlicheMenge: number;
  nachTyp: Record<KundenTyp, number>;
  nachStatus: Record<GespraechsStatus, number>;
  nachBezugsweg: Record<Bezugsweg, number>;
}
