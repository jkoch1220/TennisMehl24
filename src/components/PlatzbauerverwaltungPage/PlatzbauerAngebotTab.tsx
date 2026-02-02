/**
 * Platzbauer Angebot Tab
 *
 * Auto-Save funktioniert genau wie bei der Vereins-Projektabwicklung:
 * - hatGeaendert.current = true bei jeder Änderung
 * - Debounced Auto-Save nach 1.5 Sekunden
 * - Status-Anzeige für Speichervorgang
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Cloud,
  CloudOff,
  Loader2,
  FileCheck,
  CheckCircle2,
  Package,
  Users,
} from 'lucide-react';
import { PlatzbauerProjekt, PlatzbauerPosition, PlatzbauerAngebotPosition } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import { Artikel } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import {
  speicherePlatzbauerAngebot,
  speichereEntwurf,
  ladeEntwurf,
  ladeDokumenteNachTyp,
} from '../../services/platzbauerprojektabwicklungDokumentService';

interface PlatzbauerAngebotTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
  positionen: PlatzbauerPosition[];
}

interface VereinAuswahl {
  vereinId: string;
  vereinsprojektId: string;
  vereinsname: string;
  plz: string;
  ort: string;
  strasse: string;
  ausgewaehlt: boolean;
  menge: number;
  einzelpreis: number;
  artikelnummer: string;
  artikelBeschreibung: string;
}

interface AngebotEntwurf {
  vereineAuswahl: VereinAuswahl[];
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
  // State
  const [vereineAuswahl, setVereineAuswahl] = useState<VereinAuswahl[]>([]);
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
  const [hatDokument, setHatDokument] = useState(false);

  // Auto-Save Status - GENAU wie bei der funktionierenden Version
  const [speicherStatus, setSpeicherStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const [initialLaden, setInitialLaden] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);

  // Artikel laden
  useEffect(() => {
    const ladeArtikel = async () => {
      try {
        const artikel = await getAlleArtikel();
        setAlleArtikel(artikel);
        // Nur Ziegelmehl-Artikel für Hauptpositionen
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

  // Vorjahresmengen laden
  const ladeVorjahresmengen = useCallback(async (vereineIds: string[]): Promise<Map<string, number>> => {
    const mengenMap = new Map<string, number>();
    try {
      const vorjahr = projekt.saisonjahr - 1;
      const vorjahresmengen = await platzbauerverwaltungService.ladeVorjahresmengen(vereineIds, vorjahr);
      return vorjahresmengen;
    } catch (error) {
      console.warn('Konnte Vorjahresmengen nicht laden:', error);
    }
    return mengenMap;
  }, [projekt.saisonjahr]);

  // Daten laden und Entwurf wiederherstellen
  useEffect(() => {
    const ladeDaten = async () => {
      setLaden(true);
      try {
        // Prüfen ob bereits ein Angebot existiert
        const dokumente = await ladeDokumenteNachTyp(projekt.id, 'angebot');
        setHatDokument(dokumente.length > 0);

        // Gespeicherten Entwurf laden
        const gespeicherterEntwurf = await ladeEntwurf<AngebotEntwurf>(projekt.id, 'angebot');
        console.log('📂 Geladener Entwurf:', gespeicherterEntwurf ? 'gefunden' : 'nicht gefunden');

        // Vorjahresmengen laden
        const vereineIds = positionen.map(p => p.vereinId);
        const vorjahresmengen = await ladeVorjahresmengen(vereineIds);

        // Standard-Artikel
        const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];

        if (gespeicherterEntwurf) {
          // Entwurf wiederherstellen
          console.log('✅ Stelle Entwurf wieder her');
          setVereineAuswahl(gespeicherterEntwurf.vereineAuswahl || []);
          setZusatzPositionen(gespeicherterEntwurf.zusatzPositionen || []);
          setFormData(prev => ({
            ...prev,
            ...gespeicherterEntwurf.formData,
          }));
          setSpeicherStatus('gespeichert');
        } else {
          // Vereine aus Positionen initialisieren
          const initialeVereine: VereinAuswahl[] = positionen.map(pos => {
            const vorjahresMenge = vorjahresmengen.get(pos.vereinId) || 0;
            return {
              vereinId: pos.vereinId,
              vereinsprojektId: pos.vereinsprojektId,
              vereinsname: pos.vereinsname,
              plz: pos.lieferadresse?.plz || '',
              ort: pos.lieferadresse?.ort || '',
              strasse: pos.lieferadresse?.strasse || '',
              ausgewaehlt: false,
              menge: vorjahresMenge || pos.menge || 0,
              einzelpreis: pos.einzelpreis || defaultArtikel?.einzelpreis || 0,
              artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
              artikelBeschreibung: defaultArtikel?.beschreibung || '',
            };
          });
          setVereineAuswahl(initialeVereine);
        }
      } catch (error) {
        console.error('Fehler beim Laden:', error);
      } finally {
        setLaden(false);
        // WICHTIG: Nach kurzem Delay initialLaden auf false setzen
        setTimeout(() => {
          setInitialLaden(false);
          console.log('✅ initialLaden auf false gesetzt - Auto-Save aktiviert');
        }, 500);
      }
    };

    if (ziegelmehlArtikel.length > 0 || alleArtikel.length > 0) {
      ladeDaten();
    }
  }, [projekt.id, positionen, ziegelmehlArtikel, alleArtikel, ladeVorjahresmengen]);

  // Auto-Save Funktion - GENAU wie bei der funktionierenden Version
  const speichereAutomatisch = useCallback(async () => {
    console.log('🔄 Auto-Save Check:', {
      projektId: projekt.id,
      initialLaden,
      hatGeaendert: hatGeaendert.current,
    });

    if (!projekt.id || initialLaden || !hatGeaendert.current) {
      console.log('❌ Auto-Save übersprungen');
      return;
    }

    try {
      console.log('💾 Auto-Save startet...');
      setSpeicherStatus('speichern');

      const entwurfDaten: AngebotEntwurf = {
        vereineAuswahl,
        zusatzPositionen,
        formData,
      };

      await speichereEntwurf(projekt.id, 'angebot', entwurfDaten);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
      console.log('✅ Auto-Save erfolgreich');
    } catch (error) {
      console.error('❌ Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt.id, initialLaden, vereineAuswahl, zusatzPositionen, formData]);

  // Debounced Auto-Save bei Änderungen - GENAU wie bei der funktionierenden Version
  useEffect(() => {
    console.log('📝 Auto-Save Effect:', {
      initialLaden,
      hatGeaendert: hatGeaendert.current,
    });

    if (initialLaden || !hatGeaendert.current) {
      return;
    }

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
  }, [vereineAuswahl, zusatzPositionen, formData, speichereAutomatisch, initialLaden]);

  // Change-Handler mit hatGeaendert Flag
  const markiereGeaendert = () => {
    hatGeaendert.current = true;
    console.log('📌 hatGeaendert = true');
  };

  const toggleVerein = (index: number) => {
    markiereGeaendert();
    setVereineAuswahl(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ausgewaehlt: !updated[index].ausgewaehlt };
      return updated;
    });
  };

  const updateVerein = (index: number, updates: Partial<VereinAuswahl>) => {
    markiereGeaendert();
    setVereineAuswahl(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const selectAlleVereine = () => {
    markiereGeaendert();
    setVereineAuswahl(prev => prev.map(v => ({ ...v, ausgewaehlt: true })));
  };

  const deselectAlleVereine = () => {
    markiereGeaendert();
    setVereineAuswahl(prev => prev.map(v => ({ ...v, ausgewaehlt: false })));
  };

  const handleArtikelChange = (index: number, artikelnummer: string) => {
    markiereGeaendert();
    const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === artikelnummer);
    if (artikel) {
      setVereineAuswahl(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          artikelnummer: artikel.artikelnummer,
          artikelBeschreibung: artikel.beschreibung || '',
          einzelpreis: artikel.einzelpreis ?? updated[index].einzelpreis,
        };
        return updated;
      });
    }
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    markiereGeaendert();
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const addZusatzPosition = () => {
    markiereGeaendert();
    const defaultArtikel = alleArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || alleArtikel[0];
    const neuePosition: PlatzbauerAngebotPosition = {
      id: `zusatz-${Date.now()}`,
      artikelId: defaultArtikel?.$id,
      artikelnummer: defaultArtikel?.artikelnummer || '',
      bezeichnung: defaultArtikel?.bezeichnung || '',
      beschreibung: defaultArtikel?.beschreibung || '',
      einheit: defaultArtikel?.einheit || 't',
      menge: 0,
      einzelpreis: defaultArtikel?.einzelpreis || 0,
      gesamtpreis: 0,
    };
    setZusatzPositionen(prev => [...prev, neuePosition]);
  };

  const updateZusatzPosition = (index: number, updates: Partial<PlatzbauerAngebotPosition>) => {
    markiereGeaendert();
    setZusatzPositionen(prev => {
      const updated = [...prev];
      const current = updated[index];
      updated[index] = {
        ...current,
        ...updates,
        gesamtpreis: (updates.menge ?? current.menge) * (updates.einzelpreis ?? current.einzelpreis),
      };
      return updated;
    });
  };

  const removeZusatzPosition = (index: number) => {
    markiereGeaendert();
    setZusatzPositionen(prev => prev.filter((_, i) => i !== index));
  };

  // Berechnungen
  const ausgewaehlteVereine = vereineAuswahl.filter(v => v.ausgewaehlt);
  // Gesamtmenge NUR für loses Material (TM-ZM-02, TM-ZM-03 etc.)
  const gesamtMenge = ausgewaehlteVereine
    .filter(v => v.artikelnummer?.startsWith('TM-ZM'))
    .reduce((sum, v) => sum + v.menge, 0)
    + zusatzPositionen
      .filter(p => p.artikelnummer?.startsWith('TM-ZM'))
      .reduce((sum, p) => sum + p.menge, 0);
  const gesamtNetto = ausgewaehlteVereine.reduce((sum, v) => sum + (v.menge * v.einzelpreis), 0)
    + zusatzPositionen.reduce((sum, p) => sum + p.gesamtpreis, 0);
  const gesamtBrutto = gesamtNetto * 1.19;

  // Angebot erstellen
  const handleAngebotErstellen = async () => {
    if (ausgewaehlteVereine.length === 0) {
      alert('Bitte wählen Sie mindestens einen Verein aus.');
      return;
    }

    setSpeichern(true);
    try {
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

      const formularDaten = {
        angebotsnummer: formData.angebotsnummer,
        angebotsdatum: formData.angebotsdatum,
        gueltigBis: formData.gueltigBis,
        platzbauerId: platzbauer?.id || projekt.platzbauerId,
        platzbauername: platzbauer?.name || '',
        platzbauerstrasse: platzbauer?.rechnungsadresse?.strasse || '',
        platzbauerPlzOrt: `${platzbauer?.rechnungsadresse?.plz || ''} ${platzbauer?.rechnungsadresse?.ort || ''}`.trim(),
        platzbauerAnsprechpartner: platzbauer?.dispoAnsprechpartner?.name || '',
        positionen: angebotPositionen.map(p => ({
          vereinId: p.vereinId || '',
          vereinsprojektId: p.vereinsprojektId || '',
          vereinsname: p.vereinsname || p.bezeichnung,
          menge: p.menge,
          einheit: p.einheit,
          einzelpreis: p.einzelpreis,
          gesamtpreis: p.gesamtpreis,
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
      setHatDokument(true);
      alert('Angebot wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  };

  if (laden) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Lade Angebotsdaten...</p>
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

        {hatDokument && (
          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Angebot vorhanden
          </span>
        )}
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
            Vereine auswählen ({ausgewaehlteVereine.length} / {vereineAuswahl.length})
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
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Artikel</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-28">Menge (t)</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-32">Preis/t</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 w-32">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {vereineAuswahl.map((verein, index) => (
                <tr
                  key={verein.vereinId}
                  className={`border-b border-gray-100 dark:border-slate-800 ${
                    verein.ausgewaehlt ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <td className="py-2 px-2">
                    <input
                      type="checkbox"
                      checked={verein.ausgewaehlt}
                      onChange={() => toggleVerein(index)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <div className="font-medium text-gray-900 dark:text-white">{verein.vereinsname}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{verein.plz} {verein.ort}</div>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={verein.artikelnummer}
                      onChange={(e) => handleArtikelChange(index, e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    >
                      {ziegelmehlArtikel.map(a => (
                        <option key={a.artikelnummer} value={a.artikelnummer}>
                          {a.artikelnummer} - {a.bezeichnung}
                        </option>
                      ))}
                    </select>
                    {verein.artikelBeschreibung && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate max-w-xs">
                        {verein.artikelBeschreibung}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={verein.menge || ''}
                      onChange={(e) => updateVerein(index, { menge: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.1"
                      min="0"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={verein.einzelpreis || ''}
                      onChange={(e) => updateVerein(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-gray-900 dark:text-white">
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
            Keine Zusatzpositionen. Klicken Sie auf "Position hinzufügen" um weitere Artikel aufzunehmen.
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
                        einheit: artikel.einheit || 't',
                        einzelpreis: artikel.einzelpreis || pos.einzelpreis,
                      });
                    }
                  }}
                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
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
                  placeholder="Menge"
                  className="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  step="0.1"
                />
                <span className="text-gray-500 w-8">{pos.einheit}</span>
                <input
                  type="number"
                  value={pos.einzelpreis || ''}
                  onChange={(e) => updateZusatzPosition(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                  placeholder="Preis"
                  className="w-28 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  step="0.01"
                />
                <span className="text-gray-700 dark:text-gray-300 w-28 text-right font-medium">
                  {pos.gesamtpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </span>
                <button
                  type="button"
                  onClick={() => removeZusatzPosition(index)}
                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zusammenfassung & Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weitere Felder */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Zahlungsziel
              </label>
              <input
                type="text"
                value={formData.zahlungsziel}
                onChange={(e) => updateFormData({ zahlungsziel: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Summen */}
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Zusammenfassung</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Ausgewählte Vereine:</span>
                <span className="font-medium text-gray-900 dark:text-white">{ausgewaehlteVereine.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Gesamtmenge:</span>
                <span className="font-medium text-gray-900 dark:text-white">{gesamtMenge.toFixed(2)} t</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Zusatzpositionen:</span>
                <span className="font-medium text-gray-900 dark:text-white">{zusatzPositionen.length}</span>
              </div>
              <hr className="my-2 border-gray-300 dark:border-slate-600" />
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
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-gray-900 dark:text-white">Brutto:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {gesamtBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </span>
              </div>
            </div>

            <button
              onClick={handleAngebotErstellen}
              disabled={speichern || ausgewaehlteVereine.length === 0}
              className="w-full mt-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
};

export default PlatzbauerAngebotTab;
