import { describe, expect, it } from "vitest";
import { planDuoAssignment, type AssignPool } from "./duoAssignment";

// A day of `pools` pools of `passages` passages each (pool P1 slot 1 = "P1S1")
const day = (pools: number, passages: number, filled: Record<string, string> = {}): AssignPool[] =>
  Array.from({ length: pools }, (_, p) => ({
    id: `pool${p + 1}`,
    label: `CAS-A${p + 1}`,
    passages: Array.from({ length: passages }, (_, s) => ({
      id: `P${p + 1}S${s + 1}`,
      slot: s + 1,
      duoId: filled[`P${p + 1}S${s + 1}`] ?? null,
      locked: false,
    })),
  }));

const duos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `duo${i + 1}`, number: i + 1 }));

// duoId per passage id, after applying the plan
function applied(pools: AssignPool[], plan: ReturnType<typeof planDuoAssignment>) {
  const out = new Map<string, string | null>();
  for (const pool of pools) for (const p of pool.passages) out.set(p.id, p.duoId);
  for (const c of plan.changes) out.set(c.passageId, c.duoId);
  return out;
}

const slotOf = (id: string) => id.slice(id.indexOf("S"));
const poolOf = (id: string) => id.slice(0, id.indexOf("S"));

describe("planDuoAssignment", () => {
  it("gives every passage a duo when there are enough of them", () => {
    const pools = day(4, 4);
    const plan = planDuoAssignment(pools, duos(4), "replace");
    expect(plan.assigned).toBe(16);
    expect(plan.withoutDuo).toBe(0);
    expect(plan.changes).toHaveLength(16);
  });

  it("never puts a duo in two rooms at the same time", () => {
    const pools = day(4, 4);
    const result = applied(pools, planDuoAssignment(pools, duos(4), "replace"));
    const perSlot = new Map<string, string[]>();
    for (const [id, duoId] of result) {
      if (!duoId) continue;
      const slot = slotOf(id);
      perSlot.set(slot, [...(perSlot.get(slot) ?? []), duoId]);
    }
    for (const [, assigned] of perSlot) {
      expect(new Set(assigned).size).toBe(assigned.length);
    }
  });

  it("makes each duo judge each pool at most once when it can", () => {
    const pools = day(4, 4);
    const plan = planDuoAssignment(pools, duos(4), "replace");
    expect(plan.samePool).toBe(0);
    const result = applied(pools, plan);
    const perDuo = new Map<string, string[]>();
    for (const [id, duoId] of result) {
      if (!duoId) continue;
      perDuo.set(duoId, [...(perDuo.get(duoId) ?? []), poolOf(id)]);
    }
    for (const [, judged] of perDuo) {
      expect(new Set(judged).size).toBe(judged.length); // a Latin square
    }
  });

  it("spreads the passages evenly", () => {
    const pools = day(3, 3); // 9 passages
    const plan = planDuoAssignment(pools, duos(3), "replace");
    expect(plan.perDuo.map((d) => d.count)).toEqual([3, 3, 3]);
  });

  it("leaves passages without a duo rather than cloning one", () => {
    const pools = day(4, 4); // 16 passages, 4 in parallel each slot
    const plan = planDuoAssignment(pools, duos(2), "replace");
    expect(plan.assigned).toBe(8); // 2 duos × 4 slots
    expect(plan.withoutDuo).toBe(8);
    const result = applied(pools, plan);
    for (const slot of ["S1", "S2", "S3", "S4"]) {
      const assigned = [...result].filter(([id, duoId]) => duoId && slotOf(id) === slot).map(([, d]) => d);
      expect(new Set(assigned).size).toBe(assigned.length);
    }
  });

  it("judging a pool twice is a last resort", () => {
    // 2 pools of 4, a single duo: it can only take one passage per slot
    const pools = day(2, 4);
    const plan = planDuoAssignment(pools, duos(1), "replace");
    expect(plan.assigned).toBe(4);
    expect(plan.samePool).toBe(2); // 4 passages spread over 2 pools
  });

  it("fill mode keeps what was assigned by hand", () => {
    const pools = day(3, 3, { P1S1: "duo3", P2S2: "duo1" });
    const plan = planDuoAssignment(pools, duos(3), "fill");
    const result = applied(pools, plan);
    expect(result.get("P1S1")).toBe("duo3");
    expect(result.get("P2S2")).toBe("duo1");
    expect(plan.changes.map((c) => c.passageId)).not.toContain("P1S1");
    expect(plan.assigned).toBe(9);
    // and it works around them: duo3 isn't free elsewhere in slot 1
    const slot1 = [...result].filter(([id]) => slotOf(id) === "S1").map(([, d]) => d);
    expect(new Set(slot1).size).toBe(slot1.length);
  });

  it("replace mode reassigns everything except graded passages", () => {
    const pools = day(3, 3, { P1S1: "duo3" });
    pools[0].passages[0].locked = true;
    const plan = planDuoAssignment(pools, duos(3), "replace");
    const result = applied(pools, plan);
    expect(result.get("P1S1")).toBe("duo3");
    expect(plan.changes.some((c) => c.passageId === "P1S1")).toBe(false);
    expect(plan.assigned).toBe(9);
  });

  it("is stable: the same day always gives the same plan", () => {
    const pools = day(4, 4);
    const first = planDuoAssignment(pools, duos(5), "replace");
    const second = planDuoAssignment(pools, duos(5), "replace");
    expect(second.changes).toEqual(first.changes);
  });

  it("does nothing without duos", () => {
    const pools = day(2, 3);
    const plan = planDuoAssignment(pools, [], "replace");
    expect(plan.changes).toHaveLength(0);
    expect(plan.withoutDuo).toBe(6);
  });

  it("handles pools of 3 and 4 side by side", () => {
    const pools = [...day(2, 4), ...day(1, 3).map((p) => ({ ...p, id: "pool3", label: "CAS-A3" }))];
    const plan = planDuoAssignment(pools, duos(3), "replace");
    expect(plan.assigned).toBe(11);
    expect(plan.withoutDuo).toBe(0);
    // 11 passages over 3 pools and 3 duos: two duos judge four passages, so
    // they necessarily see one pool twice — two repeats is the best possible.
    expect(plan.samePool).toBe(2);
    expect(plan.perDuo.map((d) => d.count).sort()).toEqual([3, 4, 4]);
  });
});
