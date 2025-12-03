import { 
  databases, 
  storage, 
  DATABASE_ID, 
  RECHNUNGS_AKTIVITAETEN_COLLECTION_ID,
  RECHNUNGS_DATEIEN_BUCKET_ID 
} from '../config/appwrite';
import { RechnungsAktivitaet, NeueRechnungsAktivitaet, AktivitaetsTyp } from '../types/kreditor';
import { ID } from 'appwrite';

export const aktivitaetService = {
  // ========== AKTIVITÄTEN VERWALTUNG ==========

  // Lade alle Aktivitäten für eine Rechnung (neuste zuerst)
  async loadAktivitaetenFuerRechnung(rechnungId: string): Promise<RechnungsAktivitaet[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        RECHNUNGS_AKTIVITAETEN_COLLECTION_ID
      );
      
      const alleAktivitaeten = response.documents.map(doc => this.parseAktivitaetDocument(doc));
      
      // Filtern nach rechnungId und sortieren (neuste zuerst)
      return alleAktivitaeten
        .filter(a => a.rechnungId === rechnungId)
        .sort((a, b) => new Date(b.erstelltAm).getTime() - new Date(a.erstelltAm).getTime());
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
      return [];
    }
  },

  // Erstelle neue Aktivität
  async createAktivitaet(aktivitaet: NeueRechnungsAktivitaet): Promise<RechnungsAktivitaet> {
    const jetzt = new Date().toISOString();
    const neueAktivitaet: RechnungsAktivitaet = {
      ...aktivitaet,
      id: ID.unique(),
      erstelltAm: aktivitaet.erstelltAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        RECHNUNGS_AKTIVITAETEN_COLLECTION_ID,
        neueAktivitaet.id,
        {
          data: JSON.stringify(neueAktivitaet),
        }
      );
      
      return this.parseAktivitaetDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Aktivität:', error);
      throw error;
    }
  },

  // Lösche Aktivität
  async deleteAktivitaet(id: string): Promise<void> {
    try {
      // Erst die Aktivität laden, um zu prüfen ob eine Datei gelöscht werden muss
      const aktivitaeten = await databases.listDocuments(
        DATABASE_ID,
        RECHNUNGS_AKTIVITAETEN_COLLECTION_ID
      );
      
      const aktivitaet = aktivitaeten.documents
        .map(doc => this.parseAktivitaetDocument(doc))
        .find(a => a.id === id);
      
      // Falls es eine Datei gibt, diese auch löschen
      if (aktivitaet?.dateiId) {
        try {
          await storage.deleteFile(RECHNUNGS_DATEIEN_BUCKET_ID, aktivitaet.dateiId);
        } catch (e) {
          console.warn('Datei konnte nicht gelöscht werden:', e);
        }
      }

      await databases.deleteDocument(
        DATABASE_ID,
        RECHNUNGS_AKTIVITAETEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Aktivität:', error);
      throw error;
    }
  },

  // Lösche alle Aktivitäten für eine Rechnung
  async deleteAktivitaetenFuerRechnung(rechnungId: string): Promise<void> {
    try {
      const aktivitaeten = await this.loadAktivitaetenFuerRechnung(rechnungId);
      
      for (const aktivitaet of aktivitaeten) {
        await this.deleteAktivitaet(aktivitaet.id);
      }
    } catch (error) {
      console.error('Fehler beim Löschen der Aktivitäten:', error);
      throw error;
    }
  },

  // ========== DATEI-UPLOAD ==========

  // Datei hochladen und Aktivität erstellen
  async uploadDatei(
    rechnungId: string, 
    file: File, 
    beschreibung?: string
  ): Promise<RechnungsAktivitaet> {
    try {
      // Datei in Storage hochladen
      const uploadedFile = await storage.createFile(
        RECHNUNGS_DATEIEN_BUCKET_ID,
        ID.unique(),
        file
      );

      // Aktivität erstellen
      const aktivitaet = await this.createAktivitaet({
        rechnungId,
        typ: 'datei',
        titel: `Datei hochgeladen: ${file.name}`,
        beschreibung: beschreibung || undefined,
        dateiId: uploadedFile.$id,
        dateiName: file.name,
        dateiTyp: file.type,
        dateiGroesse: file.size,
      });

      return aktivitaet;
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error);
      throw error;
    }
  },

  // Datei-URL abrufen
  getDateiUrl(dateiId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
    return `${endpoint}/storage/buckets/${RECHNUNGS_DATEIEN_BUCKET_ID}/files/${dateiId}/view?project=${projectId}`;
  },

  // Datei-Download-URL abrufen
  getDateiDownloadUrl(dateiId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
    return `${endpoint}/storage/buckets/${RECHNUNGS_DATEIEN_BUCKET_ID}/files/${dateiId}/download?project=${projectId}`;
  },

  // ========== SCHNELLE AKTIVITÄTEN ERSTELLEN ==========

  // E-Mail-Verkehr dokumentieren
  async logEmail(rechnungId: string, titel: string, beschreibung?: string): Promise<RechnungsAktivitaet> {
    return this.createAktivitaet({
      rechnungId,
      typ: 'email',
      titel,
      beschreibung,
    });
  },

  // Telefonat dokumentieren
  async logTelefonat(rechnungId: string, titel: string, beschreibung?: string): Promise<RechnungsAktivitaet> {
    return this.createAktivitaet({
      rechnungId,
      typ: 'telefonat',
      titel,
      beschreibung,
    });
  },

  // Kommentar hinzufügen
  async addKommentar(rechnungId: string, kommentar: string): Promise<RechnungsAktivitaet> {
    return this.createAktivitaet({
      rechnungId,
      typ: 'kommentar',
      titel: 'Kommentar hinzugefügt',
      beschreibung: kommentar,
    });
  },

  // Zahlung dokumentieren
  async logZahlung(rechnungId: string, betrag: number, notiz?: string): Promise<RechnungsAktivitaet> {
    return this.createAktivitaet({
      rechnungId,
      typ: 'zahlung',
      titel: `Zahlung: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)}`,
      beschreibung: notiz,
    });
  },

  // Status-Änderung dokumentieren
  async logStatusAenderung(rechnungId: string, neuerStatus: string, alterStatus?: string): Promise<RechnungsAktivitaet> {
    const titel = alterStatus 
      ? `Status geändert: ${alterStatus} → ${neuerStatus}`
      : `Status gesetzt: ${neuerStatus}`;
    
    return this.createAktivitaet({
      rechnungId,
      typ: 'status_aenderung',
      titel,
    });
  },

  // Mahnung dokumentieren
  async logMahnung(rechnungId: string, mahnstufe: number, beschreibung?: string): Promise<RechnungsAktivitaet> {
    return this.createAktivitaet({
      rechnungId,
      typ: 'mahnung',
      titel: `${mahnstufe}. Mahnung erhalten`,
      beschreibung,
    });
  },

  // Rate-Anpassung dokumentieren
  async logRateAnpassung(rechnungId: string, neueRate: number, alteRate?: number): Promise<RechnungsAktivitaet> {
    const titel = alteRate 
      ? `Monatliche Rate angepasst: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(alteRate)} → ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(neueRate)}`
      : `Monatliche Rate festgelegt: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(neueRate)}`;
    
    return this.createAktivitaet({
      rechnungId,
      typ: 'rate_anpassung',
      titel,
    });
  },

  // ========== HELPER FUNCTIONS ==========

  parseAktivitaetDocument(doc: any): RechnungsAktivitaet {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    return doc as RechnungsAktivitaet;
  },

  // Icon für Aktivitätstyp
  getAktivitaetIcon(typ: AktivitaetsTyp): string {
    const icons: Record<AktivitaetsTyp, string> = {
      email: '📧',
      telefonat: '📞',
      kommentar: '💬',
      datei: '📎',
      zahlung: '💰',
      status_aenderung: '🔄',
      mahnung: '⚠️',
      rate_anpassung: '📊',
    };
    return icons[typ] || '📝';
  },

  // Farbe für Aktivitätstyp
  getAktivitaetFarbe(typ: AktivitaetsTyp): string {
    const farben: Record<AktivitaetsTyp, string> = {
      email: 'bg-blue-100 text-blue-800 border-blue-200',
      telefonat: 'bg-green-100 text-green-800 border-green-200',
      kommentar: 'bg-gray-100 text-gray-800 border-gray-200',
      datei: 'bg-purple-100 text-purple-800 border-purple-200',
      zahlung: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      status_aenderung: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      mahnung: 'bg-orange-100 text-orange-800 border-orange-200',
      rate_anpassung: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
    return farben[typ] || 'bg-gray-100 text-gray-800 border-gray-200';
  },
};
