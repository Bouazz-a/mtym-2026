import type { Criterion, OralEvaluation, OralGrade, PassageRole, ReportEvaluation, ReportGrade, ReportType } from "@/types";
import { getAll, setAll } from "../storage";

export function getCriteria(): Criterion[] {
  return getAll("criteria") as Criterion[];
}

export function getCriteriaForReport(problemNumber: number): Criterion[] {
  return getCriteria()
    .filter(c => c.type === "report" && c.problemNumber === problemNumber)
    .sort((a, b) => a.order - b.order);
}

export function getCriteriaForOral(role: PassageRole): Criterion[] {
  return getCriteria()
    .filter(c => c.type === "oral" && c.role === role)
    .sort((a, b) => a.order - b.order);
}

export function upsertCriterion(criterion: Criterion): void {
  const all = getCriteria();
  const idx = all.findIndex(c => c.id === criterion.id);
  if (idx === -1) {
    setAll("criteria", [...all, criterion]);
  } else {
    const updated = [...all];
    updated[idx] = criterion;
    setAll("criteria", updated);
  }
}

export function deleteCriterion(id: string): void {
  setAll("criteria", getCriteria().filter(c => c.id !== id));
}

export function getReportEvaluations(): ReportEvaluation[] {
  return getAll("reportEvaluations") as ReportEvaluation[];
}

export function getReportEvaluation(
  juryMemberId: string,
  teamId: string,
  reportType: ReportType,
  problemNumber: number
): ReportEvaluation | undefined {
  return getReportEvaluations().find(
    e => e.juryMemberId  === juryMemberId &&
         e.teamId        === teamId &&
         e.reportType    === reportType &&
         e.problemNumber === problemNumber
  );
}

export function upsertReportEvaluation(evaluation: ReportEvaluation): void {
  const all = getReportEvaluations();
  const idx = all.findIndex(e => e.id === evaluation.id);
  if (idx === -1) {
    setAll("reportEvaluations", [...all, evaluation]);
  } else {
    const updated = [...all];
    updated[idx] = evaluation;
    setAll("reportEvaluations", updated);
  }
}

export function deleteReportEvaluation(id: string): void {
  setAll("reportEvaluations", getReportEvaluations().filter(e => e.id !== id));
  setAll("reportGrades", getReportGrades().filter(g => g.reportEvaluationId !== id));
}

export function getReportEvaluationsByTeam(teamId: string): ReportEvaluation[] {
  return getReportEvaluations().filter(e => e.teamId === teamId);
}

export function getReportGrades(): ReportGrade[] {
  return getAll("reportGrades") as ReportGrade[];
}

export function getReportGradesByEvaluation(reportEvaluationId: string): ReportGrade[] {
  return getReportGrades().filter(g => g.reportEvaluationId === reportEvaluationId);
}

export function upsertReportGrade(grade: ReportGrade): void {
  const all = getReportGrades();
  const idx = all.findIndex(g => g.id === grade.id);
  if (idx === -1) {
    setAll("reportGrades", [...all, grade]);
  } else {
    const updated = [...all];
    updated[idx] = grade;
    setAll("reportGrades", updated);
  }
}

export function deleteReportGrade(id: string): void {
  setAll("reportGrades", getReportGrades().filter(g => g.id !== id));
}

export function getOralEvaluations(): OralEvaluation[] {
  return getAll("oralEvaluations") as OralEvaluation[];
}

export function getOralEvaluation(
  juryMemberId: string,
  passageId: string,
  teamId: string
): OralEvaluation | undefined {
  return getOralEvaluations().find(
    e => e.juryMemberId === juryMemberId &&
         e.passageId   === passageId &&
         e.teamId      === teamId
  );
}

export function upsertOralEvaluation(evaluation: OralEvaluation): void {
  const all = getOralEvaluations();
  const idx = all.findIndex(e => e.id === evaluation.id);
  if (idx === -1) {
    setAll("oralEvaluations", [...all, evaluation]);
  } else {
    const updated = [...all];
    updated[idx] = evaluation;
    setAll("oralEvaluations", updated);
  }
}

export function deleteOralEvaluation(id: string): void {
  setAll("oralEvaluations", getOralEvaluations().filter(e => e.id !== id));
  setAll("oralGrades", getOralGrades().filter(g => g.oralEvaluationId !== id));
}

export function getOralEvaluationsByTeam(teamId: string): OralEvaluation[] {
  return getOralEvaluations().filter(e => e.teamId === teamId);
}

export function getOralEvaluationsByPassage(passageId: string): OralEvaluation[] {
  return getOralEvaluations().filter(e => e.passageId === passageId);
}

export function getOralGrades(): OralGrade[] {
  return getAll("oralGrades") as OralGrade[];
}

export function getOralGradesByEvaluation(oralEvaluationId: string): OralGrade[] {
  return getOralGrades().filter(g => g.oralEvaluationId === oralEvaluationId);
}

export function upsertOralGrade(grade: OralGrade): void {
  const all = getOralGrades();
  const idx = all.findIndex(g => g.id === grade.id);
  if (idx === -1) {
    setAll("oralGrades", [...all, grade]);
  } else {
    const updated = [...all];
    updated[idx] = grade;
    setAll("oralGrades", updated);
  }
}

export function deleteOralGrade(id: string): void {
  setAll("oralGrades", getOralGrades().filter(g => g.id !== id));
}