import type { Account, Center, CenterDay, MailingBoard, OralEvaluation, PassageDetails, PoolDetails, ReportAssignmentBoard, Team } from "@/types";
import { QUALIFS_PROBLEMS } from "@/utils/labels";
import { choiceRank } from "@/utils/teams";

// The admin dashboard's figures, computed from what the other pages already
// load (teams, days, pools, report assignments, oral grades). Pure: the page
// only draws them. Every figure follows the center filter (null: all).

export interface DashboardData {
  teams: Team[];
  days: CenterDay[];
  pools: PoolDetails[];
  board?: ReportAssignmentBoard; // undefined while loading
  orals?: OralEvaluation[];
}

// The data of one center, or everything
export function scoped(data: DashboardData, center: Center | null): DashboardData {
  if (!center) return data;
  const teams = data.teams.filter((t) => t.center === center);
  const teamIds = new Set(teams.map((t) => t.id));
  const pools = data.pools.filter((p) => p.centerDay?.center === center);
  const passageIds = new Set(pools.flatMap((p) => p.passages.map((x) => x.id)));
  return {
    teams,
    days: data.days.filter((d) => d.center === center),
    pools,
    board: data.board && { ...data.board, reports: data.board.reports.filter((r) => teamIds.has(r.teamId)) },
    orals: data.orals?.filter((o) => passageIds.has(o.passageId)),
  };
}

export interface Progress {
  done: number;
  total: number;
}

export const ratio = ({ done, total }: Progress) => (total > 0 ? Math.min(1, done / total) : 0);

const passagesOf = (pools: PoolDetails[]) => pools.flatMap((p) => p.passages);

const teamsInPools = (pools: PoolDetails[]) =>
  new Set(passagesOf(pools).flatMap((p) => [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId].filter((id): id is string => Boolean(id))));

// Every juror of a passage's duo grades its three teams
export function oralProgress(passages: PassageDetails[], orals: OralEvaluation[]): Progress {
  const ids = new Set(passages.map((p) => p.id));
  return {
    done: orals.filter((o) => ids.has(o.passageId)).length,
    total: passages.reduce((sum, p) => sum + (p.duo?.members.length ?? 0) * 3, 0),
  };
}

// ─── The tournament's stages ─────────────────────────────────────────

export interface Stage extends Progress {
  key: string;
  label: string;
  to: string; // the page where it moves forward
  loading?: boolean; // its data hasn't arrived yet
}

export function stages(d: DashboardData, centerQuery: string): Stage[] {
  const passages = passagesOf(d.pools);
  const inPools = teamsInPools(d.pools);
  const withDay = d.teams.filter((t) => t.centerDayId);
  const daysWithTeams = d.days.filter((day) => d.teams.some((t) => t.centerDayId === day.id));
  const reports = d.board?.reports ?? [];
  const assigned = reports.filter((r) => r.accountId);
  const orals = oralProgress(passages, d.orals ?? []);
  return [
    { key: "days", label: "Équipes réparties sur un jour", done: withDay.length, total: d.teams.length, to: `/tournoi${centerQuery}` },
    { key: "pools", label: "Équipes placées en poule", done: withDay.filter((t) => inPools.has(t.id)).length, total: withDay.length, to: `/tournoi${centerQuery}` },
    { key: "draws", label: "Tirages validés", done: daysWithTeams.filter((day) => day.drawValidatedAt).length, total: daysWithTeams.length, to: `/tournoi${centerQuery}` },
    { key: "duos", label: "Passages avec un duo", done: passages.filter((p) => p.duo).length, total: passages.length, to: `/jury${centerQuery}` },
    { key: "assigned", label: "Rapports attribués", done: assigned.length, total: reports.length, to: "/rapports", loading: !d.board },
    { key: "graded", label: "Rapports corrigés", done: assigned.filter((r) => r.graded).length, total: assigned.length, to: "/rapports", loading: !d.board },
    { key: "orals", label: "Oraux notés", ...orals, to: "/notes", loading: !d.orals },
  ];
}

// ─── Problems ────────────────────────────────────────────────────────

export interface ProblemRow {
  problem: number;
  defended: number; // passages where it is defended
  firstChoice: number; // teams in a pool ranking it first: what the draw had to follow
  reports: number; // teams that filed a report on it
  missing: number; // teams that haven't
}

export function problemRows(teams: Team[], pools: PoolDetails[]): ProblemRow[] {
  const passages = passagesOf(pools);
  const inPools = teamsInPools(pools);
  return QUALIFS_PROBLEMS.map((problem) => {
    const reports = teams.filter((t) => t.reports.some((r) => r.problemNumber === problem)).length;
    return {
      problem,
      defended: passages.filter((p) => p.problemNumber === problem).length,
      firstChoice: teams.filter((t) => inPools.has(t.id) && t.problemRanking[0] === problem).length,
      reports,
      missing: teams.length - reports,
    };
  });
}

// Which of its choices each defender plays: 1 to 4, or null when the team
// gave no ranking
export function choiceCounts(teams: Team[], pools: PoolDetails[]): { rank: number | null; count: number }[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const ranks = passagesOf(pools).map((p) => choiceRank(byId.get(p.defenderTeamId), p.problemNumber));
  return [1, 2, 3, 4, null].map((rank) => ({ rank, count: ranks.filter((r) => r === rank).length }));
}

// ─── Days ────────────────────────────────────────────────────────────

// "2026-09-30", in the viewer's time zone
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

