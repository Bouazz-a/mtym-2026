import type { Round } from "@/types";

/**
 *  Input cleaning and normalization
 *
 */

// ================== People ==================

// Trim, collapse internal whitespace, remove control chars
export function sanitizeName(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Trim + lowercase. Does NOT validate format
export function sanitizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// Keep digits and a single leading "+". Returns "" if no digits remain
export function sanitizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

// ================== Teams ==================

// "aknD" -> "AKND", "École123" -> "ECOL"
// Returns 0..4 chars. Length < 4 means input was invalid — caller checks.
export function sanitizeQuadrigramme(input: string): string {
  return stripAccents(input)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

export function sanitizeTeamName(input: string): string {
  return sanitizeName(input).slice(0, 80);
}

// ================== Pools & passages ==================

// "a1" -> "A1", "B 2" -> "B2", "garbage" -> ""
export function sanitizePoolLabel(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  const match = cleaned.match(/^([A-Z])(\d+)$/);
  if (!match) return "";
  return `${match[1]}${match[2]}`;
}

// Round 1: A1, A2, A3... | Round 2: B1, B2, B3...
export function buildPoolLabel(round: Round, poolIndexInRound: number): string {
  const letter = round === 1 ? "A" : "B";
  return `${letter}${poolIndexInRound + 1}`;
}

// "A1" + 0 -> "A1P1"
export function buildPassageLabel(
  poolLabel: string,
  passageIndex: number,
): string {
  return `${poolLabel}P${passageIndex + 1}`;
}

// ================== File names ==================

// For user-provided originalName before storage.
// Strips path separators, illegal Windows chars, control chars.
export function sanitizeFileName(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 200);
}

// ================== Helpers ==================

// "École" -> "Ecole" — removes diacritics via Unicode normalization
export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
