import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from './shared/config';
import { corsMiddleware } from './shared/middleware/cors';
import { hostCheck } from './shared/middleware/hostCheck';
import { globalLimiter } from './shared/middleware/rateLimit';
import { requestContext, notFound } from './shared/middleware/requestContext';
import { errorHandler } from './shared/middleware/errorHandler';
import v1 from './api/v1';

/**
 * Express application assembly. The middleware order below mirrors the request
 * pipeline in the architecture doc — each stage maps to an OWASP API risk and
 * runs BEFORE the controller it protects.
 */
export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop so req.ip is the real client (needed for rate
  // limiting). Tighten to specific proxy IPs in production.
  app.set('trust proxy', 1);
  app.disable('x-powered-by'); // don't advertise the framework (API8)

  // 1. Security headers (API8) — CSP, HSTS, no-sniff, frameguard, etc.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // 2. CORS allow-list + Host header validation (API8)
  app.use(corsMiddleware);
  app.use(hostCheck);

  // 3. Correlation id + structured access log
  app.use(requestContext);

  // 4. Global rate limit (API4/API6)
  app.use(globalLimiter);

  // 5. Body parsing with a SMALL global cap (API4). Large uploads use a
  //    dedicated, higher-limit parser on the attachment route only.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // 6. Health/readiness (unauthenticated, minimal info)
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: 'v1', env: config.env }));

  // 7. Versioned API (API9)
  app.use('/api/v1', v1);

  // 8. 404 + centralised error handler (API8) — always last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
