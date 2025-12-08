import { ID, Query, Models } from 'appwrite';
import { databases, DATABASE_ID, KUNDEN_COLLECTION_ID } from '../config/appwrite';
import { KundenListenEintrag, NeuerKundenListenEintrag } from '../types/kundenliste';

function toStorageObject(entry: KundenListenEintrag) {
  // Legacy-Felder beilegen, damit bestehende Views weiterhin funktionieren
  return {
    ...entry,
    kundennummer: entry.id,
    kontakt: {
      name: entry.ansprechpartner || entry.name,
      telefon: entry.telefonnummer || '',
      email: entry.email || '',
    },
    kundentyp: 'grosskunde',
    lieferhinweise: entry.bemerkungen || '',
    zahlungsbedingungen: entry.zahlungsbedingungen || '',
    lieferhistorie: [],
  };
}

function toPayload(entry: KundenListenEintrag) {
  const storageObject = toStorageObject(entry);
  // Minimal-Payload: nur notwendige Felder + data-String, um Schema-Anforderungen (name) zu erfüllen
  return {
    name: entry.name,
    kundenTyp: entry.kundenTyp,
    data: JSON.stringify(storageObject),
  };
}

function parseDocument(doc: Models.Document): KundenListenEintrag {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as KundenListenEintrag;
      return {
        ...parsed,
        id: parsed.id || doc.$id,
        erstelltAm: parsed.erstelltAm || doc.erstelltAm || doc.$createdAt,
        aktualisiertAm: parsed.aktualisiertAm || doc.aktualisiertAm || doc.$updatedAt || parsed.erstelltAm,
      };
    } catch (error) {
      console.warn('⚠️ Konnte Kunden-Dokument nicht parsen, verwende Felder:', error);
    }
  }

  const raw = doc as Models.Document & Partial<KundenListenEintrag> & Record<string, unknown>;

  return {
    id: doc?.$id || doc?.id,
    name: (raw.name as string) || '',
    kundenTyp: (raw.kundenTyp as KundenListenEintrag['kundenTyp']) || 'sonstige',
    bestelltDirekt: Boolean(raw.bestelltDirekt),
    adresse: {
      strasse: (raw.adresse_strasse as string) || '',
      plz: (raw.adresse_plz as string) || '',
      ort: (raw.adresse_ort as string) || '',
    },
    lieferadresse: raw.lieferadresse_strasse
      ? {
          strasse: (raw.lieferadresse_strasse as string) || '',
          plz: (raw.lieferadresse_plz as string) || '',
          ort: (raw.lieferadresse_ort as string) || '',
        }
      : undefined,
    bestelltUeberIds: Array.isArray(raw.bestelltUeberIds) ? (raw.bestelltUeberIds as string[]) : [],
    tennisplatzAnzahl: typeof raw.tennisplatzAnzahl === 'number' ? (raw.tennisplatzAnzahl as number) : 0,
    tonnenProJahr: typeof raw.tonnenProJahr === 'number' ? (raw.tonnenProJahr as number) : 0,
    telefonnummer: (raw.telefonnummer as string) || '',
    ansprechpartner: (raw.ansprechpartner as string) || '',
    email: (raw.email as string) || '',
    zahlungsbedingungen: (raw.zahlungsbedingungen as string) || '',
    zahlungsverhalten: (raw.zahlungsverhalten as string) || '',
    zahlungszielTage: typeof raw.zahlungszielTage === 'number' ? (raw.zahlungszielTage as number) : 0,
    erstelltAm: (raw.erstelltAm as string) || doc?.$createdAt || new Date().toISOString(),
    aktualisiertAm: (raw.aktualisiertAm as string) || doc?.$updatedAt || doc?.$createdAt || new Date().toISOString(),
    bemerkungen: (raw.bemerkungen as string) || '',
  };
}

export const kundenListeService = {
  async list(): Promise<KundenListenEintrag[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, KUNDEN_COLLECTION_ID, [
        Query.limit(5000),
        Query.orderDesc('$createdAt'),
      ]);
      return response.documents.map((doc) => parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Kundenliste:', error);
      return [];
    }
  },

  async get(id: string): Promise<KundenListenEintrag | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, KUNDEN_COLLECTION_ID, id);
      return parseDocument(doc);
    } catch (error) {
      console.error('Fehler beim Laden des Kunden-Eintrags:', error);
      return null;
    }
  },

  async create(payload: NeuerKundenListenEintrag): Promise<KundenListenEintrag> {
    const jetzt = new Date().toISOString();
    const entry: KundenListenEintrag = {
      id: payload.id || ID.unique(),
      name: payload.name,
      kundenTyp: payload.kundenTyp,
      bestelltDirekt: payload.bestelltDirekt,
      adresse: payload.adresse,
      lieferadresse: payload.lieferadresse,
      bestelltUeberIds: payload.bestelltUeberIds || [],
      tennisplatzAnzahl: payload.tennisplatzAnzahl ?? 0,
      tonnenProJahr: payload.tonnenProJahr ?? 0,
      erstelltAm: payload.erstelltAm || jetzt,
      aktualisiertAm: payload.aktualisiertAm || jetzt,
      bemerkungen: payload.bemerkungen || '',
    };

    const document = await databases.createDocument(
      DATABASE_ID,
      KUNDEN_COLLECTION_ID,
      entry.id,
      toPayload(entry)
    );

    return parseDocument(document);
  },

  async update(id: string, payload: Partial<KundenListenEintrag>): Promise<KundenListenEintrag> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Kunde mit ID ${id} nicht gefunden`);
    }

    const entry: KundenListenEintrag = {
      ...existing,
      ...payload,
      id,
      adresse: { ...existing.adresse, ...(payload.adresse || {}) },
      lieferadresse: payload.lieferadresse
        ? { ...existing.lieferadresse, ...payload.lieferadresse }
        : existing.lieferadresse,
      bestelltUeberIds: payload.bestelltUeberIds ?? existing.bestelltUeberIds,
      tennisplatzAnzahl: payload.tennisplatzAnzahl ?? existing.tennisplatzAnzahl,
      tonnenProJahr: payload.tonnenProJahr ?? existing.tonnenProJahr,
      aktualisiertAm: new Date().toISOString(),
    };

    const document = await databases.updateDocument(
      DATABASE_ID,
      KUNDEN_COLLECTION_ID,
      id,
      toPayload(entry)
    );

    return parseDocument(document);
  },

  async remove(id: string): Promise<void> {
    await databases.deleteDocument(DATABASE_ID, KUNDEN_COLLECTION_ID, id);
  },
};
