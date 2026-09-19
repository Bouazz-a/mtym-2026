import { breakMinutes, DEFAULT_SCHEDULE, moveSlot, resizeSlot, slotTime, toMinutes } from "./schedule";

const starts = (s: { start: string }[]) => s.map((x) => x.start);

describe("day schedule", () => {
  it("gives a passage its slot's time", () => {
    expect(slotTime({ schedule: DEFAULT_SCHEDULE }, 2)).toEqual({ start: "14:30", end: "15:30" });
    expect(slotTime(null, 4)).toEqual({ start: "17:15", end: "18:15" }); // default day
    expect(slotTime({ schedule: DEFAULT_SCHEDULE }, 5)).toBeNull();
  });

  it("computes the breaks", () => {
    expect([1, 2, 3].map((i) => breakMinutes(DEFAULT_SCHEDULE, i))).toEqual([15, 30, 15]);
  });

  it("moves a slot later without touching the others while they don't overlap", () => {
    expect(starts(moveSlot(DEFAULT_SCHEDULE, 1, toMinutes("14:45")))).toEqual(["13:15", "14:45", "16:00", "17:15"]);
  });

  it("pushes later slots when a move makes them overlap", () => {
    expect(starts(moveSlot(DEFAULT_SCHEDULE, 1, toMinutes("15:30")))).toEqual(["13:15", "15:30", "16:30", "17:30"]);
  });

  it("can't start before the previous slot ends", () => {
    expect(starts(moveSlot(DEFAULT_SCHEDULE, 2, toMinutes("15:00")))).toEqual(["13:15", "14:30", "15:30", "17:15"]);
  });

  it("never pushes the day past midnight", () => {
    const late = moveSlot(DEFAULT_SCHEDULE, 0, toMinutes("23:00"));
    const last = late[3];
    expect(toMinutes(last.start) + last.minutes).toBeLessThanOrEqual(24 * 60);
  });

  it("resizes a slot and pushes the next ones if needed", () => {
    const longer = resizeSlot(DEFAULT_SCHEDULE, 0, 90);
    expect(longer[0].minutes).toBe(90);
    expect(starts(longer)).toEqual(["13:15", "14:45", "16:00", "17:15"]);
    expect(resizeSlot(DEFAULT_SCHEDULE, 0, 5)[0].minutes).toBe(15); // clamped
  });
});
