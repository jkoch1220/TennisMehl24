/**
 * Der PDF-Pfad der Abholung — die Stelle, an der im Werk nichts scheitern darf.
 *
 * Der wichtigste Test hier ist der auf die eingebettete Unterschrift: jsPDF
 * kann in Node keine PNGs einbetten ("Error while decompressing the data: -3"),
 * und ohne den pdf-lib-Nachtrag ginge ausgerechnet der Beleg verloren, den der
 * Kunde per E-Mail bekommt. Der Test misst deshalb nicht nur „PDF entstanden",
 * sondern dass wirklich ein Bild in der Seite steckt.
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  generiereAbholungNachweisPdf,
  haengeSeitenAn,
  zeichneUnterschriftEin,
} from '../liefernachweis';

/** PNG, wie es ein Browser-Canvas per toDataURL('image/png') liefert */
const CANVAS_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M+AFzCOKhhVMKoAAI5WEAEQ8CkGAAAAAElFTkSuQmCC',
    'base64'
  )
);

const basisDaten = {
  kundenname: 'TC Musterhausen e.V.',
  kundennummer: '10234',
  lieferscheinnummer: 'LS-2026-0815',
};

const positionen = [
  { bezeichnung: 'Tennissand 0/2 rot', menge: 12, einheit: 't' },
  { bezeichnung: 'Abdeckfolie PE', menge: 2, einheit: 'Stk' },
];

const zeitstempel = '2026-09-08T08:30:00.000Z';

const nachweis = (extra: Record<string, unknown> = {}) =>
  generiereAbholungNachweisPdf({
    daten: basisDaten,
    positionen,
    zeitstempel,
    abholerName: 'Max Muster',
    ...extra,
  });

/**
 * Zählt die im PDF eingebetteten Bild-Objekte (XObjects vom Subtype /Image).
 *
 * Die Unterschrift vom Canvas hat einen Alphakanal, deshalb legt pdf-lib dafür
 * ZWEI Objekte an: das Bild und die Transparenzmaske (SMask). Geprüft wird
 * daher „ist überhaupt ein Bild drin", nicht eine feste Zahl.
 */
const bildAnzahl = (bytes: Uint8Array): number =>
  (Buffer.from(bytes).toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;

describe('generiereAbholungNachweisPdf', () => {
  it('erzeugt ein lesbares PDF und meldet den Platz für die Unterschrift', async () => {
    const { pdf, unterschriftPlatz } = nachweis({ kennzeichen: 'WÜ-AB 123' });

    expect(pdf.length).toBeGreaterThan(500);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    // Der Platz muss auf einer existierenden Seite liegen, sonst zeichnet
    // pdf-lib ins Leere.
    expect(unterschriftPlatz.seite).toBe(0);
    expect(unterschriftPlatz.maxBreiteMm).toBeGreaterThan(0);
  });

  it('optionale Fotos bekommen eigene Seiten', async () => {
    const ohne = await PDFDocument.load(nachweis().pdf);
    const mit = await PDFDocument.load(nachweis({ fotoJpegBytes: CANVAS_PNG }).pdf);
    expect(mit.getPageCount()).toBe(ohne.getPageCount() + 1);
  });

  it('kommt ohne Kennzeichen aus', () => {
    expect(nachweis({ daten: { kundenname: 'TC Ohne Angaben' } }).pdf.length).toBeGreaterThan(500);
  });
});

describe('zeichneUnterschriftEin', () => {
  it('bettet die Unterschrift wirklich als Bild ein', async () => {
    const { pdf, unterschriftPlatz } = nachweis();
    expect(bildAnzahl(pdf)).toBe(0);

    const mitUnterschrift = await zeichneUnterschriftEin(pdf, CANVAS_PNG, unterschriftPlatz);
    expect(bildAnzahl(mitUnterschrift)).toBeGreaterThan(0);
    expect((await PDFDocument.load(mitUnterschrift)).getPageCount()).toBe(1);
  });

  it('gibt das PDF unverändert zurück, wenn das Bild unbrauchbar ist', async () => {
    // Ein defektes Bild darf den Nachweis nicht zerstören — Name, Zeitpunkt
    // und Positionen stehen weiterhin drin, das Bild liegt separat im Bucket.
    const { pdf, unterschriftPlatz } = nachweis();
    const kaputt = Uint8Array.from([1, 2, 3, 4]);
    await expect(zeichneUnterschriftEin(pdf, kaputt, unterschriftPlatz)).resolves.toEqual(pdf);
  });
});

describe('haengeSeitenAn', () => {
  it('stellt den Lieferschein voran und behält alle Seiten', async () => {
    const lieferschein = await PDFDocument.create();
    lieferschein.addPage();
    lieferschein.addPage();

    const { pdf } = nachweis();
    const kombiniert = await PDFDocument.load(await haengeSeitenAn(await lieferschein.save(), pdf));

    expect(kombiniert.getPageCount()).toBe(2 + (await PDFDocument.load(pdf)).getPageCount());
  });
});
