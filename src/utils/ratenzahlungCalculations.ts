import { OffeneRechnung, RatenzahlungInterval } from '../types/kreditor';

/**
 * Berechnet das Datum der nächsten fälligen Rate basierend auf:
 * - Datum der ersten Rate
 * - Intervall (monatlich oder wöchentlich)
 */
export function berechneNaechsteRateFaelligkeit(
  faelligErsteMonatsrateAm: string,
  ratenzahlungInterval: RatenzahlungInterval
): string {
  const ersteDatum = new Date(faelligErsteMonatsrateAm);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  
  // Startpunkt ist die erste Rate
  let naechstesDatum = new Date(ersteDatum);
  
  // Iteriere durch alle Raten bis wir eine finden, die in der Zukunft liegt
  let ratenNummer = 0;
  
  while (naechstesDatum <= heute) {
    ratenNummer++;
    
    if (ratenzahlungInterval === 'monatlich') {
      // Füge einen Monat hinzu
      naechstesDatum = new Date(ersteDatum);
      naechstesDatum.setMonth(ersteDatum.getMonth() + ratenNummer);
    } else if (ratenzahlungInterval === 'woechentlich') {
      // Füge eine Woche (7 Tage) hinzu
      naechstesDatum = new Date(ersteDatum);
      naechstesDatum.setDate(ersteDatum.getDate() + (ratenNummer * 7));
    }
  }
  
  return naechstesDatum.toISOString();
}

/**
 * Berechnet die nächste Rate für eine Rechnung basierend auf deren Daten
 */
export function berechneNaechsteRate(rechnung: OffeneRechnung): string | undefined {
  if (!rechnung.faelligErsteMonatsrateAm || !rechnung.ratenzahlungInterval) {
    return undefined;
  }
  
  return berechneNaechsteRateFaelligkeit(
    rechnung.faelligErsteMonatsrateAm,
    rechnung.ratenzahlungInterval
  );
}

/**
 * Aktualisiert eine Rechnung mit der berechneten nächsten Rate
 */
export function aktualisiereNaechsteRate(rechnung: OffeneRechnung): Partial<OffeneRechnung> {
  const naechsteRate = berechneNaechsteRate(rechnung);
  
  return {
    naechsteRateFaelligAm: naechsteRate,
  };
}

/**
 * Gibt das relevante Fälligkeitsdatum für eine Rechnung zurück
 * Bei Ratenzahlung: die nächste fällige Rate
 * Sonst: das normale Fälligkeitsdatum
 */
export function getRelevanteFaelligkeit(rechnung: OffeneRechnung): string {
  if (rechnung.status === 'in_ratenzahlung' && rechnung.naechsteRateFaelligAm) {
    return rechnung.naechsteRateFaelligAm;
  }
  if (rechnung.status === 'in_ratenzahlung' && rechnung.faelligErsteMonatsrateAm) {
    return rechnung.faelligErsteMonatsrateAm;
  }
  return rechnung.faelligkeitsdatum;
}
