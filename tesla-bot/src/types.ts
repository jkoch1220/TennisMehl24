export interface TeslaVehicle {
  VIN?: string;
  TRIM?: string[];
  TRIMNAME?: string[];
  Model?: string;
  ModelCode?: string;
  Year?: number;
  PAINT?: string[];
  INTERIOR?: string[];
  WHEELS?: string[];
  TotalPrice?: number;
  PurchasePrice?: number;
  InventoryPrice?: number;
  Odometer?: number;
  OdometerType?: string;
  IsDemo?: boolean;
  City?: string;
  StateProvince?: string;
  CountryCode?: string;
  OptionCodeList?: string;
  OptionCodeData?: Array<{
    code: string;
    group: string;
    long_name?: string;
    name?: string;
  }>;
  [key: string]: unknown;
}

export interface TeslaInventoryResponse {
  results?: TeslaVehicle[];
  total_matches_found?: string | number;
}

export interface SeenVehicle {
  vin: string;
  price: number;
  firstSeen: string;
  lastSeen: string;
}
