import { useCallback, useEffect, useRef, useState } from 'react';
import { addBuchung, neueClientId } from '../../services/produktionService';
import type { BuchungsEingabe, ProduktionsBuchung } from '../../types/produktion';
import type { User } from '../../services/authService';

/**
 * Warteschlange für Buchungen ohne Verbindung.
 * ============================================================================
 *
 * Die Anlage steht in einer Halle. Dort reißt das Netz ab — und eine Buchung,
 * die deshalb verloren geht, wird auf einen Zettel geschrieben und abends
 * vergessen. Also: fehlgeschlagene Buchungen wandern in den localStorage und
 * werden nachgesendet, sobald wieder Verbindung besteht.
 *
 * Der heikle Teil ist NICHT das Puffern, sondern das Nachsenden. Eine Buchung,
 * die beim Abbruch in Wahrheit schon angekommen war, würde beim zweiten
 * Versuch ein zweites Mal landen — und der Lagerbestand stünde doppelt so hoch.
 * Deshalb bekommt jede Buchung VOR dem Senden eine `clientId`, die in Appwrite
 * einen Unique-Index trägt. Beim Nachsenden bedeutet der Konflikt (409) dann
 * „war schon da" — also Erfolg, nicht Fehler (siehe produktionService.addBuchung).
 *
 * Was hier bewusst NICHT passiert: der Lagerbestand wird beim Puffern nicht
 * vorab verändert. Ein Bestand, der sich ohne Datenbankschreibvorgang bewegt,
 * ist beim nächsten Neuladen wieder weg — und niemand wüsste, welcher Stand
 * stimmt.
 */

const SPEICHER = 'tm_produktion_warteschlange_v1';

export interface WartendeBuchung extends BuchungsEingabe {
  clientId: string;
  /** Wann die Buchung erfasst wurde — nicht, wann sie gesendet wird. */
  erfasstAm: string;
  /** Fehlversuche; ab 5 wird nur noch beim manuellen Anstoß gesendet. */
  versuche: number;
  letzterFehler?: string;
}

const lade = (): WartendeBuchung[] => {
  try {
    const roh = localStorage.getItem(SPEICHER);
    if (!roh) return [];
    const daten = JSON.parse(roh);
    return Array.isArray(daten) ? daten : [];
  } catch {
    return [];
  }
};

const speichere = (liste: WartendeBuchung[]): void => {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(liste));
  } catch {
    // Speicher voll oder privater Modus: dann geht die Pufferung nicht. Das
    // ist schlimm genug, um es der Oberfläche zu melden — der Aufrufer sieht
    // es daran, dass `anzahl` nicht steigt.
    console.error('Buchung konnte nicht zwischengespeichert werden.');
  }
};

/**
 * Nur echte Verbindungsfehler gehören in die Warteschlange. Ein 400 (ungültige
 * Daten) oder 401 (abgelaufene Sitzung) wird durch Wiederholen nie besser — er
 * würde ewig in der Schlange stehen und bei jedem Start erneut scheitern.
 */
const istVerbindungsfehler = (fehler: unknown): boolean => {
  const f = fehler as { code?: number; message?: string; name?: string };
  if (typeof f?.code === 'number') {
    // 5xx: Server hat ein Problem — Wiederholen ist sinnvoll.
    return f.code >= 500;
  }
  const text = `${f?.name ?? ''} ${f?.message ?? ''}`.toLowerCase();
  return (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('load failed') ||
    text.includes('timeout') ||
    text.includes('abort')
  );
};

export interface WarteschlangeApi {
  /** Anzahl wartender Buchungen. */
  anzahl: number;
  /** Hat der Browser gerade Verbindung? */
  online: boolean;
  /** Läuft gerade ein Sendeversuch? */
  sendet: boolean;
  /**
   * Buchen. Gelingt es, kommt die gespeicherte Buchung zurück. Reißt die
   * Verbindung ab, landet sie in der Warteschlange und es kommt `null` —
   * die Oberfläche meldet dann „gemerkt, wird nachgesendet".
   */
  buche: (eingabe: BuchungsEingabe) => Promise<
    | { art: 'gebucht'; buchung: ProduktionsBuchung; lagerFehler: boolean }
    | { art: 'gemerkt' }
  >;
  /** Warteschlange jetzt abarbeiten (auch bei aufgebrauchten Versuchen). */
  sendeNach: () => Promise<number>;
  /** Eine wartende Buchung verwerfen — z.B. weil sie doppelt erfasst wurde. */
  verwirf: (clientId: string) => void;
  /** Inhalt der Warteschlange, für die Anzeige. */
  wartend: WartendeBuchung[];
}

