import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { GuidePart } from "./juryTour";

// Starts a part of the guided tour once `shouldStart` holds and the page
// has settled (its entrance animation moves elements around). The tour
// code (driver.js) is only downloaded then. A `guide` query parameter —
// how the account menu and part 1 ask for the tour — is removed once it
// has started. The tour is closed if the page goes away.

const SETTLE_MS = 450;

// One tour at a time: the effect below re-runs whenever the URL changes
// (setParams changes with it), and must not start the tour again.
let running = false;

export function useJuryGuide(part: GuidePart, shouldStart: boolean, userId: string | undefined) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (!shouldStart || !userId || running) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { startJuryTour } = await import("./juryTour");
      if (cancelled || running) return;
      running = true;
      started.current = true;
      startJuryTour(part, { userId, navigate, onEnd: () => { running = false; } });
      if (new URLSearchParams(window.location.search).has("guide")) {
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("guide");
          return next;
        }, { replace: true });
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [part, shouldStart, userId, navigate, setParams]);

  // Leaving the page closes the tour (if this page started one)
  useEffect(() => () => {
    if (started.current) import("./juryTour").then(({ stopJuryTour }) => stopJuryTour());
  }, []);
}
