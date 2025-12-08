export type KundenAktivitaetsTyp =
  | 'telefonat'
  | 'email'
  | 'besuch'
  | 'bestellung'
  | 'notiz'
  | 'datei';

export interface KundenAktivitaet {
  id: string;
  kundeId: string;
  typ: KundenAktivitaetsTyp;
  titel: string;
  beschreibung?: string;
  dateiId?: string;
  dateiName?: string;
  dateiTyp?: string;
  dateiGroesse?: number;
  erstelltAm: string;
  erstelltVon?: string;
}

export type NeueKundenAktivitaet = Omit<KundenAktivitaet, 'id' | 'erstelltAm'> & {
  erstelltAm?: string;
};
