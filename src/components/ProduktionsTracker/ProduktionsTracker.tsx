import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Factory, Loader2, Plus, Sun, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCan } from '../../hooks/useCan';
import { useIstMobil } from '../../hooks/useIstMobil';
import type { ProduktionsBuchung } from '../../types/produktion';
import { getBereich } from '../../types/produktion';
import { storniereBuchung } from '../../services/produktionService';
import { auditService } from '../../services/auditService';

import { useProduktionsDaten } from './useProduktionsDaten';
import { losesMehlVorrat, useErfassung } from './useErfassung';
import { useWarteschlange } from './useWarteschlange';
import {
  FOKUS,
  ladeSonnenmodus,
  PANEL_LABEL,
  speichereSonnenmodus,
  STATION,
} from './produktionUi';
import { istTonAn, melde, schliesseAudio, setTonAn, weckeAudio } from './feedback';
import { formatTonnen, heuteDatum, summe } from './statistik';

import BereichsLeiste from './BereichsLeiste';
import WertAnzeige from './WertAnzeige';
import ErfassungsBlock from './ErfassungsBlock';
import BuchenTaste, { darfSofortBuchen } from './BuchenTaste';
import MelderZeile from './MelderZeile';
import DatumWahl from './DatumWahl';
import TagesJournal from './TagesJournal';
import StornoSheet from './StornoSheet';
import LeitungsPanel from './LeitungsPanel';

/**
 * Produktionserfassung — Rohmaterial, Mahlen, Abfüllung.
 * ============================================================================
 *
 * Leitidee: das Tool ist kein Formular, sondern ein Wägeterminal. In allen drei
 * Bereichen steht EINE maßgebliche Zahl an derselben Stelle, in derselben
 * Größe, mit fester Einheit — und ein Materialstreifen in Stationsfarbe sagt
 * aus zwei Metern Entfernung, in welchen Bestand gerade gebucht wird.
 *
 * Rechte-Staffelung (Schlüssel in constants/sensitiveFields.ts):
 *   auswertung       → Charts, Trends, Kennzahlen, Prognose
 *   lagerbestand     → Bestände, Materialbilanz, Bestandsabgleich
 *   fremde-buchungen → Belege anderer Mitarbeiter
 *
 * Die Grenze läuft zwischen BELEG und DEUTUNG. „Was habe ich heute gebucht" ist
 * kein Report, sondern die Voraussetzung dafür, nicht doppelt zu buchen — die
 * eigenen Belege samt Zwischensumme sieht deshalb jeder Erfasser. Zeitreihen,
 * Vergleiche, Bestände und Ausbeute sind Deutung und bleiben der Leitung
 * vorbehalten.
 *
 * Was hier bewusst NICHT passiert (siehe auch die Kommentare in den
 * Unterkomponenten): kein Eingriff in `document.body` für den Vollbildmodus,
 * kein Wischen zwischen Bereichen, keine blockierende Quittung, keine
 * Zählanimation der Ergebniszahl, kein „Bearbeiten" einer Buchung.
 */

