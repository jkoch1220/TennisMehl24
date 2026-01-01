/**
 * Misch-Kalkulator für Tennismehl-Chargen
 *
 * Ermöglicht das Mischen verschiedener Produktions-Chargen (Mischproben)
 * und berechnet das resultierende Produkt mit DIN-Bewertung.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Beaker,
  Plus,
  Trash2,
  Calculator,
  CheckCircle,
  XCircle,
  Lightbulb,
  Scale,
  Save,
  Info,
} from 'lucide-react';
import { Siebanalyse, MischKomponente, MischErgebnis } from '../../types/qualitaetssicherung';
import { berechneMischung, schlageOptimaleMischungVor, qsService } from '../../services/qsService';
import DINKoernungslinie from './DINKoernungslinie';

interface Props {
  alleAnalysen: Siebanalyse[];
  onMischungSpeichern?: (ergebnis: MischErgebnis) => void;
}

export default function MischKalkulator({ alleAnalysen, onMischungSpeichern }: Props) {
  // Nur Mischproben als Quellmaterial zulassen
  const verfuegbareChargen = useMemo(() =>
    alleAnalysen.filter(a => a.probenTyp === 'mischprobe'),
    [alleAnalysen]
  );

  const [komponenten, setKomponenten] = useState<MischKomponente[]>([]);
  const [mischErgebnis, setMischErgebnis] = useState<MischErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [optimalerVorschlag, setOptimalerVorschlag] = useState<{
    komponenten: MischKomponente[];
    score: number;
  } | null>(null);

  // Optimalen Vorschlag berechnen
  useEffect(() => {
    if (verfuegbareChargen.length >= 2) {
      const vorschlag = schlageOptimaleMischungVor(verfuegbareChargen);
      setOptimalerVorschlag(vorschlag);
    }
  }, [verfuegbareChargen]);

  // Komponente hinzufügen
  const handleAddKomponente = (analyseId: string) => {
    const analyse = verfuegbareChargen.find(a => a.id === analyseId);
    if (!analyse) return;

    // Prüfen ob schon vorhanden
    if (komponenten.some(k => k.analyseId === analyseId)) {
      setFehler('Diese Charge ist bereits in der Mischung enthalten');
      return;
    }

    setKomponenten(prev => [
      ...prev,
      {
        analyseId: analyse.id,
        chargenNummer: analyse.chargenNummer,
        anteil: 0,
        siebwerte: analyse.siebwerte,
      }
    ]);
    setFehler(null);
    setMischErgebnis(null);
  };

  // Komponente entfernen
  const handleRemoveKomponente = (analyseId: string) => {
    setKomponenten(prev => prev.filter(k => k.analyseId !== analyseId));
    setMischErgebnis(null);
  };

  // Anteil ändern
  const handleAnteilChange = (analyseId: string, anteil: number) => {
    setKomponenten(prev =>
      prev.map(k =>
        k.analyseId === analyseId ? { ...k, anteil: Math.max(0, Math.min(100, anteil)) } : k
      )
    );
    setMischErgebnis(null);
  };

  // Anteile automatisch gleichmäßig verteilen
  const handleGleichmaessigVerteilen = () => {
    if (komponenten.length === 0) return;
    const anteilProKomponente = Math.round(100 / komponenten.length);

    setKomponenten(prev =>
      prev.map((k, i) => ({
        ...k,
        // Letzte Komponente bekommt den Rest
        anteil: i === prev.length - 1
          ? 100 - anteilProKomponente * (prev.length - 1)
          : anteilProKomponente
      }))
    );
  };

  // Mischung berechnen
  const handleBerechnen = () => {
    if (komponenten.length < 2) {
      setFehler('Mindestens 2 Chargen für eine Mischung erforderlich');
      return;
    }

    const summe = komponenten.reduce((acc, k) => acc + k.anteil, 0);
    if (Math.abs(summe - 100) > 0.1) {
      setFehler(`Summe der Anteile muss 100% ergeben (aktuell: ${summe}%)`);
      return;
    }

    try {
      const ergebnis = berechneMischung(komponenten);
      setMischErgebnis(ergebnis);
      setFehler(null);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Berechnungsfehler');
    }
  };

  // Optimalen Vorschlag übernehmen
  const handleVorschlagUebernehmen = () => {
    if (!optimalerVorschlag) return;
    setKomponenten(optimalerVorschlag.komponenten);
    setMischErgebnis(null);
    setFehler(null);
  };

  // Mischung als neue Siebanalyse speichern
  const handleSpeichern = async () => {
    if (!mischErgebnis) return;

    try {
      await qsService.createSiebanalyse({
        pruefDatum: new Date().toISOString(),
        probenTyp: 'fertigprodukt',
        siebwerte: mischErgebnis.gemischteSiebwerte,
        notizen: `Mischung aus: ${komponenten.map(k => `${k.chargenNummer} (${k.anteil}%)`).join(', ')}`,
        istMischung: true,
        quellChargen: komponenten.map(k => k.analyseId),
        mischVerhaeltnis: komponenten.map(k => k.anteil),
      });

      onMischungSpeichern?.(mischErgebnis);
    } catch (err) {
      setFehler('Fehler beim Speichern: ' + (err instanceof Error ? err.message : 'Unbekannt'));
    }
  };

  const summeAnteile = komponenten.reduce((acc, k) => acc + k.anteil, 0);

  // Virtuelles Siebanalyse-Objekt für DINKoernungslinie
  const virtualAnalyse = mischErgebnis ? {
    id: 'mischung-preview',
    chargenNummer: 'MISCHUNG',
    pruefDatum: new Date().toISOString(),
    probenTyp: 'fertigprodukt' as const,
    siebwerte: mischErgebnis.gemischteSiebwerte,
    ergebnis: mischErgebnis.ergebnis,
    abweichungen: mischErgebnis.abweichungen,
    erstelltAm: new Date().toISOString(),
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg">
            <Beaker className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Misch-Kalkulator
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">
              Chargen kombinieren für optimale Körnung
            </p>
          </div>
        </div>
      </div>

      {/* Info-Box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">So funktioniert&apos;s:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Wähle Mischproben (Produktions-Chargen) aus</li>
              <li>Lege die Mischverhältnisse fest (Summe = 100%)</li>
              <li>Berechne das Ergebnis</li>
              <li>Bei Erfolg: Speichere als Fertigprodukt</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linke Spalte: Chargen-Auswahl */}
        <div className="space-y-4">
          {/* Chargen-Selector */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-4">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Charge hinzufügen
            </h3>

            {verfuegbareChargen.length === 0 ? (
              <p className="text-gray-500 dark:text-dark-textMuted text-center py-4">
                Keine Mischproben verfügbar. Erstelle zuerst Produktions-Proben.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {verfuegbareChargen
                  .filter(a => !komponenten.some(k => k.analyseId === a.id))
                  .map(analyse => (
                    <button
                      key={analyse.id}
                      onClick={() => handleAddKomponente(analyse.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:border-amber-300 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-dark-text">
                          {analyse.chargenNummer}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                          {new Date(analyse.pruefDatum).toLocaleDateString('de-DE')}
                          {' • '}
                          {new Date(analyse.pruefDatum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          {analyse.hammerInfo && ` • Hammer: ${analyse.hammerInfo.status}`}
                        </p>
                      </div>
                      <Plus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Optimaler Vorschlag */}
          {optimalerVorschlag && komponenten.length === 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700 p-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
                    Optimierungsvorschlag
                  </h4>
                  <div className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                    {optimalerVorschlag.komponenten.map(k => (
                      <p key={k.analyseId}>
                        {k.chargenNummer}: {k.anteil}%
                      </p>
                    ))}
                    <p className="mt-2 text-xs opacity-80">
                      {optimalerVorschlag.score === 0
                        ? 'Diese Mischung entspricht der DIN!'
                        : `${optimalerVorschlag.score} Abweichung(en)`}
                    </p>
                  </div>
                  <button
                    onClick={handleVorschlagUebernehmen}
                    className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Vorschlag übernehmen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ausgewählte Komponenten */}
          {komponenten.length > 0 && (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Mischverhältnis
                </h3>
                <button
                  onClick={handleGleichmaessigVerteilen}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                >
                  Gleichmäßig
                </button>
              </div>

              <div className="space-y-3">
                {komponenten.map(komponente => {
                  const analyse = verfuegbareChargen.find(a => a.id === komponente.analyseId);
                  return (
                    <div
                      key={komponente.analyseId}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-dark-text truncate">
                          {komponente.chargenNummer}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                          0,063mm: {analyse?.siebwerte.mm0_063}%
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={komponente.anteil}
                          onChange={(e) => handleAnteilChange(komponente.analyseId, parseInt(e.target.value) || 0)}
                          className="w-20 px-3 py-2 text-center border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-gray-600 dark:text-dark-textMuted">%</span>
                      </div>

                      <button
                        onClick={() => handleRemoveKomponente(komponente.analyseId)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Summen-Anzeige */}
              <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                Math.abs(summeAnteile - 100) < 0.1
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}>
                <span className="font-medium">Summe:</span>
                <span className="font-bold">{summeAnteile}%</span>
              </div>

              {/* Berechnen Button */}
              <button
                onClick={handleBerechnen}
                disabled={komponenten.length < 2 || Math.abs(summeAnteile - 100) > 0.1}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator className="h-5 w-5" />
                Mischung berechnen
              </button>
            </div>
          )}

          {/* Fehler-Anzeige */}
          {fehler && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-400">
              {fehler}
            </div>
          )}
        </div>

        {/* Rechte Spalte: Ergebnis */}
        <div className="space-y-4">
          {mischErgebnis && virtualAnalyse ? (
            <>
              {/* Ergebnis-Badge */}
              <div className={`p-4 rounded-xl border ${
                mischErgebnis.ergebnis === 'bestanden'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {mischErgebnis.ergebnis === 'bestanden' ? (
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                    )}
                    <div>
                      <p className={`text-xl font-bold ${
                        mischErgebnis.ergebnis === 'bestanden'
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}>
                        {mischErgebnis.ergebnis === 'bestanden' ? 'BESTANDEN' : 'NICHT BESTANDEN'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-dark-textMuted">
                        {mischErgebnis.abweichungen.length === 0
                          ? 'Alle Werte in Toleranz'
                          : `${mischErgebnis.abweichungen.length} Abweichung(en)`}
                      </p>
                    </div>
                  </div>

                  {mischErgebnis.ergebnis === 'bestanden' && (
                    <button
                      onClick={handleSpeichern}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                    >
                      <Save className="h-4 w-4" />
                      Speichern
                    </button>
                  )}
                </div>
              </div>

              {/* DIN-Diagramm */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-4">
                <DINKoernungslinie
                  analyse={virtualAnalyse}
                  zeigeMassenanteile={true}
                />
              </div>

              {/* Siebwerte-Tabelle */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-4">
                <h4 className="font-semibold text-gray-900 dark:text-dark-text mb-3">
                  Berechnete Siebwerte
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-dark-border">
                        <th className="text-left py-2 text-gray-600 dark:text-dark-textMuted">Sieb</th>
                        <th className="text-right py-2 text-gray-600 dark:text-dark-textMuted">Messwert</th>
                        <th className="text-right py-2 text-gray-600 dark:text-dark-textMuted">Toleranz</th>
                        <th className="text-center py-2 text-gray-600 dark:text-dark-textMuted">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { sieb: '2,0 mm', wert: mischErgebnis.gemischteSiebwerte.mm2_0, min: 100, max: 100 },
                        { sieb: '1,0 mm', wert: mischErgebnis.gemischteSiebwerte.mm1_0, min: 85, max: 95 },
                        { sieb: '0,63 mm', wert: mischErgebnis.gemischteSiebwerte.mm0_63, min: 65, max: 80 },
                        { sieb: '0,315 mm', wert: mischErgebnis.gemischteSiebwerte.mm0_315, min: 40, max: 60 },
                        { sieb: '0,125 mm', wert: mischErgebnis.gemischteSiebwerte.mm0_125, min: 20, max: 35 },
                        { sieb: '0,063 mm', wert: mischErgebnis.gemischteSiebwerte.mm0_063, min: 0, max: 10 },
                      ].map(row => {
                        const inToleranz = row.wert >= row.min && row.wert <= row.max;
                        return (
                          <tr key={row.sieb} className="border-b border-gray-100 dark:border-dark-border/50">
                            <td className="py-2 font-medium text-gray-900 dark:text-dark-text">{row.sieb}</td>
                            <td className={`py-2 text-right font-mono ${
                              inToleranz ? 'text-gray-900 dark:text-dark-text' : 'text-red-600 dark:text-red-400 font-bold'
                            }`}>
                              {row.wert.toFixed(1)}%
                            </td>
                            <td className="py-2 text-right text-gray-600 dark:text-dark-textMuted">
                              {row.min}-{row.max}%
                            </td>
                            <td className="py-2 text-center">
                              {inToleranz ? (
                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-dark-border p-12 text-center">
              <Calculator className="h-12 w-12 text-gray-400 dark:text-dark-textMuted mx-auto mb-4" />
              <p className="text-gray-600 dark:text-dark-textMuted">
                Wähle mindestens 2 Chargen aus und setze die Anteile,<br />
                dann berechne die Mischung.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
