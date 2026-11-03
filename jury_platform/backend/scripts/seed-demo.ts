// Fills the demo database with a whole fictional qualification phase, so
// every page has something to show: eight centers, 147 teams, the pools as
// the real draw makes them, duos, reports handed out, and nearly every note
// in (a few are left out on purpose, to show what waiting looks like).
//   scripts/demo-db.sh       builds the database, then runs this
//
// Only ever into a database whose name ends with _demo, and only while it is
// empty: it can't touch the real one. Teams, people and notes are made up.
// The same DEMO_SEED (a whole number, 2026 by default) gives the same demo.
import "dotenv/config";
import type { Center, Prisma } from "@prisma/client";
import { planDuoAssignment } from "../src/algorithms/duoAssignment";
import { generateQualifsDay, shuffle } from "../src/algorithms/poolDraw";
import { planReportAssignment } from "../src/algorithms/reportAssignment";
import { db } from "../src/db";
import { centerName, poolLabelPrefix } from "../src/services/centers";
import { validateDraw } from "../src/services/draw";
import { teamsOf } from "../src/services/passages";
import { createPools } from "../src/services/pools";
import { jurorProblems, reportPool } from "../src/services/reportPool";
import { hashPassword } from "../src/utils/passwords";

const DEMO_SUFFIX = "_demo";
// Every demo account signs in with it. Addresses end in .test: no mail can reach them.
const PASSWORD = "demo-mtym-2026";
const ADMIN = { email: "admin@demo.test", firstName: "Admin", lastName: "Démo" };

// Each center's days (when, counted in days from today, and how many teams)
// and its level: the success rate its teams turn around
const CENTERS: { center: Center; level: number; days: { offset: number; teams: number }[] }[] = [
  { center: "casablanca", level: 0.6, days: [{ offset: -9, teams: 20 }, { offset: -8, teams: 17 }] },
  { center: "rabat", level: 0.57, days: [{ offset: -9, teams: 24 }] },
  { center: "martil", level: 0.47, days: [{ offset: -16, teams: 11 }] },
  { center: "benguerir", level: 0.55, days: [{ offset: -15, teams: 15 }] },
  { center: "agadir", level: 0.5, days: [{ offset: -8, teams: 18 }] },
  { center: "fez", level: 0.52, days: [{ offset: -2, teams: 21 }] },
  { center: "oujda", level: 0.4, days: [{ offset: -2, teams: 9 }] },
  { center: "online", level: 0.5, days: [{ offset: -1, teams: 12 }] },
];

// ─── A seeded source of chance ────────────────────────────────────────

// One generator for everything, the app's own draw included (it calls
// Math.random): the same seed gives the same demo
let seed = Number(process.env.DEMO_SEED ?? 2026) | 0;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const chance = (p: number) => Math.random() < p;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
// Ids from the same source: a rebuild then hands each report to the same juror
// (the hand-out sorts on them)
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

// ─── Made-up names ────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Yasmine", "Adam", "Rayane", "Salma", "Ilyas", "Nour", "Imane", "Mehdi", "Sara", "Youssef", "Aya", "Anas", "Lina", "Omar", "Hiba",
  "Zakaria", "Kenza", "Amine", "Rim", "Ayoub", "Malak", "Taha", "Ghita", "Hamza", "Douae", "Ismail", "Meryem", "Walid", "Nada", "Reda",
];
const LAST_NAMES = [
  "Benali", "Tazi", "Bennani", "Alaoui", "Idrissi", "Chraibi", "Berrada", "Lahlou", "Ouazzani", "Sebti", "Kettani", "Filali", "Naciri",
  "Haddad", "Mansouri", "Ziani", "Rahmani", "Amrani", "Squalli", "Guessous", "Bouzidi", "Cherkaoui", "Daoudi", "Jabri", "Mekouar",
];
const TEAM_FIRST = [
  "Atlas", "Sigma", "Delta", "Omega", "Gamma", "Lambda", "Epsilon", "Kappa", "Theta", "Zeta", "Alpha", "Phi", "Tau", "Nova", "Orion",
  "Vega", "Zénith", "Cosmos", "Titan", "Pixel",
];
const TEAM_SECOND = [
  "Primes", "Vecteurs", "Fractales", "Matrices", "Intégrales", "Polynômes", "Tangentes", "Racines", "Lemmes", "Axiomes", "Ensembles",
  "Graphes", "Suites", "Limites", "Dérivées", "Asymptotes",
];
const ORAL_REMARKS = [
  "Présentation claire, bonne maîtrise du sujet.",
  "Des imprécisions dans la démonstration principale.",
  "Bonne gestion du temps, réponses convaincantes.",
  "Questions pertinentes, analyse à approfondir.",
  "Discours un peu rapide, mais le fond est solide.",
  "Intervention utile au débat, sans agressivité.",
];
const REPORT_REMARKS = [
  "Rédaction soignée, résultats bien justifiés.",
  "La question ouverte est à peine abordée.",
  "Bonne idée de départ, mais la preuve reste incomplète.",
  "Rapport rigoureux, quelques pistes intéressantes.",
  "Structure à revoir : les résultats sont difficiles à suivre.",
];

