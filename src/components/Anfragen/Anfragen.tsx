import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Filter,
  Search,
  User,
  UserPlus,
  FileText,
  Send,
  CheckCircle,
  Eye,
  X,
  Calendar,
  MapPin,
  Phone,
  Package,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Workflow,
  Database,
  Zap,
  History,
  Clock,
  ExternalLink
} from 'lucide-react';
import { anfragenService } from '../../services/anfragenService';
import { Anfrage, AnfrageStatus } from '../../types/anfragen';
import { ladeAlleEmailProtokolle } from '../../services/emailSendService';
import { EmailProtokoll } from '../../types/email';
import { kundenService } from '../../services/kundenService';
import { Kunde } from '../../types/dispo';
import { saisonplanungService } from '../../services/saisonplanungService';
import { SaisonKunde } from '../../types/saisonplanung';
import { projektService } from '../../services/projektService';
import { NeuesProjekt } from '../../types/projekt';
import { useAuth } from '../../contexts/AuthContext';

const Anfragen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [anfragen, setAnfragen] = useState<Anfrage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnfrage, setSelectedAnfrage] = useState<Anfrage | null>(null);
  const [statusFilter, setStatusFilter] = useState<AnfrageStatus | 'alle'>('alle');
  const [searchQuery, setSearchQuery] = useState('');
  const [showKundenDialog, setShowKundenDialog] = useState(false);
  const [showProjektDialog, setShowProjektDialog] = useState(false);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [saisonKunden, setSaisonKunden] = useState<SaisonKunde[]>([]);
  const [kundenSuche, setKundenSuche] = useState('');
  const [isCreatingProjekt, setIsCreatingProjekt] = useState(false);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [activeTab, setActiveTab] = useState<'anfragen' | 'verlauf'>('anfragen');

  useEffect(() => {
    loadAnfragen();
    loadKunden();
  }, []);

  const loadAnfragen = async () => {
    setLoading(true);
    try {
      const loadedAnfragen = statusFilter === 'alle'
        ? await anfragenService.loadAlleAnfragen()
        : await anfragenService.loadAnfragenNachStatus(statusFilter);
      setAnfragen(loadedAnfragen);
    } catch (error: any) {
      console.error('Fehler beim Laden der Anfragen:', error);
      // Wenn Collection nicht existiert, leere Liste anzeigen
      if (error?.code === 404 || error?.message?.includes('could not be found')) {
        console.warn('⚠️ Collection "anfragen" existiert noch nicht in Appwrite. Bitte erstellen Sie die Collection gemäß Blueprint.');
        setAnfragen([]);
      } else {
        // Bei anderen Fehlern auch leere Liste, aber Fehler loggen
        setAnfragen([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadKunden = async () => {
    try {
      const [dispoKunden, saisonKundenList] = await Promise.all([
        kundenService.loadAlleKunden(),
        saisonplanungService.loadAlleKunden()
      ]);
      setKunden(dispoKunden);
      setSaisonKunden(saisonKundenList);
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
    }
  };

  useEffect(() => {
    loadAnfragen();
  }, [statusFilter]);

  const getStatusColor = (status: AnfrageStatus): string => {
    switch (status) {
      case 'neu':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'zugeordnet':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'angebot_erstellt':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'angebot_versendet':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'abgelehnt':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'erledigt':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusLabel = (status: AnfrageStatus): string => {
    switch (status) {
      case 'neu':
        return 'Neu';
      case 'zugeordnet':
        return 'Zugeordnet';
      case 'angebot_erstellt':
        return 'Angebot erstellt';
      case 'angebot_versendet':
        return 'Angebot versendet';
      case 'abgelehnt':
        return 'Abgelehnt';
      case 'erledigt':
        return 'Erledigt';
      default:
        return status;
    }
  };

  const handleKundeZuordnen = async (anfrageId: string, kundeId: string, kundeTyp: 'dispo' | 'saison') => {
    try {
      await anfragenService.updateAnfrage(anfrageId, {
        zugeordneterKundeId: kundeId,
        zugeordneterKundeTyp: kundeTyp,
        status: 'zugeordnet',
        bearbeitetVon: user?.$id,
      });
      setShowKundenDialog(false);
      setSelectedAnfrage(null);
      loadAnfragen();
    } catch (error) {
      console.error('Fehler beim Zuordnen des Kunden:', error);
      alert('Fehler beim Zuordnen des Kunden.');
    }
  };

  const handleProjektErstellen = async (projekt: NeuesProjekt) => {
    if (!selectedAnfrage) return;

    setIsCreatingProjekt(true);
    try {
      const neuesProjekt = await projektService.createProjekt(projekt);
      
      // Aktualisiere Anfrage mit Projekt-ID
      await anfragenService.updateAnfrage(selectedAnfrage.id, {
        angebotId: neuesProjekt.id,
        status: 'angebot_erstellt',
        bearbeitetVon: user?.$id,
      });

      setShowProjektDialog(false);
      setSelectedAnfrage(null);
      loadAnfragen();
      
      // Navigiere zur Projektabwicklung
      navigate(`/projektabwicklung/${neuesProjekt.id}`);
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      alert('Fehler beim Erstellen des Projekts.');
    } finally {
      setIsCreatingProjekt(false);
    }
  };

  const handleAngebotVersendet = async (anfrageId: string) => {
    try {
      await anfragenService.markiereAngebotAlsVersendet(anfrageId);
      loadAnfragen();
    } catch (error) {
      console.error('Fehler beim Markieren als versendet:', error);
      alert('Fehler beim Markieren als versendet.');
    }
  };

  const filteredAnfragen = anfragen.filter(anfrage => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      anfrage.emailBetreff.toLowerCase().includes(query) ||
      anfrage.emailAbsender.toLowerCase().includes(query) ||
      anfrage.emailText.toLowerCase().includes(query) ||
      anfrage.extrahierteDaten.kundenname?.toLowerCase().includes(query) ||
      anfrage.extrahierteDaten.email?.toLowerCase().includes(query)
    );
  });


  const getKundeFuerAnfrage = (anfrage: Anfrage): any => {
    if (!anfrage.zugeordneterKundeId) return null;
    
    if (anfrage.zugeordneterKundeTyp === 'dispo') {
      const kunde = kunden.find(k => k.id === anfrage.zugeordneterKundeId);
      return kunde ? {
        id: kunde.id,
        name: kunde.name,
        kundennummer: kunde.kundennummer,
        adresse: kunde.adresse,
      } : null;
    } else {
      const saisonKunde = saisonKunden.find(k => k.id === anfrage.zugeordneterKundeId);
      return saisonKunde ? {
        id: saisonKunde.id,
        name: saisonKunde.name,
        kundennummer: saisonKunde.kundennummer,
        adresse: saisonKunde.rechnungsadresse, // Nutze Rechnungsadresse für Briefkopf/Dokumente
      } : null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Anfragen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Anfragen</h1>
                <p className="text-gray-600 dark:text-dark-textMuted mt-1">
                  Automatisch erkannte E-Mail-Anfragen verwalten
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowBlueprint(!showBlueprint)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors border border-teal-200"
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">Konzept anzeigen</span>
              {showBlueprint ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Tab-Umschalter */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('anfragen')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                activeTab === 'anfragen'
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Mail className="w-5 h-5" />
              Anfragen
              {anfragen.filter(a => a.status === 'neu').length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {anfragen.filter(a => a.status === 'neu').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('verlauf')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                activeTab === 'verlauf'
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Send className="w-5 h-5" />
              E-Mail-Verlauf
            </button>
          </div>

          {/* Filter und Suche - nur bei Anfragen-Tab */}
          {activeTab === 'anfragen' && (
            <div className="flex flex-col md:flex-row gap-4">
              {/* Status-Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-5 h-5 text-gray-500 dark:text-dark-textMuted" />
                <button
                  onClick={() => setStatusFilter('alle')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === 'alle'
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Alle
                </button>
                {(['neu', 'zugeordnet', 'angebot_erstellt', 'angebot_versendet', 'erledigt'] as AnfrageStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>

              {/* Suche */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Anfragen durchsuchen..."
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Suche - nur bei Verlauf-Tab */}
          {activeTab === 'verlauf' && (
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Verlauf durchsuchen..."
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          )}
        </div>

        {/* Blueprint / Konzept-Sektion */}
        {showBlueprint && (
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 mb-6 border-2 border-teal-200">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-6 h-6 text-teal-600" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Konzept: Automatische E-Mail-Anfragen-Verarbeitung</h2>
            </div>

            <div className="space-y-6">
              {/* Architektur */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-teal-600" />
                  Architektur
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-dark-textMuted">
                    <span className="font-semibold">E-Mail-Postfach</span>
                    <span>→</span>
                    <span className="font-semibold">n8n Workflow</span>
                    <span>→</span>
                    <span className="font-semibold">Appwrite Database</span>
                    <span>→</span>
                    <span className="font-semibold">Anfragen-Tool (Frontend)</span>
                  </div>
                </div>
              </div>

              {/* n8n Workflow */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-teal-600" />
                  n8n Workflow Setup
                </h3>
                <div className="space-y-4">
                  <div className="bg-teal-50 rounded-lg p-4 border-l-4 border-teal-500">
                    <h4 className="font-semibold text-teal-900 mb-2">1. E-Mail-Trigger</h4>
                    <ul className="text-sm text-teal-800 space-y-1 list-disc list-inside">
                      <li>IMAP / Gmail Trigger konfigurieren</li>
                      <li>Polling-Intervall: 5-15 Minuten</li>
                      <li>Filter: Betreff enthält "Anfrage", "Angebot", "Preis", "Ziegelmehl"</li>
                    </ul>
                  </div>

                  <div className="bg-teal-50 rounded-lg p-4 border-l-4 border-teal-500">
                    <h4 className="font-semibold text-teal-900 mb-2">2. E-Mail-Parsing & Extraktion</h4>
                    <ul className="text-sm text-teal-800 space-y-1 list-disc list-inside">
                      <li><strong>AI/LLM-basierte Extraktion</strong> (empfohlen): OpenAI/Anthropic Node</li>
                      <li>Extrahiert: Kundenname, E-Mail, Telefon, Adresse, Menge, Artikel, Lieferdatum</li>
                      <li><strong>Fallback:</strong> RegEx-basierte Extraktion wenn kein AI verfügbar</li>
                    </ul>
                    <div className="mt-3 bg-white dark:bg-dark-surface rounded p-3 text-xs font-mono text-gray-700 dark:text-dark-textMuted">
                      <div className="font-semibold mb-1">AI-Prompt Beispiel:</div>
                      <div>Extrahiere strukturierte Daten aus E-Mail: Kundenname, Adresse, Menge, Artikel, Lieferdatum...</div>
                    </div>
                  </div>

                  <div className="bg-teal-50 rounded-lg p-4 border-l-4 border-teal-500">
                    <h4 className="font-semibold text-teal-900 mb-2">3. Duplikat-Erkennung</h4>
                    <ul className="text-sm text-teal-800 space-y-1 list-disc list-inside">
                      <li>Hash aus: Absender + Betreff + Datum (nur Tag)</li>
                      <li>Prüfung in Appwrite ob bereits vorhanden</li>
                      <li>Bei Duplikat: Skip oder Update bestehender Eintrag</li>
                    </ul>
                  </div>

                  <div className="bg-teal-50 rounded-lg p-4 border-l-4 border-teal-500">
                    <h4 className="font-semibold text-teal-900 mb-2">4. Appwrite-Integration</h4>
                    <ul className="text-sm text-teal-800 space-y-1 list-disc list-inside">
                      <li>HTTP Request Node: POST zu Appwrite API</li>
                      <li>Collection: <code className="bg-white dark:bg-dark-surface px-1 rounded">anfragen</code></li>
                      <li>Speichert: E-Mail-Daten + extrahierte Daten als JSON</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Workflow im Frontend */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-600" />
                  Workflow im Frontend
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                    <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      1. Kunde zuordnen
                    </h4>
                    <p className="text-sm text-blue-800">
                      Per Klick einen bestehenden Kunden auswählen oder neuen Kunden anlegen
                    </p>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                    <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      2. Angebot erstellen
                    </h4>
                    <p className="text-sm text-purple-800">
                      Neues Projekt/Angebot erstellen mit vorausgefüllten Daten aus der Anfrage
                    </p>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                    <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      3. Angebot versenden
                    </h4>
                    <p className="text-sm text-green-800">
                      Angebot in Projektabwicklung erstellen und als versendet markieren
                    </p>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
                    <h4 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      4. Status-Tracking
                    </h4>
                    <p className="text-sm text-orange-800">
                      Status: neu → zugeordnet → angebot_erstellt → angebot_versendet → erledigt
                    </p>
                  </div>
                </div>
              </div>

              {/* Appwrite Collection */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-600" />
                  Appwrite Collection Schema
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="text-sm space-y-2">
                    <div><strong>Collection ID:</strong> <code className="bg-white dark:bg-dark-surface px-2 py-1 rounded">anfragen</code></div>
                    <div className="mt-3">
                      <strong>Wichtige Attribute:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-dark-textMuted">
                        <li><code>emailBetreff</code>, <code>emailAbsender</code>, <code>emailDatum</code>, <code>emailText</code></li>
                        <li><code>extrahierteDaten</code> (JSON-String mit kundenname, adresse, menge, etc.)</li>
                        <li><code>status</code> (neu, zugeordnet, angebot_erstellt, angebot_versendet, erledigt)</li>
                        <li><code>zugeordneterKundeId</code>, <code>zugeordneterKundeTyp</code></li>
                        <li><code>angebotId</code> (Projekt-ID wenn Angebot erstellt wurde)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nächste Schritte */}
              <div className="bg-yellow-50 rounded-lg p-4 border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-yellow-900 mb-3">Nächste Schritte</h3>
                <ol className="text-sm text-yellow-800 space-y-2 list-decimal list-inside">
                  <li><strong>Appwrite Collection erstellen:</strong> Collection "anfragen" mit allen Attributen gemäß Blueprint</li>
                  <li><strong>n8n Workflow einrichten:</strong> E-Mail-Trigger, AI-Extraktion, Appwrite-Integration</li>
                  <li><strong>Testen:</strong> Test-E-Mail senden und prüfen ob Anfrage erstellt wird</li>
                  <li><strong>Workflow aktivieren:</strong> Automatische Verarbeitung starten</li>
                </ol>
                <div className="mt-4 p-3 bg-white dark:bg-dark-surface rounded border border-yellow-200">
                  <p className="text-xs text-yellow-700">
                    <strong>📄 Vollständige Dokumentation:</strong> Siehe <code>ANFRAGEN_BLUEPRINT.md</code> für detaillierte Anleitung, 
                    API-Beispiele, Sicherheitsrichtlinien und Troubleshooting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Anfragen-Liste */}
        {activeTab === 'anfragen' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredAnfragen.map((anfrage) => {
              const zugeordneterKunde = getKundeFuerAnfrage(anfrage);
              return (
                <div
                  key={anfrage.id}
                  className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => setSelectedAnfrage(anfrage)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(anfrage.status)}`}>
                          {getStatusLabel(anfrage.status)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                          {new Date(anfrage.emailDatum).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-1">
                        {anfrage.emailBetreff}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-dark-textMuted mb-2">
                        Von: {anfrage.emailAbsender}
                      </p>
                    </div>
                  </div>

                  {/* Extrahierte Daten */}
                  {anfrage.extrahierteDaten.kundenname && (
                    <div className="bg-teal-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-teal-600" />
                        <span className="font-medium text-teal-900">
                          {anfrage.extrahierteDaten.kundenname}
                        </span>
                      </div>
                      {anfrage.extrahierteDaten.menge && (
                        <div className="flex items-center gap-2 text-sm mt-1">
                          <Package className="w-4 h-4 text-teal-600" />
                          <span className="text-teal-700">
                            {anfrage.extrahierteDaten.menge} {anfrage.extrahierteDaten.artikel || 'Tonnen'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Zugeordneter Kunde */}
                  {zugeordneterKunde && (
                    <div className="bg-green-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-green-900">
                          Kunde: {zugeordneterKunde.name}
                          {zugeordneterKunde.kundennummer && ` (${zugeordneterKunde.kundennummer})`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Vorschau E-Mail-Text */}
                  <p className="text-sm text-gray-600 dark:text-dark-textMuted line-clamp-3 mb-4">
                    {anfrage.emailText.substring(0, 150)}...
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnfrage(anfrage);
                      }}
                      className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* E-Mail-Verlauf */}
        {activeTab === 'verlauf' && (
          <EmailVerlauf
            searchQuery={searchQuery}
            navigate={navigate}
          />
        )}

        {activeTab === 'anfragen' && filteredAnfragen.length === 0 && !loading && (
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-12 text-center">
            <Mail className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-dark-textMuted text-lg mb-2">
              {searchQuery ? 'Keine Anfragen gefunden' : 'Noch keine Anfragen vorhanden'}
            </p>
            {!searchQuery && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-2xl mx-auto">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>Hinweis:</strong> Falls die Collection noch nicht existiert, erstellen Sie bitte die Collection "anfragen" in Appwrite.
                </p>
                <p className="text-xs text-yellow-700">
                  Siehe ANFRAGEN_BLUEPRINT.md für Details zur Collection-Struktur.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail-Dialog */}
      {selectedAnfrage && (
        <AnfrageDetailDialog
          anfrage={selectedAnfrage}
          zugeordneterKunde={getKundeFuerAnfrage(selectedAnfrage)}
          onClose={() => setSelectedAnfrage(null)}
          onKundeZuordnen={() => {
            setSelectedAnfrage(null);
            setShowKundenDialog(true);
          }}
          onProjektErstellen={() => {
            if (!selectedAnfrage.zugeordneterKundeId) {
              alert('Bitte ordnen Sie zuerst einen Kunden zu.');
              return;
            }
            setShowProjektDialog(true);
          }}
          onAngebotVersendet={() => handleAngebotVersendet(selectedAnfrage.id)}
        />
      )}

      {/* Kunden-Auswahl-Dialog */}
      {showKundenDialog && selectedAnfrage && (
        <KundenAuswahlDialog
          kunden={kunden}
          saisonKunden={saisonKunden}
          suche={kundenSuche}
          onSucheChange={setKundenSuche}
          onKundeAuswaehlen={(kundeId, kundeTyp) => {
            handleKundeZuordnen(selectedAnfrage.id, kundeId, kundeTyp);
            setShowKundenDialog(false);
          }}
          onClose={() => {
            setShowKundenDialog(false);
            setKundenSuche('');
          }}
          onNeuerKunde={() => {
            setShowKundenDialog(false);
            // Navigiere zur Kundenliste für neuen Kunden
            navigate('/saisonplanung');
          }}
        />
      )}

      {/* Projekt-Erstellen-Dialog */}
      {showProjektDialog && selectedAnfrage && (
        <ProjektErstellenDialog
          anfrage={selectedAnfrage}
          kunde={getKundeFuerAnfrage(selectedAnfrage)}
          onSave={handleProjektErstellen}
          onClose={() => {
            setShowProjektDialog(false);
            setSelectedAnfrage(null);
          }}
          saving={isCreatingProjekt}
        />
      )}
    </div>
  );
};

// Detail-Dialog Komponente
interface AnfrageDetailDialogProps {
  anfrage: Anfrage;
  zugeordneterKunde: any;
  onClose: () => void;
  onKundeZuordnen: () => void;
  onProjektErstellen: () => void;
  onAngebotVersendet: () => void;
}

const AnfrageDetailDialog = ({
  anfrage,
  zugeordneterKunde,
  onClose,
  onKundeZuordnen,
  onProjektErstellen,
  onAngebotVersendet,
}: AnfrageDetailDialogProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Anfrage-Details</h2>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted mt-1">{anfrage.emailBetreff}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* E-Mail-Informationen */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3">E-Mail-Informationen</h3>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <div><span className="font-medium">Von:</span> {anfrage.emailAbsender}</div>
              <div><span className="font-medium">Datum:</span> {new Date(anfrage.emailDatum).toLocaleString('de-DE')}</div>
              <div><span className="font-medium">Betreff:</span> {anfrage.emailBetreff}</div>
            </div>
          </div>

          {/* Extrahierte Daten */}
          {anfrage.extrahierteDaten && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3">Extrahierte Informationen</h3>
              <div className="bg-teal-50 rounded-lg p-4 space-y-3">
                {anfrage.extrahierteDaten.kundenname && (
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">Kunde:</span> {anfrage.extrahierteDaten.kundenname}
                  </div>
                )}
                {anfrage.extrahierteDaten.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">E-Mail:</span> {anfrage.extrahierteDaten.email}
                  </div>
                )}
                {anfrage.extrahierteDaten.telefon && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">Telefon:</span> {anfrage.extrahierteDaten.telefon}
                  </div>
                )}
                {anfrage.extrahierteDaten.adresse && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">Adresse:</span>{' '}
                    {[
                      anfrage.extrahierteDaten.adresse.strasse,
                      anfrage.extrahierteDaten.adresse.plz,
                      anfrage.extrahierteDaten.adresse.ort,
                    ].filter(Boolean).join(', ')}
                  </div>
                )}
                {anfrage.extrahierteDaten.menge && (
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">Menge:</span> {anfrage.extrahierteDaten.menge} {anfrage.extrahierteDaten.artikel || 'Tonnen'}
                  </div>
                )}
                {anfrage.extrahierteDaten.lieferdatum && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-teal-600" />
                    <span className="font-medium">Lieferdatum:</span> {anfrage.extrahierteDaten.lieferdatum}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* E-Mail-Text */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3">E-Mail-Text</h3>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-dark-textMuted">{anfrage.emailText}</pre>
            </div>
          </div>

          {/* Zugeordneter Kunde */}
          {zugeordneterKunde ? (
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Zugeordneter Kunde</h3>
              <p className="text-green-800">
                {zugeordneterKunde.name}
                {zugeordneterKunde.kundennummer && ` (${zugeordneterKunde.kundennummer})`}
              </p>
            </div>
          ) : (
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-yellow-800 mb-3">Noch keinem Kunden zugeordnet</p>
              <button
                onClick={onKundeZuordnen}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Kunde zuordnen
              </button>
            </div>
          )}

          {/* Aktionen */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            {zugeordneterKunde && !anfrage.angebotId && (
              <button
                onClick={onProjektErstellen}
                className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Angebot erstellen
              </button>
            )}
            {anfrage.angebotId && anfrage.status !== 'angebot_versendet' && (
              <>
                <button
                  onClick={() => {
                    onClose();
                    // Navigiere zur Projektabwicklung
                    window.location.href = `/projektabwicklung/${anfrage.angebotId}`;
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Angebot öffnen
                </button>
                <button
                  onClick={onAngebotVersendet}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Als versendet markieren
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Kunden-Auswahl-Dialog
interface KundenAuswahlDialogProps {
  kunden: Kunde[];
  saisonKunden: SaisonKunde[];
  suche: string;
  onSucheChange: (suche: string) => void;
  onKundeAuswaehlen: (kundeId: string, kundeTyp: 'dispo' | 'saison') => void;
  onClose: () => void;
  onNeuerKunde: () => void;
}

const KundenAuswahlDialog = ({
  kunden,
  saisonKunden,
  suche,
  onSucheChange,
  onKundeAuswaehlen,
  onClose,
  onNeuerKunde,
}: KundenAuswahlDialogProps) => {
  const gefilterteKunden = [
    ...kunden.filter(k =>
      k && k.name && (
        k.name.toLowerCase().includes(suche.toLowerCase()) ||
        k.kundennummer?.toLowerCase().includes(suche.toLowerCase())
      )
    ).map(k => ({ ...k, typ: 'dispo' as const })),
    ...saisonKunden.filter(k =>
      k && k.name && (
        k.name.toLowerCase().includes(suche.toLowerCase()) ||
        k.kundennummer?.toLowerCase().includes(suche.toLowerCase())
      )
    ).map(k => ({ ...k, typ: 'saison' as const }))
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Kunde auswählen</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              value={suche}
              onChange={(e) => onSucheChange(e.target.value)}
              placeholder="Kunde suchen..."
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {gefilterteKunden.map((item) => {
              const kunde = item;
              const typ = 'typ' in item ? item.typ : 'dispo';
              return (
                <button
                  key={kunde.id}
                  onClick={() => onKundeAuswaehlen(kunde.id, typ)}
                  className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="font-semibold text-gray-900 dark:text-dark-text">{kunde.name}</div>
                  {kunde.kundennummer && (
                    <div className="text-sm text-gray-600 dark:text-dark-textMuted">Nr: {kunde.kundennummer}</div>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={onNeuerKunde}
            className="mt-4 w-full px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Neuen Kunden anlegen
          </button>
        </div>
      </div>
    </div>
  );
};

// Projekt-Erstellen-Dialog
interface ProjektErstellenDialogProps {
  anfrage: Anfrage;
  kunde: any;
  onSave: (projekt: NeuesProjekt) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

const ProjektErstellenDialog = ({
  anfrage,
  kunde,
  onSave,
  onClose,
  saving,
}: ProjektErstellenDialogProps) => {
  const [formData, setFormData] = useState({
    projektName: `${kunde?.name || anfrage.extrahierteDaten.kundenname || 'Neues Projekt'} - ${new Date().getFullYear()}`,
    saisonjahr: new Date().getFullYear(),
    angefragteMenge: anfrage.extrahierteDaten.menge || 0,
    preisProTonne: 0,
    bezugsweg: 'direkt' as 'direkt' | 'platzbauer',
    notizen: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kunde) {
      alert('Kein Kunde zugeordnet');
      return;
    }

    const projekt: NeuesProjekt = {
      projektName: formData.projektName,
      kundeId: kunde.id,
      kundennummer: kunde.kundennummer,
      kundenname: kunde.name,
      kundenstrasse: kunde.adresse?.strasse || '',
      kundenPlzOrt: `${kunde.adresse?.plz || ''} ${kunde.adresse?.ort || ''}`.trim(),
      saisonjahr: formData.saisonjahr,
      status: 'angebot',
      angefragteMenge: formData.angefragteMenge || undefined,
      preisProTonne: formData.preisProTonne || undefined,
      bezugsweg: formData.bezugsweg || undefined,
      notizen: formData.notizen || undefined,
    };

    await onSave(projekt);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Projekt erstellen</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted" disabled={saving}>
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">Projektname</label>
            <input
              type="text"
              value={formData.projektName}
              onChange={(e) => setFormData({ ...formData, projektName: e.target.value })}
              className="w-full p-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">Saisonjahr</label>
            <input
              type="number"
              value={formData.saisonjahr}
              onChange={(e) => setFormData({ ...formData, saisonjahr: parseInt(e.target.value) })}
              className="w-full p-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">Angefragte Menge (Tonnen)</label>
            <input
              type="number"
              value={formData.angefragteMenge}
              onChange={(e) => setFormData({ ...formData, angefragteMenge: parseFloat(e.target.value) })}
              className="w-full p-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">Preis pro Tonne (€)</label>
            <input
              type="number"
              step="0.01"
              value={formData.preisProTonne}
              onChange={(e) => setFormData({ ...formData, preisProTonne: parseFloat(e.target.value) })}
              className="w-full p-2 border-2 border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 dark:text-dark-textMuted rounded-lg hover:bg-gray-300 transition-colors"
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Erstelle...' : 'Projekt erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// E-Mail-Verlauf Komponente - zeigt alle versendeten E-Mails
interface EmailVerlaufProps {
  searchQuery: string;
  navigate: (path: string) => void;
}

const EmailVerlauf = ({ searchQuery, navigate }: EmailVerlaufProps) => {
  const [emailProtokolle, setEmailProtokolle] = useState<EmailProtokoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTyp, setFilterTyp] = useState<'alle' | 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung'>('alle');

  useEffect(() => {
    const ladeProtokolle = async () => {
      setLoading(true);
      try {
        // Reduziert auf 200 für bessere Performance
        const protokolle = await ladeAlleEmailProtokolle(200);
        setEmailProtokolle(protokolle);
      } catch (error) {
        console.error('Fehler beim Laden der E-Mail-Protokolle:', error);
      } finally {
        setLoading(false);
      }
    };
    ladeProtokolle();
  }, []);

  // Filtere Protokolle
  const gefilterteProtokolle = emailProtokolle
    .filter(p => filterTyp === 'alle' || p.dokumentTyp === filterTyp)
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        p.empfaenger.toLowerCase().includes(query) ||
        p.betreff.toLowerCase().includes(query) ||
        p.dokumentNummer.toLowerCase().includes(query) ||
        p.absender.toLowerCase().includes(query)
      );
    });

  const getDokumentTypLabel = (typ: string): string => {
    switch (typ) {
      case 'angebot': return 'Angebot';
      case 'auftragsbestaetigung': return 'Auftragsbestätigung';
      case 'lieferschein': return 'Lieferschein';
      case 'rechnung': return 'Rechnung';
      default: return typ;
    }
  };

  const getDokumentTypColor = (typ: string): string => {
    switch (typ) {
      case 'angebot': return 'bg-blue-100 text-blue-800';
      case 'auftragsbestaetigung': return 'bg-green-100 text-green-800';
      case 'lieferschein': return 'bg-orange-100 text-orange-800';
      case 'rechnung': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Lade E-Mail-Verlauf...</p>
      </div>
    );
  }

  if (emailProtokolle.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-12 text-center">
        <History className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-dark-textMuted text-lg mb-2">
          Noch keine E-Mails versendet
        </p>
        <p className="text-gray-500 text-sm">
          Hier erscheinen alle E-Mails, die über das System versendet wurden.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter-Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-5 h-5 text-gray-500" />
        {(['alle', 'angebot', 'auftragsbestaetigung', 'lieferschein', 'rechnung'] as const).map((typ) => (
          <button
            key={typ}
            onClick={() => setFilterTyp(typ)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterTyp === typ
                ? 'bg-teal-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {typ === 'alle' ? 'Alle' : getDokumentTypLabel(typ)}
            <span className="ml-1 text-xs opacity-75">
              ({typ === 'alle'
                ? emailProtokolle.length
                : emailProtokolle.filter(p => p.dokumentTyp === typ).length})
            </span>
          </button>
        ))}
      </div>

      {/* Tabelle */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <Send className="w-5 h-5 text-teal-600" />
            <h2 className="font-semibold text-gray-900 dark:text-dark-text">
              Versendete E-Mails ({gefilterteProtokolle.length})
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Datum / Zeit
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Dokument-Nr.
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Empfänger
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Betreff
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 dark:text-dark-textMuted uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {gefilterteProtokolle.map((protokoll) => (
                <tr
                  key={protokoll.$id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-dark-text">
                          {new Date(protokoll.gesendetAm).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(protokoll.gesendetAm).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })} Uhr
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDokumentTypColor(protokoll.dokumentTyp)}`}>
                      {getDokumentTypLabel(protokoll.dokumentTyp)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="font-mono text-sm text-gray-900 dark:text-dark-text">
                        {protokoll.dokumentNummer}
                      </span>
                      {protokoll.pdfVersion && protokoll.pdfVersion > 1 && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          v{protokoll.pdfVersion}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-dark-textMuted truncate max-w-[200px]" title={protokoll.empfaenger}>
                        {protokoll.empfaenger}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 dark:text-dark-textMuted truncate max-w-[250px] block" title={protokoll.betreff}>
                      {protokoll.betreff}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {protokoll.status === 'gesendet' ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Gesendet
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 text-sm" title={protokoll.fehlerMeldung}>
                        <X className="w-4 h-4" />
                        Fehler
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => navigate(`/projektabwicklung/${protokoll.projektId}`)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Projekt öffnen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {gefilterteProtokolle.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Keine E-Mails gefunden für die aktuelle Filterung.
          </div>
        )}

        {/* Zusammenfassung */}
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-t border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-dark-textMuted">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1">
                <Send className="w-4 h-4 text-green-500" />
                {emailProtokolle.filter(p => p.status === 'gesendet').length} erfolgreich gesendet
              </span>
              {emailProtokolle.filter(p => p.status === 'fehler').length > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <X className="w-4 h-4" />
                  {emailProtokolle.filter(p => p.status === 'fehler').length} fehlgeschlagen
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span>Angebote: {emailProtokolle.filter(p => p.dokumentTyp === 'angebot').length}</span>
              <span>AB: {emailProtokolle.filter(p => p.dokumentTyp === 'auftragsbestaetigung').length}</span>
              <span>LS: {emailProtokolle.filter(p => p.dokumentTyp === 'lieferschein').length}</span>
              <span>RE: {emailProtokolle.filter(p => p.dokumentTyp === 'rechnung').length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Anfragen;

