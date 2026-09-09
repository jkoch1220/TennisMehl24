/**
 * Tests für den Frachtrechner-Hinweis auf Platzbauer-Angeboten.
 *
 * Der Text geht gedruckt an Kunden. Ein kaputter Link fällt niemandem auf,
 * bevor der erste Platzbauer anruft — deshalb hier festgenagelt.
 */
import { describe, it, expect } from 'vitest';
import { frachtrechnerHinweis } from '../vertragsklauseln';

describe('frachtrechnerHinweis', () => {
  it('baut die Adresse aus der übergebenen Basis-URL', () => {
    expect(frachtrechnerHinweis('https://tennismehl-portal.online')).toContain(
      'https://tennismehl-portal.online/frachtrechner'
    );
  });

  it('erzeugt keinen doppelten Schrägstrich bei URL mit Endschrägstrich', () => {
    // getPortalPublicUrl() schneidet ihn zwar selbst ab, aber die Funktion wird
    // auch direkt aufgerufen — „…online//frachtrechner" wäre ein toter Link.
    const text = frachtrechnerHinweis('https://tennismehl-portal.online/');
    expect(text).toContain('https://tennismehl-portal.online/frachtrechner');
    expect(text).not.toContain('//frachtrechner');
  });

  it('nennt die Route ohne Token und ohne Platzhalter', () => {
    const text = frachtrechnerHinweis('https://tennismehl-portal.online');
    // Der Rechner ist öffentlich: kein token=, keine kundeId, kein :param.
    expect(text).not.toMatch(/token=|kundeId|:\w+Id/);
  });

  it('weist die Berechnung als unverbindlich aus und nennt den Dieselvorbehalt', () => {
    const text = frachtrechnerHinweis('https://x.de');
    expect(text).toContain('unverbindlich');
    expect(text).toContain('Dieselzuschlag');
  });

  it('nennt die Spedition nicht beim Namen', () => {
    // Auf einem Kundenbeleg hat der Name unseres Frachtführers nichts verloren.
    expect(frachtrechnerHinweis('https://x.de')).not.toMatch(/raben/i);
  });
});
