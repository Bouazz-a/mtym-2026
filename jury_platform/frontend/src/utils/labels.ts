import type { Center } from "@/types";

// Pool labels ("CAS-B1") are built by the server, like the draws themselves.

export const CENTERS: { value: Center; label: string }[] = [
  { value: "casablanca", label: "Casablanca" },
  { value: "rabat", label: "Rabat" },
  { value: "martil", label: "Martil" },
  { value: "benguerir", label: "Benguerir" },
  { value: "agadir", label: "Agadir" },
  { value: "fez", label: "Fès" },
  { value: "oujda", label: "Oujda" },
  { value: "online", label: "En ligne" },
];

// The qualifications' problems, for the menus. The server draws from its own
// copy (QUALIFS_PROBLEMS in backend/src/algorithms/poolDraw.ts): keep them equal.
export const QUALIFS_PROBLEMS = [1, 2, 3, 4];

export function centerLabel(center: Center): string {
  return CENTERS.find((c) => c.value === center)?.label ?? center;
}

// "2026-10-24" -> "sam. 24 oct."
export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
