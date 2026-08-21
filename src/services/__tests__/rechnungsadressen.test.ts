/**
 * Wer die Rechnung bekommt, ist keine Formatierungsfrage — es ist die Frage,
 * wer zahlt. Beim Ziegelmehl fallen Rechnungs- und Lieferadresse in zwei
 * verschiedenen Konstellationen auseinander, und beide sind alltäglich.
 *
 * Diese Tests halten die Regeln fest, weil sie ab jetzt von zwei Seiten benutzt
 * werden: von der Projektakte und vom Sammellauf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadKunde = vi.fn();

vi.mock('../saisonplanungService', () => ({
  saisonplanungService: { loadKunde: (...a: unknown[]) => loadKunde(...a) },
}));
vi.mock('../pdfHelpers', () => ({
  formatAdresszeile: (plz: string, ort: string) => `${plz} ${ort}`.trim(),
}));

import { ermittleRechnungsAdressen } from '../rechnungsadressenService';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'lieferschein', saisonjahr: 2026, kundenname: 'TC Musterstadt', ...teil } as Projekt);

const kunde = (teil: Record<string, unknown>) => ({
  name: 'TC Musterstadt',
  kundennummer: 'K-100',
  rechnungsadresse: { strasse: 'Hauptstr. 1', plz: '97070', ort: 'Würzburg', land: 'DE' },
  lieferadresse: { strasse: 'Hauptstr. 1', plz: '97070', ort: 'Würzburg', land: 'DE' },
  ...teil,
});

beforeEach(() => {
  vi.clearAllMocks();
  loadKunde.mockResolvedValue(null);
});

describe('Bezugsweg Platzbauer — der Verein bestellt, der Platzbauer zahlt', () => {
  it('rechnet an den Platzbauer und liefert an den Verein', async () => {
    loadKunde.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'pb-1'
          ? kunde({
              name: 'Garten- und Landschaftsbau Muster',
              kundennummer: 'PB-7',
              rechnungsadresse: { strasse: 'Baustr. 9', plz: '97440', ort: 'Werneck', land: 'DE' },
            })
          : kunde({
              name: 'TC Musterstadt',
              lieferadresse: { strasse: 'Am Sportplatz 2', plz: '97070', ort: 'Würzburg', land: 'DE' },
            })
      )
    );

    const a = await ermittleRechnungsAdressen(
      projekt({ kundeId: 'k-1', bezugsweg: 'platzbauer', platzbauerId: 'pb-1' })
    );

    expect(a.regel).toBe('bezugsweg_platzbauer');
    expect(a.kundenname).toBe('Garten- und Landschaftsbau Muster');
    expect(a.kundenstrasse).toBe('Baustr. 9');
    expect(a.kundennummer).toBe('PB-7');
    expect(a.lieferadresseAbweichend).toBe(true);
    expect(a.lieferadresseName).toBe('TC Musterstadt');
    expect(a.lieferadresseStrasse).toBe('Am Sportplatz 2');
  });

  it('fällt auf die Projektdaten zurück, wenn der Platzbauer keine Rechnungsadresse hat', async () => {
    // Lieber die Adresse am Projekt als eine leere Rechnungsanschrift.
    loadKunde.mockImplementation((id: string) =>
      Promise.resolve(id === 'pb-1' ? { name: 'PB ohne Adresse' } : null)
    );
    const a = await ermittleRechnungsAdressen(
      projekt({
        kundeId: 'k-1',
        bezugsweg: 'platzbauer',
        platzbauerId: 'pb-1',
        kundenstrasse: 'Projektstr. 5',
      })
    );
    expect(a.regel).toBe('nur_projektdaten');
    expect(a.kundenstrasse).toBe('Projektstr. 5');
  });
});

describe('Platzbauerprojekt — Rechnungsadresse steht schon am Projekt', () => {
  it('überschreibt die Projektadresse NICHT mit dem Kunden', async () => {
    // Der Kunde ist hier der Verein. Würde man ihn als Rechnungsempfänger
    // eintragen, ginge die Rechnung an den Falschen.
    loadKunde.mockResolvedValue(
      kunde({
        name: 'TC Verein',
        lieferadresse: { strasse: 'Am Sportplatz 2', plz: '97070', ort: 'Würzburg', land: 'DE' },
      })
    );
    const a = await ermittleRechnungsAdressen(
      projekt({
        kundeId: 'k-1',
        istPlatzbauerprojekt: true,
        kundenname: 'Platzbau Muster GmbH',
        kundenstrasse: 'Baustr. 9',
        kundenPlzOrt: '97440 Werneck',
      })
    );
    expect(a.regel).toBe('platzbauerprojekt');
    expect(a.kundenname).toBe('Platzbau Muster GmbH');
    expect(a.kundenstrasse).toBe('Baustr. 9');
    expect(a.lieferadresseName).toBe('TC Verein');
  });
});

describe('Direktgeschäft', () => {
  it('nimmt die Rechnungsadresse vom Kunden', async () => {
    loadKunde.mockResolvedValue(kunde({}));
    const a = await ermittleRechnungsAdressen(projekt({ kundeId: 'k-1' }));
    expect(a.regel).toBe('direkt');
    expect(a.kundenstrasse).toBe('Hauptstr. 1');
    expect(a.kundennummer).toBe('K-100');
  });

  it('weist die Lieferadresse nur aus, wenn sie wirklich abweicht', async () => {
    // Sonst stünde dieselbe Anschrift zweimal auf der Rechnung.
    loadKunde.mockResolvedValue(kunde({}));
    const gleich = await ermittleRechnungsAdressen(projekt({ kundeId: 'k-1' }));
    expect(gleich.lieferadresseAbweichend).toBe(false);

    loadKunde.mockResolvedValue(
      kunde({ lieferadresse: { strasse: 'Am Sportplatz 2', plz: '97080', ort: 'Würzburg', land: 'DE' } })
    );
    const anders = await ermittleRechnungsAdressen(projekt({ kundeId: 'k-1' }));
    expect(anders.lieferadresseAbweichend).toBe(true);
    expect(anders.lieferadresseStrasse).toBe('Am Sportplatz 2');
  });
});

describe('Ohne Kundendatensatz', () => {
  it('nimmt die Projektdaten, statt zu scheitern', async () => {
    // Shop-Projekte führen ihre Adressen ausschließlich am Projekt.
    const a = await ermittleRechnungsAdressen(
      projekt({
        kundeId: 'shop-173-eigen',
        kundenname: 'TC Rheinböllen',
        kundenstrasse: 'Shopstr. 3',
        kundenPlzOrt: '55494 Rheinböllen',
      })
    );
    expect(a.regel).toBe('nur_projektdaten');
    expect(a.kundenname).toBe('TC Rheinböllen');
    expect(a.kundenstrasse).toBe('Shopstr. 3');
  });

  it('übersteht einen Fehler beim Kundenladen', async () => {
    loadKunde.mockRejectedValue(new Error('Netzwerk'));
    const a = await ermittleRechnungsAdressen(projekt({ kundeId: 'k-1', kundenstrasse: 'Projektstr. 5' }));
    expect(a.regel).toBe('nur_projektdaten');
    expect(a.kundenstrasse).toBe('Projektstr. 5');
  });
});
