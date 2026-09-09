import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BuchungsEingabe,
  Gebinde,
  Koernung,
  ProduktionsBereich,
  ProduktionsBuchung,
} from '../../types/produktion';
import { gebindeInTonnen, getGebinde, getKoernung } from '../../types/produktion';
import {
  neueClientId,
  pruefePlausibilitaet,
  summeTonnen,
  type Plausibilitaetshinweis,
} from '../../services/produktionService';
import { parseZahlText } from '../../utils/zahlenEingabe';
import { geladeneMerkwerte, ladeVorwahl, speichereMerkwert, speichereVorwahl } from './produktionUi';
import { heuteDatum, verschiebeTage } from './statistik';
import type { TastenZustand } from './BuchenTaste';
import type { RohmaterialWerte } from './RohmaterialFelder';

/**
 * Der Formularzustand der Erfassung — geteilt zwischen Mobil- und
 * Desktop-Ansicht, damit beide garantiert dieselben Regeln durchsetzen.
 *
 * Zwei Entscheidungen, die hier verankert sind:
 *
 * 1. DIE MENGE KLEBT NIE. Station, Körnung, Gebinde und Lieferant bleiben über
 *    eine Buchung hinweg stehen — eine Mahlcharge läuft stundenlang gleich, und
 *    dieselbe Ziegelei liefert mehrfach am Tag. Die Menge nicht: eine
 *    vorbelegte Menge ist die klassische Doppelbuchung. Stattdessen erscheint
 *    der zuletzt gebuchte Wert als zusätzliche Schnelltaste — Wiederholung
 *    bleibt möglich, aber sie ist ein bewusster Tipp.
 *
 * 2. GESPERRT WIRD NUR, WO OHNE DIE ANGABE GAR KEINE VERWERTBARE BUCHUNG
 *    ENTSTEHT: fehlende Menge, fehlende Körnung, fehlendes Gebinde. Alles
 *    andere ist Warnung. Harte Sperren an einer Erfassungsmaske werden
 *    umgangen, nicht befolgt.
 */

export interface ErfassungsZustand {
  bereich: ProduktionsBereich;
  datum: string;
  /** Rohtext des Ziffernblocks (Rohmaterial, Mahlen auf Wunsch). */
  mengeText: string;
  /** Wert des Mengenrads (Mahlen). */
  mengeRad: number;
  /** Stückzahl (Abfüllung). */
  stueck: number;
  koernung: Koernung | null;
  gebinde: Gebinde | null;
  rohmaterial: RohmaterialWerte;
  notiz: string;
  /** Wenn die Erfassung eine stornierte Buchung ersetzt. */
  ersetztBuchungId: string | null;
  /** Ziffernblock statt Rad/Zähler benutzen. */
  zifferModus: boolean;
}

const LEER_ROHMATERIAL: RohmaterialWerte = {
  lieferant: '',
  wiegeschein: '',
  kennzeichen: '',
  dublettenBestaetigt: false,
};

export interface ErfassungApi {
  zustand: ErfassungsZustand;
  /** Die maßgebliche Tonnage der aktuellen Eingabe. */
  tonnen: number;
  /** Zweite Zeile unter der großen Zahl, z.B. „12 Paletten × 1.000 kg". */
  ableitung: string | null;
  /** Klartextsatz dessen, was gebucht würde. */
  quittung: string;
  hinweise: Plausibilitaetshinweis[];
  /** Was fehlt, damit gebucht werden kann — null, wenn nichts fehlt. */
  fehlt: string | null;
  tastenZustand: TastenZustand;
  tastenText: string;
  merkwerte: number[];
  /** Zuletzt gebuchter Wert dieses Bereichs, als „Nochmal"-Taste. */
  letzterWert: number | null;

  setzeBereich: (bereich: ProduktionsBereich) => void;
  setzeDatum: (datum: string) => void;
  setzeMengeText: (text: string) => void;
  setzeMengeRad: (wert: number) => void;
  setzeStueck: (wert: number) => void;
  setzeKoernung: (wert: Koernung) => void;
  setzeGebinde: (wert: Gebinde) => void;
  setzeRohmaterial: (werte: RohmaterialWerte) => void;
  setzeNotiz: (text: string) => void;
  setzeZifferModus: (an: boolean) => void;
  /** Werte einer stornierten Buchung übernehmen (Korrekturbuchung). */
  uebernehmeAus: (buchung: ProduktionsBuchung) => void;
  /** Eingabe für den Service bauen. */
  baueEingabe: () => BuchungsEingabe;
  /** Nach erfolgreicher Buchung aufräumen — Kontext bleibt, Menge geht. */
  nachBuchung: (gebuchteMenge: number) => void;
  setzeTastenZustand: (zustand: TastenZustand | null) => void;
}

