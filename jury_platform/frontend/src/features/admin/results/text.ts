import { frStat, strength, type Strength } from "@/lib/services/stats";

// How the Résultats page writes what its statistics count: a place, a gap
// that goes both ways, a correlation and what it tells.

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

// A team's place in a sentence: "1re", "12e" (une équipe)
export const placeText = (n: number) => (n === 1 ? "1re" : `${n}e`);

// "+3" or "−4": places won or lost, with the true minus sign of the notes
export const signedText = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

// A correlation, two decimals: "0,42", "−0,18"
export function corrText(r: number): string {
  const rounded = Math.round(r * 100) / 100;
  return `${rounded < 0 ? "−" : ""}${frStat(Math.abs(rounded), 2)}`;
}

const LINKS: Record<Strength, string> = {
  none: "aucun lien",
  weak: "lien faible",
  moderate: "lien modéré",
  strong: "lien fort",
  veryStrong: "lien très fort",
};

// What a correlation tells, in words: under 0, the two notes go opposite ways
export function linkText(r: number): string {
  const link = strength(r);
  return `${LINKS[link]}${r < 0 && link !== "none" ? ", en sens inverse" : ""}`;
}
