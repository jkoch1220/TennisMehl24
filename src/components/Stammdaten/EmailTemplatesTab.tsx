import { useState, useEffect } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Mail, PenLine } from 'lucide-react';
import { ladeStammdaten, speichereStammdaten } from '../../services/stammdatenService';
import { ladeEmailTemplatesNeu, AB_VORLAGE_EINFACH } from '../../utils/emailHelpers';
import TipTapEditor from '../Shared/TipTapEditor';
import { DokumentTyp } from '../../types/email';

interface EmailTemplate {
  betreff: string;
  htmlContent: string;
  signatur?: string;
}

interface EmailTemplates {
  angebot: EmailTemplate;
  auftragsbestaetigung: EmailTemplate;
  lieferschein: EmailTemplate;
  rechnung: EmailTemplate;
  /** Kurzfassung der AB für Aufträge außerhalb der Frühjahrssaison */
  [AB_VORLAGE_EINFACH]: EmailTemplate;
  /**
   * Gemeinsame Signatur für alle Vorlagen. Eine Vorlage weicht nur dann ab, wenn ihr
   * eigenes `signatur`-Feld gefüllt ist — sonst erbt sie diese hier.
   */
  standardSignatur?: string;
}

/** Reiter der Signatur-Pflege (kein Dokumenttyp, deshalb eigener Schlüssel) */
const SIGNATUR_TAB = 'standardSignatur' as const;
/** Alle pflegbaren Vorlagen — die vier Dokumenttypen plus die schlanke AB-Variante */
type VorlagenSchluessel = DokumentTyp | typeof AB_VORLAGE_EINFACH;
type TabSchluessel = VorlagenSchluessel | typeof SIGNATUR_TAB;

const VORLAGEN_SCHLUESSEL: VorlagenSchluessel[] = [
  'angebot',
  'auftragsbestaetigung',
  AB_VORLAGE_EINFACH,
  'lieferschein',
  'rechnung',
];

