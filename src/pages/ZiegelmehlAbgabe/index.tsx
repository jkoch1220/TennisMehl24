/**
 * Ziegelmehl Abgabe Management Page
 *
 * Displays and manages brick drop-off submissions from the website
 * dachziegelrueckgabe.de / .com
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Calendar,
  Phone,
  Mail,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Filter,
  RefreshCw,
  Trash2,
  MessageSquare,
  Scale,
} from 'lucide-react';
import { ziegelmehlAbgabeService } from '../../services/ziegelmehlAbgabeService';
import type {
  ZiegelmehlAbgabe,
  AbgabeStatus,
} from '../../types/ziegelmehlAbgabe';
import {
  ABGABE_STATUS_LABELS,
  ABGABE_STATUS_COLORS,
} from '../../types/ziegelmehlAbgabe';

type FilterStatus = AbgabeStatus | 'alle';

export default function ZiegelmehlAbgabePage() {
  const [abgaben, setAbgaben] = useState<ZiegelmehlAbgabe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('alle');
  const [selectedAbgabe, setSelectedAbgabe] = useState<ZiegelmehlAbgabe | null>(null);
  const [statistics, setStatistics] = useState<{
    total: number;
    neu: number;
    bestaetigt: number;
    abgeholt: number;
    abgelehnt: number;
    gesamtMenge: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [abgabenData, statsData] = await Promise.all([
        filterStatus === 'alle'
          ? ziegelmehlAbgabeService.loadAlleAbgaben()
          : ziegelmehlAbgabeService.loadAbgabenNachStatus(filterStatus),
        ziegelmehlAbgabeService.getStatistics(),
      ]);

      setAbgaben(abgabenData);
      setStatistics(statsData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: AbgabeStatus) => {
    try {
      await ziegelmehlAbgabeService.updateStatus(id, newStatus);
      await loadData();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Fehler beim Aktualisieren des Status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diese Abgabe wirklich löschen?')) return;

    try {
      await ziegelmehlAbgabeService.deleteAbgabe(id);
      await loadData();
      setSelectedAbgabe(null);
    } catch (err) {
      console.error('Error deleting:', err);
      setError('Fehler beim Löschen');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Package className="w-8 h-8 text-orange-600" />
          Ziegelmehl Abgaben
        </h1>
        <p className="text-gray-600 mt-1">
          Verwaltung der Abgabe-Anfragen von dachziegelrueckgabe.de
        </p>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard
            label="Gesamt"
            value={statistics.total}
            color="bg-gray-100 text-gray-800"
          />
          <StatCard
            label="Neu"
            value={statistics.neu}
            color="bg-blue-100 text-blue-800"
            highlight
          />
          <StatCard
            label="Bestätigt"
            value={statistics.bestaetigt}
            color="bg-green-100 text-green-800"
          />
          <StatCard
            label="Abgeholt"
            value={statistics.abgeholt}
            color="bg-gray-100 text-gray-800"
          />
          <StatCard
            label="Abgelehnt"
            value={statistics.abgelehnt}
            color="bg-red-100 text-red-800"
          />
          <StatCard
            label="Gesamtmenge"
            value={`${statistics.gesamtMenge.toFixed(1)} t`}
            color="bg-orange-100 text-orange-800"
          />
        </div>
      )}

      {/* Filter & Actions */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="alle">Alle anzeigen</option>
            <option value="neu">Nur Neue</option>
            <option value="bestaetigt">Nur Bestätigte</option>
            <option value="abgeholt">Nur Abgeholte</option>
            <option value="abgelehnt">Nur Abgelehnte</option>
          </select>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-4" />
          <p className="text-gray-600">Lade Abgaben...</p>
        </div>
      )}

      {/* Submissions List */}
      {!loading && abgaben.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Keine Abgaben gefunden</p>
        </div>
      )}

      {!loading && abgaben.length > 0 && (
        <div className="grid gap-4">
          {abgaben.map((abgabe) => (
            <AbgabeCard
              key={abgabe.id}
              abgabe={abgabe}
              onStatusChange={handleStatusChange}
              onSelect={() => setSelectedAbgabe(abgabe)}
              isSelected={selectedAbgabe?.id === abgabe.id}
              formatDate={formatDate}
              formatDateTime={formatDateTime}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedAbgabe && (
          <DetailModal
            abgabe={selectedAbgabe}
            onClose={() => setSelectedAbgabe(null)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            formatDate={formatDate}
            formatDateTime={formatDateTime}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Statistics Card Component
function StatCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number | string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl ${color} ${highlight ? 'ring-2 ring-blue-400' : ''}`}
    >
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </motion.div>
  );
}

// Submission Card Component
function AbgabeCard({
  abgabe,
  onStatusChange,
  onSelect,
  isSelected,
  formatDate,
  formatDateTime,
}: {
  abgabe: ZiegelmehlAbgabe;
  onStatusChange: (id: string, status: AbgabeStatus) => void;
  onSelect: () => void;
  isSelected: boolean;
  formatDate: (date: string) => string;
  formatDateTime: (date: string) => string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-orange-500' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: Main Info */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-3 mb-2">
            <User className="w-5 h-5 text-gray-400" />
            <span className="font-semibold text-gray-900">{abgabe.name}</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ABGABE_STATUS_COLORS[abgabe.status]}`}>
              {ABGABE_STATUS_LABELS[abgabe.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <a href={`tel:${abgabe.telefon}`} className="hover:text-orange-600" onClick={(e) => e.stopPropagation()}>
                {abgabe.telefon}
              </a>
            </div>

            {abgabe.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <a href={`mailto:${abgabe.email}`} className="hover:text-orange-600" onClick={(e) => e.stopPropagation()}>
                  {abgabe.email}
                </a>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4" />
              <span>{abgabe.menge} Tonnen</span>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(abgabe.abgabedatum)}</span>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Erstellt: {formatDateTime(abgabe.erstelltAm)}
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {abgabe.status === 'neu' && (
            <>
              <button
                onClick={() => onStatusChange(abgabe.id, 'bestaetigt')}
                className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                title="Bestätigen"
              >
                <CheckCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => onStatusChange(abgabe.id, 'abgelehnt')}
                className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                title="Ablehnen"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          )}
          {abgabe.status === 'bestaetigt' && (
            <button
              onClick={() => onStatusChange(abgabe.id, 'abgeholt')}
              className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
              title="Als abgeholt markieren"
            >
              <Truck className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Detail Modal Component
function DetailModal({
  abgabe,
  onClose,
  onStatusChange,
  onDelete,
  formatDate,
  formatDateTime,
}: {
  abgabe: ZiegelmehlAbgabe;
  onClose: () => void;
  onStatusChange: (id: string, status: AbgabeStatus) => void;
  onDelete: (id: string) => void;
  formatDate: (date: string) => string;
  formatDateTime: (date: string) => string;
}) {
  const [notes, setNotes] = useState(abgabe.notizen || '');
  const [saving, setSaving] = useState(false);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await ziegelmehlAbgabeService.updateAbgabe(abgabe.id, { notizen: notes });
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{abgabe.name}</h2>
              <span className={`inline-block mt-1 px-3 py-1 text-sm font-medium rounded-full ${ABGABE_STATUS_COLORS[abgabe.status]}`}>
                {ABGABE_STATUS_LABELS[abgabe.status]}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Contact Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <InfoRow icon={Phone} label="Telefon" value={abgabe.telefon} isLink href={`tel:${abgabe.telefon}`} />
            <InfoRow icon={Mail} label="E-Mail" value={abgabe.email || 'Nicht angegeben'} isLink={!!abgabe.email} href={abgabe.email ? `mailto:${abgabe.email}` : undefined} />
          </div>

          {/* Submission Details */}
          <div className="grid md:grid-cols-2 gap-4">
            <InfoRow icon={Scale} label="Menge" value={`${abgabe.menge} Tonnen`} />
            <InfoRow icon={Calendar} label="Gewünschtes Datum" value={formatDate(abgabe.abgabedatum)} />
          </div>

          {/* Metadata */}
          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            <InfoRow icon={Clock} label="Erstellt am" value={formatDateTime(abgabe.erstelltAm)} />
            <InfoRow icon={Package} label="Quelle" value={abgabe.quelle} />
          </div>

          {/* Notes */}
          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <MessageSquare className="w-4 h-4" />
              Notizen
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
              placeholder="Interne Notizen hinzufügen..."
            />
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Speichern...' : 'Notizen speichern'}
            </button>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-3">
            {abgabe.status === 'neu' && (
              <>
                <button
                  onClick={() => onStatusChange(abgabe.id, 'bestaetigt')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                  Bestätigen
                </button>
                <button
                  onClick={() => onStatusChange(abgabe.id, 'abgelehnt')}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                  Ablehnen
                </button>
              </>
            )}
            {abgabe.status === 'bestaetigt' && (
              <button
                onClick={() => onStatusChange(abgabe.id, 'abgeholt')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Truck className="w-5 h-5" />
                Als abgeholt markieren
              </button>
            )}
            <button
              onClick={() => onDelete(abgabe.id)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-700 rounded-lg transition-colors ml-auto"
            >
              <Trash2 className="w-5 h-5" />
              Löschen
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Info Row Component
function InfoRow({
  icon: Icon,
  label,
  value,
  isLink,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isLink?: boolean;
  href?: string;
}) {
  const content = isLink && href ? (
    <a href={href} className="text-orange-600 hover:underline">
      {value}
    </a>
  ) : (
    <span className="text-gray-900">{value}</span>
  );

  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-gray-400 mt-0.5" />
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-medium">{content}</p>
      </div>
    </div>
  );
}
