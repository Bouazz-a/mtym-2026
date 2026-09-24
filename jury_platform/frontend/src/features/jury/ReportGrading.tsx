import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLoading } from "@/features/shared/primitives";
import { ReportPanel, ReportViewer } from "@/features/shared/ReportViewer";
import { useMediaQuery } from "@/features/shared/useMediaQuery";
import { getReportEvaluations, saveReportEvaluation } from "@/lib/repositories/evaluationRepository";
import { reportCriteria } from "@/lib/services/gradingService";
import type { Criterion, ReportEvaluation, Team } from "@/types";
import { GradingCard } from "./GradingCard";
import { TeamHeader } from "./TeamHeader";
import type { PassageData } from "./passageContext";

// Written-report tab of a passage: the defender's report for the problem it
// defends.

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
  if (reportQ.isLoading) return <PageLoading />;

  const defender = teamById.get(passage.defenderTeamId);
  return (
    <ReportWorkspace
      team={defender}
      problemNumber={passage.problemNumber}
      criteria={criteria}
      header={<TeamHeader role="defender" team={defender} />}
      saved={(reportQ.data ?? []).find((e) => e.problemNumber === passage.problemNumber)}
      practice={practice}
      onSaved={refresh}
    />
  );
}

// A report and its grading grid. Wide enough, the PDF sits next to the
// grid and follows the page as it scrolls, so reading and grading happen
// side by side; otherwise a button opens it in a modal. Shared by the
// passage's Rapport écrit tab and "Mes rapports".
export function ReportWorkspace({
  team,
  problemNumber,
  criteria,
  header,
  saved,
  practice = false,
  onSaved,
}: {
  team: Team | undefined;
  problemNumber: number;
  criteria: Criterion[];
  header: ReactNode;
  saved: ReportEvaluation | undefined; // the juror's own evaluation, if any
  practice?: boolean; // the guide's practice passage: a sample PDF, nothing sent
  onSaved: () => Promise<unknown>; // refetch evaluations after a save
}) {
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const report = team?.reports.find((r) => r.problemNumber === problemNumber);
  const title = `${team?.quadrigram ?? ""} · Rapport du problème ${problemNumber}`;
  const beside = sideBySide && report;

  return (
    <div className={beside ? "grid gap-6 items-start" : "max-w-3xl"}
      style={beside ? { gridTemplateColumns: "minmax(0, 34rem) minmax(0, 1fr)" } : undefined}
    >
      <GradingCard
        header={header}
        criteria={reportCriteria(criteria, problemNumber)}
        saved={saved}
        outOf={20}
        disabled={!report}
        disabledHint="Aucun rapport déposé pour ce problème : rien à noter pour l'instant."
        practice={practice}
        onSave={async (input) => {
          if (practice || !team) return;
          await saveReportEvaluation({ teamId: team.id, problemNumber, ...input });
          await onSaved();
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