export interface ErfassungOptionen {
  /** Alle Buchungen des gewählten Tages (für die Tagessummen-Prüfung). */
  buchungenAmTag: ProduktionsBuchung[];
  /** Die letzten eigenen Buchungen (für die Wiederholungsprüfung). */
  eigeneLetzte: ProduktionsBuchung[];
  /** Darf der Nutzer Betriebszahlen in Warntexten sehen? */
  zeigeZahlen: boolean;
  /** Zuletzt gemahlene Menge der letzten 7 Tage — für die Abfüll-Warnung. */
  losesMehlVorrat?: number;
}

export const useErfassung = (optionen: ErfassungOptionen): ErfassungApi => {
  const vorwahl = useRef(ladeVorwahl());

  const [zustand, setZustand] = useState<ErfassungsZustand>(() => {
    const v = vorwahl.current;
    const heute = heuteDatum();
    return {
      bereich: v.bereich ?? 'mahlen',
      datum: heute,
      mengeText: '',
      mengeRad: 0,
      stueck: 0,
      // Beim ersten Öffnen einer Sitzung ist bewusst NICHTS vorgewählt; ab der
      // zweiten Buchung steht die letzte Wahl mit der Fußnote „wie zuletzt".
      koernung: (v.mahlen?.koernung as Koernung) ?? null,
      gebinde: (v.abfuellung?.gebinde as Gebinde) ?? null,
      rohmaterial: {
        ...LEER_ROHMATERIAL,
        // Der Lieferant klebt nur bis zum Tageswechsel.
        lieferant: v.rohmaterial?.tag === heute ? v.rohmaterial?.lieferant ?? '' : '',
      },
      notiz: '',
      ersetztBuchungId: null,
      zifferModus: false,
    };
  });

  const [ueberschriebenerZustand, setUeberschriebenerZustand] = useState<TastenZustand | null>(null);
  const [letzteWerte, setLetzteWerte] = useState<Partial<Record<ProduktionsBereich, number>>>({});

  const aendere = useCallback((teil: Partial<ErfassungsZustand>) => {
    setZustand((bisher) => ({ ...bisher, ...teil }));
  }, []);

  // ---------------------------------------------------------------------
  // Abgeleitete Werte
  // ---------------------------------------------------------------------

  const tonnen = useMemo(() => {
    if (zustand.bereich === 'abfuellung') {
      return zustand.gebinde ? gebindeInTonnen(zustand.gebinde, zustand.stueck) : 0;
    }
    if (zustand.bereich === 'rohmaterial' || zustand.zifferModus) {
      // Der Ziffernblock liefert einen deutschen Zahlentext; geparst wird mit
      // der gemeinsamen Portal-Logik, nicht mit parseFloat — sonst wird „7,9"
      // zu 79.
      return parseZahlText(zustand.mengeText) ?? 0;
    }
    return zustand.mengeRad;
  }, [zustand]);

  const ableitung = useMemo(() => {
    if (zustand.bereich !== 'abfuellung' || !zustand.gebinde || zustand.stueck <= 0) return null;
    const def = getGebinde(zustand.gebinde);
    if (!def) return null;
    const bezeichnung = zustand.stueck === 1 ? def.label : def.mehrzahl;
    return `${zustand.stueck} ${bezeichnung} × ${def.kiloProEinheit.toLocaleString('de-DE')} kg`;
  }, [zustand.bereich, zustand.gebinde, zustand.stueck]);

  const eingabe = useMemo<BuchungsEingabe>(
    () => ({
      bereich: zustand.bereich,
      datum: zustand.datum,
      tonnen,
      koernung: zustand.bereich === 'rohmaterial' ? null : zustand.koernung,
      lieferant: zustand.rohmaterial.lieferant || null,
      kennzeichen: zustand.rohmaterial.kennzeichen || null,
      wiegeschein: zustand.rohmaterial.wiegeschein || null,
      gebinde: zustand.bereich === 'abfuellung' ? zustand.gebinde : null,
      gebindeAnzahl: zustand.bereich === 'abfuellung' ? zustand.stueck : null,
      notiz: zustand.notiz || null,
      ersetztBuchungId: zustand.ersetztBuchungId,
      dublettenBestaetigt: zustand.rohmaterial.dublettenBestaetigt,
    }),
    [zustand, tonnen]
  );

  const fehlt = useMemo(() => {
    if (!(tonnen > 0)) {
      return zustand.bereich === 'abfuellung' ? 'Anzahl fehlt' : 'Menge fehlt';
    }
    if (zustand.bereich === 'abfuellung' && !zustand.gebinde) return 'Gebinde wählen';
    if (zustand.bereich !== 'rohmaterial' && !zustand.koernung) return 'Körnung wählen';
    return null;
  }, [tonnen, zustand.bereich, zustand.gebinde, zustand.koernung]);

  const hinweise = useMemo(() => {
    if (fehlt) return [];
    return pruefePlausibilitaet(eingabe, tonnen, {
      bisherigeAmTag: optionen.buchungenAmTag,
      eigeneLetzte: optionen.eigeneLetzte,
      zeigeZahlen: optionen.zeigeZahlen,
      losesMehlVorrat: optionen.losesMehlVorrat,
    });
  }, [eingabe, tonnen, fehlt, optionen]);

  const hatWarnung = hinweise.some((h) => h.stufe === 'warnung');

  const tastenZustand: TastenZustand = ueberschriebenerZustand
    ? ueberschriebenerZustand
    : fehlt
      ? 'gesperrt'
      : hatWarnung
        ? 'warnung'
        : 'bereit';

  const quittung = useMemo(() => {
    if (fehlt) return fehlt;
    const teile: string[] = [];
    teile.push(`${tonnen.toLocaleString('de-DE', { maximumFractionDigits: 3 })} t`);
    if (zustand.bereich === 'rohmaterial') {
      teile.push('Ziegelschutt');
      if (zustand.rohmaterial.lieferant) teile.push(`von ${zustand.rohmaterial.lieferant}`);
    } else {
      teile.push('Ziegelmehl');
      const k = getKoernung(zustand.koernung);
      if (k) teile.push(k.label);
      if (zustand.bereich === 'abfuellung' && ableitung) teile.push(`(${ableitung})`);
    }
    teile.push(
      zustand.datum === heuteDatum()
        ? 'heute'
        : zustand.datum === verschiebeTage(heuteDatum(), -1)
          ? 'gestern'
          : `am ${zustand.datum.split('-').reverse().join('.')}`
    );
    return teile.join(' ');
  }, [fehlt, tonnen, zustand, ableitung]);

  const tastenText = useMemo(() => {
    if (ueberschriebenerZustand === 'speichert') return 'Sendet…';
    if (ueberschriebenerZustand === 'erfolg') return 'Gebucht';
    if (ueberschriebenerZustand === 'vorgemerkt') return 'Auf dem Gerät gemerkt';
    if (ueberschriebenerZustand === 'fehler') return 'Nicht gebucht — nochmal';
    if (fehlt) return fehlt;
    const menge = tonnen.toLocaleString('de-DE', { maximumFractionDigits: 3 });
    return hatWarnung ? `${menge} t — halten zum Buchen` : `${menge} t buchen`;
  }, [ueberschriebenerZustand, fehlt, tonnen, hatWarnung]);

  const merkwerte = useMemo(
    () => geladeneMerkwerte(zustand.bereich),
    [zustand.bereich]
  );

  // ---------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------

  const setzeBereich = useCallback(
    (bereich: ProduktionsBereich) => {
      const v = ladeVorwahl();
      speichereVorwahl({ ...v, bereich });
      setZustand((bisher) => ({
        ...bisher,
        bereich,
        // Eine Zahl wandert NIE über die Stationsgrenze. Mehl in die
        // Schutthalde zu buchen ist der teuerste Fehler dieser Maske.
        mengeText: '',
        mengeRad: 0,
        stueck: 0,
        zifferModus: false,
        ersetztBuchungId: null,
        koernung:
          bereich === 'rohmaterial'
            ? null
            : ((bereich === 'mahlen' ? v.mahlen?.koernung : v.abfuellung?.koernung) as Koernung) ??
              null,
        gebinde: bereich === 'abfuellung' ? ((v.abfuellung?.gebinde as Gebinde) ?? null) : null,
      }));
      setUeberschriebenerZustand(null);
    },
    []
  );

  const setzeKoernung = useCallback(
    (wert: Koernung) => {
      setZustand((bisher) => {
        const v = ladeVorwahl();
        if (bisher.bereich === 'mahlen') {
          speichereVorwahl({ ...v, mahlen: { koernung: wert } });
        } else if (bisher.bereich === 'abfuellung') {
          speichereVorwahl({ ...v, abfuellung: { ...v.abfuellung, koernung: wert } });
        }
        return { ...bisher, koernung: wert };
      });
    },
    []
  );

  const setzeGebinde = useCallback((wert: Gebinde) => {
    const v = ladeVorwahl();
    speichereVorwahl({ ...v, abfuellung: { ...v.abfuellung, gebinde: wert } });
    setZustand((bisher) => ({ ...bisher, gebinde: wert }));
  }, []);

  const setzeRohmaterial = useCallback((werte: RohmaterialWerte) => {
    if (werte.lieferant) {
      const v = ladeVorwahl();
      speichereVorwahl({
        ...v,
        rohmaterial: { lieferant: werte.lieferant, tag: heuteDatum() },
      });
    }
    setZustand((bisher) => ({ ...bisher, rohmaterial: werte }));
  }, []);

  const uebernehmeAus = useCallback((buchung: ProduktionsBuchung) => {
    setZustand((bisher) => ({
      ...bisher,
      bereich: buchung.bereich,
      datum: buchung.datum,
      // Die Menge wird bewusst NICHT übernommen: sie war der Grund für das
      // Storno, und eine vorbelegte falsche Zahl wird bestätigt statt geprüft.
      mengeText: '',
      mengeRad: 0,
      stueck: 0,
      koernung: buchung.koernung ?? null,
      gebinde: buchung.gebinde ?? null,
      rohmaterial: {
        lieferant: buchung.lieferant ?? '',
        wiegeschein: buchung.wiegeschein ?? '',
        kennzeichen: buchung.kennzeichen ?? '',
        dublettenBestaetigt: false,
      },
      notiz: buchung.notiz ?? '',
      ersetztBuchungId: buchung.$id,
      zifferModus: false,
    }));
    setUeberschriebenerZustand(null);
  }, []);

  const baueEingabe = useCallback(
    (): BuchungsEingabe => ({ ...eingabe, clientId: neueClientId() }),
    [eingabe]
  );

  const nachBuchung = useCallback(
    (gebuchteMenge: number) => {
      const bereich = zustand.bereich;
      speichereMerkwert(bereich, bereich === 'abfuellung' ? zustand.stueck : gebuchteMenge);
      setLetzteWerte((bisher) => ({
        ...bisher,
        [bereich]: bereich === 'abfuellung' ? zustand.stueck : gebuchteMenge,
      }));
      setZustand((bisher) => ({
        ...bisher,
        mengeText: '',
        mengeRad: 0,
        stueck: 0,
        ersetztBuchungId: null,
        // Wiegeschein und Kennzeichen sind je Lieferung eindeutig und dürfen
        // niemals stehenbleiben — sonst hängt derselbe Schein an zwei Fuhren.
        rohmaterial: {
          ...bisher.rohmaterial,
          wiegeschein: '',
          kennzeichen: '',
          dublettenBestaetigt: false,
        },
        notiz: '',
      }));
    },
    [zustand.bereich, zustand.stueck]
  );

  // Erfolgs- und Fehlerzustände der Taste laufen nach kurzer Zeit ab.
  useEffect(() => {
    if (ueberschriebenerZustand !== 'erfolg' && ueberschriebenerZustand !== 'vorgemerkt') return;
    const zeit = window.setTimeout(() => setUeberschriebenerZustand(null), 900);
    return () => window.clearTimeout(zeit);
  }, [ueberschriebenerZustand]);

  return {
    zustand,
    tonnen,
    ableitung,
    quittung,
    hinweise,
    fehlt,
    tastenZustand,
    tastenText,
    merkwerte,
    letzterWert: letzteWerte[zustand.bereich] ?? null,

    setzeBereich,
    setzeDatum: (datum) => aendere({ datum }),
    setzeMengeText: (mengeText) => aendere({ mengeText }),
    setzeMengeRad: (mengeRad) => aendere({ mengeRad }),
    setzeStueck: (stueck) => aendere({ stueck }),
    setzeKoernung,
    setzeGebinde,
    setzeRohmaterial,
    setzeNotiz: (notiz) => aendere({ notiz }),
    setzeZifferModus: (zifferModus) => aendere({ zifferModus }),
    uebernehmeAus,
    baueEingabe,
    nachBuchung,
    setzeTastenZustand: setUeberschriebenerZustand,
  };
};

/** Vorrat an losem Mehl der letzten 7 Tage — Grundlage der Abfüll-Warnung. */
export const losesMehlVorrat = (buchungen: ProduktionsBuchung[]): number => {
  const von = verschiebeTage(heuteDatum(), -7);
  const jung = buchungen.filter((b) => !b.storniert && b.datum >= von);
  return (
    summeTonnen(jung.filter((b) => b.bereich === 'mahlen')) -
    summeTonnen(jung.filter((b) => b.bereich === 'abfuellung'))
  );
};
