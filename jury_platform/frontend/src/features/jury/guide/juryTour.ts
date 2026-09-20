import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { PLANNING_STEPS, PRACTICE_STEPS, START_PRACTICE_LABEL, type GuideStep } from "./guideContent";
import { markGuideSeen } from "./guideStorage";

// The guided tour itself (driver.js, loaded on demand by useJuryGuide).
// Two parts: "planning" on Mon planning, ending on the practice passage,
// and "practice" there. Steps point at `data-tour` anchors; a step whose
// anchor isn't on the page (a single day, no passage yet…) is left out.

export type GuidePart = "planning" | "practice";

let active: Driver | null = null;

const selector = (anchor: string) => `[data-tour="${anchor}"]`;

// Practice steps living in the Rapport écrit tab; every other one is in Oral
const REPORT_TAB_ANCHORS = new Set(["report-viewer"]);
const ORAL_TAB_ANCHORS = new Set(["grading-card", "score", "coef", "comment", "note", "save"]);

// Shows the tab a step lives in (a hidden tab's elements can't be
// highlighted). Returns whether it had to switch.
function showTabFor(step: GuideStep | undefined): boolean {
  const tab = step?.anchor && REPORT_TAB_ANCHORS.has(step.anchor) ? "Rapport écrit"
    : step?.anchor && ORAL_TAB_ANCHORS.has(step.anchor) ? "Oral"
    : null;
  if (!tab) return false;
  const button = [...document.querySelectorAll<HTMLButtonElement>(`${selector("tabs")} button`)]
    .find((b) => b.textContent?.trim() === tab);
  const current = new URLSearchParams(window.location.search).get("onglet") === "rapport" ? "Rapport écrit" : "Oral";
  if (!button || current === tab) return false;
  button.click();
  return true;
}

export function startJuryTour(
  part: GuidePart,
  { userId, navigate, onEnd }: { userId: string; navigate: (to: string) => void; onEnd?: () => void },
) {
  active?.destroy();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const guide = (part === "planning" ? PLANNING_STEPS : PRACTICE_STEPS)
    .filter((s) => !s.anchor || document.querySelector(selector(s.anchor)));

  // Moving to a step first shows its tab, and waits a moment when it had to
  // switch so the step's element is laid out before it's highlighted.
  const go = (index: number, move: () => void) => {
    if (showTabFor(guide[index])) window.setTimeout(move, 120);
    else move();
  };

  const steps: DriveStep[] = guide.map((s, i) => {
    const last = i === guide.length - 1;
    return {
      element: s.anchor ? selector(s.anchor) : undefined,
      popover: {
        title: s.title,
        description: s.text,
        ...(s.side && { side: s.side }),
        ...(s.align && { align: s.align }),
        ...(last && part === "planning" && { doneBtnText: START_PRACTICE_LABEL }),
        onNextClick: (_el, _step, { driver: d }) => {
          if (last) {
            d.destroy();
            if (part === "planning") navigate("/entrainement?guide=1");
            return;
          }
          go(i + 1, () => d.moveNext());
        },
        onPrevClick: (_el, _step, { driver: d }) => go(i - 1, () => d.movePrevious()),
      },
    };
  });

  active = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Suivant",
    prevBtnText: "Précédent",
    doneBtnText: "Terminer",
    popoverClass: "mtym-tour",
    overlayColor: "#122019",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 0,
    animate: !reduceMotion,
    smoothScroll: !reduceMotion,
    allowClose: true,
    // Re-measure once the step has settled: a tab switch changing the page's
    // height can move the element after the bubble was placed.
    onHighlighted: (_el, _step, { driver: d }) => {
      window.setTimeout(() => {
        if (d.isActive()) d.refresh();
      }, 350);
    },
    onDestroyed: () => {
      window.removeEventListener("scroll", onScrollSettled);
      window.clearTimeout(settleTimer);
      active = null;
      // Finished or closed, the guide counts as seen: it won't start by
      // itself again (the account menu can replay it).
      markGuideSeen(userId);
      onEnd?.();
    },
  });
  active.drive();
  // The bubble is placed from the element's position at that instant, so it
  // lags behind the scroll that brings the element into view — and behind a
  // sticky element (the report beside the grid), which moves on its own.
  // Re-placing it once the page stops moving keeps the two together.
  window.addEventListener("scroll", onScrollSettled, { passive: true });
}

let settleTimer: number | undefined;
function onScrollSettled() {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    if (active?.isActive()) active.refresh();
  }, 150);
}

export function stopJuryTour() {
  active?.destroy();
}
