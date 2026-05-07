export { createApp, type CreateAppOptions } from './app.js';
export {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  AuditFailureError,
  SubscriptionRequiredError,
  RefreshExpiredOrMissingError,
  TokenReuseDetectedError,
  RefreshRevokedError,
  MalformedRefreshError,
  AccountDeletedError,
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
export { CircuitBreaker, type CircuitBreakerOptions, type BreakerState } from "./lib/circuit-breaker.js";
export { createInternalClient, type InternalClientOptions, type InternalClient } from "./lib/internal-http-client.js";
export { type JwtAuthOptions } from "./middleware/jwt.js";
