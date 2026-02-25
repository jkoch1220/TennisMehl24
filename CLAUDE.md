# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server (runs on http://localhost:5173)
- `npm run build` - Build for production (compiles TypeScript and builds with Vite)
- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview production build locally

### Appwrite Scripts
- `npm run setup:appwrite` - Setup Appwrite database fields and collections
- `npm run setup:users` - Setup initial users in Appwrite
- `npm run list:users` - List all users in the system
- `npm run delete:user` - Delete a specific user
- `npm run cleanup:users` - Clean up orphaned users
- `npm run cache:users` - Cache users for performance

### Migration Scripts (in `scripts/`)
- `npx tsx scripts/migriere-universal-preise.ts` - Migriert Universal-Artikel von Brutto auf Netto-Preise
- `npx tsx scripts/migriere-adressen.ts` - Migriert Adressen-Struktur
- Alle Scripts unterstützen `--dry-run` für Vorschau ohne Änderungen

## Architecture

### Overview
TennisMehl24 is a comprehensive business management application built with React + TypeScript for a construction material company specializing in brick meal (Ziegelmehl). The application provides calculation tools, customer management, order processing, and logistics planning.

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend/Database**: Appwrite (BaaS)
- **Routing**: React Router
- **PDF Generation**: jsPDF + jspdf-autotable
- **Icons**: Lucide React
- **Maps/Geocoding**: Custom GeoJSON data for German postal codes

### Key Architecture Patterns

#### Service Layer Pattern
All Appwrite database interactions are abstracted through service classes:
- `src/services/` - Contains all service classes for different entities
- Each service follows consistent patterns for CRUD operations
- Error handling and data transformation centralized in services

#### Authentication & Authorization
- Context-based authentication (`src/contexts/AuthContext.tsx`)
- Role-based permissions system with tool-level access control
- Protected routes with `ProtectedRoute` component
- User permissions cached for performance

#### Type Safety
- Comprehensive TypeScript types in `src/types/`
- Domain-specific types for business entities (orders, customers, projects)
- Type definitions for external libraries (jsPDF extensions)

### Core Business Modules

#### 1. Cost Calculation Tools
- **Fixed Costs Calculator** (`src/components/FixkostenRechner.tsx`)
- **Variable Costs Calculator** (`src/components/VariableKostenRechner.tsx`)
- **Shipping Costs Calculator** (`src/components/SpeditionskostenRechner.tsx`)

#### 2. Customer & Order Management
- **Season Planning** (`src/components/Saisonplanung/`) - Annual customer planning
- **Disposition Planning** (`src/components/DispoPlanung/`) - Order logistics and routing
- **Order Processing** (`src/components/Bestellabwicklung/`) - Complete order lifecycle

#### 3. Geographic & Routing
- **Route Optimization** (`src/utils/routeOptimization.ts`)
- **Postal Code Mapping** (`src/data/plz-*` files) - German postal code to delivery zone mapping
- **Geocoding** (`src/utils/geocoding.ts`)

#### 4. Document Management
- **PDF Generation** with dynamic templates for quotes, orders, delivery notes, invoices
- **Email Templates** stored in Appwrite with placeholder substitution
- **Document Versioning** and history tracking

#### 5. Universal-Artikel System
Universal-Artikel sind Fremdprodukte aus einem externen Katalog (700+ Artikel).

**Preisstruktur:**
- `grosshaendlerPreisNetto` - Einkaufspreis (für DB1-Berechnung)
- `katalogPreisNetto` - Verkaufspreis (wird in Angeboten verwendet)
- `katalogPreisBrutto` - Nur für Referenz, NICHT für Verkauf verwenden

**Position-Markierung:**
- Positionen mit `istUniversalArtikel: true` sind Universal-Artikel
- Fallback-Erkennung: `beschreibung.startsWith('Universal:')`

**Rabattstaffelung bei Auftragserteilung:**
| Nettowert | Nachlass |
|-----------|----------|
| 1.900 - 2.299 € | 10% |
| 2.300 - 2.699 € | 12% |
| 2.700 - 2.999 € | 14% |
| ab 3.000 € | 16% |

