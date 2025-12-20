import { useState, useEffect, useCallback, DragEvent } from 'react';
import {
  FileCheck,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
  MapPin,
  Euro,
  Package,
  GripVertical,
  Layers,
  Pencil,
  Trash2,
  X,
  Send,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { useNavigate } from 'react-router-dom';

// Tab-Konfiguration
const TABS: { id: ProjektStatus; label: string; icon: React.ComponentType<any>; color: string; bgColor: string }[] = [
  { id: 'angebot', label: 'Angebot', icon: FileCheck, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  { id: 'angebot_versendet', label: 'Angebot versendet', icon: Send, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200' },
  { id: 'auftragsbestaetigung', label: 'Auftragsbestätigung', icon: FileSignature, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  { id: 'lieferschein', label: 'Lieferschein', icon: Truck, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  { id: 'rechnung', label: 'Rechnung', icon: FileText, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  { id: 'bezahlt', label: 'Bezahlt', icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' },
];

const ProjektVerwaltung = () => {
  const navigate = useNavigate();
  const [projekteGruppiert, setProjekteGruppiert] = useState<{
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
  }>({
    angebot: [],
    angebot_versendet: [],
    auftragsbestaetigung: [],
    lieferschein: [],
    rechnung: [],
    bezahlt: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suche, setSuche] = useState('');
  const [draggedProjekt, setDraggedProjekt] = useState<Projekt | null>(null);
  const [dragOverTab, setDragOverTab] = useState<ProjektStatus | null>(null);
  const [saisonjahr] = useState(2026); // Aktuelle Saison
  const [editingProjekt, setEditingProjekt] = useState<Projekt | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Lade Daten
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gruppiert = await projektService.loadProjekteGruppiert(saisonjahr);
      setProjekteGruppiert(gruppiert);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Funktion
  const filterProjekte = (projekte: Projekt[]) => {
    if (!suche) return projekte;
    const s = suche.toLowerCase();
    return projekte.filter(p => {
      const kundennummerStr = p.kundennummer ? String(p.kundennummer).toLowerCase() : '';
      return (
        p.kundenname?.toLowerCase().includes(s) ||
        p.kundenPlzOrt?.toLowerCase().includes(s) ||
        kundennummerStr.includes(s) ||
        p.angebotsnummer?.toLowerCase().includes(s) ||
        p.rechnungsnummer?.toLowerCase().includes(s) ||
        p.lieferscheinnummer?.toLowerCase().includes(s)
      );
    });
  };

  // Drag & Drop Handler
  const handleDragStart = (e: DragEvent, projekt: Projekt) => {
    setDraggedProjekt(projekt);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', projekt.id);
  };

  const handleDragEnd = () => {
    setDraggedProjekt(null);
    setDragOverTab(null);
  };

  const handleDragOver = (e: DragEvent, tab: ProjektStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTab(tab);
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = async (e: DragEvent, zielTab: ProjektStatus) => {
    e.preventDefault();
    setDragOverTab(null);
    
    if (!draggedProjekt) return;

    await updateStatus(draggedProjekt, zielTab);
    setDraggedProjekt(null);
  };

  // Status Update
  const updateStatus = async (projekt: Projekt, neuerStatus: ProjektStatus) => {
    setSaving(true);
    try {
      // Verwende $id (Appwrite Document ID), falls vorhanden, sonst die logische Projekt-ID
      const documentId = (projekt as any).$id || projekt.id;
      await projektService.updateProjektStatus(documentId, neuerStatus);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Projekt-Klick Handler - Öffnet Formular
  const handleProjektClick = (projekt: Projekt) => {
    // Verwende $id falls vorhanden, sonst id
    const projektId = (projekt as any).$id || projekt.id;
    // Zur Bestellabwicklung mit Projekt-ID in URL navigieren
    navigate(`/bestellabwicklung/${projektId}`);
  };

  // Edit-Handler
  const handleEdit = (e: React.MouseEvent, projekt: Projekt) => {
    e.stopPropagation(); // Verhindert, dass der Card-onClick ausgelöst wird
    setEditingProjekt(projekt);
    setShowEditModal(true);
  };

  // Speichern der bearbeiteten Projektdaten
  const handleSaveEdit = async (updatedProjekt: Partial<Projekt>) => {
    if (!editingProjekt) return;
    
    setSaving(true);
    try {
      // Verwende $id falls vorhanden, sonst id
      const projektId = (editingProjekt as any).$id || editingProjekt.id;
      await projektService.updateProjekt(projektId, updatedProjekt);
      setShowEditModal(false);
      setEditingProjekt(null);
      await loadData(); // Daten neu laden
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Speichern des Projekts. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Delete-Handler
  const handleDelete = async (e: React.MouseEvent, projekt: Projekt) => {
    e.stopPropagation(); // Verhindert, dass der Card-onClick ausgelöst wird
    
    const bestaetigung = window.confirm(
      `Möchtest du das Projekt "${projekt.kundenname}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`
    );
    
    if (!bestaetigung) return;
    
    setSaving(true);
    try {
      await projektService.deleteProjekt(projekt);
      await loadData(); // Daten neu laden
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Projekts. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Berechne Gesamtzahlen
  const gesamtAngebot = projekteGruppiert.angebot.length;
  const gesamtAngebotVersendet = projekteGruppiert.angebot_versendet.length;
  const gesamtAuftragsbestaetigung = projekteGruppiert.auftragsbestaetigung.length;
  const gesamtLieferschein = projekteGruppiert.lieferschein.length;
  const gesamtRechnung = projekteGruppiert.rechnung.length;
  const gesamtBezahlt = projekteGruppiert.bezahlt.length;
  const gesamt = gesamtAngebot + gesamtAngebotVersendet + gesamtAuftragsbestaetigung + gesamtLieferschein + gesamtRechnung + gesamtBezahlt;

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-dark-textMuted">Lade Projekte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg dark:shadow-dark-lg">
              <Layers className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Projekt-Verwaltung</h1>
              <p className="text-gray-600 dark:text-dark-textMuted mt-1">
                Überblick über alle Projekte • {gesamt} Projekte • Saison {saisonjahr}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Suche (Kunde, Nummer...)"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="pl-10 pr-4 py-2 w-72 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-6 gap-4">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const projekte = filterProjekte(
            tab.id === 'angebot' ? projekteGruppiert.angebot :
            tab.id === 'angebot_versendet' ? projekteGruppiert.angebot_versendet :
            tab.id === 'auftragsbestaetigung' ? projekteGruppiert.auftragsbestaetigung :
            tab.id === 'lieferschein' ? projekteGruppiert.lieferschein :
            tab.id === 'rechnung' ? projekteGruppiert.rechnung :
            projekteGruppiert.bezahlt
          );
          const count = 
            tab.id === 'angebot' ? gesamtAngebot :
            tab.id === 'angebot_versendet' ? gesamtAngebotVersendet :
            tab.id === 'auftragsbestaetigung' ? gesamtAuftragsbestaetigung :
            tab.id === 'lieferschein' ? gesamtLieferschein :
            tab.id === 'rechnung' ? gesamtRechnung :
            gesamtBezahlt;
          
          return (
            <div
              key={tab.id}
              className={`flex flex-col bg-white rounded-xl shadow-lg border-2 transition-all min-h-[600px] ${
                dragOverTab === tab.id ? 'border-purple-500 ring-4 ring-purple-200' : 'border-gray-200'
              }`}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
            >
              {/* Tab Header */}
              <div className={`px-4 py-3 border-b-2 ${tab.bgColor} rounded-t-xl`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TabIcon className={`w-5 h-5 ${tab.color}`} />
                    <span className={`font-semibold ${tab.color}`}>{tab.label}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-sm font-bold ${tab.bgColor} ${tab.color}`}>
                    {count}
                  </span>
                </div>
              </div>

              {/* Projekt-Liste */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {projekte.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <TabIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Keine Projekte</p>
                  </div>
                ) : (
                  projekte.map((projekt) => (
                    <ProjektCard
                      key={(projekt as any).$id || projekt.id}
                      projekt={projekt}
                      status={tab.id}
                      onDragStart={(e) => handleDragStart(e, projekt)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleProjektClick(projekt)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-[60] flex items-center justify-center">
          <div className="bg-white dark:bg-dark-surface rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <span className="text-gray-700 dark:text-dark-textMuted font-medium">Speichere...</span>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProjekt && (
        <ProjektEditModal
          projekt={editingProjekt}
          onSave={handleSaveEdit}
          onCancel={() => {
            setShowEditModal(false);
            setEditingProjekt(null);
          }}
        />
      )}
    </div>
  );
};

// Projekt-Card Komponente
interface ProjektCardProps {
  projekt: Projekt;
  status: ProjektStatus;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  onEdit: (e: React.MouseEvent, projekt: Projekt) => void;
  onDelete: (e: React.MouseEvent, projekt: Projekt) => void;
}

const ProjektCard = ({ projekt, status, onDragStart, onDragEnd, onClick, onEdit, onDelete }: ProjektCardProps) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg p-3 hover:shadow-md dark:shadow-dark-md transition-all cursor-pointer group"
    >
      {/* Header mit Drag Handle */}
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 dark:text-dark-textMuted mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-dark-text truncate">{projekt.projektName || projekt.kundenname}</h4>
          <div className="text-xs text-gray-600 dark:text-dark-textMuted truncate">{projekt.kundenname}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-textMuted mt-0.5">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{projekt.kundenPlzOrt}</span>
          </div>
          {projekt.kundennummer && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-dark-textMuted text-xs rounded-full">
              Nr. {projekt.kundennummer}
            </span>
          )}
        </div>
        {/* Action Buttons */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => onEdit(e, projekt)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Projekt bearbeiten"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => onDelete(e, projekt)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Projekt löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dokument-Infos */}
      <div className="text-xs text-gray-500 dark:text-dark-textMuted space-y-1 mb-2">
        {projekt.angebotsnummer && (
          <div className="flex items-center gap-1">
            <FileCheck className="w-3 h-3 text-blue-500" />
            Angebot: {projekt.angebotsnummer}
            {projekt.angebotsdatum && (
              <span className="text-gray-400 dark:text-gray-500">
                • {new Date(projekt.angebotsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.auftragsbestaetigungsnummer && (
          <div className="flex items-center gap-1">
            <FileSignature className="w-3 h-3 text-orange-500" />
            AB: {projekt.auftragsbestaetigungsnummer}
            {projekt.auftragsbestaetigungsdatum && (
              <span className="text-gray-400 dark:text-gray-500">
                • {new Date(projekt.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.lieferscheinnummer && (
          <div className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-green-500" />
            Lieferschein: {projekt.lieferscheinnummer}
            {projekt.lieferdatum && (
              <span className="text-gray-400 dark:text-gray-500">
                • {new Date(projekt.lieferdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.rechnungsnummer && (
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-red-500" />
            Rechnung: {projekt.rechnungsnummer}
            {projekt.rechnungsdatum && (
              <span className="text-gray-400 dark:text-gray-500">
                • {new Date(projekt.rechnungsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {status === 'bezahlt' && projekt.bezahltAm && (
          <div className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Bezahlt am {new Date(projekt.bezahltAm).toLocaleDateString('de-DE')}
          </div>
        )}
      </div>

      {/* Mengen- und Preis-Info */}
      {(projekt.angefragteMenge || projekt.preisProTonne) && (
        <div className="text-xs text-gray-500 dark:text-dark-textMuted space-y-0.5 pt-2 border-t border-gray-100">
          {projekt.angefragteMenge && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {projekt.angefragteMenge}t
            </div>
          )}
          {projekt.preisProTonne && (
            <div className="flex items-center gap-1 font-medium text-gray-700 dark:text-dark-textMuted">
              <Euro className="w-3 h-3" />
              {projekt.preisProTonne.toFixed(2)} €/t
            </div>
          )}
        </div>
      )}

      {/* Notiz Preview */}
      {projekt.notizen && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-1 italic">
          "{projekt.notizen}"
        </div>
      )}
    </div>
  );
};

// Projekt-Edit-Modal Komponente
interface ProjektEditModalProps {
  projekt: Projekt;
  onSave: (updatedData: Partial<Projekt>) => void;
  onCancel: () => void;
}

const ProjektEditModal = ({ projekt, onSave, onCancel }: ProjektEditModalProps) => {
  const [formData, setFormData] = useState({
    projektName: projekt.projektName || projekt.kundenname,
    kundenname: projekt.kundenname,
    kundenstrasse: projekt.kundenstrasse,
    kundenPlzOrt: projekt.kundenPlzOrt,
    kundennummer: projekt.kundennummer || '',
    angefragteMenge: projekt.angefragteMenge || 0,
    preisProTonne: projekt.preisProTonne || 0,
    bezugsweg: projekt.bezugsweg || '',
    notizen: projekt.notizen || '',
  });
  const [loadingKundennummer, setLoadingKundennummer] = useState(false);

  // Lade Kundennummer aus Kunden-Datensatz wenn Kundenname geändert wird
  useEffect(() => {
    const ladeKundennummer = async () => {
      if (!projekt.kundeId) return;
      
      // Nur laden wenn Kundennummer noch nicht gesetzt ist oder wenn sich der Name geändert hat
      if (!formData.kundennummer || formData.kundenname !== projekt.kundenname) {
        setLoadingKundennummer(true);
        try {
          const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
          if (kunde && kunde.kundennummer) {
            setFormData(prev => ({ ...prev, kundennummer: kunde.kundennummer || prev.kundennummer }));
          }
        } catch (error) {
          console.warn('Konnte Kundennummer nicht laden:', error);
        } finally {
          setLoadingKundennummer(false);
        }
      }
    };

    ladeKundennummer();
  }, [projekt.kundeId, formData.kundenname]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      projektName: formData.projektName,
      kundenname: formData.kundenname,
      kundenstrasse: formData.kundenstrasse,
      kundenPlzOrt: formData.kundenPlzOrt,
      kundennummer: formData.kundennummer || undefined,
      angefragteMenge: formData.angefragteMenge || undefined,
      preisProTonne: formData.preisProTonne || undefined,
      bezugsweg: formData.bezugsweg || undefined,
      notizen: formData.notizen || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Projekt bearbeiten</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Projektname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Projektname *
            </label>
            <input
              type="text"
              value={formData.projektName}
              onChange={(e) => setFormData({ ...formData, projektName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg font-medium"
              required
            />
          </div>

          {/* Kundenname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Kundenname *
            </label>
            <input
              type="text"
              value={formData.kundenname}
              onChange={(e) => setFormData({ ...formData, kundenname: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          {/* Kundennummer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Kundennummer <span className="text-xs text-gray-500 dark:text-dark-textMuted">(Verknüpfung zum Projekt)</span>
            </label>
            <input
              type="text"
              value={formData.kundennummer}
              onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder={loadingKundennummer ? 'Lade...' : 'Wird automatisch aus Kunden-Datensatz geladen'}
            />
            {formData.kundennummer && (
              <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                ⚠️ Die Kundennummer dient als Verknüpfung zum Projekt. Sie wird automatisch aus dem Kunden-Datensatz geladen.
              </p>
            )}
          </div>

          {/* Straße */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Straße
            </label>
            <input
              type="text"
              value={formData.kundenstrasse}
              onChange={(e) => setFormData({ ...formData, kundenstrasse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* PLZ & Ort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              PLZ & Ort *
            </label>
            <input
              type="text"
              value={formData.kundenPlzOrt}
              onChange={(e) => setFormData({ ...formData, kundenPlzOrt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="12345 Musterstadt"
              required
            />
          </div>

          {/* Angefragte Menge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Angefragte Menge (Tonnen)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.angefragteMenge}
              onChange={(e) => setFormData({ ...formData, angefragteMenge: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Preis pro Tonne */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Preis pro Tonne (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.preisProTonne}
              onChange={(e) => setFormData({ ...formData, preisProTonne: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Bezugsweg */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Bezugsweg
            </label>
            <select
              value={formData.bezugsweg}
              onChange={(e) => setFormData({ ...formData, bezugsweg: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Bitte wählen</option>
              <option value="direkt">Direkt</option>
              <option value="ueber_platzbauer">Über Platzbauer</option>
            </select>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Notizen
            </label>
            <textarea
              value={formData.notizen}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors font-medium"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjektVerwaltung;
