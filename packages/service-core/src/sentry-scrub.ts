// PHI/PII redaction for Sentry events, applied in `beforeSend` before any event
// leaves the process to a third-party SaaS. The pino logger (logger.ts) redacts
// structured LOG fields, but a Sentry Event is a different shape — PHI can leak
// via paths the logger never sees: request bodies, breadcrumb fetch data,
// exception-frame locals, the user object, and custom contexts/tags/extra.
// This walks every such path. Pure + dependency-light (only node:crypto) so it
// can be unit-tested in isolation with one synthetic-PHI assertion per path.
//
// CHORE-SENTRY-PHI-REDACTION-001 (G2).

import { createHash } from 'node:crypto';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

// Keys whose VALUES must never reach a third-party error tracker (case-insensitive).
// Superset of logger.ts PHI_REDACT_PATHS + direct identifiers that are acceptable
// in internal logs (email, cognito_sub, user id) but NOT in third-party events.
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // credentials / tokens
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
  // PHI / bio-profile (mirror logger.ts + the gaps it missed)
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
  // direct identifiers (third-party exposure is stricter than internal logs)
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

// Free-text scrub: strip embedded credentials + emails. Does NOT touch UUIDs —
// request/correlation IDs are useful and non-identifying. URL scrubbing adds
// UUID stripping for path segments where a UUID is a user id.
function scrubString(input: string): string {
  return input.replace(BEARER_RE, REDACTED).replace(JWT_RE, REDACTED).replace(EMAIL_RE, REDACTED);
}

function scrubUrl(url: string): string {
  const q = url.indexOf('?');
  const path = q >= 0 ? url.slice(0, q) : url; // drop query string (may carry tokens/email)
  return scrubString(path).replace(UUID_RE, REDACTED);
}

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (seen.has(value)) return REDACTED; // cycle guard
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

function hashId(id: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${id}`).digest('hex').slice(0, 8);
}

// Scrub an exception/thread container: the message (`value` — the SDK puts the
// exception string here, NOT in event.message), frame locals (`vars`, dropped),
// and ContextLines source snippets (context_line/pre_context/post_context, which
// can embed credentials/emails).
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
          f[ctxKey] = ctx.map((line: unknown) => (typeof line === 'string' ? scrubString(line) : line));
        }
      }
    }
  }
}

export interface ScrubbableEvent {
  [key: string]: unknown;
}

export interface ScrubOptions {
  /** Salt for the retained user-id hash (service name): correlatable within a
   *  service, not joinable across services. */
  idSalt?: string;
}

/**
 * Redact PHI/PII from a Sentry event in place and return it. Safe to call on any
 * object shape; unknown paths are left untouched (Sentry's own fields like
 * `sdk`/`platform`/`timestamp` must survive). The caller's `beforeSend` should
 * still wrap this in try/catch and drop the event on error (fail-safe).
 */
export function scrubSentryEvent(event: ScrubbableEvent, opts: ScrubOptions = {}): ScrubbableEvent {
  const ev = event as ScrubbableEvent | null | undefined;
  if (ev === null || ev === undefined || typeof ev !== 'object') return event;
  const salt = opts.idSalt ?? '';

  // 1. message + logentry
  if (typeof event['message'] === 'string') {
    event['message'] = scrubString(event['message']);
  } else if (event['message'] !== null && typeof event['message'] === 'object') {
    event['message'] = deepScrub(event['message']);
  }
  const logentry = event['logentry'];
  if (logentry !== null && typeof logentry === 'object') {
    const le = logentry as Record<string, unknown>;
    if (typeof le['message'] === 'string') le['message'] = scrubString(le['message']);
  }

  // transaction name — can carry a resolved dynamic route (e.g. /users/<email>/x)
  if (typeof event['transaction'] === 'string') {
    event['transaction'] = scrubString(event['transaction']);
  }

  // 2. exception + thread frames — scrub the message (value), drop frame locals,
  //    scrub ContextLines source snippets. The SDK puts the exception message in
  //    exception.values[].value (NOT event.message); threads is filled by the
  //    threading/async-context integrations.
  scrubExceptionContainer(event['exception']);
  scrubExceptionContainer(event['threads']);

  // 3. request — url (drop query, strip user-id UUIDs), query_string, cookies,
  //    headers (authorization/cookie), and data (the POST body — bio-profile lands here)
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

  // 4. user — drop PII; retain only a salted-hash id for per-user correlation
  const user = event['user'];
  if (user !== null && typeof user === 'object') {
    const u = user as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    if (typeof u['id'] === 'string' && u['id'].length > 0) {
      cleaned['id'] = hashId(u['id'], salt);
    }
    event['user'] = cleaned; // email / username / ip_address / segment dropped
  }

  // 5. breadcrumbs — fetch/xhr crumbs carry url + bodies (high-leak, easily missed)
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

  // 6/7/8. contexts / tags / extra — redact sensitive keys, keep safe context
  //        (device/os/runtime values survive: they match no sensitive key/pattern).
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
