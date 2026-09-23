import * as XLSX from "xlsx";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { AuditEntry, Center, CenterDay, Grade, PoolDetails, Team } from "@/types";
import { centerLabel } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";
import { buildPoolSheets } from "./poolsExport";
import { passageResults, percent, teamResults, type NoteSet } from "./results";

// exportService — the grades workbook (admin). Every sheet carries readable
// keys (center, day, pool and passage labels, quadrigrams, juror names) so
// sheets can be joined without ids.
//   Passages       one row per passage: duo, the three oral notes, the report note
//   Équipes        one row per team: its notes as defender/opponent/reporter + report
//                  (raw and in %) and its final grade
//   Notes orales   one row per juror × team × criterion
//   Notes rapports one row per juror × report × criterion
// and the journal of admin changes (exportJournalXlsx).

const ROLE_LABEL = { defender: "Défenseur", opponent: "Opposant", reporter: "Rapporteur", extra: "Observateur" } as const;

export async function exportGradesXlsx(): Promise<void> {
  const [pools, teams, criteria, oral, report, accounts, weights] = await Promise.all([
    getPools(), getTeams(), getCriteria(), getOralEvaluations(), getReportEvaluations(), getAccounts(), getFinalWeights(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameById = new Map(accounts.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const passageById = new Map(pools.flatMap((pool) => pool.passages.map((p) => [p.id, { pool, passage: p }])));
  const results = passageResults(pools, criteria, oral, report);
  const quad = (id: string | null | undefined) => (id ? teamById.get(id)?.quadrigram ?? "" : "");
  const avg = (set: NoteSet | null) => (set?.average == null ? "" : round2(set.average));
  const pct = (set: NoteSet | null) => {
    const p = percent(set);
    return p === null ? "" : round2(p);
  };
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
    horaire: slotTime(pool.centerDay, passage.slot)?.start ?? "",
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

  append(wb, "Équipes", teamResults(results, weights).map(({ teamId, pool, notes, final }) => {
    const defended = results.find((x) => x.passage.defenderTeamId === teamId);
    return {
      ...where(pool),
      equipe: quad(teamId),
      nom: teamById.get(teamId)?.name ?? "",
      note_defense: avg(notes.defender),
      defense_pct: pct(notes.defender),
      note_opposition: avg(notes.opponent),
      opposition_pct: pct(notes.opponent),
      note_rapporteur: avg(notes.reporter),
      rapporteur_pct: pct(notes.reporter),
      probleme_defendu: defended?.passage.problemNumber ?? "",
      note_rapport_ecrit: avg(notes.report),
      rapport_ecrit_pct: pct(notes.report),
      note_finale_pct: final === null ? "" : round2(final),
    };
  }));

  // The columns every grade row ends with, oral or report
  const gradeColumns = (g: Grade, globalRemark: string | null) => {
    const c = criterionById.get(g.criterionId);
    return {
      critere: c?.label ?? "",
      taux: g.score,
      coefficient: c?.coefficient ?? "",
      note: c ? round2(g.score * c.coefficient) : "",
      remarque: g.remark ?? "",
      remarque_globale: globalRemark ?? "",
    };
  };

  append(wb, "Notes orales", oral.flatMap((e) => {
    const ctx = passageById.get(e.passageId);
    return e.grades.map((g) => ({
      ...(ctx ? where(ctx.pool) : {}),
      passage: ctx?.passage.label ?? "",
      jure: nameById.get(e.juryId) ?? "",
      equipe: quad(e.teamId),
      role: ROLE_LABEL[e.role],
      ...gradeColumns(g, e.globalRemark),
    }));
  }));

  append(wb, "Notes rapports", report.flatMap((e) =>
    e.grades.map((g) => ({
      equipe: quad(e.teamId),
      probleme: e.problemNumber,
      jure: nameById.get(e.juryId) ?? "",
      ...gradeColumns(g, e.globalRemark),
    })),
  ));

  XLSX.writeFile(wb, `mtym-2026-notes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// The pools of one center, one sheet per day, laid out like the cards of the
// Tournoi page (buildPoolSheets). SheetJS's community build has no styling,
// so the shape comes from merged titles and column widths.
export function exportPoolsXlsx(center: Center, days: CenterDay[], pools: PoolDetails[], teams: Team[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of buildPoolSheets(center, days, pools, teams)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!merges"] = sheet.merges;
    ws["!cols"] = sheet.cols;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, `mtym-2026-poules-${center}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function append(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]): void {
  const ws = rows.length === 0 ? XLSX.utils.aoa_to_sheet([["(aucune donnée)"]]) : XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The journal of admin changes, as filtered on the Journal page
export function exportJournalXlsx(entries: AuditEntry[]): void {
  const wb = XLSX.utils.book_new();
  append(wb, "Journal", entries.map((e) => {
    const at = new Date(e.at);
    return {
      date: at.toLocaleDateString("fr-FR"),
      heure: at.toLocaleTimeString("fr-FR"),
      auteur: e.actorName,
      email: e.actorEmail,
      categorie: e.category,
      action: e.action,
      detail: e.summary,
      donnees: e.details == null ? "" : JSON.stringify(e.details),
    };
  }));
  XLSX.writeFile(wb, `mtym-2026-journal-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
