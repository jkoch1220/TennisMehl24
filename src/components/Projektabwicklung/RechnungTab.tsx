import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, FileCheck, AlertCircle, CheckCircle2, Loader2, Lock, AlertTriangle, Cloud, CloudOff, Ban, RefreshCw, FileX, Mail, FileText } from 'lucide-react';
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
  ladePositionenVonVorherigem
} from '../../services/projektabwicklungDokumentService';
import { Projekt } from '../../types/projekt';
import { formatAdresszeile } from '../../services/pdfHelpers';
import DokumentVerlauf from './DokumentVerlauf';
import EmailFormular from './EmailFormular';
import jsPDF from 'jspdf';

interface RechnungTabProps {
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

const RechnungTab = ({ projekt, kundeInfo }: RechnungTabProps) => {
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
        
        // Übernehme Lieferadresse aus Projekt, falls vorhanden
        const lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
        const lieferadresseName = projekt?.lieferadresse ? projekt.kundenname : undefined;
        const lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
        const lieferadressePlzOrt = projekt?.lieferadresse
          ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
          : undefined;
        
        setRechnungsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: projekt?.ansprechpartner || kundeInfo?.ansprechpartner,
          rechnungsnummer: rechnungsnummer,
          rechnungsdatum: projekt?.rechnungsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          leistungsdatum: heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          lieferadresseAbweichend: lieferadresseAbweichend,
          lieferadresseName: lieferadresseName,
          lieferadresseStrasse: lieferadresseStrasse,
          lieferadressePlzOrt: lieferadressePlzOrt,
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

  const removePosition = (index: number) => {
    hatGeaendert.current = true;
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
    if (!projekt?.$id) return;
    
    try {
      // Neues Formular vorbereiten
      const neueNummer = await generiereNaechsteDokumentnummer('rechnung');
      
      setRechnungsDaten(prev => ({
        ...prev,
        rechnungsnummer: neueNummer,
        rechnungsdatum: new Date().toISOString().split('T')[0],
        leistungsdatum: new Date().toISOString().split('T')[0],
        // Positionen und andere Daten bleiben (können übernommen werden)
      }));
      
      // Reset der States
      setGespeichertesDokument(null);
      setNeueRechnungMoeglich(false);
      setVerlaufLadeZaehler(prev => prev + 1);
      
      setStatusMeldung({ 
        typ: 'erfolg', 
        text: `Neue Rechnungsnummer ${neueNummer} generiert. Bitte überprüfen Sie die Daten und finalisieren Sie die neue Rechnung.` 
      });
      
    } catch (error) {
      console.error('Fehler beim Starten der neuen Rechnung:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler: ' + (error as Error).message });
    }
  };

  const berechnung = berechneRechnungsSummen(rechnungsDaten.positionen);

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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Kundenname</label>
              <input
                type="text"
                value={rechnungsDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
              <input
                type="text"
                value={rechnungsDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={rechnungsDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Rechnungspositionen</h2>
            <button
              onClick={addPosition}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Position hinzufügen
            </button>
          </div>

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
                {rechnungsDaten.positionen.map((position, index) => (
                  <SortablePosition
                    key={position.id}
                    id={position.id}
                    disabled={!!gespeichertesDokument}
                    accentColor="red"
                  >
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
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bezeichnung</label>
                            <input
                              type="text"
                              value={position.bezeichnung}
                              onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                              placeholder="z.B. Tennismehl / Ziegelmehl"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Menge</label>
                            <NumericInput
                              value={position.menge}
                              onChange={(val) => handlePositionChange(index, 'menge', val)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einheit</label>
                            <input
                              type="text"
                              value={position.einheit}
                              onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
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
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Einzelpreis (€)</label>
                            <NumericInput
                              value={position.einzelpreis}
                              onChange={(val) => handlePositionChange(index, 'einzelpreis', val)}
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
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
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => removePosition(index)}
                        className="mt-7 p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 active:bg-red-100 dark:active:bg-red-900/50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Position löschen"
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
                <span className="text-gray-600 dark:text-dark-textMuted">MwSt. ({berechnung.umsatzsteuersatz}%):</span>
                <span className="font-medium text-gray-900 dark:text-dark-text">{berechnung.umsatzsteuer.toFixed(2)} €</span>
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

export default RechnungTab;
