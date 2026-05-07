export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: Array<{ field: string; issue: string }> | undefined;

  public constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Array<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  public constructor(
    message = 'Validation failed',
    details?: Array<{ field: string; issue: string }>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class AuditFailureError extends AppError {
  public constructor(message = 'Audit log write failed') {
    super(message, 503, 'AUDIT_FAILURE');
  }
}

export class SubscriptionRequiredError extends AppError {
  public constructor(message = 'This feature requires a paid subscription') {
    super(message, 403, 'SUBSCRIPTION_REQUIRED');
  }
}

// Refresh-token specific 401 reason codes (Plan v5 §59 — IMPL-MOBILE-AUTH-003).
// Mobile state machine consumes envelope `error.code` to branch:
//   REFRESH_EXPIRED_OR_MISSING → silent re-issue via Cognito session
//   TOKEN_REUSE_DETECTED       → forced logout, no Cognito fallback
//   REFRESH_REVOKED            → forced logout (logout was explicit)
//   MALFORMED                  → forced logout + debug log
//   ACCOUNT_DELETED            → permanent logout, surface message

export class RefreshExpiredOrMissingError extends AppError {
  public constructor(message = 'Refresh token expired or not found') {
    super(message, 401, 'REFRESH_EXPIRED_OR_MISSING');
  }
}

export class TokenReuseDetectedError extends AppError {
  public constructor(message = 'Token reuse detected') {
    super(message, 401, 'TOKEN_REUSE_DETECTED');
  }
}

export class RefreshRevokedError extends AppError {
  public constructor(message = 'Refresh token has been revoked') {
    super(message, 401, 'REFRESH_REVOKED');
  }
}

export class MalformedRefreshError extends AppError {
  public constructor(message = 'Malformed or invalid refresh token') {
    super(message, 401, 'MALFORMED');
  }
}

export class AccountDeletedError extends AppError {
  public constructor(message = 'Account has been deleted') {
    super(message, 401, 'ACCOUNT_DELETED');
  }
}
