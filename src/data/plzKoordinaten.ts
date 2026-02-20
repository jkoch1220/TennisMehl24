/**
 * PLZ-KOORDINATEN LOOKUP
 * ======================
 * ZERO API COST Geocoding!
 *
 * Enthält Mittelpunkt-Koordinaten für alle deutschen PLZ-Bereiche (2-stellig).
 * Genauigkeit: ~5-15km - für Dispo-Planung vollkommen ausreichend!
 *
 * Vorteile:
 * - KEINE Google API Kosten
 * - SOFORT (keine Netzwerk-Latenz)
 * - Offline-fähig
 * - 100% zuverlässig
 */

// PLZ-Bereich (2-stellig) → Koordinaten (lat, lng)
// Sortiert nach PLZ für schnelles Debugging
export const PLZ_KOORDINATEN: Record<string, { lat: number; lng: number; region: string }> = {
  // 0xxxx - Sachsen, Sachsen-Anhalt, Thüringen (Ost)
  '01': { lat: 51.05, lng: 13.74, region: 'Dresden' },
  '02': { lat: 51.15, lng: 14.97, region: 'Görlitz/Bautzen' },
  '03': { lat: 51.76, lng: 14.33, region: 'Cottbus' },
  '04': { lat: 51.34, lng: 12.38, region: 'Leipzig' },
  '06': { lat: 51.48, lng: 11.97, region: 'Halle' },
  '07': { lat: 50.93, lng: 11.59, region: 'Jena/Gera' },
  '08': { lat: 50.72, lng: 12.49, region: 'Zwickau' },
  '09': { lat: 50.83, lng: 12.92, region: 'Chemnitz' },

  // 1xxxx - Berlin, Brandenburg
  '10': { lat: 52.52, lng: 13.40, region: 'Berlin Mitte' },
  '12': { lat: 52.47, lng: 13.43, region: 'Berlin Süd' },
  '13': { lat: 52.56, lng: 13.38, region: 'Berlin Nord' },
  '14': { lat: 52.39, lng: 13.07, region: 'Potsdam' },
  '15': { lat: 52.35, lng: 14.55, region: 'Frankfurt/Oder' },
  '16': { lat: 52.97, lng: 13.78, region: 'Oranienburg/Eberswalde' },
  '17': { lat: 53.90, lng: 13.38, region: 'Greifswald/Stralsund' },
  '18': { lat: 54.09, lng: 12.14, region: 'Rostock' },
  '19': { lat: 53.63, lng: 11.41, region: 'Schwerin' },

  // 2xxxx - Hamburg, Schleswig-Holstein, Mecklenburg
  '20': { lat: 53.55, lng: 9.99, region: 'Hamburg Mitte' },
  '21': { lat: 53.47, lng: 9.96, region: 'Hamburg Süd' },
  '22': { lat: 53.60, lng: 10.03, region: 'Hamburg Nord' },
  '23': { lat: 53.87, lng: 10.69, region: 'Lübeck' },
  '24': { lat: 54.32, lng: 10.14, region: 'Kiel' },
  '25': { lat: 54.20, lng: 9.10, region: 'Husum/Heide' },
  '26': { lat: 53.15, lng: 8.22, region: 'Oldenburg/Wilhelmshaven' },
  '27': { lat: 53.08, lng: 8.80, region: 'Bremen Nord' },
  '28': { lat: 53.08, lng: 8.80, region: 'Bremen' },
  '29': { lat: 52.97, lng: 10.57, region: 'Celle/Uelzen' },

  // 3xxxx - Niedersachsen, Nordrhein-Westfalen Nord
  '30': { lat: 52.37, lng: 9.74, region: 'Hannover' },
  '31': { lat: 52.16, lng: 9.95, region: 'Hildesheim' },
  '32': { lat: 52.02, lng: 8.53, region: 'Herford/Minden' },
  '33': { lat: 51.93, lng: 8.88, region: 'Bielefeld' },
  '34': { lat: 51.31, lng: 9.50, region: 'Kassel' },
  '35': { lat: 50.80, lng: 8.77, region: 'Marburg/Gießen' },
  '36': { lat: 50.55, lng: 9.68, region: 'Fulda' },
  '37': { lat: 51.53, lng: 9.93, region: 'Göttingen' },
  '38': { lat: 52.27, lng: 10.52, region: 'Braunschweig/Wolfsburg' },
  '39': { lat: 52.13, lng: 11.63, region: 'Magdeburg' },

  // 4xxxx - Nordrhein-Westfalen (Ruhrgebiet, Münsterland)
  '40': { lat: 51.23, lng: 6.78, region: 'Düsseldorf' },
  '41': { lat: 51.19, lng: 6.44, region: 'Mönchengladbach' },
  '42': { lat: 51.26, lng: 7.15, region: 'Wuppertal/Solingen' },
  '44': { lat: 51.51, lng: 7.47, region: 'Dortmund' },
  '45': { lat: 51.45, lng: 7.01, region: 'Essen' },
  '46': { lat: 51.54, lng: 6.76, region: 'Oberhausen/Duisburg' },
  '47': { lat: 51.43, lng: 6.76, region: 'Duisburg' },
  '48': { lat: 51.96, lng: 7.63, region: 'Münster' },
  '49': { lat: 52.28, lng: 8.05, region: 'Osnabrück' },

  // 5xxxx - Nordrhein-Westfalen (Köln/Bonn), Rheinland-Pfalz Nord
  '50': { lat: 50.94, lng: 6.96, region: 'Köln' },
  '51': { lat: 50.99, lng: 7.13, region: 'Köln Ost/Bergisch Gladbach' },
  '52': { lat: 50.78, lng: 6.08, region: 'Aachen' },
  '53': { lat: 50.73, lng: 7.10, region: 'Bonn' },
  '54': { lat: 49.76, lng: 6.64, region: 'Trier' },
  '55': { lat: 50.00, lng: 8.27, region: 'Mainz' },
  '56': { lat: 50.36, lng: 7.59, region: 'Koblenz' },
  '57': { lat: 50.87, lng: 7.87, region: 'Siegen' },
  '58': { lat: 51.36, lng: 7.47, region: 'Hagen/Iserlohn' },
  '59': { lat: 51.66, lng: 7.82, region: 'Hamm/Unna' },

  // 6xxxx - Hessen, Rheinland-Pfalz
  '60': { lat: 50.11, lng: 8.68, region: 'Frankfurt' },
  '61': { lat: 50.22, lng: 8.62, region: 'Bad Homburg/Friedberg' },
  '63': { lat: 50.00, lng: 8.98, region: 'Offenbach/Hanau' },
  '64': { lat: 49.87, lng: 8.65, region: 'Darmstadt' },
  '65': { lat: 50.08, lng: 8.24, region: 'Wiesbaden' },
  '66': { lat: 49.24, lng: 7.00, region: 'Saarbrücken' },
  '67': { lat: 49.45, lng: 8.45, region: 'Ludwigshafen/Mannheim' },
  '68': { lat: 49.49, lng: 8.47, region: 'Mannheim' },
  '69': { lat: 49.41, lng: 8.69, region: 'Heidelberg' },

  // 7xxxx - Baden-Württemberg Nord
  '70': { lat: 48.78, lng: 9.18, region: 'Stuttgart' },
  '71': { lat: 48.83, lng: 9.22, region: 'Stuttgart Nord/Ludwigsburg' },
  '72': { lat: 48.52, lng: 9.05, region: 'Tübingen/Reutlingen' },
  '73': { lat: 48.70, lng: 9.48, region: 'Esslingen/Göppingen' },
  '74': { lat: 49.14, lng: 9.22, region: 'Heilbronn' },
  '75': { lat: 48.89, lng: 8.70, region: 'Pforzheim' },
  '76': { lat: 49.01, lng: 8.40, region: 'Karlsruhe' },
  '77': { lat: 48.46, lng: 7.95, region: 'Offenburg' },
  '78': { lat: 47.99, lng: 8.75, region: 'Konstanz/Villingen-Schwenningen' },
  '79': { lat: 47.99, lng: 7.85, region: 'Freiburg' },

  // 8xxxx - Bayern Süd
  '80': { lat: 48.14, lng: 11.58, region: 'München' },
  '81': { lat: 48.11, lng: 11.54, region: 'München Süd' },
  '82': { lat: 48.02, lng: 11.28, region: 'Starnberg/Fürstenfeldbruck' },
  '83': { lat: 47.86, lng: 11.95, region: 'Rosenheim' },
  '84': { lat: 48.25, lng: 12.12, region: 'Landshut' },
  '85': { lat: 48.26, lng: 11.43, region: 'Freising/Dachau' },
  '86': { lat: 48.37, lng: 10.90, region: 'Augsburg' },
  '87': { lat: 47.73, lng: 10.31, region: 'Kempten' },
  '88': { lat: 47.72, lng: 9.86, region: 'Ravensburg/Friedrichshafen' },
  '89': { lat: 48.40, lng: 10.00, region: 'Ulm' },

  // 9xxxx - Bayern Nord, Thüringen
  '90': { lat: 49.45, lng: 11.08, region: 'Nürnberg' },
  '91': { lat: 49.60, lng: 11.01, region: 'Erlangen/Fürth' },
  '92': { lat: 49.68, lng: 12.10, region: 'Weiden/Amberg' },
  '93': { lat: 49.02, lng: 12.10, region: 'Regensburg' },
  '94': { lat: 48.57, lng: 13.46, region: 'Passau' },
  '95': { lat: 50.08, lng: 11.96, region: 'Bayreuth/Hof' },
  '96': { lat: 50.10, lng: 10.88, region: 'Bamberg/Coburg' },
  '97': { lat: 49.79, lng: 9.95, region: 'Würzburg' },
  '98': { lat: 50.68, lng: 10.93, region: 'Suhl/Ilmenau' },
  '99': { lat: 50.98, lng: 11.03, region: 'Erfurt' },
};

