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
 * - Staffelvereinbarungen aus dem Angebot (schreibgeschützt, gepflegt wird im Angebot)
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
import {
  PlatzbauerProjekt,
  PlatzbauerPosition,
  PlatzbauerABFormularDaten,
  PlatzbauerAngebotPosition,
  StaffelKonditionen,
} from '../../types/platzbauer';
import {
  Angebotsbezug,
  bezugIstAktuell,
  leseStaffelStand,
  uebernehmeStaffelnFuerAB,
} from '../../utils/staffelUebernahme';
import { bestimmeHerkunftAusSorten } from '../../utils/preisHerkunft';
import {
  STAFFEL_MENGENBASEN,
  STAFFEL_MODELLE,
  formatDatumDe,
  formatTonnen,
  staffelKurzfassung,
} from '../../utils/staffelpreisText';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  speicherePlatzbauerAuftragsbestaetigung,
  speichereEntwurf,
  ladeEntwurf,
  ladeAktuellesDokument,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import PlatzbauerDokumentVerlauf from './PlatzbauerDokumentVerlauf';
import { ladeBelegVorbelegung } from '../../utils/platzbauerBelegVorbelegung';
import { NumberInput } from '../NumberInput';

interface PlatzbauerAuftragsbestaetigungTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
}

// Entwurfsdaten für Auto-Save
interface ABEntwurf {
  positionen: PlatzbauerPosition[];
  staffelPositionen?: PlatzbauerAngebotPosition[];
  /** Standard-Preisliste aus dem Angebot – wird mitbestätigt. */
  preislistenPositionen?: PlatzbauerAngebotPosition[];
  staffelKonditionen?: StaffelKonditionen;
  angebotsbezug?: Angebotsbezug;
  formData: {
    auftragsbestaetigungsnummer: string;
    auftragsbestaetigungsdatum: string;
    zahlungsziel: string;
    lieferzeit: string;
    /** Fehlt in Entwürfen vor 09/2026 – dann gilt Angebot bzw. Vorbelegung. */
    lieferbedingungen?: string;
    bemerkung: string;
  };
}

