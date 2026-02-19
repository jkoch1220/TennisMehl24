/**
 * TourenBuchung - Teilbuchungen auf mehrere Touren
 *
 * BEISPIEL:
 * - Kunde braucht 30t
 * - Tour #01: 10t buchen
 * - Tour #02: 20t buchen
 *
 * FLOW:
 * 1. Badge klicken → Panel öffnet
 * 2. Tour wählen → Tonnen-Eingabe (Default = OFFENE Menge)
 * 3. OK klicken → Gebucht
 * 4. Weitere Tour wählen für Rest
 */

import { useState, useRef } from 'react';
import {
  Truck,
  Plus,
  Minus,
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MoveRight,
  Check,
  Trash2,
} from 'lucide-react';
import { Tour, TourFahrzeugTyp } from '../../types/tour';
import { Projekt } from '../../types/projekt';
import { tourenService } from '../../services/tourenService';
import { parseMaterialAufschluesselung, MaterialAufschluesselung } from '../../utils/dispoMaterialParser';
import { LKWVisualisierung } from './LKWVisualisierung';

// === TYPES ===

interface Buchung {
  tourId: string;
  tourName: string;
  tonnen: number;
  lkwTyp: TourFahrzeugTyp;
}

interface AuftragMitBuchungen {
  projekt: Projekt;
  projektId: string;
  gesamtMenge: number;
  material: MaterialAufschluesselung; // Detaillierte Material-Aufschlüsselung
  buchungen: Buchung[];
  gebuchteTonnen: number;
  offeneTonnen: number;
  istVollstaendigGebucht: boolean;
}

// === HELPERS ===

const formatTonnen = (t: number) => t % 1 === 0 ? `${t}t` : `${t.toFixed(1)}t`;

// === HAUPT-KOMPONENTE: Tour-Auswahl Panel ===
interface TourAuswahlPanelProps {
  auftrag: AuftragMitBuchungen;
  touren: Tour[];
  onBuchen: (tourId: string, tonnen: number) => Promise<void>;
  onEntfernen: (tourId: string) => void;
  onClose: () => void;
}

