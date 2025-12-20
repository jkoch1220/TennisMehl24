import { useState, useEffect } from 'react';
import { X, Download, Loader2, FileText, Image as ImageIcon } from 'lucide-react';

interface DokumentVorschauProps {
  dateiId: string;
  dateiName: string;
  dateiTyp?: string;
  viewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}

const DokumentVorschau = ({ 
  dateiId, 
  dateiName, 
  dateiTyp, 
  viewUrl, 
  downloadUrl, 
  onClose 
}: DokumentVorschauProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    // Prüfe Dateityp
    const mimeType = dateiTyp?.toLowerCase() || '';
    const fileName = dateiName.toLowerCase();
    
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    const pdfTypes = ['application/pdf'];
    
    const isImageFile = imageTypes.includes(mimeType) || 
                       fileName.endsWith('.jpg') || 
                       fileName.endsWith('.jpeg') || 
                       fileName.endsWith('.png') || 
                       fileName.endsWith('.gif') || 
                       fileName.endsWith('.webp') || 
                       fileName.endsWith('.bmp');
    
    const isPdfFile = pdfTypes.includes(mimeType) || fileName.endsWith('.pdf');
    
    setIsImage(isImageFile);
    setIsPdf(isPdfFile);
    
    // Für Bilder: Lade das Bild und prüfe ob es geladen werden kann
    if (isImageFile) {
      const img = new Image();
      img.onload = () => {
        setLoading(false);
        setError(null);
      };
      img.onerror = () => {
        setLoading(false);
        setError('Bild konnte nicht geladen werden');
      };
      img.src = viewUrl;
    } else if (isPdfFile) {
      // Für PDFs: Lade das PDF in einem iframe
      setLoading(false);
    } else {
      // Nicht unterstützter Dateityp
      setLoading(false);
      setError('Dieser Dateityp kann nicht in der Vorschau angezeigt werden. Bitte laden Sie die Datei herunter.');
    }
  }, [dateiId, dateiName, dateiTyp, viewUrl]);

  const handleDownload = () => {
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-t-xl">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isImage ? (
              <ImageIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
            ) : isPdf ? (
              <FileText className="w-5 h-5 text-red-600 flex-shrink-0" />
            ) : (
              <FileText className="w-5 h-5 text-gray-600 dark:text-slate-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 truncate">{dateiName}</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {isImage ? 'Bild' : isPdf ? 'PDF-Dokument' : 'Dokument'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Herunterladen"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Herunterladen</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400 transition-colors p-2"
              title="Schließen"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-700 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-slate-400">Lade Dokument...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <FileText className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-700 dark:text-slate-400 font-medium mb-2">Vorschau nicht verfügbar</p>
                <p className="text-gray-500 dark:text-slate-400 text-sm mb-4">{error}</p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <Download className="w-4 h-4" />
                  Datei herunterladen
                </button>
              </div>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center h-full">
              <img
                src={viewUrl}
                alt={dateiName}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg dark:shadow-slate-900/50"
                onError={() => setError('Bild konnte nicht geladen werden')}
              />
            </div>
          ) : isPdf ? (
            <div className="flex items-center justify-center h-full">
              <iframe
                src={viewUrl}
                className="w-full h-full min-h-[600px] rounded-lg shadow-lg dark:shadow-slate-900/50 border-0"
                title={dateiName}
                onError={() => setError('PDF konnte nicht geladen werden')}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <FileText className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-700 dark:text-slate-400 font-medium mb-2">Vorschau nicht verfügbar</p>
                <p className="text-gray-500 dark:text-slate-400 text-sm mb-4">
                  Dieser Dateityp kann nicht in der Vorschau angezeigt werden.
                </p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <Download className="w-4 h-4" />
                  Datei herunterladen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DokumentVorschau;
