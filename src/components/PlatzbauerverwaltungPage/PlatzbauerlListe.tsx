import {
  MapPin,
  Users,
  Package,
  ChevronRight,
  Mail,
  Building2,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import { PlatzbauermitVereinen } from '../../types/platzbauer';

interface PlatzbauerlListeProps {
  platzbauer: PlatzbauermitVereinen[];
  onSelectPlatzbauer: (id: string) => void;
  saisonjahr: number;
  onRefresh: () => void;
}

const PlatzbauerlListe = ({
  platzbauer,
  onSelectPlatzbauer,
}: PlatzbauerlListeProps) => {
  if (platzbauer.length === 0) {
    return (
      <div className="text-center py-16">
        <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Keine Platzbauer gefunden
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Es gibt keine Platzbauer, die den Filterkriterien entsprechen.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {platzbauer.map((pb) => (
        <PlatzbauerlCard
          key={pb.platzbauer.id}
          data={pb}
          onClick={() => onSelectPlatzbauer(pb.platzbauer.id)}
        />
      ))}
    </div>
  );
};

interface PlatzbauerlCardProps {
  data: PlatzbauermitVereinen;
  onClick: () => void;
}

const PlatzbauerlCard = ({ data, onClick }: PlatzbauerlCardProps) => {
  const { platzbauer, vereine, projekte, statistik } = data;

  // Berechne Projekt-Status-Zusammenfassung
  const offeneProjekte = projekte.filter(p => !['bezahlt', 'verloren'].includes(p.status));
  const hatAktiveProjekte = offeneProjekte.length > 0;

  // Adresse formatieren
  const adresse = platzbauer.lieferadresse || platzbauer.rechnungsadresse;
  const ort = adresse ? `${adresse.plz} ${adresse.ort}` : 'Keine Adresse';

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-dark-surface rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-amber-400 dark:hover:border-amber-500 shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {platzbauer.name}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{ort}</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors flex-shrink-0" />
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Vereine */}
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {vereine.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Vereine</div>
          </div>
        </div>

        {/* Projekte */}
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${hatAktiveProjekte ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-gray-50 dark:bg-gray-800'}`}>
            <FileCheck className={`w-4 h-4 ${hatAktiveProjekte ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {projekte.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Projekte</div>
          </div>
        </div>

        {/* Menge */}
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {statistik?.gesamtMenge?.toFixed(0) || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Tonnen</div>
          </div>
        </div>

        {/* Umsatz (nur Schätzung) */}
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
            <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {statistik?.offeneProjekte || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Offen</div>
          </div>
        </div>
      </div>

      {/* Footer - Kontakt */}
      {platzbauer.email && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg rounded-b-xl border-t border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{platzbauer.email}</span>
            </div>
          </div>
        </div>
      )}

      {/* Projekt-Status-Badge */}
      {hatAktiveProjekte && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-medium rounded-full">
            {offeneProjekte.length} aktiv
          </span>
        </div>
      )}
    </div>
  );
};

export default PlatzbauerlListe;
