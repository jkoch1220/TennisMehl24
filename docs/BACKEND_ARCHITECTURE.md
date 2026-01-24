# Backend-Architektur Konzept für TennisMehl24

## Inhaltsverzeichnis
1. [Executive Summary](#executive-summary)
2. [Kritische Sicherheitsprobleme](#kritische-sicherheitsprobleme)
3. [Backend-Architektur Übersicht](#backend-architektur-übersicht)
4. [Modul-Struktur](#modul-struktur)
5. [Implementierungsdetails](#implementierungsdetails)
6. [Datenbankzugriff](#datenbankzugriff)
7. [API-Endpunkte](#api-endpunkte)
8. [Deployment-Optionen](#deployment-optionen)
9. [Migrationsstrategie](#migrationsstrategie)

---

## Executive Summary

Die aktuelle TennisMehl24-Anwendung hat **kritische Sicherheitslücken**, weil sensible API-Keys und Geschäftslogik im Client-Code exponiert sind. Ein dediziertes Backend ist **dringend erforderlich** um:

1. **API-Keys zu schützen** (Anthropic, Google Maps, Appwrite Admin)
2. **Sensitive Geschäftslogik** serverseitig auszuführen
3. **Kosten zu kontrollieren** (Rate Limiting, Caching)
4. **Audit-Logging** für compliance zu implementieren
5. **Zentrale Validierung** und Fehlerbehandlung

---

## Kritische Sicherheitsprobleme

### 🔴 P1 - KRITISCH (Sofort beheben)

| Problem | Datei | Risiko |
|---------|-------|--------|
| **Anthropic API Key im Client** | `src/services/claudeRouteOptimizer.ts:210,248` | API-Key kann gestohlen und missbraucht werden |
| **Appwrite API Key im Client** | `src/utils/appwriteSetup.ts:59-61` | Voller DB-Zugriff für Angreifer |
| **Hardcoded Passwort-Hash** | `src/utils/auth.ts:1-4` | Passwort "TennisMehl2025!" ist extrahierbar |
| **DB-Schema-Setup im Client** | `src/utils/appwriteSetup.ts` | Admin-Operationen sollten nie client-seitig sein |

### 🟠 P2 - HOCH (Diese Woche)

| Problem | Datei | Risiko |
|---------|-------|--------|
| **Google Maps API Key** | `src/utils/routeCalculation.ts:17` | Kosten-Explosion möglich |
| **OpenRouteService API Key** | `src/utils/routeCalculation.ts:18` | API-Missbrauch |
| **TankerKoenig API Key** | `src/utils/dieselPreisAPI.ts:8` | Rate-Limit Überschreitung |

### 🟡 P3 - MITTEL (Diesen Monat)

- Keine Document-Level Access Control in Appwrite
- Permissions-Cache ohne Refresh-Mechanismus
- Fehlende Input-Validierung
- Kein Audit-Logging

---

## Backend-Architektur Übersicht

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                               │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Kalkulation  │  │   Kunden     │  │   Projekte   │  │  Dokumente   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                              │                                             │
└──────────────────────────────┼─────────────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js/Express)                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        API Gateway / Router                          │   │
│  │  • Rate Limiting  • Authentication  • Validation  • Audit Logging   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬────────────┐   │
│  │   Claude    │   Routing   │   Email     │  Documents  │   Admin    │   │
│  │   Service   │   Service   │   Service   │   Service   │   Service  │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴────────────┘   │
│                               │                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Shared Services Layer                           │   │
│  │  • Caching (Redis)  • Logging  • Error Handling  • Metrics          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Appwrite    │      │  Anthropic    │      │  Google Maps  │
│   Database    │      │   Claude AI   │      │     APIs      │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## Modul-Struktur

### Empfohlene Backend-Ordnerstruktur

```
backend/
├── src/
│   ├── index.ts                    # Server-Einstiegspunkt
│   ├── config/
│   │   ├── environment.ts          # Env-Variablen Validierung
│   │   ├── appwrite.ts             # Appwrite Admin Client
│   │   └── cors.ts                 # CORS Konfiguration
│   │
│   ├── middleware/
│   │   ├── auth.ts                 # JWT/Session Validierung
│   │   ├── rateLimiter.ts          # Rate Limiting pro Endpunkt
│   │   ├── validator.ts            # Input Validierung
│   │   ├── errorHandler.ts         # Zentrale Fehlerbehandlung
│   │   └── auditLogger.ts          # Audit Trail
│   │
│   ├── routes/
│   │   ├── index.ts                # Route-Registrierung
│   │   ├── claude.routes.ts        # /api/claude/*
│   │   ├── routing.routes.ts       # /api/routing/*
│   │   ├── geocoding.routes.ts     # /api/geocoding/*
│   │   ├── email.routes.ts         # /api/email/*
│   │   ├── documents.routes.ts     # /api/documents/*
│   │   ├── fuel.routes.ts          # /api/fuel/*
│   │   └── admin.routes.ts         # /api/admin/*
│   │
│   ├── services/
│   │   ├── claude/
│   │   │   ├── routeOptimizer.ts   # Claude-basierte Routenoptimierung
│   │   │   ├── inquiryParser.ts    # Anfragen-Parsing mit Claude
│   │   │   └── prompts.ts          # Prompt-Templates
│   │   │
│   │   ├── routing/
│   │   │   ├── googleMaps.ts       # Google Maps Integration
│   │   │   ├── openRouteService.ts # ORS Integration
│   │   │   └── optimizer.ts        # Routenberechnung
│   │   │
│   │   ├── geocoding/
│   │   │   ├── nominatim.ts        # OSM Geocoding
│   │   │   ├── google.ts           # Google Geocoding
│   │   │   └── cache.ts            # Geocoding Cache
│   │   │
│   │   ├── email/
│   │   │   ├── imap.ts             # IMAP Verbindung
│   │   │   ├── smtp.ts             # SMTP Versand
│   │   │   └── templates.ts        # Template-Verarbeitung
│   │   │
│   │   ├── fuel/
│   │   │   └── tankerkoenig.ts     # Dieselpreis-API
│   │   │
│   │   ├── documents/
│   │   │   ├── pdfGenerator.ts     # PDF-Generierung (optional)
│   │   │   └── storage.ts          # Dokument-Speicherung
│   │   │
│   │   └── appwrite/
│   │       ├── client.ts           # Appwrite Admin Client
│   │       ├── users.ts            # User-Verwaltung
│   │       └── collections.ts      # Collection-Setup
│   │
│   ├── types/
│   │   ├── api.ts                  # API Request/Response Types
│   │   ├── claude.ts               # Claude-spezifische Types
│   │   └── routing.ts              # Routing Types
│   │
│   └── utils/
│       ├── logger.ts               # Winston/Pino Logger
│       ├── cache.ts                # Redis Cache Wrapper
│       └── validation.ts           # Zod Schemas
│
├── scripts/
│   ├── setup-database.ts           # Einmaliges DB-Setup (NICHT im Client!)
│   └── migrate.ts                  # Migrations-Scripts
│
├── tests/
│   └── ...
│
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## Implementierungsdetails

### 1. Claude Service (KRITISCH)

**Aktuell (UNSICHER):**
```typescript
// src/services/claudeRouteOptimizer.ts:210
const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;  // ❌ Im Browser exponiert!
```

**Backend-Lösung:**
```typescript
// backend/src/services/claude/routeOptimizer.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,  // ✅ Nur auf Server
});

export async function optimizeRoute(
  deliveries: Delivery[],
  constraints: RouteConstraints
): Promise<OptimizedRoute> {
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: buildRoutePrompt(deliveries, constraints)
    }]
  });

  return parseRouteResponse(response);
}
```

**API-Endpunkt:**
```typescript
// backend/src/routes/claude.routes.ts
router.post('/optimize-route',
  authenticate,
  rateLimit({ windowMs: 60000, max: 10 }),
  validateBody(routeOptimizationSchema),
  async (req, res) => {
    const result = await claudeService.optimizeRoute(
      req.body.deliveries,
      req.body.constraints
    );

    auditLog('ROUTE_OPTIMIZATION', req.user.id, {
      deliveryCount: req.body.deliveries.length
    });

    res.json(result);
  }
);
```

### 2. Routing/Geocoding Service

**Backend-Lösung:**
```typescript
// backend/src/services/routing/googleMaps.ts
import { Client } from '@googlemaps/google-maps-services-js';

const client = new Client({});

export async function calculateRoute(
  origin: Coordinates,
  destinations: Coordinates[],
  options: RouteOptions
): Promise<RouteResult> {
  const response = await client.directions({
    params: {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destinations[destinations.length-1].lat},${destinations[destinations.length-1].lng}`,
      waypoints: destinations.slice(0, -1).map(d => `${d.lat},${d.lng}`),
      optimize: options.optimize,
      key: process.env.GOOGLE_MAPS_API_KEY,  // ✅ Nur auf Server
    }
  });

  return transformResponse(response.data);
}
```

**Mit Caching:**
```typescript
// backend/src/services/geocoding/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const CACHE_TTL = 86400 * 30; // 30 Tage

export async function geocodeWithCache(
  address: string
): Promise<Coordinates | null> {
  const cacheKey = `geocode:${hashAddress(address)}`;

  // Cache prüfen
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // API aufrufen
  const result = await nominatimGeocode(address);

  // Cache speichern
  if (result) {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  }

  return result;
}
```

### 3. Fuel Price Service

```typescript
// backend/src/services/fuel/tankerkoenig.ts
const TANKERKOENIG_API_KEY = process.env.TANKERKOENIG_API_KEY;
const CACHE_TTL = 3600; // 1 Stunde

export async function getCurrentDieselPrice(): Promise<FuelPriceResult> {
  const cached = await cache.get('diesel-price');
  if (cached) return cached;

  const response = await fetch(
    `https://creativecommons.tankerkoenig.de/json/prices.php?` +
    `ids=${STATION_IDS.join(',')}&apikey=${TANKERKOENIG_API_KEY}`
  );

  const result = await response.json();
  await cache.set('diesel-price', result, CACHE_TTL);

  return result;
}
```

### 4. Authentication Middleware

```typescript
// backend/src/middleware/auth.ts
import { Client, Account } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID);

export async function authenticate(req, res, next) {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Appwrite Session validieren
    const sessionClient = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setSession(sessionToken);

    const account = new Account(sessionClient);
    const user = await account.get();

    req.user = user;
    req.appwriteClient = sessionClient;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
```

### 5. Rate Limiting

```typescript
// backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Verschiedene Limits für verschiedene Endpunkte
export const claudeRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 1000,      // 1 Minute
  max: 10,                   // 10 Anfragen pro Minute
  message: { error: 'Zu viele KI-Anfragen. Bitte warten.' }
});

export const geocodingRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Geocoding-Limit erreicht.' }
});

