/**
 * AnfrageBearbeitungDialog - 10X UI/UX Version
 *
 * Modaler Dialog zur Bearbeitung von Anfragen mit:
 * - Maximiertem Dialog (95% Viewport)
 * - Tabs: Bearbeitung + E-Mail-Verlauf
 * - Smooth Animations
 * - Intuitivem Layout
 */

import { useState, useEffect } from 'react';
import {
  Mail,
  User,
  MapPin,
  Package,
  Send,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  Building2,
  AlertTriangle,
  UserPlus,
  Search,
  Eye,
  Bot,
  Truck,
  Plus,
  Trash2,
  Edit3,
  History,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  Inbox,
} from 'lucide-react';
import { VerarbeiteteAnfrage } from '../../types/anfragen';
import { Position } from '../../types/projektabwicklung';
import {
  generiereAngebotsEmailMitSignatur,
} from '../../services/anfrageParserService';
import { generiereStandardEmail } from '../../utils/emailHelpers';
import { wrapInEmailTemplate, sendeEmail, pdfZuBase64 } from '../../services/emailSendService';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { getStammdatenOderDefault } from '../../services/stammdatenService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  verarbeiteAnfrageVollstaendig,
  erstelleNurKundeUndProjekt,
  erstelleAnfragePositionen,
  generiereAngebotsVorschauPDF,
  VerarbeitungsFortschritt,
  VerarbeitungsSchritt,
} from '../../services/anfrageVerarbeitungService';
import { anfragenService } from '../../services/anfragenService';
import { claudeAnfrageService } from '../../services/claudeAnfrageService';
import { berechneFremdlieferungRoute, formatZeit } from '../../utils/routeCalculation';
import { FremdlieferungStammdaten, FremdlieferungRoutenBerechnung } from '../../types';
import { getAlleArtikel } from '../../services/artikelService';
import { Artikel } from '../../types/artikel';
import { searchEmailsByAddress, Email } from '../../services/emailService';
import { berechneSpeditionskosten, getZoneFromPLZ } from '../../constants/pricing';

// Konstanten
const FREMDLIEFERUNG_STUNDENLOHN = 108;
const BELADUNGSZEIT_MINUTEN = 30;
const ABLADUNGSZEIT_MINUTEN = 30;
const START_PLZ = '97828';
const DEFAULT_ABSENDER_EMAIL = 'anfrage@tennismehl.com';
const TEST_EMAIL_ADDRESS = 'jtatwcook@gmail.com';

interface BearbeitbareDaten {
  kundenname: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  strasse: string;
  plz: string;
  ort: string;
  tonnenLose02: number;
  tonnenGesackt02: number;
  tonnenBigbag02: number;
  tonnenLose03: number;
  tonnenGesackt03: number;
  tonnenBigbag03: number;
  menge: number;
  preisProTonne: number;
  frachtkosten: number;
  emailBetreff: string;
  emailText: string;
}

// Info über eine bereits gesendete Antwort
interface AntwortInfo {
  gesendetAm: string;
  projektId: string;
  dokumentNummer: string;
}

// Gefundener existierender Kunde
interface GefundenerKunde {
  kunde: SaisonKunde;
  matchTyp: 'name' | 'email' | 'adresse' | 'mehrfach';
  matchScore: number;
}

interface AnfrageBearbeitungDialogProps {
  anfrage: VerarbeiteteAnfrage;
  isOpen: boolean;
  istBereitsBeantwortet?: boolean;
  antwortInfo?: AntwortInfo | null;
  onClose: () => void;
  onSuccess: (projektId?: string) => void;
  onNavigateToProjekt: (projektId: string) => void;
  // Callback wenn IMAP-Prüfung ein Duplikat findet - aktualisiert die Eltern-Liste
  onDuplikatGefunden?: (email: string, gesendetAm: string, betreff: string) => void;
}

type TabType = 'bearbeitung' | 'emailVerlauf';

