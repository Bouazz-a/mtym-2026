import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/lib/services/errors";

// Runs a mutation, keeps its error message for display, and refetches the
// queries it touched. Resolves to the mutation's result, or undefined when
// it failed (the error is then in `error`).
export function useAction(invalidate: string[][]) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      setBusy(false);
    }
  };

  return { run, busy, error, clearError: () => setError(null) };
}

// Everything the tournament pages read — any draw/day/team change can move
// data between all three.
export const TOURNAMENT_QUERIES = [["teams"], ["center-days"], ["pools"]];

// What a duo change touches: the duos, the passages carrying them, and the
// accounts' passage counts.
export const DUO_QUERIES = [["duos"], ["pools"], ["accounts"]];

// What a report assignment touches: the board of reports to hand out.
export const REPORT_QUERIES = [["report-assignments"]];
