import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  tesla: {
    model: optional('TESLA_MODEL', 'my'),
    condition: optional('TESLA_CONDITION', 'new'),
    market: optional('TESLA_MARKET', 'DE'),
    language: optional('TESLA_LANGUAGE', 'de'),
    zip: optional('TESLA_ZIP', '60313'),
    arrangeby: optional('TESLA_ARRANGEBY', 'Price'),
    order: optional('TESLA_ORDER', 'asc'),
    paymentType: optional('TESLA_PAYMENT_TYPE', 'cash'),
  },
  pollIntervalMinutes: parseInt(optional('POLL_INTERVAL_MINUTES', '5'), 10),
  dataDir: optional('DATA_DIR', './data'),
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
};

export function assertNotifiersConfigured(): void {
  const hasDiscord = !!config.discord.webhookUrl;
  const hasTelegram = !!(config.telegram.botToken && config.telegram.chatId);
  if (!hasDiscord && !hasTelegram) {
    throw new Error(
      'Kein Notifier konfiguriert. Setze DISCORD_WEBHOOK_URL oder TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env',
    );
  }
}
