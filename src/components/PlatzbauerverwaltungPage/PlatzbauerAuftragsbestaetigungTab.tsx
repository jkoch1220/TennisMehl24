/**
 * PlatzbauerAuftragsbestaetigungTab
 *
 * Auftragsbestätigung-Tab für Platzbauer-Projektabwicklung.
 * Übernimmt Positionen vom Angebot (editierbar).
 *
 * Features:
 * - Übernahme von Angebot-Positionen
 * - Auto-Save mit hatGeaendert.current Flag
 * - Dateiverlauf
 * - PDF-Generierung
 * - E-Mail-Versand
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  Loader2,
  FileSignature,
  AlertCircle,
  FileCheck,
  Trash2,
  Plus,
} from 'lucide-react';
import { PlatzbauerProjekt, PlatzbauerPosition, PlatzbauerABFormularDaten } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  speicherePlatzbauerAuftragsbestaetigung,
  speichereEntwurf,
  ladeEntwurf,
  ladeAktuellesDokument,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import PlatzbauerDokumentVerlauf from './PlatzbauerDokumentVerlauf';

interface PlatzbauerAuftragsbestaetigungTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
}

// Entwurfsdaten für Auto-Save
interface ABEntwurf {
  positionen: PlatzbauerPosition[];
  formData: {
    auftragsbestaetigungsnummer: string;
    auftragsbestaetigungsdatum: string;
    zahlungsziel: string;
    lieferzeit: string;
    bemerkung: string;
  };
}

const PlatzbauerAuftragsbestaetigungTab = ({ projekt, platzbauer }: PlatzbauerAuftragsbestaetigungTabProps) => {
  // === STATE ===
  const [positionen, setPositionen] = useState<PlatzbauerPosition[]>([]);
  const [formData, setFormData] = useState({
    auftragsbestaetigungsnummer: '',
    auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    bemerkung: '',
  });

  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [hatAngebot, setHatAngebot] = useState(false);

  // Auto-Save
  const [speicherStatus, setSpeicherStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const [initialLaden, setInitialLaden] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);

  // Verlauf
  const [verlaufLadeZaehler, setVerlaufLadeZaehler] = useState(0);

  // === DATEN LADEN ===
  useEffect(() => {
    const ladeDaten = async () => {
      if (!projekt?.id) return;

      setLaden(true);
      try {
        // Erst prüfen ob ein Entwurf existiert
        const gespeicherterEntwurf = await ladeEntwurf<ABEntwurf>(projekt.id, 'auftragsbestaetigung');

        if (gespeicherterEntwurf && gespeicherterEntwurf.positionen && gespeicherterEntwurf.positionen.length > 0) {
          // Entwurf wiederherstellen
          console.log('✅ AB-Entwurf geladen mit', gespeicherterEntwurf.positionen.length, 'Positionen');
          setPositionen(gespeicherterEntwurf.positionen);
          if (gespeicherterEntwurf.formData) {
            setFormData(prev => ({ ...prev, ...gespeicherterEntwurf.formData }));
          }
          setHatAngebot(true);
          setSpeicherStatus('gespeichert');
        } else {
          // Angebot-Positionen laden
          const angebot = await ladeAktuellesDokument(projekt.id, 'angebot');

          if (angebot && angebot.daten) {
            let angebotDaten: any;
            try {
              angebotDaten = typeof angebot.daten === 'string' ? JSON.parse(angebot.daten) : angebot.daten;
            } catch {
              angebotDaten = {};
            }

            // Positionen vom Angebot übernehmen
            if (angebotDaten.positionen && angebotDaten.positionen.length > 0) {
              const uebernommenePositionen: PlatzbauerPosition[] = angebotDaten.positionen.map((p: any) => ({
                vereinId: p.vereinId || '',
                vereinsname: p.vereinsname || '',
                vereinsprojektId: p.vereinsprojektId || '',
                menge: p.menge || 0,
                einzelpreis: p.einzelpreis || 0,
                gesamtpreis: (p.menge || 0) * (p.einzelpreis || 0),
                lieferadresse: p.lieferadresse,
              }));
              setPositionen(uebernommenePositionen);
              setHatAngebot(true);

              // Zahlungsbedingungen übernehmen
              if (angebotDaten.zahlungsziel) {
                setFormData(prev => ({
                  ...prev,
                  zahlungsziel: angebotDaten.zahlungsziel,
                  lieferzeit: angebotDaten.lieferzeit || prev.lieferzeit,
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden:', error);
      } finally {
        setLaden(false);
        setTimeout(() => {
          setInitialLaden(false);
        }, 500);
      }
    };

    ladeDaten();
  }, [projekt?.id]);

  // === AUTO-SAVE ===
  const speichereAutomatisch = useCallback(async () => {
    if (!projekt?.id || initialLaden) return;

    try {
      setSpeicherStatus('speichern');
      const entwurf: ABEntwurf = {
        positionen,
        formData,
      };
      await speichereEntwurf(projekt.id, 'auftragsbestaetigung', entwurf);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.id, initialLaden, positionen, formData]);

  // Debounced Auto-Save
  useEffect(() => {
    if (initialLaden || !hatGeaendert.current) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch();
    }, 1500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [positionen, formData, speichereAutomatisch, initialLaden]);

  // === CHANGE HANDLER ===
  const markiereGeaendert = () => {
    hatGeaendert.current = true;
  };

  const updatePosition = (index: number, updates: Partial<PlatzbauerPosition>) => {
    markiereGeaendert();
    setPositionen(prev => {
      const updated = [...prev];
      const menge = updates.menge ?? updated[index].menge;
      const einzelpreis = updates.einzelpreis ?? updated[index].einzelpreis;
      updated[index] = {
        ...updated[index],
        ...updates,
        gesamtpreis: menge * einzelpreis,
      };
      return updated;
    });
  };

  const removePosition = (index: number) => {
    markiereGeaendert();
    setPositionen(prev => prev.filter((_, i) => i !== index));
  };

  const addPosition = () => {
    markiereGeaendert();
    const neuePosition: PlatzbauerPosition = {
      vereinId: `neu-${Date.now()}`,
      vereinsname: 'Neue Position',
      vereinsprojektId: '',
      menge: 0,
      einzelpreis: 0,
      gesamtpreis: 0,
    };
    setPositionen(prev => [...prev, neuePosition]);
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    markiereGeaendert();
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // === BERECHNUNGEN ===
  const gesamtNetto = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const gesamtBrutto = gesamtNetto * 1.19;

  // === AB ERSTELLEN ===
  const handleABErstellen = async () => {
    if (positionen.length === 0) {
      alert('Bitte fügen Sie mindestens eine Position hinzu.');
      return;
    }

    setSpeichern(true);
    try {
      const formularDaten: PlatzbauerABFormularDaten = {
        auftragsbestaetigungsnummer: formData.auftragsbestaetigungsnummer,
        auftragsbestaetigungsdatum: formData.auftragsbestaetigungsdatum,
        platzbauerId: platzbauer?.id || projekt.platzbauerId,
        platzbauername: platzbauer?.name || '',
        platzbauerstrasse: platzbauer?.rechnungsadresse?.strasse || '',
        platzbauerPlzOrt: `${platzbauer?.rechnungsadresse?.plz || ''} ${platzbauer?.rechnungsadresse?.ort || ''}`.trim(),
        platzbauerAnsprechpartner: platzbauer?.dispoAnsprechpartner?.name || '',
        positionen,
        zahlungsziel: formData.zahlungsziel,
        zahlungsart: 'Überweisung',
        skontoAktiviert: false,
        skonto: { prozent: 0, tage: 0 },
        lieferzeit: formData.lieferzeit,
        frachtkosten: 0,
        verpackungskosten: 0,
        lieferbedingungenAktiviert: true,
        lieferbedingungen: 'Frei Baustelle, abgeladen',
        bemerkung: formData.bemerkung,
        ihreAnsprechpartner: '',
      };

      await speicherePlatzbauerAuftragsbestaetigung(projekt, formularDaten);
      setVerlaufLadeZaehler(prev => prev + 1);
      alert('Auftragsbestätigung wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  };

  // === RENDER ===
  if (laden) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Lade AB-Daten...</p>
      </div>
    );
  }

  if (!hatAngebot && positionen.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Kein Angebot vorhanden</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Bitte erstellen Sie zuerst ein Angebot, damit die Positionen übernommen werden können.
        </p>
        <button
          onClick={addPosition}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-200"
        >
          <Plus className="w-4 h-4" />
          Oder: Positionen manuell hinzufügen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-Save Status */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          {speicherStatus === 'speichern' && (
            <>
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
              <span className="text-orange-600 dark:text-orange-400">Speichere...</span>
            </>
          )}
          {speicherStatus === 'gespeichert' && (
            <>
              <Cloud className="w-5 h-5 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Gespeichert</span>
            </>
          )}
          {speicherStatus === 'fehler' && (
            <>
              <CloudOff className="w-5 h-5 text-red-500" />
              <span className="text-red-600 dark:text-red-400">Speicherfehler</span>
            </>
          )}
          {speicherStatus === 'idle' && (
            <>
              <Cloud className="w-5 h-5 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">Auto-Save bereit</span>
            </>
          )}
        </div>
        {hatAngebot && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <FileCheck className="w-4 h-4" />
            <span>Positionen aus Angebot übernommen</span>
          </div>
        )}
      </div>

      {/* Formular-Felder */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">AB-Daten</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AB-Nummer
            </label>
            <input
              type="text"
              value={formData.auftragsbestaetigungsnummer}
              onChange={(e) => updateFormData({ auftragsbestaetigungsnummer: e.target.value })}
              placeholder="Wird automatisch generiert"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AB-Datum
            </label>
            <input
              type="date"
              value={formData.auftragsbestaetigungsdatum}
              onChange={(e) => updateFormData({ auftragsbestaetigungsdatum: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Positionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-orange-500" />
            Positionen ({positionen.length})
          </h3>
          <button
            type="button"
            onClick={addPosition}
            className="flex items-center gap-2 px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50"
          >
            <Plus className="w-4 h-4" />
            Position hinzufügen
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Pos.</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Verein / Lieferort</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-28">Menge (t)</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-28">Preis/t</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-32">Gesamt</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((pos, index) => (
                <tr key={pos.vereinId} className="border-b border-gray-100 dark:border-slate-800">
                  <td className="py-3 px-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
                  <td className="py-3 px-2">
                    <input
                      type="text"
                      value={pos.vereinsname}
                      onChange={(e) => updatePosition(index, { vereinsname: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                    {pos.lieferadresse && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {pos.lieferadresse.plz} {pos.lieferadresse.ort}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      value={pos.menge || ''}
                      onChange={(e) => updatePosition(index, { menge: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.1"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      value={pos.einzelpreis || ''}
                      onChange={(e) => updatePosition(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">
                    {pos.gesamtpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="py-3 px-2">
                    <button
                      type="button"
                      onClick={() => removePosition(index)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zusammenfassung & Aktionen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weitere Felder */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Zahlungsziel
            </label>
            <input
              type="text"
              value={formData.zahlungsziel}
              onChange={(e) => updateFormData({ zahlungsziel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lieferzeit
            </label>
            <input
              type="text"
              value={formData.lieferzeit}
              onChange={(e) => updateFormData({ lieferzeit: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bemerkung
            </label>
            <textarea
              value={formData.bemerkung}
              onChange={(e) => updateFormData({ bemerkung: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Summen & Button */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Zusammenfassung</h4>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Positionen:</span>
              <span className="font-medium text-gray-900 dark:text-white">{positionen.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Netto:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {gesamtNetto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">MwSt. (19%):</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {(gesamtNetto * 0.19).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-gray-200 dark:border-slate-700">
              <span className="font-semibold text-gray-900 dark:text-white">Brutto:</span>
              <span className="font-bold text-orange-600 dark:text-orange-400">
                {gesamtBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          <button
            onClick={handleABErstellen}
            disabled={speichern || positionen.length === 0}
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-semibold rounded-xl hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {speichern ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Erstelle AB...
              </>
            ) : (
              <>
                <FileSignature className="w-5 h-5" />
                AB erstellen & PDF generieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dateiverlauf */}
      <div className="mt-6">
        <PlatzbauerDokumentVerlauf
          projektId={projekt.id}
          dokumentTyp="auftragsbestaetigung"
          titel="AB-Verlauf"
          maxAnzeige={3}
          ladeZaehler={verlaufLadeZaehler}
        />
      </div>
    </div>
  );
};

export default PlatzbauerAuftragsbestaetigungTab;
