import {
  BarChart3,
  Calendar,
  CalendarDays,
  Receipt,
  BookOpen,
  MapPin,
  Users,
  Calculator,
  Euro,
  TrendingUp,
  MessageSquare,
  CheckSquare,
  ListChecks,
  Layers,
  Database,
} from 'lucide-react';

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: typeof BarChart3;
  color: string;
}

export const ALL_TOOLS: ToolConfig[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Unternehmenskennzahlen: Lagerbestände, anstehende Auslieferungen und mehr',
    href: '/dashboard',
    icon: BarChart3,
    color: 'from-indigo-500 to-purple-500',
  },
  {
    id: 'dispo-planung',
    name: 'Dispo-Planung',
    description: 'Planung und Verwaltung von Lieferungen, Routen und Fahrzeugen',
    href: '/dispo-planung',
    icon: Calendar,
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'saisonplanung',
    name: 'Saisonplanung',
    description: 'Call-Liste, Saisonmengen, Platzbauer-Beziehungen und Preise pflegen',
    href: '/saisonplanung',
    icon: CalendarDays,
    color: 'from-amber-500 to-red-500',
  },
  {
    id: 'projekt-verwaltung',
    name: 'Projekt-Verwaltung',
    description: 'Überblick über alle Projekte von Angebot bis Bezahlung',
    href: '/projekt-verwaltung',
    icon: Layers,
    color: 'from-purple-500 to-indigo-600',
  },
  {
    id: 'kreditoren',
    name: 'Kreditoren-Verwaltung',
    description: 'Verwaltung offener Rechnungen und Kreditoren mit Übersicht und Statistiken',
    href: '/kreditoren',
    icon: Receipt,
    color: 'from-red-600 to-red-800',
  },
  {
    id: 'wiki',
    name: 'Wiki',
    description: 'Dokumentation, Anleitungen und Wissenssammlung für das Team',
    href: '/wiki',
    icon: BookOpen,
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'konkurrenten',
    name: 'Konkurrenten-Karte',
    description: 'Übersicht aller Konkurrenten und Lieferkosten-Analyse nach Postleitzahl',
    href: '/konkurrenten',
    icon: MapPin,
    color: 'from-blue-600 to-indigo-600',
  },
  {
    id: 'kunden-karte',
    name: 'Kunden-Karte',
    description: 'Google Maps-Karte mit allen Kundenstandorten',
    href: '/kunden-karte',
    icon: Users,
    color: 'from-green-600 to-emerald-600',
  },
  {
    id: 'kunden-liste',
    name: 'Kunden Liste',
    description: 'Kunden anlegen und als Liste in Appwrite pflegen',
    href: '/kunden-liste',
    icon: ListChecks,
    color: 'from-emerald-500 to-lime-500',
  },
  {
    id: 'speditionskosten',
    name: 'Speditionskosten Rechner',
    description: 'Preisberechnung für Ziegelmehl mit Spedition oder Eigenlieferung',
    href: '/speditionskosten',
    icon: Calculator,
    color: 'from-red-500 to-orange-500',
  },
  {
    id: 'fixkosten',
    name: 'Fixkosten Rechner',
    description: 'Berechnung der Fixkosten für die Ziegelmehl-Herstellung',
    href: '/fixkosten',
    icon: Euro,
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'variable-kosten',
    name: 'Variable Kosten Rechner',
    description: 'Berechnung der variablen Kosten und Gesamtherstellkosten',
    href: '/variable-kosten',
    icon: TrendingUp,
    color: 'from-blue-500 to-indigo-500',
  },
  {
    id: 'vorschlaege',
    name: 'Verbesserungsvorschläge',
    description: 'Vorschläge zur Verbesserung des Online-Tools anlegen und verwalten',
    href: '/vorschlaege',
    icon: MessageSquare,
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'todos',
    name: 'TODO-Verwaltung',
    description: 'Aufgaben im Kanban-Board verwalten und bearbeiten',
    href: '/todos',
    icon: CheckSquare,
    color: 'from-purple-500 to-violet-500',
  },
  {
    id: 'stammdaten',
    name: 'Stammdaten',
    description: 'Firmendaten, Artikel und zentrale Stammdaten verwalten',
    href: '/stammdaten',
    icon: Database,
    color: 'from-blue-500 to-cyan-600',
  },
];

export const DEFAULT_TOOL_VISIBILITY = ALL_TOOLS.reduce<Record<string, boolean>>((acc, tool) => {
  acc[tool.id] = true;
  return acc;
}, {});
