# TennisMehl24 - Kalkulationstools

Eine moderne React TypeScript Anwendung für Kalkulationen und Preisberechnungen für TennisMehl24.

## Technologien

- **React 18** - Moderne UI-Bibliothek
- **TypeScript** - Typsichere Entwicklung
- **Vite** - Schneller Build-Tool und Dev-Server
- **Tailwind CSS** - Utility-first CSS Framework
- **React Router** - Client-side Routing
- **Lucide React** - Moderne Icon-Bibliothek

## Features

- ✅ Ziegelmehl Preisrechner (Sackware & Schüttware)
- ✅ PLZ-basierte Lieferzonenberechnung
- ✅ Responsive Design
- ✅ Moderne UI mit Tailwind CSS
- ✅ TypeScript für Typsicherheit
- ✅ Erweiterbare Struktur für weitere Tools

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Die Anwendung läuft dann auf `http://localhost:5173`

## Build

```bash
npm run build
```

## Projektstruktur

```
src/
├── components/          # React Komponenten
│   ├── Layout.tsx      # Hauptlayout mit Navigation
│   └── ZiegelmehlRechner.tsx
├── pages/              # Seiten-Komponenten
│   └── Home.tsx
├── types/              # TypeScript Typen
│   └── index.ts
├── constants/          # Konstanten und Konfiguration
│   └── pricing.ts
├── utils/              # Utility-Funktionen
│   └── calculations.ts
├── App.tsx             # Haupt-App-Komponente mit Routing
├── main.tsx            # Entry Point
└── index.css           # Globale Styles
```

## Weitere Tools hinzufügen

1. Neue Komponente in `src/components/` erstellen
2. Route in `src/App.tsx` hinzufügen
3. Navigation in `src/components/Layout.tsx` erweitern
4. Tool-Karte in `src/pages/Home.tsx` hinzufügen

## Lizenz

Proprietär - TennisMehl24

