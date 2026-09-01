/**
 * Signaturbilder dürfen nicht verzerrt beim Empfänger ankommen.
 *
 * Das Hydrocourt-Banner (714 × 229) erschien in der Mail zehnfach statt
 * dreifach breiter als hoch. Ursache war eine Regel im Mail-Stylesheet:
 * `.signature img { max-height: 60px }` — gedacht als Deckel für das Logo,
 * traf sie jedes Bild. Der Reparaturversuch über einen Attributselektor
 * (`img[alt*="ydrocourt"] { max-height: none !important }`) verpuffte, weil
 * Gmail und Outlook Attributselektoren aus <style>-Blöcken entfernen. Der
 * Inline-Style am Bild half ebenfalls nicht: Er setzte `height:auto`, aber
 * `max-height` ist eine eigene Eigenschaft und blieb bestehen.
 *
 * Konsequenz: Maße gehören ans Bild, nicht ins Stylesheet.
 */
import { describe, it, expect } from 'vitest';
import { wrapInEmailTemplate } from '../emailSendService';

/** So steht das Banner in der gepflegten Signatur (Stammdaten → E-Mail-Vorlagen). */
const BANNER =
  '<img src="https://example.test/banner.jpg" alt="Hydrocourt" width="500" height="160"' +
  ' style="width:500px;max-width:100%;height:auto;display:block;margin:12px 0;border:0;">';
const LOGO =
  '<img src="https://example.test/logo.png" alt="Tennismehl Logo Gesamt" width="270" height="145"' +
  ' style="max-width: 100%; height: auto;">';

/**
 * Das Stylesheet ohne Kommentare — geprüft wird, was der Mailclient anwendet.
 * Der Kommentar im Quelltext erklärt genau die Regel, die hier verboten ist,
 * und würde jede Textsuche darauf verfälschen.
 */
const stylesheet = (html: string): string =>
  (html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Mail-Stylesheet', () => {
  it('deckelt die Höhe von Signaturbildern nicht', () => {
    const css = stylesheet(wrapInEmailTemplate('<p>Text</p>', BANNER + LOGO));
    expect(css).not.toMatch(/max-height/i);
  });

  it('hält jedes Bild im Seitenverhältnis und im Rahmen', () => {
    const css = stylesheet(wrapInEmailTemplate('<p>Text</p>', BANNER));
    // Ohne height:auto zieht ein erzwungenes Maß das Bild in die Länge,
    // ohne max-width läuft es auf dem Telefon über den Rand hinaus.
    expect(css).toMatch(/img\s*\{[^}]*height:\s*auto/);
    expect(css).toMatch(/img\s*\{[^}]*max-width:\s*100%/);
  });

  it('verlässt sich nicht auf Attributselektoren, die Mailclients verwerfen', () => {
    const css = stylesheet(wrapInEmailTemplate('<p>Text</p>', BANNER));
    expect(css).not.toMatch(/\[alt\*=/);
  });
});

describe('Signaturbilder im Mailkörper', () => {
  it('reicht die gepflegten Maße unverändert durch', () => {
    const html = wrapInEmailTemplate('<p>Text</p>', BANNER + LOGO);
    expect(html).toContain(BANNER);
    expect(html).toContain(LOGO);
  });

  it('trägt Bannerbreite und -höhe im Verhältnis der Bilddatei', () => {
    // Die Bilddatei im Bucket misst 714 × 229; jede Abweichung über 1 px
    // wäre eine sichtbare Verzerrung.
    const tag = wrapInEmailTemplate('<p>Text</p>', BANNER).match(
      /<img[^>]*alt="Hydrocourt"[^>]*>/i
    )?.[0] ?? '';
    const breite = Number(tag.match(/\swidth="(\d+)"/)?.[1]);
    const hoehe = Number(tag.match(/\sheight="(\d+)"/)?.[1]);
    expect(breite).toBeGreaterThan(0);
    expect(hoehe).toBeCloseTo((breite / 714) * 229, 0);
  });
});
