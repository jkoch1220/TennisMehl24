/**
 * Rate Limiting Middleware
 *
 * Verschiedene Limits für verschiedene Endpunkte.
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config/environment.js';

/**
 * Allgemeines Rate Limit (100 Requests/Minute)
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Claude AI Rate Limit (10 Requests/Minute)
 * KI-Anfragen sind teuer und sollten begrenzt werden
 */
export const claudeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 Minute
  max: 10,
  message: {
    error: 'Zu viele KI-Anfragen. Bitte warten Sie eine Minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Geocoding Rate Limit (60 Requests/Minute)
 */
export const geocodingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Geocoding-Limit erreicht. Bitte warten Sie.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Fuel Price Rate Limit (30 Requests/Minute)
 */
export const fuelRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Dieselpreis-Limit erreicht. Bitte warten Sie.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});
