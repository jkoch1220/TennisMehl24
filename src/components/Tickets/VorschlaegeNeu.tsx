import { useState, useEffect, useRef } from 'react';
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
  ArrowUpDown,
  Copy,
  Check,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PartyCanvas from './PartyCanvas';

// Drag & Drop State
interface DragState {
  draggedIndex: number | null;
  draggedOverIndex: number | null;
}

type TabType = 'offen' | 'erledigt';

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
  const [activeTab, setActiveTab] = useState<TabType>('offen');
  const [prioritaetFilter, setPrioritaetFilter] = useState<TicketPrioritaet | 'alle'>('alle');
  const [dragState, setDragState] = useState<DragState>({
    draggedIndex: null,
    draggedOverIndex: null,
  });
  const [copiedItem, setCopiedItem] = useState<{ id: string; type: 'titel' | 'beschreibung' } | null>(null);
  const [partyTrigger, setPartyTrigger] = useState(false);
  const [partyPosition, setPartyPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [checkingTicketId, setCheckingTicketId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [removingTicketIds, setRemovingTicketIds] = useState<Set<string>>(new Set());
  const [deletingTicketIds, setDeletingTicketIds] = useState<Set<string>>(new Set());

  // ULTRA-BEFRIEDIGENDER Sound-Effekt für Abhaken
  useEffect(() => {
    const playSuccessSound = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const baseTime = audioContext.currentTime;

        // PHASE 1: "KATSCHING" - Explosiver Aufstieg
        const katschingFrequencies = [
          { freq: 523.25, time: 0, duration: 0.15 },   // C5
          { freq: 659.25, time: 0.05, duration: 0.15 }, // E5
          { freq: 783.99, time: 0.1, duration: 0.15 },  // G5
          { freq: 1046.50, time: 0.15, duration: 0.2 },  // C6
          { freq: 1318.51, time: 0.2, duration: 0.2 }   // E6
        ];

        katschingFrequencies.forEach(({ freq, time, duration }) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          
          osc.frequency.value = freq;
          osc.type = 'sine';
          
          // Explosiver Attack
          gain.gain.setValueAtTime(0, baseTime + time);
          gain.gain.linearRampToValueAtTime(0.5, baseTime + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.01, baseTime + time + duration);
          
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          osc.start(baseTime + time);
          osc.stop(baseTime + time + duration);
        });

        // PHASE 2: "DOLLA" - Tiefer, befriedigender Bass
        setTimeout(() => {
          const bassFreqs = [261.63, 329.63, 392.00]; // C4, E4, G4
          bassFreqs.forEach((freq, index) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.frequency.value = freq;
            osc.type = 'sine';
            
            const startTime = audioContext.currentTime + (index * 0.08);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.6, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start(startTime);
            osc.stop(startTime + 0.4);
          });
        }, 250);

        // PHASE 3: "GELD" - Glitzernde Höhen
        setTimeout(() => {
          const sparkleFreqs = [1046.50, 1318.51, 1567.98, 1760.00]; // C6, E6, G6, A6
          sparkleFreqs.forEach((freq, index) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.frequency.value = freq;
            osc.type = 'triangle'; // Weicherer Klang
            
            const startTime = audioContext.currentTime + (index * 0.06);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.4, startTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start(startTime);
            osc.stop(startTime + 0.25);
          });
        }, 500);

        // PHASE 4: Finale - Großer Akkord
        setTimeout(() => {
          const finaleFreqs = [
            { freq: 261.63, vol: 0.4 }, // C4
            { freq: 329.63, vol: 0.35 }, // E4
            { freq: 392.00, vol: 0.35 }, // G4
            { freq: 523.25, vol: 0.3 },  // C5
            { freq: 659.25, vol: 0.25 }  // E5
          ];
          
          finaleFreqs.forEach(({ freq, vol }) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.frequency.value = freq;
            osc.type = 'sine';
            
            const startTime = audioContext.currentTime;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.8);
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start(startTime);
            osc.stop(startTime + 0.8);
          });
        }, 700);

        // PHASE 5: Applaus-Effekt (weißes Rauschen mit Modulation)
        setTimeout(() => {
          const noise = audioContext.createBufferSource();
          const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
          const data = buffer.getChannelData(0);
          
          for (let i = 0; i < buffer.length; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          
          noise.buffer = buffer;
          const gain = audioContext.createGain();
          const filter = audioContext.createBiquadFilter();
          
          filter.type = 'bandpass';
          filter.frequency.value = 2000;
          filter.Q.value = 1;
          
          gain.gain.setValueAtTime(0, audioContext.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(audioContext.destination);
          
          noise.start();
          noise.stop(audioContext.currentTime + 0.3);
        }, 1000);

      } catch (error) {
        console.log('Audio nicht verfügbar:', error);
      }
    };

    if (partyTrigger) {
      playSuccessSound();
    }
  }, [partyTrigger]);

  // Schließe Menü wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Prüfe ob Klick außerhalb aller Menüs war
      const menuElements = document.querySelectorAll('[data-menu-container]');
      let clickedOutside = true;
      menuElements.forEach((el) => {
        if (el.contains(target)) {
          clickedOutside = false;
        }
      });
      if (clickedOutside) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    filterTickets();
  }, [tickets, activeTab, prioritaetFilter, removingTicketIds, deletingTicketIds]);

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
    
    // Entferne Tickets die gerade gelöscht werden
    filtered = filtered.filter(t => !deletingTicketIds.has(t.id));
    
    // Tab-Filter
    if (activeTab === 'offen') {
      // Im "Offen"-Tab: zeige nur nicht-erledigte UND nicht-entfernende Tickets
      filtered = filtered.filter(t => t.status !== 'erledigt' && !removingTicketIds.has(t.id));
    } else if (activeTab === 'erledigt') {
      filtered = filtered.filter(t => t.status === 'erledigt');
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

  const handleCheck = async (id: string, buttonElement?: HTMLElement) => {
    // Verhindere mehrfaches Klicken während Animation
    if (checkingTicketId || partyTrigger || removingTicketIds.has(id)) return;
    
    setCheckingTicketId(id);
    
    // Position des Buttons für die Animation erfassen
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      setPartyPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
    
    // Optimistisches Update: Ticket sofort lokal aktualisieren
    const ticketToUpdate = tickets.find(t => t.id === id);
    if (ticketToUpdate) {
      const updatedTicket: Ticket = {
        ...ticketToUpdate,
        status: 'erledigt',
        erledigtAm: new Date().toISOString(),
        geaendertAm: new Date().toISOString(),
      };
      
      // Aktualisiere lokale Liste
      setTickets(prev => prev.map(t => t.id === id ? updatedTicket : t));
    }
    
    // Markiere Ticket als "wird entfernt" für Exit-Animation
    setRemovingTicketIds(prev => new Set(prev).add(id));
    
    // Party-Effekt triggern
    setPartyTrigger(true);
    
    // Exit-Animation abwarten, dann Ticket aus Liste entfernen
    setTimeout(() => {
      setRemovingTicketIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setCheckingTicketId(null);
      
      // Im Hintergrund Server-Update durchführen
      ticketService.updateTicket(id, { 
        status: 'erledigt',
        erledigtAm: new Date().toISOString()
      }).catch(error => {
        console.error('Fehler beim Aktualisieren des Tickets:', error);
        // Bei Fehler: Ticket wiederherstellen
        loadTickets();
      });
    }, 600); // Exit-Animation dauert 600ms
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Vorschlag wirklich löschen?')) return;
    
    setOpenMenuId(null);
    
    // Markiere Ticket als "wird gelöscht" für Exit-Animation
    setDeletingTicketIds(prev => new Set(prev).add(id));
    
    // Optimistisches Update: Ticket sofort aus lokaler Liste entfernen
    setTimeout(() => {
      setTickets(prev => prev.filter(t => t.id !== id));
      setDeletingTicketIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      
      // Im Hintergrund Server-Delete durchführen
      ticketService.deleteTicket(id).catch(error => {
        console.error('Fehler beim Löschen des Tickets:', error);
        alert('Fehler beim Löschen des Tickets.');
        // Bei Fehler: Liste neu laden
        loadTickets();
      });
    }, 400); // Exit-Animation dauert 400ms
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
      loadTickets();
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

  // Prüfe ob Ticket heute erledigt wurde
  const isTodayCompleted = (ticket: Ticket): boolean => {
    if (!ticket.erledigtAm) return false;
    const today = new Date();
    const completedDate = new Date(ticket.erledigtAm);
    return (
      today.getDate() === completedDate.getDate() &&
      today.getMonth() === completedDate.getMonth() &&
      today.getFullYear() === completedDate.getFullYear()
    );
  };

  // Trenne erledigte Tickets in "Heute" und "Älter"
  const getCompletedTickets = () => {
    const todayCompleted = filteredTickets.filter(isTodayCompleted);
    const olderCompleted = filteredTickets.filter(t => !isTodayCompleted(t));
    return { todayCompleted, olderCompleted };
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

  const { todayCompleted, olderCompleted } = activeTab === 'erledigt' ? getCompletedTickets() : { todayCompleted: [], olderCompleted: [] };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <PartyCanvas 
        trigger={partyTrigger} 
        onComplete={() => {
          setPartyTrigger(false);
          setPartyPosition(undefined);
        }}
        position={partyPosition}
      />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Verbesserungen
              </h1>
              <p className="text-gray-600">
                {activeTab === 'offen' 
                  ? `${filteredTickets.length} ${filteredTickets.length === 1 ? 'offener Vorschlag' : 'offene Vorschläge'}`
                  : `${filteredTickets.length} ${filteredTickets.length === 1 ? 'erledigter Vorschlag' : 'erledigte Vorschläge'}`
                }
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

          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('offen')}
              className={`px-6 py-3 font-semibold transition-all relative ${
                activeTab === 'offen'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Offen
              {activeTab === 'offen' && filteredTickets.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">
                  {filteredTickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('erledigt')}
              className={`px-6 py-3 font-semibold transition-all relative ${
                activeTab === 'erledigt'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Erledigt
              {activeTab === 'erledigt' && filteredTickets.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                  {filteredTickets.length}
                </span>
              )}
            </button>
          </div>

          {/* Filter */}
          {activeTab === 'offen' && (
            <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filter:</span>
              </div>
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
          )}
        </div>

        {/* Tickets Liste */}
        {activeTab === 'offen' ? (
          filteredTickets.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">
                {tickets.length === 0 
                  ? 'Noch keine Vorschläge vorhanden.'
                  : 'Keine offenen Vorschläge gefunden.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredTickets.map((ticket, index) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  index={index}
                  dragState={dragState}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onCheck={handleCheck}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                  copiedItem={copiedItem}
                  checkingTicketId={checkingTicketId}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  isRemoving={removingTicketIds.has(ticket.id)}
                  getStatusIcon={getStatusIcon}
                  getStatusBadge={getStatusBadge}
                  getPrioritaetBadge={getPrioritaetBadge}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-6">
            {/* Heute erledigt Bereich */}
            {todayCompleted.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🎉</span>
                  Heute erledigt
                </h2>
                <div className="grid gap-3">
                  {todayCompleted.map((ticket) => (
                    <CompletedTicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onDelete={handleDelete}
                      onCopy={handleCopy}
                      copiedItem={copiedItem}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      isDeleting={deletingTicketIds.has(ticket.id)}
                      getStatusBadge={getStatusBadge}
                      getPrioritaetBadge={getPrioritaetBadge}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ältere erledigte Tasks */}
            {olderCompleted.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Ältere erledigte Tasks</h2>
                <div className="grid gap-3">
                  {olderCompleted.map((ticket) => (
                    <CompletedTicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onDelete={handleDelete}
                      onCopy={handleCopy}
                      copiedItem={copiedItem}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      isDeleting={deletingTicketIds.has(ticket.id)}
                      getStatusBadge={getStatusBadge}
                      getPrioritaetBadge={getPrioritaetBadge}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredTickets.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <CheckCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Noch keine erledigten Vorschläge.</p>
              </div>
            )}
          </div>
        )}

        {/* Modal für neues Ticket */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Neue Verbesserung
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
                      placeholder="Detaillierte Beschreibung der Verbesserung..."
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

// Ticket Card Komponente für offene Tickets
interface TicketCardProps {
  ticket: Ticket;
  index: number;
  dragState: DragState;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onCheck: (id: string, buttonElement?: HTMLElement) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, ticketId: string, type: 'titel' | 'beschreibung') => void;
  copiedItem: { id: string; type: 'titel' | 'beschreibung' } | null;
  checkingTicketId: string | null;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  isRemoving: boolean;
  getStatusIcon: (status: TicketStatus) => JSX.Element;
  getStatusBadge: (status: TicketStatus) => JSX.Element;
  getPrioritaetBadge: (prioritaet: TicketPrioritaet) => JSX.Element;
}

const TicketCard = ({
  ticket,
  index,
  dragState,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onCheck,
  onDelete,
  onCopy,
  copiedItem,
  checkingTicketId,
  openMenuId,
  setOpenMenuId,
  isRemoving,
  getStatusIcon,
  getStatusBadge,
  getPrioritaetBadge,
}: TicketCardProps) => {
  const isChecking = checkingTicketId === ticket.id;
  const checkButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div
      draggable={!isRemoving}
      onDragStart={() => !isRemoving && onDragStart(index)}
      onDragOver={(e) => !isRemoving && onDragOver(e, index)}
      onDrop={(e) => !isRemoving && onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-500 cursor-move
        ${dragState.draggedIndex === index ? 'opacity-50' : ''}
        ${dragState.draggedOverIndex === index ? 'border-2 border-red-500' : 'border-2 border-transparent'}
        ${isRemoving ? 'opacity-0 scale-95 -translate-y-4 pointer-events-none' : 'opacity-100 scale-100 translate-y-0'}
      `}
      style={{
        transition: isRemoving ? 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
      }}
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
              <div className="flex items-center gap-3 flex-wrap flex-1">
                {getStatusIcon(ticket.status)}
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {ticket.titel}
                  </h3>
                  <button
                    onClick={() => onCopy(ticket.titel, ticket.id, 'titel')}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title="Titel kopieren"
                  >
                    {copiedItem?.id === ticket.id && copiedItem?.type === 'titel' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {getStatusBadge(ticket.status)}
                {getPrioritaetBadge(ticket.prioritaet)}
              </div>
              
              {/* Drei-Punkte-Menü */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setOpenMenuId(openMenuId === ticket.id ? null : ticket.id)}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  title="Mehr Optionen"
                >
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
                {openMenuId === ticket.id && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[150px]">
                    <button
                      onClick={() => onDelete(ticket.id)}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Löschen
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 mb-4">
              <p className="text-gray-700 whitespace-pre-wrap flex-1">
                {ticket.beschreibung}
              </p>
              <button
                onClick={() => onCopy(ticket.beschreibung, ticket.id, 'beschreibung')}
                className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0 mt-1"
                title="Beschreibung kopieren"
              >
                {copiedItem?.id === ticket.id && copiedItem?.type === 'beschreibung' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>

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

          {/* Abhaken Button - ULTRA BEFRIEDIGEND! 💰🎉✨ */}
          <div className="flex-shrink-0">
            <button
              ref={checkButtonRef}
              onClick={(e) => onCheck(ticket.id, e.currentTarget)}
              disabled={isChecking}
              className={`
                relative w-20 h-20 rounded-full border-4 transition-all duration-500 ease-out
                ${isChecking
                  ? 'border-green-500 bg-gradient-to-br from-green-100 to-green-200 scale-125 shadow-2xl shadow-green-400/50'
                  : 'border-gray-300 bg-white hover:border-green-400 hover:bg-gradient-to-br hover:from-green-50 hover:to-green-100 hover:scale-110 hover:shadow-xl hover:shadow-green-200'
                }
                flex items-center justify-center
                ${isChecking ? 'animate-pulse ring-4 ring-green-300 ring-opacity-50' : ''}
                transform-gpu
                active:scale-95
              `}
              title="Als erledigt markieren - KATSCHING DOLLA GELD! 💰"
            >
              {isChecking ? (
                <>
                  <CheckCircle className="w-10 h-10 text-green-600 animate-bounce drop-shadow-lg z-10 relative" />
                  <div className="absolute inset-0 rounded-full bg-green-400 opacity-30 animate-ping"></div>
                  <div className="absolute inset-0 rounded-full bg-green-300 opacity-20 animate-pulse"></div>
                </>
              ) : (
                <div className="w-10 h-10 border-3 border-gray-400 rounded-full hover:border-green-400 transition-all duration-300 group-hover:scale-110"></div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Completed Ticket Card Komponente
interface CompletedTicketCardProps {
  ticket: Ticket;
  onDelete: (id: string) => void;
  onCopy: (text: string, ticketId: string, type: 'titel' | 'beschreibung') => void;
  copiedItem: { id: string; type: 'titel' | 'beschreibung' } | null;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  isDeleting: boolean;
  getStatusBadge: (status: TicketStatus) => JSX.Element;
  getPrioritaetBadge: (prioritaet: TicketPrioritaet) => JSX.Element;
}

const CompletedTicketCard = ({
  ticket,
  onDelete,
  onCopy,
  copiedItem,
  openMenuId,
  setOpenMenuId,
  isDeleting,
  getStatusBadge,
  getPrioritaetBadge,
}: CompletedTicketCardProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div 
      className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-400 border-2 border-transparent
        ${isDeleting ? 'opacity-0 scale-90 -translate-y-2 pointer-events-none' : 'opacity-75 hover:opacity-100'}
      `}
      style={{
        transition: isDeleting ? 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
      }}
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3 flex-wrap flex-1">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-gray-900 line-through">
                    {ticket.titel}
                  </h3>
                  <button
                    onClick={() => onCopy(ticket.titel, ticket.id, 'titel')}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title="Titel kopieren"
                  >
                    {copiedItem?.id === ticket.id && copiedItem?.type === 'titel' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {getStatusBadge(ticket.status)}
                {getPrioritaetBadge(ticket.prioritaet)}
              </div>
              
              {/* Drei-Punkte-Menü */}
              <div className="relative" ref={menuRef} data-menu-container>
                <button
                  onClick={() => setOpenMenuId(openMenuId === ticket.id ? null : ticket.id)}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  title="Mehr Optionen"
                >
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
                {openMenuId === ticket.id && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]">
                    <button
                      onClick={() => onDelete(ticket.id)}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Löschen
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 mb-4">
              <p className="text-gray-600 whitespace-pre-wrap flex-1 line-through">
                {ticket.beschreibung}
              </p>
              <button
                onClick={() => onCopy(ticket.beschreibung, ticket.id, 'beschreibung')}
                className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0 mt-1"
                title="Beschreibung kopieren"
              >
                {copiedItem?.id === ticket.id && copiedItem?.type === 'beschreibung' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>
                  Erledigt: {ticket.erledigtAm 
                    ? new Date(ticket.erledigtAm).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Unbekannt'}
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
        </div>
      </div>
    </div>
  );
};

export default VorschlaegeNeu;
