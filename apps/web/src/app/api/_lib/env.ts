// Environment variable reader. Separated from session.ts to break the
// circular import between bff-fetch.ts (rate-limited HTTP client) and
// session.ts (JWT verification + protected-route wrapper). All BFF
// modules import this directly instead of re-importing via session.ts.
export function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
