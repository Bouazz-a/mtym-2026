// Copies the eligible teams out of the main site's dump into the jury
// platform. Run through scripts/import-dump.sh, which first loads the dump
// into the throwaway `mainsite_import` database on the same server.
//
// Eligible = teams.status APPROVED + intermediate report PASS + a
// qualification center. Re-runnable: teams are matched on the main site's
// team id (sourceId), and only names are kept from `users`.
import "dotenv/config";
import { Center, PrismaClient } from "@prisma/client";
import { teamsOf } from "../src/services/passages";

const SOURCE_DB = "mainsite_import";
// Which main-site report the jury grades for each team × problem:
//   AUTO (default)        the FINAL report when there is one, otherwise the
//                         INTERMEDIATE one — it stands in until finals are in
//   FINAL / INTERMEDIATE  only that type
const REPORT_MODE = (process.env.REPORT_MODE ?? "AUTO").toUpperCase();
if (!["AUTO", "FINAL", "INTERMEDIATE"].includes(REPORT_MODE)) {
  throw new Error(`REPORT_MODE must be AUTO, FINAL or INTERMEDIATE, got "${REPORT_MODE}"`);
}
const CENTERS = new Set<string>(Object.values(Center));

interface SourceTeam {
  id: number;
  name: string | null;
  quadrigram: string | null;
  qualifCenter: string;
}
interface SourceMember {
  teamId: number;
  firstName: string | null;
  lastName: string | null;
}
interface SourceReport {
  teamId: number;
  reportType: string;
  problemNumber: number | null;
  fileUrl: string | null;
}

