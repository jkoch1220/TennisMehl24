import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Copy,
  BarChart3,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { schichtplanungService } from '../../services/schichtplanungService';
import {
  Mitarbeiter,
  SchichtZuweisung,
  SchichtTyp,
  WochenStatistik,
  Konflikt,
  getMontag,
  formatDatum,
  getWochentage,
  getSchichtConfig,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
  SchichtEinstellungen,
  WOCHENTAGE,
} from '../../types/schichtplanung';
import WochenKalender from './WochenKalender';
import MitarbeiterListe from './MitarbeiterListe';
import MitarbeiterDialog from './MitarbeiterDialog';
import StatistikPanel from './StatistikPanel';
import SchichtEinstellungenDialog from './SchichtEinstellungenDialog';
import MitarbeiterChip from './MitarbeiterChip';

export default function Schichtplanung() {
  // State
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [zuweisungen, setZuweisungen] = useState<SchichtZuweisung[]>([]);
  const [loading, setLoading] = useState(true);
  const [aktuelleWoche, setAktuelleWoche] = useState<Date>(getMontag(new Date()));
  const [statistik, setStatistik] = useState<WochenStatistik | null>(null);
  const [konflikte, setKonflikte] = useState<Konflikt[]>([]);
  const [einstellungen, setEinstellungen] = useState<SchichtEinstellungen>(DEFAULT_SCHICHT_EINSTELLUNGEN);

  // Dialogs
  const [showMitarbeiterDialog, setShowMitarbeiterDialog] = useState(false);
  const [showStatistik, setShowStatistik] = useState(false);
  const [showEinstellungen, setShowEinstellungen] = useState(false);
  const [editMitarbeiter, setEditMitarbeiter] = useState<Mitarbeiter | null>(null);

  // Drag & Drop State
  const [activeDragItem, setActiveDragItem] = useState<{
    type: 'mitarbeiter' | 'zuweisung';
    mitarbeiter?: Mitarbeiter;
    zuweisung?: SchichtZuweisung;
  } | null>(null);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Daten laden
  const ladeDaten = useCallback(async () => {
    setLoading(true);
    try {
      const [ma, zw] = await Promise.all([
        schichtplanungService.ladeAktiveMitarbeiter(),
        schichtplanungService.ladeZuweisungenFuerWoche(formatDatum(aktuelleWoche)),
      ]);
      setMitarbeiter(ma);
      setZuweisungen(zw);

      // Statistiken berechnen
      const stats = schichtplanungService.berechneWochenStatistiken(zw, ma, einstellungen);
      setStatistik(stats);

      // Alle aktuellen Konflikte sammeln (unterbesetzte Schichten)
      const allKonflikte: Konflikt[] = stats.unterbesetzteSchichten.map((ub) => ({
        typ: 'unterbesetzung' as const,
        schwere: 'warnung' as const,
        nachricht: `${WOCHENTAGE[new Date(ub.datum).getDay() === 0 ? 6 : new Date(ub.datum).getDay() - 1]} ${getSchichtConfig(einstellungen)[ub.schichtTyp].name}: ${ub.aktuell}/${ub.minimum} Mitarbeiter`,
        datum: ub.datum,
        schichtTyp: ub.schichtTyp,
      }));
      setKonflikte(allKonflikte);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [aktuelleWoche, einstellungen]);

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten]);

  // Woche navigieren
  const wocheZurueck = () => {
    const neueWoche = new Date(aktuelleWoche);
    neueWoche.setDate(neueWoche.getDate() - 7);
    setAktuelleWoche(neueWoche);
  };

  const wocheVor = () => {
    const neueWoche = new Date(aktuelleWoche);
    neueWoche.setDate(neueWoche.getDate() + 7);
    setAktuelleWoche(neueWoche);
  };

  const wocheHeute = () => {
    setAktuelleWoche(getMontag(new Date()));
  };

  // Woche kopieren
  const wocheKopieren = async () => {
    const vonDatum = formatDatum(aktuelleWoche);
    const nachWoche = new Date(aktuelleWoche);
    nachWoche.setDate(nachWoche.getDate() + 7);
    const nachDatum = formatDatum(nachWoche);

    try {
      await schichtplanungService.kopiereWoche(vonDatum, nachDatum);
      // Zur nächsten Woche navigieren
      setAktuelleWoche(nachWoche);
    } catch (error) {
      console.error('Fehler beim Kopieren der Woche:', error);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const dragData = active.data.current;

    if (dragData?.type === 'mitarbeiter') {
      setActiveDragItem({
        type: 'mitarbeiter',
        mitarbeiter: dragData.mitarbeiter,
      });
    } else if (dragData?.type === 'zuweisung') {
      setActiveDragItem({
        type: 'zuweisung',
        zuweisung: dragData.zuweisung,
        mitarbeiter: mitarbeiter.find((m) => m.id === dragData.zuweisung.mitarbeiterId),
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const dropData = over.data.current;
    if (!dropData?.datum || !dropData?.schichtTyp) return;

    const { datum, schichtTyp } = dropData as { datum: string; schichtTyp: SchichtTyp };

    const dragData = active.data.current;
    if (!dragData) return;

    try {
      if (dragData.type === 'mitarbeiter') {
        // Neuen Mitarbeiter zuweisen
        const ma = dragData.mitarbeiter as Mitarbeiter;

        // Konfliktprüfung
        const konflikte = schichtplanungService.pruefeKonflikte(
          {
            mitarbeiterId: ma.id,
            schichtTyp,
            datum,
            status: 'geplant',
          },
          zuweisungen,
          mitarbeiter,
          einstellungen
        );

        // Bei Fehlern abbrechen
        if (konflikte.some((k) => k.schwere === 'fehler')) {
          alert(konflikte.find((k) => k.schwere === 'fehler')?.nachricht);
          return;
        }

        // Warnung anzeigen aber fortfahren
        if (konflikte.some((k) => k.schwere === 'warnung')) {
          const warnung = konflikte.find((k) => k.schwere === 'warnung');
          if (!confirm(`${warnung?.nachricht}\n\nTrotzdem fortfahren?`)) {
            return;
          }
        }

        await schichtplanungService.erstelleZuweisung({
          mitarbeiterId: ma.id,
          schichtTyp,
          datum,
          status: 'geplant',
        });
      } else if (dragData.type === 'zuweisung') {
        // Bestehende Zuweisung verschieben
        const zuweisung = dragData.zuweisung as SchichtZuweisung;
        await schichtplanungService.verschiebeZuweisung(zuweisung.id, datum, schichtTyp);
      }

      // Daten neu laden
      await ladeDaten();
    } catch (error) {
      console.error('Fehler bei Drag & Drop:', error);
    }
  };

  // Mitarbeiter Dialog Handler
  const handleMitarbeiterSave = async (ma: Mitarbeiter) => {
    if (editMitarbeiter) {
      await schichtplanungService.aktualisiereMitarbeiter(ma.id, ma);
    } else {
      await schichtplanungService.erstelleMitarbeiter(ma);
    }
    setShowMitarbeiterDialog(false);
    setEditMitarbeiter(null);
    await ladeDaten();
  };

  const handleMitarbeiterEdit = (ma: Mitarbeiter) => {
    setEditMitarbeiter(ma);
    setShowMitarbeiterDialog(true);
  };

  const handleMitarbeiterDelete = async (ma: Mitarbeiter) => {
    if (confirm(`${ma.vorname} ${ma.nachname} wirklich löschen? Alle Zuweisungen werden ebenfalls gelöscht.`)) {
      await schichtplanungService.loescheMitarbeiter(ma.id);
      await ladeDaten();
    }
  };

  // Zuweisung löschen
  const handleZuweisungDelete = async (zuweisungId: string) => {
    await schichtplanungService.loescheZuweisung(zuweisungId);
    await ladeDaten();
  };

  // Zuweisung Status ändern
  const handleZuweisungStatusChange = async (zuweisungId: string, status: SchichtZuweisung['status']) => {
    await schichtplanungService.aktualisiereZuweisung(zuweisungId, { status });
    await ladeDaten();
  };

  // Einstellungen speichern
  const handleEinstellungenSave = (neueEinstellungen: SchichtEinstellungen) => {
    setEinstellungen(neueEinstellungen);
    setShowEinstellungen(false);
    // Statistiken neu berechnen
    const stats = schichtplanungService.berechneWochenStatistiken(zuweisungen, mitarbeiter, neueEinstellungen);
    setStatistik(stats);
  };

  // Wochen-Info formatieren
  const wochenInfo = () => {
    const wochentage = getWochentage(aktuelleWoche);
    const start = wochentage[0];
    const end = wochentage[6];
    const kw = getKalenderwoche(aktuelleWoche);
    return `KW ${kw}: ${start.getDate()}.${start.getMonth() + 1}. - ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
  };

  const getKalenderwoche = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  const istAktuelleWoche = () => {
    const heute = getMontag(new Date());
    return formatDatum(heute) === formatDatum(aktuelleWoche);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Schichtplanung...</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface">
        {/* Header */}
        <div className="bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm border-b border-gray-200 dark:border-dark-border sticky top-0 z-30">
          <div className="max-w-[1800px] mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Titel */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
                  <CalendarClock className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Schichtplanung</h1>
                  <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                    {mitarbeiter.length} Mitarbeiter, {zuweisungen.length} Zuweisungen diese Woche
                  </p>
                </div>
              </div>

              {/* Wochen-Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={wocheZurueck}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  title="Vorherige Woche"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-dark-textMuted" />
                </button>
                <button
                  onClick={wocheHeute}
                  disabled={istAktuelleWoche()}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    istAktuelleWoche()
                      ? 'bg-gray-100 text-gray-400 dark:bg-dark-hover dark:text-dark-textMuted cursor-not-allowed'
                      : 'bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400'
                  }`}
                >
                  Heute
                </button>
                <span className="px-4 py-1.5 bg-white dark:bg-dark-bg rounded-lg border border-gray-200 dark:border-dark-border text-sm font-medium text-gray-700 dark:text-dark-text min-w-[200px] text-center">
                  {wochenInfo()}
                </span>
                <button
                  onClick={wocheVor}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  title="Nächste Woche"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600 dark:text-dark-textMuted" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={wocheKopieren}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-dark-hover dark:hover:bg-dark-border text-gray-700 dark:text-dark-text text-sm font-medium transition-colors"
                  title="Woche in nächste Woche kopieren"
                >
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Woche kopieren</span>
                </button>
                <button
                  onClick={() => setShowStatistik(!showStatistik)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    showStatistik
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-dark-hover dark:hover:bg-dark-border text-gray-700 dark:text-dark-text'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Statistik</span>
                </button>
                <button
                  onClick={() => setShowEinstellungen(true)}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-dark-hover dark:hover:bg-dark-border transition-colors"
                  title="Einstellungen"
                >
                  <Settings className="w-5 h-5 text-gray-600 dark:text-dark-textMuted" />
                </button>
              </div>
            </div>

            {/* Konflikt-Warnungen */}
            {konflikte.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {konflikte.slice(0, 5).map((k, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {k.nachricht}
                  </div>
                ))}
                {konflikte.length > 5 && (
                  <span className="px-2 py-1 text-xs text-gray-500 dark:text-dark-textMuted">
                    +{konflikte.length - 5} weitere
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1800px] mx-auto p-4">
          <div className="flex gap-4">
            {/* Mitarbeiter Sidebar */}
            <div className="w-64 flex-shrink-0">
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 sticky top-[120px]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-violet-600" />
                    <h2 className="font-semibold text-gray-900 dark:text-white">Mitarbeiter</h2>
                  </div>
                  <button
                    onClick={() => {
                      setEditMitarbeiter(null);
                      setShowMitarbeiterDialog(true);
                    }}
                    className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 text-violet-600 dark:text-violet-400 transition-colors"
                    title="Mitarbeiter hinzufügen"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <MitarbeiterListe
                  mitarbeiter={mitarbeiter}
                  onEdit={handleMitarbeiterEdit}
                  onDelete={handleMitarbeiterDelete}
                />
              </div>
            </div>

            {/* Kalender */}
            <div className="flex-1 min-w-0">
              <WochenKalender
                montag={aktuelleWoche}
                zuweisungen={zuweisungen}
                mitarbeiter={mitarbeiter}
                einstellungen={einstellungen}
                onZuweisungDelete={handleZuweisungDelete}
                onZuweisungStatusChange={handleZuweisungStatusChange}
              />
            </div>

            {/* Statistik Sidebar */}
            {showStatistik && statistik && (
              <div className="w-80 flex-shrink-0">
                <StatistikPanel
                  statistik={statistik}
                  mitarbeiter={mitarbeiter}
                  einstellungen={einstellungen}
                  onClose={() => setShowStatistik(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragItem?.mitarbeiter && (
            <MitarbeiterChip
              mitarbeiter={activeDragItem.mitarbeiter}
              isDragging
            />
          )}
        </DragOverlay>

        {/* Dialogs */}
        {showMitarbeiterDialog && (
          <MitarbeiterDialog
            mitarbeiter={editMitarbeiter}
            onSave={handleMitarbeiterSave}
            onClose={() => {
              setShowMitarbeiterDialog(false);
              setEditMitarbeiter(null);
            }}
          />
        )}

        {showEinstellungen && (
          <SchichtEinstellungenDialog
            einstellungen={einstellungen}
            onSave={handleEinstellungenSave}
            onClose={() => setShowEinstellungen(false)}
          />
        )}
      </div>
    </DndContext>
  );
}
