import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  TestTube2,
  ChevronDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import TipTapEditor from '../Shared/TipTapEditor';
import {
  ladeEmailKonten,
  sendeEmailMitPdf,
  pdfZuBase64,
  wrapInEmailTemplate,
} from '../../services/emailSendService';
import { generiereStandardEmail } from '../../utils/emailHelpers';
import { EmailAccount, DokumentTyp, TEST_EMAIL_ADDRESS } from '../../types/email';

interface EmailFormularProps {
  pdf: jsPDF;
  dateiname: string;
  dokumentTyp: DokumentTyp;
  dokumentNummer: string;
  kundenname: string;
  kundennummer?: string;
  standardEmpfaenger?: string;
  projektId?: string;
  pdfVersion?: number;
  onClose: () => void;
  onSend?: () => void;
}

type SendeStatus = 'bereit' | 'laden' | 'senden' | 'erfolg' | 'fehler';

const EmailFormular = ({
  pdf,
  dateiname,
  dokumentTyp,
  dokumentNummer,
  kundenname,
  kundennummer,
  standardEmpfaenger,
  projektId,
  pdfVersion,
  onClose,
  onSend,
}: EmailFormularProps) => {
  // Formular-State
  const [empfaenger, setEmpfaenger] = useState(standardEmpfaenger || '');
  const [absender, setAbsender] = useState('');
  const [betreff, setBetreff] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [testModus, setTestModus] = useState(false);

  // UI-State
  const [emailKonten, setEmailKonten] = useState<EmailAccount[]>([]);
  const [status, setStatus] = useState<SendeStatus>('laden');
  const [fehlerMeldung, setFehlerMeldung] = useState<string | null>(null);
  const [erfolgsMeldung, setErfolgsMeldung] = useState<string | null>(null);
  const [showAbsenderDropdown, setShowAbsenderDropdown] = useState(false);

  // PDF-Vorschau
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Dokumenttyp-Labels
  const dokumentTypLabels: Record<DokumentTyp, string> = {
    angebot: 'Angebot',
    auftragsbestaetigung: 'Auftragsbestätigung',
    lieferschein: 'Lieferschein',
    rechnung: 'Rechnung',
  };

  // E-Mail-Konten und Template laden
  useEffect(() => {
    const init = async () => {
      try {
        setStatus('laden');

        // E-Mail-Konten laden
        const konten = await ladeEmailKonten();
        setEmailKonten(konten);

        // Standard-Absender setzen (nach Dokumenttyp)
        const defaultAbsender = getDefaultAbsender(dokumentTyp, konten);
        setAbsender(defaultAbsender);

        // E-Mail-Template laden
        const emailDaten = await generiereStandardEmail(
          dokumentTyp,
          dokumentNummer,
          kundenname,
          kundennummer
        );
        setBetreff(emailDaten.betreff);

        // HTML-Content verwenden wenn verfügbar, sonst Plain-Text konvertieren
        let htmlText: string;
        if (emailDaten.html) {
          // Neues HTML-Format - direkt verwenden
          htmlText = emailDaten.html;
          // Signatur anhängen wenn vorhanden
          if (emailDaten.signatur) {
            htmlText += '\n' + emailDaten.signatur;
          }
        } else {
          // Altes Plain-Text Format - zu HTML konvertieren
          htmlText = emailDaten.text
            .split('\n')
            .map((line) => (line.trim() ? `<p>${line}</p>` : '<p><br></p>'))
            .join('');
        }
        setHtmlContent(htmlText);

        // PDF-Vorschau erstellen
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);

        setStatus('bereit');
      } catch (error) {
        console.error('Fehler beim Initialisieren:', error);
        setFehlerMeldung('Fehler beim Laden der E-Mail-Vorlage');
        setStatus('fehler');
      }
    };

    init();

    // Cleanup PDF-Preview URL
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [dokumentTyp, dokumentNummer, kundenname, kundennummer, pdf]);

  // Standard-Absender basierend auf Dokumenttyp
  const getDefaultAbsender = (typ: DokumentTyp, konten: EmailAccount[]): string => {
    const mappings: Record<DokumentTyp, string[]> = {
      angebot: ['anfrage@tennismehl.com', 'info@tennismehl.com'],
      auftragsbestaetigung: ['bestellung@tennismehl24.com', 'info@tennismehl.com'],
      lieferschein: ['logistik@tennismehl.com', 'info@tennismehl.com'],
      rechnung: ['rechnung@tennismehl.com', 'info@tennismehl.com'],
    };

    const preferredEmails = mappings[typ];
    for (const email of preferredEmails) {
      const found = konten.find((k) => k.email === email);
      if (found) return found.email;
    }

    // Fallback auf erstes Konto
    return konten[0]?.email || '';
  };

  // E-Mail senden
  const handleSenden = async () => {
    // Validierung
    if (!empfaenger.trim()) {
      setFehlerMeldung('Bitte geben Sie eine Empfänger-Adresse ein.');
      return;
    }

    if (!absender) {
      setFehlerMeldung('Bitte wählen Sie einen Absender.');
      return;
    }

    if (!betreff.trim()) {
      setFehlerMeldung('Bitte geben Sie einen Betreff ein.');
      return;
    }

    try {
      setStatus('senden');
      setFehlerMeldung(null);

      // PDF zu Base64 konvertieren
      const pdfBase64 = pdfZuBase64(pdf);

      // HTML in E-Mail-Template wrappen
      const vollstaendigesHtml = wrapInEmailTemplate(htmlContent);

      // E-Mail senden
      const result = await sendeEmailMitPdf({
        empfaenger: empfaenger.trim(),
        absender,
        betreff: betreff.trim(),
        htmlBody: vollstaendigesHtml,
        pdfBase64,
        pdfDateiname: dateiname,
        projektId: projektId || 'unbekannt',
        dokumentTyp,
        dokumentNummer,
        pdfVersion,
        testModus,
      });

      if (result.success) {
        setStatus('erfolg');
        const ziel = result.testModeActive
          ? `Test-Adresse (${TEST_EMAIL_ADDRESS})`
          : empfaenger;
        setErfolgsMeldung(`E-Mail erfolgreich an ${ziel} gesendet!`);

        if (onSend) {
          onSend();
        }

        // Nach 2 Sekunden schließen
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error(result.error || 'Unbekannter Fehler beim Versand');
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      setStatus('fehler');
      setFehlerMeldung(
        error instanceof Error ? error.message : 'Fehler beim Senden der E-Mail'
      );
    }
  };

  // Loading-Ansicht
  if (status === 'laden') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <span className="text-gray-700 dark:text-dark-textMuted">
              E-Mail wird vorbereitet...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-cyan-600">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-xl font-semibold text-white">E-Mail senden</h2>
              <p className="text-sm text-blue-100">
                {dokumentTypLabels[dokumentTyp]} {dokumentNummer}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status-Meldungen */}
          {fehlerMeldung && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{fehlerMeldung}</p>
            </div>
          )}

          {erfolgsMeldung && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800 dark:text-green-300">{erfolgsMeldung}</p>
            </div>
          )}

          {/* Absender & Empfänger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Absender-Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                Von <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAbsenderDropdown(!showAbsenderDropdown)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-left flex items-center justify-between focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <span className="text-gray-900 dark:text-white">
                    {emailKonten.find((k) => k.email === absender)?.name || absender || 'Absender wählen'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>

                {showAbsenderDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {emailKonten.map((konto) => (
                      <button
                        key={konto.email}
                        type="button"
                        onClick={() => {
                          setAbsender(konto.email);
                          setShowAbsenderDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700 flex flex-col ${
                          absender === konto.email ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <span className="font-medium text-gray-900 dark:text-white">
                          {konto.name}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {konto.email}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Empfänger */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
                An <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={empfaenger}
                onChange={(e) => setEmpfaenger(e.target.value)}
                placeholder="kunde@example.com"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* E-Mail-Body mit TipTap */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Nachricht
            </label>
            <TipTapEditor
              content={htmlContent}
              onChange={setHtmlContent}
              placeholder="Schreiben Sie hier Ihre Nachricht..."
              showPlaceholderButtons={true}
              minHeight="250px"
            />
          </div>

          {/* PDF-Anhang Info */}
          <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 flex items-start gap-4">
            <div className="flex-shrink-0 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 dark:text-white">
                Anhang: {dateiname}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Das PDF wird automatisch an die E-Mail angehängt.
                {pdfVersion && ` (Version ${pdfVersion})`}
              </p>
            </div>
          </div>

          {/* Testmodus */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={testModus}
                onChange={(e) => setTestModus(e.target.checked)}
                className="w-5 h-5 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
              />
              <div className="flex items-center gap-2">
                <TestTube2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-medium text-amber-900 dark:text-amber-200">
                    Testmodus
                  </span>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    E-Mail wird an {TEST_EMAIL_ADDRESS} statt an den Empfänger gesendet
                  </p>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {testModus && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <TestTube2 className="h-4 w-4" />
                Testmodus aktiv
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={status === 'senden'}
              className="px-5 py-2.5 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>

            <button
              onClick={handleSenden}
              disabled={status === 'senden' || status === 'erfolg' || !empfaenger.trim() || !betreff.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {status === 'senden' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird gesendet...
                </>
              ) : status === 'erfolg' ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Gesendet!
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  E-Mail senden
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Klick außerhalb schließt Absender-Dropdown */}
      {showAbsenderDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowAbsenderDropdown(false)}
        />
      )}
    </div>
  );
};

export default EmailFormular;
