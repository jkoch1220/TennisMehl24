import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Search, ArrowUpDown } from 'lucide-react';
import { Artikel, ArtikelInput } from '../../types/artikel';
import {
  getAlleArtikel,
  erstelleArtikel,
  aktualisiereArtikel,
  loescheArtikel,
  sucheArtikel,
} from '../../services/artikelService';

type SortField = 'artikelnummer' | 'bezeichnung' | 'einzelpreis';

const ArtikelVerwaltungTab = () => {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [loading, setLoading] = useState(true);
  const [bearbeitungsModus, setBearbeitungsModus] = useState<string | null>(null);
  const [neuerArtikel, setNeuerArtikel] = useState(false);
  const [suchtext, setSuchtext] = useState('');
  const [sortField, setSortField] = useState<SortField>('artikelnummer');
  const [formData, setFormData] = useState<ArtikelInput>({
    artikelnummer: '',
    bezeichnung: '',
    beschreibung: '',
    einheit: 't',
    einzelpreis: undefined,
    streichpreis: undefined,
  });

  // Artikel laden
  const ladeArtikel = async () => {
    setLoading(true);
    try {
      const artikelListe = await getAlleArtikel(sortField);
      setArtikel(artikelListe);
    } catch (error) {
      console.error('Fehler beim Laden der Artikel:', error);
      alert('Fehler beim Laden der Artikel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ladeArtikel();
  }, [sortField]);

  // Suche
  const handleSuche = async (text: string) => {
    setSuchtext(text);
    if (!text.trim()) {
      ladeArtikel();
      return;
    }

    try {
      const ergebnisse = await sucheArtikel(text);
      setArtikel(ergebnisse);
    } catch (error) {
      console.error('Fehler bei der Suche:', error);
    }
  };

  // Neuen Artikel hinzufügen
  const handleNeuerArtikel = () => {
    setNeuerArtikel(true);
    setBearbeitungsModus(null);
    setFormData({
      artikelnummer: '',
      bezeichnung: '',
      beschreibung: '',
      einheit: 't',
      einzelpreis: undefined,
      streichpreis: undefined,
    });
  };

  // Artikel bearbeiten
  const handleBearbeiten = (art: Artikel) => {
    setBearbeitungsModus(art.$id!);
    setNeuerArtikel(false);
    setFormData({
      artikelnummer: art.artikelnummer,
      bezeichnung: art.bezeichnung,
      beschreibung: art.beschreibung || '',
      einheit: art.einheit,
      einzelpreis: art.einzelpreis,
      streichpreis: art.streichpreis,
    });
  };

  // Speichern
  const handleSpeichern = async () => {
    // Validierung
    if (!formData.artikelnummer.trim() || !formData.bezeichnung.trim()) {
      alert('Artikelnummer und Bezeichnung sind Pflichtfelder');
      return;
    }

    if (formData.einzelpreis !== undefined && formData.einzelpreis < 0) {
      alert('Der Einzelpreis darf nicht negativ sein');
      return;
    }

    try {
      if (neuerArtikel) {
        await erstelleArtikel(formData);
      } else if (bearbeitungsModus) {
        await aktualisiereArtikel(bearbeitungsModus, formData);
      }

      setNeuerArtikel(false);
      setBearbeitungsModus(null);
      ladeArtikel();
    } catch (error: any) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern: ' + (error.message || 'Unbekannter Fehler'));
    }
  };

  // Abbrechen
  const handleAbbrechen = () => {
    setNeuerArtikel(false);
    setBearbeitungsModus(null);
  };

  // Löschen
  const handleLoeschen = async (id: string) => {
    if (!confirm('Möchten Sie diesen Artikel wirklich löschen?')) {
      return;
    }

    try {
      await loescheArtikel(id);
      ladeArtikel();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Artikels');
    }
  };

  // Sortierung ändern
  const handleSortieren = (field: SortField) => {
    setSortField(field);
  };

  return (
    <div className="space-y-6">
      {/* Header mit Suche und Neue Artikel Button */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-2">Artikelverwaltung</h2>
            <p className="text-gray-600 dark:text-dark-textMuted text-sm">
              Verwalten Sie Ihre Standardartikel für die Angebotserstellung
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Suchfeld */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={suchtext}
                onChange={(e) => handleSuche(e.target.value)}
                placeholder="Artikel suchen..."
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            {/* Neuer Artikel Button */}
            <button
              onClick={handleNeuerArtikel}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Neuer Artikel
            </button>
          </div>
        </div>
      </div>

      {/* Formular für neuen/bearbeiteten Artikel */}
      {(neuerArtikel || bearbeitungsModus) && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl shadow-sm border border-blue-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">
            {neuerArtikel ? 'Neuer Artikel' : 'Artikel bearbeiten'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Artikelnummer *
              </label>
              <input
                type="text"
                value={formData.artikelnummer}
                onChange={(e) => setFormData({ ...formData, artikelnummer: e.target.value })}
                placeholder="z.B. TM-ZM"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Bezeichnung *
              </label>
              <input
                type="text"
                value={formData.bezeichnung}
                onChange={(e) => setFormData({ ...formData, bezeichnung: e.target.value })}
                placeholder="z.B. Tennismehl / Ziegelmehl"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Beschreibung
              </label>
              <textarea
                value={formData.beschreibung}
                onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                placeholder="Zusätzliche Informationen zum Artikel..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Einheit *
              </label>
              <select
                value={formData.einheit}
                onChange={(e) => setFormData({ ...formData, einheit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="t">t (Tonnen)</option>
                <option value="kg">kg (Kilogramm)</option>
                <option value="Stk">Stk (Stück)</option>
                <option value="m">m (Meter)</option>
                <option value="m²">m² (Quadratmeter)</option>
                <option value="m³">m³ (Kubikmeter)</option>
                <option value="Std">Std (Stunden)</option>
                <option value="Pkt">Pkt (Pauschal)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Einzelpreis (€) <span className="text-gray-400 dark:text-gray-500 text-xs">(optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.einzelpreis ?? ''}
                onChange={(e) => setFormData({ ...formData, einzelpreis: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="Optional - für Angebote auf Anfrage"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                Streichpreis (€) <span className="text-gray-400 dark:text-gray-500 text-xs">(optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.streichpreis ?? ''}
                onChange={(e) => setFormData({ ...formData, streichpreis: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="Ursprünglicher Preis bei Rabattaktionen"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSpeichern}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Save className="h-4 w-4" />
              Speichern
            </button>
            <button
              onClick={handleAbbrechen}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-8000 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Artikel-Liste */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600 dark:text-dark-textMuted">
            Lade Artikel...
          </div>
        ) : artikel.length === 0 ? (
          <div className="p-8 text-center text-gray-600 dark:text-dark-textMuted">
            {suchtext ? 'Keine Artikel gefunden' : 'Noch keine Artikel vorhanden'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSortieren('artikelnummer')}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-blue-600"
                    >
                      Artikelnummer
                      {sortField === 'artikelnummer' && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSortieren('bezeichnung')}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-blue-600"
                    >
                      Bezeichnung
                      {sortField === 'bezeichnung' && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                    Beschreibung
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                    Einheit
                  </th>
                  <th className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleSortieren('einzelpreis')}
                      className="flex items-center gap-2 ml-auto text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-blue-600"
                    >
                      Einzelpreis
                      {sortField === 'einzelpreis' && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {artikel.map((art) => (
                  <tr key={art.$id} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text">{art.artikelnummer}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 dark:text-dark-text">{art.bezeichnung}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-dark-textMuted line-clamp-2">
                        {art.beschreibung || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 dark:text-dark-text">{art.einheit}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                        {art.einzelpreis !== undefined && art.einzelpreis !== null 
                          ? `${art.einzelpreis.toFixed(2)} €` 
                          : <span className="text-gray-400 dark:text-gray-500 italic">Preis auf Anfrage</span>
                        }
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleBearbeiten(art)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Bearbeiten"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleLoeschen(art.$id!)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info-Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Hinweis:</strong> Die hier angelegten Artikel stehen bei der Angebotserstellung 
          zur Verfügung und können schnell ausgewählt werden.
        </p>
      </div>
    </div>
  );
};

export default ArtikelVerwaltungTab;
