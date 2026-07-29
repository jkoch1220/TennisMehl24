import jsPDF from 'jspdf';
import { ladeStammdaten } from '../services/stammdatenService';

// Cache für geladene Templates
let emailTemplatesCache: Record<string, any> | null = null;

/**
 * Schlüssel der schlanken Auftragsbestätigungs-Vorlage in den Stammdaten.
 * Die Basisvorlage `auftragsbestaetigung` ist die Frühjahrsinstandsetzungs-Mail
 * inklusive Datenprüfungs-Block; diese hier ist die Kurzfassung für ABs außerhalb
 * der Saison. Wird an mehreren Stellen referenziert — deshalb als Konstante.
 */
export const AB_VORLAGE_EINFACH = 'auftragsbestaetigung_einfach';

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
 * Notnagel-Signatur — greift NUR, wenn weder eine gemeinsame noch eine vorlagen-eigene
 * Signatur in den Stammdaten steht. Die gepflegte Signatur (mit Logo und Hydrocourt-Banner)
 * liegt in Appwrite und wird über Stammdaten → E-Mail-Vorlagen bearbeitet.
 */
const getStandardSignatur = (): string => `<p>Mit sportlichen Grüßen</p>
<p>vom Team der Tennismehl GmbH</p>
<p style="font-size: 12px; color: #666;">Tennismehl GmbH<br/>Raiffeisenweg 1, 97232 Giebelstadt<br/>T 09391 9870-0<br/>www.tennismehl.com<br/>Sitz der Gesellschaft: Giebelstadt · Handelsregister Würzburg HRB 18235</p>`;

/**
 * Ermittelt die Signatur für einen Dokumenttyp.
 *
 * Bis 07/2026 trug jede der vier Vorlagen ihre EIGENE Signaturkopie. Wer sie an einer
 * Stelle korrigierte, ließ die anderen drei veralten — genau so fehlten der Angebots-
 * signatur das Hydrocourt-Banner und die Bildmaße am Logo (ohne width/height rendern
 * viele Mailclients es in Originalgröße). Deshalb gilt jetzt:
 *   1. vorlagen-eigene Signatur, falls bewusst abweichend gepflegt
 *   2. sonst die gemeinsame Signatur `standardSignatur`
 *   3. sonst der Notnagel oben
 */
export const ermittleSignatur = (
  templates: Record<string, any>,
  template: Record<string, any>
): string => {
  const eigene = typeof template?.signatur === 'string' ? template.signatur.trim() : '';
  if (eigene) return eigene;

  const gemeinsame =
    typeof templates?.standardSignatur === 'string' ? templates.standardSignatur.trim() : '';
  if (gemeinsame) return gemeinsame;

  return getStandardSignatur();
};

/**
 * Fallback-Templates falls Templates nicht aus Appwrite geladen werden können
 */
const getFallbackTemplates = (): Record<string, any> => ({
  angebot: {
    betreff: 'Angebot {dokumentNummer} - {kundenname}',
    htmlContent: `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie unser Angebot <strong>{dokumentNummer}</strong>{kundennummerText}.</p>
<p>Wir freuen uns auf Ihre Rückmeldung.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
  auftragsbestaetigung: {
    betreff: 'Auftragsbestätigung {dokumentNummer} - {kundenname}',
    htmlContent: `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie unsere Auftragsbestätigung <strong>{dokumentNummer}</strong>{kundennummerText}.</p>
<p>Vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die Bestellung.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
  lieferschein: {
    betreff: 'Lieferschein {dokumentNummer} - {kundenname}',
    htmlContent: `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie unseren Lieferschein <strong>{dokumentNummer}</strong>{kundennummerText}.</p>
<p>Bitte bestätigen Sie den Erhalt der Ware.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
  rechnung: {
    betreff: 'Rechnung {dokumentNummer} – {kundenname}',
    htmlContent: `<p>Guten Tag zusammen,</p>
<p>anbei erhalten Sie Ihre Rechnung <strong>{dokumentNummer}</strong> für die Lieferung vom Tennismehl.</p>
<p style="padding:10px 14px;background:#fff3cd;border-left:4px solid #c41e3a;font-weight:bold;">BITTE BEACHTEN SIE DIE GEÄNDERTEN KONTODATEN ZUM LETZTEN JAHR!</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
  // Schlanke AB-Variante für Aufträge außerhalb der Frühjahrsinstandsetzung —
  // ohne den Datenprüfungs-Block, der zur Saisonabwicklung gehört.
  [AB_VORLAGE_EINFACH]: {
    betreff: 'Auftragsbestätigung {dokumentNummer} - {kundenname}',
    htmlContent: `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie unsere Auftragsbestätigung <strong>{dokumentNummer}</strong>{kundennummerText}.</p>
<p>Vielen Dank für Ihren Auftrag.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
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
  kundennummer?: string,
  /**
   * Optionale Vorlagen-Variante innerhalb desselben Dokumenttyps, z.B.
   * 'auftragsbestaetigung_einfach' für ABs außerhalb der Frühjahrssaison.
   * Fehlt die Variante in den Stammdaten, wird auf die Basisvorlage zurückgefallen.
   */
  vorlagenKey?: string
): Promise<{ betreff: string; text: string; html?: string; signatur?: string }> => {
  const templates = await ladeEmailTemplates();
  const template = (vorlagenKey && templates[vorlagenKey]) || templates[dokumentTyp];

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

  // Signatur nach der Fallback-Kette bestimmen (eigene → gemeinsame → Notnagel)
  const signatur = ersetzePlatzhalter(
    ermittleSignatur(templates, template),
    dokumentNummer,
    kundenname,
    kundennummer
  );

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