export const generalRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Rate limit erreicht.' }
});
```

### 6. Audit Logging

```typescript
// backend/src/middleware/auditLogger.ts
interface AuditEntry {
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ip: string;
  userAgent: string;
}

export async function auditLog(
  action: string,
  userId: string,
  details: Record<string, any>,
  req: Request
) {
  const entry: AuditEntry = {
    timestamp: new Date(),
    userId,
    action,
    resource: req.path,
    details,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || 'unknown'
  };

  // In Appwrite Collection speichern
  await databases.createDocument(
    DATABASE_ID,
    'audit_log',
    ID.unique(),
    entry
  );

  // Auch ins Log schreiben
  logger.info('AUDIT', entry);
}
```

---

## API-Endpunkte

### Übersicht aller Backend-Endpunkte

```
POST   /api/claude/optimize-route         # Routen-Optimierung mit KI
POST   /api/claude/parse-inquiry          # Anfragen-Parsing mit KI

GET    /api/routing/calculate             # Routenberechnung (Google/ORS)
POST   /api/routing/matrix                # Distanz-Matrix berechnen

POST   /api/geocoding/address             # Adresse → Koordinaten
POST   /api/geocoding/batch               # Batch-Geocoding
GET    /api/geocoding/reverse             # Koordinaten → Adresse

