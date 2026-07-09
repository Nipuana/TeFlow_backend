import 'dotenv/config';

/**
 * Centralised, validated configuration.
 *
 * Everything the app trusts about its environment is parsed and sanity-checked
 * ONCE here, at boot. A misconfigured deployment fails fast and loudly instead
 * of silently running insecure (API8: Security Misconfiguration).
 */

const toInt = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

export const config = {
  env: NODE_ENV,
  isProd,
  port: toInt(process.env.PORT, 3000),

  // Persistence — local MongoDB
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    db: process.env.MONGODB_DB || 'teamflow',
  },

  // API2 — Authentication
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTtl: toInt(process.env.ACCESS_TOKEN_TTL, 900),
    refreshTtl: toInt(process.env.REFRESH_TOKEN_TTL, 1209600),
    issuer: 'teflow',
    audience: 'teflow-api',
  },

  // API8 — Security misconfiguration
  cors: {
    allowedOrigins: toList(process.env.CORS_ALLOWED_ORIGINS),
  },
  allowedHosts: toList(process.env.ALLOWED_HOSTS),

  // API7 — SSRF
  outbound: {
    allowedProtocols: toList(process.env.OUTBOUND_ALLOWED_PROTOCOLS).length
      ? toList(process.env.OUTBOUND_ALLOWED_PROTOCOLS)
      : ['https:'],
    timeoutMs: toInt(process.env.OUTBOUND_TIMEOUT_MS, 5000),
    maxBytes: toInt(process.env.OUTBOUND_MAX_BYTES, 1024 * 1024),
  },

  // API4 — Resource consumption
  limits: {
    maxUploadBytes: toInt(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),
    maxPageSize: toInt(process.env.MAX_PAGE_SIZE, 100),
    rateWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateMax: toInt(process.env.RATE_LIMIT_MAX, 300),
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
};

/**
 * Fail fast on insecure production configuration.
 */
export function assertProductionSafety(): void {
  if (!isProd) return;
  const problems: string[] = [];

  if (config.jwt.accessSecret.includes('change-me') || config.jwt.accessSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET is weak or default');
  }
  if (config.jwt.refreshSecret.includes('change-me') || config.jwt.refreshSecret.length < 32) {
    problems.push('JWT_REFRESH_SECRET is weak or default');
  }
  if (config.jwt.accessSecret === config.jwt.refreshSecret) {
    problems.push('Access and refresh secrets must differ');
  }
  if (config.cors.allowedOrigins.includes('*')) {
    problems.push('CORS wildcard "*" is not allowed with credentials');
  }
  if (config.allowedHosts.length === 0) {
    problems.push('ALLOWED_HOSTS must be set in production');
  }

  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('FATAL: insecure production configuration:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}
