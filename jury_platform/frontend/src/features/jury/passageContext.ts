import type { Criterion, PassageDetails, PoolDetails, Team } from "@/types";

// What PassagePage loads once and hands to its Oral and Rapport écrit tabs.
export interface PassageData {
  passage: PassageDetails & { pool: PoolDetails };
  teamById: Map<string, Team>;
  criteria: Criterion[];
  refresh: () => Promise<unknown>; // refetch evaluations after a save
  // The practice passage of the guide: fictional teams, real grids, and
  // nothing is loaded from or sent to the API.
  practice?: boolean;
}
