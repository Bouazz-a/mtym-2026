import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Variants } from "framer-motion";

// The curve of what arrives or answers a gesture: fast at first, then it
// settles (--ease-out in index.css)
const EASE_OUT_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Everything below is played by the browser's own animations (Web
// Animations); a browser without them shows everything at once
const canAnimate = () => typeof Element.prototype.animate === "function";

// A page's sections arrive one after the other from the top: each fades in
// and rises half a line, 45 ms after the one above (from the fifth on,
// together). A short fade, all at once, with reduced motion. Returns what
// cancels it.
const ARRIVAL_MS = 300;
const ARRIVAL_STEP_MS = 45;

export function arrive(sections: Element[]): () => void {
  if (!canAnimate()) return () => {};
  const reduce = reducedMotion();
  const animations = sections.map((section, i) =>
    section.animate(
      reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(0.5rem)" }, { opacity: 1, transform: "none" }],
      // It fills backwards and no further: once arrived, a section is left
      // untouched (a transform kept on it would hold the menus opened inside it)
      { duration: reduce ? 200 : ARRIVAL_MS, delay: reduce ? 0 : Math.min(i, 4) * ARRIVAL_STEP_MS, easing: reduce ? "ease-out" : EASE_OUT_CSS, fill: "backwards" },
    ),
  );
  return () => animations.forEach((animation) => animation.cancel());
}

// What marks the current choice (the dark block of a picker, the saffron line
// under the top bar's current page) slides from where it was to where it is
// now. The browser runs it by itself (Web Animations, transform only), so it
// stays smooth while the page that goes with the choice is still being drawn.
// Nothing with reduced motion.
const SLIDE_MS = 260;

export function slideFrom(el: HTMLElement, from: DOMRect | null) {
  if (!from || !from.width || !from.height || !canAnimate() || reducedMotion()) return;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const [dx, dy] = [from.left - to.left, from.top - to.top];
  const [sx, sy] = [from.width / to.width, from.height / to.height];
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  el.animate(
    [{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }],
    { duration: SLIDE_MS, easing: EASE_OUT_CSS },
  );
}

// What closes leaves with a short exit (a dialog, a menu). React takes its
// element off the page at once, so the element itself is put back where it
// was, inert, for the length of `exit`, then removed for good. `exit` starts
// the animation and returns it; null to leave at once. Nothing with reduced
// motion, nor when what it stood in is gone too (another page).
export function useLeave(ref: RefObject<HTMLElement | null>, shown: boolean, exit: ((node: HTMLElement) => Animation) | null) {
  // The exit as of the render that closes it, read once React is done
  const latest = useRef(exit);
  useLayoutEffect(() => {
    latest.current = exit;
  });

  useLayoutEffect(() => {
    const node = ref.current;
    const parent = node?.parentNode;
    if (!shown || !node || !parent) return;
    // An element put back is scrolled to its top again: keep how far each one was
    const scrolled = new Map<Element, number>();
    const onScroll = (e: Event) => {
      if (e.target instanceof Element) scrolled.set(e.target, e.target.scrollTop);
    };
    node.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll, { capture: true });
      // After React's update: really gone (StrictMode's rehearsal leaves it in place)
      queueMicrotask(() => {
        const play = latest.current;
        if (node.isConnected || !parent.isConnected || !play || !canAnimate() || reducedMotion()) return;
        // An iframe put back would load its page again
        for (const frame of node.querySelectorAll("iframe")) {
          const blank = document.createElement("div");
          blank.className = frame.className;
          blank.style.cssText = frame.style.cssText;
          frame.replaceWith(blank);
        }
        // It is only a picture of itself now: nothing in it can be reached,
        // and it answers to no name (what opens next may take its id)
        node.inert = true;
        node.removeAttribute("id");
        node.dataset.leaving = ""; // [data-leaving] in index.css: no click, no entrance replayed
        parent.appendChild(node);
        for (const [el, top] of scrolled) el.scrollTop = top;
        const remove = () => node.remove();
        try {
          play(node).finished.then(remove, remove);
        } catch {
          remove(); // whatever happens, it never stays on the page
        }
      });
    };
  }, [ref, shown]);
}

// Whether an element is off the page, counting one that is only playing its exit
export const hasLeft = (el: Element) => !el.isConnected || el.closest("[data-leaving]") !== null;

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
