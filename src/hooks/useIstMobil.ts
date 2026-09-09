import { useEffect, useState } from 'react';

/**
 * Eine Quelle für „läuft gerade auf einem Touch-Gerät mit schmalem Schirm".
 *
 * Es gab im Portal drei divergierende Kopien dieser Logik (ProduktionsTracker,
 * ProjektVerwaltung, ProjektabwicklungNeu) mit unterschiedlichen Schwellen.
 *
 * Zwei Details, die die Kopien falsch machten:
 *
 *  • Der Erstwert wurde mit `useState(false)` gesetzt und erst in einem Effekt
 *    korrigiert. Ein Tablet rendert damit immer zuerst die Desktop-Ansicht,
 *    rechnet deren Statistik durch und verwirft sie — sichtbar als Aufblitzen.
 *    Hier ist der Erstwert synchron.
 *
 *  • Es wurde nur auf `resize` gehört. Ein Wechsel ins Querformat löst das auf
 *    manchen Geräten nicht aus; `matchMedia` schon.
 *
 * `pointer: coarse` trennt Finger von Maus: ein schmal gezogenes Fenster am
 * Schreibtisch bleibt damit Desktop, ein Tablet im Querformat wird mobil.
 */
const ABFRAGE = '(max-width: 1023px) and (pointer: coarse)';

export const useIstMobil = (): boolean => {
  const [istMobil, setIstMobil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(ABFRAGE).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(ABFRAGE);
    const aktualisiere = () => setIstMobil(mq.matches);
    aktualisiere();
    mq.addEventListener('change', aktualisiere);
    return () => mq.removeEventListener('change', aktualisiere);
  }, []);

  return istMobil;
};

export default useIstMobil;
