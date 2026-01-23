// Fahrer-Service für Tourenplanung

import { ID, Query } from 'appwrite';
import { databases, DATABASE_ID, FAHRER_COLLECTION_ID } from '../config/appwrite';
import type { Fahrer, NeuerFahrer, WochentagVerfuegbarkeit, Fuehrerscheinklasse } from '../types/tour';

// Appwrite Dokument zu Fahrer konvertieren
const dokumentZuFahrer = (doc: Record<string, unknown>): Fahrer => {
  return {
    id: doc.$id as string,
    name: doc.name as string,
    telefon: doc.telefon as string | undefined,
    email: doc.email as string | undefined,
    fuehrerscheinklassen: JSON.parse((doc.fuehrerscheinklassen as string) || '[]') as Fuehrerscheinklasse[],
    verfuegbarkeit: JSON.parse((doc.verfuegbarkeit as string) || '{}') as WochentagVerfuegbarkeit,
    bevorzugtesFahrzeugId: doc.bevorzugtesFahrzeugId as string | undefined,
    maxArbeitszeitMinuten: (doc.maxArbeitszeitMinuten as number) || 540,
    pausenregelMinuten: (doc.pausenregelMinuten as number) || 45,
    notizen: doc.notizen as string | undefined,
    aktiv: doc.aktiv !== false,
    erstelltAm: doc.$createdAt as string,
    geaendertAm: doc.$updatedAt as string,
  };
};

// Standard-Verfügbarkeit (Mo-Fr)
const standardVerfuegbarkeit: WochentagVerfuegbarkeit = {
  montag: true,
  dienstag: true,
  mittwoch: true,
  donnerstag: true,
  freitag: true,
  samstag: false,
};

export const fahrerService = {
  // Alle Fahrer laden
  async loadFahrer(): Promise<Fahrer[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRER_COLLECTION_ID,
        [Query.orderAsc('name'), Query.limit(100)]
      );
      return response.documents.map(dokumentZuFahrer);
    } catch (error) {
      console.error('Fehler beim Laden der Fahrer:', error);
      return [];
    }
  },

  // Nur aktive Fahrer laden
  async loadAktiveFahrer(): Promise<Fahrer[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRER_COLLECTION_ID,
        [Query.equal('aktiv', true), Query.orderAsc('name'), Query.limit(100)]
      );
      return response.documents.map(dokumentZuFahrer);
    } catch (error) {
      console.error('Fehler beim Laden der aktiven Fahrer:', error);
      return [];
    }
  },

  // Einzelnen Fahrer laden
  async getFahrer(id: string): Promise<Fahrer | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, FAHRER_COLLECTION_ID, id);
      return dokumentZuFahrer(doc);
    } catch (error) {
      console.error('Fehler beim Laden des Fahrers:', error);
      return null;
    }
  },

  // Fahrer nach Verfügbarkeit an einem bestimmten Tag
  async loadVerfuegbareFahrerFuerTag(wochentag: keyof WochentagVerfuegbarkeit): Promise<Fahrer[]> {
    const alleFahrer = await this.loadAktiveFahrer();
    return alleFahrer.filter(fahrer => fahrer.verfuegbarkeit[wochentag]);
  },

  // Neuen Fahrer erstellen
  async createFahrer(fahrer: NeuerFahrer): Promise<Fahrer> {
    const doc = await databases.createDocument(
      DATABASE_ID,
      FAHRER_COLLECTION_ID,
      ID.unique(),
      {
        name: fahrer.name,
        telefon: fahrer.telefon || null,
        email: fahrer.email || null,
        fuehrerscheinklassen: JSON.stringify(fahrer.fuehrerscheinklassen || []),
        verfuegbarkeit: JSON.stringify(fahrer.verfuegbarkeit || standardVerfuegbarkeit),
        bevorzugtesFahrzeugId: fahrer.bevorzugtesFahrzeugId || null,
        maxArbeitszeitMinuten: fahrer.maxArbeitszeitMinuten || 540,
        pausenregelMinuten: fahrer.pausenregelMinuten || 45,
        notizen: fahrer.notizen || null,
        aktiv: fahrer.aktiv !== false,
      }
    );
    return dokumentZuFahrer(doc);
  },

  // Fahrer aktualisieren
  async updateFahrer(id: string, updates: Partial<NeuerFahrer>): Promise<Fahrer> {
    const data: Record<string, unknown> = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.telefon !== undefined) data.telefon = updates.telefon || null;
    if (updates.email !== undefined) data.email = updates.email || null;
    if (updates.fuehrerscheinklassen !== undefined) {
      data.fuehrerscheinklassen = JSON.stringify(updates.fuehrerscheinklassen);
    }
    if (updates.verfuegbarkeit !== undefined) {
      data.verfuegbarkeit = JSON.stringify(updates.verfuegbarkeit);
    }
    if (updates.bevorzugtesFahrzeugId !== undefined) {
      data.bevorzugtesFahrzeugId = updates.bevorzugtesFahrzeugId || null;
    }
    if (updates.maxArbeitszeitMinuten !== undefined) {
      data.maxArbeitszeitMinuten = updates.maxArbeitszeitMinuten;
    }
    if (updates.pausenregelMinuten !== undefined) {
      data.pausenregelMinuten = updates.pausenregelMinuten;
    }
    if (updates.notizen !== undefined) data.notizen = updates.notizen || null;
    if (updates.aktiv !== undefined) data.aktiv = updates.aktiv;

    const doc = await databases.updateDocument(
      DATABASE_ID,
      FAHRER_COLLECTION_ID,
      id,
      data
    );
    return dokumentZuFahrer(doc);
  },

  // Fahrer löschen
  async deleteFahrer(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, FAHRER_COLLECTION_ID, id);
  },

  // Fahrer deaktivieren (statt löschen)
  async deaktiviereFahrer(id: string): Promise<Fahrer> {
    return this.updateFahrer(id, { aktiv: false });
  },

  // Standard-Verfügbarkeit exportieren
  getStandardVerfuegbarkeit(): WochentagVerfuegbarkeit {
    return { ...standardVerfuegbarkeit };
  },
};
