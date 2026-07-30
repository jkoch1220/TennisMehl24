/**
 * Tauscht ein Listenelement mit seinem Nachbarn. Gibt die Liste unverändert
 * zurück, wenn das Ziel außerhalb der Liste liegt (erstes Element nach oben,
 * letztes nach unten) — die aufrufende Stelle muss die Buttons also nicht
 * zwingend deaktivieren.
 */
export function verschiebeInListe<T>(liste: T[], index: number, richtung: -1 | 1): T[] {
  const ziel = index + richtung;
  if (ziel < 0 || ziel >= liste.length) return liste;
  const kopie = [...liste];
  [kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]];
  return kopie;
}
