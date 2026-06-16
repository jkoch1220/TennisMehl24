/**
 * Ermittelt das deutsche Bundesland aus den ersten beiden PLZ-Ziffern.
 * Quelle: Deutsche Post AG, PLZ-Leitregionen.
 *
 * Bei nicht-deutschen PLZ oder ungültiger Eingabe → undefined.
 */

const PLZ_BUNDESLAND: Record<string, string> = {
  // 01-09 = Sachsen / Sachsen-Anhalt / Thüringen
  '01': 'Sachsen',
  '02': 'Sachsen',
  '03': 'Brandenburg',
  '04': 'Sachsen',
  '06': 'Sachsen-Anhalt',
  '07': 'Thüringen',
  '08': 'Sachsen',
  '09': 'Sachsen',
  // 10-19 = Berlin / Brandenburg / Mecklenburg-Vorpommern
  '10': 'Berlin',
  '12': 'Berlin',
  '13': 'Berlin',
  '14': 'Brandenburg',
  '15': 'Brandenburg',
  '16': 'Brandenburg',
  '17': 'Mecklenburg-Vorpommern',
  '18': 'Mecklenburg-Vorpommern',
  '19': 'Mecklenburg-Vorpommern',
  // 20-29 = Hamburg / Bremen / Schleswig-Holstein / Niedersachsen
  '20': 'Hamburg',
  '21': 'Niedersachsen',
  '22': 'Hamburg',
  '23': 'Schleswig-Holstein',
  '24': 'Schleswig-Holstein',
  '25': 'Schleswig-Holstein',
  '26': 'Niedersachsen',
  '27': 'Niedersachsen',
  '28': 'Bremen',
  '29': 'Niedersachsen',
  // 30-39 = Niedersachsen / NRW / Hessen / Sachsen-Anhalt
  '30': 'Niedersachsen',
  '31': 'Niedersachsen',
  '32': 'Nordrhein-Westfalen',
  '33': 'Nordrhein-Westfalen',
  '34': 'Hessen',
  '35': 'Hessen',
  '36': 'Hessen',
  '37': 'Niedersachsen',
  '38': 'Niedersachsen',
  '39': 'Sachsen-Anhalt',
  // 40-59 = Nordrhein-Westfalen
  '40': 'Nordrhein-Westfalen',
  '41': 'Nordrhein-Westfalen',
  '42': 'Nordrhein-Westfalen',
  '44': 'Nordrhein-Westfalen',
  '45': 'Nordrhein-Westfalen',
  '46': 'Nordrhein-Westfalen',
  '47': 'Nordrhein-Westfalen',
  '48': 'Nordrhein-Westfalen',
  '49': 'Niedersachsen',
  '50': 'Nordrhein-Westfalen',
  '51': 'Nordrhein-Westfalen',
  '52': 'Nordrhein-Westfalen',
  '53': 'Nordrhein-Westfalen',
  '57': 'Nordrhein-Westfalen',
  '58': 'Nordrhein-Westfalen',
  '59': 'Nordrhein-Westfalen',
  // 54-56 = Rheinland-Pfalz
  '54': 'Rheinland-Pfalz',
  '55': 'Rheinland-Pfalz',
  '56': 'Rheinland-Pfalz',
  // 60-69 = Hessen / Baden-Württemberg / Rheinland-Pfalz
  '60': 'Hessen',
  '61': 'Hessen',
  '63': 'Bayern',
  '64': 'Hessen',
  '65': 'Hessen',
  '66': 'Saarland',
  '67': 'Rheinland-Pfalz',
  '68': 'Baden-Württemberg',
  '69': 'Baden-Württemberg',
  // 70-79 = Baden-Württemberg
  '70': 'Baden-Württemberg',
  '71': 'Baden-Württemberg',
  '72': 'Baden-Württemberg',
  '73': 'Baden-Württemberg',
  '74': 'Baden-Württemberg',
  '75': 'Baden-Württemberg',
  '76': 'Baden-Württemberg',
  '77': 'Baden-Württemberg',
  '78': 'Baden-Württemberg',
  '79': 'Baden-Württemberg',
  // 80-87 = Bayern
  '80': 'Bayern',
  '81': 'Bayern',
  '82': 'Bayern',
  '83': 'Bayern',
  '84': 'Bayern',
  '85': 'Bayern',
  '86': 'Bayern',
  '87': 'Bayern',
  // 88 = Baden-Württemberg + Bayern (Allgäu-Grenze) - hier Bayern
  '88': 'Baden-Württemberg',
  // 89 = Bayern
  '89': 'Bayern',
  // 90-96 = Bayern
  '90': 'Bayern',
  '91': 'Bayern',
  '92': 'Bayern',
  '93': 'Bayern',
  '94': 'Bayern',
  '95': 'Bayern',
  '96': 'Bayern',
  '97': 'Bayern',
  // 98-99 = Thüringen
  '98': 'Thüringen',
  '99': 'Thüringen',
};

export function plzZuBundesland(plz: string | null | undefined): string | undefined {
  if (!plz) return undefined;
  const sauber = String(plz).trim();
  if (sauber.length < 2) return undefined;
  // Nur deutsche PLZ (5 Stellen). Bei kürzer: trotzdem versuchen.
  const prefix = sauber.substring(0, 2);
  return PLZ_BUNDESLAND[prefix];
}
