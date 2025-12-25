/**
 * Logo Loader für PDF-Generierung
 *
 * Lädt das TENNISMEHL Logo als SVG und rendert es in hoher Auflösung
 * für optimale Darstellung beim Zoomen in PDFs.
 *
 * Das SVG wird in 3x Auflösung gerendert (ca. 2000px Breite), um bei
 * Vergrößerung im PDF scharf zu bleiben.
 *
 * Die Poppins-Schriftart wird automatisch von Google Fonts geladen,
 * damit der Text im SVG korrekt dargestellt wird.
 */

// Base64-codiertes Logo (wird beim Build eingebunden)
let cachedLogoBase64: string | null = null;

// Logo-Pfad (neues 2026 Logo mit rotem Rand)
const LOGO_PATH = '/Logo 2026_TennisMehl BriefkopfLogo 2026 red border.svg';

// Poppins Medium von Google Fonts
const POPPINS_FONT_URL = 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9V1s.ttf';

// Cache für die Schriftart als Base64
let fontBase64Cache: string | null = null;

/**
 * Lädt die Poppins-Schriftart als Base64 für SVG-Einbettung
 */
const loadFontAsBase64 = async (): Promise<string | null> => {
  if (fontBase64Cache) return fontBase64Cache;

  try {
    const response = await fetch(POPPINS_FONT_URL);
    if (!response.ok) throw new Error('Font konnte nicht geladen werden');

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        fontBase64Cache = reader.result as string;
        resolve(fontBase64Cache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Poppins-Schriftart konnte nicht geladen werden:', error);
    return null;
  }
};

/**
 * Bettet die Schriftart direkt ins SVG ein
 * Das ist notwendig damit SVG-zu-Canvas-Rendering die Schrift erkennt
 */
const embedFontInSvg = (svgText: string, fontDataUrl: string): string => {
  // @font-face Definition für SVG erstellen
  const fontFaceRule = `
    @font-face {
      font-family: 'Poppins-Medium';
      src: url('${fontDataUrl}') format('truetype');
      font-weight: 500;
      font-style: normal;
    }
  `;

  // Prüfen ob bereits ein <style> Tag existiert
  if (svgText.includes('<style')) {
    // Füge @font-face am Anfang des bestehenden Style-Blocks ein
    return svgText.replace(
      /<style([^>]*)>([\s\S]*?)<\/style>/,
      `<style$1>${fontFaceRule}$2</style>`
    );
  } else {
    // Füge neuen <style> Block nach dem öffnenden <svg> Tag ein
    return svgText.replace(
      /(<svg[^>]*>)/,
      `$1<defs><style type="text/css">${fontFaceRule}</style></defs>`
    );
  }
};

/**
 * Rendert ein SVG in hoher Auflösung auf ein Canvas
 * Verwendet 3x Skalierung für scharfe Darstellung beim Zoomen
 */
const renderSvgToHighResCanvas = async (svgText: string): Promise<string> => {
  // Schriftart laden und ins SVG einbetten
  const fontDataUrl = await loadFontAsBase64();
  let processedSvg = svgText;

  if (fontDataUrl) {
    processedSvg = embedFontInSvg(svgText, fontDataUrl);
  }

  return new Promise((resolve, reject) => {
    // SVG-Dimensionen aus viewBox extrahieren
    const viewBoxMatch = processedSvg.match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) {
      reject(new Error('SVG hat keine viewBox'));
      return;
    }

    const viewBoxParts = viewBoxMatch[1].split(/\s+/).map(Number);
    const svgWidth = viewBoxParts[2] || 944.53;
    const svgHeight = viewBoxParts[3] || 457.3;

    // Skalierungsfaktor für hohe Auflösung (3x für scharfe Darstellung beim Zoomen)
    // Ergibt ca. 2833x1372 Pixel - optimal für PDF-Zoom
    const scaleFactor = 3;
    const canvasWidth = Math.round(svgWidth * scaleFactor);
    const canvasHeight = Math.round(svgHeight * scaleFactor);

    // Canvas erstellen
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas-Kontext konnte nicht erstellt werden'));
      return;
    }

    // SVG als Blob/URL erstellen (mit eingebetteter Schrift)
    const svgBlob = new Blob([processedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();

    img.onload = () => {
      // Hintergrund transparent lassen
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Bild mit höchster Qualität zeichnen
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

      // Als PNG exportieren (höchste Qualität für Logos)
      const base64 = canvas.toDataURL('image/png');

      // Cleanup
      URL.revokeObjectURL(url);

      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG konnte nicht als Bild geladen werden'));
    };

    img.src = url;
  });
};

/**
 * Lädt das TENNISMEHL Logo als hochauflösendes Base64
 * Das SVG wird in 3x Auflösung gerendert für optimale Zoom-Qualität
 * @returns Base64-codiertes Logo in hoher Auflösung oder null bei Fehler
 */
export const loadLogoBase64 = async (): Promise<string | null> => {
  // Verwende gecachte Version falls vorhanden
  if (cachedLogoBase64) {
    return cachedLogoBase64;
  }

  try {
    // Lade SVG als Text
    const response = await fetch(LOGO_PATH);
    if (!response.ok) {
      throw new Error(`Logo konnte nicht geladen werden: ${response.status}`);
    }

    const svgText = await response.text();

    // SVG in hoher Auflösung auf Canvas rendern und als PNG exportieren
    const highResBase64 = await renderSvgToHighResCanvas(svgText);
    cachedLogoBase64 = highResBase64;

    return highResBase64;
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
