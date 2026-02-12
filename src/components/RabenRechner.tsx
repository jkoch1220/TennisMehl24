import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Truck, Package, MapPin, Fuel, ChevronDown, ChevronUp, Info, Zap, Shield, ArrowRight, RotateCcw } from 'lucide-react';
import { NumberInput } from './NumberInput';
import {
  PLZ_ZU_FRACHTZONE,
  PLZ_ZU_DEZONE,
  RABEN_DIESEL_BASIS_CENT,
  RABEN_NEBENGEBUEHREN,
  RABEN_DIESELFLOATER,
  RABEN_ABHOLTARIF_EUROPALETTE,
  berechneRabenFracht,
  berechneRabenDieselzuschlag,
  type RabenBerechnungsErgebnis,
  type RabenNebengebuehr,
} from '../constants/rabenPricing';
import { holeDieselPreis, istDieselPreisAPIVerfuegbar } from '../utils/dieselPreisAPI';

// ============================================================================
// RABEN RECHNER COMPONENT
// ============================================================================

const RabenRechner = () => {
  // Eingabe-State
  const [paletten, setPaletten] = useState<number>(1);
  const [gewichtKg, setGewichtKg] = useState<number>(1000);
  const [zielPLZ, setZielPLZ] = useState<string>('');
  const [dieselPreisCent, setDieselPreisCent] = useState<number>(155);
  const [dieselPreisManuell, setDieselPreisManuell] = useState<boolean>(false);
  const [dieselLadeStatus, setDieselLadeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // UI-State
  const [showNebengebuehren, setShowNebengebuehren] = useState(false);
  const [showDieselfloater, setShowDieselfloater] = useState(false);
  const [showAbholtarif, setShowAbholtarif] = useState(false);
  const [ausgewaehlteNebengebuehren, setAusgewaehlteNebengebuehren] = useState<Set<string>>(new Set());
  const [gewichtModus, setGewichtModus] = useState<'paletten' | 'manuell'>('paletten');

  // Refs
  const dieselTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Lade Dieselpreis via Tankerkoenig API
  useEffect(() => {
    if (dieselTimeoutRef.current) clearTimeout(dieselTimeoutRef.current);
    if (!dieselPreisManuell && istDieselPreisAPIVerfuegbar() && zielPLZ.length >= 5) {
      setDieselLadeStatus('loading');
      dieselTimeoutRef.current = setTimeout(() => {
        holeDieselPreis(zielPLZ)
          .then(preis => {
            setDieselPreisCent(Math.round(preis * 100));
            setDieselLadeStatus('success');
          })
          .catch(() => setDieselLadeStatus('error'));
      }, 600);
    }
    return () => { if (dieselTimeoutRef.current) clearTimeout(dieselTimeoutRef.current); };
  }, [zielPLZ, dieselPreisManuell]);

  // Lade initialen Dieselpreis bei Marktheidenfeld
  useEffect(() => {
    if (!dieselPreisManuell && istDieselPreisAPIVerfuegbar()) {
      holeDieselPreis('97828')
        .then(preis => {
          setDieselPreisCent(Math.round(preis * 100));
          setDieselLadeStatus('success');
        })
        .catch(() => setDieselLadeStatus('error'));
    }
  }, []);

  // Berechnung
  const ergebnis = useMemo<RabenBerechnungsErgebnis | null>(() => {
    if (zielPLZ.length < 2) return null;
    return berechneRabenFracht(paletten, gewichtKg, zielPLZ, dieselPreisCent);
  }, [paletten, gewichtKg, zielPLZ, dieselPreisCent]);

  // Nebengebühren Summe
  const nebengebuehrenSumme = useMemo(() => {
    let summe = 0;
    RABEN_NEBENGEBUEHREN.forEach(ng => {
      if (ausgewaehlteNebengebuehren.has(ng.code) && typeof ng.preis === 'number') {
        summe += ng.preis;
      }
    });
    return summe;
  }, [ausgewaehlteNebengebuehren]);

  const gesamtMitNebengebuehren = useMemo(() => {
    if (!ergebnis) return 0;
    return ergebnis.gesamtpreis + nebengebuehrenSumme;
  }, [ergebnis, nebengebuehrenSumme]);

  // Zone/PLZ Info
  const zoneInfo = useMemo(() => {
    if (zielPLZ.length < 2) return null;
    const prefix = zielPLZ.substring(0, 2);
    const frachtzone = PLZ_ZU_FRACHTZONE[prefix];
    const deZone = PLZ_ZU_DEZONE[prefix];
    return { prefix, frachtzone, deZone };
  }, [zielPLZ]);

  // Dieselzuschlag
  const dieselzuschlagProzent = useMemo(() => berechneRabenDieselzuschlag(dieselPreisCent), [dieselPreisCent]);
  const dieselDifferenz = useMemo(() => ((dieselPreisCent - RABEN_DIESEL_BASIS_CENT) / RABEN_DIESEL_BASIS_CENT * 100), [dieselPreisCent]);

  // Handler
  const handlePalettenChange = useCallback((val: number) => {
    setPaletten(val);
    if (gewichtModus === 'paletten') setGewichtKg(val * 1000);
  }, [gewichtModus]);

  const handleGewichtChange = useCallback((val: number) => {
    setGewichtKg(val);
    if (gewichtModus === 'paletten') setPaletten(Math.ceil(val / 1000));
  }, [gewichtModus]);

  const handlePLZChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZielPLZ(e.target.value.replace(/\D/g, '').slice(0, 5));
  }, []);

  const toggleNebengebuehr = useCallback((code: string) => {
    setAusgewaehlteNebengebuehren(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setPaletten(1);
    setGewichtKg(1000);
    setZielPLZ('');
    setAusgewaehlteNebengebuehren(new Set());
    setGewichtModus('paletten');
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/25">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Raben Frachtkostenrechner
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tarif Deutschland ab 16.01.2026 &middot; Ladestelle 97828 Marktheidenfeld
              </p>
            </div>
          </div>
        </div>

        {/* Eingabebereich */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Linke Spalte: Eingaben */}
          <div className="lg:col-span-5 space-y-4">

            {/* PLZ Eingabe */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                <MapPin className="w-4 h-4 text-blue-600" />
                Ziel-Postleitzahl
              </label>
              <input
                type="text"
                value={zielPLZ}
                onChange={handlePLZChange}
                placeholder="z.B. 10115 Berlin"
                maxLength={5}
                className="w-full px-4 py-3 text-lg font-medium bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/20 outline-none transition-all dark:text-white placeholder:text-slate-400"
              />
              {zoneInfo && (
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  {zoneInfo.frachtzone && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md font-medium">
                      Frachtzone {zoneInfo.frachtzone}
                    </span>
                  )}
                  {zoneInfo.deZone && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-md font-medium">
                      {zoneInfo.deZone}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Paletten & Gewicht */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl">
              {/* Modus Toggle */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => { setGewichtModus('paletten'); setGewichtKg(paletten * 1000); }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    gewichtModus === 'paletten'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <Package className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Nach Paletten
                </button>
                <button
                  onClick={() => setGewichtModus('manuell')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    gewichtModus === 'manuell'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <Truck className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Manuelles Gewicht
                </button>
              </div>

              {gewichtModus === 'paletten' ? (
                <>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Anzahl Paletten
                  </label>
                  {/* Palette Stepper */}
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => handlePalettenChange(n)}
                        className={`flex-1 py-3 rounded-xl text-lg font-bold transition-all ${
                          paletten === n
                            ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:scale-102'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    = {gewichtKg.toLocaleString('de-DE')} kg ({(gewichtKg / 1000).toFixed(1)} t) &middot; je 1.000 kg/Palette
                  </p>

                  {/* Ab 6 Paletten: Manuell */}
                  <button
                    onClick={() => { setGewichtModus('manuell'); setPaletten(6); setGewichtKg(6000); }}
                    className="mt-3 w-full py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    Mehr als 5 Paletten? Wechsel zum manuellen Modus (6t-24t)
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Paletten
                      </label>
                      <NumberInput
                        value={paletten}
                        onChange={(v) => { setPaletten(Math.max(1, Math.round(v))); }}
                        className="w-full px-4 py-3 text-lg font-medium bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 outline-none transition-all dark:text-white"
                        step={1}
                        min={1}
                        max={24}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Gewicht (kg)
                      </label>
                      <NumberInput
                        value={gewichtKg}
                        onChange={handleGewichtChange}
                        className="w-full px-4 py-3 text-lg font-medium bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 outline-none transition-all dark:text-white"
                        step={100}
                        min={100}
                        max={24000}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {(gewichtKg / 1000).toFixed(1)} Tonnen &middot; Tarif: {gewichtKg <= 5000 ? 'bis 5t (Zonen)' : 'ab 5t (PLZ-basiert)'}
                  </p>
                </>
              )}
            </div>

            {/* Dieselpreis */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <Fuel className="w-4 h-4 text-amber-600" />
                  Dieselpreis
                </label>
                {istDieselPreisAPIVerfuegbar() && (
                  <button
                    onClick={() => {
                      setDieselPreisManuell(!dieselPreisManuell);
                      if (dieselPreisManuell && zielPLZ.length >= 5) {
                        holeDieselPreis(zielPLZ).then(p => setDieselPreisCent(Math.round(p * 100)));
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      dieselPreisManuell
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    {dieselPreisManuell ? 'Manuell' : 'Live API'}
                    {dieselLadeStatus === 'loading' && (
                      <span className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <NumberInput
                    value={dieselPreisCent}
                    onChange={setDieselPreisCent}
                    className="w-full px-4 py-3 text-lg font-medium bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none transition-all dark:text-white"
                    step={1}
                    min={80}
                    max={300}
                    readOnly={!dieselPreisManuell}
                  />
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Cent/Liter brutto &middot; Basis: {RABEN_DIESEL_BASIS_CENT} Ct
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold tabular-nums ${dieselzuschlagProzent > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {dieselzuschlagProzent > 0 ? '+' : ''}{dieselzuschlagProzent.toFixed(2)}%
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Zuschlag ({dieselDifferenz > 0 ? '+' : ''}{dieselDifferenz.toFixed(1)}% Diff.)
                  </p>
                </div>
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="w-full py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Zurücksetzen
            </button>
          </div>

          {/* Rechte Spalte: Ergebnis */}
          <div className="lg:col-span-7 space-y-4">

            {/* Hauptergebnis */}
            {ergebnis ? (
              <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl overflow-hidden">
                {/* Preis-Header */}
                <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-blue-200 text-sm font-medium mb-1">Frachtkosten netto</p>
                      <p className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
                        {ergebnis.gesamtpreis.toFixed(2)} <span className="text-2xl font-normal text-blue-200">EUR</span>
                      </p>
                      {nebengebuehrenSumme > 0 && (
                        <p className="mt-1 text-blue-200 text-sm">
                          + {nebengebuehrenSumme.toFixed(2)} EUR Nebengebühren = <span className="text-white font-bold">{gesamtMitNebengebuehren.toFixed(2)} EUR</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center px-3 py-1.5 bg-white/15 rounded-lg backdrop-blur-sm">
                        <span className="text-sm font-medium">
                          {ergebnis.tarifArt === 'bis5t' ? `Zone ${ergebnis.frachtzone}` : ergebnis.deZone}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mini-Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/20">
                    <div>
                      <p className="text-blue-200 text-xs">Pro Palette</p>
                      <p className="text-lg font-bold tabular-nums">{ergebnis.preisProPalette.toFixed(2)} EUR</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-xs">Pro kg</p>
                      <p className="text-lg font-bold tabular-nums">{ergebnis.preisProKg.toFixed(4)} EUR</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-xs">Pro Tonne</p>
                      <p className="text-lg font-bold tabular-nums">{(ergebnis.preisProKg * 1000).toFixed(2)} EUR</p>
                    </div>
                  </div>
                </div>

                {/* Aufschlüsselung */}
                <div className="p-5">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Kostenaufschlüsselung
                  </h3>
                  <div className="space-y-2.5">
                    <KostenZeile
                      label="Basisfracht"
                      sublabel={`${paletten} Pal. &times; ${(gewichtKg / 1000).toFixed(1)}t nach PLZ ${zielPLZ}`}
                      betrag={ergebnis.basispreis}
                    />
                    <KostenZeile
                      label="Dieselzuschlag"
                      sublabel={`${ergebnis.dieselzuschlagProzent.toFixed(2)}% auf Basisfracht`}
                      betrag={ergebnis.dieselzuschlagBetrag}
                      akzent={ergebnis.dieselzuschlagBetrag > 0}
                    />
                    {nebengebuehrenSumme > 0 && (
                      <KostenZeile
                        label="Nebengebühren"
                        sublabel={`${ausgewaehlteNebengebuehren.size} ausgewählt`}
                        betrag={nebengebuehrenSumme}
                        akzent
                      />
                    )}
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700">
                      <KostenZeile
                        label="Gesamtkosten netto"
                        sublabel="zzgl. gesetzl. MwSt."
                        betrag={gesamtMitNebengebuehren}
                        bold
                      />
                      <div className="mt-1.5">
                        <KostenZeile
                          label="Gesamtkosten brutto"
                          sublabel="inkl. 19% MwSt."
                          betrag={gesamtMitNebengebuehren * 1.19}
                          bold
                          muted
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tarif-Info */}
                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                        <p>
                          <strong>Tarif:</strong> {ergebnis.tarifArt === 'bis5t' ? 'Sendungstarif bis 5t (Zonenbasiert)' : 'PLZ-basierter Tarif ab 6t'} &middot;
                          Gewichtsstufe: {(ergebnis.gewichtsstufe / 1000).toFixed(0)}t
                        </p>
                        <p>Maut inkludiert &middot; Transportversicherung: Verzichtskunde &middot; Zahlungsziel: 14 Tage</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-12 shadow-sm border border-slate-200/80 dark:border-slate-700/60 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                  {zielPLZ.length > 0 && zielPLZ.length < 2
                    ? 'Bitte mindestens 2 Stellen der PLZ eingeben'
                    : zielPLZ.length >= 2 && !ergebnis
                    ? 'Kein Tarif für diese PLZ gefunden'
                    : 'Gib eine Ziel-PLZ ein um die Frachtkosten zu berechnen'}
                </p>
              </div>
            )}

            {/* Nebengebühren */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl overflow-hidden">
              <button
                onClick={() => setShowNebengebuehren(!showNebengebuehren)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nebengebühren & Premiumdienste</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {ausgewaehlteNebengebuehren.size > 0
                        ? `${ausgewaehlteNebengebuehren.size} ausgewählt (+${nebengebuehrenSumme.toFixed(2)} EUR)`
                        : 'Optionale Zusatzleistungen'}
                    </p>
                  </div>
                </div>
                {showNebengebuehren ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {showNebengebuehren && (
                <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700/60">
                  {(['premium', 'service', 'zuschlag'] as const).map(kat => (
                    <div key={kat} className="mt-4">
                      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {kat === 'premium' ? 'Premiumdienste' : kat === 'service' ? 'Services' : 'Zuschläge'}
                      </h4>
                      <div className="space-y-1.5">
                        {RABEN_NEBENGEBUEHREN.filter(ng => ng.kategorie === kat).map(ng => (
                          <NebengebuehrZeile
                            key={ng.code}
                            ng={ng}
                            selected={ausgewaehlteNebengebuehren.has(ng.code)}
                            onToggle={() => toggleNebengebuehr(ng.code)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dieselfloater Tabelle */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl overflow-hidden">
              <button
                onClick={() => setShowDieselfloater(!showDieselfloater)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                    <Fuel className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dieselfloater-Tabelle</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Basis: {RABEN_DIESEL_BASIS_CENT} Ct/L &middot; Aktuell: {dieselPreisCent} Ct/L</p>
                  </div>
                </div>
                {showDieselfloater ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {showDieselfloater && (
                <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 dark:text-slate-400">
                          <th className="text-left py-2 font-medium">Diesel bis Ct/L</th>
                          <th className="text-center py-2 font-medium">Differenz</th>
                          <th className="text-right py-2 font-medium">Zuschlag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RABEN_DIESELFLOATER.map((stufe, i) => {
                          const isAktiv = dieselPreisCent <= stufe.maxPreisCent &&
                            (i === 0 || dieselPreisCent > RABEN_DIESELFLOATER[i - 1].maxPreisCent);
                          return (
                            <tr
                              key={i}
                              className={`border-t border-slate-100 dark:border-slate-700/40 ${
                                isAktiv ? 'bg-amber-50 dark:bg-amber-900/20 font-semibold' : ''
                              }`}
                            >
                              <td className="py-1.5 text-slate-700 dark:text-slate-300">{stufe.maxPreisCent.toFixed(2)}</td>
                              <td className="py-1.5 text-center text-slate-500 dark:text-slate-400">{stufe.differenz}</td>
                              <td className={`py-1.5 text-right ${isAktiv ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {stufe.zuschlagProzent.toFixed(2)}%
                                {isAktiv && <ArrowRight className="w-3 h-3 inline ml-1" />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Update monatlich (Durchschnittspreis Vorvormonat) &middot; Quelle: en2x.de
                  </p>
                </div>
              )}
            </div>

            {/* Abholtarif Lademittel */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-xl overflow-hidden">
              <button
                onClick={() => setShowAbholtarif(!showAbholtarif)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Abholtarif Lademittel</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Europaletten & Gitterboxen Rückholung</p>
                  </div>
                </div>
                {showAbholtarif ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {showAbholtarif && (
                <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Europaletten</h4>
                      <div className="space-y-1">
                        {RABEN_ABHOLTARIF_EUROPALETTE.map((t, i) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700/40 last:border-0">
                            <span className="text-slate-600 dark:text-slate-400">{t.vonAnzahl}-{t.bisAnzahl} EP</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{t.preis.toFixed(2)} EUR</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Gitterboxen</h4>
                      <div className="space-y-1">
                        {[
                          { von: '1-2', preis: 38.06 },
                          { von: '3-4', preis: 43.65 },
                          { von: '5-6', preis: 49.24 },
                          { von: '7-8', preis: 64.82 },
                          { von: '9-10', preis: 80.39 },
                          { von: '11-12', preis: 95.97 },
                        ].map((t, i) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700/40 last:border-0">
                            <span className="text-slate-600 dark:text-slate-400">{t.von} GP</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{t.preis.toFixed(2)} EUR</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Nur innerhalb Deutschlands. Transport zum nächsten Raben-Depot.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          <p>Alle Preise in EUR netto zzgl. gesetzl. MwSt. &middot; Offerte gültig ab 16.01.2026 bis auf Widerruf</p>
          <p className="mt-1">Fracht ab DE-97828 Marktheidenfeld &middot; Raben Trans European Germany GmbH</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KostenZeile({ label, sublabel, betrag, bold, akzent, muted }: {
  label: string;
  sublabel?: string;
  betrag: number;
  bold?: boolean;
  akzent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className={`text-sm ${bold ? 'font-bold text-slate-900 dark:text-white' : muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-slate-500 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: sublabel }} />
        )}
      </div>
      <p className={`text-sm tabular-nums ${
        bold ? 'font-bold text-slate-900 dark:text-white text-base' :
        akzent ? 'font-semibold text-amber-600' :
        muted ? 'text-slate-500 dark:text-slate-400' :
        'font-medium text-slate-700 dark:text-slate-300'
      }`}>
        {betrag.toFixed(2)} EUR
      </p>
    </div>
  );
}

function NebengebuehrZeile({ ng, selected, onToggle }: {
  ng: RabenNebengebuehr;
  selected: boolean;
  onToggle: () => void;
}) {
  const istNumerisch = typeof ng.preis === 'number';
  return (
    <button
      onClick={istNumerisch ? onToggle : undefined}
      disabled={!istNumerisch}
      className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all text-left ${
        selected
          ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50'
          : istNumerisch
          ? 'hover:bg-slate-50 dark:hover:bg-slate-700/30 border border-transparent'
          : 'opacity-60 cursor-default border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
          selected
            ? 'bg-violet-600 border-violet-600'
            : 'border-slate-300 dark:border-slate-600'
        }`}>
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{ng.bezeichnung}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{ng.code} &middot; {ng.einheit}</p>
        </div>
      </div>
      <span className={`text-sm font-medium shrink-0 ml-3 ${
        istNumerisch ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 text-xs'
      }`}>
        {istNumerisch ? `${(ng.preis as number).toFixed(2)} EUR` : ng.preis}
      </span>
    </button>
  );
}

export default RabenRechner;
