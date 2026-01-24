/**
 * AnfragenVerarbeitung Component
 *
 * Zeigt eingehende E-Mail-Anfragen als Todo-Liste an.
 * Ermöglicht das Verarbeiten, Erstellen von Angeboten und Versenden von E-Mails.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  User,
  MapPin,
  Package,
  FileText,
  Send,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  Edit3,
  Loader2,
  Sparkles,
  Building2,
} from 'lucide-react';
import { VerarbeiteteAnfrage } from '../../types/anfragen';
import { anfragenService } from '../../services/anfragenService';
import { projektService } from '../../services/projektService';
import { NeuesProjekt } from '../../types/projekt';
import {
  parseWebformularAnfrage,
  generiereAngebotsEmail,
  berechneEmpfohlenenPreis,
} from '../../services/anfrageParserService';
import { getEmails, Email } from '../../services/emailService';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// E-Mail Account für Anfragen
const ANFRAGEN_EMAIL_ACCOUNT = 'anfrage@tennismehl.com';

// Prüft ob eine E-Mail eine Webformular-Anfrage ist
const isWebformularAnfrage = (email: Email): boolean => {
  const text = email.body || email.bodyPreview || '';
  // Webformular-Emails enthalten typische Felder
  return (
    text.includes('Vorname') &&
    text.includes('Nachname') &&
    (text.includes('PLZ') || text.includes('Ort')) &&
    (text.includes('Angebot') || text.includes('Anfrage') || text.includes('Tennismehl'))
  );
};

interface AnfragenVerarbeitungProps {
  onAnfrageGenehmigt?: (projektId: string) => void;
}

const AnfragenVerarbeitung = ({ onAnfrageGenehmigt }: AnfragenVerarbeitungProps) => {
  const navigate = useNavigate();
  useAuth(); // Auth-Context für zukünftige Erweiterungen
  const [anfragen, setAnfragen] = useState<VerarbeiteteAnfrage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnfrage, setSelectedAnfrage] = useState<VerarbeiteteAnfrage | null>(null);
  const [processing, setProcessing] = useState(false);

  // Lade neue Anfragen aus dem E-Mail-Account
  const loadAnfragen = useCallback(async () => {
    setLoading(true);
    try {
      // Lade E-Mails aus dem Anfragen-Postfach
      const emails = await getEmails(ANFRAGEN_EMAIL_ACCOUNT, 'INBOX', 50);

      // Filtere nur Webformular-Anfragen und parse sie
      const webformularEmails = emails.filter(isWebformularAnfrage);

      // Parse und analysiere jede E-Mail
      const verarbeitete: VerarbeiteteAnfrage[] = webformularEmails.map((email) => {
        return verarbeiteEmail(email);
      });

      setAnfragen(verarbeitete);
    } catch (error) {
      console.error('Fehler beim Laden der Anfragen:', error);
      setAnfragen([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnfragen();
  }, [loadAnfragen]);

  // Verarbeite eine E-Mail und erstelle Vorschläge
  const verarbeiteEmail = (email: Email): VerarbeiteteAnfrage => {
    const emailText = email.body || email.bodyPreview || '';

    // Parse die E-Mail mit unserem Parser
    const analyse = parseWebformularAnfrage(emailText);

    // Erstelle strukturierte analysierte Daten
    const analysiert = {
      kundenname:
        analyse.kontakt.vereinsname ||
        `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname || ''}`.trim() ||
        'Unbekannt',
      ansprechpartner: analyse.kontakt.nachname
        ? `${analyse.kontakt.vorname || ''} ${analyse.kontakt.nachname}`.trim()
        : undefined,
      email: analyse.kontakt.email || email.from.address,
      telefon: analyse.kontakt.telefon,
      strasse: analyse.kontakt.strasse,
      plzOrt: `${analyse.kontakt.plz || ''} ${analyse.kontakt.ort || ''}`.trim(),
      anzahlPlaetze: analyse.bestellung.anzahlPlaetze,
      menge: analyse.bestellung.mengeGesamt,
      artikel: analyse.bestellung.artikel,
      koernung: analyse.bestellung.koernung,
      lieferart: analyse.bestellung.lieferart,
    };

    // Berechne empfohlenen Preis
    const plz = analyse.kontakt.plz || '';
    const menge = analysiert.menge || 0;
    const empfohlenerPreis = plz && menge
      ? berechneEmpfohlenenPreis(plz, menge, analysiert.koernung, analysiert.lieferart)
      : null;

    // Erstelle Angebots-Vorschlag aus den analysierten Positionen
    const angebotsvorschlag = {
      positionen: analyse.angebotsvorschlag.empfohlenePositionen.map((pos) => ({
        artikelbezeichnung: pos.artikelbezeichnung,
        menge: pos.menge,
        einheit: pos.einheit,
        einzelpreis: pos.geschaetzterPreis || (empfohlenerPreis && pos.einheit === 't' ? empfohlenerPreis : undefined),
        gesamtpreis: pos.geschaetzterPreis
          ? pos.geschaetzterPreis * pos.menge
          : empfohlenerPreis && pos.einheit === 't'
          ? empfohlenerPreis * pos.menge
          : undefined,
      })),
      summeNetto: undefined,
      frachtkosten: undefined,
      empfohlenerPreisProTonne: empfohlenerPreis || undefined,
    };

    // Erstelle E-Mail-Vorschlag
    const emailVorschlag = {
      betreff: `Ihr Angebot von TennisMehl - ${analysiert.kundenname}`,
      text: generiereAngebotsEmail(analysiert.kundenname, analysiert.ansprechpartner),
      empfaenger: analysiert.email || '',
    };

    // Erstelle VerarbeiteteAnfrage-Objekt aus E-Mail
    const verarbeiteteAnfrage: VerarbeiteteAnfrage = {
      id: email.id,
      emailBetreff: email.subject,
      emailAbsender: email.from.address,
      emailDatum: email.date,
      emailText: emailText,
      emailHtml: email.bodyHtml || '',
      extrahierteDaten: {
        kundenname: analysiert.kundenname,
        email: analysiert.email,
        telefon: analysiert.telefon,
        adresse: {
          strasse: analysiert.strasse,
          plz: analyse.kontakt.plz,
          ort: analyse.kontakt.ort,
        },
        menge: analysiert.menge,
        artikel: analysiert.artikel,
      },
      status: 'neu',
      erstelltAm: email.date,
      aktualisiertAm: email.date,
      analysiert,
      angebotsvorschlag,
      emailVorschlag,
      verarbeitungsStatus: 'ausstehend',
    };

    return verarbeiteteAnfrage;
  };

  // Genehmige Anfrage: Erstelle Projekt und markiere als verarbeitet
  const handleGenehmigen = async (anfrage: VerarbeiteteAnfrage) => {
    if (!anfrage.analysiert.email) {
      alert('E-Mail-Adresse fehlt! Bitte manuell ergänzen.');
      return;
    }

    setProcessing(true);
    try {
      // Erstelle neues Projekt
      const neuesProjekt: NeuesProjekt = {
        projektName: anfrage.analysiert.kundenname,
        kundeId: '', // Wird später bei Zuordnung gesetzt
        kundenname: anfrage.analysiert.kundenname,
        kundenstrasse: anfrage.analysiert.strasse || '',
        kundenPlzOrt: anfrage.analysiert.plzOrt,
        kundenEmail: anfrage.analysiert.email,
        saisonjahr: new Date().getFullYear(),
        status: 'angebot_versendet', // Direkt auf "versendet" setzen
        angefragteMenge: anfrage.analysiert.menge,
        preisProTonne: anfrage.angebotsvorschlag.empfohlenerPreisProTonne,
        ansprechpartner: anfrage.analysiert.ansprechpartner,
        notizen: `Automatisch erstellt aus Anfrage vom ${new Date(anfrage.emailDatum).toLocaleDateString('de-DE')}\n\nOriginal-Nachricht:\n${anfrage.emailText}`,
      };

      const projekt = await projektService.createProjekt(neuesProjekt);

      // Speichere Anfrage in Appwrite für Nachverfolgung
      try {
        await anfragenService.createAnfrage({
          emailBetreff: anfrage.emailBetreff,
          emailAbsender: anfrage.emailAbsender,
          emailDatum: anfrage.emailDatum,
          emailText: anfrage.emailText,
          emailHtml: anfrage.emailHtml,
          extrahierteDaten: anfrage.extrahierteDaten,
        });
      } catch (e) {
        console.warn('Anfrage konnte nicht in Appwrite gespeichert werden:', e);
      }

      // Entferne aus der Liste (E-Mail bleibt im Postfach)
      setAnfragen((prev) => prev.filter((a) => a.id !== anfrage.id));
      setSelectedAnfrage(null);

      // Callback für Parent
      if (onAnfrageGenehmigt) {
        onAnfrageGenehmigt(projekt.id);
      }

      alert(`Projekt "${neuesProjekt.projektName}" wurde erstellt!\n\nDie E-Mail kann jetzt im Projektabwicklungs-Tab versendet werden.`);
    } catch (error) {
      console.error('Fehler beim Genehmigen:', error);
      alert('Fehler beim Erstellen des Projekts. Bitte erneut versuchen.');
    } finally {
      setProcessing(false);
    }
  };

  // Ablehnen: Entferne aus der Liste
  const handleAblehnen = async (anfrage: VerarbeiteteAnfrage) => {
    if (!confirm('Anfrage wirklich ablehnen?')) return;

    setProcessing(true);
    try {
      // Entferne einfach aus der lokalen Liste (E-Mail bleibt im Postfach)
      setAnfragen((prev) => prev.filter((a) => a.id !== anfrage.id));
      setSelectedAnfrage(null);
    } catch (error) {
      console.error('Fehler beim Ablehnen:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Zur Detail-Ansicht navigieren (manuell bearbeiten)
  const handleManuellBearbeiten = (_anfrage: VerarbeiteteAnfrage) => {
    navigate('/anfragen');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Lade Anfragen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Anfragen verarbeiten
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {anfragen.length} neue {anfragen.length === 1 ? 'Anfrage' : 'Anfragen'} zu
              bearbeiten
            </p>
          </div>
        </div>
        <button
          onClick={loadAnfragen}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Aktualisieren</span>
        </button>
      </div>

      {/* Anfragen-Liste und Detail-Ansicht */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Liste */}
        <div className="space-y-3">
          {anfragen.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                Alle Anfragen verarbeitet!
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Neue Anfragen erscheinen hier automatisch.
              </p>
            </div>
          ) : (
            anfragen.map((anfrage) => (
              <AnfrageCard
                key={anfrage.id}
                anfrage={anfrage}
                isSelected={selectedAnfrage?.id === anfrage.id}
                onClick={() => setSelectedAnfrage(anfrage)}
              />
            ))
          )}
        </div>

        {/* Detail-Ansicht */}
        {selectedAnfrage && (
          <AnfrageDetailPanel
            anfrage={selectedAnfrage}
            onGenehmigen={() => handleGenehmigen(selectedAnfrage)}
            onAblehnen={() => handleAblehnen(selectedAnfrage)}
            onManuellBearbeiten={() => handleManuellBearbeiten(selectedAnfrage)}
            onClose={() => setSelectedAnfrage(null)}
            processing={processing}
          />
        )}
      </div>
    </div>
  );
};

