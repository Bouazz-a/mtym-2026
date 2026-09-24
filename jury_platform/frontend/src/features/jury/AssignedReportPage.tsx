import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Badge, PageHeader, PageLoading, PageMotion } from "@/features/shared/primitives";
import { ChevronLeftIcon, SearchIcon } from "@/features/shared/icons";
import { EmptyState } from "@/features/shared/widgets";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getMyReports } from "@/lib/repositories/reportAssignmentRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { centerLabel } from "@/utils/labels";
import { ReportWorkspace } from "./ReportGrading";

// One report of "Mes rapports": the PDF next to its problem's grading grid
// (side by side on a wide screen), like the passage's Rapport écrit tab.

export function AssignedReportPage() {
  const { reportId = "" } = useParams();
  const queryClient = useQueryClient();
  const mineQ = useQuery({ queryKey: ["my-reports"], queryFn: getMyReports });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const evalsQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });

  if ([mineQ, teamsQ, criteriaQ, evalsQ].some((q) => q.isLoading)) return <PageLoading />;

  const assigned = (mineQ.data ?? []).find((m) => m.reportId === reportId);
  if (!assigned) {
    return <EmptyState icon={SearchIcon} title="Rapport introuvable" sub="Ce rapport ne vous est pas confié." action={<BackLink />} />;
  }
  const team = (teamsQ.data ?? []).find((t) => t.id === assigned.teamId);
  const { problemNumber } = assigned;

  return (
    <PageMotion className="space-y-8">
      <BackLink />
      <PageHeader
        eyebrow={team ? `${team.name} · ${centerLabel(team.center)}` : "Rapport"}
        title={`${team?.quadrigram ?? ""} · Rapport du problème ${problemNumber}`}
        sub="Votre note n'est visible que par l'administration."
        right={<Badge tone="dark">Problème {problemNumber}</Badge>}
      />
      <ReportWorkspace
        team={team}
        problemNumber={problemNumber}
        criteria={criteriaQ.data ?? []}
        header={
          <>
            <span className="font-mont text-micro uppercase tracking-widest px-2 py-0.5" style={{ background: "var(--forest)", color: "var(--paper)", fontWeight: 800 }}>
              Rapport écrit · P{problemNumber}
            </span>
            <div className="font-mont mt-2" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.3rem", letterSpacing: "0.06em" }}>
              {team?.quadrigram ?? "—"}
            </div>
            <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>{team?.name ?? ""}</div>
          </>
        }
        saved={(evalsQ.data ?? []).find((e) => e.teamId === assigned.teamId && e.problemNumber === problemNumber)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["report-evaluations"] })}
      />
    </PageMotion>
  );
}

function BackLink() {
  return (
    <Link to="/mes-rapports" className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
      <ChevronLeftIcon size="0.8rem" /> Mes rapports
    </Link>
  );
}
