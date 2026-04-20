# Tesla Inventory Bot

Crawlt regelmäßig die Tesla Inventory-Seite und schickt bei neu eintreffenden
Fahrzeugen eine Benachrichtigung via **Discord** und/oder **Telegram**.

Basierend auf der URL:
```
https://www.tesla.com/de_DE/inventory/new/my?arrangeby=plh&zip=60313&PaymentType=cash
```

## Features
- Pollt die offizielle Tesla Inventory JSON-API (`/inventory/api/v4/inventory-results`)
- Persistiert gesehene VINs auf Disk → erkennt nur wirklich neue Fahrzeuge
- Beim ersten Lauf wird nur die Baseline gespeichert (keine Spam-Notification)
- Unterstützt Discord-Webhook und Telegram-Bot parallel
- Konfigurierbar über `.env` (Modell, PLZ, Zahlungsart, Intervall)

## Quickstart (lokal)

```bash
cd tesla-bot
cp .env.example .env
# .env anpassen (mind. Discord ODER Telegram konfigurieren)
npm install
npm run once          # einmaliger Testlauf
npm run dev           # Dauerbetrieb mit tsx watch
```

## Notification-Kanäle einrichten

### Discord
1. Server öffnen → Server-Einstellungen → Integrationen → Webhooks → *Neuer Webhook*
2. Kanal wählen, Webhook-URL kopieren
3. In `.env`: `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`

### Telegram
1. In Telegram mit `@BotFather` chatten → `/newbot` → Token erhalten
2. Eigenen Bot in Telegram suchen und `/start` schicken
3. Chat-ID abrufen: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   → `result[0].message.chat.id`
4. In `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_CHAT_ID=123456789
   ```

## Deployment auf Hostinger VPS

Voraussetzung: VPS mit SSH-Zugang und Root-Rechten (z.B. KVM 1 von Hostinger),
Ubuntu 22.04 oder Debian 12.

### 1. Node.js 20 installieren
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

### 2. Repo klonen und Bot bauen
```bash
sudo mkdir -p /opt/tesla-bot
sudo chown "$USER" /opt/tesla-bot
git clone <repo-url> /opt/tesla-bot/repo
cd /opt/tesla-bot/repo/tesla-bot
npm ci
npm run build
cp .env.example .env
nano .env                 # Werte eintragen
```

In `.env` das Datenverzeichnis auf einen persistenten Pfad setzen:
```
DATA_DIR=/var/lib/tesla-bot
```

```bash
sudo mkdir -p /var/lib/tesla-bot
sudo chown "$USER" /var/lib/tesla-bot
```

### 3. systemd-Service einrichten
```bash
sudo tee /etc/systemd/system/tesla-bot.service > /dev/null <<'EOF'
[Unit]
Description=Tesla Inventory Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/tesla-bot/repo/tesla-bot
EnvironmentFile=/opt/tesla-bot/repo/tesla-bot/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=30
StandardOutput=append:/var/log/tesla-bot.log
StandardError=append:/var/log/tesla-bot.log

[Install]
WantedBy=multi-user.target
EOF

sudo touch /var/log/tesla-bot.log && sudo chown ubuntu /var/log/tesla-bot.log
sudo systemctl daemon-reload
sudo systemctl enable --now tesla-bot
sudo systemctl status tesla-bot
```

> `User=ubuntu` ggf. durch deinen Linux-User ersetzen.

### 4. Logs ansehen
```bash
sudo journalctl -u tesla-bot -f
# oder
tail -f /var/log/tesla-bot.log
```

### 5. Updates einspielen
```bash
cd /opt/tesla-bot/repo
git pull
cd tesla-bot
npm ci && npm run build
sudo systemctl restart tesla-bot
```

## Konfiguration (`.env`)

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `TESLA_MODEL` | `my` | `my` = Model Y, `m3` = Model 3, `ms` = Model S, `mx` = Model X |
| `TESLA_CONDITION` | `new` | `new` oder `used` |
| `TESLA_MARKET` | `DE` | Ländercode |
| `TESLA_LANGUAGE` | `de` | Sprachcode |
| `TESLA_ZIP` | `60313` | PLZ für Standort-Suche |
| `TESLA_ARRANGEBY` | `Price` | Sortierung |
| `TESLA_ORDER` | `asc` | `asc` / `desc` |
| `TESLA_PAYMENT_TYPE` | `cash` | Zahlungsart |
| `POLL_INTERVAL_MINUTES` | `5` | Abfrage-Intervall in Minuten |
| `DATA_DIR` | `./data` | Pfad für `seen-vehicles.json` |
| `DISCORD_WEBHOOK_URL` | – | Discord Webhook |
| `TELEGRAM_BOT_TOKEN` | – | Telegram Bot-Token |
| `TELEGRAM_CHAT_ID` | – | Telegram Chat-ID |

## Hinweise

- Der Bot nutzt die offizielle Tesla JSON-API, die auch die Website verwendet.
  Tesla hat kein offiziell dokumentiertes Rate-Limit, 5-Minuten-Intervall ist
  unauffällig. Bei 429-Fehlern einfach den Intervall erhöhen.
- Beim **ersten Lauf** werden alle aktuell verfügbaren Fahrzeuge als Baseline
  gespeichert, es gibt keine Flut an Notifications.
- Gelöschte Fahrzeuge (Verkauf) werden aktuell nicht gemeldet, nur **neue**.
  Falls gewünscht, einfach `notifiers.ts` erweitern.
