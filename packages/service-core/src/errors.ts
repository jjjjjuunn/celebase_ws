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
