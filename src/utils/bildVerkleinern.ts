/**
 * Verkleinert ein Bild im Browser, bevor es hochgeladen wird.
 *
 * Drei Probleme, eine Lösung:
 *
 * 1. GRÖSSE. Handyfotos sind heute 3–8 MB. Als Base64 wächst das um ein
 *    Drittel und sprengt das 6-MB-Limit einer Netlify Function. Nach dem
 *    Verkleinern bleiben typisch 300–500 KB.
 * 2. METADATEN. Handyfotos tragen GPS-Koordinaten und Gerätekennungen im
 *    EXIF-Block. Weil Canvas das Bild neu zeichnet, fällt der Block ersatzlos
 *    weg — ohne eigenen Stripper.
 * 3. FORMAT. Was hineingeht (HEIC vom iPhone, PNG, WebP), kommt als JPEG
 *    heraus. Der Server muss dadurch nur zwei Formate kennen.
 *
 * Für den Zweck — der Fahrer soll sehen, wo das Tor ist — reichen 1600 px
 * Kantenlänge reichlich.
 */

export interface VerkleinertesBild {
  /** Data-URL mit JPEG-Inhalt, direkt versendbar. */
  dataUrl: string;
  /** Größe in Byte nach dem Verkleinern. */
  bytes: number;
  breite: number;
  hoehe: number;
}

const MAX_KANTE = 1600;
const QUALITAET = 0.82;

export async function verkleinereBild(
  datei: File,
  optionen: { maxKante?: number; qualitaet?: number } = {}
): Promise<VerkleinertesBild> {
  const maxKante = optionen.maxKante ?? MAX_KANTE;
  const qualitaet = optionen.qualitaet ?? QUALITAET;

  const bitmap = await ladeBild(datei);
  const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height));
  const breite = Math.round(bitmap.width * faktor);
  const hoehe = Math.round(bitmap.height * faktor);

  const canvas = document.createElement('canvas');
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
  // Weiße Grundfläche: PNGs mit Transparenz würden sonst schwarz werden.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, breite, hoehe);
  ctx.drawImage(bitmap, 0, 0, breite, hoehe);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', qualitaet);
  const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
  return { dataUrl, bytes, breite, hoehe };
}

/**
 * Lädt die Datei als Bild.
 *
 * `createImageBitmap` ist der schnellere Weg und dreht EXIF-rotierte Fotos
 * korrekt (`imageOrientation: 'from-image'`) — ohne das liegen Hochkantfotos
 * vom iPhone quer. Ältere Browser fallen auf ein Image-Element zurück.
 */
async function ladeBild(datei: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(datei, { imageOrientation: 'from-image' });
    } catch {
      // HEIC scheitert hier in manchen Browsern — dann der Umweg unten.
    }
  }
  return new Promise((erfuellen, ablehnen) => {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => { URL.revokeObjectURL(url); erfuellen(bild); };
    bild.onerror = () => {
      URL.revokeObjectURL(url);
      ablehnen(new Error('Dieses Bildformat wird nicht unterstützt. Bitte JPG oder PNG verwenden.'));
    };
    bild.src = url;
  });
}
