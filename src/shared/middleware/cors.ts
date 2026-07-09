import cors from 'cors';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * CORS with a strict origin ALLOW-LIST (API8).
 *
 * Never `origin: '*'` together with credentials. Unknown origins are rejected
 * (the browser then blocks the response). Requests with no Origin header
 * (server-to-server, curl) are allowed through — CORS is a browser control and
 * does not apply to them; they are still gated by auth/RBAC.
 */
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.cors.allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn('cors_origin_rejected', { origin });
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});
