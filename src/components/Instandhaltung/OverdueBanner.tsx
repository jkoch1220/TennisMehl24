import { AlertTriangle, ChevronRight } from 'lucide-react';
import { OverdueInfo, InstandhaltungFrequenz, FREQUENZ_CONFIG } from '../../types/instandhaltung';

interface OverdueBannerProps {
  overdueInfos: OverdueInfo[];
  onTabSelect: (frequenz: InstandhaltungFrequenz) => void;
}

export default function OverdueBanner({ overdueInfos, onTabSelect }: OverdueBannerProps) {
  if (overdueInfos.length === 0) return null;

  const formatLetzteBegehung = (info: OverdueInfo): string => {
    if (!info.letzteBegehung || !info.letzteBegehung.abschlussDatum) {
      return 'Noch nie durchgeführt';
    }
    const datum = new Date(info.letzteBegehung.abschlussDatum);
    const jetzt = new Date();
    const diffMs = jetzt.getTime() - datum.getTime();
    const diffTage = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffTage === 0) return 'Heute';
    if (diffTage === 1) return 'Gestern';
    return `Vor ${diffTage} Tagen`;
  };

  return (
    <div className="mx-4 mb-2">
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">
              {overdueInfos.length === 1
                ? 'Begehung überfällig!'
                : `${overdueInfos.length} Begehungen überfällig!`}
            </h3>
            <div className="mt-2 space-y-2">
              {overdueInfos.map((info) => {
                const config = FREQUENZ_CONFIG[info.frequenz];
                return (
                  <button
                    key={info.frequenz}
                    onClick={() => onTabSelect(info.frequenz)}
                    className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors group"
                  >
                    <div className="text-left">
                      <p className="text-white font-medium text-sm">
                        {config.label}
                      </p>
                      <p className="text-white/80 text-xs">
                        {formatLetzteBegehung(info)}
                        {info.tageUeberfaellig > 0 && (
                          <span className="ml-1 text-white/60">
                            ({info.tageUeberfaellig} {info.tageUeberfaellig === 1 ? 'Tag' : 'Tage'} überfällig)
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
