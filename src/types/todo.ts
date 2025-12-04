export type TodoStatus = 'todo' | 'in_arbeit' | 'review' | 'done';
export type Bearbeiter = 'Luca' | 'Juan' | 'Julian';

export interface Todo {
  id: string;
  titel: string;
  beschreibung?: string;
  status: TodoStatus;
  bearbeiter?: Bearbeiter;
  prioritaet: TodoPrioritaet;
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
  faelligkeitsdatum?: string; // ISO Date String
  erstelltVon?: string; // Name des Erstellers
}

export type TodoPrioritaet = 'niedrig' | 'normal' | 'hoch' | 'kritisch';

export interface NeuesTodo {
  titel: string;
  beschreibung?: string;
  status?: TodoStatus;
  bearbeiter?: Bearbeiter;
  prioritaet?: TodoPrioritaet;
  faelligkeitsdatum?: string;
  erstelltVon?: string;
}

