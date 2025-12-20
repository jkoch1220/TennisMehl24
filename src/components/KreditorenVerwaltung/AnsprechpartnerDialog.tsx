import { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Briefcase, Save } from 'lucide-react';
import { Ansprechpartner } from '../../types/kreditor';
import { ID } from 'appwrite';

interface AnsprechpartnerDialogProps {
  ansprechpartner?: Ansprechpartner | null; // Wenn vorhanden, wird bearbeitet
  onSave: (ansprechpartner: Ansprechpartner) => void;
  onClose: () => void;
}

const AnsprechpartnerDialog = ({ ansprechpartner, onSave, onClose }: AnsprechpartnerDialogProps) => {
  const [name, setName] = useState('');
  const [titel, setTitel] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ansprechpartner) {
      setName(ansprechpartner.name || '');
      setTitel(ansprechpartner.titel || '');
      setEmail(ansprechpartner.email || '');
      setTelefon(ansprechpartner.telefon || '');
    } else {
      // Reset für neuen Ansprechpartner
      setName('');
      setTitel('');
      setEmail('');
      setTelefon('');
    }
    setErrors({});
  }, [ansprechpartner]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name ist erforderlich';
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Ungültige E-Mail-Adresse';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      return;
    }

    const ansprechpartnerData: Ansprechpartner = {
      id: ansprechpartner?.id || ID.unique(),
      name: name.trim(),
      titel: titel.trim() || undefined,
      email: email.trim() || undefined,
      telefon: telefon.trim() || undefined,
      erstelltAm: ansprechpartner?.erstelltAm || new Date().toISOString(),
    };

    onSave(ansprechpartnerData);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white dark:bg-slate-800/20 rounded-lg p-2">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {ansprechpartner ? 'Ansprechpartner bearbeiten' : 'Ansprechpartner anlegen'}
                </h2>
                <p className="text-blue-100 text-sm mt-0.5">
                  {ansprechpartner ? 'Daten des Ansprechpartners aktualisieren' : 'Neuen Ansprechpartner hinzufügen'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white dark:bg-slate-800/10 rounded-lg p-2 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-400 mb-2 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              placeholder="z.B. Max Mustermann"
              className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.name ? 'border-red-300 bg-red-50 dark:bg-red-900/30' : 'border-gray-300 dark:border-slate-600 dark:bg-slate-800'
              }`}
              autoFocus
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <span>⚠️</span> {errors.name}
              </p>
            )}
          </div>

          {/* Titel */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-400 mb-2 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              Titel
            </label>
            <input
              type="text"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z.B. Herr, Frau, Dr., Geschäftsführer"
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="text-gray-500 dark:text-slate-400 text-xs mt-1">Optional: Anrede oder Position</p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-400 mb-2 flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              placeholder="z.B. max.mustermann@example.com"
              className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <span>⚠️</span> {errors.email}
              </p>
            )}
            {!errors.email && (
              <p className="text-gray-500 dark:text-slate-400 text-xs mt-1">Optional: E-Mail-Adresse</p>
            )}
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-400 mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              Telefonnummer
            </label>
            <input
              type="tel"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="z.B. 0171 1234567"
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="text-gray-500 dark:text-slate-400 text-xs mt-1">Optional: Telefonnummer</p>
          </div>

          {/* Keyboard Shortcuts Hinweis */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg p-3 mt-4">
            <div className="text-xs text-blue-700 dark:text-blue-300">
              <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs font-mono">Ctrl/Cmd + Enter</kbd> zum Speichern • <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs font-mono">Esc</kbd> zum Abbrechen
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 dark:text-slate-400 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 dark:bg-slate-800 font-medium transition-all"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-medium transition-all flex items-center gap-2 shadow-lg dark:shadow-slate-900/50 hover:shadow-xl"
          >
            <Save className="w-4 h-4" />
            {ansprechpartner ? 'Aktualisieren' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnsprechpartnerDialog;

