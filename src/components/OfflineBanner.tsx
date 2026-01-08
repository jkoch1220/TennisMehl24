import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Zeigt einen Offline-Banner am oberen Bildschirmrand an,
 * wenn keine Internetverbindung besteht.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white py-2 px-4 text-center font-semibold shadow-lg flex items-center justify-center gap-2">
      <WifiOff className="w-5 h-5" />
      <span>OFFLINE</span>
    </div>
  );
}
