import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Gauge,
  History,
  ImagePlus,
  Settings2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  MindmapBoard,
  MindmapDurchfuehrung,
  MindmapGeraet,
} from '../../types/mindmap';
import {
  createDurchfuehrung,
  deleteDurchfuehrung,
  getTaskBildUrl,
  listDurchfuehrungen,
  updateBoard,
  updateGeraet,
  uploadTaskBild,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import { prozessFaelligkeit } from './mindmapUtils';

interface WartungPanelProps {
  board: MindmapBoard;
  geraete: MindmapGeraet[];
  userName: string;
  onBoardChange: (board: MindmapBoard) => void;
  onGeraetChange: (geraet: MindmapGeraet) => void;
}

const inputClasses =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text';

/**
 * Wartungs-Leiste für Prozess-Boards: Gerät/Betriebsstunden, Intervall,
 * Fälligkeit, Zuständigkeit + Durchführungs-Dokumentation und Historie.
 */
const WartungPanel = ({
  board,
  geraete,
  userName,
  onBoardChange,
  onGeraetChange,
}: WartungPanelProps) => {
  const [settingsOffen, setSettingsOffen] = useState(false);
  const [durchfuehrungOffen, setDurchfuehrungOffen] = useState(false);
  const [historieOffen, setHistorieOffen] = useState(false);
  const [durchfuehrungen, setDurchfuehrungen] = useState<MindmapDurchfuehrung[]>([]);

  // Durchführungs-Formular
  const [dfNotizen, setDfNotizen] = useState('');
  const [dfMinuten, setDfMinuten] = useState('');
  const [dfStunden, setDfStunden] = useState('');
  const [dfBilder, setDfBilder] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const faelligkeit = prozessFaelligkeit(board, geraete);
  const geraet = geraete.find((g) => g.id === board.geraetId);

  useEffect(() => {
    listDurchfuehrungen(board.id)
      .then(setDurchfuehrungen)
      .catch(() => undefined);
  }, [board.id]);

  const patchBoard = (patch: Partial<MindmapBoard>) => {
    const updated = { ...board, ...patch };
    onBoardChange(updated);
    updateBoard(updated).catch((error) => {
      console.error('❌ Wartungseinstellungen nicht gespeichert:', error);
      toast.error('Einstellungen konnten nicht gespeichert werden');
    });
  };

  const oeffneDurchfuehrung = () => {
    setDfNotizen('');
    setDfMinuten('');
    setDfStunden(geraet ? String(geraet.betriebsstunden) : '');
    setDfBilder([]);
    setDurchfuehrungOffen(true);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const neu: string[] = [];
      for (const file of Array.from(files)) {
        neu.push(await uploadTaskBild(file));
      }
      setDfBilder((prev) => [...prev, ...neu]);
    } catch (error) {
      console.error('❌ Bild-Upload fehlgeschlagen:', error);
      toast.error(error instanceof Error ? error.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const speichereDurchfuehrung = async () => {
    if (speichert) return;
    setSpeichert(true);
    try {
      const stunden = parseInt(dfStunden, 10) || 0;
      const eintrag = await createDurchfuehrung({
        boardId: board.id,
        geraetId: board.geraetId ?? '',
        datum: format(new Date(), 'yyyy-MM-dd'),
        person: userName,
        notizen: dfNotizen.trim(),
        minuten: parseInt(dfMinuten, 10) || 0,
        stundenBeiDurchfuehrung: stunden,
        bilderIds: dfBilder,
      });
      setDurchfuehrungen((prev) => [eintrag, ...prev]);

      // Betriebsstunden des Geräts auf den dokumentierten Stand bringen
      if (geraet && stunden > geraet.betriebsstunden) {
        const aktualisiert = {
          ...geraet,
          betriebsstunden: stunden,
          aktualisiertAm: format(new Date(), 'yyyy-MM-dd'),
        };
        onGeraetChange(aktualisiert);
        await updateGeraet(aktualisiert).catch(() => undefined);
      }

      // Fälligkeit neu stellen: dokumentierter Stand + Intervall
      if (board.intervallStunden && board.geraetId) {
        const naechste = stunden + board.intervallStunden;
        patchBoard({ faelligBeiStunden: naechste });
        toast.success(`Durchführung dokumentiert — nächste Fälligkeit bei ${naechste.toLocaleString('de-DE')} h`);
      } else {
        toast.success('Durchführung dokumentiert');
      }
      setDurchfuehrungOffen(false);
    } catch (error) {
      console.error('❌ Durchführung nicht gespeichert:', error);
      toast.error('Durchführung konnte nicht gespeichert werden');
    } finally {
      setSpeichert(false);
    }
  };

  const loescheEintrag = (eintrag: MindmapDurchfuehrung) => {
    setDurchfuehrungen((prev) => prev.filter((d) => d.id !== eintrag.id));
    deleteDurchfuehrung(eintrag).catch(() => toast.error('Eintrag nicht gelöscht'));
  };

  const zustaendige = getCachedUsersList();

  return (
    <>
      {/* Wartungs-Leiste */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm dark:border-dark-border dark:bg-dark-surface">
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-dark-textMuted">
          <Gauge className="h-4 w-4 text-blue-500" />
          {geraet ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-dark-text">
                {geraet.name}
              </span>
              · {geraet.betriebsstunden.toLocaleString('de-DE')} h
            </>
          ) : (
            'Kein Gerät verknüpft'
          )}
        </span>
        {!!board.intervallStunden && (
          <span className="text-gray-600 dark:text-dark-textMuted">
            Intervall: alle {board.intervallStunden.toLocaleString('de-DE')} h
          </span>
        )}
        {faelligkeit && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              faelligkeit.faellig
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-dark-accentRed'
                : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-dark-accentGreen'
            }`}
          >
            {faelligkeit.faellig
              ? `FÄLLIG (seit ${Math.abs(faelligkeit.restStunden).toLocaleString('de-DE')} h)`
              : `fällig bei ${board.faelligBeiStunden?.toLocaleString('de-DE')} h · noch ${faelligkeit.restStunden.toLocaleString('de-DE')} h`}
          </span>
        )}
        {board.zustaendig && (
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-textMuted">
            <UserRound className="h-3.5 w-3.5" />
            {board.zustaendig}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setHistorieOffen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
          >
            <History className="h-4 w-4" />
            Historie ({durchfuehrungen.length})
          </button>
          <button
            onClick={() => setSettingsOffen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
          >
            <Settings2 className="h-4 w-4" />
            Wartung einstellen
          </button>
          <button
            onClick={oeffneDurchfuehrung}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-green-700 hover:to-emerald-700"
          >
            <CircleCheck className="h-4 w-4" />
            Durchführung dokumentieren
          </button>
        </div>
      </div>

      {/* Dialog: Wartung einstellen */}
      {settingsOffen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSettingsOffen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                Wartung einstellen
              </h2>
              <button
                onClick={() => setSettingsOffen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                  Gerät (Betriebsstunden-Zähler)
                </label>
                <select
                  value={board.geraetId ?? ''}
                  onChange={(e) => patchBoard({ geraetId: e.target.value })}
                  className={inputClasses}
                >
                  <option value="">— kein Gerät —</option>
                  {geraete.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.betriebsstunden.toLocaleString('de-DE')} h)
                    </option>
                  ))}
                </select>
                {geraete.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-dark-textSubtle">
                    Geräte legst du auf der Board-Übersicht unter „Geräte &
                    Betriebsstunden" an.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                    Intervall (Stunden)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={board.intervallStunden || ''}
                    onChange={(e) =>
                      patchBoard({ intervallStunden: parseInt(e.target.value, 10) || 0 })
                    }
                    placeholder="z. B. 250"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                    Fällig bei (Stunden-Stand)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={board.faelligBeiStunden || ''}
                    onChange={(e) =>
                      patchBoard({
                        faelligBeiStunden: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="z. B. 1400"
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                  Zuständig für die Durchführung
                </label>
                <input
                  type="text"
                  list="wartung-zustaendige"
                  value={board.zustaendig ?? ''}
                  onChange={(e) => patchBoard({ zustaendig: e.target.value })}
                  placeholder="Wer führt den Prozess aus?"
                  className={inputClasses}
                />
                <datalist id="wartung-zustaendige">
                  {zustaendige.map((u) => (
                    <option key={u.$id} value={u.name} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Durchführung dokumentieren */}
      {durchfuehrungOffen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDurchfuehrungOffen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                Durchführung dokumentieren
              </h2>
              <button
                onClick={() => setDurchfuehrungOffen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                {format(new Date(), 'dd.MM.yyyy')} · durchgeführt von{' '}
                <span className="font-semibold">{userName || 'unbekannt'}</span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                {geraet && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                      Betriebsstunden-Stand ({geraet.name})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={dfStunden}
                      onChange={(e) => setDfStunden(e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                    Zeitaufwand (Minuten)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={dfMinuten}
                    onChange={(e) => setDfMinuten(e.target.value)}
                    placeholder="z. B. 90"
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                  Was wurde gemacht / Auffälligkeiten
                </label>
                <textarea
                  value={dfNotizen}
                  onChange={(e) => setDfNotizen(e.target.value)}
                  rows={4}
                  placeholder="z. B. Öl gewechselt, Filter erneuert, leichtes Spiel am Gelenk festgestellt…"
                  className={`${inputClasses} resize-y`}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                    Bilder ({dfBilder.length})
                  </label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-dark-elevated dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {uploading ? 'Lädt hoch…' : 'Bild hochladen'}
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
                {dfBilder.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {dfBilder.map((fileId) => (
                      <img
                        key={fileId}
                        src={getTaskBildUrl(fileId, true)}
                        alt="Durchführungs-Bild"
                        className="aspect-video w-full rounded-lg border border-gray-200 object-cover dark:border-dark-border"
                      />
                    ))}
                  </div>
                )}
              </div>
              {!!board.intervallStunden && geraet && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-dark-accent">
                  Nächste Fälligkeit wird automatisch auf{' '}
                  <span className="font-semibold">
                    {((parseInt(dfStunden, 10) || 0) + board.intervallStunden).toLocaleString('de-DE')}{' '}
                    h
                  </span>{' '}
                  gestellt.
                </p>
              )}
              <button
                onClick={speichereDurchfuehrung}
                disabled={speichert || uploading}
                className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
              >
                {speichert ? 'Wird gespeichert…' : 'Durchführung speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Historie */}
      {historieOffen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setHistorieOffen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                Durchführungs-Historie
              </h2>
              <button
                onClick={() => setHistorieOffen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {durchfuehrungen.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-dark-textSubtle">
                Noch keine Durchführung dokumentiert.
              </p>
            ) : (
              <div className="space-y-3">
                {durchfuehrungen.map((d) => (
                  <div
                    key={d.id}
                    className="group rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                  >
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-textMuted">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {d.datum ? format(parseISO(d.datum), 'dd.MM.yyyy') : '—'}
                      {d.person && (
                        <>
                          <UserRound className="ml-2 h-3.5 w-3.5" />
                          {d.person}
                        </>
                      )}
                      {d.stundenBeiDurchfuehrung > 0 && (
                        <>
                          <Gauge className="ml-2 h-3.5 w-3.5" />
                          {d.stundenBeiDurchfuehrung.toLocaleString('de-DE')} h
                        </>
                      )}
                      {d.minuten > 0 && (
                        <>
                          <Clock className="ml-2 h-3.5 w-3.5" />
                          {d.minuten} min
                        </>
                      )}
                      <button
                        onClick={() => loescheEintrag(d)}
                        title="Eintrag löschen"
                        className="ml-auto rounded p-0.5 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100 dark:text-dark-textSubtle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {d.notizen && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-dark-text">
                        {d.notizen}
                      </p>
                    )}
                    {d.bilderIds.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {d.bilderIds.map((fileId) => (
                          <a
                            key={fileId}
                            href={getTaskBildUrl(fileId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={getTaskBildUrl(fileId, true)}
                              alt="Durchführungs-Bild"
                              loading="lazy"
                              className="aspect-video w-full rounded-lg border border-gray-200 object-cover dark:border-dark-border"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default WartungPanel;
