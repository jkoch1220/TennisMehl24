import {
  DebitorView,
  DEBITOR_HERKUNFT_CONFIG,
  getDebitorHerkuenfte,
} from '../../types/debitor';

interface HerkunftBadgesProps {
  debitor: DebitorView;
  className?: string;
}

/**
 * Herkunfts-Badges einer Forderung (Onlineshop / Hydrocourt / Universal / Anfrage / Direkt).
 * Zeigt in Liste, Detail und Mahnansicht, aus welchem Kanal die Rechnung stammt.
 * Mehrfachnennung ist gewollt: eine Shop-Bestellung kann Universal-Artikel enthalten.
 * 'Direkt' wird bewusst mit angezeigt — ein fehlendes Badge wäre nicht von
 * "Herkunft unbekannt" zu unterscheiden.
 */
const HerkunftBadges = ({ debitor, className = '' }: HerkunftBadgesProps) => {
  const herkuenfte = getDebitorHerkuenfte(debitor);

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {herkuenfte.map((herkunft) => {
        const config = DEBITOR_HERKUNFT_CONFIG[herkunft];
        // Shop-Bestellnummer direkt am Badge — sonst ist die Bestellung nur im Projekt auffindbar
        const titel =
          herkunft === 'onlineshop' && debitor.shopBestellnummer
            ? `${config.beschreibung} — Bestellung #${debitor.shopBestellnummer}`
            : config.beschreibung;

        return (
          <span
            key={herkunft}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${config.badgeClass}`}
            title={titel}
          >
            {config.label}
            {herkunft === 'onlineshop' && debitor.shopBestellnummer && (
              <span className="opacity-75">#{debitor.shopBestellnummer}</span>
            )}
          </span>
        );
      })}
    </div>
  );
};

export default HerkunftBadges;
