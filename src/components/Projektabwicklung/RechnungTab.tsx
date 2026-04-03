import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2, Download, FileCheck, AlertCircle, CheckCircle2, Loader2, Lock, AlertTriangle, Cloud, CloudOff, Ban, RefreshCw, FileX, Mail, FileText, Package, ShoppingBag, Search, Fuel, Pencil, X, Info } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortablePosition from './SortablePosition';
import NumericInput from '../Shared/NumericInput';
import { RechnungsDaten, Position, GespeichertesDokument, ProformaRechnungsDaten } from '../../types/projektabwicklung';
import { generiereRechnungPDF, generiereProformaRechnungPDF, berechneRechnungsSummen } from '../../services/rechnungService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  ladeDokumentNachTyp,
  speichereRechnung,
  speichereStornoRechnung,
  speichereProformaRechnung,
  kannNeueRechnungErstellen,
  ladeDokumentDaten,
  getFileDownloadUrl,
  speichereEntwurf,
  ladeEntwurf,
  ladePositionenVonVorherigem,
  ladeDatenVonStornoRechnung
} from '../../services/projektabwicklungDokumentService';
import { Projekt } from '../../types/projekt';
import { formatAdresszeile } from '../../services/pdfHelpers';
import { Artikel } from '../../types/artikel';
import { UniversalArtikel } from '../../types/universaArtikel';
import { getAlleArtikel } from '../../services/artikelService';
import { getAlleUniversalArtikel, sucheUniversalArtikel } from '../../services/universaArtikelService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import DokumentVerlauf from './DokumentVerlauf';
import EmailFormular from './EmailFormular';
import { holeDieselPreisFuerDatum, getAktuellerDurchschnittspreis, DieselPreisErgebnis } from '../../utils/dieselPreisAPI';
import {
  berechneGesamtZuschlag,
  erstelleDieselZuschlagPosition,
  getDieselPreisStatus,
  istDieselZuschlagPosition,
  istZuschlagsfaehig,
  formatDieselPreis,
  formatZuschlagProTonne,
  formatGesamtZuschlag,
  DieselZuschlagErgebnis,
  DieselPreisStatus,
} from '../../utils/dieselZuschlag';
import DokumentAdresseFormular, { DokumentAdresse } from './DokumentAdresseFormular';
import { SaisonKunde } from '../../types/saisonplanung';
import jsPDF from 'jspdf';

interface RechnungTabProps {
  projekt?: Projekt;
  kunde?: SaisonKunde | null;
  kundeInfo?: {
    kundennummer?: string;
    kundenname: string;
    kundenstrasse: string;
    kundenPlzOrt: string;
    ansprechpartner?: string;
    angefragteMenge?: number;
    preisProTonne?: number;
    notizen?: string;
  };
}

