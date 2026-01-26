/**
 * Umgebungsvariablen Konfiguration
 *
 * Alle Umgebungsvariablen werden hier zentral validiert und exportiert.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env Dateien laden
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Hilfsfunktion für Pflichtfelder
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.warn(`⚠️  Umgebungsvariable ${name} ist nicht gesetzt`);
    return '';
  }
  return value;
}

// Hilfsfunktion für optionale Felder
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // Server
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '3001')),

  // CORS
  CORS_ORIGINS: optionalEnv('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000,https://tennismehl24.netlify.app').split(','),

  // Appwrite
  APPWRITE_ENDPOINT: requireEnv('APPWRITE_ENDPOINT') || 'https://cloud.appwrite.io/v1',
  APPWRITE_PROJECT_ID: requireEnv('APPWRITE_PROJECT_ID'),
  APPWRITE_API_KEY: requireEnv('APPWRITE_API_KEY'),
  APPWRITE_DATABASE_ID: optionalEnv('APPWRITE_DATABASE_ID', 'main'),

  // Anthropic Claude
  ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY'),

  // Google Maps
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',

  // OpenRouteService
  OPENROUTESERVICE_API_KEY: process.env.OPENROUTESERVICE_API_KEY || '',

  // TankerKoenig (Dieselpreise)
  TANKERKOENIG_API_KEY: process.env.TANKERKOENIG_API_KEY || '',

  // Email (IMAP/SMTP)
  EMAIL_HOST: optionalEnv('EMAIL_HOST', 'imap.ionos.de'),
  EMAIL_PORT: parseInt(optionalEnv('EMAIL_PORT', '993')),
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || '',
  SMTP_HOST: optionalEnv('SMTP_HOST', 'smtp.ionos.de'),
  SMTP_PORT: parseInt(optionalEnv('SMTP_PORT', '587')),

  // Cron Jobs
  ENABLE_CRON_JOBS: optionalEnv('ENABLE_CRON_JOBS', 'true') === 'true',
  CRON_SECRET: optionalEnv('CRON_SECRET', 'change-me-in-production'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '60000')),
  RATE_LIMIT_MAX_REQUESTS: parseInt(optionalEnv('RATE_LIMIT_MAX_REQUESTS', '100')),

  // Logging
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
} as const;

// Konfiguration ausgeben (ohne Secrets)
export function printConfig(): void {
  console.log('\n📋 Konfiguration:');
  console.log(`   NODE_ENV: ${config.NODE_ENV}`);
  console.log(`   PORT: ${config.PORT}`);
  console.log(`   APPWRITE_ENDPOINT: ${config.APPWRITE_ENDPOINT}`);
  console.log(`   APPWRITE_PROJECT_ID: ${config.APPWRITE_PROJECT_ID ? '✓ gesetzt' : '✗ FEHLT'}`);
  console.log(`   APPWRITE_API_KEY: ${config.APPWRITE_API_KEY ? '✓ gesetzt' : '✗ FEHLT'}`);
  console.log(`   ANTHROPIC_API_KEY: ${config.ANTHROPIC_API_KEY ? '✓ gesetzt' : '✗ FEHLT'}`);
  console.log(`   GOOGLE_MAPS_API_KEY: ${config.GOOGLE_MAPS_API_KEY ? '✓ gesetzt' : '○ optional'}`);
  console.log(`   OPENROUTESERVICE_API_KEY: ${config.OPENROUTESERVICE_API_KEY ? '✓ gesetzt' : '○ optional'}`);
  console.log(`   TANKERKOENIG_API_KEY: ${config.TANKERKOENIG_API_KEY ? '✓ gesetzt' : '○ optional'}`);
  console.log(`   ENABLE_CRON_JOBS: ${config.ENABLE_CRON_JOBS}`);
  console.log('');
}

// Bei Start ausgeben
if (config.NODE_ENV === 'development') {
  printConfig();
}
