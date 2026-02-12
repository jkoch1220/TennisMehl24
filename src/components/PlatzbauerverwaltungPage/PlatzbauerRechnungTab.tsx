/**
 * PlatzbauerRechnungTab
 *
 * Rechnungs-Tab für Platzbauer-Projektabwicklung.
 * Inkl. Proforma-Rechnung Funktion.
 *
 * Features:
 * - Übernahme von AB/Angebot-Positionen
 * - Proforma-Rechnung erstellen (mehrere möglich)
 * - Finale Rechnung erstellen
 * - Proforma-Abzug optional
 * - Leistungsdatum + Zahlungsziel
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  Loader2,
  FileText,
  AlertCircle,
  Receipt,
  Calculator,
  CheckCircle2,
  Trash2,
  Plus,
} from 'lucide-react';
import { PlatzbauerProjekt, PlatzbauerPosition, PlatzbauerRechnungFormularDaten, PlatzbauerProformaRechnungFormularDaten, GespeichertesPlatzbauerDokument } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  speicherePlatzbauerRechnung,
  speicherePlatzbauerProformaRechnung,
  speichereEntwurf,
  ladeEntwurf,
  ladeAktuellesDokument,
  ladeDokumenteNachTyp,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import PlatzbauerDokumentVerlauf from './PlatzbauerDokumentVerlauf';

interface PlatzbauerRechnungTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
}

// Entwurfsdaten für Auto-Save
interface RechnungEntwurf {
  positionen: PlatzbauerPosition[];
  formData: {
    rechnungsnummer: string;
    rechnungsdatum: string;
    leistungsdatum: string;
    zahlungsziel: string;
    bemerkung: string;
    proformaAbzugAktiviert: boolean;
    proformaAbzugBetrag: number;
    proformaAbzugNummer: string;
  };
}

const PlatzbauerRechnungTab = ({ projekt, platzbauer }: PlatzbauerRechnungTabProps) => {
  // === STATE ===
  const [positionen, setPositionen] = useState<PlatzbauerPosition[]>([]);
  const [formData, setFormData] = useState({
    rechnungsnummer: '',
    rechnungsdatum: new Date().toISOString().split('T')[0],
    leistungsdatum: new Date().toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
    bemerkung: '',
    proformaAbzugAktiviert: false,
    proformaAbzugBetrag: 0,
    proformaAbzugNummer: '',
  });

  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [proformaSpeichern, setProformaSpeichern] = useState(false);
  const [hatRechnung, setHatRechnung] = useState(false);
  const [proformaRechnungen, setProformaRechnungen] = useState<GespeichertesPlatzbauerDokument[]>([]);

  // Auto-Save
  const [speicherStatus, setSpeicherStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const [initialLaden, setInitialLaden] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);

  // Verlauf
  const [verlaufLadeZaehler, setVerlaufLadeZaehler] = useState(0);
  const [proformaVerlaufLadeZaehler, setProformaVerlaufLadeZaehler] = useState(0);

  // === DATEN LADEN ===
  useEffect(() => {
    const ladeDaten = async () => {
      if (!projekt?.id) return;

      setLaden(true);
      try {
        // Prüfen ob bereits eine Rechnung existiert
        const bestehendeRechnung = await ladeAktuellesDokument(projekt.id, 'rechnung');
        if (bestehendeRechnung) {
          setHatRechnung(true);
        }

        // Proforma-Rechnungen laden
        const proformas = await ladeDokumenteNachTyp(projekt.id, 'proformarechnung');
        setProformaRechnungen(proformas);

        // Erst Entwurf prüfen
        const gespeicherterEntwurf = await ladeEntwurf<RechnungEntwurf>(projekt.id, 'rechnung');

        if (gespeicherterEntwurf && gespeicherterEntwurf.positionen && gespeicherterEntwurf.positionen.length > 0) {
          console.log('✅ Rechnungs-Entwurf geladen');
          setPositionen(gespeicherterEntwurf.positionen);
          if (gespeicherterEntwurf.formData) {
            setFormData(prev => ({ ...prev, ...gespeicherterEntwurf.formData }));
          }
          setSpeicherStatus('gespeichert');
        } else {
          // Positionen aus AB oder Angebot laden
          let positionenGeladen: PlatzbauerPosition[] = [];

          // Erst AB prüfen
          const ab = await ladeAktuellesDokument(projekt.id, 'auftragsbestaetigung');
          if (ab && ab.daten) {
            let abDaten: any;
            try {
              abDaten = typeof ab.daten === 'string' ? JSON.parse(ab.daten) : ab.daten;
            } catch {
              abDaten = {};
            }
            if (abDaten.positionen && abDaten.positionen.length > 0) {
              positionenGeladen = abDaten.positionen.map((p: any) => ({
                vereinId: p.vereinId || '',
                vereinsname: p.vereinsname || '',
                vereinsprojektId: p.vereinsprojektId || '',
                menge: p.menge || 0,
                einzelpreis: p.einzelpreis || 0,
                gesamtpreis: (p.menge || 0) * (p.einzelpreis || 0),
                lieferadresse: p.lieferadresse,
              }));

              // Zahlungsbedingungen übernehmen
              if (abDaten.zahlungsziel) {
                setFormData(prev => ({
                  ...prev,
                  zahlungsziel: abDaten.zahlungsziel,
                }));
              }
            }
          }

          // Falls keine AB, dann Angebot
          if (positionenGeladen.length === 0) {
            const angebot = await ladeAktuellesDokument(projekt.id, 'angebot');
            if (angebot && angebot.daten) {
              let angebotDaten: any;
              try {
                angebotDaten = typeof angebot.daten === 'string' ? JSON.parse(angebot.daten) : angebot.daten;
              } catch {
                angebotDaten = {};
              }
              if (angebotDaten.positionen && angebotDaten.positionen.length > 0) {
                positionenGeladen = angebotDaten.positionen.map((p: any) => ({
                  vereinId: p.vereinId || '',
                  vereinsname: p.vereinsname || '',
                  vereinsprojektId: p.vereinsprojektId || '',
                  menge: p.menge || 0,
                  einzelpreis: p.einzelpreis || 0,
                  gesamtpreis: (p.menge || 0) * (p.einzelpreis || 0),
                  lieferadresse: p.lieferadresse,
                }));

                if (angebotDaten.zahlungsziel) {
                  setFormData(prev => ({
                    ...prev,
                    zahlungsziel: angebotDaten.zahlungsziel,
                  }));
                }
              }
            }
          }

          setPositionen(positionenGeladen);
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
    if (!projekt?.id || initialLaden || hatRechnung) return;

    try {
      setSpeicherStatus('speichern');
      const entwurf: RechnungEntwurf = {
        positionen,
        formData,
      };
      await speichereEntwurf(projekt.id, 'rechnung', entwurf);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.id, initialLaden, hatRechnung, positionen, formData]);

  // Debounced Auto-Save
  useEffect(() => {
    if (initialLaden || !hatGeaendert.current || hatRechnung) return;

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
  }, [positionen, formData, speichereAutomatisch, initialLaden, hatRechnung]);

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
  const proformaAbzug = formData.proformaAbzugAktiviert ? formData.proformaAbzugBetrag : 0;
  const zahlbetrag = gesamtBrutto - proformaAbzug;

  // === PROFORMA ERSTELLEN ===
  const handleProformaErstellen = async () => {
    if (positionen.length === 0) {
      alert('Bitte fügen Sie mindestens eine Position hinzu.');
      return;
    }

    setProformaSpeichern(true);
    try {
      const formularDaten: PlatzbauerProformaRechnungFormularDaten = {
        proformarechnungsnummer: '',
        proformarechnungsdatum: formData.rechnungsdatum,
        leistungsdatum: formData.leistungsdatum,
        platzbauerId: platzbauer?.id || projekt.platzbauerId,
        platzbauername: platzbauer?.name || '',
        platzbauerstrasse: platzbauer?.rechnungsadresse?.strasse || '',
        platzbauerPlzOrt: `${platzbauer?.rechnungsadresse?.plz || ''} ${platzbauer?.rechnungsadresse?.ort || ''}`.trim(),
        platzbauerAnsprechpartner: platzbauer?.dispoAnsprechpartner?.name || '',
        positionen,
        zahlungsziel: formData.zahlungsziel,
        skontoAktiviert: false,
        skonto: { prozent: 0, tage: 0 },
        bemerkung: formData.bemerkung,
        ihreAnsprechpartner: '',
      };

      const neueProforma = await speicherePlatzbauerProformaRechnung(projekt, formularDaten);
      setProformaRechnungen(prev => [neueProforma, ...prev]);
      setProformaVerlaufLadeZaehler(prev => prev + 1);
      alert('Proforma-Rechnung wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setProformaSpeichern(false);
    }
  };

  // === RECHNUNG ERSTELLEN ===
  const handleRechnungErstellen = async () => {
    if (positionen.length === 0) {
      alert('Bitte fügen Sie mindestens eine Position hinzu.');
      return;
    }

    if (hatRechnung) {
      alert('Für dieses Projekt existiert bereits eine Rechnung.');
      return;
    }

    const bestaetigung = confirm(
      'Achtung: Eine finale Rechnung kann nicht mehr geändert werden.\n\nMöchten Sie die Rechnung jetzt erstellen?'
    );
    if (!bestaetigung) return;

    setSpeichern(true);
    try {
      const formularDaten: PlatzbauerRechnungFormularDaten = {
        rechnungsnummer: formData.rechnungsnummer,
        rechnungsdatum: formData.rechnungsdatum,
        leistungsdatum: formData.leistungsdatum,
        platzbauerId: platzbauer?.id || projekt.platzbauerId,
        platzbauername: platzbauer?.name || '',
        platzbauerstrasse: platzbauer?.rechnungsadresse?.strasse || '',
        platzbauerPlzOrt: `${platzbauer?.rechnungsadresse?.plz || ''} ${platzbauer?.rechnungsadresse?.ort || ''}`.trim(),
        platzbauerAnsprechpartner: platzbauer?.dispoAnsprechpartner?.name || '',
        positionen,
        zahlungsziel: formData.zahlungsziel,
        skontoAktiviert: false,
        skonto: { prozent: 0, tage: 0 },
        proformaAbzugAktiviert: formData.proformaAbzugAktiviert,
        proformaAbzugBetrag: formData.proformaAbzugBetrag,
        proformaAbzugNummer: formData.proformaAbzugNummer,
        bemerkung: formData.bemerkung,
        ihreAnsprechpartner: '',
      };

      await speicherePlatzbauerRechnung(projekt, formularDaten);
      setHatRechnung(true);
      setVerlaufLadeZaehler(prev => prev + 1);
      alert('Rechnung wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  };

  // Proforma für Abzug auswählen
  const handleProformaAuswahl = (proforma: GespeichertesPlatzbauerDokument) => {
    let betrag = 0;
    if (proforma.daten) {
      try {
        const daten = typeof proforma.daten === 'string' ? JSON.parse(proforma.daten) : proforma.daten;
        betrag = daten.bruttobetrag || 0;
      } catch {
        betrag = 0;
      }
    }

    updateFormData({
      proformaAbzugAktiviert: true,
      proformaAbzugBetrag: betrag,
      proformaAbzugNummer: proforma.dokumentNummer,
    });
  };

  // === RENDER ===
  if (laden) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Lade Rechnungsdaten...</p>
      </div>
    );
  }

  // Rechnung bereits erstellt
  if (hatRechnung) {
    return (
      <div className="space-y-6">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-8 text-center border border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-2">
            Rechnung erstellt
          </h3>
          <p className="text-green-600 dark:text-green-400">
            Die finale Rechnung wurde erfolgreich erstellt und kann nicht mehr geändert werden.
          </p>
        </div>

        {/* Rechnungsverlauf */}
        <PlatzbauerDokumentVerlauf
          projektId={projekt.id}
          dokumentTyp="rechnung"
          titel="Rechnung"
          maxAnzeige={1}
          ladeZaehler={verlaufLadeZaehler}
        />

        {/* Proforma-Verlauf */}
        {proformaRechnungen.length > 0 && (
          <PlatzbauerDokumentVerlauf
            projektId={projekt.id}
            dokumentTyp="proformarechnung"
            titel="Proforma-Rechnungen"
            maxAnzeige={5}
            ladeZaehler={proformaVerlaufLadeZaehler}
          />
        )}
      </div>
    );
  }

  if (positionen.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Keine Positionen vorhanden</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Bitte erstellen Sie zuerst ein Angebot oder eine Auftragsbestätigung.
        </p>
        <button
          onClick={addPosition}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200"
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
              <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              <span className="text-red-600 dark:text-red-400">Speichere...</span>
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
      </div>

      {/* Proforma-Rechnung Bereich */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Proforma-Rechnung
          </h3>
          <button
            onClick={handleProformaErstellen}
            disabled={proformaSpeichern}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-700 hover:to-orange-700 disabled:opacity-50"
          >
            {proformaSpeichern ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Erstelle...
              </>
            ) : (
              <>
                <Receipt className="w-4 h-4" />
                Proforma erstellen
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Eine Proforma-Rechnung dient zur Vorabinformation und kann mehrfach erstellt werden.
        </p>

        {/* Proforma-Verlauf */}
        {proformaRechnungen.length > 0 && (
          <div className="mt-4">
            <PlatzbauerDokumentVerlauf
              projektId={projekt.id}
              dokumentTyp="proformarechnung"
              titel="Proforma-Rechnungen"
              maxAnzeige={3}
              ladeZaehler={proformaVerlaufLadeZaehler}
            />
          </div>
        )}
      </div>

      {/* Formular-Felder */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Rechnungsdaten</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rechnungsnummer
            </label>
            <input
              type="text"
              value={formData.rechnungsnummer}
              onChange={(e) => updateFormData({ rechnungsnummer: e.target.value })}
              placeholder="Wird automatisch generiert"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rechnungsdatum
            </label>
            <input
              type="date"
              value={formData.rechnungsdatum}
              onChange={(e) => updateFormData({ rechnungsdatum: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Leistungsdatum
            </label>
            <input
              type="date"
              value={formData.leistungsdatum}
              onChange={(e) => updateFormData({ leistungsdatum: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Positionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-500" />
            Positionen ({positionen.length})
          </h3>
          <button
            type="button"
            onClick={addPosition}
            className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
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

      {/* Proforma-Abzug */}
      {proformaRechnungen.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              id="proformaAbzug"
              checked={formData.proformaAbzugAktiviert}
              onChange={(e) => updateFormData({ proformaAbzugAktiviert: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <label htmlFor="proformaAbzug" className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-500" />
              Proforma-Betrag abziehen
            </label>
          </div>

          {formData.proformaAbzugAktiviert && (
            <div className="ml-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proforma-Nummer
                  </label>
                  <select
                    value={formData.proformaAbzugNummer}
                    onChange={(e) => {
                      const selected = proformaRechnungen.find(p => p.dokumentNummer === e.target.value);
                      if (selected) handleProformaAuswahl(selected);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Bitte auswählen...</option>
                    {proformaRechnungen.map(p => (
                      <option key={p.$id || p.id} value={p.dokumentNummer}>
                        {p.dokumentNummer}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Abzugsbetrag (Brutto)
                  </label>
                  <input
                    type="number"
                    value={formData.proformaAbzugBetrag || ''}
                    onChange={(e) => updateFormData({ proformaAbzugBetrag: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-slate-700">
              <span className="font-semibold text-gray-900 dark:text-white">Brutto:</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {gesamtBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            </div>

            {proformaAbzug > 0 && (
              <>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>./. Proforma ({formData.proformaAbzugNummer}):</span>
                  <span>-{proformaAbzug.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t border-gray-200 dark:border-slate-700">
                  <span className="font-semibold text-gray-900 dark:text-white">Zu zahlen:</span>
                  <span className="font-bold text-red-600 dark:text-red-400">
                    {zahlbetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </span>
                </div>
              </>
            )}

            {proformaAbzug === 0 && (
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-gray-900 dark:text-white">Zu zahlen:</span>
                <span className="font-bold text-red-600 dark:text-red-400">
                  {gesamtBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleRechnungErstellen}
            disabled={speichern || positionen.length === 0}
            className="w-full py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-xl hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {speichern ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Erstelle Rechnung...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Finale Rechnung erstellen
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Eine finale Rechnung kann nicht mehr geändert werden.
          </p>
        </div>
      </div>

      {/* Rechnungsverlauf */}
      <div className="mt-6">
        <PlatzbauerDokumentVerlauf
          projektId={projekt.id}
          dokumentTyp="rechnung"
          titel="Rechnungs-Verlauf"
          maxAnzeige={1}
          ladeZaehler={verlaufLadeZaehler}
        />
      </div>
    </div>
  );
};

export default PlatzbauerRechnungTab;
