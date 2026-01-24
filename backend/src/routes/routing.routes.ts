/**
 * Routing & Geocoding Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { routingService } from '../services/routing.service.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { geocodingRateLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../utils/logger.js';

const router = Router();

// Rate Limiting
router.use(geocodingRateLimiter);

/**
 * POST /api/routing/calculate
 * Berechnet Route zwischen zwei PLZ
 */
router.post(
  '/calculate',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startPLZ, zielPLZ } = req.body;

      if (!startPLZ || !zielPLZ) {
        res.status(400).json({ error: 'startPLZ und zielPLZ erforderlich' });
        return;
      }

      auditLog('ROUTE_CALCULATE', req.user?.$id || 'anonymous', {
        startPLZ,
        zielPLZ,
      }, req);

      const result = await routingService.calculateRoute(startPLZ, zielPLZ);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/routing/geocode
 * Geocodiert eine Adresse oder PLZ
 */
router.post(
  '/geocode',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { address, plz } = req.body;
      const addressToGeocode = address || plz;

      if (!addressToGeocode) {
        res.status(400).json({ error: 'address oder plz erforderlich' });
        return;
      }

      auditLog('GEOCODE', req.user?.$id || 'anonymous', {
        address: addressToGeocode,
      }, req);

      const result = await routingService.geocode(addressToGeocode);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/routing/batch-geocode
 * Batch-Geocoding für mehrere Adressen
 */
router.post(
  '/batch-geocode',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { addresses } = req.body;

      if (!addresses || !Array.isArray(addresses)) {
        res.status(400).json({ error: 'addresses Array erforderlich' });
        return;
      }

      // Max 50 Adressen
      const limitedAddresses = addresses.slice(0, 50);

      auditLog('BATCH_GEOCODE', req.user?.$id || 'unknown', {
        count: limitedAddresses.length,
      }, req);

      const results = await routingService.batchGeocode(limitedAddresses);

      res.json(results);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
