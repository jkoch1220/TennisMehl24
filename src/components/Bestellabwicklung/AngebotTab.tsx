import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, Package, Search, Cloud, CloudOff, Loader2, FileCheck, Edit3, AlertCircle, CheckCircle2, Mail, ShoppingBag } from 'lucide-react';
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
import { AngebotsDaten, Position, GespeichertesDokument } from '../../types/bestellabwicklung';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { berechneDokumentSummen } from '../../services/rechnungService';
import { getAlleArtikel } from '../../services/artikelService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  speichereEntwurf,
  ladeEntwurf,
  ladeDokumentNachTyp,
  speichereAngebot,
  aktualisiereAngebot,
  ladeDokumentDaten,
  getFileDownloadUrl
} from '../../services/bestellabwicklungDokumentService';
import { Artikel } from '../../types/artikel';
import { UniversalArtikel } from '../../types/universaArtikel';
import { sucheUniversalArtikel, getAlleUniversalArtikel } from '../../services/universaArtikelService';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import DokumentVerlauf from './DokumentVerlauf';
import EmailFormular from './EmailFormular';
import jsPDF from 'jspdf';

interface AngebotTabProps {
  projekt?: Projekt;
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

const AngebotTab = ({ projekt, kundeInfo }: AngebotTabProps) => {
  const DEFAULT_DIESELPREISZUSCHLAG_TEXT =
    'Die angebotenen Preise beinhalten einen Dieselpreis von bis zu 1,749 €. ' +
    'Bei Steigerungen je 0,05 € über unserem kalkulierten Basis-Dieselpreis erhöht sich der Preis ' +
    'des gelieferten Ziegelmehls um 0,45 € je Tonne.';

  // Initialisiere mit leeren Daten
  const [angebotsDaten, setAngebotsDaten] = useState<AngebotsDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',
    
    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    angebotsnummer: '',
    angebotsdatum: new Date().toISOString().split('T')[0],
    gueltigBis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    
    positionen: [],
    zahlungsziel: '14 Tage',
    lieferbedingungenAktiviert: true,
    lieferbedingungen: 'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.',
    dieselpreiszuschlagAktiviert: false,
    dieselpreiszuschlagText: '',
  });
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [universalArtikel, setUniversalArtikel] = useState<UniversalArtikel[]>([]);
  const [showArtikelAuswahl, setShowArtikelAuswahl] = useState(false);
  const [artikelTab, setArtikelTab] = useState<'eigene' | 'universa'>('eigene');
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [artikelSortierung, setArtikelSortierung] = useState<'bezeichnung' | 'artikelnummer' | 'einzelpreis'>('bezeichnung');
  const [universalLaden, setUniversalLaden] = useState(false);
  const [ausgewaehlterIndex, setAusgewaehlterIndex] = useState<number>(0);
  const ausgewaehlteZeileRef = useRef<HTMLTableRowElement>(null);
  
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
  const [speicherStatus, setSpeicherStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const [initialLaden, setInitialLaden] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);
  
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

  // Gespeichertes Dokument und Entwurf laden
  useEffect(() => {
    const ladeGespeichertenEntwurf = async () => {
      if (!projekt?.$id) {
        setInitialLaden(false);
        setLadeStatus('bereit');
        return;
      }
      
      try {
        setLadeStatus('laden');
        
        // Erst prüfen ob ein finalisiertes Angebot existiert
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'angebot');
        
        if (dokument) {
          setGespeichertesDokument(dokument);
          // Lade gespeicherte Daten für Bearbeitung
          const gespeicherteDaten = ladeDokumentDaten<AngebotsDaten>(dokument);
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
                ? `${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`.trim()
                : undefined);
            
            setAngebotsDaten({
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
          setSpeicherStatus('gespeichert');
        } else {
          // Kein finalisiertes Angebot - versuche Entwurf zu laden
          const gespeicherterEntwurf = await ladeEntwurf<AngebotsDaten>(projekt.$id, 'angebotsDaten');
          
          if (gespeicherterEntwurf) {
            // Übernehme Lieferadresse aus Projekt, falls nicht bereits im Entwurf gespeichert
            const lieferadresseAbweichend = gespeicherterEntwurf.lieferadresseAbweichend 
              ? gespeicherterEntwurf.lieferadresseAbweichend 
              : (projekt?.lieferadresse ? true : false);
            const lieferadresseName = gespeicherterEntwurf.lieferadresseName 
              ? gespeicherterEntwurf.lieferadresseName 
              : (projekt?.lieferadresse ? projekt.kundenname : undefined);
            const lieferadresseStrasse = gespeicherterEntwurf.lieferadresseStrasse 
              ? gespeicherterEntwurf.lieferadresseStrasse 
              : (projekt?.lieferadresse?.strasse || undefined);
            const lieferadressePlzOrt = gespeicherterEntwurf.lieferadressePlzOrt 
              ? gespeicherterEntwurf.lieferadressePlzOrt 
              : (projekt?.lieferadresse 
                ? `${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`.trim()
                : undefined);
            
            setAngebotsDaten({
              ...gespeicherterEntwurf,
              kundennummer: gespeicherterEntwurf.kundennummer || projekt?.kundennummer,
              kundenname: gespeicherterEntwurf.kundenname || projekt?.kundenname || '',
              kundenstrasse: gespeicherterEntwurf.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: gespeicherterEntwurf.kundenPlzOrt || projekt?.kundenPlzOrt || '',
              lieferadresseAbweichend: lieferadresseAbweichend,
              lieferadresseName: lieferadresseName,
              lieferadresseStrasse: lieferadresseStrasse,
              lieferadressePlzOrt: lieferadressePlzOrt,
            });
            setSpeicherStatus('gespeichert');
          } else {
            // Fallback: Projekt-Daten nutzen
            await ladeVonProjekt();
          }
        }
        
        setLadeStatus('bereit');
      } catch (error) {
        console.error('Fehler beim Laden des Entwurfs:', error);
        await ladeVonProjekt();
        setLadeStatus('bereit');
      } finally {
        setInitialLaden(false);
      }
    };
    
    const ladeVonProjekt = async () => {
      const datenQuelle = projekt || kundeInfo;
      if (datenQuelle) {
        const heute = new Date();
        const gueltigBis = new Date(heute);
        gueltigBis.setDate(gueltigBis.getDate() + 30);
        
        const initialePositionen: Position[] = [];
        const angefragteMenge = projekt?.angefragteMenge || kundeInfo?.angefragteMenge;
        const preisProTonne = projekt?.preisProTonne || kundeInfo?.preisProTonne;
        
        if (angefragteMenge && preisProTonne) {
          initialePositionen.push({
            id: '1',
            artikelnummer: 'TM-ZM',
            bezeichnung: 'Tennismehl / Ziegelmehl',
            menge: angefragteMenge,
            einheit: 't',
            einzelpreis: preisProTonne,
            gesamtpreis: angefragteMenge * preisProTonne,
          });
        }
        
        // Für Kunden mit Bezugsweg "direkt": Standard-Artikel hinzufügen
        const bezugsweg = projekt?.bezugsweg;
        if (bezugsweg === 'direkt') {
          try {
            // Lade alle Artikel aus Appwrite
            const alleArtikel = await getAlleArtikel();
            
            // Suche nach den drei Standard-Artikeln anhand ihrer Artikelnummern
            const standardArtikelNummern = [
              'TM-ZM-02',  // Tennissand 0/2
              'TM-PE',     // PE Folie
              'TM-FP'      // Frachtkostenpauschale
            ];
            
            // Starte Position-ID nach bereits vorhandenen Positionen
            let positionId = initialePositionen.length + 1;
            let hinzugefuegteArtikel = 0;
            
            for (const artikelnummer of standardArtikelNummern) {
              const artikel = alleArtikel.find(a => a.artikelnummer === artikelnummer);
              
              if (artikel) {
                initialePositionen.push({
                  id: positionId.toString(),
                  artikelnummer: artikel.artikelnummer,
                  bezeichnung: artikel.bezeichnung,
                  beschreibung: artikel.beschreibung || '',
                  menge: 1,
                  einheit: artikel.einheit,
                  einzelpreis: artikel.einzelpreis ?? 0,
                  streichpreis: artikel.streichpreis,
                  gesamtpreis: artikel.einzelpreis ?? 0,
                });
                positionId++;
                hinzugefuegteArtikel++;
              }
            }
            
            // Falls keine Artikel gefunden wurden, Warnung ausgeben
            if (hinzugefuegteArtikel === 0) {
              console.warn('Keine Standard-Artikel für Direkt-Kunden gefunden. Bitte legen Sie die Artikel in den Stammdaten an: TM-ZM-02 (Tennissand 0/2), TM-PE (PE Folie), TM-FP (Frachtkostenpauschale)');
            } else {
              console.info(`${hinzugefuegteArtikel} Standard-Artikel für Direkt-Kunden hinzugefügt`);
            }
          } catch (error) {
            console.error('Fehler beim Laden der Standard-Artikel:', error);
          }
        }
        
        let angebotsnummer = projekt?.angebotsnummer;
        if (!angebotsnummer) {
          try {
            angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
          } catch (error) {
            console.error('Fehler beim Generieren der Angebotsnummer:', error);
            // Fallback: Verwende Timestamp-basierte eindeutige Nummer
            const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
            angebotsnummer = `ANG-${laufnummer}`;
          }
        }
        
        // Übernehme Lieferadresse aus Projekt, falls vorhanden
        const lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
        const lieferadresseName = projekt?.lieferadresse ? projekt.kundenname : undefined;
        const lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
        const lieferadressePlzOrt = projekt?.lieferadresse 
          ? `${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`.trim()
          : undefined;
        
        setAngebotsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          angebotsnummer: angebotsnummer,
          angebotsdatum: projekt?.angebotsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          gueltigBis: gueltigBis.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          lieferadresseAbweichend: lieferadresseAbweichend,
          lieferadresseName: lieferadresseName,
          lieferadresseStrasse: lieferadresseStrasse,
          lieferadressePlzOrt: lieferadressePlzOrt,
        }));
      }
    };
    
    ladeGespeichertenEntwurf();
  }, [projekt?.$id]);

  // Angebotsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!angebotsDaten.angebotsnummer && !projekt?.angebotsnummer && !initialLaden) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('angebot');
          setAngebotsDaten(prev => ({ ...prev, angebotsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Angebotsnummer:', error);
          // Fallback: Verwende Timestamp-basierte eindeutige Nummer
          const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
          setAngebotsDaten(prev => ({ 
            ...prev, 
            angebotsnummer: `ANG-${laufnummer}` 
          }));
        }
      }
    };
    generiereNummer();
  }, [initialLaden]);

  // Auto-Save mit Debounce (nur für Entwürfe, nicht wenn Dokument hinterlegt ist)
  const speichereAutomatisch = useCallback(async (daten: AngebotsDaten) => {
    if (!projekt?.$id || initialLaden || gespeichertesDokument) return;
    
    try {
      setSpeicherStatus('speichern');
      await speichereEntwurf(projekt.$id, 'angebotsDaten', daten);
      setSpeicherStatus('gespeichert');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setSpeicherStatus('fehler');
    }
  }, [projekt?.$id, initialLaden, gespeichertesDokument]);

  // Debounced Auto-Save bei Änderungen (nur wenn noch kein Dokument hinterlegt)
  useEffect(() => {
    if (initialLaden || !hatGeaendert.current || gespeichertesDokument) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch(angebotsDaten);
    }, 1500); // 1.5 Sekunden Debounce
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [angebotsDaten, speichereAutomatisch, initialLaden, gespeichertesDokument]);

  // Dieselpreiszuschlag: Wenn aktiviert und noch kein Text gesetzt, automatisch Standardtext hinterlegen
  useEffect(() => {
    if (
      angebotsDaten.dieselpreiszuschlagAktiviert &&
      (!angebotsDaten.dieselpreiszuschlagText ||
        angebotsDaten.dieselpreiszuschlagText.trim().length === 0)
    ) {
      setAngebotsDaten(prev => ({
        ...prev,
        dieselpreiszuschlagText: DEFAULT_DIESELPREISZUSCHLAG_TEXT,
      }));
    }
  }, [angebotsDaten.dieselpreiszuschlagAktiviert, angebotsDaten.dieselpreiszuschlagText]);

  const handleInputChange = (field: keyof AngebotsDaten, value: any) => {
    hatGeaendert.current = true;
    setAngebotsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    hatGeaendert.current = true;
    const neuePositionen = [...angebotsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis = 
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setAngebotsDaten(prev => ({ ...prev, positionen: neuePositionen }));
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
    
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

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
      einkaufspreis: selectedArtikel.einkaufspreis, // Für DB1-Berechnung
      streichpreis: selectedArtikel.streichpreis,
      gesamtpreis: preis,
    };

    setAngebotsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));

    setShowArtikelAuswahl(false);
    setArtikelSuchtext('');
  };

  // Position aus Universal-Artikel hinzufügen
  const addPositionAusUniversalArtikel = (artikelId: string) => {
    hatGeaendert.current = true;
    const selectedArtikel = universalArtikel.find(a => a.$id === artikelId);
    if (!selectedArtikel) return;

    // Universal: Großhändlerpreis ist der Einkaufspreis (EK), Katalogpreis ist der Listenpreis
    const verkaufspreis = selectedArtikel.katalogPreisBrutto;
    const einkaufspreis = selectedArtikel.grosshaendlerPreisNetto;

    const neuePosition: Position = {
      id: Date.now().toString(),
      artikelnummer: selectedArtikel.artikelnummer,
      bezeichnung: selectedArtikel.bezeichnung,
      beschreibung: `Universal: ${selectedArtikel.verpackungseinheit}`,
      menge: 1,
      einheit: selectedArtikel.verpackungseinheit,
      einzelpreis: verkaufspreis,
      einkaufspreis: einkaufspreis, // Großhändlerpreis als EK für DB1
      gesamtpreis: verkaufspreis,
    };

    setAngebotsDaten(prev => ({
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
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  // @dnd-kit Sensors für Drag & Drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Mindestens 8px ziehen bevor Drag startet
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
      setAngebotsDaten(prev => {
        const oldIndex = prev.positionen.findIndex(p => p.id === active.id);
        const newIndex = prev.positionen.findIndex(p => p.id === over.id);
        return {
          ...prev,
          positionen: arrayMove(prev.positionen, oldIndex, newIndex),
        };
      });
    }
  };

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

  // Nur PDF generieren und herunterladen (ohne Speicherung)
  const generiereUndLadeAngebot = async () => {
    try {
      console.log('Generiere Angebot (nur Download)...', angebotsDaten);
      const pdf = await generiereAngebotPDF(angebotsDaten);
      pdf.save(`Angebot_${angebotsDaten.angebotsnummer}.pdf`);
      console.log('Angebot erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren des Angebots:', error);
      alert('Fehler beim Generieren des Angebots: ' + (error as Error).message);
    }
  };

  // PDF generieren und E-Mail-Formular öffnen
  const oeffneEmailMitAngebot = async () => {
    try {
      if (!angebotsDaten.angebotsnummer) {
        alert('Bitte geben Sie zuerst eine Angebotsnummer ein.');
        return;
      }

      // PDF generieren
      const pdf = await generiereAngebotPDF(angebotsDaten);
      setEmailPdf(pdf);
      setShowEmailFormular(true);
    } catch (error) {
      console.error('Fehler beim Generieren der PDF:', error);
      alert('Fehler beim Generieren der PDF: ' + (error as Error).message);
    }
  };

  // Callback für E-Mail-Versand: Projektstatus auf "angebot_versendet" setzen
  const handleEmailGesendet = async () => {
    if (!projekt?.$id) {
      console.warn('Kein Projekt vorhanden, kann Status nicht aktualisieren');
      return;
    }

    try {
      await projektService.updateProjektStatus(projekt.$id, 'angebot_versendet');
      console.log('Projektstatus erfolgreich auf "angebot_versendet" gesetzt');
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Projektstatus:', error);
      // Fehler wird nur geloggt, damit der E-Mail-Versand nicht blockiert wird
    }
  };

  // Speichern in Appwrite (mit Versionierung)
  const speichereUndHinterlegeAngebot = async () => {
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
        neuesDokument = await aktualisiereAngebot(
          gespeichertesDokument.$id!,
          gespeichertesDokument.dateiId,
          angebotsDaten,
          gespeichertesDokument.version || 1
        );
        setStatusMeldung({ typ: 'erfolg', text: `Angebot als Version ${neuesDokument.version} gespeichert!` });
      } else {
        // Neu erstellen
        neuesDokument = await speichereAngebot(projekt.$id, angebotsDaten);
        setStatusMeldung({ typ: 'erfolg', text: 'Angebot erfolgreich gespeichert und hinterlegt!' });
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

  const berechnung = berechneDokumentSummen(angebotsDaten.positionen);
  const frachtUndVerpackung = (angebotsDaten.frachtkosten || 0) + (angebotsDaten.verpackungskosten || 0);
  const gesamtBrutto = (berechnung.nettobetrag + frachtUndVerpackung) * 1.19;

  // DB1-Berechnung (intern - nur für UI, nicht im PDF)
  const db1Berechnung = (() => {
    let gesamtEK = 0;
    let positionenMitEK = 0;

    angebotsDaten.positionen.forEach(pos => {
      if (pos.einkaufspreis !== undefined && pos.einkaufspreis !== null) {
        gesamtEK += pos.einkaufspreis * pos.menge;
        positionenMitEK++;
      }
    });

    const db1 = berechnung.nettobetrag - gesamtEK;
    const db1Prozent = berechnung.nettobetrag > 0 ? (db1 / berechnung.nettobetrag) * 100 : 0;

    return {
      gesamtEK,
      db1,
      db1Prozent,
      positionenMitEK,
      allePositionenHabenEK: positionenMitEK === angebotsDaten.positionen.length && angebotsDaten.positionen.length > 0,
    };
  })();

  // Lade-Indikator
  if (initialLaden || ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-600 dark:text-dark-textMuted">Lade Angebotsdaten...</span>
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
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Angebot hinterlegt</h3>
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
                {gespeichertesDokument.bruttobetrag && (
                  <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                    Bruttobetrag: <strong>{gespeichertesDokument.bruttobetrag.toFixed(2)} €</strong>
                  </p>
                )}
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
                    Bearbeiten & neue Version
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
                <p className="text-xs text-amber-700 dark:text-amber-400">Änderungen werden als neue Version gespeichert. Alte Versionen bleiben erhalten.</p>
              </div>
              <button
                onClick={() => {
                  setIstBearbeitungsModus(false);
                  // Originaldaten wiederherstellen
                  if (gespeichertesDokument) {
                    const gespeicherteDaten = ladeDokumentDaten<AngebotsDaten>(gespeichertesDokument);
                    if (gespeicherteDaten) {
                      setAngebotsDaten(gespeicherteDaten);
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
            speicherStatus === 'gespeichert' ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400' :
            speicherStatus === 'speichern' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' :
            speicherStatus === 'fehler' ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400' :
            'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-dark-textMuted'
          }`}>
            {speicherStatus === 'gespeichert' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Automatisch gespeichert</span>
              </>
            )}
            {speicherStatus === 'speichern' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Speichern...</span>
              </>
            )}
            {speicherStatus === 'fehler' && (
              <>
                <CloudOff className="h-4 w-4" />
                <span>Fehler beim Speichern</span>
              </>
            )}
            {speicherStatus === 'idle' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Bereit</span>
              </>
            )}
          </div>
        )}
        
        {/* Angebotsinformationen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Angebotsinformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Angebotsnummer</label>
              <input
                type="text"
                value={angebotsDaten.angebotsnummer}
                onChange={(e) => handleInputChange('angebotsnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Angebotsdatum</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={angebotsDaten.angebotsdatum}
                  onChange={(e) => handleInputChange('angebotsdatum', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    const heute = new Date();
                    const gueltigBis = new Date(heute);
                    gueltigBis.setDate(gueltigBis.getDate() + 30);
                    handleInputChange('angebotsdatum', heute.toISOString().split('T')[0]);
                    handleInputChange('gueltigBis', gueltigBis.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Heute
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Gültig bis</label>
              <input
                type="date"
                value={angebotsDaten.gueltigBis}
                onChange={(e) => handleInputChange('gueltigBis', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
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
                  value={angebotsDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Kundenname</label>
              <input
                type="text"
                value={angebotsDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
              <input
                type="text"
                value={angebotsDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={angebotsDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Lieferadresse */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Lieferadresse</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={angebotsDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {angebotsDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Name</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Angebotspositionen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Angebotspositionen</h2>
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
                          onChange={(e) => setArtikelSortierung(e.target.value as any)}
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

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={angebotsDaten.positionen.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {angebotsDaten.positionen.map((position, index) => (
                  <SortablePosition key={position.id} id={position.id} accentColor="blue">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Artikel-Nr.</label>
                            <input
                              type="text"
                              value={position.artikelnummer || ''}
                              onChange={(e) => handlePositionChange(index, 'artikelnummer', e.target.value)}
                              placeholder="TM-001"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bezeichnung</label>
                            <input
                              type="text"
                              value={position.bezeichnung}
                              onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                              placeholder="z.B. Tennismehl / Ziegelmehl"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Menge</label>
                            <input
                              type="number"
                              value={position.menge}
                              onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einheit</label>
                            <input
                              type="text"
                              value={position.einheit}
                              onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Streichpreis (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={position.streichpreis ?? ''}
                              onChange={(e) => handlePositionChange(index, 'streichpreis', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="Optional"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                            {/* Streichpreis-Grund Dropdown - nur wenn Streichpreis gesetzt */}
                            {position.streichpreis && position.streichpreis > 0 && (
                              <select
                                value={position.streichpreisGrund || ''}
                                onChange={(e) => handlePositionChange(index, 'streichpreisGrund', e.target.value || undefined)}
                                className="w-full mt-1 px-2 py-1 text-xs border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-amber-50"
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
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einzelpreis (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={position.einzelpreis}
                              onChange={(e) => handlePositionChange(index, 'einzelpreis', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Beschreibung (optional)</label>
                          <textarea
                            value={position.beschreibung || ''}
                            onChange={(e) => handlePositionChange(index, 'beschreibung', e.target.value)}
                            placeholder="Detaillierte Beschreibung der Position..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => removePosition(index)}
                        className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-2 text-right">
                      <span className="text-sm text-gray-600 dark:text-dark-textMuted">Gesamtpreis: </span>
                      <span className="text-lg font-semibold text-gray-900 dark:text-dark-text">
                        {position.gesamtpreis.toFixed(2)} €
                      </span>
                    </div>
                  </SortablePosition>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Lieferbedingungen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Lieferbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Lieferzeit</label>
              <input
                type="text"
                value={angebotsDaten.lieferzeit || ''}
                onChange={(e) => handleInputChange('lieferzeit', e.target.value)}
                placeholder="z.B. 2-3 Werktage"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Frachtkosten (€)</label>
              <input
                type="number"
                step="0.01"
                value={angebotsDaten.frachtkosten || ''}
                onChange={(e) => handleInputChange('frachtkosten', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={angebotsDaten.lieferbedingungenAktiviert || false}
                onChange={(e) => handleInputChange('lieferbedingungenAktiviert', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">Lieferbedingungen / Hinweise anzeigen</span>
            </label>
            
            {angebotsDaten.lieferbedingungenAktiviert && (
              <textarea
                value={angebotsDaten.lieferbedingungen || ''}
                onChange={(e) => handleInputChange('lieferbedingungen', e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            )}
          </div>
        </div>

        {/* Liefersaison */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Liefersaison</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={angebotsDaten.liefersaisonAnzeigen || false}
                onChange={(e) => handleInputChange('liefersaisonAnzeigen', e.target.checked)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-600 dark:text-dark-textMuted">Liefersaison auf Angebot anzeigen</span>
            </label>
          </div>
          <p className="text-sm text-gray-500 dark:text-dark-textMuted">
            Wenn aktiviert, wird die Liefersaison (z.B. "KW 10 bis 12") auf dem Angebot gedruckt.
          </p>
        </div>

        {/* Dieselpreiszuschlag */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-start gap-3 mb-3">
            <input
              id="dieselpreiszuschlag"
              type="checkbox"
              checked={angebotsDaten.dieselpreiszuschlagAktiviert || false}
              onChange={(e) =>
                handleInputChange('dieselpreiszuschlagAktiviert', e.target.checked)
              }
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <label
                htmlFor="dieselpreiszuschlag"
                className="block text-sm font-medium text-gray-900 dark:text-dark-text"
              >
                Dieselpreiszuschlag im Angebot ausweisen
              </label>
              <p className="mt-1 text-xs text-gray-600 dark:text-dark-textMuted">
                Wenn aktiviert, wird im Angebot ein Hinweis zum Dieselpreiszuschlag mit
                folgendem Text aufgenommen. Der Text kann bei Bedarf angepasst werden.
              </p>
            </div>
          </div>

          {angebotsDaten.dieselpreiszuschlagAktiviert && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Text zum Dieselpreiszuschlag
              </label>
              <textarea
                value={angebotsDaten.dieselpreiszuschlagText || ''}
                onChange={(e) =>
                  handleInputChange('dieselpreiszuschlagText', e.target.value)
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          )}
        </div>

        {/* Zahlungsbedingungen */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Zahlungsbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Zahlungsziel</label>
              <select
                value={angebotsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
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
                  checked={angebotsDaten.skontoAktiviert || false}
                  onChange={(e) => handleInputChange('skontoAktiviert', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">Skonto aktivieren</span>
              </label>
              
              {angebotsDaten.skontoAktiviert && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Skonto %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={angebotsDaten.skonto?.prozent || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: parseFloat(e.target.value) || 0,
                        tage: angebotsDaten.skonto?.tage || 7
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Tage</label>
                    <input
                      type="number"
                      value={angebotsDaten.skonto?.tage || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: angebotsDaten.skonto?.prozent || 0,
                        tage: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
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
            value={angebotsDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 rounded-xl shadow-lg dark:shadow-dark-lg border border-blue-200 dark:border-blue-800 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4">Zusammenfassung</h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-dark-textMuted">Positionen:</span>
              <span className="font-medium text-gray-900 dark:text-dark-text">{angebotsDaten.positionen.length}</span>
            </div>

            <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-dark-textMuted">Nettobetrag:</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">{berechnung.nettobetrag.toFixed(2)} €</span>
              </div>

              {frachtUndVerpackung > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-dark-textMuted">Fracht/Verpackung:</span>
                  <span className="font-medium text-gray-900 dark:text-dark-text">{frachtUndVerpackung.toFixed(2)} €</span>
                </div>
              )}

              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-dark-textMuted">MwSt. (19%):</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">
                  {((berechnung.nettobetrag + frachtUndVerpackung) * 0.19).toFixed(2)} €
                </span>
              </div>

              <div className="border-t border-blue-200 dark:border-blue-800 pt-3 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-gray-900 dark:text-dark-text">Angebotssumme:</span>
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-400 break-all">
                    {gesamtBrutto.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>

            {/* DB1-Anzeige (INTERN - nicht im PDF) */}
            {db1Berechnung.positionenMitEK > 0 && (
              <div className="border-t-2 border-dashed border-amber-300 dark:border-amber-700 pt-3 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                    INTERN
                  </span>
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Deckungsbeitrag</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Einkauf (EK):</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{db1Berechnung.gesamtEK.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">DB1:</span>
                    <span className={`font-bold ${db1Berechnung.db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {db1Berechnung.db1.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">DB1-Marge:</span>
                    <span className={`font-bold ${db1Berechnung.db1Prozent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {db1Berechnung.db1Prozent.toFixed(1)} %
                    </span>
                  </div>
                  {!db1Berechnung.allePositionenHabenEK && (
                    <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      ⚠ Nur {db1Berechnung.positionenMitEK} von {angebotsDaten.positionen.length} Positionen haben EK-Preis
                    </div>
                  )}
                </div>
              </div>
            )}

            {angebotsDaten.skontoAktiviert && angebotsDaten.skonto && angebotsDaten.skonto.prozent > 0 && (
              <div className="border-t border-blue-200 dark:border-blue-800 pt-3 mt-3">
                <div className="text-sm text-gray-600 dark:text-dark-textMuted mb-1">
                  Bei Zahlung innerhalb von {angebotsDaten.skonto.tage} Tagen:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-dark-textMuted">Skonto ({angebotsDaten.skonto.prozent}%):</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {(gesamtBrutto * (1 - angebotsDaten.skonto.prozent / 100)).toFixed(2)} €
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
              <div className="text-sm text-gray-600 dark:text-dark-textMuted mb-1">
                Gültig bis: {new Date(angebotsDaten.gueltigBis).toLocaleDateString('de-DE')}
              </div>
            </div>
          </div>

          {/* Buttons basierend auf Status */}
          <div className="mt-6 space-y-3">
            {/* Immer verfügbar: Nur PDF generieren */}
            <button
              onClick={generiereUndLadeAngebot}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 border-2 border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all"
            >
              <Download className="h-5 w-5" />
              Nur PDF herunterladen
            </button>

            {/* E-Mail mit PDF öffnen */}
            <button
              onClick={oeffneEmailMitAngebot}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-all shadow-lg dark:shadow-dark-glow-blue hover:shadow-xl"
            >
              <Mail className="h-5 w-5" />
              E-Mail mit PDF öffnen
            </button>

            {/* Haupt-Aktion basierend auf Status */}
            {(!gespeichertesDokument || istBearbeitungsModus) && projekt?.$id && (
              <button
                onClick={speichereUndHinterlegeAngebot}
                disabled={ladeStatus === 'speichern'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-500 dark:to-cyan-500 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 dark:hover:from-blue-400 dark:hover:to-cyan-400 transition-all shadow-lg dark:shadow-dark-glow-blue hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ladeStatus === 'speichern' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5" />
                    {istBearbeitungsModus ? 'Als neue Version speichern' : 'Angebot speichern & hinterlegen'}
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
                dokumentTyp="angebot"
                titel="Angebot-Verlauf"
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
          dateiname={`Angebot_${angebotsDaten.angebotsnummer}.pdf`}
          dokumentTyp="angebot"
          dokumentNummer={angebotsDaten.angebotsnummer}
          kundenname={angebotsDaten.kundenname}
          kundennummer={angebotsDaten.kundennummer}
          onClose={() => {
            setShowEmailFormular(false);
            setEmailPdf(null);
          }}
          onSend={handleEmailGesendet}
        />
      )}
    </div>
  );
};

export default AngebotTab;
