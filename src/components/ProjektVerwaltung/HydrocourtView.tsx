import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Droplets,
  Download,
  Calendar,
  Package,
  Building2,
  MapPin,
  FileSignature,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  List,
  Truck,
  FileText,
  CheckCircle2,
  Send,
  Check,
  X,
  Loader2,
  Mail,
  Clock,
  PackageCheck,
  AlertCircle,
  LayoutGrid,
} from 'lucide-react';
import { Projekt, ProjektStatus, HydrocourtStatus } from '../../types/projekt';
import { AuftragsbestaetigungsDaten, Position } from '../../types/projektabwicklung';
import { ladeDokumentNachTyp, ladeDokumentDaten } from '../../services/projektabwicklungDokumentService';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { sendeEmailMitPdf, wrapInEmailTemplate } from '../../services/emailSendService';
import { generiereStandardEmail } from '../../utils/emailHelpers';

// Hydrocourt-Bestellung Interface
interface HydrocourtBestellung {
  projektId: string;
  projekt: Projekt;
  position: Position;
  lieferdatum?: string;
  lieferKW?: number;
  lieferKWJahr?: number;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
  // Ansprechpartner aus AB-Daten (nicht aus Projekt!)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };
  // AKTUELLER Kundenname (aus SaisonKunde, nicht aus Projekt!)
  aktuellerKundenname?: string;
}

// Editierbare Daten für das Send-Modal
interface EditierbareSendDaten {
  projektId: string;
  kundenname: string;
  lieferKW: string; // Als String für Input
  lieferdatum: string;
  ansprechpartnerName: string;
  ansprechpartnerTelefon: string;
  menge: number;
  einheit: string;
}

// Props
interface HydrocourtViewProps {
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

// Hydrocourt Status Konfiguration
const HYDROCOURT_STATUS_CONFIG: Record<HydrocourtStatus, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<any>;
}> = {
  offen: {
    label: 'Offen',
    color: 'text-rose-700 dark:text-rose-300',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    borderColor: 'border-rose-300 dark:border-rose-700',
    icon: Clock,
  },
  bestellt: {
    label: 'Bestellt',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: Package,
  },
  versendet: {
    label: 'Versendet',
    color: 'text-sky-700 dark:text-sky-300',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    borderColor: 'border-sky-300 dark:border-sky-700',
    icon: Truck,
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    icon: CheckCircle2,
  },
};

// Schwab Kontaktdaten
const SCHWAB_EMAIL = 'schwab-th@t-online.de';
const SCHWAB_NAME = 'Herr Schwab';
const TENNISMEHL_ABSENDER = 'info@tennismehl.com';
const TEST_EMAIL = 'jtatwcook@gmail.com';

// Ansichts-Modus
type ViewMode = 'workflow' | 'liste';
type GroupBy = 'none' | 'lieferdatum' | 'status';

