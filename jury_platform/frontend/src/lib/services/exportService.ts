import * as XLSX from "xlsx";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { centerLabel } from "@/utils/labels";
import { GRADED_ROLES, passageResults, type NoteSet } from "./results";

// exportService — the grades workbook (admin). Every sheet carries readable
// keys (center, day, pool and passage labels, quadrigrams, juror names) so
// sheets can be joined without ids.
//   Passages       one row per passage: duo, the three oral notes, the report note
//   Équipes        one row per team: its notes as defender/opponent/reporter + report
//   Notes orales   one row per juror × team × criterion
//   Notes rapports one row per juror × report × criterion

const ROLE_LABEL = { defender: "Défenseur", opponent: "Opposant", reporter: "Rapporteur", extra: "Observateur" } as const;

export async function exportGradesXlsx(): Promise<void> {
  const [pools, teams, criteria, oral, report, accounts] = await Promise.all([
    getPools(), getTeams(), getCriteria(), getOralEvaluations(), getReportEvaluations(), getAccounts(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameById = new Map(accounts.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const passageById = new Map(pools.flatMap((pool) => pool.passages.map((p) => [p.id, { pool, passage: p }])));
  const results = passageResults(pools, criteria, oral, report);
  const quad = (id: string | null | undefined) => (id ? teamById.get(id)?.quadrigram ?? "" : "");
  const avg = (set: NoteSet) => (set.average === null ? "" : round2(set.average));
  const where = (pool: (typeof pools)[number]) => ({
    centre: pool.centerDay ? centerLabel(pool.centerDay.center) : "",
    jour: pool.centerDay?.date ?? "",
    poule: pool.label,
  });

  const wb = XLSX.utils.book_new();

  append(wb, "Passages", results.map(({ pool, passage, oral: o, report: r, expected, done }) => ({
    ...where(pool),
    passage: passage.label,
    probleme: passage.problemNumber,
    horaire: passage.timeSlot ?? "",
    salle: passage.room ?? "",
    duo: passage.duo ? passage.duo.members.map((m) => `${m.firstName} ${m.lastName}`).join(" & ") : "",
    defenseur: quad(passage.defenderTeamId),
    note_defense: avg(o.defender),
    opposant: quad(passage.opponentTeamId),
    note_opposition: avg(o.opponent),
    rapporteur: quad(passage.reporterTeamId),
    note_rapporteur: avg(o.reporter),
    observateur: quad(passage.extraTeamId),
    note_rapport_ecrit: avg(r),
    notes_saisies: `${done}/${expected}`,
  })));

  append(wb, "Équipes", teams.filter((t) => t.centerDayId).map((t) => {
    const asRole = (role: (typeof GRADED_ROLES)[number]) =>
      results.find((x) => x.oral[role].teamId === t.id);
    const [defended, opposed, reported] = GRADED_ROLES.map(asRole);
    const pool = defended?.pool ?? results.find((x) => x.passage.extraTeamId === t.id)?.pool;
    return {
      ...(pool ? where(pool) : { centre: centerLabel(t.center), jour: "", poule: "" }),
      equipe: t.quadrigram,
      nom: t.name,
      note_defense: defended ? avg(defended.oral.defender) : "",
      note_opposition: opposed ? avg(opposed.oral.opponent) : "",
      note_rapporteur: reported ? avg(reported.oral.reporter) : "",
      probleme_defendu: defended?.passage.problemNumber ?? "",
      note_rapport_ecrit: defended ? avg(defended.report) : "",
    };
  }));

  append(wb, "Notes orales", oral.flatMap((e) => {
    const ctx = passageById.get(e.passageId);
    return e.grades.map((g) => {
      const c = criterionById.get(g.criterionId);
      return {
        ...(ctx ? where(ctx.pool) : {}),
        passage: ctx?.passage.label ?? "",
        jure: nameById.get(e.juryId) ?? "",
        equipe: quad(e.teamId),
        role: ROLE_LABEL[e.role],
        critere: c?.label ?? "",
        taux: g.score,
        coefficient: c?.coefficient ?? "",
        note: c ? round2(g.score * c.coefficient) : "",
        remarque: g.remark ?? "",
        remarque_globale: e.globalRemark ?? "",
      };
    });
  }));

  append(wb, "Notes rapports", report.flatMap((e) =>
    e.grades.map((g) => {
      const c = criterionById.get(g.criterionId);
      return {
        equipe: quad(e.teamId),
        probleme: e.problemNumber,
        jure: nameById.get(e.juryId) ?? "",
        critere: c?.label ?? "",
        taux: g.score,
        coefficient: c?.coefficient ?? "",
        note: c ? round2(g.score * c.coefficient) : "",
        remarque: g.remark ?? "",
        remarque_globale: e.globalRemark ?? "",
      };
    }),
  ));

  XLSX.writeFile(wb, `mtym-2026-notes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function append(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]): void {
  const ws = rows.length === 0 ? XLSX.utils.aoa_to_sheet([["(aucune donnée)"]]) : XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
