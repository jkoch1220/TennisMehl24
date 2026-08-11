import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  ComponentType,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Inbox,
  HardHat,
  Mail,
  Phone,
  LayoutGrid,
  Truck,
  Droplets,
  Package,
  Banknote,
  BarChart3,
  Calculator,
  ChevronDown,
  RefreshCw,
  Lock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Projekt, ProjektStatus, ALLE_PROJEKT_STATUS } from '../../types/projekt';
import {
  getProjektHerkunft,
  istHydrocourtProjekt,
  istUniversalProjekt,
} from '../../utils/projektHerkunft';
import { useCan } from '../../hooks/useCan';
import { useAuth } from '../../contexts/AuthContext';
import { prozessOverviewService, ProzessKennzahlen, LEERE_KENNZAHLEN } from '../../services/prozessOverviewService';
import OpenInNewTabButton from '../Shared/OpenInNewTabButton';

/** Ansichten der Projekt-Verwaltung, die von der Übersicht aus erreichbar sind. */
export type OverviewZiel =
  | 'kanban'
  | 'anfragen'
  | 'hydrocourt'
  | 'universal'
  | 'statistik'
  | 'massenangebot';

interface ProzessOverviewProps {
  projekteGruppiert: Record<ProjektStatus, Projekt[]>;
  /** Projekte, die laut Anfragen-Collection aus einer Anfrage entstanden sind */
  anfrageProjektIds: Set<string>;
  saisonjahr: number;
  /** Wechsel in eine andere Ansicht der Projekt-Verwaltung */
  onZeigeView: (ziel: OverviewZiel) => void;
}

// ============================================================
// ORGANIGRAMM-VERDRAHTUNG
// Jede Karte trägt ein data-knoten-Attribut; daraus werden die
// Verbindungslinien gezeichnet (siehe useLayoutEffect weiter unten).
// ============================================================

const VERBINDUNGEN: Array<[von: string, nach: string]> = [
  ['shop', 'board'],
  ['anfragen', 'board'],
  ['platzbauer', 'board'],
  ['massenangebot', 'board'],
  ['email', 'board'],
  ['telefon', 'board'],
  ['board', 'dispo'],
  ['board', 'hydrocourt'],
  ['board', 'universal'],
  ['board', 'debitoren'],
  ['debitoren', 'statistik'],
];

/** Ab dieser Breite stehen die Spalten nebeneinander — nur dann werden Linien gezeichnet. */
const ORGANIGRAMM_AB_PX = 1280;

interface Linie {
  key: string;
  d: string;
}

// ============================================================
// FARBSCHEMATA
// Volle Klassennamen, keine Interpolation — sonst findet Tailwind
// die Klassen beim Build nicht.
// ============================================================

type FarbName = 'blau' | 'gruen' | 'bernstein' | 'schiefer' | 'rose' | 'lila' | 'himmel' | 'cyan' | 'orange' | 'smaragd' | 'petrol';

