import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client, PRODUKTION_BUCHUNGEN_COLLECTION_ID } from '../../config/appwrite';
import { realtimeKanal } from '../../config/mockModus';
import { getBuchungen, getLieferanten } from '../../services/produktionService';
import type { ProduktionsBuchung } from '../../types/produktion';
import type { User } from '../../services/authService';
import { heuteDatum, verschiebeTage } from './statistik';

/**
 * Lädt die Buchungen für Erfassung und Auswertung.
 *
 * Standardfenster sind 90 Tage. Das deckt jede Kennzahl der Auswertung ab
 * (30 Tage, 12 Wochen kommen aus demselben Bestand) und bleibt bei realistischem
 * Volumen — 20 bis 40 Buchungen am Tag — bei rund 3.000 Dokumenten, also
 * höchstens 30 Seiten. Die Auswertung kann das Fenster auf ein Jahr weiten.
 *
 * REALTIME OHNE AUTO-RELOAD: Fremdänderungen setzen nur ein Merkmal, das die
 * Oberfläche als Hinweisstreifen zeigt („3 neue Buchungen · Aktualisieren").
 * Eine Liste, die sich unter dem Daumen umsortiert, während jemand eine Zahl
 * eintippt, ist schlimmer als eine zwanzig Sekunden alte.
 */

export interface ProduktionsDaten {
  buchungen: ProduktionsBuchung[];
  /** Nur die Buchungen des angemeldeten Nutzers. */
  eigene: ProduktionsBuchung[];
  lieferanten: string[];
  laedt: boolean;
  fehler: string | null;
  /** Anzahl fremder Änderungen seit dem letzten Laden. */
  fremdaenderungen: number;
  neuLaden: () => Promise<void>;
  /** Eine frisch gebuchte Buchung sofort einsortieren, ohne neu zu laden. */
  ergaenze: (buchung: ProduktionsBuchung) => void;
  /** Eine Buchung nach dem Storno ersetzen. */
  ersetze: (buchung: ProduktionsBuchung) => void;
  /** Zeitfenster in Tagen ändern (Auswertung). */
  setzeFenster: (tage: number) => void;
  fensterTage: number;
}

export const useProduktionsDaten = (user: User | null): ProduktionsDaten => {
  const [buchungen, setBuchungen] = useState<ProduktionsBuchung[]>([]);
  const [lieferanten, setLieferanten] = useState<string[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fremdaenderungen, setFremdaenderungen] = useState(0);
  const [fensterTage, setFensterTage] = useState(90);

  // Verhindert, dass eine langsame ältere Antwort eine neuere überschreibt.
  const lauf = useRef(0);

  const neuLaden = useCallback(async () => {
    const meiner = ++lauf.current;
    setLaedt(true);
    setFehler(null);
    try {
      const von = verschiebeTage(heuteDatum(), -fensterTage);
      const [geladen, namen] = await Promise.all([
        getBuchungen({ von, mitStornierten: true }),
        getLieferanten(),
      ]);
      if (lauf.current !== meiner) return;
      setBuchungen(geladen);
      setLieferanten(namen);
      setFremdaenderungen(0);
    } catch (e) {
      if (lauf.current !== meiner) return;
      const nachricht = (e as Error).message ?? 'Unbekannter Fehler';
      // Die Collection fehlt, wenn das Setup-Skript nicht gelaufen ist — das
      // ist der wahrscheinlichste Fehler beim ersten Start und verdient einen
      // Klartext statt „Document not found".
      setFehler(
        nachricht.includes('could not be found') || nachricht.includes('not found')
          ? 'Die Produktions-Datenbank ist noch nicht eingerichtet. Bitte scripts/setup-produktion-buchungen.mjs ausführen.'
          : nachricht
      );
    } finally {
      if (lauf.current === meiner) setLaedt(false);
    }
  }, [fensterTage]);

  useEffect(() => {
    void neuLaden();
  }, [neuLaden]);

  // Realtime-Kanal IMMER über realtimeKanal() — ein selbst gebauter
  // Template-String umgeht den Mock-Proxy und liefert in der Sandbox
  // Produktionsereignisse.
  useEffect(() => {
    const kanal = realtimeKanal(PRODUKTION_BUCHUNGEN_COLLECTION_ID);
    const abmelden = client.subscribe(kanal, (nachricht: { payload?: unknown }) => {
      const doc = nachricht.payload as { erfasstVonId?: string } | undefined;
      // Eigene Buchungen sind schon eingesortiert — sie sind keine Fremdänderung.
      if (doc?.erfasstVonId && user?.$id && doc.erfasstVonId === user.$id) return;
      setFremdaenderungen((n) => n + 1);
    });
    return () => abmelden();
  }, [user?.$id]);

  const ergaenze = useCallback((buchung: ProduktionsBuchung) => {
    setBuchungen((bisher) => [buchung, ...bisher.filter((b) => b.$id !== buchung.$id)]);
  }, []);

  const ersetze = useCallback((buchung: ProduktionsBuchung) => {
    setBuchungen((bisher) => bisher.map((b) => (b.$id === buchung.$id ? buchung : b)));
  }, []);

  const eigene = useMemo(
    () => (user ? buchungen.filter((b) => b.erfasstVonId === user.$id) : []),
    [buchungen, user]
  );

  return {
    buchungen,
    eigene,
    lieferanten,
    laedt,
    fehler,
    fremdaenderungen,
    neuLaden,
    ergaenze,
    ersetze,
    setzeFenster: setFensterTage,
    fensterTage,
  };
};
