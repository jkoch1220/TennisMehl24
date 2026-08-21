/**
 * Das Wochenbrett — die Antwort auf die Frage, die das Status-Kanban nicht
 * beantworten kann.
 *
 * In der Hochsaison laufen rund 200 Projekte, die in sechs bis acht Wochen
 * ausgeliefert werden: 25 bis 33 Lieferungen pro Woche. Der Status sagt, wo das
 * Papier steht — er sagt nicht, wann der LKW fährt. Und weil die operative Masse
 * in zwei Spalten liegt (Auftragsbestätigung, Lieferschein), stehen dort 50 bis
 * 80 Karten übereinander, ohne Ordnung, ohne Summen.
 *
 * Hier ist die Lieferwoche die Gliederung. Dieselben Karten, dieselben Daten —
 * nur nach der Achse sortiert, nach der in der Saison tatsächlich gefragt wird.
 *
 * Bewusste Entscheidungen:
 * - „Ohne Termin" ist kein Fehlerbereich, sondern der Arbeitsvorrat der
 *   Disposition. Dreigeteilt, weil die Fälle Verschiedenes bedeuten: Ein offenes
 *   Angebot braucht keinen Termin, eine Auftragsbestätigung ohne Termin schon.
 * - Überfällige stehen ganz oben und werden auch dann angezeigt, wenn sie leer
 *   sind — „keine Überfälligen" ist eine Information, die man sehen will.
 * - Wochen ohne Projekte werden nicht gezeigt. Ein Brett voller leerer Wochen
 *   verdeckt die, in denen etwas passiert.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import {
  lieferterminEffektiv,
  formatiereTermin,
  terminQuelleLabel,
  istUeberfaellig,
  wochenSchluessel,
} from '../../utils/liefertermin';
import {
  getAbwicklungswege,
  ABWICKLUNGSWEG_KUERZEL,
  ABWICKLUNGSWEG_LABEL,
} from '../../utils/abwicklungsweg';
import { getMontagDerKW } from '../../utils/kalenderwoche';

interface WochenbrettProps {
  /** Bereits gefilterte Projekte — dieselbe Menge, die das Kanban zeigt. */
  projekte: Projekt[];
  onProjektClick: (projekt: Projekt) => void;
}

type FachOhneTermin = 'kein_termin_noetig' | 'termin_fehlt';

const STATUS_KURZ: Record<ProjektStatus, string> = {
  angebot: 'Angebot',
  angebot_versendet: 'versendet',
  auftragsbestaetigung: 'AB',
  lieferschein: 'Lieferschein',
  geliefert: 'geliefert',
  rechnung: 'Rechnung',
  bezahlt: 'bezahlt',
  verloren: 'verloren',
};

/** Ein Projekt, das noch keinen Termin braucht — Angebot noch offen. */
const brauchtNochKeinenTermin = (projekt: Projekt): boolean =>
  projekt.status === 'angebot' || projekt.status === 'angebot_versendet';

const summiereTonnage = (projekte: Projekt[]): number =>
  projekte.reduce((summe, p) => summe + (p.liefergewicht ?? p.angefragteMenge ?? 0), 0);

const formatTonnen = (tonnen: number): string =>
  tonnen > 0 ? `${tonnen.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t` : '—';

const ProjektZeile = ({
  projekt,
  onClick,
}: {
  projekt: Projekt;
  onClick: () => void;
}) => {
  const termin = lieferterminEffektiv(projekt);
  const wege = [...getAbwicklungswege(projekt)];
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-gray-900 dark:text-slate-100 truncate">
          {projekt.kundenname}
        </span>
        <span className="text-xs text-gray-400 flex-shrink-0">{STATUS_KURZ[projekt.status]}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
        {termin && (
          <span className="text-gray-600 dark:text-slate-300">
            {formatiereTermin(termin)}{' '}
            <span className="opacity-60">{terminQuelleLabel(termin.quelle)}</span>
          </span>
        )}
        {wege.map((weg) => (
          <span
            key={weg}
            className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold"
            title={ABWICKLUNGSWEG_LABEL[weg]}
          >
            {ABWICKLUNGSWEG_KUERZEL[weg]}
          </span>
        ))}
        {(projekt.liefergewicht ?? projekt.angefragteMenge) ? (
          <span className="text-gray-500 dark:text-slate-400">
            {formatTonnen(projekt.liefergewicht ?? projekt.angefragteMenge ?? 0)}
          </span>
        ) : null}
      </div>
    </button>
  );
};