const FARBEN: Record<FarbName, { karte: string; icon: string; zahl: string; punkt: string }> = {
  blau: {
    karte: 'border-blue-200 dark:border-blue-900/60 hover:border-blue-400 dark:hover:border-blue-700',
    icon: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    zahl: 'text-blue-700 dark:text-blue-300',
    punkt: 'bg-blue-500',
  },
  gruen: {
    karte: 'border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400 dark:hover:border-emerald-700',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    zahl: 'text-emerald-700 dark:text-emerald-300',
    punkt: 'bg-emerald-500',
  },
  bernstein: {
    karte: 'border-amber-200 dark:border-amber-900/60 hover:border-amber-400 dark:hover:border-amber-700',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    zahl: 'text-amber-700 dark:text-amber-300',
    punkt: 'bg-amber-500',
  },
  schiefer: {
    karte: 'border-gray-200 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-500',
    icon: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
    zahl: 'text-gray-700 dark:text-slate-200',
    punkt: 'bg-gray-400',
  },
  rose: {
    karte: 'border-rose-200 dark:border-rose-900/60 hover:border-rose-400 dark:hover:border-rose-700',
    icon: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
    zahl: 'text-rose-700 dark:text-rose-300',
    punkt: 'bg-rose-500',
  },
  lila: {
    karte: 'border-purple-200 dark:border-purple-900/60 hover:border-purple-400 dark:hover:border-purple-700',
    icon: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    zahl: 'text-purple-700 dark:text-purple-300',
    punkt: 'bg-purple-500',
  },
  himmel: {
    karte: 'border-sky-200 dark:border-sky-900/60 hover:border-sky-400 dark:hover:border-sky-700',
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
    zahl: 'text-sky-700 dark:text-sky-300',
    punkt: 'bg-sky-500',
  },
  cyan: {
    karte: 'border-cyan-200 dark:border-cyan-900/60 hover:border-cyan-400 dark:hover:border-cyan-700',
    icon: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
    zahl: 'text-cyan-700 dark:text-cyan-300',
    punkt: 'bg-cyan-500',
  },
  orange: {
    karte: 'border-orange-200 dark:border-orange-900/60 hover:border-orange-400 dark:hover:border-orange-700',
    icon: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    zahl: 'text-orange-700 dark:text-orange-300',
    punkt: 'bg-orange-500',
  },
  smaragd: {
    karte: 'border-green-200 dark:border-green-900/60 hover:border-green-400 dark:hover:border-green-700',
    icon: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    zahl: 'text-green-700 dark:text-green-300',
    punkt: 'bg-green-500',
  },
  petrol: {
    karte: 'border-teal-200 dark:border-teal-900/60 hover:border-teal-400 dark:hover:border-teal-700',
    icon: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
    zahl: 'text-teal-700 dark:text-teal-300',
    punkt: 'bg-teal-500',
  },
};

/** Kurzlabel je Status für die Statuskette auf der Board-Karte. */
const STATUS_KURZ: Record<ProjektStatus, string> = {
  angebot: 'Angebot',
  angebot_versendet: 'Versendet',
  auftragsbestaetigung: 'AB',
  lieferschein: 'Lieferschein',
  geliefert: 'Geliefert',
  rechnung: 'Rechnung',
  bezahlt: 'Bezahlt',
  verloren: 'Verloren',
};

/** Status, die auf dem Board als Kette dargestellt werden (Verloren ist ein Seitenausgang). */
const KETTE: ProjektStatus[] = ALLE_PROJEKT_STATUS.filter((status) => status !== 'verloren');

// ============================================================
// FORMAT-HELFER
// ============================================================

const zahl = (wert: number | null | undefined): string =>
  wert === null || wert === undefined ? '—' : wert.toLocaleString('de-DE');

const euro = (wert: number | null | undefined): string =>
  wert === null || wert === undefined
    ? '—'
    : new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(wert);

// ============================================================
// BAUSTEINE
// ============================================================

/** Pfeil zwischen zwei Spalten — nur unterhalb der Organigramm-Breite, wo gestapelt wird. */
const StapelPfeil = () => (
  <div
    aria-hidden="true"
    className="xl:hidden flex items-center justify-center py-1 text-gray-300 dark:text-slate-600"
  >
    <ChevronDown className="w-6 h-6" />
  </div>
);

interface SpalteProps {
  nummer: number;
  titel: string;
  beschreibung: string;
  breite?: string;
  children: ReactNode;
}

const Spalte = ({
  nummer,
  titel,
  beschreibung,
  // Spalten wachsen mit der Bildschirmbreite; die Obergrenze verhindert, dass
  // die Karten auf sehr breiten Schirmen auseinanderlaufen.
  breite = 'xl:flex-1 xl:min-w-[14rem] xl:max-w-[21rem]',
  children,
}: SpalteProps) => (
  <section className={`min-w-0 ${breite}`}>
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-5 h-5 shrink-0 rounded-full bg-gray-900 dark:bg-slate-200 text-white dark:text-slate-900 text-[11px] font-bold flex items-center justify-center">
        {nummer}
      </span>
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
        {titel}
      </h3>
    </div>
    <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 leading-relaxed">{beschreibung}</p>
    <div className="space-y-2.5">{children}</div>
  </section>
);

