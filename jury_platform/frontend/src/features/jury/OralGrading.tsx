import { useQuery } from "@tanstack/react-query";
import { PageLoading } from "@/features/shared/primitives";
import { PresentationViewer } from "@/features/shared/ReportViewer";
import { LoadError } from "@/features/shared/widgets";
import { getOralEvaluations, saveOralEvaluation } from "@/lib/repositories/evaluationRepository";
import { oralCriteria } from "@/lib/services/gradingService";
import type { Team } from "@/types";
import { GradingCard } from "./GradingCard";
import { TeamHeader } from "./TeamHeader";
import type { PassageData } from "./passageContext";

// Oral tab of a passage: one grid per graded role (the observer isn't graded).
// The defender's also opens the presentation it shows.

const GRADED_ROLES = ["defender", "opponent", "reporter"] as const;

export function OralGrading({ passage, teamById, criteria, refresh, practice = false }: PassageData) {
  const oralQ = useQuery({
    // The juror's own grades, even for an admin who also judges ("mine")
    queryKey: ["oral-evaluations", "mine", passage.id],
    queryFn: () => getOralEvaluations({ passageId: passage.id, mine: true }),
    enabled: !practice,
  });
  if (oralQ.isLoading) return <PageLoading variant="section" />;
  if (oralQ.isError) return <LoadError onRetry={() => oralQ.refetch()} />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      {GRADED_ROLES.map((role, i) => {
        const team = teamById.get(passage[`${role}TeamId`]);
        return (
          <GradingCard
            key={`${passage.id}:${role}`}
            header={<TeamHeader role={role} team={team} />}
            criteria={oralCriteria(criteria, role)}
            saved={(oralQ.data ?? []).find((e) => e.teamId === team?.id)}
            practice={practice}
            tourAnchors={i === 0}
            draftKey={team && `oral:${passage.id}:${team.id}`}
            onSave={async (input) => {
              if (practice) return;
              await saveOralEvaluation({ passageId: passage.id, teamId: team!.id, ...input });
              await refresh();
            }}
          >
            {role === "defender" && !practice && <DefensePresentation team={team} problemNumber={passage.problemNumber} />}
          </GradingCard>
        );
      })}
    </div>
  );
}

// The presentation the defender filed on the main site for the problem it
// defends here, when it filed one.
function DefensePresentation({ team, problemNumber }: { team: Team | undefined; problemNumber: number }) {
  const presentation = team?.presentations.find((p) => p.problemNumber === problemNumber);
  if (!team || !presentation) {
    return (
      <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
        Aucune présentation déposée pour ce problème.
      </p>
    );
  }
  return (
    <div>
      <PresentationViewer presentationId={presentation.id} title={`${team.quadrigram} · Présentation du problème ${problemNumber}`} />
    </div>
  );
}
