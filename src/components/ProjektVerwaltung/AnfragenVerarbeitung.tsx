/**
 * AnfragenVerarbeitung Component
 *
 * Zeigt eingehende E-Mail-Anfragen als Todo-Liste an.
 * Ermöglicht das Verarbeiten, Erstellen von Angeboten und Versenden von E-Mails.
 *
 * Features:
 * - Lädt Anfragen aus Appwrite (synchronisiert durch Netlify Function)
 * - Ein-Klick-Bestätigen: Kunde + Projekt + Angebot + E-Mail
 * - Bearbeitungsmöglichkeit vor dem Senden
 * - Sync-Button zum manuellen Abrufen neuer E-Mails
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  User,
  MapPin,
  Package,
  Send,
  X,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  Building2,
  CheckSquare,
  AlertTriangle,
  UserPlus,
  Search,
  Eye,
  Bot,
  Download,
  Truck,
} from 'lucide-react';
import { VerarbeiteteAnfrage, Anfrage } from '../../types/anfragen';
import { Position, AngebotsDaten } from '../../types/projektabwicklung';
import {
  parseWebformularAnfrage,
  generiereAngebotsEmailMitSignatur,
  berechneEmpfohlenenPreis,
} from '../../services/anfrageParserService';
import { generiereStandardEmail } from '../../utils/emailHelpers';
import { anfragenService } from '../../services/anfragenService';
import { ladeAlleEmailProtokolle, wrapInEmailTemplate, sendeEmail, pdfZuBase64 } from '../../services/emailSendService';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { getStammdatenOderDefault } from '../../services/stammdatenService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  verarbeiteAnfrageVollstaendig,
  erstelleStandardPositionen,
  erstelleAnfragePositionen,
  generiereAngebotsVorschauPDF,
  VerarbeitungsFortschritt,
  VerarbeitungsSchritt,
} from '../../services/anfrageVerarbeitungService';
import { istBeiladung } from '../../constants/artikelPreise';
import { claudeAnfrageService } from '../../services/claudeAnfrageService';
import { berechneFremdlieferungRoute, formatZeit } from '../../utils/routeCalculation';
import { FremdlieferungStammdaten, FremdlieferungRoutenBerechnung } from '../../types';

// Konstanten für Fremdlieferung (LKW)
const FREMDLIEFERUNG_STUNDENLOHN = 108; // €/Stunde
const BELADUNGSZEIT_MINUTEN = 30;
const ABLADUNGSZEIT_MINUTEN = 30;
const START_PLZ = '97828'; // Marktheidenfeld

// Standard-Absender für Angebote
const DEFAULT_ABSENDER_EMAIL = 'anfrage@tennismehl.com';

// Test-E-Mail-Adresse
const TEST_EMAIL_ADDRESS = 'jtatwcook@gmail.com';

interface BearbeitbareDaten {
  kundenname: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  strasse: string;
  plz: string;
  ort: string;
  // Einzelne Tonnen-Felder für präzise Kalkulation
  tonnenLose02: number;
  tonnenGesackt02: number;
  tonnenLose03: number;
  tonnenGesackt03: number;
  menge: number; // Gesamtmenge (berechnet)
  preisProTonne: number;
  frachtkosten: number;
  emailBetreff: string;
  emailText: string;
}

interface AnfragenVerarbeitungProps {
  onAnfrageGenehmigt?: (projektId: string) => void;
}

// Info über eine versendete Antwort-E-Mail
interface AntwortInfo {
  gesendetAm: string;
  projektId: string;
  dokumentNummer: string;
}

const AnfragenVerarbeitung = ({ onAnfrageGenehmigt }: AnfragenVerarbeitungProps) => {
  const navigate = useNavigate();
  const [anfragen, setAnfragen] = useState<VerarbeiteteAnfrage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnfrage, setSelectedAnfrage] = useState<VerarbeiteteAnfrage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testSentSuccess, setTestSentSuccess] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [runningAiAnalysis, setRunningAiAnalysis] = useState(false);
  const [aiAnalyseVerfuegbar] = useState(() => claudeAnfrageService.isAvailable());
  // Map: E-Mail-Adresse -> Liste der Antworten mit Zeitpunkt und Projekt-ID
  const [antwortDaten, setAntwortDaten] = useState<Map<string, AntwortInfo[]>>(new Map());
  const [fortschrittListe, setFortschrittListe] = useState<VerarbeitungsFortschritt[]>([]);
  const [showFortschritt, setShowFortschritt] = useState(false);
  const [zeigeBeantwortet, setZeigeBeantwortet] = useState(false); // Toggle für bereits beantwortete

  // Bearbeitbare Daten für das Detail-Panel
  const [editedData, setEditedData] = useState<BearbeitbareDaten | null>(null);

  // Kunden-Auswahl
  const [showKundenAuswahl, setShowKundenAuswahl] = useState(false);
  const [kundenSuche, setKundenSuche] = useState('');
  const [existierendeKunden, setExistierendeKunden] = useState<SaisonKunde[]>([]);
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);

  // Lieferkosten-Berechnung
  const [lieferkostenBerechnung, setLieferkostenBerechnung] = useState<{
    isLoading: boolean;
    ergebnis: FremdlieferungRoutenBerechnung | null;
    plz: string | null;
    tonnage: number;
  }>({ isLoading: false, ergebnis: null, plz: null, tonnage: 0 });

  // Lade existierende Kunden für Zuordnung
  useEffect(() => {
    const ladeKunden = async () => {
      try {
        const kunden = await saisonplanungService.loadAlleKunden();
        setExistierendeKunden(kunden);
      } catch (error) {
        console.error('Fehler beim Laden der Kunden:', error);
      }
    };
    ladeKunden();
  }, []);

  // Lade E-Mail-Protokoll für Duplikat-Erkennung (mit Zeitpunkten und Projekt-IDs!)
  const ladeBereitsBeantwortet = useCallback(async () => {
    try {
      const protokoll = await ladeAlleEmailProtokolle(500);
      // Map: E-Mail-Adresse (lowercase) -> Liste der Antworten mit Details
      const datenMap = new Map<string, AntwortInfo[]>();

      protokoll.forEach((p) => {
        if (p.dokumentTyp === 'angebot' && p.empfaenger && p.gesendetAm) {
          // Extrahiere die echte E-Mail (falls Test-Mode aktiv war)
          const match = p.empfaenger.match(/Original:\s*([^\s)]+)/);
          const email = (match ? match[1] : p.empfaenger).toLowerCase();

          // Füge die Antwort-Info zur Liste hinzu
          const bisherige = datenMap.get(email) || [];
          bisherige.push({
            gesendetAm: p.gesendetAm,
            projektId: p.projektId,
            dokumentNummer: p.dokumentNummer,
          });
          datenMap.set(email, bisherige);
        }
      });

      setAntwortDaten(datenMap);
    } catch (error) {
      console.error('Fehler beim Laden der beantworteten E-Mails:', error);
    }
  }, []);

  // Sync E-Mails von IMAP zu Appwrite
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ neu: number; duplikate: number } | null>(null);

  const syncEmails = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const apiUrl = import.meta.env.DEV
        ? 'http://localhost:8888/.netlify/functions/email-sync'
        : '/.netlify/functions/email-sync';

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.success) {
        console.log('📧 Sync Ergebnis:', data);
        console.log(`   - E-Mails im Postfach: ${data.emailsGefunden}`);
        console.log(`   - Davon von mail@tennismehl.com: ${data.webformularAnfragen}`);
        console.log(`   - Neu gespeichert: ${data.neueSpeicherungen}`);
        console.log(`   - Bereits vorhanden: ${data.duplikate}`);
        setSyncResult({ neu: data.neueSpeicherungen, duplikate: data.duplikate });

        // Zeige Warnung wenn keine E-Mails gefunden
        if (data.emailsGefunden === 0) {
          alert('Keine E-Mails im Postfach gefunden. Prüfe ob anfrage@tennismehl.com erreichbar ist.');
        } else if (data.webformularAnfragen === 0) {
          alert(`${data.emailsGefunden} E-Mails gefunden, aber keine davon von mail@tennismehl.com`);
        }

        // Lade Anfragen neu nach Sync
        await loadAnfragenAusAppwrite();
      } else {
        console.error('Sync fehlgeschlagen:', data);
        alert(`Sync fehlgeschlagen: ${data.error || data.message}\n\nDetails: ${JSON.stringify(data, null, 2)}`);
      }
    } catch (error) {
      console.error('Sync Fehler:', error);
      alert('Fehler beim Synchronisieren der E-Mails');
    } finally {
      setSyncing(false);
    }
  }, []);

  // Konvertiere Anfrage aus DB zu VerarbeiteteAnfrage
  const konvertiereZuVerarbeiteteAnfrage = (anfrage: Anfrage): VerarbeiteteAnfrage => {
    const extrahiert = anfrage.extrahierteDaten || {};

    // Parse Webformular-Daten aus emailText (immer, da alte Daten falsch sein können!)
    const analyse = parseWebformularAnfrage(anfrage.emailText);

    // WICHTIG: Vereinsname hat IMMER Priorität über persönlichen Namen!
    // 1. Zuerst prüfen ob vereinsname im Parse-Ergebnis (aus emailText)
    // 2. Dann prüfen ob vereinsname in extrahierteDaten (aus DB)
    // 3. Fallback auf extrahiert.kundenname (aber nur wenn es nicht Vorname/Nachname ist)
    // 4. Letzter Fallback: Vorname Nachname kombiniert
    let kundenname: string;

    if (analyse.kontakt.vereinsname && analyse.kontakt.vereinsname.length > 2) {
      // Vereinsname aus dem E-Mail-Text hat höchste Priorität!
      kundenname = analyse.kontakt.vereinsname;
    } else if (extrahiert.vereinsname && extrahiert.vereinsname.length > 2) {
      // Vereinsname aus extrahierten Daten
      kundenname = extrahiert.vereinsname;
    } else if (extrahiert.kundenname && extrahiert.kundenname.length > 2) {
      // Kundenname aus DB - aber prüfen ob es nicht Vor/Nachname ist
      const istNurVorname = extrahiert.kundenname === extrahiert.vorname;
      const istNurNachname = extrahiert.kundenname === extrahiert.nachname;
      if (!istNurVorname && !istNurNachname) {
        kundenname = extrahiert.kundenname;
      } else {
        // Es ist nur Vor- oder Nachname, also kombinieren
        kundenname = `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() || 'Unbekannt';
      }
    } else {
      // Fallback: Vorname Nachname
      kundenname = `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() || 'Unbekannt';
    }

    // Ansprechpartner: Immer Vorname + Nachname (nicht der Kundenname!)
    const ansprechpartner = (analyse.kontakt.vorname || analyse.kontakt.nachname)
      ? `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim()
      : extrahiert.ansprechpartner || undefined;

    // WICHTIG: Parser-Werte haben PRIORITÄT über DB-Werte!
    // Der Parser wurde gefixt, aber alte DB-Daten könnten falsche Werte enthalten.
    // Nur wenn der Parser keinen Wert findet (undefined), nutze DB als Fallback.
    const tonnenLose02 = analyse.bestellung.tonnenLose02 ?? extrahiert.tonnenLose02;
    const tonnenGesackt02 = analyse.bestellung.tonnenGesackt02 ?? extrahiert.tonnenGesackt02;
    const tonnenLose03 = analyse.bestellung.tonnenLose03 ?? extrahiert.tonnenLose03;
    const tonnenGesackt03 = analyse.bestellung.tonnenGesackt03 ?? extrahiert.tonnenGesackt03;

    // Berechne Gesamtmenge korrekt aus allen Feldern
    const berechneteGesamtmenge =
      (tonnenLose02 || 0) +
      (tonnenGesackt02 || 0) +
      (tonnenLose03 || 0) +
      (tonnenGesackt03 || 0);

    // Verwende berechnete Menge, fallback auf extrahierte Menge, dann Parser-Menge
    const menge = berechneteGesamtmenge > 0
      ? berechneteGesamtmenge
      : (extrahiert.menge || analyse.bestellung.mengeGesamt || 0);

    const analysiert = {
      kundenname,
      ansprechpartner,
      email: extrahiert.email || analyse.kontakt.email || anfrage.emailAbsender,
      telefon: extrahiert.telefon || analyse.kontakt.telefon,
      strasse: extrahiert.strasse || analyse.kontakt.strasse,
      plzOrt: `${extrahiert.plz || analyse.kontakt.plz || ''} ${extrahiert.ort || analyse.kontakt.ort || ''}`.trim(),
      plz: extrahiert.plz || analyse.kontakt.plz,
      ort: extrahiert.ort || analyse.kontakt.ort,
      anzahlPlaetze: analyse.bestellung.anzahlPlaetze,
      // Einzelne Tonnen-Felder
      tonnenLose02,
      tonnenGesackt02,
      tonnenLose03,
      tonnenGesackt03,
      menge, // Gesamtmenge
      artikel: extrahiert.artikel || analyse.bestellung.artikel || 'Tennismehl 0/2 mm',
      koernung: analyse.bestellung.koernung || '0/2',
      lieferart: analyse.bestellung.lieferart || 'lose',
    };

    const mengeGesamt = analysiert.menge || 3;
    const plz = analysiert.plz || '97000';
    const koernung = analysiert.koernung || '0-2';
    const lieferart = (analysiert.lieferart === 'gesackt' ? 'gesackt' : 'lose') as 'lose' | 'gesackt';

    // berechneEmpfohlenenPreis returns number | null (Preis pro Tonne)
    const preisProTonne = berechneEmpfohlenenPreis(plz, mengeGesamt, koernung, lieferart) || 98;

    // Erstelle Positionen
    const positionenRaw = erstelleStandardPositionen(mengeGesamt, preisProTonne, analysiert.artikel, koernung, lieferart);

    // Konvertiere zu Angebotsvorschlag-Format
    const positionen = positionenRaw.map(pos => ({
      artikelbezeichnung: pos.bezeichnung || 'Tennismehl',
      menge: pos.menge,
      einheit: pos.einheit,
      einzelpreis: pos.einzelpreis,
      gesamtpreis: pos.gesamtpreis,
    }));

    // Standard E-Mail-Vorschlag
    const emailKundenname = analysiert.kundenname || 'Kunde';
    const saisonJahr = new Date().getFullYear();

    // Name für Anrede: Ansprechpartner oder Kundenname
    // Bereinige und formatiere den Namen korrekt
    const rohName = (analysiert.ansprechpartner || analysiert.kundenname || '').trim();

    // Formatiere Name: Entferne doppelte Leerzeichen, kapitalisiere richtig
    const formatiereNamen = (name: string): string => {
      if (!name) return '';
      return name
        .replace(/\s+/g, ' ')  // Mehrere Leerzeichen zu einem
        .trim()
        .split(' ')
        .map(teil => teil.charAt(0).toUpperCase() + teil.slice(1).toLowerCase())
        .join(' ');
    };

    const formatierterName = formatiereNamen(rohName);

    // Anrede: "Guten Tag Vorname Nachname," oder "Guten Tag," wenn kein Name
    const anrede = formatierterName ? `Guten Tag ${formatierterName}` : 'Guten Tag';

    return {
      ...anfrage,
      analysiert,
      angebotsvorschlag: {
        positionen,
        empfohlenerPreisProTonne: preisProTonne,
        frachtkosten: 0, // Wird separat berechnet
        summeNetto: mengeGesamt * preisProTonne,
      },
      emailVorschlag: {
        betreff: `Angebot Tennismehl ${emailKundenname} ${saisonJahr}`,
        text: `${anrede},

vielen Dank für Ihre Anfrage – das Angebot finden Sie im Anhang.

Bei Fragen sind wir gerne für Sie da.`,
        empfaenger: analysiert.email || anfrage.emailAbsender,
      },
      verarbeitungsStatus: anfrage.status === 'neu' ? 'ausstehend' : 'genehmigt',
    };
  };

  // Extrahiere Nachricht aus E-Mail-Text
  const extrahiereNachricht = (emailText: string): string | undefined => {
    // Suche nach "Nachricht:" Feld
    const match = emailText.match(/Nachricht\s*[*:]?\s*[:=]?\s*(.+?)(?=\n[A-Za-zÄÖÜäöü]+\s*[*:]|Datenschutz|$)/is);
    if (match && match[1]) {
      const nachricht = match[1].trim();
      // Ignoriere leere Nachrichten oder nur Whitespace
      if (nachricht && nachricht.length > 2 && nachricht !== '-') {
        return nachricht;
      }
    }
    return undefined;
  };

  // Lade Anfragen aus Appwrite
  const loadAnfragenAusAppwrite = useCallback(async () => {
    setLoading(true);
    try {
      await ladeBereitsBeantwortet();

      console.log('📧 Lade Anfragen aus Appwrite...');

      // Lade alle neuen Anfragen aus Appwrite
      const alleAnfragen = await anfragenService.loadAlleAnfragen();
      console.log(`📧 ${alleAnfragen.length} Anfragen in Appwrite gefunden`);

      // Konvertiere zu VerarbeiteteAnfrage
      const verarbeitete: VerarbeiteteAnfrage[] = alleAnfragen.map(konvertiereZuVerarbeiteteAnfrage);

      // Sortiere nach Datum (neueste zuerst)
      verarbeitete.sort((a, b) => new Date(b.emailDatum).getTime() - new Date(a.emailDatum).getTime());

      setAnfragen(verarbeitete);

      // Analysiere Nachrichten im Hintergrund mit Claude
      if (claudeAnfrageService.isAvailable()) {
        for (const anfrage of verarbeitete) {
          const nachricht = extrahiereNachricht(anfrage.emailText);
          if (nachricht && !anfrage.notizen) {
            console.log(`🤖 Analysiere Nachricht für ${anfrage.analysiert.kundenname}...`);
            try {
              const analyse = await claudeAnfrageService.analysiereNachricht(nachricht);
              if (analyse.notizen) {
                // Update die Anfrage mit den Notizen
                anfrage.notizen = analyse.notizen;
                // Trigger re-render
                setAnfragen(prev => [...prev]);
                console.log(`✅ Notizen erstellt: ${analyse.notizen}`);
              }
            } catch (error) {
              console.warn('Nachricht-Analyse fehlgeschlagen:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Anfragen:', error);
      setAnfragen([]);
    } finally {
      setLoading(false);
    }
  }, [ladeBereitsBeantwortet]);

  // Alias für loadAnfragen (für Kompatibilität)
  const loadAnfragen = loadAnfragenAusAppwrite;

  useEffect(() => {
    loadAnfragen();
  }, [loadAnfragen]);

  // Wenn Anfrage ausgewählt wird, initialisiere bearbeitbare Daten
  useEffect(() => {
    if (selectedAnfrage) {
      const a = selectedAnfrage.analysiert;
      const empfohlenerPreis = selectedAnfrage.angebotsvorschlag.empfohlenerPreisProTonne || 85;

      // Extrahiere einzelne Tonnen-Felder
      const tonnenLose02 = a.tonnenLose02 || 0;
      const tonnenGesackt02 = a.tonnenGesackt02 || 0;
      const tonnenLose03 = a.tonnenLose03 || 0;
      const tonnenGesackt03 = a.tonnenGesackt03 || 0;

      // Berechne Gesamtmenge
      const berechneteGesamtmenge = tonnenLose02 + tonnenGesackt02 + tonnenLose03 + tonnenGesackt03;
      const menge = berechneteGesamtmenge > 0 ? berechneteGesamtmenge : (a.menge || 0);

      // Setze initiale Daten
      setEditedData({
        kundenname: a.kundenname || '',
        ansprechpartner: a.ansprechpartner || '',
        email: a.email || '',
        telefon: a.telefon || '',
        strasse: a.strasse || '',
        plz: a.plz || '',
        ort: a.ort || '',
        tonnenLose02,
        tonnenGesackt02,
        tonnenLose03,
        tonnenGesackt03,
        menge,
        preisProTonne: empfohlenerPreis,
        frachtkosten: 0,
        emailBetreff: selectedAnfrage.emailVorschlag.betreff,
        emailText: selectedAnfrage.emailVorschlag.text,
      });
      setSelectedKundeId(null);
      setFortschrittListe([]);
      setShowFortschritt(false);

      // Lade E-Mail mit Signatur aus Stammdaten (async)
      generiereAngebotsEmailMitSignatur(a.kundenname || '', a.ansprechpartner).then((result) => {
        setEditedData((prev) =>
          prev
            ? {
                ...prev,
                emailBetreff: result.betreff,
                emailText: result.text,
              }
            : prev
        );
      });
    }
  }, [selectedAnfrage]);

  // Lieferkosten berechnen wenn PLZ oder Tonnage sich ändern
  useEffect(() => {
    if (!editedData || !editedData.plz || editedData.plz.length < 5) {
      setLieferkostenBerechnung({ isLoading: false, ergebnis: null, plz: null, tonnage: 0 });
      return;
    }

    const plz = editedData.plz;
    const tonnage = editedData.menge || 0;

    // Nur neu berechnen wenn sich PLZ oder Tonnage geändert haben
    if (plz === lieferkostenBerechnung.plz && tonnage === lieferkostenBerechnung.tonnage && lieferkostenBerechnung.ergebnis) {
      return;
    }

    // Nur bei losem Material Lieferkosten berechnen (LKW-Transport)
    const hatLosesMaterial = (editedData.tonnenLose02 || 0) + (editedData.tonnenLose03 || 0) > 0;
    if (!hatLosesMaterial && tonnage <= 0) {
      setLieferkostenBerechnung({ isLoading: false, ergebnis: null, plz, tonnage });
      return;
    }

    const berechneLieferkosten = async () => {
      setLieferkostenBerechnung(prev => ({ ...prev, isLoading: true, plz, tonnage }));

      try {
        // Fremdlieferung-Stammdaten mit 108€ Stundensatz
        const fremdlieferungStammdaten: FremdlieferungStammdaten = {
          stundenlohn: FREMDLIEFERUNG_STUNDENLOHN,
          durchschnittsgeschwindigkeit: 60.0,
          beladungszeit: BELADUNGSZEIT_MINUTEN,
          abladungszeit: ABLADUNGSZEIT_MINUTEN,
          anzahlAbladestellen: 1,
          pausenzeit: 45, // EU-Verordnung
          lkwLadungInTonnen: tonnage,
        };

        const ergebnis = await berechneFremdlieferungRoute(START_PLZ, plz, fremdlieferungStammdaten);

        // Berechne empfohlenen Preis pro Tonne (Werkspreis + Lieferkosten/Menge)
        const werkspreis = 95.75; // Werkspreis für loses Material
        const lieferkostenProTonne = tonnage > 0 ? ergebnis.lohnkosten / tonnage : 0;
        const empfohlenerPreisProTonne = Math.round((werkspreis + lieferkostenProTonne) * 100) / 100;

        // Setze die berechneten Frachtkosten UND den empfohlenen Preis/Tonne automatisch
        setEditedData(prev => prev ? {
          ...prev,
          frachtkosten: Math.round(ergebnis.lohnkosten * 100) / 100,
          preisProTonne: empfohlenerPreisProTonne,
        } : prev);
        setLieferkostenBerechnung({ isLoading: false, ergebnis, tonnage, plz });
      } catch (error) {
        console.error('Fehler bei Lieferkosten-Berechnung:', error);
        setLieferkostenBerechnung(prev => ({ ...prev, isLoading: false, ergebnis: null }));
      }
    };

    // Debounce die Berechnung um 500ms
    const timeout = setTimeout(berechneLieferkosten, 500);
    return () => clearTimeout(timeout);
  }, [editedData?.plz, editedData?.menge, editedData?.tonnenLose02, editedData?.tonnenLose03]);

  // KI-Analyse Handler
  const handleKiAnalyse = async () => {
    if (!selectedAnfrage || !editedData) return;

    setRunningAiAnalysis(true);

    try {
      const analyse = await claudeAnfrageService.analysiereAnfrage({
        emailText: selectedAnfrage.emailText,
        emailBetreff: selectedAnfrage.emailBetreff,
        absenderEmail: selectedAnfrage.emailAbsender,
        absenderName: selectedAnfrage.analysiert.ansprechpartner,
        extrahiert: {
          kundenname: editedData.kundenname,
          ansprechpartner: editedData.ansprechpartner,
          strasse: editedData.strasse,
          plz: editedData.plz,
          ort: editedData.ort,
          telefon: editedData.telefon,
          menge: editedData.menge,
          artikel: selectedAnfrage.analysiert?.artikel,
          koernung: selectedAnfrage.analysiert?.koernung,
          lieferart: selectedAnfrage.analysiert?.lieferart,
          anzahlPlaetze: selectedAnfrage.analysiert?.anzahlPlaetze,
        },
      });

      console.log('✅ KI-Analyse abgeschlossen:', analyse);

      // Update editedData mit den KI-Ergebnissen
      setEditedData({
        ...editedData,
        kundenname: analyse.kunde.name || editedData.kundenname,
        ansprechpartner: analyse.kunde.ansprechpartner || editedData.ansprechpartner,
        email: analyse.kunde.email || editedData.email,
        telefon: analyse.kunde.telefon || editedData.telefon,
        strasse: analyse.kunde.adresse.strasse || editedData.strasse,
        plz: analyse.kunde.adresse.plz || editedData.plz,
        ort: analyse.kunde.adresse.ort || editedData.ort,
        menge: analyse.angebot.menge || editedData.menge,
        preisProTonne: analyse.angebot.empfohlenerPreis || editedData.preisProTonne,
        frachtkosten: analyse.angebot.frachtkosten || editedData.frachtkosten,
        emailBetreff: analyse.email.betreff || editedData.emailBetreff,
        emailText: analyse.email.volltext || editedData.emailText,
      });

      // Zeige Qualitätshinweise
      if (analyse.qualitaet.hinweise.length > 0) {
        console.log('📋 Qualitätshinweise:', analyse.qualitaet.hinweise);
      }

      alert(
        `KI-Analyse abgeschlossen!\n\nDatenqualität: ${analyse.qualitaet.datenVollstaendigkeit}%\nTyp: ${analyse.qualitaet.anfrageTyp}\nPriorität: ${analyse.qualitaet.prioritaet}${
          analyse.qualitaet.hinweise.length > 0
            ? '\n\nHinweise:\n- ' + analyse.qualitaet.hinweise.join('\n- ')
            : ''
        }`
      );
    } catch (error) {
      console.error('Fehler bei KI-Analyse:', error);
      alert(`KI-Analyse fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setRunningAiAnalysis(false);
    }
  };

  // PDF Vorschau Handler
  const handlePdfVorschau = async () => {
    if (!editedData || !selectedAnfrage) return;

    setGeneratingPreview(true);

    try {
      // Erstelle Positionen mit neuer Funktion (Preis inkl. Lieferkosten!)
      const positionenErgebnis = await erstelleAnfragePositionen({
        tonnenLose02: editedData.tonnenLose02,
        tonnenGesackt02: editedData.tonnenGesackt02,
        tonnenLose03: editedData.tonnenLose03,
        tonnenGesackt03: editedData.tonnenGesackt03,
        menge: editedData.menge,
        plz: editedData.plz,
        preisProTonneInklLieferung: editedData.preisProTonne,
      });

      // Generiere PDF Vorschau (OHNE separate Frachtkosten - sind im Preis/t enthalten!)
      const pdfUrl = await generiereAngebotsVorschauPDF({
        kundenDaten: {
          name: editedData.kundenname,
          strasse: editedData.strasse,
          plz: editedData.plz,
          ort: editedData.ort,
        },
        positionen: positionenErgebnis.positionen,
        ansprechpartner: editedData.ansprechpartner,
        // frachtkosten werden NICHT übergeben - sind bereits im Preis/Tonne enthalten!
      });

      // Öffne PDF in neuem Tab
      window.open(pdfUrl, '_blank');
    } catch (error) {
      console.error('Fehler beim Generieren der PDF-Vorschau:', error);
      alert(`Fehler beim Generieren der Vorschau: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setGeneratingPreview(false);
    }
  };

  // Test-Mail senden Handler (mit PDF-Anhang)
  const handleTestMailSenden = async () => {
    if (!editedData || !selectedAnfrage) return;

    setSendingTest(true);
    setTestSentSuccess(false);

    try {
      // Lade Stammdaten für PDF
      const stammdaten = await getStammdatenOderDefault();

      // Lade E-Mail-Template mit Signatur
      const emailTemplate = await generiereStandardEmail(
        'angebot',
        'TEST',
        editedData.kundenname
      );

      // Erstelle Positionen für das Angebot mit neuer Funktion (Preis inkl. Lieferkosten!)
      const positionenErgebnis = await erstelleAnfragePositionen({
        tonnenLose02: editedData.tonnenLose02,
        tonnenGesackt02: editedData.tonnenGesackt02,
        tonnenLose03: editedData.tonnenLose03,
        tonnenGesackt03: editedData.tonnenGesackt03,
        menge: editedData.menge,
        plz: editedData.plz,
        preisProTonneInklLieferung: editedData.preisProTonne,
      });
      const positionen: Position[] = positionenErgebnis.positionen;

      // Erstelle AngebotsDaten
      const heute = new Date().toISOString().split('T')[0];
      const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Standard-Lieferbedingungen (wie in Projektabwicklung)
      const standardLieferbedingungen = 'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.';

      const angebotsDaten: AngebotsDaten = {
        kundenname: editedData.kundenname,
        kundenstrasse: editedData.strasse,
        kundenPlzOrt: `${editedData.plz} ${editedData.ort}`,
        angebotsnummer: `TEST-${Date.now()}`,
        angebotsdatum: heute,
        gueltigBis,
        positionen,
        zahlungsziel: '14 Tage',
        // z. Hd. Ansprechpartner
        ansprechpartner: editedData.ansprechpartner,
        // Lieferbedingungen
        lieferbedingungenAktiviert: true,
        lieferbedingungen: standardLieferbedingungen,
        // frachtkosten werden NICHT übergeben - sind bereits im Preis/Tonne enthalten!
        firmenname: stammdaten.firmenname,
        firmenstrasse: stammdaten.firmenstrasse,
        firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
        firmenTelefon: stammdaten.firmenTelefon,
        firmenEmail: stammdaten.firmenEmail,
      };

      // Generiere PDF
      const pdf = await generiereAngebotPDF(angebotsDaten, stammdaten);
      const pdfBase64 = pdfZuBase64(pdf);

      // Hole HTML-Signatur aus E-Mail-Template
      const signaturHtml = emailTemplate.signatur || '';

      // Erstelle HTML-Body mit Signatur
      const htmlBody = wrapInEmailTemplate(editedData.emailText, signaturHtml);

      // Sende E-Mail mit PDF-Anhang
      const result = await sendeEmail({
        to: TEST_EMAIL_ADDRESS,
        from: DEFAULT_ABSENDER_EMAIL,
        subject: `[TEST] ${editedData.emailBetreff}`,
        htmlBody,
        pdfBase64,
        pdfFilename: `Angebot_TEST_${editedData.kundenname.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      });

      if (result.success) {
        setTestSentSuccess(true);
        alert(`Test-Mail mit PDF erfolgreich gesendet an ${TEST_EMAIL_ADDRESS}!`);
      } else {
        alert(`Fehler beim Senden der Test-Mail: ${result.error}`);
      }
    } catch (error) {
      console.error('Fehler bei Test-Mail:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setSendingTest(false);
    }
  };

  // Bestätigen & Senden Handler
  const handleBestaetigunUndSenden = async () => {
    if (!selectedAnfrage || !editedData || !editedData.email) {
      alert('E-Mail-Adresse fehlt! Bitte ergänzen.');
      return;
    }

    setProcessing(true);
    setShowFortschritt(true);
    setFortschrittListe([]);

    try {
      // Erstelle Positionen mit neuer Funktion (inkl. PE-Folie, Beiladung, Preis mit Lieferkosten!)
      const positionenErgebnis = await erstelleAnfragePositionen({
        tonnenLose02: editedData.tonnenLose02,
        tonnenGesackt02: editedData.tonnenGesackt02,
        tonnenLose03: editedData.tonnenLose03,
        tonnenGesackt03: editedData.tonnenGesackt03,
        menge: editedData.menge,
        plz: editedData.plz,
        preisProTonneInklLieferung: editedData.preisProTonne,
      });
      const positionen: Position[] = positionenErgebnis.positionen;

      const result = await verarbeiteAnfrageVollstaendig(
        {
          anfrage: selectedAnfrage,
          kundeNeu: !selectedKundeId,
          kundenDaten: {
            name: editedData.kundenname,
            email: editedData.email,
            telefon: editedData.telefon || undefined,
            strasse: editedData.strasse,
            plz: editedData.plz,
            ort: editedData.ort,
            ansprechpartner: editedData.ansprechpartner || undefined,
          },
          existierenderKundeId: selectedKundeId || undefined,
          positionen,
          preisProTonne: editedData.preisProTonne,
          // frachtkosten werden NICHT übergeben - sind bereits im Preis/Tonne enthalten!
          emailVorschlag: {
            betreff: editedData.emailBetreff,
            text: editedData.emailText,
          },
          absenderEmail: DEFAULT_ABSENDER_EMAIL,
          freibleibend: true,
        },
        (fortschritt) => {
          setFortschrittListe((prev) => [...prev, fortschritt]);
        }
      );

      if (result.success) {
        // Entferne aus der Liste
        setAnfragen((prev) => prev.filter((a) => a.id !== selectedAnfrage.id));

        // Callback
        if (onAnfrageGenehmigt && result.projektId) {
          onAnfrageGenehmigt(result.projektId);
        }

        // Zeige Erfolg für 2 Sekunden, dann schließen
        setTimeout(() => {
          setSelectedAnfrage(null);
          setShowFortschritt(false);
        }, 2000);
      } else {
        // Fehler bleibt sichtbar
        alert(`Fehler: ${result.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Verarbeiten:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setProcessing(false);
    }
  };

  // Ablehnen Handler
  const handleAblehnen = async () => {
    if (!selectedAnfrage) return;
    if (!confirm('Anfrage wirklich ablehnen? Sie bleibt im E-Mail-Postfach.')) return;

    // Entferne aus der lokalen Liste
    setAnfragen((prev) => prev.filter((a) => a.id !== selectedAnfrage.id));
    setSelectedAnfrage(null);
  };

  // Prüfe ob eine Anfrage bereits beantwortet wurde (basierend auf Zeitpunkt!)
  // Eine Anfrage gilt nur als beantwortet, wenn NACH dem Eingang der Anfrage
  // eine E-Mail an diese Adresse gesendet wurde
  const istBereitsBeantwortet = (email: string, anfrageDatum: string): boolean => {
    const antworten = antwortDaten.get(email.toLowerCase());
    if (!antworten || antworten.length === 0) return false;

    // Prüfe ob mindestens eine Antwort NACH dem Anfrage-Datum gesendet wurde
    const anfrageDatumMs = new Date(anfrageDatum).getTime();
    return antworten.some((antwort) => {
      const antwortDatumMs = new Date(antwort.gesendetAm).getTime();
      return antwortDatumMs > anfrageDatumMs;
    });
  };

  // Hole die Antwort-Info für eine Anfrage (Projekt-ID, Dokumentnummer)
  // Gibt die ERSTE passende Antwort zurück, die NACH dem Anfrage-Datum gesendet wurde
  const getAntwortInfo = (email: string, anfrageDatum: string): AntwortInfo | null => {
    const antworten = antwortDaten.get(email.toLowerCase());
    if (!antworten || antworten.length === 0) return null;

    const anfrageDatumMs = new Date(anfrageDatum).getTime();

    // Finde die erste Antwort, die NACH dem Anfrage-Datum gesendet wurde
    // Sortiere nach Datum (älteste zuerst), um die erste passende zu finden
    const sortiert = [...antworten].sort((a, b) =>
      new Date(a.gesendetAm).getTime() - new Date(b.gesendetAm).getTime()
    );

    return sortiert.find((antwort) => {
      const antwortDatumMs = new Date(antwort.gesendetAm).getTime();
      return antwortDatumMs > anfrageDatumMs;
    }) || null;
  };

  // Filtere Kunden für Suche
  const gefilterteKunden = existierendeKunden.filter(
    (k) =>
      k.name?.toLowerCase().includes(kundenSuche.toLowerCase()) ||
      k.kundennummer?.toLowerCase().includes(kundenSuche.toLowerCase()) ||
      k.email?.toLowerCase().includes(kundenSuche.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Lade Anfragen aus E-Mail-Postfach...</p>
        </div>
      </div>
    );
  }

  // Zähle offene vs beantwortete Anfragen (mit Zeitpunkt-Prüfung!)
  const offeneAnfragen = anfragen.filter(
    (a) => !istBereitsBeantwortet(a.analysiert.email || a.emailAbsender, a.emailDatum)
  );
  const beantwortetAnfragen = anfragen.filter(
    (a) => istBereitsBeantwortet(a.analysiert.email || a.emailAbsender, a.emailDatum)
  );

  // Anzuzeigende Anfragen basierend auf Toggle
  const anzuzeigendeAnfragen = zeigeBeantwortet ? anfragen : offeneAnfragen;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Anfragen verarbeiten</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-orange-600">{offeneAnfragen.length} offen</span>
              {beantwortetAnfragen.length > 0 && (
                <span className="ml-2 text-green-600">
                  ({beantwortetAnfragen.length} bereits beantwortet)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle für bereits beantwortete */}
          <button
            onClick={() => setZeigeBeantwortet(!zeigeBeantwortet)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
              zeigeBeantwortet
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {zeigeBeantwortet ? 'Alle zeigen' : 'Beantwortete ausblenden'}
          </button>
          <button
            onClick={loadAnfragen}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </button>
          <button
            onClick={syncEmails}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            title="E-Mails vom Server abrufen und in Datenbank speichern"
          >
            <Download className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Synchronisiere...' : 'E-Mails abrufen'}</span>
          </button>
          {syncResult && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {syncResult.neu} neu, {syncResult.duplikate} bereits vorhanden
            </span>
          )}
        </div>
      </div>

      {/* Anfragen-Liste und Detail-Ansicht */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Liste */}
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {anzuzeigendeAnfragen.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {anfragen.length === 0 ? 'Keine E-Mails im Posteingang' : 'Alle offenen Anfragen verarbeitet!'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                {anfragen.length === 0
                  ? 'Neue Anfragen erscheinen hier automatisch.'
                  : `${beantwortetAnfragen.length} Anfragen wurden bereits beantwortet.`}
              </p>
              {beantwortetAnfragen.length > 0 && !zeigeBeantwortet && (
                <button
                  onClick={() => setZeigeBeantwortet(true)}
                  className="mt-3 text-sm text-purple-600 hover:text-purple-700 underline"
                >
                  Alle anzeigen
                </button>
              )}
            </div>
          ) : (
            anzuzeigendeAnfragen.map((anfrage) => {
              const beantwortet = istBereitsBeantwortet(anfrage.analysiert.email || anfrage.emailAbsender, anfrage.emailDatum);
              const antwortInfo = beantwortet
                ? getAntwortInfo(anfrage.analysiert.email || anfrage.emailAbsender, anfrage.emailDatum)
                : null;
              // Alle Einträge aus Appwrite sind Webformular-Anfragen (vom Sync gefiltert)
              const istWebformular = true;
              return (
                <AnfrageCard
                  key={anfrage.id}
                  anfrage={anfrage}
                  isSelected={selectedAnfrage?.id === anfrage.id}
                  istBeantwortet={beantwortet}
                  istWebformular={istWebformular}
                  antwortInfo={antwortInfo}
                  onClick={() => setSelectedAnfrage(anfrage)}
                  onProjektClick={(projektId) => navigate(`/projektabwicklung/${projektId}`)}
                />
              );
            })
          )}
        </div>

        {/* Detail-Ansicht - ZWEI SPALTEN: Formular links, Original-Mail rechts */}
        {selectedAnfrage && editedData && (
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <Building2 className="w-6 h-6" />
                  <div>
                    <h3 className="font-bold text-lg">{editedData.kundenname}</h3>
                    <p className="text-purple-200 text-sm">
                      {editedData.plz} {editedData.ort}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* KI-Analyse Button */}
                  {aiAnalyseVerfuegbar && (
                    <button
                      onClick={handleKiAnalyse}
                      disabled={runningAiAnalysis || processing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                      title="Mit KI analysieren und optimieren"
                    >
                      {runningAiAnalysis ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline">Analysiert...</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4" />
                          <span className="hidden sm:inline">KI-Analyse</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedAnfrage(null)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Fortschrittsanzeige während Verarbeitung */}
            {showFortschritt && (
              <div className="p-4 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Loader2 className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                  Verarbeitung
                </h4>
                <div className="space-y-2">
                  {fortschrittListe.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {f.erfolgreich ? (
                        <CheckSquare className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                      <span className={f.erfolgreich ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                        {getSchrittLabel(f.schritt)}: {f.details || (f.erfolgreich ? 'OK' : 'Fehler')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ZWEI-SPALTEN LAYOUT: Formular links, Original-Mail rechts */}
            {!showFortschritt && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                {/* LINKE SEITE: Bearbeitbare Felder (2/3 Breite) */}
                <div className="lg:col-span-2 p-4 space-y-4 max-h-[60vh] overflow-y-auto border-r border-gray-200 dark:border-slate-700">
                  {/* Warnung wenn bereits beantwortet */}
                  {selectedAnfrage && istBereitsBeantwortet(editedData.email, selectedAnfrage.emailDatum) && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        An diese E-Mail-Adresse wurde bereits ein Angebot gesendet (nach Eingang dieser Anfrage)!
                      </p>
                    </div>
                  )}

                {/* Kundendaten */}
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Kundendaten
                  </h4>

                  {/* Bestehenden Kunden zuordnen */}
                  <div className="mb-3">
                    <button
                      onClick={() => setShowKundenAuswahl(!showKundenAuswahl)}
                      className="text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" />
                      {selectedKundeId ? 'Anderen Kunden wählen' : 'Bestehenden Kunden zuordnen'}
                    </button>
                    {selectedKundeId && (
                      <span className="text-xs text-green-600 ml-2">
                        (Bestehender Kunde ausgewählt)
                      </span>
                    )}
                  </div>

                  {showKundenAuswahl && (
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={kundenSuche}
                          onChange={(e) => setKundenSuche(e.target.value)}
                          placeholder="Kunde suchen..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900"
                        />
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {gefilterteKunden.slice(0, 10).map((k) => (
                          <button
                            key={k.id}
                            onClick={() => {
                              setSelectedKundeId(k.id);
                              setEditedData({
                                ...editedData,
                                kundenname: k.name,
                                email: k.email || editedData.email,
                                telefon: k.dispoAnsprechpartner?.telefon || editedData.telefon,
                                strasse: k.rechnungsadresse?.strasse || editedData.strasse,
                                plz: k.rechnungsadresse?.plz || editedData.plz,
                                ort: k.rechnungsadresse?.ort || editedData.ort,
                              });
                              setShowKundenAuswahl(false);
                            }}
                            className="w-full text-left px-2 py-1 text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded"
                          >
                            <span className="font-medium">{k.name}</span>
                            {k.kundennummer && <span className="text-gray-500 ml-1">({k.kundennummer})</span>}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedKundeId(null);
                          setShowKundenAuswahl(false);
                        }}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Neuen Kunden anlegen
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name/Verein</label>
                      <input
                        type="text"
                        value={editedData.kundenname}
                        onChange={(e) => setEditedData({ ...editedData, kundenname: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Ansprechpartner</label>
                      <input
                        type="text"
                        value={editedData.ansprechpartner}
                        onChange={(e) => setEditedData({ ...editedData, ansprechpartner: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Telefon</label>
                      <input
                        type="text"
                        value={editedData.telefon}
                        onChange={(e) => setEditedData({ ...editedData, telefon: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        E-Mail <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={editedData.email}
                        onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Straße</label>
                      <input
                        type="text"
                        value={editedData.strasse}
                        onChange={(e) => setEditedData({ ...editedData, strasse: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">PLZ</label>
                      <input
                        type="text"
                        value={editedData.plz}
                        onChange={(e) => setEditedData({ ...editedData, plz: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Ort</label>
                      <input
                        type="text"
                        value={editedData.ort}
                        onChange={(e) => setEditedData({ ...editedData, ort: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Notizen aus Kundenanfrage - Wichtige Infos wie Lieferwünsche */}
                {selectedAnfrage.notizen && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Wichtige Kundennotiz
                    </h4>
                    <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                      {selectedAnfrage.notizen}
                    </p>
                  </div>
                )}

                {/* Angebot */}
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Angebot - Mengen
                  </h4>

                  {/* Einzelne Tonnen-Felder */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        0-2mm lose (t)
                        <span className="ml-1 text-green-600">95.75€/t</span>
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editedData.tonnenLose02 || ''}
                        onChange={(e) => {
                          const newVal = parseFloat(e.target.value) || 0;
                          const newMenge = newVal + editedData.tonnenGesackt02 + editedData.tonnenLose03 + editedData.tonnenGesackt03;
                          setEditedData({ ...editedData, tonnenLose02: newVal, menge: newMenge });
                        }}
                        className="w-full px-3 py-2 text-sm border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-950/20"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        0-2mm gesackt (t)
                        <span className="ml-1 text-green-600">145€/t</span>
                        {istBeiladung(editedData.tonnenGesackt02, editedData.tonnenLose02 + editedData.tonnenLose03) && (
                          <span className="ml-1 text-blue-600 font-medium">(Beiladung)</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editedData.tonnenGesackt02 || ''}
                        onChange={(e) => {
                          const newVal = parseFloat(e.target.value) || 0;
                          const newMenge = editedData.tonnenLose02 + newVal + editedData.tonnenLose03 + editedData.tonnenGesackt03;
                          setEditedData({ ...editedData, tonnenGesackt02: newVal, menge: newMenge });
                        }}
                        className="w-full px-3 py-2 text-sm border border-orange-300 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-950/20"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        0-3mm lose (t)
                        <span className="ml-1 text-green-600">95.75€/t</span>
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editedData.tonnenLose03 || ''}
                        onChange={(e) => {
                          const newVal = parseFloat(e.target.value) || 0;
                          const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + newVal + editedData.tonnenGesackt03;
                          setEditedData({ ...editedData, tonnenLose03: newVal, menge: newMenge });
                        }}
                        className="w-full px-3 py-2 text-sm border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-950/20"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        0-3mm gesackt (t)
                        <span className="ml-1 text-green-600">145€/t</span>
                        {istBeiladung(editedData.tonnenGesackt03, editedData.tonnenLose02 + editedData.tonnenLose03) && (
                          <span className="ml-1 text-blue-600 font-medium">(Beiladung)</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editedData.tonnenGesackt03 || ''}
                        onChange={(e) => {
                          const newVal = parseFloat(e.target.value) || 0;
                          const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + editedData.tonnenLose03 + newVal;
                          setEditedData({ ...editedData, tonnenGesackt03: newVal, menge: newMenge });
                        }}
                        className="w-full px-3 py-2 text-sm border border-orange-300 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-950/20"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Gesamtmenge und Preis */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gesamt (t)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={editedData.menge}
                        readOnly
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-100 dark:bg-slate-700 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Preis/t (EUR)</label>
                      <input
                        type="number"
                        step="0.50"
                        value={editedData.preisProTonne}
                        onChange={(e) =>
                          setEditedData({ ...editedData, preisProTonne: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Fracht (EUR)
                        {lieferkostenBerechnung.isLoading && (
                          <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.50"
                        value={editedData.frachtkosten}
                        onChange={(e) =>
                          setEditedData({ ...editedData, frachtkosten: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  {/* Lieferkosten-Berechnung Breakdown */}
                  {lieferkostenBerechnung.ergebnis && (editedData.tonnenLose02 > 0 || editedData.tonnenLose03 > 0) && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h5 className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        Lieferkosten-Berechnung (LKW)
                      </h5>
                      <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                        <div className="grid grid-cols-2 gap-x-2">
                          <span>Strecke (hin + zurück):</span>
                          <span className="font-medium">{lieferkostenBerechnung.ergebnis.distanz.toFixed(0)} km</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <span>Fahrzeit:</span>
                          <span className="font-medium">{formatZeit(lieferkostenBerechnung.ergebnis.fahrzeit)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <span>Beladung:</span>
                          <span className="font-medium">{BELADUNGSZEIT_MINUTEN} min</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <span>Abladung:</span>
                          <span className="font-medium">{lieferkostenBerechnung.ergebnis.abladungszeit} min</span>
                        </div>
                        {lieferkostenBerechnung.ergebnis.pausenzeit > 0 && (
                          <div className="grid grid-cols-2 gap-x-2">
                            <span>Pause (EU-Regel):</span>
                            <span className="font-medium">{lieferkostenBerechnung.ergebnis.pausenzeit} min</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-2 pt-1 border-t border-blue-200 dark:border-blue-700">
                          <span className="font-semibold">Gesamtzeit:</span>
                          <span className="font-bold">{formatZeit(lieferkostenBerechnung.ergebnis.gesamtzeit)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <span>Stundenlohn:</span>
                          <span className="font-medium">{FREMDLIEFERUNG_STUNDENLOHN} €/h</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 pt-1 border-t border-blue-200 dark:border-blue-700">
                          <span className="font-bold">Lieferkosten:</span>
                          <span className="font-bold text-blue-900 dark:text-blue-200">{lieferkostenBerechnung.ergebnis.lohnkosten.toFixed(2)} €</span>
                        </div>

                        {/* Preisberechnung */}
                        <div className="mt-2 pt-2 border-t border-blue-300 dark:border-blue-600">
                          <div className="grid grid-cols-2 gap-x-2">
                            <span>Werkspreis:</span>
                            <span className="font-medium">95,75 €/t</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2">
                            <span>+ Lieferkosten/t:</span>
                            <span className="font-medium">
                              {editedData.menge > 0 ? (lieferkostenBerechnung.ergebnis.lohnkosten / editedData.menge).toFixed(2) : '0.00'} €/t
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 pt-1 font-bold text-green-700 dark:text-green-400">
                            <span>= Empf. Preis/t:</span>
                            <span>
                              {editedData.menge > 0
                                ? (95.75 + (lieferkostenBerechnung.ergebnis.lohnkosten / editedData.menge)).toFixed(2)
                                : '95.75'} €/t
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PE-Folie Hinweis */}
                  {(editedData.tonnenLose02 > 0 || editedData.tonnenLose03 > 0) && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-xs rounded-full">
                      <Package className="w-3 h-3" />
                      PE-Folie wird automatisch hinzugefügt (loses Material)
                    </div>
                  )}

                  {/* Empfohlener Preis */}
                  {selectedAnfrage.angebotsvorschlag.empfohlenerPreisProTonne && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-xs rounded-full">
                      <Sparkles className="w-3 h-3" />
                      Empfohlen: {selectedAnfrage.angebotsvorschlag.empfohlenerPreisProTonne} EUR/t
                    </div>
                  )}

                  {/* Summe */}
                  {editedData.menge > 0 && editedData.preisProTonne > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-800 dark:text-amber-300">
                          {editedData.menge}t x {editedData.preisProTonne} EUR
                        </span>
                        <span className="font-bold text-amber-900 dark:text-amber-200">
                          {(editedData.menge * editedData.preisProTonne + editedData.frachtkosten).toFixed(2)} EUR netto
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* E-Mail */}
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    E-Mail Vorschau
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Betreff</label>
                      <input
                        type="text"
                        value={editedData.emailBetreff}
                        onChange={(e) => setEditedData({ ...editedData, emailBetreff: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nachricht</label>
                      <textarea
                        value={editedData.emailText}
                        onChange={(e) => setEditedData({ ...editedData, emailText: e.target.value })}
                        rows={6}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 resize-none"
                      />
                    </div>
                  </div>
                </div>

                </div>

                {/* RECHTE SEITE: Original E-Mail (1/3 Breite) */}
                <div className="lg:col-span-1 p-4 bg-slate-50 dark:bg-slate-800/50 max-h-[60vh] overflow-y-auto">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 sticky top-0 bg-slate-50 dark:bg-slate-800/50 pb-2">
                    <Mail className="w-4 h-4" />
                    Original E-Mail
                  </h4>
                  <div className="space-y-3">
                    {/* E-Mail Metadaten */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                      <p><span className="font-medium">Von:</span> {selectedAnfrage.emailAbsender}</p>
                      <p><span className="font-medium">Betreff:</span> {selectedAnfrage.emailBetreff}</p>
                      <p><span className="font-medium">Datum:</span> {new Date(selectedAnfrage.emailDatum).toLocaleString('de-DE')}</p>
                    </div>

                    {/* E-Mail Inhalt */}
                    <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
                      <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {selectedAnfrage.emailText}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 sticky bottom-0">
              <div className="flex flex-col gap-2">
                {/* PDF Vorschau und Test-Mail Buttons */}
                <div className="flex gap-2">
                  {/* PDF Vorschau Button */}
                  <button
                    onClick={handlePdfVorschau}
                    disabled={generatingPreview || processing || editedData.menge <= 0}
                    className="flex-1 px-4 py-2 border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {generatingPreview ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        PDF wird erstellt...
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        PDF Vorschau
                      </>
                    )}
                  </button>

                  {/* Test-Mail Button */}
                  <button
                    onClick={handleTestMailSenden}
                    disabled={sendingTest || processing}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2 text-sm ${
                      testSentSuccess
                        ? 'border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50'
                        : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                    }`}
                  >
                    {sendingTest ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sende...
                      </>
                    ) : testSentSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Gesendet
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Test-Mail
                      </>
                    )}
                  </button>
                </div>

                {/* Haupt-Aktionen */}
                <div className="flex gap-3">
                  <button
                    onClick={handleAblehnen}
                    disabled={processing}
                    className="flex-1 px-4 py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Ablehnen
                  </button>
                  <button
                    onClick={handleBestaetigunUndSenden}
                    disabled={processing || !editedData?.email}
                    className="flex-[2] px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Wird verarbeitet...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Bestätigen & Angebot senden
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper: Label für Verarbeitungsschritt
function getSchrittLabel(schritt: VerarbeitungsSchritt): string {
  switch (schritt) {
    case 'kunde_anlegen':
      return 'Kunde';
    case 'projekt_erstellen':
      return 'Projekt';
    case 'angebot_generieren':
      return 'Angebot';
    case 'angebot_speichern':
      return 'Speichern';
    case 'email_versenden':
      return 'E-Mail';
    case 'status_aktualisieren':
      return 'Status';
    case 'anfrage_speichern':
      return 'Protokoll';
    case 'fertig':
      return 'Fertig';
    default:
      return schritt;
  }
}

// Anfrage-Card Komponente
interface AnfrageCardProps {
  anfrage: VerarbeiteteAnfrage;
  isSelected: boolean;
  istBeantwortet: boolean;
  istWebformular?: boolean;
  antwortInfo?: AntwortInfo | null; // Info über die Antwort (Projekt-ID etc.)
  onClick: () => void;
  onProjektClick?: (projektId: string) => void; // Callback für Projekt-Link
}

const AnfrageCard = ({ anfrage, isSelected, istBeantwortet, istWebformular, antwortInfo, onClick, onProjektClick }: AnfrageCardProps) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-200 dark:ring-purple-900/50'
          : istBeantwortet
          ? 'border-green-200 dark:border-green-800 opacity-60'
          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Status-Badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            {istBeantwortet && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-xs rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Beantwortet
              </div>
            )}
            {/* Projekt-Link wenn beantwortet */}
            {istBeantwortet && antwortInfo?.projektId && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Verhindert dass onClick der Card ausgelöst wird
                  onProjektClick?.(antwortInfo.projektId);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-xs rounded-full hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                title={`Zum Projekt ${antwortInfo.dokumentNummer}`}
              >
                <ChevronRight className="w-3 h-3" />
                {antwortInfo.dokumentNummer || 'Projekt öffnen'}
              </button>
            )}
            {istWebformular && !istBeantwortet && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 text-xs rounded-full">
                <Sparkles className="w-3 h-3" />
                Webformular
              </div>
            )}
          </div>

          {/* Kundenname */}
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <h3 className="font-bold text-gray-900 dark:text-white truncate">{anfrage.analysiert.kundenname}</h3>
          </div>

          {/* PLZ/Ort */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{anfrage.analysiert.plzOrt || 'Keine Adresse'}</span>
          </div>

          {/* Menge und Artikel - Detailansicht */}
          {(anfrage.analysiert.menge || anfrage.analysiert.tonnenLose02 || anfrage.analysiert.tonnenGesackt02 || anfrage.analysiert.tonnenLose03 || anfrage.analysiert.tonnenGesackt03) && (
            <div className="flex flex-col gap-1">
              {/* Zeige einzelne Tonnen-Felder */}
              {anfrage.analysiert.tonnenLose02 && anfrage.analysiert.tonnenLose02 > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {anfrage.analysiert.tonnenLose02}t 0-2mm lose
                  </span>
                </div>
              )}
              {anfrage.analysiert.tonnenGesackt02 && anfrage.analysiert.tonnenGesackt02 > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-3.5 h-3.5 text-orange-500" />
                  <span className="font-medium text-orange-700 dark:text-orange-400">
                    {anfrage.analysiert.tonnenGesackt02}t 0-2mm gesackt
                    {anfrage.analysiert.tonnenLose02 && anfrage.analysiert.tonnenLose02 > 0 && anfrage.analysiert.tonnenGesackt02 < 1 && (
                      <span className="text-xs ml-1 text-blue-600">(Beiladung)</span>
                    )}
                  </span>
                </div>
              )}
              {anfrage.analysiert.tonnenLose03 && anfrage.analysiert.tonnenLose03 > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {anfrage.analysiert.tonnenLose03}t 0-3mm lose
                  </span>
                </div>
              )}
              {anfrage.analysiert.tonnenGesackt03 && anfrage.analysiert.tonnenGesackt03 > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-3.5 h-3.5 text-orange-500" />
                  <span className="font-medium text-orange-700 dark:text-orange-400">
                    {anfrage.analysiert.tonnenGesackt03}t 0-3mm gesackt
                    {anfrage.analysiert.tonnenLose03 && anfrage.analysiert.tonnenLose03 > 0 && anfrage.analysiert.tonnenGesackt03 < 1 && (
                      <span className="text-xs ml-1 text-blue-600">(Beiladung)</span>
                    )}
                  </span>
                </div>
              )}
              {/* Fallback: Wenn nur Gesamtmenge vorhanden */}
              {!anfrage.analysiert.tonnenLose02 && !anfrage.analysiert.tonnenGesackt02 && !anfrage.analysiert.tonnenLose03 && !anfrage.analysiert.tonnenGesackt03 && anfrage.analysiert.menge && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {anfrage.analysiert.menge}t {anfrage.analysiert.artikel || 'Tennismehl'}
                  </span>
                </div>
              )}
              {/* Gesamtmenge wenn mehrere Positionen */}
              {((anfrage.analysiert.tonnenLose02 || 0) + (anfrage.analysiert.tonnenGesackt02 || 0) + (anfrage.analysiert.tonnenLose03 || 0) + (anfrage.analysiert.tonnenGesackt03 || 0)) > (anfrage.analysiert.tonnenLose02 || anfrage.analysiert.tonnenGesackt02 || anfrage.analysiert.tonnenLose03 || anfrage.analysiert.tonnenGesackt03 || 0) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Gesamt: {anfrage.analysiert.menge}t
                </div>
              )}
            </div>
          )}

          {/* Empfohlener Preis */}
          {anfrage.angebotsvorschlag.empfohlenerPreisProTonne && !istBeantwortet && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-xs rounded-full">
              <Sparkles className="w-3 h-3" />
              ca. {anfrage.angebotsvorschlag.empfohlenerPreisProTonne} EUR/t
            </div>
          )}
        </div>

        {/* Zeitstempel und Arrow */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(anfrage.emailDatum).toLocaleDateString('de-DE')}
          </div>
          <ChevronRight
            className={`w-5 h-5 transition-transform ${
              isSelected ? 'text-purple-500 translate-x-1' : 'text-gray-400'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

export default AnfragenVerarbeitung;
