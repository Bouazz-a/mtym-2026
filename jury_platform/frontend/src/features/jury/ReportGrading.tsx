import { useQuery } from "@tanstack/react-query";
import { PageLoading } from "@/features/shared/primitives";
import { ReportPanel, ReportViewer } from "@/features/shared/ReportViewer";
import { useMediaQuery } from "@/features/shared/useMediaQuery";
import { getReportEvaluations, saveReportEvaluation } from "@/lib/repositories/evaluationRepository";
import { reportCriteria } from "@/lib/services/gradingService";
import { GradingCard } from "./GradingCard";
import { TeamHeader } from "./TeamHeader";
import type { PassageData } from "./passageContext";

// Written-report tab of a passage: the defender's report for the problem it
// defends. Wide enough, the PDF sits next to the grid and follows the page
// as it scrolls, so reading and grading happen side by side; otherwise a
// button opens it in a modal.

// In practice, the report is a bundled sample PDF.
const SAMPLE_REPORT = "/rapport-exemple.pdf";

// Below this, two columns would leave neither the grid nor the PDF readable
const SIDE_BY_SIDE = "(min-width: 1280px)";

export function ReportGrading({ passage, teamById, criteria, refresh, practice = false }: PassageData) {
  const reportQ = useQuery({
    queryKey: ["report-evaluations", passage.defenderTeamId],
    queryFn: () => getReportEvaluations(passage.defenderTeamId),
    enabled: !practice,
  });
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  if (reportQ.isLoading) return <PageLoading />;

  const defender = teamById.get(passage.defenderTeamId);
  const report = defender?.reports.find((r) => r.problemNumber === passage.problemNumber);
  const title = `${defender?.quadrigram ?? ""} · Rapport du problème ${passage.problemNumber}`;
  const beside = sideBySide && report;

  return (
    <div className={beside ? "grid gap-6 items-start" : "max-w-3xl"}
      style={beside ? { gridTemplateColumns: "minmax(0, 34rem) minmax(0, 1fr)" } : undefined}
    >
      <GradingCard
        header={<TeamHeader role="defender" team={defender} />}
        criteria={reportCriteria(criteria, passage.problemNumber)}
        saved={(reportQ.data ?? []).find((e) => e.problemNumber === passage.problemNumber)}
        disabled={!report}
        disabledHint="Aucun rapport déposé pour ce problème : rien à noter pour l'instant."
        practice={practice}
        onSave={async (input) => {
          if (practice) return;
          await saveReportEvaluation({ teamId: passage.defenderTeamId, problemNumber: passage.problemNumber, ...input });
          await refresh();
        }}
      >
        {report && !beside && (
          <div data-tour="report-viewer" className="inline-block">
            <ReportViewer reportId={report.id} src={practice ? SAMPLE_REPORT : undefined} title={title} />
          </div>
        )}
      </GradingCard>

      {beside && (
        // Sticky under the top bar: the report stays in view while the grid
        // is scrolled through.
        <div data-tour="report-viewer" className="sticky" style={{ top: "5rem" }}>
          <ReportPanel reportId={report.id} src={practice ? SAMPLE_REPORT : undefined} title={title} />
        </div>
      )}
    </div>
  );
}
