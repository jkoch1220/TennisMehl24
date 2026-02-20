import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Download, FileCheck, Edit3, AlertCircle, CheckCircle2, Loader2, Cloud, CloudOff, Package, Search, Mail, Truck, CalendarDays, Navigation } from 'lucide-react';
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
import { LieferscheinDaten, LieferscheinPosition, GespeichertesDokument } from '../../types/projektabwicklung';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import jsPDF from 'jspdf';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  ladeDokumentNachTyp,
  speichereLieferschein,
  aktualisereLieferschein,
  ladeDokumentDaten,
  getFileDownloadUrl,
  speichereEntwurf,
  ladeEntwurf,
  ladePositionenVonVorherigem,
  ladeLieferdatenVonAuftragsbestaetigung
} from '../../services/projektabwicklungDokumentService';
import { getAlleArtikel } from '../../services/artikelService';
import { Artikel } from '../../types/artikel';
import { Projekt } from '../../types/projekt';
import DokumentVerlauf from './DokumentVerlauf';
import EmailFormular from './EmailFormular';
import DokumentAdresseFormular, { DokumentAdresse } from './DokumentAdresseFormular';
import { SaisonKunde } from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { formatAdresszeile } from '../../services/pdfHelpers';

interface LieferscheinTabProps {
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

const LieferscheinTab = ({ projekt, kunde: kundeFromProps, kundeInfo }: LieferscheinTabProps) => {
  const navigate = useNavigate();

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

  const [lieferscheinDaten, setLieferscheinDaten] = useState<LieferscheinDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',

    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    lieferscheinnummer: '',
    lieferdatum: new Date().toISOString().split('T')[0],
    
    positionen: [],
    
    // Default: Unterschriften für Empfangsbestätigung aktiviert
    unterschriftenFuerEmpfangsbestaetigung: true,
  });
  
  // Dokument-Status
  const [gespeichertesDokument, setGespeichertesDokument] = useState<GespeichertesDokument | null>(null);
  const [istBearbeitungsModus, setIstBearbeitungsModus] = useState(false);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'speichern' | 'fehler'>('laden');
  const [statusMeldung, setStatusMeldung] = useState<{ typ: 'erfolg' | 'fehler'; text: string } | null>(null);
  const [verlaufLadeZaehler, setVerlaufLadeZaehler] = useState(0); // Trigger für Verlauf-Neuladen
  
  // E-Mail-Formular
  const [showEmailFormular, setShowEmailFormular] = useState(false);
  const [emailPdf, setEmailPdf] = useState<jsPDF | null>(null);

  // Auto-Save Status
  const [autoSaveStatus, setAutoSaveStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);
  const initialLaden = useRef(true);
  
  // Artikel-Auswahl
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [showArtikelAuswahl, setShowArtikelAuswahl] = useState(false);
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [artikelSortierung, setArtikelSortierung] = useState<'bezeichnung' | 'artikelnummer' | 'einzelpreis'>('bezeichnung');
  
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
        
        // Erst prüfen ob ein finalisiertes Dokument existiert
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'lieferschein');
        
        if (dokument) {
          setGespeichertesDokument(dokument);
          // Lade gespeicherte Daten für Bearbeitung
          const gespeicherteDaten = ladeDokumentDaten<LieferscheinDaten>(dokument);
          if (gespeicherteDaten) {
            // Übernehme Lieferadresse aus Projekt, falls nicht bereits im Dokument gespeichert
            const lieferadresseAbweichend = gespeicherteDaten.lieferadresseAbweichend 
              ? gespeicherteDaten.lieferadresseAbweichend 
              : (projekt?.lieferadresse ? true : false);
            const lieferadresseName = gespeicherteDaten.lieferadresseName 
              ? gespeicherteDaten.lieferadresseName 
              : (projekt?.lieferadresse ? projekt.kundenname : undefined);
            const lieferadresseStrasse = gespeicherteDaten.lieferadresseStrasse 
              ? gespeicherteDaten.lieferadresseStrasse 
              : (projekt?.lieferadresse?.strasse || undefined);
            const lieferadressePlzOrt = gespeicherteDaten.lieferadressePlzOrt
              ? gespeicherteDaten.lieferadressePlzOrt
              : (projekt?.lieferadresse
                ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                : undefined);
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setLieferscheinDaten({
              ...gespeicherteDaten,
              kundennummer: gespeicherteDaten.kundennummer || projekt?.kundennummer,
              kundenname: gespeicherteDaten.kundenname || projekt?.kundenname || '',
              kundenstrasse: gespeicherteDaten.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: gespeicherteDaten.kundenPlzOrt || projekt?.kundenPlzOrt || '',
              // Default für Unterschriften: true (Rückwärtskompatibilität)
              unterschriftenFuerEmpfangsbestaetigung: gespeicherteDaten.unterschriftenFuerEmpfangsbestaetigung !== undefined 
                ? gespeicherteDaten.unterschriftenFuerEmpfangsbestaetigung 
                : true,
              lieferadresseAbweichend: lieferadresseAbweichend,
              lieferadresseName: lieferadresseName,
              lieferadresseStrasse: lieferadresseStrasse,
              lieferadressePlzOrt: lieferadressePlzOrt,
            });
          }
          setAutoSaveStatus('gespeichert');
        } else {
          // Kein finalisiertes Dokument - versuche Entwurf zu laden
          const entwurf = await ladeEntwurf<LieferscheinDaten>(projekt.$id, 'lieferscheinDaten');
          if (entwurf) {
            // Übernehme Lieferadresse aus Projekt, falls nicht bereits im Entwurf gespeichert
            const lieferadresseAbweichend = entwurf.lieferadresseAbweichend 
              ? entwurf.lieferadresseAbweichend 
              : (projekt?.lieferadresse ? true : false);
            const lieferadresseName = entwurf.lieferadresseName 
              ? entwurf.lieferadresseName 
              : (projekt?.lieferadresse ? projekt.kundenname : undefined);
            const lieferadresseStrasse = entwurf.lieferadresseStrasse 
              ? entwurf.lieferadresseStrasse 
              : (projekt?.lieferadresse?.strasse || undefined);
            const lieferadressePlzOrt = entwurf.lieferadressePlzOrt
              ? entwurf.lieferadressePlzOrt
              : (projekt?.lieferadresse
                ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
                : undefined);
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setLieferscheinDaten({
              ...entwurf,
              kundennummer: entwurf.kundennummer || projekt?.kundennummer,
              kundenname: entwurf.kundenname || projekt?.kundenname || '',
              kundenstrasse: entwurf.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: entwurf.kundenPlzOrt || projekt?.kundenPlzOrt || '',
              // Default für Unterschriften: true (Rückwärtskompatibilität)
              unterschriftenFuerEmpfangsbestaetigung: entwurf.unterschriftenFuerEmpfangsbestaetigung !== undefined 
                ? entwurf.unterschriftenFuerEmpfangsbestaetigung 
                : true,
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

  // Auto-Save mit Debounce
  const speichereAutomatisch = useCallback(async (daten: LieferscheinDaten) => {
    if (!projekt?.$id || initialLaden.current || gespeichertesDokument) return;
    
    try {
      setAutoSaveStatus('speichern');
      await speichereEntwurf(projekt.$id, 'lieferscheinDaten', daten);
      setAutoSaveStatus('gespeichert');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setAutoSaveStatus('fehler');
    }
  }, [projekt?.$id, gespeichertesDokument]);

  // Debounced Auto-Save bei Änderungen
  useEffect(() => {
    if (initialLaden.current || !hatGeaendert.current || gespeichertesDokument) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch(lieferscheinDaten);
    }, 1500);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [lieferscheinDaten, speichereAutomatisch, gespeichertesDokument]);

  // Lieferscheinnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!lieferscheinDaten.lieferscheinnummer && !projekt?.lieferscheinnummer && !gespeichertesDokument) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('lieferschein');
          setLieferscheinDaten(prev => ({ ...prev, lieferscheinnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Lieferscheinnummer:', error);
          // Fallback: Verwende Timestamp-basierte eindeutige Nummer
          const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
          setLieferscheinDaten(prev => ({ 
            ...prev, 
            lieferscheinnummer: `LS-${laufnummer}` 
          }));
        }
      }
    };
    generiereNummer();
  }, [gespeichertesDokument]);
  
  // Wenn Projekt oder Kundendaten übergeben wurden, fülle das Formular vor
  useEffect(() => {
    const ladeDaten = async () => {
      // Nicht überschreiben wenn bereits ein Dokument geladen wurde
      if (gespeichertesDokument) return;
      
      const datenQuelle = projekt || kundeInfo;
      if (datenQuelle) {
        const heute = new Date();
        
        // AUTOMATISCH: Versuche Positionen vom vorherigen Dokument (Auftragsbestätigung) zu übernehmen
        let initialePositionen: LieferscheinPosition[] = [];
        
        if (projekt?.$id) {
          const positionen = await ladePositionenVonVorherigem(projekt.$id, 'lieferschein');
          if (positionen && positionen.length > 0) {
            initialePositionen = positionen as LieferscheinPosition[];
            console.log('✅ Stückliste von Auftragsbestätigung übernommen:', initialePositionen.length, 'Positionen');
          }
        }
        
        // Fallback: Wenn keine Positionen von AB, versuche aus Projektdaten
        if (initialePositionen.length === 0) {
          const angefragteMenge = projekt?.angefragteMenge || kundeInfo?.angefragteMenge;

          if (angefragteMenge) {
            initialePositionen.push({
              id: '1',
              artikelnummer: 'TM-ZM-02',
              artikel: 'Tennissand 0/2',
              beschreibung: '',
              menge: angefragteMenge,
              einheit: 't',
            });
          }
        }
        
        // Lieferscheinnummer generieren, falls nicht vorhanden
        let lieferscheinnummer = projekt?.lieferscheinnummer;
        if (!lieferscheinnummer) {
          try {
            lieferscheinnummer = await generiereNaechsteDokumentnummer('lieferschein');
          } catch (error) {
            console.error('Fehler beim Generieren der Lieferscheinnummer:', error);
            // Fallback: Verwende Timestamp-basierte eindeutige Nummer
            const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
            lieferscheinnummer = `LS-${laufnummer}`;
          }
        }
        
        // Übernehme Lieferadresse aus Projekt, falls vorhanden
        const lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
        const lieferadresseName = projekt?.lieferadresse ? projekt.kundenname : undefined;
        const lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
        const lieferadressePlzOrt = projekt?.lieferadresse
          ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
          : undefined;

        // Lieferdaten von der Auftragsbestätigung übernehmen (KW, Tag, Belieferungsart, DISPO)
        let lieferdatenAusAB = null;
        if (projekt?.$id) {
          lieferdatenAusAB = await ladeLieferdatenVonAuftragsbestaetigung(projekt.$id);
          if (lieferdatenAusAB) {
            console.log('✅ Lieferdaten von Auftragsbestätigung übernommen:', lieferdatenAusAB);
          }
        }

        // DISPO-Ansprechpartner: Erst AB (nur wenn Name vorhanden), dann Projekt, dann Kunde
        // WICHTIG: Leere Strings werden NICHT als gültige Werte behandelt!
        let dispoAnsprechpartner: { name: string; telefon: string } | undefined = undefined;

        // 1. Versuche aus AB zu laden (nur wenn Name wirklich gesetzt)
        if (lieferdatenAusAB?.dispoAnsprechpartner?.name?.trim()) {
          dispoAnsprechpartner = lieferdatenAusAB.dispoAnsprechpartner;
          console.log('✅ DISPO-Ansprechpartner von Auftragsbestätigung übernommen:', dispoAnsprechpartner.name);
        }
        // 2. Fallback: Aus Projekt laden (nur wenn Name wirklich gesetzt)
        if (!dispoAnsprechpartner?.name?.trim() && projekt?.dispoAnsprechpartner?.name?.trim()) {
          dispoAnsprechpartner = projekt.dispoAnsprechpartner;
          console.log('✅ DISPO-Ansprechpartner vom Projekt übernommen:', dispoAnsprechpartner.name);
        }
        // 3. Fallback: Aus Kundenstammdaten laden
        if (!dispoAnsprechpartner?.name?.trim() && projekt?.kundeId) {
          try {
            const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
            if (kunde?.dispoAnsprechpartner?.name?.trim()) {
              dispoAnsprechpartner = kunde.dispoAnsprechpartner;
              console.log('✅ DISPO-Ansprechpartner vom Kunden geladen:', dispoAnsprechpartner.name);
            }
          } catch (error) {
            console.warn('Kunde konnte nicht geladen werden:', error);
          }
        }

        setLieferscheinDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: projekt?.ansprechpartner || kundeInfo?.ansprechpartner,
          dispoAnsprechpartner: prev.dispoAnsprechpartner?.name ? prev.dispoAnsprechpartner : dispoAnsprechpartner,
          lieferscheinnummer: lieferscheinnummer,
          lieferdatum: projekt?.lieferdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          lieferadresseAbweichend: lieferadresseAbweichend,
          lieferadresseName: lieferadresseName,
          lieferadresseStrasse: lieferadresseStrasse,
          lieferadressePlzOrt: lieferadressePlzOrt,
          // Lieferdaten: Erst prev, dann AB, dann Projekt (Fallback-Kaskade)
          lieferdatumTyp: prev.lieferdatumTyp || lieferdatenAusAB?.lieferdatumTyp || projekt?.lieferdatumTyp,
          lieferKW: prev.lieferKW || lieferdatenAusAB?.lieferKW || projekt?.lieferKW,
          lieferKWJahr: prev.lieferKWJahr || lieferdatenAusAB?.lieferKWJahr || projekt?.lieferKWJahr,
          bevorzugterTag: prev.bevorzugterTag || lieferdatenAusAB?.bevorzugterTag || projekt?.bevorzugterTag,
          belieferungsart: prev.belieferungsart || lieferdatenAusAB?.belieferungsart || projekt?.belieferungsart,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo, gespeichertesDokument]);

  const handleInputChange = (field: keyof LieferscheinDaten, value: any) => {
    hatGeaendert.current = true;
    setLieferscheinDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof LieferscheinPosition, value: any) => {
    hatGeaendert.current = true;
    const neuePositionen = [...lieferscheinDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    setLieferscheinDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    hatGeaendert.current = true;
    const neuePosition: LieferscheinPosition = {
      id: Date.now().toString(),
      artikelnummer: '',
      artikel: '',
      beschreibung: '',
      menge: 1,
      einheit: 'Stk',
    };
    
    setLieferscheinDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

  const addPositionAusArtikel = (artikelId: string) => {
    hatGeaendert.current = true;
    const selectedArtikel = artikel.find(a => a.$id === artikelId);
    if (!selectedArtikel) return;

    const neuePosition: LieferscheinPosition = {
      id: Date.now().toString(),
      artikelnummer: selectedArtikel.artikelnummer,
      artikel: selectedArtikel.bezeichnung,
      beschreibung: selectedArtikel.beschreibung,
      menge: 1,
      einheit: selectedArtikel.einheit,
    };
    
    setLieferscheinDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
    
    setShowArtikelAuswahl(false);
    setArtikelSuchtext('');
  };

  // Gefilterte und sortierte Artikel für die Auswahl
  const gefilterteArtikel = artikel
    .filter(art => {
      if (!artikelSuchtext.trim()) return true;
      const suchtext = artikelSuchtext.toLowerCase();
      return (
        art.bezeichnung.toLowerCase().includes(suchtext) ||
        art.artikelnummer.toLowerCase().includes(suchtext) ||
        (art.beschreibung && art.beschreibung.toLowerCase().includes(suchtext))
      );
    })
    .sort((a, b) => {
      if (artikelSortierung === 'bezeichnung') {
        return a.bezeichnung.localeCompare(b.bezeichnung);
      } else if (artikelSortierung === 'artikelnummer') {
        return a.artikelnummer.localeCompare(b.artikelnummer);
      } else if (artikelSortierung === 'einzelpreis') {
        const preisA = a.einzelpreis ?? 0;
        const preisB = b.einzelpreis ?? 0;
        return preisA - preisB;
      }
      return 0;
    });

  const removePosition = (index: number) => {
    hatGeaendert.current = true;
    setLieferscheinDaten(prev => ({
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
      setLieferscheinDaten(prev => {
        const oldIndex = prev.positionen.findIndex(p => p.id === active.id);
        const newIndex = prev.positionen.findIndex(p => p.id === over.id);
        return {
          ...prev,
          positionen: arrayMove(prev.positionen, oldIndex, newIndex),
        };
      });
    }
  };

  // Enter-Handler für Artikel-Suche
  const handleArtikelSucheKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && gefilterteArtikel.length > 0) {
      e.preventDefault();
      const erstesErgebnis = gefilterteArtikel[0];
      if (erstesErgebnis.$id) {
        addPositionAusArtikel(erstesErgebnis.$id);
      }
    }
  };

  // PDF generieren und E-Mail-Formular öffnen
  const oeffneEmailMitLieferschein = async () => {
    try {
      if (!lieferscheinDaten.lieferscheinnummer) {
        alert('Bitte geben Sie zuerst eine Lieferscheinnummer ein.');
        return;
      }

      // PDF generieren
      const pdf = await generiereLieferscheinPDF(lieferscheinDaten);
      setEmailPdf(pdf);
      setShowEmailFormular(true);
    } catch (error) {
      console.error('Fehler beim Generieren der PDF:', error);
      alert('Fehler beim Generieren der PDF: ' + (error as Error).message);
    }
  };

  // Speichern in Appwrite
  const speichereUndHinterlegeLieferschein = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }
    
    try {
      setLadeStatus('speichern');
      setStatusMeldung(null);
      
      let neuesDokument: GespeichertesDokument;
      
      if (gespeichertesDokument && istBearbeitungsModus) {
        // Neue Version erstellen (altes Dokument bleibt erhalten!)
        neuesDokument = await aktualisereLieferschein(
          gespeichertesDokument.$id!,
          gespeichertesDokument.dateiId,
          lieferscheinDaten,
          gespeichertesDokument.version || 1
        );
        setStatusMeldung({ typ: 'erfolg', text: `Lieferschein als Version ${neuesDokument.version} gespeichert!` });
      } else {
        // Neu erstellen
        neuesDokument = await speichereLieferschein(projekt.$id, lieferscheinDaten);
        setStatusMeldung({ typ: 'erfolg', text: 'Lieferschein erfolgreich gespeichert und hinterlegt!' });
      }
      
      setGespeichertesDokument(neuesDokument);
      setIstBearbeitungsModus(false);
      setLadeStatus('bereit');
      setVerlaufLadeZaehler(prev => prev + 1); // Verlauf neu laden

      // Status-Meldung nach 5 Sekunden ausblenden
      setTimeout(() => setStatusMeldung(null), 5000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler beim Speichern: ' + (error as Error).message });
      setLadeStatus('fehler');
    }
  };

  // Zeige Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        <span className="ml-3 text-gray-600 dark:text-dark-textMuted">Lade Dokument...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* STATUS-BANNER: Bereits hinterlegtes Dokument */}
        {gespeichertesDokument && !istBearbeitungsModus && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 border border-green-200 dark:border-green-800 rounded-xl p-6 shadow-sm dark:shadow-dark-lg">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                  <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Lieferschein hinterlegt</h3>
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  <strong>{gespeichertesDokument.dokumentNummer}</strong>
                  {gespeichertesDokument.version && ` (Version ${gespeichertesDokument.version})`}
                  {' '}wurde am{' '}
                  {gespeichertesDokument.$createdAt && new Date(gespeichertesDokument.$createdAt).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} gespeichert.
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <a
                    href={getFileDownloadUrl(gespeichertesDokument.dateiId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-600 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-500 transition-colors text-sm font-medium shadow-lg dark:shadow-dark-lg"
                  >
                    <Download className="h-4 w-4" />
                    PDF herunterladen
                  </a>
                  <button
                    onClick={() => setIstBearbeitungsModus(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/50 transition-colors text-sm font-medium"
                  >
                    <Edit3 className="h-4 w-4" />
                    Bearbeiten & neu speichern
                  </button>
                  <button
                    onClick={() => navigate('/dispo-planung')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-colors text-sm font-medium shadow-lg"
                  >
                    <Navigation className="h-4 w-4" />
                    Zur Dispo-Planung
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bearbeitungs-Hinweis */}
        {istBearbeitungsModus && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Edit3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Bearbeitungsmodus aktiv</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">Änderungen werden als neue Version gespeichert. Alte Versionen bleiben erhalten (GoBD-konform).</p>
              </div>
              <button
                onClick={() => {
                  setIstBearbeitungsModus(false);
                  // Originaldaten wiederherstellen
                  if (gespeichertesDokument) {
                    const gespeicherteDaten = ladeDokumentDaten<LieferscheinDaten>(gespeichertesDokument);
                    if (gespeicherteDaten) {
                      setLieferscheinDaten(gespeicherteDaten);
                    }
                  }
                }}
                className="ml-auto text-sm text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Status-Meldung */}
        {statusMeldung && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            statusMeldung.typ === 'erfolg'
              ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800'
          }`}>
            {statusMeldung.typ === 'erfolg' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <p className={`text-sm ${statusMeldung.typ === 'erfolg' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
              {statusMeldung.text}
            </p>
          </div>
        )}

        {/* Auto-Save Status (nur wenn noch kein Dokument hinterlegt) */}
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

        {/* Quick-Link zur Dispo-Planung */}
        {projekt?.$id && (
          <div className="flex items-center justify-between bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 rounded-xl px-4 py-3 border border-orange-200 dark:border-orange-800/50">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                Dispo-Details, Schüttplatzbilder & Tourenzuweisung
              </span>
            </div>
            <button
              onClick={() => navigate('/dispo-planung')}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-colors text-sm font-medium shadow"
            >
              <Navigation className="h-4 w-4" />
              Dispo-Planung öffnen
            </button>
          </div>
        )}

        {/* Lieferscheininformationen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Lieferscheininformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Lieferscheinnummer</label>
              <input
                type="text"
                value={lieferscheinDaten.lieferscheinnummer}
                onChange={(e) => handleInputChange('lieferscheinnummer', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Lieferdatum</label>
              <input
                type="date"
                value={lieferscheinDaten.lieferdatum}
                onChange={(e) => handleInputChange('lieferdatum', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bestellnummer (optional)</label>
              <input
                type="text"
                value={lieferscheinDaten.bestellnummer || ''}
                onChange={(e) => handleInputChange('bestellnummer', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
              />
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
                  value={lieferscheinDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ihr Ansprechpartner (optional)</label>
                <select
                  value={lieferscheinDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
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
                  value={lieferscheinDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Tel. Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.ansprechpartnerTelefon || ''}
                  onChange={(e) => handleInputChange('ansprechpartnerTelefon', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. 0171 1234567"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dokument-Adresse (wird auf dem Lieferschein gedruckt - Default: LIEFERADRESSE) */}
        <DokumentAdresseFormular
          adresse={{
            name: lieferscheinDaten.kundenname,
            strasse: lieferscheinDaten.kundenstrasse,
            plzOrt: lieferscheinDaten.kundenPlzOrt,
          }}
          onChange={(adresse: DokumentAdresse) => {
            setLieferscheinDaten(prev => ({
              ...prev,
              kundenname: adresse.name,
              kundenstrasse: adresse.strasse,
              kundenPlzOrt: adresse.plzOrt,
            }));
            hatGeaendert.current = true;
          }}
          kunde={kunde}
          dokumentTyp="lieferschein"
          projektKundenname={projekt?.kundenname}
          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
        />

        {/* Lieferadresse */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Lieferadresse</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lieferscheinDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-green-600 border-gray-300 dark:border-slate-700 rounded focus:ring-green-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {lieferscheinDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Name</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                />
              </div>
            </div>
          )}
        </div>

        {/* LIEFERTERMIN & BELIEFERUNG - Prominent hervorgehoben */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-xl shadow-sm border-2 border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <CalendarDays className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Liefertermin & Belieferung</h2>
              <p className="text-sm text-gray-600 dark:text-dark-textMuted">Wird automatisch in die Dispo-Planung übernommen</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Liefertermin KW */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Liefertermin (Kalenderwoche)
              </label>
              <div className="flex gap-2">
                {/* Typ-Auswahl: In KW oder Spätestens KW */}
                <select
                  value={lieferscheinDaten.lieferdatumTyp === 'kw' ? 'kw' : 'spaetestens_kw'}
                  onChange={(e) => handleInputChange('lieferdatumTyp', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-36 px-3 py-2 border border-blue-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800 font-medium"
                >
                  <option value="kw">In KW</option>
                  <option value="spaetestens_kw">Spätestens KW</option>
                </select>
                {/* KW-Auswahl */}
                <select
                  value={lieferscheinDaten.lieferKW || ''}
                  onChange={(e) => handleInputChange('lieferKW', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="flex-1 px-3 py-2 border border-blue-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
                >
                  <option value="">– KW wählen –</option>
                  {Array.from({ length: 53 }, (_, i) => i + 1).map(kw => (
                    <option key={kw} value={kw}>KW {kw}</option>
                  ))}
                </select>
                {/* Jahr-Auswahl */}
                <select
                  value={lieferscheinDaten.lieferKWJahr || new Date().getFullYear()}
                  onChange={(e) => handleInputChange('lieferKWJahr', parseInt(e.target.value))}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-20 px-2 py-2 border border-blue-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
                >
                  {[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {lieferscheinDaten.lieferdatumTyp === 'kw'
                  ? 'Feste KW: Lieferung erfolgt in dieser Kalenderwoche'
                  : 'Flexibel: Lieferung kann früher erfolgen, spätestens jedoch in dieser KW'}
              </p>
            </div>
            {/* Bevorzugter Wochentag */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Bevorzugter Tag
              </label>
              <select
                value={lieferscheinDaten.bevorzugterTag || ''}
                onChange={(e) => handleInputChange('bevorzugterTag', e.target.value || undefined)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
              >
                <option value="">– Egal –</option>
                <option value="montag">Montag</option>
                <option value="dienstag">Dienstag</option>
                <option value="mittwoch">Mittwoch</option>
                <option value="donnerstag">Donnerstag</option>
                <option value="freitag">Freitag</option>
                <option value="samstag">Samstag</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1 flex items-center gap-1">
                <Truck className="h-4 w-4" />
                Belieferungsart
              </label>
              <select
                value={lieferscheinDaten.belieferungsart || ''}
                onChange={(e) => handleInputChange('belieferungsart', e.target.value || undefined)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
              >
                <option value="">– Bitte wählen –</option>
                <option value="nur_motorwagen">Mit Motorwagen</option>
                <option value="mit_haenger">Motorwagen mit Hänger</option>
                <option value="abholung_ab_werk">Abholung ab Werk</option>
                <option value="palette_mit_ladekran">Palette mit Ladekran</option>
                <option value="bigbag">BigBag</option>
              </select>
            </div>
          </div>

          {/* DISPO-Ansprechpartner */}
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4" />
              DISPO-Ansprechpartner (für Lieferung vor Ort)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={lieferscheinDaten.dispoAnsprechpartner?.name || ''}
                  onChange={(e) => handleInputChange('dispoAnsprechpartner', {
                    name: e.target.value,
                    telefon: lieferscheinDaten.dispoAnsprechpartner?.telefon || '',
                  })}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Herr Müller (Platzwart)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Telefonnummer
                </label>
                <input
                  type="tel"
                  value={lieferscheinDaten.dispoAnsprechpartner?.telefon || ''}
                  onChange={(e) => handleInputChange('dispoAnsprechpartner', {
                    name: lieferscheinDaten.dispoAnsprechpartner?.name || '',
                    telefon: e.target.value,
                  })}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. 0171 1234567"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 dark:bg-slate-700 disabled:text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
          </div>

          {lieferscheinDaten.lieferKW && (
            <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm ${
              lieferscheinDaten.lieferdatumTyp === 'kw'
                ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
                : 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
            }`}>
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <span>
                  {lieferscheinDaten.lieferdatumTyp === 'kw' ? (
                    <>Lieferung <strong>in KW {lieferscheinDaten.lieferKW}/{lieferscheinDaten.lieferKWJahr || new Date().getFullYear()}</strong> (feste KW)</>
                  ) : (
                    <>Lieferung <strong>spätestens KW {lieferscheinDaten.lieferKW}/{lieferscheinDaten.lieferKWJahr || new Date().getFullYear()}</strong> (flexibel)</>
                  )}
                </span>
                {lieferscheinDaten.bevorzugterTag && (
                  <span>
                    Bevorzugter Tag: <strong>
                      {lieferscheinDaten.bevorzugterTag === 'montag' && 'Montag'}
                      {lieferscheinDaten.bevorzugterTag === 'dienstag' && 'Dienstag'}
                      {lieferscheinDaten.bevorzugterTag === 'mittwoch' && 'Mittwoch'}
                      {lieferscheinDaten.bevorzugterTag === 'donnerstag' && 'Donnerstag'}
                      {lieferscheinDaten.bevorzugterTag === 'freitag' && 'Freitag'}
                      {lieferscheinDaten.bevorzugterTag === 'samstag' && 'Samstag'}
                    </strong>
                  </span>
                )}
                {lieferscheinDaten.belieferungsart && (
                  <span>
                    Belieferungsart: <strong>
                      {lieferscheinDaten.belieferungsart === 'nur_motorwagen' && 'Mit Motorwagen'}
                      {lieferscheinDaten.belieferungsart === 'mit_haenger' && 'Motorwagen mit Hänger'}
                      {lieferscheinDaten.belieferungsart === 'abholung_ab_werk' && 'Abholung ab Werk'}
                      {lieferscheinDaten.belieferungsart === 'palette_mit_ladekran' && 'Palette mit Ladekran'}
                      {lieferscheinDaten.belieferungsart === 'bigbag' && 'BigBag'}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Lieferpositionen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Lieferpositionen</h2>
              <p className="text-sm text-gray-500 dark:text-dark-textMuted mt-1">Hinweis: Lieferscheine enthalten KEINE Preise</p>
            </div>
            {(!gespeichertesDokument || istBearbeitungsModus) && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowArtikelAuswahl(!showArtikelAuswahl)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Package className="h-4 w-4" />
                  Aus Artikel
                </button>
                <button
                  onClick={addPosition}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Leere Position
                </button>
              </div>
            )}
          </div>

          {/* Artikel-Auswahl */}
          {showArtikelAuswahl && (
            <div className="mb-4 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Artikel auswählen</h3>
                <button
                  onClick={() => {
                    setShowArtikelAuswahl(false);
                    setArtikelSuchtext('');
                  }}
                  className="text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:text-dark-text"
                >
                  Schließen
                </button>
              </div>

              {artikel.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-dark-textMuted">
                  Keine Artikel vorhanden. Legen Sie zuerst Artikel in der Artikelverwaltung an.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Suchfeld und Sortierung */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={artikelSuchtext}
                        onChange={(e) => setArtikelSuchtext(e.target.value)}
                        onKeyDown={handleArtikelSucheKeyDown}
                        placeholder="Artikel suchen (Bezeichnung, Art.-Nr., Beschreibung)..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-900"
                      />
                    </div>
                    <select
                      value={artikelSortierung}
                      onChange={(e) => setArtikelSortierung(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-900"
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
                        <thead className="bg-purple-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted">Art.-Nr.</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted">Bezeichnung</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted">Beschreibung</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted">Einheit</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {gefilterteArtikel.map((art) => (
                            <tr key={art.$id} className="hover:bg-purple-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-dark-text">{art.artikelnummer}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text">{art.bezeichnung}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-textMuted">
                                <div className="line-clamp-2 max-w-xs">{art.beschreibung || '-'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text text-center">{art.einheit}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => addPositionAusArtikel(art.$id!)}
                                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
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
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={lieferscheinDaten.positionen.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {lieferscheinDaten.positionen.map((position, index) => (
                  <SortablePosition
                    key={position.id}
                    id={position.id}
                    disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                    accentColor="green"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Artikel-Nr.</label>
                            <input
                              type="text"
                              value={position.artikelnummer || ''}
                              onChange={(e) => handlePositionChange(index, 'artikelnummer', e.target.value)}
                              disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                              placeholder="TM-001"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Artikel</label>
                            <input
                              type="text"
                              value={position.artikel}
                              onChange={(e) => handlePositionChange(index, 'artikel', e.target.value)}
                              disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                              placeholder="z.B. Tennismehl / Ziegelmehl"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Menge</label>
                            <NumericInput
                              value={position.menge}
                              onChange={(val) => handlePositionChange(index, 'menge', val)}
                              disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einheit</label>
                            <input
                              type="text"
                              value={position.einheit}
                              onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                              disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Beschreibung (optional)</label>
                          <textarea
                            value={position.beschreibung || ''}
                            onChange={(e) => handlePositionChange(index, 'beschreibung', e.target.value)}
                            disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                            placeholder="Detaillierte Beschreibung der Position..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
                          />
                        </div>
                      </div>

                      {(!gespeichertesDokument || istBearbeitungsModus) && (
                        <button
                          onClick={() => removePosition(index)}
                          className="mt-7 p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 active:bg-red-100 dark:active:bg-red-900/50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Position löschen"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </SortablePosition>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Empfangsbestätigung */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Empfangsbestätigung</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lieferscheinDaten.unterschriftenFuerEmpfangsbestaetigung !== false}
                onChange={(e) => handleInputChange('unterschriftenFuerEmpfangsbestaetigung', e.target.checked)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-green-600 border-gray-300 dark:border-slate-700 rounded focus:ring-green-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Unterschriften für Empfangsbestätigung verwenden</span>
            </label>
          </div>
          <p className="text-sm text-gray-500 dark:text-dark-textMuted">
            Wenn aktiviert, wird auf dem Lieferschein eine Empfangsbestätigung mit Unterschriftsfeld für den Empfänger angezeigt. 
            Bei Shop-Artikeln kann dies deaktiviert werden.
          </p>
        </div>

        {/* Bemerkung */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Bemerkung</h2>
          <textarea
            value={lieferscheinDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            disabled={!!gespeichertesDokument && !istBearbeitungsModus}
            rows={3}
            placeholder="z.B. Hinweise zur Lieferung oder Empfangsbestätigung"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dark-surface disabled:text-gray-500 dark:disabled:text-dark-textMuted"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 rounded-xl shadow-lg dark:shadow-dark-lg border border-green-200 dark:border-green-800 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Zusammenfassung</h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-dark-textMuted">Lieferpositionen:</span>
              <span className="font-medium text-gray-900 dark:text-dark-text">{lieferscheinDaten.positionen.length}</span>
            </div>

            <div className="border-t border-green-200 dark:border-green-800 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-dark-textMuted">Gesamtmenge:</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">
                  {lieferscheinDaten.positionen.reduce((sum, pos) => sum + pos.menge, 0)} Einheiten
                </span>
              </div>
            </div>

            <div className="border-t border-green-200 dark:border-green-800 pt-3 mt-3">
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Hinweis:</strong> Ein Lieferschein dokumentiert nur die gelieferten Waren und enthält keine Preisangaben.
                </p>
              </div>
            </div>
          </div>

          {/* Buttons basierend auf Status */}
          <div className="mt-6 space-y-3">
            {/* E-Mail mit PDF öffnen */}
            <button
              onClick={oeffneEmailMitLieferschein}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-all shadow-lg dark:shadow-dark-glow-blue hover:shadow-xl"
            >
              <Mail className="h-5 w-5" />
              E-Mail mit PDF öffnen
            </button>

            {/* Haupt-Aktion basierend auf Status */}
            {(!gespeichertesDokument || istBearbeitungsModus) && projekt?.$id && (
              <button
                onClick={speichereUndHinterlegeLieferschein}
                disabled={ladeStatus === 'speichern'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-500 dark:to-emerald-500 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 dark:hover:from-green-400 dark:hover:to-emerald-400 transition-all shadow-lg dark:shadow-dark-glow-green hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ladeStatus === 'speichern' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5" />
                    {istBearbeitungsModus ? 'Als neue Version speichern' : 'Lieferschein speichern & hinterlegen'}
                  </>
                )}
              </button>
            )}

            {!projekt?.$id && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Zum Speichern muss ein Projekt ausgewählt sein.
                </p>
              </div>
            )}
          </div>
          
          {/* Dateiverlauf */}
          {projekt?.$id && (
            <div className="mt-6">
              <DokumentVerlauf
                projektId={projekt.$id}
                dokumentTyp="lieferschein"
                titel="Lieferschein-Verlauf"
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
          dateiname={`Lieferschein_${lieferscheinDaten.lieferscheinnummer}.pdf`}
          dokumentTyp="lieferschein"
          dokumentNummer={lieferscheinDaten.lieferscheinnummer}
          kundenname={lieferscheinDaten.kundenname}
          kundennummer={lieferscheinDaten.kundennummer}
          projektId={projekt?.$id}
          standardEmpfaenger={projekt?.kundenEmail}
          onClose={() => {
            setShowEmailFormular(false);
            setEmailPdf(null);
          }}
        />
      )}
    </div>
  );
};

export default LieferscheinTab;