const PlatzbauerAuftragsbestaetigungTab = ({ projekt, platzbauer }: PlatzbauerAuftragsbestaetigungTabProps) => {
  // === STATE ===
  const [positionen, setPositionen] = useState<PlatzbauerPosition[]>([]);
  // Staffelzeilen aus dem Angebot: hier nur bestätigt, nicht gepflegt.
  const [staffelPositionen, setStaffelPositionen] = useState<PlatzbauerAngebotPosition[]>([]);
  /** Standard-Preisliste des Angebots (ohne Menge, ohne Summe). */
  const [preislistenPositionen, setPreislistenPositionen] = useState<PlatzbauerAngebotPosition[]>([]);
  const [staffelKonditionen, setStaffelKonditionen] = useState<StaffelKonditionen | null>(null);
  const [angebotsbezug, setAngebotsbezug] = useState<Angebotsbezug | null>(null);
  /** Das Angebot ist neuer als die übernommenen Staffeln – Hinweis statt stiller Übernahme. */
  const [angebotNeuer, setAngebotNeuer] = useState<Angebotsbezug | null>(null);
  /** Bereits erstellte AB (aus dem Dokument, überlebt den Tabwechsel). */
  const [bestehendeAB, setBestehendeAB] = useState<{ nummer: string; datum?: string } | null>(null);
  /**
   * Gesperrt, solange eine AB vorliegt und seither nichts geändert wurde –
   * gespeist aus dem Dokument (überlebt den Tabwechsel) und aus dem Erstellen.
   */
  const [abGesperrt, setAbGesperrt] = useState(false);
  const [abErstellt, setAbErstellt] = useState(false);
  const [formData, setFormData] = useState({
    auftragsbestaetigungsnummer: '',
    auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: '',
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
        // Vorbelegung aus den Belegtexten; Angebot und Entwurf überschreiben
        // sie gleich danach, sofern sie einen eigenen Text tragen.
        const vorbelegung = await ladeBelegVorbelegung();
        setFormData(prev => ({
          ...prev,
          lieferbedingungen: vorbelegung.lieferbedingungen,
          bemerkung: prev.bemerkung || vorbelegung.bemerkung,
        }));

        // Erst prüfen ob ein Entwurf existiert
        const gespeicherterEntwurf = await ladeEntwurf<ABEntwurf>(projekt.id, 'auftragsbestaetigung');

        // Existiert bereits eine AB? Der Knopfzustand darf nicht nur im
        // flüchtigen State leben – nach einem Tabwechsel entstünde sonst
        // unbemerkt eine zweite Fassung.
        try {
          const vorhandeneAB = await ladeAktuellesDokument(projekt.id, 'auftragsbestaetigung');
          if (vorhandeneAB) {
            let abDatum: string | undefined;
            try {
              const abDaten =
                typeof vorhandeneAB.daten === 'string' ? JSON.parse(vorhandeneAB.daten) : vorhandeneAB.daten;
              abDatum = abDaten?.auftragsbestaetigungsdatum;
            } catch {
              abDatum = undefined;
            }
            setBestehendeAB({ nummer: vorhandeneAB.dokumentNummer, datum: abDatum });
            setAbGesperrt(true);
          }
        } catch (e) {
          console.warn('Vorhandene AB konnte nicht geladen werden:', e);
        }

        // Ein Entwurf zählt auch ohne Vereinszeilen: Eine reine
        // Staffelvereinbarung ginge sonst bei jedem Tabwechsel verloren.
        const entwurfHatInhalt =
          !!gespeicherterEntwurf?.positionen?.length || !!gespeicherterEntwurf?.staffelPositionen?.length;

        if (gespeicherterEntwurf && entwurfHatInhalt) {
          // Entwurf wiederherstellen
          console.log('✅ AB-Entwurf geladen mit', gespeicherterEntwurf.positionen?.length || 0, 'Positionen');
          setPositionen(gespeicherterEntwurf.positionen || []);
          // Das aktuelle Angebot wird IMMER mitgelesen: Ein Entwurf kann
          // Staffeln aus einem inzwischen überholten Angebot tragen, und eine
          // AB, die veraltete Preise bestätigt, ist der teuerste Fehler hier.
          let aktuellerBezug: Angebotsbezug | null = null;
          let nachgezogen: ReturnType<typeof leseStaffelStand> | null = null;
          try {
            const angebot = await ladeAktuellesDokument(projekt.id, 'angebot');
            if (angebot?.daten) {
              nachgezogen = leseStaffelStand(angebot.daten, projekt.saisonjahr);
              aktuellerBezug = {
                nummer: angebot.dokumentNummer || '',
                datum: nachgezogen.angebotsdatum,
                dokumentId: angebot.$id || angebot.id,
                version: nachgezogen.version,
              };
            }
          } catch (e) {
            console.warn('Aktuelles Angebot konnte nicht gelesen werden:', e);
          }

          if (gespeicherterEntwurf.preislistenPositionen?.length) {
            setPreislistenPositionen(gespeicherterEntwurf.preislistenPositionen);
          } else if (nachgezogen?.preislistenPositionen.length) {
            setPreislistenPositionen(nachgezogen.preislistenPositionen);
          }

          if (gespeicherterEntwurf.staffelPositionen?.length) {
            setStaffelPositionen(gespeicherterEntwurf.staffelPositionen);
            setStaffelKonditionen(gespeicherterEntwurf.staffelKonditionen || null);
            setAngebotsbezug(gespeicherterEntwurf.angebotsbezug || null);
            // Gehört der Entwurf noch zum aktuellen Angebot? Wenn nicht, wird
            // nichts stillschweigend ersetzt, sondern angeboten.
            if (
              nachgezogen?.hatStaffel &&
              !bezugIstAktuell(gespeicherterEntwurf.angebotsbezug, aktuellerBezug)
            ) {
              setAngebotNeuer(aktuellerBezug);
            }
          } else if (nachgezogen?.hatStaffel) {
            // Ein Entwurf ohne Staffeln (etwa aus der Zeit vor dieser Maske
            // oder mit nur einer manuell angelegten Zeile) darf die
            // Staffelvereinbarung nicht dauerhaft verdecken. Trägt er
            // Vereinszeilen aus einem anderen Angebot, wird nicht still
            // gemischt, sondern gefragt.
            const uebernommen = uebernehmeStaffelnFuerAB(nachgezogen);
            if (gespeicherterEntwurf.positionen?.length) {
              setAngebotNeuer(aktuellerBezug);
            } else {
              setStaffelPositionen(uebernommen.staffelPositionen);
              setPreislistenPositionen(uebernommen.preislistenPositionen);
              setStaffelKonditionen(uebernommen.konditionen);
              setAngebotsbezug(aktuellerBezug);
            }
          }
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

            // Staffeln aus dem Angebot übernehmen (Saisonvereinbarung ohne Menge)
            const staffelStand = leseStaffelStand(angebotDaten, projekt.saisonjahr);
            // Die Preisliste hängt nicht an der Staffel: Auch ein Angebot ohne
            // Staffelvereinbarung trägt die Standardkonditionen.
            setPreislistenPositionen(staffelStand.preislistenPositionen);
            if (staffelStand.hatStaffel) {
              const uebernommen = uebernehmeStaffelnFuerAB(staffelStand);
              setStaffelPositionen(uebernommen.staffelPositionen);
              setStaffelKonditionen(uebernommen.konditionen);
              setAngebotsbezug({
                nummer: angebot.dokumentNummer || angebotDaten.angebotsnummer || '',
                datum: staffelStand.angebotsdatum,
                dokumentId: angebot.$id || angebot.id,
                version: staffelStand.version,
              });
              setHatAngebot(true);
            }

            // Zahlungsbedingungen übernehmen – unabhängig von den Positionen,
            // eine reine Staffel-AB hat keine.
            if (angebotDaten.zahlungsziel) {
              setFormData(prev => ({ ...prev, zahlungsziel: angebotDaten.zahlungsziel }));
            }
            if (angebotDaten.lieferzeit) {
              setFormData(prev => ({ ...prev, lieferzeit: angebotDaten.lieferzeit }));
            }
            // Die AB bestätigt, was das Angebot zugesagt hat – also auch dessen
            // Lieferbedingungen, nicht die (evtl. inzwischen geänderte) Vorlage.
            if (typeof angebotDaten.lieferbedingungen === 'string' && angebotDaten.lieferbedingungen.trim()) {
              setFormData(prev => ({ ...prev, lieferbedingungen: angebotDaten.lieferbedingungen }));
            }

            // Positionen vom Angebot übernehmen
            if (angebotDaten.positionen && angebotDaten.positionen.length > 0) {
              // Preisherkunft mit übernehmen: Was die AB bestätigt, soll die
              // Rechnung später unverändert ausweisen können.
              const sorten = staffelStand.staffelPositionen.map(sp => ({
                bezeichnung: sp.bezeichnung,
                artikelnummer: sp.artikelnummer,
                staffeln: sp.staffelpreise?.staffeln,
              }));
              const uebernommenePositionen: PlatzbauerPosition[] = angebotDaten.positionen.map((p: any) => ({
                vereinId: p.vereinId || '',
                vereinsname: p.vereinsname || '',
                vereinsprojektId: p.vereinsprojektId || '',
                menge: p.menge || 0,
                einzelpreis: p.einzelpreis || 0,
                gesamtpreis: (p.menge || 0) * (p.einzelpreis || 0),
                lieferadresse: p.lieferadresse,
                preisHerkunft: bestimmeHerkunftAusSorten(p.einzelpreis || 0, sorten).text,
              }));
              setPositionen(uebernommenePositionen);
              setHatAngebot(true);
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
        staffelPositionen: staffelPositionen.length > 0 ? staffelPositionen : undefined,
        preislistenPositionen: preislistenPositionen.length > 0 ? preislistenPositionen : undefined,
        staffelKonditionen: staffelKonditionen || undefined,
        angebotsbezug: angebotsbezug || undefined,
        formData,
      };
      await speichereEntwurf(projekt.id, 'auftragsbestaetigung', entwurf);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.id, initialLaden, positionen, staffelPositionen, preislistenPositionen, staffelKonditionen, angebotsbezug, formData]);

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
  }, [positionen, staffelPositionen, preislistenPositionen, formData, speichereAutomatisch, initialLaden]);

  // === CHANGE HANDLER ===
  const markiereGeaendert = () => {
    hatGeaendert.current = true;
    setAbErstellt(false);
    setAbGesperrt(false);
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

  /** Staffeln (und den Bezug) aus dem inzwischen neueren Angebot holen. */
  const uebernehmeAktuellesAngebot = async () => {
    try {
      const angebot = await ladeAktuellesDokument(projekt.id, 'angebot');
      if (!angebot?.daten) return;
      const stand = leseStaffelStand(angebot.daten, projekt.saisonjahr);
      if (!stand.hatStaffel) return;
      const uebernommen = uebernehmeStaffelnFuerAB(stand);
      markiereGeaendert();
      setStaffelPositionen(uebernommen.staffelPositionen);
      setPreislistenPositionen(uebernommen.preislistenPositionen);
      setStaffelKonditionen(uebernommen.konditionen);
      setAngebotsbezug({
        nummer: angebot.dokumentNummer || '',
        datum: stand.angebotsdatum,
        dokumentId: angebot.$id || angebot.id,
        version: stand.version,
      });
      setAngebotNeuer(null);
    } catch (e) {
      console.error('Übernahme fehlgeschlagen:', e);
      alert('Das Angebot konnte nicht gelesen werden.');
    }
  };

  // === BERECHNUNGEN ===
  const gesamtNetto = positionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const gesamtBrutto = gesamtNetto * 1.19;

  // === AB ERSTELLEN ===
  const handleABErstellen = async () => {
    if (positionen.length === 0 && staffelPositionen.length === 0) {
      alert('Bitte fügen Sie mindestens eine Position hinzu.');
      return;
    }

    // Den laufenden Entwurfs-Debounce abbrechen: Sonst schreibt er nach dem
    // Erstellen weiter auf dieselbe Projektspalte und kann Status und
    // AB-Metadaten wieder überschreiben.
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    hatGeaendert.current = false;

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
        lieferbedingungenAktiviert: formData.lieferbedingungen.trim().length > 0,
        lieferbedingungen: formData.lieferbedingungen,
        bemerkung: formData.bemerkung,
        ihreAnsprechpartner: '',
        abPositionen:
          staffelPositionen.length + preislistenPositionen.length > 0
            ? [...staffelPositionen, ...preislistenPositionen]
            : undefined,
        staffelKonditionen: staffelKonditionen || undefined,
        angebotsbezug: angebotsbezug || undefined,
      };

      const dokument = await speicherePlatzbauerAuftragsbestaetigung(projekt, formularDaten);
      // Nummer zurückschreiben: Sonst zieht ein zweiter Klick eine zweite AB.
      if (dokument?.dokumentNummer) {
        setFormData(prev => ({ ...prev, auftragsbestaetigungsnummer: dokument.dokumentNummer }));
      }
      setAbErstellt(true);
      setAbGesperrt(true);
      setVerlaufLadeZaehler(prev => prev + 1);
      alert('Auftragsbestätigung wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      // Der Debounce wurde vor dem Erstellen abgeschaltet – nach einem
      // Fehlschlag muss er wieder greifen, sonst gehen die Eingaben verloren.
      hatGeaendert.current = true;
      setSpeicherStatus('idle');
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

  if (!hatAngebot && positionen.length === 0 && staffelPositionen.length === 0) {
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

      {/* Während des Erstellens sind Eingaben gesperrt: Eine Änderung in diesem
          Fenster landet weder im erzeugten Beleg noch verlässlich im Entwurf. */}
      <fieldset disabled={speichern} className="contents">

      {/* Das Angebot wurde nach diesem Entwurf neu erstellt */}
      {angebotNeuer && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Angebot {angebotNeuer.nummer}
            {angebotNeuer.datum ? ` vom ${formatDatumDe(angebotNeuer.datum)}` : ''} ist neuer als die hier
            übernommenen Daten. Ohne Übernahme bestätigt die Auftragsbestätigung den älteren Stand.
          </p>
          <button
            type="button"
            onClick={uebernehmeAktuellesAngebot}
            className="mt-2 px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            disabled={speichern}
          >
            Staffeln aus Angebot {angebotNeuer.nummer} übernehmen
          </button>
        </div>
      )}

      {/* Staffelvereinbarung aus dem Angebot – hier nur bestätigt, gepflegt wird im Angebot */}
      {staffelPositionen.length > 0 && staffelKonditionen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-amber-500" />
              Staffelpreisvereinbarung
            </h3>
            {angebotsbezug?.nummer && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                aus Angebot {angebotsbezug.nummer}
                {angebotsbezug.datum ? ` vom ${formatDatumDe(angebotsbezug.datum)}` : ''}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {staffelPositionen.map(sp => (
              <div
                key={sp.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg"
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {sp.artikelnummer} – {sp.bezeichnung}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {(sp.staffelpreise?.staffeln ?? [])
                    .map(st =>
                      st.bisMenge
                        ? `${formatTonnen(st.vonMenge)} bis unter ${formatTonnen(st.bisMenge)}: ${st.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/t`
                        : `ab ${formatTonnen(st.vonMenge)}: ${st.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/t`
                    )
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800 text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>
              <span className="font-medium text-gray-900 dark:text-white">
                {STAFFEL_MODELLE.find(m => m.wert === staffelKonditionen.abrechnungsmodell)?.titel}
              </span>
              {' · '}
              {STAFFEL_MENGENBASEN.find(b => b.wert === staffelKonditionen.mengenbasis)?.titel}
            </p>
            {(staffelKonditionen.zeitraumVon || staffelKonditionen.zeitraumBis) && (
              <p>
                Abnahmezeitraum: {formatDatumDe(staffelKonditionen.zeitraumVon) || '–'} bis{' '}
                {formatDatumDe(staffelKonditionen.zeitraumBis) || '–'}
              </p>
            )}
            {staffelKurzfassung(staffelKonditionen).map(zeile => (
              <p key={zeile}>{zeile}</p>
            ))}
            <p className="text-xs text-gray-500 dark:text-gray-500 pt-1">
              Die Staffeln werden im Angebot gepflegt. Die Auftragsbestätigung bestätigt sie unverändert.
            </p>
          </div>
        </div>
      )}

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

        {positionen.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
            Keine Einzelpositionen. Bei einer Staffelpreisvereinbarung wird ohne feste Menge
            abgerufen – Positionen sind hier nur nötig, wenn zusätzlich konkrete Lieferungen
            bestätigt werden sollen.
          </p>
        ) : (
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
                <tr key={pos.vereinId || `pos-${index}`} className="border-b border-gray-100 dark:border-slate-800">
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
                    <NumberInput
                      value={pos.menge}
                      onChange={(v) => updatePosition(index, { menge: v })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.1"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <NumberInput
                      value={pos.einzelpreis}
                      onChange={(v) => updatePosition(index, { einzelpreis: v })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.01"
                      min="0"
                      dezimalstellen={2}
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
        )}
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
              Lieferbedingungen
            </label>
            <textarea
              value={formData.lieferbedingungen}
              onChange={(e) => updateFormData({ lieferbedingungen: e.target.value })}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Übernommen aus dem Angebot, sonst vorbelegt aus Platzbauer-Verwaltung → Belegtexte.
            </p>
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
          {positionen.length === 0 && staffelPositionen.length > 0 ? (
            <div className="space-y-2 mb-6 text-sm text-gray-600 dark:text-gray-400">
              <p>
                {staffelPositionen.length} Sorte{staffelPositionen.length === 1 ? '' : 'n'} mit
                Staffelpreisen, keine feste Abnahmemenge.
              </p>
              <p>
                Es wird keine Gesamtsumme ausgewiesen. Abgerechnet wird je Lieferung nach dem
                tatsächlichen Gewicht laut Wiegeschein.
              </p>
            </div>
          ) : (
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
          )}

          <button
            onClick={handleABErstellen}
            disabled={
              speichern ||
              abGesperrt ||
              (positionen.length === 0 && staffelPositionen.length === 0)
            }
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-semibold rounded-xl hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {speichern ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Erstelle AB...
              </>
            ) : abGesperrt ? (
              <>
                <FileCheck className="w-5 h-5" />
                Auftragsbestätigung erstellt
              </>
            ) : (
              <>
                <FileSignature className="w-5 h-5" />
                AB erstellen & PDF generieren
              </>
            )}
          </button>
          {abGesperrt && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
              {bestehendeAB && !abErstellt
                ? `Auftragsbestätigung ${bestehendeAB.nummer}${bestehendeAB.datum ? ` vom ${formatDatumDe(bestehendeAB.datum)}` : ''} liegt bereits vor.`
                : 'Die Auftragsbestätigung liegt im Verlauf.'}{' '}
              Eine Änderung an den Daten gibt den Knopf für eine neue Fassung wieder frei.
            </p>
          )}
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
    </fieldset>
    </div>
  );
};

export default PlatzbauerAuftragsbestaetigungTab;
