/**
 * „Bezahlt" ist der Zustand, den drei Stellen gleichzeitig führen: der
 * Projektstatus (Kanban), `hydrocourtStatus` und `universalKanbanStatus`.
 *
 * Bis 08/2026 setzte jeder Weg nur seinen eigenen Teil — derselbe Vorgang war je
 * nach Ansicht bezahlt oder offen. markiereProjektAlsBezahlt zieht jetzt alle
 * mit, aber nur die Achsen, die es an diesem Projekt überhaupt gibt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProjekt = vi.fn();
const updateProjekt = vi.fn();
const updateDocument = vi.fn();
const logAktion = vi.fn();

vi.mock('../../config/appwrite', () => ({
  databases: { updateDocument: (...a: unknown[]) => updateDocument(...a) },
  DATABASE_ID: 'db',
  COLLECTIONS: { PROJEKTE: 'projekte' },
}));
vi.mock('../auditService', () => ({
  auditService: { logAktion: (...a: unknown[]) => logAktion(...a) },
  bearbeiterStempel: () => ({}),
  erstellerStempel: () => ({}),
}));
vi.mock('../nummerierungService', () => ({ generiereNaechsteDokumentnummer: vi.fn() }));
vi.mock('../../utils/appwritePagination', () => ({ loadAllDocuments: vi.fn() }));
vi.mock('../saisonplanungService', () => ({ saisonplanungService: {} }));
vi.mock('../kundenListeService', () => ({ kundenListeService: {} }));
vi.mock('../platzbauerverwaltungService', () => ({ platzbauerverwaltungService: {} }));

import { projektService } from '../projektService';

// Die Nebenachsen liegen im data-JSON; der Ausgangsstand kommt aus der Antwort
// des Top-Level-Writes.
const antwortMit = (daten: Record<string, unknown>) => ({
  $id: 'p1', projektName: 'TC Musterstadt', status: 'bezahlt', data: JSON.stringify(daten),
});

beforeEach(() => {
  vi.clearAllMocks();
  updateDocument.mockResolvedValue(antwortMit({}));
  updateProjekt.mockResolvedValue({ id: 'p1', status: 'bezahlt' });
  vi.spyOn(projektService, 'getProjekt').mockImplementation((...a) => getProjekt(...a));
  vi.spyOn(projektService, 'updateProjekt').mockImplementation((...a) => updateProjekt(...a));
});

describe('markiereProjektAlsBezahlt', () => {
  it('zieht die Hydrocourt-Achse mit, wenn sie am Projekt existiert', async () => {
    updateDocument.mockResolvedValue(antwortMit({ hydrocourtStatus: 'rechnungsstellung' }));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).toHaveBeenCalledWith('p1', { hydrocourtStatus: 'bezahlt' });
  });

  it('zieht die Universal-Achse mit, wenn sie am Projekt existiert', async () => {
    updateDocument.mockResolvedValue(antwortMit({ universalKanbanStatus: 'rechnungsstellung' }));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).toHaveBeenCalledWith('p1', { universalKanbanStatus: 'bezahlt' });
  });

  it('hängt einem reinen Ziegelmehl-Projekt keine fremde Achse an', async () => {
    updateDocument.mockResolvedValue(antwortMit({}));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).not.toHaveBeenCalled();
  });

  it('schreibt eine bereits bezahlte Achse nicht erneut', async () => {
    updateDocument.mockResolvedValue(antwortMit({ hydrocourtStatus: 'bezahlt' }));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).not.toHaveBeenCalled();
  });

  it('setzt Projektstatus und Bezahldatum in jedem Fall', async () => {
    updateDocument.mockResolvedValue(antwortMit({}));
    await projektService.markiereProjektAlsBezahlt('p1', '2026-03-15');
    expect(updateDocument).toHaveBeenCalledWith(
      'db', 'projekte', 'p1',
      expect.objectContaining({ status: 'bezahlt', bezahltAm: '2026-03-15' })
    );
  });

  it('markiert auch dann als bezahlt, wenn die Nebenachse nicht schreibbar ist', async () => {
    // Ein zu großer data-Blob darf den Bezahlt-Vermerk nicht verhindern — der
    // Projektstatus ist die führende Wahrheit.
    updateDocument.mockResolvedValue(antwortMit({ hydrocourtStatus: 'rechnungsstellung' }));
    updateProjekt.mockRejectedValue(new Error('data zu groß'));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateDocument).toHaveBeenCalledWith(
      'db', 'projekte', 'p1',
      expect.objectContaining({ status: 'bezahlt' })
    );
  });

  it('rührt die Nebenachse NICHT an, wenn der Projektstatus nicht geschrieben werden konnte', async () => {
    // Der gefährliche Halbzustand: Nebenachse steht auf „bezahlt", während Kanban
    // und Debitoren den Vorgang weiter als offen führen — und niemand sieht es.
    // Deshalb muss der führende Schreibvorgang zuerst kommen.
    updateDocument.mockRejectedValue(new Error('Netzwerkfehler'));
    await expect(projektService.markiereProjektAlsBezahlt('p1')).rejects.toThrow();
    expect(updateProjekt).not.toHaveBeenCalled();
  });

  it('kommt ohne zusätzlichen Leseaufruf aus', async () => {
    // Der Ausgangsstand steckt schon in der Antwort des Schreibvorgangs. Bei einer
    // Sammelzahlung über hundert Rechnungen ist jeder gesparte Roundtrip spürbar.
    updateDocument.mockResolvedValue(antwortMit({ hydrocourtStatus: 'rechnungsstellung' }));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(getProjekt).not.toHaveBeenCalled();
  });
});