// Anfrage-Card Komponente
interface AnfrageCardProps {
  anfrage: VerarbeiteteAnfrage;
  isSelected: boolean;
  onClick: () => void;
}

const AnfrageCard = ({ anfrage, isSelected, onClick }: AnfrageCardProps) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-200 dark:ring-purple-900/50'
          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Kundenname */}
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <h3 className="font-bold text-gray-900 dark:text-white truncate">
              {anfrage.analysiert.kundenname}
            </h3>
          </div>

          {/* PLZ/Ort */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{anfrage.analysiert.plzOrt || 'Keine Adresse'}</span>
          </div>

          {/* Menge und Artikel */}
          {anfrage.analysiert.menge && (
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {anfrage.analysiert.menge}t {anfrage.analysiert.artikel || 'Tennismehl'}
              </span>
            </div>
          )}

          {/* Empfohlener Preis */}
          {anfrage.angebotsvorschlag.empfohlenerPreisProTonne && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-xs rounded-full">
              <Sparkles className="w-3 h-3" />
              ca. {anfrage.angebotsvorschlag.empfohlenerPreisProTonne} €/t empfohlen
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

// Detail-Panel Komponente
interface AnfrageDetailPanelProps {
  anfrage: VerarbeiteteAnfrage;
  onGenehmigen: () => void;
  onAblehnen: () => void;
  onManuellBearbeiten: () => void;
  onClose: () => void;
  processing: boolean;
}

const AnfrageDetailPanel = ({
  anfrage,
  onGenehmigen,
  onAblehnen,
  onManuellBearbeiten,
  onClose,
  processing,
}: AnfrageDetailPanelProps) => {
  const [activeTab, setActiveTab] = useState<'anfrage' | 'angebot' | 'email'>('anfrage');
  const [editedEmail, setEditedEmail] = useState(anfrage.emailVorschlag);

  // Aktualisiere E-Mail wenn Anfrage wechselt
  useEffect(() => {
    setEditedEmail(anfrage.emailVorschlag);
  }, [anfrage.id]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <Building2 className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">{anfrage.analysiert.kundenname}</h3>
              <p className="text-purple-200 text-sm">{anfrage.analysiert.plzOrt}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('anfrage')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'anfrage'
              ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4 inline mr-2" />
          Anfrage
        </button>
        <button
          onClick={() => setActiveTab('angebot')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'angebot'
              ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Angebot
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'email'
              ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <Send className="w-4 h-4 inline mr-2" />
          E-Mail
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {activeTab === 'anfrage' && (
          <div className="space-y-4">
            {/* Kontaktdaten */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <User className="w-4 h-4" />
                Kontaktdaten
              </h4>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-24">Name:</span>
                  <span className="text-gray-900 dark:text-white">{anfrage.analysiert.kundenname}</span>
                </div>
                {anfrage.analysiert.ansprechpartner && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-24">Kontakt:</span>
                    <span className="text-gray-900 dark:text-white">{anfrage.analysiert.ansprechpartner}</span>
                  </div>
                )}
                {anfrage.analysiert.strasse && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-24">Adresse:</span>
                    <span className="text-gray-900 dark:text-white">{anfrage.analysiert.strasse}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-24">PLZ/Ort:</span>
                  <span className="text-gray-900 dark:text-white">{anfrage.analysiert.plzOrt}</span>
                </div>
                {anfrage.analysiert.email && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-24">E-Mail:</span>
                    <span className="text-blue-600 dark:text-blue-400">{anfrage.analysiert.email}</span>
                  </div>
                )}
                {anfrage.analysiert.telefon && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-24">Telefon:</span>
                    <span className="text-gray-900 dark:text-white">{anfrage.analysiert.telefon}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bestellung */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Bestellung
              </h4>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2 text-sm">
                {anfrage.analysiert.anzahlPlaetze && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-800 dark:text-amber-300 w-24">Plätze:</span>
                    <span className="text-amber-900 dark:text-amber-200">{anfrage.analysiert.anzahlPlaetze}</span>
                  </div>
                )}
                {anfrage.analysiert.menge && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-800 dark:text-amber-300 w-24">Menge:</span>
                    <span className="text-amber-900 dark:text-amber-200 font-bold">{anfrage.analysiert.menge} Tonnen</span>
                  </div>
                )}
                {anfrage.analysiert.artikel && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-800 dark:text-amber-300 w-24">Artikel:</span>
                    <span className="text-amber-900 dark:text-amber-200">{anfrage.analysiert.artikel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Original E-Mail */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Original E-Mail
              </h4>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {anfrage.emailText}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'angebot' && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Angebots-Vorschlag
              </h4>

              {/* Positionen */}
              <div className="space-y-2 mb-4">
                {anfrage.angebotsvorschlag.positionen.map((pos, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 text-sm"
                  >
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">{pos.artikelbezeichnung}</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2">
                        {pos.menge} {pos.einheit}
                      </span>
                    </div>
                    {pos.einzelpreis && (
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {pos.einzelpreis.toFixed(2)} €/{pos.einheit}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Empfohlener Preis */}
              {anfrage.angebotsvorschlag.empfohlenerPreisProTonne && (
                <div className="border-t border-green-200 dark:border-green-800 pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700 dark:text-green-400">Empfohlener Preis/t:</span>
                    <span className="font-bold text-green-800 dark:text-green-300">
                      {anfrage.angebotsvorschlag.empfohlenerPreisProTonne.toFixed(2)} €
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Das finale Angebot wird im Projektabwicklungs-Tab erstellt. Dort können Sie alle Details anpassen.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="space-y-4">
            {/* Empfänger */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Empfänger
              </label>
              <input
                type="email"
                value={editedEmail.empfaenger}
                onChange={(e) => setEditedEmail({ ...editedEmail, empfaenger: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                placeholder="email@example.com"
              />
            </div>

            {/* Betreff */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Betreff
              </label>
              <input
                type="text"
                value={editedEmail.betreff}
                onChange={(e) => setEditedEmail({ ...editedEmail, betreff: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
              />
            </div>

            {/* Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nachricht
              </label>
              <textarea
                value={editedEmail.text}
                onChange={(e) => setEditedEmail({ ...editedEmail, text: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm resize-none"
              />
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <Mail className="w-4 h-4 inline mr-1" />
                Die E-Mail wird im Projektabwicklungs-Tab versendet, zusammen mit dem generierten Angebots-PDF.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
        <div className="flex gap-3">
          <button
            onClick={onAblehnen}
            disabled={processing}
            className="flex-1 px-4 py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Ablehnen
          </button>
          <button
            onClick={onManuellBearbeiten}
            disabled={processing}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Bearbeiten
          </button>
          <button
            onClick={onGenehmigen}
            disabled={processing || !anfrage.analysiert.email}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Genehmigen
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnfragenVerarbeitung;
