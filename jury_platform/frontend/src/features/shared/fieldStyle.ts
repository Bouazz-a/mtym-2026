import type { CSSProperties } from "react";

// The look of every text field, list and number input: white, hairline
// border, square corners. The focus ring comes from the .focus-ring class.
export const FIELD_STYLE: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--ink)",
  borderRadius: 2,
};
