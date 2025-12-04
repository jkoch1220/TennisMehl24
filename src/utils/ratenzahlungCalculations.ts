import { OffeneRechnung, RatenzahlungInterval } from '../types/kreditor';

/**
 * Berechnet das Datum der nächsten fälligen Rate basierend auf:
 * - Aktuellem Fälligkeitsdatum
 * - Intervall (monatlich oder wöchentlich)
 */
export function berechneNaechsteRateFaelligkeit(
  aktuelleRateFaelligAm: string,
  ratenzahlungInterval: RatenzahlungInterval
): string {
  const aktuellesDatum = new Date(aktuelleRateFaelligAm);
  const naechstesDatum = new Date(aktuellesDatum);
  
  if (ratenzahlungInterval === 'monatlich') {
    // Füge einen Monat hinzu
    naechstesDatum.setMonth(naechstesDatum.getMonth() + 1);
  } else if (ratenzahlungInterval === 'woechentlich') {
    // Füge eine Woche (7 Tage) hinzu
    naechstesDatum.setDate(naechstesDatum.getDate() + 7);
  }
  
  return naechstesDatum.toISOString();
}

/**
 * Berechnet die nächste Rate für eine Rechnung basierend auf deren Daten
 */
export function berechneNaechsteRate(rechnung: OffeneRechnung): string | undefined {
  if (!rechnung.rateFaelligAm || !rechnung.ratenzahlungInterval) {
    return undefined;
  }
  
  return berechneNaechsteRateFaelligkeit(
    rechnung.rateFaelligAm,
    rechnung.ratenzahlungInterval
  );
}

/**
 * Gibt das relevante Fälligkeitsdatum für eine Rechnung zurück
 * Bei Ratenzahlung: rateFaelligAm
 * Sonst: das normale Fälligkeitsdatum
 */
export function getRelevanteFaelligkeit(rechnung: OffeneRechnung): string {
  if (rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm) {
    return rechnung.rateFaelligAm;
  }
  return rechnung.faelligkeitsdatum;
}

/**
 * Prüft ob eine Rate überfällig ist
 */
export function istRateUeberfaellig(rechnung: OffeneRechnung): boolean {
  if (rechnung.status !== 'in_ratenzahlung') {
    return false;
  }
  
  const relevanteDatum = getRelevanteFaelligkeit(rechnung);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const faellig = new Date(relevanteDatum);
  faellig.setHours(0, 0, 0, 0);
  
  return faellig < heute;
}

/**
 * Prüft ob eine Rate heute fällig ist
 */
export function istRateHeuteFaellig(rechnung: OffeneRechnung): boolean {
  if (rechnung.status !== 'in_ratenzahlung') {
    return false;
  }
  
  const relevanteDatum = getRelevanteFaelligkeit(rechnung);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const faellig = new Date(relevanteDatum);
  faellig.setHours(0, 0, 0, 0);
  
  return faellig.getTime() === heute.getTime();
}

/**
 * Prüft ob eine normale Rechnung überfällig ist
 */
export function istRechnungUeberfaellig(rechnung: OffeneRechnung): boolean {
  if (rechnung.status === 'bezahlt' || rechnung.status === 'storniert') {
    return false;
  }
  
  const relevanteDatum = getRelevanteFaelligkeit(rechnung);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const faellig = new Date(relevanteDatum);
  faellig.setHours(0, 0, 0, 0);
  
  return faellig < heute;
}

/**
 * Prüft ob eine normale Rechnung heute fällig ist
 */
export function istRechnungHeuteFaellig(rechnung: OffeneRechnung): boolean {
  if (rechnung.status === 'bezahlt' || rechnung.status === 'storniert') {
    return false;
  }
  
  const relevanteDatum = getRelevanteFaelligkeit(rechnung);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const faellig = new Date(relevanteDatum);
  faellig.setHours(0, 0, 0, 0);
  
  return faellig.getTime() === heute.getTime();
}
