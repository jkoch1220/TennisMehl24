/**
 * Health Check Routes
 */

import { Router, Request, Response } from 'express';
import { config } from '../config/environment.js';
import { claudeService } from '../services/claude.service.js';

const router = Router();

/**
 * GET /api/health
 * Einfacher Health Check
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/health/detailed
 * Detaillierter Health Check mit Service-Status
 */
router.get('/detailed', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    services: {
      claude: claudeService.isAvailable(),
      googleMaps: !!config.GOOGLE_MAPS_API_KEY,
      openRouteService: !!config.OPENROUTESERVICE_API_KEY,
      tankerKoenig: !!config.TANKERKOENIG_API_KEY,
      appwrite: !!config.APPWRITE_API_KEY,
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  });
});

export default router;
