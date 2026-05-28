import { describe, it, expect } from '@jest/globals';

import { scrubSentryEvent, type ScrubbableEvent } from '../../src/sentry-scrub.js';

// Synthetic PHI/PII sentinels seeded into every event path. The headline test
// asserts NONE of these survive serialization — a regression that drops any
// path's scrubbing fails here instead of silently shipping PHI to a 3rd party.
const EMAIL = 'victim@phi.example';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.AbC-dEf_123signature';
const APPLE_RT = 'apple-refresh-token-PLAINTEXT-must-not-leak';
const BIOMARKER = 'fasting_glucose_210_critical';
const RAW_USER_ID = 'raw-internal-user-id-zzz';
const URL_USER_UUID = '11111111-2222-3333-4444-555555555555';
const REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; // correlation — must survive

function makeDirtyEvent(): ScrubbableEvent {
  return {
    platform: 'node', // safe Sentry field — must survive
    timestamp: 1700000000,
    message: `login failed for ${EMAIL} token ${JWT}`,
    transaction: `POST /users/${EMAIL}/profile`, // resolved dynamic route — top-level field
    exception: {
      values: [
        {
          type: 'Error',
          value: `generate failed for ${EMAIL}`, // SDK puts the message here, not event.message
          stacktrace: {
            frames: [
              {
                filename: 'auth.ts',
                context_line: `  headers.authorization = 'Bearer ${JWT}';`, // ContextLines source snippet
                pre_context: [`  const email = '${EMAIL}';`],
                vars: { password: 'hunter2', email: EMAIL },
              },
            ],
          },
        },
      ],
    },
    request: {
      method: 'POST',
      url: `https://api.celebase.app/users/${URL_USER_UUID}/bio-profile?email=${EMAIL}`,
      query_string: `email=${EMAIL}`,
      cookies: { session: JWT },
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${JWT}`,
        cookie: `sid=${JWT}`,
      },
      data: {
        display_name: 'Jordan', // non-sensitive — must survive
        allergies: ['peanuts'],
        medical_conditions: ['t2dm'],
        biomarkers: { note: BIOMARKER },
        weight_kg: 81.5,
        height_cm: 178,
        birth_year: 1990,
        sex: 'female',
        activity_level: 'very_active',
        apple_refresh_token_enc: APPLE_RT,
        email: EMAIL,
      },
    },
    user: { id: RAW_USER_ID, email: EMAIL, username: 'victim', ip_address: '203.0.113.7' },
    breadcrumbs: [
      {
        category: 'fetch',
        message: `POST ${EMAIL}`,
        data: {
          url: `https://api.celebase.app/users/${URL_USER_UUID}`,
          request_body: { medications: ['glp1'], email: EMAIL },
          status_code: 500,
        },
      },
    ],
    contexts: {
      device: { model: 'iPhone15,2' }, // safe — must survive
      // PHI realistically rides under known keys (biomarkers is JSONB on bio_profiles).
      // The scrubber redacts by known key + credential pattern; free-form PHI under a
      // novel key (e.g. a hand-written 'note') is NOT detectable by value and is a
      // code-discipline concern (see handoff) — not asserted here.
      phi: { medications: ['ozempic'], biomarkers: { glucose: BIOMARKER } },
    },
    tags: { email: EMAIL, requestId: REQUEST_ID },
    extra: { profile: { allergies: ['shellfish'], biomarkers: BIOMARKER } },
  };
}

