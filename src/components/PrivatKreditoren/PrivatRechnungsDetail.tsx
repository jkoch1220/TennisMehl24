import { useState, useEffect } from 'react';
import { X, Edit, CreditCard, MessageSquare, Loader2 } from 'lucide-react';
import { OffeneRechnung, Zahlung, RechnungsAktivitaet } from '../../types/kreditor';
import { usePrivatKreditor } from '../../contexts/PrivatKreditorContext';
import { ID } from 'appwrite';

interface PrivatRechnungsDetailProps {
  rechnung: OffeneRechnung;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

const PrivatRechnungsDetail = ({ rechnung, onClose, onEdit, onUpdate }: PrivatRechnungsDetailProps) => {
  const { kreditorService, aktivitaetService } = usePrivatKreditor();

  const [aktivitaeten, setAktivitaeten] = useState<RechnungsAktivitaet[]>([]);
  const [loadingAktivitaeten, setLoadingAktivitaeten] = useState(true);
  const [showZahlungForm, setShowZahlungForm] = useState(false);
  const [showKommentarForm, setShowKommentarForm] = useState(false);

  // Zahlungs-State
  const [zahlungsBetrag, setZahlungsBetrag] = useState<number>(rechnung.monatlicheRate || 0);
  const [zahlungsDatum, setZahlungsDatum] = useState<string>(new Date().toISOString().split('T')[0]);
  const [zahlungsNotiz, setZahlungsNotiz] = useState<string>('');
  const [savingZahlung, setSavingZahlung] = useState(false);

  // Kommentar-State
  const [kommentar, setKommentar] = useState<string>('');
  const [savingKommentar, setSavingKommentar] = useState(false);

  useEffect(() => {
    loadAktivitaeten();
  }, [rechnung.id]);

  const loadAktivitaeten = async () => {
    setLoadingAktivitaeten(true);
    try {
      const data = await aktivitaetService.loadAktivitaetenFuerRechnung(rechnung.id);
      setAktivitaeten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    } finally {
      setLoadingAktivitaeten(false);
    }
  };

  const handleZahlung = async () => {
    if (zahlungsBetrag <= 0) {
      alert('Bitte geben Sie einen gültigen Betrag ein');
      return;
    }

    setSavingZahlung(true);
    try {
      const neueZahlung: Zahlung = {
        id: ID.unique(),
        betrag: zahlungsBetrag,
        datum: new Date(zahlungsDatum).toISOString(),
        notiz: zahlungsNotiz || undefined,
        erstelltAm: new Date().toISOString(),
      };

      const aktuelleZahlungen = rechnung.zahlungen || [];
      const neueZahlungen = [...aktuelleZahlungen, neueZahlung];
      const neuerGesamtBezahlt = neueZahlungen.reduce((sum, z) => sum + (z.betrag || 0), 0);

      let neuerStatus = rechnung.status;
      if (neuerGesamtBezahlt >= rechnung.summe) {
        neuerStatus = 'bezahlt';
      }

      await kreditorService.updateRechnung(rechnung.id, {
        zahlungen: neueZahlungen,
        status: neuerStatus,
      });

      await aktivitaetService.logZahlung(rechnung.id, zahlungsBetrag, zahlungsNotiz || undefined);

      setZahlungsBetrag(0);
      setZahlungsNotiz('');
      setShowZahlungForm(false);
      loadAktivitaeten();
      onUpdate();
    } catch (error) {
      console.error('Fehler bei Zahlung:', error);
      alert('Fehler beim Speichern der Zahlung');
    } finally {
      setSavingZahlung(false);
    }
  };

  const handleKommentar = async () => {
    if (!kommentar.trim()) {
      alert('Bitte geben Sie einen Kommentar ein');
      return;
    }

    setSavingKommentar(true);
    try {
      await aktivitaetService.addKommentar(rechnung.id, kommentar);
      setKommentar('');
      setShowKommentarForm(false);
      loadAktivitaeten();
    } catch (error) {
      console.error('Fehler beim Speichern des Kommentars:', error);
      alert('Fehler beim Speichern des Kommentars');
    } finally {
      setSavingKommentar(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
  const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
  const fortschritt = rechnung.summe > 0 ? (gesamtBezahlt / rechnung.summe) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-purple-600 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold">{rechnung.kreditorName}</h2>
            <p className="text-purple-100 text-sm">
              {rechnung.betreff || rechnung.rechnungsnummer || 'Keine Beschreibung'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="p-2 bg-purple-500 hover:bg-purple-400 rounded-lg transition-colors"
              title="Bearbeiten"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-purple-500 hover:bg-purple-400 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Übersicht */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-slate-400">Gesamtbetrag</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{formatCurrency(rechnung.summe)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-sm text-green-600 dark:text-green-400">Bereits bezahlt</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(gesamtBezahlt)}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <p className="text-sm text-purple-600 dark:text-purple-400">Noch offen</p>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(offenerBetrag)}</p>
            </div>
          </div>

          {/* Fortschrittsbalken */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-slate-400">Zahlungsfortschritt</span>
              <span className="font-medium text-gray-900 dark:text-slate-100">{fortschritt.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all"
                style={{ width: `${Math.min(100, fortschritt)}%` }}
              />
            </div>
          </div>

          {/* Details */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Fälligkeitsdatum:</span>
                <span className="font-medium text-gray-900 dark:text-slate-100">{formatDate(rechnung.faelligkeitsdatum)}</span>
              </div>
              {rechnung.monatlicheRate && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">Monatliche Rate:</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">{formatCurrency(rechnung.monatlicheRate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Status:</span>
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                  {rechnung.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Kategorie:</span>
                <span className="font-medium text-gray-900 dark:text-slate-100 capitalize">{rechnung.kategorie}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Priorität:</span>
                <span className="font-medium text-gray-900 dark:text-slate-100 capitalize">{rechnung.prioritaet}</span>
              </div>
              {rechnung.rechnungsnummer && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">Rechnungsnummer:</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">{rechnung.rechnungsnummer}</span>
                </div>
              )}
              {rechnung.mahnstufe > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">Mahnstufe:</span>
                  <span className="font-medium text-orange-600">{rechnung.mahnstufe}. Mahnung</span>
                </div>
              )}
            </div>
          </div>

          {/* Kommentar */}
          {rechnung.kommentar && (
            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">Kommentar</p>
              <p className="text-gray-900 dark:text-slate-100">{rechnung.kommentar}</p>
            </div>
          )}

          {/* Zahlungen */}
          {rechnung.zahlungen && rechnung.zahlungen.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Zahlungen</h3>
              <div className="space-y-2">
                {rechnung.zahlungen.map((z, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div>
                      <span className="font-medium text-green-800 dark:text-green-300">{formatCurrency(z.betrag)}</span>
                      {z.notiz && <span className="text-sm text-gray-500 dark:text-slate-400 ml-2">({z.notiz})</span>}
                    </div>
                    <span className="text-sm text-gray-600 dark:text-slate-400">{formatDate(z.datum)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schnellaktionen */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowZahlungForm(!showZahlungForm)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              Zahlung erfassen
            </button>
            <button
              onClick={() => setShowKommentarForm(!showKommentarForm)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <MessageSquare className="w-5 h-5" />
              Kommentar
            </button>
          </div>

          {/* Zahlungsformular */}
          {showZahlungForm && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 dark:text-green-300 mb-4">Zahlung erfassen</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Betrag</label>
                  <input
                    type="number"
                    step="0.01"
                    value={zahlungsBetrag || ''}
                    onChange={(e) => setZahlungsBetrag(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Datum</label>
                  <input
                    type="date"
                    value={zahlungsDatum}
                    onChange={(e) => setZahlungsDatum(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Notiz</label>
                  <input
                    type="text"
                    value={zahlungsNotiz}
                    onChange={(e) => setZahlungsNotiz(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowZahlungForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleZahlung}
                  disabled={savingZahlung}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingZahlung && <Loader2 className="w-4 h-4 animate-spin" />}
                  Speichern
                </button>
              </div>
            </div>
          )}

          {/* Kommentarformular */}
          {showKommentarForm && (
            <div className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-slate-200 mb-4">Kommentar hinzufügen</h4>
              <textarea
                value={kommentar}
                onChange={(e) => setKommentar(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg mb-4"
                placeholder="Ihr Kommentar..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowKommentarForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleKommentar}
                  disabled={savingKommentar}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingKommentar && <Loader2 className="w-4 h-4 animate-spin" />}
                  Speichern
                </button>
              </div>
            </div>
          )}

          {/* Aktivitäten */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Aktivitäten</h3>
            {loadingAktivitaeten ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
              </div>
            ) : aktivitaeten.length === 0 ? (
              <p className="text-gray-500 dark:text-slate-400 text-center py-4">Noch keine Aktivitäten</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {aktivitaeten.map((a) => (
                  <div key={a.id} className="flex gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl">{aktivitaetService.getAktivitaetIcon(a.typ)}</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{a.titel}</p>
                      {a.beschreibung && (
                        <p className="text-sm text-gray-600 dark:text-slate-400">{a.beschreibung}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{formatDateTime(a.erstelltAm)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivatRechnungsDetail;
