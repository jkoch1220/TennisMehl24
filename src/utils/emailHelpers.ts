import jsPDF from 'jspdf';
import { ladeStammdaten } from '../services/stammdatenService';

// Cache für geladene Templates
let emailTemplatesCache: Record<string, any> | null = null;

/**
 * Lädt die E-Mail-Templates aus Appwrite (Stammdaten)
 */
const ladeEmailTemplates = async (): Promise<Record<string, any>> => {
  // Wenn bereits gecached, verwende Cache
  if (emailTemplatesCache) {
    return emailTemplatesCache;
  }

  try {
    const stammdaten = await ladeStammdaten();
    
    if (stammdaten?.emailTemplates) {
      try {
        emailTemplatesCache = JSON.parse(stammdaten.emailTemplates) as Record<string, any>;
        return emailTemplatesCache;
      } catch (parseError) {
        console.error('Fehler beim Parsen der E-Mail-Templates:', parseError);
        // Fallback auf Standard-Templates
        const fallback = getFallbackTemplates();
        emailTemplatesCache = fallback;
        return fallback;
      }
    } else {
      // Keine Templates in Stammdaten - verwende Fallback
      const fallback = getFallbackTemplates();
      emailTemplatesCache = fallback;
      return fallback;
    }
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Templates aus Appwrite:', error);
    // Fallback auf Standard-Templates
    const fallback = getFallbackTemplates();
    emailTemplatesCache = fallback;
    return fallback;
  }
};

/**
 * Fallback-Templates falls Templates nicht aus Appwrite geladen werden können
 */
const getFallbackTemplates = (): Record<string, any> => ({
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

/**
 * Ersetzt Platzhalter in einem Text
 */
const ersetzePlatzhalter = (
  text: string,
  dokumentNummer: string,
  kundenname: string,
  kundennummer?: string
): string => {
  const kundennummerText = kundennummer ? ` (Kundennummer: ${kundennummer})` : '';
  
  return text
    .replace(/{dokumentNummer}/g, dokumentNummer)
    .replace(/{kundenname}/g, kundenname)
    .replace(/{kundennummer}/g, kundennummer || '')
    .replace(/{kundennummerText}/g, kundennummerText);
};

/**
 * Erstellt einen mailto: Link mit Betreff und Text
 * @param empfaenger E-Mail-Adresse des Empfängers (optional)
 * @param betreff Betreff der E-Mail
 * @param text Text der E-Mail
 * @returns mailto: URL
 */
export const erstelleMailtoLink = (
  empfaenger: string | undefined,
  betreff: string,
  text: string
): string => {
  const params = new URLSearchParams();
  
  if (empfaenger) {
    params.append('to', empfaenger);
  }
  params.append('subject', betreff);
  params.append('body', text);
  
  return `mailto:${empfaenger || ''}?${params.toString()}`;
};

/**
 * Generiert eine Standard-E-Mail für ein Dokument basierend auf Templates aus Appwrite
 * @param dokumentTyp Typ des Dokuments (angebot, auftragsbestaetigung, lieferschein, rechnung)
 * @param dokumentNummer Nummer des Dokuments
 * @param kundenname Name des Kunden
 * @param kundennummer Kundennummer (optional)
 * @returns Objekt mit Betreff und Text (HTML oder Plain-Text)
 */
export const generiereStandardEmail = async (
  dokumentTyp: 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung',
  dokumentNummer: string,
  kundenname: string,
  kundennummer?: string
): Promise<{ betreff: string; text: string; html?: string; signatur?: string }> => {
  const templates = await ladeEmailTemplates();
  const template = templates[dokumentTyp];

  if (!template) {
    throw new Error(`Kein Template für Dokumenttyp ${dokumentTyp} gefunden`);
  }

  // Betreff generieren
  const betreff = ersetzePlatzhalter(
    template.betreff || '',
    dokumentNummer,
    kundenname,
    kundennummer
  );

  // Prüfe ob neues HTML-Format oder altes Plain-Text Format
  const hasHtmlContent = !!template.htmlContent;
  const contentSource = template.htmlContent || template.emailContent || '';

  // E-Mail-Content generieren (Platzhalter ersetzen)
  const text = ersetzePlatzhalter(
    contentSource,
    dokumentNummer,
    kundenname,
    kundennummer
  );

  // Signatur auch ersetzen falls vorhanden
  const signatur = template.signatur
    ? ersetzePlatzhalter(template.signatur, dokumentNummer, kundenname, kundennummer)
    : undefined;

  return {
    betreff,
    text,
    html: hasHtmlContent ? text : undefined,
    signatur,
  };
};

/**
 * Öffnet den E-Mail-Client mit vorausgefüllten Daten und stellt PDF zum Download bereit
 * @param pdf Das PDF-Dokument
 * @param dateiname Name der PDF-Datei
 * @param empfaenger E-Mail-Adresse des Empfängers (optional)
 * @param betreff Betreff der E-Mail
 * @param text Text der E-Mail
 */
export const oeffneEmailMitPDF = (
  pdf: jsPDF,
  dateiname: string,
  empfaenger: string | undefined,
  betreff: string,
  text: string
): void => {
  // PDF als Blob erstellen und zum Download bereitstellen
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // E-Mail-Client öffnen
  const mailtoLink = erstelleMailtoLink(empfaenger, betreff, text);
  window.location.href = mailtoLink;
};

/**
 * Lädt die E-Mail-Templates neu (z.B. nach Änderungen in der YAML-Datei)
 */
export const ladeEmailTemplatesNeu = async (): Promise<void> => {
  emailTemplatesCache = null;
  await ladeEmailTemplates();
};