interface ToolKarteProps {
  /** Knoten-Id für die Verbindungslinien */
  knoten: string;
  titel: string;
  icon: ComponentType<{ className?: string }>;
  farbe: FarbName;
  /** Hauptkennzahl — als Zahl oder „—", wenn die Quelle nicht erreichbar war */
  kennzahl: string;
  kennzahlLabel: string;
  /** Kennzahl ist Text statt Zahl (z.B. „Postfach") — dann kleiner gesetzt */
  kennzahlAlsText?: boolean;
  /** Zweite Zeile, z.B. „12 Projekte in dieser Saison" */
  zusatz?: string;
  /** Warnung (rot), z.B. überfällige Forderungen */
  warnung?: string;
  /** Interner Klick (Ansicht innerhalb der Projekt-Verwaltung) */
  onClick?: () => void;
  /** Zielroute eines eigenständigen Tools */
  route?: string;
  /** Tool-Berechtigung fehlt: Karte bleibt sichtbar, aber nicht klickbar */
  gesperrt?: boolean;
  laedt?: boolean;
}

const ToolKarte = ({
  knoten,
  titel,
  icon: Icon,
  farbe,
  kennzahl,
  kennzahlLabel,
  kennzahlAlsText = false,
  zusatz,
  warnung,
  onClick,
  route,
  gesperrt = false,
  laedt = false,
}: ToolKarteProps) => {
  const navigate = useNavigate();
  const stil = FARBEN[farbe];
  const klickbar = !gesperrt && (!!onClick || !!route);

  const handleClick = () => {
    if (!klickbar) return;
    if (onClick) onClick();
    else if (route) navigate(route);
  };

  return (
    <div
      data-knoten={knoten}
      role={klickbar ? 'button' : undefined}
      tabIndex={klickbar ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (klickbar && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`group relative bg-white dark:bg-slate-800 border rounded-xl p-3 transition-all ${stil.karte} ${
        klickbar ? 'cursor-pointer hover:shadow-md' : 'opacity-80 cursor-default'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`p-2 rounded-lg shrink-0 ${stil.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{titel}</h4>
            {gesperrt && (
              <Lock className="w-3 h-3 text-gray-400 dark:text-slate-500 shrink-0" aria-label="Keine Berechtigung" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {laedt ? (
              <span className="inline-block h-6 w-10 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
            ) : (
              <span
                className={`font-bold leading-none ${stil.zahl} ${
                  kennzahlAlsText ? 'text-sm' : 'text-xl'
                }`}
              >
                {kennzahl}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-slate-400 truncate">{kennzahlLabel}</span>
          </div>
          {zusatz && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 leading-snug">{zusatz}</p>
          )}
          {warnung && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1 leading-snug">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {warnung}
            </p>
          )}
        </div>
        {route && !gesperrt && (
          <OpenInNewTabButton to={route} className="shrink-0 -mt-1 -mr-1" />
        )}
      </div>
    </div>
  );
};

// ============================================================
// HAUPTKOMPONENTE
// ============================================================

const ProzessOverview = ({
  projekteGruppiert,
  anfrageProjektIds,
  saisonjahr,
  onZeigeView,
}: ProzessOverviewProps) => {
  const { can } = useCan();
  // Das Massen-Angebots-Tool ist im Board nur Admins zugänglich — hier ebenso
  const { isAdmin } = useAuth();
  const [kennzahlen, setKennzahlen] = useState<ProzessKennzahlen>(LEERE_KENNZAHLEN);
  const [laedt, setLaedt] = useState(true);
  const [linien, setLinien] = useState<Linie[]>([]);
  const organigrammRef = useRef<HTMLDivElement>(null);

  // Externe Kennzahlen (Anfragen, Shop, Platzbauer, Debitoren) nachladen.
  // Die Projekt-Zahlen stehen bereits über die Props zur Verfügung.
  useEffect(() => {
    let aktiv = true;
    setLaedt(true);
    prozessOverviewService
      .ladeKennzahlen(saisonjahr)
      .then((daten) => {
        if (aktiv) setKennzahlen(daten);
      })
      .finally(() => {
        if (aktiv) setLaedt(false);
      });
    return () => {
      aktiv = false;
    };
  }, [saisonjahr]);

  const neuLaden = () => {
    setLaedt(true);
    prozessOverviewService
      .ladeKennzahlen(saisonjahr)
      .then(setKennzahlen)
      .finally(() => setLaedt(false));
  };

  // Alles, was sich direkt aus den geladenen Projekten ableiten lässt.
  const projektZahlen = useMemo(() => {
    const alle = ALLE_PROJEKT_STATUS.flatMap((status) => projekteGruppiert[status] ?? []);

    const proStatus = {} as Record<ProjektStatus, number>;
    ALLE_PROJEKT_STATUS.forEach((status) => {
      proStatus[status] = (projekteGruppiert[status] ?? []).length;
    });

    const laufend = alle.filter((p) => p.status !== 'bezahlt' && p.status !== 'verloren');

    // Herkunft: woraus die Projekte dieser Saison entstanden sind.
    // Massen-Angebote sind kein Kanal in getProjektHerkunft, tragen aber einen
    // eigenen Marker — sie hier abzuziehen verhindert, dass sie zusätzlich als
    // „direkt angelegt" gezählt werden.
    const herkunft = { shop: 0, anfrage: 0, platzbau: 0, massenangebot: 0, direkt: 0 };
    alle.forEach((projekt) => {
      const kanal = getProjektHerkunft(projekt, anfrageProjektIds);
      const ausMassenlauf = projekt.automatischErzeugt === true || !!projekt.erzeugungsBatchId;
      if (ausMassenlauf) herkunft.massenangebot += 1;
      else if (kanal) herkunft[kanal] += 1;
      else herkunft.direkt += 1;
    });

    // Zu disponieren: Auftrag steht, Ware ist noch nicht raus
    const dispoOffen = alle.filter(
      (p) => p.status === 'auftragsbestaetigung' && p.dispoStatus !== 'geliefert'
    ).length;

    // Hydrocourt / Universal: Teilprojekte, die noch nicht bezahlt sind
    const hydrocourtOffen = alle.filter(
      (p) => istHydrocourtProjekt(p) && p.hydrocourtStatus !== 'bezahlt' && p.status !== 'verloren'
    ).length;
    const universalOffen = alle.filter(
      (p) => istUniversalProjekt(p) && p.universalKanbanStatus !== 'bezahlt' && p.status !== 'verloren'
    ).length;

    return {
      gesamt: alle.length,
      laufend: laufend.length,
      proStatus,
      herkunft,
      dispoOffen,
      hydrocourtOffen,
      universalOffen,
    };
  }, [projekteGruppiert, anfrageProjektIds]);

  // Verbindungslinien zwischen den Karten messen. Erst nach dem Layout, damit
  // die Kartenpositionen stehen; unterhalb der Organigramm-Breite wird gestapelt
  // und es werden gar keine Linien gezeichnet.
  useLayoutEffect(() => {
    const berechne = () => {
      const container = organigrammRef.current;
      if (!container) return;

      if (window.innerWidth < ORGANIGRAMM_AB_PX) {
        setLinien((vorher) => (vorher.length === 0 ? vorher : []));
        return;
      }

      const basis = container.getBoundingClientRect();
      const knoten = new Map<string, DOMRect>();
      container.querySelectorAll<HTMLElement>('[data-knoten]').forEach((el) => {
        const id = el.dataset.knoten;
        if (id) knoten.set(id, el.getBoundingClientRect());
      });

      const neue: Linie[] = [];
      for (const [von, nach] of VERBINDUNGEN) {
        const a = knoten.get(von);
        const b = knoten.get(nach);
        if (!a || !b) continue;

        const x1 = a.right - basis.left;
        const y1 = a.top + a.height / 2 - basis.top;
        // 7px Abstand zur Zielkarte, damit die Pfeilspitze frei steht
        const x2 = b.left - basis.left - 7;
        const y2 = b.top + b.height / 2 - basis.top;
        const krümmung = Math.max(20, (x2 - x1) * 0.45);

        neue.push({
          key: `${von}-${nach}`,
          d: `M ${x1} ${y1} C ${x1 + krümmung} ${y1}, ${x2 - krümmung} ${y2}, ${x2} ${y2}`,
        });
      }
      setLinien(neue);
    };

    berechne();
    // Zweiter Durchgang nach dem Layout-Pass: beim ersten Render stehen die
    // endgültigen Kartenhöhen (Schriften, Umbrüche) noch nicht fest.
    const frame = requestAnimationFrame(berechne);

    const container = organigrammRef.current;
    const beobachter = new ResizeObserver(berechne);
    if (container) {
      beobachter.observe(container);
      // Auch jede Karte einzeln: eine Karte kann höher werden, ohne dass sich
      // die Größe des Containers ändert — die Linien müssten dann trotzdem nach.
      container
        .querySelectorAll<HTMLElement>('[data-knoten]')
        .forEach((el) => beobachter.observe(el));
    }
    window.addEventListener('resize', berechne);
    return () => {
      cancelAnimationFrame(frame);
      beobachter.disconnect();
      window.removeEventListener('resize', berechne);
    };
    // Kennzahlen ändern die Kartenhöhen (Skeleton → Zahl), deshalb mit in den Abhängigkeiten
  }, [projektZahlen, kennzahlen, laedt]);

  const darfShop = can('shop-bestellungen', 'view');
  const darfPlatzbauer = can('platzbauer-verwaltung', 'view');
  const darfEmail = can('email-dashboard', 'view');
  const darfDispo = can('dispo-planung', 'view');
  const darfDebitoren = can('debitoren', 'view');

  return (
    <div className="space-y-5">
      {/* Kopfzeile */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-100 dark:border-purple-900/50 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              So läuft ein Auftrag durch unsere Tools
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 max-w-4xl leading-relaxed">
              Egal ob Onlineshop, Anfrage, Platzbauer, Massen-Angebot, E-Mail oder Telefon — aus jedem Eingang
              entsteht <strong className="font-semibold text-gray-800 dark:text-slate-200">genau ein Projekt</strong>,
              und alle Projekte landen auf dem Kanban-Board. Von dort zweigen die Tools ab, die
              den Auftrag ausführen; am Ende stehen Rechnung und Auswertung.
            </p>
          </div>
          <button
            onClick={neuLaden}
            disabled={laedt}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${laedt ? 'animate-spin' : ''}`} />
            Zahlen aktualisieren
          </button>
        </div>
      </div>

      {/* Organigramm */}
      <div ref={organigrammRef} className="relative">
        {/* Verbindungslinien — liegen hinter den Karten und fangen keine Klicks ab */}
        <svg
          aria-hidden="true"
          className="hidden xl:block absolute inset-0 w-full h-full pointer-events-none text-gray-300 dark:text-slate-600"
        >
          <defs>
            <marker
              id="prozess-pfeil"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {linien.map((linie) => (
            <path
              key={linie.key}
              d={linie.d}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#prozess-pfeil)"
            />
          ))}
        </svg>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 xl:gap-10 2xl:gap-16">
          {/* ---------- 1. Eingang ---------- */}
          <Spalte
            nummer={1}
            titel="Wo Projekte entstehen"
            beschreibung="Alle Kanäle, über die Arbeit ins Haus kommt."
          >
            <ToolKarte
              knoten="shop"
              titel="Onlineshop"
              icon={ShoppingCart}
              farbe="blau"
              kennzahl={zahl(kennzahlen.shopNeu)}
              kennzahlLabel="neue Bestellungen"
              zusatz={`${zahl(kennzahlen.shopInArbeit)} in Bearbeitung · ${projektZahlen.herkunft.shop} Projekte in dieser Saison`}
              route="/shop-bestellungen"
              gesperrt={!darfShop}
              laedt={laedt}
            />
            <ToolKarte
              knoten="anfragen"
              titel="Anfragen"
              icon={Inbox}
              farbe="gruen"
              kennzahl={zahl(kennzahlen.anfragenNeu)}
              kennzahlLabel="offene Anfragen"
              zusatz={`${zahl(kennzahlen.anfragenInArbeit)} in Arbeit · ${projektZahlen.herkunft.anfrage} Projekte in dieser Saison`}
              onClick={() => onZeigeView('anfragen')}
              laedt={laedt}
            />
            <ToolKarte
              knoten="platzbauer"
              titel="Platzbauer"
              icon={HardHat}
              farbe="bernstein"
              kennzahl={zahl(kennzahlen.platzbauerOffen)}
              kennzahlLabel="laufende Platzbau-Projekte"
              zusatz={`${zahl(kennzahlen.platzbauerGesamt)} gesamt in Saison ${saisonjahr} · ${projektZahlen.herkunft.platzbau} Vereinsprojekte`}
              route="/platzbauer-verwaltung"
              gesperrt={!darfPlatzbauer}
              laedt={laedt}
            />
            <ToolKarte
              knoten="massenangebot"
              titel="Massen-Angebote"
              icon={Calculator}
              farbe="petrol"
              kennzahl={String(projektZahlen.herkunft.massenangebot)}
              kennzahlLabel="Projekte aus Massen-Läufen"
              zusatz="Frühjahrs-Instandsetzung: Angebote für viele Saisonkunden in einem Lauf."
              onClick={() => onZeigeView('massenangebot')}
              gesperrt={!isAdmin}
            />
            <ToolKarte
              knoten="email"
              titel="E-Mail"
              icon={Mail}
              farbe="schiefer"
              kennzahl="Postfach"
              kennzahlLabel="ohne Zähler"
              kennzahlAlsText
              zusatz="Mails, die keine automatische Anfrage erzeugt haben, werden von Hand zum Projekt."
              route="/email-dashboard"
              gesperrt={!darfEmail}
            />
            <ToolKarte
              knoten="telefon"
              titel="Telefon & direkt"
              icon={Phone}
              farbe="rose"
              kennzahl={String(projektZahlen.herkunft.direkt)}
              kennzahlLabel="direkt angelegt"
              zusatz="Projekte ohne Quell-Tool — im Board über „Neues Projekt“ erfasst."
              onClick={() => onZeigeView('kanban')}
            />
          </Spalte>

          <StapelPfeil />

          {/* ---------- 2. Board ---------- */}
          <Spalte
            nummer={2}
            titel="Hier läuft alles zusammen"
            beschreibung="Jeder Eingang wird zu genau einem Projekt — und jedes Projekt liegt auf dem Board."
            breite="xl:flex-1 xl:min-w-[17rem] xl:max-w-[25rem]"
          >
            <div
              data-knoten="board"
              role="button"
              tabIndex={0}
              onClick={() => onZeigeView('kanban')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onZeigeView('kanban');
                }
              }}
              className="group relative bg-white dark:bg-slate-800 border-2 border-purple-300 dark:border-purple-800 rounded-xl p-4 cursor-pointer transition-all hover:border-purple-500 dark:hover:border-purple-600 hover:shadow-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                  <LayoutGrid className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">Kanban-Board</h4>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    <span className="font-bold text-purple-700 dark:text-purple-300">
                      {projektZahlen.laufend}
                    </span>{' '}
                    aktive Projekte
                  </p>
                </div>
              </div>

              {/* Statuskette */}
              <div className="space-y-1">
                {KETTE.map((status, index) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className="w-3 flex justify-center text-gray-300 dark:text-slate-600 text-[10px]">
                      {index === 0 ? '' : '↓'}
                    </span>
                    <div className="flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-slate-700/50">
                      <span className="text-xs text-gray-600 dark:text-slate-300 truncate">
                        {STATUS_KURZ[status]}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                        {projektZahlen.proStatus[status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Projektzahl der Saison als Fuß der Board-Karte */}
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-purple-700 dark:text-purple-300 leading-none">
                    {projektZahlen.gesamt}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    Projekte in Saison {saisonjahr}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">
                    {projektZahlen.proStatus.verloren > 0
                      ? `davon ${projektZahlen.proStatus.verloren} verloren`
                      : 'keine verlorenen Projekte'}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
                    Board öffnen <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          </Spalte>

          <StapelPfeil />

          {/* ---------- 3. Abwicklung ---------- */}
          <Spalte
            nummer={3}
            titel="Abwicklung"
            beschreibung="Aus dem Board zweigen die Tools ab, die den Auftrag ausführen und abrechnen."
          >
            <ToolKarte
              knoten="dispo"
              titel="Disposition"
              icon={Truck}
              farbe="himmel"
              kennzahl={String(projektZahlen.dispoOffen)}
              kennzahlLabel="zu disponieren"
              zusatz="Aufträge mit AB, deren Lieferung noch geplant werden muss."
              route="/dispo-planung"
              gesperrt={!darfDispo}
            />
            <ToolKarte
              knoten="hydrocourt"
              titel="Hydrocourt"
              icon={Droplets}
              farbe="cyan"
              kennzahl={String(projektZahlen.hydrocourtOffen)}
              kennzahlLabel="offene TM-HYC"
              zusatz="Bestellungen mit Artikel TM-HYC — Versand über Schwab."
              onClick={() => onZeigeView('hydrocourt')}
            />
            <ToolKarte
              knoten="universal"
              titel="Universal"
              icon={Package}
              farbe="orange"
              kennzahl={String(projektZahlen.universalOffen)}
              kennzahlLabel="offene Bestellungen"
              zusatz="Fremdprodukte aus dem Universal-Katalog."
              onClick={() => onZeigeView('universal')}
            />
            <ToolKarte
              knoten="debitoren"
              titel="Debitoren"
              icon={Banknote}
              farbe="smaragd"
              kennzahl={zahl(kennzahlen.debitorenOffenAnzahl)}
              kennzahlLabel="offene Forderungen"
              zusatz={`${euro(kennzahlen.debitorenOffenBetrag)} offen`}
              warnung={
                kennzahlen.debitorenUeberfaellig
                  ? `${kennzahlen.debitorenUeberfaellig} überfällig`
                  : undefined
              }
              route="/debitoren"
              gesperrt={!darfDebitoren}
              laedt={laedt}
            />
          </Spalte>

          <StapelPfeil />

          {/* ---------- 4. Auswertung ---------- */}
          <Spalte
            nummer={4}
            titel="Auswertung"
            beschreibung="Am Ende der Kette stehen die Zahlen der Saison."
            breite="xl:flex-1 xl:min-w-[13rem] xl:max-w-[18rem]"
          >
            <ToolKarte
              knoten="statistik"
              titel="Statistik"
              icon={BarChart3}
              farbe="lila"
              kennzahl={String(projektZahlen.proStatus.bezahlt)}
              kennzahlLabel="bezahlte Projekte"
              zusatz={`Umsatz, Mengen und DB1 der Saison ${saisonjahr}.`}
              onClick={() => onZeigeView('statistik')}
            />
          </Spalte>
        </div>
      </div>

      {/* Legende */}
      <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-2">
          Die Regel dahinter
        </h3>
        <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
          <li className="flex gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${FARBEN.lila.punkt}`} />
            <span>
              <strong className="text-gray-800 dark:text-slate-200">Ein Eingang = ein Projekt.</strong>{' '}
              Kein Auftrag lebt nur in einer Mail oder im Shop — er wird immer zum Projekt, und
              das Projekt trägt Kunde, Menge, Preise und alle Dokumente.
            </span>
          </li>
          <li className="flex gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${FARBEN.blau.punkt}`} />
            <span>
              <strong className="text-gray-800 dark:text-slate-200">Die Karte trägt die Farbe ihrer Herkunft.</strong>{' '}
              Blau = Shop, Grün = Anfrage, Beige = Platzbauer, Weiß = direkt angelegt.
            </span>
          </li>
          <li className="flex gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${FARBEN.smaragd.punkt}`} />
            <span>
              <strong className="text-gray-800 dark:text-slate-200">Der Status ist der Fortschritt.</strong>{' '}
              Angebot → AB → Lieferschein → Geliefert → Rechnung → Bezahlt. Die Tools der
              Abwicklung arbeiten parallel dazu, ersetzen den Status aber nicht.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ProzessOverview;