GET    /api/fuel/diesel-price             # Aktueller Dieselpreis
GET    /api/fuel/price-history            # Preisverlauf

POST   /api/email/send                    # E-Mail versenden
GET    /api/email/inbox                   # Posteingang abrufen
POST   /api/email/parse                   # E-Mail parsen

POST   /api/admin/setup-database          # DB-Schema Setup (einmalig)
GET    /api/admin/health                  # Health Check
GET    /api/admin/metrics                 # Nutzungsstatistiken
```

### OpenAPI Schema (Auszug)

```yaml
openapi: 3.0.0
info:
  title: TennisMehl24 Backend API
  version: 1.0.0

paths:
  /api/claude/optimize-route:
    post:
      summary: Optimiert Lieferrouten mit Claude AI
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - deliveries
                - startLocation
              properties:
                deliveries:
                  type: array
                  items:
                    $ref: '#/components/schemas/Delivery'
                startLocation:
                  $ref: '#/components/schemas/Coordinates'
                constraints:
                  $ref: '#/components/schemas/RouteConstraints'
      responses:
        '200':
          description: Optimierte Route
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OptimizedRoute'
        '429':
          description: Rate Limit erreicht
        '401':
          description: Nicht authentifiziert

  /api/geocoding/address:
    post:
      summary: Geocodiert eine Adresse
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - address
              properties:
                address:
                  type: string
                  example: "Musterstraße 123, 12345 Berlin"
      responses:
        '200':
          description: Koordinaten
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GeocodingResult'
```

---

## Datenbankzugriff

### Appwrite Admin vs. User Client

```typescript
// backend/src/services/appwrite/client.ts

