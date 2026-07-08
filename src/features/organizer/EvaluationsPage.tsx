import { useMemo, useState } from "react";
import {
  PageHeader, BrutalCard, SectionHeading, Badge, PageMotion,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { canViewEvaluations } from "@/lib/permissions";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getJuryMemberById } from "@/lib/repositories/juryRepository";
import { getPassageById } from "@/lib/repositories/poolRepository";
import {
  getReportEvaluationsByTeam,
  getOralEvaluationsByTeam,
  getReportGradesByEvaluation,
  getOralGradesByEvaluation,
} from "@/lib/repositories/evaluationRepository";
import {
  reportCriteria, oralCriteria, weightedNote, fmtNote,
} from "@/lib/services/gradingService";
import type {
  Criterion, OralEvaluation, ReportEvaluation,
} from "@/types";

// EvaluationsPage — admin / scientific-admin review of every jury
// evaluation for a team: report grades, oral (passage) grades, and the
// remarks, each attributed to the juror who wrote it. Participants never
// reach this screen — grades and jury remarks stay internal.

const PROBLEMS = [1, 2, 3, 4] as const;
const ROLE_LABEL: Record<string, string> = {
  defender: "Défenseur",
  opponent: "Opposant",
  reporter: "Rapporteur",
  extra: "Extra",
};

export function EvaluationsPage() {
  const { session } = useSession();
  const teams = useMemo(
    () => getTeams().sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme)),
    [],
  );
  const [teamId, setTeamId] = useState<string>("");

  if (!session || session.role !== "organizer") return null;

  if (!canViewEvaluations(session.organizer)) {
    return (
      <PageMotion>
        <PageHeader
          eyebrow="Évaluations"
          title="Accès restreint"
          sub="Seuls l'administrateur et l'administrateur scientifique peuvent consulter les notes et remarques du jury."
        />
      </PageMotion>
    );
  }

  const team = teams.find(t => t.id === teamId);

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Évaluations"
        title="Notes & remarques du jury"
        sub="Consultation des évaluations par équipe — rapports écrits et passages oraux, avec l'auteur de chaque remarque."
      />

      <div className="max-w-md">
        <div className="font-mont text-tiny uppercase tracking-widest mb-2"
             style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Équipe à consulter
        </div>
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full px-3 py-2 text-sm font-mont focus-ring"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          <option value="">— Sélectionner une équipe —</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.quadrigramme} · {t.name}</option>
          ))}
        </select>
      </div>

      {!team ? (
        <BrutalCard className="p-8" withCorners={false}
                    style={{ borderStyle: "dashed", boxShadow: "none" }}>
          <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
            Sélectionnez une équipe pour afficher ses évaluations.
          </p>
        </BrutalCard>
      ) : (
        <TeamEvaluations key={team.id} teamId={team.id} />
      )}
    </PageMotion>
  );
}

// ─── Per-team evaluations ─────────────────────────────────────────────

