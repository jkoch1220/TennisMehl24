import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RefreshCw,
  Loader2,
  Map as MapIcon,
  LayoutGrid,
} from 'lucide-react';
import type {
  Tour,
  TourStop,
  Fahrer,
  StopMarkierung,
  TourFahrzeugTyp,
} from '../../../types/tour';
import { STANDARD_KAPAZITAETEN } from '../../../types/tour';
import type { Projekt } from '../../../types/projekt';
import type { SaisonKunde } from '../../../types/saisonplanung';
import { tourenService } from '../../../services/tourenService';
import { fahrerService } from '../../../services/fahrerService';
import { dispoBuchungService, istNichtGefunden } from '../../../services/dispoBuchungService';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  getAktuelleKW,
  getMontagDerKW,
  getWochentage,
  getKWZeitraum,
  verschiebeKW,
  formatKWMitZeitraum,
  istInKW,
} from '../../../utils/kalenderwoche';
import {
  ermittleBuchungslage,
  hatWochenbezug,
  gruppiereNachPlatzbauer,
  gruppiereTourenNachTag,
  berechneMengenbilanz,
  formatTonnen,
  type AuftragImPool,
} from './wochenplanungUtils';
import WochenListe from './WochenListe';
import AuftragsPool from './AuftragsPool';
import MengenBilanz from './MengenBilanz';
import FahrerVerwaltung from './FahrerVerwaltung';
import FarbMenue from './FarbMenue';
import DispoKartenAnsicht from '../DispoKartenAnsicht';

/** Anzahl der Rasterspalten: Montag bis Samstag, wie in der Excel-Vorlage. */
const TAGE_JE_WOCHE = 6;

interface WochenplanungTabProps {
  /** Dispo-relevante Projekte; kommen bereits gefiltert aus DispoPlanung. */
  projekte: Projekt[];
  kundenMap: Map<string, SaisonKunde>;
  /** Öffnet den Auftrag in der bestehenden Detailansicht. */
  onProjektOeffnen?: (projekt: Projekt) => void;
  /** Meldet dem Container, dass sich Touren geändert haben. */
  onTourenGeaendert?: () => void;
}

