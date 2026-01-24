# TennisMehl24 - Business Management Platform

Eine umfassende Unternehmensverwaltungsplattform für die Baustoffbranche, spezialisiert auf Ziegelmehl. Die Anwendung deckt den gesamten Geschäftsprozess ab: von der Kalkulation über Kundenmanagement, Auftragsabwicklung, Logistikplanung bis zur Finanzverwaltung.

## Technologien

| Kategorie | Technologie |
|-----------|-------------|
| **Frontend** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS |
| **Backend/Database** | Appwrite (BaaS) |
| **Routing** | React Router v6 |
| **PDF-Generierung** | jsPDF + jspdf-autotable |
| **Icons** | Lucide React |
| **Karten** | Leaflet + React-Leaflet |
| **Charts** | Recharts |
| **Rich Text** | TipTap |
| **Drag & Drop** | @dnd-kit |
| **Automation** | n8n Workflows |

## Features

### Kalkulationswerkzeuge
- **Speditionskosten-Rechner** - PLZ-basierte Lieferzonenberechnung, Diesel-Preis-API Integration
- **Fixkosten-Rechner** - Herstellungs-Fixkosten mit Verteilung und Diagrammen
- **Variable Kosten-Rechner** - Stückkosten für Material und Arbeit

### Kunden- & Auftragsmanagement
- **Saisonplanung** - Jahreskundenverträge, Call-Listen, Kundenbeziehungen
- **DispoPlanung** - Auftragsmanagement, Routenplanung, Fahrzeugverwaltung, Lieferkalender
- **Projektverwaltung** - Workflow: Angebot → Bestätigung → Lieferung → Rechnung → Bezahlt
- **Anfragen-Verarbeitung** - Automatische E-Mail-Verarbeitung mit n8n

### Dokumentenmanagement & Projektabwicklung
- **Angebotserstellung** mit Versionierung
- **Auftragsbestätigungen**
- **Lieferscheine**
- **Rechnungserstellung** mit automatischer Nummerierung
- **Dokumentenhistorie** und Änderungsverfolgung
- **E-Mail-Integration** für Dokumentenversand
- **Projekt-Chat** für Teamkommunikation

### Finanzverwaltung
- **Kreditoren-Verwaltung** - Lieferantenrechnungen, Zahlungsziele, Ratenzahlungen
- **Debitoren-Verwaltung** - Kundenforderungen und Mahnwesen
- **Privat-Kreditoren** - Separate Verwaltung für Teammitglieder
- **Fahrkostenabrechnung** - Kilometererfassung und Spesen

### Betriebsplanung
- **Schichtplanung** - Drag & Drop Mitarbeiterzuordnung
- **Instandhaltung** - Tägliche, wöchentliche, monatliche Checklisten
- **Produktionstracking** - Mobile Produktionserfassung
- **Kalender** - Termin- und Ereignisverwaltung

### Qualitätssicherung
- **Siebanalyse** nach DIN 18035-5
- **Körnungslinien-Visualisierung**
- **Trendanalyse** und Prüfberichte
- **Mischkalkulator**

### Karten & Geografie
- **Konkurrenten-Karte** - Interaktive Deutschland-Karte mit PLZ-Bereichen
- **Marktanalyse** nach Region
- **Kunden-Karte** mit Google Maps Integration

### Kommunikation & Automation
- **E-Mail Dashboard** - IMAP-Posteingangsüberwachung
- **Newsletter-Verwaltung** - Abonnentenliste und Kampagnen
- **E-Mail-Templates** mit Platzhaltern ({dokumentNummer}, {kundenname}, etc.)
- **n8n Workflow** für automatische Anfragenverarbeitung

### Dokumentation & Zusammenarbeit
- **Wiki** - Team-Wissensdatenbank mit TipTap-Editor
- **Verbesserungsvorschläge** - Feature-Request Tracking
- **TODO-Verwaltung** - Kanban-Board für Aufgaben

### Spezialisierte Module
- **Platzbauer-Verwaltung** - Tennisplatzbau-Projekte und Vereinsverwaltung

### Administration
- **Stammdaten** - Firmendaten, E-Mail-Templates, Kundennummern
- **Benutzerverwaltung** - Rollenbasierte Berechtigungen (27 Tools)
- **Dashboard** - KPIs, Lagerbestand, Lieferübersicht, Wetter

## Installation

```bash
# Dependencies installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# Dann .env mit Appwrite-Credentials ausfüllen
```

### Umgebungsvariablen

```env
VITE_APPWRITE_ENDPOINT=https://your-appwrite-server/v1
VITE_APPWRITE_PROJECT_ID=your-project-id
VITE_APPWRITE_API_KEY=your-api-key
```

## Entwicklung

```bash
# Entwicklungsserver starten (http://localhost:5173)
npm run dev

# TypeScript prüfen und für Produktion bauen
npm run build

# ESLint ausführen
npm run lint

# Produktions-Build lokal testen
npm run preview
```

## Appwrite Setup

```bash
# Datenbank-Schema initialisieren
npm run setup:appwrite

# Benutzer einrichten
npm run setup:users

# Benutzer auflisten
npm run list:users

# Benutzer-Cache aktualisieren
npm run cache:users
```

## Projektstruktur

