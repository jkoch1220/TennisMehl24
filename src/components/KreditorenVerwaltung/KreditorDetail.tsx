import { useState, useEffect } from 'react';
import { 
  X, 
  ArrowLeft,
  User, 
  Mail, 
  Phone, 
  Building2,
  Edit,
  Trash2,
  Plus,
  Copy,
  Check,
  Briefcase
} from 'lucide-react';
import { Kreditor, Ansprechpartner } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import AnsprechpartnerDialog from './AnsprechpartnerDialog';

interface KreditorDetailProps {
  kreditor: Kreditor;
  onClose: () => void;
  onUpdate: () => void;
}

const KreditorDetail = ({ kreditor: initialKreditor, onClose, onUpdate }: KreditorDetailProps) => {
  const [kreditor, setKreditor] = useState<Kreditor>(initialKreditor);
  const [loading, setLoading] = useState(false);
  const [showAnsprechpartnerDialog, setShowAnsprechpartnerDialog] = useState(false);
  const [editingAnsprechpartner, setEditingAnsprechpartner] = useState<Ansprechpartner | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    loadKreditor();
  }, [initialKreditor.id]);

  const loadKreditor = async () => {
    setLoading(true);
    try {
      const loaded = await kreditorService.loadKreditor(initialKreditor.id);
      if (loaded) {
        setKreditor(loaded);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kreditors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnsprechpartner = () => {
    setEditingAnsprechpartner(null);
    setShowAnsprechpartnerDialog(true);
  };

  const handleEditAnsprechpartner = (ansprechpartner: Ansprechpartner) => {
    setEditingAnsprechpartner(ansprechpartner);
    setShowAnsprechpartnerDialog(true);
  };

  const handleSaveAnsprechpartner = async (ansprechpartner: Ansprechpartner) => {
    try {
      const aktuelleAnsprechpartner = kreditor.ansprechpartner || [];
      let neueAnsprechpartner: Ansprechpartner[];

      if (editingAnsprechpartner) {
        // Bearbeiten: Ersetze den bestehenden
        neueAnsprechpartner = aktuelleAnsprechpartner.map(ap =>
          ap.id === ansprechpartner.id ? ansprechpartner : ap
        );
      } else {
        // Neu: Füge hinzu
        neueAnsprechpartner = [...aktuelleAnsprechpartner, ansprechpartner];
      }

      await kreditorService.updateKreditor(kreditor.id, {
        ansprechpartner: neueAnsprechpartner,
      });

      // Aktualisiere lokalen State
      setKreditor({
        ...kreditor,
        ansprechpartner: neueAnsprechpartner,
      });

      setShowAnsprechpartnerDialog(false);
      setEditingAnsprechpartner(null);
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Speichern des Ansprechpartners:', error);
      alert('Fehler beim Speichern des Ansprechpartners');
    }
  };

  const handleDeleteAnsprechpartner = async (ansprechpartnerId: string) => {
    if (!confirm('Möchten Sie diesen Ansprechpartner wirklich löschen?')) {
      return;
    }

    try {
      const aktuelleAnsprechpartner = kreditor.ansprechpartner || [];
      const neueAnsprechpartner = aktuelleAnsprechpartner.filter(ap => ap.id !== ansprechpartnerId);

      await kreditorService.updateKreditor(kreditor.id, {
        ansprechpartner: neueAnsprechpartner,
      });

      setKreditor({
        ...kreditor,
        ansprechpartner: neueAnsprechpartner,
      });

      onUpdate();
    } catch (error) {
      console.error('Fehler beim Löschen des Ansprechpartners:', error);
      alert('Fehler beim Löschen des Ansprechpartners');
    }
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Fehler beim Kopieren:', error);
    }
  };

  const ansprechpartner = kreditor.ansprechpartner || [];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-lg p-2">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{kreditor.name}</h2>
                  {kreditor.kreditorennummer && (
                    <p className="text-white/80 text-sm">
                      Kreditorennummer: {kreditor.kreditorennummer}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Kreditor-Informationen */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Kreditor-Informationen
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {kreditor.kontakt?.adresse && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Adresse</p>
                      <p className="text-sm font-medium text-gray-900">
                        {[
                          kreditor.kontakt.adresse.strasse,
                          kreditor.kontakt.adresse.plz,
                          kreditor.kontakt.adresse.ort
                        ].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                  {(kreditor.telefon || kreditor.kontakt?.telefon) && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Telefon (Legacy)</p>
                      <p className="text-sm font-medium text-gray-900">
                        {kreditor.telefon || kreditor.kontakt?.telefon}
                      </p>
                    </div>
                  )}
                  {kreditor.kontakt?.email && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">E-Mail (Legacy)</p>
                      <p className="text-sm font-medium text-gray-900">
                        {kreditor.kontakt.email}
                      </p>
                    </div>
                  )}
                  {kreditor.notizen && (
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Notizen</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {kreditor.notizen}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Ansprechpartner-Bereich */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Ansprechpartner
                    {ansprechpartner.length > 0 && (
                      <span className="ml-2 px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {ansprechpartner.length}
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={handleAddAnsprechpartner}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all flex items-center gap-2 font-medium shadow-lg hover:shadow-xl"
                  >
                    <Plus className="w-4 h-4" />
                    Ansprechpartner anlegen
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Lade Ansprechpartner...</p>
                  </div>
                ) : ansprechpartner.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium mb-1">Noch keine Ansprechpartner</p>
                    <p className="text-sm text-gray-500 mb-4">
                      Fügen Sie Ansprechpartner hinzu, um Kontakte zu verwalten
                    </p>
                    <button
                      onClick={handleAddAnsprechpartner}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Ersten Ansprechpartner anlegen
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {ansprechpartner.map((ap, index) => (
                      <div
                        key={ap.id}
                        className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-lg transition-all group"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="bg-blue-100 rounded-full p-2">
                                <User className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                {ap.titel && (
                                  <span className="text-xs text-gray-500">{ap.titel}</span>
                                )}
                                <h4 className="font-semibold text-gray-900 text-lg">
                                  {ap.name}
                                </h4>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditAnsprechpartner(ap)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteAnsprechpartner(ap.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {ap.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <a
                                href={`mailto:${ap.email}`}
                                className="flex-1 hover:text-blue-600 transition-colors truncate"
                              >
                                {ap.email}
                              </a>
                              <button
                                onClick={() => handleCopy(ap.email!, index * 10 + 1)}
                                className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                title="Kopieren"
                              >
                                {copiedIndex === index * 10 + 1 ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                          {ap.telefon && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <a
                                href={`tel:${ap.telefon}`}
                                className="flex-1 hover:text-blue-600 transition-colors"
                              >
                                {ap.telefon}
                              </a>
                              <button
                                onClick={() => handleCopy(ap.telefon!, index * 10 + 2)}
                                className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                title="Kopieren"
                              >
                                {copiedIndex === index * 10 + 2 ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                          {!ap.email && !ap.telefon && (
                            <p className="text-xs text-gray-400 italic">
                              Keine Kontaktdaten vorhanden
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ansprechpartner Dialog */}
      {showAnsprechpartnerDialog && (
        <AnsprechpartnerDialog
          ansprechpartner={editingAnsprechpartner}
          onSave={handleSaveAnsprechpartner}
          onClose={() => {
            setShowAnsprechpartnerDialog(false);
            setEditingAnsprechpartner(null);
          }}
        />
      )}
    </>
  );
};

export default KreditorDetail;
