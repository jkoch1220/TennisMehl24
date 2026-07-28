import { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle2, AlertCircle, Plus, Trash2, RotateCcw, ScrollText, FileText } from 'lucide-react';
import { ladeStammdaten, speichereStammdaten, invalidateStammdatenCache } from '../../services/stammdatenService';
import {
  KlauselVorlage,
  AgbAbschnitt,
  DEFAULT_KLAUSEL_VORLAGEN,
  DEFAULT_AGB_ABSCHNITTE,
  getKlauselVorlagen,
  getAgbAbschnitte,
} from '../../constants/vertragsklauseln';

/**
 * Stammdaten-Tab: Vertragsklauseln & AGB-Anhang
 *
 * Hier werden die Klausel-Vorlagen gepflegt, die auf Angeboten und
 * Auftragsbestätigungen per Checkbox aktiviert werden können, sowie der
 * AGB-Text, der als Kleintext-Anhang auf der letzten Seite gedruckt wird.
 */
const VertragsklauselnTab = () => {
  const [loading, setLoading] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const [vorlagen, setVorlagen] = useState<KlauselVorlage[]>(DEFAULT_KLAUSEL_VORLAGEN);
  const [agbAbschnitte, setAgbAbschnitte] = useState<AgbAbschnitt[]>(DEFAULT_AGB_ABSCHNITTE);
  // Erzwingt Neu-Initialisierung der unkontrollierten AGB-Textareas (z.B. nach Reset)
  const [agbResetZaehler, setAgbResetZaehler] = useState(0);

  useEffect(() => {
    const lade = async () => {
      setLoading(true);
      setFehler(null);
      try {
        const stammdaten = await ladeStammdaten();
        setVorlagen(getKlauselVorlagen(stammdaten));
        setAgbAbschnitte(getAgbAbschnitte(stammdaten));
      } catch (error) {
        console.error('Fehler beim Laden der Klauseln:', error);
        setFehler('Fehler beim Laden. Standard-Vorlagen werden angezeigt.');
      } finally {
        setLoading(false);
      }
    };
    lade();
  }, []);

  // === Klausel-Vorlagen ===
  const handleVorlageChange = (index: number, field: keyof KlauselVorlage, value: string | boolean) => {
    setVorlagen(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleVorlageHinzufuegen = () => {
    setVorlagen(prev => [
      ...prev,
      {
        id: `klausel-${Date.now()}`,
        titel: 'Neue Klausel',
        text: '',
        standardAktiv: false,
      },
    ]);
  };

  const handleVorlageLoeschen = (index: number) => {
    setVorlagen(prev => prev.filter((_, i) => i !== index));
  };

  // === AGB-Abschnitte ===
  const handleAgbTitelChange = (index: number, titel: string) => {
    setAgbAbschnitte(prev => prev.map((a, i) => (i === index ? { ...a, titel } : a)));
  };

  const handleAgbTextChange = (index: number, text: string) => {
    // Leerzeile trennt Absätze
    const absaetze = text.split(/\n\s*\n/).map(a => a.replace(/\n/g, ' ').trim()).filter(a => a.length > 0);
    setAgbAbschnitte(prev => prev.map((a, i) => (i === index ? { ...a, absaetze } : a)));
  };

  const handleAgbAbschnittHinzufuegen = () => {
    setAgbAbschnitte(prev => [...prev, { titel: 'Neuer Abschnitt', absaetze: [] }]);
  };

  const handleAgbAbschnittLoeschen = (index: number) => {
    setAgbAbschnitte(prev => prev.filter((_, i) => i !== index));
    // Indexe verschieben sich — unkontrollierte Textareas neu initialisieren
    setAgbResetZaehler(z => z + 1);
  };

  // === Speichern ===
  const handleSpeichern = async () => {
    setSpeichert(true);
    setErfolg(false);
    setFehler(null);

    try {
      const stammdaten = await ladeStammdaten();
      if (!stammdaten) {
        throw new Error('Stammdaten nicht gefunden. Bitte zuerst Firmendaten anlegen.');
      }

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
        vertragsklauselVorlagen: JSON.stringify(vorlagen),
        agbAbschnitte: JSON.stringify(agbAbschnitte),
      });

      invalidateStammdatenCache();
      setErfolg(true);
      setTimeout(() => setErfolg(false), 3000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setFehler('Fehler beim Speichern: ' + (error as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Statusmeldungen */}
      {fehler && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{fehler}</span>
        </div>
      )}
      {erfolg && (
        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-300">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">Klauseln & AGB gespeichert. Neue Angebote/ABs verwenden ab sofort diese Vorlagen.</span>
        </div>
      )}

      {/* === Klausel-Vorlagen === */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <ScrollText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Klausel-Vorlagen für Angebote & ABs</h2>
          </div>
          <button
            type="button"
            onClick={() => setVorlagen(DEFAULT_KLAUSEL_VORLAGEN)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            title="Alle Klausel-Vorlagen auf den Standard zurücksetzen"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Auf Standard zurücksetzen
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-dark-textMuted mb-4">
          Diese Klauseln erscheinen auf Angeboten und Auftragsbestätigungen unter „Weitere Vertragsklauseln" und können
          dort pro Dokument aktiviert und angepasst werden. „Standardmäßig aktiv" bestimmt die Voreinstellung für neue Dokumente.
        </p>

        <div className="space-y-4">
          {vorlagen.map((vorlage, index) => (
            <div key={vorlage.id} className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={vorlage.titel}
                      onChange={(e) => handleVorlageChange(index, 'titel', e.target.value)}
                      placeholder="Titel der Klausel"
                      className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={vorlage.standardAktiv}
                        onChange={(e) => handleVorlageChange(index, 'standardAktiv', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-dark-textMuted">Standardmäßig aktiv</span>
                    </label>
                  </div>
                  <textarea
                    value={vorlage.text}
                    onChange={(e) => handleVorlageChange(index, 'text', e.target.value)}
                    rows={4}
                    placeholder="Klauseltext, wie er auf dem Dokument gedruckt wird..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleVorlageLoeschen(index)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
                  title="Klausel-Vorlage löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleVorlageHinzufuegen}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-400 dark:border-slate-600 text-gray-600 dark:text-dark-textMuted text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Neue Klausel-Vorlage
        </button>
      </div>

      {/* === AGB-Anhang === */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">AGB-Anhang (Kleintext)</h2>
          </div>
          <button
            type="button"
            onClick={() => { setAgbAbschnitte(DEFAULT_AGB_ABSCHNITTE); setAgbResetZaehler(z => z + 1); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            title="AGB auf den Stand des Onlineshops (tennismehl24.com) zurücksetzen"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Auf Shop-AGB zurücksetzen
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-dark-textMuted mb-4">
          Diese AGB werden als zweispaltiger Kleintext auf der/den letzten Seite(n) von Angeboten und
          Auftragsbestätigungen gedruckt (abschaltbar pro Dokument). Absätze innerhalb eines Abschnitts
          durch eine Leerzeile trennen.
        </p>

        <div className="space-y-4">
          {agbAbschnitte.map((abschnitt, index) => (
            <div key={index} className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <input
                    type="text"
                    value={abschnitt.titel}
                    onChange={(e) => handleAgbTitelChange(index, e.target.value)}
                    placeholder="Abschnittstitel, z.B. § 1 Allgemeines"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text font-medium focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <textarea
                    key={`agb-${agbResetZaehler}-${index}`}
                    defaultValue={abschnitt.absaetze.join('\n\n')}
                    onBlur={(e) => handleAgbTextChange(index, e.target.value)}
                    rows={Math.min(10, Math.max(3, abschnitt.absaetze.length * 3))}
                    placeholder="Text des Abschnitts (Absätze durch Leerzeile trennen)..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAgbAbschnittLoeschen(index)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
                  title="Abschnitt löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAgbAbschnittHinzufuegen}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-400 dark:border-slate-600 text-gray-600 dark:text-dark-textMuted text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Neuer AGB-Abschnitt
        </button>
      </div>

      {/* Speichern */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSpeichern}
          disabled={speichert}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Klauseln & AGB speichern
        </button>
      </div>
    </div>
  );
};

export default VertragsklauselnTab;
