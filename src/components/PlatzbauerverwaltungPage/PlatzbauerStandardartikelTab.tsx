/**
 * Standard-Angebotsartikel für Platzbauer pflegen (09/2026).
 *
 * Jeder Platzbauer soll dieselben Zusatzkonditionen bekommen — Fracht,
 * Verpackung, zusätzliche Schüttstellen, Hydrocourt. Diese Liste ist die
 * einzige Quelle dafür; das Platzbauer-Angebot zieht sie beim Öffnen und
 * druckt sie als Preisliste ohne Menge und ohne Summe.
 *
 * Gespeichert wird sie als JSON im Stammdaten-Feld `platzbauerStandardartikel`.
 * Preis leer = Preis aus dem Artikelstamm; ein Wert hier gewinnt und hält die
 * Platzbauer-Konditionen unabhängig von Preisänderungen im Endkundenstamm.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ListPlus,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Artikel, WARENGRUPPEN } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import { getStammdatenOderDefault, speicherePlatzbauerStandardartikel } from '../../services/stammdatenService';
import {
  PLATZBAUER_STANDARDARTIKEL_DEFAULT,
  PlatzbauerStandardartikel,
  leseStandardartikel,
} from '../../constants/platzbauerStandardartikel';
import { OptionalNumberInput } from '../NumberInput';

/**
 * Vorschlag für die Gruppenüberschrift eines Artikels.
 *
 * Die Warengruppe aus dem Artikelstamm ist die beste verfügbare Auskunft
 * darüber, wo eine Leistung im Angebot hingehört. Ohne sie landet die Zeile
 * unter „Weitere Konditionen" — sichtbar, aber ohne Anspruch auf Ordnung.
 */
const gruppeFuer = (artikel?: Artikel): string => {
  switch (artikel?.warengruppe) {
    case 'fracht':
      return 'Fracht & Verpackung';
    case 'zubehoer':
      return 'Zubehör';
    case 'dienstleistung':
      return 'Abladung & Leistungen';
    case 'tennismehl':
      return 'Sackware & BigBag';
    default:
      return 'Weitere Konditionen';
  }
};

