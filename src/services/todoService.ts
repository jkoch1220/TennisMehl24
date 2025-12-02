import { databases, DATABASE_ID, TODOS_COLLECTION_ID } from '../config/appwrite';
import { Todo, NeuesTodo, TodoStatus } from '../types/todo';
import { ID } from 'appwrite';

export const todoService = {
  // Lade alle TODOs
  async loadAlleTodos(): Promise<Todo[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        TODOS_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseTodoDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der TODOs:', error);
      return [];
    }
  },

  // Lade ein einzelnes TODO
  async loadTodo(id: string): Promise<Todo | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        TODOS_COLLECTION_ID,
        id
      );
      
      return this.parseTodoDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des TODOs:', error);
      return null;
    }
  },

  // Erstelle neues TODO
  async createTodo(todo: NeuesTodo): Promise<Todo> {
    const jetzt = new Date().toISOString();
    const neuesTodo: Todo = {
      ...todo,
      id: ID.unique(),
      status: todo.status || 'todo',
      prioritaet: todo.prioritaet || 'normal',
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        TODOS_COLLECTION_ID,
        neuesTodo.id,
        {
          data: JSON.stringify(neuesTodo),
        }
      );
      
      return this.parseTodoDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des TODOs:', error);
      throw error;
    }
  },

  // Aktualisiere TODO
  async updateTodo(id: string, todo: Partial<Todo>): Promise<Todo> {
    try {
      const aktuell = await this.loadTodo(id);
      if (!aktuell) {
        throw new Error(`TODO ${id} nicht gefunden`);
      }

      const aktualisiert: Todo = {
        ...aktuell,
        ...todo,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        TODOS_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseTodoDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des TODOs:', error);
      throw error;
    }
  },

  // Verschiebe TODO in anderen Status (für Drag & Drop)
  async moveTodo(id: string, neuerStatus: TodoStatus): Promise<Todo> {
    return this.updateTodo(id, { status: neuerStatus });
  },

  // Lösche TODO
  async deleteTodo(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        TODOS_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des TODOs:', error);
      throw error;
    }
  },

  // Helper-Funktion zum Parsen von Dokumenten
  parseTodoDocument(doc: any): Todo {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    return doc as Todo;
  },
};
