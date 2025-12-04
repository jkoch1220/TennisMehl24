/**
 * Kalender-Utilities für Dispo-Planung
 */

/**
 * Formatiert ein Datum im deutschen Format
 */
export function formatDatum(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formatiert eine Zeit im Format HH:mm
 */
export function formatZeit(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formatiert Datum und Zeit zusammen
 */
export function formatDatumZeit(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Gibt den ersten Tag des Monats zurück
 */
export function getErsterTagDesMonats(datum: Date): Date {
  return new Date(datum.getFullYear(), datum.getMonth(), 1);
}

/**
 * Gibt den letzten Tag des Monats zurück
 */
export function getLetzterTagDesMonats(datum: Date): Date {
  return new Date(datum.getFullYear(), datum.getMonth() + 1, 0);
}

/**
 * Gibt den ersten Tag der Woche zurück (Montag)
 */
export function getErsterTagDerWoche(datum: Date): Date {
  const d = new Date(datum);
  const tag = d.getDay();
  const diff = d.getDate() - tag + (tag === 0 ? -6 : 1); // Montag ist Tag 1
  return new Date(d.setDate(diff));
}

/**
 * Gibt den letzten Tag der Woche zurück (Sonntag)
 */
export function getLetzterTagDerWoche(datum: Date): Date {
  const ersterTag = getErsterTagDerWoche(datum);
  const letzterTag = new Date(ersterTag);
  letzterTag.setDate(letzterTag.getDate() + 6);
  return letzterTag;
}

/**
 * Gibt alle Tage eines Monats zurück
 */
export function getTageDesMonats(datum: Date): Date[] {
  const tage: Date[] = [];
  const ersterTag = getErsterTagDesMonats(datum);
  const letzterTag = getLetzterTagDesMonats(datum);
  
  for (let d = new Date(ersterTag); d <= letzterTag; d.setDate(d.getDate() + 1)) {
    tage.push(new Date(d));
  }
  
  return tage;
}

/**
 * Gibt alle Tage einer Woche zurück
 */
export function getTageDerWoche(datum: Date): Date[] {
  const tage: Date[] = [];
  const ersterTag = getErsterTagDerWoche(datum);
  
  for (let i = 0; i < 7; i++) {
    const tag = new Date(ersterTag);
    tag.setDate(tag.getDate() + i);
    tage.push(tag);
  }
  
  return tage;
}

/**
 * Prüft ob zwei Daten am selben Tag sind
 */
export function istGleicherTag(datum1: Date | string, datum2: Date | string): boolean {
  const d1 = typeof datum1 === 'string' ? new Date(datum1) : datum1;
  const d2 = typeof datum2 === 'string' ? new Date(datum2) : datum2;
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Gibt den Monatsnamen zurück
 */
export function getMonatsname(datum: Date): string {
  return datum.toLocaleDateString('de-DE', { month: 'long' });
}

/**
 * Gibt den Wochentagnamen zurück
 */
export function getWochentagName(datum: Date): string {
  return datum.toLocaleDateString('de-DE', { weekday: 'long' });
}

/**
 * Gibt den Wochentag-Kurzname zurück (Mo, Di, Mi, etc.)
 */
export function getWochentagKurz(datum: Date): string {
  return datum.toLocaleDateString('de-DE', { weekday: 'short' });
}

/**
 * Fügt Tage zu einem Datum hinzu
 */
export function addTage(datum: Date, tage: number): Date {
  const result = new Date(datum);
  result.setDate(result.getDate() + tage);
  return result;
}

/**
 * Fügt Monate zu einem Datum hinzu
 */
export function addMonate(datum: Date, monate: number): Date {
  const result = new Date(datum);
  result.setMonth(result.getMonth() + monate);
  return result;
}