// Erweiterte Koordinaten für 3-stellige PLZ-Bereiche (für höhere Genauigkeit)
// Abdeckt die wichtigsten Ballungsräume
export const PLZ_KOORDINATEN_3: Record<string, { lat: number; lng: number }> = {
  // Berlin genauer
  '100': { lat: 52.52, lng: 13.40 },
  '101': { lat: 52.51, lng: 13.42 },
  '102': { lat: 52.50, lng: 13.38 },
  '103': { lat: 52.52, lng: 13.35 },
  '104': { lat: 52.54, lng: 13.43 },
  '105': { lat: 52.49, lng: 13.45 },
  '106': { lat: 52.48, lng: 13.40 },
  '107': { lat: 52.46, lng: 13.35 },
  '108': { lat: 52.46, lng: 13.42 },
  '109': { lat: 52.48, lng: 13.47 },

  // München genauer
  '800': { lat: 48.14, lng: 11.58 },
  '801': { lat: 48.13, lng: 11.55 },
  '802': { lat: 48.11, lng: 11.59 },
  '803': { lat: 48.12, lng: 11.62 },
  '804': { lat: 48.16, lng: 11.54 },
  '805': { lat: 48.17, lng: 11.60 },
  '806': { lat: 48.19, lng: 11.52 },
  '807': { lat: 48.19, lng: 11.58 },
  '808': { lat: 48.15, lng: 11.48 },
  '809': { lat: 48.10, lng: 11.52 },

  // Hamburg genauer
  '200': { lat: 53.55, lng: 9.99 },
  '201': { lat: 53.56, lng: 9.96 },
  '203': { lat: 53.55, lng: 10.02 },
  '204': { lat: 53.54, lng: 10.05 },
  '205': { lat: 53.57, lng: 9.92 },
  '206': { lat: 53.53, lng: 9.98 },
  '207': { lat: 53.52, lng: 9.94 },

  // Köln genauer
  '500': { lat: 50.94, lng: 6.96 },
  '501': { lat: 50.92, lng: 6.93 },
  '502': { lat: 50.96, lng: 6.95 },
  '503': { lat: 50.93, lng: 6.99 },
  '504': { lat: 50.90, lng: 6.97 },
  '505': { lat: 50.95, lng: 6.92 },
  '506': { lat: 50.88, lng: 6.94 },
  '507': { lat: 50.89, lng: 7.02 },

  // Frankfurt genauer
  '600': { lat: 50.11, lng: 8.68 },
  '601': { lat: 50.13, lng: 8.66 },
  '602': { lat: 50.10, lng: 8.72 },
  '603': { lat: 50.12, lng: 8.74 },
  '604': { lat: 50.09, lng: 8.65 },
  '605': { lat: 50.14, lng: 8.70 },
  '606': { lat: 50.08, lng: 8.62 },

  // Würzburg/Marktheidenfeld Gebiet (wichtig für TennisMehl!)
  '970': { lat: 49.80, lng: 9.94 },
  '971': { lat: 49.79, lng: 9.93 },
  '972': { lat: 49.85, lng: 9.60 }, // Marktheidenfeld!
  '973': { lat: 49.78, lng: 9.88 },
  '974': { lat: 49.70, lng: 9.75 },
  '975': { lat: 49.66, lng: 9.52 },
  '976': { lat: 49.62, lng: 9.68 },
  '977': { lat: 49.74, lng: 9.62 },
  '978': { lat: 49.82, lng: 10.05 },
  '979': { lat: 49.88, lng: 9.78 },

  // Nürnberg genauer
  '900': { lat: 49.45, lng: 11.08 },
  '901': { lat: 49.47, lng: 11.05 },
  '902': { lat: 49.43, lng: 11.12 },
  '903': { lat: 49.46, lng: 11.02 },
  '904': { lat: 49.50, lng: 11.10 },
  '905': { lat: 49.48, lng: 11.15 },
  '906': { lat: 49.42, lng: 11.05 },

  // Stuttgart genauer
  '700': { lat: 48.78, lng: 9.18 },
  '701': { lat: 48.77, lng: 9.15 },
  '702': { lat: 48.80, lng: 9.20 },
  '703': { lat: 48.75, lng: 9.17 },
  '704': { lat: 48.82, lng: 9.16 },
  '705': { lat: 48.79, lng: 9.22 },
};

