import { useState, useEffect } from 'react';
import { X, Save, Loader2, Package, AlertCircle } from 'lucide-react';
import {
  UniversalArtikel,
  UniversalArtikelInput,
  VersandartTyp,
} from '../../types/universaArtikel';
import {
  erstelleUniversalArtikel,
  aktualisiereUniversalArtikel,
  sucheUniversalArtikelNachNummer,
  parseVersandcode,
  istSperrgutArtikel,
} from '../../services/universaArtikelService';

interface UniversalArtikelDialogProps {
  open: boolean;
  artikel?: UniversalArtikel | null; // wenn gesetzt → Edit-Modus
  onClose: () => void;
  onSaved: (artikel: UniversalArtikel) => void;
}

type FormState = {
  artikelnummer: string;
  bezeichnung: string;
  verpackungseinheit: string;
  grosshaendlerPreisNetto: string;
  katalogPreisNetto: string;
  katalogPreisBrutto: string;
  seiteKatalog: string;
  ohneMwSt: boolean;
  versandcodeDE: string;
  versandcodeAT: string;
  versandcodeBenelux: string;
  gewichtKg: string;
  laengeCm: string;
  breiteCm: string;
  hoeheCm: string;
  ean: string;
  zolltarifnummer: string;
  ursprungsland: string;
  ursprungsregion: string;
};

const leererForm = (): FormState => ({
  artikelnummer: '',
  bezeichnung: '',
  verpackungseinheit: 'Stk',
  grosshaendlerPreisNetto: '',
  katalogPreisNetto: '',
  katalogPreisBrutto: '',
  seiteKatalog: '',
  ohneMwSt: false,
  versandcodeDE: '',
  versandcodeAT: '',
  versandcodeBenelux: '',
  gewichtKg: '',
  laengeCm: '',
  breiteCm: '',
  hoeheCm: '',
  ean: '',
  zolltarifnummer: '',
  ursprungsland: '',
  ursprungsregion: '',
});

const formFromArtikel = (a: UniversalArtikel): FormState => ({
  artikelnummer: a.artikelnummer ?? '',
  bezeichnung: a.bezeichnung ?? '',
  verpackungseinheit: a.verpackungseinheit ?? 'Stk',
  grosshaendlerPreisNetto: a.grosshaendlerPreisNetto != null ? String(a.grosshaendlerPreisNetto) : '',
  katalogPreisNetto: a.katalogPreisNetto != null ? String(a.katalogPreisNetto) : '',
  katalogPreisBrutto: a.katalogPreisBrutto != null ? String(a.katalogPreisBrutto) : '',
  seiteKatalog: a.seiteKatalog != null ? String(a.seiteKatalog) : '',
  ohneMwSt: a.ohneMwSt ?? false,
  versandcodeDE: a.versandcodeDE ?? '',
  versandcodeAT: a.versandcodeAT ?? '',
  versandcodeBenelux: a.versandcodeBenelux ?? '',
  gewichtKg: a.gewichtKg != null ? String(a.gewichtKg) : '',
  laengeCm: a.laengeCm != null ? String(a.laengeCm) : '',
  breiteCm: a.breiteCm != null ? String(a.breiteCm) : '',
  hoeheCm: a.hoeheCm != null ? String(a.hoeheCm) : '',
  ean: a.ean ?? '',
  zolltarifnummer: a.zolltarifnummer ?? '',
  ursprungsland: a.ursprungsland ?? '',
  ursprungsregion: a.ursprungsregion ?? '',
});

const parseZahl = (s: string): number | undefined => {
  if (!s.trim()) return undefined;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? undefined : n;
};

