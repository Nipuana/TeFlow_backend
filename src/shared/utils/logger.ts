/**
 * Minimal structured (JSON-line) logger with automatic redaction of sensitive
 * fields. No PII, secrets, tokens, or passwords should ever reach the logs
 * (supports API8 and the "no sensitive data logged" observability requirement).
 */
type Meta = Record<string, unknown>;

const REDACT_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'clientsecret',
  'mfasecret',
  'otp',
  'code',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: string, message: string, meta: Meta = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(redact(meta) as Meta),
  };
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + '\n');
}

const logger = {
  info: (msg: string, meta?: Meta) => emit('info', msg, meta),
  warn: (msg: string, meta?: Meta) => emit('warn', msg, meta),
  error: (msg: string, meta?: Meta) => emit('error', msg, meta),
  debug: (msg: string, meta?: Meta) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', msg, meta);
  },
  redact,
};

export default logger;
