import type { AvailableProperty, CandidateProperty, SearchPlan } from "../types.js";

/** Availability stage: filter candidates by availability. (Stub: returns [].) */
export async function availability(
  plan: SearchPlan,
  candidates: CandidateProperty[]
): Promise<AvailableProperty[]> {
  void plan;
  void candidates;
  return [];
}