const Lane = ({
  titel,
  untertitel,
  projekte,
  farbe,
  standardOffen,
  onProjektClick,
  leerText,
}: {
  titel: string;
  untertitel?: string;
  projekte: Projekt[];
  farbe: 'rot' | 'normal' | 'gedaempft';
  standardOffen: boolean;
  onProjektClick: (projekt: Projekt) => void;
  leerText?: string;
}) => {
  const [offen, setOffen] = useState(standardOffen);
  const tonnage = summiereTonnage(projekte);

  const rahmen =
    farbe === 'rot'
      ? 'border-red-300 dark:border-red-800'
      : farbe === 'gedaempft'
      ? 'border-gray-200 dark:border-slate-700'
      : 'border-gray-200 dark:border-slate-700';
  const kopfFarbe =
    farbe === 'rot'
      ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
      : farbe === 'gedaempft'
      ? 'bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-400'
      : 'bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100';

  if (projekte.length === 0 && !leerText) return null;

  return (
    <div className={`border rounded-xl overflow-hidden ${rahmen}`}>
      <button
        onClick={() => setOffen((v) => !v)}
        className={`w-full px-3 py-2.5 flex items-center gap-2 ${kopfFarbe}`}
      >
        {offen ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
        {farbe === 'rot' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
        <span className="font-semibold text-sm">{titel}</span>
        {untertitel && <span className="text-xs opacity-70">{untertitel}</span>}
        <span className="ml-auto text-xs font-medium tabular-nums">
          {projekte.length} {projekte.length === 1 ? 'Projekt' : 'Projekte'}
          {tonnage > 0 && ` · ${formatTonnen(tonnage)}`}
        </span>
      </button>
      {offen && (
        <div className="p-2 space-y-1.5 bg-white dark:bg-slate-900/40">
          {projekte.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-2 px-1">{leerText}</p>
          ) : (
            projekte.map((projekt) => (
              <ProjektZeile
                key={(projekt as { $id?: string }).$id || projekt.id}
                projekt={projekt}
                onClick={() => onProjektClick(projekt)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

const Wochenbrett = ({ projekte, onProjektClick }: WochenbrettProps) => {
  const { ueberfaellig, wochen, ohneTermin } = useMemo(() => {
    const ueberfaellig: Projekt[] = [];
    const nachWoche = new Map<string, { kw: number; jahr: number; projekte: Projekt[] }>();
    const ohneTermin: Record<FachOhneTermin, Projekt[]> = {
      kein_termin_noetig: [],
      termin_fehlt: [],
    };

    for (const projekt of projekte) {
      // Abgeschlossenes gehört nicht in die Wochenplanung — es ist geliefert.
      if (projekt.status === 'bezahlt' || projekt.status === 'verloren') continue;

      if (istUeberfaellig(projekt)) {
        ueberfaellig.push(projekt);
        continue;
      }

      const termin = lieferterminEffektiv(projekt);
      if (!termin) {
        ohneTermin[brauchtNochKeinenTermin(projekt) ? 'kein_termin_noetig' : 'termin_fehlt'].push(
          projekt
        );
        continue;
      }

      const schluessel = wochenSchluessel(termin);
      const eintrag = nachWoche.get(schluessel) ?? {
        kw: termin.kw,
        jahr: termin.kwJahr,
        projekte: [],
      };
      eintrag.projekte.push(projekt);
      nachWoche.set(schluessel, eintrag);
    }

    // Chronologisch — der Schlüssel „2027-05" sortiert über Jahresgrenzen korrekt.
    const wochen = [...nachWoche.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([schluessel, wert]) => ({ schluessel, ...wert }));

    return { ueberfaellig, wochen, ohneTermin };
  }, [projekte]);

  const wochenSpanne = (kw: number, jahr: number): string => {
    const montag = getMontagDerKW(kw, jahr);
    const freitag = new Date(montag);
    freitag.setDate(freitag.getDate() + 4);
    const f = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
    return `${f(montag)}–${f(freitag)}`;
  };

  const gesamtGeplant = wochen.reduce((n, w) => n + w.projekte.length, 0);

  if (projekte.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-slate-500">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Keine Projekte in dieser Auswahl.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
        <CalendarDays className="w-4 h-4" />
        <span>
          {gesamtGeplant} terminiert in {wochen.length}{' '}
          {wochen.length === 1 ? 'Woche' : 'Wochen'} · {ueberfaellig.length} überfällig ·{' '}
          {ohneTermin.termin_fehlt.length + ohneTermin.kein_termin_noetig.length} ohne Termin
        </span>
      </div>

      {/* Überfällige immer zuerst und immer sichtbar — auch wenn leer. */}
      <Lane
        titel="Überfällig"
        projekte={ueberfaellig}
        farbe="rot"
        standardOffen
        onProjektClick={onProjektClick}
        leerText="Keine überfälligen Lieferungen."
      />

      {wochen.map((woche, index) => (
        <Lane
          key={woche.schluessel}
          titel={`KW ${woche.kw}`}
          untertitel={`${wochenSpanne(woche.kw, woche.jahr)}${
            woche.jahr !== wochen[0]?.jahr ? ` ${woche.jahr}` : ''
          }`}
          projekte={woche.projekte}
          farbe="normal"
          // Nur die nächsten drei Wochen offen: Bei 200 Projekten stehen sonst
          // alle gleichzeitig auf dem Schirm, und man sucht wieder.
          standardOffen={index < 3}
          onProjektClick={onProjektClick}
        />
      ))}

      {/* „Ohne Termin" ist der Arbeitsvorrat, nicht der Fehlerbereich. */}
      <Lane
        titel="Auftragsbestätigt, Termin fehlt"
        projekte={ohneTermin.termin_fehlt}
        farbe="rot"
        standardOffen={ohneTermin.termin_fehlt.length > 0}
        onProjektClick={onProjektClick}
        leerText="Alle bestätigten Aufträge haben einen Termin."
      />
      <Lane
        titel="Noch kein Termin nötig"
        untertitel="offene Angebote"
        projekte={ohneTermin.kein_termin_noetig}
        farbe="gedaempft"
        standardOffen={false}
        onProjektClick={onProjektClick}
      />
    </div>
  );
};

export default Wochenbrett;
