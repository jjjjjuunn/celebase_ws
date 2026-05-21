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

// 409 — a verified identity tried to sign in with an email that already
// belongs to a DIFFERENT Cognito identity (e.g. user signed up with
// email/password, then taps "Continue with Google"). Cognito federation does
// not auto-link, so we surface a structured conflict rather than violating the
// users.email UNIQUE invariant. The mobile client maps this code to guidance:
// "sign in with your original method, then link the provider in Settings."
// (IMPL-MOBILE-SOCIAL-001 — decision: 409, no auto-link.)
export class AccountExistsError extends AppError {
  public constructor(
    message = 'An account with this email already exists with a different sign-in method',
  ) {
    super(message, 409, 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER');
  }
}

// 400 — a request named a social provider (apple / google) whose verifier was
// not configured at boot (missing APPLE_BUNDLE_ID / GOOGLE_CLIENT_IDS). The
// router fails closed here instead of silently 500-ing or, worse, falling back
// to a different provider's verifier. The mobile client surfaces a generic
// "sign-in unavailable" message; operators read the structured code in logs.
// (IMPL-MOBILE-SOCIAL-NATIVE-001 — native provider dispatch.)
export class SocialProviderNotConfiguredError extends AppError {
  public constructor(provider: string) {
    super(
      `Social sign-in provider "${provider}" is not configured on this server`,
      400,
      'SOCIAL_PROVIDER_NOT_CONFIGURED',
    );
  }
}