// ADMIN Client - NUR für administrative Aufgaben
// z.B. Schema-Setup, User-Verwaltung, Collection-Erstellung
export const adminClient = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);  // ⚠️ Nur auf Server!

export const adminDatabases = new Databases(adminClient);
export const adminUsers = new Users(adminClient);

// USER Client - Für benutzerspezifische Anfragen
// Nutzt die Session des eingeloggten Users
export function getUserClient(sessionToken: string): Client {
  return new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setSession(sessionToken);
}
```

### Schema-Setup (Migration Script)

```typescript
// backend/scripts/setup-database.ts
// ⚠️ Dieses Script wird EINMAL bei Deployment ausgeführt, NICHT im Client!

import { adminDatabases, adminClient } from '../src/services/appwrite/client';

async function setupCollections() {
  console.log('🔧 Setting up database schema...');

  // Audit Log Collection erstellen
  try {
    await adminDatabases.createCollection(
      DATABASE_ID,
      'audit_log',
      'Audit Log',
      [
        Permission.read(Role.team('admin')),
        Permission.create(Role.users()),
      ]
    );

    await adminDatabases.createStringAttribute(
      DATABASE_ID, 'audit_log', 'userId', 255, true
    );
    await adminDatabases.createStringAttribute(
      DATABASE_ID, 'audit_log', 'action', 100, true
    );
    // ... weitere Attribute

    console.log('✅ audit_log collection created');
  } catch (e) {
    if (e.code === 409) {
      console.log('ℹ️ audit_log collection already exists');
    } else {
      throw e;
    }
  }

  // Weitere Collections...
}

setupCollections()
  .then(() => console.log('✅ Database setup complete'))
  .catch(console.error);
```

---

## Deployment-Optionen

### Option 1: Netlify Functions (Empfohlen für Start)

**Vorteile:**
- Bereits teilweise implementiert (Email-API)
- Kein Server-Management
- Automatisches Scaling
- Kostenlos für moderate Nutzung

**Struktur:**
```
netlify/
├── functions/
│   ├── claude-optimize.ts
│   ├── geocoding.ts
│   ├── routing.ts
│   ├── fuel-price.ts
│   └── email-api.ts      # Bereits vorhanden
```

**Beispiel Netlify Function:**
```typescript
// netlify/functions/claude-optimize.ts
import { Handler } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const handler: Handler = async (event) => {
  // CORS Headers
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }

  // Auth prüfen
  const session = event.headers.authorization;
  if (!await validateSession(session)) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const { deliveries, constraints } = JSON.parse(event.body);

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(deliveries) }]
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(parseResponse(response))
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
```

### Option 2: Docker Container (Empfohlen für Produktion)

**Vorteile:**
- Volle Kontrolle
- Bessere Performance
- Redis für Caching möglich
- Komplexere Logik möglich

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - APPWRITE_ENDPOINT=${APPWRITE_ENDPOINT}
      - APPWRITE_PROJECT_ID=${APPWRITE_PROJECT_ID}
      - APPWRITE_API_KEY=${APPWRITE_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### Option 3: Hybrid (Empfohlen)

Kombination aus Netlify Functions und eigenem Server:

| Funktion | Deployment | Grund |
|----------|------------|-------|
| Claude AI | Netlify Function | Seltene Nutzung, Serverless passt |
| Geocoding | Eigener Server + Redis | Häufige Nutzung, Caching wichtig |
| Email | Netlify Function | Bereits implementiert |
| Diesel-Preis | Netlify Function | Einfach, gecacht |
| DB-Schema | Deployment Script | Einmalig bei Release |

---

## Migrationsstrategie

### Phase 1: Kritische Sicherheit (1-2 Tage)

1. **Anthropic API Key entfernen**
   - Netlify Function erstellen: `netlify/functions/claude-optimize.ts`
   - Frontend ändern: API-Calls zu `/.netlify/functions/claude-optimize`
   - `VITE_ANTHROPIC_API_KEY` aus `.env` entfernen

2. **Appwrite API Key schützen**
   - `setupAppwriteFields()` aus Client-Code entfernen
   - Deployment-Script erstellen: `scripts/setup-database.ts`
   - `VITE_APPWRITE_API_KEY` aus `.env` entfernen

3. **Hardcoded Passwort entfernen**
   - `src/utils/auth.ts` löschen
   - Nur Appwrite-Authentifizierung verwenden

### Phase 2: Weitere APIs (3-5 Tage)

4. **Google Maps/OpenRouteService**
   - Netlify Function: `netlify/functions/routing.ts`
   - Geocoding-Cache implementieren

5. **TankerKoenig**
   - Netlify Function: `netlify/functions/fuel-price.ts`
   - 1h Cache implementieren

### Phase 3: Optimierung (Optional, 1 Woche)

6. **Redis Caching** für häufige Anfragen
7. **Audit Logging** implementieren
8. **Rate Limiting** per User
9. **Metriken/Monitoring** (Prometheus/Grafana)

---

## Frontend-Änderungen

### API Client erstellen

```typescript
// src/services/api/backendClient.ts
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/.netlify/functions';

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const session = await account.getSession('current');

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.$id}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

