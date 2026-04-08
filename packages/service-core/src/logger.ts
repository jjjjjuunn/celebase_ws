import pino from 'pino';

const PHI_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.authorization',
  '*.cookie',
  '*.access_token',
  '*.refresh_token',
  '*.biomarkers',
  '*.height',
  '*.height_cm',
  '*.weight',
  '*.weight_kg',
  '*.body_fat_pct',
  '*.medical_conditions',
  '*.medications',
  '*.allergies',
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