const TourAuswahlPanel = ({
  auftrag,
  touren,
  onBuchen,
  onEntfernen,
  onClose,
}: TourAuswahlPanelProps) => {
  const [saving, setSaving] = useState(false);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [tonnen, setTonnen] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Für LKW-Visualisierung: Welcher Bereich ist ausgewählt?
  const [ausgewaehlterBereich, setAusgewaehlterBereich] = useState<'motorwagen' | 'haenger' | null>(null);

  // Prüfen ob Tour bereits gebucht ist
  const getBuchungFuerTour = (tourId: string) => {
    return auftrag.buchungen.find(b => b.tourId === tourId);
  };

  // Default-Tonnen: IMMER die offene Menge (oder Gesamtmenge wenn noch nichts gebucht)
  const getDefaultTonnen = (tour: Tour) => {
    const bestehendeBuchung = getBuchungFuerTour(tour.id);
    if (bestehendeBuchung) {
      // Diese Tour hat schon eine Buchung → deren Menge als Default
      return bestehendeBuchung.tonnen;
    }
    // Neue Tour → Offene Menge als Default
    return auftrag.offeneTonnen > 0 ? auftrag.offeneTonnen : auftrag.gesamtMenge;
  };

  // Max Tonnen die gebucht werden können
  const getMaxTonnen = (tour: Tour) => {
    const bestehendeBuchung = getBuchungFuerTour(tour.id);
    if (bestehendeBuchung) {
      // Bei bestehender Buchung: Die gebuchte Menge + offene Menge
      return bestehendeBuchung.tonnen + auftrag.offeneTonnen;
    }
    // Neue Buchung: Offene Menge (oder Gesamtmenge wenn erste Buchung)
    return auftrag.offeneTonnen > 0 ? auftrag.offeneTonnen : auftrag.gesamtMenge;
  };

  // Wenn Tour ausgewählt wird
  const handleTourSelect = (tour: Tour) => {
    if (saving) return;

    setSelectedTour(tour);
    setTonnen(getDefaultTonnen(tour));

    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);
  };

  // Buchung bestätigen
  const handleConfirm = async () => {
    if (!selectedTour || tonnen <= 0) return;

    setSaving(true);
    try {
      await onBuchen(selectedTour.id, tonnen);
      setSelectedTour(null);
      // Panel offen lassen für weitere Buchungen
    } catch (error) {
      console.error('Fehler:', error);
      alert('Fehler beim Buchen');
    } finally {
      setSaving(false);
    }
  };

  // Enter-Taste zum Bestätigen
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tonnen > 0) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      setSelectedTour(null);
    }
  };

  const maxTonnen = selectedTour ? getMaxTonnen(selectedTour) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Tour-Buchung</h2>
              <p className="text-blue-100 text-sm">
                {auftrag.projekt.kundenname}
              </p>
              {/* Material-Details */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {auftrag.material.lose02 > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/30 text-blue-100">
                    {auftrag.material.lose02}t 0-2
                  </span>
                )}
                {auftrag.material.lose03 > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/30 text-green-100">
                    {auftrag.material.lose03}t 0-3
                  </span>
                )}
                {auftrag.material.gesamtGesackt > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-500/30 text-amber-100">
                    {auftrag.material.gesamtGesackt.toFixed(1)}t Sack
                  </span>
                )}
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-white/20 text-white">
                  Σ {formatTonnen(auftrag.gesamtMenge)}
                </span>
                {auftrag.gebuchteTonnen > 0 && (
                  <span className="text-yellow-200 text-xs">
                    • {formatTonnen(auftrag.offeneTonnen)} offen
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bestehende Buchungen anzeigen */}
        {auftrag.buchungen.length > 0 && (
          <div className="px-5 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-2">Aktuelle Buchungen:</p>
            <div className="flex flex-wrap gap-2">
              {auftrag.buchungen.map(buchung => (
                <div
                  key={buchung.tourId}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-green-300 dark:border-green-700"
                >
                  <Truck className={`w-4 h-4 ${buchung.lkwTyp === 'mit_haenger' ? 'text-purple-500' : 'text-blue-500'}`} />
                  <span className="font-medium text-gray-900 dark:text-white">{buchung.tourName}</span>
                  <span className="text-green-600 dark:text-green-400 font-bold">{formatTonnen(buchung.tonnen)}</span>
                  <button
                    onClick={() => onEntfernen(buchung.tourId)}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    title="Buchung entfernen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TONNEN-EINGABE wenn Tour ausgewählt */}
        {selectedTour && (
          <div className="px-5 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedTour.lkwTyp === 'mit_haenger' ? 'bg-purple-100' : 'bg-blue-100'
              }`}>
                <Truck className={`w-5 h-5 ${selectedTour.lkwTyp === 'mit_haenger' ? 'text-purple-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 dark:text-white">{selectedTour.name}</p>
                <p className="text-sm text-gray-500">
                  {getBuchungFuerTour(selectedTour.id)
                    ? `Bereits ${formatTonnen(getBuchungFuerTour(selectedTour.id)!.tonnen)} gebucht - Menge ändern?`
                    : selectedTour.lkwTyp === 'mit_haenger'
                    ? 'Klicke auf Motorwagen oder Hänger zum Beladen'
                    : 'Wie viel Tonnen auf diese Tour?'
                  }
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedTour(null);
                  setAusgewaehlterBereich(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* LKW-Visualisierung für Touren mit Hänger */}
            {selectedTour.lkwTyp === 'mit_haenger' ? (
              <LKWVisualisierung
                tour={selectedTour}
                ausgewaehlterBereich={ausgewaehlterBereich}
                onBereichWaehlen={setAusgewaehlterBereich}
                tonnenEingabe={tonnen}
                onTonnenChange={setTonnen}
                maxTonnen={maxTonnen}
                onBuchen={handleConfirm}
                saving={saving}
              />
            ) : (
              <>
                {/* Standard Tonnen-Eingabe für Motorwagen ohne Hänger */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTonnen(Math.max(0.5, tonnen - 0.5))}
                    className="p-2 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-100 border border-gray-300 dark:border-slate-600"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="number"
                      step="0.5"
                      min="0.5"
                      max={maxTonnen}
                      value={tonnen}
                      onChange={(e) => setTonnen(Math.min(parseFloat(e.target.value) || 0, maxTonnen))}
                      onKeyDown={handleKeyDown}
                      className="w-full px-4 py-3 text-center text-2xl font-bold border-2 border-blue-400 dark:border-blue-600 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">t</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTonnen(Math.min(maxTonnen, tonnen + 0.5))}
                    className="p-2 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-100 border border-gray-300 dark:border-slate-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleConfirm}
                    disabled={tonnen <= 0 || saving}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 flex items-center gap-2 shadow-lg"
                  >
                    {saving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Buchen
                      </>
                    )}
                  </button>
                </div>

                {/* Quick-Buttons */}
                <div className="flex gap-2 mt-3">
                  {maxTonnen > 0 && [
                    { label: '5t', value: 5 },
                    { label: '10t', value: 10 },
                    { label: '14t', value: 14 },
                    { label: `Alles (${formatTonnen(maxTonnen)})`, value: maxTonnen },
                  ].filter(opt => opt.value <= maxTonnen).map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setTonnen(opt.value)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                        tonnen === opt.value
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 border border-gray-200 dark:border-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Anweisung */}
        {!selectedTour && (
          <div className="px-5 py-3 bg-gray-50 dark:bg-slate-800 border-b">
            <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <MoveRight className="w-4 h-4" />
              {auftrag.offeneTonnen > 0
                ? `Wähle eine Tour für die restlichen ${formatTonnen(auftrag.offeneTonnen)}`
                : auftrag.buchungen.length > 0
                ? 'Alle Tonnen gebucht! Klicke auf eine Tour um die Menge zu ändern.'
                : 'Wähle eine Tour zum Buchen'
              }
            </p>
          </div>
        )}

        {/* Tour-Liste */}
        <div className="max-h-[40vh] overflow-y-auto p-3">
          {saving && !selectedTour ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-2">
              {touren.map(tour => {
                const beladung = tourenService.berechneBeladung(tour);
                const bestehendeBuchung = getBuchungFuerTour(tour.id);
                const istAusgewaehlt = selectedTour?.id === tour.id;
                const potentielleTonnen = selectedTour?.id === tour.id ? tonnen : getDefaultTonnen(tour);
                const zusaetzlicheTonnen = bestehendeBuchung ? potentielleTonnen - bestehendeBuchung.tonnen : potentielleTonnen;
                const nachBuchung = beladung.geladenTonnen + zusaetzlicheTonnen;
                const wirdUeberladen = nachBuchung > tour.kapazitaet.gesamtTonnen;

                return (
                  <button
                    key={tour.id}
                    onClick={() => handleTourSelect(tour)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      istAusgewaehlt
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-300'
                        : bestehendeBuchung
                        ? 'border-green-300 bg-green-50 dark:bg-green-900/20 hover:border-green-400'
                        : 'border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        tour.lkwTyp === 'mit_haenger'
                          ? 'bg-purple-100 dark:bg-purple-900/40'
                          : 'bg-blue-100 dark:bg-blue-900/40'
                      }`}>
                        <Truck className={`w-6 h-6 ${
                          tour.lkwTyp === 'mit_haenger' ? 'text-purple-600' : 'text-blue-600'
                        }`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-900 dark:text-white text-lg">
                            {tour.name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            tour.lkwTyp === 'mit_haenger'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {tour.kapazitaet.gesamtTonnen}t
                          </span>
                          {bestehendeBuchung && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                              ✓ {formatTonnen(bestehendeBuchung.tonnen)} gebucht
                            </span>
                          )}
                        </div>

                        {/* Kapazitäts-Balken */}
                        <div className="h-3 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              wirdUeberladen ? 'bg-red-500' : beladung.auslastungProzent > 80 ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(beladung.auslastungProzent, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {formatTonnen(beladung.geladenTonnen)} / {formatTonnen(tour.kapazitaet.gesamtTonnen)}
                            <span className="ml-2 text-gray-400">
                              (frei: {formatTonnen(tour.kapazitaet.gesamtTonnen - beladung.geladenTonnen)})
                            </span>
                          </span>
                          {wirdUeberladen && (
                            <span className="text-sm text-red-600 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" />
                              Überladen!
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status-Icon */}
                      {istAusgewaehlt ? (
                        <CheckCircle2 className="w-6 h-6 text-blue-500 flex-shrink-0" />
                      ) : bestehendeBuchung ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                      ) : (
                        <ArrowRight className="w-6 h-6 text-gray-300 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}

              {touren.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Keine Touren verfügbar</p>
                  <p className="text-sm">Erstelle zuerst eine Tour</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {auftrag.istVollstaendigGebucht ? (
              <span className="text-green-600 font-medium">✓ Vollständig gebucht</span>
            ) : (
              <span className="text-orange-600">Noch {formatTonnen(auftrag.offeneTonnen)} offen</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg"
          >
            Schließen
          </button>
        </div>
      </div>
    </>
  );
};

// === BUCHUNGS-BADGE ===
interface BuchungsBadgeProps {
  auftrag: AuftragMitBuchungen;
  touren: Tour[];
  onBuchen: () => void;
  onSchnellUmbuchen: (vonTourId: string, zuTourId: string, tonnen: number) => Promise<void>;
  onTeilbuchen: () => void;
  onEntfernen: (tourId: string) => void;
}

const BuchungsBadge = ({
  auftrag,
  touren,
  onSchnellUmbuchen,
  onEntfernen,
}: BuchungsBadgeProps) => {
  const [showPanel, setShowPanel] = useState(false);

  // Neue Buchung (oder Update bestehender)
  const handleBuchen = async (tourId: string, tonnen: number) => {
    // Bestehende Buchung auf dieser Tour?
    const bestehendeBuchung = auftrag.buchungen.find(b => b.tourId === tourId);

    if (bestehendeBuchung) {
      // Update: Erst entfernen, dann neu buchen mit neuer Menge
      // Das wird als "Umbuchen von gleicher Tour zu gleicher Tour" mit neuer Menge behandelt
      await onSchnellUmbuchen(tourId, tourId, tonnen);
    } else {
      // Neue Buchung auf dieser Tour
      await onSchnellUmbuchen('', tourId, tonnen);
    }
  };

  if (auftrag.buchungen.length === 0) {
    return (
      <>
        <button
          onClick={() => setShowPanel(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold hover:from-green-600 hover:to-emerald-600 transition-all hover:shadow-lg hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Tour wählen
        </button>

        {showPanel && (
          <TourAuswahlPanel
            auftrag={auftrag}
            touren={touren}
            onBuchen={handleBuchen}
            onEntfernen={onEntfernen}
            onClose={() => setShowPanel(false)}
          />
        )}
      </>
    );
  }

  // Mehrere Buchungen oder eine Buchung
  return (
    <>
      <button
        onClick={() => setShowPanel(true)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:scale-105 ${
          auftrag.istVollstaendigGebucht
            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
            : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
        }`}
      >
        <Truck className="w-4 h-4" />
        {auftrag.buchungen.length === 1 ? (
          <>
            <span>{auftrag.buchungen[0].tourName}</span>
            <span className="opacity-80">({formatTonnen(auftrag.buchungen[0].tonnen)})</span>
          </>
        ) : (
          <>
            <span>{auftrag.buchungen.length} Touren</span>
            <span className="opacity-80">({formatTonnen(auftrag.gebuchteTonnen)})</span>
          </>
        )}
        {!auftrag.istVollstaendigGebucht && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded text-xs font-bold">
            +{formatTonnen(auftrag.offeneTonnen)}
          </span>
        )}
      </button>

      {showPanel && (
        <TourAuswahlPanel
          auftrag={auftrag}
          touren={touren}
          onBuchen={handleBuchen}
          onEntfernen={onEntfernen}
          onClose={() => setShowPanel(false)}
        />
      )}
    </>
  );
};

// Dummy für Kompatibilität
interface SchnellBuchungDialogProps {
  open: boolean;
  auftrag: AuftragMitBuchungen | null;
  touren: Tour[];
  modus: 'neu' | 'umbuchen' | 'teil';
  vonTourId?: string;
  onClose: () => void;
  onBuchen: (tourId: string, tonnen: number, vonTourId?: string) => Promise<void>;
}

const SchnellBuchungDialog = ({ open, onClose }: SchnellBuchungDialogProps) => {
  if (!open) return null;
  onClose();
  return null;
};

// === EXPORTS ===

export { SchnellBuchungDialog, BuchungsBadge };
export type { AuftragMitBuchungen, Buchung };

export const erstelleAuftragMitBuchungen = (
  projekt: Projekt,
  touren: Tour[]
): AuftragMitBuchungen => {
  const projektId = (projekt as any).$id || projekt.id;

  // Material-Aufschlüsselung aus Positionen berechnen (NICHT aus liefergewicht!)
  const material = parseMaterialAufschluesselung(projekt);

  // Gesamtmenge aus Material-Aufschlüsselung (korrekt berechnet)
  const gesamtMenge = material.gesamtTonnen;

  const buchungen: Buchung[] = [];
  for (const tour of touren) {
    for (const stop of tour.stops) {
      if (stop.projektId === projektId) {
        buchungen.push({
          tourId: tour.id,
          tourName: tour.name,
          tonnen: stop.tonnen,
          lkwTyp: tour.lkwTyp,
        });
      }
    }
  }

  const gebuchteTonnen = buchungen.reduce((sum, b) => sum + b.tonnen, 0);
  const offeneTonnen = Math.max(0, gesamtMenge - gebuchteTonnen);

  return {
    projekt,
    projektId,
    gesamtMenge,
    material,
    buchungen,
    gebuchteTonnen,
    offeneTonnen,
    istVollstaendigGebucht: offeneTonnen <= 0,
  };
};