const WochenplanungTab = ({
  projekte,
  kundenMap,
  onProjektOeffnen,
  onTourenGeaendert,
}: WochenplanungTabProps) => {
  const { isDark } = useTheme();

  const [{ kw, jahr }, setWoche] = useState(getAktuelleKW);
  const [tourenDerWoche, setTourenDerWoche] = useState<Tour[]>([]);
  const [backlog, setBacklog] = useState<Tour[]>([]);
  const [fahrer, setFahrer] = useState<Fahrer[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const [suche, setSuche] = useState('');
  const [nurUnverplant, setNurUnverplant] = useState(true);
  const [ausgewaehlteTourId, setAusgewaehlteTourId] = useState<string | null>(null);
  const [zeigeFahrerVerwaltung, setZeigeFahrerVerwaltung] = useState(false);
  // Raster und Karte teilen sich denselben Platz. Bewusst kein Nebeneinander: jede
  // Karteninstanz startet beim Mounten ein Batch-Geocoding mit Schreibzugriffen auf
  // die Projektdokumente — zwei gleichzeitige Instanzen würden sich ins Gehege kommen.
  const [ansicht, setAnsicht] = useState<'raster' | 'karte'>('raster');

  /** Offenes Farbmenü: auf welcher Ebene und an welcher Stelle. */
  const [farbMenue, setFarbMenue] = useState<{
    ebene: 'stop' | 'tour' | 'tag';
    tourId?: string;
    projektId?: string;
    datum?: string;
    titel: string;
    aktuell?: StopMarkierung | null;
    position: { x: number; y: number };
  } | null>(null);
  const [aktivesElement, setAktivesElement] = useState<
    { typ: 'auftrag'; auftrag: AuftragImPool } | { typ: 'tour'; tour: Tour } | null
  >(null);

  const tage = useMemo(
    () => getWochentage(getMontagDerKW(kw, jahr), TAGE_JE_WOCHE),
    [kw, jahr]
  );

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const { von, bis } = getKWZeitraum(kw, jahr, TAGE_JE_WOCHE);
      const [wochenTouren, ohneDatum, alleFahrer] = await Promise.all([
        tourenService.loadTourenFuerZeitraum(von, bis),
        tourenService.loadTourenOhneDatum(),
        fahrerService.loadFahrer(),
      ]);
      setTourenDerWoche(wochenTouren);
      setBacklog(ohneDatum);
      setFahrer(alleFahrer);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Wochendaten konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, [kw, jahr]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Alle Touren, gegen die Buchungen gerechnet werden — Woche und Backlog zusammen.
  const alleTouren = useMemo(
    () => [...tourenDerWoche, ...backlog],
    [tourenDerWoche, backlog]
  );

  /** Auflösung Platzbauer-Id -> Name über die Saisonkunden. */
  const platzbauerNamen = useMemo(() => {
    const namen = new Map<string, string>();
    for (const projekt of projekte) {
      if (projekt.platzbauerId && !namen.has(projekt.platzbauerId)) {
        const kunde = kundenMap.get(projekt.platzbauerId);
        if (kunde?.name) namen.set(projekt.platzbauerId, kunde.name);
      }
    }
    return namen;
  }, [projekte, kundenMap]);

  const fahrerNamen = useMemo(
    () => new Map(fahrer.map((f) => [f.id, f.name])),
    [fahrer]
  );

  /** Aufträge dieser Kalenderwoche mit ihrer Buchungslage. */
  const wochenAuftraege = useMemo(() => {
    const inWoche = projekte.filter((projekt) => {
      // Primär die aus der AB übernommene Liefer-KW, ersatzweise das intern
      // gesetzte Plandatum. lieferKWJahr ist im Bestand nirgends belegt, daher
      // wird das Saisonjahr als Jahresbezug herangezogen.
      if (projekt.lieferKW !== undefined && projekt.lieferKW !== null) {
        const jahrDesAuftrags = projekt.lieferKWJahr ?? projekt.saisonjahr;
        return (
          projekt.lieferKW === kw && (jahrDesAuftrags === undefined || jahrDesAuftrags === jahr)
        );
      }
      return istInKW(projekt.geplantesDatum, kw, jahr);
    });
    return inWoche.map((projekt) => ermittleBuchungslage(projekt, alleTouren));
  }, [projekte, kw, jahr, alleTouren]);

  /**
   * Aufträge ohne jeden Wochenbezug. Sie erscheinen in jeder Woche im Pool, denn
   * sie müssen erst terminiert werden — im Bestand betrifft das den Großteil der
   * offenen Aufträge. Die Excel-Vorlage führte dafür den Abschnitt „Ohne KW".
   */
  const auftraegeOhneWoche = useMemo(
    () =>
      projekte
        .filter((p) => !hatWochenbezug(p))
        .map((p) => ermittleBuchungslage(p, alleTouren)),
    [projekte, alleTouren]
  );

  /** Zusätzlich: Aufträge, die in dieser Woche verplant sind, aber eine andere KW tragen. */
  const verplanteFremdauftraege = useMemo(() => {
    const bereits = new Set(wochenAuftraege.map((a) => a.projektId));
    const inTouren = new Set(tourenDerWoche.flatMap((t) => t.stops.map((s) => s.projektId)));
    return projekte
      .filter((p) => {
        const id = (p as unknown as { $id?: string }).$id || p.id;
        return inTouren.has(id) && !bereits.has(id);
      })
      .map((p) => ermittleBuchungslage(p, alleTouren));
  }, [projekte, wochenAuftraege, tourenDerWoche, alleTouren]);

  const filtern = useCallback(
    (liste: AuftragImPool[]) => {
      const suchbegriff = suche.trim().toLowerCase();
      return liste.filter((auftrag) => {
        if (nurUnverplant && auftrag.istVollstaendigGebucht) return false;
        if (!suchbegriff) return true;
        const plz = auftrag.projekt.lieferadresse?.plz || auftrag.projekt.kundenPlzOrt || '';
        return (
          (auftrag.projekt.kundenname || '').toLowerCase().includes(suchbegriff) ||
          plz.toLowerCase().includes(suchbegriff)
        );
      });
    },
    [nurUnverplant, suche]
  );

  const poolGruppen = useMemo(
    () => gruppiereNachPlatzbauer(filtern(wochenAuftraege), platzbauerNamen),
    [wochenAuftraege, filtern, platzbauerNamen]
  );

  const poolGruppenOhneWoche = useMemo(
    () => gruppiereNachPlatzbauer(filtern(auftraegeOhneWoche), platzbauerNamen),
    [auftraegeOhneWoche, filtern, platzbauerNamen]
  );

  /** Projekte der Woche für die Kartenansicht — Pool-Aufträge und bereits verplante. */
  const wochenProjekte = useMemo(
    () => [...wochenAuftraege, ...verplanteFremdauftraege].map((a) => a.projekt),
    [wochenAuftraege, verplanteFremdauftraege]
  );

  const tourenJeTag = useMemo(() => gruppiereTourenNachTag(tourenDerWoche), [tourenDerWoche]);

  /** Fahrernamen als Vorschlagsliste — nicht bindend, nur Tipphilfe. */
  const fahrerVorschlaege = useMemo(() => {
    const namen = new Set(fahrer.filter((f) => f.aktiv).map((f) => f.name));
    // Auch Namen, die schon frei getippt wurden, wieder anbieten.
    for (const tour of [...tourenDerWoche, ...backlog]) {
      if (tour.fahrerName) namen.add(tour.fahrerName);
    }
    return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
  }, [fahrer, tourenDerWoche, backlog]);

  /** projektId -> Platzbauer-Name, für die rechte Spalte der Stopp-Zeilen. */
  const platzbauerJeProjekt = useMemo(() => {
    const zuordnung = new Map<string, string>();
    for (const p of projekte) {
      const id = (p as unknown as { $id?: string }).$id || p.id;
      if (p.platzbauerId) {
        const name = platzbauerNamen.get(p.platzbauerId);
        if (name) zuordnung.set(id, name);
      }
    }
    return zuordnung;
  }, [projekte, platzbauerNamen]);

  const bilanz = useMemo(
    () =>
      berechneMengenbilanz(
        tourenDerWoche,
        [...wochenAuftraege, ...verplanteFremdauftraege],
        tage,
        fahrerNamen,
        platzbauerNamen,
        auftraegeOhneWoche
      ),
    [
      tourenDerWoche,
      wochenAuftraege,
      verplanteFremdauftraege,
      tage,
      fahrerNamen,
      platzbauerNamen,
      auftraegeOhneWoche,
    ]
  );

  // === Schreiboperationen ===

  /** Übernimmt eine geänderte Tourenliste in Woche und Backlog. */
  const uebernehmeTouren = useCallback((touren: Tour[]) => {
    setTourenDerWoche(touren.filter((t) => t.datum));
    setBacklog(touren.filter((t) => !t.datum));
    onTourenGeaendert?.();
  }, [onTourenGeaendert]);

  const meldeFehler = (e: unknown, fallback: string) => {
    // Wurde die Tour zwischenzeitlich anderswo gelöscht, ist der lokale Zustand
    // veraltet — dann hilft kein Zurückrollen, sondern nur neu laden.
    if (istNichtGefunden(e)) {
      // Erst neu laden, dann melden: laden() setzt den Fehlerhinweis zurück und
      // würde die Meldung sonst sofort wieder verschlucken.
      void laden().then(() =>
        setFehler(
          'Diese Tour gibt es nicht mehr — sie wurde an anderer Stelle gelöscht. Die Ansicht ist jetzt aktuell.'
        )
      );
      return;
    }
    console.error(fallback, e);
    setFehler(e instanceof Error ? e.message : fallback);
  };

  /**
   * Menge, mit der ein Auftrag auf eine Tour gebucht wird.
   *
   * Gibt null zurück, wenn nichts mehr offen ist — sonst würde ein bereits
   * vollständig verplanter Auftrag beim erneuten Ziehen ein zweites Mal mit
   * seiner vollen Menge gebucht und die Wochenbilanz stillschweigend verdoppelt.
   * Aufträge ohne erfasste Menge dürfen mit 0 t gebucht werden; die Tonnage
   * lässt sich danach direkt in der Zeile eintragen.
   */
  const ermittleBuchungsmenge = (auftrag: AuftragImPool): number | null => {
    if (auftrag.offeneTonnen > 0) return auftrag.offeneTonnen;
    if (auftrag.gesamtMenge === 0) return 0;
    setFehler(
      `„${auftrag.projekt.kundenname}" ist mit ${formatTonnen(auftrag.gesamtMenge)} bereits vollständig verplant. Menge in der bestehenden Zeile anpassen oder die Buchung dort entfernen.`
    );
    return null;
  };

  /** Legt eine neue Tour an — optional mit einem ersten Auftrag. */
  const legeTourAn = useCallback(
    async (datum: string, auftrag?: AuftragImPool) => {
      // Menge zuerst prüfen: wird die Buchung abgelehnt, soll auch keine leere
      // Tour zurückbleiben.
      const menge = auftrag ? ermittleBuchungsmenge(auftrag) : null;
      if (auftrag && menge === null) return;

      // LKW-Typ aus der Belieferungsart des ersten Auftrags vorbelegen; der
      // Disponent kann ihn in der Kopfzeile jederzeit umstellen.
      const belieferung = auftrag?.projekt.belieferungsart;
      const lkwTyp: TourFahrzeugTyp =
        belieferung === 'nur_motorwagen'
          ? 'motorwagen'
          : belieferung === 'palette_mit_ladekran' || belieferung === 'bigbag'
            ? 'spedition'
            : 'mit_haenger';

      const kapazitaet = {
        motorwagenTonnen: STANDARD_KAPAZITAETEN.motorwagen,
        haengerTonnen: lkwTyp === 'mit_haenger' ? STANDARD_KAPAZITAETEN.haenger : undefined,
        gesamtTonnen:
          lkwTyp === 'mit_haenger'
            ? STANDARD_KAPAZITAETEN.motorwagen + STANDARD_KAPAZITAETEN.haenger
            : lkwTyp === 'spedition'
              ? STANDARD_KAPAZITAETEN.spedition
              : STANDARD_KAPAZITAETEN.motorwagen,
      };

      // Der Name ist nur eine interne Bezeichnung — angezeigt wird der Fahrer,
      // den die Disponentin selbst einträgt.
      const amTag = [...tourenDerWoche, ...backlog].filter(
        (t) => (t.datum || '') === datum
      ).length;
      const name = `Tour ${amTag + 1}`;

      const neueTour = await tourenService.createTour({
        datum,
        name,
        fahrzeugId: '',
        lkwTyp,
        kapazitaet,
        stops: [],
        routeDetails: tourenService.getLeereRouteDetails(),
        optimierung: tourenService.getLeereOptimierung(),
        status: 'entwurf',
      });

      if (!auftrag || menge === null) {
        uebernehmeTouren([...tourenDerWoche, ...backlog, neueTour]);
        return;
      }

      const ergebnis = await dispoBuchungService.buche({
        projekt: auftrag.projekt,
        touren: [...tourenDerWoche, ...backlog, neueTour],
        zuTourId: neueTour.id,
        tonnen: menge,
      });
      uebernehmeTouren(ergebnis.touren);
      if (!ergebnis.statusGeschrieben) {
        setFehler(
          `Die Buchung wurde gespeichert, der Dispo-Status von „${auftrag.projekt.kundenname}" aber nicht (Datensatz zu groß).`
        );
      }
    },
    [tourenDerWoche, backlog, uebernehmeTouren]
  );

  const handleNeueTour = async (datum: string) => {
    setArbeitet(true);
    try {
      await legeTourAn(datum);
    } catch (e) {
      meldeFehler(e, 'Die Tour konnte nicht angelegt werden.');
    } finally {
      setArbeitet(false);
    }
  };

  /** Kopfdaten einer Tour ändern (Fahrer, LKW-Typ, km, Notiz). */
  const handleTourAendern = async (
    tourId: string,
    aenderung: {
      fahrerName?: string;
      lkwTyp?: TourFahrzeugTyp;
      kilometer?: number;
      notiz?: string;
    }
  ) => {
    const vorher = alleTouren;
    try {
      // Beim Wechsel des LKW-Typs die Kapazität mitziehen, sonst stimmt der Balken nicht.
      const kapazitaet =
        aenderung.lkwTyp === undefined
          ? undefined
          : {
              motorwagenTonnen: STANDARD_KAPAZITAETEN.motorwagen,
              haengerTonnen:
                aenderung.lkwTyp === 'mit_haenger' ? STANDARD_KAPAZITAETEN.haenger : undefined,
              gesamtTonnen:
                aenderung.lkwTyp === 'mit_haenger'
                  ? STANDARD_KAPAZITAETEN.motorwagen + STANDARD_KAPAZITAETEN.haenger
                  : aenderung.lkwTyp === 'spedition'
                    ? STANDARD_KAPAZITAETEN.spedition
                    : STANDARD_KAPAZITAETEN.motorwagen,
            };

      const touren = await dispoBuchungService.aktualisiereTour({
        tourId,
        ...aenderung,
        ...(kapazitaet ? { kapazitaet } : {}),
        touren: vorher,
      });
      uebernehmeTouren(touren);
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Änderung konnte nicht gespeichert werden.');
    }
  };

  /** Menge eines Stopps anpassen. */
  const handleStopTonnen = async (tourId: string, projektId: string, tonnen: number) => {
    const vorher = alleTouren;
    try {
      const touren = await dispoBuchungService.aktualisiereStop({
        tourId,
        projektId,
        tonnen,
        touren: vorher,
      });
      uebernehmeTouren(touren);
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Menge konnte nicht gespeichert werden.');
    }
  };

  /** Notiz eines Stopps anpassen. */
  const handleStopNotiz = async (tourId: string, projektId: string, notiz: string) => {
    const vorher = alleTouren;
    try {
      const touren = await dispoBuchungService.aktualisiereStop({
        tourId,
        projektId,
        notiz,
        touren: vorher,
      });
      uebernehmeTouren(touren);
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Notiz konnte nicht gespeichert werden.');
    }
  };

  // === Färben ===

  const oeffneStopFarbMenue = (
    tourId: string,
    projektId: string,
    position: { x: number; y: number }
  ) => {
    const stop = alleTouren.find((t) => t.id === tourId)?.stops.find((s) => s.projektId === projektId);
    setFarbMenue({
      ebene: 'stop',
      tourId,
      projektId,
      titel: stop?.kundenname ?? 'Stopp',
      aktuell: stop?.markierung ?? null,
      position,
    });
  };

  const oeffneTourFarbMenue = (tourId: string, position: { x: number; y: number }) => {
    const tour = alleTouren.find((t) => t.id === tourId);
    const anzahl = tour?.stops.length ?? 0;
    // Wenn alle Stopps dieselbe Farbe tragen, wird sie im Menü hervorgehoben.
    const farben = new Set((tour?.stops ?? []).map((s) => s.markierung ?? null));
    setFarbMenue({
      ebene: 'tour',
      tourId,
      titel: `${tour?.fahrerName || 'Tour'} · ${anzahl} ${anzahl === 1 ? 'Stopp' : 'Stopps'}`,
      aktuell: farben.size === 1 ? [...farben][0] : null,
      position,
    });
  };

  const oeffneTagFarbMenue = (datum: string, position: { x: number; y: number }) => {
    const touren = alleTouren.filter((t) => (t.datum || '') === datum);
    const anzahl = touren.reduce((s, t) => s + t.stops.length, 0);
    const farben = new Set(touren.flatMap((t) => t.stops.map((s) => s.markierung ?? null)));
    setFarbMenue({
      ebene: 'tag',
      datum,
      titel: `Ganzer Tag · ${anzahl} ${anzahl === 1 ? 'Stopp' : 'Stopps'}`,
      aktuell: farben.size === 1 ? [...farben][0] : null,
      position,
    });
  };

  /** Wendet die gewählte Farbe auf der jeweiligen Ebene an — optimistisch. */
  const handleFarbeWaehlen = async (markierung: StopMarkierung | null) => {
    if (!farbMenue) return;
    const vorher = alleTouren;
    const { ebene, tourId, projektId, datum } = farbMenue;

    // Sofort einfärben, damit sich das Klicken unmittelbar anfühlt.
    const faerbe = (stop: TourStop): TourStop =>
      markierung === null ? { ...stop, markierung: undefined } : { ...stop, markierung };

    uebernehmeTouren(
      vorher.map((t) => {
        const betrifft =
          ebene === 'tag'
            ? (t.datum || '') === datum
            : t.id === tourId;
        if (!betrifft) return t;
        return {
          ...t,
          stops: t.stops.map((s) =>
            ebene === 'stop' && s.projektId !== projektId ? s : faerbe(s)
          ),
        };
      })
    );

    try {
      let touren: Tour[];
      if (ebene === 'stop') {
        touren = await dispoBuchungService.setzeMarkierung({
          tourId: tourId!,
          projektId: projektId!,
          markierung,
          touren: vorher,
        });
      } else if (ebene === 'tour') {
        touren = await dispoBuchungService.setzeMarkierungFuerTour({
          tourId: tourId!,
          markierung,
          touren: vorher,
        });
      } else {
        touren = await dispoBuchungService.setzeMarkierungFuerTag({
          datum: datum!,
          markierung,
          touren: vorher,
        });
      }
      uebernehmeTouren(touren);
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Farbe konnte nicht gespeichert werden.');
    }
  };

  /** Ganze Tour löschen; die Aufträge fallen in den Pool zurück. */
  const handleTourLoeschen = async (tourId: string) => {
    const tour = alleTouren.find((t) => t.id === tourId);
    const anzahl = tour?.stops.length ?? 0;
    if (
      anzahl > 0 &&
      !confirm(
        `Tour mit ${anzahl} ${anzahl === 1 ? 'Stopp' : 'Stopps'} löschen?\n\nDie Aufträge gehen zurück in den Pool.`
      )
    ) {
      return;
    }
    const vorher = alleTouren;
    setArbeitet(true);
    try {
      const touren = await dispoBuchungService.loescheTour({ tourId, touren: vorher });
      uebernehmeTouren(touren);
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Tour konnte nicht gelöscht werden.');
    } finally {
      setArbeitet(false);
    }
  };

  const handleStopEntfernen = async (tourId: string, projektId: string) => {
    const vorher = alleTouren;
    setArbeitet(true);
    try {
      const ergebnis = await dispoBuchungService.entferneBuchung({
        projektId,
        tourId,
        touren: vorher,
      });
      uebernehmeTouren(ergebnis.touren);
      if (!ergebnis.statusGeschrieben) {
        setFehler(
          'Der Stopp wurde entfernt, der Dispo-Status des Auftrags aber nicht gespeichert (Datensatz zu groß).'
        );
      }
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Der Stopp konnte nicht entfernt werden.');
    } finally {
      setArbeitet(false);
    }
  };

  // === Drag and Drop ===

  const sensoren = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const daten = event.active.data.current;
    if (daten?.type === 'auftrag') {
      setAktivesElement({ typ: 'auftrag', auftrag: daten.auftrag as AuftragImPool });
    } else if (daten?.type === 'tour') {
      setAktivesElement({ typ: 'tour', tour: daten.tour as Tour });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setAktivesElement(null);
    const { active, over } = event;
    if (!over) return;

    const quelle = active.data.current;
    const ziel = over.data.current;
    if (!quelle || !ziel) return;

    const vorher = alleTouren;
    setArbeitet(true);
    setFehler(null);

    try {
      // Stopp innerhalb seiner Tour umsortieren.
      if (quelle.type === 'stop' && ziel.type === 'stop' && quelle.tourId === ziel.tourId) {
        const tour = vorher.find((t) => t.id === quelle.tourId);
        if (!tour) return;
        const reihenfolge = tour.stops.map((s) => s.projektId);
        const von = reihenfolge.indexOf(quelle.projektId as string);
        const nach = reihenfolge.indexOf(ziel.projektId as string);
        if (von === -1 || nach === -1 || von === nach) return;
        reihenfolge.splice(nach, 0, ...reihenfolge.splice(von, 1));

        // Optimistisch anzeigen, damit die Reihenfolge sofort steht.
        uebernehmeTouren(
          vorher.map((t) =>
            t.id !== tour.id
              ? t
              : {
                  ...t,
                  stops: reihenfolge
                    .map((id, i) => {
                      const s = t.stops.find((x) => x.projektId === id);
                      return s ? { ...s, position: i + 1 } : null;
                    })
                    .filter((s): s is NonNullable<typeof s> => s !== null),
                }
          )
        );
        const touren = await dispoBuchungService.sortiereStops({
          tourId: tour.id,
          projektIdReihenfolge: reihenfolge,
          touren: vorher,
        });
        uebernehmeTouren(touren);
        return;
      }

      // Stopp auf eine andere Tour ziehen: umbuchen.
      if (
        quelle.type === 'stop' &&
        (ziel.type === 'tourziel' || ziel.type === 'stop') &&
        quelle.tourId !== (ziel.type === 'stop' ? ziel.tourId : (ziel.tour as Tour).id)
      ) {
        const zielTourId = ziel.type === 'stop' ? (ziel.tourId as string) : (ziel.tour as Tour).id;
        const projektId = quelle.projektId as string;
        const projekt = projekte.find(
          (p) => ((p as unknown as { $id?: string }).$id || p.id) === projektId
        );
        if (!projekt) return;
        const stop = quelle.stop as { tonnen: number };

        const ergebnis = await dispoBuchungService.buche({
          projekt,
          touren: vorher,
          vonTourId: quelle.tourId as string,
          zuTourId: zielTourId,
          tonnen: stop.tonnen,
        });
        uebernehmeTouren(ergebnis.touren);
        return;
      }

      // Auftrag aus dem Pool auf eine bestehende Tour ziehen.
      // Auch dann, wenn er auf einem ihrer Stopps landet — die Stopp-Zeilen bedecken
      // den größten Teil der Karte, und der Nutzer meint offensichtlich die Tour.
      if (quelle.type === 'auftrag' && (ziel.type === 'tourziel' || ziel.type === 'stop')) {
        const auftrag = quelle.auftrag as AuftragImPool;
        const zielTourId =
          ziel.type === 'stop' ? (ziel.tourId as string) : (ziel.tour as Tour).id;
        const menge = ermittleBuchungsmenge(auftrag);
        if (menge === null) return;
        const ergebnis = await dispoBuchungService.buche({
          projekt: auftrag.projekt,
          touren: vorher,
          zuTourId: zielTourId,
          tonnen: menge,
        });
        uebernehmeTouren(ergebnis.touren);
        if (!ergebnis.statusGeschrieben) {
          setFehler(
            `Die Buchung wurde gespeichert, der Dispo-Status von „${auftrag.projekt.kundenname}" aber nicht (Datensatz zu groß).`
          );
        }
        return;
      }

      // Auftrag aus dem Pool auf einen Tag ziehen: neue Tour an diesem Tag.
      if (quelle.type === 'auftrag' && ziel.type === 'tag') {
        await legeTourAn(ziel.datum as string, quelle.auftrag as AuftragImPool);
        return;
      }

      // Ganze Tour auf einen anderen Tag ziehen.
      if (quelle.type === 'tour' && (ziel.type === 'tag' || ziel.type === 'tourziel')) {
        const tour = quelle.tour as Tour;
        const zielDatum =
          ziel.type === 'tag' ? (ziel.datum as string) : (ziel.tour as Tour).datum;
        if ((tour.datum || '') === zielDatum) return;

        const touren = await dispoBuchungService.verschiebeTour({
          tourId: tour.id,
          datum: zielDatum,
          // Fahrer bleibt an der Tour — er hängt nicht am Tag.
          fahrerId: tour.fahrerId ?? '',
          fahrerName: tour.fahrerName ?? '',
          touren: vorher,
        });
        uebernehmeTouren(touren);
      }
    } catch (e) {
      uebernehmeTouren(vorher);
      meldeFehler(e, 'Die Änderung konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(false);
    }
  };

  // === Darstellung ===

  const heuteKW = getAktuelleKW();
  const istAktuelleWoche = kw === heuteKW.kw && jahr === heuteKW.jahr;

  return (
    <DndContext
      sensors={sensoren}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setAktivesElement(null)}
    >
      <div className="space-y-3">
        {/* Kopfzeile mit Wochennavigation */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWoche(verschiebeKW(kw, jahr, -1))}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
              title="Vorige Woche"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-3 py-1.5 min-w-[230px] text-center">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {formatKWMitZeitraum(kw, jahr, TAGE_JE_WOCHE)}
              </div>
            </div>

            <button
              onClick={() => setWoche(verschiebeKW(kw, jahr, 1))}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
              title="Nächste Woche"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {!istAktuelleWoche && (
              <button
                onClick={() => setWoche(getAktuelleKW())}
                className="ml-1 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Aktuelle Woche
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {arbeitet && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Speichert…
              </span>
            )}

            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setAnsicht('raster')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  ansicht === 'raster'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Raster
              </button>
              <button
                onClick={() => setAnsicht('karte')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  ansicht === 'karte'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Karte
              </button>
            </div>

            <span className="text-xs text-gray-500 dark:text-gray-400">
              {tourenDerWoche.length} Touren · {formatTonnen(bilanz.geplant)} verplant
            </span>
            <button
              onClick={() => void laden()}
              disabled={laedt}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
              title="Neu laden"
            >
              <RefreshCw className={`w-4 h-4 ${laedt ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {fehler && (
          <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
            <span>{fehler}</span>
            <button onClick={() => setFehler(null)} className="shrink-0 font-medium">
              Schließen
            </button>
          </div>
        )}

        {/* Dreispaltiges Layout: Pool, Raster, Bilanz */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          <div className="xl:col-span-3 h-[calc(100vh-260px)] min-h-[420px]">
            <AuftragsPool
              gruppen={poolGruppen}
              gruppenOhneWoche={poolGruppenOhneWoche}
              suche={suche}
              onSucheChange={setSuche}
              nurUnverplant={nurUnverplant}
              onNurUnverplantChange={setNurUnverplant}
              anzahlGesamt={wochenAuftraege.length + auftraegeOhneWoche.length}
              onAuftragOeffnen={(auftrag) => onProjektOeffnen?.(auftrag.projekt)}
            />
          </div>

          <div
            className={`xl:col-span-7 h-[calc(100vh-260px)] min-h-[420px] border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/30 ${
              ansicht === 'karte' ? 'overflow-hidden' : 'overflow-y-auto'
            }`}
          >
            {laedt ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Lädt Wochendaten…
              </div>
            ) : ansicht === 'karte' ? (
              <DispoKartenAnsicht
                projekte={wochenProjekte}
                kundenMap={kundenMap}
                touren={tourenDerWoche}
                selectedTourId={ausgewaehlteTourId}
                onSelectTour={setAusgewaehlteTourId}
                tourenAnfangsAnzeigen
                onProjektClick={(projekt) => onProjektOeffnen?.(projekt)}
              />
            ) : (
              <WochenListe
                tage={tage}
                tourenJeTag={tourenJeTag}
                backlog={backlog}
                dunkel={isDark}
                fahrerVorschlaege={fahrerVorschlaege}
                platzbauerJeProjekt={platzbauerJeProjekt}
                onNeueTour={handleNeueTour}
                onTourAendern={handleTourAendern}
                onTourLoeschen={handleTourLoeschen}
                onStopTonnen={handleStopTonnen}
                onStopNotiz={handleStopNotiz}
                onStopFarbMenue={oeffneStopFarbMenue}
                onTourFarbMenue={oeffneTourFarbMenue}
                onTagFarbMenue={oeffneTagFarbMenue}
                onStopEntfernen={handleStopEntfernen}
              />
            )}
          </div>

          <div className="xl:col-span-2 h-[calc(100vh-260px)] min-h-[420px]">
            <MengenBilanz bilanz={bilanz} tage={tage} />
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {aktivesElement?.typ === 'auftrag' && (
          <div className="px-2 py-1.5 rounded-lg border-2 border-blue-500 bg-white dark:bg-slate-800 shadow-xl">
            <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">
              {aktivesElement.auftrag.projekt.kundenname}
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {formatTonnen(
                aktivesElement.auftrag.offeneTonnen > 0
                  ? aktivesElement.auftrag.offeneTonnen
                  : aktivesElement.auftrag.gesamtMenge
              )}
            </span>
          </div>
        )}
        {aktivesElement?.typ === 'tour' && (
          <div className="px-2 py-1.5 rounded-lg border-2 border-blue-500 bg-white dark:bg-slate-800 shadow-xl">
            <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">
              {aktivesElement.tour.name}
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {aktivesElement.tour.stops.length} Stopps
            </span>
          </div>
        )}
      </DragOverlay>

      {farbMenue && (
        <FarbMenue
          position={farbMenue.position}
          titel={farbMenue.titel}
          aktuell={farbMenue.aktuell}
          dunkel={isDark}
          onWaehlen={(m) => void handleFarbeWaehlen(m)}
          onSchliessen={() => setFarbMenue(null)}
        />
      )}

      <FahrerVerwaltung
        open={zeigeFahrerVerwaltung}
        onClose={() => setZeigeFahrerVerwaltung(false)}
        onFahrerGeaendert={() => void laden()}
      />
    </DndContext>
  );
};

export default WochenplanungTab;
