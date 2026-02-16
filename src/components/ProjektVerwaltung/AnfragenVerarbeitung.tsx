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
  MapPin,
  Package,
  RefreshCw,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  Building2,
  Download,
  Map as MapIcon,
  List,
  Trash2,
  Star,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { VerarbeiteteAnfrage, Anfrage } from '../../types/anfragen';
import {
  parseWebformularAnfrage,
  berechneEmpfohlenenPreis,
} from '../../services/anfrageParserService';
import { anfragenService } from '../../services/anfragenService';
import { ladeAlleEmailProtokolle } from '../../services/emailSendService';
import { searchEmailsByAddress } from '../../services/emailService';
import {
  erstelleStandardPositionen,
} from '../../services/anfrageVerarbeitungService';
import { claudeAnfrageService } from '../../services/claudeAnfrageService';
import AnfrageBearbeitungDialog from './AnfrageBearbeitungDialog';
import AnfragenKartenansicht from './AnfragenKartenansicht';

interface AnfragenVerarbeitungProps {
  onAnfrageGenehmigt?: (projektId: string) => void;
}

// Info über eine versendete Antwort-E-Mail
interface AntwortInfo {
  gesendetAm: string;
  projektId: string;
  dokumentNummer: string;
  quelle: 'app' | 'imap'; // Woher kommt die Info?
}

type ViewMode = 'list' | 'map';

