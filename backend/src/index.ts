/**
 * TennisMehl24 Backend Server
 *
 * Express-basierter Backend-Server für:
 * - Claude AI Routenoptimierung
 * - Routing & Geocoding
 * - Dieselpreise
 * - E-Mail-Verarbeitung
 * - Cron Jobs für regelmäßige Aufgaben
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/environment.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

// Routes
import claudeRoutes from './routes/claude.routes.js';
import routingRoutes from './routes/routing.routes.js';
import fuelRoutes from './routes/fuel.routes.js';
import emailRoutes from './routes/email.routes.js';
import healthRoutes from './routes/health.routes.js';

// Cron Jobs
import { startCronJobs } from './jobs/index.js';

const app = express();

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security Headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cron-Secret'],
}));

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use(requestLogger);

// =============================================================================
// ROUTES
// =============================================================================

// Health Check (kein Auth erforderlich)
app.use('/api/health', healthRoutes);

// API Routes
app.use('/api/claude', claudeRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/email', emailRoutes);

// Root Route
app.get('/', (req, res) => {
  res.json({
    name: 'TennisMehl24 Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      claude: '/api/claude/optimize-route',
      routing: '/api/routing/calculate',
      geocoding: '/api/routing/geocode',
      fuel: '/api/fuel/diesel-price',
      email: '/api/email/*',
    },
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} nicht gefunden`,
  });
});

// Error Handler
app.use(errorHandler);

// =============================================================================
// SERVER START
// =============================================================================

const PORT = config.PORT;

app.listen(PORT, () => {
  logger.info(`🚀 Server gestartet auf Port ${PORT}`);
  logger.info(`📍 Environment: ${config.NODE_ENV}`);
  logger.info(`🔗 URL: http://localhost:${PORT}`);

  // Cron Jobs starten
  if (config.ENABLE_CRON_JOBS) {
    startCronJobs();
    logger.info('⏰ Cron Jobs gestartet');
  }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM empfangen, fahre Server herunter...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT empfangen, fahre Server herunter...');
  process.exit(0);
});

export default app;
