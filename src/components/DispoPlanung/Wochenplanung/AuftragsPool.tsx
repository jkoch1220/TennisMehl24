import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  ChevronDown,
  ChevronRight,
  Search,
  GripVertical,
  MessageSquare,
  Truck,
  CalendarOff,
} from 'lucide-react';
import type { AuftragImPool, PlatzbauerGruppe } from './wochenplanungUtils';
import { formatTonnen } from './wochenplanungUtils';

interface AuftragsPoolProps {
  gruppen: PlatzbauerGruppe[];
  /** Aufträge ohne Wochenzuordnung — in jeder Woche sichtbar, bis sie terminiert sind. */
  gruppenOhneWoche: PlatzbauerGruppe[];
  suche: string;
  onSucheChange: (wert: string) => void;
  nurUnverplant: boolean;
  onNurUnverplantChange: (wert: boolean) => void;
  anzahlGesamt: number;
  onAuftragOeffnen: (auftrag: AuftragImPool) => void;
}

const BELIEFERUNG_KUERZEL: Record<string, string> = {
  nur_motorwagen: 'nur Motor',
  mit_haenger: 'Zug',
  abholung_ab_werk: 'Abholung',
  palette_mit_ladekran: 'Palette',
  bigbag: 'BigBag',
};

/** Kennzeichnet, wie verbindlich der Liefertermin ist. */
const FRIST_KUERZEL: Record<string, string> = {
  fix: 'fix',
  spaetestens: 'spätestens',
  kw: 'KW',
  spaetestens_kw: 'spät. KW',
};

const PoolKarte = ({
  auftrag,
  onOeffnen,
}: {
  auftrag: AuftragImPool;
  onOeffnen: () => void;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `auftrag:${auftrag.projektId}`,
    data: { type: 'auftrag', auftrag },
  });

  const { projekt } = auftrag;
  const teilverplant = auftrag.gebuchteTonnen > 0 && !auftrag.istVollstaendigGebucht;
  const notizen = projekt.dispoNotizen?.length ?? 0;

  return (
    // Die ganze Karte ist der Ziehgriff — nicht nur ein kleiner Punkt am Rand.
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onDoubleClick={onOeffnen}
      className={`group flex items-start gap-1 px-1.5 py-1.5 rounded-lg border bg-white dark:bg-slate-800 cursor-grab active:cursor-grabbing touch-none transition-all hover:border-blue-400 hover:shadow-sm ${
        isDragging ? 'opacity-40 shadow-lg' : ''
      } ${
        teilverplant
          ? 'border-amber-300 dark:border-amber-700'
          : 'border-gray-200 dark:border-slate-600'
      }`}
      title="Auf eine Tour ziehen · Doppelklick öffnet den Auftrag"
    >
      <GripVertical className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-300 dark:text-slate-600 group-hover:text-gray-500" />

      <div className="flex-1 min-w-0">
        <span className="block truncate text-xs font-medium text-gray-900 dark:text-gray-100">
          {projekt.kundenname}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {projekt.lieferadresse?.plz || projekt.kundenPlzOrt?.split(' ')[0] || '—'}
          </span>
          <span
            className={`text-[11px] font-semibold ${
              teilverplant
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            {formatTonnen(auftrag.offeneTonnen)}
            {teilverplant && (
              <span className="font-normal opacity-70">
                {' '}
                von {formatTonnen(auftrag.gesamtMenge)}
              </span>
            )}
          </span>
          {projekt.belieferungsart && (
            <span className="flex items-center gap-0.5 text-[10px] px-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
              <Truck className="w-2.5 h-2.5" />
              {BELIEFERUNG_KUERZEL[projekt.belieferungsart] ?? projekt.belieferungsart}
            </span>
          )}
          {projekt.lieferdatumTyp && (
            <span
              className={`text-[10px] px-1 rounded ${
                projekt.lieferdatumTyp === 'fix'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {FRIST_KUERZEL[projekt.lieferdatumTyp] ?? projekt.lieferdatumTyp}
            </span>
          )}
          {notizen > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400"
              title={`${notizen} Dispo-Notiz${notizen === 1 ? '' : 'en'}`}
            >
              <MessageSquare className="w-2.5 h-2.5" />
              {notizen}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const AuftragsPool = ({
  gruppen,
  gruppenOhneWoche,
  suche,
  onSucheChange,
  nurUnverplant,
  onNurUnverplantChange,
  anzahlGesamt,
  onAuftragOeffnen,
}: AuftragsPoolProps) => {
  const [zugeklappt, setZugeklappt] = useState<Set<string>>(new Set());

  const umschalten = (id: string) => {
    setZugeklappt((prev) => {
      const neu = new Set(prev);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  };

  const zaehle = (liste: PlatzbauerGruppe[]) =>
    liste.reduce((s, g) => s + g.auftraege.length, 0);
  const summiere = (liste: PlatzbauerGruppe[]) => liste.reduce((s, g) => s + g.summeOffen, 0);

  const angezeigt = zaehle(gruppen) + zaehle(gruppenOhneWoche);
  const summeOffen = summiere(gruppen) + summiere(gruppenOhneWoche);

  const gruppeRendern = (gruppe: PlatzbauerGruppe, praefix = '') => {
    const offen = !zugeklappt.has(praefix + gruppe.id);
    return (
      <div key={praefix + gruppe.id}>
        <button
          onClick={() => umschalten(praefix + gruppe.id)}
          className="w-full flex items-center gap-1 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700/50"
        >
          {offen ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          <span className="flex-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
            {gruppe.name}
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
            {gruppe.auftraege.length} · {formatTonnen(gruppe.summeOffen)}
          </span>
        </button>

        {offen && (
          <div className="mt-1 space-y-1 pl-1">
            {gruppe.auftraege.map((auftrag) => (
              <PoolKarte
                key={auftrag.projektId}
                auftrag={auftrag}
                onOeffnen={() => onAuftragOeffnen(auftrag)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Auftragspool</h3>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {angezeigt}
            {angezeigt !== anzahlGesamt && ` von ${anzahlGesamt}`} · {formatTonnen(summeOffen)}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={suche}
            onChange={(e) => onSucheChange(e.target.value)}
            placeholder="Kunde oder PLZ…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={nurUnverplant}
            onChange={(e) => onNurUnverplantChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded"
          />
          <span className="text-[11px] text-gray-600 dark:text-gray-300">
            Nur offene Restmengen
          </span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {gruppen.length === 0 && gruppenOhneWoche.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            Keine offenen Aufträge.
          </p>
        ) : (
          <>
            {gruppen.length > 0 ? (
              gruppen.map((gruppe) => gruppeRendern(gruppe))
            ) : (
              <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-500">
                Kein Auftrag ist auf diese Woche datiert.
              </p>
            )}

            {gruppenOhneWoche.length > 0 && (
              <div className="pt-2 mt-2 border-t-2 border-dashed border-amber-300 dark:border-amber-700">
                <div className="flex items-center gap-1 px-1 mb-1">
                  <CalendarOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Ohne Kalenderwoche
                  </span>
                  <span className="text-[11px] text-amber-700/70 dark:text-amber-400/70">
                    {zaehle(gruppenOhneWoche)} · {formatTonnen(summiere(gruppenOhneWoche))}
                  </span>
                </div>
                <p className="px-1 mb-2 text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                  Noch keinem Liefertermin zugeordnet — in jeder Woche planbar.
                </p>
                <div className="space-y-2">
                  {gruppenOhneWoche.map((gruppe) => gruppeRendern(gruppe, 'ohne:'))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AuftragsPool;
