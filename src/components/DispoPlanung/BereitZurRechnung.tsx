/**
 * BereitZurRechnung.tsx — Tab in der Dispo-Planung
 *
 * Zeigt alle Projekte mit dispoStatus === 'geliefert' (z.B. per digitalem
 * QR-Liefernachweis bestätigt), die noch KEINE Rechnung haben. Die gelieferten
 * Aufträge verschwinden aus der Dispo-Auftragsliste — hier landen sie für die
 * Übergabe an die Rechnungsstellung. Die Rechnung selbst bleibt bewusst ein
 * manueller Klick (Link in die Projektabwicklung, Rechnung-Tab).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Loader2,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { AuftragsbestaetigungsDaten } from '../../types/projektabwicklung';
import { projektService } from '../../services/projektService';
import {
  ladeProjektDokumente,
  getFileViewUrl,
} from '../../services/projektabwicklungDokumentService';
import OpenInNewTabButton from '../Shared/OpenInNewTabButton';

interface ZeilenDaten {
  projekt: Projekt;
  bruttoBetrag: number | null;
  liefernachweisPdfUrl: string | null;
}

/** Brutto-Betrag aus den AB-Daten schätzen (Positionen ohne Bedarfspositionen + Fracht − Rabatt, × 1,19) */
const berechneBruttoAusAB = (projekt: Projekt): number | null => {
  if (!projekt.auftragsbestaetigungsDaten) return null;
  try {
    const ab = JSON.parse(projekt.auftragsbestaetigungsDaten) as AuftragsbestaetigungsDaten;
    if (!ab.positionen?.length) return null;
    const netto = ab.positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((sum, p) => sum + (p.gesamtpreis || 0), 0);
    const nettoMitFracht = netto + (ab.frachtkosten || 0) + (ab.verpackungskosten || 0);
    const rabatt = nettoMitFracht * ((ab.gesamtrabattProzent || 0) / 100);
    return (nettoMitFracht - rabatt) * 1.19;
  } catch {
    return null;
  }
};

const formatBetrag = (betrag: number): string =>
  betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const formatDatumZeit = (iso?: string): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const BereitZurRechnung = () => {
  const navigate = useNavigate();
  const [zeilen, setZeilen] = useState<ZeilenDaten[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeDaten = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const alleProjekte = await projektService.loadProjekte();

      // Geliefert, aber noch ohne Rechnung (und nicht verloren/bezahlt)
      const bereit = alleProjekte.filter(
        (p) =>
          p.dispoStatus === 'geliefert' &&
          !p.rechnungId &&
          !p.rechnungsnummer &&
          p.status !== 'rechnung' &&
          p.status !== 'bezahlt' &&
          p.status !== 'verloren'
      );

      // Liefernachweis-PDFs (archivierte Dokumente) nachladen — Best Effort
      const mitDokumenten: ZeilenDaten[] = await Promise.all(
        bereit.map(async (projekt) => {
          let liefernachweisPdfUrl: string | null = null;
          if (projekt.liefernachweisAm) {
            try {
              const dokumente = await ladeProjektDokumente(projekt.$id || projekt.id);
              const nachweis = dokumente.find((d) => d.dokumentTyp === 'liefernachweis');
              if (nachweis?.dateiId) {
                liefernachweisPdfUrl = getFileViewUrl(nachweis.dateiId);
              }
            } catch {
              // Dokument-Verknüpfung ist optional
            }
          }
          return {
            projekt,
            bruttoBetrag: berechneBruttoAusAB(projekt),
            liefernachweisPdfUrl,
          };
        })
      );

      // Neueste Liefernachweise zuerst
      mitDokumenten.sort((a, b) =>
        (b.projekt.liefernachweisAm || b.projekt.geaendertAm || '').localeCompare(
          a.projekt.liefernachweisAm || a.projekt.geaendertAm || ''
        )
      );
      setZeilen(mitDokumenten);
    } catch (error) {
      console.error('Fehler beim Laden der Liste „Bereit zur Rechnung":', error);
      setFehler('Die Liste konnte nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void ladeDaten();
  }, [ladeDaten]);

  const gesamtBrutto = useMemo(
    () => zeilen.reduce((sum, z) => sum + (z.bruttoBetrag || 0), 0),
    [zeilen]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Lade gelieferte Aufträge …</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kopf mit Summen */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Bereit zur Rechnung
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {zeilen.length} gelieferte{' '}
            {zeilen.length === 1 ? 'Auftrag' : 'Aufträge'} ohne Rechnung
            {gesamtBrutto > 0 && ` · ca. ${formatBetrag(gesamtBrutto)} brutto offen`}
          </p>
        </div>
        <button
          onClick={() => void ladeDaten()}
          className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          title="Neu laden"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {fehler && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{fehler}</p>
      )}

      {zeilen.length === 0 && !fehler ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <p className="mt-3 font-semibold text-gray-900 dark:text-white">
            Alles abgerechnet!
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Aktuell gibt es keine gelieferten Aufträge ohne Rechnung.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900/50 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">Kunde / Projekt</th>
                  <th className="px-4 py-3">Geliefert am</th>
                  <th className="px-4 py-3">Nachweis</th>
                  <th className="px-4 py-3 text-right">Betrag (brutto, ca.)</th>
                  <th className="px-4 py-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {zeilen.map(({ projekt, bruttoBetrag, liefernachweisPdfUrl }) => {
                  const projektId = projekt.$id || projekt.id;
                  const rechnungUrl = `/projektabwicklung/${projektId}?tab=rechnung`;
                  return (
                    <tr
                      key={projektId}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {projekt.kundenname}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {projekt.projektName}
                          {projekt.lieferscheinnummer && ` · LS ${projekt.lieferscheinnummer}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {projekt.liefernachweisAm ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Camera className="h-4 w-4 text-emerald-500" />
                            {formatDatumZeit(projekt.liefernachweisAm)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">
                            manuell auf „geliefert" gesetzt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {liefernachweisPdfUrl ? (
                          <a
                            href={liefernachweisPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Liefernachweis
                          </a>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {bruttoBetrag !== null ? formatBetrag(bruttoBetrag) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(rechnungUrl)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 font-medium transition-colors"
                          >
                            <FileSignature className="h-4 w-4" />
                            Rechnung erstellen
                          </button>
                          <OpenInNewTabButton to={rechnungUrl} appearOnGroupHover={false} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Die Rechnung wird bewusst NICHT automatisch erstellt — „Rechnung erstellen" öffnet die
        Projektabwicklung im Rechnung-Tab.
      </p>
    </div>
  );
};

export default BereitZurRechnung;
