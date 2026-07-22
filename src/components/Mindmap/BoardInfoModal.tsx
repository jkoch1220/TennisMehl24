import { useRef, useState } from 'react';
import { ImagePlus, Info, Loader2, Trash2, Workflow, X } from 'lucide-react';
import { toast } from 'sonner';
import { MindmapBoard } from '../../types/mindmap';
import {
  deleteTaskBild,
  getTaskBildUrl,
  uploadTaskBild,
} from '../../services/mindmapService';
import AutoGrowTextarea from './AutoGrowTextarea';

interface BoardInfoModalProps {
  board: MindmapBoard;
  onPatch: (fields: Partial<Pick<MindmapBoard, 'beschreibung' | 'bilderIds'>>) => void;
  onClose: () => void;
}

/**
 * Übersichtsseite eines Prozesses/Boards: Beschreibung + Bilder,
 * analog zur Task-Detailseite. Änderungen speichert der Aufrufer (debounced).
 */
const BoardInfoModal = ({ board, onPatch, onClose }: BoardInfoModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const neueIds: string[] = [];
      for (const file of Array.from(files)) {
        neueIds.push(await uploadTaskBild(file));
      }
      onPatch({ bilderIds: [...(board.bilderIds ?? []), ...neueIds] });
    } catch (error) {
      console.error('❌ Bild-Upload fehlgeschlagen:', error);
      toast.error(error instanceof Error ? error.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeBild = (fileId: string) => {
    onPatch({ bilderIds: (board.bilderIds ?? []).filter((id) => id !== fileId) });
    deleteTaskBild(fileId).catch(() => undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="flex items-start gap-3 border-b border-gray-100 p-5 dark:border-dark-border">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/40">
            {board.typ === 'prozess' ? (
              <Workflow className="h-5 w-5 text-orange-600 dark:text-dark-accentOrange" />
            ) : (
              <Info className="h-5 w-5 text-orange-600 dark:text-dark-accentOrange" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 dark:text-dark-textSubtle">
              {board.typ === 'prozess' ? 'Prozess-Übersicht' : 'Board-Übersicht'}
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
              {board.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            title="Schließen"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Beschreibung */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
              Beschreibung
            </label>
            <AutoGrowTextarea
              value={board.beschreibung ?? ''}
              onChange={(e) => onPatch({ beschreibung: e.target.value })}
              placeholder="Worum geht es bei diesem Prozess? Ziel, Auslöser, Besonderheiten…"
              className="min-h-28 max-h-[40vh] w-full overflow-y-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text"
            />
          </div>

          {/* Bilder */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                Bilder ({board.bilderIds?.length ?? 0})
              </label>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50 dark:bg-orange-900/30 dark:text-dark-accentOrange dark:hover:bg-orange-900/50"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                Bild hinzufügen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
            {(board.bilderIds?.length ?? 0) === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400 dark:border-dark-border dark:text-dark-textSubtle">
                Noch keine Bilder — z. B. Fotos vom Ablauf oder der Maschine
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(board.bilderIds ?? []).map((fileId) => (
                  <div key={fileId} className="group relative">
                    <img
                      src={getTaskBildUrl(fileId, true)}
                      alt=""
                      onClick={() => setGrossesBild(fileId)}
                      className="h-24 w-full cursor-zoom-in rounded-lg border border-gray-200 object-cover dark:border-dark-border"
                    />
                    <button
                      onClick={() => removeBild(fileId)}
                      title="Bild entfernen"
                      className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-dark-surface/90"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bild-Vollansicht */}
      {grossesBild && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
          onClick={(e) => {
            e.stopPropagation();
            setGrossesBild(null);
          }}
        >
          <img
            src={getTaskBildUrl(grossesBild)}
            alt=""
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};

export default BoardInfoModal;
