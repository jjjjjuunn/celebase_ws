// PHI/PII redaction for Sentry events on the mobile client, applied in
// `beforeSend` before any event leaves the device for a third-party SaaS.
//
// This mirrors the server scrubber (packages/service-core/src/sentry-scrub.ts)
// but is a deliberate separate copy: service-core is a Node/Fastify package not
// importable from React Native, and the mobile runtime has no node:crypto — so
// the `user` object is dropped wholesale rather than hashed. Keep the two
// SENSITIVE_KEYS lists in sync (see docs handoff).
//
// CHORE-SENTRY-PHI-REDACTION-001 (G2).

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

// Keys whose VALUES must never leave the device (case-insensitive). Mirror of the
// server list: credentials/tokens + PHI bio-profile fields + direct identifiers.
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'refresh_token',
  'id_token',
  'apple_authorization_code',
  'apple_refresh_token_enc',
  'token',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'dek',
  'biomarkers',
  'medical_conditions',
  'medications',
  'allergies',
  'intolerances',
  'height',
  'height_cm',
  'weight',
  'weight_kg',
  'waist_cm',
  'body_fat_pct',
  'birth_year',
  'sex',
  'activity_level',
  'email',
  'cognito_sub',
  'ssn',
  'phone',
]);

const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function scrubString(input: string): string {
  return input.replace(BEARER_RE, REDACTED).replace(JWT_RE, REDACTED).replace(EMAIL_RE, REDACTED);
}

function scrubUrl(url: string): string {
  const q = url.indexOf('?');
  const path = q >= 0 ? url.slice(0, q) : url;
  return scrubString(path).replace(UUID_RE, REDACTED);
}

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : scrubValue(v, depth + 1, seen);
  }
  return out;
}

function deepScrub(value: unknown): unknown {
  return scrubValue(value, 0, new WeakSet());
}

// Scrub an exception/thread container: the message (`value` — the SDK puts the
// exception string here, NOT in event.message), frame locals (`vars`, dropped),
// and ContextLines source snippets (context_line/pre_context/post_context).
function scrubExceptionContainer(container: unknown): void {
  if (container === null || typeof container !== 'object') return;
  const values = (container as Record<string, unknown>)['values'];
  if (!Array.isArray(values)) return;
  for (const val of values) {
    if (val === null || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    if (typeof v['value'] === 'string') v['value'] = scrubString(v['value']);
    const stacktrace = v['stacktrace'];
    if (stacktrace === null || typeof stacktrace !== 'object') continue;
    const frames = (stacktrace as Record<string, unknown>)['frames'];
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (frame === null || typeof frame !== 'object') continue;
      const f = frame as Record<string, unknown>;
      delete f['vars'];
      if (typeof f['context_line'] === 'string') f['context_line'] = scrubString(f['context_line']);
      for (const ctxKey of ['pre_context', 'post_context'] as const) {
        const ctx = f[ctxKey];
        if (Array.isArray(ctx)) {
          f[ctxKey] = ctx.map((line) => (typeof line === 'string' ? scrubString(line) : line));
        }
      }
    }
  }
}

export interface ScrubbableEvent {
  [key: string]: unknown;
}

/** Redact PHI/PII from a Sentry event in place and return it. */
export function scrubEvent(event: ScrubbableEvent): ScrubbableEvent {
  const ev = event as ScrubbableEvent | null | undefined;
  if (ev === null || ev === undefined || typeof ev !== 'object') return event;

  if (typeof event['message'] === 'string') {
    event['message'] = scrubString(event['message']);
  } else if (event['message'] !== null && typeof event['message'] === 'object') {
    event['message'] = deepScrub(event['message']);
  }

  // transaction name — can carry a resolved dynamic route (e.g. /users/<email>/x)
  if (typeof event['transaction'] === 'string') {
    event['transaction'] = scrubString(event['transaction']);
  }

  // exception + thread frames — scrub message (value), drop frame locals, scrub
  // ContextLines source snippets. The SDK puts the exception message in
  // exception.values[].value, NOT event.message.
  scrubExceptionContainer(event['exception']);
  scrubExceptionContainer(event['threads']);

  const request = event['request'];
  if (request !== null && typeof request === 'object') {
    const req = request as Record<string, unknown>;
    if (typeof req['url'] === 'string') req['url'] = scrubUrl(req['url']);
    delete req['query_string'];
    delete req['cookies'];
    const headers = req['headers'];
    if (headers !== null && typeof headers === 'object' && !Array.isArray(headers)) {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
        cleaned[k] = isSensitiveKey(k) ? REDACTED : typeof v === 'string' ? scrubString(v) : v;
      }
      req['headers'] = cleaned;
    }
    if ('data' in req) req['data'] = deepScrub(req['data']);
  }

  // user — dropped wholesale (no node:crypto for hashing; we never setUser on mobile).
  if (event['user'] !== undefined) delete event['user'];

  const breadcrumbs = event['breadcrumbs'];
  if (Array.isArray(breadcrumbs)) {
    for (const crumb of breadcrumbs) {
      if (crumb === null || typeof crumb !== 'object') continue;
      const c = crumb as Record<string, unknown>;
      if (typeof c['message'] === 'string') c['message'] = scrubString(c['message']);
      const data = c['data'];
      if (data !== null && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        if (typeof d['url'] === 'string') d['url'] = scrubUrl(d['url']);
        delete d['request_body'];
        delete d['response_body'];
        c['data'] = deepScrub(d);
      }
    }
  }

  if (event['contexts'] !== null && typeof event['contexts'] === 'object') {
    event['contexts'] = deepScrub(event['contexts']);
  }
  if (event['tags'] !== null && typeof event['tags'] === 'object') {
    event['tags'] = deepScrub(event['tags']);
  }
  if (event['extra'] !== null && typeof event['extra'] === 'object') {
    event['extra'] = deepScrub(event['extra']);
  }

  return event;
}
