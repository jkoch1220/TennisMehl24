/**
 * Das Statusband — der Durchstich eines Projekts in einer Zeile.
 *
 * Sieben Stationen von der Angebotserstellung bis zum Zahlungseingang, jede mit
 * ihrer Belegnummer und ihrem Datum. Alle Angaben stammen aus Feldern, die es
 * längst gibt; sie standen bisher nur über vier Reiter verteilt, sodass man den
 * Gesamtstand eines Vorgangs nirgends auf einen Blick sah.
 *
 * Das Band zeigt auch LÜCKEN: „AB erstellt, nie versendet" ist die Information,
 * nach der man sonst mühsam sucht. Eine Station, die übersprungen wurde, bleibt
 * als offene Stelle stehen, statt stillschweigend als erledigt zu gelten.
 *
 * Bewusst keine Klickfläche zum Statuswechsel: Das Band ist eine Auskunft, kein
 * Bedienelement. Wer den Status ändern will, tut das im Board oder über die
 * Dokument-Reiter — dort, wo auch der Beleg entsteht.
 */

import { Projekt, ProjektStatus, ALLE_PROJEKT_STATUS } from '../../types/projekt';

interface Station {
  status: ProjektStatus;
  label: string;
  /** Belegnummer dieser Station, falls vorhanden. */
  nummer?: string;
  /** Datum, das diese Station belegt. */
  datum?: string;
  /** Zusatz, der eine Lücke benennt — z. B. „nicht versendet". */
  hinweis?: string;
}

const formatDatum = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/**
 * Reihenfolge der Stationen. „verloren" gehört nicht dazu — ein verlorenes
 * Projekt hat keine Kette, sondern ein Ende.
 */
const REIHENFOLGE: ProjektStatus[] = ALLE_PROJEKT_STATUS.filter((s) => s !== 'verloren');

function baueStationen(projekt: Projekt): Station[] {
  return [
    {
      status: 'angebot',
      label: 'Angebot',
      nummer: projekt.angebotsnummer,
      datum: formatDatum(projekt.angebotsdatum),
    },
    {
      status: 'angebot_versendet',
      label: 'Versendet',
      // Es gibt kein eigenes Versanddatum für Angebote; erreicht ist die Station
      // dann, wenn der Projektstatus darüber hinaus ist.
      datum: undefined,
    },
    {
      status: 'auftragsbestaetigung',
      label: 'Auftragsbestätigung',
      nummer: projekt.auftragsbestaetigungsnummer,
      datum: formatDatum(projekt.abVersendetAm ?? projekt.auftragsbestaetigungsdatum),
      hinweis:
        projekt.auftragsbestaetigungsnummer && !projekt.abVersendetAm
          ? 'erstellt, nicht versendet'
          : undefined,
    },
    {
      status: 'lieferschein',
      label: 'Lieferschein',
      nummer: projekt.lieferscheinnummer,
    },
    {
      status: 'geliefert',
      label: 'Geliefert',
      datum: formatDatum(projekt.liefernachweisAm),
      hinweis:
        projekt.status === 'geliefert' && !projekt.wiegeschein
          ? 'Wiegeschein fehlt'
          : undefined,
    },
    {
      status: 'rechnung',
      label: 'Rechnung',
      nummer: projekt.rechnungsnummer,
      datum: formatDatum(projekt.rechnungVersendetAm ?? projekt.rechnungsdatum),
      hinweis:
        projekt.rechnungsnummer && !projekt.rechnungVersendetAm
          ? 'erstellt, nicht versendet'
          : undefined,
    },
    {
      status: 'bezahlt',
      label: 'Bezahlt',
      datum: formatDatum(projekt.bezahltAm),
    },
  ];
}

const Statusband = ({ projekt }: { projekt: Projekt }) => {
  const stationen = baueStationen(projekt);
  const aktuellerIndex = REIHENFOLGE.indexOf(projekt.status);
  const istVerloren = projekt.status === 'verloren';

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
      {istVerloren && (
        <div className="mb-3 text-sm font-semibold text-gray-500 dark:text-slate-400">
          Projekt als verloren markiert
          {projekt.verlorenGrund && <span className="font-normal"> · {projekt.verlorenGrund}</span>}
        </div>
      )}
      <div className="flex gap-0 overflow-x-auto">
        {stationen.map((station, index) => {
          const erreicht = !istVerloren && index < aktuellerIndex;
          const aktuell = !istVerloren && index === aktuellerIndex;
          const offen = !erreicht && !aktuell;

          return (
            <div key={station.status} className="flex-1 min-w-[7.5rem] pr-2">
              {/* Der Balken trägt den Zustand — Farbe allein würde bei
                  Rot-Grün-Schwäche nicht reichen, deshalb zusätzlich die Stärke. */}
              <div
                className={`h-1 rounded-full mb-2 ${
                  aktuell
                    ? 'bg-blue-600 dark:bg-blue-400'
                    : erreicht
                    ? 'bg-emerald-500 dark:bg-emerald-500'
                    : 'bg-gray-200 dark:bg-slate-700'
                } ${aktuell ? 'h-1.5' : ''}`}
              />
              <div
                className={`text-xs font-semibold leading-tight ${
                  aktuell
                    ? 'text-blue-700 dark:text-blue-300'
                    : erreicht
                    ? 'text-gray-900 dark:text-slate-100'
                    : 'text-gray-400 dark:text-slate-500'
                }`}
              >
                {station.label}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {station.nummer && (
                  <div className="text-xs font-mono text-gray-500 dark:text-slate-400 truncate">
                    {station.nummer}
                  </div>
                )}
                {station.datum && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">{station.datum}</div>
                )}
                {!station.nummer && !station.datum && offen && (
                  <div className="text-xs text-gray-300 dark:text-slate-600">—</div>
                )}
                {station.hinweis && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 leading-tight">
                    {station.hinweis}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Statusband;
