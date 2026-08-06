import { describe, it, expect } from 'vitest';
import { istNichtGefunden, projektIdVon } from '../dispoBuchungService';
import type { Projekt } from '../../types/projekt';

describe('istNichtGefunden', () => {
  it('erkennt den Appwrite-404 am Code', () => {
    expect(istNichtGefunden({ code: 404, message: 'irgendwas' })).toBe(true);
  });

  it('erkennt den Appwrite-Typ document_not_found', () => {
    expect(istNichtGefunden({ type: 'document_not_found' })).toBe(true);
  });

  it('erkennt die Meldung, die Appwrite tatsächlich schickt', () => {
    // Wortlaut aus der Produktion:
    expect(
      istNichtGefunden(
        new Error("Document with the requested ID '6a746566000c7fd94dd8' could not be found.")
      )
    ).toBe(true);
  });

  it('hält andere Fehler auseinander', () => {
    expect(istNichtGefunden(new Error('Netzwerk nicht erreichbar'))).toBe(false);
    expect(istNichtGefunden({ code: 401, message: 'Unauthorized' })).toBe(false);
    expect(istNichtGefunden({ code: 500 })).toBe(false);
  });

  it('verträgt leere und untypisierte Werte', () => {
    expect(istNichtGefunden(null)).toBe(false);
    expect(istNichtGefunden(undefined)).toBe(false);
    expect(istNichtGefunden('Fehler')).toBe(false);
    expect(istNichtGefunden(404)).toBe(false);
  });
});

describe('projektIdVon', () => {
  it('bevorzugt die Appwrite-Dokument-ID', () => {
    expect(projektIdVon({ id: 'alt', $id: 'neu' } as unknown as Projekt)).toBe('neu');
  });

  it('nimmt die interne ID, wenn keine Dokument-ID vorliegt', () => {
    expect(projektIdVon({ id: 'alt' } as unknown as Projekt)).toBe('alt');
  });
});
