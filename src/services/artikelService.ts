import {
  databases,
  DATABASE_ID,
  ARTIKEL_COLLECTION_ID,
  PROJEKTE_COLLECTION_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
  PLATZBAUER_DOKUMENTE_COLLECTION_ID,
  INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
  MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID,
  SHOP_BESTELLUNGEN_COLLECTION_ID,
} from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Artikel, ArtikelInput } from '../types/artikel';
import { ARTIKELNUMMER_ALIASSE, normalisiereArtikelnummer } from '../utils/tonnage';

/**
 * Service für die Verwaltung von Standardartikeln.
 *
 * Invarianten (Stufe 1 Artikelverwaltung, 08/2026):
 * - Artikelnummern sind eindeutig (Prüfung hier + Unique-Index in Appwrite).
 * - Artikelnummern werden nach der Anlage nie geändert — sie stehen auf
 *   versandten Kundenbelegen (allein TM-ZM-02 auf über 2000 Positionen).
 * - Artikel werden archiviert statt gelöscht; hartes Löschen nur, wenn die
 *   Referenzprüfung keinen einzigen Beleg findet.
 */

/**
 * Bereitet Eingabedaten für die Neuanlage auf: trimmt die Artikelnummer,
 * hält erlaubteEinheit synchron zur Stammeinheit und setzt aktiv.
 * Als pure Funktion exportiert, damit sie testbar ist.
 */
export function bereiteArtikelNeuanlage(artikelData: ArtikelInput): Record<string, unknown> {
  return {
    ...artikelData,
    artikelnummer: artikelData.artikelnummer.trim(),
    erlaubteEinheit: artikelData.einheit,
    aktiv: true,
  };
}

/**
 * Bereitet Eingabedaten für ein Update auf. Die Artikelnummer wird bewusst
 * verworfen: Umbenennen ist verboten (steht auf versandten Belegen), und die
 * UI sperrt das Feld — der Service erzwingt es zusätzlich, damit auch kein
 * anderer Aufrufer sie ändern kann. Ändert sich die Einheit, wandert
 * erlaubteEinheit mit.
 */
export function bereiteArtikelUpdate(artikelData: Partial<ArtikelInput>): Record<string, unknown> {
  const { artikelnummer: _ignoriert, ...rest } = artikelData;
  const update: Record<string, unknown> = { ...rest };
  if (artikelData.einheit !== undefined) {
    update.erlaubteEinheit = artikelData.einheit;
  }
  return update;
}

// Artikel erstellen
export async function erstelleArtikel(artikelData: ArtikelInput): Promise<Artikel> {
  const nummer = artikelData.artikelnummer.trim();
  if (!nummer) {
    throw new Error('Artikelnummer darf nicht leer sein.');
  }

  // Altnummern-Aliasse (tonnage.ts) sind reserviert: ein neuer Artikel
  // "TM-ZM-02BB" würde beim Lesen sofort auf TM-ZM-BIG-02 gemappt und wäre
  // damit unauffindbar.
  const normalisiert = normalisiereArtikelnummer(nummer);
  if (normalisiert !== nummer.toUpperCase()) {
    throw new Error(
      `Artikelnummer "${nummer}" ist eine Altnummer und wird beim Lesen auf "${ARTIKELNUMMER_ALIASSE[nummer.toUpperCase()]}" umgeleitet — bitte eine andere Nummer wählen.`
    );
  }

  const vorhanden = await sucheArtikelNachNummer(nummer);
  if (vorhanden) {
    throw new Error(`Artikelnummer "${nummer}" existiert bereits (${vorhanden.bezeichnung}).`);
  }

  const now = new Date().toISOString();
  const artikel = await databases.createDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    ID.unique(),
    {
      ...bereiteArtikelNeuanlage(artikelData),
      erstelltAm: now,
      aktualisiertAm: now,
    }
  );

  return artikel as unknown as Artikel;
}

