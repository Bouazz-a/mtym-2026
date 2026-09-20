import { useEffect, useState } from "react";

// Follows a CSS media query from React. Used where two arrangements are too
// different to be one layout with utility classes — showing/hiding with CSS
// would leave both in the DOM, and the guided tour would then highlight the
// hidden one.

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange(); // the query may have changed between render and effect
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