**Relevante Dateien:**
- `src/types/universaArtikel.ts` - Universal-Artikel Interface
- `src/services/universaArtikelService.ts` - Import, Suche, CRUD
- `src/components/Stammdaten/UniversaArtikelTab.tsx` - Excel-Import
- `src/components/ProjektVerwaltung/UniversalView.tsx` - Bestellübersicht

### Data Architecture

#### Appwrite Collections
The app uses multiple Appwrite collections for different business entities:
- `saisonkunden` - Annual customer contracts
- `kunden` - Customer base for disposition planning
- `projekte` - Project/order management
- `stammdaten` - Master data (settings, email templates, etc.)
- `konkurrenten` - Competitor tracking
- `lieferungen` - Delivery management
- `anfragen` - Customer inquiries (automated processing)
- `universa_artikel` - Universal-Artikel Katalog (Fremdprodukte)
- `bestellabwicklung_dokumente` - Gespeicherte PDFs (Angebote, ABs, Rechnungen)

#### Geographic Data
- Custom GeoJSON files for German administrative boundaries
- Postal code to delivery zone mapping for pricing calculations
- SVG rendering for interactive Germany map visualization

### Development Guidelines

#### File Organization
- Components organized by feature/module in `src/components/`
- Shared utilities in `src/utils/`
- Type definitions grouped by domain in `src/types/`
- Services mirror the database collections structure

#### State Management
- Local component state with React hooks
- Appwrite real-time subscriptions for live data updates
- Context for global state (auth, permissions)
- Local storage for user preferences and caching

#### Error Handling
- Consistent error boundaries for component-level errors
- Service-layer error transformation and user-friendly messages
- Loading states and error displays in UI components

#### Testing Strategy
- TypeScript strict mode enforced
- ESLint with React-specific rules
- Manual testing protocols for complex business workflows

### Key Configuration

#### Environment Variables
- `VITE_APPWRITE_ENDPOINT` - Appwrite server endpoint
- `VITE_APPWRITE_PROJECT_ID` - Appwrite project identifier
- `VITE_APPWRITE_API_KEY` - API key for server-side operations

#### Auto-Setup
The application includes automatic Appwrite setup (`src/utils/appwriteSetup.ts`) that runs once per session to ensure database schema consistency.

### Email Template System
Dynamic email templates are stored in Appwrite with support for placeholders:
- `{dokumentNummer}` - Document number
- `{kundenname}` - Customer name
- `{kundennummer}` - Customer number
- Templates configurable through admin interface

### PDF Generation Architecture
Custom PDF generation with:
- Dynamic templates for different document types
- Automatic table generation for line items
- Header/footer with company branding
- Version tracking and regeneration capabilities

### Performance Considerations
- User caching for reduced Appwrite queries
- Lazy loading for large datasets
- Debounced search inputs
- Optimized component re-rendering with React.memo

### Automation Features
- Email inquiry processing with n8n workflows (see ANFRAGEN_BLUEPRINT.md)
- Automatic customer data population from existing records
- Route optimization for delivery planning
- Automated document versioning and email sending

### Projektverwaltung Views
Die Projektverwaltung (`src/components/ProjektVerwaltung/`) bietet verschiedene Ansichten:

| ViewMode | Komponente | Beschreibung |
|----------|------------|--------------|
| `kanban` | ProjektVerwaltung.tsx | Drag & Drop Kanban-Board nach Status |
| `angebotsliste` | - | Tabellarische Listenansicht |
| `statistik` | ProjektStatistik.tsx | KPIs und Auswertungen |
| `anfragen` | AnfragenVerarbeitung.tsx | E-Mail-Anfragen bearbeiten |
| `karte` | ProjektKartenansicht.tsx | Geografische Kartenansicht |
| `hydrocourt` | HydrocourtView.tsx | Alle TM-HYC Artikel-Bestellungen |
| `universal` | UniversalView.tsx | Alle Universal-Artikel Bestellungen |

**Spezial-Views (Hydrocourt & Universal):**
- Filtern Positionen aus bestätigten Aufträgen (Status >= AB)
- Gruppierung nach Lieferdatum oder Status
- CSV-Export mit Preis- und Margendetails
- KPI-Header mit Summen und DB1-Berechnung

### Position Interface
Das `Position` Interface (`src/types/projektabwicklung.ts`) ist zentral für alle Dokumente:

