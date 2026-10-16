// Every schedule is set in Morocco's time, whatever the center (the online
// day included): it is the organizers' clock, and the one the admin pages
// and the exports show. A juror reads their own passages on their device's
// clock instead, Morocco's time beside it when the two differ.

export const SCHEDULE_ZONE = "Africa/Casablanca";

// Morocco left UTC+1 for good on 20 September 2026 at 02:00 (01:00 UTC):
// back to GMT all year, no more change for Ramadan (decree 2.26.530). A
// browser or system whose time zone data predates it still puts Morocco at
// UTC+1, an hour off: from that moment on, Morocco's offset is set here
// instead of asked of it. Western Sahara's zone follows Morocco's.
const MOROCCO_ZONES = new Set([SCHEDULE_ZONE, "Africa/El_Aaiun"]);
const MOROCCO_ON_GMT = Date.UTC(2026, 8, 20, 1, 0);

// The zone the device is set to ("Europe/Zurich")
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const MINUTE = 60_000;

const wallParts = (zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

// Minutes a zone is ahead of UTC at an instant (Europe's change with summer
// time; Morocco's changed during Ramadan until September 2026)
function offsetAt(zone: string, instant: number): number {
  if (MOROCCO_ZONES.has(zone) && instant >= MOROCCO_ON_GMT) return 0;
  const p = Object.fromEntries(wallParts(zone).formatToParts(instant).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return (wall - Math.floor(instant / MINUTE) * MINUTE) / MINUTE;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// The instant "14:00" on "2026-10-17" stands for, in Morocco: 14:00 UTC
export function scheduleInstant(date: string, hhmm: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d) + minutesOf(hhmm) * MINUTE;
  const first = wall - offsetAt(SCHEDULE_ZONE, wall) * MINUTE;
  // Again from that guess: right even next to a change of Morocco's offset
  return wall - offsetAt(SCHEDULE_ZONE, first) * MINUTE;
}

export interface ZonedTime {
  time: string; // "15:00"
  dayShift: number; // its date minus the schedule's: 1 when it falls on the next day there
}

// A schedule time, read on another clock
// (through offsetAt, so a device set to Morocco gets Morocco's hours even
// when its own time zone data is out of date)
export function timeIn(zone: string, date: string, hhmm: string): ZonedTime {
  const instant = scheduleInstant(date, hhmm);
  const wall = new Date(instant + offsetAt(zone, instant) * MINUTE);
  const [y, m, d] = date.split("-").map(Number);
  const dayShift = Math.round((Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - Date.UTC(y, m - 1, d)) / (1440 * MINUTE));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { time: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`, dayShift };
}

// Minutes a zone is ahead of Morocco on a day, at noon: 120 for Switzerland
// in summer time, 60 in winter, 0 for Morocco itself
export function gapWithSchedule(zone: string, date: string): number {
  const noon = scheduleInstant(date, "12:00");
  return offsetAt(zone, noon) - offsetAt(SCHEDULE_ZONE, noon);
}
