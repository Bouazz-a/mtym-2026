import { useQuery } from "@tanstack/react-query";
import { PageLoading } from "@/features/shared/primitives";
import { LoadError } from "@/features/shared/widgets";
import { getOralEvaluations, saveOralEvaluation } from "@/lib/repositories/evaluationRepository";
import { oralCriteria } from "@/lib/services/gradingService";
import { GradingCard } from "./GradingCard";
import { TeamHeader } from "./TeamHeader";
import type { PassageData } from "./passageContext";

// Oral tab of a passage: one grid per graded role (the observer isn't graded).

const GRADED_ROLES = ["defender", "opponent", "reporter"] as const;

export function OralGrading({ passage, teamById, criteria, refresh, practice = false }: PassageData) {
  const oralQ = useQuery({
    queryKey: ["oral-evaluations", passage.id],
    queryFn: () => getOralEvaluations(passage.id),
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
          />
        );
      })}
    </div>
  );
}
