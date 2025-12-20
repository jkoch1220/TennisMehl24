import { useState, useEffect } from 'react';
import { todoService } from '../../services/todoService';
import { Todo, NeuesTodo, TodoStatus, Bearbeiter } from '../../types/todo';
import { Plus, X, Calendar, User, LayoutGrid, List, Filter, Search, ChevronDown, ChevronUp } from 'lucide-react';

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

  const statusSpalten: { status: TodoStatus; label: string; color: string }[] = [
    { status: 'todo', label: 'TODO', color: 'bg-gray-100' },
    { status: 'in_arbeit', label: 'In Arbeit', color: 'bg-blue-100' },
    { status: 'review', label: 'Review', color: 'bg-yellow-100' },
    { status: 'done', label: 'Done', color: 'bg-green-100' },
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
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
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

        {/* Filter-Bereich */}
        <div className="mb-6 bg-white dark:bg-dark-surface rounded-lg shadow-md dark:shadow-dark-md p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-md transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Filter</span>
              {getActiveFilterCount() > 0 && (
                <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-medium">
                  {getActiveFilterCount()}
                </span>
              )}
            </button>
            {getActiveFilterCount() > 0 && (
              <button
                onClick={resetFilters}
                className="text-sm text-gray-600 dark:text-dark-textMuted hover:text-red-600 transition-colors"
              >
                Filter zurücksetzen
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
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-md dark:shadow-dark-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
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
                <tbody className="bg-white dark:bg-dark-surface divide-y divide-gray-200">
                  {getFilteredTodos().length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-dark-textMuted">
                        {todos.length === 0 ? 'Keine TODOs vorhanden' : 'Keine TODOs entsprechen den Filtern'}
                      </td>
                    </tr>
                  ) : (
                    getFilteredTodos().map((todo) => (
                      <tr key={todo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800">
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
                            className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                            className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
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
        )}

        {/* Kanban Board */}
        {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statusSpalten.map((spalte) => {
            const spaltenTodos = getTodosByStatus(spalte.status);
            const isDragOver = dragOverStatus === spalte.status;
            return (
              <div
                key={spalte.status}
                className={`${spalte.color} rounded-lg p-4 min-h-[500px] transition-all duration-200 ${
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
                      className={`bg-white rounded-lg shadow p-3 hover:shadow-md transition-all duration-200 cursor-move ${
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
                              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted"
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
                        <div className="mb-3 pt-2 border-t border-gray-100">
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
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                              Bearbeiter
                            </label>
                            <select
                              value={todo.bearbeiter || ''}
                              onChange={(e) => handleBearbeiterChange(todo.id, e.target.value as Bearbeiter || undefined)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    <div className={`text-center text-gray-500 text-sm py-8 transition-all duration-200 ${
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
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-8 right-8 bg-red-600 hover:bg-red-700 text-white rounded-full p-4 shadow-lg dark:shadow-dark-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center w-16 h-16 z-50"
          title="Neues TODO anlegen"
        >
          <Plus className="w-8 h-8" />
        </button>

        {/* Modal für neues TODO */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                    Neues TODO anlegen
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
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
                      placeholder="Titel der Aufgabe"
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
                      rows={4}
                      placeholder="Detaillierte Beschreibung der Aufgabe..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as TodoStatus })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="niedrig">Niedrig</option>
                        <option value="normal">Normal</option>
                        <option value="hoch">Hoch</option>
                        <option value="kritisch">Kritisch</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Bearbeiter
                      </label>
                      <select
                        value={formData.bearbeiter || ''}
                        onChange={(e) => setFormData({ ...formData, bearbeiter: e.target.value as Bearbeiter || undefined })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                        Fälligkeitsdatum
                      </label>
                      <input
                        type="date"
                        value={formData.faelligkeitsdatum || ''}
                        onChange={(e) => setFormData({ ...formData, faelligkeitsdatum: e.target.value || undefined })}
                        className="w-full border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormData({ titel: '', beschreibung: '', status: 'todo', prioritaet: 'normal' });
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-md text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      TODO anlegen
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
