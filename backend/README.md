# TennisMehl24 Backend

Express-basierter Backend-Server für TennisMehl24.

## Features

- 🤖 **Claude AI** - Routenoptimierung mit KI
- 🗺️ **Routing** - Google Maps & OpenRouteService Integration
- ⛽ **Dieselpreise** - TankerKoenig API Integration
- 📧 **E-Mail** - IMAP/SMTP Integration
- ⏰ **Cron Jobs** - Regelmäßige Aufgaben
- 🔒 **Sicherheit** - Rate Limiting, Helmet, CORS
- 📊 **Logging** - Strukturiertes Logging mit Pino

## Schnellstart

### 1. Installation

```bash
cd backend
npm install
```

### 2. Konfiguration

```bash
cp .env.example .env.local
# Bearbeite .env.local mit deinen API-Keys
```

### 3. Entwicklung

```bash
npm run dev
```

Server läuft auf http://localhost:3001

### 4. Produktion (PM2)

```bash
npm run build
npm run start:pm2
```

### 5. Produktion (Docker)

```bash
docker-compose up -d
```

## API Endpunkte

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/health` | Health Check |
| GET | `/api/health/detailed` | Detaillierter Status |
| POST | `/api/claude/optimize-route` | Routenoptimierung mit KI |
| POST | `/api/claude/parse-inquiry` | E-Mail-Anfrage parsen |
| POST | `/api/routing/calculate` | Route berechnen |
| POST | `/api/routing/geocode` | Adresse geocodieren |
| POST | `/api/routing/batch-geocode` | Batch-Geocoding |
| POST | `/api/fuel/diesel-price` | Dieselpreis holen |
| GET | `/api/fuel/diesel-price?plz=12345` | Dieselpreis (GET) |
| GET | `/api/email/inbox` | E-Mails abrufen |
| POST | `/api/email/send` | E-Mail senden |

## Cron Jobs

| Job | Intervall | Beschreibung |
|-----|-----------|--------------|
| E-Mail-Verarbeitung | Alle 5 Min | Neue Anfragen verarbeiten |
| Health Check | Jede Minute | Speicherüberwachung |
| Cache Cleanup | Täglich 3:00 | Caches leeren |

### Eigene Cron Jobs hinzufügen

Bearbeite `src/jobs/index.ts`:

```typescript
// Jede Minute
cron.schedule('* * * * *', async () => {
  logger.info('Mein Job läuft...');
  // Deine Logik hier
});

// Alle 30 Sekunden
cron.schedule('*/30 * * * * *', async () => {
  // ...
});

// Täglich um 8:00
cron.schedule('0 8 * * *', async () => {
  // ...
});
```

## Deployment auf VPS

### Option 1: PM2 (Empfohlen)

```bash
# Auf dem Server
git clone <repo>
cd TennisMehl24/backend

# Dependencies installieren
npm install

# Build
npm run build

# PM2 installieren (global)
npm install -g pm2

# Starten
pm2 start ecosystem.config.cjs

# Auto-Start bei Boot
pm2 save
pm2 startup
```

### Option 2: Docker

```bash
# Auf dem Server
git clone <repo>
cd TennisMehl24/backend

# .env erstellen
cp .env.example .env.local

# Starten
docker-compose up -d

# Logs
docker-compose logs -f
```

### Option 3: Systemd Service

```bash
# /etc/systemd/system/tennismehl24-backend.service
[Unit]
Description=TennisMehl24 Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/tennismehl24/backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable tennismehl24-backend
sudo systemctl start tennismehl24-backend
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.tennismehl.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Umgebungsvariablen

| Variable | Erforderlich | Beschreibung |
|----------|--------------|--------------|
| `APPWRITE_ENDPOINT` | ✅ | Appwrite Server URL |
| `APPWRITE_PROJECT_ID` | ✅ | Appwrite Projekt ID |
| `APPWRITE_API_KEY` | ✅ | Appwrite Admin API Key |
| `ANTHROPIC_API_KEY` | ✅ | Claude AI API Key |
| `GOOGLE_MAPS_API_KEY` | ⭕ | Google Maps API Key |
| `OPENROUTESERVICE_API_KEY` | ⭕ | ORS API Key |
| `TANKERKOENIG_API_KEY` | ⭕ | Dieselpreis API Key |
| `EMAIL_USER` | ⭕ | E-Mail Benutzername |
| `EMAIL_PASSWORD` | ⭕ | E-Mail Passwort |
| `CRON_SECRET` | ✅ | Secret für Cron-Aufrufe |

## Monitoring

### PM2 Monitoring

```bash
pm2 monit
pm2 logs tennismehl24-backend
pm2 status
```

### Health Check

```bash
curl http://localhost:3001/api/health/detailed
```

## Troubleshooting

### Server startet nicht

```bash
# Logs prüfen
pm2 logs tennismehl24-backend --lines 100

# Oder Docker
docker-compose logs -f
```

### Port bereits belegt

```bash
# Prozess finden
lsof -i :3001

# Oder anderen Port verwenden
PORT=3002 npm run start
```

### Memory Leak

```bash
# PM2 startet automatisch neu bei 500MB
# Anpassen in ecosystem.config.cjs:
max_memory_restart: '1G'
```
