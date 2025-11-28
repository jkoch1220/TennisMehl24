import { Warenart, AufschlagTyp } from './index';

// Bestellungsstatus
export type BestellungsStatus = 'offen' | 'geplant' | 'in_produktion' | 'bereit' | 'geliefert' | 'storniert';

// Bestellung Interface - vereinfacht für die neue Vision
export interface Bestellung {
  id: string;
  bestellnummer?: string; // Optionale Bestellnummer
  kundenname: string;
  kundennummer?: string;
  adresse: {
    strasse: string;
    plz: string;
    ort: string;
    koordinaten?: [number, number]; // [lon, lat] - wird automatisch geocodiert
  };
  kontakt?: {
    name: string;
    telefon: string;
    email?: string;
  };
  bestelldetails: {
    warenart: Warenart;
    paletten: number;
    gewicht: number; // kg
    tonnen: number; // wird automatisch berechnet
    kundentyp: AufschlagTyp;
  };
  lieferdatum?: {
    von: string; // ISO Date String - gewünschtes Lieferdatum von
    bis: string; // ISO Date String - gewünschtes Lieferdatum bis
  };
  prioritaet: 'hoch' | 'normal' | 'niedrig';
  status: BestellungsStatus;
  notizen?: string;
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
}

// Neue Bestellung (ohne ID für Erstellung)
export type NeueBestellung = Omit<Bestellung, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

