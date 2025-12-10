import { Adresse } from './dispo';

export type KundenTyp = 'verein' | 'platzbauer' | 'sonstige';

export interface KundenListenEintrag {
  id: string;
  name: string;
  kundennummer?: string;
  kundenTyp: KundenTyp;
  bestelltDirekt: boolean;
  adresse: Adresse;
  lieferadresse?: Adresse;
  bestelltUeberIds: string[];
  tennisplatzAnzahl: number;
  tonnenProJahr: number;
  telefonnummer?: string;
  ansprechpartner?: string;
  email?: string;
  zahlungsbedingungen?: string;
  zahlungsverhalten?: string;
  zahlungszielTage?: number;
  erstelltAm: string;
  aktualisiertAm: string;
  bemerkungen?: string;
}

export type NeuerKundenListenEintrag = Omit<
  KundenListenEintrag,
  'id' | 'erstelltAm' | 'aktualisiertAm'
> & {
  id?: string;
};
