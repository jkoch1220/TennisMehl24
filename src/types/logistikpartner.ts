// Status für Logistikpartner
export type LogistikpartnerStatus = 'aktiv' | 'inaktiv' | 'pausiert';

// Fahrzeugtypen
export type FahrzeugTyp =
  | 'lkw_7_5t'      // 7,5 Tonner
  | 'lkw_12t'       // 12 Tonner
  | 'lkw_18t'       // 18 Tonner
  | 'lkw_26t'       // 26 Tonner (3-Achser)
  | 'lkw_40t'       // 40 Tonner (Sattelzug)
  | 'haenger'       // Anhänger
  | 'kipper'        // Kipper
  | 'silo'          // Silofahrzeug
  | 'sonstige';

// Schüttmaschinen-Typen
export type SchuettmaschinenTyp =
  | 'foerderband'   // Förderband
  | 'schnecke'      // Förderschnecke
  | 'bagger'        // Minibagger
  | 'radlader'      // Radlader
  | 'sonstige';

// Fahrzeug eines Partners
export interface PartnerFahrzeug {
  id: string;
  typ: FahrzeugTyp;
  bezeichnung: string; // z.B. "MAN TGX 18.440"
  kennzeichen?: string;
  kapazitaetTonnen?: number;
  kapazitaetM3?: number;
  hatSchuettmaschine: boolean;
  schuettmaschinenTyp?: SchuettmaschinenTyp;
  notizen?: string;
}

// Preisstruktur
export interface Preisstruktur {
  id: string;
  bezeichnung: string; // z.B. "Standard", "Express", "Wochenende"
  preisProKm?: number;
  preisProTonne?: number;
  preisProM3?: number;
  mindestpreis?: number;
  zuschlagWochenende?: number; // Prozent
  zuschlagExpress?: number; // Prozent
  gueltigAb?: string; // ISO Date
  gueltigBis?: string; // ISO Date
  notizen?: string;
}

// Liefergebiet
export interface Liefergebiet {
  id: string;
  bezeichnung: string; // z.B. "Bayern Süd", "Großraum München"
  plzBereiche: string[]; // z.B. ["80", "81", "82", "83", "84", "85"]
  bundeslaender?: string[]; // z.B. ["Bayern", "Baden-Württemberg"]
  maxEntfernungKm?: number;
  notizen?: string;
}

// Ansprechpartner beim Partner
export interface PartnerAnsprechpartner {
  id: string;
  name: string;
  position?: string; // z.B. "Disponent", "Geschäftsführer"
  telefon?: string;
  mobil?: string;
  email?: string;
  istHauptkontakt: boolean;
  notizen?: string;
}

// Hauptinterface für Logistikpartner
export interface Logistikpartner {
  id: string;

  // Stammdaten
  firmenname: string;
  kurzname?: string; // Kurzbezeichnung für Listen
  status: LogistikpartnerStatus;

  // Adresse
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;

  // Kontakt
  telefon?: string;
  fax?: string;
  email?: string;
  website?: string;

  // Ansprechpartner
  ansprechpartner: PartnerAnsprechpartner[];

  // Fahrzeugflotte
  fahrzeuge: PartnerFahrzeug[];

  // Liefergebiete
  liefergebiete: Liefergebiet[];

  // Preise
  preisstrukturen: Preisstruktur[];

  // Zusätzliche Infos
  zahlungszielTage?: number;
  kundennummerBeiPartner?: string; // Unsere Kundennummer bei diesem Partner
  ustIdNr?: string;

  // Bewertung/Erfahrung
  zuverlaessigkeit?: number; // 1-5 Sterne
  qualitaet?: number; // 1-5 Sterne
  kommunikation?: number; // 1-5 Sterne

  // Notizen & Historie
  notizen?: string;

  // Metadaten
  erstelltAm: string;
  geaendertAm: string;
}

// Neuer Logistikpartner (ohne ID für Erstellung)
export type NeuerLogistikpartner = Omit<Logistikpartner, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Filter für Liste
export interface LogistikpartnerFilter {
  status?: LogistikpartnerStatus[];
  plzBereich?: string; // Filtert nach Liefergebieten
  hatSchuettmaschine?: boolean;
  suche?: string;
}

// Labels für die UI
export const FAHRZEUG_TYP_LABELS: Record<FahrzeugTyp, string> = {
  'lkw_7_5t': '7,5t LKW',
  'lkw_12t': '12t LKW',
  'lkw_18t': '18t LKW',
  'lkw_26t': '26t LKW (3-Achser)',
  'lkw_40t': '40t Sattelzug',
  'haenger': 'Anhänger',
  'kipper': 'Kipper',
  'silo': 'Silofahrzeug',
  'sonstige': 'Sonstige',
};

export const SCHUETTMASCHINEN_TYP_LABELS: Record<SchuettmaschinenTyp, string> = {
  'foerderband': 'Förderband',
  'schnecke': 'Förderschnecke',
  'bagger': 'Minibagger',
  'radlader': 'Radlader',
  'sonstige': 'Sonstige',
};

export const STATUS_LABELS: Record<LogistikpartnerStatus, string> = {
  'aktiv': 'Aktiv',
  'inaktiv': 'Inaktiv',
  'pausiert': 'Pausiert',
};

export const STATUS_COLORS: Record<LogistikpartnerStatus, string> = {
  'aktiv': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'inaktiv': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
  'pausiert': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};
