import { useState, useEffect } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ladeStammdaten, speichereStammdaten } from '../../services/stammdatenService';
import { ladeEmailTemplatesNeu } from '../../utils/emailHelpers';

interface EmailTemplate {
  betreff: string;
  emailContent: string;
}

interface EmailTemplates {
  angebot: EmailTemplate;
  auftragsbestaetigung: EmailTemplate;
  lieferschein: EmailTemplate;
  rechnung: EmailTemplate;
}

const EmailTemplatesTab = () => {
  const [loading, setLoading] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EmailTemplates>({
    angebot: {
      betreff: 'Angebot {dokumentNummer} - {kundenname}',
      emailContent: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unser angebot {dokumentNummer}{kundennummerText}.

Wir freuen uns auf Ihre Rückmeldung.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Koch Dienste`
    },
    auftragsbestaetigung: {
      betreff: 'Auftragsbestätigung {dokumentNummer} - {kundenname}',
      emailContent: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere auftragsbestätigung {dokumentNummer}{kundennummerText}.

Vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die Bestellung.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Koch Dienste`
    },
    lieferschein: {
      betreff: 'Lieferschein {dokumentNummer} - {kundenname}',
      emailContent: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unseren lieferschein {dokumentNummer}{kundennummerText}.

Bitte bestätigen Sie den Erhalt der Ware.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Koch Dienste`
    },
    rechnung: {
      betreff: 'Rechnung {dokumentNummer} - {kundenname}',
      emailContent: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere rechnung {dokumentNummer}{kundennummerText}.

Bitte überweisen Sie den Rechnungsbetrag innerhalb der angegebenen Zahlungsfrist.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Koch Dienste`
    }
  });

  useEffect(() => {
    ladeTemplates();
  }, []);

  const ladeTemplates = async () => {
    setLoading(true);
    setFehler(null);
    try {
      const stammdaten = await ladeStammdaten();
      
      if (stammdaten?.emailTemplates) {
        try {
          const geladeneTemplates = JSON.parse(stammdaten.emailTemplates);
          setTemplates(geladeneTemplates);
        } catch (parseError) {
          console.error('Fehler beim Parsen der Templates:', parseError);
          setFehler('Fehler beim Laden der Templates. Standard-Templates werden verwendet.');
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Templates:', error);
      setFehler('Fehler beim Laden der Templates aus Appwrite.');
    } finally {
      setLoading(false);
    }
  };

  const handleBetreffChange = (
    dokumentTyp: keyof EmailTemplates,
    wert: string
  ) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: {
        ...prev[dokumentTyp],
        betreff: wert
      }
    }));
  };

  const handleContentChange = (
    dokumentTyp: keyof EmailTemplates,
    wert: string
  ) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: {
        ...prev[dokumentTyp],
        emailContent: wert
      }
    }));
  };

  const handleSpeichern = async () => {
    setSpeichert(true);
    setErfolg(false);
    setFehler(null);
    
    try {
      // Validiere JSON
      const templatesJson = JSON.stringify(templates);
      JSON.parse(templatesJson); // Test-Parse
      
      // Lade aktuelle Stammdaten
      const stammdaten = await ladeStammdaten();
      if (!stammdaten) {
        throw new Error('Stammdaten nicht gefunden');
      }
      
      // Speichere Templates in Stammdaten
      await speichereStammdaten({
        firmenname: stammdaten.firmenname,
        firmenstrasse: stammdaten.firmenstrasse,
        firmenPlz: stammdaten.firmenPlz,
        firmenOrt: stammdaten.firmenOrt,
        firmenTelefon: stammdaten.firmenTelefon,
        firmenEmail: stammdaten.firmenEmail,
        firmenWebsite: stammdaten.firmenWebsite,
        geschaeftsfuehrer: stammdaten.geschaeftsfuehrer,
        handelsregister: stammdaten.handelsregister,
        sitzGesellschaft: stammdaten.sitzGesellschaft,
        steuernummer: stammdaten.steuernummer,
        ustIdNr: stammdaten.ustIdNr,
        bankname: stammdaten.bankname,
        iban: stammdaten.iban,
        bic: stammdaten.bic,
        werkName: stammdaten.werkName,
        werkStrasse: stammdaten.werkStrasse,
        werkPlz: stammdaten.werkPlz,
        werkOrt: stammdaten.werkOrt,
        emailTemplates: templatesJson
      });
      
      // Cache zurücksetzen, damit neue Templates geladen werden
      await ladeEmailTemplatesNeu();
      
      setErfolg(true);
      setTimeout(() => setErfolg(false), 3000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setFehler('Fehler beim Speichern der Templates: ' + (error as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const dokumentTypen: Array<{ key: keyof EmailTemplates; label: string; color: string }> = [
    { key: 'angebot', label: 'Angebot', color: 'blue' },
    { key: 'auftragsbestaetigung', label: 'Auftragsbestätigung', color: 'orange' },
    { key: 'lieferschein', label: 'Lieferschein', color: 'green' },
    { key: 'rechnung', label: 'Rechnung', color: 'red' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Lade E-Mail-Templates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status-Meldungen */}
      {erfolg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm text-green-800">E-Mail-Templates erfolgreich gespeichert!</p>
        </div>
      )}
      
      {fehler && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm text-red-800">{fehler}</p>
        </div>
      )}

      {/* Info-Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Platzhalter</h3>
        <div className="text-sm text-blue-800 space-y-1">
          <p><code className="bg-blue-100 px-2 py-1 rounded">&#123;dokumentNummer&#125;</code> - Dokumentnummer (z.B. "LS-2026-001")</p>
          <p><code className="bg-blue-100 px-2 py-1 rounded">&#123;kundenname&#125;</code> - Name des Kunden</p>
          <p><code className="bg-blue-100 px-2 py-1 rounded">&#123;kundennummer&#125;</code> - Kundennummer (falls vorhanden)</p>
          <p><code className="bg-blue-100 px-2 py-1 rounded">&#123;kundennummerText&#125;</code> - " (Kundennummer: XXX)" oder leer</p>
          <p className="mt-2"><strong>Hinweis:</strong> Zeilenumbrüche werden direkt im Textfeld erstellt.</p>
        </div>
      </div>

      {/* Templates für jeden Dokumenttyp */}
      {dokumentTypen.map(({ key, label, color }) => {
        const template = templates[key];
        const colorClasses = {
          blue: 'border-blue-200 bg-blue-50',
          orange: 'border-orange-200 bg-orange-50',
          green: 'border-green-200 bg-green-50',
          red: 'border-red-200 bg-red-50'
        };

        return (
          <div key={key} className={`bg-white rounded-xl shadow-sm border-2 ${colorClasses[color as keyof typeof colorClasses]} p-6`}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{label}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Betreff</label>
                <input
                  type="text"
                  value={template.betreff}
                  onChange={(e) => handleBetreffChange(key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail-Content</label>
                <textarea
                  value={template.emailContent}
                  onChange={(e) => handleContentChange(key, e.target.value)}
                  rows={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="E-Mail-Text hier eingeben..."
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Speichern-Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSpeichern}
          disabled={speichert}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {speichert ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Speichern...
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Templates speichern
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EmailTemplatesTab;
