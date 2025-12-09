import { databases, DATABASE_ID, ARTIKEL_COLLECTION_ID } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Artikel, ArtikelInput } from '../types/artikel';

/**
 * Service für die Verwaltung von Standardartikeln
 */

// Artikel erstellen
export async function erstelleArtikel(artikelData: ArtikelInput): Promise<Artikel> {
  const now = new Date().toISOString();
  
  const artikel = await databases.createDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    ID.unique(),
    {
      ...artikelData,
      erstelltAm: now,
      aktualisiertAm: now,
    }
  );

  return artikel as unknown as Artikel;
}

// Alle Artikel abrufen (mit Sortierung)
export async function getAlleArtikel(sortBy: 'artikelnummer' | 'bezeichnung' | 'einzelpreis' = 'artikelnummer'): Promise<Artikel[]> {
  const queries = [
    Query.orderAsc(sortBy),
    Query.limit(100), // Maximal 100 Artikel
  ];

  const response = await databases.listDocuments(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    queries
  );

  return response.documents as unknown as Artikel[];
}

// Artikel nach ID abrufen
export async function getArtikelById(id: string): Promise<Artikel | null> {
  try {
    const artikel = await databases.getDocument(
      DATABASE_ID,
      ARTIKEL_COLLECTION_ID,
      id
    );
    return artikel as unknown as Artikel;
  } catch (error) {
    console.error('Fehler beim Abrufen des Artikels:', error);
    return null;
  }
}

// Artikel nach Artikelnummer suchen
export async function sucheArtikelNachNummer(artikelnummer: string): Promise<Artikel | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ARTIKEL_COLLECTION_ID,
      [Query.equal('artikelnummer', artikelnummer)]
    );

    if (response.documents.length > 0) {
      return response.documents[0] as unknown as Artikel;
    }
    return null;
  } catch (error) {
    console.error('Fehler beim Suchen des Artikels:', error);
    return null;
  }
}

// Artikel aktualisieren
export async function aktualisiereArtikel(id: string, artikelData: Partial<ArtikelInput>): Promise<Artikel> {
  const now = new Date().toISOString();
  
  const artikel = await databases.updateDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id,
    {
      ...artikelData,
      aktualisiertAm: now,
    }
  );

  return artikel as unknown as Artikel;
}

// Artikel löschen
export async function loescheArtikel(id: string): Promise<void> {
  await databases.deleteDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id
  );
}

// Artikel suchen (Volltextsuche in Bezeichnung und Beschreibung)
export async function sucheArtikel(suchtext: string): Promise<Artikel[]> {
  if (!suchtext.trim()) {
    return getAlleArtikel();
  }

  try {
    // Suche in Bezeichnung
    const response = await databases.listDocuments(
      DATABASE_ID,
      ARTIKEL_COLLECTION_ID,
      [
        Query.search('bezeichnung', suchtext),
        Query.limit(50),
      ]
    );

    return response.documents as unknown as Artikel[];
  } catch (error) {
    console.error('Fehler beim Suchen von Artikeln:', error);
    return [];
  }
}
