import { config } from './config.js';
import type { TeslaInventoryResponse, TeslaVehicle } from './types.js';

const INVENTORY_ENDPOINT = 'https://www.tesla.com/inventory/api/v4/inventory-results';

function buildQueryUrl(): string {
  const query = {
    query: {
      model: config.tesla.model,
      condition: config.tesla.condition,
      options: {},
      arrangeby: config.tesla.arrangeby,
      order: config.tesla.order,
      market: config.tesla.market,
      language: config.tesla.language,
      super_region: 'north america',
      lng: 0,
      lat: 0,
      zip: config.tesla.zip,
      range: 0,
    },
    offset: 0,
    count: 50,
    outsideOffset: 0,
    outsideSearch: false,
    isFalconDeliverySelectionEnabled: false,
    version: null,
  };

  const encoded = encodeURIComponent(JSON.stringify(query));
  return `${INVENTORY_ENDPOINT}?query=${encoded}`;
}

export async function fetchInventory(): Promise<TeslaVehicle[]> {
  const url = buildQueryUrl();

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      Referer: `https://www.tesla.com/${config.tesla.language}_${config.tesla.market}/inventory/new/${config.tesla.model}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Tesla API ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as TeslaInventoryResponse | TeslaVehicle[];
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export function vehicleSummary(v: TeslaVehicle): string {
  const parts: string[] = [];
  if (v.TRIMNAME?.[0]) parts.push(v.TRIMNAME[0]);
  else if (v.TRIM?.[0]) parts.push(v.TRIM[0]);
  if (v.Year) parts.push(String(v.Year));
  if (v.PAINT?.[0]) parts.push(v.PAINT[0]);
  if (v.INTERIOR?.[0]) parts.push(`Interior: ${v.INTERIOR[0]}`);
  if (v.WHEELS?.[0]) parts.push(`Wheels: ${v.WHEELS[0]}`);
  return parts.join(' · ');
}

export function vehicleUrl(v: TeslaVehicle): string {
  const lang = config.tesla.language;
  const market = config.tesla.market;
  const model = v.ModelCode?.toLowerCase() || config.tesla.model;
  if (!v.VIN) {
    return `https://www.tesla.com/${lang}_${market}/inventory/new/${model}`;
  }
  return `https://www.tesla.com/${lang}_${market}/${model}/order/${v.VIN}`;
}
