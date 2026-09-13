/**
 * Base class for all service errors.
 */

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// The user is authenticated but lacks the permission to perform the action.
export class ForbiddenError extends ServiceError {
  constructor(message = "Action non autorisée.") {
    super(message);
  }
}

// A referenced entity (team, participant, document, ...) does not exist.
export class NotFoundError extends ServiceError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} introuvable (id: ${id}).` : `${entity} introuvable.`);
  }
}

// A precondition was not met (e.g. deadline passed, document already locked,
// invalid state transition). Use when the operation cannot proceed for a
// business reason that's not a per-field validation.
export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message);
  }
}

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
export class UnauthorizedError extends ServiceError {
  constructor(message = "Authentification requise ou expirée.") {
    super(message);
  }
}
