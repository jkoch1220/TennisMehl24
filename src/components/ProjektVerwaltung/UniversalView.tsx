import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Download,
  Calendar,
  Building2,
  MapPin,
  FileSignature,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  List,
  TrendingUp,
  Truck,
  FileText,
  CheckCircle2,
  ShoppingCart,
  Send,
  Check,
  X,
  Users,
  Loader2,
  Mail,
  Eye,
} from 'lucide-react';
import TipTapEditor from '../Shared/TipTapEditor';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { AuftragsbestaetigungsDaten, Position, LieferscheinDaten, LieferscheinPosition } from '../../types/projektabwicklung';
import { ladeDokumentNachTyp, ladeDokumentDaten } from '../../services/projektabwicklungDokumentService';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import { sendeEmailMitPdf, wrapInEmailTemplate } from '../../services/emailSendService';
import { generiereStandardEmail } from '../../utils/emailHelpers';
import { getStammdatenOderDefault } from '../../services/stammdatenService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import { databases, DATABASE_ID } from '../../config/appwrite';
import { Query } from 'appwrite';

// Universal-Bestellung Interface
interface UniversalBestellung {
  projektId: string;
  projekt: Projekt;
  position: Position;
  lieferdatum?: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
}

// Props
interface UniversalViewProps {
  projekteGruppiert: {
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  };
  onProjektClick: (projekt: Projekt) => void;
}

// Status Badge Helper
const getStatusConfig = (status: ProjektStatus) => {
  const configs: Record<ProjektStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
    angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: FileSignature },
    angebot_versendet: { label: 'Versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300', icon: FileSignature },
    auftragsbestaetigung: { label: 'AB', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', icon: FileSignature },
    lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: Truck },
    rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: FileText },
    bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300', icon: CheckCircle2 },
    verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: FileSignature },
  };
  return configs[status];
};

// Gruppierungs-Typ
type GroupBy = 'none' | 'lieferdatum' | 'status' | 'kunde';

// Universal Sport Empfänger (fix)
const UNIVERSAL_SPORT_EMAIL = 'info@universal-sport.de';
const UNIVERSAL_SPORT_NAME = 'Universal Sport';
const TENNISMEHL_ABSENDER = 'info@tennismehl.com';
const TEST_EMAIL = 'jtatwcook@gmail.com';

// Interface für Kunden-Gruppierung
interface KundenGruppe {
  projektId: string;
  kundenname: string;
  kundenPlzOrt: string;
  abNummer: string;
  bestellungen: UniversalBestellung[];
  gesamtWert: number;
  gesamtEK: number;
  db1: number;
}

// Interface für Email-Status
interface EmailStatus {
  [projektId: string]: {
    gesendetAm: string;
    dokumentNummer: string;
  };
}

// Interface für Email-Vorschau Modal
interface EmailVorschauDaten {
  gruppe: KundenGruppe;
  empfaenger: string;
  betreff: string;
  emailText: string;
  signatur: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  pdfBlob: Blob;
  pdfDateiname: string;
  lieferscheinnummer: string;
}

// Helper: Prüft ob Position ein Universal-Artikel ist
const istUniversalPosition = (position: Position): boolean => {
  // Neues Flag (ab jetzt)
  if (position.istUniversalArtikel === true) return true;
  // Fallback für alte Daten (vor Migration)
  if (position.beschreibung?.startsWith('Universal:')) return true;
  return false;
};