/**
 * Holt Koordinaten für eine PLZ.
 * Versucht zuerst 3-stellig (genauer), dann 2-stellig.
 *
 * @param plz 5-stellige PLZ als String
 * @returns Koordinaten oder null wenn nicht gefunden
 */
export function getKoordinatenFuerPLZ(plz: string): { lat: number; lng: number } | null {
  if (!plz || plz.length < 2) return null;

  const cleaned = plz.replace(/\D/g, '').padStart(5, '0');

  // Versuche 3-stellig (höhere Genauigkeit)
  const prefix3 = cleaned.substring(0, 3);
  if (PLZ_KOORDINATEN_3[prefix3]) {
    return PLZ_KOORDINATEN_3[prefix3];
  }

  // Fallback auf 2-stellig
  const prefix2 = cleaned.substring(0, 2);
  if (PLZ_KOORDINATEN[prefix2]) {
    return { lat: PLZ_KOORDINATEN[prefix2].lat, lng: PLZ_KOORDINATEN[prefix2].lng };
  }

  return null;
}

/**
 * Extrahiert PLZ aus einem Adress-String und gibt Koordinaten zurück.
 *
 * @param addressOrPlzOrt String wie "97828 Marktheidenfeld" oder "Hauptstr. 1, 97828 Marktheidenfeld"
 * @returns Koordinaten oder null
 */
