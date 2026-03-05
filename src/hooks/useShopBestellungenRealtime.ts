/**
 * Shop Bestellungen Realtime Hook
 * Abonniert Appwrite Realtime für neue Bestellungen
 */

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { client, DATABASE_ID, SHOP_BESTELLUNGEN_COLLECTION_ID } from '../config/appwrite';
import { ShopBestellung, parseAdresse } from '../services/shopBestellungService';

interface UseShopBestellungenRealtimeOptions {
  /** Callback wenn neue Bestellung eingeht */
  onNeueBestellung?: (bestellung: ShopBestellung) => void;
  /** Toast-Benachrichtigungen anzeigen */
  showToasts?: boolean;
}

interface UseShopBestellungenRealtimeReturn {
  /** Anzahl neuer Bestellungen seit letztem Reset */
  neueBestellungenCount: number;
  /** Setzt den Counter zurück (z.B. wenn User die Seite besucht) */
  resetCounter: () => void;
}

/**
 * Hook für Realtime-Benachrichtigungen bei neuen Shop-Bestellungen
 */
export function useShopBestellungenRealtime(
  options: UseShopBestellungenRealtimeOptions = {}
): UseShopBestellungenRealtimeReturn {
  const { onNeueBestellung, showToasts = true } = options;
  const [neueBestellungenCount, setNeueBestellungenCount] = useState(0);

  const resetCounter = useCallback(() => {
    setNeueBestellungenCount(0);
  }, []);

  useEffect(() => {
    // Subscription-Channel für die Collection
    const channel = `databases.${DATABASE_ID}.collections.${SHOP_BESTELLUNGEN_COLLECTION_ID}.documents`;

    const unsubscribe = client.subscribe(channel, (response) => {
      // Prüfe ob es ein Create-Event ist
      const events = response.events || [];
      const isCreate = events.some((e: string) =>
        e.includes('.documents.*.create')
      );

      if (isCreate) {
        const bestellung = response.payload as unknown as ShopBestellung;

        // Counter erhöhen
        setNeueBestellungenCount((prev) => prev + 1);

        // Toast anzeigen
        if (showToasts) {
          const lieferadresse = parseAdresse(bestellung.lieferadresse);

          toast.info(
            `Neue Shop-Bestellung #${bestellung.bestellnummer}`,
            {
              description: `${lieferadresse.firma || lieferadresse.name} - ${bestellung.summeBrutto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
              action: {
                label: 'Anzeigen',
                onClick: () => {
                  window.location.href = '/shop-bestellungen';
                },
              },
              duration: 10000, // 10 Sekunden
            }
          );
        }

        // Callback aufrufen
        onNeueBestellung?.(bestellung);
      }
    });

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, [onNeueBestellung, showToasts]);

  return {
    neueBestellungenCount,
    resetCounter,
  };
}

export default useShopBestellungenRealtime;
