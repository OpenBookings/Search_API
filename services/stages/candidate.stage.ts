import { runCandidateQuery } from "../queries/candidate.query.js";
import type { CandidateProperty, SearchPlan } from "../types.js";

/** Candidate stage: resolve plan → property candidates via DB (capacity, PostGIS lat/lon+radius, hard limit). */
export async function candidate(plan: SearchPlan): Promise<CandidateProperty[]> {
  return runCandidateQuery(plan);
}
