/**
 * Logo Loader für PDF-Generierung
 * 
 * Lädt das TENNISMEHL Logo und stellt es als Base64 für jsPDF bereit
 */

// Base64-codiertes Logo (wird beim Build eingebunden)
let cachedLogoBase64: string | null = null;

/**
 * Lädt das TENNISMEHL Logo als Base64
 * @returns Base64-codiertes Logo oder null bei Fehler
 */
export const loadLogoBase64 = async (): Promise<string | null> => {
  // Verwende gecachte Version falls vorhanden
  if (cachedLogoBase64) {
    return cachedLogoBase64;
  }

  try {
    // Lade Logo als Blob
    const response = await fetch('/Briefkopf.png');
    if (!response.ok) {
      throw new Error('Logo konnte nicht geladen werden');
    }

    const blob = await response.blob();
    
    // Konvertiere zu Base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        cachedLogoBase64 = base64;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Fehler beim Laden des Logos:', error);
    return null;
  }
};

/**
 * Setzt den Cache zurück (für Tests)
 */
export const resetLogoCache = () => {
  cachedLogoBase64 = null;
};
