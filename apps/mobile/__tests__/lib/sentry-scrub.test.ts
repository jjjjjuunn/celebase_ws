import { scrubEvent, type ScrubbableEvent } from '../../src/lib/sentry-scrub';

const EMAIL = 'victim@phi.example';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.AbC-dEf_123signature';
const BIOMARKER = 'fasting_glucose_210';
const RAW_USER_ID = 'raw-internal-user-id-zzz';
const URL_USER_UUID = '11111111-2222-3333-4444-555555555555';
const REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeDirtyEvent(): ScrubbableEvent {
  return {
    platform: 'react-native',
    message: `login failed for ${EMAIL} token ${JWT}`,
    exception: {
      values: [
        {
          value: `generate failed for ${EMAIL}`, // SDK puts the message here, not event.message
          stacktrace: {
            frames: [
              {
                filename: 'auth.ts',
                context_line: `  auth = 'Bearer ${JWT}';`, // ContextLines source snippet
                pre_context: [`  const email = '${EMAIL}';`],
                vars: { email: EMAIL },
              },
            ],
          },
        },
      ],
    },
    request: {
      url: `https://api.celebase.app/users/${URL_USER_UUID}/bio-profile?email=${EMAIL}`,
      query_string: `email=${EMAIL}`,
      cookies: { session: JWT },
      headers: { authorization: `Bearer ${JWT}`, 'content-type': 'application/json' },
      data: {
        display_name: 'Jordan',
        allergies: ['peanuts'],
        biomarkers: { glucose: BIOMARKER },
        weight_kg: 81.5,
        email: EMAIL,
      },
    },
    user: { id: RAW_USER_ID, email: EMAIL, ip_address: '203.0.113.7' },
    breadcrumbs: [
      {
        category: 'fetch',
        data: { url: `https://api.celebase.app/users/${URL_USER_UUID}`, request_body: { email: EMAIL } },
      },
    ],
    tags: { email: EMAIL, requestId: REQUEST_ID },
    extra: { profile: { medications: ['glp1'] } },
  };
}

describe('mobile scrubEvent', () => {
  it('strips every seeded PHI/PII sentinel from the serialized event', () => {
    const json = JSON.stringify(scrubEvent(makeDirtyEvent()));
    for (const sentinel of [EMAIL, JWT, BIOMARKER, RAW_USER_ID, URL_USER_UUID]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it('drops the user object wholesale (no id retained on device)', () => {
    const ev = scrubEvent(makeDirtyEvent());
    expect(ev['user']).toBeUndefined();
  });

  it('scrubs exception value + frame context lines + threads (real-SDK paths)', () => {
    // The SDK puts the exception message in exception.values[].value (NOT
    // event.message) and the ContextLines integration fills context_line/
    // pre_context/post_context. Caught by the server-side real-SDK harness.
    const ev = scrubEvent({
      exception: {
        values: [
          {
            value: `boom for ${EMAIL}`,
            stacktrace: {
              frames: [
                { context_line: `auth = 'Bearer ${JWT}'`, pre_context: [`e = '${EMAIL}'`], vars: { x: EMAIL } },
              ],
            },
          },
        ],
      },
      threads: { values: [{ stacktrace: { frames: [{ context_line: `t = 'Bearer ${JWT}'`, vars: { y: EMAIL } }] } }] },
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

  it('preserves safe fields + correlation id', () => {
    const ev = scrubEvent(makeDirtyEvent());
    const json = JSON.stringify(ev);
    expect(ev['platform']).toBe('react-native');
    expect(json).toContain('Jordan');
    expect(json).toContain(REQUEST_ID);
  });

  it('redacts PHI keys in request.data, keeps non-sensitive', () => {
    const ev = scrubEvent({ request: { data: { display_name: 'J', allergies: ['x'], email: EMAIL } } });
    const data = (ev['request'] as { data: Record<string, unknown> }).data;
    expect(data['display_name']).toBe('J');
    expect(data['allergies']).toBe('[REDACTED]');
    expect(data['email']).toBe('[REDACTED]');
  });

  it('drops request cookies + query_string, strips url uuid', () => {
    const ev = scrubEvent({
      request: { url: `https://x.app/u/${URL_USER_UUID}?email=${EMAIL}`, cookies: { s: '1' }, query_string: 'a=b' },
    });
    const req = ev['request'] as Record<string, unknown>;
    expect('cookies' in req).toBe(false);
    expect('query_string' in req).toBe(false);
    expect(req['url']).not.toContain(URL_USER_UUID);
    expect(req['url']).not.toContain('?');
  });

  it('does not throw on cyclic data or non-object input', () => {
    const cyclic: Record<string, unknown> = { email: EMAIL };
    cyclic['self'] = cyclic;
    expect(() => scrubEvent({ request: { data: cyclic } })).not.toThrow();
    expect(() => scrubEvent(null as unknown as ScrubbableEvent)).not.toThrow();
  });
});