const UniversalView = ({ projekteGruppiert, onProjektClick }: UniversalViewProps) => {
  const [bestellungen, setBestellungen] = useState<UniversalBestellung[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('kunde');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['alle']));

  // Email-Status und Sende-Prozess
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({});
  const [sendingProjektIds, setSendingProjektIds] = useState<Set<string>>(new Set());
  const [justSentProjektIds, setJustSentProjektIds] = useState<Set<string>>(new Set());

  // Bulk-Modal (nur zur Auswahl, Versand erfolgt über Einzel-Modals)
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // Test-Modus (sendet an jtatwcook@gmail.com statt Universal Sport)
  const [testModus, setTestModus] = useState(false);

  // Email-Vorschau Modal
  const [showEmailVorschau, setShowEmailVorschau] = useState(false);
  const [emailVorschauDaten, setEmailVorschauDaten] = useState<EmailVorschauDaten | null>(null);
  const [emailVorschauSending, setEmailVorschauSending] = useState(false);

  // Bulk-Versand mit Modal für jeden Kunden
  const [bulkQueue, setBulkQueue] = useState<KundenGruppe[]>([]);
  const [bulkQueueIndex, setBulkQueueIndex] = useState(0);
  const [bulkQueueResult, setBulkQueueResult] = useState<{ success: number; failed: number; skipped: number }>({ success: 0, failed: 0, skipped: 0 });

  // Alle bestellten Projekte (Status >= auftragsbestaetigung)
  const bestellteProjekte = useMemo(() => {
    return [
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
    ];
  }, [projekteGruppiert]);

  // Lade Universal-Positionen aus den Dokumenten
  const ladeUniversalBestellungen = useCallback(async () => {
    setLoading(true);
    const alleBestellungen: UniversalBestellung[] = [];

    try {
      // Parallel alle Dokumente laden
      const dokumentPromises = bestellteProjekte.map(async (projekt) => {
        const projektId = (projekt as any).$id || projekt.id;

        // Lade Auftragsbestätigung (die enthält die bestellten Positionen)
        const abDokument = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');

        if (!abDokument) return [];

        // Parse die Daten
        const abDaten = ladeDokumentDaten<AuftragsbestaetigungsDaten>(abDokument);

        if (!abDaten || !abDaten.positionen) return [];

        // Filtere nach Universal-Artikeln (Flag oder Beschreibung)
        const universalPositionen = abDaten.positionen.filter(istUniversalPosition);

        // Erstelle Bestellungen für jede Universal-Position
        return universalPositionen.map((position) => ({
          projektId,
          projekt,
          position,
          lieferdatum: abDaten.lieferdatum || projekt.geplantesDatum,
          lieferKW: abDaten.lieferKW || projekt.lieferKW,
          lieferKWJahr: abDaten.lieferKWJahr || projekt.lieferKWJahr,
          auftragsbestaetigungsnummer: abDaten.auftragsbestaetigungsnummer || projekt.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: abDaten.auftragsbestaetigungsdatum || projekt.auftragsbestaetigungsdatum,
        }));
      });

      const results = await Promise.all(dokumentPromises);
      results.forEach((projektBestellungen) => {
        alleBestellungen.push(...projektBestellungen);
      });

      // Nach Lieferdatum sortieren (früheste zuerst)
      alleBestellungen.sort((a, b) => {
        const dateA = a.lieferdatum ? new Date(a.lieferdatum).getTime() : Infinity;
        const dateB = b.lieferdatum ? new Date(b.lieferdatum).getTime() : Infinity;
        return dateA - dateB;
      });

      setBestellungen(alleBestellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Universal-Bestellungen:', error);
    } finally {
      setLoading(false);
    }
  }, [bestellteProjekte]);

  useEffect(() => {
    ladeUniversalBestellungen();
  }, [ladeUniversalBestellungen]);

  // Email-Status im Hintergrund laden (nicht blockierend)
  // Lädt nur ECHTE Versendungen (nicht Testmodus) anhand des Empfängers
  const ladeEmailStatus = useCallback(async (projektIds: string[]) => {
    if (projektIds.length === 0) return;

    try {
      // Lade alle Email-Protokolle für Universal-Lieferscheine
      // Nur echte Versendungen (an Universal Sport, nicht an Test-Email)
      const response = await databases.listDocuments(
        DATABASE_ID,
        'email_protokoll',
        [
          Query.equal('dokumentTyp', 'lieferschein'),
          Query.equal('status', 'gesendet'),
          Query.contains('empfaenger', UNIVERSAL_SPORT_EMAIL), // Universal Sport
          Query.orderDesc('gesendetAm'),
          Query.limit(500),
        ]
      );

      const statusMap: EmailStatus = {};

      for (const doc of response.documents) {
        const projektId = doc.projektId as string;
        // Nur wenn projektId in unseren relevanten projektIds ist
        if (projektIds.includes(projektId) && !statusMap[projektId]) {
          statusMap[projektId] = {
            gesendetAm: doc.gesendetAm as string,
            dokumentNummer: doc.dokumentNummer as string,
          };
        }
      }

      setEmailStatus(statusMap);
    } catch (error) {
      console.error('Fehler beim Laden des Email-Status:', error);
    }
  }, []);

  // Email-Status nach Laden der Bestellungen aktualisieren
  useEffect(() => {
    if (bestellungen.length > 0) {
      const projektIds = [...new Set(bestellungen.map(b => b.projektId))];
      ladeEmailStatus(projektIds);
    }
  }, [bestellungen, ladeEmailStatus]);

  // Kunden-Gruppierung (für groupBy === 'kunde')
  // Sortiert: Nicht gesendet zuerst, dann nach Kundenname
  const kundenGruppen = useMemo((): KundenGruppe[] => {
    const gruppenMap = new Map<string, KundenGruppe>();

    bestellungen.forEach((bestellung) => {
      const key = bestellung.projektId;

      if (!gruppenMap.has(key)) {
        gruppenMap.set(key, {
          projektId: bestellung.projektId,
          kundenname: bestellung.projekt.kundenname,
          kundenPlzOrt: bestellung.projekt.kundenPlzOrt || '',
          abNummer: bestellung.auftragsbestaetigungsnummer || '',
          bestellungen: [],
          gesamtWert: 0,
          gesamtEK: 0,
          db1: 0,
        });
      }

      const gruppe = gruppenMap.get(key)!;
      gruppe.bestellungen.push(bestellung);
      const posWert = bestellung.position.gesamtpreis || 0;
      const posEK = (bestellung.position.einkaufspreis || 0) * (bestellung.position.menge || 1);
      gruppe.gesamtWert += posWert;
      gruppe.gesamtEK += posEK;
      gruppe.db1 += (posWert - posEK);
    });

    // Sortierung: Nicht gesendet zuerst, dann alphabetisch
    return Array.from(gruppenMap.values()).sort((a, b) => {
      const aGesendet = !!emailStatus[a.projektId];
      const bGesendet = !!emailStatus[b.projektId];

      // Nicht gesendet zuerst
      if (!aGesendet && bGesendet) return -1;
      if (aGesendet && !bGesendet) return 1;

      // Dann alphabetisch
      return a.kundenname.localeCompare(b.kundenname);
    });
  }, [bestellungen, emailStatus]);

  // Statistiken für Header
  const versandStats = useMemo(() => {
    const gesamt = kundenGruppen.length;
    const gesendet = kundenGruppen.filter(g => emailStatus[g.projektId]).length;
    const offen = gesamt - gesendet;
    return { gesamt, gesendet, offen };
  }, [kundenGruppen, emailStatus]);

  // Gruppierte Bestellungen (für andere Gruppierungen)
  const gruppierteDaten = useMemo(() => {
    if (groupBy === 'none') {
      return { 'Alle Bestellungen': bestellungen };
    }

    if (groupBy === 'kunde') {
      // Wird separat gehandhabt
      return {};
    }

    const gruppen: Record<string, UniversalBestellung[]> = {};

    bestellungen.forEach((bestellung) => {
      let key: string;

      if (groupBy === 'lieferdatum') {
        if (bestellung.lieferKW && bestellung.lieferKWJahr) {
          key = `KW ${bestellung.lieferKW} / ${bestellung.lieferKWJahr}`;
        } else if (bestellung.lieferdatum) {
          const date = new Date(bestellung.lieferdatum);
          key = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        } else {
          key = 'Ohne Lieferdatum';
        }
      } else if (groupBy === 'status') {
        const config = getStatusConfig(bestellung.projekt.status);
        key = config.label;
      } else {
        key = 'Alle';
      }

      if (!gruppen[key]) {
        gruppen[key] = [];
      }
      gruppen[key].push(bestellung);
    });

    return gruppen;
  }, [bestellungen, groupBy]);

  // Summen berechnen
  const summen = useMemo(() => {
    const gesamtWert = bestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);
    const gesamtEK = bestellungen.reduce((sum, b) => sum + ((b.position.einkaufspreis || 0) * (b.position.menge || 1)), 0);
    const db1 = gesamtWert - gesamtEK;
    const db1Prozent = gesamtWert > 0 ? (db1 / gesamtWert) * 100 : 0;
    return { gesamtWert, gesamtEK, db1, db1Prozent, anzahl: bestellungen.length };
  }, [bestellungen]);

  // Erstelle LieferscheinDaten für eine Kundengruppe
  const erstelleLieferscheinDaten = async (gruppe: KundenGruppe): Promise<{ daten: LieferscheinDaten; lieferscheinnummer: string }> => {
    const stammdaten = await getStammdatenOderDefault();
    const lieferscheinnummer = await generiereNaechsteDokumentnummer('lieferschein');
    const heute = new Date().toISOString().split('T')[0];
    const ersteProjekt = gruppe.bestellungen[0].projekt;

    // Positionen konvertieren (OHNE Preise!)
    const positionen: LieferscheinPosition[] = gruppe.bestellungen.map((b, idx) => ({
      id: `pos-${idx}`,
      artikelnummer: b.position.artikelnummer || '',
      artikel: b.position.bezeichnung.replace(/^Universal:\s*/i, ''),
      beschreibung: b.position.beschreibung?.replace(/^Universal:\s*/i, '') || '',
      menge: b.position.menge,
      einheit: b.position.einheit || 'Stk',
    }));

    const daten: LieferscheinDaten = {
      // Firmendaten
      firmenname: stammdaten.firmenname,
      firmenstrasse: stammdaten.firmenstrasse || '',
      firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
      firmenTelefon: stammdaten.firmenTelefon || '',
      firmenEmail: stammdaten.firmenEmail || 'info@tennismehl.com',
      firmenWebsite: stammdaten.firmenWebsite || 'www.tennismehl24.de',

      // Kundendaten (Lieferadresse = Vereinsadresse)
      kundenname: gruppe.kundenname,
      kundenstrasse: ersteProjekt.kundenstrasse || '',
      kundenPlzOrt: gruppe.kundenPlzOrt,
      kundennummer: ersteProjekt.kundennummer || '',
      ansprechpartner: ersteProjekt.ansprechpartner || '',

      // Lieferschein-spezifisch
      lieferscheinnummer,
      lieferdatum: heute,
      bestellnummer: gruppe.abNummer,

      // Positionen
      positionen,
    };

    return { daten, lieferscheinnummer };
  };

  // Lieferschein PDF generieren und öffnen
  const handleLieferscheinPDF = async (gruppe: KundenGruppe) => {
    try {
      const { daten } = await erstelleLieferscheinDaten(gruppe);
      // einfach = true: Ohne Einleitung, ohne Abdeckung/PE Folien, ohne Empfangsbestätigung
      const pdf = await generiereLieferscheinPDF(daten, undefined, true);
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Fehler beim Erstellen des Lieferscheins:', error);
      alert('Fehler beim Erstellen des Lieferscheins. Bitte versuchen Sie es erneut.');
    }
  };

  // Interne Funktion zum Öffnen des Email-Vorschau Modals
  const oeffneEmailVorschauIntern = async (gruppe: KundenGruppe) => {
    try {
      const { daten, lieferscheinnummer } = await erstelleLieferscheinDaten(gruppe);
      const pdf = await generiereLieferscheinPDF(daten, undefined, true);
      const pdfBlob = pdf.output('blob');

      // Lieferwoche aus der ersten Bestellung holen
      const ersteBestellung = gruppe.bestellungen[0];
      const lieferKW = ersteBestellung.lieferKW;
      const lieferKWJahr = ersteBestellung.lieferKWJahr;
      const lieferKWText = lieferKW
        ? `Bitte Lieferung in KW ${lieferKW}${lieferKWJahr ? '/' + lieferKWJahr : ''}.`
        : '';

      // Signatur aus Stammdaten laden
      const emailTemplate = await generiereStandardEmail('angebot', lieferscheinnummer, gruppe.kundenname);
      const signaturHtml = emailTemplate.signatur || '';

      // Email-Body erstellen (ohne Signatur, wird später angehängt)
      const emailText = `Hallo ${UNIVERSAL_SPORT_NAME},

bitte Versand der Ware unter Beilage des anhängenden Lieferscheins.
${lieferKWText ? '\n' + lieferKWText : ''}`;

      // Dateiname
      const datumFormatiert = new Date().toLocaleDateString('de-DE').replace(/\./g, '-');
      const kundennameSauber = gruppe.kundenname.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').substring(0, 40).trim();
      const pdfDateiname = `Lieferschein_${kundennameSauber}_${datumFormatiert}.pdf`;

      // Empfänger basierend auf Testmodus
      const empfaenger = testModus ? TEST_EMAIL : UNIVERSAL_SPORT_EMAIL;

      // Modal-Daten setzen
      setEmailVorschauDaten({
        gruppe,
        empfaenger,
        betreff: `${testModus ? '[TEST] ' : ''}Bestellung - ${gruppe.kundenname}`,
        emailText,
        signatur: signaturHtml,
        lieferKW,
        lieferKWJahr,
        pdfBlob,
        pdfDateiname,
        lieferscheinnummer,
      });
      setShowEmailVorschau(true);
    } catch (error) {
      console.error('Fehler beim Vorbereiten der Email:', error);
      throw error;
    }
  };

  // Email-Vorschau Modal öffnen (für Einzelversand)
  const oeffneEmailVorschau = async (gruppe: KundenGruppe) => {
    setSendingProjektIds(prev => new Set([...prev, gruppe.projektId]));

    try {
      await oeffneEmailVorschauIntern(gruppe);
    } catch (error) {
      alert('Fehler beim Vorbereiten der Email. Bitte versuchen Sie es erneut.');
    } finally {
      setSendingProjektIds(prev => {
        const next = new Set(prev);
        next.delete(gruppe.projektId);
        return next;
      });
    }
  };

  // Email aus Vorschau-Modal senden
  const sendeAusVorschau = async () => {
    if (!emailVorschauDaten) return;

    setEmailVorschauSending(true);
    const { gruppe, empfaenger, betreff, emailText, signatur, pdfBlob, pdfDateiname, lieferscheinnummer } = emailVorschauDaten;

    try {
      // PDF zu Base64
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // HTML-Body mit Signatur
      const htmlBody = wrapInEmailTemplate(emailText, signatur);

      const result = await sendeEmailMitPdf({
        empfaenger,
        absender: TENNISMEHL_ABSENDER,
        betreff,
        htmlBody,
        pdfBase64: base64,
        pdfDateiname,
        projektId: gruppe.projektId,
        dokumentTyp: 'lieferschein',
        dokumentNummer: lieferscheinnummer,
        testModus,
        skipProtokoll: testModus,
      });

      if (result.success) {
        if (!testModus) {
          setEmailStatus(prev => ({
            ...prev,
            [gruppe.projektId]: {
              gesendetAm: new Date().toISOString(),
              dokumentNummer: lieferscheinnummer,
            },
          }));
        }

        setJustSentProjektIds(prev => new Set([...prev, gruppe.projektId]));
        setTimeout(() => {
          setJustSentProjektIds(prev => {
            const next = new Set(prev);
            next.delete(gruppe.projektId);
            return next;
          });
        }, testModus ? 5000 : 3000);

        // Bulk-Queue: Erfolg zählen und nächsten laden
        if (bulkQueue.length > 0) {
          setBulkQueueResult(prev => ({ ...prev, success: prev.success + 1 }));
          ladeNaechstenAusBulkQueue();
        } else {
          setShowEmailVorschau(false);
          setEmailVorschauDaten(null);
        }
      } else {
        throw new Error(result.error || 'Email konnte nicht gesendet werden');
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      alert(`Fehler beim Senden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      // Bei Fehler im Bulk-Modus: Fehler zählen, aber weitermachen
      if (bulkQueue.length > 0) {
        setBulkQueueResult(prev => ({ ...prev, failed: prev.failed + 1 }));
        ladeNaechstenAusBulkQueue();
      }
    } finally {
      setEmailVorschauSending(false);
    }
  };

  // Nächsten Kunden aus Bulk-Queue laden
  const ladeNaechstenAusBulkQueue = async () => {
    const nextIndex = bulkQueueIndex + 1;
    if (nextIndex >= bulkQueue.length) {
      // Alle fertig - Zusammenfassung zeigen
      setShowEmailVorschau(false);
      setEmailVorschauDaten(null);
      setBulkQueue([]);
      setBulkQueueIndex(0);
      // Ergebnis-Alert
      const result = bulkQueueResult;
      setTimeout(() => {
        alert(`Bulk-Versand abgeschlossen!\n\nErfolgreich: ${result.success + 1}\nFehlgeschlagen: ${result.failed}\nÜbersprungen: ${result.skipped}`);
        setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });
      }, 100);
      return;
    }

    setBulkQueueIndex(nextIndex);
    const nextGruppe = bulkQueue[nextIndex];
    await oeffneEmailVorschauIntern(nextGruppe);
  };

  // Kunden überspringen (im Bulk-Modus)
  const ueberspringeImBulk = () => {
    if (bulkQueue.length > 0) {
      setBulkQueueResult(prev => ({ ...prev, skipped: prev.skipped + 1 }));
      ladeNaechstenAusBulkQueue();
    } else {
      setShowEmailVorschau(false);
      setEmailVorschauDaten(null);
    }
  };

  // Bulk-Versand abbrechen
  const abbrechenBulkVersand = () => {
    const result = bulkQueueResult;
    setShowEmailVorschau(false);
    setEmailVorschauDaten(null);
    setBulkQueue([]);
    setBulkQueueIndex(0);
    if (result.success > 0 || result.failed > 0 || result.skipped > 0) {
      alert(`Bulk-Versand abgebrochen!\n\nErfolgreich: ${result.success}\nFehlgeschlagen: ${result.failed}\nÜbersprungen: ${result.skipped}`);
    }
    setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });
  };

  // PDF-Vorschau öffnen
  const oeffnePdfVorschau = () => {
    if (!emailVorschauDaten?.pdfBlob) return;
    const url = URL.createObjectURL(emailVorschauDaten.pdfBlob);
    window.open(url, '_blank');
  };

  // Bulk-Versand starten (mit Modal für jeden Kunden)
  const handleBulkSend = async () => {
    const selectedGruppen = kundenGruppen.filter(g => bulkSelectedIds.has(g.projektId));
    if (selectedGruppen.length === 0) return;

    // Bulk-Modal schließen
    setShowBulkModal(false);

    // Queue initialisieren
    setBulkQueue(selectedGruppen);
    setBulkQueueIndex(0);
    setBulkQueueResult({ success: 0, failed: 0, skipped: 0 });

    // Erstes Modal öffnen
    try {
      await oeffneEmailVorschauIntern(selectedGruppen[0]);
    } catch (error) {
      console.error('Fehler beim Starten des Bulk-Versands:', error);
      alert('Fehler beim Starten des Bulk-Versands.');
      setBulkQueue([]);
    }
  };

  // Bulk-Modal öffnen
  const openBulkModal = () => {
    // Alle nicht bereits gesendeten Kunden vorauswählen
    const nichtGesendet = kundenGruppen
      .filter(g => !emailStatus[g.projektId])
      .map(g => g.projektId);
    setBulkSelectedIds(new Set(nichtGesendet));
    setShowBulkModal(true);
  };

  // CSV Export
  const exportCSV = useCallback(() => {
    const headers = [
      'AB-Nr.',
      'AB-Datum',
      'Kundenname',
      'PLZ/Ort',
      'Artikelnr.',
      'Bezeichnung',
      'Menge',
      'Einheit',
      'VK (Netto)',
      'EK (Netto)',
      'Gesamtpreis',
      'DB1',
      'DB1 %',
      'Lieferdatum',
      'Liefer-KW',
      'Status',
    ];

    const rows = bestellungen.map((b) => {
      const vk = b.position.einzelpreis || 0;
      const ek = b.position.einkaufspreis || 0;
      const menge = b.position.menge || 1;
      const db1 = (vk - ek) * menge;
      const db1Prozent = vk > 0 ? ((vk - ek) / vk) * 100 : 0;

      return [
        b.auftragsbestaetigungsnummer || '',
        b.auftragsbestaetigungsdatum
          ? new Date(b.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')
          : '',
        b.projekt.kundenname || '',
        b.projekt.kundenPlzOrt || '',
        b.position.artikelnummer || '',
        b.position.bezeichnung || '',
        menge.toString().replace('.', ','),
        b.position.einheit || '',
        vk.toFixed(2).replace('.', ','),
        ek.toFixed(2).replace('.', ','),
        b.position.gesamtpreis?.toFixed(2).replace('.', ',') || '',
        db1.toFixed(2).replace('.', ','),
        db1Prozent.toFixed(1).replace('.', ',') + '%',
        b.lieferdatum ? new Date(b.lieferdatum).toLocaleDateString('de-DE') : '',
        b.lieferKW ? `KW ${b.lieferKW}${b.lieferKWJahr ? '/' + b.lieferKWJahr : ''}` : '',
        getStatusConfig(b.projekt.status).label,
      ];
    });

    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Universal_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [bestellungen]);

  // Toggle Gruppe
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Universal-Bestellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card mit Summen */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-xl backdrop-blur-sm">
              <ShoppingCart className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Universal Bestellungen</h2>
              <p className="text-amber-100 mt-1">
                Alle bestellten Universal-Artikel aus dem Katalog
              </p>
            </div>
          </div>

          <button
            onClick={ladeUniversalBestellungen}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className={`grid gap-4 mt-6 ${groupBy === 'kunde' ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {/* Versand-Status KPIs (nur bei Kunden-Gruppierung) */}
          {groupBy === 'kunde' && (
            <>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border-2 border-white/20">
                <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                  <Users className="w-4 h-4" />
                  Kunden gesamt
                </div>
                <div className="text-3xl font-bold">{versandStats.gesamt}</div>
              </div>
              <div className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 ${versandStats.offen > 0 ? 'border-2 border-red-400 bg-red-500/20' : ''}`}>
                <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                  <X className="w-4 h-4" />
                  Offen
                </div>
                <div className={`text-3xl font-bold ${versandStats.offen > 0 ? 'text-red-200' : ''}`}>
                  {versandStats.offen}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border-2 border-green-400/50">
                <div className="flex items-center gap-2 text-green-200 text-sm mb-1">
                  <Check className="w-4 h-4" />
                  Gesendet
                </div>
                <div className="text-3xl font-bold text-green-200">{versandStats.gesendet}</div>
              </div>
            </>
          )}

          {/* Standard KPIs */}
          {groupBy !== 'kunde' && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                <Package className="w-4 h-4" />
                Positionen
              </div>
              <div className="text-3xl font-bold">{summen.anzahl}</div>
            </div>
          )}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Gesamtwert (VK)
            </div>
            <div className="text-2xl font-bold">
              {summen.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <Layers className="w-4 h-4" />
              DB1 (Marge)
            </div>
            <div className="text-2xl font-bold">
              {summen.db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Gruppierung */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Gruppieren:</span>
          <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setGroupBy('kunde')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'kunde'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Kunde
            </button>
            <button
              onClick={() => setGroupBy('lieferdatum')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'lieferdatum'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Lieferdatum
            </button>
            <button
              onClick={() => setGroupBy('status')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'status'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              Status
            </button>
            <button
              onClick={() => setGroupBy('none')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                groupBy === 'none'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              Keine
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Test-Modus Toggle (nur bei Kunden-Gruppierung) */}
          {groupBy === 'kunde' && (
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              testModus
                ? 'bg-yellow-100 dark:bg-yellow-900/50 border-2 border-yellow-400'
                : 'bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600'
            }`}>
              <input
                type="checkbox"
                checked={testModus}
                onChange={(e) => setTestModus(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
              />
              <span className={`text-sm font-medium ${testModus ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-600 dark:text-gray-400'}`}>
                Test-Modus
              </span>
              {testModus && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  → {TEST_EMAIL}
                </span>
              )}
            </label>
          )}

          {/* Bulk-Versand Button (nur bei Kunden-Gruppierung) */}
          {groupBy === 'kunde' && kundenGruppen.length > 0 && (
            <button
              onClick={openBulkModal}
              className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg ${
                testModus ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Send className="w-5 h-5" />
              {testModus ? 'Test: ' : ''}Alle Lieferscheine senden
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {kundenGruppen.filter(g => !emailStatus[g.projektId]).length}
              </span>
            </button>
          )}

          {/* Export Button */}
          <button
            onClick={exportCSV}
            disabled={bestellungen.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg"
          >
            <Download className="w-5 h-5" />
            CSV Export
          </button>
        </div>
      </div>

      {/* Bestellungen Liste */}
      {bestellungen.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Keine Universal-Bestellungen
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Es gibt aktuell keine bestätigten Aufträge mit Universal-Artikeln.
          </p>
        </div>
      ) : groupBy === 'kunde' ? (
        /* === KUNDEN-GRUPPIERUNG === */
        <div className="space-y-3">
          {kundenGruppen.map((gruppe) => {
            const isExpanded = expandedGroups.has(gruppe.projektId) || expandedGroups.has('alle');
            const status = emailStatus[gruppe.projektId];
            const isSending = sendingProjektIds.has(gruppe.projektId);
            const justSent = justSentProjektIds.has(gruppe.projektId);
            const istGesendet = !!status;

            return (
              <div
                key={gruppe.projektId}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-lg overflow-hidden transition-all ${
                  istGesendet
                    ? 'border-2 border-green-400 dark:border-green-600'
                    : 'border-2 border-orange-400 dark:border-orange-600'
                }`}
              >
                {/* Status-Indikator links */}
                <div className="flex">
                  <div className={`w-2 flex-shrink-0 ${istGesendet ? 'bg-green-500' : 'bg-orange-500'}`} />

                  <div className="flex-1">
                    {/* Gruppen-Header */}
                    <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => toggleGroup(gruppe.projektId)}
                        className="flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-750 rounded-lg px-2 py-1 -ml-2 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                        <div className="flex items-center gap-3">
                          {/* Status-Icon */}
                          {istGesendet ? (
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                              <Send className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            </div>
                          )}
                          <div className="text-left">
                            <span className="font-semibold text-gray-900 dark:text-white">{gruppe.kundenname}</span>
                            {gruppe.kundenPlzOrt && (
                              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                                {gruppe.kundenPlzOrt}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded">
                          {gruppe.abNummer}
                        </span>
                        {/* Lieferwoche */}
                        {gruppe.bestellungen[0]?.lieferKW && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm rounded-full flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            KW {gruppe.bestellungen[0].lieferKW}
                            {gruppe.bestellungen[0].lieferKWJahr && `/${gruppe.bestellungen[0].lieferKWJahr}`}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm rounded-full">
                          {gruppe.bestellungen.length} Pos.
                        </span>
                      </button>

                      <div className="flex items-center gap-3">
                        {/* Summen */}
                        <div className="text-sm text-gray-600 dark:text-gray-400 hidden lg:flex items-center gap-4">
                          <span className="font-medium">
                            {gruppe.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>

                        {/* Email-Status Badge - sehr prominent */}
                        {status ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg">
                            <Check className="w-4 h-4" />
                            <div className="text-sm">
                              <div className="font-semibold">Gesendet</div>
                              <div className="text-xs opacity-80">
                                {new Date(status.gesendetAm).toLocaleDateString('de-DE')} • LS {status.dokumentNummer}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-sm rounded-lg font-medium">
                            Offen
                          </span>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLieferscheinPDF(gruppe);
                            }}
                            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-sm"
                            title="Lieferschein PDF öffnen"
                          >
                            <FileText className="w-4 h-4" />
                            <span className="hidden md:inline">PDF</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              oeffneEmailVorschau(gruppe);
                            }}
                            disabled={isSending}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-sm font-medium ${
                              justSent
                                ? 'bg-green-600 text-white'
                                : isSending
                                ? 'bg-green-400 text-white cursor-wait'
                                : istGesendet
                                ? 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-green-600 hover:text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                            title={istGesendet ? 'Erneut senden' : `An ${UNIVERSAL_SPORT_NAME} senden`}
                          >
                            {isSending ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="hidden md:inline">Sende...</span>
                              </>
                            ) : justSent ? (
                              <>
                                <Check className="w-4 h-4" />
                                <span className="hidden md:inline">Gesendet!</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                <span className="hidden md:inline">{istGesendet ? 'Nochmal' : 'Senden'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Positionen Tabelle */}
                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-gray-200 dark:border-slate-700">
                        <table className="w-full">
                          <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold">Art.-Nr.</th>
                              <th className="px-4 py-2 text-left font-semibold">Artikel</th>
                              <th className="px-4 py-2 text-right font-semibold">Menge</th>
                              <th className="px-4 py-2 text-right font-semibold">VK</th>
                              <th className="px-4 py-2 text-right font-semibold">EK</th>
                              <th className="px-4 py-2 text-right font-semibold">DB1</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {gruppe.bestellungen.map((bestellung, idx) => {
                              const vk = bestellung.position.einzelpreis || 0;
                              const ek = bestellung.position.einkaufspreis || 0;
                              const menge = bestellung.position.menge || 1;
                              const db1 = (vk - ek) * menge;

                              return (
                                <tr
                                  key={`${bestellung.projektId}-${idx}`}
                                  onClick={() => onProjektClick(bestellung.projekt)}
                                  className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                >
                                  <td className="px-4 py-2 font-mono text-sm text-gray-600 dark:text-gray-400">
                                    {bestellung.position.artikelnummer || '-'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="font-medium text-gray-900 dark:text-white">
                                      {bestellung.position.bezeichnung.replace(/^Universal:\s*/i, '')}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="font-bold text-gray-900 dark:text-white">
                                      {menge.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                      {bestellung.position.einheit || 'Stk'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">
                                    {vk.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                                    {ek.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className={`font-semibold ${db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 dark:bg-slate-800 font-semibold">
                            <tr>
                              <td colSpan={3} className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">
                                Summe:
                              </td>
                              <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                {gruppe.gesamtWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                                {gruppe.gesamtEK.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className={`${gruppe.db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {gruppe.db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(gruppierteDaten).map(([gruppenKey, gruppenBestellungen]) => {
            const isExpanded = expandedGroups.has(gruppenKey) || expandedGroups.has('alle');
            const gruppenWert = gruppenBestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);
            const gruppenEK = gruppenBestellungen.reduce((sum, b) => sum + ((b.position.einkaufspreis || 0) * (b.position.menge || 1)), 0);
            const gruppenDB1 = gruppenWert - gruppenEK;

            return (
              <div
                key={gruppenKey}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Gruppen-Header */}
                <button
                  onClick={() => toggleGroup(gruppenKey)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">{gruppenKey}</span>
                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm rounded-full">
                      {gruppenBestellungen.length} Position{gruppenBestellungen.length !== 1 ? 'en' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">
                      DB1: {gruppenDB1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {gruppenWert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                </button>

                {/* Bestellungen Tabelle */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">AB-Nr.</th>
                          <th className="px-4 py-3 text-left font-semibold">Kunde</th>
                          <th className="px-4 py-3 text-left font-semibold">Artikel</th>
                          <th className="px-4 py-3 text-right font-semibold">Menge</th>
                          <th className="px-4 py-3 text-right font-semibold">VK</th>
                          <th className="px-4 py-3 text-right font-semibold">EK</th>
                          <th className="px-4 py-3 text-right font-semibold">DB1</th>
                          <th className="px-4 py-3 text-left font-semibold">Lieferdatum</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {gruppenBestellungen.map((bestellung, idx) => {
                          const statusConfig = getStatusConfig(bestellung.projekt.status);
                          const StatusIcon = statusConfig.icon;
                          const vk = bestellung.position.einzelpreis || 0;
                          const ek = bestellung.position.einkaufspreis || 0;
                          const menge = bestellung.position.menge || 1;
                          const db1 = (vk - ek) * menge;
                          const db1Prozent = vk > 0 ? ((vk - ek) / vk) * 100 : 0;

                          return (
                            <tr
                              key={`${bestellung.projektId}-${idx}`}
                              onClick={() => onProjektClick(bestellung.projekt)}
                              className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                                  {bestellung.auftragsbestaetigungsnummer || '-'}
                                </span>
                                {bestellung.auftragsbestaetigungsdatum && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {new Date(bestellung.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {bestellung.projekt.kundenname}
                                  </span>
                                </div>
                                {bestellung.projekt.kundenPlzOrt && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {bestellung.projekt.kundenPlzOrt}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {bestellung.position.bezeichnung}
                                </div>
                                {bestellung.position.artikelnummer && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                                    {bestellung.position.artikelnummer}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {menge.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                  {bestellung.position.einheit || 'Stk'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                                {vk.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                                {ek.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className={`font-semibold ${db1 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {db1.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {db1Prozent.toFixed(1)}%
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {bestellung.lieferKW ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-amber-500" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      KW {bestellung.lieferKW}
                                      {bestellung.lieferKWJahr && (
                                        <span className="text-gray-500">/{bestellung.lieferKWJahr}</span>
                                      )}
                                    </span>
                                  </div>
                                ) : bestellung.lieferdatum ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-amber-500" />
                                    <span className="text-gray-900 dark:text-white">
                                      {new Date(bestellung.lieferdatum).toLocaleDateString('de-DE')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
                                >
                                  <StatusIcon className="w-3.5 h-3.5" />
                                  {statusConfig.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === BULK-VERSAND MODAL === */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Lieferscheine versenden
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  An {UNIVERSAL_SPORT_NAME} ({UNIVERSAL_SPORT_EMAIL})
                </p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body - Auswahl-Liste */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {/* Info-Hinweis */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                Für jeden ausgewählten Kunden öffnet sich ein Vorschau-Modal zur Überprüfung vor dem Senden.
              </div>
                <div className="space-y-2">
                  {/* Alle auswählen */}
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-750 transition-colors">
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.size === kundenGruppen.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBulkSelectedIds(new Set(kundenGruppen.map(g => g.projektId)));
                        } else {
                          setBulkSelectedIds(new Set());
                        }
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Alle auswählen ({kundenGruppen.length})
                    </span>
                  </label>

                  <div className="border-t border-gray-200 dark:border-slate-700 my-3"></div>

                  {/* Kunden-Liste */}
                  {kundenGruppen.map((gruppe) => {
                    const status = emailStatus[gruppe.projektId];
                    const isSelected = bulkSelectedIds.has(gruppe.projektId);

                    return (
                      <label
                        key={gruppe.projektId}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(bulkSelectedIds);
                            if (e.target.checked) {
                              next.add(gruppe.projektId);
                            } else {
                              next.delete(gruppe.projektId);
                            }
                            setBulkSelectedIds(next);
                          }}
                          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {gruppe.kundenname}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({gruppe.bestellungen.length} Pos.)
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {gruppe.abNummer}
                          </div>
                        </div>
                        {status && (
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-full whitespace-nowrap">
                            Bereits gesendet
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleBulkSend}
                disabled={bulkSelectedIds.size === 0}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                <Send className="w-5 h-5" />
                {bulkSelectedIds.size} Kunden prüfen & senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email-Vorschau Modal */}
      {showEmailVorschau && emailVorschauDaten && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-xl">
              <div className="flex items-center gap-3">
                <Mail className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    E-Mail Vorschau
                    {bulkQueue.length > 0 && (
                      <span className="ml-2 text-green-200 font-normal">
                        ({bulkQueueIndex + 1} von {bulkQueue.length})
                      </span>
                    )}
                  </h2>
                  <p className="text-green-100 text-sm">{emailVorschauDaten.gruppe.kundenname}</p>
                </div>
              </div>
              <button
                onClick={bulkQueue.length > 0 ? abbrechenBulkVersand : () => {
                  setShowEmailVorschau(false);
                  setEmailVorschauDaten(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title={bulkQueue.length > 0 ? 'Bulk-Versand abbrechen' : 'Schließen'}
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Testmodus Hinweis */}
              {testModus && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Testmodus aktiv</span>
                  <span className="text-amber-700 dark:text-amber-300 text-sm">- wird an {TEST_EMAIL} gesendet</span>
                </div>
              )}

              {/* Empfänger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Empfänger
                </label>
                <div className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-gray-200">
                  {emailVorschauDaten.empfaenger}
                </div>
              </div>

              {/* Betreff */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Betreff
                </label>
                <input
                  type="text"
                  value={emailVorschauDaten.betreff}
                  onChange={(e) => setEmailVorschauDaten(prev => prev ? { ...prev, betreff: e.target.value } : null)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Lieferwoche Info */}
              {emailVorschauDaten.lieferKW && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-gray-600 dark:text-gray-400">Gewünschte Lieferung:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    KW {emailVorschauDaten.lieferKW}{emailVorschauDaten.lieferKWJahr ? `/${emailVorschauDaten.lieferKWJahr}` : ''}
                  </span>
                </div>
              )}

              {/* E-Mail Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nachricht
                </label>
                <TipTapEditor
                  content={emailVorschauDaten.emailText}
                  onChange={(html) => setEmailVorschauDaten(prev => prev ? { ...prev, emailText: html } : null)}
                  placeholder="E-Mail Text..."
                  minHeight="150px"
                />
              </div>

              {/* Signatur Vorschau */}
              {emailVorschauDaten.signatur && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Signatur (wird automatisch angehängt)
                  </label>
                  <div
                    className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: emailVorschauDaten.signatur }}
                  />
                </div>
              )}

              {/* Anhang */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Anhang
                </label>
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{emailVorschauDaten.pdfDateiname}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(emailVorschauDaten.pdfBlob.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={oeffnePdfVorschau}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    Vorschau
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-b-xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={bulkQueue.length > 0 ? abbrechenBulkVersand : () => {
                    setShowEmailVorschau(false);
                    setEmailVorschauDaten(null);
                  }}
                  disabled={emailVorschauSending}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {bulkQueue.length > 0 ? 'Abbrechen' : 'Schließen'}
                </button>
                {bulkQueue.length > 0 && (
                  <button
                    onClick={ueberspringeImBulk}
                    disabled={emailVorschauSending}
                    className="px-4 py-2 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                  >
                    Überspringen
                  </button>
                )}
              </div>
              <button
                onClick={sendeAusVorschau}
                disabled={emailVorschauSending}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                {emailVorschauSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Wird gesendet...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {bulkQueue.length > 0 ? 'Senden & Weiter' : 'E-Mail senden'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalView;