const AnfrageBearbeitungDialog = ({
  anfrage,
  isOpen,
  istBereitsBeantwortet = false,
  antwortInfo,
  onClose,
  onSuccess,
  onNavigateToProjekt,
  onDuplikatGefunden,
}: AnfrageBearbeitungDialogProps) => {
  // Tab State
  const [activeTab, setActiveTab] = useState<TabType>('bearbeitung');

  // Bearbeitung States
  const [editedData, setEditedData] = useState<BearbeitbareDaten | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingNurProjekt, setProcessingNurProjekt] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testSentSuccess, setTestSentSuccess] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [runningAiAnalysis, setRunningAiAnalysis] = useState(false);
  const [aiAnalyseVerfuegbar] = useState(() => claudeAnfrageService.isAvailable());
  const [fortschrittListe, setFortschrittListe] = useState<VerarbeitungsFortschritt[]>([]);
  const [showFortschritt, setShowFortschritt] = useState(false);

  // Kunden-Auswahl
  const [showKundenAuswahl, setShowKundenAuswahl] = useState(false);
  const [kundenSuche, setKundenSuche] = useState('');
  const [existierendeKunden, setExistierendeKunden] = useState<SaisonKunde[]>([]);
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);

  // Lieferkosten
  const [lieferkostenBerechnung, setLieferkostenBerechnung] = useState<{
    isLoading: boolean;
    ergebnis: FremdlieferungRoutenBerechnung | null;
    plz: string | null;
    tonnage: number;
  }>({ isLoading: false, ergebnis: null, plz: null, tonnage: 0 });

  // Speditionskosten für Palettenware (Sackware + BigBag)
  const [speditionskostenBerechnung, setSpeditionskostenBerechnung] = useState<{
    kosten: number | null;
    kostenProTonne: number | null;
    zone: number | null;
    gewichtKg: number;
    plz: string | null;
  }>({ kosten: null, kostenProTonne: null, zone: null, gewichtKg: 0, plz: null });

  // Positionen
  const [allePositionen, setAllePositionen] = useState<Position[]>([]);
  const [positionenLaden, setPositionenLaden] = useState(false);
  const [showArtikelSuche, setShowArtikelSuche] = useState(false);
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [verfuegbareArtikel, setVerfuegbareArtikel] = useState<Artikel[]>([]);

  // E-Mail Verlauf States
  const [emailVerlauf, setEmailVerlauf] = useState<Email[]>([]);
  const [emailVerlaufLaden, setEmailVerlaufLaden] = useState(false);
  const [emailVerlaufError, setEmailVerlaufError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // Animation State
  const [isClosing, setIsClosing] = useState(false);

  // IMAP-basierte Duplikat-Erkennung (UNABHÄNGIG von Parent-Props!)
  const [imapDuplikatPruefung, setImapDuplikatPruefung] = useState<{
    laeuft: boolean;
    gefunden: boolean;
    gesendetAm: string | null;
    betreff: string | null;
  }>({ laeuft: false, gefunden: false, gesendetAm: null, betreff: null });

  // Automatisch gefundene existierende Kunden
  const [gefundeneKunden, setGefundeneKunden] = useState<GefundenerKunde[]>([]);

  // Lade Kunden
  useEffect(() => {
    const ladeKunden = async () => {
      try {
        const kunden = await saisonplanungService.loadAlleKunden();
        setExistierendeKunden(kunden);
      } catch (error) {
        console.error('Fehler beim Laden der Kunden:', error);
      }
    };
    if (isOpen) ladeKunden();
  }, [isOpen]);

  // KRITISCH: Prüfe IMAP Gesendet-Ordner auf bereits gesendete E-Mails
  // Diese Prüfung läuft SOFORT beim Öffnen des Dialogs
  useEffect(() => {
    if (!isOpen || !anfrage) {
      setImapDuplikatPruefung({ laeuft: false, gefunden: false, gesendetAm: null, betreff: null });
      return;
    }

    const email = anfrage.analysiert.email || anfrage.emailAbsender;
    if (!email) return;

    const pruefeGesendet = async () => {
      setImapDuplikatPruefung({ laeuft: true, gefunden: false, gesendetAm: null, betreff: null });

      try {
        console.log(`🔍 Prüfe IMAP Gesendet-Ordner für: ${email}`);
        const imapErgebnis = await searchEmailsByAddress(email);

        // Finde gesendete E-Mails AN diese Adresse (nicht VON)
        const anfrageDatum = new Date(anfrage.emailDatum).getTime();
        const gesendeteEmails = imapErgebnis.filter(e => {
          const toAddresses = e.to.map(t => t.address.toLowerCase());
          const istAnKunde = toAddresses.includes(email.toLowerCase());
          const gesendetNachAnfrage = new Date(e.date).getTime() > anfrageDatum;
          return istAnKunde && gesendetNachAnfrage;
        });

        if (gesendeteEmails.length > 0) {
          // Sortiere nach Datum (älteste zuerst)
          gesendeteEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const ersteAntwort = gesendeteEmails[0];

          console.log(`⚠️ DUPLIKAT GEFUNDEN: E-Mail an ${email} gesendet am ${ersteAntwort.date}`);
          setImapDuplikatPruefung({
            laeuft: false,
            gefunden: true,
            gesendetAm: ersteAntwort.date,
            betreff: ersteAntwort.subject,
          });

          // Melde Duplikat an Eltern-Komponente, damit Liste aktualisiert wird
          if (onDuplikatGefunden) {
            onDuplikatGefunden(email.toLowerCase(), ersteAntwort.date, ersteAntwort.subject || 'IMAP-Email');
          }
        } else {
          console.log(`✅ Keine gesendete E-Mail an ${email} nach ${anfrage.emailDatum} gefunden`);
          setImapDuplikatPruefung({ laeuft: false, gefunden: false, gesendetAm: null, betreff: null });
        }
      } catch (error) {
        console.error('Fehler bei IMAP-Duplikat-Prüfung:', error);
        setImapDuplikatPruefung({ laeuft: false, gefunden: false, gesendetAm: null, betreff: null });
      }
    };

    pruefeGesendet();
  }, [isOpen, anfrage]);

  // Lade Artikel
  useEffect(() => {
    const ladeArtikel = async () => {
      try {
        const artikel = await getAlleArtikel();
        setVerfuegbareArtikel(artikel);
      } catch (error) {
        console.error('Fehler beim Laden der Artikel:', error);
      }
    };
    if (isOpen) ladeArtikel();
  }, [isOpen]);

  // Suche nach existierenden Kunden die zur Anfrage passen
  useEffect(() => {
    if (!isOpen || !anfrage || existierendeKunden.length === 0) {
      setGefundeneKunden([]);
      return;
    }

    const a = anfrage.analysiert;
    const kundenname = (a.kundenname || '').toLowerCase().trim();
    const email = (a.email || '').toLowerCase().trim();
    const plz = (a.plz || '').trim();

    const gefunden: GefundenerKunde[] = [];

    existierendeKunden.forEach((kunde) => {
      let matchScore = 0;
      let matchTypen: string[] = [];

      // Name-Match (fuzzy)
      const kundeName = (kunde.name || '').toLowerCase().trim();
      if (kundeName && kundenname) {
        // Exakter Match
        if (kundeName === kundenname) {
          matchScore += 100;
          matchTypen.push('name');
        }
        // Teilstring Match
        else if (kundeName.includes(kundenname) || kundenname.includes(kundeName)) {
          matchScore += 70;
          matchTypen.push('name');
        }
        // Wort-basierter Match (z.B. "SV Steppach" vs "Steppach")
        else {
          const kundenWorte = kundenname.split(/\s+/).filter(w => w.length > 2);
          const kundeWorte = kundeName.split(/\s+/).filter(w => w.length > 2);
          const gemeinsam = kundenWorte.filter(w => kundeWorte.some(kw => kw.includes(w) || w.includes(kw)));
          if (gemeinsam.length > 0) {
            matchScore += 50 * (gemeinsam.length / Math.max(kundenWorte.length, 1));
            matchTypen.push('name');
          }
        }
      }

      // Email-Match (exakt, case-insensitive)
      const kundeEmail = (kunde.email || '').toLowerCase().trim();
      if (kundeEmail && email && kundeEmail === email) {
        matchScore += 100;
        matchTypen.push('email');
      }

      // PLZ-Match (aus Lieferadresse)
      const kundePlz = (kunde.lieferadresse?.plz || kunde.rechnungsadresse?.plz || '').trim();
      if (kundePlz && plz && kundePlz === plz) {
        matchScore += 30;
        matchTypen.push('adresse');
      }

      // Nur Kunden mit signifikantem Match hinzufügen
      if (matchScore >= 50) {
        const matchTyp = matchTypen.length > 1 ? 'mehrfach' : (matchTypen[0] as 'name' | 'email' | 'adresse') || 'name';
        gefunden.push({ kunde, matchTyp, matchScore });
      }
    });

    // Sortiere nach Score (höchster zuerst)
    gefunden.sort((a, b) => b.matchScore - a.matchScore);

    // Nur die besten 3 behalten
    setGefundeneKunden(gefunden.slice(0, 3));
  }, [isOpen, anfrage, existierendeKunden]);

  // Initialisiere Daten wenn Dialog öffnet
  useEffect(() => {
    if (isOpen && anfrage) {
      const a = anfrage.analysiert;
      const empfohlenerPreis = anfrage.angebotsvorschlag.empfohlenerPreisProTonne || 85;

      const tonnenLose02 = a.tonnenLose02 || 0;
      const tonnenGesackt02 = a.tonnenGesackt02 || 0;
      const tonnenBigbag02 = 0; // BigBag wird manuell hinzugefügt
      const tonnenLose03 = a.tonnenLose03 || 0;
      const tonnenGesackt03 = a.tonnenGesackt03 || 0;
      const tonnenBigbag03 = 0; // BigBag wird manuell hinzugefügt
      const berechneteGesamtmenge = tonnenLose02 + tonnenGesackt02 + tonnenBigbag02 + tonnenLose03 + tonnenGesackt03 + tonnenBigbag03;
      const menge = berechneteGesamtmenge > 0 ? berechneteGesamtmenge : (a.menge || 0);

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
        tonnenBigbag02,
        tonnenLose03,
        tonnenGesackt03,
        tonnenBigbag03,
        menge,
        preisProTonne: empfohlenerPreis,
        frachtkosten: 0,
        emailBetreff: anfrage.emailVorschlag.betreff,
        emailText: anfrage.emailVorschlag.text,
      });

      setSelectedKundeId(null);
      setAllePositionen([]);
      setShowArtikelSuche(false);
      setFortschrittListe([]);
      setShowFortschritt(false);
      setActiveTab('bearbeitung');
      setSelectedEmail(null);

      // Lade Email mit Signatur
      generiereAngebotsEmailMitSignatur(a.kundenname || '', a.ansprechpartner).then((result) => {
        setEditedData((prev) =>
          prev ? { ...prev, emailBetreff: result.betreff, emailText: result.text } : prev
        );
      });
    }
  }, [isOpen, anfrage]);

  // Lieferkosten berechnen
  useEffect(() => {
    if (!editedData || !editedData.plz || editedData.plz.length < 5) {
      setLieferkostenBerechnung({ isLoading: false, ergebnis: null, plz: null, tonnage: 0 });
      return;
    }

    const plz = editedData.plz;
    const tonnage = editedData.menge || 0;

    if (plz === lieferkostenBerechnung.plz && tonnage === lieferkostenBerechnung.tonnage && lieferkostenBerechnung.ergebnis) {
      return;
    }

    const hatLosesMaterial = (editedData.tonnenLose02 || 0) + (editedData.tonnenLose03 || 0) > 0;
    if (!hatLosesMaterial && tonnage <= 0) {
      setLieferkostenBerechnung({ isLoading: false, ergebnis: null, plz, tonnage });
      return;
    }

    const berechneLieferkosten = async () => {
      setLieferkostenBerechnung(prev => ({ ...prev, isLoading: true, plz, tonnage }));

      try {
        const fremdlieferungStammdaten: FremdlieferungStammdaten = {
          stundenlohn: FREMDLIEFERUNG_STUNDENLOHN,
          durchschnittsgeschwindigkeit: 60.0,
          beladungszeit: BELADUNGSZEIT_MINUTEN,
          abladungszeit: ABLADUNGSZEIT_MINUTEN,
          anzahlAbladestellen: 1,
          pausenzeit: 45,
          lkwLadungInTonnen: tonnage,
        };

        const ergebnis = await berechneFremdlieferungRoute(START_PLZ, plz, fremdlieferungStammdaten);
        const werkspreis = 95.75;
        const lieferkostenProTonne = tonnage > 0 ? ergebnis.lohnkosten / tonnage : 0;
        const empfohlenerPreisProTonne = Math.round((werkspreis + lieferkostenProTonne) * 100) / 100;

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

    const timeout = setTimeout(berechneLieferkosten, 500);
    return () => clearTimeout(timeout);
  }, [editedData?.plz, editedData?.menge, editedData?.tonnenLose02, editedData?.tonnenLose03]);

  // Speditionskosten für Palettenware berechnen
  useEffect(() => {
    if (!editedData || !editedData.plz || editedData.plz.length < 5) {
      setSpeditionskostenBerechnung({ kosten: null, kostenProTonne: null, zone: null, gewichtKg: 0, plz: null });
      return;
    }

    const plz = editedData.plz;
    const mengePalette = (editedData.tonnenGesackt02 || 0) + (editedData.tonnenGesackt03 || 0) +
                         (editedData.tonnenBigbag02 || 0) + (editedData.tonnenBigbag03 || 0);

    if (mengePalette <= 0) {
      setSpeditionskostenBerechnung({ kosten: null, kostenProTonne: null, zone: null, gewichtKg: 0, plz });
      return;
    }

    const gewichtKg = mengePalette * 1000;
    const kosten = berechneSpeditionskosten(plz, gewichtKg);
    const zone = getZoneFromPLZ(plz);

    setSpeditionskostenBerechnung({
      kosten,
      kostenProTonne: kosten !== null && mengePalette > 0 ? kosten / mengePalette : null,
      zone,
      gewichtKg,
      plz,
    });
  }, [editedData?.plz, editedData?.tonnenGesackt02, editedData?.tonnenGesackt03, editedData?.tonnenBigbag02, editedData?.tonnenBigbag03]);

  // Positionen generieren
  useEffect(() => {
    if (!editedData || !anfrage) return;
    if (allePositionen.length > 0) return;

    const generierePositionen = async () => {
      setPositionenLaden(true);
      try {
        const positionenErgebnis = await erstelleAnfragePositionen({
          tonnenLose02: editedData.tonnenLose02,
          tonnenGesackt02: editedData.tonnenGesackt02,
          tonnenBigbag02: editedData.tonnenBigbag02,
          tonnenLose03: editedData.tonnenLose03,
          tonnenGesackt03: editedData.tonnenGesackt03,
          tonnenBigbag03: editedData.tonnenBigbag03,
          menge: editedData.menge,
          plz: editedData.plz,
          preisProTonneInklLieferung: editedData.preisProTonne,
        });
        setAllePositionen(positionenErgebnis.positionen);
      } catch (error) {
        console.error('Fehler beim Generieren der Positionen:', error);
      } finally {
        setPositionenLaden(false);
      }
    };

    const timeout = setTimeout(generierePositionen, 300);
    return () => clearTimeout(timeout);
  }, [editedData, anfrage, allePositionen.length]);

  // E-Mail Verlauf laden wenn Tab gewechselt wird
  useEffect(() => {
    if (activeTab === 'emailVerlauf' && editedData?.email && emailVerlauf.length === 0 && !emailVerlaufLaden) {
      ladeEmailVerlauf();
    }
  }, [activeTab, editedData?.email]);

  const ladeEmailVerlauf = async () => {
    if (!editedData?.email) return;

    setEmailVerlaufLaden(true);
    setEmailVerlaufError(null);

    try {
      console.log(`Suche E-Mails für ${editedData.email}...`);
      const emails = await searchEmailsByAddress(editedData.email);
      console.log(`${emails.length} E-Mails gefunden`);
      setEmailVerlauf(emails);
    } catch (error) {
      console.error('Fehler beim Laden des E-Mail-Verlaufs:', error);
      setEmailVerlaufError(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setEmailVerlaufLaden(false);
    }
  };

  // Handler: Positionen neu generieren
  const handlePositionenNeuGenerieren = async () => {
    if (!editedData) return;

    setPositionenLaden(true);
    try {
      const positionenErgebnis = await erstelleAnfragePositionen({
        tonnenLose02: editedData.tonnenLose02,
        tonnenGesackt02: editedData.tonnenGesackt02,
        tonnenBigbag02: editedData.tonnenBigbag02,
        tonnenLose03: editedData.tonnenLose03,
        tonnenGesackt03: editedData.tonnenGesackt03,
        tonnenBigbag03: editedData.tonnenBigbag03,
        menge: editedData.menge,
        plz: editedData.plz,
        preisProTonneInklLieferung: editedData.preisProTonne,
      });
      setAllePositionen(positionenErgebnis.positionen);
    } catch (error) {
      console.error('Fehler beim Generieren der Positionen:', error);
      alert('Fehler beim Generieren der Positionen');
    } finally {
      setPositionenLaden(false);
    }
  };

  // Handler: KI-Analyse
  const handleKiAnalyse = async () => {
    if (!anfrage || !editedData) return;

    setRunningAiAnalysis(true);

    try {
      const analyse = await claudeAnfrageService.analysiereAnfrage({
        emailText: anfrage.emailText,
        emailBetreff: anfrage.emailBetreff,
        absenderEmail: anfrage.emailAbsender,
        absenderName: anfrage.analysiert.ansprechpartner,
        extrahiert: {
          kundenname: editedData.kundenname,
          ansprechpartner: editedData.ansprechpartner,
          strasse: editedData.strasse,
          plz: editedData.plz,
          ort: editedData.ort,
          telefon: editedData.telefon,
          menge: editedData.menge,
          artikel: anfrage.analysiert?.artikel,
          koernung: anfrage.analysiert?.koernung,
          lieferart: anfrage.analysiert?.lieferart,
          anzahlPlaetze: anfrage.analysiert?.anzahlPlaetze,
        },
      });

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

      alert(
        `KI-Analyse abgeschlossen!\n\nDatenqualitat: ${analyse.qualitaet.datenVollstaendigkeit}%\nTyp: ${analyse.qualitaet.anfrageTyp}\nPrioritat: ${analyse.qualitaet.prioritaet}`
      );
    } catch (error) {
      console.error('Fehler bei KI-Analyse:', error);
      alert(`KI-Analyse fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setRunningAiAnalysis(false);
    }
  };

  // Handler: PDF Vorschau
  const handlePdfVorschau = async () => {
    if (!editedData || !anfrage) return;

    if (allePositionen.length === 0) {
      alert('Keine Positionen vorhanden. Bitte erst Mengen eingeben.');
      return;
    }

    setGeneratingPreview(true);

    try {
      const pdfUrl = await generiereAngebotsVorschauPDF({
        kundenDaten: {
          name: editedData.kundenname,
          strasse: editedData.strasse,
          plz: editedData.plz,
          ort: editedData.ort,
        },
        positionen: allePositionen,
        ansprechpartner: editedData.ansprechpartner,
      });

      window.open(pdfUrl, '_blank');
    } catch (error) {
      console.error('Fehler beim Generieren der PDF-Vorschau:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setGeneratingPreview(false);
    }
  };

  // Handler: Test-Mail senden
  const handleTestMailSenden = async () => {
    if (!editedData || !anfrage) return;

    setSendingTest(true);
    setTestSentSuccess(false);

    try {
      const stammdaten = await getStammdatenOderDefault();
      const emailTemplate = await generiereStandardEmail('angebot', 'TEST', editedData.kundenname);

      if (allePositionen.length === 0) {
        alert('Keine Positionen vorhanden.');
        setSendingTest(false);
        return;
      }

      const heute = new Date().toISOString().split('T')[0];
      const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const standardLieferbedingungen = 'Fur die Lieferung ist eine uneingeschrankte Befahrbarkeit fur LKW erforderlich.';

      const angebotsDaten = {
        kundenname: editedData.kundenname,
        kundenstrasse: editedData.strasse,
        kundenPlzOrt: `${editedData.plz} ${editedData.ort}`,
        angebotsnummer: `TEST-${Date.now()}`,
        angebotsdatum: heute,
        gueltigBis,
        positionen: allePositionen,
        zahlungsziel: '14 Tage',
        ansprechpartner: editedData.ansprechpartner,
        lieferbedingungenAktiviert: true,
        lieferbedingungen: standardLieferbedingungen,
        firmenname: stammdaten.firmenname,
        firmenstrasse: stammdaten.firmenstrasse,
        firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
        firmenTelefon: stammdaten.firmenTelefon,
        firmenEmail: stammdaten.firmenEmail,
      };

      const pdf = await generiereAngebotPDF(angebotsDaten, stammdaten);
      const pdfBase64 = pdfZuBase64(pdf);
      const signaturHtml = emailTemplate.signatur || '';
      const htmlBody = wrapInEmailTemplate(editedData.emailText, signaturHtml);

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
        alert(`Test-Mail gesendet an ${TEST_EMAIL_ADDRESS}!`);
      } else {
        alert(`Fehler: ${result.error}`);
      }
    } catch (error) {
      console.error('Fehler bei Test-Mail:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setSendingTest(false);
    }
  };

  // Handler: Bestatigen & Senden
  const handleBestaetigunUndSenden = async () => {
    if (!anfrage || !editedData || !editedData.email) {
      alert('E-Mail-Adresse fehlt!');
      return;
    }

    if (allePositionen.length === 0) {
      alert('Keine Positionen vorhanden.');
      return;
    }

    setProcessing(true);
    setShowFortschritt(true);
    setFortschrittListe([]);

    try {
      const result = await verarbeiteAnfrageVollstaendig(
        {
          anfrage,
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
          positionen: allePositionen,
          preisProTonne: editedData.preisProTonne,
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
        setTimeout(() => {
          handleClose();
          onSuccess(result.projektId);
        }, 1500);
      } else {
        alert(`Fehler: ${result.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Verarbeiten:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setProcessing(false);
    }
  };

  // Handler: Nur Projekt anlegen
  const handleNurProjektAnlegen = async () => {
    if (!anfrage || !editedData) {
      alert('Bitte eine Anfrage auswahlen.');
      return;
    }

    if (allePositionen.length === 0) {
      alert('Keine Positionen vorhanden.');
      return;
    }

    setProcessingNurProjekt(true);
    setShowFortschritt(true);
    setFortschrittListe([]);

    try {
      const result = await erstelleNurKundeUndProjekt(
        {
          anfrage,
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
          positionen: allePositionen,
          preisProTonne: editedData.preisProTonne,
        },
        (fortschritt) => {
          setFortschrittListe((prev) => [...prev, fortschritt]);
        }
      );

      if (result.success) {
        setTimeout(() => {
          handleClose();
          onSuccess(result.projektId);
          if (result.projektId) {
            onNavigateToProjekt(result.projektId);
          }
        }, 1500);
      } else {
        alert(`Fehler: ${result.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Anlegen:', error);
      alert(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setProcessingNurProjekt(false);
    }
  };

  // Handler: Ablehnen (löscht aus Datenbank!)
  const handleAblehnen = async () => {
    if (!anfrage) return;
    if (!confirm('Anfrage wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;

    try {
      await anfragenService.deleteAnfrage(anfrage.id);
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Fehler beim Löschen der Anfrage:', error);
      alert('Fehler beim Löschen der Anfrage');
    }
  };

  // Handler: Dialog schliessen mit Animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  // Filtere Kunden
  const gefilterteKunden = existierendeKunden.filter(
    (k) =>
      k.name?.toLowerCase().includes(kundenSuche.toLowerCase()) ||
      k.kundennummer?.toLowerCase().includes(kundenSuche.toLowerCase()) ||
      k.email?.toLowerCase().includes(kundenSuche.toLowerCase())
  );

  // Artikel hinzufugen
  const handleArtikelHinzufuegen = (artikel: Artikel) => {
    const neuePosition: Position = {
      id: `neu-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      bezeichnung: artikel.bezeichnung,
      menge: 1,
      einheit: artikel.einheit || 't',
      einzelpreis: artikel.einzelpreis || 0,
      gesamtpreis: artikel.einzelpreis || 0,
    };
    setAllePositionen(prev => [...prev, neuePosition]);
    setShowArtikelSuche(false);
    setArtikelSuchtext('');
  };

  // Schrittlabel Helper
  const getSchrittLabel = (schritt: VerarbeitungsSchritt): string => {
    switch (schritt) {
      case 'kunde_anlegen': return 'Kunde';
      case 'projekt_erstellen': return 'Projekt';
      case 'angebot_generieren': return 'Angebot';
      case 'angebot_speichern': return 'Speichern';
      case 'email_versenden': return 'E-Mail';
      case 'status_aktualisieren': return 'Status';
      case 'anfrage_speichern': return 'Protokoll';
      case 'fertig': return 'Fertig';
      default: return schritt;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        className={`relative w-full h-[95vh] max-w-[98vw] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white truncate max-w-[40vw]">
                  {editedData?.kundenname || 'Anfrage bearbeiten'}
                </h2>
                <p className="text-purple-200 text-sm flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  {editedData?.plz} {editedData?.ort}
                  <span className="text-purple-300">|</span>
                  <Mail className="w-3 h-3" />
                  {editedData?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* KI-Analyse Button */}
              {aiAnalyseVerfuegbar && (
                <button
                  onClick={handleKiAnalyse}
                  disabled={runningAiAnalysis || processing}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all disabled:opacity-50"
                >
                  {runningAiAnalysis ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                  <span>KI-Analyse</span>
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('bearbeitung')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                activeTab === 'bearbeitung'
                  ? 'bg-white text-purple-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              Bearbeitung
            </button>
            <button
              onClick={() => setActiveTab('emailVerlauf')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                activeTab === 'emailVerlauf'
                  ? 'bg-white text-purple-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <History className="w-4 h-4" />
              E-Mail-Verlauf
              {emailVerlauf.length > 0 && (
                <span className="px-2 py-0.5 bg-purple-500/30 rounded-full text-xs">
                  {emailVerlauf.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {/* IMAP-Prüfung läuft */}
          {imapDuplikatPruefung.laeuft && (
            <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              <p className="font-medium">Prüfe Gesendet-Ordner auf bereits versendete E-Mails...</p>
            </div>
          )}

          {/* WARNUNG: IMAP-Duplikat gefunden (HÖCHSTE PRIORITÄT!) */}
          {imapDuplikatPruefung.gefunden && (
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">STOP! An diesen Kunden wurde bereits eine E-Mail gesendet!</p>
                  <p className="text-red-100">
                    E-Mail gesendet am {imapDuplikatPruefung.gesendetAm ? new Date(imapDuplikatPruefung.gesendetAm).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unbekannt'}
                  </p>
                  {imapDuplikatPruefung.betreff && (
                    <p className="text-red-200 text-sm mt-1">Betreff: "{imapDuplikatPruefung.betreff}"</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveTab('emailVerlauf')}
                className="px-4 py-2 bg-white text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                E-Mail-Verlauf ansehen
              </button>
            </div>
          )}

          {/* WARNUNG: Bereits beantwortet (aus Parent-Props, als Fallback) */}
          {!imapDuplikatPruefung.gefunden && istBereitsBeantwortet && antwortInfo && (
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg">Diese Anfrage wurde bereits beantwortet!</p>
                  <p className="text-red-100">
                    E-Mail gesendet am {new Date(antwortInfo.gesendetAm).toLocaleDateString('de-DE')}
                    {antwortInfo.dokumentNummer && ` (${antwortInfo.dokumentNummer})`}
                  </p>
                </div>
              </div>
              {antwortInfo.projektId && (
                <button
                  onClick={() => onNavigateToProjekt(antwortInfo.projektId)}
                  className="px-4 py-2 bg-white text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Zum Projekt
                </button>
              )}
            </div>
          )}

          {/* Fortschrittsanzeige */}
          {showFortschritt && (
            <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-10 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-20 h-20 mx-auto mb-6 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-purple-200 dark:border-purple-900"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-purple-600 border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Verarbeitung lauft...
                </h3>
                <div className="space-y-3 max-w-md mx-auto">
                  {fortschrittListe.map((f, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        f.erfolgreich
                          ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      {f.erfolgreich ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      )}
                      <div className="text-left">
                        <span className="font-medium">{getSchrittLabel(f.schritt)}</span>
                        {f.details && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{f.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Bearbeitung */}
          {activeTab === 'bearbeitung' && editedData && (
            <div className="h-full flex flex-col lg:flex-row">
              {/* Linke Seite: Formular */}
              <div className="flex-1 lg:w-2/3 overflow-y-auto p-4 sm:p-6 space-y-6">
                {/* Gefundene existierende Kunden - Automatische Erkennung */}
                {gefundeneKunden.length > 0 && !selectedKundeId && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 border-2 border-blue-300 dark:border-blue-700">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-blue-900 dark:text-blue-200">
                        Mögliche existierende Kunden gefunden!
                      </h3>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Diese Kunden könnten zur Anfrage passen. Wähle einen aus, um Daten zu übernehmen:
                    </p>
                    <div className="space-y-2">
                      {gefundeneKunden.map((gk) => (
                        <button
                          key={gk.kunde.id}
                          onClick={() => {
                            setSelectedKundeId(gk.kunde.id);
                            // Nimm Adresse aus Lieferadresse oder Rechnungsadresse
                            const addr = gk.kunde.lieferadresse || gk.kunde.rechnungsadresse;
                            setEditedData({
                              ...editedData,
                              kundenname: gk.kunde.name || editedData.kundenname,
                              email: gk.kunde.email || editedData.email,
                              telefon: gk.kunde.dispoAnsprechpartner?.telefon || editedData.telefon,
                              strasse: addr?.strasse || editedData.strasse,
                              plz: addr?.plz || editedData.plz,
                              ort: addr?.ort || editedData.ort,
                            });
                          }}
                          className="w-full text-left p-3 bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {gk.kunde.name}
                              {gk.kunde.kundennummer && (
                                <span className="ml-2 text-sm text-gray-500">({gk.kunde.kundennummer})</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {gk.kunde.lieferadresse?.plz || gk.kunde.rechnungsadresse?.plz} {gk.kunde.lieferadresse?.ort || gk.kunde.rechnungsadresse?.ort} | {gk.kunde.email}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              gk.matchTyp === 'email' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' :
                              gk.matchTyp === 'name' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400' :
                              gk.matchTyp === 'mehrfach' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {gk.matchTyp === 'email' ? 'E-Mail Match' :
                               gk.matchTyp === 'name' ? 'Name Match' :
                               gk.matchTyp === 'mehrfach' ? 'Mehrfach Match' :
                               'Adresse Match'}
                            </span>
                            <ArrowRight className="w-4 h-4 text-blue-500" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ausgewählter Kunde Info */}
                {selectedKundeId && (
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl p-4 border-2 border-green-300 dark:border-green-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-900 dark:text-green-200">
                          Existierender Kunde ausgewählt
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedKundeId(null)}
                        className="text-sm text-green-700 dark:text-green-400 hover:underline"
                      >
                        Neuen Kunden anlegen
                      </button>
                    </div>
                  </div>
                )}

                {/* Kundendaten */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-purple-600" />
                      Kundendaten
                    </h3>

                    {/* Bestehenden Kunden zuordnen */}
                    <button
                      onClick={() => setShowKundenAuswahl(!showKundenAuswahl)}
                      className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      {selectedKundeId ? 'Anderen wahlen' : 'Bestehenden Kunden'}
                    </button>
                  </div>

                  {/* Kunden-Suche Dropdown */}
                  {showKundenAuswahl && (
                    <div className="mb-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-800">
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={kundenSuche}
                          onChange={(e) => setKundenSuche(e.target.value)}
                          placeholder="Kunde suchen..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
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
                            className="w-full text-left px-3 py-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                          >
                            <span className="font-medium">{k.name}</span>
                            {k.kundennummer && (
                              <span className="text-gray-500 ml-2">({k.kundennummer})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedKundeId && (
                    <div className="mb-4 px-3 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Bestehender Kunde ausgewahlt
                      <button
                        onClick={() => setSelectedKundeId(null)}
                        className="ml-auto text-green-600 hover:text-green-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Name / Verein
                      </label>
                      <input
                        type="text"
                        value={editedData.kundenname}
                        onChange={(e) => setEditedData({ ...editedData, kundenname: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Ansprechpartner
                      </label>
                      <input
                        type="text"
                        value={editedData.ansprechpartner}
                        onChange={(e) => setEditedData({ ...editedData, ansprechpartner: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Telefon
                      </label>
                      <input
                        type="text"
                        value={editedData.telefon}
                        onChange={(e) => setEditedData({ ...editedData, telefon: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        E-Mail <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={editedData.email}
                        onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Strasse
                      </label>
                      <input
                        type="text"
                        value={editedData.strasse}
                        onChange={(e) => setEditedData({ ...editedData, strasse: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        PLZ
                      </label>
                      <input
                        type="text"
                        value={editedData.plz}
                        onChange={(e) => setEditedData({ ...editedData, plz: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Ort
                      </label>
                      <input
                        type="text"
                        value={editedData.ort}
                        onChange={(e) => setEditedData({ ...editedData, ort: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Kundennotiz */}
                {anfrage.notizen && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-800 dark:text-amber-300">Wichtige Kundennotiz</h4>
                        <p className="text-amber-900 dark:text-amber-200 whitespace-pre-wrap mt-1">
                          {anfrage.notizen}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Angebot - Mengen */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Package className="w-5 h-5 text-amber-600" />
                      Angebot - Mengen
                    </h3>
                    <button
                      onClick={handlePositionenNeuGenerieren}
                      disabled={positionenLaden}
                      className="flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {positionenLaden ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Neu generieren
                    </button>
                  </div>

                  {/* Mengen-Grid - 0-2mm */}
                  <div className="mb-3">
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Körnung 0-2mm</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Lose <span className="text-green-600">95.75€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenLose02 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = newVal + editedData.tonnenGesackt02 + editedData.tonnenBigbag02 + editedData.tonnenLose03 + editedData.tonnenGesackt03 + editedData.tonnenBigbag03;
                            setEditedData({ ...editedData, tonnenLose02: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-amber-300 dark:border-amber-700 rounded-xl bg-amber-50 dark:bg-amber-950/20 focus:ring-2 focus:ring-amber-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          BigBag <span className="text-green-600">125€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenBigbag02 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + newVal + editedData.tonnenLose03 + editedData.tonnenGesackt03 + editedData.tonnenBigbag03;
                            setEditedData({ ...editedData, tonnenBigbag02: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 rounded-xl bg-purple-50 dark:bg-purple-950/20 focus:ring-2 focus:ring-purple-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Gesackt <span className="text-green-600">145€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenGesackt02 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = editedData.tonnenLose02 + newVal + editedData.tonnenBigbag02 + editedData.tonnenLose03 + editedData.tonnenGesackt03 + editedData.tonnenBigbag03;
                            setEditedData({ ...editedData, tonnenGesackt02: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-orange-300 dark:border-orange-700 rounded-xl bg-orange-50 dark:bg-orange-950/20 focus:ring-2 focus:ring-orange-500"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mengen-Grid - 0-3mm */}
                  <div className="mb-4">
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Körnung 0-3mm</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Lose <span className="text-green-600">95.75€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenLose03 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + editedData.tonnenBigbag02 + newVal + editedData.tonnenGesackt03 + editedData.tonnenBigbag03;
                            setEditedData({ ...editedData, tonnenLose03: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-amber-300 dark:border-amber-700 rounded-xl bg-amber-50 dark:bg-amber-950/20 focus:ring-2 focus:ring-amber-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          BigBag <span className="text-green-600">125€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenBigbag03 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + editedData.tonnenBigbag02 + editedData.tonnenLose03 + editedData.tonnenGesackt03 + newVal;
                            setEditedData({ ...editedData, tonnenBigbag03: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 rounded-xl bg-purple-50 dark:bg-purple-950/20 focus:ring-2 focus:ring-purple-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Gesackt <span className="text-green-600">145€/t</span>
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editedData.tonnenGesackt03 || ''}
                          onChange={(e) => {
                            const newVal = parseFloat(e.target.value) || 0;
                            const newMenge = editedData.tonnenLose02 + editedData.tonnenGesackt02 + editedData.tonnenBigbag02 + editedData.tonnenLose03 + newVal + editedData.tonnenBigbag03;
                            setEditedData({ ...editedData, tonnenGesackt03: newVal, menge: newMenge });
                          }}
                          className="w-full px-3 py-2 border-2 border-orange-300 dark:border-orange-700 rounded-xl bg-orange-50 dark:bg-orange-950/20 focus:ring-2 focus:ring-orange-500"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summen-Row */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Gesamt</label>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {editedData.menge} <span className="text-sm font-normal">t</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Preis/t {lieferkostenBerechnung.isLoading && <Loader2 className="w-3 h-3 inline animate-spin" />}
                      </label>
                      <input
                        type="number"
                        step="0.50"
                        value={editedData.preisProTonne}
                        onChange={(e) => setEditedData({ ...editedData, preisProTonne: parseFloat(e.target.value) || 0 })}
                        className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-0 p-0 focus:ring-0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Fracht</label>
                      <input
                        type="number"
                        step="0.50"
                        value={editedData.frachtkosten}
                        onChange={(e) => setEditedData({ ...editedData, frachtkosten: parseFloat(e.target.value) || 0 })}
                        className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-0 p-0 focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Lieferkosten-Info & Preisberechnung */}
                  {lieferkostenBerechnung.ergebnis && (editedData.tonnenLose02 > 0 || editedData.tonnenLose03 > 0) && (() => {
                    const werkspreis = 95.75;
                    const tonnage = (editedData.tonnenLose02 || 0) + (editedData.tonnenLose03 || 0);
                    const lieferkostenGesamt = lieferkostenBerechnung.ergebnis.lohnkosten;
                    const lieferkostenProTonne = tonnage > 0 ? lieferkostenGesamt / tonnage : 0;
                    const empfohlenerPreis = werkspreis + lieferkostenProTonne;

                    return (
                      <div className="mt-4 space-y-3">
                        {/* Preisberechnung */}
                        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium mb-3">
                            <Sparkles className="w-4 h-4" />
                            Preiskalkulation ({tonnage}t lose)
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 dark:text-gray-400">Werkspreis:</span>
                              <span className="font-medium text-gray-900 dark:text-white">{werkspreis.toFixed(2)} EUR/t</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 dark:text-gray-400">+ Lieferkosten/t:</span>
                              <span className="font-medium text-blue-600 dark:text-blue-400">{lieferkostenProTonne.toFixed(2)} EUR/t</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-green-300 dark:border-green-700">
                              <span className="font-bold text-gray-900 dark:text-white">= Empfohlener Preis:</span>
                              <span className="font-bold text-lg text-green-600 dark:text-green-400">{empfohlenerPreis.toFixed(2)} EUR/t</span>
                            </div>
                          </div>
                        </div>

                        {/* Lieferkosten-Details */}
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-medium mb-2">
                            <Truck className="w-4 h-4" />
                            Lieferkosten-Details
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-blue-700 dark:text-blue-400">
                            <div className="flex justify-between">
                              <span className="text-blue-600/70">Strecke:</span>
                              <span className="font-medium">{lieferkostenBerechnung.ergebnis.distanz.toFixed(0)} km</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-600/70">Fahrzeit (hin+rück):</span>
                              <span className="font-medium">{formatZeit(lieferkostenBerechnung.ergebnis.fahrzeit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-600/70">Be-/Entladung:</span>
                              <span className="font-medium">{BELADUNGSZEIT_MINUTEN + ABLADUNGSZEIT_MINUTEN} min</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-600/70">Gesamtzeit:</span>
                              <span className="font-medium">{formatZeit(lieferkostenBerechnung.ergebnis.gesamtzeit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-600/70">Stundensatz:</span>
                              <span className="font-medium">{FREMDLIEFERUNG_STUNDENLOHN} EUR/h</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-600/70 font-medium">Lieferkosten gesamt:</span>
                              <span className="font-bold">{lieferkostenGesamt.toFixed(2)} EUR</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Speditionskosten für Palettenware (Sackware + BigBag) */}
                  {speditionskostenBerechnung.kosten !== null && (() => {
                    const mengeSackware = (editedData.tonnenGesackt02 || 0) + (editedData.tonnenGesackt03 || 0);
                    const mengeBigbag = (editedData.tonnenBigbag02 || 0) + (editedData.tonnenBigbag03 || 0);
                    const mengeGesamt = mengeSackware + mengeBigbag;
                    const werkspreisSackware = 145;
                    const werkspreisBigbag = 125;
                    const frachtProTonne = speditionskostenBerechnung.kostenProTonne || 0;

                    return (
                      <div className="mt-4 space-y-3">
                        {/* Preisberechnung Palettenware */}
                        <div className="p-4 bg-gradient-to-r from-purple-50 to-orange-50 dark:from-purple-950/30 dark:to-orange-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 text-purple-800 dark:text-purple-300 font-medium mb-3">
                            <Package className="w-4 h-4" />
                            Preiskalkulation Palettenware ({mengeGesamt}t per Spedition)
                          </div>
                          <div className="space-y-2 text-sm">
                            {mengeBigbag > 0 && (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">BigBag Werkspreis:</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{werkspreisBigbag.toFixed(2)} EUR/t</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">+ Spedition/t:</span>
                                  <span className="font-medium text-purple-600 dark:text-purple-400">{frachtProTonne.toFixed(2)} EUR/t</span>
                                </div>
                                <div className="flex justify-between items-center text-purple-700 dark:text-purple-300">
                                  <span className="font-medium">= BigBag Endpreis:</span>
                                  <span className="font-bold">{(werkspreisBigbag + frachtProTonne).toFixed(2)} EUR/t</span>
                                </div>
                              </>
                            )}
                            {mengeSackware > 0 && (
                              <>
                                {mengeBigbag > 0 && <div className="border-t border-purple-200 dark:border-purple-700 my-2" />}
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">Sackware Werkspreis:</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{werkspreisSackware.toFixed(2)} EUR/t</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">+ Spedition/t:</span>
                                  <span className="font-medium text-orange-600 dark:text-orange-400">{frachtProTonne.toFixed(2)} EUR/t</span>
                                </div>
                                <div className="flex justify-between items-center text-orange-700 dark:text-orange-300">
                                  <span className="font-medium">= Sackware Endpreis:</span>
                                  <span className="font-bold">{(werkspreisSackware + frachtProTonne).toFixed(2)} EUR/t</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Speditionskosten-Details */}
                        <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300 font-medium mb-2">
                            <Truck className="w-4 h-4" />
                            Speditionskosten-Details (Raben)
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-orange-700 dark:text-orange-400">
                            <div className="flex justify-between">
                              <span className="text-orange-600/70">Lieferzone:</span>
                              <span className="font-medium">{speditionskostenBerechnung.zone ? `Zone ${speditionskostenBerechnung.zone}` : '–'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-orange-600/70">Gewicht:</span>
                              <span className="font-medium">{(speditionskostenBerechnung.gewichtKg / 1000).toFixed(1)} t</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-orange-600/70">Kosten/t:</span>
                              <span className="font-medium">{frachtProTonne.toFixed(2)} EUR</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-orange-600/70 font-medium">Spedition gesamt:</span>
                              <span className="font-bold">{speditionskostenBerechnung.kosten?.toFixed(2)} EUR</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Positionen */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      Positionen ({allePositionen.length})
                    </h3>
                    <button
                      onClick={() => setShowArtikelSuche(!showArtikelSuche)}
                      className="flex items-center gap-2 text-sm text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Artikel
                    </button>
                  </div>

                  {/* Artikel-Suche */}
                  {showArtikelSuche && (
                    <div className="mb-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-green-200 dark:border-green-800">
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={artikelSuchtext}
                          onChange={(e) => setArtikelSuchtext(e.target.value)}
                          placeholder="Artikel suchen..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {verfuegbareArtikel
                          .filter(a => a.bezeichnung.toLowerCase().includes(artikelSuchtext.toLowerCase()))
                          .slice(0, 10)
                          .map((artikel) => (
                            <button
                              key={artikel.$id}
                              onClick={() => handleArtikelHinzufuegen(artikel)}
                              className="w-full text-left px-3 py-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors flex justify-between"
                            >
                              <span className="font-medium">{artikel.bezeichnung}</span>
                              <span className="text-green-600">{artikel.einzelpreis} EUR</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Positionen-Liste */}
                  {allePositionen.length > 0 ? (
                    <div className="space-y-2">
                      {allePositionen.map((pos, index) => (
                        <div
                          key={index}
                          className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 group hover:border-green-300 dark:hover:border-green-700 transition-colors"
                        >
                          {/* Bezeichnung */}
                          <div className="font-medium text-gray-900 dark:text-white truncate mb-2">
                            {pos.bezeichnung}
                          </div>

                          {/* Editierbare Felder */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Menge */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={pos.menge}
                                onChange={(e) => {
                                  const neueMenge = parseFloat(e.target.value) || 0;
                                  setAllePositionen(prev => prev.map((p, i) =>
                                    i === index
                                      ? { ...p, menge: neueMenge, gesamtpreis: neueMenge * p.einzelpreis }
                                      : p
                                  ));
                                }}
                                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                step="0.5"
                                min="0"
                              />
                              <span className="text-sm text-gray-500 dark:text-gray-400">{pos.einheit}</span>
                            </div>

                            <span className="text-gray-400">×</span>

                            {/* Einzelpreis */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={pos.einzelpreis}
                                onChange={(e) => {
                                  const neuerPreis = parseFloat(e.target.value) || 0;
                                  setAllePositionen(prev => prev.map((p, i) =>
                                    i === index
                                      ? { ...p, einzelpreis: neuerPreis, gesamtpreis: p.menge * neuerPreis }
                                      : p
                                  ));
                                }}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                step="0.50"
                                min="0"
                              />
                              <span className="text-sm text-gray-500 dark:text-gray-400">EUR</span>
                            </div>

                            <span className="text-gray-400">=</span>

                            {/* Gesamtpreis (berechnet) */}
                            <div className="font-bold text-green-600 dark:text-green-400 min-w-[80px] text-right">
                              {pos.gesamtpreis.toFixed(2)} EUR
                            </div>

                            {/* Löschen */}
                            <button
                              onClick={() => setAllePositionen(prev => prev.filter((_, i) => i !== index))}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg ml-auto"
                              title="Position entfernen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Summe */}
                      <div className="flex justify-between items-center pt-3 border-t-2 border-green-300 dark:border-green-700">
                        <span className="font-bold text-gray-700 dark:text-gray-300">Gesamtsumme:</span>
                        <span className="text-xl font-bold text-green-600 dark:text-green-400">
                          {allePositionen.reduce((sum, p) => sum + p.gesamtpreis, 0).toFixed(2)} EUR netto
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Keine Positionen vorhanden</p>
                      <p className="text-sm">Gib oben Mengen ein oder fuge Artikel hinzu</p>
                    </div>
                  )}
                </div>

                {/* E-Mail Vorschau */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <Mail className="w-5 h-5 text-blue-600" />
                    E-Mail Vorschau
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Betreff
                      </label>
                      <input
                        type="text"
                        value={editedData.emailBetreff}
                        onChange={(e) => setEditedData({ ...editedData, emailBetreff: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nachricht
                      </label>
                      <textarea
                        value={editedData.emailText}
                        onChange={(e) => setEditedData({ ...editedData, emailText: e.target.value })}
                        rows={6}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rechte Seite: Original E-Mail */}
              <div className="lg:w-1/3 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 overflow-y-auto">
                <div className="p-4 sm:p-6">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 sticky top-0 bg-slate-50 dark:bg-slate-800/30 pb-2 z-10">
                    <Inbox className="w-5 h-5 text-gray-600" />
                    Original E-Mail
                  </h3>

                  <div className="space-y-4">
                    {/* Metadaten */}
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 w-16">Von:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{anfrage.emailAbsender}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 w-16">Betreff:</span>
                        <span className="font-medium text-gray-900 dark:text-white truncate">{anfrage.emailBetreff}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 w-16">Datum:</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {new Date(anfrage.emailDatum).toLocaleString('de-DE')}
                        </span>
                      </div>
                    </div>

                    {/* Inhalt */}
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {anfrage.emailText}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: E-Mail-Verlauf */}
          {activeTab === 'emailVerlauf' && (
            <div className="h-full flex">
              {/* E-Mail Liste */}
              <div className="w-1/3 border-r border-gray-200 dark:border-slate-700 overflow-y-auto">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">
                      Alle E-Mails mit {editedData?.email}
                    </h3>
                    <button
                      onClick={ladeEmailVerlauf}
                      disabled={emailVerlaufLaden}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${emailVerlaufLaden ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {emailVerlaufLaden && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                        <p className="text-gray-500">Durchsuche E-Mail-Server...</p>
                      </div>
                    </div>
                  )}

                  {emailVerlaufError && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-red-700 dark:text-red-400 text-sm">{emailVerlaufError}</p>
                    </div>
                  )}

                  {!emailVerlaufLaden && !emailVerlaufError && emailVerlauf.length === 0 && (
                    <div className="text-center py-12">
                      <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-gray-500 dark:text-gray-400">
                        Keine E-Mails gefunden
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Klicke auf Aktualisieren um erneut zu suchen
                      </p>
                    </div>
                  )}

                  {emailVerlauf.length > 0 && (
                    <div className="space-y-2">
                      {emailVerlauf.map((email) => (
                        <button
                          key={email.id}
                          onClick={() => setSelectedEmail(email)}
                          className={`w-full text-left p-3 rounded-xl transition-all ${
                            selectedEmail?.id === email.id
                              ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-300 dark:border-purple-700'
                              : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {email.from.address === editedData?.email ? (
                              <ArrowRight className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowLeft className="w-4 h-4 text-blue-600" />
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(email.date).toLocaleDateString('de-DE')}
                            </span>
                            {!email.isRead && (
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded">
                                Neu
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium text-gray-900 dark:text-white truncate text-sm">
                            {email.subject}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {email.from.address === editedData?.email ? 'Von Kunde' : 'An Kunde'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* E-Mail Detail */}
              <div className="flex-1 overflow-y-auto">
                {selectedEmail ? (
                  <div className="p-6">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                        {selectedEmail.subject}
                      </h2>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Von:</span>
                          <span>{selectedEmail.from.name || selectedEmail.from.address}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">An:</span>
                          <span>{selectedEmail.to.map(t => t.address).join(', ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{new Date(selectedEmail.date).toLocaleString('de-DE')}</span>
                        </div>
                      </div>
                    </div>

                    {/* E-Mail Inhalt - HTML oder Plain Text */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                      {selectedEmail.bodyHtml ? (
                        // HTML-Email: In iframe rendern für Sicherheit
                        <div className="p-4">
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{
                              __html: selectedEmail.bodyHtml
                                // Basic sanitization
                                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                .replace(/on\w+="[^"]*"/gi, '')
                            }}
                          />
                        </div>
                      ) : (
                        // Plain Text
                        <pre className="p-6 text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed text-sm">
                          {selectedEmail.body || selectedEmail.bodyPreview || 'Kein Inhalt'}
                        </pre>
                      )}
                    </div>

                    {/* Info wenn nur Preview verfügbar */}
                    {!selectedEmail.body && !selectedEmail.bodyHtml && selectedEmail.bodyPreview && (
                      <p className="mt-2 text-xs text-gray-500 italic">
                        Nur Vorschau verfügbar (vollständiger Inhalt nicht geladen)
                      </p>
                    )}

                    {selectedEmail.hasAttachments && selectedEmail.attachments && (
                      <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Anhange ({selectedEmail.attachments.length})
                        </h4>
                        <div className="space-y-1">
                          {selectedEmail.attachments.map((att, i) => (
                            <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                              {att.filename} ({(att.size / 1024).toFixed(1)} KB)
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-400 dark:text-gray-500">
                      <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg">Wahle eine E-Mail aus</p>
                      <p className="text-sm mt-1">um den Inhalt anzuzeigen</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions - nur bei Bearbeitung-Tab */}
        {activeTab === 'bearbeitung' && (() => {
          // WICHTIG: Senden ist blockiert wenn IMAP-Duplikat gefunden ODER Parent sagt es ist beantwortet
          const sendenBlockiert = imapDuplikatPruefung.gefunden || istBereitsBeantwortet || imapDuplikatPruefung.laeuft;

          return (
          <div className={`flex-shrink-0 p-4 sm:p-6 border-t ${
            sendenBlockiert
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
          }`}>
            {/* Warnung wenn bereits beantwortet (nur zeigen wenn nicht schon im Header) */}
            {sendenBlockiert && !imapDuplikatPruefung.gefunden && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-red-800 dark:text-red-200">
                    {imapDuplikatPruefung.laeuft ? 'Prüfe auf Duplikate...' : 'Achtung: Bereits beantwortet!'}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {imapDuplikatPruefung.laeuft
                      ? 'Bitte warten während der Gesendet-Ordner geprüft wird.'
                      : 'An diese E-Mail-Adresse wurde bereits ein Angebot gesendet. Das Senden ist blockiert um Duplikate zu vermeiden.'}
                  </p>
                </div>
                {!imapDuplikatPruefung.laeuft && antwortInfo?.projektId && (
                  <button
                    onClick={() => onNavigateToProjekt(antwortInfo.projektId)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
                  >
                    Zum Projekt
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Linke Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handlePdfVorschau}
                  disabled={generatingPreview || processing || allePositionen.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-all disabled:opacity-50 font-medium"
                >
                  {generatingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">PDF Vorschau</span>
                </button>

                <button
                  onClick={handleTestMailSenden}
                  disabled={sendingTest || processing}
                  className={`flex items-center gap-2 px-4 py-2.5 border-2 rounded-xl transition-all disabled:opacity-50 font-medium ${
                    testSentSuccess
                      ? 'border-green-300 text-green-600 bg-green-50 dark:border-green-700 dark:text-green-400 dark:bg-green-950/50'
                      : 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/50'
                  }`}
                >
                  {sendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : testSentSuccess ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{testSentSuccess ? 'Gesendet' : 'Test-Mail'}</span>
                </button>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Rechte Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleAblehnen}
                  disabled={processing || processingNurProjekt}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition-all disabled:opacity-50 font-medium"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Ablehnen</span>
                </button>

                <button
                  onClick={handleNurProjektAnlegen}
                  disabled={processing || processingNurProjekt || allePositionen.length === 0 || sendenBlockiert}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 font-medium shadow-lg ${
                    sendenBlockiert
                      ? 'bg-gray-400 cursor-not-allowed shadow-gray-400/25'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25'
                  } text-white`}
                  title={sendenBlockiert ? 'Bereits beantwortet - Senden blockiert' : ''}
                >
                  {processingNurProjekt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : imapDuplikatPruefung.laeuft ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Nur Projekt</span>
                </button>

                <button
                  onClick={handleBestaetigunUndSenden}
                  disabled={processing || processingNurProjekt || !editedData?.email || allePositionen.length === 0 || sendenBlockiert}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 font-medium shadow-lg ${
                    sendenBlockiert
                      ? 'bg-gray-400 cursor-not-allowed shadow-gray-400/25'
                      : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-600/25'
                  } text-white`}
                  title={sendenBlockiert ? 'Bereits beantwortet - Senden blockiert' : ''}
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : imapDuplikatPruefung.laeuft ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : sendenBlockiert ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{sendenBlockiert ? 'Blockiert' : 'Angebot senden'}</span>
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
};

export default AnfrageBearbeitungDialog;