export const useWarteschlange = (
  user: User | null,
  onNachgesendet?: () => void
): WarteschlangeApi => {
  const [wartend, setWartend] = useState<WartendeBuchung[]>(() => lade());
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [sendet, setSendet] = useState(false);
  const laeuft = useRef(false);

  useEffect(() => {
    const an = () => setOnline(true);
    const aus = () => setOnline(false);
    window.addEventListener('online', an);
    window.addEventListener('offline', aus);
    return () => {
      window.removeEventListener('online', an);
      window.removeEventListener('offline', aus);
    };
  }, []);

  const setzeUndSpeichere = useCallback((naechste: WartendeBuchung[]) => {
    setWartend(naechste);
    speichere(naechste);
  }, []);

  const abarbeiten = useCallback(
    async (auchAufgebrauchte: boolean): Promise<number> => {
      if (laeuft.current) return 0;
      const liste = lade();
      if (liste.length === 0) return 0;

      laeuft.current = true;
      setSendet(true);

      const uebrig: WartendeBuchung[] = [];
      let erfolgreich = 0;

      for (const eintrag of liste) {
        if (!auchAufgebrauchte && eintrag.versuche >= 5) {
          uebrig.push(eintrag);
          continue;
        }
        try {
          await addBuchung(eintrag, user);
          erfolgreich++;
        } catch (fehler) {
          if (istVerbindungsfehler(fehler)) {
            uebrig.push({
              ...eintrag,
              versuche: eintrag.versuche + 1,
              letzterFehler: (fehler as Error).message,
            });
          } else {
            // Dauerhaft unbrauchbar (z.B. ungültige Daten). In der Schlange
            // bleiben wäre eine stille Endlosschleife; deshalb wird der
            // Eintrag mit Grund markiert und der Zähler auf Anschlag gesetzt,
            // damit er nur noch von Hand erneut versucht wird.
            uebrig.push({
              ...eintrag,
              versuche: 99,
              letzterFehler: (fehler as Error).message ?? 'Buchung wurde abgelehnt',
            });
          }
        }
      }

      setzeUndSpeichere(uebrig);
      laeuft.current = false;
      setSendet(false);
      if (erfolgreich > 0) onNachgesendet?.();
      return erfolgreich;
    },
    [user, setzeUndSpeichere, onNachgesendet]
  );

  // Beim Wiederverbinden und beim Start einmal versuchen.
  useEffect(() => {
    if (online && wartend.length > 0) {
      void abarbeiten(false);
    }
    // Absichtlich nur an `online` gekoppelt: bei jeder Änderung von `wartend`
    // erneut zu senden, würde direkt nach dem Puffern einen zweiten Versuch
    // auslösen, der genauso scheitert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const buche = useCallback<WarteschlangeApi['buche']>(
    async (eingabe) => {
      const clientId = eingabe.clientId ?? neueClientId();
      const mitId = { ...eingabe, clientId };

      if (!online) {
        const naechste = [
          ...lade(),
          { ...mitId, erfasstAm: new Date().toISOString(), versuche: 0 },
        ];
        setzeUndSpeichere(naechste);
        return { art: 'gemerkt' };
      }

      try {
        const ergebnis = await addBuchung(mitId, user);
        return { art: 'gebucht', buchung: ergebnis.buchung, lagerFehler: ergebnis.lagerFehler };
      } catch (fehler) {
        if (!istVerbindungsfehler(fehler)) throw fehler;
        const naechste = [
          ...lade(),
          {
            ...mitId,
            erfasstAm: new Date().toISOString(),
            versuche: 1,
            letzterFehler: (fehler as Error).message,
          },
        ];
        setzeUndSpeichere(naechste);
        return { art: 'gemerkt' };
      }
    },
    [online, user, setzeUndSpeichere]
  );

  const verwirf = useCallback(
    (clientId: string) => {
      setzeUndSpeichere(lade().filter((e) => e.clientId !== clientId));
    },
    [setzeUndSpeichere]
  );

  return {
    anzahl: wartend.length,
    online,
    sendet,
    buche,
    sendeNach: () => abarbeiten(true),
    verwirf,
    wartend,
  };
};
