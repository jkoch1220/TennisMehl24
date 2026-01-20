/**
 * Service für Bild-Upload zu Appwrite Storage
 */

import { storage, APPWRITE_ENDPOINT, PROJECT_ID } from '../config/appwrite';
import { ID } from 'appwrite';

const EMAIL_BILDER_BUCKET_ID = 'email-bilder';

/**
 * Lädt ein Bild zu Appwrite Storage hoch
 * @param file Die Bild-Datei
 * @returns Die öffentliche URL des Bildes
 */
export const ladebildHoch = async (file: File): Promise<string> => {
  try {
    // Validierung
    const erlaubteMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!erlaubteMimeTypes.includes(file.type)) {
      throw new Error(`Ungültiger Dateityp: ${file.type}. Erlaubt sind: PNG, JPEG, GIF, WebP, SVG`);
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`Datei zu groß: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 10MB`);
    }

    // Generiere eindeutige ID
    const fileId = ID.unique();

    // Hochladen
    const result = await storage.createFile(
      EMAIL_BILDER_BUCKET_ID,
      fileId,
      file
    );

    // Generiere öffentliche URL
    // Format: {endpoint}/storage/buckets/{bucketId}/files/{fileId}/view?project={projectId}
    const publicUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${EMAIL_BILDER_BUCKET_ID}/files/${result.$id}/view?project=${PROJECT_ID}`;

    return publicUrl;
  } catch (error) {
    console.error('Fehler beim Bild-Upload:', error);
    throw error;
  }
};

/**
 * Löscht ein Bild aus Appwrite Storage
 * @param fileId Die Datei-ID
 */
export const loescheBild = async (fileId: string): Promise<void> => {
  try {
    await storage.deleteFile(EMAIL_BILDER_BUCKET_ID, fileId);
  } catch (error) {
    console.error('Fehler beim Löschen des Bildes:', error);
    throw error;
  }
};

/**
 * Extrahiert die Datei-ID aus einer Appwrite-Bild-URL
 */
export const extrahiereDateiId = (url: string): string | null => {
  const match = url.match(/\/files\/([^/]+)\//);
  return match ? match[1] : null;
};

/**
 * Listet alle Bilder im Email-Bilder-Bucket
 */
export const listeBilder = async (): Promise<Array<{ id: string; name: string; url: string }>> => {
  try {
    const result = await storage.listFiles(EMAIL_BILDER_BUCKET_ID);

    return result.files.map(file => ({
      id: file.$id,
      name: file.name,
      url: `${APPWRITE_ENDPOINT}/storage/buckets/${EMAIL_BILDER_BUCKET_ID}/files/${file.$id}/view?project=${PROJECT_ID}`,
    }));
  } catch (error) {
    console.error('Fehler beim Auflisten der Bilder:', error);
    return [];
  }
};
