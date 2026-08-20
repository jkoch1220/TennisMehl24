/**
 * Die Lieferantenleiste — was liegt gerade bei wem.
 *
 * Der Kundentakt (Angebot → AB → Lieferung → Rechnung) ist für jede Produktart
 * gleich und steht im Board. Der BESCHAFFUNGSTAKT ist es nicht: Hydrocourt wird
 * beim Lieferanten bestellt, Universal per Lieferschein abgerufen, Schüttgut
 * fährt der eigene LKW, Palettenware geht über eine Spedition. Diese vier Takte
 * liefen bisher in getrennten Vollbildansichten — man musste zwischen ihnen
 * wechseln und sah in keiner den Gesamtstand.
 *
 * Hier stehen sie nebeneinander, als Einstiege: vier Kacheln mit Zahlen, ein
 * Klick führt in die jeweilige Arbeitsliste. Das Board darunter bleibt die
 * Hauptfläche — die Leiste ergänzt es, sie ersetzt es nicht.
 *
 * Bewusst ehrlich bei der Spedition: Für Raben-Avisierung, Speditionsauftrag und
 * Kranzusteller gibt es im System kein einziges Feld. Die Kachel sagt das, statt
 * einen Stand vorzutäuschen, den niemand pflegt.
 */

import { useMemo } from 'react';
import { Package, Truck, Droplets, Tag, ArrowRight, AlertTriangle } from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { getAbwicklungswege } from '../../utils/abwicklungsweg';

interface LieferantenleisteProps {
  projekteGruppiert: Record<ProjektStatus, Projekt[]>;
  /** Öffnet die zugehörige Arbeitsliste. */
  onOeffne: (ziel: 'hydrocourt' | 'universal' | 'dispo' | 'spedition') => void;
}

interface Kachel {
  schluessel: 'hydrocourt' | 'universal' | 'dispo' | 'spedition';
  titel: string;
  icon: typeof Package;
  farbe: string;
  /** Was jetzt zu tun ist. */
  offen: number;
  offenLabel: string;
  /** Was bereits läuft. */
  laufend: number;
  laufendLabel: string;
  aktion?: string;
  /** Steht statt der Zahlen, wenn es dafür keine Daten gibt. */
  ohneDaten?: string;
}

/**
 * Nur Projekte in der Abwicklung zählen — ein offenes Angebot ist noch nichts,
 * was bei einem Lieferanten liegt, und ein bezahltes ist erledigt.
 */
const IN_ABWICKLUNG: ProjektStatus[] = [
  'auftragsbestaetigung',
  'lieferschein',
  'geliefert',
  'rechnung',
];

const Lieferantenleiste = ({ projekteGruppiert, onOeffne }: LieferantenleisteProps) => {
  const kacheln = useMemo<Kachel[]>(() => {
    const relevant = IN_ABWICKLUNG.flatMap((status) => projekteGruppiert[status] ?? []);

    let hycOffen = 0;
    let hycLaufend = 0;
    let uniOffen = 0;
    let uniLaufend = 0;
    let dispoOffen = 0;
    let dispoGeplant = 0;
    let spedition = 0;

    for (const projekt of relevant) {
      const wege = getAbwicklungswege(projekt);

      if (wege.has('hydrocourt')) {
        // Fehlender Status heißt „noch nicht bestellt" — der Default im Tool.
        if (!projekt.hydrocourtStatus || projekt.hydrocourtStatus === 'offen') hycOffen += 1;
        else if (projekt.hydrocourtStatus === 'bestellt') hycLaufend += 1;
      }

      if (wege.has('universal')) {
        if (!projekt.universalKanbanStatus || projekt.universalKanbanStatus === 'offen') uniOffen += 1;
        else if (
          projekt.universalKanbanStatus === 'versendet' ||
          projekt.universalKanbanStatus === 'an_kunden'
        ) {
          uniLaufend += 1;
        }
      }

      if (wege.has('schuettgut')) {
        if (!projekt.dispoStatus || projekt.dispoStatus === 'offen') dispoOffen += 1;
        else if (projekt.dispoStatus === 'geplant') dispoGeplant += 1;
      }

      if (wege.has('palette') || wege.has('kranwagen')) spedition += 1;
    }

    return [
      {
        schluessel: 'hydrocourt',
        titel: 'Hydrocourt',
        icon: Droplets,
        farbe: 'text-cyan-600 dark:text-cyan-400',
        offen: hycOffen,
        offenLabel: 'zu bestellen',
        laufend: hycLaufend,
        laufendLabel: 'bestellt, unterwegs',
        // Seit der Umstellung wird im Shop des Lieferanten bestellt, nicht mehr
        // per Sammelmail — die Kachel führt deshalb in die Liste, statt selbst
        // eine Bestellung auszulösen.
        aktion: 'Liste öffnen',
      },
      {
        schluessel: 'universal',
        titel: 'Universal Sport',
        icon: Tag,
        farbe: 'text-orange-600 dark:text-orange-400',
        offen: uniOffen,
        offenLabel: 'abzurufen',
        laufend: uniLaufend,
        laufendLabel: 'gemeldet',
        aktion: 'Liste öffnen',
      },
      {
        schluessel: 'dispo',
        titel: 'Eigene Dispo',
        icon: Truck,
        farbe: 'text-emerald-600 dark:text-emerald-400',
        offen: dispoOffen,
        offenLabel: 'zu disponieren',
        laufend: dispoGeplant,
        laufendLabel: 'auf Tour',
        aktion: 'Zur Wochenplanung',
      },
      {
        schluessel: 'spedition',
        titel: 'Spedition',
        icon: Package,
        farbe: 'text-slate-500 dark:text-slate-400',
        offen: spedition,
        offenLabel: 'Sendungen',
        laufend: 0,
        laufendLabel: '',
        // Für Avisierung, Speditionsauftrag und Kranzusteller existiert im System
        // kein Feld. Das auszusprechen ist ehrlicher als eine Zahl zu erfinden —
        // und zugleich die beste Begründung dafür, dass es diese Felder geben sollte.
        ohneDaten: 'Status wird außerhalb des Portals geführt',
      },
    ];
  }, [projekteGruppiert]);

  const nichtsZuTun = kacheln.every((k) => k.offen === 0 && k.laufend === 0);
  if (nichtsZuTun) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
      {kacheln.map((kachel) => {
        const Icon = kachel.icon;
        const leer = kachel.offen === 0 && kachel.laufend === 0;
        return (
          <button
            key={kachel.schluessel}
            onClick={() => onOeffne(kachel.schluessel)}
            disabled={!!kachel.ohneDaten}
            className={`text-left p-3 rounded-xl border transition-colors ${
              kachel.ohneDaten
                ? 'border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/40 cursor-default'
                : leer
                ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`w-4 h-4 ${kachel.farbe}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                {kachel.titel}
              </span>
            </div>

            <div className="mt-1.5">
              <span className="text-xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                {kachel.offen}
              </span>
              <span className="text-sm text-gray-600 dark:text-slate-400 ml-1.5">
                {kachel.offenLabel}
              </span>
            </div>

            {kachel.laufend > 0 && (
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {kachel.laufend} {kachel.laufendLabel}
              </div>
            )}

            {kachel.ohneDaten ? (
              <div className="mt-2 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{kachel.ohneDaten}</span>
              </div>
            ) : (
              kachel.aktion && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-slate-300">
                  {kachel.aktion} <ArrowRight className="w-3 h-3" />
                </div>
              )
            )}
          </button>
        );
      })}
    </div>
  );
};

export default Lieferantenleiste;
