/**
 * Base class for all service errors. Pages display `message` as-is: the
 * backend already words its errors for the user.
 */

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// The user is authenticated but lacks the permission to perform the action.
export class ForbiddenError extends ServiceError {}

// A referenced entity (team, pool, account…) does not exist.
export class NotFoundError extends ServiceError {}

// A precondition was not met (e.g. a graded day can't be redrawn).
export class ConflictError extends ServiceError {}

// The request body failed backend (Zod) validation. `details` carries the
// raw per-field issues from the API, when available.
export class ValidationError extends ServiceError {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

// No valid session — missing, expired, or rejected token.
export class UnauthorizedError extends ServiceError {}

// Message to show for any failure, service error or not.
export function errorMessage(err: unknown, fallback = "Une erreur est survenue."): string {
  return err instanceof ServiceError ? err.message : fallback;
}
