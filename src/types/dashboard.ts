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
  
  letztesUpdate?: string;
}

export interface DashboardStats {
  lagerBestand: LagerBestand;
}