const UniversalArtikelDialog = ({ open, artikel, onClose, onSaved }: UniversalArtikelDialogProps) => {
  const istEdit = !!artikel;
  const [form, setForm] = useState<FormState>(leererForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(artikel ? formFromArtikel(artikel) : leererForm());
      setError(null);
    }
  }, [open, artikel]);

  if (!open) return null;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Auto-Berechnung Brutto aus Netto (nur wenn Brutto-Feld leer oder bei Netto-Änderung)
  const handleNettoChange = (value: string) => {
    updateField('katalogPreisNetto', value);
    const netto = parseZahl(value);
    if (netto != null && !form.ohneMwSt) {
      const brutto = Math.round(netto * 1.19 * 100) / 100;
      setForm((prev) => ({ ...prev, katalogPreisNetto: value, katalogPreisBrutto: String(brutto) }));
    }
  };

  const handleBruttoChange = (value: string) => {
    updateField('katalogPreisBrutto', value);
    const brutto = parseZahl(value);
    if (brutto != null && !form.ohneMwSt) {
      const netto = Math.round((brutto / 1.19) * 100) / 100;
      setForm((prev) => ({ ...prev, katalogPreisBrutto: value, katalogPreisNetto: String(netto) }));
    }
  };

  const handleOhneMwStToggle = (checked: boolean) => {
    setForm((prev) => {
      const next = { ...prev, ohneMwSt: checked };
      // Bei ohneMwSt = Netto = Brutto
      if (checked && prev.katalogPreisNetto) {
        next.katalogPreisBrutto = prev.katalogPreisNetto;
      }
      return next;
    });
  };

  const validieren = async (): Promise<string | null> => {
    if (!form.artikelnummer.trim()) return 'Artikelnummer ist Pflicht.';
    if (!form.bezeichnung.trim()) return 'Bezeichnung ist Pflicht.';
    if (!form.verpackungseinheit.trim()) return 'Verpackungseinheit ist Pflicht.';
    const ghPreis = parseZahl(form.grosshaendlerPreisNetto);
    const nettoPreis = parseZahl(form.katalogPreisNetto);
    const bruttoPreis = parseZahl(form.katalogPreisBrutto);
    if (ghPreis == null || ghPreis < 0) return 'Großhändlerpreis (netto) ist Pflicht und muss ≥ 0 sein.';
    if (nettoPreis == null || nettoPreis < 0) return 'Katalogpreis netto ist Pflicht und muss ≥ 0 sein.';
    if (bruttoPreis == null || bruttoPreis < 0) return 'Katalogpreis brutto ist Pflicht und muss ≥ 0 sein.';

    // Duplikats-Check bei Neuanlage
    if (!istEdit) {
      const existing = await sucheUniversalArtikelNachNummer(form.artikelnummer.trim());
      if (existing) return `Artikel mit Nummer "${form.artikelnummer}" existiert bereits.`;
    }

    return null;
  };

  const handleSave = async () => {
    setError(null);
    const valMsg = await validieren();
    if (valMsg) {
      setError(valMsg);
      return;
    }

    setSaving(true);
    try {
      const versandcodeDE = form.versandcodeDE.trim() || undefined;
      const gewichtKg = parseZahl(form.gewichtKg);
      const { versandart: versandartDE } = parseVersandcode(versandcodeDE);
      const sperrgut = istSperrgutArtikel(versandcodeDE ?? null, gewichtKg ?? null);

      const input: UniversalArtikelInput = {
        artikelnummer: form.artikelnummer.trim(),
        bezeichnung: form.bezeichnung.trim(),
        verpackungseinheit: form.verpackungseinheit.trim(),
        grosshaendlerPreisNetto: parseZahl(form.grosshaendlerPreisNetto) ?? 0,
        katalogPreisNetto: parseZahl(form.katalogPreisNetto) ?? 0,
        katalogPreisBrutto: parseZahl(form.katalogPreisBrutto) ?? 0,
        seiteKatalog: parseZahl(form.seiteKatalog),
        ohneMwSt: form.ohneMwSt,
        versandcodeDE,
        versandcodeAT: form.versandcodeAT.trim() || undefined,
        versandcodeBenelux: form.versandcodeBenelux.trim() || undefined,
        versandartDE: versandartDE as VersandartTyp,
        gewichtKg,
        laengeCm: parseZahl(form.laengeCm),
        breiteCm: parseZahl(form.breiteCm),
        hoeheCm: parseZahl(form.hoeheCm),
        ean: form.ean.trim() || undefined,
        zolltarifnummer: form.zolltarifnummer.trim() || undefined,
        ursprungsland: form.ursprungsland.trim().toUpperCase() || undefined,
        ursprungsregion: form.ursprungsregion.trim() || undefined,
        istSperrgut: sperrgut,
      };

      let gespeichert: UniversalArtikel;
      if (istEdit && artikel?.$id) {
        gespeichert = await aktualisiereUniversalArtikel(artikel.$id, input);
      } else {
        gespeichert = await erstelleUniversalArtikel(input);
      }
      onSaved(gespeichert);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm disabled:opacity-50';
  const labelCls = 'block text-xs font-medium text-gray-700 dark:text-dark-textMuted mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-orange-500 to-red-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {istEdit ? 'Universal-Artikel bearbeiten' : 'Neuen Universal-Artikel anlegen'}
              </h2>
              <p className="text-xs text-orange-100">
                {istEdit ? artikel?.artikelnummer : 'Einzeln hinzufügen'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Grunddaten */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Grunddaten</h3>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Artikelnummer *</label>
                <input
                  type="text"
                  value={form.artikelnummer}
                  onChange={(e) => updateField('artikelnummer', e.target.value)}
                  disabled={istEdit}
                  placeholder="z.B. U-12345"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-3">
                <label className={labelCls}>Bezeichnung *</label>
                <input
                  type="text"
                  value={form.bezeichnung}
                  onChange={(e) => updateField('bezeichnung', e.target.value)}
                  placeholder="Produktbezeichnung"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls}>VE *</label>
                <input
                  type="text"
                  value={form.verpackungseinheit}
                  onChange={(e) => updateField('verpackungseinheit', e.target.value)}
                  placeholder="Stk"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* Preise */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Preise (EUR)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Großhändlerpreis netto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.grosshaendlerPreisNetto}
                  onChange={(e) => updateField('grosshaendlerPreisNetto', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Katalogpreis netto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.katalogPreisNetto}
                  onChange={(e) => handleNettoChange(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Katalogpreis brutto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.katalogPreisBrutto}
                  onChange={(e) => handleBruttoChange(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-dark-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={form.ohneMwSt}
                onChange={(e) => handleOhneMwStToggle(e.target.checked)}
                className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded"
              />
              Artikel ist bereits Brutto (keine MwSt hinzufügen)
            </label>
          </section>

          {/* Versand */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Versand</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Versandcode DE</label>
                <input
                  type="text"
                  value={form.versandcodeDE}
                  onChange={(e) => updateField('versandcodeDE', e.target.value)}
                  placeholder="z.B. 31, 21, F.a.A."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Versandcode AT</label>
                <input
                  type="text"
                  value={form.versandcodeAT}
                  onChange={(e) => updateField('versandcodeAT', e.target.value)}
                  placeholder="z.B. 41"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Versandcode Benelux</label>
                <input
                  type="text"
                  value={form.versandcodeBenelux}
                  onChange={(e) => updateField('versandcodeBenelux', e.target.value)}
                  placeholder="z.B. 51"
                  className={inputCls}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Codes: 3x = GLS DE, 4x = GLS AT, 5x = GLS Benelux, 2x = Spedition, F.a.A. = Fracht auf Anfrage
            </p>
          </section>

          {/* Physische Eigenschaften */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Physische Eigenschaften</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className={labelCls}>Gewicht (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.gewichtKg}
                  onChange={(e) => updateField('gewichtKg', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Länge (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.laengeCm}
                  onChange={(e) => updateField('laengeCm', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Breite (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.breiteCm}
                  onChange={(e) => updateField('breiteCm', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Höhe (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.hoeheCm}
                  onChange={(e) => updateField('hoeheCm', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>EAN</label>
                <input
                  type="text"
                  value={form.ean}
                  onChange={(e) => updateField('ean', e.target.value)}
                  placeholder="13-stellig"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* Zoll & Herkunft */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Zoll &amp; Herkunft</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Zolltarifnummer (ZTN)</label>
                <input
                  type="text"
                  value={form.zolltarifnummer}
                  onChange={(e) => updateField('zolltarifnummer', e.target.value)}
                  placeholder="8-stellig, z.B. 95069990"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Ursprungsland</label>
                <input
                  type="text"
                  value={form.ursprungsland}
                  onChange={(e) => updateField('ursprungsland', e.target.value)}
                  placeholder="z.B. DE, CN, VN"
                  maxLength={2}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Ursprungsregion</label>
                <input
                  type="text"
                  value={form.ursprungsregion}
                  onChange={(e) => updateField('ursprungsregion', e.target.value)}
                  placeholder="z.B. 03, 08"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* Katalog */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Katalog-Referenz</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Seite im Katalog</label>
                <input
                  type="number"
                  min="0"
                  value={form.seiteKatalog}
                  onChange={(e) => updateField('seiteKatalog', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-slate-800/50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-textMuted border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white text-sm font-medium rounded-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {istEdit ? 'Änderungen speichern' : 'Artikel anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UniversalArtikelDialog;
