import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Grid3X3,
  List,
  Paperclip,
  Plus,
  FileUp,
  Loader2,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import { WikiFile, getFileTypeCategory, FILE_TYPE_CONFIG } from '../../types/wiki';
import WikiFileCard from './WikiFileCard';

interface WikiFilesPanelProps {
  files: WikiFile[];
  pageId?: string; // Optional, für zukünftige Erweiterungen
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (file: WikiFile) => void;
  uploading?: boolean;
  className?: string;
}

const WikiFilesPanel: React.FC<WikiFilesPanelProps> = ({
  files,
  onUpload,
  onDelete,
  uploading = false,
  className = '',
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await onUpload(droppedFiles);
    }
  }, [onUpload]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      await onUpload(Array.from(selectedFiles));
    }
    e.target.value = '';
  }, [onUpload]);

  // Gruppiere Dateien nach Typ
  const groupedFiles = files.reduce((acc, file) => {
    const type = getFileTypeCategory(file.fileName);
    if (!acc[type]) acc[type] = [];
    acc[type].push(file);
    return acc;
  }, {} as Record<string, WikiFile[]>);

  const hasFiles = files.length > 0;

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg shadow-red-500/20">
            <Paperclip className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text">
              Dateianhänge
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
              {files.length} {files.length === 1 ? 'Datei' : 'Dateien'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          {hasFiles && (
            <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     rounded-xl text-sm font-medium text-white shadow-lg shadow-red-500/20
                     hover:shadow-xl hover:shadow-red-500/30 transition-all"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Hochladen</span>
          </button>
        </div>
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center
                       bg-gradient-to-br from-red-500/10 to-orange-500/10
                       border-2 border-dashed border-red-500 rounded-2xl backdrop-blur-sm">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl
                           flex items-center justify-center animate-bounce shadow-xl shadow-red-500/30">
              <FileUp className="w-10 h-10 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-dark-text mb-1">
              Dateien hier ablegen
            </p>
            <p className="text-gray-500 dark:text-dark-textMuted">
              PDF, Word, Excel, Bilder und mehr
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasFiles && !uploading && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer group p-12 border-2 border-dashed border-gray-300 dark:border-slate-700
                     hover:border-red-400 dark:hover:border-red-600
                     rounded-2xl bg-gray-50/50 dark:bg-slate-800/30
                     hover:bg-red-50/50 dark:hover:bg-red-900/10
                     transition-all duration-300"
        >
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-gray-200 to-gray-300
                           dark:from-slate-700 dark:to-slate-600
                           group-hover:from-red-100 group-hover:to-orange-100
                           dark:group-hover:from-red-900/30 dark:group-hover:to-orange-900/30
                           rounded-2xl flex items-center justify-center transition-all duration-300">
              <FolderOpen className="w-10 h-10 text-gray-400 group-hover:text-red-500 transition-colors" />
            </div>
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Keine Dateien angehängt
            </p>
            <p className="text-gray-500 dark:text-dark-textMuted mb-4 max-w-sm mx-auto">
              Ziehe Dateien hierher oder klicke zum Hochladen.
              <br />
              <span className="text-xs">PDF, Word, Excel, Bilder und mehr</span>
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800
                           border border-gray-200 dark:border-slate-700 rounded-lg
                           group-hover:border-red-300 dark:group-hover:border-red-800 transition-colors">
              <Upload className="w-4 h-4 text-gray-500 group-hover:text-red-500" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-red-600">
                Dateien auswählen
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Uploading State */}
      {uploading && (
        <div className="flex items-center justify-center p-8 bg-gradient-to-r from-red-50 to-orange-50
                       dark:from-red-900/10 dark:to-orange-900/10 rounded-2xl border border-red-200/50 dark:border-red-800/50">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl animate-pulse"></div>
              <div className="absolute inset-2 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Wird hochgeladen...
            </p>
          </div>
        </div>
      )}

      {/* Files Grid */}
      {hasFiles && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {files.map(file => (
            <WikiFileCard
              key={file.$id}
              file={file}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Files List */}
      {hasFiles && viewMode === 'list' && (
        <div className="space-y-2">
          {files.map(file => (
            <WikiFileCard
              key={file.$id}
              file={file}
              onDelete={onDelete}
              compact
            />
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {hasFiles && (
        <div className="mt-6 p-4 bg-gradient-to-r from-gray-50 to-gray-100
                       dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Übersicht
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(groupedFiles).map(([type, typeFiles]) => {
              const config = FILE_TYPE_CONFIG[type as keyof typeof FILE_TYPE_CONFIG];
              return (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${config.bgColor} ${config.color}`}
                >
                  {config.label}
                  <span className="px-1.5 py-0.5 bg-white/50 dark:bg-black/20 rounded-md">
                    {typeFiles.length}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.mp3,.zip,.rar"
      />
    </div>
  );
};

export default WikiFilesPanel;
