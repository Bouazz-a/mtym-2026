import { GUIDE_VERSION } from "./guideContent";

// Whether a juror has already been through the guide, on this device. A
// convenience only: storage can be unavailable (private mode…), and then
// the guide simply offers itself again.

const key = (userId: string) => `mtym-jury.guide.v${GUIDE_VERSION}:${userId}`;

export function hasSeenGuide(userId: string): boolean {
  try {
    return window.localStorage.getItem(key(userId)) === "done";
  } catch {
    return false;
  }
}

export function markGuideSeen(userId: string): void {
  try {
    window.localStorage.setItem(key(userId), "done");
  } catch {
    // storage unavailable: the guide will start again next time
  }
}