const ascii = (text: string) => text.normalize("NFD").replace(/[^A-Za-z]/g, "");
const person = () => ({ firstName: pick(FIRST_NAMES), lastName: pick(LAST_NAMES) });

// Hands out values nobody else holds: `make` is asked again until it gives a new one
function unique<T>(taken: Set<string>, make: () => T, key: (value: T) => string): T {
  for (;;) {
    const value = make();
    if (!taken.has(key(value))) {
      taken.add(key(value));
      return value;
    }
  }
}

// ─── The demo ─────────────────────────────────────────────────────────

// "2026-10-10": the day `offset` days from today
function dayAt(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset)).toISOString().slice(0, 10);
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (!database.endsWith(DEMO_SUFFIX)) {
    throw new Error(`Refusing to fill "${database}": demo data only goes into a database named *${DEMO_SUFFIX} (scripts/demo-db.sh builds it).`);
  }
  if ((await db.team.count()) + (await db.account.count()) > 0) {
    throw new Error(`"${database}" already holds data. scripts/demo-db.sh rebuilds it from scratch.`);
  }
  const criteria = await db.criterion.findMany();
  if (criteria.length === 0) throw new Error("No grading criteria yet: run `npm run db:seed` first (scripts/demo-db.sh does).");
  const oralGrid = (role: string) => criteria.filter((c) => c.type === "oral" && c.role === role);
  const reportGrid = (problem: number) => criteria.filter((c) => c.type === "report" && c.problemNumber === problem);

  const passwordHash = await hashPassword(PASSWORD);
  const emails = new Set<string>([ADMIN.email]);
  const admin = await db.account.create({ data: { ...ADMIN, passwordHash, role: "admin", isJuror: true } });
  const actor = { actorId: admin.id, actorName: `${ADMIN.firstName} ${ADMIN.lastName}`, actorEmail: ADMIN.email };
  const journal: Prisma.AuditLogCreateManyInput[] = [];
  const note = (daysFromToday: number, category: string, action: string, summary: string) =>
    journal.push({ ...actor, category, action, summary, at: new Date(Date.now() + daysFromToday * 86_400_000 + journal.length * 60_000) });

  // What the grading reads once the days are set up
  const level = new Map<string, number>(); // each team's own level
  const defends = new Map<string, number>(); // the problem it defends
  const ungraded = new Set<string>(); // passages nobody has graded yet
  const halfGraded = new Set<string>(); // passages one juror hasn't graded
  const quadrigrams = new Set<string>();
  const teamNames = shuffle(TEAM_FIRST.flatMap((a) => TEAM_SECOND.map((b) => `${a} ${b}`)));
  let sourceId = 1;

  for (const { center, level: centerLevel, days: plannedDays } of CENTERS) {
    // The center's jurors, recruited as its days need them. The admin judges in Casablanca.
    const jurorIds: string[] = center === "casablanca" ? [admin.id] : [];
    const recruit = async (count: number) => {
      while (jurorIds.length < count) {
        const who = unique(emails, () => {
          const p = person();
          return { ...p, email: `${ascii(p.firstName)}.${ascii(p.lastName)}@demo.test`.toLowerCase() };
        }, (p) => p.email);
        jurorIds.push((await db.account.create({ data: { ...who, passwordHash, role: "jury", isJuror: true } })).id);
      }
    };

    // Every day of the center exists before any draw: pool labels carry the day's letter
    const days = [];
    for (const planned of plannedDays) {
      const day = await db.centerDay.create({ data: { center, date: dayAt(planned.offset) } });
      note(planned.offset - 21, "Jours", "day.create", `Jour ajouté : ${centerName(center)} ${day.date}`);
      days.push({ ...planned, day });
    }

    for (const { day, offset, teams: teamCount } of days) {
      const name = `${centerName(center)} ${day.date}`;

      // ── Its teams, their members and their addresses
      const teams = Array.from({ length: teamCount }, () => {
        const teamName = teamNames.pop()!;
        const [first, second] = teamName.split(" ").map(ascii);
        const quadrigram = unique(quadrigrams, () => {
          const base = `${first.slice(0, 2)}${second.slice(0, 2)}`.toUpperCase();
          return quadrigrams.has(base) ? `${first[0]}${second[0]}${pick([...second.slice(1)])}${pick([...first.slice(1)])}`.toUpperCase() : base;
        }, (q) => q);
        const members = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, person);
        const id = uuid();
        level.set(id, clamp(centerLevel + gauss() * 0.15, 0.08, 0.97));
        return {
          id, sourceId: sourceId++, name: teamName, quadrigram, center, centerDayId: day.id, members,
          // Most teams ranked the problems they would like to defend
          problemRanking: chance(0.85) ? shuffle([1, 2, 3, 4]) : [],
        };
      });
      const contacts = teams.flatMap((t) => t.members.map((m, i) => ({
        teamId: t.id, ...m, email: `${ascii(m.firstName)}.${ascii(m.lastName)}.${t.quadrigram}${i + 1}@demo.test`.toLowerCase(),
      })));
      await db.team.createMany({ data: teams });
      await db.teamContact.createMany({ data: contacts });

      // ── Its pools, as the Tournoi page draws them, then validated
      const { pools: drawn, leftover } = generateQualifsDay({ teams, labelPrefix: await poolLabelPrefix(day) });
      if (leftover.length > 0) throw new Error(`${name}: ${leftover.length} team(s) left without a pool`);
      validateDraw(drawn, teams.map((t) => t.id));
      await db.$transaction((tx) => createPools(tx, day.id, drawn));
      await db.centerDay.update({ where: { id: day.id }, data: { drawValidatedAt: new Date(Date.now() + (offset - 6) * 86_400_000), drawValidatedBy: actor.actorName } });
      note(offset - 7, "Tirage", "draw.create", `Tirage de ${name} : ${drawn.length} poule(s) (${drawn.map((p) => p.label).join(", ")})`);
      note(offset - 6, "Tirage", "draw.validate", `Tirage validé pour ${name} : ${drawn.length} poule(s), ${teams.length} équipe(s) placée(s)`);
      const saved = await db.pool.findMany({ where: { centerDayId: day.id }, include: { passages: true }, orderBy: { label: "asc" } });
      for (const [i, pool] of saved.entries()) {
        await db.passage.updateMany({ where: { poolId: pool.id }, data: { room: String(101 + i) } }); // shown as "Salle 101"
        for (const p of pool.passages) defends.set(p.defenderTeamId, p.problemNumber);
      }

      // ── Their convocations, sent the day after the draw was validated
      await db.teamMailing.createMany({
        data: teams.map((t) => ({
          teamId: t.id, sentBy: actor.actorName, sentAt: new Date(Date.now() + (offset - 5) * 86_400_000),
          recipients: contacts.filter((c) => c.teamId === t.id).map((c) => c.email),
        })),
      });

      // ── What the teams filed: the report they defend, most of the others, a presentation
      await db.teamReport.createMany({
        data: teams.flatMap((t) => [1, 2, 3, 4]
          .filter((problem) => problem === defends.get(t.id) || chance(0.9))
          .map((problem) => ({ id: uuid(), teamId: t.id, problemNumber: problem, fileUrl: `reports/${t.quadrigram}/final/problem_${problem}_demo.pdf` }))),
      });
      await db.teamPresentation.createMany({
        data: teams.filter(() => chance(0.9)).map((t) => ({
          teamId: t.id, problemNumber: defends.get(t.id)!, fileUrl: `reports/${t.quadrigram}/presentation/problem_${defends.get(t.id)}_demo.pdf`,
        })),
      });

      // ── Its duos, each with a problem, then a duo for every passage: one duo
      // per pool, and at least as many as a pool has passages, so that no duo
      // has to judge the same pool twice
      const duoCount = Math.max(saved.length, ...saved.map((pool) => pool.passages.length));
      await recruit(2 * duoCount + 1);
      const seats = shuffle(jurorIds);
      const duos = [];
      for (let i = 0; i < duoCount; i++) {
        // The juror left over when the others are paired makes a duo of three
        const members = [seats[2 * i], seats[2 * i + 1], ...(i === 0 ? [seats[2 * duoCount]] : [])];
        duos.push(await db.juryDuo.create({
          data: { centerDayId: day.id, number: i + 1, problemNumber: (i % 4) + 1, members: { create: members.map((accountId) => ({ accountId })) } },
        }));
      }
      const plan = planDuoAssignment(
        saved.map((pool) => ({ id: pool.id, label: pool.label, passages: pool.passages.map((p) => ({ id: p.id, slot: p.slot, problemNumber: p.problemNumber, duoId: null, locked: false })) })),
        duos.map((d) => ({ id: d.id, number: d.number, problemNumber: d.problemNumber })),
        "replace",
      );
      for (const duo of duos) {
        await db.passage.updateMany({ where: { id: { in: plan.changes.filter((c) => c.duoId === duo.id).map((c) => c.passageId) } }, data: { duoId: duo.id } });
      }
      note(offset - 4, "Duos", "passages.duo.auto", `Attribution automatique des duos pour ${name} : ${plan.changes.length} passages modifiés`);

      // ── Left waiting on purpose: one pool nobody has graded, one passage a juror still owes
      if (center === "online") for (const p of saved[saved.length - 1].passages) ungraded.add(p.id);
      if (center === "agadir") halfGraded.add(saved[0].passages[0].id);
    }
  }

  // ── The reports of the problems a team doesn't defend, shared between the jurors
  const { reports } = await reportPool();
  const handedOut = planReportAssignment(
    reports.map((r) => ({ id: r.id, problemNumber: r.problemNumber, accountId: null, locked: false })),
    (await jurorProblems()).filter((j) => j.problems.length > 0),
    "replace",
  ).changes.flatMap((c) => (c.accountId ? [{ reportId: c.reportId, accountId: c.accountId }] : []));
  await db.reportAssignment.createMany({ data: handedOut });
  note(-5, "Rapports", "reports.auto", `Attribution automatique des rapports (tout refaire) : ${handedOut.length} rapports modifiés`);

  // ── The notes: a team's level, more or less, on every criterion
  const oralEvaluations: Prisma.OralEvaluationCreateManyInput[] = [];
  const oralGrades: Prisma.OralGradeCreateManyInput[] = [];
  const reportEvaluations: Prisma.ReportEvaluationCreateManyInput[] = [];
  const reportGrades: Prisma.ReportGradeCreateManyInput[] = [];
  const rate = (teamId: string, malus: boolean) =>
    malus ? (chance(0.07) ? 0.25 : 0) : Math.round(clamp(level.get(teamId)! + gauss() * 0.16) * 4) / 4;
  const gradeReport = (juryId: string, teamId: string, problemNumber: number) => {
    const id = uuid();
    reportEvaluations.push({ id, juryId, teamId, problemNumber, globalRemark: chance(0.5) ? pick(REPORT_REMARKS) : null });
    for (const c of reportGrid(problemNumber)) reportGrades.push({ reportEvaluationId: id, criterionId: c.id, score: rate(teamId, false) });
  };

  const passages = await db.passage.findMany({ include: { duo: { include: { members: true } } }, orderBy: { label: "asc" } });
  for (const passage of passages) {
    if (ungraded.has(passage.id)) continue;
    const jurors = (passage.duo?.members ?? []).map((m) => m.accountId);
    for (const juryId of halfGraded.has(passage.id) ? jurors.slice(1) : jurors) {
      for (const role of ["defender", "opponent", "reporter"] as const) {
        const teamId = passage[`${role}TeamId`];
        const id = uuid();
        oralEvaluations.push({ id, juryId, passageId: passage.id, teamId, role, globalRemark: chance(0.4) ? pick(ORAL_REMARKS) : null });
        for (const c of oralGrid(role)) oralGrades.push({ oralEvaluationId: id, criterionId: c.id, score: rate(teamId, c.coefficient < 0) });
      }
      gradeReport(juryId, passage.defenderTeamId, passage.problemNumber);
    }
  }
  // A few of the reports handed out still wait for their juror
  const waiting = new Set(passages.filter((p) => ungraded.has(p.id)).flatMap(teamsOf));
  const reportById = new Map(reports.map((r) => [r.id, r]));
  for (const { reportId, accountId } of handedOut) {
    const report = reportById.get(reportId)!;
    if (!waiting.has(report.teamId) && chance(0.95)) gradeReport(accountId, report.teamId, report.problemNumber);
  }
  await db.oralEvaluation.createMany({ data: oralEvaluations });
  await db.oralGrade.createMany({ data: oralGrades });
  await db.reportEvaluation.createMany({ data: reportEvaluations });
  await db.reportGrade.createMany({ data: reportGrades });
  await db.auditLog.createMany({ data: journal });

  const [teamCount, poolCount, jurorTotal, juror] = await Promise.all([
    db.team.count(), db.pool.count(), db.account.count({ where: { role: "jury" } }),
    db.account.findFirst({ where: { role: "jury" }, orderBy: { email: "asc" } }),
  ]);
  console.log(`Demo ready in "${database}": ${teamCount} teams in ${CENTERS.length} centers, ${poolCount} pools, ${passages.length} passages, ${jurorTotal} jurors,`);
  console.log(`${oralEvaluations.length} oral and ${reportEvaluations.length} report evaluations, ${handedOut.length} reports handed out.`);
  console.log(`  Admin (also a juror)   ${ADMIN.email}   ${PASSWORD}`);
  console.log(`  A juror, for example   ${juror?.email}   ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