export const backendApi = {
  claude: {
    optimizeRoute: (data: RouteOptimizationRequest) =>
      fetchWithAuth<OptimizedRoute>('/claude-optimize', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  geocoding: {
    geocode: (address: string) =>
      fetchWithAuth<GeocodingResult>('/geocoding', {
        method: 'POST',
        body: JSON.stringify({ address }),
      }),
  },

  fuel: {
    getDieselPrice: () =>
      fetchWithAuth<FuelPriceResult>('/fuel-price'),
  },
};
```

### Alte Services ersetzen

```typescript
// Vorher (UNSICHER):
import { claudeRouteOptimizer } from './claudeRouteOptimizer';
const result = await claudeRouteOptimizer.optimize(deliveries);

// Nachher (SICHER):
import { backendApi } from './api/backendClient';
const result = await backendApi.claude.optimizeRoute({ deliveries });
```

---

## Zusammenfassung

### Was das Backend übernehmen sollte

| Funktion | Grund | Priorität |
|----------|-------|-----------|
| Claude AI Calls | API-Key Schutz, Kosten | 🔴 KRITISCH |
| DB Schema Setup | Admin-Only Operation | 🔴 KRITISCH |
| Google Maps API | API-Key Schutz | 🟠 HOCH |
| OpenRouteService API | API-Key Schutz | 🟠 HOCH |
| TankerKoenig API | Rate Limiting | 🟠 HOCH |
| Geocoding Cache | Performance | 🟡 MITTEL |
| Audit Logging | Compliance | 🟡 MITTEL |
| PDF-Generierung | Optional - kann Client bleiben | ⚪ NIEDRIG |
| Kalkulationen | Kann Client bleiben | ⚪ NIEDRIG |

### Was Client-seitig bleiben kann

- **Kalkulationen** (Fixkosten, Variable Kosten, Frachten) - keine sensiblen Daten
- **PDF-Generierung** - reduziert Server-Last
- **UI-Logik** - gehört zum Frontend
- **Lokales Caching** - für bessere UX
- **Appwrite Queries** (mit User-Session) - Appwrite regelt Berechtigungen

### Nächste Schritte

1. ☐ Netlify Function für Claude erstellen
2. ☐ Appwrite API Key aus Client entfernen
3. ☐ Hardcoded Passwort-Hash entfernen
4. ☐ Routing-APIs ins Backend verschieben
5. ☐ Frontend API Client implementieren
6. ☐ Testen und deployen

---

## Anhang: Vollständige Datei-Referenz

### Betroffene Client-Dateien

| Datei | Problem | Aktion |
|-------|---------|--------|
| `src/services/claudeRouteOptimizer.ts:210,248` | Anthropic API Key | Zu Backend verschieben |
| `src/utils/appwriteSetup.ts:59-61` | Appwrite API Key | Zu Deployment Script |
| `src/utils/auth.ts:1-4` | Hardcoded Password | Löschen |
| `src/utils/routeCalculation.ts:17-18` | Google/ORS Keys | Zu Backend |
| `src/utils/dieselPreisAPI.ts:8` | TankerKoenig Key | Zu Backend |
| `src/services/anfrageParserService.ts` | Claude Integration | Prüfen |

### Zu erstellende Backend-Dateien

```
netlify/functions/
├── claude-optimize.ts      # NEU
├── claude-parse-inquiry.ts # NEU
├── geocoding.ts            # NEU
├── routing.ts              # NEU
├── fuel-price.ts           # NEU
└── email-api.ts            # Bereits vorhanden

scripts/
└── setup-database.ts       # NEU - aus appwriteSetup.ts extrahieren
```
