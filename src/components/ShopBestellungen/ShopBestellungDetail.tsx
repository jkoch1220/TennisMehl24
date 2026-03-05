/**
 * Shop Bestellung Detail-Panel
 * Slide-in Panel mit Bestelldetails und Workflow-Buttons
 */

import { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Phone,
  CreditCard,
  Package,
  MessageSquare,
  Play,
  Truck,
  CheckCircle,
  XCircle,
  Loader2,
  FolderPlus,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  ShopBestellung,
  ShopBestellungStatus,
  ShopPosition,
  parseAdresse,
  parsePositionen,
  parseStatusHistorie,
  parseAktivitaetsLog,
  formatBestelldatum,
  getStatusInfo,
  shopBestellungService,
} from '../../services/shopBestellungService';
import { UniversalArtikel } from '../../types/universaArtikel';
import AktivitaetsTimeline from './AktivitaetsTimeline';

interface ShopBestellungDetailProps {
  bestellung: ShopBestellung;
  onClose: () => void;
  onStatusUpdate: (
    bestellung: ShopBestellung,
    status: ShopBestellungStatus,
    trackingNummer?: string,
    benachrichtigen?: boolean
  ) => void;
  onVersand: (bestellung: ShopBestellung) => void;
  onRefresh?: (bestellung: ShopBestellung) => void;
}

