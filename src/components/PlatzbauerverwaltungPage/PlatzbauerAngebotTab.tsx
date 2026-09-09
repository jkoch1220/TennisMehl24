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
  RotateCcw,
} from 'lucide-react';
import { NumberInput, OptionalNumberInput } from '../NumberInput';
import {
  PlatzbauerProjekt,
  PlatzbauerAngebotPosition,
  PlatzbauerAngebotFormularDaten,
  Preisstaffel,
  PositionsTyp,
  BedarfsStatus,
  StaffelKonditionen,
} from '../../types/platzbauer';
import {
  STAFFEL_MENGENBASEN,
  STAFFEL_MODELLE,
  erzeugeStaffelHinweistext,
  staffelGrenzenIdentisch,
  staffelnLueckenlos,
  standardStaffelKonditionen,
} from '../../utils/staffelpreisText';
import { leseAngebotsStand, mischeVereinPositionen } from '../../utils/staffelUebernahme';
import {
  ermittleAngleichBefunde,
  gleicheGrenzenAn,
  gleicheStufenzahl,
  grenzenEinheitlich,
  haengeStufeAn,
  koppleGrenzen,
  leseGrenzen,
  loescheStufe,
  neueStaffelId,
  preisAbstaende,
  preisLuecken,
  pruefeObergrenze,
  pruefeUntergrenze,
  rasterFuerNeueSorte,
  setzeObergrenze,
  setzeUntergrenze,
  spiegleGrenzen,
  waehleLeitIndex,
} from '../../utils/staffelGrenzen';
import { SaisonKunde } from '../../types/saisonplanung';
import { Artikel } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import { frachtrechnerHinweis } from '../../constants/vertragsklauseln';
import { getPortalPublicUrl } from '../../services/liefernachweisService';
import {
  speicherePlatzbauerAngebot,
  speichereEntwurf,
  ladeEntwurf,
  ladeAktuellesDokument,
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
  staffelKonditionen?: StaffelKonditionen;
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
  // Abrechnungsmodell + Hinweistext der Staffelpreise (Vorschlag 09/2026)
  const [staffelKonditionen, setStaffelKonditionen] = useState<StaffelKonditionen>(() =>
    standardStaffelKonditionen(projekt.saisonjahr)
  );
  // Abgelehnte Grenzeneingabe: „unter 40 t" bei „ab 50 t" springt zurück – das
  // muss am Feld stehen, sonst hält der Sachbearbeiter das Feld für kaputt.
  const [grenzenHinweis, setGrenzenHinweis] = useState<{ posIndex: number; stufenIndex: number; text: string } | null>(null);
  /** Woher der angezeigte Stand kommt, wenn kein Entwurf mehr existiert. */
  const [ausAngebotGeladen, setAusAngebotGeladen] = useState<{
    nummer: string;
    datum?: string;
    version?: number;
    nichtZugeordnet: string[];
  } | null>(null);
  // Während getippt wird, bleiben die roten Banner weg (der Submit bleibt gesperrt).
  const [staffelEingabeAktiv, setStaffelEingabeAktiv] = useState(false);
  /** Der Wert im „unter"-Feld, bevor der Nutzer es angefasst hat – Rückfall bei Ablehnung. */
  const bisVorEingabeRef = useRef<number | null>(null);
  /** Dasselbe für die Mindestabnahme im „ab"-Feld der ersten Stufe. */
  const vonVorEingabeRef = useRef<number>(0);
  /**
   * Spiegel des Staffel-States. Das Zahlenfeld meldet seinen Wert erst und ruft
   * dann das durchgereichte onBlur; ein Handler, der aus dem Blur heraus läuft,
   * sähe über die Closure noch den Stand von vor der Eingabe.
   */
  const staffelpreisPositionenRef = useRef<StaffelpreisPosition[]>([]);

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
        const artikel = await getAlleArtikel('artikelnummer', true);
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

        // Ein Entwurf zählt auch dann, wenn er keine Vereine trägt: Ein reines
        // Staffelpreis-Angebot für einen Platzbauer ohne zugeordnete Vereine
        // ging sonst bei jedem Öffnen verloren.
        const entwurfHatVereine = !!gespeicherterEntwurf?.vereinPositionen?.length;
        const entwurfHatInhalt =
          entwurfHatVereine ||
          !!gespeicherterEntwurf?.zusatzPositionen?.length ||
          !!gespeicherterEntwurf?.staffelpreisPositionen?.length ||
          !!gespeicherterEntwurf?.bedarfsPositionen?.length ||
          gespeicherterEntwurf?.angebotsModus === 'staffelpreis';

        if (gespeicherterEntwurf && entwurfHatInhalt) {
          // Entwurf wiederherstellen
          console.log('✅ Stelle gespeicherten Entwurf wieder her mit', gespeicherterEntwurf.vereinPositionen?.length || 0, 'Vereinen');
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
          if (gespeicherterEntwurf.staffelKonditionen) {
            // prev = Standard der Saison; ältere Entwürfe ohne einzelne Felder bleiben vollständig
            const gespeicherteKonditionen = gespeicherterEntwurf.staffelKonditionen;
            setStaffelKonditionen(prev => ({ ...prev, ...gespeicherteKonditionen }));
          }
          if (gespeicherterEntwurf.formData) {
            setFormData(prev => ({ ...prev, ...gespeicherterEntwurf.formData }));
          }
          setSpeicherStatus('gespeichert');
        }

        // Kein Entwurf? Dann den Stand aus dem zuletzt erstellten Angebot
        // zurückholen: Das Erstellen löscht den Entwurf, und ohne diesen Weg
        // stünde die Maske beim nächsten Öffnen leer da.
        let standAusDokument: ReturnType<typeof leseAngebotsStand> | null = null;
        let dokumentNummer = '';
        let dokumentVersion: number | undefined;
        if (!(gespeicherterEntwurf && entwurfHatInhalt)) {
          try {
            const dokument = await ladeAktuellesDokument(projekt.id, 'angebot');
            if (dokument?.daten) {
              const stand = leseAngebotsStand(dokument.daten, projekt.saisonjahr);
              if (stand.hatInhalt) {
                standAusDokument = stand;
                dokumentNummer = dokument.dokumentNummer || stand.formData.angebotsnummer;
                // Die Version steht im daten-JSON, nicht als Dokumentfeld.
                dokumentVersion = stand.version ?? dokument.version;
                // Bewusst die rohen Setter: Der Schreibpfad der Maske würde
                // „geändert" melden und 1,5 s später einen Entwurf aus dem
                // Dokument schreiben, der ab dann dauerhaft gewinnt.
                setAngebotsModus(stand.angebotsModus);
                setStaffelpreisPositionen(stand.staffelSorten);
                setStaffelpreisExpanded(
                  Object.fromEntries(stand.staffelSorten.map(sorte => [sorte.id, true]))
                );
                setStaffelKonditionen(prev => ({ ...prev, ...stand.konditionen }));
                setZusatzPositionen(stand.zusatzPositionen);
                setBedarfsPositionen(stand.bedarfsPositionen);
                setFormData(prev => ({
                  ...prev,
                  zahlungsziel: stand.formData.zahlungsziel || prev.zahlungsziel,
                  lieferzeit: stand.formData.lieferzeit || prev.lieferzeit,
                  bemerkung: stand.formData.bemerkung || prev.bemerkung,
                }));
              }
            }
          } catch (e) {
            console.warn('Angebot konnte nicht zurückgelesen werden:', e);
          }
        }

        if (gespeicherterEntwurf && entwurfHatVereine) {
          setVereinPositionen(gespeicherterEntwurf.vereinPositionen);
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
          if (standAusDokument) {
            const { positionen, nichtZugeordnet } = mischeVereinPositionen(
              initialePositionen,
              standAusDokument.vereinsPositionen
            );
            setVereinPositionen(positionen);
            setAusAngebotGeladen({
              nummer: dokumentNummer,
              datum: standAusDokument.angebotsdatum,
              version: dokumentVersion,
              nichtZugeordnet,
            });
          } else {
            setVereinPositionen(initialePositionen);
          }
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
        staffelKonditionen,
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
  }, [projekt?.id, initialLaden, vereinPositionen, zusatzPositionen, staffelpreisPositionen, bedarfsPositionen, angebotsModus, staffelKonditionen, formData]);

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
  }, [vereinPositionen, zusatzPositionen, staffelpreisPositionen, bedarfsPositionen, angebotsModus, staffelKonditionen, formData, speichereAutomatisch, initialLaden]);

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
  //
  // Die Grenzenlogik liegt vollständig in utils/staffelGrenzen.ts. Hier wird sie
  // nur aufgerufen – jede Regel gehört an EINE Stelle, nicht an jeden Auslöser.

  const staffelArtikelFuerText = staffelpreisPositionen.map(sp => ({
    artikelnummer: sp.artikelnummer,
    bezeichnung: sp.artikelBezeichnung,
    staffeln: sp.staffeln,
  }));

  /**
   * Gelten die Stufengrenzen für alle Sorten? Ohne ausdrückliche Entscheidung
   * wird sie aus den Daten abgeleitet: Ein Angebot, dessen Sorten schon heute
   * dasselbe Raster haben, wird gekoppelt gepflegt.
   */
  const grenzenGekoppelt =
    staffelKonditionen.grenzenGekoppelt ?? grenzenEinheitlich(staffelpreisPositionen);
  const grenzenGekoppeltRef = useRef(grenzenGekoppelt);
  useEffect(() => {
    grenzenGekoppeltRef.current = grenzenGekoppelt;
  }, [grenzenGekoppelt]);

  /**
   * Schreibt die abgeleitete Entscheidung beim ersten Eingriff fest. Sonst
   * schlägt der Schalter mitten in der Sitzung um, sobald der Nutzer die
   * Grenzen von Hand angleicht.
   */
  const sichereKopplungZu = () => {
    setStaffelKonditionen(prev =>
      prev.grenzenGekoppelt === undefined
        ? { ...prev, grenzenGekoppelt: grenzenGekoppeltRef.current }
        : prev
    );
  };

  /**
   * Einziger Schreibpfad für die Staffelpositionen – hält die Ref synchron.
   * Ändert die Utility nichts (identische Referenz), passiert auch sonst
   * nichts: kein Autosave, kein Festschreiben des Kopplungsschalters. Sonst
   * würde schon ein Tab durch ein unverändertes Feld den Entwurf speichern.
   */
  const setzeStaffelpreisPositionen = (
    aenderung: (prev: StaffelpreisPosition[]) => StaffelpreisPosition[]
  ) => {
    const neu = aenderung(staffelpreisPositionenRef.current);
    if (neu === staffelpreisPositionenRef.current) return;
    markiereGeaendert();
    sichereKopplungZu();
    staffelpreisPositionenRef.current = neu;
    setStaffelpreisPositionen(neu);
  };

  useEffect(() => {
    staffelpreisPositionenRef.current = staffelpreisPositionen;
  }, [staffelpreisPositionen]);

  /**
   * Nach jeder abgeschlossenen Änderung: koppeln und – wenn gewünscht – spiegeln.
   * Ohne Kopplung wird ausschließlich die bearbeitete Sorte angefasst; eine
   * fremde Altleiter gehört in den bestätigten Angleich-Pfad, nicht in den
   * Seiteneffekt eines Blurs in einer ganz anderen Sorte.
   */
  const richteAus = (positionen: StaffelpreisPosition[], leitIndex: number): StaffelpreisPosition[] => {
    let ergebnis = positionen;
    const gekoppelt = positionen.map((pos, i) => {
      if (!grenzenGekoppeltRef.current && i !== leitIndex) return pos;
      const staffeln = koppleGrenzen(pos.staffeln);
      return staffeln === pos.staffeln ? pos : { ...pos, staffeln };
    });
    if (gekoppelt.some((pos, i) => pos !== positionen[i])) ergebnis = gekoppelt;
    // Gespiegelt wird nur, wenn die Sorten dieselbe Stufenzahl haben. Sonst
    // würde das indexweise Übertragen die Preise auf andere Mengen schieben –
    // dafür ist der bestätigte Angleich (gleicheGrenzenAn) zuständig.
    return grenzenGekoppeltRef.current && gleicheStufenzahl(ergebnis)
      ? spiegleGrenzen(ergebnis, leitIndex)
      : ergebnis;
  };

  const addStaffelpreisPosition = () => {
    const defaultArtikel = ziegelmehlArtikel.find(a => a.artikelnummer === 'TM-ZM-02') || ziegelmehlArtikel[0];
    const stammpreis = defaultArtikel?.einzelpreis || 95.0;
    setzeStaffelpreisPositionen(prev => {
      // Eine neue Sorte übernimmt das bestehende Raster; die Preise folgen den
      // Abständen der Leitsorte (so staffelt das Haus tatsächlich).
      const leit = prev.length ? prev[waehleLeitIndex(prev)] : undefined;
      const raster = leit ? leseGrenzen(leit.staffeln) : [];
      const staffeln =
        raster.length > 0 && grenzenGekoppeltRef.current
          ? rasterFuerNeueSorte(raster, stammpreis, preisAbstaende(leit!.staffeln))
          : [
              { vonMenge: 0, bisMenge: 50, einzelpreis: stammpreis },
              { vonMenge: 50, bisMenge: 100, einzelpreis: stammpreis - 5 },
              { vonMenge: 100, bisMenge: null, einzelpreis: stammpreis - 10 },
            ];
      const neuePosition: StaffelpreisPosition = {
        id: neueStaffelId('staffel'),
        artikelnummer: defaultArtikel?.artikelnummer || 'TM-ZM-02',
        artikelBezeichnung: defaultArtikel?.bezeichnung || 'Ziegelmehl 0/2',
        einheit: 't',
        staffeln,
        bemerkung: '',
      };
      setStaffelpreisExpanded(vorher => ({ ...vorher, [neuePosition.id]: true }));
      return [...prev, neuePosition];
    });
  };

  const updateStaffelpreisPosition = (index: number, updates: Partial<StaffelpreisPosition>) => {
    setzeStaffelpreisPositionen(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  /** Preis einer Stufe – bleibt je Sorte verschieden und wird nie gespiegelt. */
  const updateStaffelPreis = (posIndex: number, staffelIndex: number, preis: number) => {
    setzeStaffelpreisPositionen(prev => {
      const pos = prev[posIndex];
      if (!pos || !pos.staffeln[staffelIndex]) return prev;
      const staffeln = [...pos.staffeln];
      staffeln[staffelIndex] = { ...staffeln[staffelIndex], einzelpreis: preis };
      const updated = [...prev];
      updated[posIndex] = { ...pos, staffeln };
      return updated;
    });
  };

  /**
   * „ab" der ersten Stufe (Mindestabnahme). Wie beim „unter"-Feld: Tippen
   * schreibt nur die eigene Zelle, geprüft und gespiegelt wird beim Verlassen.
   */
  const tippeUntergrenze = (posIndex: number, menge: number) => {
    setzeStaffelpreisPositionen(prev => setzeUntergrenze(prev, posIndex, 0, menge));
  };

  const merkeUntergrenze = (posIndex: number) => {
    vonVorEingabeRef.current = staffelpreisPositionenRef.current[posIndex]?.staffeln[0]?.vonMenge ?? 0;
    setGrenzenHinweis(null);
    setStaffelEingabeAktiv(true);
  };

  const uebernehmeUntergrenze = (posIndex: number) => {
    setStaffelEingabeAktiv(false);
    const pos = staffelpreisPositionenRef.current[posIndex];
    if (!pos || !pos.staffeln[0]) return;
    const wert = pos.staffeln[0].vonMenge;
    if (wert === vonVorEingabeRef.current) {
      setzeStaffelpreisPositionen(prev => richteAus(prev, posIndex));
      return;
    }
    const pruefung = pruefeUntergrenze(pos.staffeln, 0, wert);
    if (!pruefung.gueltig) {
      setGrenzenHinweis({
        posIndex,
        stufenIndex: 0,
        text: `${pruefung.hinweis ?? 'Menge nicht möglich'} – Eingabe verworfen`,
      });
      setzeStaffelpreisPositionen(prev =>
        richteAus(setzeUntergrenze(prev, posIndex, 0, vonVorEingabeRef.current), posIndex)
      );
      return;
    }
    setGrenzenHinweis(null);
    setzeStaffelpreisPositionen(prev => richteAus(prev, posIndex));
  };

  /** Tippen im „unter"-Feld: nur die eigene Zelle, damit 3 → 30 → 300 nichts mitreißt. */
  const tippeObergrenze = (posIndex: number, staffelIndex: number, wert: number | null) => {
    setzeStaffelpreisPositionen(prev => setzeObergrenze(prev, posIndex, staffelIndex, wert, { koppeln: false }));
  };

  const merkeObergrenze = (posIndex: number, staffelIndex: number) => {
    bisVorEingabeRef.current =
      staffelpreisPositionenRef.current[posIndex]?.staffeln[staffelIndex]?.bisMenge ?? null;
    setGrenzenHinweis(null);
    setStaffelEingabeAktiv(true);
  };

  /**
   * Verlassen des „unter"-Feldes: Erst hier wird die Grenze übernommen, das „ab"
   * der Folgestufe nachgezogen und – bei gekoppelten Grenzen – auf alle Sorten
   * gespiegelt. Eine unmögliche Grenze wird verworfen und sichtbar gemeldet.
   */
  const uebernehmeObergrenze = (posIndex: number, staffelIndex: number) => {
    setStaffelEingabeAktiv(false);
    const pos = staffelpreisPositionenRef.current[posIndex];
    if (!pos) return;
    const wert = pos.staffeln[staffelIndex]?.bisMenge ?? null;
    // Durchgetabbt, ohne etwas zu ändern: Ein Altbestand mit unmöglicher Grenze
    // gehört in die Lückenwarnung, nicht in eine Meldung über eine Eingabe,
    // die es gar nicht gab.
    if (wert === bisVorEingabeRef.current) {
      setzeStaffelpreisPositionen(prev => richteAus(prev, posIndex));
      return;
    }
    // Getippte 0 heißt „offen" – als 0 gespeichert zeigt die Maske „0", das PDF
    // aber „unbegrenzt". Normalisiert wird VOR der Prüfung, nicht an ihr vorbei:
    // eine offene Stufe in der Mitte bleibt unzulässig.
    const normiert = wert === 0 ? null : wert;
    const pruefung = pruefeObergrenze(pos.staffeln, staffelIndex, normiert);
    if (!pruefung.gueltig) {
      const zurueck = bisVorEingabeRef.current;
      setGrenzenHinweis({
        posIndex,
        stufenIndex: staffelIndex,
        text: `${pruefung.hinweis ?? 'Grenze nicht möglich'} – Eingabe verworfen`,
      });
      setzeStaffelpreisPositionen(prev => richteAus(setzeObergrenze(prev, posIndex, staffelIndex, zurueck), posIndex));
      return;
    }
    setGrenzenHinweis(null);
    setzeStaffelpreisPositionen(prev =>
      richteAus(setzeObergrenze(prev, posIndex, staffelIndex, normiert), posIndex)
    );
  };

  /** Stufe anhängen – bei gekoppelten Grenzen in allen Sorten an derselben Grenze. */
  const stufeHinzufuegen = (posIndex?: number) => {
    setGrenzenHinweis(null);
    setStaffelEingabeAktiv(false);
    setzeStaffelpreisPositionen(prev =>
      haengeStufeAn(prev, { nurPosition: grenzenGekoppeltRef.current ? undefined : posIndex })
    );
  };

  /** Stufe löschen – ihr Mengenbereich schlägt der Stufe darunter zu. */
  const stufeEntfernen = (staffelIndex: number, posIndex?: number) => {
    setGrenzenHinweis(null);
    setStaffelEingabeAktiv(false);
    setzeStaffelpreisPositionen(prev =>
      loescheStufe(prev, staffelIndex, { nurPosition: grenzenGekoppeltRef.current ? undefined : posIndex })
    );
  };

  const removeStaffelpreisPosition = (index: number) => {
    setGrenzenHinweis(null);
    setzeStaffelpreisPositionen(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Schalter „Gleiche Staffelgrenzen für alle Sorten".
   *
   * Der Schalter schreibt bewusst KEINE Preise um: Laufen die Raster
   * auseinander, erscheint danach der Angleich-Banner, der vorher zeigt, was
   * sich ändert, und über `gleicheGrenzenAn` jeder Sorte den Preis gibt, den
   * sie bei dieser Menge bisher hatte. Ein stilles `spiegleGrenzen` würde die
   * Preise stattdessen stufenweise verschieben.
   */
  const setzeGrenzenKopplung = (aktiv: boolean) => {
    markiereGeaendert();
    setStaffelEingabeAktiv(false);
    setStaffelKonditionen(prev => ({ ...prev, grenzenGekoppelt: aktiv }));
  };

  /** Altentwurf mit abweichenden Grenzen auf ein Raster bringen (nur auf Klick). */
  const gleicheAlteGrenzenAn = () => {
    setGrenzenHinweis(null);
    setStaffelEingabeAktiv(false);
    const leitIndex = waehleLeitIndex(staffelpreisPositionenRef.current);
    setzeStaffelpreisPositionen(prev => gleicheGrenzenAn(prev, leitIndex));
  };

  // === STAFFEL-KONDITIONEN (Abrechnungsmodell + Hinweistext) ===
  const updateStaffelKonditionen = (updates: Partial<StaffelKonditionen>) => {
    markiereGeaendert();
    setStaffelKonditionen(prev => ({ ...prev, ...updates }));
  };

  const staffelLeitIndex = waehleLeitIndex(staffelpreisPositionen);
  const staffelRaster = staffelpreisPositionen[staffelLeitIndex]?.staffeln ?? [];
  const generierterHinweistext = erzeugeStaffelHinweistext(staffelKonditionen, staffelArtikelFuerText);
  const hinweistextManuell = !!staffelKonditionen.hinweistext?.trim();
  // Bleibt als Sicherung für entkoppelte und für fehlerhaft geladene Angebote
  // stehen, auch wenn sie bei gekoppelten Grenzen konstruktiv nie auslöst.
  const staffelGrenzenWarnung =
    staffelKonditionen.mengenbasis === 'gesamt' && !staffelGrenzenIdentisch(staffelArtikelFuerText);
  // Lücken/Überlappungen (bis 300 t, dann ab 400 t): kein definierter Preis für 350 t
  const luckenSorten = staffelpreisPositionen
    .filter(sp => !staffelnLueckenlos(sp.staffeln))
    .map(sp => sp.artikelBezeichnung || sp.artikelnummer);
  const staffelLueckenWarnung = luckenSorten.length > 0;
  const staffelUnstimmig = staffelGrenzenWarnung || staffelLueckenWarnung;
  const staffelAngleichOffen =
    grenzenGekoppelt &&
    staffelpreisPositionen.length > 1 &&
    !grenzenEinheitlich(staffelpreisPositionen);
  // Am Button steht sonst nur „gesperrt" – der Grund läge zwei Blöcke weiter oben.
  const staffelSperrGruende: string[] = [];
  if (angebotsModus === 'staffelpreis') {
    if (staffelpreisPositionen.length === 0) staffelSperrGruende.push('Es ist noch keine Sorte angelegt.');
    if (staffelGrenzenWarnung)
      staffelSperrGruende.push(
        'Die Stufengrenzen unterscheiden sich je Sorte, die Einstufung zählt aber alle Sorten zusammen.'
      );
    if (staffelLueckenWarnung)
      staffelSperrGruende.push(
        `Die Staffeln schließen nicht lückenlos an (${luckenSorten.join(', ')}).`
      );
    if (staffelAngleichOffen)
      staffelSperrGruende.push(
        'Die Sorten tragen noch unterschiedliche Stufengrenzen – bitte oben angleichen.'
      );
  }
  const offeneAngleichung =
    grenzenGekoppelt && staffelpreisPositionen.length > 1 && !grenzenEinheitlich(staffelpreisPositionen)
      ? ermittleAngleichBefunde(staffelpreisPositionen, staffelLeitIndex)
      : [];
  // Solange die Sorten unterschiedliche Raster tragen, bleiben Grenzen, Stufen
  // und Preise gesperrt: Jede Bearbeitung würde die Sorten stillschweigend
  // vereinheitlichen und dabei die Preise auf andere Mengen schieben. Erst
  // angleichen (oder die Kopplung ausschalten), dann weiterarbeiten.
  //
  // Bewertet wird ausschließlich AUSSERHALB der Eingabe. Während getippt wird,
  // trägt nur die bearbeitete Sorte den neuen Wert – die Raster weichen dann
  // zwangsläufig ab, und eine live berechnete Sperre würde genau das Feld
  // abschalten, in dem der Nutzer gerade tippt.
  const [angleichNoetig, setAngleichNoetig] = useState(false);
  useEffect(() => {
    if (staffelEingabeAktiv) return;
    setAngleichNoetig(staffelAngleichOffen);
  }, [staffelAngleichOffen, staffelEingabeAktiv]);
  // Eine leere Preiszelle fällt in einer Matrix kaum auf – 0,00 €/t wäre der
  // teuerste denkbare Fehler dieses Moduls.
  const fehlendePreise = preisLuecken(staffelpreisPositionen);

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
    if (angebotsModus === 'staffelpreis' && staffelGrenzenWarnung) {
      alert(
        'Die Stufengrenzen unterscheiden sich je Sorte. Bei „Alle Sorten zusammen" ist nicht eindeutig, welche Grenze gilt. ' +
          'Bitte gleiche Grenzen setzen oder die Einstufung auf „Je Sorte getrennt" umstellen.'
      );
      return;
    }
    if (angebotsModus === 'staffelpreis' && staffelAngleichOffen) {
      alert(
        'Die Sorten tragen noch unterschiedliche Stufengrenzen. Bitte oben auf „Grenzen angleichen" klicken ' +
          'oder die Kopplung ausschalten.'
      );
      return;
    }
    if (angebotsModus === 'staffelpreis' && staffelLueckenWarnung) {
      alert(
        'Die Staffeln schließen nicht lückenlos aneinander an. „Bis" einer Stufe muss „Von" der nächsten sein, ' +
          'nur die letzte Stufe darf offen bleiben.'
      );
      return;
    }
    // Eine Stufe ohne Preis geht sonst mit 0,00 €/t an den Kunden.
    if (angebotsModus === 'staffelpreis' && fehlendePreise.length > 0) {
      const liste = fehlendePreise
        .map(l => `• ${l.bezeichnung} ab ${l.vonMenge.toLocaleString('de-DE')} t`)
        .join('\n');
      if (
        !window.confirm(
          `Für diese Stufen ist kein Preis hinterlegt (0,00 €/t):\n${liste}\n\nDas Angebot trotzdem so erstellen?`
        )
      ) {
        return;
      }
    }

    // Den laufenden Entwurfs-Debounce abbrechen: Er schreibt sonst während des
    // Erstellens auf dieselbe Projektspalte wie der Dokumentservice.
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    hatGeaendert.current = false;

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

      // Sicherheitsnetz: Grenzen ein letztes Mal ausrichten. Im Normalfall ist
      // das ein Nulldurchlauf – der Klick auf „Angebot erstellen" nimmt dem
      // bearbeiteten Feld vorher den Fokus, und dessen Blur hat schon gekoppelt.
      const ausgerichteteStaffeln = richteAus(staffelpreisPositionen, staffelLeitIndex);

      // Staffelpreis-Positionen hinzufügen
      const staffelPositionen: PlatzbauerAngebotPosition[] = ausgerichteteStaffeln.map(sp => {
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
            // Zusätzlich strukturiert, damit das Zurücklesen (AB-Übernahme,
            // Rehydrierung) nicht auf die Freitext-Heuristik angewiesen ist.
            // Gedruckt wird weiterhin `beschreibung`.
            lieferregion: sp.lieferregion,
            bemerkung: sp.bemerkung,
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
      // Staffelpositionen nur im Staffelpreis-Modus: Im Standard-Modus sind sie
      // ausgeblendet und dürfen nicht unsichtbar mit aufs PDF rutschen.
      const allePositionen = [
        ...angebotPositionen,
        ...zusatzPositionen,
        ...(angebotsModus === 'staffelpreis' ? staffelPositionen : []),
        ...bedarfPositionen,
      ];

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
        staffelKonditionen,
        zahlungsziel: formData.zahlungsziel,
        zahlungsart: 'Überweisung',
        skontoAktiviert: false,
        skonto: { prozent: 0, tage: 0 },
        lieferzeit: formData.lieferzeit,
        frachtkosten: 0,
        verpackungskosten: 0,
        lieferbedingungenAktiviert: true,
        // Der Frachtrechner-Link hängt an den Lieferbedingungen, weil er dort
        // inhaltlich hingehört und weil der PDF-Service diesen Block bereits
        // umbricht und über Seitenwechsel trägt. Ein eigener Textblock im
        // Dokument-Service müsste dieselbe Logik noch einmal nachbauen.
        lieferbedingungen: `Frei Baustelle, abgeladen\n\n${frachtrechnerHinweis(getPortalPublicUrl())}`,
        bemerkung: formData.bemerkung,
        ihreAnsprechpartner: '',
      };

      await speicherePlatzbauerAngebot(projekt, formularDaten);
      setVerlaufLadeZaehler(prev => prev + 1);
      alert('Angebot wurde erfolgreich erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      // Nach einem Fehlschlag muss der Entwurfs-Debounce wieder greifen.
      hatGeaendert.current = true;
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

  // Ohne zugeordnete Vereine bleibt der Tab bedienbar: Ein Staffelpreis-Angebot
  // braucht keine Vereine. Der Hinweis steht stattdessen im Vereine-Abschnitt.
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

        {vereinPositionen.length === 0 && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Keine Vereine zugeordnet</p>
              <p>
                Diesem Platzbauer sind noch keine Vereine zugeordnet. Ein Staffelpreis-Angebot lässt sich trotzdem erstellen,
                ein Standard-Angebot braucht mindestens einen Verein oder eine Bedarfsposition.
              </p>
            </div>
          </div>
        )}

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
                    <NumberInput
                      value={verein.menge}
                      onChange={(v) => updateVerein(index, { menge: v })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.1"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <NumberInput
                      value={verein.einzelpreis}
                      onChange={(v) => updateVerein(index, { einzelpreis: v })}
                      className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      step="0.01"
                      min="0"
                      dezimalstellen={2}
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

      {/* Stand kommt aus dem erstellten Angebot, nicht aus einem Entwurf */}
      {ausAngebotGeladen && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Stand aus Angebot {ausAngebotGeladen.nummer}
            {ausAngebotGeladen.datum ? ` vom ${new Date(ausAngebotGeladen.datum).toLocaleDateString('de-DE')}` : ''}
            {ausAngebotGeladen.version ? ` (Version ${ausAngebotGeladen.version})` : ''}. Änderungen erzeugen
            beim Erstellen ein neues Angebot.
          </p>
          {ausAngebotGeladen.nichtZugeordnet.length > 0 && (
            <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
              Im Angebot enthalten, dem Platzbauer aber nicht mehr zugeordnet:{' '}
              {ausAngebotGeladen.nichtZugeordnet.join(', ')}.
            </p>
          )}
        </div>
      )}

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
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
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
              Sorte hinzufügen
            </button>
          </div>

          {/* Eine Staffel für alle Sorten (Vorschlag „Automatisierung von Staffelpreisangeboten", 09/2026) */}
          <label className="flex items-start gap-2 mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={grenzenGekoppelt}
              onChange={(e) => setzeGrenzenKopplung(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-amber-600 rounded"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900 dark:text-white">Gleiche Staffelgrenzen für alle Sorten</span>
              <span className="block text-gray-600 dark:text-gray-400">
                Die Mengengrenzen werden einmal gepflegt, die Preise bleiben je Sorte verschieden.
                Ausschalten nur, wenn eine Sorte ausdrücklich anders gestaffelt ist.
              </span>
            </span>
          </label>

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
          ) : grenzenGekoppelt ? (
            /* === Preismatrix: Grenzen einmal, Preise je Sorte === */
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="text-xs font-medium text-gray-500 dark:text-gray-400 text-left">
                      <th className="pb-2 pr-3 w-12">Stufe</th>
                      <th className="pb-2 pr-3 w-24">ab (t)</th>
                      <th className="pb-2 pr-3 w-28">unter (t)</th>
                      {staffelpreisPositionen.map((sp, posIndex) => (
                        <th key={sp.id} className="pb-2 pr-3 min-w-[11rem]">
                          <div className="flex items-center gap-1">
                            <select
                              value={sp.artikelnummer}
                              onChange={(e) => {
                                const artikel = ziegelmehlArtikel.find(a => a.artikelnummer === e.target.value);
                                if (artikel) {
                                  updateStaffelpreisPosition(posIndex, {
                                    artikelnummer: artikel.artikelnummer,
                                    artikelBezeichnung: artikel.bezeichnung,
                                  });
                                }
                              }}
                              className="flex-1 min-w-0 px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-normal"
                            >
                              {ziegelmehlArtikel.map(a => (
                                <option key={a.artikelnummer} value={a.artikelnummer}>
                                  {a.artikelnummer} - {a.bezeichnung}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeStaffelpreisPosition(posIndex)}
                              title="Sorte entfernen"
                              className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="block mt-1 font-normal text-gray-500 dark:text-gray-400">Preis/t (€)</span>
                        </th>
                      ))}
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffelRaster.map((stufe, stufenIndex) => (
                      <tr key={stufenIndex} className="align-top">
                        <td className="py-1 pr-3 text-gray-500 dark:text-gray-400">{stufenIndex + 1}.</td>
                        <td className="py-1 pr-3">
                          {stufenIndex === 0 ? (
                            <NumberInput
                              value={stufe.vonMenge}
                              onChange={(v) => tippeUntergrenze(staffelLeitIndex, v)}
                              onFocus={() => merkeUntergrenze(staffelLeitIndex)}
                              onBlur={() => uebernehmeUntergrenze(staffelLeitIndex)}
                              disabled={angleichNoetig}
                              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              step="1"
                              min="0"
                            />
                          ) : (
                            <span
                              title="Wird aus dem Feld ‚unter‘ der Stufe darüber übernommen – dort ändern."
                              className="inline-block w-24 px-2 py-1.5 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 border border-dashed border-gray-300 dark:border-slate-600 rounded"
                            >
                              {stufe.vonMenge.toLocaleString('de-DE')}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3">
                          <OptionalNumberInput
                            value={stufe.bisMenge ?? null}
                            onChange={(v) => tippeObergrenze(staffelLeitIndex, stufenIndex, v)}
                            onFocus={() => merkeObergrenze(staffelLeitIndex, stufenIndex)}
                            onBlur={() => uebernehmeObergrenze(staffelLeitIndex, stufenIndex)}
                            disabled={angleichNoetig}
                            placeholder="∞"
                            className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                            step="1"
                            min="0"
                          />
                          {grenzenHinweis?.stufenIndex === stufenIndex &&
                            grenzenHinweis.posIndex === staffelLeitIndex && (
                            <span className="block mt-1 text-xs text-red-600 dark:text-red-400 w-28">
                              {grenzenHinweis.text}
                            </span>
                          )}
                        </td>
                        {staffelpreisPositionen.map((sp, posIndex) =>
                          sp.staffeln[stufenIndex] ? (
                            <td key={`${sp.id}-${stufenIndex}`} className="py-1 pr-3">
                              <NumberInput
                                value={sp.staffeln[stufenIndex].einzelpreis}
                                onChange={(v) => updateStaffelPreis(posIndex, stufenIndex, v)}
                                disabled={angleichNoetig}
                                title={
                                  angleichNoetig
                                    ? 'Diese Zeile zeigt die Grenzen der Leitsorte – erst angleichen, dann Preise pflegen.'
                                    : undefined
                                }
                                className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                                step="0.01"
                                min="0"
                                dezimalstellen={2}
                                suffix="€"
                              />
                            </td>
                          ) : (
                            /* Altentwurf: Diese Sorte kennt die Stufe noch nicht.
                               Ein Eingabefeld hier würde Eingaben stumm schlucken. */
                            <td key={`${sp.id}-${stufenIndex}`} className="py-1 pr-3">
                              <span
                                title="Diese Sorte hat diese Stufe noch nicht – zuerst die Grenzen angleichen."
                                className="inline-block w-28 px-2 py-1.5 text-sm text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/60 border border-dashed border-gray-300 dark:border-slate-600 rounded"
                              >
                                —
                              </span>
                            </td>
                          )
                        )}
                        <td className="py-1">
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => stufeEntfernen(stufenIndex)}
                            disabled={staffelRaster.length <= 1 || angleichNoetig}
                            title="Stufe in allen Sorten entfernen – ihr Mengenbereich schlägt der Stufe darunter zu"
                            className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => stufeHinzufuegen()}
                disabled={angleichNoetig}
                className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Stufe hinzufügen
              </button>

              {/* Angaben je Sorte, die nicht in die Matrix gehören */}
              <div className="pt-3 border-t border-amber-200 dark:border-amber-800 space-y-3">
                {staffelpreisPositionen.map((sp, posIndex) => (
                  <div key={sp.id} className="grid grid-cols-1 md:grid-cols-[10rem_1fr_1fr] gap-3 items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {sp.artikelBezeichnung}
                    </span>
                    <input
                      type="text"
                      value={sp.lieferregion || ''}
                      onChange={(e) => updateStaffelpreisPosition(posIndex, { lieferregion: e.target.value })}
                      placeholder="Lieferregion, z.B. Bayern, PLZ 8xxxx-9xxxx"
                      className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    />
                    <input
                      type="text"
                      value={sp.bemerkung || ''}
                      onChange={(e) => updateStaffelpreisPosition(posIndex, { bemerkung: e.target.value })}
                      placeholder="Bemerkung, z.B. inkl. Fracht, ab Werk"
                      className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* === Getrennte Staffeln je Sorte (Kopplung ausgeschaltet) === */
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
                          <span className="w-24">ab (t)</span>
                          <span className="w-24">unter (t)</span>
                          <span className="w-28">Preis/t (€)</span>
                          <span className="w-8"></span>
                        </div>
                        {sp.staffeln.map((staffel, staffelIndex) => (
                          <div key={staffelIndex} className="flex gap-2 items-start">
                            {staffelIndex === 0 ? (
                              <NumberInput
                                value={staffel.vonMenge}
                                onChange={(v) => tippeUntergrenze(posIndex, v)}
                                onFocus={() => merkeUntergrenze(posIndex)}
                                onBlur={() => uebernehmeUntergrenze(posIndex)}
                                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                                step="1"
                                min="0"
                              />
                            ) : (
                              <span
                                title="Wird aus dem Feld ‚unter‘ der Stufe darüber übernommen – dort ändern."
                                className="inline-block w-24 px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 border border-dashed border-gray-300 dark:border-slate-600 rounded"
                              >
                                {staffel.vonMenge.toLocaleString('de-DE')}
                              </span>
                            )}
                            <div className="w-24">
                              <OptionalNumberInput
                                value={staffel.bisMenge ?? null}
                                onChange={(v) => tippeObergrenze(posIndex, staffelIndex, v)}
                                onFocus={() => merkeObergrenze(posIndex, staffelIndex)}
                                onBlur={() => uebernehmeObergrenze(posIndex, staffelIndex)}
                                placeholder="∞"
                                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                                step="1"
                                min="0"
                              />
                              {grenzenHinweis?.stufenIndex === staffelIndex &&
                                grenzenHinweis.posIndex === posIndex && (
                                <span className="block mt-1 text-xs text-red-600 dark:text-red-400">
                                  {grenzenHinweis.text}
                                </span>
                              )}
                            </div>
                            <NumberInput
                              value={staffel.einzelpreis}
                              onChange={(v) => updateStaffelPreis(posIndex, staffelIndex, v)}
                              className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              step="0.01"
                              min="0"
                              dezimalstellen={2}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              title="Stufe entfernen – ihr Mengenbereich schlägt der Stufe darunter zu"
                              onClick={() => stufeEntfernen(staffelIndex, posIndex)}
                              disabled={sp.staffeln.length <= 1}
                              className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => stufeHinzufuegen(posIndex)}
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

          {/* Altentwurf mit abweichenden Grenzen: nie ungefragt umschreiben */}
          {angleichNoetig && offeneAngleichung.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Dieses Angebot trägt noch unterschiedliche Stufengrenzen je Sorte. Bis zum Angleich sind die
                Grenzen gesperrt. Angeglichen wird auf das Raster mit den meisten Stufen; jede Sorte behält
                den Preis, den sie bei dieser Menge bisher hatte:
              </p>
              <ul className="mt-2 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                {offeneAngleichung.map(b => (
                  <li key={b.bezeichnung}>
                    {b.bezeichnung}: {b.alteGrenzen} → {b.neueGrenzen}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={gleicheAlteGrenzenAn}
                className="mt-2 px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                Grenzen angleichen
              </button>
            </div>
          )}

          {/* 0,00 €/t fällt in einer Matrix kaum auf */}
          {fehlendePreise.length > 0 && !staffelEingabeAktiv && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">
                Ohne Preis (0,00 €/t):{' '}
                {fehlendePreise
                  .map(l => `${l.bezeichnung} ab ${l.vonMenge.toLocaleString('de-DE')} t`)
                  .join(', ')}
              </p>
            </div>
          )}

          {/* Staffelung & Abrechnung */}
          <div className="mt-6 pt-6 border-t border-amber-200 dark:border-amber-800 space-y-5">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-500" />
                Staffelung &amp; Abrechnung
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Legt fest, ob der günstigere Preis rückwirkend gilt und wie die Differenz zum Platzbauer zurückfließt.
                Daraus entsteht der Hinweistext auf dem Angebot.
              </p>
            </div>

            {/* Abrechnungsmodell */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STAFFEL_MODELLE.map(modell => {
                const aktiv = staffelKonditionen.abrechnungsmodell === modell.wert;
                return (
                  <button
                    key={modell.wert}
                    type="button"
                    onClick={() => {
                      if (aktiv) return;
                      // Ein manuell geschriebener Text beschreibt das alte Modell.
                      // Bleibt er stehen, widersprechen sich Kopfzeile, grüne Box und Hinweis.
                      const zuruecksetzen =
                        hinweistextManuell &&
                        window.confirm(
                          'Der Hinweistext ist manuell angepasst und beschreibt das bisherige Modell. ' +
                            'Auf den automatischen Text für das neue Modell zurücksetzen?\n\n' +
                            'OK = zurücksetzen, Abbrechen = eigenen Text behalten.'
                        );
                      updateStaffelKonditionen({
                        abrechnungsmodell: modell.wert,
                        ...(zuruecksetzen ? { hinweistext: undefined } : {}),
                      });
                    }}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      aktiv
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${aktiv ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-gray-200'}`}>
                        {modell.titel}
                      </span>
                      {modell.empfohlen && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                          empfohlen
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{modell.kurz}</p>
                  </button>
                );
              })}
            </div>

            {/* Mengenbasis, Zeitraum, Zahlungsbedingung */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Einstufung</label>
                <select
                  value={staffelKonditionen.mengenbasis}
                  onChange={(e) => updateStaffelKonditionen({ mengenbasis: e.target.value as StaffelKonditionen['mengenbasis'] })}
                  className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                >
                  {STAFFEL_MENGENBASEN.map(b => (
                    <option key={b.wert} value={b.wert}>{b.titel}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Zeitraum von</label>
                <input
                  type="date"
                  value={staffelKonditionen.zeitraumVon || ''}
                  onChange={(e) => updateStaffelKonditionen({ zeitraumVon: e.target.value })}
                  className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stichtag (bis)</label>
                <input
                  type="date"
                  value={staffelKonditionen.zeitraumBis || ''}
                  onChange={(e) => updateStaffelKonditionen({ zeitraumBis: e.target.value })}
                  className="w-full px-2 py-1.5 border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              {staffelKonditionen.abrechnungsmodell !== 'stufenpreis' && (
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 md:pt-6">
                  <input
                    type="checkbox"
                    checked={staffelKonditionen.gutschriftNurBeiZahlung}
                    onChange={(e) => updateStaffelKonditionen({ gutschriftNurBeiZahlung: e.target.checked })}
                    className="mt-0.5 rounded border-amber-300"
                  />
                  <span>Gutschrift nur bei fristgerechter Zahlung</span>
                </label>
              )}
            </div>

            {staffelGrenzenWarnung && !staffelEingabeAktiv && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  Die Stufengrenzen unterscheiden sich je Sorte. Bei „Alle Sorten zusammen" ist dann nicht eindeutig,
                  welche Grenze gilt. Gleiche Grenzen setzen oder auf „Je Sorte getrennt" umstellen.
                </p>
              </div>
            )}
            {staffelLueckenWarnung && !staffelEingabeAktiv && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  Die Staffeln von {luckenSorten.join(', ')} schließen nicht lückenlos aneinander an („Bis" einer Stufe muss „Von" der nächsten sein,
                  nur die letzte Stufe darf offen bleiben). Sonst gibt es für Mengen dazwischen keinen Preis.
                </p>
              </div>
            )}

            {/* Hinweistext */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Hinweistext auf dem Angebot
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                    hinweistextManuell
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                  }`}>
                    {hinweistextManuell ? 'manuell angepasst' : 'automatisch aus dem Modell'}
                  </span>
                </label>
                {hinweistextManuell && (
                  <button
                    type="button"
                    onClick={() => updateStaffelKonditionen({ hinweistext: undefined })}
                    className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Auf automatischen Text zurücksetzen
                  </button>
                )}
              </div>
              <textarea
                value={hinweistextManuell ? staffelKonditionen.hinweistext : generierterHinweistext}
                onChange={(e) => updateStaffelKonditionen({ hinweistext: e.target.value })}
                rows={12}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-mono leading-relaxed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leerzeile trennt Absätze. Eine kurze Zeile mit Doppelpunkt am Ende wird auf dem PDF fett gesetzt.
                Das Beispiel rechnet mit den Staffeln der ersten Sorte und aktualisiert sich, solange der Text automatisch ist.
                Ein manuell angepasster Text folgt Änderungen an Modell, Zeitraum oder Staffeln nicht mehr. Feld komplett leeren = zurück zum automatischen Text.
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
                      <NumberInput
                        value={bp.geschaetzteMenge}
                        onChange={(v) => updateBedarfsPosition(index, { geschaetzteMenge: v })}
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
                      <NumberInput
                        value={bp.einzelpreis}
                        onChange={(v) => updateBedarfsPosition(index, { einzelpreis: v })}
                        className="w-full px-2 py-1.5 border border-teal-300 dark:border-teal-700 rounded-l bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                        step="0.01"
                        min="0"
                        dezimalstellen={2}
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
                <NumberInput
                  value={pos.menge}
                  onChange={(v) => updateZusatzPosition(index, { menge: v })}
                  className="w-20 px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  step="0.1"
                />
                <span className="text-gray-500 dark:text-gray-400 w-10 text-center">{pos.einheit}</span>
                <NumberInput
                  value={pos.einzelpreis}
                  onChange={(v) => updateZusatzPosition(index, { einzelpreis: v })}
                  className="w-24 px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  step="0.01"
                  dezimalstellen={2}
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

          {staffelSperrGruende.length > 0 && !staffelEingabeAktiv && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Angebot noch nicht erstellbar:
              </p>
              <ul className="mt-1 text-sm text-amber-800 dark:text-amber-300 list-disc list-inside space-y-0.5">
                {staffelSperrGruende.map(grund => (
                  <li key={grund}>{grund}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleAngebotErstellen}
            disabled={speichern || (angebotsModus === 'standard' && ausgewaehlteVereine.length === 0 && bedarfsPositionen.length === 0) || (angebotsModus === 'staffelpreis' && (staffelpreisPositionen.length === 0 || staffelUnstimmig || staffelAngleichOffen))}
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