```typescript
interface Position {
  id: string;
  artikelnummer?: string;
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;           // Verkaufspreis (Netto)
  einkaufspreis?: number;        // Für DB1-Berechnung
  gesamtpreis: number;           // menge * einzelpreis
  istBedarfsposition?: boolean;  // Wird NICHT in Gesamtsumme eingerechnet
  istUniversalArtikel?: boolean; // Markiert Universal-Katalog-Artikel
}
```

---

## Backend-Integration

### Architektur-Übersicht
Das Projekt verwendet eine **Feature-Flag basierte Backend-Integration**:
- **Netlify Functions** als serverless Backend (aktuell in Produktion)
- **Express Backend** geplant für VPS-Deployment (separates Repo)
- **Appwrite** als BaaS für Datenbank (direkte Client-Calls)

### Backend-Konfiguration
**Datei:** `src/config/backend.ts`

```typescript
// Feature-Check
useBackend(feature: 'claude' | 'diesel' | 'geocoding' | 'pdf' | 'calc' | 'route' | 'appwrite'): boolean

// Backend-URL generieren
getBackendUrl(path: string): string

// Fetch-Wrapper mit Timeout und Error-Handling
backendFetch<T>(path: string, options?: RequestInit): Promise<T>
```

### Umgebungsvariablen
```bash
# Backend aktivieren
VITE_USE_BACKEND=true
VITE_BACKEND_URL=http://localhost:3000  # Dev
VITE_BACKEND_URL=https://api.tennismehl.de  # Prod
VITE_BACKEND_TIMEOUT=30000

# Feature-Flags (einzeln steuerbar)
VITE_BACKEND_CLAUDE=true     # AI-Integration (IMMER Backend wegen API-Key!)
VITE_BACKEND_GEOCODING=true  # Google Geocoding
VITE_BACKEND_DIESEL=true     # Dieselpreis-Caching
VITE_BACKEND_PDF=false       # PDF lokal (schneller)
VITE_BACKEND_CALC=false      # Berechnungen lokal
VITE_BACKEND_ROUTE=false     # Routing lokal
VITE_BACKEND_APPWRITE=false  # Appwrite-Proxy
```

### Backend-Endpunkte

| Endpunkt | Service | Beschreibung |
|----------|---------|--------------|
| `POST /api/ai/chat` | claudeAnfrageService.ts | Claude AI für Anfrage-Parsing |
| `POST /api/ai/chat` | claudeRouteOptimizer.ts | Claude AI für Tourenplanung |
| `GET /api/geo/google/geocode` | geocoding.ts | Einzelne Adresse geocodieren |
| `POST /api/geo/google/batch` | geocoding.ts | Batch-Geocoding |
| `POST /api/geo/nominatim/suggestions` | geocoding.ts | Ortsvorschläge |

### Netlify Functions
**Verzeichnis:** `netlify/functions/`

| Funktion | Beschreibung |
|----------|--------------|
| `email-api.ts` | E-Mail-Konten über IMAP verwalten |
| `email-send.ts` | E-Mails versenden |
| `email-sync.ts` | Kundenanfragen aus Postfach synchronisieren |
| `kalender-ics.ts` | Kalender-Export als ICS |

**Frontend-Aufruf:**
```typescript
fetch('/.netlify/functions/email-send', { method: 'POST', body: JSON.stringify(data) })
```

### Sicherheitskonzept
- **Claude API-Key:** NUR im Backend, nie im Browser sichtbar
- **Google Geocoding API-Key:** Im Backend versteckt
- **Appwrite:** Direkt vom Client (mit Appwrite-eigener Auth)
- **TankerKönig API:** Öffentliche API, direkt vom Client

**Fallback-Warnung bei direktem Claude-Call:**
```
⚠️ Claude API direkt aufgerufen - API-Key im Browser sichtbar!
```

### Services mit Backend-Integration

**Über Backend geroutet:**
- `claudeAnfrageService.ts` - Anfrage-Analyse mit Claude
- `claudeRouteOptimizer.ts` - Tourenplanung mit Claude
- `geocoding.ts` - Google Geocoding

**Direkt vom Frontend:**
- `dieselPreisAPI.ts` - TankerKönig (öffentliche API)
- `dokumentService.ts` - PDF-Generierung mit jsPDF
- Alle Appwrite-Services - Direkte Client-Calls