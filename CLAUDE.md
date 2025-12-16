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