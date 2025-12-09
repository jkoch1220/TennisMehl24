import { Adresse } from './dispo';

// Kunden-Typ
export type KundenTyp = 'verein' | 'platzbauer';

// Gesprächsstatus für Call-Liste
export type GespraechsStatus = 'offen' | 'in_bearbeitung' | 'erledigt';

// Anruf-Status für das neue Call-Listen-Tool (Drag & Drop Tabs)
export type AnrufStatus = 'anrufen' | 'nicht_erreicht' | 'erreicht' | 'rueckruf';

// Bestellabsicht
export type Bestellabsicht = 'bestellt' | 'bestellt_nicht' | 'unklar';

// Bezugsweg
export type Bezugsweg = 'direkt' | 'ueber_platzbauer';

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

// Saisonplanungs-Kunde (erweitert)
export interface SaisonKunde {
  id: string;
  typ: KundenTyp;
  name: string;
  kundennummer?: string;
  adresse: Adresse;
  email?: string;
  notizen?: string;
  aktiv: boolean;
  // Zuletzt gezahlter Preis (aus letzter Saison)
  zuletztGezahlterPreis?: number;
  tonnenLetztesJahr?: number; // Tonnen abgenommen im letzten Jahr
  preisHistorie?: PreisHistorienEintrag[];
  standardBezugsweg?: Bezugsweg;
  standardPlatzbauerId?: string;
  // Falls Verein: bezieht über Platzbauer, die von uns gestellt werden
  beziehtUeberUnsPlatzbauer?: boolean;
  abwerkspreis?: boolean; // Kunde bekommt Abwerkspreis (Ja/Nein)
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
