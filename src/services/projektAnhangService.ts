import { ID } from 'appwrite';
import { storage, PROJEKT_ANHAENGE_BUCKET_ID } from '../config/appwrite';
import { ProjektAnhang } from '../types/projekt';

/**
 * Service für Projekt-Anhänge (PDFs, Mails, Dokumente)
 * Verwendet Appwrite Storage für die Datei-Speicherung
 */
class ProjektAnhangService {
  private readonly bucketId = PROJEKT_ANHAENGE_BUCKET_ID;

  /**
   * Datei hochladen
   */
  async uploadDatei(
    file: File,
    kategorie: ProjektAnhang['kategorie'],
    beschreibung?: string,
    hochgeladenVon?: string
  ): Promise<ProjektAnhang> {
    try {
      // Datei zu Appwrite hochladen
      const response = await storage.createFile(
        this.bucketId,
        ID.unique(),
        file
      );

      // Anhang-Objekt erstellen
      const anhang: ProjektAnhang = {
        id: ID.unique(),
        dateiname: file.name,
        dateityp: file.type || 'application/octet-stream',
        kategorie,
        beschreibung,
        appwriteFileId: response.$id,
        hochgeladenAm: new Date().toISOString(),
        hochgeladenVon,
        groesse: file.size,
      };

      return anhang;
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error);
      throw error;
    }
  }

  /**
   * Mehrere Dateien hochladen
   */
  async uploadMultipleDateien(
    files: File[],
    kategorie: ProjektAnhang['kategorie'],
    hochgeladenVon?: string
  ): Promise<ProjektAnhang[]> {
    const anhaenge: ProjektAnhang[] = [];

    for (const file of files) {
      try {
        const anhang = await this.uploadDatei(file, kategorie, undefined, hochgeladenVon);
        anhaenge.push(anhang);
      } catch (error) {
        console.error(`Fehler beim Hochladen von ${file.name}:`, error);
        // Weiter mit nächster Datei
      }
    }

    return anhaenge;
  }

  /**
   * Datei-URL für Vorschau/Download abrufen
   */
  getDateiUrl(appwriteFileId: string): string {
    try {
      const result = storage.getFileView(this.bucketId, appwriteFileId);
      return result.toString();
    } catch (error) {
      console.error('Fehler beim Abrufen der Datei-URL:', error);
      throw error;
    }
  }

  /**
   * Datei-Download-URL abrufen
   */
  getDownloadUrl(appwriteFileId: string): string {
    try {
      const result = storage.getFileDownload(this.bucketId, appwriteFileId);
      return result.toString();
    } catch (error) {
      console.error('Fehler beim Abrufen der Download-URL:', error);
      throw error;
    }
  }

  /**
   * Datei-Vorschau-URL abrufen (für Bilder)
   */
  getPreviewUrl(appwriteFileId: string, width?: number, height?: number): string {
    try {
      const result = storage.getFilePreview(
        this.bucketId,
        appwriteFileId,
        width,
        height
      );
      return result.toString();
    } catch (error) {
      console.error('Fehler beim Abrufen der Vorschau-URL:', error);
      throw error;
    }
  }

  /**
   * Datei löschen
   */
  async deleteDatei(appwriteFileId: string): Promise<void> {
    try {
      await storage.deleteFile(this.bucketId, appwriteFileId);
    } catch (error) {
      console.error('Fehler beim Löschen der Datei:', error);
      throw error;
    }
  }

  /**
   * Mehrere Dateien löschen (z.B. wenn Projekt gelöscht wird)
   */
  async deleteMultipleDateien(appwriteFileIds: string[]): Promise<void> {
    for (const fileId of appwriteFileIds) {
      try {
        await this.deleteDatei(fileId);
      } catch (error) {
        console.error(`Fehler beim Löschen von ${fileId}:`, error);
        // Weiter mit nächster Datei
      }
    }
  }

  /**
   * Kategorie-Label für Anzeige
   */
  getKategorieLabel(kategorie: ProjektAnhang['kategorie']): string {
    const labels: Record<ProjektAnhang['kategorie'], string> = {
      bestellung: 'Bestellung',
      lieferung: 'Lieferung',
      rechnung: 'Rechnung',
      mail: 'E-Mail',
      sonstiges: 'Sonstiges',
    };
    return labels[kategorie] || kategorie;
  }

  /**
   * Dateigröße formatieren
   */
  formatGroesse(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Dateityp-Icon bestimmen
   */
  getDateitypIcon(dateityp: string): 'pdf' | 'mail' | 'image' | 'document' | 'other' {
    if (dateityp.includes('pdf')) return 'pdf';
    if (dateityp.includes('mail') || dateityp.includes('rfc822') || dateityp.includes('message')) return 'mail';
    if (dateityp.includes('image')) return 'image';
    if (dateityp.includes('word') || dateityp.includes('document') || dateityp.includes('text')) return 'document';
    return 'other';
  }
}

export const projektAnhangService = new ProjektAnhangService();