const HydrocourtView = ({ projekteGruppiert, onProjektClick }: HydrocourtViewProps) => {
  const [bestellungen, setBestellungen] = useState<HydrocourtBestellung[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('workflow');
  const [groupBy, setGroupBy] = useState<GroupBy>('lieferdatum');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['alle']));

  // Auswahl für Sammelbestellung
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal-States
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingState, setSendingState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sendError, setSendError] = useState<string | null>(null);

  // Tracking-Eingabe
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');

  // Test-Modus
  const [testModus, setTestModus] = useState(false);

  // Editierbare Daten für Send-Modal
  const [editierbareDaten, setEditierbareDaten] = useState<EditierbareSendDaten[]>([]);

  // Alle bestellten Projekte (Status >= auftragsbestaetigung)
  const bestellteProjekte = useMemo(() => {
    return [
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
    ];
  }, [projekteGruppiert]);

  // Lade Hydrocourt-Positionen aus den Dokumenten
  const ladeHydrocourtBestellungen = useCallback(async () => {
    setLoading(true);
    const alleBestellungen: HydrocourtBestellung[] = [];

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

        // Filtere nach TM-HYC Artikelnummer (exakt)
        const hydrocourtPositionen = abDaten.positionen.filter(
          (pos) => pos.artikelnummer === 'TM-HYC'
        );

        // Kundendaten laden: Aktueller Name + Ansprechpartner (falls nicht in AB)
        let kundenAnsprechpartner: { name: string; telefon: string } | undefined;
        let aktuellerKundenname: string | undefined;

        if (projekt.kundeId) {
          try {
            const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
            if (kunde) {
              // AKTUELLER Kundenname aus SaisonKunde (nicht der veraltete aus Projekt!)
              aktuellerKundenname = kunde.name;

              // Ansprechpartner als Fallback
              if (!abDaten.dispoAnsprechpartner && kunde.dispoAnsprechpartner) {
                kundenAnsprechpartner = kunde.dispoAnsprechpartner;
              }
            }
          } catch (err) {
            // Ignorieren - Fallback ist optional
          }
        }

        // Erstelle Bestellungen für jede Hydrocourt-Position
        return hydrocourtPositionen.map((position) => ({
          projektId,
          projekt,
          position,
          lieferdatum: abDaten.lieferdatum || projekt.geplantesDatum,
          lieferKW: abDaten.lieferKW || projekt.lieferKW,
          lieferKWJahr: abDaten.lieferKWJahr || projekt.lieferKWJahr,
          auftragsbestaetigungsnummer: abDaten.auftragsbestaetigungsnummer || projekt.auftragsbestaetigungsnummer,
          auftragsbestaetigungsdatum: abDaten.auftragsbestaetigungsdatum || projekt.auftragsbestaetigungsdatum,
          // Ansprechpartner: AB > Projekt > Kunde (Fallback-Kette)
          dispoAnsprechpartner: abDaten.dispoAnsprechpartner || projekt.dispoAnsprechpartner || kundenAnsprechpartner,
          // AKTUELLER Kundenname (aus SaisonKunde, Fallback auf Projekt)
          aktuellerKundenname: aktuellerKundenname || projekt.kundenname,
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
      console.error('Fehler beim Laden der Hydrocourt-Bestellungen:', error);
    } finally {
      setLoading(false);
    }
  }, [bestellteProjekte]);

  useEffect(() => {
    ladeHydrocourtBestellungen();
  }, [ladeHydrocourtBestellungen]);

  // Bestellungen nach Hydrocourt-Status gruppieren
  const bestellungenNachStatus = useMemo(() => {
    const gruppen: Record<HydrocourtStatus, HydrocourtBestellung[]> = {
      offen: [],
      bestellt: [],
      versendet: [],
      abgeschlossen: [],
    };

    bestellungen.forEach((bestellung) => {
      // Hydrocourt-Status aus Projekt lesen (Default: 'offen')
      const status = bestellung.projekt.hydrocourtStatus || 'offen';
      gruppen[status].push(bestellung);
    });

    return gruppen;
  }, [bestellungen]);

  // KPI-Statistiken
  const stats = useMemo(() => {
    const mengenProStatus = {
      offen: bestellungenNachStatus.offen.reduce((sum, b) => sum + (b.position.menge || 0), 0),
      bestellt: bestellungenNachStatus.bestellt.reduce((sum, b) => sum + (b.position.menge || 0), 0),
      versendet: bestellungenNachStatus.versendet.reduce((sum, b) => sum + (b.position.menge || 0), 0),
      abgeschlossen: bestellungenNachStatus.abgeschlossen.reduce((sum, b) => sum + (b.position.menge || 0), 0),
    };

    return {
      offen: { anzahl: bestellungenNachStatus.offen.length, menge: mengenProStatus.offen },
      bestellt: { anzahl: bestellungenNachStatus.bestellt.length, menge: mengenProStatus.bestellt },
      versendet: { anzahl: bestellungenNachStatus.versendet.length, menge: mengenProStatus.versendet },
      abgeschlossen: { anzahl: bestellungenNachStatus.abgeschlossen.length, menge: mengenProStatus.abgeschlossen },
    };
  }, [bestellungenNachStatus]);

  // Alle offenen auswählen
  const selectAllOffen = () => {
    const offeneIds = bestellungenNachStatus.offen.map(b => b.projektId);
    setSelectedIds(new Set(offeneIds));
  };

  // Auswahl umschalten
  const toggleSelection = (projektId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(projektId)) {
        next.delete(projektId);
      } else {
        next.add(projektId);
      }
      return next;
    });
  };

  // Modal öffnen und editierbare Daten initialisieren
  const openSendModal = () => {
    const zuSenden = selectedIds.size > 0
      ? bestellungenNachStatus.offen.filter(b => selectedIds.has(b.projektId))
      : bestellungenNachStatus.offen;

    const initDaten: EditierbareSendDaten[] = zuSenden.map(b => ({
      projektId: b.projektId,
      kundenname: b.aktuellerKundenname || b.projekt.kundenname,
      lieferKW: b.lieferKW ? `${b.lieferKW}` : '',
      lieferdatum: b.lieferdatum || '',
      // Ansprechpartner aus AB-Daten (dort ist er korrekt gespeichert), Fallback auf Projekt
      ansprechpartnerName: b.dispoAnsprechpartner?.name || b.projekt.dispoAnsprechpartner?.name || b.projekt.ansprechpartner || '',
      ansprechpartnerTelefon: b.dispoAnsprechpartner?.telefon || b.projekt.dispoAnsprechpartner?.telefon || '',
      menge: b.position.menge || 0,
      einheit: b.position.einheit || 't',
    }));

    setEditierbareDaten(initDaten);
    setShowSendModal(true);
  };

  // Editierbare Daten aktualisieren
  const updateEditierbareDaten = (projektId: string, field: keyof EditierbareSendDaten, value: string | number) => {
    setEditierbareDaten(prev =>
      prev.map(d => d.projektId === projektId ? { ...d, [field]: value } : d)
    );
  };

  // CSV für Schwab generieren (verwendet editierbare Daten)
  const generiereCSV = (bestellungenZuSenden: HydrocourtBestellung[]): string => {
    const headers = [
      'Bestellnummer',
      'Vereinsname',
      'Lieferadresse',
      'PLZ',
      'Ort',
      'Ansprechpartner',
      'Telefon',
      'Menge',
      'Einheit',
      'Artikel',
      'Liefer-KW',
      'Lieferdatum',
      'Anmerkungen',
    ];

    const rows = bestellungenZuSenden.map(b => {
      const lieferadresse = b.projekt.lieferadresse;
      // Editierbare Daten für diese Bestellung finden
      const editiert = editierbareDaten.find(d => d.projektId === b.projektId);

      // Liefer-KW formatieren
      const lieferKWFormatted = editiert?.lieferKW
        ? `KW ${editiert.lieferKW}`
        : (b.lieferKW ? `KW ${b.lieferKW}${b.lieferKWJahr ? '/' + b.lieferKWJahr : ''}` : '');

      // Lieferdatum formatieren
      const lieferdatumFormatted = editiert?.lieferdatum
        ? new Date(editiert.lieferdatum).toLocaleDateString('de-DE')
        : (b.lieferdatum ? new Date(b.lieferdatum).toLocaleDateString('de-DE') : '');

      return [
        b.auftragsbestaetigungsnummer || '',
        b.aktuellerKundenname || b.projekt.kundenname || '',
        lieferadresse?.strasse || b.projekt.kundenstrasse || '',
        lieferadresse?.plz || b.projekt.kundenPlzOrt?.split(' ')[0] || '',
        lieferadresse?.ort || b.projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
        editiert?.ansprechpartnerName || b.dispoAnsprechpartner?.name || b.projekt.dispoAnsprechpartner?.name || b.projekt.ansprechpartner || '',
        editiert?.ansprechpartnerTelefon || b.dispoAnsprechpartner?.telefon || b.projekt.dispoAnsprechpartner?.telefon || '',
        b.position.menge?.toString().replace('.', ',') || '',
        b.position.einheit || 't',
        'Hydrocourt TM-HYC',
        lieferKWFormatted,
        lieferdatumFormatted,
        b.projekt.notizen || '',
      ];
    });

    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    return BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  };

  // An Schwab senden
  const handleSendToSchwab = async () => {
    // Bestellungen basierend auf editierbareDaten (die schon beim Modal öffnen gesetzt wurden)
    const projektIds = editierbareDaten.map(d => d.projektId);
    const zuSenden = bestellungenNachStatus.offen.filter(b => projektIds.includes(b.projektId));
    if (zuSenden.length === 0) return;

    setSendingState('sending');
    setSendError(null);

    try {
      // CSV generieren
      const csvContent = generiereCSV(zuSenden);
      const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));

      // Aktuelle KW ermitteln
      const heute = new Date();
      const ersterJanuar = new Date(heute.getFullYear(), 0, 1);
      const tage = Math.floor((heute.getTime() - ersterJanuar.getTime()) / 86400000);
      const aktuelleKW = Math.ceil((tage + ersterJanuar.getDay() + 1) / 7);

      // Stammdaten für Signatur laden (wie bei UniversalView - 'angebot' hat die richtige Signatur)
      const emailTemplate = await generiereStandardEmail('angebot', '', '');
      const signatur = emailTemplate.signatur || '';

      // Email-Body erstellen (ohne Grußformel - kommt aus Signatur)
      const emailText = `Hallo ${SCHWAB_NAME},

anbei die aktuellen Hydrocourt-Bestellungen (${zuSenden.length} Positionen).

Bitte um Bestätigung und Mitteilung der Tracking-Nummern nach Versand.`;

      const htmlBody = wrapInEmailTemplate(emailText, signatur);

      // Dateiname
      const datumFormatiert = new Date().toISOString().split('T')[0];
      const csvDateiname = `Hydrocourt_Bestellungen_KW${aktuelleKW}_${datumFormatiert}.csv`;

      // Empfänger basierend auf Testmodus
      const empfaenger = testModus ? TEST_EMAIL : SCHWAB_EMAIL;
      const betreff = `${testModus ? '[TEST] ' : ''}Hydrocourt Bestellungen - ${zuSenden.length} Positionen - KW ${aktuelleKW}`;

      // Email senden (CSV als Anhang)
      const result = await sendeEmailMitPdf({
        empfaenger,
        absender: TENNISMEHL_ABSENDER,
        betreff,
        htmlBody,
        pdfBase64: csvBase64,
        pdfDateiname: csvDateiname,
        projektId: zuSenden[0].projektId, // Erste Projekt-ID für Protokoll
        dokumentTyp: 'lieferschein', // Typ für Protokoll
        dokumentNummer: `HC-${datumFormatiert}`,
        testModus,
        skipProtokoll: testModus,
      });

      if (!result.success) {
        throw new Error(result.error || 'Email konnte nicht gesendet werden');
      }

      // Editierte Ansprechpartner-Daten ins Projekt speichern + Status auf "bestellt"
      if (!testModus) {
        await Promise.all(
          editierbareDaten.map(async (daten) => {
            const updates: Partial<Projekt> = {
              hydrocourtStatus: 'bestellt',
              hydrocourtBestelltAm: new Date().toISOString(),
            };

            // Ansprechpartner speichern wenn editiert
            if (daten.ansprechpartnerName || daten.ansprechpartnerTelefon) {
              updates.dispoAnsprechpartner = {
                name: daten.ansprechpartnerName,
                telefon: daten.ansprechpartnerTelefon,
              };
            }

            // Liefer-KW speichern wenn editiert
            if (daten.lieferKW) {
              const kwNum = parseInt(daten.lieferKW, 10);
              if (!isNaN(kwNum)) {
                updates.lieferKW = kwNum;
              }
            }

            await projektService.updateProjekt(daten.projektId, updates);
          })
        );
      }

      setSendingState('success');
      setSelectedIds(new Set());

      // Nach kurzer Verzögerung Modal schließen und neu laden
      setTimeout(() => {
        setShowSendModal(false);
        setSendingState('idle');
        ladeHydrocourtBestellungen();
      }, 2000);

    } catch (error) {
      console.error('Fehler beim Senden an Schwab:', error);
      setSendError(error instanceof Error ? error.message : 'Unbekannter Fehler');
      setSendingState('error');
    }
  };

  // Tracking-Nummer speichern
  const handleSaveTracking = async (projektId: string) => {
    if (!trackingInput.trim()) return;

    try {
      await projektService.setHydrocourtTracking(projektId, trackingInput.trim());
      setEditingTrackingId(null);
      setTrackingInput('');
      ladeHydrocourtBestellungen();
    } catch (error) {
      console.error('Fehler beim Speichern der Tracking-Nummer:', error);
    }
  };

  // Status manuell ändern
  const handleStatusChange = async (projektId: string, neuerStatus: HydrocourtStatus) => {
    try {
      await projektService.updateHydrocourtStatus(projektId, neuerStatus);
      ladeHydrocourtBestellungen();
    } catch (error) {
      console.error('Fehler beim Ändern des Status:', error);
    }
  };

  // Email an Kunde mit Tracking senden
  const handleSendTrackingToCustomer = async (bestellung: HydrocourtBestellung) => {
    const tracking = bestellung.projekt.hydrocourtTrackingNummer;
    if (!tracking) return;

    const kundenEmail = bestellung.projekt.kundenEmail;
    if (!kundenEmail) {
      alert('Keine Kunden-E-Mail-Adresse vorhanden');
      return;
    }

    try {
      const ansprechpartner = bestellung.projekt.dispoAnsprechpartner?.name || bestellung.projekt.ansprechpartner || 'Kunde';

      const emailTemplate = await generiereStandardEmail('lieferschein', '', bestellung.projekt.kundenname || '');
      const signatur = emailTemplate.signatur || '';

      const emailText = `Sehr geehrte(r) ${ansprechpartner},

Ihre Hydrocourt-Bestellung wurde versendet.

Tracking-Nummer: ${tracking}

Mit sportlichen Grüßen`;

      const htmlBody = wrapInEmailTemplate(emailText, signatur);

      const result = await sendeEmailMitPdf({
        empfaenger: kundenEmail,
        absender: TENNISMEHL_ABSENDER,
        betreff: 'Ihre Hydrocourt-Bestellung - Sendungsverfolgung',
        htmlBody,
        pdfBase64: '', // Kein Anhang
        pdfDateiname: '',
        projektId: bestellung.projektId,
        dokumentTyp: 'lieferschein',
        dokumentNummer: `HC-TRACK-${bestellung.auftragsbestaetigungsnummer || ''}`,
      });

      if (result.success) {
        alert('Tracking-Information wurde an den Kunden gesendet.');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Fehler beim Senden der Tracking-Email:', error);
      alert('Fehler beim Senden: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    }
  };

  // Gruppierte Bestellungen (für Listen-Ansicht)
  const gruppierteDaten = useMemo(() => {
    if (groupBy === 'none') {
      return { 'Alle Bestellungen': bestellungen };
    }

    const gruppen: Record<string, HydrocourtBestellung[]> = {};

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

  // CSV Export (allgemein)
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
      'Einzelpreis',
      'Gesamtpreis',
      'Lieferdatum',
      'Liefer-KW',
      'Projekt-Status',
      'Hydrocourt-Status',
      'Bestellt am',
      'Tracking-Nr.',
      'Versendet am',
    ];

    const rows = bestellungen.map((b) => [
      b.auftragsbestaetigungsnummer || '',
      b.auftragsbestaetigungsdatum
        ? new Date(b.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')
        : '',
      b.aktuellerKundenname || b.projekt.kundenname || '',
      b.projekt.kundenPlzOrt || '',
      b.position.artikelnummer || 'TM-HYC',
      b.position.bezeichnung || '',
      b.position.menge?.toString().replace('.', ',') || '',
      b.position.einheit || '',
      b.position.einzelpreis?.toFixed(2).replace('.', ',') || '',
      b.position.gesamtpreis?.toFixed(2).replace('.', ',') || '',
      b.lieferdatum ? new Date(b.lieferdatum).toLocaleDateString('de-DE') : '',
      b.lieferKW ? `KW ${b.lieferKW}${b.lieferKWJahr ? '/' + b.lieferKWJahr : ''}` : '',
      getStatusConfig(b.projekt.status).label,
      HYDROCOURT_STATUS_CONFIG[b.projekt.hydrocourtStatus || 'offen'].label,
      b.projekt.hydrocourtBestelltAm ? new Date(b.projekt.hydrocourtBestelltAm).toLocaleDateString('de-DE') : '',
      b.projekt.hydrocourtTrackingNummer || '',
      b.projekt.hydrocourtVersendetAm ? new Date(b.projekt.hydrocourtVersendetAm).toLocaleDateString('de-DE') : '',
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hydrocourt_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
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

  // === KARTEN-KOMPONENTE für Workflow-Ansicht ===
  const WorkflowCard = ({ bestellung, showCheckbox = false }: { bestellung: HydrocourtBestellung; showCheckbox?: boolean }) => {
    const status = bestellung.projekt.hydrocourtStatus || 'offen';
    const isSelected = selectedIds.has(bestellung.projektId);
    const isEditingTracking = editingTrackingId === bestellung.projektId;

    return (
      <div
        className={`bg-white dark:bg-slate-800 rounded-lg border-2 p-3 transition-all hover:shadow-md ${
          isSelected ? 'border-cyan-500 ring-2 ring-cyan-200 dark:ring-cyan-800' : 'border-gray-200 dark:border-slate-700'
        }`}
      >
        {/* Header mit Checkbox und Kundenname */}
        <div className="flex items-start gap-2 mb-2">
          {showCheckbox && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelection(bestellung.projektId)}
              className="w-4 h-4 mt-1 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
          )}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onProjektClick(bestellung.projekt)}
              className="font-semibold text-gray-900 dark:text-white hover:text-cyan-600 dark:hover:text-cyan-400 text-left truncate block w-full"
            >
              {bestellung.aktuellerKundenname || bestellung.projekt.kundenname}
            </button>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{bestellung.projekt.kundenPlzOrt}</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-sm">
          {/* Menge */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Menge:</span>
            <span className="font-bold text-gray-900 dark:text-white">
              {bestellung.position.menge?.toLocaleString('de-DE', { maximumFractionDigits: 2 })} {bestellung.position.einheit || 't'}
            </span>
          </div>

          {/* Liefertermin */}
          {(bestellung.lieferKW || bestellung.lieferdatum) && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Lieferung:</span>
              <span className="text-gray-900 dark:text-white flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-500" />
                {bestellung.lieferKW
                  ? `KW ${bestellung.lieferKW}${bestellung.lieferKWJahr ? '/' + bestellung.lieferKWJahr : ''}`
                  : new Date(bestellung.lieferdatum!).toLocaleDateString('de-DE')}
              </span>
            </div>
          )}

          {/* AB-Nummer */}
          {bestellung.auftragsbestaetigungsnummer && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">AB-Nr.:</span>
              <span className="font-mono text-xs text-orange-600 dark:text-orange-400">
                {bestellung.auftragsbestaetigungsnummer}
              </span>
            </div>
          )}

          {/* Ansprechpartner fehlt Warnung */}
          {!bestellung.projekt.dispoAnsprechpartner?.name && !bestellung.projekt.ansprechpartner && (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs mt-2">
              <AlertCircle className="w-3 h-3" />
              <span>Kein Ansprechpartner</span>
            </div>
          )}
        </div>

        {/* Status-spezifische Aktionen */}
        {status === 'bestellt' && (
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            {/* Bestellt am Badge */}
            {bestellung.projekt.hydrocourtBestelltAm && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                <Package className="w-3 h-3" />
                Bestellt am {new Date(bestellung.projekt.hydrocourtBestelltAm).toLocaleDateString('de-DE')}
              </div>
            )}

            {/* Tracking-Eingabe */}
            {isEditingTracking ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="Tracking-Nr."
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTracking(bestellung.projektId);
                    if (e.key === 'Escape') {
                      setEditingTrackingId(null);
                      setTrackingInput('');
                    }
                  }}
                />
                <button
                  onClick={() => handleSaveTracking(bestellung.projektId)}
                  className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-sm"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingTrackingId(bestellung.projektId);
                  setTrackingInput('');
                }}
                className="w-full px-3 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-lg text-sm font-medium hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Truck className="w-4 h-4" />
                Tracking eintragen
              </button>
            )}
          </div>
        )}

        {status === 'versendet' && (
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-slate-700 space-y-2">
            {/* Tracking-Nummer anzeigen */}
            {bestellung.projekt.hydrocourtTrackingNummer && (
              <div className="text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-1 rounded flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {bestellung.projekt.hydrocourtTrackingNummer}
              </div>
            )}

            {/* Versendet am Badge */}
            {bestellung.projekt.hydrocourtVersendetAm && (
              <div className="text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                <PackageCheck className="w-3 h-3" />
                Versendet am {new Date(bestellung.projekt.hydrocourtVersendetAm).toLocaleDateString('de-DE')}
              </div>
            )}

            {/* Aktions-Buttons */}
            <div className="flex gap-2">
              {bestellung.projekt.kundenEmail && bestellung.projekt.hydrocourtTrackingNummer && (
                <button
                  onClick={() => handleSendTrackingToCustomer(bestellung)}
                  className="flex-1 px-2 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors flex items-center justify-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  Kunde informieren
                </button>
              )}
              <button
                onClick={() => handleStatusChange(bestellung.projektId, 'abgeschlossen')}
                className="flex-1 px-2 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                Abschließen
              </button>
            </div>
          </div>
        )}

        {status === 'abgeschlossen' && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 opacity-60">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Abgeschlossen
            </div>
          </div>
        )}
      </div>
    );
  };

  // === WORKFLOW-SPALTE ===
  const WorkflowColumn = ({ status, bestellungen: spaltenBestellungen }: { status: HydrocourtStatus; bestellungen: HydrocourtBestellung[] }) => {
    const config = HYDROCOURT_STATUS_CONFIG[status];
    const StatusIcon = config.icon;
    const gesamtMenge = spaltenBestellungen.reduce((sum, b) => sum + (b.position.menge || 0), 0);

    return (
      <div className={`flex-1 min-w-[280px] max-w-[320px] rounded-xl border-2 ${config.borderColor} ${config.bgColor} flex flex-col`}>
        {/* Spalten-Header */}
        <div className={`px-4 py-3 border-b ${config.borderColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={`w-5 h-5 ${config.color}`} />
              <span className={`font-semibold ${config.color}`}>{config.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                {spaltenBestellungen.length}
              </span>
            </div>
          </div>
          {gesamtMenge > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {gesamtMenge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} t
            </div>
          )}
        </div>

        {/* "Alle auswählen" Toggle (nur für "offen") */}
        {status === 'offen' && spaltenBestellungen.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === spaltenBestellungen.length && spaltenBestellungen.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    selectAllOffen();
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Alle auswählen</span>
            </label>
          </div>
        )}

        {/* Karten */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {spaltenBestellungen.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-8">
              <Droplets className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Keine Bestellungen</p>
            </div>
          ) : (
            spaltenBestellungen.slice(0, status === 'abgeschlossen' ? 20 : undefined).map((bestellung, idx) => (
              <WorkflowCard
                key={`${bestellung.projektId}-${idx}`}
                bestellung={bestellung}
                showCheckbox={status === 'offen'}
              />
            ))
          )}
          {status === 'abgeschlossen' && spaltenBestellungen.length > 20 && (
            <button className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              +{spaltenBestellungen.length - 20} weitere...
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lade Hydrocourt-Bestellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card mit KPIs */}
      <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-xl backdrop-blur-sm">
              <Droplets className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Hydrocourt Bestellungen</h2>
              <p className="text-cyan-100 mt-1">
                Artikel TM-HYC - Versand über Schwab
              </p>
            </div>
          </div>

          <button
            onClick={ladeHydrocourtBestellungen}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {/* Offen */}
          <div className={`rounded-xl p-4 ${stats.offen.anzahl > 0 ? 'bg-rose-500/30 border-2 border-rose-400' : 'bg-white/10'}`}>
            <div className="flex items-center gap-2 text-cyan-100 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Offen
            </div>
            <div className={`text-3xl font-bold ${stats.offen.anzahl > 0 ? 'text-rose-200' : ''}`}>
              {stats.offen.anzahl}
            </div>
            <div className="text-sm text-cyan-200 mt-1">
              {stats.offen.menge.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t
            </div>
          </div>

          {/* Bestellt */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-amber-400/30">
            <div className="flex items-center gap-2 text-amber-200 text-sm mb-1">
              <Package className="w-4 h-4" />
              Bestellt
            </div>
            <div className="text-3xl font-bold text-amber-200">{stats.bestellt.anzahl}</div>
            <div className="text-sm text-cyan-200 mt-1">
              {stats.bestellt.menge.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t
            </div>
          </div>

          {/* Versendet */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-sky-400/30">
            <div className="flex items-center gap-2 text-sky-200 text-sm mb-1">
              <Truck className="w-4 h-4" />
              Versendet
            </div>
            <div className="text-3xl font-bold text-sky-200">{stats.versendet.anzahl}</div>
            <div className="text-sm text-cyan-200 mt-1">
              {stats.versendet.menge.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t
            </div>
          </div>

          {/* Abgeschlossen */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-emerald-400/30">
            <div className="flex items-center gap-2 text-emerald-200 text-sm mb-1">
              <CheckCircle2 className="w-4 h-4" />
              Abgeschlossen
            </div>
            <div className="text-3xl font-bold text-emerald-200">{stats.abgeschlossen.anzahl}</div>
            <div className="text-sm text-cyan-200 mt-1">
              {stats.abgeschlossen.menge.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Ansichts-Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('workflow')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                viewMode === 'workflow'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Workflow
            </button>
            <button
              onClick={() => setViewMode('liste')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                viewMode === 'liste'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              Liste
            </button>
          </div>

          {/* Gruppierung (nur bei Listen-Ansicht) */}
          {viewMode === 'liste' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Gruppieren:</span>
              <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <button
                  onClick={() => setGroupBy('lieferdatum')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    groupBy === 'lieferdatum'
                      ? 'bg-cyan-500 text-white'
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
                      ? 'bg-cyan-500 text-white'
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
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                  Keine
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Test-Modus Toggle */}
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
              Test
            </span>
          </label>

          {/* An Schwab senden Button */}
          <button
            onClick={openSendModal}
            disabled={stats.offen.anzahl === 0}
            className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg ${
              stats.offen.anzahl === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : testModus
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-cyan-600 hover:bg-cyan-700'
            }`}
          >
            <Send className="w-5 h-5" />
            {testModus ? 'Test: ' : ''}An Schwab senden
            {stats.offen.anzahl > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {selectedIds.size > 0 ? selectedIds.size : stats.offen.anzahl}
              </span>
            )}
          </button>

          {/* CSV Export */}
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

      {/* Hauptinhalt */}
      {bestellungen.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <Droplets className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Keine Hydrocourt-Bestellungen
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Es gibt aktuell keine bestätigten Aufträge mit dem Artikel TM-HYC.
          </p>
        </div>
      ) : viewMode === 'workflow' ? (
        /* === WORKFLOW-ANSICHT === */
        <div className="flex gap-4 overflow-x-auto pb-4">
          <WorkflowColumn status="offen" bestellungen={bestellungenNachStatus.offen} />
          <WorkflowColumn status="bestellt" bestellungen={bestellungenNachStatus.bestellt} />
          <WorkflowColumn status="versendet" bestellungen={bestellungenNachStatus.versendet} />
          <WorkflowColumn status="abgeschlossen" bestellungen={bestellungenNachStatus.abgeschlossen} />
        </div>
      ) : (
        /* === LISTEN-ANSICHT === */
        <div className="space-y-4">
          {Object.entries(gruppierteDaten).map(([gruppenKey, gruppenBestellungen]) => {
            const isExpanded = expandedGroups.has(gruppenKey) || expandedGroups.has('alle');
            const gruppenMenge = gruppenBestellungen.reduce((sum, b) => sum + (b.position.menge || 0), 0);
            const gruppenWert = gruppenBestellungen.reduce((sum, b) => sum + (b.position.gesamtpreis || 0), 0);

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
                    <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 text-sm rounded-full">
                      {gruppenBestellungen.length} Position{gruppenBestellungen.length !== 1 ? 'en' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">
                      {gruppenMenge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} t
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
                          <th className="px-4 py-3 text-left font-semibold">Lieferadresse</th>
                          <th className="px-4 py-3 text-left font-semibold">Lieferdatum</th>
                          <th className="px-4 py-3 text-right font-semibold">Menge</th>
                          <th className="px-4 py-3 text-left font-semibold">Hydrocourt-Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {gruppenBestellungen.map((bestellung, idx) => {
                          const hcStatus = bestellung.projekt.hydrocourtStatus || 'offen';
                          const hcConfig = HYDROCOURT_STATUS_CONFIG[hcStatus];
                          const HcIcon = hcConfig.icon;

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
                                    {bestellung.aktuellerKundenname || bestellung.projekt.kundenname}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-1.5 text-gray-600 dark:text-gray-400">
                                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
                                  <div className="text-sm">{bestellung.projekt.kundenPlzOrt}</div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {bestellung.lieferKW ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-cyan-500" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      KW {bestellung.lieferKW}
                                      {bestellung.lieferKWJahr && (
                                        <span className="text-gray-500">/{bestellung.lieferKWJahr}</span>
                                      )}
                                    </span>
                                  </div>
                                ) : bestellung.lieferdatum ? (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-cyan-500" />
                                    <span className="text-gray-900 dark:text-white">
                                      {new Date(bestellung.lieferdatum).toLocaleDateString('de-DE')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Package className="w-4 h-4 text-cyan-500" />
                                  <span className="font-bold text-lg text-gray-900 dark:text-white">
                                    {bestellung.position.menge?.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                                    {bestellung.position.einheit || 't'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${hcConfig.bgColor} ${hcConfig.color} border ${hcConfig.borderColor}`}
                                >
                                  <HcIcon className="w-3.5 h-3.5" />
                                  {hcConfig.label}
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

      {/* === SEND MODAL === */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-cyan-600 to-blue-600 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Send className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">
                    An Schwab senden
                  </h2>
                  <p className="text-cyan-100 text-sm">
                    {testModus ? `Test: ${TEST_EMAIL}` : SCHWAB_EMAIL}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSendModal(false);
                  setSendingState('idle');
                  setSendError(null);
                }}
                disabled={sendingState === 'sending'}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {sendingState === 'success' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Erfolgreich gesendet!
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {selectedIds.size > 0 ? selectedIds.size : stats.offen.anzahl} Bestellungen wurden an {SCHWAB_NAME} gesendet.
                  </p>
                </div>
              ) : sendingState === 'error' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <X className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Fehler beim Senden
                  </h3>
                  <p className="text-red-600 dark:text-red-400">{sendError}</p>
                  <button
                    onClick={() => setSendingState('idle')}
                    className="mt-4 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
                  >
                    Erneut versuchen
                  </button>
                </div>
              ) : (
                <>
                  {/* Testmodus Hinweis */}
                  {testModus && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                        Testmodus aktiv - Email wird an {TEST_EMAIL} gesendet
                      </span>
                    </div>
                  )}

                  {/* Bestellungen mit editierbaren Feldern */}
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Bestellungen bearbeiten ({editierbareDaten.length})
                    </h4>
                    <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      {/* Tabellen-Header */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-100 dark:bg-slate-800 text-xs font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                        <div className="col-span-3">Kunde</div>
                        <div className="col-span-1 text-right">Menge</div>
                        <div className="col-span-2">Liefer-KW</div>
                        <div className="col-span-3">Ansprechpartner</div>
                        <div className="col-span-3">Telefon</div>
                      </div>

                      {/* Editierbare Zeilen */}
                      <div className="max-h-[40vh] overflow-y-auto divide-y divide-gray-200 dark:divide-slate-700">
                        {editierbareDaten.map((daten) => (
                          <div
                            key={daten.projektId}
                            className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-gray-50 dark:hover:bg-slate-800/50"
                          >
                            {/* Kundenname (nicht editierbar) */}
                            <div className="col-span-3">
                              <span className="font-medium text-gray-900 dark:text-white text-sm truncate block">
                                {daten.kundenname}
                              </span>
                            </div>

                            {/* Menge (nicht editierbar) */}
                            <div className="col-span-1 text-right">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {daten.menge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} {daten.einheit}
                              </span>
                            </div>

                            {/* Liefer-KW (editierbar) */}
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={daten.lieferKW}
                                onChange={(e) => updateEditierbareDaten(daten.projektId, 'lieferKW', e.target.value)}
                                placeholder="z.B. 14"
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                              />
                            </div>

                            {/* Ansprechpartner Name (editierbar) */}
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={daten.ansprechpartnerName}
                                onChange={(e) => updateEditierbareDaten(daten.projektId, 'ansprechpartnerName', e.target.value)}
                                placeholder="Name"
                                className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 ${
                                  !daten.ansprechpartnerName
                                    ? 'border-amber-400 dark:border-amber-600'
                                    : 'border-gray-300 dark:border-slate-600'
                                }`}
                              />
                            </div>

                            {/* Ansprechpartner Telefon (editierbar) */}
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={daten.ansprechpartnerTelefon}
                                onChange={(e) => updateEditierbareDaten(daten.projektId, 'ansprechpartnerTelefon', e.target.value)}
                                placeholder="Telefon"
                                className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 ${
                                  !daten.ansprechpartnerTelefon
                                    ? 'border-amber-400 dark:border-amber-600'
                                    : 'border-gray-300 dark:border-slate-600'
                                }`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                    <p className="mb-1">Eine CSV-Datei mit allen Bestellungen wird als Anhang gesendet.</p>
                    <p className="text-xs opacity-80">Felder mit orangem Rand sind leer - bitte vor dem Senden ausfüllen.</p>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {sendingState !== 'success' && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowSendModal(false);
                    setSendingState('idle');
                    setSendError(null);
                  }}
                  disabled={sendingState === 'sending'}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSendToSchwab}
                  disabled={sendingState === 'sending' || (selectedIds.size === 0 && stats.offen.anzahl === 0)}
                  className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-medium disabled:opacity-50 ${
                    testModus ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-cyan-600 hover:bg-cyan-700'
                  }`}
                >
                  {sendingState === 'sending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {testModus ? 'Test senden' : 'Jetzt senden'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HydrocourtView;