/**
 * Alle Artikel abrufen (mit Sortierung).
 *
 * Lädt per Cursor-Schleife wirklich ALLE Artikel — das frühere Query.limit(100)
 * hätte ab dem 101. Artikel still trunkiert. Die Aufrufer (Beleg-Tabs,
 * Angebots-Dialoge) verlassen sich auf die vollständige Liste als
 * Auswahl- und Matching-Quelle.
 *
 * @param nurAktive true = archivierte Artikel ausblenden (für Auswahllisten
 *   neuer Positionen); Standard false, damit Altbelege ihre Artikel weiterhin
 *   auflösen können.
 */
export async function getAlleArtikel(
  sortBy: 'artikelnummer' | 'bezeichnung' | 'einzelpreis' = 'artikelnummer',
  nurAktive = false
): Promise<Artikel[]> {
  const alle: Artikel[] = [];
  let cursor: string | null = null;

  for (;;) {
    // Cursor bewusst immer über die (eindeutige) Artikelnummer — ein Cursor
    // über einzelpreis kann bei null-Werten Dokumente überspringen.
    const queries = [Query.orderAsc('artikelnummer'), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const response = await databases.listDocuments(
      DATABASE_ID,
      ARTIKEL_COLLECTION_ID,
      queries
    );

    alle.push(...(response.documents as unknown as Artikel[]));
    if (response.documents.length < 100) break;
    cursor = response.documents[response.documents.length - 1].$id;
  }

  if (sortBy === 'bezeichnung') {
    alle.sort((a, b) => (a.bezeichnung || '').localeCompare(b.bezeichnung || ''));
  } else if (sortBy === 'einzelpreis') {
    alle.sort((a, b) => (a.einzelpreis ?? Infinity) - (b.einzelpreis ?? Infinity));
  }

  // aktiv === false ist das einzige Archiv-Signal; null/undefined (Bestand
  // vor dem Befüll-Skript) gilt als aktiv.
  return nurAktive ? alle.filter((a) => a.aktiv !== false) : alle;
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

/**
 * Artikel nach Artikelnummer suchen.
 *
 * Findet die Query mehr als einen Treffer, ist das ein Datenfehler (der
 * Unique-Index soll das verhindern) — dann wird laut gewarnt statt still
 * documents[0] zu nehmen.
 */
export async function sucheArtikelNachNummer(artikelnummer: string): Promise<Artikel | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ARTIKEL_COLLECTION_ID,
      [Query.equal('artikelnummer', artikelnummer)]
    );

    if (response.documents.length > 1) {
      console.error(
        `Datenfehler: Artikelnummer "${artikelnummer}" existiert ${response.documents.length}× im Stamm — bitte Duplikate bereinigen.`
      );
    }
    if (response.documents.length > 0) {
      return response.documents[0] as unknown as Artikel;
    }
    return null;
  } catch (error) {
    console.error('Fehler beim Suchen des Artikels:', error);
    return null;
  }
}

// Artikel aktualisieren (Artikelnummer ist unveränderlich, siehe bereiteArtikelUpdate)
export async function aktualisiereArtikel(id: string, artikelData: Partial<ArtikelInput>): Promise<Artikel> {
  const now = new Date().toISOString();

  const artikel = await databases.updateDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id,
    {
      ...bereiteArtikelUpdate(artikelData),
      aktualisiertAm: now,
    }
  );

  return artikel as unknown as Artikel;
}

// Artikel archivieren: verschwindet aus Auswahllisten, bleibt für Altbelege lesbar
export async function archiviereArtikel(id: string): Promise<Artikel> {
  const artikel = await databases.updateDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id,
    { aktiv: false, aktualisiertAm: new Date().toISOString() }
  );
  return artikel as unknown as Artikel;
}

export async function reaktiviereArtikel(id: string): Promise<Artikel> {
  const artikel = await databases.updateDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id,
    { aktiv: true, aktualisiertAm: new Date().toISOString() }
  );
  return artikel as unknown as Artikel;
}

export interface ArtikelReferenzPruefung {
  pruefbar: boolean;
  referenzen: Array<{ collection: string; anzahl: number }>;
}

/**
 * Best-Effort-Referenzprüfung vor dem endgültigen Löschen: sucht die
 * Artikelnummer als Substring in den Positions-JSON-Feldern der
 * Belegspeicher. Substring-Treffer sind bewusst großzügig (TM-ZM-02 matcht
 * auch TM-ZM-02St) — falsch-positive blockieren nur das Löschen, das ist die
 * sichere Richtung. Schlägt eine Query fehl, gilt der Artikel als
 * „nicht prüfbar" und darf ebenfalls nicht hart gelöscht werden.
 */
