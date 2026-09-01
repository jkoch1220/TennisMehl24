/**
 * Saison-Auswertung je Artikel (Stufe 6 Artikelverwaltung, 09/2026).
 *
 * Quelle: finalisierte Belege + geprüfte Wiegescheine — nicht die
 * Entwurfs-JSONs der Tabs. Die Datenqualitäts-Ampel zeigt, wie belastbar die
 * Zahlen sind (Freitext-/unbekannte Positionen, nicht aufteilbare Erlöse).
 */
import { useEffect, useState } from 'react';
import { Loader2, Scale, AlertTriangle, PackageSearch } from 'lucide-react';
import {
  ladeSaisonArtikelAuswertung,
  SaisonArtikelAuswertung,
  NICHT_ZUORDENBAR,
} from '../../services/saisonAuswertungService';
import { WARENGRUPPEN } from '../../types/artikel';

const euro = (wert: number): string =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const tonnen = (wert: number): string =>
  `${wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t`;

const ArtikelAuswertung = ({ saisonjahr }: { saisonjahr: number }) => {
  const [auswertung, setAuswertung] = useState<SaisonArtikelAuswertung | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    setLaedt(true);
    setFehler(null);
    ladeSaisonArtikelAuswertung(saisonjahr)
      .then((ergebnis) => {
        if (aktiv) setAuswertung(ergebnis);
      })
      .catch((e) => {
        console.error('Artikel-Auswertung nicht ladbar:', e);
        if (aktiv) setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler');
      })
      .finally(() => {
        if (aktiv) setLaedt(false);
      });
    return () => {
      aktiv = false;
    };
  }, [saisonjahr]);

  if (laedt) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 flex items-center justify-center gap-2 text-gray-600 dark:text-dark-textMuted">
        <Loader2 className="h-5 w-5 animate-spin" />
        Lade Artikel-Auswertung …
      </div>
    );
  }

  if (fehler || !auswertung) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-red-200 dark:border-red-800 p-6 text-sm text-red-700 dark:text-red-300">
        Artikel-Auswertung konnte nicht geladen werden{fehler ? `: ${fehler}` : '.'}
      </div>
    );
  }

  const datenqualitaetProbleme =
    auswertung.nichtZuordenbarePositionen + auswertung.freitextPositionen;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
            Saison-Auswertung je Artikel ({auswertung.saisonjahr})
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-textMuted">
            Quelle: finalisierte Belege ({auswertung.anzahlProjekteMitBelegen} von {auswertung.anzahlProjekte} Projekten) und geprüfte Wiegescheine — Warenerlös ab Werk, alles darüber ist Frachtaufschlag.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-gray-700 dark:text-dark-textMuted" title="Summe der durch die Wiegeschein-Prüfung bestätigten Liefermengen">
            <Scale className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            gewogen: <strong>{tonnen(auswertung.gewogeneTonnenGesamt)}</strong> ({auswertung.gewogeneProjekte} Projekte)
          </span>
          {datenqualitaetProbleme > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300" title={`${auswertung.nichtZuordenbarePositionen} Positionen mit unbekannter Artikelnummer, ${auswertung.freitextPositionen} Freitext-Positionen`}>
              <AlertTriangle className="h-4 w-4" />
              {datenqualitaetProbleme} Positionen ohne Stammartikel
            </span>
          ) : (
            <span className="text-green-700 dark:text-green-400">alle Positionen zugeordnet</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr className="text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Artikel</th>
              <th className="px-4 py-2 text-left">Warengruppe</th>
              <th className="px-4 py-2 text-right" title="Tonnen in finalisierten Angeboten (inkl. nicht gewonnener)">angeboten</th>
              <th className="px-4 py-2 text-right" title="Tonnen in Auftragsbestätigungen">beauftragt</th>
              <th className="px-4 py-2 text-right" title="Tonnen in nicht stornierten Rechnungen">fakturiert</th>
              <th className="px-4 py-2 text-right" title="Ab-Werk-Anteil der fakturierten Erlöse">Warenerlös</th>
              <th className="px-4 py-2 text-right" title="Frachtaufschlag über Werk + separate Frachtpositionen">Frachterlös</th>
              <th className="px-4 py-2 text-right" title="Umsatz − Einkauf, nur über Positionen mit gepflegtem EK">DB1</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {auswertung.zeilen.map((zeile) => (
              <tr
                key={zeile.artikelnummer}
                className={`hover:bg-gray-50 dark:hover:bg-slate-800 ${zeile.artikelnummer === NICHT_ZUORDENBAR ? 'bg-amber-50/60 dark:bg-amber-900/15' : ''}`}
              >
                <td className="px-4 py-2">
                  <span className="font-medium text-gray-900 dark:text-dark-text">{zeile.artikelnummer}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{zeile.bezeichnung}</span>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-dark-textMuted">
                  {zeile.warengruppe
                    ? WARENGRUPPEN.find((wg) => wg.wert === zeile.warengruppe)?.label ?? zeile.warengruppe
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right">{zeile.angeboteneTonnen ? tonnen(zeile.angeboteneTonnen) : '—'}</td>
                <td className="px-4 py-2 text-right">{zeile.beauftragteTonnen ? tonnen(zeile.beauftragteTonnen) : '—'}</td>
                <td className="px-4 py-2 text-right font-medium">{zeile.fakturierteTonnen ? tonnen(zeile.fakturierteTonnen) : '—'}</td>
                <td className="px-4 py-2 text-right">{zeile.warenerloes ? euro(zeile.warenerloes) : '—'}</td>
                <td className="px-4 py-2 text-right">{zeile.frachterloes ? euro(zeile.frachterloes) : '—'}</td>
                <td className="px-4 py-2 text-right">
                  {zeile.fakturiertePositionen === 0 ? (
                    '—'
                  ) : zeile.positionenOhneEk > 0 ? (
                    <span
                      className="text-amber-700 dark:text-amber-300"
                      title={`EK fehlt bei ${zeile.positionenOhneEk} von ${zeile.fakturiertePositionen} Positionen — DB1 nur über den Rest berechnet.`}
                    >
                      {euro(zeile.db1)} *
                    </span>
                  ) : (
                    euro(zeile.db1)
                  )}
                </td>
              </tr>
            ))}
            {auswertung.zeilen.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  <PackageSearch className="h-6 w-6 mx-auto mb-2" />
                  Keine finalisierten Belege in dieser Saison.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        * DB1 unvollständig — Einkaufspreis fehlt an mindestens einer Position (wird bewusst NICHT als
        100-%-Marge gezählt). {auswertung.nichtAufteilbarerErloes > 0 && (
          <>Bei {euro(auswertung.nichtAufteilbarerErloes)} Warenumsatz fehlt der Ab-Werk-Referenzpreis im Stamm — nicht in Ware/Fracht aufteilbar.</>
        )}
      </p>
    </div>
  );
};

export default ArtikelAuswertung;