function TeamEvaluations({ teamId }: { teamId: string }) {
  const reportEvals = getReportEvaluationsByTeam(teamId);
  const oralEvals = getOralEvaluationsByTeam(teamId);

  const riEvals = reportEvals.filter(e => e.reportType === "intermediaire");
  const rfByProblem = new Map<number, ReportEvaluation[]>();
  for (const e of reportEvals.filter(x => x.reportType === "final")) {
    const list = rfByProblem.get(e.problemNumber) ?? [];
    list.push(e);
    rfByProblem.set(e.problemNumber, list);
  }

  const oralByPassage = new Map<string, OralEvaluation[]>();
  for (const e of oralEvals) {
    const list = oralByPassage.get(e.passageId) ?? [];
    list.push(e);
    oralByPassage.set(e.passageId, list);
  }

  return (
    <div className="space-y-12">
      {/* RI */}
      <section>
        <SectionHeading title="Rapport intermédiaire" />
        {riEvals.length === 0 ? (
          <EmptyNote>Aucune évaluation du rapport intermédiaire.</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riEvals.map(e => (
              <BrutalCard key={e.id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <JurorTag juryMemberId={e.juryMemberId} />
                  <span className="font-mont"
                        style={{ color: "var(--saffron-dark)", fontWeight: 900, fontSize: "1.1rem" }}>
                    {e.overallScore != null ? `${e.overallScore} / 4` : "Non noté"}
                  </span>
                </div>
                <RemarkBlock remark={e.globalRemark} />
              </BrutalCard>
            ))}
          </div>
        )}
      </section>

      {/* RF */}
      <section>
        <SectionHeading title="Rapports finaux" />
        <div className="space-y-6">
          {PROBLEMS.map(n => {
            const evals = rfByProblem.get(n) ?? [];
            return (
              <div key={n}>
                <div className="font-mont text-tiny uppercase tracking-widest mb-2"
                     style={{ color: "var(--forest)", fontWeight: 900 }}>
                  Problème {n}
                </div>
                {evals.length === 0 ? (
                  <EmptyNote>Aucune évaluation pour ce problème.</EmptyNote>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {evals.map(e => (
                      <ReportEvalCard key={e.id} evaluation={e} problemNumber={n} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Oral */}
      <section>
        <SectionHeading title="Passages oraux" />
        {oralByPassage.size === 0 ? (
          <EmptyNote>Aucune évaluation de passage.</EmptyNote>
        ) : (
          <div className="space-y-6">
            {[...oralByPassage.entries()].map(([passageId, evals]) => {
              const passage = getPassageById(passageId);
              return (
                <div key={passageId}>
                  <div className="font-mont text-tiny uppercase tracking-widest mb-2"
                       style={{ color: "var(--forest)", fontWeight: 900 }}>
                    Passage {passage?.label ?? passageId}
                    {passage && ` · Problème ${passage.problemNumber}`}
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {evals.map(e => (
                      <OralEvalCard key={e.id} evaluation={e} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Evaluation cards ─────────────────────────────────────────────────

function ReportEvalCard({
  evaluation, problemNumber,
}: {
  evaluation: ReportEvaluation;
  problemNumber: number;
}) {
  const criteria = reportCriteria(problemNumber);
  const grades = getReportGradesByEvaluation(evaluation.id);
  const note = weightedNote(grades, criteria);
  return (
    <BrutalCard className="overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <JurorTag juryMemberId={evaluation.juryMemberId} />
        <NoteChip total={note.total} maxTotal={note.maxTotal} />
      </div>
      <div className="p-4 space-y-3">
        <Breakdown
          criteria={criteria}
          grades={grades.map(g => ({ criterionId: g.criterionId, score: g.score, remark: g.remark }))}
        />
        <RemarkBlock remark={evaluation.globalRemark} />
      </div>
    </BrutalCard>
  );
}

function OralEvalCard({ evaluation }: { evaluation: OralEvaluation }) {
  const criteria = oralCriteria(evaluation.role);
  const grades = getOralGradesByEvaluation(evaluation.id);
  const note = weightedNote(grades, criteria);
  return (
    <BrutalCard className="overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <JurorTag juryMemberId={evaluation.juryMemberId} />
          <Badge tone="neutral">{ROLE_LABEL[evaluation.role] ?? evaluation.role}</Badge>
        </div>
        <NoteChip total={note.total} maxTotal={note.maxTotal} />
      </div>
      <div className="p-4 space-y-3">
        <Breakdown
          criteria={criteria}
          grades={grades.map(g => ({ criterionId: g.criterionId, score: g.score, remark: g.remark }))}
        />
        <RemarkBlock remark={evaluation.globalRemark} />
      </div>
    </BrutalCard>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────

function Breakdown({
  criteria, grades,
}: {
  criteria: Criterion[];
  grades: { criterionId: string; score: number; remark?: string }[];
}) {
  if (criteria.length === 0) {
    return (
      <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>
        Aucun critère configuré.
      </p>
    );
  }
  const byId = new Map(grades.map(g => [g.criterionId, g]));
  return (
    <table className="w-full border-collapse" style={{ fontFamily: "Montserrat, sans-serif" }}>
      <tbody>
        {criteria.map((c, i) => {
          const g = byId.get(c.id);
          const score = g?.score ?? 0;
          const note = score * c.coefficient;
          return (
            <tr key={c.id}
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}>
              <td className="py-1.5 pr-2 text-xs" style={{ color: "var(--ink)", fontWeight: 700 }}>
                {c.label}
                {g?.remark && (
                  <span className="font-open italic block text-micro mt-0.5"
                        style={{ color: "var(--ink-soft)" }}>
                    « {g.remark} »
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 text-micro text-right tabular-nums"
                  style={{ color: "var(--ink-faint)", fontWeight: 700, whiteSpace: "nowrap" }}>
                {Math.round(score * 100)}% × {c.coefficient}
              </td>
              <td className="py-1.5 pl-2 text-xs text-right tabular-nums"
                  style={{ color: note < 0 ? "var(--clay)" : "var(--saffron-dark)", fontWeight: 900, minWidth: 48 }}>
                {fmtNote(note)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NoteChip({ total, maxTotal }: { total: number; maxTotal: number }) {
  return (
    <span className="font-mont uppercase tracking-widest inline-flex items-baseline gap-1 px-2.5 py-1"
          style={{ background: "var(--forest)", color: "var(--saffron)", fontWeight: 900 }}>
      <span className="tabular-nums" style={{ fontSize: "1rem" }}>{fmtNote(total)}</span>
      <span className="text-micro" style={{ opacity: 0.7 }}>/ {fmtNote(maxTotal)}</span>
    </span>
  );
}

function JurorTag({ juryMemberId }: { juryMemberId: string }) {
  const j = getJuryMemberById(juryMemberId);
  return (
    <span className="font-mont text-xs truncate" style={{ color: "var(--forest)", fontWeight: 900 }}>
      {j ? `${j.firstName} ${j.lastName}` : "Juré inconnu"}
    </span>
  );
}

function RemarkBlock({ remark }: { remark?: string }) {
  if (!remark) {
    return (
      <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>
        Pas de remarque globale.
      </p>
    );
  }
  return (
    <div className="px-3 py-2 font-open text-xs"
         style={{ background: "var(--paper-2)", borderLeft: "3px solid var(--saffron)", color: "var(--ink)" }}>
      {remark}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <BrutalCard className="p-5" withCorners={false}
                style={{ borderStyle: "dashed", boxShadow: "none" }}>
      <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
        {children}
      </p>
    </BrutalCard>
  );
}
