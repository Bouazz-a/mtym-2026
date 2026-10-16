import { gapWithSchedule, scheduleInstant, timeIn } from "./timeZone";

describe("a schedule time on another clock", () => {
  it("knows which instant a time in Morocco stands for", () => {
    // UTC+0 for good since 20 September 2026, whatever the runtime's time zone data says
    expect(new Date(scheduleInstant("2026-10-17", "14:00")).toISOString()).toBe("2026-10-17T14:00:00.000Z");
    expect(new Date(scheduleInstant("2026-09-20", "14:00")).toISOString()).toBe("2026-09-20T14:00:00.000Z");
    expect(new Date(scheduleInstant("2027-03-01", "14:00")).toISOString()).toBe("2027-03-01T14:00:00.000Z");
    // Before: UTC+1, except during Ramadan (UTC+0)
    expect(new Date(scheduleInstant("2026-09-13", "14:00")).toISOString()).toBe("2026-09-13T13:00:00.000Z");
    expect(new Date(scheduleInstant("2026-03-01", "14:00")).toISOString()).toBe("2026-03-01T14:00:00.000Z");
  });

  it("reads it in Switzerland two hours later in summer time, one hour after", () => {
    expect(timeIn("Europe/Zurich", "2026-10-17", "14:00")).toEqual({ time: "16:00", dayShift: 0 });
    expect(timeIn("Europe/Zurich", "2026-10-24", "17:45")).toEqual({ time: "19:45", dayShift: 0 });
    // European summer time ends on October 25, 2026
    expect(timeIn("Europe/Zurich", "2026-10-31", "14:00")).toEqual({ time: "15:00", dayShift: 0 });
    expect(timeIn("Africa/Casablanca", "2026-10-17", "14:00")).toEqual({ time: "14:00", dayShift: 0 });
  });

  it("tells when the time falls on another day there", () => {
    expect(timeIn("Asia/Tokyo", "2026-10-17", "17:45")).toEqual({ time: "02:45", dayShift: 1 });
    expect(timeIn("America/Los_Angeles", "2026-10-17", "14:00")).toEqual({ time: "07:00", dayShift: 0 });
    expect(timeIn("Pacific/Honolulu", "2026-10-17", "08:00")).toEqual({ time: "22:00", dayShift: -1 });
  });

  it("measures how far ahead of Morocco a clock is, on a given day", () => {
    expect(gapWithSchedule("Europe/Zurich", "2026-10-17")).toBe(120);
    expect(gapWithSchedule("Europe/Zurich", "2026-10-31")).toBe(60);
    expect(gapWithSchedule("Asia/Kolkata", "2026-10-17")).toBe(330);
    expect(gapWithSchedule("America/New_York", "2026-10-17")).toBe(-240);
  });

  it("never sets a device in Morocco apart from Morocco, even with stale time zone data", () => {
    expect(gapWithSchedule("Africa/Casablanca", "2026-10-17")).toBe(0);
    expect(gapWithSchedule("Africa/El_Aaiun", "2026-10-17")).toBe(0);
    // A device set to UTC to get the right clock in Morocco reads the same hours
    expect(gapWithSchedule("UTC", "2026-10-17")).toBe(0);
  });
});
