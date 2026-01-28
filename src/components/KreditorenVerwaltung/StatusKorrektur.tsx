import { useState } from 'react';
import { X, Search, RotateCcw, Calendar, Clock, CheckCircle2, ArrowRight, AlertTriangle, Shield, Eye, History, ChevronRight } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';

interface StatusKorrekturProps {
  onClose: () => void;
  onUpdate: () => void;
}

interface RechnungsAenderung {
  rechnung: OffeneRechnung;
  ausgewaehlt: boolean;
}

type Schritt = 'datum_waehlen' | 'vorschau' | 'bestaetigung' | 'erfolg';

const StatusKorrektur = ({ onClose, onUpdate }: StatusKorrekturProps) => {
  // Wizard-Schritt
  const [schritt, setSchritt] = useState<Schritt>('datum_waehlen');

  // Datum-Auswahl (VON - BIS)
  const [datumVon, setDatumVon] = useState<string>(() => {
    const heute = new Date();
    const tagDerWoche = heute.getDay();
    const tageZurueck = tagDerWoche >= 3 ? tagDerWoche - 3 : tagDerWoche + 4;
    const letzterMittwoch = new Date(heute);
    letzterMittwoch.setDate(heute.getDate() - tageZurueck);
    return letzterMittwoch.toISOString().split('T')[0];
  });
  const [datumBis, setDatumBis] = useState<string>(() => {
    const heute = new Date();
    const tagDerWoche = heute.getDay();
    const tageZurueck = tagDerWoche >= 3 ? tagDerWoche - 3 : tagDerWoche + 4;
    const letzterMittwoch = new Date(heute);
    letzterMittwoch.setDate(heute.getDate() - tageZurueck);
    return letzterMittwoch.toISOString().split('T')[0];
  });
  const [zeitVon, setZeitVon] = useState<string>('00:00');
  const [zeitBis, setZeitBis] = useState<string>('23:59');

  // Ergebnisse
  const [aenderungen, setAenderungen] = useState<RechnungsAenderung[]>([]);
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Bestätigung
  const [bestaetigung, setBestaetigung] = useState('');
  const [korrigierteAnzahl, setKorrigierteAnzahl] = useState(0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDatumKurz = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    offen: { label: 'Offen', color: 'text-blue-700', bg: 'bg-blue-100' },
    faellig: { label: 'Fällig', color: 'text-yellow-700', bg: 'bg-yellow-100' },
    gemahnt: { label: 'Gemahnt', color: 'text-orange-700', bg: 'bg-orange-100' },
    in_bearbeitung: { label: 'In Bearbeitung', color: 'text-purple-700', bg: 'bg-purple-100' },
    in_ratenzahlung: { label: 'Ratenzahlung', color: 'text-indigo-700', bg: 'bg-indigo-100' },
    verzug: { label: 'Verzug', color: 'text-red-700', bg: 'bg-red-100' },
    inkasso: { label: 'Inkasso', color: 'text-red-800', bg: 'bg-red-200' },
    bezahlt: { label: 'Bezahlt', color: 'text-green-700', bg: 'bg-green-100' },
    storniert: { label: 'Storniert', color: 'text-gray-700', bg: 'bg-gray-100' },
  };

  // Zeitraum-Beschreibung für die UI
  const getZeitraumBeschreibung = () => {
    if (datumVon === datumBis) {
      return formatDatumKurz(datumVon);
    }
    return `${formatDatumKurz(datumVon)} bis ${formatDatumKurz(datumBis)}`;
  };

  // Schritt 1: Änderungen suchen
  const sucheAenderungen = async () => {
    setLoading(true);
    setFehler(null);
    setAenderungen([]);

    try {
      const startDatum = new Date(`${datumVon}T${zeitVon}:00`);
      const endDatum = new Date(`${datumBis}T${zeitBis}:59`);

      // Validierung: Start muss vor Ende liegen
      if (startDatum > endDatum) {
        setFehler('Das Start-Datum muss vor dem End-Datum liegen.');
        setLoading(false);
        return;
      }

      const alleRechnungen = await kreditorService.loadAlleRechnungen();

      // Finde alle Rechnungen, die im Zeitraum geändert wurden UND jetzt auf "bezahlt" stehen
      const geaenderteRechnungen = alleRechnungen.filter(rechnung => {
        const geaendertAm = new Date(rechnung.geaendertAm);
        const imZeitraum = geaendertAm >= startDatum && geaendertAm <= endDatum;
        const istBezahlt = rechnung.status === 'bezahlt';
        return imZeitraum && istBezahlt;
      });

      if (geaenderteRechnungen.length === 0) {
        if (datumVon === datumBis) {
          setFehler(`Keine Rechnungen gefunden, die am ${formatDatumKurz(datumVon)} auf "bezahlt" geändert wurden.`);
        } else {
          setFehler(`Keine Rechnungen gefunden, die zwischen ${formatDatumKurz(datumVon)} und ${formatDatumKurz(datumBis)} auf "bezahlt" geändert wurden.`);
        }
        return;
      }

      setAenderungen(geaenderteRechnungen.map(r => ({ rechnung: r, ausgewaehlt: true })));
      setSchritt('vorschau');
    } catch (error) {
      console.error('Fehler bei der Suche:', error);
      setFehler('Fehler beim Laden der Daten. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle einzelne Rechnung
  const toggleAuswahl = (index: number) => {
    setAenderungen(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, ausgewaehlt: !item.ausgewaehlt } : item
      )
    );
  };

  // Zur Bestätigung gehen
  const zurBestaetigung = () => {
    const ausgewaehlte = aenderungen.filter(a => a.ausgewaehlt);
    if (ausgewaehlte.length === 0) {
      setFehler('Bitte wähle mindestens eine Rechnung aus.');
      return;
    }
    setBestaetigung('');
    setSchritt('bestaetigung');
  };

  // Korrektur durchführen
  const korrigiereStatus = async () => {
    const zuKorrigieren = aenderungen.filter(a => a.ausgewaehlt);

    setLoading(true);
    setFehler(null);

    try {
      let erfolgreich = 0;

      for (const { rechnung } of zuKorrigieren) {
        // Status auf "offen" zurücksetzen
        // Hinweis: In Appwrite muss man null verwenden um Felder zu löschen, nicht undefined
        await kreditorService.updateRechnung(rechnung.id, {
          status: 'offen',
          bezahltAm: null,
        } as unknown as Partial<OffeneRechnung>);

        // Aktivität dokumentieren
        await aktivitaetService.logStatusAenderung(rechnung.id, 'offen', 'bezahlt');
        await aktivitaetService.addKommentar(
          rechnung.id,
          `⚠️ STATUS-KORREKTUR: Diese Rechnung wurde am ${formatDateTime(rechnung.geaendertAm)} fälschlicherweise auf "bezahlt" gestellt. Der Status wurde auf "offen" zurückgesetzt.`
        );

        erfolgreich++;
      }

      setKorrigierteAnzahl(erfolgreich);
      setSchritt('erfolg');
      onUpdate();
    } catch (error) {
      console.error('Fehler bei der Korrektur:', error);
      setFehler('Fehler bei der Korrektur. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  const ausgewaehlteAnzahl = aenderungen.filter(a => a.ausgewaehlt).length;
  const ausgewaehlteSumme = aenderungen
    .filter(a => a.ausgewaehlt)
    .reduce((sum, a) => sum + a.rechnung.summe, 0);

  // ==================== SCHRITT 1: DATUM WÄHLEN ====================
  if (schritt === 'datum_waehlen') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Status-Korrektur</h2>
                  <p className="text-white/80 text-sm">Schritt 1 von 3</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Inhalt */}
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium mb-4">
                <Shield className="w-4 h-4" />
                Sichere Wiederherstellung
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
                Wann wurden die Fehler gemacht?
              </h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm">
                Wähle den Tag und Zeitraum, an dem Rechnungen versehentlich auf "bezahlt" gestellt wurden.
              </p>
            </div>

            {/* Zeitraum-Auswahl */}
            <div className="space-y-4">
              {/* VON */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    1
                  </div>
                  <span className="font-semibold text-green-800 dark:text-green-200">VON (Start)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      <Calendar className="w-3 h-3" />
                      Datum
                    </label>
                    <input
                      type="date"
                      value={datumVon}
                      onChange={(e) => setDatumVon(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:border-green-500 focus:ring-0 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      <Clock className="w-3 h-3" />
                      Uhrzeit
                    </label>
                    <input
                      type="time"
                      value={zeitVon}
                      onChange={(e) => setZeitVon(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:border-green-500 focus:ring-0 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Pfeil */}
              <div className="flex justify-center">
                <div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-gray-500 dark:text-slate-400 rotate-90" />
                </div>
              </div>

              {/* BIS */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    2
                  </div>
                  <span className="font-semibold text-red-800 dark:text-red-200">BIS (Ende)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      <Calendar className="w-3 h-3" />
                      Datum
                    </label>
                    <input
                      type="date"
                      value={datumBis}
                      onChange={(e) => setDatumBis(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:border-red-500 focus:ring-0 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      <Clock className="w-3 h-3" />
                      Uhrzeit
                    </label>
                    <input
                      type="time"
                      value={zeitBis}
                      onChange={(e) => setZeitBis(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:border-red-500 focus:ring-0 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Zusammenfassung */}
              <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  Zeitraum: <span className="font-semibold text-gray-900 dark:text-slate-100">{getZeitraumBeschreibung()}</span>
                </span>
              </div>
            </div>

            {/* Fehler */}
            {fehler && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">{fehler}</p>
              </div>
            )}

            {/* Button */}
            <button
              onClick={sucheAenderungen}
              disabled={loading}
              className="mt-6 w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold text-lg hover:from-orange-600 hover:to-red-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-orange-500/25"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Suche läuft...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Änderungen suchen
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SCHRITT 2: VORSCHAU ====================
  if (schritt === 'vorschau') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Vorschau der Änderungen</h2>
                  <p className="text-white/80 text-sm">Schritt 2 von 3 • {getZeitraumBeschreibung()}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Info-Box */}
          <div className="px-6 pt-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">Nur Vorschau - noch keine Änderungen!</h4>
                  <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                    Diese Rechnungen wurden im Zeitraum {getZeitraumBeschreibung()} auf "bezahlt" geändert.
                    Wähle aus, welche zurückgesetzt werden sollen.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-3">
              {aenderungen.map((item, index) => {
                const status = statusLabels[item.rechnung.status] || { label: item.rechnung.status, color: 'text-gray-700', bg: 'bg-gray-100' };

                return (
                  <div
                    key={item.rechnung.id}
                    onClick={() => toggleAuswahl(index)}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                      item.ausgewaehlt
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Checkbox */}
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        item.ausgewaehlt
                          ? 'bg-orange-500 border-orange-500'
                          : 'border-gray-300 dark:border-slate-600'
                      }`}>
                        {item.ausgewaehlt && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>

                      {/* Inhalt */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                          {item.rechnung.kreditorName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-slate-400 truncate">
                          {item.rechnung.rechnungsnummer || item.rechnung.betreff || 'Keine Rechnungsnummer'}
                        </div>
                        {/* Datum der Status-Änderung */}
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                            Geändert am: {formatDateTime(item.rechnung.geaendertAm)}
                          </span>
                        </div>
                      </div>

                      {/* Status-Änderung Visualisierung */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="px-3 py-1 rounded-lg text-sm font-medium bg-blue-100 text-blue-700">
                          Offen
                        </span>
                      </div>

                      {/* Betrag */}
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-gray-900 dark:text-slate-100 text-lg">
                          {formatCurrency(item.rechnung.summe)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-slate-700 p-6 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {ausgewaehlteAnzahl} von {aenderungen.length} ausgewählt
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Summe: {formatCurrency(ausgewaehlteSumme)}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setSchritt('datum_waehlen')}
                  className="px-6 py-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={zurBestaetigung}
                  disabled={ausgewaehlteAnzahl === 0}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/25"
                >
                  Weiter zur Bestätigung
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SCHRITT 3: BESTÄTIGUNG ====================
  if (schritt === 'bestaetigung') {
    const bestaetigenText = `KORRIGIEREN ${ausgewaehlteAnzahl}`;
    const istKorrekt = bestaetigung === bestaetigenText;

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Bestätigung erforderlich</h2>
                  <p className="text-white/80 text-sm">Schritt 3 von 3 • Sicherheitscheck</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Inhalt */}
          <div className="p-6">
            {/* Warnung */}
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-red-900 dark:text-red-100">Achtung: Diese Aktion ist nicht rückgängig zu machen!</h4>
                  <p className="text-red-700 dark:text-red-300 text-sm mt-1">
                    Du bist dabei, {ausgewaehlteAnzahl} Rechnung(en) mit einer Gesamtsumme von {formatCurrency(ausgewaehlteSumme)} auf "offen" zurückzusetzen.
                  </p>
                </div>
              </div>
            </div>

            {/* Zusammenfassung */}
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 mb-6">
              <h4 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">Was passiert:</h4>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  </div>
                  <span>Status wird von "bezahlt" auf "offen" geändert</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  </div>
                  <span>Die Korrektur wird im Aktivitäts-Log dokumentiert</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  </div>
                  <span>Zahlungen bleiben erhalten (werden nicht gelöscht)</span>
                </li>
              </ul>
            </div>

            {/* Bestätigungs-Eingabe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Tippe zum Bestätigen:
              </label>
              <div className="bg-gray-100 dark:bg-slate-900 rounded-lg px-4 py-2 mb-3 font-mono text-lg text-gray-900 dark:text-slate-100">
                {bestaetigenText}
              </div>
              <input
                type="text"
                value={bestaetigung}
                onChange={(e) => setBestaetigung(e.target.value)}
                placeholder="Hier eingeben..."
                className={`w-full px-4 py-3 border-2 rounded-xl text-lg font-mono transition-colors ${
                  istKorrekt
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700'
                } text-gray-900 dark:text-slate-100 focus:outline-none`}
              />
            </div>

            {/* Fehler */}
            {fehler && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-800 dark:text-red-300 text-sm">{fehler}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSchritt('vorschau')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={korrigiereStatus}
                disabled={!istKorrekt || loading}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    Korrigiere...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-5 h-5" />
                    Jetzt korrigieren
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SCHRITT 4: ERFOLG ====================
  if (schritt === 'erfolg') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold">Korrektur erfolgreich!</h2>
          </div>

          {/* Inhalt */}
          <div className="p-6 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 mb-6">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                {korrigierteAnzahl}
              </div>
              <div className="text-green-700 dark:text-green-300">
                Rechnung(en) wurden auf "offen" zurückgesetzt
              </div>
            </div>

            <p className="text-gray-600 dark:text-slate-400 text-sm mb-6">
              Alle Änderungen wurden im Aktivitäts-Log dokumentiert.
              Die betroffenen Rechnungen erscheinen jetzt wieder in der Liste der offenen Rechnungen.
            </p>

            <button
              onClick={onClose}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold text-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-500/25"
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default StatusKorrektur;
