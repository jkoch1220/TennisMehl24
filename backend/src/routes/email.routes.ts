/**
 * Email Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { emailService } from '../services/email.service.js';
import { authenticate, authenticateCron } from '../middleware/auth.js';
import { auditLog } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/email/inbox
 * Holt E-Mails aus dem Posteingang
 */
router.get(
  '/inbox',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string || '50') || 50;
      const folder = (req.query.folder as string) || 'INBOX';

      auditLog('EMAIL_FETCH_INBOX', req.user?.$id || 'unknown', { limit, folder }, req);

      const emails = await emailService.fetchInbox(folder, limit);

      res.json({ emails, count: emails.length });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/email/send
 * Sendet eine E-Mail
 */
router.post(
  '/send',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { to, subject, body, html, attachments } = req.body;

      if (!to || !subject) {
        res.status(400).json({ error: 'to und subject erforderlich' });
        return;
      }

      auditLog('EMAIL_SEND', req.user?.$id || 'unknown', { to, subject }, req);

      const result = await emailService.sendEmail({
        to,
        subject,
        text: body,
        html,
        attachments,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/email/process-inquiries
 * Verarbeitet neue Anfragen (für Cron Jobs)
 */
router.post(
  '/process-inquiries',
  authenticateCron,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      auditLog('EMAIL_PROCESS_INQUIRIES', 'cron', {}, req);

      const result = await emailService.processNewInquiries();

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
