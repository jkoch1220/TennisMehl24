/**
 * LiefernachweisKarte
 *
 * Zeigt im Lieferschein-Tab, was der LKW-Fahrer per QR-Scan zurückgemeldet hat:
 * Zeitpunkt, Fahrername, Abladefoto, optionale Unterschrift und GPS-Position.
 *
 * Bis 07/2026 landeten diese Daten zwar in Appwrite, hatten im Portal aber keinen
 * einzigen Leser — sichtbar waren sie nur eingebettet im archivierten Nachweis-PDF.
 */

import { useState } from 'react';
import { PackageCheck, MapPin, PenLine, User, Camera, X } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { getLiefernachweisDateiUrl } from '../../services/liefernachweisService';

interface LiefernachweisKarteProps {
  projekt: Projekt;
}

const formatZeitpunkt = (iso?: string): string => {
  if (!iso) return '—';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '—';
  return datum.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const LiefernachweisKarte = ({ projekt }: LiefernachweisKarteProps) => {
  const [grossbild, setGrossbild] = useState<{ url: string; titel: string } | null>(null);

  // Ohne Bestätigungszeitpunkt gab es keinen Scan — dann zeigen wir gar nichts an.
  if (!projekt.liefernachweisAm) return null;

  const nachweis = projekt.liefernachweis;
  const fotoUrl = nachweis?.fotoDateiId ? getLiefernachweisDateiUrl(nachweis.fotoDateiId) : null;
  const unterschriftUrl = nachweis?.unterschriftDateiId
    ? getLiefernachweisDateiUrl(nachweis.unterschriftDateiId)
    : null;
  const geo = nachweis?.geo;

  return (
    <>
      <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <PackageCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-semibold text-teal-900 dark:text-teal-200">
            Vom Fahrer bestätigt
          </h3>
          <span className="ml-auto text-sm text-teal-800 dark:text-teal-300">
            {formatZeitpunkt(projekt.liefernachweisAm)}
          </span>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
            <dt className="text-gray-600 dark:text-gray-400">Fahrer:</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">
              {nachweis?.fahrerName || '—'}
            </dd>
          </div>

          {nachweis?.unterzeichnerName && (
            <div className="flex items-start gap-2">
              <PenLine className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
              <dt className="text-gray-600 dark:text-gray-400">Abgenommen von:</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {nachweis.unterzeichnerName}
              </dd>
            </div>
          )}

          {geo && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
              <dt className="text-gray-600 dark:text-gray-400">Position:</dt>
              <dd>
                <a
                  href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-teal-700 dark:text-teal-300 hover:underline"
                >
                  {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {(fotoUrl || unterschriftUrl) && (
          <div className="mt-4 flex flex-wrap gap-4">
            {fotoUrl && (
              <button
                onClick={() => setGrossbild({ url: fotoUrl, titel: 'Foto der abgeladenen Ware' })}
                className="group text-left"
                title="Foto vergrößern"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <Camera className="h-3.5 w-3.5" />
                  Abladefoto
                </div>
                <img
                  src={fotoUrl}
                  alt="Foto der abgeladenen Ware"
                  className="h-28 w-auto rounded-lg border border-teal-200 dark:border-teal-800 object-cover group-hover:ring-2 group-hover:ring-teal-400 transition-all"
                />
              </button>
            )}

            {unterschriftUrl && (
              <button
                onClick={() => setGrossbild({ url: unterschriftUrl, titel: 'Unterschrift' })}
                className="group text-left"
                title="Unterschrift vergrößern"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <PenLine className="h-3.5 w-3.5" />
                  Unterschrift
                </div>
                <img
                  src={unterschriftUrl}
                  alt="Unterschrift des Abnehmers"
                  className="h-28 w-auto rounded-lg border border-teal-200 dark:border-teal-800 bg-white object-contain group-hover:ring-2 group-hover:ring-teal-400 transition-all"
                />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Großansicht */}
      {grossbild && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setGrossbild(null)}
        >
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{grossbild.titel}</span>
              <button
                onClick={() => setGrossbild(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Schließen"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
            <img
              src={grossbild.url}
              alt={grossbild.titel}
              className="max-h-[80vh] w-auto rounded-lg bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default LiefernachweisKarte;
