import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { getPortalPublicUrl } from '../../services/liefernachweisService';
import { istMockModusAktiv } from '../../config/mockModus';

/**
 * Die Fotos, die der Kunde beim Bestellen von seiner Schüttstelle hochgeladen hat.
 *
 * Sie stehen hier, wo die Dispo sie braucht: vor der Tourenplanung. Wer sieht,
 * dass hinter dem Vereinsheim durch ein enges Tor gefahren werden muss, schickt
 * keinen Hängerzug — und der Fahrer muss vor Ort nicht anrufen.
 *
 * Der Bucket ist privat; die Bilder kommen über dieselbe Function, die auch der
 * Kunde nutzt, mit dem Bestell-Token als Ausweis.
 */
export default function SchuettstelleFotos({ projekt }: { projekt: Projekt }) {
  const [gross, setGross] = useState<string | null>(null);
  const fotos = projekt.schuettstelleFotos ?? [];
  if (fotos.length === 0) return null;

  const projektId = projekt.$id || projekt.id;
  const token = projekt.bestellToken ?? '';
  // Dieselbe Weiche wie beim Kundenlink: In der Sandbox liegen die Bilder in
  // der Sandbox-Datenbank, und die Function muss dort suchen.
  const sandbox = istMockModusAktiv() ? '&sandbox=1' : '';
  const url = (fileId: string) =>
    `${getPortalPublicUrl()}/.netlify/functions/bestellung` +
    `?projektId=${encodeURIComponent(projektId)}&token=${encodeURIComponent(token)}` +
    `&foto=${encodeURIComponent(fileId)}${sandbox}`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 flex items-center gap-2 mb-1">
        <Camera className="w-4 h-4 text-gray-400" /> Schüttstelle
        <span className="font-normal text-xs text-gray-500">vom Kunden hochgeladen</span>
      </h3>
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
        Wohin abgeladen werden soll — bitte vor der Tourenplanung ansehen.
      </p>
      <div className="flex gap-2 flex-wrap">
        {fotos.map((f) => (
          <button key={f.fileId} onClick={() => setGross(url(f.fileId))}
            title={f.hinweis || 'Vergrößern'}
            className="block rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 hover:ring-2 hover:ring-purple-400 transition-shadow">
            <img src={url(f.fileId)} alt="Schüttstelle" className="w-28 h-28 object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      {gross && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setGross(null)}>
          <button onClick={() => setGross(null)} aria-label="Schließen"
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20">
            <X className="w-6 h-6" />
          </button>
          <img src={gross} alt="Schüttstelle" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