function sourceUrl(): string {
  if (process.env.SOURCE_DATABASE_URL) return process.env.SOURCE_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${SOURCE_DB}`;
  return url.toString();
}

async function readSource(src: PrismaClient) {
  // ::text casts: on the real main-site schema these columns are enums,
  // which Prisma's raw queries can't deserialize.
  const teams = await src.$queryRaw<SourceTeam[]>`
    SELECT t.id, t.name, t.quadrigram, t."qualifCenter"::text AS "qualifCenter"
    FROM teams t
    WHERE t.status::text = 'APPROVED'
      AND t."qualifCenter" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_reviews r
        WHERE r."teamId" = t.id AND r."intermediateReportDecision"::text = 'PASS'
      )
    ORDER BY t.id`;
  const ids = teams.map((t) => t.id);

  const members = await src.$queryRaw<SourceMember[]>`
    SELECT "teamId", "firstName", "lastName" FROM users
    WHERE "teamId" = ANY(${ids})
    ORDER BY "lastName", "firstName"`;

  const reports = await src.$queryRaw<SourceReport[]>`
    SELECT "teamId", "reportType"::text AS "reportType", "problemNumber", "fileUrl" FROM team_reports
    WHERE "reportType"::text IN ('FINAL', 'INTERMEDIATE') AND "teamId" = ANY(${ids})`;

  return { teams, members, reports: pickReports(reports) };
}

// One report per team × problem, following REPORT_MODE.
function pickReports(rows: SourceReport[]): SourceReport[] {
  if (REPORT_MODE !== "AUTO") return rows.filter((r) => r.reportType === REPORT_MODE);
  const chosen = new Map<string, SourceReport>();
  for (const r of rows) {
    const key = `${r.teamId}:${r.problemNumber}`;
    const current = chosen.get(key);
    if (!current || (current.reportType !== "FINAL" && r.reportType === "FINAL")) chosen.set(key, r);
  }
  return [...chosen.values()];
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

async function main() {
  const src = new PrismaClient({ datasources: { db: { url: sourceUrl() } } });
  const db = new PrismaClient();
  const warnings: string[] = [];

  try {
    const source = await readSource(src);
    const membersByTeam = groupBy(source.members, (m) => m.teamId);
    const reportsByTeam = groupBy(source.reports, (r) => r.teamId);

    const teams = source.teams.filter((t) => {
      if (CENTERS.has(t.qualifCenter)) return true;
      warnings.push(`team #${t.id}: unknown center "${t.qualifCenter}" — skipped`);
      return false;
    });

    // Teams already placed in a pool (or graded) must not be deleted or
    // moved to another center behind the organizers' back.
    const passages = await db.passage.findMany({
      select: { defenderTeamId: true, opponentTeamId: true, reporterTeamId: true, extraTeamId: true },
    });
    const graded = await db.reportEvaluation.findMany({ select: { teamId: true }, distinct: ["teamId"] });
    const locked = new Set<string>([...passages.flatMap(teamsOf), ...graded.map((g) => g.teamId)]);

    const existing = new Map((await db.team.findMany()).map((t) => [t.sourceId, t]));
    const stats = { created: 0, updated: 0, removed: 0, withoutReport: 0, reports: { FINAL: 0, INTERMEDIATE: 0 } as Record<string, number> };
    const kept: string[] = [];

    await db.$transaction(async (tx) => {
      for (const t of teams) {
        const center = t.qualifCenter as Center;
        const prev = existing.get(t.id);
        const members = (membersByTeam.get(t.id) ?? []).map((m) => ({
          firstName: m.firstName ?? "",
          lastName: m.lastName ?? "",
        }));
        const data = {
          name: t.name?.trim() || `Équipe #${t.id}`,
          quadrigram: t.quadrigram?.trim() ?? "",
          members,
        };

        let teamId: string;
        if (!prev) {
          teamId = (await tx.team.create({ data: { ...data, sourceId: t.id, center } })).id;
          stats.created++;
        } else {
          let centerUpdate = {};
          if (prev.center !== center) {
            if (locked.has(prev.id)) {
              warnings.push(`${data.quadrigram}: center changed ${prev.center} → ${center} on the main site, but the team is already drawn — kept in ${prev.center}`);
            } else {
              centerUpdate = { center, centerDayId: null };
            }
          }
          teamId = (await tx.team.update({ where: { id: prev.id }, data: { ...data, ...centerUpdate } })).id;
          stats.updated++;
        }

        const reports = (reportsByTeam.get(t.id) ?? []).filter((r) => {
          if (r.problemNumber && r.problemNumber >= 1 && r.problemNumber <= 4 && r.fileUrl) return true;
          warnings.push(`${data.quadrigram}: ${r.reportType} report with problem ${r.problemNumber} / file "${r.fileUrl}" — skipped`);
          return false;
        });
        for (const r of reports) {
          await tx.teamReport.upsert({
            where: { teamId_problemNumber: { teamId, problemNumber: r.problemNumber! } },
            create: { teamId, problemNumber: r.problemNumber!, fileUrl: r.fileUrl! },
            update: { fileUrl: r.fileUrl! },
          });
        }
        await tx.teamReport.deleteMany({
          where: { teamId, problemNumber: { notIn: reports.map((r) => r.problemNumber!) } },
        });
        for (const r of reports) stats.reports[r.reportType]++;
        if (!reports.length) stats.withoutReport++;
      }

      // Teams that are no longer eligible on the main site
      const eligible = new Set(teams.map((t) => t.id));
      for (const [sourceId, team] of existing) {
        if (eligible.has(sourceId)) continue;
        if (locked.has(team.id)) {
          kept.push(`${team.quadrigram} (${team.name})`);
        } else {
          await tx.team.delete({ where: { id: team.id } });
          stats.removed++;
        }
      }
    }, { timeout: 120_000 });

    const perCenter = new Map<string, number>();
    for (const t of teams) perCenter.set(t.qualifCenter, (perCenter.get(t.qualifCenter) ?? 0) + 1);

    console.log(`Eligible teams in the dump: ${teams.length}`);
    console.log(`  ${[...perCenter].sort().map(([c, n]) => `${c} ${n}`).join(" · ")}`);
    console.log(`Teams: ${stats.created} created, ${stats.updated} updated, ${stats.removed} removed (no longer eligible)`);
    const { FINAL, INTERMEDIATE } = stats.reports;
    console.log(`Reports graded (mode ${REPORT_MODE.toLowerCase()}): ${FINAL + INTERMEDIATE} — ${FINAL} final, ${INTERMEDIATE} intermediate — ${stats.withoutReport} team(s) have none yet`);
    if (kept.length) {
      console.log(`Kept although no longer eligible (already drawn or graded): ${kept.join(", ")}`);
    }
    for (const w of warnings) console.warn(`warning: ${w}`);
  } finally {
    await Promise.all([src.$disconnect(), db.$disconnect()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
