/**
 * Logo Loader für PDF-Generierung
 * 
 * Lädt das TENNISMEHL Logo, skaliert es für optimale Performance
 * und stellt es als Base64 für jsPDF bereit
 */

// Base64-codiertes Logo (wird beim Build eingebunden)
let cachedLogoBase64: string | null = null;

/**
 * Skaliert ein Bild für optimale PDF-Performance
 * Reduziert die Auflösung auf maximal 300x150px (ausreichend für PDFs)
 */
const compressImage = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      // Ziel-Dimensionen: Max 300x150px (für 45x22mm bei 150dpi ist das mehr als ausreichend)
      const maxWidth = 300;
      const maxHeight = 150;
      
      let width = img.width;
      let height = img.height;
      
      // Proportional skalieren
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      // Canvas für Skalierung erstellen
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas-Kontext konnte nicht erstellt werden'));
        return;
      }
      
      // Bild mit hoher Qualität zeichnen
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      // Als komprimiertes PNG exportieren (0.85 Qualität)
      const base64 = canvas.toDataURL('image/png', 0.85);
      
      // Cleanup
      URL.revokeObjectURL(url);
      
      resolve(base64);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    
    img.src = url;
  });
};

/**
 * Lädt das TENNISMEHL Logo als optimiertes Base64
 * @returns Base64-codiertes, komprimiertes Logo oder null bei Fehler
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
    
    // Komprimiere und konvertiere zu Base64
    const compressedBase64 = await compressImage(blob);
    cachedLogoBase64 = compressedBase64;
    
    return compressedBase64;
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
