import type { FinalWeights } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The final grade's weights (admin): defence, opposition, reporter, report,
// and each problem's weight (%) in the written-report note.
export function getFinalWeights(): Promise<FinalWeights> {
  return apiFetch<FinalWeights>("/final-weights");
}

// The four parts, the problem weights, or both
export function updateFinalWeights(weights: Partial<FinalWeights>): Promise<FinalWeights> {
  return apiFetch<FinalWeights>("/final-weights", { method: "PUT", body: weights });
}
