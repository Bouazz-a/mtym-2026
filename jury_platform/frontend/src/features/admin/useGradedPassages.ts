import { useQuery } from "@tanstack/react-query";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { passageResults } from "@/lib/services/results";

// What the Notes and Résultats pages share: the pools, the teams and every
// evaluation, turned into per-passage results.
export function useGradedPassages() {
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });

  const pools = poolsQ.data ?? [];
  return {
    isLoading: [poolsQ, teamsQ, criteriaQ, oralQ, reportQ].some((q) => q.isLoading),
    pools,
    teams: teamsQ.data ?? [],
    results: passageResults(pools, criteriaQ.data ?? [], oralQ.data ?? [], reportQ.data ?? []),
  };
}
