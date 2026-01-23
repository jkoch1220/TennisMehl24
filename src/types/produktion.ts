// Produktion Tracking Types

// Körnungsarten für Ziegelmehl
export type Koernung = 'fein' | 'fein_grob' | 'mittel' | 'grob';

export const KOERNUNGEN: { value: Koernung; label: string; color: string }[] = [
  { value: 'fein', label: 'Fein', color: 'from-amber-400 to-amber-500' },
  { value: 'fein_grob', label: 'Fein-Grob', color: 'from-orange-400 to-orange-500' },
  { value: 'mittel', label: 'Mittel', color: 'from-red-400 to-red-500' },
  { value: 'grob', label: 'Grob', color: 'from-rose-500 to-rose-600' },
];

export interface ProduktionsEintrag {
  id?: string;
  datum: string; // YYYY-MM-DD Format
  tonnen: number;
  koernung: Koernung; // Körnung des Materials
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