const AnfragenVerarbeitung = ({ onAnfrageGenehmigt }: AnfragenVerarbeitungProps) => {
  const navigate = useNavigate();
  const [anfragen, setAnfragen] = useState<VerarbeiteteAnfrage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnfrage, setSelectedAnfrage] = useState<VerarbeiteteAnfrage | null>(null);
  const [antwortDaten, setAntwortDaten] = useState<Map<string, AntwortInfo[]>>(new Map());
  const [zeigeBeantwortet, setZeigeBeantwortet] = useState(false);
  const [imapPruefungLaeuft, setImapPruefungLaeuft] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Multi-Select
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Lade E-Mail-Protokoll für Duplikat-Erkennung (mit Zeitpunkten und Projekt-IDs!)
  // Prüft SOWOHL App-Protokoll ALS AUCH IMAP Gesendet-Ordner
  const ladeBereitsBeantwortet = useCallback(async (emailAdressen?: string[]) => {
    try {
      const protokoll = await ladeAlleEmailProtokolle(200); // Mehr laden für bessere Abdeckung
      // Map: E-Mail-Adresse (lowercase) -> Liste der Antworten mit Details
      const datenMap = new Map<string, AntwortInfo[]>();

      // 1. App-Protokoll durchsuchen
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
            quelle: 'app',
          });
          datenMap.set(email, bisherige);
        }
      });

      setAntwortDaten(new Map(datenMap));

      // 2. IMAP Gesendet-Ordner durchsuchen für jede E-Mail-Adresse
      if (emailAdressen && emailAdressen.length > 0) {
        setImapPruefungLaeuft(true);

        // Nur die ersten 20 Adressen prüfen um Performance zu erhalten
        const zuPruefen = [...new Set(emailAdressen)].slice(0, 20);

        for (const email of zuPruefen) {
          try {
            const imapErgebnis = await searchEmailsByAddress(email);

            // Finde gesendete E-Mails AN diese Adresse (nicht VON)
            const gesendeteEmails = imapErgebnis.filter(e => {
              const toAddresses = e.to.map(t => t.address.toLowerCase());
              return toAddresses.includes(email.toLowerCase());
            });

            if (gesendeteEmails.length > 0) {
              const bisherige = datenMap.get(email.toLowerCase()) || [];

              gesendeteEmails.forEach(e => {
                // Prüfe ob nicht bereits in der Liste (Duplikat-Vermeidung)
                const bereitsVorhanden = bisherige.some(b =>
                  Math.abs(new Date(b.gesendetAm).getTime() - new Date(e.date).getTime()) < 60000 // 1 Minute Toleranz
                );

                if (!bereitsVorhanden) {
                  bisherige.push({
                    gesendetAm: e.date,
                    projektId: '', // Unbekannt bei IMAP
                    dokumentNummer: e.subject || 'IMAP-Email',
                    quelle: 'imap',
                  });
                }
              });

              datenMap.set(email.toLowerCase(), bisherige);
            }
          } catch (imapError) {
            console.warn(`IMAP-Suche für ${email} fehlgeschlagen:`, imapError);
          }
        }

        setAntwortDaten(new Map(datenMap));
        setImapPruefungLaeuft(false);
      }
    } catch (error) {
      console.error('Fehler beim Laden der beantworteten E-Mails:', error);
      setImapPruefungLaeuft(false);
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

  // Lade Anfragen aus Appwrite - OPTIMIERT für schnelles Laden
  const loadAnfragenAusAppwrite = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📧 Lade Anfragen aus Appwrite...');

      const alleAnfragen = await anfragenService.loadAlleAnfragen();
      console.log(`📧 ${alleAnfragen.length} Anfragen in Appwrite gefunden`);

      // Konvertiere zu VerarbeiteteAnfrage
      const verarbeitete: VerarbeiteteAnfrage[] = alleAnfragen.map(konvertiereZuVerarbeiteteAnfrage);

      // Sortiere nach Datum (neueste zuerst)
      verarbeitete.sort((a, b) => new Date(b.emailDatum).getTime() - new Date(a.emailDatum).getTime());

      // SOFORT anzeigen - ohne auf KI-Analyse zu warten!
      setAnfragen(verarbeitete);
      setLoading(false); // UI sofort freigeben!

      // Sammle alle E-Mail-Adressen für IMAP-Prüfung
      const emailAdressen = verarbeitete
        .map(a => a.analysiert.email || a.emailAbsender)
        .filter(Boolean) as string[];

      // Starte E-Mail-Protokoll UND IMAP-Prüfung (non-blocking)
      ladeBereitsBeantwortet(emailAdressen).catch(console.error);

      // KI-Analyse ASYNCHRON im Hintergrund (blockiert UI nicht mehr!)
      if (claudeAnfrageService.isAvailable()) {
        // Nur die ersten 5 analysieren und mit Delay, um API nicht zu überlasten
        const zuAnalysieren = verarbeitete.filter(a => {
          const nachricht = extrahiereNachricht(a.emailText);
          return nachricht && !a.notizen;
        }).slice(0, 5);

        // Starte Analysen im Hintergrund mit setTimeout
        zuAnalysieren.forEach((anfrage, index) => {
          setTimeout(async () => {
            const nachricht = extrahiereNachricht(anfrage.emailText);
            if (!nachricht) return;

            try {
              const analyse = await claudeAnfrageService.analysiereNachricht(nachricht);
              if (analyse.notizen) {
                anfrage.notizen = analyse.notizen;
                setAnfragen(prev => [...prev]);
              }
            } catch (error) {
              console.warn('Nachricht-Analyse fehlgeschlagen:', error);
            }
          }, index * 2000); // 2 Sekunden Verzögerung zwischen Analysen
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Anfragen:', error);
      setAnfragen([]);
      setLoading(false);
    }
  }, [ladeBereitsBeantwortet]);

  // Alias für loadAnfragen (für Kompatibilität)
  const loadAnfragen = loadAnfragenAusAppwrite;

  useEffect(() => {
    loadAnfragen();
  }, [loadAnfragen]);


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

  // Callback wenn Dialog ein Duplikat via IMAP findet - aktualisiert die Liste
  const handleDuplikatGefunden = useCallback((email: string, gesendetAm: string, betreff: string) => {
    console.log(`📨 Duplikat-Info von Dialog erhalten: ${email} am ${gesendetAm}`);
    setAntwortDaten(prev => {
      const neueMap = new Map(prev);
      const bisherige = neueMap.get(email.toLowerCase()) || [];

      // Prüfe ob bereits vorhanden
      const bereitsVorhanden = bisherige.some(b =>
        Math.abs(new Date(b.gesendetAm).getTime() - new Date(gesendetAm).getTime()) < 60000
      );

      if (!bereitsVorhanden) {
        bisherige.push({
          gesendetAm,
          projektId: '',
          dokumentNummer: betreff,
          quelle: 'imap',
        });
        neueMap.set(email.toLowerCase(), bisherige);
      }

      return neueMap;
    });
  }, []);

  // Multi-Select: Toggle einzelne Anfrage
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const neu = new Set(prev);
      if (neu.has(id)) {
        neu.delete(id);
      } else {
        neu.add(id);
      }
      return neu;
    });
  };

  // Multi-Select: Alle auswählen/abwählen
  const toggleSelectAll = (anfrageIds: string[]) => {
    const alleAusgewaehlt = anfrageIds.every(id => selectedIds.has(id));
    if (alleAusgewaehlt) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(anfrageIds));
    }
  };

  // Bulk-Aktion: Ausgewählte löschen
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Anfrage(n) wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;

    setBulkActionLoading(true);
    try {
      await anfragenService.deleteAnfragen(Array.from(selectedIds));
      setAnfragen(prev => prev.filter(a => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      setMultiSelectMode(false);
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Anfragen');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk-Aktion: Als wichtig markieren
  const handleBulkMarkWichtig = async () => {
    if (selectedIds.size === 0) return;

    setBulkActionLoading(true);
    try {
      await anfragenService.markiereAlsWichtig(Array.from(selectedIds), true);
      // Aktualisiere lokale Daten
      setAnfragen(prev => prev.map(a =>
        selectedIds.has(a.id) ? { ...a, notizen: '⭐ WICHTIG' } : a
      ));
      setSelectedIds(new Set());
      setMultiSelectMode(false);
    } catch (error) {
      console.error('Fehler beim Markieren:', error);
      alert('Fehler beim Markieren der Anfragen');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Multi-Select beenden
  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  };

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
              {imapPruefungLaeuft && (
                <span className="ml-2 text-blue-500 flex items-center gap-1 inline-flex">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Prüfe Gesendet-Ordner...
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Liste</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <MapIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Karte</span>
            </button>
          </div>

          {/* Filter-Dropdown */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setZeigeBeantwortet(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm ${
                !zeigeBeantwortet
                  ? 'bg-white dark:bg-slate-700 shadow text-orange-600 dark:text-orange-400 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Nur offene</span>
              <span className="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {offeneAnfragen.length}
              </span>
            </button>
            <button
              onClick={() => setZeigeBeantwortet(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm ${
                zeigeBeantwortet
                  ? 'bg-white dark:bg-slate-700 shadow text-green-600 dark:text-green-400 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Alle</span>
              <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {anfragen.length}
              </span>
            </button>
          </div>
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

          {/* Multi-Select Toggle */}
          <button
            onClick={() => {
              if (multiSelectMode) {
                exitMultiSelect();
              } else {
                setMultiSelectMode(true);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
              multiSelectMode
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden sm:inline">{multiSelectMode ? 'Abbrechen' : 'Auswählen'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Select Actions Bar */}
      {multiSelectMode && (
        <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleSelectAll(anzuzeigendeAnfragen.map(a => a.id))}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-purple-300 dark:border-purple-700 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
            >
              {anzuzeigendeAnfragen.every(a => selectedIds.has(a.id)) ? (
                <CheckSquare className="w-4 h-4 text-purple-600" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
              Alle auswählen
            </button>
            <span className="text-sm text-purple-700 dark:text-purple-300 font-medium">
              {selectedIds.size} ausgewählt
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkMarkWichtig}
              disabled={selectedIds.size === 0 || bulkActionLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-lg text-sm transition-colors"
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Wichtig</span>
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || bulkActionLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded-lg text-sm transition-colors"
            >
              {bulkActionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Löschen</span>
            </button>
            <button
              onClick={exitMultiSelect}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Kartenansicht */}
      {viewMode === 'map' && (
        <AnfragenKartenansicht
          anfragen={anzuzeigendeAnfragen}
          istBeantwortet={(email, datum) => istBereitsBeantwortet(email, datum)}
          onAnfrageClick={(anfrage) => setSelectedAnfrage(anfrage)}
        />
      )}

      {/* Anfragen-Liste als Grid */}
      {viewMode === 'list' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[80vh] overflow-y-auto">
        {anzuzeigendeAnfragen.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 text-center">
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
            const istWebformular = true;
            return (
              <AnfrageCard
                key={anfrage.id}
                anfrage={anfrage}
                isSelected={selectedAnfrage?.id === anfrage.id}
                istBeantwortet={beantwortet}
                istWebformular={istWebformular}
                antwortInfo={antwortInfo}
                onClick={() => {
                  if (multiSelectMode) {
                    toggleSelect(anfrage.id);
                  } else {
                    setSelectedAnfrage(anfrage);
                  }
                }}
                onProjektClick={(projektId) => navigate(`/projektabwicklung/${projektId}`)}
                multiSelectMode={multiSelectMode}
                isChecked={selectedIds.has(anfrage.id)}
                onToggleSelect={() => toggleSelect(anfrage.id)}
              />
            );
          })
        )}
      </div>
      )}

      {/* Dialog für Anfrage-Bearbeitung */}
      {selectedAnfrage && (() => {
        const beantwortet = istBereitsBeantwortet(selectedAnfrage.analysiert.email || selectedAnfrage.emailAbsender, selectedAnfrage.emailDatum);
        const antwortInfoFuerDialog = beantwortet
          ? getAntwortInfo(selectedAnfrage.analysiert.email || selectedAnfrage.emailAbsender, selectedAnfrage.emailDatum)
          : null;
        return (
          <AnfrageBearbeitungDialog
            anfrage={selectedAnfrage}
            isOpen={!!selectedAnfrage}
            istBereitsBeantwortet={beantwortet}
            antwortInfo={antwortInfoFuerDialog}
            onClose={() => setSelectedAnfrage(null)}
            onSuccess={(projektId) => {
              // Entferne aus der Liste
              setAnfragen((prev) => prev.filter((a) => a.id !== selectedAnfrage.id));
              setSelectedAnfrage(null);
              // Callback
              if (onAnfrageGenehmigt && projektId) {
                onAnfrageGenehmigt(projektId);
              }
            }}
            onNavigateToProjekt={(projektId) => navigate(`/projektabwicklung/${projektId}`)}
            onDuplikatGefunden={handleDuplikatGefunden}
          />
        );
      })()}
    </div>
  );
};

// Anfrage-Card Komponente
interface AnfrageCardProps {
  anfrage: VerarbeiteteAnfrage;
  isSelected: boolean;
  istBeantwortet: boolean;
  istWebformular?: boolean;
  antwortInfo?: AntwortInfo | null;
  onClick: () => void;
  onProjektClick?: (projektId: string) => void;
  multiSelectMode?: boolean;
  isChecked?: boolean;
  onToggleSelect?: () => void;
}

const AnfrageCard = ({ anfrage, isSelected, istBeantwortet, istWebformular, antwortInfo, onClick, onProjektClick, multiSelectMode, isChecked, onToggleSelect }: AnfrageCardProps) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
        isChecked
          ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-200 dark:ring-purple-900/50 bg-purple-50 dark:bg-purple-950/20'
          : isSelected
          ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-200 dark:ring-purple-900/50'
          : istBeantwortet
          ? 'border-green-200 dark:border-green-800 opacity-60'
          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Checkbox für Multi-Select */}
        {multiSelectMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className="flex-shrink-0 mt-1"
          >
            {isChecked ? (
              <CheckSquare className="w-5 h-5 text-purple-600" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 hover:text-purple-500" />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Status-Badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            {/* Wichtig-Badge */}
            {anfrage.notizen?.includes('WICHTIG') && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-xs rounded-full">
                <Star className="w-3 h-3" />
                Wichtig
              </div>
            )}
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
