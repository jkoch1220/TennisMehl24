import { useState, useEffect, useCallback } from 'react';
import { X, Save, AlertCircle, AlertTriangle } from 'lucide-react';
import { OffeneRechnung, NeueOffeneRechnung, RechnungsStatus, Rechnungskategorie, Prioritaet, Mahnstufe, Unternehmen, RatenzahlungInterval } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';

interface RechnungsFormularProps {
  rechnung?: OffeneRechnung | null;
  defaultFirma?: Unternehmen;
  onSave: () => void;
  onCancel: () => void;
}

const RechnungsFormular = ({ rechnung, defaultFirma = 'Egner Bau', onSave, onCancel }: RechnungsFormularProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplikatWarnung, setDuplikatWarnung] = useState<{ existiert: boolean; kreditorName?: string } | null>(null);
  const [checkingDuplikat, setCheckingDuplikat] = useState(false);
  const [keinKontakt, setKeinKontakt] = useState(false);
  
  const [formData, setFormData] = useState<Partial<NeueOffeneRechnung>>({
    rechnungsnummer: '',
    betreff: '',
    kreditorId: undefined,
    kreditorName: '',
    status: 'offen',
    summe: 0,
    mwst: undefined,
    bruttoSumme: undefined,
    monatlicheRate: undefined,
    faelligkeitsdatum: new Date().toISOString().split('T')[0],
    rateFaelligAm: undefined,
    ratenzahlungInterval: undefined,
    rechnungsdatum: new Date().toISOString().split('T')[0],
    mahnstufe: 0,
    letzterKontakt: undefined,
    spaetestensBearbeitenAm: undefined,
    prioritaet: 'normal',
    kategorie: 'sonstiges',
    anUnternehmen: 'Egner Bau',
    kommentar: '',
    zahlungsreferenz: '',
  });

  // Setze Default-Firma wenn neue Rechnung erstellt wird
  useEffect(() => {
    if (!rechnung) {
      setFormData(prev => ({
        ...prev,
        anUnternehmen: defaultFirma
      }));
    }
  }, [rechnung, defaultFirma]);

  useEffect(() => {
    if (rechnung) {
      setFormData({
        rechnungsnummer: rechnung.rechnungsnummer || '',
        betreff: rechnung.betreff || '',
        kreditorId: rechnung.kreditorId,
        kreditorName: rechnung.kreditorName,
        status: rechnung.status,
        summe: rechnung.summe,
        mwst: rechnung.mwst,
        bruttoSumme: rechnung.bruttoSumme,
        monatlicheRate: rechnung.monatlicheRate,
        faelligkeitsdatum: rechnung.faelligkeitsdatum.split('T')[0],
        rateFaelligAm: rechnung.rateFaelligAm?.split('T')[0],
        ratenzahlungInterval: rechnung.ratenzahlungInterval,
        rechnungsdatum: rechnung.rechnungsdatum?.split('T')[0] || new Date().toISOString().split('T')[0],
        mahnstufe: rechnung.mahnstufe,
        letzterKontakt: rechnung.letzterKontakt?.split('T')[0],
        spaetestensBearbeitenAm: rechnung.spaetestensBearbeitenAm?.split('T')[0],
        prioritaet: rechnung.prioritaet,
        kategorie: rechnung.kategorie,
        anUnternehmen: rechnung.anUnternehmen,
        kommentar: rechnung.kommentar || '',
        zahlungsreferenz: rechnung.zahlungsreferenz || '',
      });
      setKeinKontakt(!rechnung.letzterKontakt);
    }
  }, [rechnung]);

  // Duplikat-Prüfung mit Debounce
  const checkDuplikat = useCallback(async (rechnungsnummer: string) => {
    if (!rechnungsnummer || rechnungsnummer.trim() === '') {
      setDuplikatWarnung(null);
      return;
    }

    setCheckingDuplikat(true);
    try {
      const result = await kreditorService.pruefeRechnungsnummerDuplikat(
        rechnungsnummer,
        rechnung?.id // Bei Bearbeitung die eigene ID ausschließen
      );
      
      if (result.existiert && result.rechnung) {
        setDuplikatWarnung({
          existiert: true,
          kreditorName: result.rechnung.kreditorName,
        });
      } else {
        setDuplikatWarnung(null);
      }
    } catch (err) {
      console.error('Fehler bei Duplikat-Prüfung:', err);
    } finally {
      setCheckingDuplikat(false);
    }
  }, [rechnung?.id]);

  // Debounced Duplikat-Prüfung
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.rechnungsnummer) {
        checkDuplikat(formData.rechnungsnummer);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.rechnungsnummer, checkDuplikat]);

  // Automatische Statusanpassung bei Mahnstufe
  useEffect(() => {
    if (formData.mahnstufe && formData.mahnstufe > 0) {
      // Wenn Mahnstufe gesetzt ist, automatisch auf "gemahnt" setzen
      if (formData.status !== 'gemahnt' && formData.status !== 'inkasso') {
        setFormData(prev => ({ ...prev, status: 'gemahnt' }));
      }
    }
  }, [formData.mahnstufe, formData.status]);

  // Automatische Prioritätsanpassung basierend auf Mahnstufe
  useEffect(() => {
    if (formData.mahnstufe === 4) {
      // Gerichtliches Mahnverfahren (Mahnstufe 4) automatisch auf "kritisch" setzen
      if (formData.prioritaet !== 'kritisch') {
        setFormData(prev => ({ ...prev, prioritaet: 'kritisch' }));
      }
    } else if (formData.mahnstufe === 3) {
      // 3. Mahnung automatisch auf "hoch" setzen, falls nicht schon "kritisch"
      if (formData.prioritaet !== 'kritisch' && formData.prioritaet !== 'hoch') {
        setFormData(prev => ({ ...prev, prioritaet: 'hoch' }));
      }
    }
  }, [formData.mahnstufe, formData.prioritaet]);

  // Automatische Prioritätsanpassung bei Inkasso-Status
  useEffect(() => {
    if (formData.status === 'inkasso') {
      // Bei Inkasso automatisch auf "kritisch" setzen
      if (formData.prioritaet !== 'kritisch') {
        setFormData(prev => ({ ...prev, prioritaet: 'kritisch' }));
      }
    }
  }, [formData.status, formData.prioritaet]);

  // Automatische Statusanpassung bei Ratenzahlung
  useEffect(() => {
    if (formData.monatlicheRate && formData.monatlicheRate > 0 && formData.rateFaelligAm) {
      // Wenn monatliche Rate und Fälligkeitsdatum gesetzt sind, automatisch auf "in_ratenzahlung" setzen
      if (formData.status !== 'in_ratenzahlung' && formData.status !== 'bezahlt' && formData.status !== 'storniert') {
        setFormData(prev => ({ ...prev, status: 'in_ratenzahlung' }));
      }
    }
  }, [formData.monatlicheRate, formData.rateFaelligAm, formData.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.kreditorName || formData.kreditorName.trim() === '') {
        throw new Error('Bitte geben Sie einen Kreditor/Glaubiger ein');
      }

      if (!formData.summe || formData.summe <= 0) {
        throw new Error('Bitte geben Sie einen gültigen Betrag ein');
      }

      if (!formData.faelligkeitsdatum) {
        throw new Error('Bitte geben Sie ein Fälligkeitsdatum ein');
      }

      // Duplikat-Prüfung vor dem Speichern
      if (formData.rechnungsnummer && formData.rechnungsnummer.trim() !== '') {
        const duplikatCheck = await kreditorService.pruefeRechnungsnummerDuplikat(
          formData.rechnungsnummer,
          rechnung?.id
        );
        
        if (duplikatCheck.existiert) {
          throw new Error(`Diese Rechnungsnummer existiert bereits bei "${duplikatCheck.rechnung?.kreditorName}". Bitte verwenden Sie eine andere Rechnungsnummer.`);
        }
      }

      const rechnungsDaten: NeueOffeneRechnung = {
        rechnungsnummer: formData.rechnungsnummer || undefined,
        betreff: formData.betreff || undefined,
        kreditorId: formData.kreditorId,
        kreditorName: formData.kreditorName!.trim(),
        status: formData.status || 'offen',
        summe: formData.summe!,
        mwst: formData.mwst,
        bruttoSumme: formData.bruttoSumme,
        monatlicheRate: formData.monatlicheRate,
        faelligkeitsdatum: new Date(formData.faelligkeitsdatum!).toISOString(),
        rateFaelligAm: formData.rateFaelligAm ? new Date(formData.rateFaelligAm).toISOString() : undefined,
        ratenzahlungInterval: formData.ratenzahlungInterval,
        rechnungsdatum: formData.rechnungsdatum ? new Date(formData.rechnungsdatum).toISOString() : undefined,
        mahnstufe: formData.mahnstufe || 0,
        letzterKontakt: formData.letzterKontakt ? new Date(formData.letzterKontakt).toISOString() : undefined,
        spaetestensBearbeitenAm: formData.spaetestensBearbeitenAm ? new Date(formData.spaetestensBearbeitenAm).toISOString() : undefined,
        prioritaet: formData.prioritaet || 'normal',
        kategorie: formData.kategorie || 'sonstiges',
        anUnternehmen: formData.anUnternehmen || defaultFirma,
        kommentar: formData.kommentar || undefined,
        zahlungsreferenz: formData.zahlungsreferenz || undefined,
      };

      if (rechnung) {
        await kreditorService.updateRechnung(rechnung.id, rechnungsDaten);
      } else {
        await kreditorService.createRechnung(rechnungsDaten);
      }

      onSave();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Rechnung');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {rechnung ? 'Rechnung bearbeiten' : 'Neue Rechnung anlegen'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Kreditor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Kreditor/Glaubiger <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.kreditorName || ''}
                onChange={(e) => setFormData({ ...formData, kreditorName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="z.B. Bauhaus GmbH"
                required
              />
            </div>

            {/* Kreditor-ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Kreditor-ID
              </label>
              <input
                type="text"
                value={formData.kreditorId || ''}
                onChange={(e) => setFormData({ ...formData, kreditorId: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Optional: Interne ID"
              />
            </div>

            {/* An Unternehmen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                An Unternehmen <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.anUnternehmen || 'TennisMehl'}
                onChange={(e) => setFormData({ ...formData, anUnternehmen: e.target.value as Unternehmen })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              >
                <option value="TennisMehl">TennisMehl</option>
                <option value="Egner Bau">Egner Bau</option>
              </select>
            </div>

            {/* Rechnungsnummer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Rechnungsnummer
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.rechnungsnummer || ''}
                  onChange={(e) => setFormData({ ...formData, rechnungsnummer: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                    duplikatWarnung?.existiert 
                      ? 'border-orange-400 bg-orange-50' 
                      : 'border-gray-300'
                  }`}
                  placeholder="z.B. RE-2026-001"
                />
                {checkingDuplikat && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  </div>
                )}
              </div>
              {duplikatWarnung?.existiert && (
                <div className="mt-2 flex items-center gap-2 text-orange-600 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Diese Rechnungsnummer existiert bereits bei "{duplikatWarnung.kreditorName}"
                  </span>
                </div>
              )}
            </div>

            {/* Betreff */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Betreff
              </label>
              <input
                type="text"
                value={formData.betreff || ''}
                onChange={(e) => setFormData({ ...formData, betreff: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Kurzbeschreibung der Rechnung"
              />
            </div>

            {/* Summe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Summe (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.summe || ''}
                onChange={(e) => setFormData({ ...formData, summe: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            {/* MwSt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                MwSt (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.mwst || ''}
                onChange={(e) => setFormData({ ...formData, mwst: parseFloat(e.target.value) || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Brutto-Summe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Brutto-Summe (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.bruttoSumme || ''}
                onChange={(e) => setFormData({ ...formData, bruttoSumme: parseFloat(e.target.value) || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Summe inkl. MwSt"
              />
            </div>

            {/* Monatliche Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Monatliche Rate (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.monatlicheRate || ''}
                onChange={(e) => setFormData({ ...formData, monatlicheRate: parseFloat(e.target.value) || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Für Ratenzahlungen"
              />
            </div>

            {/* Ratenzahlung Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Ratenzahlung Intervall
              </label>
              <select
                value={formData.ratenzahlungInterval || ''}
                onChange={(e) => setFormData({ ...formData, ratenzahlungInterval: e.target.value ? e.target.value as RatenzahlungInterval : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                disabled={!formData.monatlicheRate}
              >
                <option value="">Kein Intervall</option>
                <option value="monatlich">Monatlich</option>
                <option value="woechentlich">Wöchentlich</option>
              </select>
            </div>

            {/* Rate fällig am */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Rate fällig am
              </label>
              <input
                type="date"
                value={formData.rateFaelligAm || ''}
                onChange={(e) => setFormData({ ...formData, rateFaelligAm: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                disabled={!formData.monatlicheRate}
              />
              {formData.monatlicheRate && !formData.rateFaelligAm && (
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Wird bei Ratenzahlung verwendet
                </p>
              )}
            </div>

            {/* Fälligkeitsdatum */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Fälligkeitsdatum <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.faelligkeitsdatum || ''}
                onChange={(e) => setFormData({ ...formData, faelligkeitsdatum: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            {/* Rechnungsdatum */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Rechnungsdatum
              </label>
              <input
                type="date"
                value={formData.rechnungsdatum || ''}
                onChange={(e) => setFormData({ ...formData, rechnungsdatum: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Status
              </label>
              <select
                value={formData.status || 'offen'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as RechnungsStatus })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="offen">Offen</option>
                <option value="faellig">Fällig</option>
                <option value="gemahnt">Gemahnt</option>
                <option value="in_bearbeitung">In Bearbeitung</option>
                <option value="in_ratenzahlung">In Ratenzahlung</option>
                <option value="verzug">Verzug</option>
                <option value="inkasso">Inkasso</option>
                <option value="bezahlt">Bezahlt</option>
                <option value="storniert">Storniert</option>
              </select>
            </div>

            {/* Mahnstufe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Mahnstufe
              </label>
              <select
                value={formData.mahnstufe || 0}
                onChange={(e) => setFormData({ ...formData, mahnstufe: parseInt(e.target.value) as Mahnstufe })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="0">Keine Mahnung</option>
                <option value="1">1. Mahnung</option>
                <option value="2">2. Mahnung</option>
                <option value="3">3. Mahnung</option>
                <option value="4">Gerichtliches Mahnverfahren</option>
              </select>
            </div>

            {/* Priorität */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Priorität
              </label>
              <select
                value={formData.prioritaet || 'normal'}
                onChange={(e) => setFormData({ ...formData, prioritaet: e.target.value as Prioritaet })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="niedrig">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="hoch">Hoch</option>
                <option value="kritisch">Kritisch</option>
              </select>
            </div>

            {/* Kategorie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Kategorie
              </label>
              <select
                value={formData.kategorie || 'sonstiges'}
                onChange={(e) => setFormData({ ...formData, kategorie: e.target.value as Rechnungskategorie })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="lieferanten">Lieferanten</option>
                <option value="dienstleister">Dienstleister</option>
                <option value="energie">Energie</option>
                <option value="miete">Miete</option>
                <option value="versicherung">Versicherung</option>
                <option value="steuern">Steuern</option>
                <option value="darlehen">Darlehen</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </div>

            {/* Letzter Kontakt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Letzter Kontakt
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="keinKontakt"
                    checked={keinKontakt}
                    onChange={(e) => {
                      setKeinKontakt(e.target.checked);
                      if (e.target.checked) {
                        setFormData({ ...formData, letzterKontakt: undefined });
                      }
                    }}
                    className="w-4 h-4 text-red-600 border-gray-300 dark:border-slate-700 rounded focus:ring-red-500"
                  />
                  <label htmlFor="keinKontakt" className="text-sm text-gray-600 dark:text-slate-400 cursor-pointer">
                    Kein Kontakt bisher
                  </label>
                </div>
                <input
                  type="date"
                  value={formData.letzterKontakt || ''}
                  onChange={(e) => setFormData({ ...formData, letzterKontakt: e.target.value || undefined })}
                  disabled={keinKontakt}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                    keinKontakt ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                  }`}
                />
              </div>
            </div>

            {/* Spätestens bearbeiten am */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Spätestens bearbeiten am
              </label>
              <input
                type="date"
                value={formData.spaetestensBearbeitenAm || ''}
                onChange={(e) => setFormData({ ...formData, spaetestensBearbeitenAm: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Zahlungsreferenz */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Zahlungsreferenz
              </label>
              <input
                type="text"
                value={formData.zahlungsreferenz || ''}
                onChange={(e) => setFormData({ ...formData, zahlungsreferenz: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Verwendungszweck"
              />
            </div>

            {/* Kommentar */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">
                Kommentar
              </label>
              <textarea
                value={formData.kommentar || ''}
                onChange={(e) => setFormData({ ...formData, kommentar: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Zusätzliche Notizen..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 dark:bg-slate-800 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RechnungsFormular;
