import { config } from './config.js';
import { vehicleSummary, vehicleUrl } from './crawler.js';
import type { TeslaVehicle } from './types.js';

function formatPrice(price?: number): string {
  if (typeof price !== 'number') return '—';
  return price.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function formatVehicleText(v: TeslaVehicle): string {
  const price = formatPrice(v.TotalPrice ?? v.InventoryPrice ?? v.PurchasePrice);
  const summary = vehicleSummary(v);
  const location = v.City ? ` – ${v.City}` : '';
  const demo = v.IsDemo ? ' [DEMO]' : '';
  const vin = v.VIN ? ` VIN: ${v.VIN}` : '';
  return `${summary}${demo}${location}\nPreis: ${price}${vin}`;
}

async function sendDiscord(vehicles: TeslaVehicle[]): Promise<void> {
  if (!config.discord.webhookUrl) return;

  const embeds = vehicles.slice(0, 10).map((v) => ({
    title: `${v.TRIMNAME?.[0] ?? v.TRIM?.[0] ?? 'Tesla'} – ${formatPrice(
      v.TotalPrice ?? v.InventoryPrice ?? v.PurchasePrice,
    )}`,
    description: vehicleSummary(v),
    url: vehicleUrl(v),
    fields: [
      ...(v.VIN ? [{ name: 'VIN', value: v.VIN, inline: true }] : []),
      ...(v.City ? [{ name: 'Standort', value: v.City, inline: true }] : []),
      ...(v.IsDemo ? [{ name: 'Typ', value: 'Demo', inline: true }] : []),
    ],
    color: 0xcc0000,
  }));

  const body = {
    content: `🚗 **${vehicles.length} neue${vehicles.length === 1 ? 's' : ''} Fahrzeug${
      vehicles.length === 1 ? '' : 'e'
    }** im Tesla Inventory!`,
    embeds,
  };

  const res = await fetch(config.discord.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[Discord] Fehler ${res.status}: ${await res.text()}`);
  }
}

async function sendTelegram(vehicles: TeslaVehicle[]): Promise<void> {
  if (!config.telegram.botToken || !config.telegram.chatId) return;

  const header = `🚗 *${vehicles.length} neue${vehicles.length === 1 ? 's' : ''} Fahrzeug${
    vehicles.length === 1 ? '' : 'e'
  }* im Tesla Inventory`;

  const lines = vehicles.slice(0, 15).map((v) => {
    const title = v.TRIMNAME?.[0] ?? v.TRIM?.[0] ?? 'Tesla';
    const price = formatPrice(v.TotalPrice ?? v.InventoryPrice ?? v.PurchasePrice);
    const url = vehicleUrl(v);
    const details = formatVehicleText(v).replace(/\n/g, ' — ');
    return `• [${escapeMd(title)} – ${escapeMd(price)}](${url})\n  ${escapeMd(details)}`;
  });

  const text = `${header}\n\n${lines.join('\n\n')}`;

  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegram.chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error(`[Telegram] Fehler ${res.status}: ${await res.text()}`);
  }
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[\]])/g, '\\$1');
}

export async function notifyNewVehicles(vehicles: TeslaVehicle[]): Promise<void> {
  if (vehicles.length === 0) return;
  await Promise.allSettled([sendDiscord(vehicles), sendTelegram(vehicles)]);
}

export async function notifyStartup(message: string): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (config.discord.webhookUrl) {
    tasks.push(
      fetch(config.discord.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `ℹ️ ${message}` }),
      }),
    );
  }
  if (config.telegram.botToken && config.telegram.chatId) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: `ℹ️ ${message}` }),
      }),
    );
  }
  await Promise.allSettled(tasks);
}