```
src/
├── components/           # React-Komponenten (31 Feature-Module)
│   ├── Dashboard/        # KPIs und Übersicht
│   ├── DispoPlanung/     # Auftrags- und Routenplanung
│   ├── Saisonplanung/    # Jahreskundenplanung
│   ├── ProjektVerwaltung/# Projektstatus-Übersicht
│   ├── Projektabwicklung/# Dokumentenerstellung (Angebot bis Rechnung)
│   ├── KreditorenVerwaltung/  # Lieferantenrechnungen
│   ├── DebitorenVerwaltung/   # Kundenforderungen
│   ├── Schichtplanung/   # Mitarbeiter-Schichten
│   ├── Instandhaltung/   # Wartungs-Checklisten
│   ├── Qualitaetssicherung/   # Siebanalyse & QS
│   ├── KonkurrentenKarte/# Marktanalyse
│   ├── Anfragen/         # E-Mail-Anfragen
│   ├── EmailDashboard/   # Posteingang-Monitor
│   ├── Wiki/             # Wissensdatenbank
│   ├── Stammdaten/       # Konfiguration
│   └── ...               # Weitere Module
│
├── services/             # 53 Service-Klassen für Geschäftslogik
│   ├── projektService.ts # Projektverwaltung
│   ├── kundenService.ts  # Kundenverwaltung
│   ├── kreditorService.ts# Kreditoren
│   ├── anfragenService.ts# Anfragen-Verarbeitung
│   ├── emailService.ts   # E-Mail-Integration
│   └── ...               # Weitere Services
│
├── types/                # 31 TypeScript-Typdefinitionen
│   ├── projekt.ts        # Projekt-Typen
│   ├── dispo.ts          # Logistik-Typen
│   ├── kreditor.ts       # Finanz-Typen
│   └── ...               # Weitere Typen
│
├── utils/                # 19 Utility-Funktionen
│   ├── calculations.ts   # Preisberechnungen
│   ├── routeOptimization.ts  # Routenplanung
│   ├── geocoding.ts      # Adress-Geocoding
│   └── ...               # Weitere Utilities
│
├── contexts/             # React Contexts
│   ├── AuthContext.tsx   # Authentifizierung
│   └── ThemeContext.tsx  # Dark/Light Mode
│
├── config/               # Konfiguration
│   └── appwrite.ts       # Appwrite Client & Collection IDs
│
├── constants/            # Konstanten
│   ├── tools.ts          # 27 Tool-Definitionen
│   ├── pricing.ts        # Preistabellen
│   └── defaultValues.ts  # Standardwerte
│
├── data/                 # Geodaten
│   ├── plz-*.geojson     # Deutsche PLZ-Bereiche
│   └── ...               # Verwaltungsgrenzen
│
├── pages/                # Seiten-Komponenten
├── hooks/                # Custom React Hooks
├── App.tsx               # Routing & Layout
└── main.tsx              # Entry Point
```

## Architektur

### Service Layer Pattern
Alle Datenbankinteraktionen sind in Service-Klassen abstrahiert:
- Konsistente CRUD-Operationen (load, loadAll, create, update, delete)
- Zentralisierte Fehlerbehandlung und Datentransformation
- Appwrite Real-time Subscriptions für Live-Updates

### Authentifizierung & Autorisierung
- Context-basierte Authentifizierung (`AuthContext`)
- Rollenbasiertes Berechtigungssystem auf Tool-Ebene
- `ProtectedRoute`-Komponente für geschützte Routen
- User-Caching für Performance

### Datenbank (40+ Appwrite Collections)

**Kernbereiche:**
- `projekte` - Alle Projekte (Angebot bis Rechnung)
- `saison_kunden` - Jahreskundenverträge
- `kunden` - Dispo-Kunden
- `bestellungen` - Kundenbestellungen
- `lieferungen` - Lieferungen
- `kreditoren` - Lieferanten
- `offene_rechnungen` - Rechnungen

**Betrieb:**
- `schicht_mitarbeiter` - Mitarbeiter
- `schicht_zuweisungen` - Schichtzuordnungen
- `instandhaltung_*` - Wartungsdaten
- `produktion_eintraege` - Produktionserfassung

**Dokumente:**
- `bestellabwicklung_dokumente` - Generierte Dokumente
- `stammdaten` - Konfiguration
- `wiki_pages` - Wiki-Artikel

## Automation

### n8n E-Mail-Workflow
Die Anwendung integriert mit n8n für automatische E-Mail-Verarbeitung:
1. IMAP-Trigger überwacht Posteingänge
2. KI-gestützte Datenextraktion (OpenAI/Anthropic)
3. Automatische Kundenermittlung
4. Anfrage in Appwrite erstellen
5. Statusverfolgung: Neu → Zugewiesen → Angebot → Versendet → Erledigt

Details siehe `ANFRAGEN_BLUEPRINT.md`.

### PDF-Generierung
- Dynamische Dokumentenerstellung (Angebote, Rechnungen, Lieferscheine)
- Automatische Nummerierung
- Firmenbranding und Briefkopf
- Positionstabellen mit jspdf-autotable
- Versionierung und Regenerierung

### E-Mail-Templates
Dynamische Templates mit Platzhaltern:
- `{dokumentNummer}` - Dokumentnummer
- `{kundenname}` - Kundenname
- `{kundennummer}` - Kundennummer
- Konfigurierbar über Admin-Interface

## Externe Integrationen

| Integration | Zweck |
|-------------|-------|
| Appwrite | Backend-as-a-Service (Datenbank, Auth, Storage) |
| n8n | Workflow-Automation für E-Mail-Verarbeitung |
| Diesel-Preis-API | Aktuelle Kraftstoffpreise |
| Open-Meteo | Wettervorhersage (API-key-frei) |
| IMAP | E-Mail-Kontointegration |
| Google Maps | Kundenstandort-Visualisierung |

## Lizenz

Proprietär - TennisMehl24

---

*Letzte Aktualisierung: Januar 2025*
