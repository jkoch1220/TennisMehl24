/**
 * Shop Bestellungen - Hauptkomponente
 * Verwaltung von Gambio Online-Shop Bestellungen
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ShoppingCart, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  shopBestellungService,
  ShopBestellung,
  ShopBestellungFilter,
  ShopBestellungStatus,
  ShopStats,
} from '../../services/shopBestellungService';
import { useAuth } from '../../contexts/AuthContext';
import ShopStatistikKarten from './ShopStatistikKarten';
import ShopFilterLeiste from './ShopFilterLeiste';
import ShopBestellungTabelle from './ShopBestellungTabelle';
import ShopBestellungDetail from './ShopBestellungDetail';
import VersandDialog from './VersandDialog';

const ShopBestellungen = () => {
  const { user } = useAuth();
  const [bestellungen, setBestellungen] = useState<ShopBestellung[]>([]);
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Filter-State
  const [filter, setFilter] = useState<ShopBestellungFilter>({});
  const [suchbegriff, setSuchbegriff] = useState('');

  // Detail-Panel
  const [selectedBestellung, setSelectedBestellung] = useState<ShopBestellung | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Versand-Dialog
  const [showVersandDialog, setShowVersandDialog] = useState(false);
  const [versandBestellung, setVersandBestellung] = useState<ShopBestellung | null>(null);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bestellungenData, statsData] = await Promise.all([
        shopBestellungService.ladeBestellungen(filter),
        shopBestellungService.ladeStatistiken(),
      ]);
      setBestellungen(bestellungenData);
      setStats(statsData);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      toast.error('Fehler beim Laden der Bestellungen');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Soft Refresh ohne Loading-State
  const softRefresh = async () => {
    try {
      const [bestellungenData, statsData] = await Promise.all([
        shopBestellungService.ladeBestellungen(filter),
        shopBestellungService.ladeStatistiken(),
      ]);
      setBestellungen(bestellungenData);
      setStats(statsData);
    } catch (error) {
      console.error('Fehler beim Neuladen:', error);
    }
  };

  // ============================================
  // SYNC
  // ============================================

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await shopBestellungService.syncEmails();
      setLastSync(new Date());

      if (result.neue > 0) {
        toast.success(`${result.neue} neue Bestellung${result.neue > 1 ? 'en' : ''} synchronisiert`);
      } else {
        toast.info('Keine neuen Bestellungen');
      }

      if (result.parseFehler > 0) {
        toast.warning(`${result.parseFehler} E-Mail(s) konnten nicht geparst werden`);
      }

      await softRefresh();
    } catch (error) {
      console.error('Sync Fehler:', error);
      toast.error('Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  // ============================================
  // STATUS UPDATE
  // ============================================

  const handleStatusUpdate = async (
    bestellung: ShopBestellung,
    neuerStatus: ShopBestellungStatus,
    trackingNummer?: string,
    benachrichtigen?: boolean
  ) => {
    try {
      const updated = await shopBestellungService.updateStatus(bestellung.$id, {
        status: neuerStatus,
        trackingNummer,
        bearbeitetVon: user?.email,
      });

      // Versandbenachrichtigung senden wenn gewuenscht
      if (benachrichtigen && neuerStatus === 'versendet' && trackingNummer) {
        try {
          await shopBestellungService.sendeVersandbenachrichtigung(bestellung.$id);
          toast.success('Versandbenachrichtigung gesendet');
        } catch {
          toast.error('Versandbenachrichtigung konnte nicht gesendet werden');
        }
      }

      toast.success(`Status auf "${neuerStatus}" geaendert`);

      // Update local state
      setBestellungen(prev =>
        prev.map(b => (b.$id === updated.$id ? updated : b))
      );

      if (selectedBestellung?.$id === updated.$id) {
        setSelectedBestellung(updated);
      }

      await softRefresh();
    } catch (error) {
      console.error('Status Update Fehler:', error);
      toast.error('Status konnte nicht aktualisiert werden');
    }
  };

  // ============================================
  // DETAIL PANEL
  // ============================================

  const handleOpenDetail = (bestellung: ShopBestellung) => {
    setSelectedBestellung(bestellung);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedBestellung(null);
  };

  // ============================================
  // VERSAND DIALOG
  // ============================================

  const handleOpenVersandDialog = (bestellung: ShopBestellung) => {
    setVersandBestellung(bestellung);
    setShowVersandDialog(true);
  };

  const handleVersandConfirm = async (trackingNummer: string, benachrichtigen: boolean) => {
    if (versandBestellung) {
      await handleStatusUpdate(versandBestellung, 'versendet', trackingNummer, benachrichtigen);
      setShowVersandDialog(false);
      setVersandBestellung(null);
    }
  };

  // ============================================
  // FILTER
  // ============================================

  const handleFilterChange = (neuerFilter: ShopBestellungFilter) => {
    setFilter(neuerFilter);
  };

  // Lokale Suche (Frontend-Filter zusaetzlich zum Backend)
  const gefilterteBestellungen = bestellungen.filter(b => {
    if (!suchbegriff) return true;
    const search = suchbegriff.toLowerCase();
    const rechnungsadresse = JSON.parse(b.rechnungsadresse || '{}');
    const lieferadresse = JSON.parse(b.lieferadresse || '{}');

    return (
      b.bestellnummer.toLowerCase().includes(search) ||
      rechnungsadresse.name?.toLowerCase().includes(search) ||
      rechnungsadresse.firma?.toLowerCase().includes(search) ||
      lieferadresse.name?.toLowerCase().includes(search) ||
      lieferadresse.ort?.toLowerCase().includes(search)
    );
  });

  // ============================================
  // RENDER
  // ============================================

  if (!shopBestellungService.isBackendAvailable()) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="font-medium text-yellow-800 dark:text-yellow-200">Backend nicht verfuegbar</h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
            Bitte setzen Sie VITE_USE_BACKEND=true in der .env Datei und starten Sie das Backend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-orange-500" />
            Shop Bestellungen
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gambio Online-Shop - tennismehl24.com
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Letzter Sync: {lastSync.toLocaleTimeString('de-DE')}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
          </button>
        </div>
      </div>

      {/* Statistik-Karten */}
      {stats && <ShopStatistikKarten stats={stats} onFilterClick={handleFilterChange} />}

      {/* Filter & Suche */}
      <div className="flex flex-col md:flex-row gap-4">
        <ShopFilterLeiste
          filter={filter}
          onFilterChange={handleFilterChange}
          neueCount={stats?.neu || 0}
        />

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={suchbegriff}
            onChange={(e) => setSuchbegriff(e.target.value)}
            placeholder="Bestellnr., Kunde, Ort..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          {suchbegriff && (
            <button
              onClick={() => setSuchbegriff('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabelle */}
      <ShopBestellungTabelle
        bestellungen={gefilterteBestellungen}
        loading={loading}
        onSelect={handleOpenDetail}
        onStatusUpdate={handleStatusUpdate}
        onVersand={handleOpenVersandDialog}
      />

      {/* Detail-Panel (Slide-in) */}
      {showDetail && selectedBestellung && (
        <ShopBestellungDetail
          bestellung={selectedBestellung}
          onClose={handleCloseDetail}
          onStatusUpdate={handleStatusUpdate}
          onVersand={handleOpenVersandDialog}
        />
      )}

      {/* Versand-Dialog */}
      {showVersandDialog && versandBestellung && (
        <VersandDialog
          bestellung={versandBestellung}
          onConfirm={handleVersandConfirm}
          onCancel={() => {
            setShowVersandDialog(false);
            setVersandBestellung(null);
          }}
        />
      )}
    </div>
  );
};

export default ShopBestellungen;
