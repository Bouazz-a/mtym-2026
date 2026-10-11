import { useReducedMotion, type Transition, type Variants } from "framer-motion";

// The spring behind the sliding indicators (Segmented, the top bar's
// current page): quick, no bounce; instant with reduced motion
export function useSlide(): Transition {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.8 };
}

// What unrolls on demand (the jurors' aide-mémoire, the detail under a table
// row): opening, the frame unrolls and its parts settle into place one after
// the other, in reading order, each dropping a few pixels as it appears;
// closing, the parts fade together and the frame rolls back up, faster. All
// at once with reduced motion.
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

export const unrollFrame = (reduce: boolean): Variants => ({
  closed: { height: 0, transition: reduce ? { duration: 0 } : { duration: 0.26, ease: EASE_IN } },
  open: {
    height: "auto",
    transition: reduce ? { duration: 0 } : { duration: 0.46, ease: EASE_OUT, staggerChildren: 0.055, delayChildren: 0.05 },
  },
});

export const unrollPart = (reduce: boolean): Variants => ({
  closed: { opacity: 0, y: reduce ? 0 : -10, transition: { duration: reduce ? 0 : 0.1 } },
  open: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.36, ease: EASE_OUT } },
});

// The turn of the chevron that says whether it is unrolled
export const CHEVRON_TURN = "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)";
