import { describe, it, expect } from 'vitest';
import {
  getFileViewUrl,
  getFileDownloadUrl,
} from '../platzbauerprojektabwicklungDokumentService';

/**
 * Regression: Beim Öffnen eines alten Platzbauer-Angebots erschien im neuen Tab
 * Appwrites Fehler-JSON statt eines PDFs:
 *
 *   {"message":"Invalid `fileId` param: UID must contain at most 36 chars …"}
 *   …/storage/buckets/mock_platzbauer-dateien/files//view?project=tennismehl24
 *
 * Die `dateiId` war leer, die URL wurde trotzdem gebaut — `files//view`.
 * Das ist kein Datenfehler: In der Sandbox werden Dokumentzeilen kopiert, die
 * PDFs aber bewusst nicht (`scripts/copy-to-mock-db.ts` → kappeDateiVerweise).
 * Der Vereins-Zweig prüfte darauf, der Platzbauer-Zweig nicht.
 *
 * Ohne URL bleibt der Link im UI deaktiviert („kein PDF") — das ist der Vertrag,
 * auf den sich PlatzbauerDokumentVerlauf, Lieferschein- und Rechnung-Tab stützen.
 */
describe('Platzbauer-Datei-URLs', () => {
  it('gibt bei leerer dateiId keine URL zurück', () => {
    expect(getFileViewUrl('')).toBe('');
    expect(getFileDownloadUrl('')).toBe('');
  });

  it('gibt auch bei fehlender dateiId keine URL zurück', () => {
    // Altbestand kann das Feld ganz auslassen; TS-Typ sagt string, Laufzeit nicht.
    expect(getFileViewUrl(undefined as unknown as string)).toBe('');
    expect(getFileDownloadUrl(null as unknown as string)).toBe('');
  });

  it('baut niemals eine URL mit leerem Dateisegment', () => {
    for (const leer of ['', undefined, null]) {
      expect(getFileViewUrl(leer as unknown as string)).not.toContain('/files//');
      expect(getFileDownloadUrl(leer as unknown as string)).not.toContain('/files//');
    }
  });

  it('liefert für eine echte dateiId die Anzeige- und Download-URL', () => {
    const id = '68b1c0f4001a2b3c4d5e';

    expect(getFileViewUrl(id)).toContain(`/buckets/platzbauer-dateien/files/${id}/view`);
    expect(getFileDownloadUrl(id)).toContain(`/buckets/platzbauer-dateien/files/${id}/download`);
  });
});
