import pino from 'pino';

const PHI_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.authorization',
  '*.cookie',
  '*.access_token',
  '*.refresh_token',
  // FEAT-APPLE-REVOKE-001 — Apple one-time code + stored refresh token envelope.
  '*.apple_authorization_code',
  '*.apple_refresh_token_enc',
  '*.biomarkers',
  '*.height',
  '*.height_cm',
  '*.weight',
  '*.weight_kg',
  '*.body_fat_pct',
  '*.waist_cm',
  '*.medical_conditions',
  '*.medications',
  '*.allergies',
  '*.intolerances',
  // Non-PHI but user-entered personal data — cheap to lose from logs, rarely
  // needed for debugging. Redact by default; flip in handoff if a debug need arises.
  '*.birth_year',
  '*.sex',
  '*.activity_level',
  'DATABASE_URL',
];

export function createLogger(serviceName: string, level = 'info'): pino.Logger {
  return pino({
    name: serviceName,
    level,
    redact: {
      paths: PHI_REDACT_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  });
}
