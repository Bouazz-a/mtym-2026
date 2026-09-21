import { describe, expect, it } from "vitest";
import { buildPoolSheets } from "./poolsExport";
import type { CenterDay, PoolDetails, Team } from "@/types";

const SCHEDULE = [
  { start: "13:15", minutes: 60 },
  { start: "14:30", minutes: 60 },
  { start: "16:00", minutes: 60 },
  { start: "17:15", minutes: 60 },
];

const day = (id: string, date: string): CenterDay => ({
  id,
  center: "casablanca",
  date,
  schedule: SCHEDULE,
  _count: { teams: 0, pools: 0 },
});

const team = (id: string, quadrigram: string, dayId: string): Team => ({
  id,
  sourceId: 1,
  name: `Équipe ${quadrigram}`,
  quadrigram,
  center: "casablanca",
  members: [{ firstName: "A", lastName: "B" }],
  centerDayId: dayId,
  reports: [],
});

// A drawn pool of `size` teams, rotating the roles like the real draw
const pool = (label: string, dayId: string, ids: string[], room = "Amphi A"): PoolDetails => ({
  id: `pool-${label}`,
  label,
  round: 1,
  centerDayId: dayId,
  centerDay: day(dayId, "2026-10-24"),
  passages: ids.map((_, i) => ({
    id: `${label}P${i + 1}`,
    label: `${label}P${i + 1}`,
    problemNumber: i + 1,
    poolId: `pool-${label}`,
    defenderTeamId: ids[i],
    opponentTeamId: ids[(i + 1) % ids.length],
    reporterTeamId: ids[(i + 2) % ids.length],
    extraTeamId: ids.length === 4 ? ids[(i + 3) % ids.length] : null,
    slot: i + 1,
    room,
    duo: null,
  })),
});

const rowStartingWith = (rows: (string | number | null)[][], text: string) =>
  rows.find((r) => typeof r[0] === "string" && r[0].startsWith(text));

describe("buildPoolSheets", () => {
  const d1 = day("day-1", "2026-10-24");
  const d2 = day("day-2", "2026-10-25");
  const teams = [
    team("t1", "ALFA", "day-1"), team("t2", "BETA", "day-1"),
    team("t3", "GAMA", "day-1"), team("t4", "DELT", "day-1"),
    team("t5", "PIQU", "day-2"), team("t6", "TPFT", "day-2"), team("t7", "LSDP", "day-2"),
  ];
  const pools = [
    pool("CAS-A1", "day-1", ["t1", "t2", "t3", "t4"]),
    pool("CAS-B1", "day-2", ["t5", "t6", "t7"]),
  ];
  const sheets = buildPoolSheets("casablanca", [d1, d2], pools, teams);

  it("makes one sheet per day, named after it", () => {
    expect(sheets).toHaveLength(2);
    expect(sheets[0].name).toMatch(/^J1 · /);
    expect(sheets[1].name).toMatch(/^J2 · /);
    expect(sheets.every((s) => s.name.length <= 31)).toBe(true);
  });

  it("heads each sheet with the center, the day and what it holds", () => {
    expect(sheets[0].rows[0][0]).toBe("MTYM 2026 · Qualifications");
    expect(sheets[0].rows[1][0]).toContain("Casablanca");
    expect(sheets[0].rows[1][0]).toContain("1 poule");
    expect(sheets[0].rows[1][0]).toContain("4 équipes");
  });

  it("opens a block per pool, with the columns of the screen", () => {
    const { rows } = sheets[0];
    const titleAt = rows.findIndex((r) => r[0] === "Poule CAS-A1");
    expect(titleAt).toBeGreaterThan(0);
    expect(rows[titleAt + 1]).toEqual([
      "Passage", "Horaire", "Salle", "Problème", "Défenseur", "Opposant", "Rapporteur", "Observateur",
    ]);
  });

  it("writes one row per passage, in slot order, with the day's hours", () => {
    const { rows } = sheets[0];
    const first = rowStartingWith(rows, "P1")!;
    expect(first).toEqual(["P1", "13:15 – 14:15", "Amphi A", 1, "ALFA", "BETA", "GAMA", "DELT"]);
    expect(rowStartingWith(rows, "P4")![1]).toBe("17:15 – 18:15");
  });

  it("leaves the observer empty in a pool of 3", () => {
    const row = rowStartingWith(sheets[1].rows, "P1")!;
    expect(row[4]).toBe("PIQU");
    expect(row[7]).toBe(""); // no observer
  });

  it("merges every title across the block", () => {
    const { rows, merges } = sheets[0];
    const titleAt = rows.findIndex((r) => r[0] === "Poule CAS-A1");
    expect(merges).toContainEqual({ s: { r: titleAt, c: 0 }, e: { r: titleAt, c: 7 } });
  });

  it("ends with the teams of the day", () => {
    const { rows } = sheets[0];
    const at = rows.findIndex((r) => r[0] === "Équipes du jour");
    expect(rows[at + 1]).toEqual(["Quadrigramme", "Équipe", "Membres"]);
    expect(rows[at + 2]).toEqual(["ALFA", "Équipe ALFA", "A B"]);
  });

  it("shows a pool still being composed, holes and all", () => {
    const draft: PoolDetails = {
      id: "pool-draft",
      label: "CAS-A5",
      round: 1,
      centerDayId: "day-1",
      centerDay: d1,
      passages: [],
      draft: {
        size: 3,
        passages: [
          { slot: 1, problemNumber: 2, defenderTeamId: "t1", opponentTeamId: null, reporterTeamId: null, extraTeamId: null, room: null },
          { slot: 2, problemNumber: 3, defenderTeamId: null, opponentTeamId: null, reporterTeamId: null, extraTeamId: null, room: null },
          { slot: 3, problemNumber: 4, defenderTeamId: null, opponentTeamId: null, reporterTeamId: null, extraTeamId: null, room: null },
        ],
      },
    };
    const [sheet] = buildPoolSheets("casablanca", [d1], [draft], teams);
    expect(sheet.rows.some((r) => r[0] === "Poule CAS-A5 · brouillon")).toBe(true);
    expect(rowStartingWith(sheet.rows, "P1")).toEqual(["P1", "13:15 – 14:15", "", 2, "ALFA", "", "", ""]);
  });

  it("says so when a day has no pool", () => {
    const [sheet] = buildPoolSheets("casablanca", [d1], [], teams);
    expect(sheet.rows.some((r) => r[0] === "Aucune poule pour ce jour.")).toBe(true);
  });

  it("sizes the columns", () => {
    expect(sheets[0].cols).toHaveLength(8);
    expect(sheets[0].cols.every((c) => c.wch > 0)).toBe(true);
  });
});
