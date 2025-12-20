import { useState, useEffect } from 'react';
import { ticketService } from '../../services/ticketService';
import { Ticket, NeuesTicket, TicketStatus, TicketPrioritaet } from '../../types/ticket';
import { Plus, X, AlertCircle, CheckCircle, Clock, XCircle, MessageSquare, Copy, Check } from 'lucide-react';

const Vorschlaege = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<NeuesTicket>({
    titel: '',
    beschreibung: '',
    prioritaet: 'normal',
  });
  const [copiedItem, setCopiedItem] = useState<{ id: string; type: 'titel' | 'beschreibung' } | null>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const loadedTickets = await ticketService.loadAlleTickets();
      // Sortiere nach Erstellungsdatum (neueste zuerst)
      loadedTickets.sort((a, b) => 
        new Date(b.erstelltAm).getTime() - new Date(a.erstelltAm).getTime()
      );
      setTickets(loadedTickets);
    } catch (error) {
      console.error('Fehler beim Laden der Tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titel.trim()) {
      alert('Bitte füllen Sie den Titel aus.');
      return;
    }

    try {
      await ticketService.createTicket(formData);
      setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
      setShowForm(false);
      loadTickets();
    } catch (error) {
      console.error('Fehler beim Erstellen des Tickets:', error);
      alert('Fehler beim Erstellen des Tickets.');
    }
  };

  const handleStatusChange = async (id: string, neuerStatus: TicketStatus) => {
    try {
      await ticketService.updateTicket(id, { status: neuerStatus });
      loadTickets();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Tickets:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie dieses Ticket wirklich löschen?')) return;
    
    try {
      await ticketService.deleteTicket(id);
      loadTickets();
    } catch (error) {
      console.error('Fehler beim Löschen des Tickets:', error);
      alert('Fehler beim Löschen des Tickets.');
    }
  };

  const getStatusIcon = (status: TicketStatus) => {
    switch (status) {
      case 'offen':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'in_bearbeitung':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'erledigt':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'abgelehnt':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    const styles = {
      offen: 'bg-blue-100 text-blue-800',
      in_bearbeitung: 'bg-yellow-100 text-yellow-800',
      erledigt: 'bg-green-100 text-green-800',
      abgelehnt: 'bg-red-100 text-red-800',
    };
    const labels = {
      offen: 'Offen',
      in_bearbeitung: 'In Bearbeitung',
      erledigt: 'Erledigt',
      abgelehnt: 'Abgelehnt',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getPrioritaetBadge = (prioritaet: TicketPrioritaet) => {
    const styles = {
      niedrig: 'bg-gray-100 text-gray-800',
      normal: 'bg-blue-100 text-blue-800',
      hoch: 'bg-orange-100 text-orange-800',
      kritisch: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[prioritaet]}`}>
        {prioritaet.charAt(0).toUpperCase() + prioritaet.slice(1)}
      </span>
    );
  };

  const handleCopy = async (text: string, ticketId: string, type: 'titel' | 'beschreibung') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem({ id: ticketId, type });
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      console.error('Fehler beim Kopieren:', error);
      alert('Fehler beim Kopieren in die Zwischenablage.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Vorschläge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text mb-2">
            Verbesserungen
          </h1>
          <p className="text-gray-600 dark:text-dark-textMuted">
            Verbesserungen des Online-Tools
          </p>
        </div>

        {/* Tickets Liste */}
        {tickets.length === 0 ? (
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-8 text-center">
            <MessageSquare className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-dark-textMuted text-lg">Noch keine Vorschläge vorhanden.</p>
            <p className="text-gray-500 dark:text-dark-textMuted mt-2">Klicken Sie auf den Button unten rechts, um einen Vorschlag anzulegen.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white dark:bg-dark-surface rounded-lg shadow-md dark:shadow-dark-md p-6 hover:shadow-lg dark:shadow-dark-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(ticket.status)}
                      <div className="flex items-center gap-2 flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-dark-text">
                          {ticket.titel}
                        </h3>
                        <button
                          onClick={() => handleCopy(ticket.titel, ticket.id, 'titel')}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded transition-colors"
                          title="Titel kopieren"
                        >
                          {copiedItem?.id === ticket.id && copiedItem?.type === 'titel' ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          )}
                        </button>
                      </div>
                      {getStatusBadge(ticket.status)}
                      {getPrioritaetBadge(ticket.prioritaet)}
                    </div>
                    <div className="flex items-start gap-2 mb-4">
                      <p className="text-gray-700 dark:text-dark-textMuted whitespace-pre-wrap flex-1">
                        {ticket.beschreibung}
                      </p>
                      <button
                        onClick={() => handleCopy(ticket.beschreibung, ticket.id, 'beschreibung')}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded transition-colors flex-shrink-0 mt-1"
                        title="Beschreibung kopieren"
                      >
                        {copiedItem?.id === ticket.id && copiedItem?.type === 'beschreibung' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-textMuted">
                      <span>
                        Erstellt: {new Date(ticket.erstelltAm).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {ticket.erstelltVon && (
                        <span>von {ticket.erstelltVon}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <select
                      value={ticket.status}
                      onChange={(e) => handleStatusChange(ticket.id, e.target.value as TicketStatus)}
                      className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="offen">Offen</option>
                      <option value="in_bearbeitung">In Bearbeitung</option>
                      <option value="erledigt">Erledigt</option>
                      <option value="abgelehnt">Abgelehnt</option>
                    </select>
                    <button
                      onClick={() => handleDelete(ticket.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating Action Button - nur auf dieser Seite, da globaler Button im Layout ist */}
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-8 bg-red-600 hover:bg-red-700 text-white rounded-full p-4 shadow-lg dark:shadow-dark-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center w-16 h-16 z-40"
          title="Neuen Vorschlag anlegen"
        >
          <Plus className="w-8 h-8" />
        </button>

        {/* Modal für neues Ticket */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                    Neue Verbesserung
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
                    }}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                      Titel *
                    </label>
                    <input
                      type="text"
                      value={formData.titel}
                      onChange={(e) => setFormData({ ...formData, titel: e.target.value })}
                      className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Kurze Beschreibung des Vorschlags"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                      Beschreibung
                    </label>
                    <textarea
                      value={formData.beschreibung}
                      onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                      className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={6}
                      placeholder="Detaillierte Beschreibung der Verbesserung..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                      Priorität
                    </label>
                    <select
                      value={formData.prioritaet}
                      onChange={(e) => setFormData({ ...formData, prioritaet: e.target.value as TicketPrioritaet })}
                      className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-md text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      Vorschlag anlegen
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vorschlaege;





