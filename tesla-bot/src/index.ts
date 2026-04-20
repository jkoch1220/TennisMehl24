import { assertNotifiersConfigured, config } from './config.js';
import { fetchInventory } from './crawler.js';
import { notifyNewVehicles, notifyStartup } from './notifiers.js';
import { loadSeen, saveSeen } from './storage.js';
import type { SeenVehicle, TeslaVehicle } from './types.js';

const RUN_ONCE = process.argv.includes('--once');

function priceOf(v: TeslaVehicle): number {
  return v.TotalPrice ?? v.InventoryPrice ?? v.PurchasePrice ?? 0;
}

async function runOnce(): Promise<void> {
  const now = new Date().toISOString();
  const seen = await loadSeen();
  const isFirstRun = seen.size === 0;

  let vehicles: TeslaVehicle[];
  try {
    vehicles = await fetchInventory();
  } catch (err) {
    console.error(`[${now}] Fehler beim Abruf der Tesla-API:`, err);
    return;
  }

  const newOnes: TeslaVehicle[] = [];
  for (const v of vehicles) {
    if (!v.VIN) continue;
    const existing = seen.get(v.VIN);
    if (!existing) {
      newOnes.push(v);
      const rec: SeenVehicle = {
        vin: v.VIN,
        price: priceOf(v),
        firstSeen: now,
        lastSeen: now,
      };
      seen.set(v.VIN, rec);
    } else {
      existing.lastSeen = now;
      existing.price = priceOf(v);
    }
  }

  await saveSeen(seen);

  console.log(
    `[${now}] Inventory: ${vehicles.length} Fahrzeuge · ${newOnes.length} neu · ${seen.size} in Datenbank`,
  );

  if (newOnes.length > 0) {
    if (isFirstRun) {
      console.log(
        '→ Erster Lauf: Baseline gespeichert, keine Notification für initiale Fahrzeuge.',
      );
    } else {
      await notifyNewVehicles(newOnes);
    }
  }
}

async function main(): Promise<void> {
  assertNotifiersConfigured();

  console.log('Tesla Inventory Bot gestartet');
  console.log(
    `Model=${config.tesla.model} Market=${config.tesla.market} Zip=${config.tesla.zip}`,
  );
  console.log(`Intervall: ${config.pollIntervalMinutes} Minuten · Data: ${config.dataDir}`);

  if (RUN_ONCE) {
    await runOnce();
    return;
  }

  await notifyStartup(
    `Tesla-Bot gestartet (${config.tesla.model.toUpperCase()}, ${config.tesla.zip}, alle ${config.pollIntervalMinutes} min)`,
  ).catch(() => {});

  await runOnce();
  const intervalMs = config.pollIntervalMinutes * 60 * 1000;
  setInterval(() => {
    runOnce().catch((err) => console.error('Unerwarteter Fehler:', err));
  }, intervalMs);
}

main().catch((err) => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
