import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  User,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Trash2,
  ExternalLink,
  MessageSquare,
  CreditCard,
  Send,
  ChevronUp,
} from 'lucide-react';
import {
  DebitorView,
  DebitorAktivitaet,
  DebitorAktivitaetsTyp,
  DEBITOR_STATUS_CONFIG,
  MAHNSTUFEN_CONFIG,
} from '../../types/debitor';
import { debitorService } from '../../services/debitorService';

interface DebitorDetailProps {
  debitor: DebitorView;
  onClose: () => void;
  onUpdate: () => void;
}

const DebitorDetail = ({ debitor, onClose, onUpdate }: DebitorDetailProps) => {
  const navigate = useNavigate();
  const [showZahlungFormular, setShowZahlungFormular] = useState(false);
  const [showAktivitaetFormular, setShowAktivitaetFormular] = useState(false);
  const [loading, setLoading] = useState(false);

  // Zahlung Formular State
  const [zahlungBetrag, setZahlungBetrag] = useState<string>(debitor.offenerBetrag.toFixed(2));
  const [zahlungDatum, setZahlungDatum] = useState<string>(new Date().toISOString().split('T')[0]);
  const [zahlungNotiz, setZahlungNotiz] = useState<string>('');
  const [zahlungArt, setZahlungArt] = useState<'ueberweisung' | 'bar' | 'lastschrift' | 'scheck'>('ueberweisung');

  // Aktivität Formular State
  const [aktivitaetTyp, setAktivitaetTyp] = useState<DebitorAktivitaetsTyp>('kommentar');
  const [aktivitaetTitel, setAktivitaetTitel] = useState<string>('');
  const [aktivitaetBeschreibung, setAktivitaetBeschreibung] = useState<string>('');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  // Zahlung hinzufügen
  const handleAddZahlung = async () => {
    const betrag = parseFloat(zahlungBetrag.replace(',', '.'));
    if (isNaN(betrag) || betrag <= 0) {
      alert('Bitte geben Sie einen gültigen Betrag ein');
      return;
    }

    setLoading(true);
    try {
      await debitorService.addZahlung(debitor.projektId, {
        betrag,
        datum: zahlungDatum,
        zahlungsart: zahlungArt,
        notiz: zahlungNotiz || undefined,
      });

      setShowZahlungFormular(false);
      setZahlungNotiz('');
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Zahlung:', error);
      alert('Fehler beim Speichern der Zahlung');
    } finally {
      setLoading(false);
    }
  };

  // Zahlung löschen
  const handleDeleteZahlung = async (zahlungId: string) => {
    if (!confirm('Möchten Sie diese Zahlung wirklich löschen?')) return;

    setLoading(true);
    try {
      await debitorService.deleteZahlung(debitor.projektId, zahlungId);
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Löschen der Zahlung:', error);
      alert('Fehler beim Löschen der Zahlung');
    } finally {
      setLoading(false);
    }
  };

  // Aktivität hinzufügen
  const handleAddAktivitaet = async () => {
    if (!aktivitaetTitel.trim()) {
      alert('Bitte geben Sie einen Titel ein');
      return;
    }

    setLoading(true);
    try {
      await debitorService.addAktivitaet(debitor.projektId, {
        typ: aktivitaetTyp,
        titel: aktivitaetTitel,
        beschreibung: aktivitaetBeschreibung || undefined,
      });

      setShowAktivitaetFormular(false);
      setAktivitaetTitel('');
      setAktivitaetBeschreibung('');
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Aktivität:', error);
      alert('Fehler beim Speichern der Aktivität');
    } finally {
      setLoading(false);
    }
  };

  // Mahnstufe erhöhen
  const handleErhoehenMahnstufe = async () => {
    if (debitor.mahnstufe >= 4) {
      alert('Maximale Mahnstufe erreicht');
      return;
    }

    const notiz = prompt('Notiz zur Mahnung (optional):');

    setLoading(true);
    try {
      await debitorService.erhoeheMahnstufe(debitor.projektId, notiz || undefined);
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Erhöhen der Mahnstufe:', error);
      alert('Fehler beim Erhöhen der Mahnstufe');
    } finally {
      setLoading(false);
    }
  };

  // Als bezahlt markieren
  const handleMarkiereAlsBezahlt = async () => {
    if (!confirm('Möchten Sie diese Rechnung als vollständig bezahlt markieren?')) return;

    setLoading(true);
    try {
      await debitorService.markiereAlsBezahlt(debitor.projektId);
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Markieren als bezahlt:', error);
      alert('Fehler beim Markieren als bezahlt');
    } finally {
      setLoading(false);
    }
  };

  // Aktivitäten sortiert (neueste zuerst)
  const sortedAktivitaeten = [...debitor.aktivitaeten].sort(
    (a, b) => new Date(b.erstelltAm).getTime() - new Date(a.erstelltAm).getTime()
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {debitor.kundenname}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {debitor.rechnungsnummer} • Saison {debitor.saisonjahr}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/projektabwicklung/${debitor.projektId}`)}
              className="px-3 py-2 text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Zum Projekt
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Linke Spalte: Info + Zahlungen */}
            <div className="space-y-6">
              {/* Status & Betrag */}
              <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${DEBITOR_STATUS_CONFIG[debitor.status].bgColor} ${DEBITOR_STATUS_CONFIG[debitor.status].color}`}
                    >
                      {DEBITOR_STATUS_CONFIG[debitor.status].label}
                    </span>
                    {debitor.mahnstufe > 0 && (
                      <span
                        className={`ml-2 px-3 py-1 text-sm font-medium rounded-full ${MAHNSTUFEN_CONFIG[debitor.mahnstufe].bgColor} ${MAHNSTUFEN_CONFIG[debitor.mahnstufe].color}`}
                      >
                        {MAHNSTUFEN_CONFIG[debitor.mahnstufe].label}
                      </span>
                    )}
                  </div>
                  {debitor.tageUeberfaellig > 0 && (
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">{debitor.tageUeberfaellig} Tage überfällig</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Rechnungsbetrag</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                      {formatCurrency(debitor.rechnungsbetrag)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Offener Betrag</p>
                    <p
                      className={`text-2xl font-bold ${debitor.offenerBetrag > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                    >
                      {formatCurrency(debitor.offenerBetrag)}
                    </p>
                  </div>
                </div>

                {/* Fortschrittsbalken */}
                {debitor.prozentBezahlt > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-slate-400">Bezahlt</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {debitor.prozentBezahlt.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${debitor.prozentBezahlt}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Rechnungsdatum</p>
                    <p className="font-medium text-gray-900 dark:text-slate-100">
                      {debitor.rechnungsdatum ? formatDate(debitor.rechnungsdatum) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Fälligkeitsdatum</p>
                    <p className="font-medium text-gray-900 dark:text-slate-100">
                      {formatDate(debitor.faelligkeitsdatum)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Kundendaten */}
              <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Kundendaten
                </h3>
                <div className="space-y-3 text-sm">
                  {debitor.kundennummer && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-slate-400">Kundennummer</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        #{debitor.kundennummer}
                      </span>
                    </div>
                  )}
                  {debitor.ansprechpartner && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-slate-400">Ansprechpartner</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        {debitor.ansprechpartner}
                      </span>
                    </div>
                  )}
                  {debitor.kundenEmail && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 dark:text-slate-400">E-Mail</span>
                      <a
                        href={`mailto:${debitor.kundenEmail}`}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Mail className="w-4 h-4" />
                        {debitor.kundenEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Zahlungshistorie */}
              <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Zahlungen ({debitor.zahlungen.length})
                  </h3>
                  <button
                    onClick={() => setShowZahlungFormular(!showZahlungFormular)}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                    disabled={loading}
                  >
                    <Plus className="w-4 h-4" />
                    Zahlung
                  </button>
                </div>

                {/* Zahlung Formular */}
                {showZahlungFormular && (
                  <div className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                          Betrag (€)
                        </label>
                        <input
                          type="text"
                          value={zahlungBetrag}
                          onChange={(e) => setZahlungBetrag(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                          Datum
                        </label>
                        <input
                          type="date"
                          value={zahlungDatum}
                          onChange={(e) => setZahlungDatum(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                        Zahlungsart
                      </label>
                      <select
                        value={zahlungArt}
                        onChange={(e) => setZahlungArt(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                      >
                        <option value="ueberweisung">Überweisung</option>
                        <option value="bar">Bar</option>
                        <option value="lastschrift">Lastschrift</option>
                        <option value="scheck">Scheck</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                        Notiz (optional)
                      </label>
                      <input
                        type="text"
                        value={zahlungNotiz}
                        onChange={(e) => setZahlungNotiz(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                        placeholder="z.B. Teilzahlung..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddZahlung}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={() => setShowZahlungFormular(false)}
                        className="px-3 py-2 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors text-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {/* Zahlungsliste */}
                {debitor.zahlungen.length > 0 ? (
                  <div className="space-y-2">
                    {debitor.zahlungen.map((zahlung) => (
                      <div
                        key={zahlung.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-green-600 dark:text-green-400">
                            +{formatCurrency(zahlung.betrag)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {formatDate(zahlung.datum)}
                            {zahlung.zahlungsart && ` • ${zahlung.zahlungsart}`}
                            {zahlung.notiz && ` • ${zahlung.notiz}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteZahlung(zahlung.id)}
                          disabled={loading}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                    Noch keine Zahlungen erfasst
                  </p>
                )}
              </div>

              {/* Aktionen */}
              <div className="flex flex-wrap gap-2">
                {debitor.status !== 'bezahlt' && (
                  <>
                    <button
                      onClick={handleMarkiereAlsBezahlt}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Als bezahlt markieren
                    </button>
                    {debitor.mahnstufe < 4 && (
                      <button
                        onClick={handleErhoehenMahnstufe}
                        disabled={loading}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        <ChevronUp className="w-4 h-4" />
                        Mahnstufe erhöhen
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Rechte Spalte: Aktivitäten Timeline */}
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Aktivitäten ({debitor.aktivitaeten.length})
                  </h3>
                  <button
                    onClick={() => setShowAktivitaetFormular(!showAktivitaetFormular)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                    disabled={loading}
                  >
                    <Plus className="w-4 h-4" />
                    Aktivität
                  </button>
                </div>

                {/* Aktivität Formular */}
                {showAktivitaetFormular && (
                  <div className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Typ</label>
                      <select
                        value={aktivitaetTyp}
                        onChange={(e) => setAktivitaetTyp(e.target.value as DebitorAktivitaetsTyp)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                      >
                        <option value="kommentar">Kommentar</option>
                        <option value="email">E-Mail</option>
                        <option value="telefonat">Telefonat</option>
                        <option value="erinnerung">Erinnerung</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Titel</label>
                      <input
                        type="text"
                        value={aktivitaetTitel}
                        onChange={(e) => setAktivitaetTitel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                        placeholder="z.B. Telefonat mit Kassenwart"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                        Beschreibung (optional)
                      </label>
                      <textarea
                        value={aktivitaetBeschreibung}
                        onChange={(e) => setAktivitaetBeschreibung(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                        rows={3}
                        placeholder="Details..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddAktivitaet}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={() => setShowAktivitaetFormular(false)}
                        className="px-3 py-2 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors text-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {sortedAktivitaeten.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />
                    <div className="space-y-4">
                      {sortedAktivitaeten.map((aktivitaet) => (
                        <AktivitaetItem key={aktivitaet.id} aktivitaet={aktivitaet} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-8">
                    Noch keine Aktivitäten erfasst
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Aktivität Item Komponente
const AktivitaetItem = ({ aktivitaet }: { aktivitaet: DebitorAktivitaet }) => {
  const getIcon = () => {
    switch (aktivitaet.typ) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'telefonat':
        return <Phone className="w-4 h-4" />;
      case 'mahnung_versendet':
        return <Send className="w-4 h-4" />;
      case 'zahlung_eingegangen':
        return <CreditCard className="w-4 h-4" />;
      case 'status_aenderung':
        return <CheckCircle className="w-4 h-4" />;
      case 'erinnerung':
        return <Clock className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getColor = () => {
    switch (aktivitaet.typ) {
      case 'zahlung_eingegangen':
        return 'bg-green-500';
      case 'mahnung_versendet':
        return 'bg-orange-500';
      case 'email':
        return 'bg-blue-500';
      case 'telefonat':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="relative pl-10">
      <div
        className={`absolute left-2 w-5 h-5 rounded-full ${getColor()} flex items-center justify-center text-white`}
      >
        {getIcon()}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
        <div className="flex justify-between items-start">
          <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">{aktivitaet.titel}</p>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {new Date(aktivitaet.erstelltAm).toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {aktivitaet.beschreibung && (
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{aktivitaet.beschreibung}</p>
        )}
        {aktivitaet.betrag && (
          <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
            +{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(aktivitaet.betrag)}
          </p>
        )}
      </div>
    </div>
  );
};

export default DebitorDetail;
