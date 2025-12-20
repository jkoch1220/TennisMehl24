import { useState, useEffect } from 'react';
import { X, Mail, Send, Loader2, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { generiereStandardEmail } from '../../utils/emailHelpers';

interface EmailFormularProps {
  pdf: jsPDF;
  dateiname: string;
  dokumentTyp: 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';
  dokumentNummer: string;
  kundenname: string;
  kundennummer?: string;
  standardEmpfaenger?: string;
  onClose: () => void;
  onSend?: () => void;
}

const EmailFormular = ({
  pdf,
  dateiname,
  dokumentTyp,
  dokumentNummer,
  kundenname,
  kundennummer,
  standardEmpfaenger,
  onClose,
  onSend
}: EmailFormularProps) => {
  const [empfaenger, setEmpfaenger] = useState(standardEmpfaenger || '');
  const [betreff, setBetreff] = useState('');
  const [text, setText] = useState('');
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'senden'>('laden');
  const [fehler, setFehler] = useState<string | null>(null);

  // Lade E-Mail-Template beim Öffnen
  useEffect(() => {
    const ladeTemplate = async () => {
      try {
        setLadeStatus('laden');
        const emailDaten = await generiereStandardEmail(
          dokumentTyp,
          dokumentNummer,
          kundenname,
          kundennummer
        );
        setBetreff(emailDaten.betreff);
        setText(emailDaten.text);
        setLadeStatus('bereit');
      } catch (error) {
        console.error('Fehler beim Laden des E-Mail-Templates:', error);
        setFehler('Fehler beim Laden des E-Mail-Templates');
        setLadeStatus('bereit');
      }
    };

    ladeTemplate();
  }, [dokumentTyp, dokumentNummer, kundenname, kundennummer]);

  const handleSend = async () => {
    if (!empfaenger.trim()) {
      setFehler('Bitte geben Sie eine E-Mail-Adresse ein.');
      return;
    }

    if (!betreff.trim()) {
      setFehler('Bitte geben Sie einen Betreff ein.');
      return;
    }

    try {
      setLadeStatus('senden');
      setFehler(null);

      // PDF als Blob erstellen
      const blob = pdf.output('blob');
      const formData = new FormData();
      formData.append('pdf', blob, dateiname);
      formData.append('to', empfaenger);
      formData.append('subject', betreff);
      formData.append('body', text);

      // Hier würde normalerweise ein E-Mail-Service aufgerufen werden
      // Da wir keinen Backend-Service haben, öffnen wir stattdessen mailto: mit der PDF im Download
      
      // PDF zum Download bereitstellen
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = dateiname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // E-Mail-Client öffnen
      const params = new URLSearchParams();
      params.append('to', empfaenger);
      params.append('subject', betreff);
      params.append('body', text);
      window.location.href = `mailto:${empfaenger}?${params.toString()}`;

      if (onSend) {
        onSend();
      }
      
      // Formular nach kurzer Verzögerung schließen
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      setFehler('Fehler beim Senden der E-Mail: ' + (error as Error).message);
      setLadeStatus('bereit');
    }
  };

  if (ladeStatus === 'laden') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-gray-700 dark:text-dark-textMuted">E-Mail-Template wird geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">E-Mail senden</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Fehler-Meldung */}
          {fehler && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{fehler}</p>
            </div>
          )}

          {/* Info-Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Hinweis:</strong> Die PDF-Datei wird automatisch heruntergeladen. Bitte fügen Sie sie manuell als Anhang in Ihrem E-Mail-Client hinzu.
            </p>
          </div>

          {/* Empfänger */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Empfänger <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={empfaenger}
              onChange={(e) => setEmpfaenger(e.target.value)}
              placeholder="kunde@example.com"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Betreff */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Betreff <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Nachricht
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-textMuted bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSend}
            disabled={ladeStatus === 'senden' || !empfaenger.trim() || !betreff.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {ladeStatus === 'senden' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                E-Mail öffnen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailFormular;
