import { useState } from 'react';
import {
  Download,
  Trash2,
  Eye,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  File,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import { WikiFile, getFileTypeCategory, FILE_TYPE_CONFIG, FileTypeCategory } from '../../types/wiki';
import { wikiFileService } from '../../services/wikiService';

interface WikiFileCardProps {
  file: WikiFile;
  onDelete: (file: WikiFile) => void;
  compact?: boolean;
}

// Icon-Mapping für Dateitypen
const FileTypeIcon: React.FC<{ type: FileTypeCategory; className?: string }> = ({ type, className = 'w-8 h-8' }) => {
  const iconProps = { className };

  switch (type) {
    case 'pdf':
      return <FileText {...iconProps} />;
    case 'word':
      return <FileText {...iconProps} />;
    case 'excel':
      return <FileSpreadsheet {...iconProps} />;
    case 'powerpoint':
      return <Presentation {...iconProps} />;
    case 'image':
      return <FileImage {...iconProps} />;
    case 'video':
      return <FileVideo {...iconProps} />;
    case 'audio':
      return <FileAudio {...iconProps} />;
    case 'archive':
      return <FileArchive {...iconProps} />;
    case 'code':
      return <FileCode {...iconProps} />;
    case 'text':
      return <FileText {...iconProps} />;
    default:
      return <File {...iconProps} />;
  }
};

// Premium PDF-Badge
const PDFBadge = () => (
  <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 rounded-md flex items-center justify-center shadow-lg">
    <span className="text-[8px] font-black text-white">PDF</span>
  </div>
);

// Format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Format date
const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Lightbox Modal für Bilder
const ImageLightbox: React.FC<{
  src: string;
  alt: string;
  onClose: () => void;
}> = ({ src, alt, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.25)); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors"
        >
          <ZoomOut className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.25)); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setRotation(r => r + 90); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors"
        >
          <RotateCw className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-red-500/80 rounded-lg backdrop-blur-sm transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain transition-transform duration-300"
        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
      />

      {/* File name */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg">
        <span className="text-white text-sm font-medium">{alt}</span>
      </div>
    </div>
  );
};

const WikiFileCard: React.FC<WikiFileCardProps> = ({ file, onDelete, compact = false }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const fileType = getFileTypeCategory(file.fileName);
  const config = FILE_TYPE_CONFIG[fileType];
  const isImage = file.mimeType?.startsWith('image/') || fileType === 'image';
  const isPDF = fileType === 'pdf';
  const previewUrl = isImage && !imageError ? wikiFileService.getPreviewUrl(file.fileId, 400) : null;
  const downloadUrl = wikiFileService.getDownloadUrl(file.fileId);
  const viewUrl = wikiFileService.getFileUrl(file.fileId);

  if (compact) {
    return (
      <>
        <div
          className="group flex items-center gap-3 p-3 bg-white dark:bg-slate-800/50 rounded-xl
                     border border-gray-200/50 dark:border-slate-700/50
                     hover:border-gray-300 dark:hover:border-slate-600
                     hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-slate-900/50
                     transition-all duration-300"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Thumbnail / Icon */}
          <div className={`relative flex-shrink-0 w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center overflow-hidden`}>
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt={file.fileName}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <FileTypeIcon type={fileType} className={`w-6 h-6 ${config.color}`} />
            )}
            {isPDF && <PDFBadge />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
              {file.fileName}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">
              {formatFileSize(file.size)} {file.uploadTime && `• ${formatDate(file.uploadTime)}`}
            </p>
          </div>

          {/* Actions */}
          <div className={`flex items-center gap-1 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            {isImage && (
              <button
                onClick={() => setShowPreview(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Vorschau"
              >
                <Eye className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <a
              href={downloadUrl}
              download
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Herunterladen"
            >
              <Download className="w-4 h-4 text-gray-500" />
            </a>
            <button
              onClick={() => onDelete(file)}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Löschen"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>

        {/* Lightbox */}
        {showPreview && isImage && (
          <ImageLightbox
            src={viewUrl}
            alt={file.fileName}
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
    );
  }

  // Full Card View
  return (
    <>
      <div
        className="group relative bg-white dark:bg-slate-800/50 rounded-2xl overflow-hidden
                   border border-gray-200/50 dark:border-slate-700/50
                   hover:border-gray-300 dark:hover:border-slate-600
                   hover:shadow-2xl hover:shadow-gray-200/50 dark:hover:shadow-slate-900/50
                   hover:-translate-y-1
                   transition-all duration-300"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Preview Area */}
        <div className={`relative h-36 ${config.bgColor} flex items-center justify-center overflow-hidden`}>
          {isImage && previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt={file.fileName}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              {/* Overlay on hover */}
              <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-3
                              transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                <button
                  onClick={() => setShowPreview(true)}
                  className="p-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors"
                >
                  <Eye className="w-5 h-5 text-white" />
                </button>
                <a
                  href={downloadUrl}
                  download
                  className="p-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors"
                >
                  <Download className="w-5 h-5 text-white" />
                </a>
              </div>
            </>
          ) : (
            <div className="relative">
              <FileTypeIcon type={fileType} className={`w-16 h-16 ${config.color} transition-transform duration-300 group-hover:scale-110`} />
              {isPDF && (
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-lg">
                  <span className="text-[10px] font-black text-white">PDF</span>
                </div>
              )}
            </div>
          )}

          {/* Type Badge */}
          <div className="absolute top-3 left-3">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg backdrop-blur-sm
                           bg-white/80 dark:bg-slate-900/80 ${config.color}`}>
              {config.label}
            </span>
          </div>

          {/* Size Badge */}
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 text-xs font-medium rounded-lg backdrop-blur-sm
                           bg-white/80 dark:bg-slate-900/80 text-gray-600 dark:text-gray-400">
              {formatFileSize(file.size)}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate mb-1" title={file.fileName}>
            {file.fileName}
          </h4>
          <p className="text-xs text-gray-500 dark:text-dark-textMuted">
            {file.uploadTime ? formatDate(file.uploadTime) : 'Hochgeladen'}
          </p>
        </div>

        {/* Actions Bar */}
        <div className="px-4 pb-4 pt-0 flex items-center gap-2">
          {isImage && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                       bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600
                       rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Ansehen
            </button>
          )}
          {!isImage && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                       bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600
                       rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Öffnen
            </a>
          )}
          <a
            href={downloadUrl}
            download
            className="flex items-center justify-center gap-1.5 px-3 py-2
                     bg-red-600 hover:bg-red-700 rounded-xl text-xs font-medium text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => onDelete(file)}
            className="flex items-center justify-center px-2.5 py-2
                     bg-gray-100 hover:bg-red-100 dark:bg-slate-700 dark:hover:bg-red-900/30
                     rounded-xl transition-colors group/del"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-500 group-hover/del:text-red-500 transition-colors" />
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {showPreview && isImage && (
        <ImageLightbox
          src={viewUrl}
          alt={file.fileName}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

export default WikiFileCard;