describe('scrubSentryEvent — headline: no synthetic PHI survives any path', () => {
  it('strips every seeded PHI/PII sentinel from the serialized event', () => {
    const scrubbed = scrubSentryEvent(makeDirtyEvent(), { idSalt: 'user-service' });
    const json = JSON.stringify(scrubbed);
    for (const sentinel of [EMAIL, JWT, APPLE_RT, BIOMARKER, RAW_USER_ID, URL_USER_UUID]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it('preserves safe fields and the correlation id (no over-redaction)', () => {
    const scrubbed = scrubSentryEvent(makeDirtyEvent(), { idSalt: 'user-service' });
    const json = JSON.stringify(scrubbed);
    expect(scrubbed['platform']).toBe('node');
    expect(scrubbed['timestamp']).toBe(1700000000);
    expect(json).toContain('Jordan'); // non-sensitive request body field
    expect(json).toContain('iPhone15,2'); // safe device context
    expect(json).toContain(REQUEST_ID); // correlation id NOT a uuid-in-url → survives
  });
});

describe('scrubSentryEvent — per-path coverage', () => {
  it('1. message: redacts embedded email/jwt/bearer', () => {
    const ev = scrubSentryEvent({ message: `hi ${EMAIL} ${JWT}` });
    expect(ev['message']).not.toContain(EMAIL);
    expect(ev['message']).not.toContain(JWT);
    expect(ev['message']).toContain('[REDACTED]');
  });

  it('1b. message-as-object: deep-scrubbed', () => {
    const ev = scrubSentryEvent({ message: { email: EMAIL, note: 'ok' } });
    expect(JSON.stringify(ev)).not.toContain(EMAIL);
  });

  it('2. exception frame vars: deleted entirely', () => {
    const ev = scrubSentryEvent({
      exception: { values: [{ stacktrace: { frames: [{ filename: 'a.ts', vars: { x: EMAIL } }] } }] },
    });
    const frame = (ev['exception'] as { values: { stacktrace: { frames: { vars?: unknown }[] } }[] })
      .values[0]!.stacktrace.frames[0]!;
    expect('vars' in frame).toBe(false);
  });

  it('2b. exception value + frame context lines: message + source snippets scrubbed', () => {
    // The SDK puts the exception message in exception.values[].value (NOT
    // event.message), and the ContextLines integration fills context_line/
    // pre_context/post_context. Caught by the real-SDK verification harness.
    const ev = scrubSentryEvent({
      exception: {
        values: [
          {
            value: `boom for ${EMAIL}`,
            stacktrace: {
              frames: [
                {
                  context_line: `  headers.authorization = 'Bearer ${JWT}';`,
                  pre_context: [`  const email = '${EMAIL}';`],
                  post_context: ['  return headers;'],
                  vars: { x: EMAIL },
                },
              ],
            },
          },
        ],
      },
    });
    const json = JSON.stringify(ev);
    expect(json).not.toContain(EMAIL);
    expect(json).not.toContain(JWT);
    const val = (
      ev['exception'] as { values: { value: string; stacktrace: { frames: { vars?: unknown }[] } }[] }
    ).values[0]!;
    expect(val.value).toBe('boom for [REDACTED]');
    expect('vars' in val.stacktrace.frames[0]!).toBe(false);
  });

  it('2c. threads frames: vars dropped + source context scrubbed', () => {
    const ev = scrubSentryEvent({
      threads: {
        values: [{ stacktrace: { frames: [{ context_line: `t = 'Bearer ${JWT}'`, vars: { x: EMAIL } }] } }],
      },
    });
    const json = JSON.stringify(ev);
    expect(json).not.toContain(EMAIL);
    expect(json).not.toContain(JWT);
  });

  it('3. request.data: redacts PHI keys, keeps non-sensitive', () => {
    const ev = scrubSentryEvent({
      request: { data: { display_name: 'Jordan', allergies: ['peanuts'], email: EMAIL } },
    });
    const data = (ev['request'] as { data: Record<string, unknown> }).data;
    expect(data['display_name']).toBe('Jordan');
    expect(data['allergies']).toBe('[REDACTED]');
    expect(data['email']).toBe('[REDACTED]');
  });

  it('4. request.cookies: deleted', () => {
    const ev = scrubSentryEvent({ request: { cookies: { sid: JWT } } });
    expect('cookies' in (ev['request'] as object)).toBe(false);
  });

  it('5. request.headers: authorization/cookie redacted, others kept', () => {
    const ev = scrubSentryEvent({
      request: { headers: { authorization: `Bearer ${JWT}`, 'content-type': 'application/json' } },
    });
    const headers = (ev['request'] as { headers: Record<string, unknown> }).headers;
    expect(headers['authorization']).toBe('[REDACTED]');
    expect(headers['content-type']).toBe('application/json');
  });

  it('6. request.url: query dropped, user-id uuid stripped', () => {
    const ev = scrubSentryEvent({
      request: { url: `https://x.app/users/${URL_USER_UUID}/me?email=${EMAIL}` },
    });
    const url = (ev['request'] as { url: string }).url;
    expect(url).not.toContain(URL_USER_UUID);
    expect(url).not.toContain(EMAIL);
    expect(url).not.toContain('?');
  });

  it('7. request.query_string: deleted', () => {
    const ev = scrubSentryEvent({ request: { query_string: `email=${EMAIL}` } });
    expect('query_string' in (ev['request'] as object)).toBe(false);
  });

  it('8. user: PII dropped, id retained as salted hash only', () => {
    const ev = scrubSentryEvent(
      { user: { id: RAW_USER_ID, email: EMAIL, username: 'v', ip_address: '203.0.113.7' } },
      { idSalt: 'user-service' },
    );
    const user = ev['user'] as Record<string, unknown>;
    expect(user['email']).toBeUndefined();
    expect(user['username']).toBeUndefined();
    expect(user['ip_address']).toBeUndefined();
    expect(user['id']).not.toBe(RAW_USER_ID);
    expect(typeof user['id']).toBe('string');
    expect((user['id'] as string).length).toBe(8);
  });

  it('8b. user id hash is deterministic per salt, differs across salts', () => {
    const a = scrubSentryEvent({ user: { id: RAW_USER_ID } }, { idSalt: 'user-service' });
    const b = scrubSentryEvent({ user: { id: RAW_USER_ID } }, { idSalt: 'user-service' });
    const c = scrubSentryEvent({ user: { id: RAW_USER_ID } }, { idSalt: 'commerce-service' });
    expect((a['user'] as { id: string }).id).toBe((b['user'] as { id: string }).id);
    expect((a['user'] as { id: string }).id).not.toBe((c['user'] as { id: string }).id);
  });

  it('9. breadcrumbs: url scrubbed, bodies dropped, nested PHI redacted', () => {
    const ev = scrubSentryEvent({
      breadcrumbs: [
        {
          data: {
            url: `https://x.app/users/${URL_USER_UUID}`,
            request_body: { email: EMAIL },
            medications: ['glp1'],
          },
        },
      ],
    });
    const data = (ev['breadcrumbs'] as { data: Record<string, unknown> }[])[0]!.data;
    expect(data['url']).not.toContain(URL_USER_UUID);
    expect('request_body' in data).toBe(false);
    expect(data['medications']).toBe('[REDACTED]');
  });

  it('10. contexts: safe context kept, sensitive key redacted', () => {
    const ev = scrubSentryEvent({
      contexts: { device: { model: 'iPhone15,2' }, phi: { biomarkers: BIOMARKER } },
    });
    const contexts = ev['contexts'] as Record<string, Record<string, unknown>>;
    expect(contexts['device']!['model']).toBe('iPhone15,2');
    expect(contexts['phi']!['biomarkers']).toBe('[REDACTED]');
  });

  it('11. tags: sensitive key redacted, correlation id preserved', () => {
    const ev = scrubSentryEvent({ tags: { email: EMAIL, requestId: REQUEST_ID } });
    const tags = ev['tags'] as Record<string, unknown>;
    expect(tags['email']).toBe('[REDACTED]');
    expect(tags['requestId']).toBe(REQUEST_ID);
  });

  it('12. extra: nested PHI redacted', () => {
    const ev = scrubSentryEvent({ extra: { profile: { allergies: ['shellfish'] } } });
    expect(JSON.stringify(ev)).not.toContain('shellfish');
  });
});

describe('scrubSentryEvent — robustness', () => {
  it('does not throw on a cyclic request.data', () => {
    const cyclic: Record<string, unknown> = { email: EMAIL };
    cyclic['self'] = cyclic;
    expect(() => scrubSentryEvent({ request: { data: cyclic } })).not.toThrow();
  });

  it('re-scrubbing already-clean output stays clean (no leak on double pass)', () => {
    // beforeSend runs once per event in practice; the salted user-id hash is
    // intentionally re-salted on a second pass, so byte-equality does not hold.
    // The invariant that matters: a second pass introduces no PHI leak + no throw.
    const once = scrubSentryEvent(makeDirtyEvent(), { idSalt: 's' });
    const twice = scrubSentryEvent(JSON.parse(JSON.stringify(once)) as ScrubbableEvent, { idSalt: 's' });
    const json = JSON.stringify(twice);
    for (const sentinel of [EMAIL, JWT, APPLE_RT, BIOMARKER, RAW_USER_ID, URL_USER_UUID]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it('returns non-object input untouched without throwing', () => {
    expect(() => scrubSentryEvent(null as unknown as ScrubbableEvent)).not.toThrow();
    expect(scrubSentryEvent(null as unknown as ScrubbableEvent)).toBeNull();
  });

  it('leaves a clean event unchanged', () => {
    const clean: ScrubbableEvent = { platform: 'node', level: 'error', message: 'disk full' };
    const out = scrubSentryEvent(clean);
    expect(out).toEqual({ platform: 'node', level: 'error', message: 'disk full' });
  });
});
