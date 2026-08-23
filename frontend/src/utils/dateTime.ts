/**
 * Parsing, formatting and comparing date/time strings.
 * All date strings are in "DD-MM-YYYY" format, all time strings are in "HH:MM" 24h format.
 * 
 */

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// ================== "DD-MM-YYYY" ==================

export function isValidDateString(input: string): boolean {
  const match = input.match(DATE_RE);
  if (!match) return false;
  const [, dd, mm, yyyy] = match.map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}

// "12-03-2008" -> Date(2008, 2, 12). Throws if invalid.
export function parseDateString(input: string): Date {
  if (!isValidDateString(input)) throw new Error(`Invalid date string: "${input}"`);
  const [, dd, mm, yyyy] = input.match(DATE_RE)!.map(Number);
  return new Date(yyyy, mm - 1, dd);
}

// Date -> "12-03-2008"
export function formatDateString(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

// "12-03-2008" -> "12 mars 2008"
export function formatDateForDisplay(input: string): string {
  if (!isValidDateString(input)) return input;
  const [, dd, mm, yyyy] = input.match(DATE_RE)!.map(Number);
  return `${dd} ${MONTHS_FR[mm - 1]} ${yyyy}`;
}

// "12-03-2008" -> "12/03/2008"
export function formatDateCompact(input: string): string {
  if (!isValidDateString(input)) return input;
  const [, dd, mm, yyyy] = input.match(DATE_RE)!;
  return `${dd}/${mm}/${yyyy}`;
}

// ================== "HH:MM" ==================

export function isValidTimeString(input: string): boolean {
  const match = input.match(TIME_RE);
  if (!match) return false;
  const [, hh, mm] = match.map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

// "14:30" -> "14h30"
export function formatTimeForDisplay(input: string): string {
  if (!isValidTimeString(input)) return input;
  const [, hh, mm] = input.match(TIME_RE)!;
  return `${hh}h${mm}`;
}

// ================== Combined ==================

// "14-06-2025" + "09:00" -> "14 juin 2025 à 09h00"
export function formatDateTimeForDisplay(dateStr: string, timeStr: string): string {
  return `${formatDateForDisplay(dateStr)} à ${formatTimeForDisplay(timeStr)}`;
}

// ================== Comparisons ==================

// Negative if a < b, positive if a > b, 0 if equal.
export function compareDateStrings(a: string, b: string): number {
  return parseDateString(a).getTime() - parseDateString(b).getTime();
}

// < 0 if past, 0 if today, > 0 if future
export function compareToToday(input: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return parseDateString(input).getTime() - today;
}

export function isPastDate(input: string): boolean {
  return compareToToday(input) < 0;
}

// ================== ISO timestamps ==================

// "2026-05-05T10:00:00Z" -> "5 mai 2026 à 10h00"
export function formatIsoForDisplay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} à ${hh}h${mm}`;
}

/**
 * Returns the current moment as an ISO 8601 UTC string, used for uploadedAt, createdAt
 * (will be removed in favor of server timestamps in the future) 
 */
export function nowIso(): string {
  return new Date().toISOString();
}