const PlatzbauerStandardartikelTab = () => {
  const [liste, setListe] = useState<PlatzbauerStandardartikel[]>([]);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [stammdaten, alleArtikel] = await Promise.all([
          getStammdatenOderDefault(),
          // Nur aktive Artikel: Archivierte bleiben für Altbelege lesbar,
          // gehören aber in keine Auswahlliste.
          getAlleArtikel('bezeichnung', true),
        ]);
        setListe(leseStandardartikel(stammdaten.platzbauerStandardartikel));
        setArtikel(alleArtikel);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : 'Daten konnten nicht geladen werden.');
      } finally {
        setLaden(false);
      }
    })();
  }, []);

  const artikelNach = useMemo(() => {
    const map = new Map<string, Artikel>();
    for (const a of artikel) if (a.artikelnummer) map.set(a.artikelnummer, a);
    return map;
  }, [artikel]);

  const aendern = useCallback((index: number, updates: Partial<PlatzbauerStandardartikel>) => {
    setGespeichert(false);
    setListe((prev) => prev.map((e, i) => (i === index ? { ...e, ...updates } : e)));
  }, []);

  const verschieben = useCallback((index: number, richtung: -1 | 1) => {
    setGespeichert(false);
    setListe((prev) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= prev.length) return prev;
      const kopie = [...prev];
      [kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]];
      return kopie;
    });
  }, []);

  const hinzufuegen = useCallback(() => {
    setGespeichert(false);
    // Bewusst OHNE geerbte Gruppe: Vorher stand in der neuen Zeile die Gruppe
    // der letzten („HYDROcourt©"), was wie eine Artikelbezeichnung aussah. Die
    // Gruppe schlägt jetzt der gewählte Artikel selbst vor.
    setListe((prev) => [
      ...prev,
      { artikelnummer: '', bezeichnung: '', gruppe: '', preis: null, aktiv: true },
    ]);
  }, []);

  const speichereListe = async () => {
    setSpeichern(true);
    setFehler(null);
    try {
      await speicherePlatzbauerStandardartikel(JSON.stringify(liste));
      setGespeichert(true);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichern(false);
    }
  };

  // Artikelnummern, die es im Stamm nicht gibt: Sie würden im Angebot
  // kommentarlos fehlen — deshalb hier sichtbar und nicht nur in der Konsole.
  const unbekannte = liste.filter(
    (e) => e.artikelnummer && artikel.length > 0 && !artikelNach.has(e.artikelnummer)
  );

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Lade Standardartikel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ListPlus className="w-5 h-5 text-amber-500" />
              Standard-Angebotsartikel
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
              Diese Zusatzleistungen bietet jedes Platzbauer-Angebot an — als Preisliste je
              Einheit, ohne Menge und ohne Summe. Abgerechnet wird pro Lieferung.
              Wähle einen Artikel aus dem Stamm; die Gruppe schlägt er selbst vor. Ein leeres
              Preisfeld heißt „Preis aus dem Artikelstamm" — trag nur etwas ein, wenn Platzbauer
              einen abweichenden Preis bekommen.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setListe(PLATZBAUER_STANDARDARTIKEL_DEFAULT.map((e) => ({ ...e })));
                setGespeichert(false);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              title="Auf die Vorlage zurücksetzen (noch nicht gespeichert)"
            >
              <RotateCcw className="w-4 h-4" />
              Vorlage
            </button>
            <button
              type="button"
              onClick={speichereListe}
              disabled={speichern}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg"
            >
              {speichern ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : gespeichert ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {gespeichert ? 'Gespeichert' : 'Speichern'}
            </button>
          </div>
        </div>

        {fehler && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{fehler}</span>
          </div>
        )}

        {unbekannte.length > 0 && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Nicht im Artikelstamm gefunden:{' '}
              <strong>{unbekannte.map((e) => e.artikelnummer).join(', ')}</strong>. Diese Zeilen
              erscheinen in keinem Angebot.
            </span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_1fr_1fr_120px_1fr_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
          <span className="w-16">Aktiv</span>
          <span>Artikel</span>
          <span>Gruppe</span>
          <span>Preis netto</span>
          <span>Hinweis im Angebot</span>
          <span className="w-24 text-right">Reihenfolge</span>
        </div>

        {liste.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            Keine Standardartikel gepflegt.
          </p>
        ) : (
          liste.map((eintrag, index) => {
            const stamm = artikelNach.get(eintrag.artikelnummer);
            return (
              <div
                key={`${eintrag.artikelnummer}-${index}`}
                className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_120px_1fr_auto] gap-3 px-4 py-3 items-center border-b border-gray-100 dark:border-slate-800 last:border-0"
              >
                <label className="flex items-center gap-2 md:w-16">
                  <input
                    type="checkbox"
                    checked={eintrag.aktiv}
                    onChange={(e) => aendern(index, { aktiv: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="md:hidden text-sm text-gray-600 dark:text-gray-300">Aktiv</span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="md:hidden text-xs text-gray-500 dark:text-gray-400">
                    Artikel aus dem Stamm
                  </span>
                  <select
                  value={eintrag.artikelnummer}
                  onChange={(e) => {
                    const a = artikelNach.get(e.target.value);
                    aendern(index, {
                      artikelnummer: e.target.value,
                      bezeichnung: a?.bezeichnung || eintrag.bezeichnung,
                      // Gruppe nur vorschlagen, solange keine gepflegt ist —
                      // eine von Hand gesetzte Überschrift bleibt stehen.
                      gruppe: eintrag.gruppe.trim() || gruppeFuer(a),
                    });
                  }}
                  className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value="">— Artikel wählen —</option>
                  {/* Unbekannte Nummer bleibt wählbar, damit sie nicht still verschwindet */}
                  {eintrag.artikelnummer && !stamm && (
                    <option value={eintrag.artikelnummer}>
                      {eintrag.artikelnummer} (nicht im Stamm)
                    </option>
                  )}
                  {/* Nach Warengruppe gruppiert: Bei über hundert Artikeln
                      findet man eine Frachtpauschale sonst nur durch Scrollen. */}
                  {WARENGRUPPEN.map((gruppe) => {
                    const inGruppe = artikel.filter((a) => a.warengruppe === gruppe.wert);
                    if (inGruppe.length === 0) return null;
                    return (
                      <optgroup key={gruppe.wert} label={gruppe.label}>
                        {inGruppe.map((a) => (
                          <option key={a.artikelnummer} value={a.artikelnummer}>
                            {a.artikelnummer} – {a.bezeichnung}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {(() => {
                    const ohneGruppe = artikel.filter(
                      (a) => !WARENGRUPPEN.some((g) => g.wert === a.warengruppe)
                    );
                    if (ohneGruppe.length === 0) return null;
                    return (
                      <optgroup label="Ohne Warengruppe">
                        {ohneGruppe.map((a) => (
                          <option key={a.artikelnummer} value={a.artikelnummer}>
                            {a.artikelnummer} – {a.bezeichnung}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="md:hidden text-xs text-gray-500 dark:text-gray-400">
                    Gruppe (Überschrift im Angebot)
                  </span>
                  <input
                    type="text"
                    value={eintrag.gruppe}
                    onChange={(e) => aendern(index, { gruppe: e.target.value })}
                    placeholder="Gruppe, z. B. Fracht & Verpackung"
                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="md:hidden text-xs text-gray-500 dark:text-gray-400">
                    Preis netto (leer = aus dem Artikelstamm)
                  </span>
                  <OptionalNumberInput
                    value={eintrag.preis ?? undefined}
                    onChange={(v) => aendern(index, { preis: v ?? null })}
                    placeholder={
                      stamm?.einzelpreis !== undefined && stamm?.einzelpreis !== null
                        ? `${stamm.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
                        : 'Stamm'
                    }
                    dezimalstellen={2}
                    className="w-full px-2 py-1.5 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  />
                </label>

                <div>
                  <span className="md:hidden block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Hinweis unter der Zeile (optional)
                  </span>
                  <input
                    type="text"
                    value={eintrag.hinweis || ''}
                    onChange={(e) => aendern(index, { hinweis: e.target.value })}
                    placeholder="z. B. Je Anlieferung"
                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  />
                  {/* Eigene Mengenstaffel (Frachtpauschale): wird im Angebot als
                      eigene Zeilen gedruckt. Gepflegt wird sie im Code, weil sie
                      an der Frachtberechnung haengt — hier nur sichtbar machen,
                      damit niemand sie beim Bearbeiten uebersieht. */}
                  {eintrag.staffel && eintrag.staffel.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Mengenstaffel mit {eintrag.staffel.length} Stufen (
                      {eintrag.staffel[0].text} …) wird im Angebot ausgewiesen.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1 md:w-24">
                  <button
                    type="button"
                    onClick={() => verschieben(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-30"
                    title="Nach oben"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => verschieben(index, 1)}
                    disabled={index === liste.length - 1}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-30"
                    title="Nach unten"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGespeichert(false);
                      setListe((prev) => prev.filter((_, i) => i !== index));
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    title="Entfernen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={hinzufuegen}
            className="inline-flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50"
          >
            <Plus className="w-4 h-4" />
            Artikel hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlatzbauerStandardartikelTab;
