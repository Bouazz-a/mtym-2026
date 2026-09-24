import { useQuery } from "@tanstack/react-query";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { DEFAULT_WEIGHTS, passageResults, writtenReportNotes } from "@/lib/services/results";

// What the Notes and Résultats pages share: the pools, the teams, every
// evaluation and the final grade's weights, turned into per-passage results
// and each team's written-report note (all its reports together).
export function useGradedPassages() {
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });

  const pools = poolsQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const weights = weightsQ.data ?? DEFAULT_WEIGHTS;
  return {
    isLoading: [poolsQ, teamsQ, criteriaQ, oralQ, reportQ, weightsQ].some((q) => q.isLoading),
    pools,
    teams,
    weights,
    results: passageResults(pools, criteriaQ.data ?? [], oralQ.data ?? [], reportQ.data ?? []),
    written: writtenReportNotes(teams, criteriaQ.data ?? [], reportQ.data ?? [], weights.problemWeights),
  };
}