const RechnungTab = ({ projekt, kunde: kundeFromProps, kundeInfo }: RechnungTabProps) => {
  // Geladener Kunde (Fallback wenn nicht von Props übergeben)
  const [geladenerKunde, setGeladenerKunde] = useState<SaisonKunde | null>(null);

  // Kunde laden, wenn nicht von Props übergeben
  useEffect(() => {
    const ladeKunde = async () => {
      if (!kundeFromProps && projekt?.kundeId) {
        try {
          const k = await saisonplanungService.loadKunde(projekt.kundeId);
          setGeladenerKunde(k);
        } catch (error) {
          console.warn('Kunde konnte nicht geladen werden:', error);
        }
      }
    };
    ladeKunde();
  }, [projekt?.kundeId, kundeFromProps]);

  // Verwende Props-Kunde oder geladenen Kunden
  const kunde = kundeFromProps || geladenerKunde;

  // Platzbauer laden (für Platzbauer-Projekte)
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde | null>(null);

  useEffect(() => {
    const ladePlatzbauer = async () => {
      if (!projekt?.istPlatzbauerprojekt || !projekt?.zugeordnetesPlatzbauerprojektId) {
        setPlatzbauer(null);
        return;
      }

      try {
        // Lade Platzbauerprojekt um platzbauerId zu bekommen
        const platzbauerprojekt = await platzbauerverwaltungService.getPlatzbauerprojekt(
          projekt.zugeordnetesPlatzbauerprojektId
        );
        if (platzbauerprojekt?.platzbauerId) {
          // Lade Platzbauer-Kundendaten
          const pb = await saisonplanungService.loadKunde(platzbauerprojekt.platzbauerId);
          setPlatzbauer(pb);
        }
      } catch (error) {
        console.warn('Fehler beim Laden der Platzbauer-Daten:', error);
      }
    };
    ladePlatzbauer();
  }, [projekt?.istPlatzbauerprojekt, projekt?.zugeordnetesPlatzbauerprojektId]);

  const [rechnungsDaten, setRechnungsDaten] = useState<RechnungsDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',

    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',

    bankname: 'Sparkasse Tauberfranken',
    iban: 'DE49 6735 0130 0000254019',
    bic: 'SOLADES1TBB',

    rechnungsnummer: '',
    rechnungsdatum: new Date().toISOString().split('T')[0],
    leistungsdatum: new Date().toISOString().split('T')[0],

    positionen: [],
    zahlungsziel: '14 Tage',
  });

  // Dokument-Status
  const [gespeichertesDokument, setGespeichertesDokument] = useState<GespeichertesDokument | null>(null);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'speichern' | 'fehler'>('laden');
  const [statusMeldung, setStatusMeldung] = useState<{ typ: 'erfolg' | 'fehler' | 'warnung'; text: string } | null>(null);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  // E-Mail-Formular
  const [showEmailFormular, setShowEmailFormular] = useState(false);
  const [emailPdf, setEmailPdf] = useState<jsPDF | null>(null);

  // Storno-Status
  const [showStornoDialog, setShowStornoDialog] = useState(false);
  const [stornoGrund, setStornoGrund] = useState('');
  const [stornoInProgress, setStornoInProgress] = useState(false);
  const [neueRechnungMoeglich, setNeueRechnungMoeglich] = useState(false);
  const [verlaufLadeZaehler, setVerlaufLadeZaehler] = useState(0); // Trigger für Verlauf-Neuladen

  // Proforma-Rechnung Status
  const [proformaInProgress, setProformaInProgress] = useState(false);
  const [proformaVerlaufZaehler, setProformaVerlaufZaehler] = useState(0);

  // Auto-Save Status (nur für Entwürfe, Rechnungen sind final!)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);
  const initialLaden = useRef(true);

  // Artikel-Auswahl States
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [universalArtikel, setUniversalArtikel] = useState<UniversalArtikel[]>([]);
  const [showArtikelAuswahl, setShowArtikelAuswahl] = useState(false);
  const [artikelTab, setArtikelTab] = useState<'eigene' | 'universa'>('eigene');
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [artikelSortierung, setArtikelSortierung] = useState<'bezeichnung' | 'artikelnummer' | 'einzelpreis'>('bezeichnung');
  const [universalLaden, setUniversalLaden] = useState(false);
  const [ausgewaehlterIndex, setAusgewaehlterIndex] = useState<number>(0);
  const [artikelHinzugefuegt, setArtikelHinzugefuegt] = useState<string | null>(null);
  const ausgewaehlteZeileRef = useRef<HTMLTableRowElement>(null);

  // === DIESELPREISZUSCHLAG STATE ===
  const [dieselPreis, setDieselPreis] = useState<number | null>(null);
  const [dieselPreisStatus, setDieselPreisStatus] = useState<DieselPreisStatus>('geladen');
  const [dieselPreisLaden, setDieselPreisLaden] = useState(false);
  const [dieselZuschlagErgebnis, setDieselZuschlagErgebnis] = useState<DieselZuschlagErgebnis | null>(null);
  const [dieselPreisManuell, setDieselPreisManuell] = useState(false);
  const [dieselPreisEditieren, setDieselPreisEditieren] = useState(false);
  const [dieselPreisEingabe, setDieselPreisEingabe] = useState('');
  const dieselZuschlagManuellEntfernt = useRef(false);
  const dieselDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Gespeichertes Dokument und Entwurf laden (wenn Projekt vorhanden)
  useEffect(() => {
    const ladeDokument = async () => {
      if (!projekt?.$id) {
        setLadeStatus('bereit');
        initialLaden.current = false;
        return;
      }
      
      try {
        setLadeStatus('laden');
        
        // Erst prüfen ob eine finale Rechnung existiert
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'rechnung');
        
        // Prüfen ob neue Rechnung möglich ist (nach Storno)
        const neueRechnungPruefung = await kannNeueRechnungErstellen(projekt.$id);

        if (dokument) {
          setGespeichertesDokument(dokument);
          
          // Prüfen ob die Rechnung storniert wurde - bestimmt ob neue Rechnung erstellt werden kann
          if (dokument.rechnungsStatus === 'storniert') {
            setNeueRechnungMoeglich(neueRechnungPruefung.erlaubt);
          } else {
            setNeueRechnungMoeglich(false);
          }
          
          // Lade gespeicherte Daten zur Anzeige
          const gespeicherteDaten = ladeDokumentDaten<RechnungsDaten>(dokument);
          if (gespeicherteDaten) {
            // Übernehme Lieferadresse aus Projekt, falls nicht bereits im Dokument gespeichert
            const lieferadresseAbweichend = gespeicherteDaten.lieferadresseAbweichend
              ? gespeicherteDaten.lieferadresseAbweichend
              : (projekt?.lieferadresse ? true : false);
            // Bei Platzbauer-Projekten: kunde.name ist der Verein (Lieferempfänger)
            const lieferadresseName = gespeicherteDaten.lieferadresseName
              ? gespeicherteDaten.lieferadresseName
              : (projekt?.lieferadresse
                ? (projekt?.istPlatzbauerprojekt && kunde?.name ? kunde.name : projekt.kundenname)
                : undefined);
            const lieferadresseStrasse = gespeicherteDaten.lieferadresseStrasse
              ? gespeicherteDaten.lieferadresseStrasse
              : (projekt?.lieferadresse?.strasse || undefined);
            const lieferadressePlzOrt = gespeicherteDaten.lieferadressePlzOrt
              ? gespeicherteDaten.lieferadressePlzOrt
              : (projekt?.lieferadresse
                ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                : undefined);
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setRechnungsDaten({
              ...gespeicherteDaten,
              kundennummer: gespeicherteDaten.kundennummer || projekt?.kundennummer,
              kundenname: gespeicherteDaten.kundenname || projekt?.kundenname || '',
              kundenstrasse: gespeicherteDaten.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: gespeicherteDaten.kundenPlzOrt || projekt?.kundenPlzOrt || '',
              lieferadresseAbweichend: lieferadresseAbweichend,
              lieferadresseName: lieferadresseName,
              lieferadresseStrasse: lieferadresseStrasse,
              lieferadressePlzOrt: lieferadressePlzOrt,
            });
          }
          setAutoSaveStatus('gespeichert');
        } else {
          // Keine Rechnung vorhanden - prüfen ob neue erstellt werden darf
          setNeueRechnungMoeglich(neueRechnungPruefung.erlaubt);
          // Keine finale Rechnung - versuche Entwurf zu laden
          const entwurf = await ladeEntwurf<RechnungsDaten>(projekt.$id, 'rechnungsDaten');
          if (entwurf) {
            // Übernehme Lieferadresse aus Projekt, falls nicht bereits im Entwurf gespeichert
            const lieferadresseAbweichend = entwurf.lieferadresseAbweichend
              ? entwurf.lieferadresseAbweichend
              : (projekt?.lieferadresse ? true : false);
            // Bei Platzbauer-Projekten: kunde.name ist der Verein (Lieferempfänger)
            const lieferadresseName = entwurf.lieferadresseName
              ? entwurf.lieferadresseName
              : (projekt?.lieferadresse
                ? (projekt?.istPlatzbauerprojekt && kunde?.name ? kunde.name : projekt.kundenname)
                : undefined);
            const lieferadresseStrasse = entwurf.lieferadresseStrasse
              ? entwurf.lieferadresseStrasse
              : (projekt?.lieferadresse?.strasse || undefined);
            const lieferadressePlzOrt = entwurf.lieferadressePlzOrt
              ? entwurf.lieferadressePlzOrt
              : (projekt?.lieferadresse
                ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                : undefined);
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setRechnungsDaten({
              ...entwurf,
              kundennummer: entwurf.kundennummer || projekt?.kundennummer,
              kundenname: entwurf.kundenname || projekt?.kundenname || '',
              kundenstrasse: entwurf.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: entwurf.kundenPlzOrt || projekt?.kundenPlzOrt || '',
              lieferadresseAbweichend: lieferadresseAbweichend,
              lieferadresseName: lieferadresseName,
              lieferadresseStrasse: lieferadresseStrasse,
              lieferadressePlzOrt: lieferadressePlzOrt,
            });
            setAutoSaveStatus('gespeichert');
          }
        }
        
        setLadeStatus('bereit');
        initialLaden.current = false;
      } catch (error) {
        console.error('Fehler beim Laden des Dokuments:', error);
        setLadeStatus('bereit');
        initialLaden.current = false;
      }
    };
    
    ladeDokument();
  }, [projekt?.$id]);

  // Auto-Save mit Debounce (nur für Entwürfe, nicht für finale Rechnungen!)
  const speichereAutomatisch = useCallback(async (daten: RechnungsDaten) => {
    if (!projekt?.$id || initialLaden.current || gespeichertesDokument) return;
    
    try {
      setAutoSaveStatus('speichern');
      await speichereEntwurf(projekt.$id, 'rechnungsDaten', daten);
      setAutoSaveStatus('gespeichert');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setAutoSaveStatus('fehler');
    }
  }, [projekt?.$id, gespeichertesDokument]);

  // Debounced Auto-Save bei Änderungen (nur wenn noch keine finale Rechnung existiert!)
  useEffect(() => {
    if (initialLaden.current || !hatGeaendert.current || gespeichertesDokument) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch(rechnungsDaten);
    }, 1500);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [rechnungsDaten, speichereAutomatisch, gespeichertesDokument]);

  // Rechnungsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!rechnungsDaten.rechnungsnummer && !projekt?.rechnungsnummer && !gespeichertesDokument) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('rechnung');
          setRechnungsDaten(prev => ({ ...prev, rechnungsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Rechnungsnummer:', error);
          // Fallback: Verwende Timestamp-basierte eindeutige Nummer
          const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
          setRechnungsDaten(prev => ({ 
            ...prev, 
            rechnungsnummer: `RE-${laufnummer}` 
          }));
        }
      }
    };
    generiereNummer();
  }, [gespeichertesDokument]);

  // Artikel laden
  useEffect(() => {
    const ladeArtikel = async () => {
      try {
        const artikelListe = await getAlleArtikel();
        setArtikel(artikelListe);
      } catch (error) {
        console.error('Fehler beim Laden der Artikel:', error);
      }
    };
    ladeArtikel();
  }, []);

  // Universal-Artikel laden wenn Tab gewechselt wird
  useEffect(() => {
    const ladeUniversalArtikel = async () => {
      if (artikelTab !== 'universa' || !showArtikelAuswahl) return;
      if (universalArtikel.length > 0 && !artikelSuchtext) return; // Schon geladen

      setUniversalLaden(true);
      try {
        if (artikelSuchtext.trim()) {
          const ergebnisse = await sucheUniversalArtikel(artikelSuchtext);
          setUniversalArtikel(ergebnisse);
        } else {
          const result = await getAlleUniversalArtikel('bezeichnung', 100);
          setUniversalArtikel(result.artikel);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Universal-Artikel:', error);
      } finally {
        setUniversalLaden(false);
      }
    };
    ladeUniversalArtikel();
  }, [artikelTab, showArtikelAuswahl, artikelSuchtext]);

  // Ausgewählten Index zurücksetzen bei Suchtext- oder Tab-Änderung
  useEffect(() => {
    setAusgewaehlterIndex(0);
  }, [artikelSuchtext, artikelTab]);

  // Ausgewählte Zeile in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (ausgewaehlteZeileRef.current) {
      ausgewaehlteZeileRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [ausgewaehlterIndex]);

  // === DIESELPREISZUSCHLAG: Preis abrufen wenn Leistungsdatum sich ändert ===
  useEffect(() => {
    // Nicht bei finaler Rechnung oder wenn manueller Preis gesetzt
    if (gespeichertesDokument || dieselPreisManuell) return;

    // Debounce bei Leistungsdatum-Änderung
    if (dieselDebounceTimer.current) {
      clearTimeout(dieselDebounceTimer.current);
    }

    const leistungsdatum = rechnungsDaten.leistungsdatum;
    if (!leistungsdatum) {
      setDieselPreis(null);
      setDieselZuschlagErgebnis(null);
      return;
    }

    dieselDebounceTimer.current = setTimeout(async () => {
      try {
        setDieselPreisLaden(true);

        // NEUE LOGIK: Preis für das spezifische Leistungsdatum aus DB oder API holen
        const ergebnis: DieselPreisErgebnis = await holeDieselPreisFuerDatum(leistungsdatum, '97828');

        setDieselPreis(ergebnis.preis);

        // Status basierend auf Quelle setzen
        if (ergebnis.quelle === 'datenbank') {
          setDieselPreisStatus(ergebnis.istHistorisch ? 'historisch' : 'geladen');
          if (ergebnis.hinweis) {
            console.log(`📅 ${ergebnis.hinweis}`);
          }
        } else if (ergebnis.quelle === 'api') {
          const datumStatus = getDieselPreisStatus(leistungsdatum);
          setDieselPreisStatus(datumStatus === 'zukunft' ? 'zukunft' : 'geladen');
        } else {
          setDieselPreisStatus('fallback');
        }

        console.log(`✅ Dieselpreis für ${leistungsdatum}: ${ergebnis.preis.toFixed(3)} €/L (Quelle: ${ergebnis.quelle})`);
      } catch (error) {
        console.warn('Fehler beim Laden des Dieselpreises:', error);
        setDieselPreis(getAktuellerDurchschnittspreis());
        setDieselPreisStatus('fallback');
      } finally {
        setDieselPreisLaden(false);
      }
    }, 500); // 500ms Debounce

    return () => {
      if (dieselDebounceTimer.current) {
        clearTimeout(dieselDebounceTimer.current);
      }
    };
  }, [rechnungsDaten.leistungsdatum, gespeichertesDokument, dieselPreisManuell]);

  // === DIESELPREISZUSCHLAG: Position einfügen/aktualisieren (MUSS VOR useEffect definiert werden!) ===
  const aktualisiereZuschlagPosition = useCallback((ergebnis: DieselZuschlagErgebnis) => {
    setRechnungsDaten(prev => {
      // Filtere bestehende TM-DZ Position heraus
      const positionenOhneZuschlag = prev.positionen.filter(p => !istDieselZuschlagPosition(p));

      // Wenn kein Zuschlag oder keine zuschlagsfähigen Tonnen: nur entfernen
      if (!ergebnis.hatZuschlag || ergebnis.gesamtTonnen === 0) {
        if (positionenOhneZuschlag.length !== prev.positionen.length) {
          return { ...prev, positionen: positionenOhneZuschlag };
        }
        return prev;
      }

      // Position erstellen
      const zuschlagPosition = erstelleDieselZuschlagPosition(ergebnis);

      // Position VOR TM-FP (Frachtkostenpauschale) einfügen, sonst ans Ende
      const fpIndex = positionenOhneZuschlag.findIndex(p => p.artikelnummer === 'TM-FP');
      const neuePositionen = [...positionenOhneZuschlag];

      if (fpIndex !== -1) {
        neuePositionen.splice(fpIndex, 0, zuschlagPosition);
      } else {
        neuePositionen.push(zuschlagPosition);
      }

      return { ...prev, positionen: neuePositionen };
    });
  }, []);

  // === DIESELPREISZUSCHLAG: Berechnung aktualisieren (NUR Anzeige, ohne Position zu ändern) ===
  // Berechne bei jeder Positionsänderung, aber OHNE die Positionen zu modifizieren (verhindert Infinite Loop)
  const dieselZuschlagBerechnet = useMemo(() => {
    if (!dieselPreis || !rechnungsDaten.leistungsdatum || gespeichertesDokument) {
      return null;
    }
    return berechneGesamtZuschlag(
      rechnungsDaten.positionen,
      dieselPreis,
      rechnungsDaten.leistungsdatum
    );
  }, [dieselPreis, rechnungsDaten.positionen, rechnungsDaten.leistungsdatum, gespeichertesDokument]);

  // Ergebnis für UI-Anzeige setzen
  useEffect(() => {
    setDieselZuschlagErgebnis(dieselZuschlagBerechnet);
  }, [dieselZuschlagBerechnet]);

  // === DIESELPREISZUSCHLAG: Position NUR bei Dieselpreis/Leistungsdatum-Änderung einfügen ===
  // Separater useEffect, der NICHT auf Positionsänderungen reagiert (verhindert Infinite Loop)
  const letzterDieselPreisRef = useRef<number | null>(null);
  const letztesLeistungsdatumRef = useRef<string>('');

  useEffect(() => {
    // Nur ausführen wenn sich Dieselpreis oder Leistungsdatum tatsächlich geändert haben
    if (
      dieselPreis === letzterDieselPreisRef.current &&
      rechnungsDaten.leistungsdatum === letztesLeistungsdatumRef.current
    ) {
      return;
    }

    letzterDieselPreisRef.current = dieselPreis;
    letztesLeistungsdatumRef.current = rechnungsDaten.leistungsdatum || '';

    if (!dieselPreis || !rechnungsDaten.leistungsdatum || gespeichertesDokument) {
      return;
    }

    // Position automatisch einfügen/aktualisieren (wenn nicht manuell entfernt)
    if (!dieselZuschlagManuellEntfernt.current && dieselZuschlagBerechnet) {
      aktualisiereZuschlagPosition(dieselZuschlagBerechnet);
    }
  }, [dieselPreis, rechnungsDaten.leistungsdatum, gespeichertesDokument, dieselZuschlagBerechnet, aktualisiereZuschlagPosition]);

  // === DIESELPREISZUSCHLAG: Manuellen Preis setzen ===
  const setzeManuellenDieselPreis = () => {
    const eingabe = parseFloat(dieselPreisEingabe.replace(',', '.'));
    if (!isNaN(eingabe) && eingabe > 0) {
      setDieselPreis(eingabe);
      setDieselPreisManuell(true);
      setDieselPreisStatus('manuell');
      setDieselPreisEditieren(false);
      dieselZuschlagManuellEntfernt.current = false; // Reset wenn manuell eingegeben
    }
  };

  // === DIESELPREISZUSCHLAG: Prüfen ob zuschlagsfähige Positionen vorhanden ===
  const hatZuschlagsfaehigePositionen = rechnungsDaten.positionen
    .filter(p => !istDieselZuschlagPosition(p))
    .some(istZuschlagsfaehig);

  // Wenn Projekt oder Kundendaten übergeben wurden, fülle das Formular vor
  useEffect(() => {
    const ladeDaten = async () => {
      // Nicht überschreiben wenn bereits ein Dokument geladen wurde (Rechnung ist FINAL!)
      if (gespeichertesDokument) return;

      const datenQuelle = projekt || kundeInfo;
      if (datenQuelle) {
        const heute = new Date();

        // AUTOMATISCH: Versuche Positionen vom vorherigen Dokument (Auftragsbestätigung) zu übernehmen
        // WICHTIG: Wir nehmen die Positionen von der AB (mit Preisen), nicht vom Lieferschein!
        let initialePositionen: Position[] = [];

        if (projekt?.$id) {
          const positionen = await ladePositionenVonVorherigem(projekt.$id, 'rechnung');
          if (positionen && positionen.length > 0) {
            initialePositionen = positionen as Position[];
            console.log('✅ Stückliste von Auftragsbestätigung übernommen:', initialePositionen.length, 'Positionen');
          }
        }

        // Fallback: Wenn keine Positionen von AB, versuche aus Projektdaten
        if (initialePositionen.length === 0) {
          const angefragteMenge = projekt?.angefragteMenge || kundeInfo?.angefragteMenge;
          const preisProTonne = projekt?.preisProTonne || kundeInfo?.preisProTonne;

          if (angefragteMenge && preisProTonne) {
            initialePositionen.push({
              id: '1',
              artikelnummer: 'TM-ZM-02',
              bezeichnung: 'Tennissand 0/2',
              menge: angefragteMenge,
              einheit: 't',
              einzelpreis: preisProTonne,
              gesamtpreis: angefragteMenge * preisProTonne,
            });
          }
        }

        // Rechnungsnummer generieren, falls nicht vorhanden
        let rechnungsnummer = projekt?.rechnungsnummer;
        if (!rechnungsnummer) {
          try {
            rechnungsnummer = await generiereNaechsteDokumentnummer('rechnung');
          } catch (error) {
            console.error('Fehler beim Generieren der Rechnungsnummer:', error);
            // Fallback: Verwende Timestamp-basierte eindeutige Nummer
            const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
            rechnungsnummer = `RE-${laufnummer}`;
          }
        }

        // Initialisierung der Adressdaten
        let kundenname = projekt?.kundenname || kundeInfo?.kundenname || '';
        let kundenstrasse = projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '';
        let kundenPlzOrt = projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '';
        let kundennummer = projekt?.kundennummer || kundeInfo?.kundennummer;
        let lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
        let lieferadresseName: string | undefined = undefined;
        let lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
        let lieferadressePlzOrt = projekt?.lieferadresse
          ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
          : undefined;

        // Lade aktuelle Kundendaten vom SaisonKunden
        const kunde = projekt?.kundeId ? await saisonplanungService.loadKunde(projekt.kundeId).catch(() => null) : null;

        // BEZUGSWEG PLATZBAUER: Rechnungsadresse vom Platzbauer laden!
        if (projekt?.bezugsweg === 'platzbauer' && projekt?.platzbauerId) {
          try {
            const pb = await saisonplanungService.loadKunde(projekt.platzbauerId);
            if (pb && pb.rechnungsadresse) {
              kundenname = pb.name;
              kundennummer = pb.kundennummer;
              kundenstrasse = pb.rechnungsadresse.strasse || '';
              kundenPlzOrt = formatAdresszeile(
                pb.rechnungsadresse.plz || '',
                pb.rechnungsadresse.ort || '',
                pb.rechnungsadresse.land
              );
              console.log('✅ Bezugsweg Platzbauer: Rechnungsadresse vom Platzbauer geladen:', pb.name);

              // Lieferadresse = Verein (Kunde)
              if (kunde) {
                lieferadresseAbweichend = true;
                lieferadresseName = kunde.name;
                lieferadresseStrasse = kunde.lieferadresse?.strasse || projekt?.lieferadresse?.strasse;
                lieferadressePlzOrt = kunde.lieferadresse
                  ? formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land)
                  : (projekt?.lieferadresse
                    ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                    : undefined);
              }
            }
          } catch (error) {
            console.warn('Fehler beim Laden der Platzbauer-Daten (Bezugsweg):', error);
          }
        } else if (kunde) {
          // PLATZBAUER-PROJEKTE (via Platzbauerverwaltung): Spezielle Behandlung
          // - Rechnungsadresse = Platzbauer (bleibt aus projekt.kundenname/strasse/PlzOrt)
          // - Lieferadresse = Verein (kunde.name + projekt.lieferadresse)
          if (projekt?.istPlatzbauerprojekt) {
            // Rechnungsadresse bleibt vom Projekt (Platzbauer) - keine Änderung!
            // Nur Lieferadresse vom Kunden laden (Verein)
            lieferadresseAbweichend = true;
            lieferadresseName = kunde.name; // Vereinsname
            lieferadresseStrasse = projekt?.lieferadresse?.strasse || kunde.lieferadresse?.strasse;
            lieferadressePlzOrt = projekt?.lieferadresse
              ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
              : formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land);
            console.log('✅ Platzbauer-Projekt: Rechnungsadresse bleibt vom Platzbauer, Lieferadresse vom Verein:', kunde.name);
          } else {
            // NORMALE PROJEKTE: Rechnungsadresse vom Kunden übernehmen!
            kundenname = kunde.name;
            kundennummer = kunde.kundennummer;
            kundenstrasse = kunde.rechnungsadresse.strasse;
            kundenPlzOrt = formatAdresszeile(
              kunde.rechnungsadresse.plz,
              kunde.rechnungsadresse.ort,
              kunde.rechnungsadresse.land
            );

            // LIEFERADRESSE vom Kunden (falls abweichend von Rechnungsadresse)
            const lieferAdresseIstAnders =
              kunde.lieferadresse.strasse !== kunde.rechnungsadresse.strasse ||
              kunde.lieferadresse.plz !== kunde.rechnungsadresse.plz;

            if (lieferAdresseIstAnders) {
              lieferadresseAbweichend = true;
              lieferadresseName = kunde.name;
              lieferadresseStrasse = kunde.lieferadresse.strasse;
              lieferadressePlzOrt = formatAdresszeile(
                kunde.lieferadresse.plz,
                kunde.lieferadresse.ort,
                kunde.lieferadresse.land
              );
            }

            console.log('✅ Rechnungsadresse vom Kunden geladen:', kundenstrasse, kundenPlzOrt);
          }
        }

        setRechnungsDaten(prev => ({
          ...prev,
          kundennummer,
          kundenname,
          kundenstrasse,
          kundenPlzOrt,
          ansprechpartner: projekt?.ansprechpartner || kundeInfo?.ansprechpartner,
          rechnungsnummer: rechnungsnummer,
          rechnungsdatum: projekt?.rechnungsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          leistungsdatum: heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          lieferadresseAbweichend,
          lieferadresseName,
          lieferadresseStrasse,
          lieferadressePlzOrt,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo, gespeichertesDokument]);

  const handleInputChange = (field: keyof RechnungsDaten, value: any) => {
    hatGeaendert.current = true;
    setRechnungsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    hatGeaendert.current = true;
    const neuePositionen = [...rechnungsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis = 
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setRechnungsDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    hatGeaendert.current = true;
    const neuePosition: Position = {
      id: Date.now().toString(),
      bezeichnung: '',
      beschreibung: '',
      menge: 1,
      einheit: 'Stk',
      einzelpreis: 0,
      gesamtpreis: 0
    };

    setRechnungsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

  // Position aus Stammdaten-Artikel hinzufügen
  const addPositionAusArtikel = (artikelId: string) => {
    hatGeaendert.current = true;
    const selectedArtikel = artikel.find(a => a.$id === artikelId);
    if (!selectedArtikel) return;

    const preis = selectedArtikel.einzelpreis ?? 0;

    const neuePosition: Position = {
      id: Date.now().toString(),
      artikelnummer: selectedArtikel.artikelnummer,
      bezeichnung: selectedArtikel.bezeichnung,
      beschreibung: selectedArtikel.beschreibung || '',
      menge: 1,
      einheit: selectedArtikel.einheit,
      einzelpreis: preis,
      einkaufspreis: selectedArtikel.einkaufspreis,
      streichpreis: selectedArtikel.streichpreis,
      gesamtpreis: preis,
    };

    setRechnungsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));

    // Feedback anzeigen
    setArtikelHinzugefuegt(selectedArtikel.bezeichnung);
    setTimeout(() => setArtikelHinzugefuegt(null), 2000);
  };

  // Position aus Universal-Artikel hinzufügen
  const addPositionAusUniversalArtikel = (artikelId: string) => {
    hatGeaendert.current = true;
    const selectedArtikel = universalArtikel.find(a => a.$id === artikelId);
    if (!selectedArtikel) return;

    // Universal: Netto-Katalogpreis als Verkaufspreis, Großhändlerpreis als Einkaufspreis (EK)
    const verkaufspreis = selectedArtikel.katalogPreisNetto;
    const einkaufspreis = selectedArtikel.grosshaendlerPreisNetto;

    const neuePosition: Position = {
      id: Date.now().toString(),
      artikelnummer: selectedArtikel.artikelnummer,
      bezeichnung: selectedArtikel.bezeichnung,
      beschreibung: `Universal: ${selectedArtikel.verpackungseinheit}`,
      menge: 1,
      einheit: selectedArtikel.verpackungseinheit,
      einzelpreis: verkaufspreis,
      einkaufspreis: einkaufspreis,
      gesamtpreis: verkaufspreis,
      istUniversalArtikel: true,
      ohneMwSt: selectedArtikel.ohneMwSt || false, // Übernehme Stammdaten-Einstellung
    };

    setRechnungsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));

    // Feedback anzeigen
    setArtikelHinzugefuegt(selectedArtikel.bezeichnung);
    setTimeout(() => setArtikelHinzugefuegt(null), 2000);
  };

  // Standard-Artikel hinzufügen (TM-ZM-02, TM-PE, TM-FP)
  const addStandardArtikel = () => {
    hatGeaendert.current = true;
    const standardArtikelnummern = ['TM-ZM-02', 'TM-PE', 'TM-FP'];
    const neuePositionen: Position[] = [];

    for (const artikelnummer of standardArtikelnummern) {
      const selectedArtikel = artikel.find(a => a.artikelnummer === artikelnummer);
      if (!selectedArtikel) {
        console.warn(`Standard-Artikel ${artikelnummer} nicht in Stammdaten gefunden`);
        continue;
      }

      const preis = selectedArtikel.einzelpreis ?? 0;

      neuePositionen.push({
        id: Date.now().toString() + '_' + artikelnummer,
        artikelnummer: selectedArtikel.artikelnummer,
        bezeichnung: selectedArtikel.bezeichnung,
        beschreibung: selectedArtikel.beschreibung || '',
        menge: 1,
        einheit: selectedArtikel.einheit,
        einzelpreis: preis,
        einkaufspreis: selectedArtikel.einkaufspreis,
        gesamtpreis: preis,
      });
    }

    if (neuePositionen.length > 0) {
      setRechnungsDaten(prev => ({
        ...prev,
        positionen: [...prev.positionen, ...neuePositionen]
      }));

      setArtikelHinzugefuegt(`${neuePositionen.length} Standard-Artikel`);
      setTimeout(() => setArtikelHinzugefuegt(null), 2000);
    }
  };

  // Gefilterte Artikel basierend auf Suchtext
  const gefilterteArtikel = artikel
    .filter(art => {
      if (!artikelSuchtext) return true;
      const suchtext = artikelSuchtext.toLowerCase();
      return (
        art.bezeichnung?.toLowerCase().includes(suchtext) ||
        art.artikelnummer?.toLowerCase().includes(suchtext) ||
        art.beschreibung?.toLowerCase().includes(suchtext)
      );
    })
    .sort((a, b) => {
      if (artikelSortierung === 'bezeichnung') {
        return (a.bezeichnung || '').localeCompare(b.bezeichnung || '');
      } else if (artikelSortierung === 'artikelnummer') {
        return (a.artikelnummer || '').localeCompare(b.artikelnummer || '');
      } else {
        return (a.einzelpreis || 0) - (b.einzelpreis || 0);
      }
    });

  // Keyboard-Handler für Artikel-Suche (Pfeiltasten + Enter)
  const handleArtikelSucheKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const aktuelleListeLaenge = artikelTab === 'eigene' ? gefilterteArtikel.length : universalArtikel.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAusgewaehlterIndex(prev => Math.min(prev + 1, aktuelleListeLaenge - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAusgewaehlterIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (artikelTab === 'eigene' && gefilterteArtikel.length > 0) {
        const ausgewaehlterArtikel = gefilterteArtikel[ausgewaehlterIndex];
        if (ausgewaehlterArtikel?.$id) {
          addPositionAusArtikel(ausgewaehlterArtikel.$id);
        }
      } else if (artikelTab === 'universa' && universalArtikel.length > 0) {
        const ausgewaehlterArtikel = universalArtikel[ausgewaehlterIndex];
        if (ausgewaehlterArtikel?.$id) {
          addPositionAusUniversalArtikel(ausgewaehlterArtikel.$id);
        }
      }
    } else if (e.key === 'Escape') {
      setShowArtikelAuswahl(false);
      setArtikelSuchtext('');
    }
  };

  const removePosition = (index: number) => {
    hatGeaendert.current = true;

    // Prüfen ob die zu löschende Position die Diesel-Zuschlagsposition ist
    const zuLoeschendePosition = rechnungsDaten.positionen[index];
    if (istDieselZuschlagPosition(zuLoeschendePosition)) {
      // Merken dass User die Position manuell entfernt hat
      dieselZuschlagManuellEntfernt.current = true;
    }

    setRechnungsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  // @dnd-kit Sensors für Drag & Drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag & Drop Handler für Positionen
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      hatGeaendert.current = true;
      setRechnungsDaten(prev => {
        const oldIndex = prev.positionen.findIndex(p => p.id === active.id);
        const newIndex = prev.positionen.findIndex(p => p.id === over.id);
        return {
          ...prev,
          positionen: arrayMove(prev.positionen, oldIndex, newIndex),
        };
      });
    }
  };

  // Nur PDF generieren und herunterladen (ohne Speicherung) - z.B. für Entwurf
  const generiereUndLadeRechnung = async () => {
    try {
      console.log('Generiere Rechnung (nur Download/Entwurf)...', rechnungsDaten);
      const pdf = await generiereRechnungPDF(rechnungsDaten);
      const jahr = new Date(rechnungsDaten.rechnungsdatum || Date.now()).getFullYear();
      const kundenname = (rechnungsDaten.kundenname || 'Unbekannt').replace(/[<>:"/\\|?*]/g, '');
      pdf.save(`Rechnung ENTWURF ${kundenname} ${jahr}.pdf`);
      console.log('Rechnung-Entwurf erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren der Rechnung:', error);
      alert('Fehler beim Generieren der Rechnung: ' + (error as Error).message);
    }
  };

  // === PROFORMA-RECHNUNG ERSTELLEN UND SPEICHERN ===
  const erstelleProformaRechnung = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }

    if (rechnungsDaten.positionen.length === 0) {
      setStatusMeldung({ typ: 'fehler', text: 'Bitte fügen Sie mindestens eine Position hinzu.' });
      return;
    }

    try {
      setProformaInProgress(true);
      setStatusMeldung(null);

      // Proforma-Nummer generieren
      const proformaNummer = await generiereNaechsteDokumentnummer('proformarechnung');

      // Proforma-Daten zusammenstellen
      const proformaDaten: ProformaRechnungsDaten = {
        ...rechnungsDaten,
        proformaRechnungsnummer: proformaNummer,
      };

      // Proforma-Rechnung speichern (generiert PDF und speichert in Appwrite)
      await speichereProformaRechnung(projekt.$id, proformaDaten);

      // PDF auch direkt herunterladen
      const pdf = await generiereProformaRechnungPDF(proformaDaten);
      const jahr = new Date(rechnungsDaten.rechnungsdatum || Date.now()).getFullYear();
      const kundenname = (rechnungsDaten.kundenname || 'Unbekannt').replace(/[<>:"/\\|?*]/g, '');
      pdf.save(`Proformarechnung ${kundenname} ${jahr}.pdf`);

      setStatusMeldung({
        typ: 'erfolg',
        text: `Proforma-Rechnung ${proformaNummer} erstellt und gespeichert!`
      });
      setProformaVerlaufZaehler(prev => prev + 1); // Verlauf neu laden

      // Status-Meldung nach 5 Sekunden ausblenden
      setTimeout(() => setStatusMeldung(null), 5000);
    } catch (error) {
      console.error('Fehler beim Erstellen der Proforma-Rechnung:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler: ' + (error as Error).message });
    } finally {
      setProformaInProgress(false);
    }
  };

  // PDF generieren und E-Mail-Formular öffnen
  const oeffneEmailMitRechnung = async () => {
    try {
      if (!rechnungsDaten.rechnungsnummer) {
        alert('Bitte geben Sie zuerst eine Rechnungsnummer ein.');
        return;
      }

      // PDF generieren
      const pdf = await generiereRechnungPDF(rechnungsDaten);
      setEmailPdf(pdf);
      setShowEmailFormular(true);
    } catch (error) {
      console.error('Fehler beim Generieren der PDF:', error);
      alert('Fehler beim Generieren der PDF: ' + (error as Error).message);
    }
  };

  // FINAL speichern in Appwrite - NICHT MEHR ÄNDERBAR!
  const speichereUndHinterlegeRechnung = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }
    
    try {
      setLadeStatus('speichern');
      setStatusMeldung(null);
      setShowFinalConfirm(false);
      
      const neuesDokument = await speichereRechnung(projekt.$id, rechnungsDaten);
      
      setGespeichertesDokument(neuesDokument);
      setStatusMeldung({ typ: 'erfolg', text: 'Rechnung erfolgreich gespeichert und finalisiert! Diese Rechnung kann nicht mehr geändert werden.' });
      setLadeStatus('bereit');
      setVerlaufLadeZaehler(prev => prev + 1); // Verlauf neu laden

      // Status-Meldung nach 8 Sekunden ausblenden
      setTimeout(() => setStatusMeldung(null), 8000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler beim Speichern: ' + (error as Error).message });
      setLadeStatus('fehler');
    }
  };

  // === STORNO-RECHNUNG ERSTELLEN ===
  const erstelleStornoRechnung = async () => {
    if (!projekt?.$id || !gespeichertesDokument) {
      setStatusMeldung({ typ: 'fehler', text: 'Keine Rechnung zum Stornieren vorhanden.' });
      return;
    }
    
    if (!stornoGrund.trim()) {
      setStatusMeldung({ typ: 'fehler', text: 'Bitte geben Sie einen Stornogrund an.' });
      return;
    }
    
    try {
      setStornoInProgress(true);
      setStatusMeldung(null);
      
      // Stornonummer generieren
      const stornoNummer = await generiereNaechsteDokumentnummer('stornorechnung');
      
      const { aktualisierteOriginalRechnung } = await speichereStornoRechnung(
        projekt.$id,
        gespeichertesDokument,
        stornoNummer,
        stornoGrund
      );
      
      // State aktualisieren
      setGespeichertesDokument(aktualisierteOriginalRechnung);
      setNeueRechnungMoeglich(true);
      setShowStornoDialog(false);
      setStornoGrund('');
      setVerlaufLadeZaehler(prev => prev + 1); // Verlauf neu laden
      
      setStatusMeldung({ 
        typ: 'erfolg', 
        text: `Stornorechnung ${stornoNummer} erfolgreich erstellt! Sie können nun eine neue Rechnung erstellen.` 
      });
      
    } catch (error) {
      console.error('Fehler beim Erstellen der Stornorechnung:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler beim Erstellen der Stornorechnung: ' + (error as Error).message });
    } finally {
      setStornoInProgress(false);
    }
  };

  // === NEUE RECHNUNG NACH STORNO ===
  const starteNeueRechnung = async () => {
    if (!projekt?.$id || !projekt?.kundeId) return;

    try {
      // Neues Formular vorbereiten
      const neueNummer = await generiereNaechsteDokumentnummer('rechnung');

      // WICHTIG: Lade Daten von der stornierten Rechnung (Positionen, Zahlungsbedingungen etc.)
      const stornoDaten = await ladeDatenVonStornoRechnung(projekt.$id);

      // Lade aktuelle Kundendaten vom SaisonKunden
      const kunde = await saisonplanungService.loadKunde(projekt.kundeId);

      let kundenname = projekt?.kundenname || '';
      let kundenstrasse = projekt?.kundenstrasse || '';
      let kundenPlzOrt = projekt?.kundenPlzOrt || '';
      let lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
      let lieferadresseName: string | undefined = undefined;
      let lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
      let lieferadressePlzOrt = projekt?.lieferadresse
        ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
        : undefined;

      // BEZUGSWEG PLATZBAUER: Rechnungsadresse vom Platzbauer laden!
      if (projekt?.bezugsweg === 'platzbauer' && projekt?.platzbauerId) {
        try {
          const pb = await saisonplanungService.loadKunde(projekt.platzbauerId);
          if (pb && pb.rechnungsadresse) {
            kundenname = pb.name;
            kundenstrasse = pb.rechnungsadresse.strasse || '';
            kundenPlzOrt = formatAdresszeile(
              pb.rechnungsadresse.plz || '',
              pb.rechnungsadresse.ort || '',
              pb.rechnungsadresse.land
            );
            console.log('✅ Bezugsweg Platzbauer: Rechnungsadresse vom Platzbauer geladen:', pb.name);

            // Lieferadresse = Verein (Kunde)
            if (kunde) {
              lieferadresseAbweichend = true;
              lieferadresseName = kunde.name;
              lieferadresseStrasse = kunde.lieferadresse?.strasse || projekt?.lieferadresse?.strasse;
              lieferadressePlzOrt = kunde.lieferadresse
                ? formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land)
                : (projekt?.lieferadresse
                  ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                  : undefined);
            }
          }
        } catch (error) {
          console.warn('Fehler beim Laden der Platzbauer-Daten (Bezugsweg):', error);
        }
      } else if (kunde) {
        // PLATZBAUER-PROJEKTE (via Platzbauerverwaltung): Spezielle Behandlung
        // - Rechnungsadresse = Platzbauer (bleibt aus projekt.kundenname/strasse/PlzOrt)
        // - Lieferadresse = Verein (kunde.name + projekt.lieferadresse)
        if (projekt?.istPlatzbauerprojekt) {
          // Rechnungsadresse bleibt vom Projekt (Platzbauer) - keine Änderung!
          // Nur Lieferadresse vom Kunden laden (Verein)
          lieferadresseAbweichend = true;
          lieferadresseName = kunde.name; // Vereinsname
          lieferadresseStrasse = projekt?.lieferadresse?.strasse || kunde.lieferadresse?.strasse;
          lieferadressePlzOrt = projekt?.lieferadresse
            ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
            : formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land);
          console.log('✅ Platzbauer-Projekt: Rechnungsadresse bleibt vom Platzbauer, Lieferadresse vom Verein:', kunde.name);
        } else {
          // NORMALE PROJEKTE: Rechnungsadresse vom Kunden übernehmen!
          kundenname = kunde.name;
          kundenstrasse = kunde.rechnungsadresse.strasse;
          kundenPlzOrt = formatAdresszeile(
            kunde.rechnungsadresse.plz,
            kunde.rechnungsadresse.ort,
            kunde.rechnungsadresse.land
          );

          // LIEFERADRESSE vom Kunden (falls abweichend)
          const lieferAdresseIstAnders =
            kunde.lieferadresse.strasse !== kunde.rechnungsadresse.strasse ||
            kunde.lieferadresse.plz !== kunde.rechnungsadresse.plz;

          if (lieferAdresseIstAnders) {
            lieferadresseAbweichend = true;
            lieferadresseName = kunde.name;
            lieferadresseStrasse = kunde.lieferadresse.strasse;
            lieferadressePlzOrt = formatAdresszeile(
              kunde.lieferadresse.plz,
              kunde.lieferadresse.ort,
              kunde.lieferadresse.land
            );
          }

          console.log('✅ Rechnungsadresse vom Kunden geladen:', kundenstrasse, kundenPlzOrt);
        }
      }

      setRechnungsDaten(prev => ({
        // WICHTIG: Erst alle Daten von der stornierten Rechnung übernehmen!
        ...(stornoDaten || prev),
        // RECHNUNGSADRESSE vom Kunden (aktuell)!
        kundennummer: kunde?.kundennummer || projekt?.kundennummer || stornoDaten?.kundennummer || prev.kundennummer,
        kundenname,
        kundenstrasse,
        kundenPlzOrt,
        ansprechpartner: projekt?.ansprechpartner || stornoDaten?.ansprechpartner || prev.ansprechpartner,
        // Lieferadresse (falls abweichend)
        lieferadresseAbweichend,
        lieferadresseName,
        lieferadresseStrasse,
        lieferadressePlzOrt,
        // NUR DIESE neu generieren - Rest bleibt von stornierter Rechnung!
        rechnungsnummer: neueNummer,
        rechnungsdatum: new Date().toISOString().split('T')[0],
        leistungsdatum: stornoDaten?.leistungsdatum || new Date().toISOString().split('T')[0],
        // Positionen von stornierter Rechnung übernehmen (KRITISCH!)
        positionen: stornoDaten?.positionen || prev.positionen,
        // Zahlungsbedingungen von stornierter Rechnung
        zahlungsziel: stornoDaten?.zahlungsziel || prev.zahlungsziel,
        skontoAktiviert: stornoDaten?.skontoAktiviert ?? prev.skontoAktiviert,
        skonto: stornoDaten?.skonto || prev.skonto,
        // Bemerkung (ohne alte Storno-Hinweise)
        bemerkung: stornoDaten?.bemerkung?.replace(/^STORNORECHNUNG zu Rechnung.*?\n\n/s, '') || prev.bemerkung,
        // Sonstige Daten
        ohneMehrwertsteuer: stornoDaten?.ohneMehrwertsteuer ?? prev.ohneMehrwertsteuer,
        mehrwertsteuersatz: stornoDaten?.mehrwertsteuersatz || prev.mehrwertsteuersatz,
      }));

      // Reset der States
      setGespeichertesDokument(null);
      setNeueRechnungMoeglich(false);
      setVerlaufLadeZaehler(prev => prev + 1);

      setStatusMeldung({
        typ: 'erfolg',
        text: stornoDaten
          ? `Neue Rechnungsnummer ${neueNummer} generiert. Daten von stornierter Rechnung übernommen!`
          : `Neue Rechnungsnummer ${neueNummer} generiert. Rechnungsadresse wurde vom Kunden aktualisiert!`
      });

    } catch (error) {
      console.error('Fehler beim Starten der neuen Rechnung:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler: ' + (error as Error).message });
    }
  };

  const berechnung = berechneRechnungsSummen(rechnungsDaten.positionen, rechnungsDaten.ohneMehrwertsteuer, rechnungsDaten.mehrwertsteuersatz);

  // Prüfen ob Formular deaktiviert sein soll (finale Rechnung die nicht storniert ist)
  const istFormularDisabled = Boolean(
    gespeichertesDokument &&
    gespeichertesDokument.istFinal === true &&
    gespeichertesDokument.rechnungsStatus !== 'storniert'
  );

  // Zeige Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <span className="ml-3 text-gray-600 dark:text-dark-textMuted">Lade Dokument...</span>
      </div>
    );
  }

  // Rechnung bereits finalisiert - Read-Only Ansicht
  if (gespeichertesDokument) {
    return (
      <div className="space-y-6">
        {/* FINALES BANNER */}
        <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border-2 border-green-300 rounded-xl p-8 shadow-lg dark:shadow-dark-lg">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center shadow-inner">
                <Lock className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className={`text-2xl font-bold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-800' : 'text-green-800'}`}>
                  {gespeichertesDokument.rechnungsStatus === 'storniert' ? 'Rechnung storniert' : 'Rechnung finalisiert'}
                </h2>
                {gespeichertesDokument.rechnungsStatus === 'storniert' ? (
                  <span className="px-3 py-1 bg-red-200 text-red-800 text-xs font-semibold rounded-full uppercase tracking-wide flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Storniert
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-green-200 text-green-800 text-xs font-semibold rounded-full uppercase tracking-wide">
                    Unveränderbar
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className={`text-sm ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-700' : 'text-green-700'}`}>Rechnungsnummer</p>
                  <p className={`text-xl font-bold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-900 line-through' : 'text-green-900'}`}>{gespeichertesDokument.dokumentNummer}</p>
                </div>
                <div>
                  <p className={`text-sm ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-700' : 'text-green-700'}`}>Erstellt am</p>
                  <p className={`text-xl font-bold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-900' : 'text-green-900'}`}>
                    {gespeichertesDokument.$createdAt && new Date(gespeichertesDokument.$createdAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-700' : 'text-green-700'}`}>Bruttobetrag</p>
                  <p className={`text-xl font-bold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-900 line-through' : 'text-green-900'}`}>
                    {gespeichertesDokument.bruttobetrag?.toFixed(2)} €
                  </p>
                </div>
              </div>
              
              {/* Stornogrund anzeigen */}
              {gespeichertesDokument.stornoGrund && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>Stornogrund:</strong> {gespeichertesDokument.stornoGrund}
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href={getFileDownloadUrl(gespeichertesDokument.dateiId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl font-medium ${
                    gespeichertesDokument.rechnungsStatus === 'storniert' 
                      ? 'bg-gray-600 text-white hover:bg-gray-700' 
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  <Download className="h-5 w-5" />
                  Rechnung herunterladen
                </a>
                
                {/* STORNO-BUTTON - nur wenn Rechnung aktiv ist */}
                {gespeichertesDokument.rechnungsStatus !== 'storniert' && (
                  <button
                    onClick={() => setShowStornoDialog(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-lg dark:shadow-dark-lg hover:shadow-xl font-medium"
                  >
                    <FileX className="h-5 w-5" />
                    Stornorechnung erstellen
                  </button>
                )}
                
                {/* NEUE RECHNUNG BUTTON - nur wenn Rechnung storniert wurde */}
                {neueRechnungMoeglich && gespeichertesDokument.rechnungsStatus === 'storniert' && (
                  <button
                    onClick={starteNeueRechnung}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg dark:shadow-dark-lg hover:shadow-xl font-medium"
                  >
                    <RefreshCw className="h-5 w-5" />
                    Neue Rechnung erstellen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* STORNO-DIALOG */}
        {showStornoDialog && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 shadow-lg dark:shadow-dark-lg">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800">Stornorechnung erstellen</h3>
                <p className="text-sm text-red-700 mt-1">
                  Diese Aktion erstellt eine Stornorechnung, die die Originalrechnung aufhebt. 
                  <strong> Dieser Vorgang kann nicht rückgängig gemacht werden!</strong>
                </p>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-red-800 mb-2">
                    Stornogrund (Pflichtfeld)
                  </label>
                  <textarea
                    value={stornoGrund}
                    onChange={(e) => setStornoGrund(e.target.value)}
                    rows={3}
                    placeholder="z.B. Fehlerhafte Rechnungsstellung, Rücksendung der Ware, Preiskorrektur..."
                    className="w-full px-3 py-2 border-2 border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => {
                      setShowStornoDialog(false);
                      setStornoGrund('');
                    }}
                    className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={erstelleStornoRechnung}
                    disabled={stornoInProgress || !stornoGrund.trim()}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {stornoInProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Storniere...
                      </>
                    ) : (
                      <>
                        <FileX className="h-4 w-4" />
                        Storno bestätigen
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info-Box */}
        <div className={`rounded-xl p-6 ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'}`}>
          <div className="flex items-start gap-4">
            <AlertCircle className={`h-6 w-6 flex-shrink-0 mt-0.5 ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`} />
            <div>
              <h3 className={`text-base font-semibold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-amber-800 dark:text-amber-300' : 'text-blue-800 dark:text-blue-300'}`}>
                {gespeichertesDokument.rechnungsStatus === 'storniert'
                  ? 'Diese Rechnung wurde storniert'
                  : 'Warum kann diese Rechnung nicht geändert werden?'}
              </h3>
              <p className={`mt-2 text-sm ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>
                {gespeichertesDokument.rechnungsStatus === 'storniert'
                  ? 'Die Originalrechnung und die Stornorechnung bleiben für die gesetzliche Aufbewahrungspflicht (8-10 Jahre) im Archiv erhalten. Sie können jetzt eine neue Rechnung erstellen.'
                  : 'Rechnungen sind rechtlich verbindliche Dokumente. Nach der Finalisierung wird die Rechnung archiviert und kann aus Compliance-Gründen nicht mehr verändert werden. Sollten Korrekturen notwendig sein, müssen Sie eine Stornorechnung oder Gutschrift erstellen.'}
              </p>
            </div>
          </div>
        </div>

        {/* Archivierte Rechnungsdetails - Read Only */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-gray-500 dark:text-dark-textMuted" />
            Archivierte Rechnungsdetails
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
              <p className="text-gray-600 dark:text-dark-textMuted">Kunde</p>
              <p className="font-medium text-gray-900 dark:text-dark-text">{rechnungsDaten.kundenname}</p>
              <p className="text-gray-600 dark:text-dark-textMuted text-xs mt-1">{rechnungsDaten.kundenstrasse}, {rechnungsDaten.kundenPlzOrt}</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
              <p className="text-gray-600 dark:text-dark-textMuted">Rechnungsdatum</p>
              <p className="font-medium text-gray-900 dark:text-dark-text">
                {new Date(rechnungsDaten.rechnungsdatum).toLocaleDateString('de-DE')}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
              <p className="text-gray-600 dark:text-dark-textMuted">Leistungsdatum</p>
              <p className="font-medium text-gray-900 dark:text-dark-text">
                {rechnungsDaten.leistungsdatum 
                  ? new Date(rechnungsDaten.leistungsdatum).toLocaleDateString('de-DE')
                  : '-'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
              <p className="text-gray-600 dark:text-dark-textMuted">Zahlungsziel</p>
              <p className="font-medium text-gray-900 dark:text-dark-text">{rechnungsDaten.zahlungsziel}</p>
            </div>
          </div>

          {/* Positionen - Read Only Tabelle */}
          {rechnungsDaten.positionen.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-3">Positionen</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-dark-textMuted">Bezeichnung</th>
                      <th className="px-4 py-2 text-right text-gray-700 dark:text-dark-textMuted">Menge</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-dark-textMuted">Einheit</th>
                      <th className="px-4 py-2 text-right text-gray-700 dark:text-dark-textMuted">Einzelpreis</th>
                      <th className="px-4 py-2 text-right text-gray-700 dark:text-dark-textMuted">Gesamt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {rechnungsDaten.positionen.map((pos, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-gray-900 dark:text-dark-text">{pos.bezeichnung}</td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-dark-text">{pos.menge}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-dark-text">{pos.einheit}</td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-dark-text">{pos.einzelpreis.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-dark-text">{pos.gesamtpreis.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-slate-900">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700 dark:text-dark-textMuted">Netto:</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-dark-text">{berechnung.nettobetrag.toFixed(2)} €</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700 dark:text-dark-textMuted">MwSt. (19%):</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-dark-text">{berechnung.umsatzsteuer.toFixed(2)} €</td>
                    </tr>
                    <tr className={gespeichertesDokument.rechnungsStatus === 'storniert' ? 'bg-red-50 dark:bg-red-950/40' : 'bg-green-50 dark:bg-green-950/40'}>
                      <td colSpan={4} className={`px-4 py-3 text-right font-bold ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>Brutto:</td>
                      <td className={`px-4 py-3 text-right font-bold text-lg ${gespeichertesDokument.rechnungsStatus === 'storniert' ? 'text-red-800 dark:text-red-300 line-through' : 'text-green-800 dark:text-green-300'}`}>{berechnung.bruttobetrag.toFixed(2)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
        
        {/* DATEIVERLAUF - zeigt alle Rechnungen und Stornos */}
        {projekt?.$id && (
          <div className="mt-6">
            <DokumentVerlauf
              projektId={projekt.$id}
              dokumentTyp="rechnung"
              titel="Rechnungs- & Storno-Verlauf"
              maxAnzeige={5}
              ladeZaehler={verlaufLadeZaehler}
            />
          </div>
        )}
      </div>
    );
  }

  // Noch keine Rechnung erstellt - Bearbeitbare Ansicht
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* WICHTIGER HINWEIS */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-amber-800 dark:text-amber-300">Wichtig: Rechnungen sind endgültig</h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                Nach dem Speichern kann diese Rechnung <strong>nicht mehr geändert</strong> werden.
                Bitte überprüfen Sie alle Daten sorgfältig. Nutzen Sie ggf. die "Entwurf herunterladen" Funktion
                um die Rechnung vor dem Finalisieren zu prüfen.
              </p>
            </div>
          </div>
        </div>

        {/* Status-Meldung */}
        {statusMeldung && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            statusMeldung.typ === 'erfolg'
              ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800'
              : statusMeldung.typ === 'warnung'
              ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800'
              : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800'
          }`}>
            {statusMeldung.typ === 'erfolg' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : statusMeldung.typ === 'warnung' ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <p className={`text-sm ${
              statusMeldung.typ === 'erfolg' ? 'text-green-800 dark:text-green-300' :
              statusMeldung.typ === 'warnung' ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300'
            }`}>
              {statusMeldung.text}
            </p>
          </div>
        )}

        {/* Auto-Save Status (nur wenn noch keine finale Rechnung existiert) */}
        {projekt?.$id && !gespeichertesDokument && (
          <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${
            autoSaveStatus === 'gespeichert' ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400' :
            autoSaveStatus === 'speichern' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' :
            autoSaveStatus === 'fehler' ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400' :
            'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-dark-textMuted'
          }`}>
            {autoSaveStatus === 'gespeichert' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Entwurf automatisch gespeichert</span>
              </>
            )}
            {autoSaveStatus === 'speichern' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Speichern...</span>
              </>
            )}
            {autoSaveStatus === 'fehler' && (
              <>
                <CloudOff className="h-4 w-4" />
                <span>Fehler beim Speichern</span>
              </>
            )}
            {autoSaveStatus === 'idle' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Bereit</span>
              </>
            )}
          </div>
        )}

        {/* Rechnungsinformationen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Rechnungsinformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Rechnungsnummer
              </label>
              <input
                type="text"
                value={rechnungsDaten.rechnungsnummer}
                onChange={(e) => handleInputChange('rechnungsnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Rechnungsdatum
              </label>
              <input
                type="date"
                value={rechnungsDaten.rechnungsdatum}
                onChange={(e) => handleInputChange('rechnungsdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Leistungsdatum
              </label>
              <input
                type="date"
                value={rechnungsDaten.leistungsdatum || ''}
                onChange={(e) => handleInputChange('leistungsdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              />
              {/* Dieselpreis-Hinweis unter dem Leistungsdatum */}
              <div className="mt-1.5 flex items-center gap-2">
                {dieselPreisLaden ? (
                  <span className="text-xs text-gray-500 dark:text-dark-textMuted flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Lade Dieselpreis...
                  </span>
                ) : dieselPreis !== null ? (
                  <div className="flex items-center gap-2">
                    <Fuel className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    <span className="text-xs text-gray-600 dark:text-dark-textMuted">
                      Diesel: <span className="font-medium">{formatDieselPreis(dieselPreis)}</span>
                    </span>
                    {dieselPreisManuell && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">(manuell)</span>
                    )}
                    {dieselPreisStatus === 'historisch' && !dieselPreisManuell && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">(aktueller Preis)</span>
                    )}
                    {dieselPreisStatus === 'zukunft' && !dieselPreisManuell && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">(Schätzung)</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDieselPreisEingabe(dieselPreis.toFixed(3));
                        setDieselPreisEditieren(true);
                      }}
                      className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Dieselpreis manuell ändern"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ) : rechnungsDaten.leistungsdatum ? (
                  <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                    Dieselpreis wird für dieses Datum abgerufen
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-dark-textSubtle">
                    Leistungsdatum für Dieselpreiszuschlag eingeben
                  </span>
                )}
              </div>
              {/* Manueller Dieselpreis-Editor */}
              {dieselPreisEditieren && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={dieselPreisEingabe}
                      onChange={(e) => setDieselPreisEingabe(e.target.value)}
                      placeholder="z.B. 1,789"
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setzeManuellenDieselPreis();
                        if (e.key === 'Escape') setDieselPreisEditieren(false);
                      }}
                      autoFocus
                    />
                    <span className="text-xs text-gray-500 dark:text-dark-textMuted">€/L</span>
                    <button
                      type="button"
                      onClick={setzeManuellenDieselPreis}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setDieselPreisEditieren(false)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Kundendaten */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Kundendaten</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Kundennummer</label>
                <input
                  type="text"
                  value={rechnungsDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={rechnungsDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ihr Ansprechpartner (optional)</label>
                <select
                  value={rechnungsDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                >
                  <option value="">– Kein Ansprechpartner –</option>
                  <option value="Julian Koch">Julian Koch</option>
                  <option value="Luca Ramos de la Rosa">Luca Ramos de la Rosa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={rechnungsDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dokument-Adresse (wird auf der Rechnung gedruckt) */}
        <DokumentAdresseFormular
          adresse={{
            name: rechnungsDaten.kundenname,
            strasse: rechnungsDaten.kundenstrasse,
            plzOrt: rechnungsDaten.kundenPlzOrt,
          }}
          onChange={(adresse: DokumentAdresse) => {
            setRechnungsDaten(prev => ({
              ...prev,
              kundenname: adresse.name,
              kundenstrasse: adresse.strasse,
              kundenPlzOrt: adresse.plzOrt,
            }));
            hatGeaendert.current = true;
          }}
          kunde={kunde}
          dokumentTyp="rechnung"
          projektKundenname={projekt?.kundenname}
          disabled={istFormularDisabled}
          platzbauer={platzbauer}
          projekt={projekt}
        />

        {/* Lieferadresse */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Lieferadresse</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rechnungsDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 dark:border-slate-700 rounded focus:ring-red-500"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {rechnungsDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Name</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Rechnungspositionen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Rechnungspositionen</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowArtikelAuswahl(!showArtikelAuswahl)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Package className="h-4 w-4" />
                Aus Artikel
              </button>
              <button
                onClick={addStandardArtikel}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                <ShoppingBag className="h-4 w-4" />
                Standard Artikel
              </button>
              <button
                onClick={addPosition}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Leere Position
              </button>
              {/* Dieselzuschlag hinzufügen - nur wenn keine TM-DZ Position vorhanden */}
              {!gespeichertesDokument && !rechnungsDaten.positionen.some(p => istDieselZuschlagPosition(p)) && (
                <button
                  onClick={async () => {
                    // Kein Leistungsdatum → kann keinen Preis ermitteln
                    if (!rechnungsDaten.leistungsdatum) {
                      alert('Bitte zuerst ein Leistungsdatum eingeben, damit der Dieselpreis ermittelt werden kann.');
                      return;
                    }

                    dieselZuschlagManuellEntfernt.current = false;

                    // Wenn Zuschlag bereits berechnet → direkt einfügen
                    if (dieselZuschlagErgebnis && dieselZuschlagErgebnis.hatZuschlag && dieselZuschlagErgebnis.gesamtTonnen > 0) {
                      aktualisiereZuschlagPosition(dieselZuschlagErgebnis);
                      return;
                    }

                    // Dieselpreis frisch holen und berechnen
                    try {
                      setDieselPreisLaden(true);
                      const preisErgebnis = await holeDieselPreisFuerDatum(rechnungsDaten.leistungsdatum, '97828');
                      setDieselPreis(preisErgebnis.preis);
                      setDieselPreisStatus(preisErgebnis.quelle === 'fallback' ? 'fallback' : 'geladen');

                      const ergebnis = berechneGesamtZuschlag(
                        rechnungsDaten.positionen,
                        preisErgebnis.preis,
                        rechnungsDaten.leistungsdatum
                      );

                      if (ergebnis.hatZuschlag && ergebnis.gesamtTonnen > 0) {
                        aktualisiereZuschlagPosition(ergebnis);
                      } else {
                        alert('Kein Dieselzuschlag fällig: Dieselpreis liegt unter dem Basispreis oder es sind keine zuschlagsfähigen Positionen (TM-ZM-02/03 in Tonnen) vorhanden.');
                      }
                    } catch (error) {
                      console.error('Fehler beim Laden des Dieselpreises:', error);
                      alert('Dieselpreis konnte nicht geladen werden.');
                    } finally {
                      setDieselPreisLaden(false);
                    }
                  }}
                  disabled={dieselPreisLaden}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Dieselpreiszuschlag als Position hinzufügen"
                >
                  {dieselPreisLaden ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fuel className="h-4 w-4" />}
                  Dieselzuschlag
                </button>
              )}
            </div>
          </div>

          {/* Artikel-Auswahl */}
          {showArtikelAuswahl && (
            <div className="mb-4 p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Artikel auswählen</h3>
                <button
                  onClick={() => {
                    setShowArtikelAuswahl(false);
                    setArtikelSuchtext('');
                  }}
                  className="text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text"
                >
                  Schließen
                </button>
              </div>

              {/* Feedback Toast wenn Artikel hinzugefügt */}
              {artikelHinzugefuegt && (
                <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700 rounded-lg text-green-800 dark:text-green-200 text-sm animate-pulse">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">Hinzugefügt:</span>
                  <span className="truncate">{artikelHinzugefuegt}</span>
                </div>
              )}

              {/* Tabs für Artikel-Auswahl */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setArtikelTab('eigene'); setArtikelSuchtext(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    artikelTab === 'eigene'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Package className="h-4 w-4" />
                  Eigene Artikel
                </button>
                <button
                  onClick={() => { setArtikelTab('universa'); setArtikelSuchtext(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    artikelTab === 'universa'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  Universal Artikel
                </button>
              </div>

              {/* Eigene Artikel Tab */}
              {artikelTab === 'eigene' && (
                <>
                  {artikel.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-dark-textMuted">
                      Keine Artikel vorhanden. Legen Sie zuerst Artikel in der Artikelverwaltung an.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Suchfeld und Sortierung */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-textMuted" />
                          <input
                            type="text"
                            value={artikelSuchtext}
                            onChange={(e) => setArtikelSuchtext(e.target.value)}
                            onKeyDown={handleArtikelSucheKeyDown}
                            placeholder="Artikel suchen (Bezeichnung, Art.-Nr., Beschreibung)..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent"
                          />
                        </div>
                        <select
                          value={artikelSortierung}
                          onChange={(e) => setArtikelSortierung(e.target.value as 'bezeichnung' | 'artikelnummer' | 'einzelpreis')}
                          className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent"
                        >
                          <option value="bezeichnung">Sortierung: Bezeichnung</option>
                          <option value="artikelnummer">Sortierung: Art.-Nr.</option>
                          <option value="einzelpreis">Sortierung: Preis</option>
                        </select>
                      </div>

                      {/* Artikel-Tabelle */}
                      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden max-h-96 overflow-y-auto">
                        {gefilterteArtikel.length === 0 ? (
                          <div className="p-4 text-center text-gray-600 dark:text-dark-textMuted text-sm">
                            Keine Artikel gefunden
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead className="bg-purple-100 dark:bg-purple-950/60 sticky top-0">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-purple-300">Art.-Nr.</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-purple-300">Bezeichnung</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-purple-300">Beschreibung</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-purple-300">Einheit</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-purple-300">Preis</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-purple-300">Aktion</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                              {gefilterteArtikel.map((art, index) => (
                                <tr
                                  key={art.$id}
                                  ref={artikelTab === 'eigene' && index === ausgewaehlterIndex ? ausgewaehlteZeileRef : null}
                                  className={`transition-colors cursor-pointer ${
                                    index === ausgewaehlterIndex
                                      ? 'bg-purple-200 dark:bg-purple-800'
                                      : 'hover:bg-purple-50 dark:hover:bg-purple-950/30'
                                  }`}
                                  onClick={() => {
                                    setAusgewaehlterIndex(index);
                                    if (art.$id) addPositionAusArtikel(art.$id);
                                  }}
                                >
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-dark-text">{art.artikelnummer}</td>
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text">{art.bezeichnung}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-textMuted">
                                    <div className="line-clamp-2 max-w-xs">{art.beschreibung || '-'}</div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text text-center">{art.einheit}</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-dark-text text-right">
                                    {art.einzelpreis !== undefined && art.einzelpreis !== null
                                      ? `${art.einzelpreis.toFixed(2)} €`
                                      : <span className="text-gray-400 dark:text-dark-textSubtle italic text-xs">auf Anfrage</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addPositionAusArtikel(art.$id!);
                                      }}
                                      className="px-3 py-1 bg-purple-600 dark:bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 dark:hover:bg-purple-500 transition-colors"
                                    >
                                      Hinzufügen
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Info-Zeile */}
                      <div className="text-xs text-gray-600 dark:text-dark-textMuted text-center">
                        {gefilterteArtikel.length} von {artikel.length} Artikel{artikel.length !== 1 ? 'n' : ''} angezeigt
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Universal Artikel Tab */}
              {artikelTab === 'universa' && (
                <div className="space-y-3">
                  {/* Suchfeld */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-textMuted" />
                    <input
                      type="text"
                      value={artikelSuchtext}
                      onChange={(e) => setArtikelSuchtext(e.target.value)}
                      onKeyDown={handleArtikelSucheKeyDown}
                      placeholder="Universal-Artikel suchen..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-orange-500 dark:focus:ring-orange-400 focus:border-transparent"
                    />
                  </div>

                  {/* Universal-Artikel-Tabelle */}
                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden max-h-96 overflow-y-auto">
                    {universalLaden ? (
                      <div className="p-4 text-center text-gray-600 dark:text-dark-textMuted text-sm flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Lade Universal-Artikel...
                      </div>
                    ) : universalArtikel.length === 0 ? (
                      <div className="p-4 text-center text-gray-600 dark:text-dark-textMuted text-sm">
                        {artikelSuchtext ? 'Keine Artikel gefunden' : 'Keine Universal-Artikel vorhanden. Importieren Sie zuerst die Preisliste in den Stammdaten.'}
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-950/60 dark:to-red-950/60 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-orange-300">Art.-Nr.</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-orange-300">Bezeichnung</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-orange-300">VE</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-orange-300">GH-Preis</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-orange-300">Katalog Brutto</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-orange-300">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                          {universalArtikel.map((art, index) => (
                            <tr
                              key={art.$id}
                              ref={artikelTab === 'universa' && index === ausgewaehlterIndex ? ausgewaehlteZeileRef : null}
                              className={`transition-colors cursor-pointer ${
                                index === ausgewaehlterIndex
                                  ? 'bg-orange-200 dark:bg-orange-800'
                                  : 'hover:bg-orange-50 dark:hover:bg-orange-950/30'
                              }`}
                              onClick={() => {
                                setAusgewaehlterIndex(index);
                                if (art.$id) addPositionAusUniversalArtikel(art.$id);
                              }}
                            >
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-dark-text">{art.artikelnummer}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text">
                                {art.bezeichnung}
                                {art.aenderungen && art.aenderungen.trim() !== '' && (
                                  <span className="ml-2 text-xs text-red-600 dark:text-red-400">(geändert)</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-textMuted text-center">{art.verpackungseinheit}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-textMuted text-right">
                                {art.grosshaendlerPreisNetto.toFixed(2)} €
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-dark-text text-right">
                                {art.katalogPreisBrutto.toFixed(2)} €
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addPositionAusUniversalArtikel(art.$id!);
                                  }}
                                  className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-600 text-white text-sm rounded-lg hover:from-orange-600 hover:to-red-700 transition-colors"
                                >
                                  Hinzufügen
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Info-Zeile */}
                  <div className="text-xs text-gray-600 dark:text-dark-textMuted text-center">
                    {universalArtikel.length} Universal-Artikel angezeigt
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === DIESELPREISZUSCHLAG BANNER === */}
          {hatZuschlagsfaehigePositionen && !gespeichertesDokument && (
            <>
              {/* Banner: Zuschlag aktiv */}
              {dieselZuschlagErgebnis?.hatZuschlag && !dieselZuschlagManuellEntfernt.current && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Fuel className="h-5 w-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Dieselpreiszuschlag aktiv
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            dieselZuschlagManuellEntfernt.current = true;
                            setRechnungsDaten(prev => ({
                              ...prev,
                              positionen: prev.positionen.filter(p => !istDieselZuschlagPosition(p))
                            }));
                          }}
                          className="p-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                          title="Dieselpreiszuschlag deaktivieren"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                        <span className="font-medium">{formatDieselPreis(dieselZuschlagErgebnis.tagesDieselPreis)}</span>
                        {' '}(Basis: {formatDieselPreis(dieselZuschlagErgebnis.basisPreis)})
                        {' → '}<span className="font-medium">{formatZuschlagProTonne(dieselZuschlagErgebnis.zuschlagProTonne)}</span>
                        {' auf '}<span className="font-medium">{dieselZuschlagErgebnis.gesamtTonnen.toFixed(2)} t</span>
                        {' = '}<span className="font-bold">{formatGesamtZuschlag(dieselZuschlagErgebnis.gesamtZuschlag)} netto</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Banner: Kein Zuschlag fällig */}
              {dieselZuschlagErgebnis && !dieselZuschlagErgebnis.hatZuschlag && dieselPreis !== null && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Kein Dieselpreiszuschlag fällig
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                        Dieselpreis {formatDieselPreis(dieselZuschlagErgebnis.tagesDieselPreis)} liegt unter Basis {formatDieselPreis(dieselZuschlagErgebnis.basisPreis)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Banner: Zuschlag wurde manuell entfernt */}
              {dieselZuschlagManuellEntfernt.current && dieselZuschlagErgebnis?.hatZuschlag && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          Dieselpreiszuschlag deaktiviert
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            dieselZuschlagManuellEntfernt.current = false;
                            if (dieselZuschlagErgebnis) {
                              aktualisiereZuschlagPosition(dieselZuschlagErgebnis);
                            }
                          }}
                          className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 underline"
                        >
                          Wieder aktivieren
                        </button>
                      </div>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                        Der Zuschlag von {formatGesamtZuschlag(dieselZuschlagErgebnis.gesamtZuschlag)} wird nicht berechnet.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Banner: Historisches Datum - Warnung */}
              {dieselPreisStatus === 'historisch' && !dieselPreisManuell && dieselPreis !== null && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Historisches Leistungsdatum
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                        Für dieses Datum ist kein historischer Dieselpreis verfügbar. Es wird der aktuelle Preis ({formatDieselPreis(dieselPreis)}) verwendet.
                        {' '}
                        <button
                          type="button"
                          onClick={() => {
                            setDieselPreisEingabe(dieselPreis.toFixed(3));
                            setDieselPreisEditieren(true);
                          }}
                          className="underline hover:text-amber-900 dark:hover:text-amber-200"
                        >
                          Preis manuell eingeben
                        </button>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Banner: Kein Leistungsdatum */}
              {!rechnungsDaten.leistungsdatum && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-dark-textMuted flex items-center gap-2">
                    <Fuel className="h-4 w-4" />
                    Bitte Leistungsdatum eingeben für automatischen Dieselpreiszuschlag
                  </p>
                </div>
              )}
            </>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rechnungsDaten.positionen.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {rechnungsDaten.positionen.map((position, index) => {
                  const istDieselPosition = istDieselZuschlagPosition(position);
                  return (
                  <SortablePosition
                    key={position.id}
                    id={position.id}
                    disabled={!!gespeichertesDokument || istDieselPosition}
                    accentColor={istDieselPosition ? 'blue' : 'red'}
                  >
                    {/* Spezielle Hervorhebung für Diesel-Position */}
                    <div className={`flex items-start gap-4 ${istDieselPosition ? 'relative' : ''}`}>
                      {istDieselPosition && (
                        <div className="absolute -left-3 top-0 bottom-0 w-1 bg-blue-400 dark:bg-blue-500 rounded-full" />
                      )}
                      <div className={`flex-1 space-y-3 ${istDieselPosition ? 'bg-blue-50/50 dark:bg-blue-950/20 -m-3 p-3 rounded-lg' : ''}`}>
                        {/* Diesel-Position Header */}
                        {istDieselPosition && (
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-blue-200 dark:border-blue-800">
                            <Fuel className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Automatisch berechnet</span>
                            <span className="text-xs text-blue-500 dark:text-blue-400">(Felder nicht editierbar)</span>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                              {istDieselPosition && <Fuel className="h-3.5 w-3.5 inline mr-1 text-blue-500" />}
                              Artikel-Nr.
                            </label>
                            <input
                              type="text"
                              value={position.artikelnummer || ''}
                              onChange={(e) => handlePositionChange(index, 'artikelnummer', e.target.value)}
                              placeholder="TM-001"
                              readOnly={istDieselPosition}
                              className={`w-full px-3 py-2 border rounded-lg placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:border-transparent ${
                                istDieselPosition
                                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed'
                                  : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-red-500 dark:focus:ring-red-400'
                              }`}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bezeichnung</label>
                            <input
                              type="text"
                              value={position.bezeichnung}
                              onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                              placeholder="z.B. Tennismehl / Ziegelmehl"
                              readOnly={istDieselPosition}
                              className={`w-full px-3 py-2 border rounded-lg placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:border-transparent ${
                                istDieselPosition
                                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed'
                                  : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-red-500 dark:focus:ring-red-400'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Menge</label>
                            {istDieselPosition ? (
                              <input
                                type="text"
                                value={position.menge.toFixed(2)}
                                readOnly
                                className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed"
                              />
                            ) : (
                              <NumericInput
                                value={position.menge}
                                onChange={(val) => handlePositionChange(index, 'menge', val)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einheit</label>
                            <input
                              type="text"
                              value={position.einheit}
                              onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                              readOnly={istDieselPosition}
                              className={`w-full px-3 py-2 border rounded-lg placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:border-transparent ${
                                istDieselPosition
                                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed'
                                  : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-red-500 dark:focus:ring-red-400'
                              }`}
                            />
                          </div>
                          {/* Streichpreis - nicht für Diesel-Position */}
                          {!istDieselPosition && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Streichpreis (€)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={position.streichpreis ?? ''}
                                onChange={(e) => handlePositionChange(index, 'streichpreis', e.target.value ? parseFloat(e.target.value) : undefined)}
                                placeholder="Optional"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                              />
                              {/* Streichpreis-Grund Dropdown - nur wenn Streichpreis gesetzt */}
                              {position.streichpreis && position.streichpreis > 0 && (
                                <select
                                  value={position.streichpreisGrund || ''}
                                  onChange={(e) => handlePositionChange(index, 'streichpreisGrund', e.target.value || undefined)}
                                  className="w-full mt-1 px-2 py-1 text-xs border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-amber-50"
                                >
                                  <option value="">Grund wählen...</option>
                                  <option value="Neukundenaktion">Neukundenaktion</option>
                                  <option value="Frühbucherpreis">Frühbucherpreis</option>
                                  <option value="Treuerabatt">Treuerabatt</option>
                                  <option value="Last Minute Preis">Last Minute Preis</option>
                                  <option value="Sonderaktion">Sonderaktion</option>
                                  <option value="Mengenrabatt">Mengenrabatt</option>
                                </select>
                              )}
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einzelpreis (€)</label>
                            {istDieselPosition ? (
                              <input
                                type="text"
                                value={position.einzelpreis.toFixed(3)}
                                readOnly
                                className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed"
                              />
                            ) : (
                              <NumericInput
                                value={position.einzelpreis}
                                onChange={(val) => handlePositionChange(index, 'einzelpreis', val)}
                                step="0.01"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                              />
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Beschreibung (optional)</label>
                          <textarea
                            value={position.beschreibung || ''}
                            onChange={(e) => handlePositionChange(index, 'beschreibung', e.target.value)}
                            placeholder="Detaillierte Beschreibung der Position..."
                            rows={istDieselPosition ? 1 : 2}
                            readOnly={istDieselPosition}
                            className={`w-full px-3 py-2 border rounded-lg placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:border-transparent ${
                              istDieselPosition
                                ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs cursor-not-allowed'
                                : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-red-500 dark:focus:ring-red-400'
                            }`}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => removePosition(index)}
                        className={`mt-7 p-2.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                          istDieselPosition
                            ? 'text-blue-500 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50'
                            : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 active:bg-red-100 dark:active:bg-red-900/50'
                        }`}
                        title={istDieselPosition ? 'Dieselzuschlag entfernen' : 'Position löschen'}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      {/* Checkbox: ohne MwSt (bereits Brutto) - nicht für Diesel-Position */}
                      {!istDieselPosition ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={position.ohneMwSt || false}
                            onChange={(e) => handlePositionChange(index, 'ohneMwSt', e.target.checked)}
                            className="w-4 h-4 text-amber-600 border-gray-300 dark:border-slate-700 rounded focus:ring-amber-500"
                          />
                          <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                            ohne MwSt (bereits Brutto)
                          </span>
                        </label>
                      ) : (
                        <span className="text-xs text-blue-500 dark:text-blue-400">
                          Berechnet aus {dieselZuschlagErgebnis?.stufen || 0} Zuschlagsstufe(n)
                        </span>
                      )}
                      <div className="text-right">
                        <span className="text-sm text-gray-600 dark:text-dark-textMuted">Gesamtpreis: </span>
                        <span className={`text-lg font-semibold ${istDieselPosition ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-dark-text'}`}>
                          {position.gesamtpreis.toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  </SortablePosition>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Steueroptionen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Steueroptionen</h2>
          <div className="space-y-4">
            {/* Checkbox: Nettorechnung (ohne MwSt.) */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rechnungsDaten.ohneMehrwertsteuer || false}
                onChange={(e) => handleInputChange('ohneMehrwertsteuer', e.target.checked)}
                className="w-5 h-5 mt-0.5 text-amber-600 border-gray-300 dark:border-slate-700 rounded focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text">Nettorechnung (ohne Mehrwertsteuer)</span>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                  Steuerfreie innergemeinschaftliche Lieferung / Reverse Charge gem. § 13b UStG
                </p>
              </div>
            </label>

            {/* MwSt.-Satz Auswahl (nur wenn NICHT Nettorechnung) */}
            {!rechnungsDaten.ohneMehrwertsteuer && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Mehrwertsteuersatz
                </label>
                <select
                  value={(rechnungsDaten.mehrwertsteuersatz ?? 19).toString()}
                  onChange={(e) => handleInputChange('mehrwertsteuersatz', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                >
                  <option value="19">19% (Deutschland)</option>
                  <option value="20">20% (Österreich)</option>
                  <option value="8.1">8,1% (Schweiz)</option>
                  <option value="21">21% (Niederlande, Belgien)</option>
                  <option value="22">22% (Italien)</option>
                  <option value="7">7% (Deutschland ermäßigt)</option>
                </select>
              </div>
            )}

            {/* Reverse Charge Hinweis und USt-IdNr. (nur bei Nettorechnung) */}
            {rechnungsDaten.ohneMehrwertsteuer && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  USt-IdNr. des Kunden (optional)
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.kundenUstIdNr || ''}
                  onChange={(e) => handleInputChange('kundenUstIdNr', e.target.value)}
                  placeholder="z.B. ATU12345678"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-transparent"
                />
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Die USt-IdNr. wird auf der Rechnung ausgewiesen
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Zahlungsbedingungen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Zahlungsbedingungen</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rechnungsDaten.zahlungsbedingungenAusblenden || false}
                onChange={(e) => handleInputChange('zahlungsbedingungenAusblenden', e.target.checked)}
                className="w-4 h-4 text-orange-600 border-gray-300 dark:border-slate-700 rounded focus:ring-orange-500"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Im PDF ausblenden</span>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Zahlungsziel</label>
              <select
                value={rechnungsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              >
                <option value="Vorkasse">Vorkasse</option>
                <option value="Sofort">Sofort</option>
                <option value="7 Tage">7 Tage</option>
                <option value="14 Tage">14 Tage</option>
                <option value="30 Tage">30 Tage</option>
                <option value="60 Tage">60 Tage</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={rechnungsDaten.skontoAktiviert || false}
                  onChange={(e) => handleInputChange('skontoAktiviert', e.target.checked)}
                  className="w-4 h-4 text-red-600 border-gray-300 dark:border-slate-700 rounded focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">Skonto aktivieren</span>
              </label>
              
              {rechnungsDaten.skontoAktiviert && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Skonto %</label>
                    <NumericInput
                      value={rechnungsDaten.skonto?.prozent || 0}
                      onChange={(val) => handleInputChange('skonto', {
                        prozent: val,
                        tage: rechnungsDaten.skonto?.tage || 7
                      })}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Tage</label>
                    <NumericInput
                      value={rechnungsDaten.skonto?.tage || 0}
                      onChange={(val) => handleInputChange('skonto', {
                        prozent: rechnungsDaten.skonto?.prozent || 0,
                        tage: val
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Bemerkung</h2>
          <textarea
            value={rechnungsDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/40 rounded-xl shadow-lg dark:shadow-dark-lg border border-red-200 dark:border-red-800 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Zusammenfassung</h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-dark-textMuted">Positionen:</span>
              <span className="font-medium text-gray-900 dark:text-dark-text">{rechnungsDaten.positionen.length}</span>
            </div>

            <div className="border-t border-red-200 dark:border-red-800 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-dark-textMuted">Nettobetrag:</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">{berechnung.nettobetrag.toFixed(2)} €</span>
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-dark-textMuted">
                  {rechnungsDaten.ohneMehrwertsteuer ? 'MwSt.:' : `MwSt. (${berechnung.umsatzsteuersatz}%):`}
                </span>
                <span className={`font-medium ${rechnungsDaten.ohneMehrwertsteuer ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-dark-text'}`}>
                  {rechnungsDaten.ohneMehrwertsteuer ? 'steuerfrei' : `${berechnung.umsatzsteuer.toFixed(2)} €`}
                </span>
              </div>

              <div className="border-t border-red-200 dark:border-red-800 pt-3 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-gray-900 dark:text-dark-text">Gesamtbetrag:</span>
                  <span className="text-3xl font-bold text-red-600 dark:text-red-400 break-all">
                    {berechnung.bruttobetrag.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>

            {rechnungsDaten.skontoAktiviert && rechnungsDaten.skonto && rechnungsDaten.skonto.prozent > 0 && (
              <div className="border-t border-red-200 dark:border-red-800 pt-3 mt-3">
                <div className="text-sm text-gray-600 dark:text-dark-textMuted mb-1">
                  Bei Zahlung innerhalb von {rechnungsDaten.skonto.tage} Tagen:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-dark-textMuted">Skonto ({rechnungsDaten.skonto.prozent}%):</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {(berechnung.bruttobetrag * (1 - rechnungsDaten.skonto.prozent / 100)).toFixed(2)} €
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="mt-6 space-y-3">
            {/* Entwurf herunterladen */}
            <button
              onClick={generiereUndLadeRechnung}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 text-red-700 dark:text-red-400 border-2 border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-all"
            >
              <Download className="h-5 w-5" />
              Entwurf herunterladen
            </button>

            {/* Proforma-Rechnung erstellen (für Vorkasse) */}
            {projekt?.$id && !gespeichertesDokument && (
              <button
                onClick={erstelleProformaRechnung}
                disabled={proformaInProgress || rechnungsDaten.positionen.length === 0}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {proformaInProgress ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Erstelle Proforma...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5" />
                    Proforma-Rechnung erstellen (Vorkasse)
                  </>
                )}
              </button>
            )}

            {/* E-Mail mit PDF öffnen */}
            <button
              onClick={oeffneEmailMitRechnung}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 dark:bg-red-600 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-500 transition-all shadow-lg dark:shadow-dark-glow-red hover:shadow-xl"
            >
              <Mail className="h-5 w-5" />
              E-Mail mit PDF öffnen
            </button>

            {/* Finalisieren */}
            {projekt?.$id && !showFinalConfirm && (
              <button
                onClick={() => setShowFinalConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-500 dark:to-orange-500 text-white rounded-lg hover:from-red-700 hover:to-orange-700 dark:hover:from-red-400 dark:hover:to-orange-400 transition-all shadow-lg dark:shadow-dark-glow-red hover:shadow-xl"
              >
                <Lock className="h-5 w-5" />
                Rechnung finalisieren
              </button>
            )}

            {/* Bestätigungs-Dialog */}
            {showFinalConfirm && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">Sind Sie sicher?</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      Nach dem Finalisieren kann diese Rechnung nicht mehr geändert werden!
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFinalConfirm(false)}
                    className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-surfaceHover transition-colors text-sm font-medium"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={speichereUndHinterlegeRechnung}
                    disabled={ladeStatus === 'speichern'}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {ladeStatus === 'speichern' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Speichern...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Ja, finalisieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {!projekt?.$id && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Zum Speichern muss ein Projekt ausgewählt sein.
                </p>
              </div>
            )}
          </div>
          
          {/* Proforma-Verlauf */}
          {projekt?.$id && (
            <div className="mt-6">
              <DokumentVerlauf
                projektId={projekt.$id}
                dokumentTyp="proformarechnung"
                titel="Proforma-Rechnungen"
                maxAnzeige={3}
                ladeZaehler={proformaVerlaufZaehler}
              />
            </div>
          )}

          {/* Rechnungs-Verlauf */}
          {projekt?.$id && (
            <div className="mt-6">
              <DokumentVerlauf
                projektId={projekt.$id}
                dokumentTyp="rechnung"
                titel="Rechnungs- & Storno-Verlauf"
                maxAnzeige={3}
                ladeZaehler={verlaufLadeZaehler}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* E-Mail-Formular */}
      {showEmailFormular && emailPdf && (
        <EmailFormular
          pdf={emailPdf}
          dateiname={`Rechnung_${rechnungsDaten.rechnungsnummer}.pdf`}
          dokumentTyp="rechnung"
          dokumentNummer={rechnungsDaten.rechnungsnummer}
          kundenname={rechnungsDaten.kundenname}
          kundennummer={rechnungsDaten.kundennummer}
          projektId={projekt?.$id}
          standardEmpfaenger={projekt?.rechnungsEmail || projekt?.kundenEmail}
          onClose={() => {
            setShowEmailFormular(false);
            setEmailPdf(null);
          }}
        />
      )}
    </div>
  );
};

export default RechnungTab;
