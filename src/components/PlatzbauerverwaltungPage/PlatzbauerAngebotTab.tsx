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
  TrendingDown,
  ListPlus,
  ChevronDown,
  ChevronUp,
  Info,
  BarChart3,
} from 'lucide-react';
import {
  PlatzbauerProjekt,
  PlatzbauerAngebotPosition,
  PlatzbauerAngebotFormularDaten,
  Preisstaffel,
  PositionsTyp,
  BedarfsStatus,
} from '../../types/platzbauer';
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

// Staffelpreis-Position für das Angebot
interface StaffelpreisPosition {
  id: string;
  artikelnummer: string;
  artikelBezeichnung: string;
  einheit: string;
  staffeln: Preisstaffel[];
  lieferregion?: string;        // z.B. "Bayern", "Süddeutschland", "PLZ 8xxxx-9xxxx"
  bemerkung?: string;
}

// Bedarfsposition für das Angebot
interface BedarfsPosition {
  id: string;
  bezeichnung: string;
  beschreibung?: string;
  geschaetzteMenge: number;
  einheit: string;
  einzelpreis: number;
  notiz?: string;
  status: BedarfsStatus;
}

// Entwurfsdaten für Auto-Save
interface AngebotEntwurf {
  vereinPositionen: VereinPosition[];
  zusatzPositionen: PlatzbauerAngebotPosition[];
  staffelpreisPositionen?: StaffelpreisPosition[];
  bedarfsPositionen?: BedarfsPosition[];
  angebotsModus?: 'standard' | 'staffelpreis';
  formData: {
    angebotsnummer: string;
    angebotsdatum: string;
    gueltigBis: string;
    zahlungsziel: string;
    lieferzeit: string;
    bemerkung: string;
  };
}

