import React from 'react';
import { CalendarDays, CloudOff, Volume2, VolumeX, Wifi } from 'lucide-react';
import { MELDER } from './produktionUi';
import { formatDatumKurz } from './statistik';

/**
 * Melderzeile — vier Zustände auf einen Blick, wie an einem Maschinenpanel.
 *
 * Jeder Melder ist antippbar und führt dorthin, wo man etwas dagegen tun kann.
 * Der Verbindungsmelder ist der wichtigste: wer nicht sieht, dass Buchungen
 * nur auf dem Gerät liegen, hält sie für erledigt.
 *
 * Bewusst NICHT hier: die Tonnensumme des Tages. Sie steht eine Ebene tiefer im
 * Journal, wo sie zur Selbstkontrolle gebraucht wird — als Dauerzahl im Kopf
 * wäre sie eine Kennzahl, und Kennzahlen sind rechtepflichtig.
 */

export interface MelderZeileProps {
  online: boolean;
  sendet: boolean;
  wartend: number;
  datum: string;
  istNachtrag: boolean;
  tonAn: boolean;
  buchungenHeute: number;
  onWarteschlange: () => void;
  onDatum: () => void;
  onTon: () => void;
  onJournal: () => void;
}

const MELDER_TASTE =
  'flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold uppercase ' +
  'tracking-[0.08em] transition-colors hover:bg-gray-100 dark:hover:bg-slate-800';

const Punkt: React.FC<{ farbe: string }> = ({ farbe }) => (
  <span aria-hidden className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${farbe}`} />
);

const MelderZeile: React.FC<MelderZeileProps> = ({
  online,
  sendet,
  wartend,
  datum,
  istNachtrag,
  tonAn,
  buchungenHeute,
  onWarteschlange,
  onDatum,
  onTon,
  onJournal,
}) => {
  const verbindungsFarbe = wartend > 0 ? MELDER.alarm : sendet ? MELDER.warn : online ? MELDER.ok : MELDER.warn;

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto text-gray-600 dark:text-slate-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onWarteschlange}
        className={`${MELDER_TASTE} flex-shrink-0`}
        aria-label={
          wartend > 0
            ? `${wartend} Buchungen warten auf Übertragung`
            : online
              ? 'Verbindung besteht'
              : 'Keine Verbindung'
        }
      >
        <Punkt farbe={verbindungsFarbe} />
        {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        <span className="whitespace-nowrap">
          {wartend > 0 ? `${wartend} offen` : online ? 'Verbindung' : 'Offline'}
        </span>
      </button>

      <button
        type="button"
        onClick={onDatum}
        className={`${MELDER_TASTE} flex-shrink-0 ${
          istNachtrag ? 'text-amber-700 dark:text-amber-400' : ''
        }`}
        aria-label={`Buchungsdatum ${formatDatumKurz(datum)} ändern`}
      >
        <Punkt farbe={istNachtrag ? MELDER.warn : MELDER.aus} />
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">{formatDatumKurz(datum)}</span>
      </button>

      <button
        type="button"
        onClick={onTon}
        className={`${MELDER_TASTE} flex-shrink-0`}
        aria-label={tonAn ? 'Ton ausschalten' : 'Ton einschalten'}
        aria-pressed={tonAn}
      >
        <Punkt farbe={tonAn ? MELDER.ok : MELDER.aus} />
        {tonAn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        <span className="whitespace-nowrap">Ton</span>
      </button>

      <button
        type="button"
        onClick={onJournal}
        className={`${MELDER_TASTE} flex-shrink-0`}
        aria-label={`${buchungenHeute} eigene Buchungen heute — Journal öffnen`}
      >
        <Punkt farbe={buchungenHeute > 0 ? MELDER.ok : MELDER.aus} />
        <span className="whitespace-nowrap tabular-nums">{buchungenHeute} Buchungen</span>
      </button>
    </div>
  );
};

export default MelderZeile;