export async function pruefeArtikelReferenzen(artikelnummer: string): Promise<ArtikelReferenzPruefung> {
  const quellen: Array<{ collection: string; feld: string }> = [
    { collection: PROJEKTE_COLLECTION_ID, feld: 'data' },
    { collection: BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, feld: 'daten' },
    { collection: PLATZBAUER_DOKUMENTE_COLLECTION_ID, feld: 'daten' },
    { collection: INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID, feld: 'positionen' },
    { collection: MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, feld: 'data' },
    { collection: SHOP_BESTELLUNGEN_COLLECTION_ID, feld: 'positionen' },
  ];

  // Auch Altnummern zählen als Referenz: Belege aus der BigBag-Fehlverkabelung
  // tragen "TM-ZM-02BB" — beim Lesen wird das auf TM-ZM-BIG-02 gemappt, also
  // darf TM-ZM-BIG-02 nicht gelöscht werden, solange solche Belege existieren.
  const suchbegriffe = [
    artikelnummer,
    ...Object.entries(ARTIKELNUMMER_ALIASSE)
      .filter(([, ziel]) => ziel === normalisiereArtikelnummer(artikelnummer))
      .map(([altnummer]) => altnummer),
  ];

  const referenzen: Array<{ collection: string; anzahl: number }> = [];

  for (const quelle of quellen) {
    for (const begriff of suchbegriffe) {
      try {
        const response = await databases.listDocuments(DATABASE_ID, quelle.collection, [
          Query.contains(quelle.feld, begriff),
          Query.limit(1),
        ]);
        if (response.total > 0) {
          referenzen.push({ collection: quelle.collection, anzahl: response.total });
          break;
        }
      } catch (error) {
        console.error(`Referenzprüfung in ${quelle.collection} fehlgeschlagen:`, error);
        return { pruefbar: false, referenzen };
      }
    }
  }

  return { pruefbar: true, referenzen };
}

/**
 * Artikel endgültig löschen — nur erlaubt, wenn die Referenzprüfung keinen
 * Beleg findet. Der Normalweg ist archiviereArtikel.
 */
export async function loescheArtikel(id: string): Promise<void> {
  const artikel = await getArtikelById(id);
  if (!artikel) {
    throw new Error('Artikel nicht gefunden.');
  }

  const pruefung = await pruefeArtikelReferenzen(artikel.artikelnummer);
  if (!pruefung.pruefbar) {
    throw new Error(
      'Referenzprüfung nicht möglich — Artikel kann nur archiviert, nicht gelöscht werden.'
    );
  }
  if (pruefung.referenzen.length > 0) {
    const wo = pruefung.referenzen.map((r) => `${r.collection} (${r.anzahl}×)`).join(', ');
    throw new Error(
      `Artikel "${artikel.artikelnummer}" wird noch referenziert: ${wo}. Bitte archivieren statt löschen.`
    );
  }

  await databases.deleteDocument(
    DATABASE_ID,
    ARTIKEL_COLLECTION_ID,
    id
  );
}

// Artikel suchen (clientseitige Suche in Artikelnummer, Bezeichnung und Beschreibung)
export async function sucheArtikel(suchtext: string): Promise<Artikel[]> {
  if (!suchtext.trim()) {
    return getAlleArtikel();
  }

  try {
    // Alle Artikel laden
    const alleArtikel = await getAlleArtikel();

    // Suchtext normalisieren
    const suchLower = suchtext.toLowerCase().trim();

    // Clientseitig filtern
    return alleArtikel.filter(artikel => {
      const artikelnummer = (artikel.artikelnummer || '').toLowerCase();
      const bezeichnung = (artikel.bezeichnung || '').toLowerCase();
      const beschreibung = (artikel.beschreibung || '').toLowerCase();

      return artikelnummer.includes(suchLower) ||
             bezeichnung.includes(suchLower) ||
             beschreibung.includes(suchLower);
    });
  } catch (error) {
    console.error('Fehler beim Suchen von Artikeln:', error);
    return [];
  }
}