// Standard-HTML-Templates
const getDefaultTemplates = (): EmailTemplates => ({
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
  [AB_VORLAGE_EINFACH]: {
    betreff: 'Auftragsbestätigung {dokumentNummer} - {kundenname}',
    htmlContent: `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie unsere Auftragsbestätigung <strong>{dokumentNummer}</strong>{kundennummerText}.</p>
<p>Vielen Dank für Ihren Auftrag.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
  rechnung: {
    betreff: 'Rechnung {dokumentNummer} – {kundenname}',
    htmlContent: `<p>Guten Tag zusammen,</p>
<p>anbei erhalten Sie Ihre Rechnung <strong>{dokumentNummer}</strong> für die Lieferung vom Tennismehl.</p>
<p style="padding:10px 14px;background:#fff3cd;border-left:4px solid #c41e3a;font-weight:bold;">BITTE BEACHTEN SIE DIE GEÄNDERTEN KONTODATEN ZUM LETZTEN JAHR!</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`,
  },
});

const EmailTemplatesTab = () => {
  const [loading, setLoading] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EmailTemplates>(getDefaultTemplates());
  const [activeTab, setActiveTab] = useState<TabSchluessel>(SIGNATUR_TAB);
  const [showPreview, setShowPreview] = useState(false);

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

          // Migriere alte Plain-Text Templates zu HTML falls nötig
          const migrierteTemplates = migrateOldTemplates(geladeneTemplates);
          setTemplates(migrierteTemplates);
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

  // Migriert alte Plain-Text Templates zu HTML und führt die vier Signaturkopien zusammen
  const migrateOldTemplates = (
    oldTemplates: Record<string, unknown> & {
      standardSignatur?: string;
    }
  ): EmailTemplates => {
    const defaults = getDefaultTemplates();
    const result: EmailTemplates = { ...defaults };

    const dokumentTypen = VORLAGEN_SCHLUESSEL;
    const alt = (typ: VorlagenSchluessel) =>
      oldTemplates[typ] as
        | { betreff?: string; emailContent?: string; htmlContent?: string; signatur?: string }
        | undefined;

    // Gemeinsame Signatur bestimmen. Gibt es noch keine, dient die Auftragsbestätigung als
    // Vorlage — sie ist die gepflegte Fassung (mit Logo-Maßen und Hydrocourt-Banner),
    // während die Angebots-Kopie auf einem älteren Stand hängengeblieben war.
    const gemeinsameSignatur = (
      oldTemplates.standardSignatur ||
      alt('auftragsbestaetigung')?.signatur ||
      alt('rechnung')?.signatur ||
      ''
    ).trim();
    result.standardSignatur = gemeinsameSignatur;

    for (const typ of dokumentTypen) {
      const old = alt(typ);
      if (!old) continue;

      const eigeneSignatur = (old.signatur || '').trim();
      result[typ] = {
        betreff: old.betreff || defaults[typ].betreff,
        // Nutze htmlContent wenn vorhanden, sonst konvertiere emailContent
        htmlContent: old.htmlContent || (old.emailContent
          ? convertPlainTextToHtml(old.emailContent)
          : defaults[typ].htmlContent),
        // Deckungsgleich mit der gemeinsamen Signatur? Dann keine Kopie behalten —
        // die Vorlage erbt. Nur echte Abweichungen bleiben stehen.
        signatur: eigeneSignatur && eigeneSignatur !== gemeinsameSignatur ? eigeneSignatur : '',
      };
    }

    return result;
  };

  // Konvertiert Plain-Text zu einfachem HTML
  const convertPlainTextToHtml = (text: string): string => {
    return text
      .split('\n')
      .map(line => line.trim() ? `<p>${line}</p>` : '<p><br></p>')
      .join('\n');
  };

  const handleBetreffChange = (dokumentTyp: VorlagenSchluessel, wert: string) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: {
        ...prev[dokumentTyp],
        betreff: wert,
      },
    }));
  };

  const handleContentChange = (dokumentTyp: VorlagenSchluessel, wert: string) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: {
        ...prev[dokumentTyp],
        htmlContent: wert,
      },
    }));
  };

  const handleSignaturChange = (dokumentTyp: VorlagenSchluessel, wert: string) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: {
        ...prev[dokumentTyp],
        signatur: wert,
      },
    }));
  };

  const handleStandardSignaturChange = (wert: string) => {
    setTemplates(prev => ({ ...prev, standardSignatur: wert }));
  };

  /** Verwirft die abweichende Signatur einer Vorlage — sie erbt danach die gemeinsame. */
  const setzeAufGemeinsameSignatur = (dokumentTyp: VorlagenSchluessel) => {
    setTemplates(prev => ({
      ...prev,
      [dokumentTyp]: { ...prev[dokumentTyp], signatur: '' },
    }));
  };

  /** Vorlagen mit eigener, von der gemeinsamen abweichender Signatur */
  const abweichendeVorlagen = VORLAGEN_SCHLUESSEL
    .filter(typ => (templates[typ]?.signatur || '').trim().length > 0);

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
        emailTemplates: templatesJson,
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

  const dokumentTypen: Array<{ key: VorlagenSchluessel; label: string; color: string; bgColor: string }> = [
    { key: 'angebot', label: 'Angebot', color: 'blue', bgColor: 'bg-blue-500' },
    { key: 'auftragsbestaetigung', label: 'AB · Frühjahr', color: 'orange', bgColor: 'bg-orange-500' },
    { key: AB_VORLAGE_EINFACH, label: 'AB · einfach', color: 'amber', bgColor: 'bg-amber-500' },
    { key: 'lieferschein', label: 'Lieferschein', color: 'green', bgColor: 'bg-green-500' },
    { key: 'rechnung', label: 'Rechnung', color: 'red', bgColor: 'bg-red-500' },
  ];

  // Beispiel-Platzhalter für Vorschau
  const ersetzePlatzhalterFuerVorschau = (html: string): string => {
    return html
      .replace(/{dokumentNummer}/g, '<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">ANG-2026-001</span>')
      .replace(/{kundenname}/g, '<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">TC Musterstadt</span>')
      .replace(/{kundennummer}/g, '<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">1234</span>')
      .replace(/{kundennummerText}/g, '<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded"> (Kundennummer: 1234)</span>')
      .replace(/{datum}/g, '<span class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">' + new Date().toLocaleDateString('de-DE') + '</span>');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-dark-textMuted">Lade E-Mail-Templates...</span>
      </div>
    );
  }

  const istSignaturTab = activeTab === SIGNATUR_TAB;
  const currentTemplate = istSignaturTab ? null : templates[activeTab as VorlagenSchluessel];
  const currentConfig = istSignaturTab
    ? { key: SIGNATUR_TAB, label: 'Signatur (gilt für alle Vorlagen)', color: 'slate', bgColor: 'bg-slate-600' }
    : dokumentTypen.find(d => d.key === activeTab)!;

  return (
    <div className="space-y-6">
      {/* Status-Meldungen */}
      {erfolg && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-800 dark:text-green-300">E-Mail-Templates erfolgreich gespeichert!</p>
        </div>
      )}

      {fehler && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-300">{fehler}</p>
        </div>
      )}

      {/* Info-Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
          <Mail className="h-5 w-5" />
          E-Mail-Templates mit HTML-Editor
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
          <p>Hier können Sie die E-Mail-Vorlagen für jeden Dokumenttyp bearbeiten. Der Rich-Text-Editor unterstützt Formatierungen, Links und Bilder.</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">{'{dokumentNummer}'}</code>
            <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">{'{kundenname}'}</code>
            <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">{'{kundennummer}'}</code>
            <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">{'{kundennummerText}'}</code>
            <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">{'{datum}'}</code>
          </div>
        </div>
      </div>

      {/* Tab-Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab(SIGNATUR_TAB)}
          className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
            istSignaturTab
              ? 'bg-slate-600 text-white'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
          }`}
        >
          <PenLine className="h-4 w-4" />
          Signatur
          {abweichendeVorlagen.length > 0 && (
            <span
              className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] bg-amber-500 text-white"
              title={`${abweichendeVorlagen.length} Vorlage(n) mit abweichender Signatur`}
            >
              {abweichendeVorlagen.length}
            </span>
          )}
        </button>
        <span className="w-px bg-gray-200 dark:bg-slate-700 mx-1" />
        {dokumentTypen.map(({ key, label, bgColor }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === key
                ? `${bgColor} text-white`
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === key ? 'bg-white' : bgColor}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Aktives Template */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className={`${currentConfig.bgColor} px-6 py-4 flex items-center justify-between`}>
          <h2 className="text-xl font-semibold text-white">{currentConfig.label}</h2>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? 'Editor' : 'Vorschau'}
          </button>
        </div>

        {/* === SIGNATUR-REITER: eine Signatur für alle Vorlagen === */}
        {istSignaturTab && (
          <div className="p-6 space-y-6">
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">
              Diese Signatur wird an <strong>alle</strong> E-Mails angehängt — Angebot,
              Auftragsbestätigung, Lieferschein und Rechnung. Einmal hier pflegen genügt.
            </p>

            {showPreview ? (
              <div className="border border-gray-300 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-800 min-h-[200px]">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: templates.standardSignatur || '' }}
                />
              </div>
            ) : (
              <TipTapEditor
                content={templates.standardSignatur || ''}
                onChange={handleStandardSignaturChange}
                placeholder="Signatur mit Kontaktdaten, Logo etc."
                showPlaceholderButtons={false}
                minHeight="250px"
              />
            )}

            {/* Abweichungen sichtbar machen — sonst wundert man sich später über zwei Fassungen */}
            {abweichendeVorlagen.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      {abweichendeVorlagen.length === 1
                        ? 'Eine Vorlage hat eine eigene Signatur'
                        : `${abweichendeVorlagen.length} Vorlagen haben eine eigene Signatur`}
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                      Sie ignorieren die gemeinsame Signatur oben. Meist ist das ein Altbestand,
                      der beim Pflegen vergessen wurde.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {abweichendeVorlagen.map((typ) => (
                    <button
                      key={typ}
                      onClick={() => setzeAufGemeinsameSignatur(typ)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                      title="Eigene Signatur verwerfen, gemeinsame verwenden"
                    >
                      {dokumentTypen.find((d) => d.key === typ)?.label}: gemeinsame verwenden
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentTemplate && (
        <div className="p-6 space-y-6">
          {/* Betreff */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Betreff
            </label>
            <input
              type="text"
              value={currentTemplate.betreff}
              onChange={(e) => handleBetreffChange(activeTab as VorlagenSchluessel, e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              E-Mail-Inhalt
            </label>
            {showPreview ? (
              <div className="border border-gray-300 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-800 min-h-[300px]">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: ersetzePlatzhalterFuerVorschau(currentTemplate.htmlContent)
                  }}
                />
              </div>
            ) : (
              <TipTapEditor
                content={currentTemplate.htmlContent}
                onChange={(html) => handleContentChange(activeTab as VorlagenSchluessel, html)}
                placeholder="Schreiben Sie hier den E-Mail-Inhalt..."
                showPlaceholderButtons={true}
                minHeight="300px"
              />
            )}
          </div>

          {/* Signatur — normalerweise geerbt, Abweichung nur auf ausdrücklichen Wunsch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Signatur
            </label>

            {(currentTemplate.signatur || '').trim() === '' ? (
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-4">
                <div className="flex items-start gap-2">
                  <PenLine className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Verwendet die <strong>gemeinsame Signatur</strong> aus dem Reiter „Signatur".
                    </p>
                    <button
                      onClick={() => setActiveTab(SIGNATUR_TAB)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1"
                    >
                      Gemeinsame Signatur bearbeiten
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      handleSignaturChange(
                        activeTab as VorlagenSchluessel,
                        templates.standardSignatur || '<p></p>'
                      )
                    }
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    title="Für diese Vorlage eine abweichende Signatur pflegen"
                  >
                    Abweichende Signatur
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                  <span className="text-sm text-amber-900 dark:text-amber-200">
                    Diese Vorlage weicht von der gemeinsamen Signatur ab.
                  </span>
                  <button
                    onClick={() => setzeAufGemeinsameSignatur(activeTab as VorlagenSchluessel)}
                    className="px-3 py-1 text-sm rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                  >
                    Gemeinsame verwenden
                  </button>
                </div>
                {showPreview ? (
                  <div className="border border-gray-300 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-800 min-h-[150px]">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: currentTemplate.signatur || '' }}
                    />
                  </div>
                ) : (
                  <TipTapEditor
                    content={currentTemplate.signatur || ''}
                    onChange={(html) => handleSignaturChange(activeTab as VorlagenSchluessel, html)}
                    placeholder="Abweichende Signatur für diese Vorlage"
                    showPlaceholderButtons={false}
                    minHeight="150px"
                  />
                )}
              </>
            )}
          </div>
        </div>
        )}
      </div>

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
              Alle Templates speichern
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EmailTemplatesTab;