const ShopBestellungDetail = ({
  bestellung,
  onClose,
  onStatusUpdate,
  onVersand,
  onRefresh,
}: ShopBestellungDetailProps) => {
  const navigate = useNavigate();
  const [analysing, setAnalysing] = useState(false);
  const [creatingProjekt, setCreatingProjekt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Artikel-Analyse
  const [universalPositionen, setUniversalPositionen] = useState<ShopPosition[]>([]);
  const [eigenePositionen, setEigenePositionen] = useState<ShopPosition[]>([]);
  const [universalArtikelMap, setUniversalArtikelMap] = useState<Map<string, UniversalArtikel | null>>(new Map());

  const statusInfo = getStatusInfo(bestellung.status);
  const lieferadresse = parseAdresse(bestellung.lieferadresse);
  const rechnungsadresse = parseAdresse(bestellung.rechnungsadresse);
  const positionen = parsePositionen(bestellung.positionen);
  const statusHistorie = parseStatusHistorie(bestellung.statusHistorie);
  const aktivitaetsLog = parseAktivitaetsLog(bestellung.aktivitaetsLog);

  // Refresh von Gambio
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await shopBestellungService.refreshFromGambio(bestellung.$id);
      toast.success('Daten von Gambio aktualisiert');
      if (onRefresh) {
        onRefresh(updated);
      }
    } catch (error) {
      toast.error('Aktualisierung fehlgeschlagen');
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  // Analysiere Artikel beim Laden
  useEffect(() => {
    const analysiere = async () => {
      setAnalysing(true);
      try {
        const analyse = await shopBestellungService.analysiereBestellung(bestellung);
        setUniversalPositionen(analyse.universalPositionen);
        setEigenePositionen(analyse.eigenePositionen);
        setUniversalArtikelMap(analyse.universalArtikelMap);
      } catch (error) {
        console.error('Analyse-Fehler:', error);
      } finally {
        setAnalysing(false);
      }
    };
    analysiere();
  }, [bestellung]);

  // Projekt erstellen
  const handleProjektErstellen = async (typ: 'universal' | 'eigen') => {
    setCreatingProjekt(true);
    try {
      const projekt = await shopBestellungService.erstelleProjektAusBestellung(bestellung, typ);
      toast.success(`Projekt "${projekt.projektName}" erstellt`);

      // Navigiere zur Projektabwicklung
      navigate(`/projektabwicklung/${projekt.id}`);
    } catch (error) {
      console.error('Projekt-Erstellung fehlgeschlagen:', error);
      toast.error((error as Error).message || 'Projekt konnte nicht erstellt werden');
    } finally {
      setCreatingProjekt(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Bestellung #{bestellung.bestellnummer}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatBestelldatum(bestellung.bestelldatum)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              title="Von Gambio aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Aktualisiere...' : 'Aktualisieren'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status-Badge */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {bestellung.trackingNummer && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Tracking: {bestellung.trackingNummer}
              </span>
            )}
          </div>

          {/* Adressen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lieferadresse */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <MapPin className="w-4 h-4" />
                Lieferadresse
              </div>
              <div className="text-sm text-gray-900 dark:text-white">
                {lieferadresse.firma && <div className="font-medium">{lieferadresse.firma}</div>}
                <div>{lieferadresse.name}</div>
                <div>{lieferadresse.strasse}</div>
                <div>{lieferadresse.plz} {lieferadresse.ort}</div>
                <div>{lieferadresse.land}</div>
              </div>
            </div>

            {/* Rechnungsadresse */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <CreditCard className="w-4 h-4" />
                Rechnungsadresse
              </div>
              <div className="text-sm text-gray-900 dark:text-white">
                {rechnungsadresse.firma && <div className="font-medium">{rechnungsadresse.firma}</div>}
                <div>{rechnungsadresse.name}</div>
                <div>{rechnungsadresse.strasse}</div>
                <div>{rechnungsadresse.plz} {rechnungsadresse.ort}</div>
                <div>{rechnungsadresse.land}</div>
              </div>
            </div>
          </div>

          {/* Kontakt & Zahlung */}
          <div className="flex flex-wrap gap-4 text-sm">
            {bestellung.kundenEmail && (
              <a
                href={`mailto:${bestellung.kundenEmail}`}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Mail className="w-4 h-4" />
                {bestellung.kundenEmail}
              </a>
            )}
            {bestellung.telefon && (
              <a
                href={`tel:${bestellung.telefon}`}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <Phone className="w-4 h-4" />
                {bestellung.telefon}
              </a>
            )}
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <CreditCard className="w-4 h-4" />
              {bestellung.zahlungsmethode}
            </div>
          </div>

          {/* Positionen */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Positionen ({positionen.length})
              </span>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {positionen.map((pos, idx) => {
                const universalArtikel = universalArtikelMap.get(pos.artikelnummer);
                const istUniversal = !!universalArtikel;

                return (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {pos.anzahl}x {pos.artikel}
                        </span>
                        {istUniversal && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                            Universal
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Art.-Nr: {pos.artikelnummer}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {pos.gesamtpreis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        je {pos.einzelpreis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summen */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Warenwert</span>
              <span className="text-gray-900 dark:text-white">
                {bestellung.warenwert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Versandkosten</span>
              <span className="text-gray-900 dark:text-white">
                {bestellung.versandkosten.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">MwSt.</span>
              <span className="text-gray-900 dark:text-white">
                {bestellung.mwst.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-900 dark:text-white">Gesamt</span>
              <span className="text-gray-900 dark:text-white">
                {bestellung.summeBrutto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>

          {/* Anmerkungen */}
          {bestellung.anmerkungen && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                <MessageSquare className="w-4 h-4" />
                Kundenanmerkung
              </div>
              <p className="text-sm text-yellow-900 dark:text-yellow-100 whitespace-pre-wrap">
                {bestellung.anmerkungen}
              </p>
            </div>
          )}

          {/* Projekt-Erstellung Buttons */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <FolderPlus className="w-4 h-4" />
              Projekt erstellen
            </h3>

            {analysing ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analysiere Artikel...
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {/* Universal-Artikel Button */}
                {universalPositionen.length > 0 && (
                  <button
                    onClick={() => handleProjektErstellen('universal')}
                    disabled={creatingProjekt}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {creatingProjekt ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4" />
                    )}
                    Universal-Projekt ({universalPositionen.length} Artikel)
                  </button>
                )}

                {/* Eigene Produkte Button */}
                {eigenePositionen.length > 0 && (
                  <button
                    onClick={() => handleProjektErstellen('eigen')}
                    disabled={creatingProjekt}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {creatingProjekt ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Truck className="w-4 h-4" />
                    )}
                    Eigenes Projekt ({eigenePositionen.length} Artikel)
                  </button>
                )}

                {universalPositionen.length === 0 && eigenePositionen.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Keine Artikel erkannt
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status-Workflow Buttons */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Status-Aktionen
            </h3>
            <div className="flex flex-wrap gap-3">
              {bestellung.status === 'neu' && (
                <button
                  onClick={() => onStatusUpdate(bestellung, 'in_bearbeitung')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  In Bearbeitung nehmen
                </button>
              )}

              {bestellung.status === 'in_bearbeitung' && (
                <button
                  onClick={() => onVersand(bestellung)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  <Truck className="w-4 h-4" />
                  Als versendet markieren
                </button>
              )}

              {bestellung.status === 'versendet' && (
                <button
                  onClick={() => onStatusUpdate(bestellung, 'abgeschlossen')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Abschließen
                </button>
              )}

              {bestellung.status !== 'storniert' && bestellung.status !== 'abgeschlossen' && (
                <button
                  onClick={() => {
                    if (confirm('Bestellung wirklich stornieren?')) {
                      onStatusUpdate(bestellung, 'storniert');
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Stornieren
                </button>
              )}
            </div>
          </div>

          {/* Notizen */}
          {bestellung.notizen && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interne Notizen
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {bestellung.notizen}
              </p>
            </div>
          )}

          {/* Aktivitäts-Timeline */}
          <AktivitaetsTimeline
            statusHistorie={statusHistorie}
            aktivitaetsLog={aktivitaetsLog}
            kundenKommentar={bestellung.anmerkungen}
            bestelldatum={bestellung.bestelldatum}
          />
        </div>
      </div>
    </>
  );
};

export default ShopBestellungDetail;
