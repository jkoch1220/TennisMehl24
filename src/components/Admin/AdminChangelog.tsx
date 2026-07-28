import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isAdmin } from '../../services/authService';
import { adminChangelogService } from '../../services/adminChangelogService';
import { AdminChangelogDbEntry } from '../../types/adminChangelog';
import { Trash2, Download, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AdminChangelog: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AdminChangelogDbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'other' as const,
  });

  // Nur Julian (Admin mit Label 'admin') darf das sehen
  const isJulian = isAdmin(user);

  useEffect(() => {
    if (isJulian) {
      loadEntries();
    }
  }, [isJulian]);

  const loadEntries = async () => {
    setLoading(true);
    const data = await adminChangelogService.getAll();
    setEntries(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isJulian) return;

    try {
      await adminChangelogService.create(
        {
          type: 'manual',
          ...formData,
        },
        user.$id
      );
      setFormData({ title: '', description: '', category: 'other' });
      setFormOpen(false);
      await loadEntries();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Wirklich löschen?')) return;
    try {
      await adminChangelogService.delete(id);
      await loadEntries();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Titel
    doc.setFontSize(16);
    doc.text('Arbeitsnachweis - Portal Änderungen', 15, 15);

    // Datum
    doc.setFontSize(10);
    doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 15, 25);

    // Tabelle
    const tableData = entries.map((e) => [
      new Date(e.timestamp).toLocaleDateString('de-DE'),
      e.title,
      e.description.substring(0, 50) + (e.description.length > 50 ? '...' : ''),
      getCategoryLabel(e.category),
      e.type === 'auto' ? 'Git' : 'Manuell',
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Datum', 'Titel', 'Beschreibung', 'Kategorie', 'Quelle']],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [237, 137, 54], // orange-500
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 35 },
        2: { cellWidth: 50 },
        3: { cellWidth: 25 },
        4: { cellWidth: 20 },
      },
    });

    doc.save(`arbeitsnachweis-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!user) {
    return <div className="p-4 text-red-600">Nicht eingeloggt</div>;
  }

  if (!isJulian) {
    return <div className="p-4 text-red-600">Zugriff verweigert. Dieses Tool ist privat für den Admin reserviert.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Mein Arbeitsnachweis</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download size={16} />
            PDF exportieren
          </button>
          <button
            onClick={() => setFormOpen(!formOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus size={16} />
            Neuer Eintrag
          </button>
        </div>
      </div>

      {formOpen && (
        <div className="bg-gray-50 dark:bg-dark-surface p-4 rounded-lg mb-6 border border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-semibold mb-4">Neue Aktivität hinzufügen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titel (kurz)</label>
              <input
                type="text"
                maxLength={100}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="z.B. 'Domain bei Netlify eingerichtet'"
                className="w-full px-3 py-2 border rounded-lg dark:bg-dark-bg dark:border-dark-border"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Beschreibung</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detaillierte Beschreibung der Änderung..."
                className="w-full px-3 py-2 border rounded-lg dark:bg-dark-bg dark:border-dark-border"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Kategorie</label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border rounded-lg dark:bg-dark-bg dark:border-dark-border"
              >
                <option value="feature">Feature</option>
                <option value="bugfix">Bugfix</option>
                <option value="infra">Infra/DevOps</option>
                <option value="config">Konfiguration</option>
                <option value="other">Sonstige</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Lade Einträge...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Noch keine Einträge. Starten Sie mit dem Hinzufügen einer neuen Aktivität.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.$id}
              className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-2">
                    <h3 className="text-lg font-semibold">{entry.title}</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(
                        entry.category
                      )}`}
                    >
                      {getCategoryLabel(entry.category)}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      entry.type === 'auto'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100'
                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100'
                    }`}>
                      {entry.type === 'auto' ? '🔄 Automatisch' : '✍️ Manuell'}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-dark-textMuted mb-2 whitespace-pre-wrap">
                    {entry.description}
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>{new Date(entry.timestamp).toLocaleString('de-DE')}</span>
                    {entry.commitHash && (
                      <span className="font-mono text-xs">
                        Commit: {entry.commitHash.substring(0, 7)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(entry.$id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getCategoryColor(category?: string): string {
  switch (category) {
    case 'feature':
      return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100';
    case 'bugfix':
      return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100';
    case 'infra':
      return 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100';
    case 'config':
      return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-100';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100';
  }
}

function getCategoryLabel(category?: string): string {
  switch (category) {
    case 'feature':
      return '✨ Feature';
    case 'bugfix':
      return '🐛 Bugfix';
    case 'infra':
      return '⚙️ Infra';
    case 'config':
      return '⚙️ Config';
    default:
      return 'Sonstiges';
  }
}
