import type { Team, DocumentType, Round } from "../types";
import {
  sanitizeEmail,
  sanitizeName,
  sanitizePhone,
  sanitizeQuadrigramme,
  sanitizeTeamName,
} from "./sanitize";

export type ValidationResult = { ok: true } | { ok: false; error: string };

const ok: ValidationResult = { ok: true };
const fail = (error: string): ValidationResult => ({ ok: false, error });

// =================== Quadrigram ===================

const QUAD_RE = /^[A-Z]{4}$/;

export function isValidQuadrigramme(input: string): boolean {
  return QUAD_RE.test(input);
}

export function validateQuadrigramme(input: string): ValidationResult {
  const cleaned = sanitizeQuadrigramme(input);
  if (cleaned.length === 0) return fail("Le quadrigramme est requis.");
  if (cleaned.length < 4)
    return fail("Le quadrigramme doit contenir 4 lettres.");
  if (!isValidQuadrigramme(cleaned))
    return fail(
      "Le quadrigramme doit être composé de 4 lettres majuscules (A-Z).",
    );
  return ok;
}

export function isQuadrigrammeUnique(
  input: string,
  existingTeams: Team[],
  excludedTeamId?: string,
): boolean {
  const target = sanitizeQuadrigramme(input);
  return !existingTeams.some(
    (t) => t.id !== excludedTeamId && t.quadrigramme === target,
  );
}

export function validateUniqueQuadrigramme(
  quadrigramme: string,
  existingTeams: Team[],
  excludeTeamId?: string,
): ValidationResult {
  const formatCheck = validateQuadrigramme(quadrigramme);
  if (!formatCheck.ok) return formatCheck;
  const cleaned = sanitizeQuadrigramme(quadrigramme);
  if (!isQuadrigrammeUnique(cleaned, existingTeams, excludeTeamId)) {
    return fail(`Le quadrigramme "${cleaned}" est déjà utilisé.`);
  }
  return ok;
}

// =================== email ===================

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input);
}

export function validateEmail(input: string): ValidationResult {
  const cleaned = sanitizeEmail(input);
  if (!cleaned) return fail("L'email est requis.");
  if (!isValidEmail(cleaned)) return fail("Format d'email invalide.");
  return ok;
}

// ================== Phone number ==================

export function isValidMoroccanPhone(input: string): boolean {
  if (input.startsWith("+")) return /^\+212[5-7]\d{8}$/.test(input);
  return /^0[5-7]\d{8}$/.test(input);
}

export function validatePhone(input: string): ValidationResult {
  const cleaned = sanitizePhone(input);
  if (!cleaned) return fail("Le numéro de téléphone est requis.");
  if (!isValidMoroccanPhone(cleaned)) {
    return fail(
      "Numéro invalide. Format attendu : 06XXXXXXXX ou +2126XXXXXXXX.",
    );
  }
  return ok;
}

// ================== Person & team names ==================

export function validatePersonName(
  input: string,
  fieldLabel: string,
): ValidationResult {
  const cleaned = sanitizeName(input);
  if (!cleaned) return fail(`${fieldLabel} est requis.`);
  if (cleaned.length < 2) return fail(`${fieldLabel} est trop court.`);
  if (cleaned.length > 20)
    return fail(`${fieldLabel} est trop long (20 caractères max).`);
  return ok;
}

export function validateTeamName(input: string): ValidationResult {
  const cleaned = sanitizeTeamName(input);
  if (!cleaned) return fail("Le nom d'équipe est requis.");
  if (cleaned.length < 2) return fail("Le nom d'équipe est trop court.");
  if (cleaned.length > 80)
    return fail("Le nom d'équipe est trop long (80 caractères max).");
  return ok;
}

export function isTeamNameUnique(
  name: string,
  existingTeams: Team[],
  excludeTeamId?: string,
): boolean {
  const target = sanitizeTeamName(name).toLowerCase();
  return !existingTeams.some(
    (t) =>
      t.id !== excludeTeamId &&
      sanitizeTeamName(t.name).toLowerCase() === target,
  );
}

export function validateUniqueTeamName(
  name: string,
  existingTeams: Team[],
  excludeTeamId?: string,
): ValidationResult {
  const formatCheck = validateTeamName(name);
  if (!formatCheck.ok) return formatCheck;
  const cleaned = sanitizeTeamName(name);
  if (!isTeamNameUnique(cleaned, existingTeams, excludeTeamId)) {
    return fail(`Le nom d'équipe "${cleaned}" est déjà utilisé.`);
  }
  return ok;
}

// ================== File uploads ==================

export const FILE_CONSTRAINTS = {
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: ["application/pdf"] as readonly string[],
};

export function isAllowedMimeType(
  mimeType: string,
  allowed: readonly string[] = FILE_CONSTRAINTS.allowedMimeTypes,
): boolean {
  return allowed.includes(mimeType.toLowerCase());
}

export function isWithinSizeLimit(
  sizeBytes: number,
  maxBytes: number = FILE_CONSTRAINTS.maxSizeBytes,
): boolean {
  return sizeBytes > 0 && sizeBytes <= maxBytes;
}

export function validateUploadedFile(args: {
  size: number;
  mimeType: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: readonly string[];
}): ValidationResult {
  const maxSize = args.maxSizeBytes ?? FILE_CONSTRAINTS.maxSizeBytes;
  const allowed = args.allowedMimeTypes ?? FILE_CONSTRAINTS.allowedMimeTypes;

  if (!isWithinSizeLimit(args.size, maxSize)) {
    const mb = (maxSize / (1024 * 1024)).toFixed(0);
    return fail(`Fichier trop volumineux. Taille maximale : ${mb} MB.`);
  }
  if (!isAllowedMimeType(args.mimeType, allowed)) {
    return fail(
      `Type de fichier non autorisé. Formats acceptés : ${allowed.join(", ")}.`,
    );
  }
  return ok;
}

export function isValidRound(value: unknown): value is Round {
  return value === 1 || value === 2;
}

export function isValidProblemNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

// Document types tied to a specific round (null for RI and RF, not round-specific).
export function getDocumentRound(docType: DocumentType): Round | null {
  if (docType.endsWith("_1")) return 1;
  if (docType.endsWith("_2")) return 2;
  return null;
}

export function getDocumentProblemNumber(docType: DocumentType): number | null {
  const match = docType.match(/^rapport_final_p(\d+)$/);
  return match ? Number(match[1]) : null;
}
