import { useState, useEffect, useRef, useCallback } from 'react';
import { todoService } from '../../services/todoService';
import { Todo, NeuesTodo, TodoStatus, Bearbeiter } from '../../types/todo';
import { Plus, X, Calendar, User, LayoutGrid, List, Filter, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CheckSquare } from 'lucide-react';

const Todos = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TodoStatus | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{
    status: TodoStatus[];
    prioritaet: string[];
    bearbeiter: (Bearbeiter | 'keiner')[];
    faelligkeitsdatum: 'alle' | 'ueberfaellig' | 'heute' | 'diese_woche' | 'diesen_monat';
    suche: string;
  }>({
    status: [],
    prioritaet: [],
    bearbeiter: [],
    faelligkeitsdatum: 'alle',
    suche: '',
  });
  const [formData, setFormData] = useState<NeuesTodo>({
    titel: '',
    beschreibung: '',
    status: 'todo',
    bearbeiter: undefined,
    prioritaet: 'normal',
  });

  // Mobile-spezifische States
  const [mobileActiveTab, setMobileActiveTab] = useState<TodoStatus>('todo');
  const [swipeState, setSwipeState] = useState<{
    todoId: string | null;
    startX: number;
    currentX: number;
    direction: 'left' | 'right' | null;
  }>({ todoId: null, startX: 0, currentX: 0, direction: null });
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const statusSpalten: { status: TodoStatus; label: string; color: string; mobileColor: string }[] = [
    { status: 'todo', label: 'TODO', color: 'bg-gray-100', mobileColor: 'bg-gray-500' },
    { status: 'in_arbeit', label: 'In Arbeit', color: 'bg-blue-100', mobileColor: 'bg-blue-500' },
    { status: 'review', label: 'Review', color: 'bg-yellow-100', mobileColor: 'bg-yellow-500' },
    { status: 'done', label: 'Done', color: 'bg-green-100', mobileColor: 'bg-green-500' },
  ];

  const bearbeiter: Bearbeiter[] = ['Luca', 'Juan', 'Julian'];

  useEffect(() => {
    loadTodos();
  }, []);

  const loadTodos = async () => {
    setLoading(true);
    try {
      const loadedTodos = await todoService.loadAlleTodos();
      setTodos(loadedTodos);
    } catch (error) {
      console.error('Fehler beim Laden der TODOs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titel.trim()) {
      alert('Bitte geben Sie einen Titel ein.');
      return;
    }

    try {
      await todoService.createTodo(formData);
      setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
      setShowForm(false);
      loadTodos();
    } catch (error) {
      console.error('Fehler beim Erstellen des TODOs:', error);
      alert('Fehler beim Erstellen des TODOs.');
    }
  };

  const handleStatusChange = async (id: string, neuerStatus: TodoStatus) => {
    // Speichere den alten Status für möglichen Rollback
    const alterTodo = todos.find(t => t.id === id);
    if (!alterTodo) return;
    
    // Optimistic Update - sofortige UI-Aktualisierung
    setTodos(prevTodos => 
      prevTodos.map(todo => 
        todo.id === id ? { ...todo, status: neuerStatus } : todo
      )
    );
    
    try {
      await todoService.moveTodo(id, neuerStatus);
      // Erfolgreich - kein Reload nötig, Optimistic Update bleibt bestehen
    } catch (error) {
      console.error('Fehler beim Verschieben des TODOs:', error);
      // Bei Fehler: Rollback des Optimistic Updates
      setTodos(prevTodos => 
        prevTodos.map(todo => 
          todo.id === id ? alterTodo : todo
        )
      );
      alert('Fehler beim Verschieben des TODOs. Bitte versuchen Sie es erneut.');
    }
  };

  const handleBearbeiterChange = async (id: string, neuerBearbeiter: Bearbeiter | undefined) => {
    try {
      await todoService.updateTodo(id, { bearbeiter: neuerBearbeiter });
      loadTodos();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Bearbeiters:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie dieses TODO wirklich löschen?')) return;
    
    try {
      await todoService.deleteTodo(id);
      loadTodos();
    } catch (error) {
      console.error('Fehler beim Löschen des TODOs:', error);
      alert('Fehler beim Löschen des TODOs.');
    }
  };

  // Filter-Funktion
  const getFilteredTodos = (): Todo[] => {
    return todos.filter(todo => {
      // Status-Filter
      if (filters.status.length > 0 && !filters.status.includes(todo.status)) {
        return false;
      }

      // Prioritäts-Filter
      if (filters.prioritaet.length > 0 && !filters.prioritaet.includes(todo.prioritaet)) {
        return false;
      }

      // Bearbeiter-Filter
      if (filters.bearbeiter.length > 0) {
        const todoBearbeiter = todo.bearbeiter || 'keiner';
        if (!filters.bearbeiter.includes(todoBearbeiter)) {
          return false;
        }
      }

      // Fälligkeitsdatum-Filter
      if (filters.faelligkeitsdatum !== 'alle' && todo.faelligkeitsdatum) {
        const faelligkeitsDatum = new Date(todo.faelligkeitsdatum);
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        const dieseWoche = new Date(heute);
        dieseWoche.setDate(heute.getDate() + 7);
        const diesenMonat = new Date(heute);
        diesenMonat.setMonth(heute.getMonth() + 1);

        switch (filters.faelligkeitsdatum) {
          case 'ueberfaellig':
            if (faelligkeitsDatum >= heute) return false;
            break;
          case 'heute':
            if (faelligkeitsDatum.toDateString() !== heute.toDateString()) return false;
            break;
          case 'diese_woche':
            if (faelligkeitsDatum < heute || faelligkeitsDatum > dieseWoche) return false;
            break;
          case 'diesen_monat':
            if (faelligkeitsDatum < heute || faelligkeitsDatum > diesenMonat) return false;
            break;
        }
      } else if (filters.faelligkeitsdatum === 'ueberfaellig' && !todo.faelligkeitsdatum) {
        return false;
      }

      // Textsuche-Filter
      if (filters.suche.trim()) {
        const sucheLower = filters.suche.toLowerCase();
        const titelMatch = todo.titel.toLowerCase().includes(sucheLower);
        const beschreibungMatch = todo.beschreibung?.toLowerCase().includes(sucheLower) || false;
        if (!titelMatch && !beschreibungMatch) {
          return false;
        }
      }

      return true;
    });
  };

  const getTodosByStatus = (status: TodoStatus): Todo[] => {
    const filteredTodos = getFilteredTodos();
    return filteredTodos.filter(todo => todo.status === status);
  };

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (filters.status.length > 0) count++;
    if (filters.prioritaet.length > 0) count++;
    if (filters.bearbeiter.length > 0) count++;
    if (filters.faelligkeitsdatum !== 'alle') count++;
    if (filters.suche.trim()) count++;
    return count;
  };

  const resetFilters = () => {
    setFilters({
      status: [],
      prioritaet: [],
      bearbeiter: [],
      faelligkeitsdatum: 'alle',
      suche: '',
    });
  };

  const getPrioritaetBadge = (prioritaet: string) => {
    const styles: Record<string, string> = {
      niedrig: 'bg-gray-100 text-gray-800',
      normal: 'bg-blue-100 text-blue-800',
      hoch: 'bg-orange-100 text-orange-800',
      kritisch: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[prioritaet]}`}>
        {prioritaet.charAt(0).toUpperCase() + prioritaet.slice(1)}
      </span>
    );
  };

  const toggleTodoExpansion = (todoId: string) => {
    setExpandedTodos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(todoId)) {
        newSet.delete(todoId);
      } else {
        newSet.add(todoId);
      }
      return newSet;
    });
  };

  // Mobile Touch Handlers für Swipe
  const handleTouchStart = useCallback((e: React.TouchEvent, todoId: string) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setSwipeState({ todoId, startX: touch.clientX, currentX: touch.clientX, direction: null });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !swipeState.todoId) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Nur horizontales Swipen erlauben wenn es deutlich horizontal ist
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 10) {
      e.preventDefault(); // Verhindere vertikales Scrollen während Swipe
      setSwipeState(prev => ({
        ...prev,
        currentX: touch.clientX,
        direction: deltaX > 0 ? 'right' : 'left'
      }));
    }
  }, [swipeState.todoId]);

  const handleTouchEnd = useCallback(async () => {
    if (!touchStartRef.current || !swipeState.todoId) {
      setSwipeState({ todoId: null, startX: 0, currentX: 0, direction: null });
      touchStartRef.current = null;
      return;
    }

    const deltaX = swipeState.currentX - swipeState.startX;
    const timeDelta = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(deltaX) / timeDelta;

    // Swipe-Schwellwert: mind. 80px oder schnelle Geste
    if (Math.abs(deltaX) > 80 || (velocity > 0.5 && Math.abs(deltaX) > 40)) {
      const todo = todos.find(t => t.id === swipeState.todoId);
      if (todo) {
        const currentIndex = statusSpalten.findIndex(s => s.status === todo.status);
        let newIndex: number;

        if (deltaX > 0) {
          // Swipe nach rechts = nächster Status
          newIndex = Math.min(currentIndex + 1, statusSpalten.length - 1);
        } else {
          // Swipe nach links = vorheriger Status
          newIndex = Math.max(currentIndex - 1, 0);
        }

        if (newIndex !== currentIndex) {
          await handleStatusChange(swipeState.todoId, statusSpalten[newIndex].status);
        }
      }
    }

    setSwipeState({ todoId: null, startX: 0, currentX: 0, direction: null });
    touchStartRef.current = null;
  }, [swipeState, todos, statusSpalten]);

  // Mobile Status Navigation
  const navigateToNextStatus = () => {
    const currentIndex = statusSpalten.findIndex(s => s.status === mobileActiveTab);
    if (currentIndex < statusSpalten.length - 1) {
      setMobileActiveTab(statusSpalten[currentIndex + 1].status);
    }
  };

  const navigateToPrevStatus = () => {
    const currentIndex = statusSpalten.findIndex(s => s.status === mobileActiveTab);
    if (currentIndex > 0) {
      setMobileActiveTab(statusSpalten[currentIndex - 1].status);
    }
  };

  // Swipe-Offset berechnen
  const getSwipeOffset = (todoId: string): number => {
    if (swipeState.todoId !== todoId) return 0;
    const delta = swipeState.currentX - swipeState.startX;
    // Maximaler Offset von 100px
    return Math.max(-100, Math.min(100, delta));
  };

  const handleDragStart = (e: React.DragEvent, todoId: string) => {
    e.dataTransfer.setData('todoId', todoId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTodoId(todoId);
    // Verbesserte Drag-Vorschau
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragEnd = () => {
    setDraggedTodoId(null);
    setDragOverStatus(null);
  };

  const handleDragOver = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Nur zurücksetzen, wenn wir wirklich die Spalte verlassen
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverStatus(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, neuerStatus: TodoStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStatus(null);
    
    const todoId = e.dataTransfer.getData('todoId');
    if (todoId) {
      const draggedTodo = todos.find(t => t.id === todoId);
      // Nur verschieben, wenn sich der Status geändert hat
      if (draggedTodo && draggedTodo.status !== neuerStatus) {
        await handleStatusChange(todoId, neuerStatus);
      }
    }
    setDraggedTodoId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade TODOs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-4 sm:py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header - Desktop */}
        <div className="hidden sm:flex mb-8 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text mb-2">
              TODO-Verwaltung
            </h1>
            <p className="text-gray-600 dark:text-dark-textMuted">
              Verwalten Sie Ihre Aufgaben im Kanban-Board oder als Liste
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 bg-white dark:bg-dark-surface rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <List className="w-4 h-4" />
                <span>Liste</span>
              </button>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md shadow-sm hover:shadow-md dark:shadow-dark-md transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Hinzufügen</span>
            </button>
          </div>
        </div>

        {/* Header - Mobile */}
        <div className="sm:hidden mb-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              TODOs
            </h1>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-white dark:bg-dark-surface rounded-lg p-0.5 shadow-sm">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`p-2 rounded-md transition-colors touch-target ${
                    viewMode === 'kanban'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                  aria-label="Kanban-Ansicht"
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors touch-target ${
                    viewMode === 'list'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                  aria-label="Listen-Ansicht"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Status Tabs - Nur in Kanban-Ansicht */}
          {viewMode === 'kanban' && (
            <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-hide">
              {statusSpalten.map((spalte) => {
                const count = getTodosByStatus(spalte.status).length;
                const isActive = mobileActiveTab === spalte.status;
                return (
                  <button
                    key={spalte.status}
                    onClick={() => setMobileActiveTab(spalte.status)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-medium transition-all touch-target ${
                      isActive
                        ? `${spalte.mobileColor} text-white shadow-md`
                        : 'bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-400 shadow-sm'
                    }`}
                  >
                    {spalte.label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Swipe-Hinweis */}
          {viewMode === 'kanban' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
              Wische nach links/rechts um Status zu ändern
            </p>
          )}
        </div>

        {/* Filter-Bereich */}
        <div className="mb-4 sm:mb-6 bg-white dark:bg-dark-surface rounded-lg shadow-md dark:shadow-dark-md p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-md transition-colors touch-target"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm sm:text-base">Filter</span>
              {getActiveFilterCount() > 0 && (
                <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-medium">
                  {getActiveFilterCount()}
                </span>
              )}
            </button>
            {getActiveFilterCount() > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted hover:text-red-600 transition-colors"
              >
                Zurücksetzen
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-dark-border">
              {/* Textsuche */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  <Search className="w-4 h-4 inline mr-1" />
                  Suche
                </label>
                <input
                  type="text"
                  value={filters.suche}
                  onChange={(e) => setFilters({ ...filters, suche: e.target.value })}
                  placeholder="Titel oder Beschreibung..."
                  className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Status-Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  Status
                </label>
                <div className="space-y-2">
                  {statusSpalten.map((spalte) => (
                    <label key={spalte.status} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.status.includes(spalte.status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters({ ...filters, status: [...filters.status, spalte.status] });
                          } else {
                            setFilters({ ...filters, status: filters.status.filter(s => s !== spalte.status) });
                          }
                        }}
                        className="rounded border-gray-300 dark:border-dark-border text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-dark-textMuted">{spalte.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Prioritäts-Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  Priorität
                </label>
                <div className="space-y-2">
                  {['niedrig', 'normal', 'hoch', 'kritisch'].map((prioritaet) => (
                    <label key={prioritaet} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.prioritaet.includes(prioritaet)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters({ ...filters, prioritaet: [...filters.prioritaet, prioritaet] });
                          } else {
                            setFilters({ ...filters, prioritaet: filters.prioritaet.filter(p => p !== prioritaet) });
                          }
                        }}
                        className="rounded border-gray-300 dark:border-dark-border text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-dark-textMuted capitalize">{prioritaet}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bearbeiter-Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  Bearbeiter
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.bearbeiter.includes('keiner')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters({ ...filters, bearbeiter: [...filters.bearbeiter, 'keiner'] });
                        } else {
                          setFilters({ ...filters, bearbeiter: filters.bearbeiter.filter(b => b !== 'keiner') });
                        }
                      }}
                      className="rounded border-gray-300 dark:border-dark-border text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-dark-textMuted">Keiner</span>
                  </label>
                  {bearbeiter.map((b) => (
                    <label key={b} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.bearbeiter.includes(b)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters({ ...filters, bearbeiter: [...filters.bearbeiter, b] });
                          } else {
                            setFilters({ ...filters, bearbeiter: filters.bearbeiter.filter(be => be !== b) });
                          }
                        }}
                        className="rounded border-gray-300 dark:border-dark-border text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-dark-textMuted">{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Fälligkeitsdatum-Filter */}
              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Fälligkeitsdatum
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'alle', label: 'Alle' },
                    { value: 'ueberfaellig', label: 'Überfällig' },
                    { value: 'heute', label: 'Heute' },
                    { value: 'diese_woche', label: 'Diese Woche' },
                    { value: 'diesen_monat', label: 'Diesen Monat' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFilters({ ...filters, faelligkeitsdatum: option.value as any })}
                      className={`px-4 py-2 rounded-md text-sm transition-colors ${
                        filters.faelligkeitsdatum === option.value
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Liste Ansicht */}
        {viewMode === 'list' && (
          <>
            {/* Desktop Tabellen-Ansicht */}
            <div className="hidden sm:block bg-white dark:bg-dark-surface rounded-lg shadow-md dark:shadow-dark-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Titel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Priorität
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Bearbeiter
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Fälligkeitsdatum
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                        Aktionen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-surface divide-y divide-gray-200 dark:divide-dark-border">
                    {getFilteredTodos().length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-dark-textMuted">
                          {todos.length === 0 ? 'Keine TODOs vorhanden' : 'Keine TODOs entsprechen den Filtern'}
                        </td>
                      </tr>
                    ) : (
                      getFilteredTodos().map((todo) => (
                        <tr key={todo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
                                {todo.titel}
                              </div>
                              {todo.beschreibung && (
                                <div className="text-sm text-gray-500 dark:text-dark-textMuted mt-1 max-w-md truncate">
                                  {todo.beschreibung}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={todo.status}
                              onChange={(e) => handleStatusChange(todo.id, e.target.value as TodoStatus)}
                              className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                            >
                              <option value="todo">TODO</option>
                              <option value="in_arbeit">In Arbeit</option>
                              <option value="review">Review</option>
                              <option value="done">Done</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getPrioritaetBadge(todo.prioritaet)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={todo.bearbeiter || ''}
                              onChange={(e) => handleBearbeiterChange(todo.id, e.target.value as Bearbeiter || undefined)}
                              className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                            >
                              <option value="">Keiner</option>
                              {bearbeiter.map((b) => (
                                <option key={b} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-textMuted">
                            {todo.faelligkeitsdatum ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(todo.faelligkeitsdatum).toLocaleDateString('de-DE')}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleDelete(todo.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Löschen
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Listen-Ansicht */}
            <div className="sm:hidden space-y-3">
              {getFilteredTodos().length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                    <List className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">
                    {todos.length === 0 ? 'Keine TODOs vorhanden' : 'Keine TODOs entsprechen den Filtern'}
                  </p>
                </div>
              ) : (
                getFilteredTodos().map((todo) => {
                  const isExpanded = expandedTodos.has(todo.id);
                  const hasBeschreibung = todo.beschreibung && todo.beschreibung.trim().length > 0;

                  return (
                    <div
                      key={todo.id}
                      className="bg-white dark:bg-dark-surface rounded-xl shadow-md p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-dark-text text-base">
                            {todo.titel}
                          </h3>
                          <div className="flex items-center flex-wrap gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${
                              statusSpalten.find(s => s.status === todo.status)?.mobileColor
                            }`}>
                              {statusSpalten.find(s => s.status === todo.status)?.label}
                            </span>
                            {getPrioritaetBadge(todo.prioritaet)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleTodoExpansion(todo.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 touch-target"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(todo.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 touch-target"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Meta-Informationen */}
                      <div className="flex items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-400">
                        {todo.faelligkeitsdatum && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(todo.faelligkeitsdatum).toLocaleDateString('de-DE')}</span>
                          </div>
                        )}
                        {todo.bearbeiter && (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span>{todo.bearbeiter}</span>
                          </div>
                        )}
                      </div>

                      {/* Expandierte Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-dark-border space-y-3">
                          {hasBeschreibung && (
                            <p className="text-sm text-gray-600 dark:text-dark-textMuted whitespace-pre-wrap">
                              {todo.beschreibung}
                            </p>
                          )}

                          {/* Status ändern */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                              Status ändern
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {statusSpalten.map((spalte) => (
                                <button
                                  key={spalte.status}
                                  onClick={() => handleStatusChange(todo.id, spalte.status)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                    todo.status === spalte.status
                                      ? `${spalte.mobileColor} text-white`
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  {spalte.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Bearbeiter ändern */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                              Bearbeiter
                            </label>
                            <select
                              value={todo.bearbeiter || ''}
                              onChange={(e) => handleBearbeiterChange(todo.id, e.target.value as Bearbeiter || undefined)}
                              className="w-full text-sm border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                            >
                              <option value="">Keiner</option>
                              {bearbeiter.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Kanban Board - Desktop */}
        {viewMode === 'kanban' && (
        <>
          {/* Desktop Kanban Grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statusSpalten.map((spalte) => {
              const spaltenTodos = getTodosByStatus(spalte.status);
              const isDragOver = dragOverStatus === spalte.status;
              return (
                <div
                  key={spalte.status}
                  className={`${spalte.color} dark:bg-opacity-20 rounded-lg p-4 min-h-[500px] transition-all duration-200 ${
                    isDragOver ? 'ring-4 ring-red-400 ring-opacity-50 shadow-lg scale-[1.02]' : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, spalte.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, spalte.status)}
                >
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center justify-between">
                    <span>{spalte.label}</span>
                    <span className="bg-white dark:bg-dark-surface rounded-full px-2 py-1 text-sm font-medium">
                      {spaltenTodos.length}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {spaltenTodos.map((todo) => {
                      const isDragging = draggedTodoId === todo.id;
                      const isExpanded = expandedTodos.has(todo.id);
                      const hasBeschreibung = todo.beschreibung && todo.beschreibung.trim().length > 0;
                      return (
                      <div
                        key={todo.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, todo.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white dark:bg-dark-surface rounded-lg shadow p-3 hover:shadow-md transition-all duration-200 cursor-move ${
                          isDragging ? 'opacity-50 scale-95 rotate-2' : 'opacity-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3
                            className="font-semibold text-gray-900 dark:text-dark-text flex-1 text-sm cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasBeschreibung) {
                                toggleTodoExpansion(todo.id);
                              }
                            }}
                          >
                            {todo.titel}
                          </h3>
                          <div className="flex items-center gap-1">
                            {hasBeschreibung && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTodoExpansion(todo.id);
                                }}
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-dark-textMuted"
                                title={isExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(todo.id);
                              }}
                              className="text-gray-400 dark:text-gray-500 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {isExpanded && hasBeschreibung && (
                          <div className="mb-3 pt-2 border-t border-gray-100 dark:border-dark-border">
                            <p className="text-xs text-gray-600 dark:text-dark-textMuted whitespace-pre-wrap">
                              {todo.beschreibung}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mb-2">
                          {getPrioritaetBadge(todo.prioritaet)}
                          {todo.faelligkeitsdatum && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-textMuted">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {new Date(todo.faelligkeitsdatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>

                        {isExpanded && (
                          <>
                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border">
                              <label className="block text-xs font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                                Bearbeiter
                              </label>
                              <select
                                value={todo.bearbeiter || ''}
                                onChange={(e) => handleBearbeiterChange(todo.id, e.target.value as Bearbeiter || undefined)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                              >
                                <option value="">Keiner</option>
                                {bearbeiter.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {todo.bearbeiter && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-gray-600 dark:text-dark-textMuted">
                                <User className="w-3 h-3" />
                                <span>{todo.bearbeiter}</span>
                              </div>
                            )}
                          </>
                        )}

                        {!isExpanded && todo.bearbeiter && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-textMuted">
                            <User className="w-3 h-3" />
                            <span>{todo.bearbeiter}</span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {spaltenTodos.length === 0 && (
                      <div className={`text-center text-gray-500 dark:text-gray-400 text-sm py-8 transition-all duration-200 ${
                        isDragOver ? 'border-2 border-dashed border-red-400 rounded-lg' : ''
                      }`}>
                        {isDragOver ? 'Hier ablegen' : 'Keine Aufgaben'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile Kanban - Nur aktive Spalte mit Swipe */}
          <div className="sm:hidden">
            {/* Navigation Arrows und Status-Anzeige */}
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                onClick={navigateToPrevStatus}
                disabled={mobileActiveTab === 'todo'}
                className={`p-2 rounded-full touch-target ${
                  mobileActiveTab === 'todo'
                    ? 'text-gray-300 dark:text-gray-600'
                    : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-dark-surface shadow-sm active:scale-95'
                }`}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-2">
                {statusSpalten.map((spalte) => (
                  <div
                    key={spalte.status}
                    className={`w-2 h-2 rounded-full transition-all ${
                      mobileActiveTab === spalte.status
                        ? `${spalte.mobileColor} scale-125`
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={navigateToNextStatus}
                disabled={mobileActiveTab === 'done'}
                className={`p-2 rounded-full touch-target ${
                  mobileActiveTab === 'done'
                    ? 'text-gray-300 dark:text-gray-600'
                    : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-dark-surface shadow-sm active:scale-95'
                }`}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Mobile Todo Cards */}
            <div className="space-y-3">
              {getTodosByStatus(mobileActiveTab).map((todo) => {
                const isExpanded = expandedTodos.has(todo.id);
                const hasBeschreibung = todo.beschreibung && todo.beschreibung.trim().length > 0;
                const swipeOffset = getSwipeOffset(todo.id);
                const isBeingSwiped = swipeState.todoId === todo.id;

                // Bestimme nächsten/vorherigen Status für Swipe-Indikator
                const currentIndex = statusSpalten.findIndex(s => s.status === todo.status);
                const prevStatus = currentIndex > 0 ? statusSpalten[currentIndex - 1] : null;
                const nextStatus = currentIndex < statusSpalten.length - 1 ? statusSpalten[currentIndex + 1] : null;

                return (
                  <div
                    key={todo.id}
                    className="relative overflow-hidden rounded-xl"
                  >
                    {/* Swipe Hintergrund-Indikatoren */}
                    {isBeingSwiped && (
                      <>
                        {/* Links = Vorheriger Status */}
                        {prevStatus && swipeOffset < 0 && (
                          <div
                            className={`absolute inset-y-0 left-0 ${prevStatus.mobileColor} flex items-center justify-start pl-4`}
                            style={{ width: Math.abs(swipeOffset) }}
                          >
                            <ChevronLeft className="w-6 h-6 text-white" />
                          </div>
                        )}
                        {/* Rechts = Nächster Status */}
                        {nextStatus && swipeOffset > 0 && (
                          <div
                            className={`absolute inset-y-0 right-0 ${nextStatus.mobileColor} flex items-center justify-end pr-4`}
                            style={{ width: Math.abs(swipeOffset) }}
                          >
                            <ChevronRight className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </>
                    )}

                    {/* Todo Card */}
                    <div
                      className="bg-white dark:bg-dark-surface rounded-xl shadow-md p-4 relative"
                      style={{
                        transform: `translateX(${swipeOffset}px)`,
                        transition: isBeingSwiped ? 'none' : 'transform 0.2s ease-out'
                      }}
                      onTouchStart={(e) => handleTouchStart(e, todo.id)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                      {/* Swipe-Grip Indikator */}
                      <div className="absolute left-1/2 top-1 -translate-x-1/2 flex gap-0.5">
                        <div className="w-8 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
                      </div>

                      <div className="flex items-start justify-between gap-3 mt-2">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="font-semibold text-gray-900 dark:text-dark-text text-base leading-tight"
                            onClick={() => hasBeschreibung && toggleTodoExpansion(todo.id)}
                          >
                            {todo.titel}
                          </h3>

                          {/* Status Badge für Mobile */}
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${
                              statusSpalten.find(s => s.status === todo.status)?.mobileColor
                            }`}>
                              {statusSpalten.find(s => s.status === todo.status)?.label}
                            </span>
                            {getPrioritaetBadge(todo.prioritaet)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasBeschreibung && (
                            <button
                              onClick={() => toggleTodoExpansion(todo.id)}
                              className="p-2 text-gray-400 dark:text-gray-500 touch-target"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(todo.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 touch-target"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Meta-Informationen */}
                      <div className="flex items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-400">
                        {todo.faelligkeitsdatum && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(todo.faelligkeitsdatum).toLocaleDateString('de-DE')}</span>
                          </div>
                        )}
                        {todo.bearbeiter && (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span>{todo.bearbeiter}</span>
                          </div>
                        )}
                      </div>

                      {/* Expandierte Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-dark-border space-y-3">
                          {hasBeschreibung && (
                            <div>
                              <p className="text-sm text-gray-600 dark:text-dark-textMuted whitespace-pre-wrap">
                                {todo.beschreibung}
                              </p>
                            </div>
                          )}

                          {/* Status ändern */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                              Status ändern
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {statusSpalten.map((spalte) => (
                                <button
                                  key={spalte.status}
                                  onClick={() => handleStatusChange(todo.id, spalte.status)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all touch-target ${
                                    todo.status === spalte.status
                                      ? `${spalte.mobileColor} text-white`
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  {spalte.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Bearbeiter ändern */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                              Bearbeiter
                            </label>
                            <select
                              value={todo.bearbeiter || ''}
                              onChange={(e) => handleBearbeiterChange(todo.id, e.target.value as Bearbeiter || undefined)}
                              className="w-full text-sm border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                            >
                              <option value="">Keiner</option>
                              {bearbeiter.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {getTodosByStatus(mobileActiveTab).length === 0 && (
                <div className="text-center py-12 px-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                    <CheckSquare className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">
                    Keine Aufgaben in "{statusSpalten.find(s => s.status === mobileActiveTab)?.label}"
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    Tippe auf + um eine neue Aufgabe hinzuzufügen
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
        )}

        {/* Floating Action Button - Position angepasst für mobile Bottom-Nav */}
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 sm:bottom-8 right-4 sm:right-8 bg-red-600 hover:bg-red-700 text-white rounded-full p-3 sm:p-4 shadow-lg dark:shadow-dark-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 z-40 active:scale-95"
          title="Neues TODO anlegen"
        >
          <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
        </button>

        {/* Modal für neues TODO */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden mobile-modal-enter">
              {/* Mobile Header mit Drag-Handle */}
              <div className="sm:hidden flex flex-col items-center pt-2 pb-1 border-b border-gray-100 dark:border-dark-border">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mb-2" />
                <div className="w-full px-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                    Neue Aufgabe
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
                    }}
                    className="p-2 text-gray-400 dark:text-gray-500 touch-target"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Desktop Header */}
              <div className="hidden sm:flex items-center justify-between p-6 pb-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                  Neues TODO anlegen
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-dark-textMuted"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-60px)] sm:max-h-[calc(90vh-80px)]">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1.5">
                      Titel *
                    </label>
                    <input
                      type="text"
                      value={formData.titel}
                      onChange={(e) => setFormData({ ...formData, titel: e.target.value })}
                      className="w-full border border-gray-300 dark:border-dark-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text text-base"
                      placeholder="Was muss erledigt werden?"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1.5">
                      Beschreibung
                    </label>
                    <textarea
                      value={formData.beschreibung}
                      onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                      className="w-full border border-gray-300 dark:border-dark-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text text-base resize-none"
                      rows={3}
                      placeholder="Weitere Details hinzufügen..."
                    />
                  </div>

                  {/* Mobile: Status-Buttons statt Dropdown */}
                  <div className="sm:hidden">
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                      Status
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {statusSpalten.map((spalte) => (
                        <button
                          key={spalte.status}
                          type="button"
                          onClick={() => setFormData({ ...formData, status: spalte.status })}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            formData.status === spalte.status
                              ? `${spalte.mobileColor} text-white`
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {spalte.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mobile: Priorität-Buttons */}
                  <div className="sm:hidden">
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                      Priorität
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['niedrig', 'normal', 'hoch', 'kritisch'].map((p) => {
                        const colors: Record<string, string> = {
                          niedrig: 'bg-gray-500',
                          normal: 'bg-blue-500',
                          hoch: 'bg-orange-500',
                          kritisch: 'bg-red-500',
                        };
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormData({ ...formData, prioritaet: p as any })}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                              formData.prioritaet === p
                                ? `${colors[p]} text-white`
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Desktop: Grid mit Dropdowns */}
                  <div className="hidden sm:grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as TodoStatus })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                      >
                        <option value="todo">TODO</option>
                        <option value="in_arbeit">In Arbeit</option>
                        <option value="review">Review</option>
                        <option value="done">Done</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Priorität
                      </label>
                      <select
                        value={formData.prioritaet}
                        onChange={(e) => setFormData({ ...formData, prioritaet: e.target.value as any })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text"
                      >
                        <option value="niedrig">Niedrig</option>
                        <option value="normal">Normal</option>
                        <option value="hoch">Hoch</option>
                        <option value="kritisch">Kritisch</option>
                      </select>
                    </div>
                  </div>

                  {/* Bearbeiter und Datum */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1.5">
                        Bearbeiter
                      </label>
                      <select
                        value={formData.bearbeiter || ''}
                        onChange={(e) => setFormData({ ...formData, bearbeiter: e.target.value as Bearbeiter || undefined })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text text-base"
                      >
                        <option value="">Keiner</option>
                        {bearbeiter.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1.5">
                        Fälligkeitsdatum
                      </label>
                      <input
                        type="date"
                        value={formData.faelligkeitsdatum || ''}
                        onChange={(e) => setFormData({ ...formData, faelligkeitsdatum: e.target.value || undefined })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-dark-bg dark:text-dark-text text-base"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4 pb-safe">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
                      }}
                      className="flex-1 px-4 py-3 sm:py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 text-base font-medium"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-3 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-base font-medium"
                    >
                      Erstellen
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

export default Todos;
