import { useState, useEffect } from 'react';
import { ticketService } from '../../services/ticketService';
import { Ticket, NeuesTicket, TicketStatus, TicketPrioritaet } from '../../types/ticket';
import { 
  Plus, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  MessageSquare,
  GripVertical,
  User,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// Drag & Drop State
interface DragState {
  draggedIndex: number | null;
  draggedOverIndex: number | null;
}

const VorschlaegeNeu = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<NeuesTicket>({
    titel: '',
    beschreibung: '',
    prioritaet: 'normal',
  });
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'alle'>('alle');
  const [prioritaetFilter, setPrioritaetFilter] = useState<TicketPrioritaet | 'alle'>('alle');
  const [dragState, setDragState] = useState<DragState>({
    draggedIndex: null,
    draggedOverIndex: null,
  });

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    filterTickets();
  }, [tickets, statusFilter, prioritaetFilter]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const loadedTickets = await ticketService.loadAlleTickets();
      // Sortiere nach sortIndex (höher = weiter oben) oder Erstellungsdatum
      loadedTickets.sort((a, b) => {
        const indexA = a.sortIndex ?? new Date(a.erstelltAm).getTime();
        const indexB = b.sortIndex ?? new Date(b.erstelltAm).getTime();
        return indexB - indexA;
      });
      setTickets(loadedTickets);
    } catch (error) {
      console.error('Fehler beim Laden der Tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterTickets = () => {
    let filtered = [...tickets];
    
    if (statusFilter !== 'alle') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }
    
    if (prioritaetFilter !== 'alle') {
      filtered = filtered.filter(t => t.prioritaet === prioritaetFilter);
    }
    
    setFilteredTickets(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titel.trim() || !formData.beschreibung.trim()) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    try {
      await ticketService.createTicket(formData, user?.$id, user?.name);
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
    if (!confirm('Möchten Sie diesen Vorschlag wirklich löschen?')) return;
    
    try {
      await ticketService.deleteTicket(id);
      loadTickets();
    } catch (error) {
      console.error('Fehler beim Löschen des Tickets:', error);
      alert('Fehler beim Löschen des Tickets.');
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (index: number) => {
    setDragState({ ...dragState, draggedIndex: index });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragState.draggedIndex === null) return;
    setDragState({ ...dragState, draggedOverIndex: index });
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragState.draggedIndex === null || dragState.draggedIndex === dropIndex) {
      setDragState({ draggedIndex: null, draggedOverIndex: null });
      return;
    }

    const newTickets = [...filteredTickets];
    const [draggedTicket] = newTickets.splice(dragState.draggedIndex, 1);
    newTickets.splice(dropIndex, 0, draggedTicket);

    // Aktualisiere sortIndex für alle betroffenen Tickets
    const now = Date.now();
    const updates = newTickets.map((ticket, index) => ({
      ...ticket,
      sortIndex: now + (newTickets.length - index) * 1000,
    }));

    setFilteredTickets(updates);
    setDragState({ draggedIndex: null, draggedOverIndex: null });

    // Speichere die neue Reihenfolge in Appwrite
    try {
      for (const ticket of updates) {
        await ticketService.updateTicket(ticket.id, { sortIndex: ticket.sortIndex });
      }
      loadTickets(); // Neu laden um sicherzugehen dass alles synchron ist
    } catch (error) {
      console.error('Fehler beim Speichern der Reihenfolge:', error);
    }
  };

  const handleDragEnd = () => {
    setDragState({ draggedIndex: null, draggedOverIndex: null });
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
      offen: 'bg-blue-100 text-blue-800 border-blue-200',
      in_bearbeitung: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      erledigt: 'bg-green-100 text-green-800 border-green-200',
      abgelehnt: 'bg-red-100 text-red-800 border-red-200',
    };
    const labels = {
      offen: 'Offen',
      in_bearbeitung: 'In Bearbeitung',
      erledigt: 'Erledigt',
      abgelehnt: 'Abgelehnt',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getPrioritaetBadge = (prioritaet: TicketPrioritaet) => {
    const styles = {
      niedrig: 'bg-gray-100 text-gray-800 border-gray-200',
      normal: 'bg-blue-100 text-blue-800 border-blue-200',
      hoch: 'bg-orange-100 text-orange-800 border-orange-200',
      kritisch: 'bg-red-100 text-red-800 border-red-200',
    };
    const icons = {
      niedrig: '↓',
      normal: '→',
      hoch: '↑',
      kritisch: '⚠',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[prioritaet]} flex items-center gap-1`}>
        <span>{icons[prioritaet]}</span>
        <span>{prioritaet.charAt(0).toUpperCase() + prioritaet.slice(1)}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Vorschläge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Verbesserungsvorschläge
              </h1>
              <p className="text-gray-600">
                {filteredTickets.length} {filteredTickets.length === 1 ? 'Vorschlag' : 'Vorschläge'}
                {(statusFilter !== 'alle' || prioritaetFilter !== 'alle') && ' (gefiltert)'}
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neuer Vorschlag
            </button>
          </div>

          {/* Filter */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'alle')}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="alle">Alle Status</option>
              <option value="offen">Offen</option>
              <option value="in_bearbeitung">In Bearbeitung</option>
              <option value="erledigt">Erledigt</option>
              <option value="abgelehnt">Abgelehnt</option>
            </select>
            <select
              value={prioritaetFilter}
              onChange={(e) => setPrioritaetFilter(e.target.value as TicketPrioritaet | 'alle')}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="alle">Alle Prioritäten</option>
              <option value="niedrig">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="hoch">Hoch</option>
              <option value="kritisch">Kritisch</option>
            </select>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ArrowUpDown className="w-4 h-4" />
              <span>Ziehen zum Umsortieren</span>
            </div>
          </div>
        </div>

        {/* Tickets Liste */}
        {filteredTickets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              {tickets.length === 0 
                ? 'Noch keine Vorschläge vorhanden.'
                : 'Keine Vorschläge mit den aktuellen Filtern gefunden.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredTickets.map((ticket, index) => (
              <div
                key={ticket.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-all cursor-move
                  ${dragState.draggedIndex === index ? 'opacity-50' : ''}
                  ${dragState.draggedOverIndex === index ? 'border-2 border-red-500' : 'border-2 border-transparent'}
                `}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Drag Handle */}
                    <div className="flex-shrink-0 mt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-6 h-6" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          {getStatusIcon(ticket.status)}
                          <h3 className="text-xl font-semibold text-gray-900">
                            {ticket.titel}
                          </h3>
                          {getStatusBadge(ticket.status)}
                          {getPrioritaetBadge(ticket.prioritaet)}
                        </div>
                      </div>

                      <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                        {ticket.beschreibung}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>
                            {new Date(ticket.erstelltAm).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {ticket.erstelltVon && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>von <strong>{ticket.erstelltVon}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <select
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(ticket.id, e.target.value as TicketStatus)}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                      >
                        <option value="offen">Offen</option>
                        <option value="in_bearbeitung">In Bearbeitung</option>
                        <option value="erledigt">Erledigt</option>
                        <option value="abgelehnt">Abgelehnt</option>
                      </select>
                      <button
                        onClick={() => handleDelete(ticket.id)}
                        className="text-red-600 hover:text-red-800 text-sm px-3 py-2 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal für neues Ticket */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Neuer Verbesserungsvorschlag
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
                    >
                      <option value="niedrig">Niedrig</option>
                      <option value="normal">Normal</option>
                      <option value="hoch">Hoch</option>
                      <option value="kritisch">Kritisch</option>
                    </select>
                  </div>
                  {user && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        Erstellt als: <strong>{user.name}</strong>
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormData({ titel: '', beschreibung: '', prioritaet: 'normal' });
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-md hover:from-red-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
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

export default VorschlaegeNeu;
