import type { GradeDrafts } from "./gradingWidgets";

// Grades typed but not saved yet, kept in this browser so a reload, a closed
// tab or a detour through another page doesn't lose them. A draft remembers
// the saved evaluation it started from (`base`) and only comes back while
// that evaluation is unchanged — saved since from elsewhere, it would
// overwrite newer grades. Storage can be unavailable (private mode…): then
// nothing is kept, and the prompt on leaving the page still warns.

export interface GradingDraft {
  base: string;
  drafts: GradeDrafts;
  remark: string;
}

const key = (id: string) => `mtym-jury.draft.v1:${id}`;

// What a draft is compared against: the saved remark and grades, or none
export function draftBase(saved: { globalRemark: string | null; grades: { criterionId: string; score: number; remark: string | null }[] } | undefined) {
  if (!saved) return "";
  const grades = saved.grades
    .map((g) => [g.criterionId, g.score, g.remark ?? ""] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([saved.globalRemark ?? "", grades]);
}

export function readDraft(id: string, base: string): GradingDraft | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<GradingDraft>;
    if (draft.base !== base || typeof draft.remark !== "string" || typeof draft.drafts !== "object" || !draft.drafts) {
      window.localStorage.removeItem(key(id)); // stale or unreadable
      return null;
    }
    return draft as GradingDraft;
  } catch {
    return null;
  }
}

export function writeDraft(id: string, draft: GradingDraft): void {
  try {
    window.localStorage.setItem(key(id), JSON.stringify(draft));
  } catch {
    // storage unavailable or full: the draft only lives in the page
  }
}

export function clearDraft(id: string): void {
  try {
    window.localStorage.removeItem(key(id));
  } catch {
    // storage unavailable: nothing was kept
  }
}
