import { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Save,
  Phone,
  Mail,
  MapPin,
  Star,
  User,
  ChevronDown,
  ChevronRight,
  Euro,
  Globe,
  Building2,
  AlertCircle,
} from 'lucide-react';
import {
  Logistikpartner,
  NeuerLogistikpartner,
  PartnerFahrzeug,
  PartnerAnsprechpartner,
  Liefergebiet,
  Preisstruktur,
  LogistikpartnerStatus,
  FahrzeugTyp,
  SchuettmaschinenTyp,
  FAHRZEUG_TYP_LABELS,
  SCHUETTMASCHINEN_TYP_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../types/logistikpartner';
import { logistikpartnerService } from '../../services/logistikpartnerService';
import { ID } from 'appwrite';

export default function LogistikpartnerVerwaltung() {
  const [partner, setPartner] = useState<Logistikpartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<LogistikpartnerStatus | 'alle'>('alle');

  // Formular-State
  const [showForm, setShowForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Logistikpartner | null>(null);
  const [formData, setFormData] = useState<NeuerLogistikpartner>(logistikpartnerService.createEmptyPartner());
  const [saving, setSaving] = useState(false);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stammdaten: true,
    ansprechpartner: true,
    fahrzeuge: true,
    liefergebiete: false,
    preise: false,
    bewertung: false,
  });

  useEffect(() => {
    loadPartner();
  }, []);

  const loadPartner = async () => {
    setLoading(true);
    try {
      const data = await logistikpartnerService.loadAlleLogistikpartner();
      setPartner(data);
      setError(null);
    } catch (err) {
      setError('Fehler beim Laden der Logistikpartner');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPartner(null);
    setFormData(logistikpartnerService.createEmptyPartner());
    setShowForm(true);
  };

  const handleEdit = (p: Logistikpartner) => {
    setEditingPartner(p);
    setFormData({
      firmenname: p.firmenname,
      kurzname: p.kurzname,
      status: p.status,
      strasse: p.strasse,
      plz: p.plz,
      ort: p.ort,
      land: p.land,
      telefon: p.telefon,
      fax: p.fax,
      email: p.email,
      website: p.website,
      ansprechpartner: p.ansprechpartner || [],
      fahrzeuge: p.fahrzeuge || [],
      liefergebiete: p.liefergebiete || [],
      preisstrukturen: p.preisstrukturen || [],
      zahlungszielTage: p.zahlungszielTage,
      kundennummerBeiPartner: p.kundennummerBeiPartner,
      ustIdNr: p.ustIdNr,
      zuverlaessigkeit: p.zuverlaessigkeit,
      qualitaet: p.qualitaet,
      kommunikation: p.kommunikation,
      notizen: p.notizen,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Logistikpartner wirklich löschen?')) return;

    try {
      await logistikpartnerService.deleteLogistikpartner(id);
      await loadPartner();
    } catch (err) {
      setError('Fehler beim Löschen');
      console.error(err);
    }
  };

  const handleSave = async () => {
    if (!formData.firmenname.trim()) {
      alert('Bitte Firmennamen eingeben');
      return;
    }

    setSaving(true);
    try {
      if (editingPartner) {
        await logistikpartnerService.updateLogistikpartner(editingPartner.id, formData);
      } else {
        await logistikpartnerService.createLogistikpartner(formData);
      }
      await loadPartner();
      setShowForm(false);
      setEditingPartner(null);
    } catch (err) {
      setError('Fehler beim Speichern');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Ansprechpartner hinzufügen
  const addAnsprechpartner = () => {
    const neuerAP: PartnerAnsprechpartner = {
      id: ID.unique(),
      name: '',
      istHauptkontakt: formData.ansprechpartner.length === 0,
    };
    setFormData({ ...formData, ansprechpartner: [...formData.ansprechpartner, neuerAP] });
  };

  const updateAnsprechpartner = (id: string, updates: Partial<PartnerAnsprechpartner>) => {
    setFormData({
      ...formData,
      ansprechpartner: formData.ansprechpartner.map(ap =>
        ap.id === id ? { ...ap, ...updates } : ap
      ),
    });
  };

  const removeAnsprechpartner = (id: string) => {
    setFormData({
      ...formData,
      ansprechpartner: formData.ansprechpartner.filter(ap => ap.id !== id),
    });
  };

  // Fahrzeug hinzufügen
  const addFahrzeug = () => {
    const neuesFahrzeug: PartnerFahrzeug = {
      id: ID.unique(),
      typ: 'lkw_18t',
      bezeichnung: '',
      hatSchuettmaschine: false,
    };
    setFormData({ ...formData, fahrzeuge: [...formData.fahrzeuge, neuesFahrzeug] });
  };

  const updateFahrzeug = (id: string, updates: Partial<PartnerFahrzeug>) => {
    setFormData({
      ...formData,
      fahrzeuge: formData.fahrzeuge.map(f =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
  };

  const removeFahrzeug = (id: string) => {
    setFormData({
      ...formData,
      fahrzeuge: formData.fahrzeuge.filter(f => f.id !== id),
    });
  };

  // Liefergebiet hinzufügen
  const addLiefergebiet = () => {
    const neuesGebiet: Liefergebiet = {
      id: ID.unique(),
      bezeichnung: '',
      plzBereiche: [],
    };
    setFormData({ ...formData, liefergebiete: [...formData.liefergebiete, neuesGebiet] });
  };

  const updateLiefergebiet = (id: string, updates: Partial<Liefergebiet>) => {
    setFormData({
      ...formData,
      liefergebiete: formData.liefergebiete.map(g =>
        g.id === id ? { ...g, ...updates } : g
      ),
    });
  };

  const removeLiefergebiet = (id: string) => {
    setFormData({
      ...formData,
      liefergebiete: formData.liefergebiete.filter(g => g.id !== id),
    });
  };

  // Preisstruktur hinzufügen
  const addPreisstruktur = () => {
    const neuePreisstruktur: Preisstruktur = {
      id: ID.unique(),
      bezeichnung: 'Standard',
    };
    setFormData({ ...formData, preisstrukturen: [...formData.preisstrukturen, neuePreisstruktur] });
  };

  const updatePreisstruktur = (id: string, updates: Partial<Preisstruktur>) => {
    setFormData({
      ...formData,
      preisstrukturen: formData.preisstrukturen.map(p =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
  };

  const removePreisstruktur = (id: string) => {
    setFormData({
      ...formData,
      preisstrukturen: formData.preisstrukturen.filter(p => p.id !== id),
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections({ ...expandedSections, [section]: !expandedSections[section] });
  };

  // Filtern
  const filteredPartner = partner.filter(p => {
    if (statusFilter !== 'alle' && p.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        p.firmenname.toLowerCase().includes(search) ||
        p.kurzname?.toLowerCase().includes(search) ||
        p.ort?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Sterne-Bewertung Komponente
  const StarRating = ({ value, onChange }: { value?: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <Star
            className={`w-5 h-5 ${
              value && star <= value
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg">
            <Truck className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-dark-text">
              Logistikpartner
            </h1>
            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
              Speditionen und Transportpartner verwalten
            </p>
          </div>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neuer Partner
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Partner suchen..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-800 dark:text-dark-text focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as LogistikpartnerStatus | 'alle')}
          className="px-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-800 dark:text-dark-text"
        >
          <option value="alle">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Inaktiv</option>
          <option value="pausiert">Pausiert</option>
        </select>
      </div>

      {/* Liste */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
        {filteredPartner.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-dark-textMuted">
            <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Keine Logistikpartner gefunden</p>
            <button
              onClick={handleCreate}
              className="mt-4 text-red-600 hover:text-red-700"
            >
              Ersten Partner anlegen
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {filteredPartner.map(p => (
              <div
                key={p.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-800 dark:text-dark-text">
                        {p.firmenname}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    {p.kurzname && (
                      <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                        {p.kurzname}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-dark-textMuted">
                      {p.ort && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {p.plz} {p.ort}
                        </span>
                      )}
                      {p.telefon && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {p.telefon}
                        </span>
                      )}
                      {p.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {p.email}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.fahrzeuge.length > 0 && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
                          {p.fahrzeuge.length} Fahrzeug{p.fahrzeuge.length !== 1 ? 'e' : ''}
                        </span>
                      )}
                      {p.fahrzeuge.some(f => f.hatSchuettmaschine) && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                          Mit Schüttmaschine
                        </span>
                      )}
                      {p.liefergebiete.length > 0 && (
                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-1 rounded">
                          {p.liefergebiete.length} Liefergebiet{p.liefergebiete.length !== 1 ? 'e' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(p)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formular Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl w-full max-w-4xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-dark-text">
                {editingPartner ? 'Partner bearbeiten' : 'Neuer Logistikpartner'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Stammdaten */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('stammdaten')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">Stammdaten</span>
                  </div>
                  {expandedSections.stammdaten ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.stammdaten && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Firmenname *
                      </label>
                      <input
                        type="text"
                        value={formData.firmenname}
                        onChange={e => setFormData({ ...formData, firmenname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Kurzname
                      </label>
                      <input
                        type="text"
                        value={formData.kurzname || ''}
                        onChange={e => setFormData({ ...formData, kurzname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value as LogistikpartnerStatus })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      >
                        <option value="aktiv">Aktiv</option>
                        <option value="inaktiv">Inaktiv</option>
                        <option value="pausiert">Pausiert</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Straße
                      </label>
                      <input
                        type="text"
                        value={formData.strasse || ''}
                        onChange={e => setFormData({ ...formData, strasse: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                          PLZ
                        </label>
                        <input
                          type="text"
                          value={formData.plz || ''}
                          onChange={e => setFormData({ ...formData, plz: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                          Ort
                        </label>
                        <input
                          type="text"
                          value={formData.ort || ''}
                          onChange={e => setFormData({ ...formData, ort: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Telefon
                      </label>
                      <input
                        type="tel"
                        value={formData.telefon || ''}
                        onChange={e => setFormData({ ...formData, telefon: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        E-Mail
                      </label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Website
                      </label>
                      <input
                        type="url"
                        value={formData.website || ''}
                        onChange={e => setFormData({ ...formData, website: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Unsere Kundennr. beim Partner
                      </label>
                      <input
                        type="text"
                        value={formData.kundennummerBeiPartner || ''}
                        onChange={e => setFormData({ ...formData, kundennummerBeiPartner: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Ansprechpartner */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('ansprechpartner')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">
                      Ansprechpartner ({formData.ansprechpartner.length})
                    </span>
                  </div>
                  {expandedSections.ansprechpartner ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.ansprechpartner && (
                  <div className="p-4 space-y-3">
                    {formData.ansprechpartner.map((ap, idx) => (
                      <div key={ap.id} className="p-3 bg-gray-50 dark:bg-dark-bg rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                            Kontakt {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAnsprechpartner(ap.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Name"
                            value={ap.name}
                            onChange={e => updateAnsprechpartner(ap.id, { name: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Position"
                            value={ap.position || ''}
                            onChange={e => updateAnsprechpartner(ap.id, { position: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                          <input
                            type="tel"
                            placeholder="Telefon"
                            value={ap.telefon || ''}
                            onChange={e => updateAnsprechpartner(ap.id, { telefon: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                          <input
                            type="email"
                            placeholder="E-Mail"
                            value={ap.email || ''}
                            onChange={e => updateAnsprechpartner(ap.id, { email: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ap.istHauptkontakt}
                            onChange={e => updateAnsprechpartner(ap.id, { istHauptkontakt: e.target.checked })}
                            className="rounded"
                          />
                          Hauptkontakt
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addAnsprechpartner}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Ansprechpartner hinzufügen
                    </button>
                  </div>
                )}
              </div>

              {/* Fahrzeuge */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('fahrzeuge')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">
                      Fahrzeuge & Schüttmaschinen ({formData.fahrzeuge.length})
                    </span>
                  </div>
                  {expandedSections.fahrzeuge ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.fahrzeuge && (
                  <div className="p-4 space-y-3">
                    {formData.fahrzeuge.map((fz, idx) => (
                      <div key={fz.id} className="p-3 bg-gray-50 dark:bg-dark-bg rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                            Fahrzeug {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFahrzeug(fz.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={fz.typ}
                            onChange={e => updateFahrzeug(fz.id, { typ: e.target.value as FahrzeugTyp })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          >
                            {Object.entries(FAHRZEUG_TYP_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Bezeichnung (z.B. MAN TGX)"
                            value={fz.bezeichnung}
                            onChange={e => updateFahrzeug(fz.id, { bezeichnung: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Kennzeichen"
                            value={fz.kennzeichen || ''}
                            onChange={e => updateFahrzeug(fz.id, { kennzeichen: e.target.value })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                          <input
                            type="number"
                            placeholder="Kapazität (Tonnen)"
                            value={fz.kapazitaetTonnen || ''}
                            onChange={e => updateFahrzeug(fz.id, { kapazitaetTonnen: Number(e.target.value) || undefined })}
                            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={fz.hatSchuettmaschine}
                              onChange={e => updateFahrzeug(fz.id, { hatSchuettmaschine: e.target.checked })}
                              className="rounded"
                            />
                            Hat Schüttmaschine
                          </label>
                          {fz.hatSchuettmaschine && (
                            <select
                              value={fz.schuettmaschinenTyp || ''}
                              onChange={e => updateFahrzeug(fz.id, { schuettmaschinenTyp: e.target.value as SchuettmaschinenTyp || undefined })}
                              className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                            >
                              <option value="">Typ wählen</option>
                              {Object.entries(SCHUETTMASCHINEN_TYP_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addFahrzeug}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Fahrzeug hinzufügen
                    </button>
                  </div>
                )}
              </div>

              {/* Liefergebiete */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('liefergebiete')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">
                      Liefergebiete ({formData.liefergebiete.length})
                    </span>
                  </div>
                  {expandedSections.liefergebiete ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.liefergebiete && (
                  <div className="p-4 space-y-3">
                    {formData.liefergebiete.map((gebiet, idx) => (
                      <div key={gebiet.id} className="p-3 bg-gray-50 dark:bg-dark-bg rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                            Gebiet {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLiefergebiet(gebiet.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Bezeichnung (z.B. Bayern Süd)"
                          value={gebiet.bezeichnung}
                          onChange={e => updateLiefergebiet(gebiet.id, { bezeichnung: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                        />
                        <input
                          type="text"
                          placeholder="PLZ-Bereiche (kommagetrennt: 80, 81, 82, 83)"
                          value={gebiet.plzBereiche.join(', ')}
                          onChange={e => updateLiefergebiet(gebiet.id, {
                            plzBereiche: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Max. Entfernung (km)"
                          value={gebiet.maxEntfernungKm || ''}
                          onChange={e => updateLiefergebiet(gebiet.id, { maxEntfernungKm: Number(e.target.value) || undefined })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addLiefergebiet}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Liefergebiet hinzufügen
                    </button>
                  </div>
                )}
              </div>

              {/* Preisstrukturen */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('preise')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Euro className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">
                      Preise & Kosten ({formData.preisstrukturen.length})
                    </span>
                  </div>
                  {expandedSections.preise ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.preise && (
                  <div className="p-4 space-y-3">
                    {formData.preisstrukturen.map((preis, idx) => (
                      <div key={preis.id} className="p-3 bg-gray-50 dark:bg-dark-bg rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
                            Preisstruktur {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePreisstruktur(preis.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Bezeichnung"
                          value={preis.bezeichnung}
                          onChange={e => updatePreisstruktur(preis.id, { bezeichnung: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">€/km</label>
                            <input
                              type="number"
                              step="0.01"
                              value={preis.preisProKm || ''}
                              onChange={e => updatePreisstruktur(preis.id, { preisProKm: Number(e.target.value) || undefined })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">€/Tonne</label>
                            <input
                              type="number"
                              step="0.01"
                              value={preis.preisProTonne || ''}
                              onChange={e => updatePreisstruktur(preis.id, { preisProTonne: Number(e.target.value) || undefined })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Mindestpreis €</label>
                            <input
                              type="number"
                              step="0.01"
                              value={preis.mindestpreis || ''}
                              onChange={e => updatePreisstruktur(preis.id, { mindestpreis: Number(e.target.value) || undefined })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                            />
                          </div>
                        </div>
                        <textarea
                          placeholder="Notizen zur Preisstruktur"
                          value={preis.notizen || ''}
                          onChange={e => updatePreisstruktur(preis.id, { notizen: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addPreisstruktur}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Preisstruktur hinzufügen
                    </button>
                  </div>
                )}
              </div>

              {/* Bewertung */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('bewertung')}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-dark-text">Bewertung & Notizen</span>
                  </div>
                  {expandedSections.bewertung ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expandedSections.bewertung && (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-dark-textMuted mb-2">
                          Zuverlässigkeit
                        </label>
                        <StarRating
                          value={formData.zuverlaessigkeit}
                          onChange={v => setFormData({ ...formData, zuverlaessigkeit: v })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-dark-textMuted mb-2">
                          Qualität
                        </label>
                        <StarRating
                          value={formData.qualitaet}
                          onChange={v => setFormData({ ...formData, qualitaet: v })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-dark-textMuted mb-2">
                          Kommunikation
                        </label>
                        <StarRating
                          value={formData.kommunikation}
                          onChange={v => setFormData({ ...formData, kommunikation: v })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Notizen
                      </label>
                      <textarea
                        value={formData.notizen || ''}
                        onChange={e => setFormData({ ...formData, notizen: e.target.value })}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text"
                        placeholder="Allgemeine Notizen zum Partner..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-600 dark:text-dark-textMuted hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
