/**
 * Cron Jobs
 *
 * Regelmäßige Aufgaben die automatisch ausgeführt werden.
 */

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { emailService } from '../services/email.service.js';

// Job-Status
const jobStatus: Record<string, { lastRun: Date | null; running: boolean; errors: number }> = {};

/**
 * Registriert alle Cron Jobs
 */
export function startCronJobs(): void {
  logger.info('🕐 Registriere Cron Jobs...');

  // ============================================================================
  // E-MAIL VERARBEITUNG - Alle 5 Minuten
  // ============================================================================
  cron.schedule('*/5 * * * *', async () => {
    const jobName = 'email-processing';

    if (jobStatus[jobName]?.running) {
      logger.warn(`Job ${jobName} läuft bereits, überspringe...`);
      return;
    }

    jobStatus[jobName] = { ...jobStatus[jobName], running: true };
    logger.info(`⏰ Starte Job: ${jobName}`);

    try {
      const result = await emailService.processNewInquiries();
      jobStatus[jobName] = {
        lastRun: new Date(),
        running: false,
        errors: result.errors,
      };
      logger.info(`✅ Job ${jobName} abgeschlossen: ${result.processed} verarbeitet`);
    } catch (error) {
      jobStatus[jobName] = {
        lastRun: new Date(),
        running: false,
        errors: (jobStatus[jobName]?.errors || 0) + 1,
      };
      logger.error(`❌ Job ${jobName} fehlgeschlagen: %s`, error instanceof Error ? error.message : String(error));
    }
  });

  logger.info('   📧 E-Mail-Verarbeitung: alle 5 Minuten');

  // ============================================================================
  // HEALTH CHECK - Jede Minute (für Monitoring)
  // ============================================================================
  cron.schedule('* * * * *', () => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    // Warnung bei hohem Speicherverbrauch
    if (heapUsedMB > 500) {
      logger.warn(`⚠️ Hoher Speicherverbrauch: ${heapUsedMB}MB`);
    }
  });

  logger.info('   💓 Health Check: jede Minute');

  // ============================================================================
  // CACHE CLEANUP - Täglich um 3:00 Uhr
  // ============================================================================
  cron.schedule('0 3 * * *', () => {
    logger.info('🧹 Cache Cleanup gestartet...');
    // Hier können Caches geleert werden
    // geocodeCache.clear();
    // routeCache.clear();
    logger.info('✅ Cache Cleanup abgeschlossen');
  });

  logger.info('   🧹 Cache Cleanup: täglich um 3:00 Uhr');

  // ============================================================================
  // BEISPIEL: Jede Minute etwas tun
  // ============================================================================
  /*
  cron.schedule('* * * * *', async () => {
    logger.info('⏰ Jede-Minute-Job läuft...');
    // Deine Logik hier
  });
  */

  logger.info('✅ Alle Cron Jobs registriert');
}

/**
 * Gibt Status aller Jobs zurück
 */
export function getJobStatus(): Record<string, unknown> {
  return { ...jobStatus };
}
