import type { Center, CenterDay, PoolDetails, Team } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";

// The pools of one center, laid out for a spreadsheet — one sheet per day,
// one block per pool, in the order the Tournoi page shows them. SheetJS's
// community build writes no colours or bold, so the resemblance comes from
// the layout: a merged title over each pool like a card header, the columns
// of the on-screen table, blank lines between pools, and column widths.
//
// Pure: it only builds rows, merges and widths. exportService.ts turns them
// into the workbook.

export interface SheetPlan {
  name: string; // sheet name (Excel: 31 chars max, no []:*?/\)
  rows: (string | number | null)[][];
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  cols: { wch: number }[];
}

const HEADER = ["Passage", "Horaire", "Salle", "Problème", "Défenseur", "Opposant", "Rapporteur", "Observateur"];
const WIDTHS = [10, 16, 14, 10, 14, 14, 14, 14];
const LAST_COL = HEADER.length - 1;

export function buildPoolSheets(
  center: Center,
  days: CenterDay[],
  pools: PoolDetails[],
  teams: Team[],
): SheetPlan[] {
  const quad = (id: string | null | undefined) =>
    (id ? teams.find((t) => t.id === id)?.quadrigram ?? "?" : "");

  return days.map((day, index) => {
    const dayPools = pools
      .filter((p) => p.centerDayId === day.id)
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
    const dayTeams = teams
      .filter((t) => t.centerDayId === day.id)
      .sort((a, b) => a.quadrigram.localeCompare(b.quadrigram, "fr"));

    const rows: (string | number | null)[][] = [];
    const merges: SheetPlan["merges"] = [];
    const title = (text: string) => {
      merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: LAST_COL } });
      rows.push([text]);
    };

    title("MTYM 2026 · Qualifications");
    title(
      `${centerLabel(center)} · ${formatDay(day.date)} · ${dayPools.length} poule${dayPools.length > 1 ? "s" : ""} · ${dayTeams.length} équipe${dayTeams.length > 1 ? "s" : ""}`,
    );
    rows.push([]);

    if (dayPools.length === 0) title("Aucune poule pour ce jour.");

    for (const pool of dayPools) {
      title(`Poule ${pool.label}${pool.draft ? " · brouillon" : ""}`);
      rows.push([...HEADER]);
      for (const row of passageRows(pool, day, quad)) rows.push(row);
      rows.push([]);
    }

    if (dayTeams.length > 0) {
      title("Équipes du jour");
      rows.push(["Quadrigramme", "Équipe", "Membres"]);
      for (const team of dayTeams) {
        rows.push([
          team.quadrigram,
          team.name,
          team.members.map((m) => `${m.firstName} ${m.lastName}`).join(", "),
        ]);
      }
    }

    return { name: sheetName(index, day), rows, merges, cols: WIDTHS.map((wch) => ({ wch })) };
  });
}

// One row per passage, in slot order. A pool still being composed has no
// passages yet: its grid goes in as it stands, holes included, so nothing
// disappears from the export without a word.
function passageRows(
  pool: PoolDetails,
  day: CenterDay,
  quad: (id: string | null | undefined) => string,
): (string | number | null)[][] {
  const time = (slot: number) => {
    const t = slotTime(day, slot);
    return t ? `${t.start} – ${t.end}` : "";
  };
  const lineups = pool.draft
    ? [...pool.draft.passages].sort((a, b) => a.slot - b.slot)
    : [...pool.passages].sort((a, b) => a.slot - b.slot);

  return lineups.map((p) => [
    `P${p.slot}`,
    time(p.slot),
    p.room ?? "",
    p.problemNumber,
    quad(p.defenderTeamId),
    quad(p.opponentTeamId),
    quad(p.reporterTeamId),
    quad(p.extraTeamId),
  ]);
}

// "J1 · 24 oct." — Excel refuses [ ] : * ? / \ and more than 31 characters
function sheetName(index: number, day: CenterDay): string {
  return `J${index + 1} · ${formatDay(day.date)}`.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}
