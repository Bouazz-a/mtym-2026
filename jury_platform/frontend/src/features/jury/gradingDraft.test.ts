import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, draftBase, readDraft, writeDraft } from "./gradingDraft";

const saved = (score: number) => ({
  globalRemark: "Bien",
  grades: [
    { criterionId: "b", score: 2, remark: null },
    { criterionId: "a", score, remark: "net" },
  ],
});

describe("gradingDraft", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("compares saved evaluations by content, whatever the grade order", () => {
    const s = saved(3);
    expect(draftBase(s)).toBe(draftBase({ ...s, grades: [...s.grades].reverse() }));
    expect(draftBase(saved(3))).not.toBe(draftBase(saved(4)));
    expect(draftBase(undefined)).toBe("");
  });

  it("gives a draft back while its saved evaluation is unchanged", () => {
    const draft = { base: draftBase(saved(3)), drafts: { a: { score: 5, remark: "" } }, remark: "x" };
    writeDraft("u:oral:p:t", draft);
    expect(readDraft("u:oral:p:t", draftBase(saved(3)))).toEqual(draft);
    clearDraft("u:oral:p:t");
    expect(readDraft("u:oral:p:t", draftBase(saved(3)))).toBeNull();
  });

  it("drops a draft once the evaluation was saved since", () => {
    writeDraft("k", { base: draftBase(saved(3)), drafts: {}, remark: "" });
    expect(readDraft("k", draftBase(saved(4)))).toBeNull();
    // and it's gone for good, even against the old base
    expect(readDraft("k", draftBase(saved(3)))).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
        removeItem: () => { throw new Error("blocked"); },
      },
    });
    expect(() => writeDraft("k", { base: "", drafts: {}, remark: "" })).not.toThrow();
    expect(readDraft("k", "")).toBeNull();
    expect(() => clearDraft("k")).not.toThrow();
  });
});
