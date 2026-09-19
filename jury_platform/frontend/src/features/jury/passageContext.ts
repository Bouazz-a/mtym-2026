import type { Criterion, PassageDetails, PoolDetails, Team } from "@/types";

// What PassagePage loads once and hands to its Oral and Rapport écrit tabs.
export interface PassageData {
  passage: PassageDetails & { pool: PoolDetails };
  teamById: Map<string, Team>;
  criteria: Criterion[];
  refresh: () => Promise<unknown>; // refetch evaluations after a save
}
