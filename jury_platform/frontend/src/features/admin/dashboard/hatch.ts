import type { CSSProperties } from "react";

// Diagonal stripes: tells a chart series apart without its color
export const hatch = (color: string): CSSProperties => ({
  backgroundColor: "var(--surface)",
  backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`,
  boxShadow: `inset 0 0 0 1.5px ${color}`,
});
