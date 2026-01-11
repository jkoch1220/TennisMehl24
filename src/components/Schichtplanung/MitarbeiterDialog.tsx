import { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Briefcase, Clock } from 'lucide-react';
import { Mitarbeiter, MITARBEITER_FARBEN } from '../../types/schichtplanung';

interface MitarbeiterDialogProps {
  mitarbeiter: Mitarbeiter | null;
  onSave: (ma: Mitarbeiter) => void;
  onClose: () => void;
}

export default function MitarbeiterDialog({ mitarbeiter, onSave, onClose }: MitarbeiterDialogProps) {
  const [formData, setFormData] = useState({
    vorname: '',
    nachname: '',
    email: '',
    telefon: '',
    position: '',
    farbe: MITARBEITER_FARBEN[0],
    maxStundenProWoche: 40,
    notizen: '',
    istAktiv: true,
  });

  useEffect(() => {
    if (mitarbeiter) {
      setFormData({
        vorname: mitarbeiter.vorname,
        nachname: mitarbeiter.nachname,
        email: mitarbeiter.email || '',
        telefon: mitarbeiter.telefon || '',
        position: mitarbeiter.position || '',
        farbe: mitarbeiter.farbe,
        maxStundenProWoche: mitarbeiter.maxStundenProWoche,
        notizen: mitarbeiter.notizen || '',
        istAktiv: mitarbeiter.istAktiv,
      });
    }
  }, [mitarbeiter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vorname.trim() || !formData.nachname.trim()) return;

    const ma: Mitarbeiter = {
      id: mitarbeiter?.id || '',
      vorname: formData.vorname.trim(),
      nachname: formData.nachname.trim(),
      email: formData.email.trim() || undefined,
      telefon: formData.telefon.trim() || undefined,
      position: formData.position.trim() || undefined,
      farbe: formData.farbe,
      maxStundenProWoche: formData.maxStundenProWoche,
      notizen: formData.notizen.trim() || undefined,
      istAktiv: formData.istAktiv,
      erstelltAm: mitarbeiter?.erstelltAm || new Date().toISOString(),
      geaendertAm: new Date().toISOString(),
    };

    onSave(ma);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {mitarbeiter ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                <User className="w-4 h-4 text-gray-400" />
                Vorname *
              </label>
              <input
                type="text"
                value={formData.vorname}
                onChange={(e) => setFormData({ ...formData, vorname: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                placeholder="Max"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                Nachname *
              </label>
              <input
                type="text"
                value={formData.nachname}
                onChange={(e) => setFormData({ ...formData, nachname: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                placeholder="Mustermann"
                required
              />
            </div>
          </div>

          {/* Kontakt */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                <Mail className="w-4 h-4 text-gray-400" />
                E-Mail
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                placeholder="max@beispiel.de"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                <Phone className="w-4 h-4 text-gray-400" />
                Telefon
              </label>
              <input
                type="tel"
                value={formData.telefon}
                onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                placeholder="+49 123 456789"
              />
            </div>
          </div>

          {/* Position und Stunden */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                <Briefcase className="w-4 h-4 text-gray-400" />
                Position
              </label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                placeholder="z.B. Produktion"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                Max. Stunden/Woche
              </label>
              <input
                type="number"
                value={formData.maxStundenProWoche}
                onChange={(e) => setFormData({ ...formData, maxStundenProWoche: parseInt(e.target.value) || 40 })}
                min={1}
                max={168}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Farbe */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-dark-text mb-2 block">
              Farbe (für Kalender)
            </label>
            <div className="flex flex-wrap gap-2">
              {MITARBEITER_FARBEN.map((farbe) => (
                <button
                  key={farbe}
                  type="button"
                  onClick={() => setFormData({ ...formData, farbe })}
                  className={`w-8 h-8 rounded-full transition-all ${
                    formData.farbe === farbe
                      ? 'ring-2 ring-offset-2 ring-violet-500 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: farbe }}
                />
              ))}
            </div>
          </div>

          {/* Notizen */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5 block">
              Notizen
            </label>
            <textarea
              value={formData.notizen}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              placeholder="Optionale Bemerkungen..."
            />
          </div>

          {/* Aktiv Checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="istAktiv"
              checked={formData.istAktiv}
              onChange={(e) => setFormData({ ...formData, istAktiv: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <label htmlFor="istAktiv" className="text-sm text-gray-700 dark:text-dark-text">
              Mitarbeiter ist aktiv (wird in der Liste angezeigt)
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
          >
            {mitarbeiter ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
