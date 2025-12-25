export interface LagerBestand {
  id?: string;
  ziegelschutt: number;
  ziegelmehlSchuettware: number;
  ziegelmehlSackware: number;
  hammerBestand: number;
  anstehendeAuslieferungen: number;

  // Grenzwerte
  ziegelschuttMin: number;
  ziegelschuttMax: number;
  ziegelmehlSchuettwareMin: number;
  ziegelmehlSchuettwareMax: number;
  ziegelmehlSackwareMin: number;
  ziegelmehlSackwareMax: number;
  hammerBestandMin: number;
  hammerBestandMax: number;

  // Verfügbare Tonnen für aktuelle Saison (manuell einstellbar)
  verfuegbareTonnen?: number;

  letztesUpdate?: string;
}

// Projekt-Statistiken
export interface ProjektStats {
  // Tonnen
  verkaufteTonnen: number;      // Status: bezahlt
  bestellteTonnen: number;      // Status: auftragsbestaetigung, lieferschein, rechnung
  angebotTonnen: number;        // Status: angebot, angebot_versendet

  // Geldbeträge
  angebotsSumme: number;        // Summe aller Angebote
  bestellSumme: number;         // Summe der Bestellungen (AB+)
  bezahlteSumme: number;        // Summe der bezahlten Rechnungen

  // Anzahlen
  anzahlAngebote: number;
  anzahlBestellungen: number;
  anzahlBezahlt: number;
  anzahlVerloren: number;
}

// Anfragen-Statistiken
export interface AnfragenStats {
  anzahlGesamt: number;
  anzahlNeu: number;
  anzahlZugeordnet: number;
  anzahlAngebotErstellt: number;
  angefrgteTonnenGesamt: number;
}

export interface DashboardStats {
  lagerBestand: LagerBestand;
  projektStats: ProjektStats;
  anfragenStats: AnfragenStats;
  saisonjahr: number;
}