const ProduktionsTracker: React.FC = () => {
  const { user } = useAuth();
  const { can, isFieldHidden } = useCan();
  const istMobil = useIstMobil();

  const zeigeAuswertung = !isFieldHidden('produktion', 'auswertung');
  const zeigeBestand = !isFieldHidden('produktion', 'lagerbestand');
  const zeigeFremde = !isFieldHidden('produktion', 'fremde-buchungen');
  const darfErfassen = can('produktion', 'create');
  const darfStornieren = can('produktion', 'delete');
  const darfExportieren = can('produktion', 'export');

  const daten = useProduktionsDaten(user);
  const warteschlange = useWarteschlange(user, daten.neuLaden);

  const [reiter, setReiter] = useState<'erfassung' | 'auswertung'>('erfassung');
  const [datumOffen, setDatumOffen] = useState(false);
  const [journalOffen, setJournalOffen] = useState(false);
  const [stornoZiel, setStornoZiel] = useState<ProduktionsBuchung | null>(null);
  const [stornoLaeuft, setStornoLaeuft] = useState(false);
  const [sonne, setSonne] = useState(ladeSonnenmodus);
  const [ton, setTon] = useState(istTonAn);
  const [verworfen, setVerworfen] = useState(false);

  /**
   * Re-Entrancy-Sperre. Ohne sie erzeugt ein zweiter Tipp auf die Buchen-Taste,
   * während der erste noch fliegt, eine zweite Buchung — der `disabled`-Zustand
   * greift erst nach dem nächsten Render.
   */
  const buchtGerade = useRef(false);

  /**
   * Verfügbare Resthöhe der Erfassung am Gerät.
   *
   * `h-[100dvh]` allein reicht nicht: die Route liegt im Portal-Rahmen, und der
   * Kopf der Anwendung steht darüber — der Container ragte damit genau um diese
   * Kopfhöhe aus dem Bild, und die Buchen-Taste lag unerreichbar darunter.
   * Dieselbe Lage entsteht auf der öffentlichen Erfassungsseite, die einen
   * eigenen Kopf mitbringt.
   *
   * Der Vorgänger löste das mit `position: fixed` am `document.body` — und
   * verlor dabei die Scrollposition, sperrte Toasts aus und machte auf der
   * öffentlichen Seite den Abmelden-Knopf unerreichbar. Hier wird stattdessen
   * schlicht gemessen, was tatsächlich übrig ist.
   */
  const rahmenRef = useRef<HTMLDivElement>(null);
  const [restHoehe, setRestHoehe] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!istMobil) {
      setRestHoehe(null);
      return;
    }
    const messen = () => {
      const oben = rahmenRef.current?.getBoundingClientRect().top ?? 0;
      // visualViewport kennt die eingeblendete Bildschirmtastatur; ohne sie
      // rechnet iOS mit der vollen Höhe weiter.
      const sichtbar = window.visualViewport?.height ?? window.innerHeight;
      setRestHoehe(Math.max(320, Math.round(sichtbar - oben)));
    };
    messen();
    window.addEventListener('resize', messen);
    window.addEventListener('orientationchange', messen);
    window.visualViewport?.addEventListener('resize', messen);
    return () => {
      window.removeEventListener('resize', messen);
      window.removeEventListener('orientationchange', messen);
      window.visualViewport?.removeEventListener('resize', messen);
    };
  }, [istMobil]);

  const erfassung = useErfassung({
    buchungenAmTag: useMemo(
      () => daten.buchungen.filter((b) => !b.storniert),
      [daten.buchungen]
    ),
    eigeneLetzte: daten.eigene,
    zeigeZahlen: zeigeAuswertung,
    losesMehlVorrat: useMemo(() => losesMehlVorrat(daten.buchungen), [daten.buchungen]),
  });

  const { zustand } = erfassung;
  const stil = STATION[zustand.bereich];
  const istNachtrag = zustand.datum !== heuteDatum();

  // AudioContext bei der ersten echten Geste wecken — sonst verschluckt der
  // Browser ausgerechnet den ersten, wichtigsten Ton.
  useEffect(() => {
    const wecke = () => weckeAudio();
    window.addEventListener('pointerdown', wecke, { once: true });
    window.addEventListener('keydown', wecke, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wecke);
      window.removeEventListener('keydown', wecke);
      schliesseAudio();
    };
  }, []);

  useEffect(() => {
    speichereSonnenmodus(sonne);
  }, [sonne]);

  const eigeneHeute = useMemo(
    () => daten.eigene.filter((b) => b.datum === heuteDatum() && !b.storniert),
    [daten.eigene]
  );

  const tagesSummen = useMemo(() => {
    if (!zeigeFremde) return null;
    const heute = daten.buchungen.filter((b) => b.datum === heuteDatum() && !b.storniert);
    return {
      rohmaterial: summe(heute.filter((b) => b.bereich === 'rohmaterial')),
      mahlen: summe(heute.filter((b) => b.bereich === 'mahlen')),
      abfuellung: summe(heute.filter((b) => b.bereich === 'abfuellung')),
    };
  }, [daten.buchungen, zeigeFremde]);

  // ---------------------------------------------------------------------
  // Buchen
  // ---------------------------------------------------------------------

  const buchen = useCallback(async () => {
    if (buchtGerade.current || erfassung.fehlt) return;
    buchtGerade.current = true;
    erfassung.setzeTastenZustand('speichert');

    const eingabe = erfassung.baueEingabe();
    const menge = erfassung.tonnen;

    try {
      const ergebnis = await warteschlange.buche(eingabe);

      if (ergebnis.art === 'gemerkt') {
        erfassung.setzeTastenZustand('vorgemerkt');
        melde('wechsel');
        erfassung.nachBuchung(menge);
        return;
      }

      daten.ergaenze(ergebnis.buchung);
      erfassung.nachBuchung(menge);
      erfassung.setzeTastenZustand(ergebnis.lagerFehler ? 'fehler' : 'erfolg');
      melde(ergebnis.lagerFehler ? 'fehler' : 'gebucht');

      auditService.log(user, {
        action: 'create',
        entityType: 'produktions_buchung',
        entityId: ergebnis.buchung.$id,
        summary: `${formatTonnen(menge, 1)} t ${getBereich(eingabe.bereich).label} gebucht`,
      });
    } catch (fehler) {
      console.error('Buchung fehlgeschlagen:', fehler);
      // Die Werte bleiben vollständig stehen — wer gerade 24,32 vom
      // Wiegeschein abgetippt hat, soll das nicht wiederholen müssen.
      erfassung.setzeTastenZustand('fehler');
      melde('fehler');
    } finally {
      buchtGerade.current = false;
    }
  }, [erfassung, warteschlange, daten, user]);

  const stornieren = useCallback(
    async (grund: string, korrekturAnlegen: boolean) => {
      if (!stornoZiel) return;
      setStornoLaeuft(true);
      try {
        const storniert = await storniereBuchung(stornoZiel, grund, user);
        daten.ersetze(storniert);
        melde('storno');

        auditService.log(user, {
          action: 'update',
          entityType: 'produktions_buchung',
          entityId: storniert.$id,
          summary: `${formatTonnen(storniert.tonnen, 1)} t ${getBereich(storniert.bereich).label} storniert — ${grund}`,
          changes: { storniert: { alt: false, neu: true } },
        });

        if (korrekturAnlegen) erfassung.uebernehmeAus(storniert);
        setStornoZiel(null);
      } catch (fehler) {
        console.error('Storno fehlgeschlagen:', fehler);
        melde('fehler');
      } finally {
        setStornoLaeuft(false);
      }
    },
    [stornoZiel, user, daten, erfassung]
  );

  /**
   * Rückgängig im 90-Sekunden-Fenster: eine echte Stornierung, kein lokales
   * Verwerfen. Der Beleg bleibt im Journal — nur so bleibt nachvollziehbar,
   * warum ein Bestand kurzzeitig anders stand.
   */
  const sofortRuecknahme = useCallback(
    async (buchung: ProduktionsBuchung) => {
      const frisch = Date.now() - new Date(buchung.zeitpunkt).getTime() < 90 * 1000;
      if (!darfStornieren && !(frisch && buchung.erfasstVonId === user?.$id)) return;
      if (frisch) {
        const storniert = await storniereBuchung(buchung, 'Sofortkorrektur an der Anlage', user);
        daten.ersetze(storniert);
        melde('storno');
        return;
      }
      setStornoZiel(buchung);
    },
    [darfStornieren, user, daten]
  );

  // ---------------------------------------------------------------------
  // Tastatur (Desktop)
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (istMobil) return;
    /**
     * Enter bucht NUR im Zustand 'bereit'.
     *
     * Vorher stand hier `!erfassung.fehlt` — das prüft bloß die Pflichtangaben
     * und ließ den Warnzustand durch. Damit hebelte ein Enter am Desktop die
     * 800-ms-Halteschwelle aus, die genau diesen Fall abfangen soll: Wer sich
     * bei der Menge um eine Stelle vertippt (250 t statt 25 t), bucht die
     * Fehlmenge sofort in den Lagerbestand. Die Reibung war auf dem gesamten
     * Tastaturpfad wirkungslos.
     *
     * Im Warnzustand führt der Weg jetzt über die Taste selbst: anfokussieren,
     * Enter/Space halten (siehe BuchenTaste) — dieselbe Geste wie am Touch.
     */
    const aufTaste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement;
      const darfSofort = darfSofortBuchen(erfassung.tastenZustand);
      // Auf der Buchen-Taste selbst hat sie ihre eigene Halte-Behandlung.
      if (ziel.closest('.pz-taste')) return;
      if (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable) {
        if (e.key === 'Enter' && darfSofort) void buchen();
        return;
      }
      if (e.key === '1') erfassung.setzeBereich('rohmaterial');
      else if (e.key === '2') erfassung.setzeBereich('mahlen');
      else if (e.key === '3') erfassung.setzeBereich('abfuellung');
      else if (e.key.toLowerCase() === 'q') erfassung.setzeKoernung('0-2');
      else if (e.key.toLowerCase() === 'w') erfassung.setzeKoernung('0-3');
      else if (e.key === 'Enter' && darfSofort) void buchen();
    };
    window.addEventListener('keydown', aufTaste);
    return () => window.removeEventListener('keydown', aufTaste);
  }, [istMobil, erfassung, buchen]);

  // ---------------------------------------------------------------------
  // Darstellung
  // ---------------------------------------------------------------------

  const sonnenStil = (
    <style>{`
      .sonne .pz-zahl   { color: #000 !important; }
      .sonne .pz-panel  { color: #1f2937 !important; }
      .sonne .pz-rahmen { border-color: rgba(0,0,0,.34) !important; }
      .sonne .pz-taste  { font-size: 21px; }
      .sonne .pz-karte  { box-shadow: none !important; }
    `}</style>
  );

  const warnZeile = erfassung.hinweise.filter((h) => h.stufe === 'warnung');
  const hinweisZeile = erfassung.hinweise.filter((h) => h.stufe === 'hinweis');

  const quittung = (
    <div id="pz-quittung" role="status" className="min-h-[40px] px-1 py-1.5">
      <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{erfassung.quittung}</p>
      {warnZeile.map((h, i) => (
        <p
          key={`w${i}`}
          className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          <span aria-hidden>⚠</span>
          {h.text}
        </p>
      ))}
      {hinweisZeile.map((h, i) => (
        <p key={`h${i}`} className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          {h.text}
        </p>
      ))}
    </div>
  );

  const buchenTaste = (
    <BuchenTaste
      zustand={erfassung.tastenZustand}
      beschriftung={erfassung.tastenText}
      bereich={zustand.bereich}
      onBuchen={() => void buchen()}
      ariaLabel={`Buchung speichern: ${erfassung.quittung}`}
      ariaDescribedBy="pz-quittung"
    />
  );

  if (daten.laedt && daten.buchungen.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
          Produktionsdaten werden geladen…
        </p>
      </div>
    );
  }

  if (daten.fehler) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <h2 className="text-lg font-bold text-red-900 dark:text-red-200">
            Produktionsdaten nicht verfügbar
          </h2>
          <p className="mt-2 text-sm text-red-800 dark:text-red-300">{daten.fehler}</p>
          <button
            type="button"
            onClick={() => void daten.neuLaden()}
            className={`mt-4 min-h-[48px] w-full rounded-xl bg-red-600 font-semibold text-white ${FOKUS}`}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!darfErfassen && !zeigeAuswertung) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <Factory className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-slate-700" />
        <p className="text-gray-600 dark:text-slate-400">
          Für die Produktionserfassung fehlt die Berechtigung.
        </p>
      </div>
    );
  }

  const kopfLeiste = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div className={`rounded-xl p-2 text-white ${stil.taste}`}>
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-slate-50">Produktion</h1>
          <p className={`pz-panel ${PANEL_LABEL} hidden sm:block`}>
            Rohmaterial · Mahlen · Abfüllung
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {zeigeAuswertung && !istMobil && (
          <div className="mr-2 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
            {(
              [
                ['erfassung', 'Erfassung', Plus],
                ['auswertung', 'Auswertung', BarChart3],
              ] as const
            ).map(([wert, label, Icon]) => (
              <button
                key={wert}
                type="button"
                onClick={() => setReiter(wert)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${FOKUS} ${
                  reiter === wert
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
                    : 'text-gray-600 dark:text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setSonne((s) => !s)}
          aria-pressed={sonne}
          aria-label="Sonnenmodus: höherer Kontrast für draußen"
          className={`rounded-lg p-2.5 transition-colors ${FOKUS} ${
            sonne
              ? 'bg-amber-500 text-white'
              : 'text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <Sun className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const melder = (
    <MelderZeile
      online={warteschlange.online}
      sendet={warteschlange.sendet}
      wartend={warteschlange.anzahl}
      datum={zustand.datum}
      istNachtrag={istNachtrag}
      tonAn={ton}
      buchungenHeute={eigeneHeute.length}
      onWarteschlange={() => void warteschlange.sendeNach()}
      onDatum={() => setDatumOffen(true)}
      onTon={() => {
        const neu = !ton;
        setTonAn(neu);
        setTon(neu);
        if (neu) melde('wechsel');
      }}
      onJournal={() => setJournalOffen(true)}
    />
  );

  const journal = (
    <TagesJournal
      buchungen={daten.buchungen}
      wartend={warteschlange.wartend}
      zeigeFremde={zeigeFremde}
      darfStornieren={darfStornieren}
      darfExportieren={darfExportieren}
      eigeneId={user?.$id ?? null}
      onStorno={(b) => void sofortRuecknahme(b)}
      onNochmalSenden={() => void warteschlange.sendeNach()}
      onVerwerfen={warteschlange.verwirf}
      fremdaenderungen={daten.fremdaenderungen}
      onNeuLaden={() => void daten.neuLaden()}
    />
  );

  const dialoge = (
    <>
      {datumOffen && (
        <DatumWahl
          datum={zustand.datum}
          onDatum={erfassung.setzeDatum}
          onSchliessen={() => setDatumOffen(false)}
        />
      )}
      {stornoZiel && (
        <StornoSheet
          buchung={stornoZiel}
          laeuft={stornoLaeuft}
          onAbbrechen={() => setStornoZiel(null)}
          onStornieren={(grund, korrektur) => void stornieren(grund, korrektur)}
        />
      )}
      {verworfen && (
        <div className="pointer-events-none fixed inset-x-4 bottom-24 z-40 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-2xl">
          Eingabe verworfen
        </div>
      )}
    </>
  );

  // ------------------------------ MOBIL ------------------------------

  if (istMobil) {
    return (
      <div
        ref={rahmenRef}
        style={{ height: restHoehe ? `${restHoehe}px` : '100dvh' }}
        className={`flex min-h-0 flex-col overscroll-contain bg-gray-50 dark:bg-slate-950 ${
          sonne ? 'sonne' : ''
        }`}
      >
        {sonnenStil}

        <header className="flex-shrink-0 space-y-2 border-b border-gray-200 bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
          {kopfLeiste}
          {melder}
          <BereichsLeiste
            wert={zustand.bereich}
            onWaehle={(b) => {
              if (erfassung.tonnen > 0) {
                setVerworfen(true);
                window.setTimeout(() => setVerworfen(false), 2500);
              }
              erfassung.setzeBereich(b);
            }}
            tagesSummen={tagesSummen}
          />
        </header>

        <div className="flex-shrink-0 px-3 pt-3">
          <WertAnzeige
            bereich={zustand.bereich}
            tonnen={erfassung.tonnen}
            ableitung={erfassung.ableitung}
            istNachtrag={istNachtrag}
            nachtragDatum={zustand.datum.split('-').reverse().slice(0, 2).join('.')}
          />
        </div>

        {/* Nur dieser Block scrollt — Kopf, Wertanzeige, Quittung und
            Buchen-Taste bleiben immer sichtbar. */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <ErfassungsBlock erfassung={erfassung} lieferanten={daten.lieferanten} mobil />
        </main>

        <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 dark:border-slate-800 dark:bg-slate-900">
          {quittung}
          {buchenTaste}
        </footer>

        {journalOffen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-slate-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">Buchungen</h2>
              <button
                type="button"
                onClick={() => setJournalOffen(false)}
                aria-label="Schließen"
                className={`rounded-lg p-2 text-gray-500 ${FOKUS}`}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4">{journal}</div>
          </div>
        )}

        {dialoge}
      </div>
    );
  }

  // ----------------------------- DESKTOP -----------------------------

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-slate-950 ${sonne ? 'sonne' : ''}`}>
      {sonnenStil}

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto max-w-[1400px] px-4 py-3">{kopfLeiste}</div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {reiter === 'auswertung' && zeigeAuswertung ? (
          <LeitungsPanel
            buchungen={daten.buchungen}
            zeigeBestand={zeigeBestand}
            fensterTage={daten.fensterTage}
            onFenster={daten.setzeFenster}
            onNeuLaden={() => void daten.neuLaden()}
          />
        ) : (
          <div
            className={`grid gap-6 ${
              zeigeFremde
                ? 'grid-cols-1 xl:grid-cols-[minmax(380px,440px)_1fr]'
                : 'grid-cols-1 lg:grid-cols-[minmax(380px,440px)_1fr]'
            }`}
          >
            <div className="space-y-4 self-start lg:sticky lg:top-24">
              {melder}
              <BereichsLeiste
                wert={zustand.bereich}
                onWaehle={erfassung.setzeBereich}
                tagesSummen={tagesSummen}
              />
              <WertAnzeige
                bereich={zustand.bereich}
                tonnen={erfassung.tonnen}
                ableitung={erfassung.ableitung}
                istNachtrag={istNachtrag}
                nachtragDatum={zustand.datum.split('-').reverse().slice(0, 2).join('.')}
              />
              <ErfassungsBlock
                erfassung={erfassung}
                lieferanten={daten.lieferanten}
                mobil={false}
              />
              {quittung}
              {buchenTaste}
              <p className="text-center text-xs text-gray-400 dark:text-slate-600">
                Tastatur: 1/2/3 Bereich · Q/W Körnung ·{' '}
                {erfassung.tastenZustand === 'warnung'
                  ? 'Enter auf der Taste halten'
                  : 'Enter buchen'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="h-[calc(100vh-13rem)] min-h-[420px]">{journal}</div>
            </div>
          </div>
        )}
      </div>

      {dialoge}
    </div>
  );
};

export default ProduktionsTracker;
