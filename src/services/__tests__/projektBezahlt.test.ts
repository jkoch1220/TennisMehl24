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

beforeEach(() => {
  vi.clearAllMocks();
  updateDocument.mockResolvedValue({
    $id: 'p1', projektName: 'TC Musterstadt', status: 'bezahlt', data: '{}',
  });
  // Die echten Methoden durch Spione ersetzen, ohne den Rest des Service zu mocken.
  vi.spyOn(projektService, 'getProjekt').mockImplementation((...a) => getProjekt(...a));
  vi.spyOn(projektService, 'updateProjekt').mockImplementation((...a) => updateProjekt(...a));
});

describe('markiereProjektAlsBezahlt', () => {
  it('zieht die Hydrocourt-Achse mit, wenn sie am Projekt existiert', async () => {
    getProjekt.mockResolvedValue({ id: 'p1', hydrocourtStatus: 'rechnungsstellung' });
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).toHaveBeenCalledWith('p1', { hydrocourtStatus: 'bezahlt' });
  });

  it('zieht die Universal-Achse mit, wenn sie am Projekt existiert', async () => {
    getProjekt.mockResolvedValue({ id: 'p1', universalKanbanStatus: 'rechnungsstellung' });
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).toHaveBeenCalledWith('p1', { universalKanbanStatus: 'bezahlt' });
  });

  it('hängt einem reinen Ziegelmehl-Projekt keine fremde Achse an', async () => {
    getProjekt.mockResolvedValue({ id: 'p1' });
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).not.toHaveBeenCalled();
  });

  it('schreibt eine bereits bezahlte Achse nicht erneut', async () => {
    getProjekt.mockResolvedValue({ id: 'p1', hydrocourtStatus: 'bezahlt' });
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateProjekt).not.toHaveBeenCalled();
  });

  it('setzt Projektstatus und Bezahldatum in jedem Fall', async () => {
    getProjekt.mockResolvedValue({ id: 'p1' });
    await projektService.markiereProjektAlsBezahlt('p1', '2026-03-15');
    expect(updateDocument).toHaveBeenCalledWith(
      'db', 'projekte', 'p1',
      expect.objectContaining({ status: 'bezahlt', bezahltAm: '2026-03-15' })
    );
  });

  it('markiert auch dann als bezahlt, wenn die Nebenachse nicht schreibbar ist', async () => {
    // Ein zu großer data-Blob darf den Bezahlt-Vermerk nicht verhindern — der
    // Projektstatus ist die führende Wahrheit.
    getProjekt.mockResolvedValue({ id: 'p1', hydrocourtStatus: 'rechnungsstellung' });
    updateProjekt.mockRejectedValue(new Error('data zu groß'));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateDocument).toHaveBeenCalledWith(
      'db', 'projekte', 'p1',
      expect.objectContaining({ status: 'bezahlt' })
    );
  });

  it('markiert auch dann als bezahlt, wenn das Projekt nicht lesbar ist', async () => {
    getProjekt.mockRejectedValue(new Error('not found'));
    await projektService.markiereProjektAlsBezahlt('p1');
    expect(updateDocument).toHaveBeenCalled();
  });
});
