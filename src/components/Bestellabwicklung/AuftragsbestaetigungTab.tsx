import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, Package, Search, FileCheck, Edit3, AlertCircle, CheckCircle2, Loader2, Cloud, CloudOff, Mail } from 'lucide-react';
import { AuftragsbestaetigungsDaten, Position, GespeichertesDokument } from '../../types/bestellabwicklung';
import { generiereAuftragsbestaetigungPDF } from '../../services/dokumentService';
import { berechneDokumentSummen } from '../../services/rechnungService';
import { getAlleArtikel } from '../../services/artikelService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  ladeDokumentNachTyp,
  speichereAuftragsbestaetigung,
  aktualisiereAuftragsbestaetigung,
  ladeDokumentDaten,
  getFileDownloadUrl,
  speichereEntwurf,
  ladeEntwurf,
  ladePositionenVonVorherigem
} from '../../services/bestellabwicklungDokumentService';
import { Artikel } from '../../types/artikel';
import { Projekt } from '../../types/projekt';
import DokumentVerlauf from './DokumentVerlauf';
import EmailFormular from './EmailFormular';
import jsPDF from 'jspdf';

interface AuftragsbestaetigungTabProps {
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

const AuftragsbestaetigungTab = ({ projekt, kundeInfo }: AuftragsbestaetigungTabProps) => {
  const [auftragsbestaetigungsDaten, setAuftragsbestaetigungsDaten] = useState<AuftragsbestaetigungsDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',
    
    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    auftragsbestaetigungsnummer: '',
    auftragsbestaetigungsdatum: new Date().toISOString().split('T')[0],
    
    positionen: [],
    zahlungsziel: '14 Tage',
    lieferbedingungenAktiviert: true,
    lieferbedingungen: 'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.',
  });
  
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [showArtikelAuswahl, setShowArtikelAuswahl] = useState(false);
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [artikelSortierung, setArtikelSortierung] = useState<'bezeichnung' | 'artikelnummer' | 'einzelpreis'>('bezeichnung');
  
  // Drag & Drop State für Positionen
  const [dragState, setDragState] = useState<{ draggedIndex: number | null; draggedOverIndex: number | null }>({
    draggedIndex: null,
    draggedOverIndex: null,
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
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'auftragsbestaetigung');
        
        if (dokument) {
          setGespeichertesDokument(dokument);
          // Lade gespeicherte Daten für Bearbeitung
          const gespeicherteDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(dokument);
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
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setAuftragsbestaetigungsDaten({
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
          // Kein finalisiertes Dokument - versuche Entwurf zu laden
          const entwurf = await ladeEntwurf<AuftragsbestaetigungsDaten>(projekt.$id, 'auftragsbestaetigungsDaten');
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
                ? `${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`.trim()
                : undefined);
            
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setAuftragsbestaetigungsDaten({
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

  // Auto-Save mit Debounce
  const speichereAutomatisch = useCallback(async (daten: AuftragsbestaetigungsDaten) => {
    if (!projekt?.$id || initialLaden.current || gespeichertesDokument) return;
    
    try {
      setAutoSaveStatus('speichern');
      await speichereEntwurf(projekt.$id, 'auftragsbestaetigungsDaten', daten);
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
      speichereAutomatisch(auftragsbestaetigungsDaten);
    }, 1500);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [auftragsbestaetigungsDaten, speichereAutomatisch, gespeichertesDokument]);

  // Auftragsbestätigungsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!auftragsbestaetigungsDaten.auftragsbestaetigungsnummer && !projekt?.auftragsbestaetigungsnummer && !gespeichertesDokument) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('auftragsbestaetigung');
          setAuftragsbestaetigungsDaten(prev => ({ ...prev, auftragsbestaetigungsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Auftragsbestätigungsnummer:', error);
          // Fallback: Verwende Timestamp-basierte eindeutige Nummer
          const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
          setAuftragsbestaetigungsDaten(prev => ({ 
            ...prev, 
            auftragsbestaetigungsnummer: `AB-${laufnummer}` 
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
        
        // AUTOMATISCH: Versuche Positionen vom vorherigen Dokument (Angebot) zu übernehmen
        let initialePositionen: Position[] = [];
        
        if (projekt?.$id) {
          const positionen = await ladePositionenVonVorherigem(projekt.$id, 'auftragsbestaetigung');
          if (positionen && positionen.length > 0) {
            initialePositionen = positionen as Position[];
            console.log('✅ Stückliste vom Angebot übernommen:', initialePositionen.length, 'Positionen');
          }
        }
        
        // Fallback: Wenn keine Positionen vom Angebot, versuche aus Projektdaten
        if (initialePositionen.length === 0) {
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
        }
        
        // Auftragsbestätigungsnummer generieren, falls nicht vorhanden
        let auftragsbestaetigungsnummer = projekt?.auftragsbestaetigungsnummer;
        if (!auftragsbestaetigungsnummer) {
          try {
            auftragsbestaetigungsnummer = await generiereNaechsteDokumentnummer('auftragsbestaetigung');
          } catch (error) {
            console.error('Fehler beim Generieren der Auftragsbestätigungsnummer:', error);
            // Fallback: Verwende Timestamp-basierte eindeutige Nummer
            const laufnummer = (Date.now() % 10000).toString().padStart(4, '0');
            auftragsbestaetigungsnummer = `AB-${laufnummer}`;
          }
        }
        
        // Übernehme Lieferadresse aus Projekt, falls vorhanden
        const lieferadresseAbweichend = projekt?.lieferadresse ? true : false;
        const lieferadresseName = projekt?.lieferadresse ? projekt.kundenname : undefined;
        const lieferadresseStrasse = projekt?.lieferadresse?.strasse || undefined;
        const lieferadressePlzOrt = projekt?.lieferadresse 
          ? `${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`.trim()
          : undefined;
        
        setAuftragsbestaetigungsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          auftragsbestaetigungsnummer: auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: projekt?.auftragsbestaetigungsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
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

  const handleInputChange = (field: keyof AuftragsbestaetigungsDaten, value: any) => {
    hatGeaendert.current = true;
    setAuftragsbestaetigungsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    hatGeaendert.current = true;
    const neuePositionen = [...auftragsbestaetigungsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };

    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis =
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setAuftragsbestaetigungsDaten(prev => ({ ...prev, positionen: neuePositionen }));
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
    
    setAuftragsbestaetigungsDaten(prev => ({
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
      streichpreis: selectedArtikel.streichpreis,
      gesamtpreis: preis,
    };
    
    setAuftragsbestaetigungsDaten(prev => ({
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
    setAuftragsbestaetigungsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  // Drag & Drop Handler für Positionen
  const handleDragStart = (index: number) => {
    setDragState({ draggedIndex: index, draggedOverIndex: null });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragState.draggedIndex !== null && dragState.draggedIndex !== index) {
      setDragState(prev => ({ ...prev, draggedOverIndex: index }));
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragState.draggedIndex === null || dragState.draggedIndex === dropIndex) {
      setDragState({ draggedIndex: null, draggedOverIndex: null });
      return;
    }

    hatGeaendert.current = true;
    const neuePositionen = [...auftragsbestaetigungsDaten.positionen];
    const [draggedPosition] = neuePositionen.splice(dragState.draggedIndex, 1);
    neuePositionen.splice(dropIndex, 0, draggedPosition);

    setAuftragsbestaetigungsDaten(prev => ({
      ...prev,
      positionen: neuePositionen
    }));
    setDragState({ draggedIndex: null, draggedOverIndex: null });
  };

  const handleDragEnd = () => {
    setDragState({ draggedIndex: null, draggedOverIndex: null });
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

  // Nur PDF generieren und herunterladen (ohne Speicherung)
  const generiereUndLadeAuftragsbestaetigung = async () => {
    try {
      console.log('Generiere Auftragsbestätigung (nur Download)...', auftragsbestaetigungsDaten);
      const pdf = await generiereAuftragsbestaetigungPDF(auftragsbestaetigungsDaten);
      pdf.save(`Auftragsbestaetigung_${auftragsbestaetigungsDaten.auftragsbestaetigungsnummer}.pdf`);
      console.log('Auftragsbestätigung erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren der Auftragsbestätigung:', error);
      alert('Fehler beim Generieren der Auftragsbestätigung: ' + (error as Error).message);
    }
  };

  // PDF generieren und E-Mail-Formular öffnen
  const oeffneEmailMitAuftragsbestaetigung = async () => {
    try {
      if (!auftragsbestaetigungsDaten.auftragsbestaetigungsnummer) {
        alert('Bitte geben Sie zuerst eine Auftragsbestätigungsnummer ein.');
        return;
      }

      // PDF generieren
      const pdf = await generiereAuftragsbestaetigungPDF(auftragsbestaetigungsDaten);
      setEmailPdf(pdf);
      setShowEmailFormular(true);
    } catch (error) {
      console.error('Fehler beim Generieren der PDF:', error);
      alert('Fehler beim Generieren der PDF: ' + (error as Error).message);
    }
  };

  // Speichern in Appwrite
  const speichereUndHinterlegeAuftragsbestaetigung = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }
    
    try {
      setLadeStatus('speichern');
      setStatusMeldung(null);
      
      let neuesDokument: GespeichertesDokument;
      
      if (gespeichertesDokument && istBearbeitungsModus) {
        // Aktualisieren
        neuesDokument = await aktualisiereAuftragsbestaetigung(
          gespeichertesDokument.$id!,
          gespeichertesDokument.dateiId,
          auftragsbestaetigungsDaten
        );
        setStatusMeldung({ typ: 'erfolg', text: 'Auftragsbestätigung erfolgreich aktualisiert!' });
      } else {
        // Neu erstellen
        neuesDokument = await speichereAuftragsbestaetigung(projekt.$id, auftragsbestaetigungsDaten);
        setStatusMeldung({ typ: 'erfolg', text: 'Auftragsbestätigung erfolgreich gespeichert und hinterlegt!' });
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

  const berechnung = berechneDokumentSummen(auftragsbestaetigungsDaten.positionen);
  const frachtUndVerpackung = (auftragsbestaetigungsDaten.frachtkosten || 0) + (auftragsbestaetigungsDaten.verpackungskosten || 0);
  const gesamtBrutto = (berechnung.nettobetrag + frachtUndVerpackung) * 1.19;

  // Zeige Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <span className="ml-3 text-gray-600">Lade Dokument...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* STATUS-BANNER: Bereits hinterlegtes Dokument */}
        {gespeichertesDokument && !istBearbeitungsModus && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <FileCheck className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-800">Auftragsbestätigung hinterlegt</h3>
                <p className="text-sm text-green-700 mt-1">
                  <strong>{gespeichertesDokument.dokumentNummer}</strong> wurde am{' '}
                  {gespeichertesDokument.$createdAt && new Date(gespeichertesDokument.$createdAt).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} gespeichert.
                </p>
                {gespeichertesDokument.bruttobetrag && (
                  <p className="text-sm text-green-700 mt-1">
                    Bruttobetrag: <strong>{gespeichertesDokument.bruttobetrag.toFixed(2)} €</strong>
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-4">
                  <a
                    href={getFileDownloadUrl(gespeichertesDokument.dateiId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    PDF herunterladen
                  </a>
                  <button
                    onClick={() => setIstBearbeitungsModus(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium"
                  >
                    <Edit3 className="h-4 w-4" />
                    Bearbeiten & neu speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bearbeitungs-Hinweis */}
        {istBearbeitungsModus && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Edit3 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Bearbeitungsmodus aktiv</p>
                <p className="text-xs text-amber-700">Änderungen werden nach dem Speichern die bestehende Auftragsbestätigung ersetzen.</p>
              </div>
              <button
                onClick={() => {
                  setIstBearbeitungsModus(false);
                  // Originaldaten wiederherstellen
                  if (gespeichertesDokument) {
                    const gespeicherteDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(gespeichertesDokument);
                    if (gespeicherteDaten) {
                      setAuftragsbestaetigungsDaten(gespeicherteDaten);
                    }
                  }
                }}
                className="ml-auto text-sm text-amber-700 hover:text-amber-900 underline"
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
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {statusMeldung.typ === 'erfolg' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            )}
            <p className={`text-sm ${statusMeldung.typ === 'erfolg' ? 'text-green-800' : 'text-red-800'}`}>
              {statusMeldung.text}
            </p>
          </div>
        )}

        {/* Auto-Save Status (nur wenn noch kein Dokument hinterlegt) */}
        {projekt?.$id && !gespeichertesDokument && (
          <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${
            autoSaveStatus === 'gespeichert' ? 'bg-green-50 text-green-700' :
            autoSaveStatus === 'speichern' ? 'bg-blue-50 text-blue-700' :
            autoSaveStatus === 'fehler' ? 'bg-red-50 text-red-700' :
            'bg-gray-50 text-gray-500'
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
        
        {/* Auftragsbestätigungsinformationen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Auftragsbestätigungsinformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auftragsbestätigungsnummer</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.auftragsbestaetigungsnummer}
                onChange={(e) => handleInputChange('auftragsbestaetigungsnummer', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
              <input
                type="date"
                value={auftragsbestaetigungsDaten.auftragsbestaetigungsdatum}
                onChange={(e) => handleInputChange('auftragsbestaetigungsdatum', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ihre Bestellnummer (optional)</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.kundennummerExtern || ''}
                onChange={(e) => handleInputChange('kundennummerExtern', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                placeholder="z.B. BEST-2024-123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Kundendaten */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Kundendaten</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kundennummer</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kundenname</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Lieferadresse */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Lieferadresse</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={auftragsbestaetigungsDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-600">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {auftragsbestaetigungsDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={auftragsbestaetigungsDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Positionen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Positionen</h2>
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
          {showArtikelAuswahl && (!gespeichertesDokument || istBearbeitungsModus) && (
            <div className="mb-4 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Artikel auswählen</h3>
                <button
                  onClick={() => {
                    setShowArtikelAuswahl(false);
                    setArtikelSuchtext('');
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Schließen
                </button>
              </div>

              {artikel.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Keine Artikel vorhanden. Legen Sie zuerst Artikel in der Artikelverwaltung an.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Suchfeld und Sortierung */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={artikelSuchtext}
                        onChange={(e) => setArtikelSuchtext(e.target.value)}
                        onKeyDown={handleArtikelSucheKeyDown}
                        placeholder="Artikel suchen (Bezeichnung, Art.-Nr., Beschreibung)..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                      />
                    </div>
                    <select
                      value={artikelSortierung}
                      onChange={(e) => setArtikelSortierung(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                    >
                      <option value="bezeichnung">Sortierung: Bezeichnung</option>
                      <option value="artikelnummer">Sortierung: Art.-Nr.</option>
                      <option value="einzelpreis">Sortierung: Preis</option>
                    </select>
                  </div>

                  {/* Artikel-Tabelle */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-96 overflow-y-auto">
                    {gefilterteArtikel.length === 0 ? (
                      <div className="p-4 text-center text-gray-600 text-sm">
                        Keine Artikel gefunden
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-purple-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Art.-Nr.</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Bezeichnung</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Beschreibung</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">Einheit</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Preis</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {gefilterteArtikel.map((art) => (
                            <tr key={art.$id} className="hover:bg-purple-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{art.artikelnummer}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{art.bezeichnung}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <div className="line-clamp-2 max-w-xs">{art.beschreibung || '-'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-center">{art.einheit}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                {art.einzelpreis !== undefined && art.einzelpreis !== null 
                                  ? `${art.einzelpreis.toFixed(2)} €` 
                                  : <span className="text-gray-400 italic text-xs">auf Anfrage</span>
                                }
                              </td>
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
                  <div className="text-xs text-gray-600 text-center">
                    {gefilterteArtikel.length} von {artikel.length} Artikel{artikel.length !== 1 ? 'n' : ''} angezeigt
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {auftragsbestaetigungsDaten.positionen.map((position, index) => (
              <div
                key={position.id}
                draggable={!gespeichertesDokument || istBearbeitungsModus}
                onDragStart={() => (!gespeichertesDokument || istBearbeitungsModus) && handleDragStart(index)}
                onDragOver={(e) => (!gespeichertesDokument || istBearbeitungsModus) && handleDragOver(e, index)}
                onDrop={(e) => (!gespeichertesDokument || istBearbeitungsModus) && handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-4 bg-gray-50 rounded-lg border border-gray-200 transition-all ${
                  (!gespeichertesDokument || istBearbeitungsModus) ? 'cursor-move' : ''
                } ${
                  dragState.draggedIndex === index ? 'opacity-50' : ''
                } ${
                  dragState.draggedOverIndex === index ? 'border-2 border-orange-500 shadow-lg' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Artikel-Nr.</label>
                        <input
                          type="text"
                          value={position.artikelnummer || ''}
                          onChange={(e) => handlePositionChange(index, 'artikelnummer', e.target.value)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          placeholder="TM-001"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bezeichnung</label>
                        <input
                          type="text"
                          value={position.bezeichnung}
                          onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          placeholder="z.B. Tennismehl / Ziegelmehl"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Menge</label>
                        <input
                          type="number"
                          value={position.menge}
                          onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label>
                        <input
                          type="text"
                          value={position.einheit}
                          onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Streichpreis (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={position.streichpreis ?? ''}
                          onChange={(e) => handlePositionChange(index, 'streichpreis', e.target.value ? parseFloat(e.target.value) : undefined)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          placeholder="Optional"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {/* Streichpreis-Grund Dropdown - nur wenn Streichpreis gesetzt */}
                        {position.streichpreis && position.streichpreis > 0 && (
                          <select
                            value={position.streichpreisGrund || ''}
                            onChange={(e) => handlePositionChange(index, 'streichpreisGrund', e.target.value || undefined)}
                            disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                            className="w-full mt-1 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-amber-50 disabled:bg-gray-100 disabled:text-gray-500"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Einzelpreis (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={position.einzelpreis}
                          onChange={(e) => handlePositionChange(index, 'einzelpreis', parseFloat(e.target.value) || 0)}
                          disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung (optional)</label>
                      <textarea
                        value={position.beschreibung || ''}
                        onChange={(e) => handlePositionChange(index, 'beschreibung', e.target.value)}
                        disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                        placeholder="Detaillierte Beschreibung der Position..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                  
                  {(!gespeichertesDokument || istBearbeitungsModus) && (
                    <button
                      onClick={() => removePosition(index)}
                      className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
                
                <div className="mt-2 text-right">
                  <span className="text-sm text-gray-600">Gesamtpreis: </span>
                  <span className="text-lg font-semibold text-gray-900">
                    {position.gesamtpreis.toFixed(2)} €
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lieferbedingungen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Lieferbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieferzeit</label>
              <input
                type="text"
                value={auftragsbestaetigungsDaten.lieferzeit || ''}
                onChange={(e) => handleInputChange('lieferzeit', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                placeholder="z.B. 2-3 Werktage"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frachtkosten (€)</label>
              <input
                type="number"
                step="0.01"
                value={auftragsbestaetigungsDaten.frachtkosten || ''}
                onChange={(e) => handleInputChange('frachtkosten', parseFloat(e.target.value) || 0)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={auftragsbestaetigungsDaten.lieferbedingungenAktiviert || false}
                onChange={(e) => handleInputChange('lieferbedingungenAktiviert', e.target.checked)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 disabled:opacity-50"
              />
              <span className="text-sm font-medium text-gray-700">Lieferbedingungen / Hinweise anzeigen</span>
            </label>
            
            {auftragsbestaetigungsDaten.lieferbedingungenAktiviert && (
              <textarea
                value={auftragsbestaetigungsDaten.lieferbedingungen || ''}
                onChange={(e) => handleInputChange('lieferbedingungen', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            )}
          </div>
        </div>

        {/* Zahlungsbedingungen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zahlungsbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel</label>
              <select
                value={auftragsbestaetigungsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
                  checked={auftragsbestaetigungsDaten.skontoAktiviert || false}
                  onChange={(e) => handleInputChange('skontoAktiviert', e.target.checked)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 disabled:opacity-50"
                />
                <span className="text-sm font-medium text-gray-700">Skonto aktivieren</span>
              </label>
              
              {auftragsbestaetigungsDaten.skontoAktiviert && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Skonto %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={auftragsbestaetigungsDaten.skonto?.prozent || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: parseFloat(e.target.value) || 0,
                        tage: auftragsbestaetigungsDaten.skonto?.tage || 7
                      })}
                      disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tage</label>
                    <input
                      type="number"
                      value={auftragsbestaetigungsDaten.skonto?.tage || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: auftragsbestaetigungsDaten.skonto?.prozent || 0,
                        tage: parseInt(e.target.value) || 0
                      })}
                      disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Bemerkung</h2>
          <textarea
            value={auftragsbestaetigungsDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            disabled={!!gespeichertesDokument && !istBearbeitungsModus}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl shadow-sm border border-orange-200 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zusammenfassung</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Positionen:</span>
              <span className="font-medium text-gray-900">{auftragsbestaetigungsDaten.positionen.length}</span>
            </div>
            
            <div className="border-t border-orange-200 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Nettobetrag:</span>
                <span className="font-medium text-gray-900">{berechnung.nettobetrag.toFixed(2)} €</span>
              </div>
              
              {frachtUndVerpackung > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Fracht/Verpackung:</span>
                  <span className="font-medium text-gray-900">{frachtUndVerpackung.toFixed(2)} €</span>
                </div>
              )}
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">MwSt. (19%):</span>
                <span className="font-medium text-gray-900">
                  {((berechnung.nettobetrag + frachtUndVerpackung) * 0.19).toFixed(2)} €
                </span>
              </div>
              
              <div className="border-t border-orange-200 pt-3 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-gray-900">Auftragssumme:</span>
                  <span className="text-3xl font-bold text-orange-600 break-all">
                    {gesamtBrutto.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>
            
            {auftragsbestaetigungsDaten.skontoAktiviert && auftragsbestaetigungsDaten.skonto && auftragsbestaetigungsDaten.skonto.prozent > 0 && (
              <div className="border-t border-orange-200 pt-3 mt-3">
                <div className="text-sm text-gray-600 mb-1">
                  Bei Zahlung innerhalb von {auftragsbestaetigungsDaten.skonto.tage} Tagen:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Skonto ({auftragsbestaetigungsDaten.skonto.prozent}%):</span>
                  <span className="font-semibold text-green-600">
                    {(gesamtBrutto * (1 - auftragsbestaetigungsDaten.skonto.prozent / 100)).toFixed(2)} €
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Buttons basierend auf Status */}
          <div className="mt-6 space-y-3">
            {/* Immer verfügbar: Nur PDF generieren */}
            <button
              onClick={generiereUndLadeAuftragsbestaetigung}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-700 border-2 border-orange-300 rounded-lg hover:bg-orange-50 transition-all"
            >
              <Download className="h-5 w-5" />
              Nur PDF herunterladen
            </button>
            
            {/* E-Mail mit PDF öffnen */}
            <button
              onClick={oeffneEmailMitAuftragsbestaetigung}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all shadow-lg hover:shadow-xl"
            >
              <Mail className="h-5 w-5" />
              E-Mail mit PDF öffnen
            </button>
            
            {/* Haupt-Aktion basierend auf Status */}
            {(!gespeichertesDokument || istBearbeitungsModus) && projekt?.$id && (
              <button
                onClick={speichereUndHinterlegeAuftragsbestaetigung}
                disabled={ladeStatus === 'speichern'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ladeStatus === 'speichern' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5" />
                    {istBearbeitungsModus ? 'Änderungen speichern' : 'AB speichern & hinterlegen'}
                  </>
                )}
              </button>
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
          
          {/* Dateiverlauf */}
          {projekt?.$id && (
            <div className="mt-6">
              <DokumentVerlauf
                projektId={projekt.$id}
                dokumentTyp="auftragsbestaetigung"
                titel="AB-Verlauf"
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
          dateiname={`Auftragsbestaetigung_${auftragsbestaetigungsDaten.auftragsbestaetigungsnummer}.pdf`}
          dokumentTyp="auftragsbestaetigung"
          dokumentNummer={auftragsbestaetigungsDaten.auftragsbestaetigungsnummer}
          kundenname={auftragsbestaetigungsDaten.kundenname}
          kundennummer={auftragsbestaetigungsDaten.kundennummer}
          onClose={() => {
            setShowEmailFormular(false);
            setEmailPdf(null);
          }}
        />
      )}
    </div>
  );
};

export default AuftragsbestaetigungTab;