// "Aujourd'hui", "Demain", "Dans 3 jours", "Hier", "Il y a 3 jours"
export function countdown(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return "Demain";
  if (n === -1) return "Hier";
  return n > 0 ? `Dans ${n} jours` : `Il y a ${-n} jours`;
}

// The days by date (then center); the one to show first is today's, or
// the next one, or the last one when all are past
export function dayOrder(days: CenterDay[], today: string): { days: CenterDay[]; focus: number } {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.center.localeCompare(b.center));
  const next = sorted.findIndex((d) => d.date >= today);
  return { days: sorted, focus: next === -1 ? Math.max(0, sorted.length - 1) : next };
}

export interface DayCheck extends Progress {
  key: string;
  label: string;
  note?: string;
  state: "done" | "todo" | "later"; // later: can't move before an earlier step
  to: string;
  loading?: boolean;
}

// What stands between a day and its competition. `today` ("YYYY-MM-DD"):
// the orals only open on the day itself.
export function dayChecks(day: CenterDay, d: DashboardData, mailings?: MailingBoard, today?: string): DayCheck[] {
  const q = `?centre=${day.center}&jour=${day.id}`;
  const teams = d.teams.filter((t) => t.centerDayId === day.id);
  const pools = d.pools.filter((p) => p.centerDayId === day.id);
  const passages = passagesOf(pools);
  const inPools = teamsInPools(pools);
  const validated = Boolean(day.drawValidatedAt);
  const teamIds = new Set(teams.map((t) => t.id));
  const reports = (d.board?.reports ?? []).filter((r) => teamIds.has(r.teamId));
  const assigned = reports.filter((r) => r.accountId);
  const state = (p: Progress, ready = true): DayCheck["state"] => (!ready ? "later" : p.total > 0 && p.done >= p.total ? "done" : "todo");

  const placed = { done: teams.filter((t) => inPools.has(t.id)).length, total: teams.length };
  const draw = { done: validated ? 1 : 0, total: 1 };
  const duos = { done: passages.filter((p) => p.duo).length, total: passages.length };
  const mailed = mailings
    ? { done: mailings.teams.filter((t) => t.status === "sent").length, total: mailings.teams.filter((t) => t.inPool).length }
    : { done: 0, total: 0 };
  const graded = { done: assigned.filter((r) => r.graded).length, total: assigned.length };
  const orals = oralProgress(passages, d.orals ?? []);
  const unassigned = reports.length - assigned.length;

  const oralsOpen = !today || day.date <= today;

  return [
    {
      key: "pools", label: "Équipes en poule", ...placed, state: state(placed, teams.length > 0), to: `/tournoi${q}`,
      note: teams.length === 0 ? "aucune équipe ce jour" : undefined,
    },
    {
      key: "draw", label: "Tirage validé", ...draw, state: state(draw, passages.length > 0), to: `/tournoi${q}`,
      note: validated ? `par ${day.drawValidatedBy ?? "?"}` : passages.length > 0 ? "à valider" : "pas encore de poule",
    },
    { key: "duos", label: "Passages avec un duo", ...duos, state: state(duos, passages.length > 0), to: `/jury${q}` },
    {
      key: "mail", label: "Convocations envoyées", ...mailed, state: state(mailed, validated), to: `/convocations${q}`,
      loading: validated && !mailings, note: validated ? undefined : "après la validation",
    },
    {
      key: "reports", label: "Rapports corrigés", ...graded, state: state(graded, validated && assigned.length > 0), to: "/rapports",
      loading: !d.board,
      note: !validated ? "après la validation" : assigned.length === 0 ? "pas encore attribués" : unassigned > 0 ? `${unassigned} sans juré` : undefined,
    },
    {
      key: "orals", label: "Oraux notés", ...orals, state: state(orals, orals.total > 0 && oralsOpen), to: "/notes", loading: !d.orals,
      note: orals.total > 0 && !oralsOpen ? "le jour même" : undefined,
    },
  ];
}

// ─── Jurors ──────────────────────────────────────────────────────────

export interface JurorLoad {
  id: string;
  name: string;
  assigned: number; // reports handed to them
  graded: number;
  passages: number; // passages their duo judges
}

export function jurorLoads(accounts: Account[], d: DashboardData): JurorLoad[] {
  const reports = d.board?.reports ?? [];
  const passages = passagesOf(d.pools);
  return accounts
    .filter((a) => a.isJuror)
    .map((a) => {
      const mine = reports.filter((r) => r.accountId === a.id);
      return {
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        assigned: mine.length,
        graded: mine.filter((r) => r.graded).length,
        passages: passages.filter((p) => p.duo?.members.some((m) => m.id === a.id)).length,
      };
    })
    .filter((j) => j.assigned + j.passages > 0);
}

export type JurorSort = "left" | "load" | "name";

export function sortJurors(jurors: JurorLoad[], by: JurorSort): JurorLoad[] {
  const byName = (a: JurorLoad, b: JurorLoad) => a.name.localeCompare(b.name, "fr");
  return [...jurors].sort((a, b) =>
    by === "name" ? byName(a, b)
    : by === "load" ? b.assigned + b.passages - (a.assigned + a.passages) || byName(a, b)
    : b.assigned - b.graded - (a.assigned - a.graded) || byName(a, b));
}

// ─── Journal ─────────────────────────────────────────────────────────

// "à l'instant", "il y a 5 min", "il y a 3 h", "hier", "il y a 4 j"
export function since(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} j`;
}
