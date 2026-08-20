import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { client, NOTIFICATIONS_COLLECTION_ID, ANFRAGEN_COLLECTION_ID } from '../config/appwrite';
import { realtimeKanal } from '../config/mockModus';
import { useAuth } from './AuthContext';
import { notificationService, mapDocument } from '../services/notificationService';
import type { Benachrichtigung } from '../types/notification';

interface NotificationContextType {
  /** Offene Benachrichtigungen (vom aktuellen User noch nicht abgehakt), neueste oben */
  notifications: Benachrichtigung[];
  /** Anzahl ungelesener Benachrichtigungen (für Glocken-Badge) */
  ungelesenCount: number;
  /** Anzahl offener Benachrichtigungen */
  offeneCount: number;
  /** Lädt gerade die initiale Liste */
  loading: boolean;
  /** Markiert eine Benachrichtigung als gelesen (für aktuellen User) */
  markiereGelesen: (id: string) => Promise<void>;
  /** Markiert alle als gelesen */
  markiereAlleGelesen: () => Promise<void>;
  /** Hakt eine Benachrichtigung ab (entfernt sie aus der offenen Liste) */
  hakeAb: (id: string) => Promise<void>;
  /** Hakt alle ab */
  hakeAlleAb: () => Promise<void>;
  /** Lädt die offene Liste neu (z.B. nach Verbindungsverlust) */
  reload: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Benachrichtigung[]>([]);
  const [loading, setLoading] = useState(true);

  // userId in Ref, damit der Realtime-Callback immer den aktuellen Wert sieht,
  // ohne die Subscription bei jedem User-Wechsel neu aufzubauen.
  const userId = user?.$id ?? null;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  /**
   * Anfragen, deren Meldung beim Laden bewusst ausgeblendet wurde, weil der
   * Vorgang im Anfragen-Tool längst abgearbeitet ist.
   *
   * Der Realtime-Handler braucht diese Auskunft synchron: Hakt ein Kollege eine
   * solche Meldung ab oder liest sie, kommt bei uns ein Update-Event für eine
   * Meldung an, die nicht in der Liste steht — und würde ohne diese Notbremse
   * wieder einsortiert. Als Ref und nicht als State, damit der Realtime-Callback
   * immer den aktuellen Stand sieht, ohne die Subscription neu aufzubauen.
   */
  const ausgeblendeteAnfragenRef = useRef<Set<string>>(new Set());

