import type { FinalWeights } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The final grade's weights (admin): defence, opposition, reporter, report.
export function getFinalWeights(): Promise<FinalWeights> {
  return apiFetch<FinalWeights>("/final-weights");
}

export function updateFinalWeights(weights: FinalWeights): Promise<FinalWeights> {
  return apiFetch<FinalWeights>("/final-weights", { method: "PUT", body: weights });
}
