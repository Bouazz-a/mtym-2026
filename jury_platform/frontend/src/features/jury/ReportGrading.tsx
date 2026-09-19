import { useQuery } from "@tanstack/react-query";
import { PageLoading } from "@/features/shared/primitives";
import { ReportViewer } from "@/features/shared/ReportViewer";
import { getReportEvaluations, saveReportEvaluation } from "@/lib/repositories/evaluationRepository";
import { reportCriteria } from "@/lib/services/gradingService";
import { GradingCard } from "./GradingCard";
import { TeamHeader } from "./TeamHeader";
import type { PassageData } from "./passageContext";

// Written-report tab of a passage: the defender's report for the problem
// it defends — open the PDF, then grade it.

export function ReportGrading({ passage, teamById, criteria, refresh }: PassageData) {
  const reportQ = useQuery({
    queryKey: ["report-evaluations", passage.defenderTeamId],
    queryFn: () => getReportEvaluations(passage.defenderTeamId),
  });
  if (reportQ.isLoading) return <PageLoading />;

  const defender = teamById.get(passage.defenderTeamId);
  const report = defender?.reports.find((r) => r.problemNumber === passage.problemNumber);

  return (
    <div className="max-w-3xl">
      <GradingCard
        header={<TeamHeader role="defender" team={defender} />}
        criteria={reportCriteria(criteria, passage.problemNumber)}
        saved={(reportQ.data ?? []).find((e) => e.problemNumber === passage.problemNumber)}
        disabled={!report}
        disabledHint="Aucun rapport déposé pour ce problème : rien à noter pour l'instant."
        onSave={async (input) => {
          await saveReportEvaluation({ teamId: passage.defenderTeamId, problemNumber: passage.problemNumber, ...input });
          await refresh();
        }}
      >
        {report && (
          <ReportViewer
            reportId={report.id}
            title={`${defender?.quadrigram ?? ""} · Rapport du problème ${passage.problemNumber}`}
          />
        )}
      </GradingCard>
    </div>
  );
}