export function geocodeByPLZ(addressOrPlzOrt: string): { lat: number; lng: number } | null {
  if (!addressOrPlzOrt) return null;

  // PLZ extrahieren (5 zusammenhängende Ziffern)
  const match = addressOrPlzOrt.match(/\b(\d{5})\b/);
  if (!match) return null;

  return getKoordinatenFuerPLZ(match[1]);
}

/**
 * Berechnet die Luftlinie zwischen zwei Punkten (Haversine-Formel).
 * Für Dispo-Planung völlig ausreichend.
 *
 * @returns Entfernung in Kilometern
 */
export function berechneEntfernungKm(
  von: { lat: number; lng: number },
  nach: { lat: number; lng: number }
): number {
  const R = 6371; // Erdradius in km
  const dLat = (nach.lat - von.lat) * Math.PI / 180;
  const dLon = (nach.lng - von.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(von.lat * Math.PI / 180) * Math.cos(nach.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Berechnet die geschätzte Straßenentfernung.
 * Luftlinie * 1.3 (typischer Straßenfaktor für Deutschland)
 */
export function berechneStrassenEntfernungKm(
  von: { lat: number; lng: number },
  nach: { lat: number; lng: number }
): number {
  return berechneEntfernungKm(von, nach) * 1.3;
}

/**
 * Berechnet die geschätzte Fahrzeit in Minuten.
 * Basiert auf Durchschnittsgeschwindigkeit von 60 km/h (LKW).
 */
export function berechneFahrzeitMinuten(
  von: { lat: number; lng: number },
  nach: { lat: number; lng: number }
): number {
  const km = berechneStrassenEntfernungKm(von, nach);
  return Math.round(km / 60 * 60); // km / (km/h) * 60 = Minuten
}
