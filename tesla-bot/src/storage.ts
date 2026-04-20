import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import type { SeenVehicle } from './types.js';

const FILE = join(config.dataDir, 'seen-vehicles.json');

export async function loadSeen(): Promise<Map<string, SeenVehicle>> {
  try {
    const raw = await readFile(FILE, 'utf8');
    const arr = JSON.parse(raw) as SeenVehicle[];
    return new Map(arr.map((v) => [v.vin, v]));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    throw err;
  }
}

export async function saveSeen(seen: Map<string, SeenVehicle>): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  const arr = Array.from(seen.values());
  await writeFile(FILE, JSON.stringify(arr, null, 2), 'utf8');
}