  // --- Initiales Laden beim Mount / User-Wechsel ---
  const reload = useCallback(async () => {
    if (!userIdRef.current) {
      setNotifications([]);
      ausgeblendeteAnfragenRef.current = new Set();
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { notifications: offene, ausgeblendeteAnfrageIds } =
        await notificationService.ladeOffeneNotifications(userIdRef.current);
      ausgeblendeteAnfragenRef.current = new Set(ausgeblendeteAnfrageIds);
      setNotifications(offene);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [userId, reload]);

  // --- Realtime-Subscription ---
  useEffect(() => {
    if (!userId) return;

    const channel = realtimeKanal(NOTIFICATIONS_COLLECTION_ID);

    const unsubscribe = client.subscribe(channel, (response) => {
      const events: string[] = response.events || [];
      const aktuellerUser = userIdRef.current;
      if (!aktuellerUser) return;

      const notification = mapDocument(response.payload as Record<string, unknown>);

      const isCreate = events.some((e) => e.endsWith('.create'));
      const isUpdate = events.some((e) => e.endsWith('.update'));
      const isDelete = events.some((e) => e.endsWith('.delete'));

      if (isDelete) {
        setNotifications((prev) => prev.filter((n) => n.$id !== notification.$id));
        return;
      }

      // Vom aktuellen User abgehakt -> raus aus der offenen Liste
      if (notification.erledigtVon.includes(aktuellerUser)) {
        setNotifications((prev) => prev.filter((n) => n.$id !== notification.$id));
        return;
      }

      if (isCreate) {
        setNotifications((prev) => {
          if (prev.some((n) => n.$id === notification.$id)) return prev;
          // Optionales Zusatz-Signal: kurzer Toast mit "Anzeigen"-Action.
          toast.info(notification.titel, {
            description: notification.nachricht,
            action: {
              label: 'Anzeigen',
              onClick: () => navigate(notification.link),
            },
            duration: 8000,
          });
          return [notification, ...prev];
        });
        return;
      }

      if (isUpdate) {
        // Fehlt die Meldung in der Liste, kann das zwei Gründe haben: Wir haben
        // ihr Anlegen verpasst (dann gehört sie aufgenommen) — oder der Filter
        // beim Laden hat sie bewusst aussortiert, weil die zugehörige Anfrage
        // längst abgearbeitet ist. Im zweiten Fall darf ein fremdes Update (ein
        // Kollege liest oder hakt sie ab) sie nicht zurückholen; sonst hielte
        // sich der Filter nur bis zum ersten Realtime-Event.
        //
        // Die Entscheidung fällt synchron über die Ref, bewusst ohne erneute
        // Abfrage: Ein Roundtrip aus dem State-Updater heraus würde die
        // Reihenfolge der Ereignisse verdrehen (ein zwischenzeitliches Abhaken
        // käme zuerst an, die verspätete Einfügung danach) und liefe zudem
        // doppelt, weil React Updater mehrfach aufrufen darf.
        const bewusstAusgeblendet =
          notification.refTyp === ANFRAGEN_COLLECTION_ID &&
          ausgeblendeteAnfragenRef.current.has(notification.refId);

        setNotifications((prev) => {
          const exists = prev.some((n) => n.$id === notification.$id);
          if (exists) {
            return prev.map((n) => (n.$id === notification.$id ? notification : n));
          }
          if (bewusstAusgeblendet) return prev;
          return [notification, ...prev].sort((a, b) =>
            b.erstelltAm.localeCompare(a.erstelltAm)
          );
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [userId, navigate]);

  // --- Aktionen ---
  const markiereGelesen = useCallback(async (id: string) => {
    const aktuellerUser = userIdRef.current;
    if (!aktuellerUser) return;

    let neueGelesenVon: string[] | null = null;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.$id !== id || n.gelesenVon.includes(aktuellerUser)) return n;
        neueGelesenVon = [...n.gelesenVon, aktuellerUser];
        return { ...n, gelesenVon: neueGelesenVon };
      })
    );

    if (neueGelesenVon) {
      try {
        await notificationService.setGelesen(id, neueGelesenVon);
      } catch (error) {
        console.error('Fehler beim Markieren als gelesen:', error);
      }
    }
  }, []);

  const markiereAlleGelesen = useCallback(async () => {
    const aktuellerUser = userIdRef.current;
    if (!aktuellerUser) return;

    const zuAktualisieren = notifications.filter((n) => !n.gelesenVon.includes(aktuellerUser));
    if (zuAktualisieren.length === 0) return;

    setNotifications((prev) =>
      prev.map((n) =>
        n.gelesenVon.includes(aktuellerUser)
          ? n
          : { ...n, gelesenVon: [...n.gelesenVon, aktuellerUser] }
      )
    );

    await Promise.all(
      zuAktualisieren.map((n) =>
        notificationService
          .setGelesen(n.$id, [...n.gelesenVon, aktuellerUser])
          .catch((error) => console.error('Fehler beim Markieren als gelesen:', error))
      )
    );
  }, [notifications]);

  const hakeAb = useCallback(async (id: string) => {
    const aktuellerUser = userIdRef.current;
    if (!aktuellerUser) return;

    const ziel = notifications.find((n) => n.$id === id);
    if (!ziel) return;

    // Optimistisch aus der offenen Liste entfernen
    setNotifications((prev) => prev.filter((n) => n.$id !== id));

    try {
      await notificationService.setErledigt(id, [...ziel.erledigtVon, aktuellerUser]);
    } catch (error) {
      console.error('Fehler beim Abhaken:', error);
      // Bei Fehler zurückholen
      setNotifications((prev) =>
        prev.some((n) => n.$id === id) ? prev : [ziel, ...prev].sort((a, b) =>
          b.erstelltAm.localeCompare(a.erstelltAm)
        )
      );
    }
  }, [notifications]);

  const hakeAlleAb = useCallback(async () => {
    const aktuellerUser = userIdRef.current;
    if (!aktuellerUser) return;

    const zuErledigen = [...notifications];
    if (zuErledigen.length === 0) return;

    setNotifications([]);

    await Promise.all(
      zuErledigen.map((n) =>
        notificationService
          .setErledigt(n.$id, [...n.erledigtVon, aktuellerUser])
          .catch((error) => console.error('Fehler beim Abhaken:', error))
      )
    );
  }, [notifications]);

  const ungelesenCount = useMemo(() => {
    if (!userId) return 0;
    return notifications.filter((n) => !n.gelesenVon.includes(userId)).length;
  }, [notifications, userId]);

  const offeneCount = notifications.length;

  const value = useMemo<NotificationContextType>(
    () => ({
      notifications,
      ungelesenCount,
      offeneCount,
      loading,
      markiereGelesen,
      markiereAlleGelesen,
      hakeAb,
      hakeAlleAb,
      reload,
    }),
    [
      notifications,
      ungelesenCount,
      offeneCount,
      loading,
      markiereGelesen,
      markiereAlleGelesen,
      hakeAb,
      hakeAlleAb,
      reload,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications muss innerhalb eines NotificationProvider verwendet werden');
  }
  return context;
};
