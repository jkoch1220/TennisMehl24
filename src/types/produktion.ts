// Produktion Tracking Types

export interface ProduktionsEintrag {
  id?: string;
  datum: string; // YYYY-MM-DD Format
  tonnen: number;
  zeitpunkt: string; // ISO DateTime
  notiz?: string;
}

export interface ProduktionsTagesZusammenfassung {
  datum: string;
  gesamtTonnen: number;
  eintraege: ProduktionsEintrag[];
}

export interface ProduktionsVerlauf {
  eintraege: ProduktionsEintrag[];
  letzteAktualisierung?: string;
}
