/**
 * Fuel Price Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { fuelService } from '../services/fuel.service.js';
import { optionalAuth } from '../middleware/auth.js';
import { fuelRateLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../utils/logger.js';

const router = Router();

// Rate Limiting
router.use(fuelRateLimiter);

/**
 * POST /api/fuel/diesel-price
 * GET /api/fuel/diesel-price?plz=12345
 * Holt aktuellen Dieselpreis für eine PLZ
 */
router.all(
  '/diesel-price',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let plz: string;
      let radius: number = 10;

      if (req.method === 'GET') {
        plz = req.query.plz as string || '';
        radius = parseInt(req.query.radius as string || '10') || 10;
      } else {
        plz = req.body.plz || '';
        radius = req.body.radius || 10;
      }

      if (!plz) {
        res.status(400).json({ error: 'PLZ erforderlich' });
        return;
      }

      // Validiere PLZ Format
      if (!/^\d{5}$/.test(plz)) {
        res.status(400).json({ error: 'Ungültiges PLZ-Format (5 Ziffern erwartet)' });
        return;
      }

      // Begrenze Radius
      radius = Math.min(Math.max(radius, 1), 25);

      auditLog('FUEL_PRICE', req.user?.$id || 'anonymous', { plz, radius }, req);

      const result = await fuelService.getDieselPrice(plz, radius);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