const PlatzbauerAngebotTab = ({ projekt, platzbauer }: PlatzbauerAngebotTabProps) => {
  // === STATE ===
  const [vereinPositionen, setVereinPositionen] = useState<VereinPosition[]>([]);
  const [zusatzPositionen, setZusatzPositionen] = useState<PlatzbauerAngebotPosition[]>([]);

  // Staffelpreise & Bedarfspositionen
  const [angebotsModus, setAngebotsModus] = useState<'standard' | 'staffelpreis'>('standard');
  const [staffelpreisPositionen, setStaffelpreisPositionen] = useState<StaffelpreisPosition[]>([]);
  const [bedarfsPositionen, setBedarfsPositionen] = useState<BedarfsPosition[]>([]);
  const [staffelpreisExpanded, setStaffelpreisExpanded] = useState<Record<string, boolean>>({});

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
      if (!projekt?.id || !projekt.platzbauerId || ziegelmehlArtikel.length === 0) return;

      setLaden(true);
      try {
        // Standard-Artikel für Ziegelmehl
        const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];

        // Gespeicherten Entwurf laden
        const gespeicherterEntwurf = await ladeEntwurf<AngebotEntwurf>(projekt.id, 'angebot');
        console.log('📂 Platzbauer Entwurf Laden:', {
          gefunden: !!gespeicherterEntwurf,
          hatVereinPositionen: !!gespeicherterEntwurf?.vereinPositionen,
          anzahlVereine: gespeicherterEntwurf?.vereinPositionen?.length || 0,
          formData: gespeicherterEntwurf?.formData ? 'vorhanden' : 'fehlt'
        });

        if (gespeicherterEntwurf && gespeicherterEntwurf.vereinPositionen && gespeicherterEntwurf.vereinPositionen.length > 0) {
          // Entwurf wiederherstellen
          console.log('✅ Stelle gespeicherten Entwurf wieder her mit', gespeicherterEntwurf.vereinPositionen.length, 'Vereinen');
          setVereinPositionen(gespeicherterEntwurf.vereinPositionen);
          setZusatzPositionen(gespeicherterEntwurf.zusatzPositionen || []);
          // Staffelpreise und Bedarfspositionen wiederherstellen
          if (gespeicherterEntwurf.staffelpreisPositionen) {
            setStaffelpreisPositionen(gespeicherterEntwurf.staffelpreisPositionen);
          }
          if (gespeicherterEntwurf.bedarfsPositionen) {
            setBedarfsPositionen(gespeicherterEntwurf.bedarfsPositionen);
          }
          if (gespeicherterEntwurf.angebotsModus) {
            setAngebotsModus(gespeicherterEntwurf.angebotsModus);
          }
          if (gespeicherterEntwurf.formData) {
            setFormData(prev => ({ ...prev, ...gespeicherterEntwurf.formData }));
          }
          setSpeicherStatus('gespeichert');
        } else {
          // Vereine direkt vom Platzbauer laden (über standardPlatzbauerId)
          const vereineMitDaten = await platzbauerverwaltungService.loadVereineFuerPlatzbauer(projekt.platzbauerId);
          console.log('📋 Vereine für Platzbauer geladen:', vereineMitDaten.length);

          // Vorjahresmengen laden
          const vereineIds = vereineMitDaten.map(v => v.kunde.id);
          let vorjahresmengen = new Map<string, number>();
          try {
            vorjahresmengen = await platzbauerverwaltungService.ladeVorjahresmengen(vereineIds, projekt.saisonjahr - 1);
          } catch (e) {
            console.warn('Vorjahresmengen konnten nicht geladen werden:', e);
          }

          // Vereine als Positionen initialisieren
          const initialePositionen: VereinPosition[] = vereineMitDaten.map(vereinDaten => {
            const kunde = vereinDaten.kunde;
            const vorjahresMenge = vorjahresmengen.get(kunde.id) || 0;
            const adresse = kunde.lieferadresse
              ? `${kunde.lieferadresse.strasse}, ${kunde.lieferadresse.plz} ${kunde.lieferadresse.ort}`
              : kunde.rechnungsadresse
                ? `${kunde.rechnungsadresse.strasse}, ${kunde.rechnungsadresse.plz} ${kunde.rechnungsadresse.ort}`
                : '';

            return {
              vereinId: kunde.id,
              vereinsprojektId: '', // Wird später bei Zuordnung gesetzt
              vereinsname: kunde.name,
              adresse,
              ausgewaehlt: false,
              artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
              artikelBezeichnung: defaultArtikel?.bezeichnung || 'Ziegelmehl 0/2',
              artikelBeschreibung: defaultArtikel?.beschreibung || '',
              menge: vorjahresMenge || 0,
              einzelpreis: defaultArtikel?.einzelpreis || 0,
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
  }, [projekt?.id, projekt?.platzbauerId, ziegelmehlArtikel]);

  // === AUTO-SAVE ===
  const speichereAutomatisch = useCallback(async () => {
    if (!projekt?.id || initialLaden) {
      console.log('⏭️ Auto-Save übersprungen:', { projektId: projekt?.id, initialLaden });
      return;
    }

    console.log('💾 Auto-Save startet...', {
      vereine: vereinPositionen.length,
      ausgewaehlt: vereinPositionen.filter(v => v.ausgewaehlt).length
    });

    try {
      setSpeicherStatus('speichern');
      const entwurf: AngebotEntwurf = {
        vereinPositionen,
        zusatzPositionen,
        staffelpreisPositionen,
        bedarfsPositionen,
        angebotsModus,
        formData,
      };
      console.log('💾 Speichere Entwurf:', {
        vereinPositionen: entwurf.vereinPositionen.length,
        zusatzPositionen: entwurf.zusatzPositionen.length,
        staffelpreisPositionen: entwurf.staffelpreisPositionen?.length || 0,
        bedarfsPositionen: entwurf.bedarfsPositionen?.length || 0,
        angebotsModus: entwurf.angebotsModus,
        formDataKeys: Object.keys(entwurf.formData)
      });
      await speichereEntwurf(projekt.id, 'angebot', entwurf);
      setSpeicherStatus('gespeichert');
      hatGeaendert.current = false;
      console.log('✅ Auto-Save erfolgreich abgeschlossen');
    } catch (error) {
      console.error('❌ Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.id, initialLaden, vereinPositionen, zusatzPositionen, staffelpreisPositionen, bedarfsPositionen, angebotsModus, formData]);

  // Debounced Auto-Save - reagiert auf Änderungen
  useEffect(() => {
    // Nur speichern wenn nicht mehr im initialen Ladezustand
    if (initialLaden) {
      return;
    }

    // Nur speichern wenn tatsächlich Änderungen markiert wurden
    if (!hatGeaendert.current) {
      return;
    }

    console.log('🔄 Auto-Save Timer gestartet (1.5s)...');

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      console.log('⏰ Timer abgelaufen, führe Auto-Save aus');
      speichereAutomatisch();
    }, 1500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [vereinPositionen, zusatzPositionen, staffelpreisPositionen, bedarfsPositionen, angebotsModus, formData, speichereAutomatisch, initialLaden]);

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

  // Angebotsmodus wechseln
  const handleModusChange = (modus: 'standard' | 'staffelpreis') => {
    markiereGeaendert();
    setAngebotsModus(modus);
  };

  // === STAFFELPREIS-HANDLER ===
  const addStaffelpreisPosition = () => {
    markiereGeaendert();
    const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];
    const neuePosition: StaffelpreisPosition = {
      id: `staffel-${Date.now()}`,
      artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
      artikelBezeichnung: defaultArtikel?.bezeichnung || 'Ziegelmehl 0/2',
      einheit: 't',
      staffeln: [
        { vonMenge: 0, bisMenge: 50, einzelpreis: defaultArtikel?.einzelpreis || 95.00 },
        { vonMenge: 50, bisMenge: 100, einzelpreis: (defaultArtikel?.einzelpreis || 95.00) - 5 },
        { vonMenge: 100, bisMenge: null, einzelpreis: (defaultArtikel?.einzelpreis || 95.00) - 10 },
      ],
      bemerkung: '',
    };
    setStaffelpreisPositionen(prev => [...prev, neuePosition]);
    setStaffelpreisExpanded(prev => ({ ...prev, [neuePosition.id]: true }));
  };

  const updateStaffelpreisPosition = (index: number, updates: Partial<StaffelpreisPosition>) => {
    markiereGeaendert();
    setStaffelpreisPositionen(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const updateStaffel = (posIndex: number, staffelIndex: number, updates: Partial<Preisstaffel>) => {
    markiereGeaendert();
    setStaffelpreisPositionen(prev => {
      const updated = [...prev];
      const pos = { ...updated[posIndex] };
      const staffeln = [...pos.staffeln];
      staffeln[staffelIndex] = { ...staffeln[staffelIndex], ...updates };
      pos.staffeln = staffeln;
      updated[posIndex] = pos;
      return updated;
    });
  };

  const addStaffel = (posIndex: number) => {
    markiereGeaendert();
    setStaffelpreisPositionen(prev => {
      const updated = [...prev];
      const pos = { ...updated[posIndex] };
      const staffeln = [...pos.staffeln];
      const letzte = staffeln[staffeln.length - 1];
      const neueBis = letzte.bisMenge || letzte.vonMenge + 50;
      // Letzte Staffel begrenzen
      staffeln[staffeln.length - 1] = { ...letzte, bisMenge: neueBis };
      // Neue Staffel hinzufügen
      staffeln.push({
        vonMenge: neueBis,
        bisMenge: null,
        einzelpreis: letzte.einzelpreis - 5,
      });
      pos.staffeln = staffeln;
      updated[posIndex] = pos;
      return updated;
    });
  };

  const removeStaffel = (posIndex: number, staffelIndex: number) => {
    markiereGeaendert();
    setStaffelpreisPositionen(prev => {
      const updated = [...prev];
      const pos = { ...updated[posIndex] };
      const staffeln = pos.staffeln.filter((_, i) => i !== staffelIndex);
      // Letzte Staffel auf unbegrenzt setzen
      if (staffeln.length > 0) {
        staffeln[staffeln.length - 1] = { ...staffeln[staffeln.length - 1], bisMenge: null };
      }
      pos.staffeln = staffeln;
      updated[posIndex] = pos;
      return updated;
    });
  };

  const removeStaffelpreisPosition = (index: number) => {
    markiereGeaendert();
    setStaffelpreisPositionen(prev => prev.filter((_, i) => i !== index));
  };

  // === BEDARFSPOSITIONEN-HANDLER ===
  const addBedarfsPosition = () => {
    markiereGeaendert();
    const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];
    const neuePosition: BedarfsPosition = {
      id: `bedarf-${Date.now()}`,
      bezeichnung: 'Geschätzter Bedarf',
      beschreibung: '',
      geschaetzteMenge: 0,
      einheit: 't',
      einzelpreis: defaultArtikel?.einzelpreis || 95.00,
      notiz: '',
      status: 'geschaetzt',
    };
    setBedarfsPositionen(prev => [...prev, neuePosition]);
  };

  const updateBedarfsPosition = (index: number, updates: Partial<BedarfsPosition>) => {
    markiereGeaendert();
    setBedarfsPositionen(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const removeBedarfsPosition = (index: number) => {
    markiereGeaendert();
    setBedarfsPositionen(prev => prev.filter((_, i) => i !== index));
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

  // Berechnung für Bedarfspositionen
  const bedarfsGesamtNetto = bedarfsPositionen.reduce((sum, b) => sum + (b.geschaetzteMenge * b.einzelpreis), 0);

  const gesamtNetto = ausgewaehlteVereine.reduce((sum, v) => sum + (v.menge * v.einzelpreis), 0)
    + zusatzPositionen.reduce((sum, p) => sum + p.gesamtpreis, 0)
    + bedarfsGesamtNetto;

  const gesamtBrutto = gesamtNetto * 1.19;

  // Staffelpreis hat keine feste Gesamtsumme (abhängig von Abrufmenge)

  // === ANGEBOT ERSTELLEN ===
  const handleAngebotErstellen = async () => {
    // Validierung je nach Modus
    if (angebotsModus === 'standard' && ausgewaehlteVereine.length === 0 && bedarfsPositionen.length === 0) {
      alert('Bitte wählen Sie mindestens einen Verein aus oder fügen Sie Bedarfspositionen hinzu.');
      return;
    }
    if (angebotsModus === 'staffelpreis' && staffelpreisPositionen.length === 0) {
      alert('Bitte fügen Sie mindestens eine Staffelpreis-Position hinzu.');
      return;
    }

    setSpeichern(true);
    try {
      // Positionen für das Angebot erstellen
      const angebotPositionen: PlatzbauerAngebotPosition[] = ausgewaehlteVereine.map(v => ({
        id: v.vereinsprojektId || `verein-${v.vereinId}`,
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
        positionsTyp: 'normal' as PositionsTyp,
      }));

      // Staffelpreis-Positionen hinzufügen
      const staffelPositionen: PlatzbauerAngebotPosition[] = staffelpreisPositionen.map(sp => {
        // Beschreibung zusammensetzen aus Lieferregion und Bemerkung
        let beschreibungParts: string[] = [];
        if (sp.lieferregion) {
          beschreibungParts.push(`Lieferregion: ${sp.lieferregion}`);
        }
        if (sp.bemerkung) {
          beschreibungParts.push(sp.bemerkung);
        }

        return {
          id: sp.id,
          artikelnummer: sp.artikelnummer,
          bezeichnung: sp.artikelBezeichnung,
          beschreibung: beschreibungParts.join('\n') || undefined,
          einheit: sp.einheit,
          menge: 0, // Bei Staffelpreis keine feste Menge
          einzelpreis: 0, // Preis variiert nach Staffel
          gesamtpreis: 0,
          positionsTyp: 'staffelpreis' as PositionsTyp,
          staffelpreise: {
            staffeln: sp.staffeln,
            basisArtikel: sp.artikelnummer,
            basisBezeichnung: sp.artikelBezeichnung,
          },
        };
      });

      // Bedarfspositionen hinzufügen
      const bedarfPositionen: PlatzbauerAngebotPosition[] = bedarfsPositionen.map(bp => ({
        id: bp.id,
        artikelnummer: '',
        bezeichnung: bp.bezeichnung,
        beschreibung: bp.beschreibung,
        einheit: bp.einheit,
        menge: bp.geschaetzteMenge,
        einzelpreis: bp.einzelpreis,
        gesamtpreis: bp.geschaetzteMenge * bp.einzelpreis,
        positionsTyp: 'bedarf' as PositionsTyp,
        bedarfsStatus: bp.status,
        geschaetzteMenge: bp.geschaetzteMenge,
        bedarfsNotiz: bp.notiz,
      }));

      // Alle Positionen zusammenführen
      const allePositionen = [...angebotPositionen, ...zusatzPositionen, ...staffelPositionen, ...bedarfPositionen];

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
        angebotPositionen: allePositionen,
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

      {/* Modus-Auswahl */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          Angebotstyp
        </h3>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleModusChange('standard')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              angebotsModus === 'standard'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users className={`w-6 h-6 ${angebotsModus === 'standard' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-semibold ${angebotsModus === 'standard' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  Standard-Angebot
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Feste Preise pro Verein</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleModusChange('staffelpreis')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              angebotsModus === 'staffelpreis'
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <TrendingDown className={`w-6 h-6 ${angebotsModus === 'staffelpreis' ? 'text-amber-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-semibold ${angebotsModus === 'staffelpreis' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  Staffelpreis-Angebot
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Mengenrabatte nach Staffeln</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Staffelpreise (nur im Staffelpreis-Modus) */}
      {angebotsModus === 'staffelpreis' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-amber-500" />
              Staffelpreise
            </h3>
            <button
              type="button"
              onClick={addStaffelpreisPosition}
              className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50"
            >
              <Plus className="w-4 h-4" />
              Staffelpreis hinzufügen
            </button>
          </div>

          {staffelpreisPositionen.length === 0 ? (
            <div className="text-center py-8 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
              <TrendingDown className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                Keine Staffelpreise definiert.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Staffelpreise bieten Mengenrabatte für größere Bestellungen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {staffelpreisPositionen.map((sp, posIndex) => (
                <div key={sp.id} className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
                  {/* Header */}
                  <div
                    className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 cursor-pointer"
                    onClick={() => setStaffelpreisExpanded(prev => ({ ...prev, [sp.id]: !prev[sp.id] }))}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={sp.artikelnummer}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === e.target.value);
                          if (artikel) {
                            updateStaffelpreisPosition(posIndex, {
                              artikelnummer: artikel.artikelnummer,
                              artikelBezeichnung: artikel.bezeichnung,
                            });
                          }
                        }}
                        className="px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      >
                        {ziegelmehlArtikel.map(a => (
                          <option key={a.artikelnummer} value={a.artikelnummer}>
                            {a.artikelnummer} - {a.bezeichnung}
                          </option>
                        ))}
                      </select>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {sp.staffeln.length} Staffeln
                      </span>
                      {sp.lieferregion && (
                        <span className="text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded">
                          {sp.lieferregion}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeStaffelpreisPosition(posIndex); }}
                        className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {staffelpreisExpanded[sp.id] ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Staffeln (expandiert) */}
                  {staffelpreisExpanded[sp.id] && (
                    <div className="p-4 space-y-4">
                      {/* Lieferregion und Bemerkung */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-3 border-b border-amber-200 dark:border-amber-800">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Lieferregion
                          </label>
                          <input
                            type="text"
                            value={sp.lieferregion || ''}
                            onChange={(e) => updateStaffelpreisPosition(posIndex, { lieferregion: e.target.value })}
                            placeholder="z.B. Bayern, PLZ 8xxxx-9xxxx"
                            className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Bemerkung
                          </label>
                          <input
                            type="text"
                            value={sp.bemerkung || ''}
                            onChange={(e) => updateStaffelpreisPosition(posIndex, { bemerkung: e.target.value })}
                            placeholder="z.B. inkl. Fracht, ab Werk"
                            className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      {/* Staffeln Tabelle */}
                      <div className="space-y-2">
                        <div className="flex gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                          <span className="w-24">Von (t)</span>
                          <span className="w-24">Bis (t)</span>
                          <span className="w-28">Preis/t (€)</span>
                          <span className="w-8"></span>
                        </div>
                        {sp.staffeln.map((staffel, staffelIndex) => (
                          <div key={staffelIndex} className="flex gap-2 items-center">
                            <input
                              type="number"
                              value={staffel.vonMenge}
                              onChange={(e) => updateStaffel(posIndex, staffelIndex, { vonMenge: parseFloat(e.target.value) || 0 })}
                              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              step="1"
                              min="0"
                            />
                            <input
                              type="number"
                              value={staffel.bisMenge || ''}
                              onChange={(e) => updateStaffel(posIndex, staffelIndex, { bisMenge: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="∞"
                              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              step="1"
                              min="0"
                            />
                            <input
                              type="number"
                              value={staffel.einzelpreis}
                              onChange={(e) => updateStaffel(posIndex, staffelIndex, { einzelpreis: parseFloat(e.target.value) || 0 })}
                              className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              step="0.01"
                              min="0"
                            />
                            <button
                              type="button"
                              onClick={() => removeStaffel(posIndex, staffelIndex)}
                              disabled={sp.staffeln.length <= 1}
                              className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addStaffel(posIndex)}
                          className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 mt-2"
                        >
                          <Plus className="w-4 h-4" />
                          Staffel hinzufügen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Info-Box */}
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Staffelpreise: Der Preis richtet sich nach der Gesamtabnahmemenge während der Saison.
                Je höher die Abnahme, desto günstiger der Preis pro Tonne.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bedarfspositionen */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-teal-500" />
            Bedarfspositionen
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Geschätzte Mengen)</span>
          </h3>
          <button
            type="button"
            onClick={addBedarfsPosition}
            className="flex items-center gap-2 px-3 py-2 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-900/50"
          >
            <Plus className="w-4 h-4" />
            Bedarfsposition hinzufügen
          </button>
        </div>

        {bedarfsPositionen.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">
              Keine Bedarfspositionen. Bedarfspositionen ermöglichen die Planung geschätzter Mengen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bedarfsPositionen.map((bp, index) => (
              <div key={bp.id} className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bezeichnung</label>
                    <input
                      type="text"
                      value={bp.bezeichnung}
                      onChange={(e) => updateBedarfsPosition(index, { bezeichnung: e.target.value })}
                      className="w-full px-2 py-1.5 border border-teal-300 dark:border-teal-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                      placeholder="z.B. Geschätzter Jahresbedarf"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Geschätzte Menge</label>
                    <div className="flex">
                      <input
                        type="number"
                        value={bp.geschaetzteMenge || ''}
                        onChange={(e) => updateBedarfsPosition(index, { geschaetzteMenge: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-teal-300 dark:border-teal-700 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                        step="0.1"
                        min="0"
                      />
                      <span className="px-2 py-1.5 bg-teal-100 dark:bg-teal-800 border border-l-0 border-teal-300 dark:border-teal-700 rounded-r text-teal-700 dark:text-teal-300 text-sm">
                        {bp.einheit}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Preis/Einheit</label>
                    <div className="flex">
                      <input
                        type="number"
                        value={bp.einzelpreis || ''}
                        onChange={(e) => updateBedarfsPosition(index, { einzelpreis: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-teal-300 dark:border-teal-700 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                        step="0.01"
                        min="0"
                      />
                      <span className="px-2 py-1.5 bg-teal-100 dark:bg-teal-800 border border-l-0 border-teal-300 dark:border-teal-700 rounded-r text-teal-700 dark:text-teal-300 text-sm">
                        €
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Gesamt</label>
                      <span className="text-lg font-semibold text-teal-700 dark:text-teal-400">
                        {(bp.geschaetzteMenge * bp.einzelpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBedarfsPosition(index)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    value={bp.notiz || ''}
                    onChange={(e) => updateBedarfsPosition(index, { notiz: e.target.value })}
                    className="w-full px-2 py-1.5 border border-teal-200 dark:border-teal-800 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    placeholder="Notiz (optional)"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
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
            {angebotsModus === 'standard' && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Ausgewählte Vereine:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{ausgewaehlteVereine.length}</span>
                </div>
                {bedarfsPositionen.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Bedarfspositionen:</span>
                    <span className="font-medium text-teal-600 dark:text-teal-400">{bedarfsPositionen.length}</span>
                  </div>
                )}
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
              </>
            )}
            {angebotsModus === 'staffelpreis' && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Staffelpreis-Artikel:</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{staffelpreisPositionen.length}</span>
                </div>
                {bedarfsPositionen.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Bedarfspositionen:</span>
                    <span className="font-medium text-teal-600 dark:text-teal-400">{bedarfsPositionen.length}</span>
                  </div>
                )}
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Bei Staffelpreisen wird der Gesamtbetrag anhand der tatsächlichen Abnahmemenge berechnet.
                  </p>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleAngebotErstellen}
            disabled={speichern || (angebotsModus === 'standard' && ausgewaehlteVereine.length === 0 && bedarfsPositionen.length === 0) || (angebotsModus === 'staffelpreis' && staffelpreisPositionen.length === 0)}
            className={`w-full py-3 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              angebotsModus === 'staffelpreis'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
            }`}
          >
            {speichern ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Erstelle Angebot...
              </>
            ) : (
              <>
                <FileCheck className="w-5 h-5" />
                {angebotsModus === 'staffelpreis' ? 'Staffelpreis-Angebot erstellen' : 'Angebot erstellen & PDF generieren'}
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
