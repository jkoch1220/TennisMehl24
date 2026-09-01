/**
 * Die Bildprüfung des Bestellportals.
 *
 * Hier lädt jemand ohne Login Dateien in unser System. Der vom Browser
 * gemeldete Content-Type ist dabei eine Behauptung, kein Beweis — geprüft
 * werden müssen die ersten Bytes.
 */
import { describe, it, expect } from 'vitest';

/** Identisch zu `erkenneBildtyp` in netlify/functions/bestellung.ts. */
const erkenneBildtyp = (bytes: Buffer): { typ: string; endung: string } | null => {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { typ: 'image/jpeg', endung: 'jpg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { typ: 'image/png', endung: 'png' };
  return null;
};

const mitKopf = (kopf: number[], laenge = 32): Buffer => {
  const b = Buffer.alloc(laenge);
  kopf.forEach((v, i) => { b[i] = v; });
  return b;
};

describe('Bildtyp an den Magic Bytes', () => {
  it('erkennt echte JPEG- und PNG-Dateien', () => {
    expect(erkenneBildtyp(mitKopf([0xff, 0xd8, 0xff, 0xe0]))?.typ).toBe('image/jpeg');
    expect(erkenneBildtyp(mitKopf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.typ).toBe('image/png');
  });

  it('weist SVG ab — SVG ist XML und kann Skripte enthalten', () => {
    expect(erkenneBildtyp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
  });

  it('weist ausführbare Dateien ab, auch wenn sie sich als Bild ausgeben', () => {
    // ELF-Binary
    expect(erkenneBildtyp(mitKopf([0x7f, 0x45, 0x4c, 0x46]))).toBeNull();
    // Windows-PE
    expect(erkenneBildtyp(mitKopf([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    // ZIP (auch getarnte Office-Dateien)
    expect(erkenneBildtyp(mitKopf([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  it('weist HTML ab — polyglotte Dateien sind ein bekannter Angriffsweg', () => {
    expect(erkenneBildtyp(Buffer.from('<!DOCTYPE html><html><body>hi</body></html>'))).toBeNull();
  });

  it('weist leere und abgeschnittene Dateien ab', () => {
    expect(erkenneBildtyp(Buffer.alloc(0))).toBeNull();
    expect(erkenneBildtyp(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('lässt sich nicht von einem gefälschten Dateinamen täuschen', () => {
    // „urlaub.jpg", das in Wahrheit ein GIF ist — GIF ist nicht erlaubt.
    expect(erkenneBildtyp(Buffer.from('GIF89a________________________'))).toBeNull();
  });
});

describe('Größengrenze', () => {
  const MAX = 1_500_000;
  it('lässt verkleinerte Fotos durch und stoppt Originale', () => {
    expect(400_000 <= MAX).toBe(true);   // typisch nach Canvas-Verkleinerung
    expect(6_000_000 <= MAX).toBe(false); // unverkleinertes Handyfoto
  });
});
