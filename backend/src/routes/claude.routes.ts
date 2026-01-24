/**
 * Claude AI Routes
 *
 * Endpunkte für KI-gestützte Funktionen wie Routenoptimierung.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { claudeService } from '../services/claude.service.js';
import { authenticate } from '../middleware/auth.js';
import { claudeRateLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../utils/logger.js';

const router = Router();

// Middleware für alle Claude Routes
router.use(claudeRateLimiter);

/**
 * POST /api/claude/optimize-route
 * Optimiert Liefertouren mit Claude AI
 */
router.post(
  '/optimize-route',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projekte, fahrzeuge, startAdresse, startZeit, einschraenkungen } = req.body;

      // Validierung
      if (!projekte || !Array.isArray(projekte)) {
        res.status(400).json({ error: 'projekte Array erforderlich' });
        return;
      }

      if (!fahrzeuge || !Array.isArray(fahrzeuge)) {
        res.status(400).json({ error: 'fahrzeuge Array erforderlich' });
        return;
      }

      auditLog('CLAUDE_OPTIMIZE_REQUEST', req.user?.$id || 'unknown', {
        projektCount: projekte.length,
        fahrzeugCount: fahrzeuge.length,
      }, req);

      const result = await claudeService.optimizeRoute({
        projekte,
        fahrzeuge,
        startAdresse,
        startZeit,
        einschraenkungen,
      });

      auditLog('CLAUDE_OPTIMIZE_SUCCESS', req.user?.$id || 'unknown', {
        tourenCount: result.touren.length,
      }, req);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/claude/parse-inquiry
 * Parst E-Mail-Anfragen mit Claude AI
 */
router.post(
  '/parse-inquiry',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { emailContent, emailSubject } = req.body;

      if (!emailContent) {
        res.status(400).json({ error: 'emailContent erforderlich' });
        return;
      }

      auditLog('CLAUDE_PARSE_REQUEST', req.user?.$id || 'unknown', {
        contentLength: emailContent.length,
      }, req);

      const result = await claudeService.parseInquiry(emailContent, emailSubject);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
