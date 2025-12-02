import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ticketService } from '../../services/ticketService';
import { NeuesTicket, TicketPrioritaet } from '../../types/ticket';
import { MessageSquare, X } from 'lucide-react';

const VorschlagButton = () => {
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<NeuesTicket>({
    titel: '',
    beschreibung: '',
    prioritaet: 'normal',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Button nicht auf der Vorschläge-Seite anzeigen (dort gibt es bereits einen Button)
  if (location.pathname === '/vorschlaege') {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titel.trim() || !formData.beschreibung.trim()) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    setIsSubmitting(true);
    try {
      await ticketService.createTicket(formData);
      setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
      setShowForm(false);
      alert('Vorschlag erfolgreich angelegt!');
    } catch (error) {
      console.error('Fehler beim Erstellen des Tickets:', error);
      alert('Fehler beim Erstellen des Vorschlags.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-8 right-8 bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 z-50"
        title="Verbesserungsvorschlag anlegen"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-sm font-medium whitespace-nowrap">
          Vorschlag
        </span>
      </button>

      {/* Modal für neues Ticket */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  Verbesserungsvorschlag anlegen
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titel *
                  </label>
                  <input
                    type="text"
                    value={formData.titel}
                    onChange={(e) => setFormData({ ...formData, titel: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Kurze Beschreibung des Vorschlags"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beschreibung *
                  </label>
                  <textarea
                    value={formData.beschreibung}
                    onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={6}
                    placeholder="Detaillierte Beschreibung des Verbesserungsvorschlags..."
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priorität
                  </label>
                  <select
                    value={formData.prioritaet}
                    onChange={(e) => setFormData({ ...formData, prioritaet: e.target.value as TicketPrioritaet })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    disabled={isSubmitting}
                  >
                    <option value="niedrig">Niedrig</option>
                    <option value="normal">Normal</option>
                    <option value="hoch">Hoch</option>
                    <option value="kritisch">Kritisch</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Wird gespeichert...' : 'Vorschlag anlegen'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VorschlagButton;
