import { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ArrowLeft,
  Mail, 
  Phone, 
  MessageSquare, 
  Upload, 
  FileText, 
  Download,
  Trash2,
  Plus,
  Edit,
  Clock,
  DollarSign,
  Calendar,
  Building2,
  Send
} from 'lucide-react';
import { OffeneRechnung, RechnungsAktivitaet, Zahlung, AktivitaetsTyp } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';
import { berechneNaechsteRate } from '../../utils/ratenzahlungCalculations';
import { ID } from 'appwrite';

interface RechnungsDetailProps {
  rechnung: OffeneRechnung;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

const RechnungsDetail = ({ rechnung, onClose, onEdit, onUpdate }: RechnungsDetailProps) => {
  const [aktivitaeten, setAktivitaeten] = useState<RechnungsAktivitaet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAktivitaet, setShowAddAktivitaet] = useState(false);
  const [aktivitaetTyp, setAktivitaetTyp] = useState<AktivitaetsTyp>('kommentar');
  const [aktivitaetTitel, setAktivitaetTitel] = useState('');
  const [aktivitaetBeschreibung, setAktivitaetBeschreibung] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [telefonnummer, setTelefonnummer] = useState<string | null>(null);

  // Tilgung States
  const [showAddZahlung, setShowAddZahlung] = useState(false);
  const [zahlungBetrag, setZahlungBetrag] = useState('');
  const [zahlungDatum, setZahlungDatum] = useState(new Date().toISOString().split('T')[0]);
  const [zahlungNotiz, setZahlungNotiz] = useState('');

  // Monatliche Rate State
  const [showRateEdit, setShowRateEdit] = useState(false);
  const [neueRate, setNeueRate] = useState(rechnung.monatlicheRate?.toString() || '');

  // Ratenzahlung States
  const [showRatenzahlungEdit, setShowRatenzahlungEdit] = useState(false);
  const [rateFaelligAm, setRateFaelligAm] = useState(
    rechnung.rateFaelligAm ? new Date(rechnung.rateFaelligAm).toISOString().split('T')[0] : ''
  );
  const [ratenzahlungInterval, setRatenzahlungInterval] = useState<'monatlich' | 'woechentlich'>(
    rechnung.ratenzahlungInterval || 'monatlich'
  );

  useEffect(() => {
    loadAktivitaeten();
    loadKreditorTelefon();
  }, [rechnung.id]);

