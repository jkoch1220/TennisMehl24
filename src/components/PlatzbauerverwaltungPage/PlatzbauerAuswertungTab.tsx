/**
 * Auswertung eines Platzbauers für eine Saison (09/2026).
 *
 * Beantwortet die zwei Fragen, für die man bisher die Vereinsliste abtippen
 * musste: Wie viel wurde über diesen Platzbauer bestellt und geliefert — und
 * in welche Regionen? Dazu der Stand in der Preisstaffel: Welche Stufe gilt
 * gerade, wie viele Tonnen fehlen zur nächsten und was sie brächte.
 *
 * Gerechnet wird in `utils/platzbauerAuswertung.ts` (dort auch die Regeln:
 * verlorene Projekte zählen nicht, maßgeblich für die Staffel ist die
 * GELIEFERTE Menge). Diese Datei lädt und zeigt nur.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Package, RefreshCw, TrendingUp, Truck, Users } from 'lucide-react';
import { PlatzbauerPosition, PlatzbauerProjekt, Preisstaffel } from '../../types/platzbauer';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import { ladeAktuellesDokument } from '../../services/platzbauerprojektabwicklungDokumentService';
import { leseStaffelStand } from '../../utils/staffelUebernahme';
import {
  PlatzbauerAuswertung,
  StaffelStandAuswertung,
  werteAus,
  werteStaffelAus,
} from '../../utils/platzbauerAuswertung';
import { formatTonnen } from '../../utils/staffelpreisText';

interface Props {
  saisonjahr: number;
  projekte: PlatzbauerProjekt[];
}

const euro = (betrag: number): string =>
  betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const PlatzbauerAuswertungTab = ({ saisonjahr, projekte }: Props) => {
  const [laden, setLaden] = useState(true);
  const [auswertung, setAuswertung] = useState<PlatzbauerAuswertung | null>(null);
  const [staffelStand, setStaffelStand] = useState<StaffelStandAuswertung | null>(null);
  const [staffelSorte, setStaffelSorte] = useState<string>('');

  const laden_ = useCallback(async () => {
    setLaden(true);
    try {
      // Alle Projekte der Saison zusammen: Ein Platzbauer kann neben dem
      // Saisonprojekt Nachträge haben; die gehören zur selben Bestellung.
      const positionsListen = await Promise.all(
        projekte.map((p) => platzbauerverwaltungService.aggregierePositionen(p.id))
      );
      const positionen: PlatzbauerPosition[] = positionsListen.flat();
      const ergebnis = werteAus(positionen);
      setAuswertung(ergebnis);

      // Staffel aus dem Angebot des Saisonprojekts (Nachträge tragen keine
      // eigene Vereinbarung).
      const saisonprojekt = projekte.find((p) => p.typ === 'saisonprojekt') || projekte[0];
      let staffeln: Preisstaffel[] = [];
      let sorte = '';
      if (saisonprojekt) {
        try {
          const angebot = await ladeAktuellesDokument(saisonprojekt.id, 'angebot');
          if (angebot?.daten) {
            const stand = leseStaffelStand(angebot.daten, saisonjahr);
            const erste = stand.staffelPositionen[0];
            staffeln = erste?.staffelpreise?.staffeln ?? [];
            sorte = erste ? `${erste.bezeichnung} (${erste.artikelnummer})` : '';
          }
        } catch (e) {
          console.warn('Staffel konnte nicht gelesen werden:', e);
        }
      }
      setStaffelSorte(sorte);
      setStaffelStand(werteStaffelAus(staffeln, ergebnis.mengeGeliefert));
    } catch (e) {
      console.error('Auswertung konnte nicht geladen werden:', e);
    } finally {
      setLaden(false);
    }
  }, [projekte, saisonjahr]);

  useEffect(() => {
    laden_();
  }, [laden_]);

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Lade Auswertung...
      </div>
    );
  }

  if (!auswertung || auswertung.anzahlVereine === 0) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        Für Saison {saisonjahr} sind diesem Platzbauer noch keine Vereinsprojekte zugeordnet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">Saison {saisonjahr}</h3>
        <button
          type="button"
          onClick={laden_}
          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          title="Aktualisieren"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kachel
          icon={Package}
          label="Bestellt"
          wert={formatTonnen(auswertung.mengeBestellt)}
          zusatz={euro(auswertung.umsatzBestellt)}
        />
        <Kachel
          icon={Truck}
          label="Geliefert"
          wert={formatTonnen(auswertung.mengeGeliefert)}
          zusatz={euro(auswertung.umsatzGeliefert)}
        />
        <Kachel icon={Users} label="Vereine" wert={String(auswertung.anzahlVereine)} />
        <Kachel
          icon={TrendingUp}
          label="Ø Preis"
          wert={`${auswertung.durchschnittspreis.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
          })} €/t`}
        />
      </div>

      {/* Staffelstand */}
      {staffelStand && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Stand in der Staffel</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Maßgeblich ist die gelieferte Menge{staffelSorte ? ` · ${staffelSorte}` : ''}.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {staffelStand.aktuelleStufe
                  ? `${staffelStand.aktuelleStufe.einzelpreis.toLocaleString('de-DE', {
                      minimumFractionDigits: 2,
                    })} €/t`
                  : '—'}
              </span>
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                aktuelle Stufe bei {formatTonnen(staffelStand.massgeblicheMenge)}
              </span>
            </div>
            {staffelStand.naechsteStufe ? (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Noch{' '}
                <strong>{formatTonnen(staffelStand.tonnenBisNaechsteStufe)}</strong> bis{' '}
                {staffelStand.naechsteStufe.einzelpreis.toLocaleString('de-DE', {
                  minimumFractionDigits: 2,
                })}{' '}
                €/t
                {staffelStand.ersparnisJeTonne > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    {' '}
                    (−{staffelStand.ersparnisJeTonne.toLocaleString('de-DE', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    €/t)
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm text-green-600 dark:text-green-400">
                Höchste Stufe erreicht.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" />
          <h4 className="font-semibold text-gray-900 dark:text-white">Regionen</h4>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-5 py-2 font-semibold">PLZ-Gebiet</th>
              <th className="text-left px-5 py-2 font-semibold">Orte</th>
              <th className="text-right px-5 py-2 font-semibold">Vereine</th>
              <th className="text-right px-5 py-2 font-semibold">Bestellt</th>
              <th className="text-right px-5 py-2 font-semibold">Geliefert</th>
              <th className="text-right px-5 py-2 font-semibold">Umsatz</th>
              <th className="text-right px-5 py-2 font-semibold">Anteil</th>
            </tr>
          </thead>
          <tbody>
            {auswertung.regionen.map((region) => (
              <tr
                key={region.leitregion}
                className="border-t border-gray-100 dark:border-slate-800"
              >
                <td className="px-5 py-2 font-medium text-gray-900 dark:text-white">
                  {region.leitregion === '??' ? 'ohne PLZ' : `${region.leitregion}xxx`}
                </td>
                <td className="px-5 py-2 text-gray-600 dark:text-gray-400">
                  {region.orte.join(', ') || '—'}
                </td>
                <td className="px-5 py-2 text-right">{region.anzahlVereine}</td>
                <td className="px-5 py-2 text-right">{formatTonnen(region.mengeBestellt)}</td>
                <td className="px-5 py-2 text-right">{formatTonnen(region.mengeGeliefert)}</td>
                <td className="px-5 py-2 text-right">{euro(region.umsatz)}</td>
                <td className="px-5 py-2 text-right">
                  {(region.anteil * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vereine */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <h4 className="font-semibold text-gray-900 dark:text-white">Vereine</h4>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-5 py-2 font-semibold">Verein</th>
              <th className="text-left px-5 py-2 font-semibold">Lieferort</th>
              <th className="text-right px-5 py-2 font-semibold">Menge</th>
              <th className="text-right px-5 py-2 font-semibold">Preis/t</th>
              <th className="text-right px-5 py-2 font-semibold">Umsatz</th>
              <th className="text-right px-5 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {auswertung.vereine.map((verein) => (
              <tr
                key={`${verein.vereinId}-${verein.vereinsname}`}
                className="border-t border-gray-100 dark:border-slate-800"
              >
                <td className="px-5 py-2 text-gray-900 dark:text-white">{verein.vereinsname}</td>
                <td className="px-5 py-2 text-gray-600 dark:text-gray-400">
                  {[verein.plz, verein.ort].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-5 py-2 text-right">{formatTonnen(verein.menge)}</td>
                <td className="px-5 py-2 text-right">
                  {verein.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </td>
                <td className="px-5 py-2 text-right">{euro(verein.umsatz)}</td>
                <td className="px-5 py-2 text-right">
                  {verein.geliefert ? (
                    <span className="text-green-600 dark:text-green-400">geliefert</span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">offen</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Kachel = ({
  icon: Icon,
  label,
  wert,
  zusatz,
}: {
  icon: typeof Package;
  label: string;
  wert: string;
  zusatz?: string;
}) => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
      <Icon className="w-4 h-4" />
      {label}
    </div>
    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{wert}</p>
    {zusatz && <p className="text-sm text-gray-500 dark:text-gray-400">{zusatz}</p>}
  </div>
);

export default PlatzbauerAuswertungTab;
