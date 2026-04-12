export { createApp, type CreateAppOptions } from './app.js';
export {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  AuditFailureError,
} from './errors.js';
export { BaseConfigSchema, type BaseConfig } from './config.js';
export { createLogger } from './logger.js';
export { createPool } from './database.js';
export { createRedis } from './redis.js';
export { writePhiAuditLog, createPhiAuditHook } from './middleware/phi-audit.js';
export { registerJwtAuth } from './middleware/jwt.js';
export {
  type PhiKeyProvider,
  EnvPhiKeyProvider,
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
} from './crypto/index.js';