  const loadKreditorTelefon = async () => {
    try {
      // Suche Kreditor anhand des Namens
      const alleKreditoren = await kreditorService.loadAlleKreditoren();
      const kreditor = alleKreditoren.find(k => 
        k.name.toLowerCase().trim() === rechnung.kreditorName.toLowerCase().trim()
      );
      
      if (kreditor) {
        const tel = kreditor.telefon || kreditor.kontakt?.telefon;
        setTelefonnummer(tel || null);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Telefonnummer:', error);
    }
  };

  const loadAktivitaeten = async () => {
    setLoading(true);
    try {
      const data = await aktivitaetService.loadAktivitaetenFuerRechnung(rechnung.id);
      setAktivitaeten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Berechne Zahlungsstatus
  const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
  const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
  const prozentBezahlt = rechnung.summe > 0 ? (gesamtBezahlt / rechnung.summe) * 100 : 0;

  // Aktivität hinzufügen
  const handleAddAktivitaet = async () => {
    if (!aktivitaetTitel.trim()) return;

    try {
      let neueAktivitaet: RechnungsAktivitaet;

      switch (aktivitaetTyp) {
        case 'email':
          neueAktivitaet = await aktivitaetService.logEmail(rechnung.id, aktivitaetTitel, aktivitaetBeschreibung);
          break;
        case 'telefonat':
          neueAktivitaet = await aktivitaetService.logTelefonat(rechnung.id, aktivitaetTitel, aktivitaetBeschreibung);
          break;
        default:
          neueAktivitaet = await aktivitaetService.addKommentar(rechnung.id, aktivitaetTitel + (aktivitaetBeschreibung ? '\n\n' + aktivitaetBeschreibung : ''));
      }

      setAktivitaeten([neueAktivitaet, ...aktivitaeten]);
      setAktivitaetTitel('');
      setAktivitaetBeschreibung('');
      setShowAddAktivitaet(false);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Aktivität:', error);
      alert('Fehler beim Hinzufügen der Aktivität');
    }
  };

  // Datei hochladen
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const aktivitaet = await aktivitaetService.uploadDatei(rechnung.id, file);
        setAktivitaeten(prev => [aktivitaet, ...prev]);
      }
    } catch (error) {
      console.error('Fehler beim Hochladen:', error);
      alert('Fehler beim Hochladen der Datei');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Aktivität löschen
  const handleDeleteAktivitaet = async (id: string) => {
    if (!confirm('Möchten Sie diese Aktivität wirklich löschen?')) return;

    try {
      await aktivitaetService.deleteAktivitaet(id);
      setAktivitaeten(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Aktivität');
    }
  };

  // Zahlung hinzufügen
  const handleAddZahlung = async () => {
    const betrag = parseFloat(zahlungBetrag);
    if (isNaN(betrag) || betrag <= 0) {
      alert('Bitte geben Sie einen gültigen Betrag ein');
      return;
    }

    try {
      const neueZahlung: Zahlung = {
        id: ID.unique(),
        betrag,
        datum: new Date(zahlungDatum).toISOString(),
        notiz: zahlungNotiz || undefined,
        erstelltAm: new Date().toISOString(),
      };

      const aktuelleZahlungen = rechnung.zahlungen || [];
      const updateData: Partial<OffeneRechnung> = {
        zahlungen: [...aktuelleZahlungen, neueZahlung],
      };

      // Wenn Ratenzahlung aktiv, berechne nächste Rate neu
      if (rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm && rechnung.ratenzahlungInterval) {
        const tempRechnung: OffeneRechnung = {
          ...rechnung,
          zahlungen: [...aktuelleZahlungen, neueZahlung],
        };
        const naechsteRate = berechneNaechsteRate(tempRechnung);
        updateData.rateFaelligAm = naechsteRate;
      }

      await kreditorService.updateRechnung(rechnung.id, updateData);

      // Aktivität loggen
      await aktivitaetService.logZahlung(rechnung.id, betrag, zahlungNotiz);

      setShowAddZahlung(false);
      setZahlungBetrag('');
      setZahlungNotiz('');
      setZahlungDatum(new Date().toISOString().split('T')[0]);
      
      onUpdate();
      loadAktivitaeten();
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Zahlung:', error);
      alert('Fehler beim Hinzufügen der Zahlung');
    }
  };

  // Zahlung löschen
  const handleDeleteZahlung = async (zahlungId: string) => {
    if (!confirm('Möchten Sie diese Zahlung wirklich löschen?')) return;

    try {
      const aktuelleZahlungen = rechnung.zahlungen || [];
      const updateData: Partial<OffeneRechnung> = {
        zahlungen: aktuelleZahlungen.filter(z => z.id !== zahlungId),
      };

      // Wenn Ratenzahlung aktiv, berechne nächste Rate neu
      if (rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm && rechnung.ratenzahlungInterval) {
        const tempRechnung: OffeneRechnung = {
          ...rechnung,
          zahlungen: aktuelleZahlungen.filter(z => z.id !== zahlungId),
        };
        const naechsteRate = berechneNaechsteRate(tempRechnung);
        updateData.rateFaelligAm = naechsteRate;
      }

      await kreditorService.updateRechnung(rechnung.id, updateData);
      
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Löschen der Zahlung:', error);
      alert('Fehler beim Löschen der Zahlung');
    }
  };

  // Monatliche Rate anpassen
  const handleUpdateRate = async () => {
    const rate = parseFloat(neueRate);
    if (isNaN(rate) || rate < 0) {
      alert('Bitte geben Sie einen gültigen Betrag ein');
      return;
    }

    try {
      await kreditorService.updateRechnung(rechnung.id, {
        monatlicheRate: rate > 0 ? rate : undefined,
      });

      // Aktivität loggen
      await aktivitaetService.logRateAnpassung(rechnung.id, rate, rechnung.monatlicheRate);

      setShowRateEdit(false);
      onUpdate();
      loadAktivitaeten();
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Rate:', error);
      alert('Fehler beim Aktualisieren der Rate');
    }
  };

  // Ratenzahlung aktualisieren
  const handleUpdateRatenzahlung = async () => {
    if (!rateFaelligAm) {
      alert('Bitte geben Sie ein Datum für die Rate ein');
      return;
    }

    try {
      const updateData: Partial<OffeneRechnung> = {
        rateFaelligAm: new Date(rateFaelligAm).toISOString(),
        ratenzahlungInterval,
        status: 'in_ratenzahlung', // Status automatisch auf "in_ratenzahlung" setzen
      };

      await kreditorService.updateRechnung(rechnung.id, updateData);

      // Aktivität loggen
      await aktivitaetService.addKommentar(
        rechnung.id, 
        `Ratenzahlung eingerichtet: Rate fällig am ${formatDate(rateFaelligAm)}, Intervall: ${ratenzahlungInterval}`
      );

      setShowRatenzahlungEdit(false);
      onUpdate();
      loadAktivitaeten();
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Ratenzahlung:', error);
      alert('Fehler beim Aktualisieren der Ratenzahlung');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      offen: 'bg-blue-100 text-blue-800',
      faellig: 'bg-yellow-100 text-yellow-800',
      gemahnt: 'bg-orange-100 text-orange-800',
      in_bearbeitung: 'bg-purple-100 text-purple-800',
      in_ratenzahlung: 'bg-indigo-100 text-indigo-800',
      verzug: 'bg-red-100 text-red-800',
      bezahlt: 'bg-green-100 text-green-800',
      storniert: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-xl font-bold">{rechnung.kreditorName}</h2>
              <p className="text-white/80 text-sm">
                {rechnung.rechnungsnummer || 'Keine Rechnungsnummer'} • {rechnung.betreff || 'Kein Betreff'}
              </p>
              {telefonnummer && (
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="w-4 h-4 text-white/60" />
                  <a 
                    href={`tel:${telefonnummer}`}
                    className="text-white/80 text-sm hover:text-white transition-colors"
                  >
                    {telefonnummer}
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(telefonnummer)}
                    className="text-white/60 hover:text-white transition-colors text-xs"
                    title="Kopieren"
                  >
                    📋
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Bearbeiten
            </button>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-3 gap-6 p-6">
            {/* Linke Spalte - Übersicht */}
            <div className="lg:col-span-1 space-y-6">
              {/* Status & Betrag */}
              <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(rechnung.status)}`}>
                    {rechnung.status.replace('_', ' ')}
                  </span>
                  {rechnung.mahnstufe > 0 && (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                      {rechnung.mahnstufe}. Mahnung
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-sm text-gray-600">Gesamtbetrag</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(rechnung.summe)}</p>
                </div>

                {/* Fortschrittsbalken */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-600 font-medium">Bezahlt: {formatCurrency(gesamtBezahlt)}</span>
                    <span className="text-red-600 font-medium">Offen: {formatCurrency(offenerBetrag)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(prozentBezahlt, 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">{prozentBezahlt.toFixed(1)}% bezahlt</p>
                </div>

                {/* Monatliche Rate */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">Monatliche Rate</p>
                    <button
                      onClick={() => setShowRateEdit(!showRateEdit)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      {showRateEdit ? 'Abbrechen' : 'Anpassen'}
                    </button>
                  </div>
                  {showRateEdit ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={neueRate}
                        onChange={(e) => setNeueRate(e.target.value)}
                        placeholder="Rate in €"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <button
                        onClick={handleUpdateRate}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <p className="text-lg font-semibold text-gray-900">
                      {rechnung.monatlicheRate ? formatCurrency(rechnung.monatlicheRate) : '—'}
                    </p>
                  )}
                </div>

                {/* Ratenzahlung */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">Ratenzahlung</p>
                    <button
                      onClick={() => setShowRatenzahlungEdit(!showRatenzahlungEdit)}
                      className="text-indigo-600 hover:text-indigo-700 text-sm"
                    >
                      {showRatenzahlungEdit ? 'Abbrechen' : 'Einrichten'}
                    </button>
                  </div>
                  {showRatenzahlungEdit ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Rate fällig am</label>
                        <input
                          type="date"
                          value={rateFaelligAm}
                          onChange={(e) => setRateFaelligAm(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Ratenzahlung Intervall</label>
                        <select
                          value={ratenzahlungInterval}
                          onChange={(e) => setRatenzahlungInterval(e.target.value as 'monatlich' | 'woechentlich')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="monatlich">Monatlich</option>
                          <option value="woechentlich">Wöchentlich</option>
                        </select>
                      </div>
                      <button
                        onClick={handleUpdateRatenzahlung}
                        className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                      >
                        Ratenzahlung einrichten
                      </button>
                    </div>
                  ) : (
                    <>
                      {rechnung.rateFaelligAm ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-sm font-medium text-indigo-700">
                            Rate fällig: {formatDate(rechnung.rateFaelligAm)}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            Intervall: {rechnung.ratenzahlungInterval || 'monatlich'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">Keine Ratenzahlung eingerichtet</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Infos */}
              <div className="bg-gray-50 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Unternehmen</p>
                    <p className="font-medium">{rechnung.anUnternehmen}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">
                      {rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm 
                        ? 'Rate fällig am' 
                        : 'Fälligkeitsdatum'}
                    </p>
                    <p className="font-medium">
                      {rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm
                        ? formatDate(rechnung.rateFaelligAm)
                        : formatDate(rechnung.faelligkeitsdatum)}
                    </p>
                    {rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm && (
                      <p className="text-xs text-gray-400">
                        (Original: {formatDate(rechnung.faelligkeitsdatum)})
                      </p>
                    )}
                  </div>
                </div>
                {rechnung.rechnungsdatum && (
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Rechnungsdatum</p>
                      <p className="font-medium">{formatDate(rechnung.rechnungsdatum)}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Kategorie</p>
                    <p className="font-medium capitalize">{rechnung.kategorie}</p>
                  </div>
                </div>
              </div>

              {/* Zahlungen/Tilgungen */}
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    Zahlungen / Tilgungen
                  </h3>
                  <button
                    onClick={() => setShowAddZahlung(!showAddZahlung)}
                    className="text-green-600 hover:text-green-700 text-sm flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Hinzufügen
                  </button>
                </div>

                {showAddZahlung && (
                  <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 space-y-3">
                    <input
                      type="number"
                      step="0.01"
                      value={zahlungBetrag}
                      onChange={(e) => setZahlungBetrag(e.target.value)}
                      placeholder="Betrag in €"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="date"
                      value={zahlungDatum}
                      onChange={(e) => setZahlungDatum(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={zahlungNotiz}
                      onChange={(e) => setZahlungNotiz(e.target.value)}
                      placeholder="Notiz (optional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleAddZahlung}
                      className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Zahlung hinzufügen
                    </button>
                  </div>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {rechnung.zahlungen && rechnung.zahlungen.length > 0 ? (
                    rechnung.zahlungen
                      .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
                      .map((zahlung) => (
                        <div
                          key={zahlung.id}
                          className="flex justify-between items-center p-2 bg-white rounded-lg border border-gray-100"
                        >
                          <div>
                            <p className="font-medium text-green-600">{formatCurrency(zahlung.betrag)}</p>
                            <p className="text-xs text-gray-500">{formatDate(zahlung.datum)}</p>
                            {zahlung.notiz && (
                              <p className="text-xs text-gray-400">{zahlung.notiz}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteZahlung(zahlung.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">Noch keine Zahlungen</p>
                  )}
                </div>
              </div>
            </div>

            {/* Rechte Spalte - Aktivitäten */}
            <div className="lg:col-span-2">
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900 text-lg">Aktivitäten-Verlauf</h3>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      accept=".pdf,.eml,.msg,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm flex items-center gap-1"
                    >
                      <Upload className="w-4 h-4" />
                      {uploading ? 'Lädt...' : 'Datei'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddAktivitaet(!showAddAktivitaet);
                        setAktivitaetTyp('kommentar');
                      }}
                      className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Aktivität
                    </button>
                  </div>
                </div>

                {/* Schnelle Aktivitäts-Buttons */}
                {showAddAktivitaet && (
                  <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => setAktivitaetTyp('email')}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                          aktivitaetTyp === 'email' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                        E-Mail
                      </button>
                      <button
                        onClick={() => setAktivitaetTyp('telefonat')}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                          aktivitaetTyp === 'telefonat' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Phone className="w-4 h-4" />
                        Telefonat
                      </button>
                      <button
                        onClick={() => setAktivitaetTyp('kommentar')}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                          aktivitaetTyp === 'kommentar' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4" />
                        Kommentar
                      </button>
                    </div>
                    <input
                      type="text"
                      value={aktivitaetTitel}
                      onChange={(e) => setAktivitaetTitel(e.target.value)}
                      placeholder={
                        aktivitaetTyp === 'email' ? 'z.B. E-Mail an Buchhaltung gesendet' :
                        aktivitaetTyp === 'telefonat' ? 'z.B. Telefonat mit Hr. Müller' :
                        'Titel der Aktivität...'
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                    />
                    <textarea
                      value={aktivitaetBeschreibung}
                      onChange={(e) => setAktivitaetBeschreibung(e.target.value)}
                      placeholder="Details (optional)..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowAddAktivitaet(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={handleAddAktivitaet}
                        disabled={!aktivitaetTitel.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Hinzufügen
                      </button>
                    </div>
                  </div>
                )}

                {/* Aktivitäten-Liste */}
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
                      <p className="text-gray-500 mt-2">Lade Aktivitäten...</p>
                    </div>
                  ) : aktivitaeten.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">Noch keine Aktivitäten</p>
                      <p className="text-sm text-gray-400">Fügen Sie E-Mails, Telefonate oder Kommentare hinzu</p>
                    </div>
                  ) : (
                    aktivitaeten.map((aktivitaet) => (
                      <div
                        key={aktivitaet.id}
                        className={`p-4 rounded-lg border ${aktivitaetService.getAktivitaetFarbe(aktivitaet.typ)}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{aktivitaetService.getAktivitaetIcon(aktivitaet.typ)}</span>
                            <div>
                              <p className="font-medium">{aktivitaet.titel}</p>
                              {aktivitaet.beschreibung && (
                                <p className="text-sm mt-1 whitespace-pre-wrap">{aktivitaet.beschreibung}</p>
                              )}
                              {aktivitaet.dateiId && (
                                <div className="mt-2 flex items-center gap-2">
                                  <a
                                    href={aktivitaetService.getDateiDownloadUrl(aktivitaet.dateiId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-white/50 rounded text-sm hover:bg-white/80"
                                  >
                                    <Download className="w-4 h-4" />
                                    {aktivitaet.dateiName}
                                    {aktivitaet.dateiGroesse && (
                                      <span className="text-xs text-gray-500">
                                        ({formatFileSize(aktivitaet.dateiGroesse)})
                                      </span>
                                    )}
                                  </a>
                                </div>
                              )}
                              <p className="text-xs mt-2 opacity-70">{formatDateTime(aktivitaet.erstelltAm)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteAktivitaet(aktivitaet.id)}
                            className="text-gray-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechnungsDetail;
