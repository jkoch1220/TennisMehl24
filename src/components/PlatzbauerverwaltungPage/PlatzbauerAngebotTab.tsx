/**
 * PlatzbauerAngebotTab
 *
 * Angebot-Tab für Platzbauer-Projektabwicklung.
 * Basiert auf dem funktionierenden AngebotTab der Vereins-Projektabwicklung.
 *
 * Features:
 * - Auto-Save mit hatGeaendert.current Flag
 * - Vereineauswahl als Positionen
 * - Zusatzpositionen
 * - Dateiverlauf
 * - PDF-Generierung
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Cloud,
  CloudOff,
  Loader2,
  FileCheck,
  Package,
  Users,
  AlertCircle,
} from 'lucide-react';
import { PlatzbauerProjekt, PlatzbauerPosition, PlatzbauerAngebotPosition, PlatzbauerAngebotFormularDaten } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import { Artikel } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import {
  speicherePlatzbauerAngebot,
  speichereEntwurf,
  ladeEntwurf,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import PlatzbauerDokumentVerlauf from './PlatzbauerDokumentVerlauf';

interface PlatzbauerAngebotTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
  positionen: PlatzbauerPosition[];
}

// Vereinsposition für das Angebot
interface VereinPosition {
  vereinId: string;
  vereinsprojektId: string;
  vereinsname: string;
  adresse: string;
  ausgewaehlt: boolean;
  artikelnummer: string;
  artikelBezeichnung: string;
  artikelBeschreibung: string;
  menge: number;
  einzelpreis: number;
}

// Entwurfsdaten für Auto-Save
interface AngebotEntwurf {
  vereinPositionen: VereinPosition[];
  zusatzPositionen: PlatzbauerAngebotPosition[];
  formData: {
    angebotsnummer: string;
    angebotsdatum: string;
    gueltigBis: string;
    zahlungsziel: string;
    lieferzeit: string;
    bemerkung: string;
  };
}

const PlatzbauerAngebotTab = ({ projekt, platzbauer, positionen }: PlatzbauerAngebotTabProps) => {
  // === STATE ===
  const [vereinPositionen, setVereinPositionen] = useState<VereinPosition[]>([]);
  const [zusatzPositionen, setZusatzPositionen] = useState<PlatzbauerAngebotPosition[]>([]);
  const [formData, setFormData] = useState({
    angebotsnummer: '',
    angebotsdatum: new Date().toISOString().split('T')[0],
    gueltigBis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    bemerkung: '',
  });

  const [alleArtikel, setAlleArtikel] = useState<Artikel[]>([]);
  const [ziegelmehlArtikel, setZiegelmehlArtikel] = useState<Artikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);

  // Auto-Save
  const [speicherStatus, setSpeicherStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const [initialLaden, setInitialLaden] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);

  // Verlauf
  const [verlaufLadeZaehler, setVerlaufLadeZaehler] = useState(0);

  // === ARTIKEL LADEN ===
  useEffect(() => {
    const ladeArtikel = async () => {
      try {
        const artikel = await getAlleArtikel();
        setAlleArtikel(artikel);
        setZiegelmehlArtikel(artikel.filter(a =>
          a.artikelnummer?.startsWith('TM-ZM') ||
          a.bezeichnung?.toLowerCase().includes('ziegelmehl') ||
          a.bezeichnung?.toLowerCase().includes('tennissand')
        ));
      } catch (error) {
        console.error('Fehler beim Laden der Artikel:', error);
      }
    };
    ladeArtikel();
  }, []);

  // === DATEN LADEN ===
  useEffect(() => {
    const ladeDaten = async () => {
      if (!projekt?.id || ziegelmehlArtikel.length === 0) return;

      setLaden(true);
      try {
        // Standard-Artikel für Ziegelmehl
        const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];

        // Gespeicherten Entwurf laden
        const gespeicherterEntwurf = await ladeEntwurf<AngebotEntwurf>(projekt.id, 'angebot');
        console.log('📂 Platzbauer Entwurf:', gespeicherterEntwurf ? 'gefunden' : 'nicht gefunden');

        if (gespeicherterEntwurf && gespeicherterEntwurf.vereinPositionen && gespeicherterEntwurf.vereinPositionen.length > 0) {
          // Entwurf wiederherstellen
          setVereinPositionen(gespeicherterEntwurf.vereinPositionen);
          setZusatzPositionen(gespeicherterEntwurf.zusatzPositionen || []);
          if (gespeicherterEntwurf.formData) {
            setFormData(prev => ({ ...prev, ...gespeicherterEntwurf.formData }));
          }
          setSpeicherStatus('gespeichert');
        } else {
          // Vorjahresmengen laden
          const vereineIds = positionen.map(p => p.vereinId);
          let vorjahresmengen = new Map<string, number>();
          try {
            vorjahresmengen = await platzbauerverwaltungService.ladeVorjahresmengen(vereineIds, projekt.saisonjahr - 1);
          } catch (e) {
            console.warn('Vorjahresmengen konnten nicht geladen werden:', e);
          }

          // Vereine aus Positionen initialisieren
          const initialePositionen: VereinPosition[] = positionen.map(pos => {
            const vorjahresMenge = vorjahresmengen.get(pos.vereinId) || 0;
            const adresse = pos.lieferadresse
              ? `${pos.lieferadresse.strasse}, ${pos.lieferadresse.plz} ${pos.lieferadresse.ort}`
              : '';

            return {
              vereinId: pos.vereinId,
              vereinsprojektId: pos.vereinsprojektId,
              vereinsname: pos.vereinsname,
              adresse,
              ausgewaehlt: false,
              artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
              artikelBezeichnung: defaultArtikel?.bezeichnung || 'Ziegelmehl 0/2',
              artikelBeschreibung: defaultArtikel?.beschreibung || '',
              menge: vorjahresMenge || pos.menge || 0,
              einzelpreis: pos.einzelpreis || defaultArtikel?.einzelpreis || 0,
            };
          });
          setVereinPositionen(initialePositionen);
        }
      } catch (error) {
        console.error('Fehler beim Laden:', error);
      } finally {
        setLaden(false);
        setTimeout(() => {
          setInitialLaden(false);
          console.log('✅ Auto-Save aktiviert');
        }, 500);
      }
    };

    ladeDaten();
  }, [projekt?.id, positionen, ziegelmehlArtikel]);

  // === AUTO-SAVE ===
  const speichereAutomatisch = useCallback(async () => {
    if (!projekt?.id || initialLaden || !hatGeaendert.current) return;

    try {
      setSpeicherStatus('speichern');
      const entwurf: AngebotEntwurf = {
        vereinPositionen,
        zusatzPositionen,
        formData,
      };
      await speichereEntwurf(projekt.id, 'angebot', entwurf);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
      console.log('✅ Auto-Save erfolgreich');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.id, initialLaden, vereinPositionen, zusatzPositionen, formData]);

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
  }, [vereinPositionen, zusatzPositionen, formData, speichereAutomatisch, initialLaden]);

  // === CHANGE HANDLER ===
  const markiereGeaendert = () => {
    hatGeaendert.current = true;
  };

  const toggleVerein = (index: number) => {
    markiereGeaendert();
    setVereinPositionen(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ausgewaehlt: !updated[index].ausgewaehlt };
      return updated;
    });
  };

  const updateVerein = (index: number, updates: Partial<VereinPosition>) => {
    markiereGeaendert();
    setVereinPositionen(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const handleArtikelChange = (index: number, artikelnummer: string) => {
    const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === artikelnummer);
    if (artikel) {
      updateVerein(index, {
        artikelnummer: artikel.artikelnummer,
        artikelBezeichnung: artikel.bezeichnung,
        artikelBeschreibung: artikel.beschreibung || '',
        einzelpreis: artikel.einzelpreis ?? vereinPositionen[index].einzelpreis,
      });
    }
  };

  const selectAlleVereine = () => {
    markiereGeaendert();
    setVereinPositionen(prev => prev.map(v => ({ ...v, ausgewaehlt: true })));
  };

  const deselectAlleVereine = () => {
    markiereGeaendert();
    setVereinPositionen(prev => prev.map(v => ({ ...v, ausgewaehlt: false })));
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    markiereGeaendert();
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Zusatzpositionen
  const addZusatzPosition = () => {
    markiereGeaendert();
    const defaultArtikel = alleArtikel.find(a => !a.artikelnummer?.startsWith('TM-ZM')) || alleArtikel[0];
    const neuePosition: PlatzbauerAngebotPosition = {
      id: `zusatz-${Date.now()}`,
      artikelId: defaultArtikel?.$id,
      artikelnummer: defaultArtikel?.artikelnummer || '',
      bezeichnung: defaultArtikel?.bezeichnung || '',
      beschreibung: defaultArtikel?.beschreibung || '',
      einheit: defaultArtikel?.einheit || 'Stk',
      menge: 1,
      einzelpreis: defaultArtikel?.einzelpreis || 0,
      gesamtpreis: defaultArtikel?.einzelpreis || 0,
    };
    setZusatzPositionen(prev => [...prev, neuePosition]);
  };

  const updateZusatzPosition = (index: number, updates: Partial<PlatzbauerAngebotPosition>) => {
    markiereGeaendert();
    setZusatzPositionen(prev => {
      const updated = [...prev];
      const current = updated[index];
      const menge = updates.menge ?? current.menge;
      const einzelpreis = updates.einzelpreis ?? current.einzelpreis;
      updated[index] = {
        ...current,
        ...updates,
        gesamtpreis: menge * einzelpreis,
      };
      return updated;
    });
  };

  const removeZusatzPosition = (index: number) => {
    markiereGeaendert();
    setZusatzPositionen(prev => prev.filter((_, i) => i !== index));
  };

  // === BERECHNUNGEN ===
  const ausgewaehlteVereine = vereinPositionen.filter(v => v.ausgewaehlt);

  // Gesamtmenge NUR für loses Material (TM-ZM-*)
  const gesamtMenge = ausgewaehlteVereine
    .filter(v => v.artikelnummer?.startsWith('TM-ZM'))
    .reduce((sum, v) => sum + v.menge, 0)
    + zusatzPositionen
      .filter(p => p.artikelnummer?.startsWith('TM-ZM'))
      .reduce((sum, p) => sum + p.menge, 0);

  const gesamtNetto = ausgewaehlteVereine.reduce((sum, v) => sum + (v.menge * v.einzelpreis), 0)
    + zusatzPositionen.reduce((sum, p) => sum + p.gesamtpreis, 0);

  const gesamtBrutto = gesamtNetto * 1.19;

  // === ANGEBOT ERSTELLEN ===
  const handleAngebotErstellen = async () => {
    if (ausgewaehlteVereine.length === 0) {
      alert('Bitte wählen Sie mindestens einen Verein aus.');
      return;
    }

    setSpeichern(true);
    try {
      // Positionen für das Angebot erstellen
      const angebotPositionen: PlatzbauerAngebotPosition[] = ausgewaehlteVereine.map(v => ({
        id: v.vereinsprojektId,
        vereinId: v.vereinId,
        vereinsprojektId: v.vereinsprojektId,
        vereinsname: v.vereinsname,
        artikelId: '',
        artikelnummer: v.artikelnummer,
        bezeichnung: v.vereinsname,
        beschreibung: v.artikelBeschreibung,
        einheit: 't',
        menge: v.menge,
        einzelpreis: v.einzelpreis,
        gesamtpreis: v.menge * v.einzelpreis,
      }));

      const formularDaten: PlatzbauerAngebotFormularDaten = {
        angebotsnummer: formData.angebotsnummer,
        angebotsdatum: formData.angebotsdatum,
        gueltigBis: formData.gueltigBis,
        platzbauerId: platzbauer?.id || projekt.platzbauerId,
        platzbauername: platzbauer?.name || '',
        platzbauerstrasse: platzbauer?.rechnungsadresse?.strasse || '',
        platzbauerPlzOrt: `${platzbauer?.rechnungsadresse?.plz || ''} ${platzbauer?.rechnungsadresse?.ort || ''}`.trim(),
        platzbauerAnsprechpartner: platzbauer?.dispoAnsprechpartner?.name || '',
        positionen: ausgewaehlteVereine.map(v => ({
          vereinId: v.vereinId,
          vereinsprojektId: v.vereinsprojektId,
          vereinsname: v.vereinsname,
          menge: v.menge,
          einheit: 't',
          einzelpreis: v.einzelpreis,
          gesamtpreis: v.menge * v.einzelpreis,
        })),
        angebotPositionen: [...angebotPositionen, ...zusatzPositionen],
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

      await speicherePlatzbauerAngebot(projekt, formularDaten);
      setVerlaufLadeZaehler(prev => prev + 1);
      alert('Angebot wurde erfolgreich erstellt!');
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Lade Angebotsdaten...</p>
      </div>
    );
  }

  if (vereinPositionen.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Keine Vereine zugeordnet</h3>
        <p className="text-gray-500 dark:text-gray-400">
          Diesem Platzbauer-Projekt sind noch keine Vereine zugeordnet.
        </p>
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
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-blue-600 dark:text-blue-400">Speichere...</span>
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

      {/* Formular-Felder */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Angebotsdaten</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Angebotsnummer
            </label>
            <input
              type="text"
              value={formData.angebotsnummer}
              onChange={(e) => updateFormData({ angebotsnummer: e.target.value })}
              placeholder="Wird automatisch generiert"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Angebotsdatum
            </label>
            <input
              type="date"
              value={formData.angebotsdatum}
              onChange={(e) => updateFormData({ angebotsdatum: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Gültig bis
            </label>
            <input
              type="date"
              value={formData.gueltigBis}
              onChange={(e) => updateFormData({ gueltigBis: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Vereine Auswahl */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Positionen ({ausgewaehlteVereine.length} / {vereinPositionen.length} Vereine)
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAlleVereine}
              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50"
            >
              Alle auswählen
            </button>
            <button
              type="button"
              onClick={deselectAlleVereine}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Keine auswählen
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-12"></th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Verein</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-48">Artikel</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-28">Menge (t)</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-28">Preis/t</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-32">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {vereinPositionen.map((verein, index) => (
                <tr
                  key={verein.vereinId}
                  className={`border-b border-gray-100 dark:border-slate-800 ${
                    verein.ausgewaehlt ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <td className="py-3 px-2">
                    <input
                      type="checkbox"
                      checked={verein.ausgewaehlt}
                      onChange={() => toggleVerein(index)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <div className="font-medium text-gray-900 dark:text-white">{verein.vereinsname}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{verein.adresse}</div>
                  </td>
                  <td className="py-3 px-2">
                    <select
                      value={verein.artikelnummer}
                      onChange={(e) => handleArtikelChange(index, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    >
                      {ziegelmehlArtikel.map(a => (
                        <option key={a.artikelnummer} value={a.artikelnummer}>
                          {a.artikelnummer} - {a.bezeichnung}
                        </option>
                      ))}
                    </select>
                    {verein.artikelBeschreibung && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                        {verein.artikelBeschreibung}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      value={verein.menge || ''}
                      onChange={(e) => updateVerein(index, { menge: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.1"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      value={verein.einzelpreis || ''}
                      onChange={(e) => updateVerein(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">
                    {(verein.menge * verein.einzelpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zusatzpositionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-500" />
            Zusatzpositionen
          </h3>
          <button
            type="button"
            onClick={addZusatzPosition}
            className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50"
          >
            <Plus className="w-4 h-4" />
            Position hinzufügen
          </button>
        </div>

        {zusatzPositionen.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            Keine Zusatzpositionen.
          </p>
        ) : (
          <div className="space-y-3">
            {zusatzPositionen.map((pos, index) => (
              <div key={pos.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <select
                  value={pos.artikelnummer}
                  onChange={(e) => {
                    const artikel = alleArtikel.find(a => a.artikelnummer === e.target.value);
                    if (artikel) {
                      updateZusatzPosition(index, {
                        artikelnummer: artikel.artikelnummer,
                        bezeichnung: artikel.bezeichnung,
                        beschreibung: artikel.beschreibung || '',
                        einheit: artikel.einheit || 'Stk',
                        einzelpreis: artikel.einzelpreis || pos.einzelpreis,
                      });
                    }
                  }}
                  className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  {alleArtikel.map(a => (
                    <option key={a.artikelnummer} value={a.artikelnummer}>
                      {a.artikelnummer} - {a.bezeichnung}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={pos.menge || ''}
                  onChange={(e) => updateZusatzPosition(index, { menge: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  step="0.1"
                />
                <span className="text-gray-500 dark:text-gray-400 w-10 text-center">{pos.einheit}</span>
                <input
                  type="number"
                  value={pos.einzelpreis || ''}
                  onChange={(e) => updateZusatzPosition(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                  className="w-24 px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  step="0.01"
                />
                <span className="text-gray-700 dark:text-gray-300 w-24 text-right font-medium">
                  {pos.gesamtpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </span>
                <button
                  type="button"
                  onClick={() => removeZusatzPosition(index)}
                  className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
              <span className="text-gray-600 dark:text-gray-400">Ausgewählte Vereine:</span>
              <span className="font-medium text-gray-900 dark:text-white">{ausgewaehlteVereine.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Gesamtmenge (loses Material):</span>
              <span className="font-medium text-gray-900 dark:text-white">{gesamtMenge.toFixed(2)} t</span>
            </div>
            <hr className="my-3 border-gray-200 dark:border-slate-700" />
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
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {gesamtBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          <button
            onClick={handleAngebotErstellen}
            disabled={speichern || ausgewaehlteVereine.length === 0}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {speichern ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Erstelle Angebot...
              </>
            ) : (
              <>
                <FileCheck className="w-5 h-5" />
                Angebot erstellen & PDF generieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dateiverlauf */}
      <div className="mt-6">
        <PlatzbauerDokumentVerlauf
          projektId={projekt.id}
          dokumentTyp="angebot"
          titel="Angebot-Verlauf"
          maxAnzeige={3}
          ladeZaehler={verlaufLadeZaehler}
        />
      </div>
    </div>
  );
};

export default PlatzbauerAngebotTab;
