import { useReducedMotion, type Transition } from "framer-motion";

// The spring behind the sliding indicators (Segmented, the top bar's
// current page): quick, no bounce; instant with reduced motion
export function useSlide(): Transition {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.8 };
}
