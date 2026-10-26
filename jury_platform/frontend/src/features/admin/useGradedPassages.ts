import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdmissibles } from "@/lib/repositories/admissiblesRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { defendedProblems, outsideList } from "@/lib/services/admissibility";
import { DEFAULT_WEIGHTS, passageResults, writtenReportNotes } from "@/lib/services/results";

// What the Notes and Résultats pages share: the pools, the teams, every
// evaluation and the final grade's weights, turned into per-passage results
// and each team's written-report note (all its reports together, those of a
// team left out of the admissibles counted 0 once the list is fixed). The
// queries come along so a page can add its own to its loading state, and the
// evaluations themselves for the pages that go down to one juror's note.
const NONE: never[] = []; // the same empty list at every render, while a query loads

export function useGradedPassages() {
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  const admissiblesQ = useQuery({ queryKey: ["admissibles"], queryFn: getAdmissibles });

  const pools = poolsQ.data ?? NONE;
  const teams = teamsQ.data ?? NONE;
  const weights = weightsQ.data ?? DEFAULT_WEIGHTS;
  const criteria = criteriaQ.data ?? NONE;
  const oral = oralQ.data ?? NONE;
  const report = reportQ.data ?? NONE;
  const admissibles = admissiblesQ.data ?? null;
  // Worked out again only when the data changes: these pages render at each
  // pick of a view or of a row, and going through every evaluation each time
  // made them answer late
  const results = useMemo(() => passageResults(pools, criteria, oral, report), [pools, criteria, oral, report]);
  const written = useMemo(
    () => writtenReportNotes(
      teams, criteria, report, weights.problemWeights, outsideList(admissibles, pools),
      weights.reportDefendedOnly ? defendedProblems(pools) : undefined,
    ),
    [teams, criteria, report, weights.problemWeights, weights.reportDefendedOnly, admissibles, pools],
  );
  return {
    queries: [poolsQ, teamsQ, criteriaQ, oralQ, reportQ, weightsQ, admissiblesQ],
    admissibles,
    pools,
    teams,
    weights,
    criteria,
    oral,
    report,
    results,
    written,
  };
}
